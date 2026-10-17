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

## Deploying

The server serves the built frontend, so the whole game is **one process on one
port** — one service to deploy, one URL, and Socket.io connects same-origin.

Run the production build locally exactly as the host does:

```bash
npm install --prefix frontend --include=dev
npm run build --prefix frontend
NODE_ENV=production PORT=3001 npm start --prefix server
```

Then everything is on http://localhost:3001 — game, API, sockets, and the
referee workbench at `/referee`.

### Render (free tier)

`render.yaml` in the repo root is a Blueprint. In Render: **New → Blueprint →
pick this repo**, then set `GEMINI_API_KEY` in the service's Environment tab.
Pushes to `main` redeploy automatically.

Two things the free tier does that will bite you if you forget:

- **It sleeps after 15 minutes of inactivity** and takes ~1 minute to wake.
  Load the site a few minutes before any demo, or point an uptime pinger at
  `/api/health`.
- **Rooms live in memory**, so a redeploy or a sleep ends any game in progress.
  Don't push during a demo.

### Pointing spotle.ink at it

1. Deploy first and confirm the `*.onrender.com` URL works.
2. In Render: **Settings → Custom Domains → Add** `spotle.ink`. Render pairs
   the root and `www` automatically and issues TLS free.
3. Render then shows you the exact DNS records to create. In GoDaddy, go to
   **My Products → Domain → DNS → Manage Zones** and add them:
   - an **A** record for the root (`@`) pointing at the IP Render gives you,
   - a **CNAME** for `www` pointing at your `*.onrender.com` hostname.
4. Delete any **AAAA** record on the domain — Render is IPv4 only and a
   stale AAAA will break resolution.
5. Do **not** use GoDaddy's "Domain Forwarding" — that bounces visitors to a
   different URL instead of serving your site at `spotle.ink`.

DNS usually propagates in minutes, but allow a few hours. Set it up early.

> GoDaddy sells the *name*; it does not run the code. Render runs the code.
> Those are two separate things, and both are needed.

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
