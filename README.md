# Spotle.online

A real-time multiplayer live-camera scavenger hunt. 2–4 players share a room,
see each other's live camera feeds, and race to physically find the object the
AI referee calls out. Press **FOUND IT!**, and Gemini judges the photo —
including catching players who point their camera at a screen.

Built for SwampHacks XII.

## Run it

Two terminals, from the repo root:

```bash
cd server && npm install && npm start
```

```bash
cd frontend && npm install && npm run dev
```

Then open **http://localhost:5173**.

One player clicks **Create Game** and reads out the 6-digit PIN; everyone else
clicks **Join Game** and enters it. The host presses **START GAME**.

> **Camera:** browsers only allow camera access over `localhost` or HTTPS.
> On phones, use a tunnel (`ngrok http 5173`) or deploy — plain
> `http://<your-ip>:5173` will not get a camera.

Put your Gemini key in `server/.env` (copy `server/.env.example`):

```
GEMINI_API_KEY=your_key_here
```

## Layout

```
shared/game.ts        Locked type contract — imported by BOTH sides
server/
  src/index.ts        The one server: REST + Socket.io + referee (:3001)
  src/rooms.ts        Room registry, 6-digit PINs
  src/gameEngine.ts   Round loop, verification, placement scoring
  gemini-referee/     AI referee + 74-object curated pool
frontend/
  src/App.tsx         All four screens
  src/hooks/useGameSocket.ts  Server connection
  src/hooks/useWebRTC.ts      PeerJS mesh + camera + frame capture
backend/              DEPRECATED — see backend/DEPRECATED.md
```

## How a round works

1. The server picks a target from the 74-object pool and broadcasts it with its
   Fluent flat-SVG icon.
2. Players hunt. Pressing **FOUND IT!** grabs a JPEG from the live `<video>`
   element — never a second `getUserMedia()` call, which freezes mobile WebRTC.
3. The server sends the frame to Gemini, which judges it:
   - a legitimate variant counts (a sledgehammer counts as a hammer),
   - a different category does not (a wrench is not a hammer),
   - photographing a screen is caught and rejected as cheating.
4. Accepted finds lock in placement: **1st = 4 pts, 2nd = 3, 3rd = 2, 4th = 1**.
   A rejected attempt costs a 3-second cooldown and earns a roast.
5. When everyone has found it (or the host skips), the scoreboard appears.

The client is never trusted — it only sends a photo. The server decides.

## Testing

```bash
cd server
npm run typecheck             # server + shared types
npm run test:referee:suite    # 10-case AI referee regression suite
npm run test:referee          # standalone referee workbench on :4005
npm run simulate              # full 2-player game over real sockets
```

The simulation needs fixtures and a pinned target:

```bash
npm run test:referee:fixtures
SPOTLE_FORCE_TARGET=hammer npm start   # terminal 1
npm run simulate                        # terminal 2
```

`SPOTLE_FORCE_TARGET` also makes live demos reproducible — pin the target to
something you're holding.
