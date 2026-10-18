# Spotle.ink

A real-time multiplayer live-camera scavenger hunt. 2–4 players share a room,
see each other's live camera feeds, and race to physically find the object the
AI referee calls out. Press **FOUND IT!**, and Gemini judges the photo —
including catching players who point their camera at a screen.

Live at **https://spotle.ink**. Built for SwampHacks XII.

## Run it

Two terminals, from the repo root:

```bash
npm run server   # unified server on :3001 (also serves the built UI)
```

```bash
npm run web      # Vite dev server on :5173
```

Then open **http://localhost:5173**.

One player clicks **Create Game** and reads out the 6-digit PIN; everyone else
clicks **Join Game** and enters it. The host presses **START GAME**.

> **Camera:** browsers only allow camera access over `localhost` or HTTPS.
> On phones, use the live site or a tunnel (`ngrok http 5173`) — plain
> `http://<your-ip>:5173` will not get a camera.

Put your Gemini key in `server/.env` (copy `server/.env.example`):

```
GEMINI_API_KEY=your_key_here
```

## Game modes

| Mode | In the lobby | How it works |
| --- | --- | --- |
| **Objects** | CLASSIC | Find the named item. Target drawn from `MASTER_ITEM_DATABASE`, filtered by the room's theme. |
| **Player hunt** | ASSASSIN | Everyone submits a selfie during a 30s registration phase, then hunts an assigned player. |
| **Hide and seek** | HIDE N SEEK | One random seeker, everyone else hides. Hiders' cameras switch off for a 30–60s hiding phase, then the seeker hunts and tags them. |

Defaults: max 4 players, 10 rounds, 90s per round, placement scoring
(1st = 4 pts, 2nd = 3, 3rd = 2, 4th = 1).

Themes are `UF_SWAMP`, `HACKATHON`, `GENERAL`, `OUTDOORS`. Only the host can
pick one, only in the lobby.

## Layout

```
shared/game.ts            Locked type contract — imported by BOTH sides
server/
  src/index.ts            The one server: REST + Socket.io + PeerJS broker (:3001)
  src/rooms.ts            Room registry, 6-digit PINs, host promotion
  src/gameEngine.ts       Round loop, verification, placement scoring
  src/data/itemRegistry.ts  MASTER_ITEM_DATABASE — where round targets come from
  src/rtcConfig.ts        ICE servers + TURN, served to the browser
  diagnostics/            /rtc-check — does a TURN relay work from this network?
  gemini-referee/         AI referee + the legacy 146-object pool
frontend/
  src/App.tsx             All the screens
  src/hooks/useGameSocket.ts  Server connection
  src/hooks/useWebRTC.ts      PeerJS mesh + camera + frame capture
  src/hooks/rtcConnection.ts  Dial / glare / retry policy (unit tested)
  src/utils/serverUrl.ts      Where the server is, for sockets and API
backend/                  DEPRECATED — see backend/DEPRECATED.md
```

## How a round works

1. The server picks a target from `MASTER_ITEM_DATABASE` (**151 items**, every
   theme above 10 so a 10-round themed game never repeats) and broadcasts it.
2. Players hunt. Pressing **FOUND IT!** grabs a JPEG from the live `<video>`
   element — never a second `getUserMedia()` call, which freezes mobile WebRTC.
3. The server sends the frame to Gemini, which judges it:
   - a legitimate variant counts (a sledgehammer counts as a hammer),
   - a different category does not (a wrench is not a hammer),
   - photographing a screen is caught and rejected as cheating.
4. Accepted finds lock in placement. A rejected attempt costs a 3-second
   cooldown and earns a roast.
5. When everyone has found it, given up, or the round times out, the scoreboard
   appears and the host advances.

The client is never trusted — it only sends a photo. The server decides.

## Video and voice (WebRTC)

Players connect peer-to-peer in a mesh. Two pieces of infrastructure matter:

- **Signalling** runs on our own PeerJS broker at `/peerjs`, in the same
  process as the game, rather than PeerJS's shared public cloud.
  `SPOTLE_DISABLE_PEER_SERVER=1` switches back to the cloud if ours ever
  misbehaves. Every client in a room must use the *same* broker — they cannot
  discover each other otherwise — so this is a server-wide choice, never
  per-client.
- **ICE/TURN** comes from `GET /api/rtc-config`. STUN alone is enough when at
  least one side is directly reachable. It is **not** enough on networks that
  block device-to-device traffic (eduroam and most campus wifi do), where a
  TURN relay is mandatory.

> **Set a real TURN server before demoing.** Without one, players on a
> client-isolating network see each other's tiles stay black while the rest of
> the game works perfectly. Set `TURN_CREDENTIAL_URL` to a provider's
> credentials API (Metered, Twilio) — the server fetches, caches and falls back
> on its own, and only the API key goes in Render. Static credentials work too
> via `TURN_URLS` / `TURN_USERNAME` / `TURN_CREDENTIAL`. Always include a
> `turns:` TLS/443 URL; campus wifi commonly blocks UDP 3478.

**Diagnosing a black tile:**

- `/rtc-check` — open it on a phone *on the venue wifi*. It asks every
  configured ICE server for candidates and reports PASS / PARTIAL / FAIL. A
  blocked relay does not throw an error, so this is the only reliable check.
- `GET /api/rooms/<pin>/debug` — did every player register a PeerJS id?
  (signalling half)
- `__spotleMesh()` in the browser console — per-peer ICE state, whether media
  is arriving, retry count, and which broker is in use. (media half)

If a tab is left open across a deploy it may be running an older bundle on a
different broker, which makes it invisible to everyone. The app detects this
and shows a reload banner.

## Deploying

The server serves the built frontend, so the whole game is **one process on one
port** — one service to deploy, one URL, and Socket.io connects same-origin.

Run the production build locally exactly as the host does:

```bash
npm install --prefix frontend --include=dev
npm run build --prefix frontend
NODE_ENV=production PORT=3001 npm start --prefix server
```

Then everything is on http://localhost:3001 — game, API, sockets, the referee
workbench at `/referee`, and the TURN check at `/rtc-check`.

### Render (free tier)

`render.yaml` in the repo root is a Blueprint. In Render: **New → Blueprint →
pick this repo**, then set these in the service's Environment tab:

| Variable | Required | What it does |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes | The AI referee. Rounds reject everything without it. |
| `TURN_CREDENTIAL_URL` | strongly recommended | TURN relay, so players on restrictive wifi can see each other. |
| `SPOTLE_FORCE_TARGET` | no | Pins the round target for a reproducible demo. |
| `SPOTLE_DISABLE_PEER_SERVER` | no | `1` reverts to the public PeerJS broker. |

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

From the repo root:

```bash
npm run typecheck          # server types + frontend production build — run before every push
npm run test:unit          # game modes, item registry, WebRTC dial/glare/retry policy
npm run test:rtc           # just the WebRTC connection-policy tests
npm run measure:picker     # 500 games per theme; fails if repeats exceed the unavoidable floor
npm run test:referee:suite # 10-case AI referee regression suite (costs Gemini quota)
```

`npm run typecheck` is the gate that protects `main`: it is what catches a
broken build before it auto-deploys to the live site.

The full-game simulation needs fixtures and a pinned target, because its
fixtures are hammer photos:

```bash
cd server
npm run test:referee:fixtures
SPOTLE_FORCE_TARGET=hammer npm start   # terminal 1
npm run simulate                       # terminal 2
```

`SPOTLE_FORCE_TARGET` matches an item id, name or alias, and the server warns
loudly if it matches nothing. It also makes live demos reproducible — pin the
target to something you're holding.
