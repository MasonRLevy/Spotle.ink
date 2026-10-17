import time
import asyncio
from fastapi import WebSocket

class GameManager:
    def __init__(self):
        # Maps pin -> room state dictionary
        self.rooms = {}

    def init_room(self, pin: str, host_name: str, host_socket: WebSocket):
        self.rooms[pin] = {
            "host": host_socket,
            "host_name": host_name,
            "players": [], # list of {"socket": WebSocket, "name": str}
            "game_state": "LOBBY", # LOBBY, HUNT, WIN, SCOREBOARD
            "round": 1,
            "target_item": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c",
            "round_start_time": None,
            "winner": None
        }

    async def handle_game_message(self, pin: str, sender_name: str, message: dict, broadcast_func):
        if pin not in self.rooms:
            return

        room = self.rooms[pin]
        msg_type = message.get("type")

        # 1. Host triggers the start of a hunt round
        if msg_type == "START_ROUND" and sender_name == room["host_name"]:
            room["game_state"] = "HUNT"
            room["round_start_time"] = time.time()
            room["winner"] = None

            all_participants = [room["host_name"]] + [p["name"] for p in room["players"]]
            players_payload = [
                {"id": p, "name": p, "color": "navy" if i % 2 == 0 else "coral"} 
                for i, p in enumerate(all_participants)
            ]

            await broadcast_func(pin, {
                "type": "START_ROUND_BROADCAST",
                "round": room["round"],
                "target_image": room["target_item"],
                "players": players_payload
            })

        # 2. A player clicks "FOUND IT!"
        elif msg_type == "PLAYER_FOUND_ITEM":
            if room["game_state"] == "HUNT" and room["winner"] is None:
                reaction_time = time.time() - room["round_start_time"]
                room["winner"] = sender_name
                room["game_state"] = "WIN"
                formatted_time = f"{reaction_time:.2f}s"

                # Broadcast winner celebration
                await broadcast_func(pin, {
                    "type": "ROUND_WINNER_BROADCAST",
                    "winner": sender_name,
                    "reaction_time": formatted_time
                })

                # Delay 3 seconds before switching to Scoreboard
                await asyncio.sleep(3.0)
                room["game_state"] = "SCOREBOARD"

                await broadcast_func(pin, {
                    "type": "ROUND_SCOREBOARD_BROADCAST",
                    "round": room["round"],
                    "scores": [{
                        "name": sender_name, 
                        "points": 1, 
                        "speedRank": 1
                    }]
                })
                room["round"] += 1

manager = GameManager()