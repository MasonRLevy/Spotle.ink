import random
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from game_manager import manager

# 1. INITIALIZE APP FIRST
app = FastAPI()

# 2. ENABLE CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class HostCreateRequest(BaseModel):
    host_name: str

def generate_unique_pin() -> str:
    """Generates a unique 6-digit room PIN."""
    while True:
        pin = f"{random.randint(0, 999999):06d}"
        if pin not in manager.rooms:
            return pin

# Serve index.html at root
@app.get("/", response_class=FileResponse)
async def serve_index():
    return "index.html"

@app.post("/api/create-room")
async def create_room(data: HostCreateRequest):
    pin = generate_unique_pin()
    manager.init_room(pin, data.host_name, None)
    print(f"[DEBUG] Room created with PIN: {pin} for host: {data.host_name}")
    return {"pin": pin}

@app.websocket("/ws/host/{pin}/{host_name}")
async def host_websocket_endpoint(websocket: WebSocket, pin: str, host_name: str):
    await websocket.accept()
    print(f"[DEBUG] Host WebSocket connected for PIN: {pin}, Name: {host_name}")
    
    if pin not in manager.rooms:
        manager.init_room(pin, host_name, websocket)
    else:
        manager.rooms[pin]["host"] = websocket
        manager.rooms[pin]["host_name"] = host_name
    
    try:
        await websocket.send_json({"type": "ROOM_CREATED", "pin": pin})
        await send_player_list_update(pin)

        while True:
            data = await websocket.receive_json()
            print(f"[DEBUG] Host sent message: {data}")
            
            # Pass game-related messages to game manager
            await manager.handle_game_message(pin, host_name, data, broadcast_to_room)
            
            # Also broadcast standard messages if needed
            await broadcast_to_room(pin, data, exclude_socket=websocket)
            
    except WebSocketDisconnect:
        print(f"[DEBUG] Host disconnected from PIN: {pin}")
        if pin in manager.rooms:
            await broadcast_to_room(pin, {"type": "ROOM_CLOSED", "message": "Host closed the room."})
            del manager.rooms[pin]
    except Exception as e:
        print(f"[ERROR] Exception in host_websocket_endpoint: {e}")

@app.websocket("/ws/join/{pin}/{player_name}")
async def join_websocket_endpoint(websocket: WebSocket, pin: str, player_name: str):
    if pin not in manager.rooms or manager.rooms[pin].get("host") is None:
        await websocket.accept()
        await websocket.send_json({"type": "ERROR", "message": "Invalid PIN or room doesn't exist."})
        await websocket.close()
        return

    await websocket.accept()
    print(f"[DEBUG] Player {player_name} joined PIN: {pin}")
    
    player_entry = {"socket": websocket, "name": player_name}
    manager.rooms[pin]["players"].append(player_entry)
    
    await websocket.send_json({"type": "JOIN_SUCCESS", "pin": pin})
    await send_player_list_update(pin)

    try:
        while True:
            data = await websocket.receive_json()
            print(f"[DEBUG] Player {player_name} sent: {data}")
            
            # Pass game actions to game manager
            await manager.handle_game_message(pin, player_name, data, broadcast_to_room)
            
            await broadcast_to_room(pin, data, exclude_socket=websocket)
            
    except WebSocketDisconnect:
        print(f"[DEBUG] Player {player_name} disconnected from PIN: {pin}")
        if pin in manager.rooms:
            manager.rooms[pin]["players"] = [p for p in manager.rooms[pin]["players"] if p["socket"] != websocket]
            await send_player_list_update(pin)
    except Exception as e:
        print(f"[ERROR] Exception in join_websocket_endpoint: {e}")

async def broadcast_to_room(pin: str, message: dict, exclude_socket: WebSocket = None):
    if pin in manager.rooms:
        room = manager.rooms[pin]
        all_sockets = []
        if room.get("host"):
            all_sockets.append(room["host"])
        if room.get("players"):
            all_sockets += [p["socket"] for p in room["players"]]
            
        for sock in all_sockets:
            if sock != exclude_socket and sock is not None:
                try:
                    await sock.send_json(message)
                except Exception as e:
                    print(f"[ERROR] Failed to send to socket: {e}")

async def send_player_list_update(pin: str):
    if pin in manager.rooms:
        room = manager.rooms[pin]
        state = {
            "host_name": room.get("host_name", "Host"),
            "players": [p["name"] for p in room.get("players", [])]
        }
        await broadcast_to_room(pin, {"type": "PLAYER_LIST_UPDATE", "state": state})