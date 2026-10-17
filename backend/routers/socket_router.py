from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json

router = APIRouter()

# In-memory store for active rooms and their connected websocket clients
# Structure: { room_code: { player_id: WebSocket } }
ROOM_CONNECTIONS: Dict[str, Dict[str, WebSocket]] = {}

@router.websocket("/ws/room/{room_code}/{player_id}")
async def room_websocket_endpoint(websocket: WebSocket, room_code: str, player_id: str):
    room_code = room_code.upper()
    await websocket.accept()

    # 1. Initialize room if it doesn't exist yet
    if room_code not in ROOM_CONNECTIONS:
        ROOM_CONNECTIONS[room_code] = {}

    # Add player to the room's active connections
    ROOM_CONNECTIONS[room_code][player_id] = websocket

    # Broadcast to the room that a new player joined
    await broadcast_to_room(room_code, {
        "event": "PLAYER_JOINED",
        "playerId": player_id,
        "activePlayers": list(ROOM_CONNECTIONS[room_code].keys())
    })

    try:
        while True:
            # 2. Listen for incoming messages from this client (e.g., START_GAME, FOUND_IT)
            data = await websocket.receive_text()
            message = json.loads(data)
            event_type = message.get("event")

            # Handle different game actions sent by the client
            if event_type == "START_HUNT":
                # Broadcast start round event to all players in the room (PIN sync)
                await broadcast_to_room(room_code, {
                    "event": "ROUND_STARTED",
                    "targetObject": message.get("targetObject"),
                    "hint": message.get("hint")
                })
            
            elif event_type == "PLAYER_FOUND_OBJECT":
                # Handle race condition / verification trigger
                await broadcast_to_room(room_code, {
                    "event": "VERIFYING_PLAYER",
                    "playerId": player_id,
                    "message": f"{player_id} pressed Found It! Verifying with Gemini..."
                })

    except WebSocketDisconnect:
        # 3. Clean up when a player disconnects or closes their browser
        if room_code in ROOM_CONNECTIONS:
            if player_id in ROOM_CONNECTIONS[room_code]:
                del ROOM_CONNECTIONS[room_code][player_id]
            
            # If room is completely empty, clean it up from memory
            if not ROOM_CONNECTIONS[room_code]:
                del ROOM_CONNECTIONS[room_code]
            else:
                # Notify remaining players that someone left
                await broadcast_to_room(room_code, {
                    "event": "PLAYER_LEFT",
                    "playerId": player_id,
                    "activePlayers": list(ROOM_CONNECTIONS[room_code].keys())
                })


async def broadcast_to_room(room_code: str, message: dict):
    """Helper function to send a JSON message to all connected clients in a specific room PIN."""
    if room_code in ROOM_CONNECTIONS:
        payload = json.dumps(message)
        for client_socket in ROOM_CONNECTIONS[room_code].values():
            await client_socket.send_text(payload)