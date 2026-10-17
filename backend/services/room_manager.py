# services/room_manager.py

import random
from typing import Dict, List, Optional
from fastapi import WebSocket

class RoomManager:
    def __init__(self):
        # Maps pin (str) -> Room Data dictionary
        self.rooms: Dict[str, dict] = {}

    def generate_unique_pin(self) -> str:
        """Generates a unique 6-digit room PIN."""
        while True:
            pin = f"{random.randint(0, 999999):06d}"
            if pin not in self.rooms:
                return pin

    def create_room(self, host_websocket: WebSocket, host_name: str) -> str:
        """Creates a new room with a unique 6-digit PIN and assigns the host."""
        pin = self.generate_unique_pin()
        self.rooms[pin] = {
            "host": host_websocket,
            "host_name": host_name,
            "players": []
        }
        return pin

    async def add_player(self, pin: str, player_websocket: WebSocket, player_name: str) -> bool:
        """Adds a player to an existing room if the PIN is valid."""
        if pin not in self.rooms:
            return False
        
        self.rooms[pin]["players"].append({
            "socket": player_websocket,
            "name": player_name
        })
        return True

    def remove_connection(self, websocket: WebSocket):
        """Cleans up a connection whether they were a host or a player."""
        for pin, room in list(self.rooms.items()):
            if room["host"] == websocket:
                del self.rooms[pin]
                return pin, "host_disconnected"
            
            for player in room["players"]:
                if player["socket"] == websocket:
                    room["players"].remove(player)
                    return pin, player["name"]
        
        return None, None

    async def broadcast_to_room(self, pin: str, message: dict, exclude_socket: WebSocket = None):
        """Sends a JSON message to everyone in the room (Host + Players)."""
        if pin in self.rooms:
            room = self.rooms[pin]
            all_connections = []
            if room.get("host"):
                all_connections.append(room["host"])
            if room.get("players"):
                all_connections += [p["socket"] for p in room["players"]]
            
            for sock in all_connections:
                if sock and sock != exclude_socket:
                    try:
                        await sock.send_json(message)
                    except Exception:
                        pass

    def get_room_state(self, pin: str) -> Optional[dict]:
        """Returns metadata about the room (player list, host name)."""
        if pin not in self.rooms:
            return None
        room = self.rooms[pin]
        return {
            "host_name": room["host_name"],
            "players": [p["name"] for p in room["players"]]
        }

# ---> ADD THIS LINE AT THE BOTTOM OF THE FILE <---
room_manager = RoomManager()