# Spotle.online - AI Agent Rules & Architecture

## PRIME DIRECTIVE: MULTI-AGENT SYNCHRONIZATION
* **CRITICAL:** This file is the single source of truth for all AI coding agents working across the 4-person team.
* **MANDATORY PUSH PROTOCOL:** Before assisting the user in creating a git commit or push, you MUST ask the user if you should update the "Current Status & Latest Actions" section at the bottom of this file. This ensures the next AI agent that pulls the repo knows exactly what was just changed.
* Always read this file at the start of a session before proposing any architectural changes.

## Tech Stack & Architecture
* **Frontend:** React (Vite) + TypeScript + Tailwind CSS.
* **Backend:** Node.js + Express. 
* **Real-Time Sync:** Socket.io for game state.
* **Video Streaming:** PeerJS for WebRTC mesh networking (2-4 players).
* **AI Engine:** @google/genai SDK. Model: **`gemini-3.1-flash-lite`** (see the model note below - `gemini-2.5-flash` is dead).
* **Single Source of Truth:** All shared types live in **`shared/game.ts`** at the repo root, imported by BOTH server and frontend (frontend via the `@shared` Vite alias). `frontend/src/types/game.ts` only re-exports it. Do not duplicate type definitions.

## Critical Gotchas & Anti-Patterns
* **CAMERA FREEZE AVOIDANCE:** Never write code that requests a second `getUserMedia()` stream while a WebRTC video track is active. Mobile browsers will crash. 
* **PHOTO CAPTURE RULE:** To capture a photo for the "FOUND IT" button, draw the active `<video>` DOM element to an offscreen `<canvas>` and export it as a base64 JPEG (`canvas.toDataURL('image/jpeg', 0.8)`).
* **AI REFEREE LOGIC:** The Gemini verification prompt must always output strict JSON containing the `VerificationResponse` interface. 
* **SECURITY:** Never commit the `GEMINI_API_KEY` to the repository. Always use `process.env.GEMINI_API_KEY`.

## Current Status & Latest Actions
*(Agents: Update this section before every push to keep the team synced!)*
* **Last Updated:** 2026-10-17 (quality pass: self-hosted PeerJS broker, mesh watchdog, server-side ICE config, cheatRisks false-positive fix)
* **LIVE AT https://spotle.ink** (Render). Every push to `main` auto-deploys, so never push mid-demo - a redeploy restarts the process and rooms are in memory.
* **Voice chat on iPhone is still unverified.** The earpiece-routing workaround (an iOS-only WebAudio gain stage on top of element playback) can only add volume, never remove it, but nobody has confirmed it on a real handset. Test before judging.
* **ONE SERVER.** The three original backends were merged into `server/`. `backend/` is **deprecated and does not run** - see `backend/DEPRECATED.md`. Do not add features there.

### How to run
```bash
cd server   && npm install && npm start     # unified server :3001 (serves the built UI too)
cd frontend && npm install && npm run dev   # UI dev server  :5173
```
Create Game gives a **6-digit PIN**; others Join with it; host presses START GAME.
Camera needs `localhost` or HTTPS - on phones use the live site, not a LAN IP.

### Architecture
* `shared/game.ts` - **LOCKED type contract**, imported by server and frontend. Change types here and nowhere else.
* `server/src/index.ts` - Express + Socket.io + referee, one process, also serves `frontend/dist`.
* `server/src/rooms.ts` - room registry, 6-digit PINs, host promotion, mode/theme setters.
* `server/src/gameEngine.ts` - round loop, Gemini verification, placement scoring, selfie registration.
* `server/src/data/itemRegistry.ts` - **`MASTER_ITEM_DATABASE`: where round targets come from.**
* `server/gemini-referee/` - Gemini referee (prompts, vision, anti-cheat).
* `frontend/src/hooks/useGameSocket.ts` - all room/round networking.
* `frontend/src/hooks/useWebRTC.ts` - PeerJS mesh, camera flip, frame capture.
* `frontend/src/components/` - `LobbyCamTile` (lobby feeds), `ThemePicker` (theme popup).

### Game modes
* **OBJECTS** - find the named item. Target drawn from `MASTER_ITEM_DATABASE`, filtered by theme.
* **ME** - find a *player*. Everyone submits a selfie during `SELFIE_REGISTRATION` (30s), then hunts the assigned person.

### Themes
`ThemeType` = `UF_SWAMP` | `HACKATHON` | `GENERAL` | `OUTDOORS`, defined with icons in `GAME_THEMES` (`shared/game.ts`). The lobby Themes button opens the picker; the host's choice is host-only and lobby-only, stored on `room.settings.theme`, and only items whose `themes[]` contains it are drawn.

### Item counts - now clear for a 10-round game
`MASTER_ITEM_DATABASE` (`server/src/data/itemRegistry.ts`) combines the core hand-written targets with the converted legacy pool: **151 unique items** - UF_SWAMP 16, HACKATHON 51, GENERAL 133, OUTDOORS 18 (themes overlap). Every theme now has more than 10 items, so a 10-round themed game is repeat-free. UF_SWAMP was at 9 and has been topped up; the server prints the per-theme counts at boot and **warns if any theme drops below 10 again**, so keep an eye on that line.

### Item selection
* No duplicates until a theme is exhausted, then the cycle restarts cleanly rather than letting `usedObjects` grow forever (which used to leave every later pick an unguarded random draw, causing A,B,A,B clustering).
* The item that just played is never handed back immediately, so there are **no back-to-back repeats** even across a cycle boundary.
* Randomness comes from `crypto.randomInt`, not `Math.random` - no modulo bias and no shared pseudo-random sequence between rooms.
* Measured over 500 simulated games per theme: 0 back-to-back repeats, and repeats per game exactly equal the unavoidable floor (`10 - poolSize`). **Any repeat you see now is a missing-items problem, not a picker problem.**
* `unusedCount(theme, used)` is exported for callers that need to know whether a cycle is finished.
* `findItemByRef(ref, theme)` resolves `SPOTLE_FORCE_TARGET` by id, name or alias and the server **warns loudly** when it matches nothing (it used to fall through to a random item in silence, which made `npm run simulate` fail in a way that looked like a referee bug).

### !! cheatRisks is a loaded gun - keep it item-specific !!
`ScavengerItem.cheatRisks` is pasted verbatim into the referee prompt as *"Item-specific screen/photo cheat risks to check: ..."*, so anything generic there primes Gemini to distrust **every** clean photo. The legacy converter briefly attached `"a picture of the object displayed on a phone or computer screen"` and `"a printed picture instead of the real object"` to all 133 bridged items. Measured on the same real hammer photo, 5 trials each: **5/5 accepted with no cheatRisks, 5/5 with a specific one, 0/5 with those generic lines** - and all five were falsely called screen cheats. Bridged items now ship `cheatRisks: []`; the system prompt already does screen-cheat detection on its own. Only add a risk here when it genuinely names how *that* item gets faked. Re-run the A/B with `npx tsx gemini-referee/_abCheatRisks.ts` if you change it.

### Shared legacy object pool
`server/gemini-referee/objectPool.ts` (146 items with Fluent flat-SVG art) still backs `/api/referee/*` and the referee workbench. `server/src/data/itemRegistry.ts` also converts these records into the active round-target format, maps their old `HOME`/`UF` categories to current themes, and combines them with the core targets. `/api/health` still reports the legacy pool count.

### Game rules as implemented
* Max 4 players, 10 rounds, 90s round limit.
* **Placement scoring: 1st = 4 pts, 2nd = 3, 3rd = 2, 4th = 1.** Everyone keeps hunting until all have found it, given up, or the host presses SKIP.
* Rejected attempt = 3s cooldown + a roast. Screen-cheats are caught and rejected.
* **The server is authoritative.** The client only sends a photo; it never decides scores.

### Socket events
Client -> server: `room:create` `room:join` `peer:register` `room:set-mode` `room:set-theme` `game:start` `round:attempt` `round:give-up` `round:skip` `SUBMIT_SELFIE` `game:reset`
Server -> client: `room:update` `round:start` `PROMPT_SELFIE_REGISTRATION` `round:verdict` `round:end` `game:over` `game:error`

### Gemini model - IMPORTANT
`gemini-2.5-flash` is **dead** (404 "no longer available to new users"). Default is **`gemini-3.1-flash-lite`**, falling back to `gemini-3.8-flash` then `gemini-3.5-flash-lite` on 429/404/503. Override with `GEMINI_MODEL`. Key lives in `server/.env` (gitignored) and in Render's Environment tab.

### WebRTC mesh - how players see each other
* **We run our own PeerJS broker** at `/peerjs` (`ExpressPeerServer` in `server/src/index.ts`) instead of relying on PeerJS's shared public cloud, which is rate-limited and was a prime suspect for pairs that silently never connected. The client falls back to the public cloud if ours is unreachable, so the worst case is the old behaviour. `SPOTLE_DISABLE_PEER_SERVER=1` turns ours off entirely - that is the one-env-var rollback on Render.
* **DO NOT mount a second WebSocket server naively.** `ws` with `{ server }` hijacks the HTTP server's `upgrade` event and destroys every upgrade it does not recognise, **including Socket.io's**. Doing that took the whole game down in testing: the host created a room, its socket was torn down immediately, the room was deleted as empty, and every join failed with "No room with that PIN". We pass `createWebSocketServer` a `noServer` instance and route upgrades ourselves. The broker's real WS path is `/peerjs/peerjs` and is logged at boot - do not hardcode it.
* **ICE comes from the server**, `GET /api/rtc-config` (`server/src/rtcConfig.ts`): 3 STUN servers plus a TURN relay. Two ways to configure a real relay, checked in this order:
  * `TURN_CREDENTIAL_URL` - a provider's credentials API (Metered, Twilio). The server fetches the `iceServers` array at runtime, caches it for 10 minutes, and falls back to the public relay if the provider is down. **Only an API key goes in Render; no credential is ever committed.** This is the recommended route.
  * `TURN_URLS` + `TURN_USERNAME` + `TURN_CREDENTIAL` - static credentials, for a self-hosted coturn.
* **MEASURED: the current default relay does not work.** Running `/rtc-check` against PeerJS's public TURN produced **no relay candidate at all** (both `eu-0` and `us-0`), while a real TURN server on the same machine and browser produced one immediately. So today the game has STUN only: pairs that can connect directly do, and any pair needing a relay fails silently. That is exactly the "I can see player 2 but not player 3" report. **Setting a real TURN is the single highest-value thing left before judging.**
* **Always include a TLS/443 url** (`turns:...:443?transport=tcp`). That is the one that survives campus and corporate wifi, which routinely block UDP 3478. The boot log warns if your static config has no TLS url.
* **Connection policy lives in `frontend/src/hooks/rtcConnection.ts`** and is unit tested (`npm run test:rtc`). Glare: both ends independently keep the call dialled by the smaller peer id, so exactly one PeerConnection survives per pair without a round trip. A watchdog re-dials any pair with no media (ICE `failed`, or no stream within 8s), bounded to 8 attempts. The old code dialled once and left a dead entry in the call map that blocked every later attempt, so one unlucky moment at join time meant that pair stayed dark all game.
* **Debugging a dark tile:** `GET /api/rooms/<pin>/debug` answers the server half (did everyone register a PeerJS id?). In the browser console, `__spotleMesh()` answers the client half (per-peer ICE state, whether video/audio are arriving, retry count, and which broker is in use).
* **`/rtc-check`** is a standalone page that asks every configured ICE server for candidates and reports whether a `relay` one came back. **Open it on a phone on the venue wifi before judging** - a blocked relay does not throw, gathering just quietly comes back short, so this is the only way to know. Verdicts: PASS (relay incl. TLS/443), PARTIAL (relay but no TLS/443), FAIL (no relay). All three verdicts were validated against a real local TURN server.

### Camera / UI notes
* Camera starts on the **selfie** lens (`INITIAL_FACING_MODE` in `useWebRTC.ts`); flip button switches to rear.
* The lobby shows live unfiltered camera feeds. It is locked to the viewport on phones so nothing scrolls; from `sm:` up it takes natural height and tiles are full size, which can scroll on short laptop windows - that is deliberate.
* Custom font is preloaded in `index.html` with `font-display: block` to stop the fallback flashing on refresh.

### Testing
* `npm run typecheck` (root) - server types + frontend production build
* `npm run simulate` - full 2-player game over real sockets
* `npm run test:referee:suite` - 10-case AI referee suite
* `SPOTLE_FORCE_TARGET=<item id> npm start` - pin the round target for a reproducible demo
* `npm run test:unit` - fast node:test suites (game modes, item registry, WebRTC dial/glare/retry policy)
* `npm run test:rtc` - just the WebRTC connection-policy tests
* `npm run measure:picker` - 500 simulated games per theme; fails if any theme repeats above the unavoidable floor
* `SPOTLE_FORCE_TARGET=hammer npm start` then `npm run simulate` - the simulation's fixtures are hammer photos, so the target must be pinned or it fails confusingly
* `GET /api/rooms/<pin>/debug` - per-player PeerJS ids, for diagnosing camera mesh problems
* `__spotleMesh()` in the browser console - per-peer ICE state and media, the client half of the same question
* `/rtc-check` - does a TURN relay actually work from this device and network? Run it at the venue.

### App_Testing branch was reverted out of main
The Capacitor mobile wrapper merge (`3a70f6d`) was reverted in `5a51d6e`, so `frontend/android`, `capacitor.config.ts` and the Capacitor deps are **not** on main. Git still considers App_Testing merged, so **merging it again brings in nothing** - whoever lands the mobile app must `git revert 5a51d6e` first, then merge.

### Current Focus
Playable end to end and deployed, with voice chat. The mesh now self-heals and every theme has enough items. Highest value next: **a dedicated TURN server** (set `TURN_CREDENTIAL_URL` - the plumbing, caching and fallback are built and tested; only the provider account and the Render env var are left, and `/rtc-check` measured that we currently have NO working relay), then **real-device checks of iOS voice-chat volume**, then a global leaderboard.

Project Info:
SPOTLE.ONLINE - MASTER PROJECT SPEC & AI CONTEXT SHEET (SWAMPHACKS XII)

1. PROJECT OVERVIEW & ELEVATOR PITCH
--------------------------------------------------------------------------------
Project Name: Spotle.online
Concept: A real-time multiplayer live-camera scavenger hunt web app (2-4 players).
How it Works:
- Players join a shared match lobby via a 4-letter Room Code and see each other's
  live camera feeds in a grid.
- At the start of a round, the Gemini API generates a findable physical object
  based on the room's selected Theme (e.g., General Indoor, UF Campus, Hackathon).
- Players physically race to find the object in the real world while watching
  their opponents panic on live video.
- The first player to aim their camera at the object and press "FOUND IT!"
  triggers an instant frame capture from their video stream.
- Behind the scenes, the Gemini Vision API evaluates the captured photo to verify:
  (a) Is the target object clearly visible?
  (b) Is it a real physical object (anti-cheat: reject photos of another screen)?
- If verified, the round ends, points are awarded, and the next round begins.
  If rejected, the player gets a brief cooldown penalty and the round continues!


2. V1 HACKATHON MVP SCOPE (BUILD THIS FIRST - NO SCOPE CREEP)
--------------------------------------------------------------------------------
MUST HAVE FOR V1 (Hours 1-20):
[x] Landing page: Enter Nickname, Create Room, or Join Room via 4-letter code.
[x] Lobby configuration: Select Theme (General, UF/SwampHacks, Outdoors) & Rounds (3 or 5).
[x] Live 2-4 Player Video Grid (WebRTC) so opponents see each other in real time.
[x] Round Loop: 3-2-1 Countdown -> Target Object Announced -> "FOUND IT!" Button.
[x] Instant Frame Capture: Grab JPEG frame directly from the active HTML5 <video>
    canvas (avoids mobile OS camera-switching bugs).
[x] Gemini AI Referee: Multimodal check returning { verified, confidence, reason,
    isScreenCheat } in strict JSON.
[x] Scoreboard & Winner Screen at the end of the match.

V2 STRETCH GOALS (Hours 20-32, ONLY AFTER V1 WORKS END-TO-END):
[ ] Global Leaderboard (persisted top players by wins/speed).
[ ] Geocache Mode: Player 1 hides an object and snaps a clue photo showing the
    surrounding area; other players race to find that physical spot and match it.
[ ] City / Landmark Theme using browser geolocation.
[ ] Sound effects & TTS AI Referee voice announcer.


3. RECOMMENDED VIBECODING TECH STACK & APIS
--------------------------------------------------------------------------------
Why this stack: Chosen specifically so AI coding assistants generate working code
on the first try with minimal boilerplate.

- Frontend: React (Vite) + TypeScript + Tailwind CSS + Lucide Icons + Canvas-Confetti
- Real-Time Room State & Sync: Socket.io (Node.js/Express backend) OR Firebase
  Realtime Database / Supabase Realtime. (Decision: Use Node.js + Express +
  Socket.io for deterministic server-authoritative round locking, OR Firebase if
  going serverless).
- Live Video (WebRTC): PeerJS (peerjs)
  * Why PeerJS: Zero media-server configuration needed for 2-4 players. Each player
    generates a peerId, shares it in the room state, and streams video directly
    to the other 1-3 players in the room.
- AI Engine: Google Gemini API (@google/genai SDK)
  * Model: gemini-2.5-flash (ultra-fast latency for real-time game loops).
- Database (Leaderboard & Geocache): Firebase Firestore or MongoDB Atlas.
- Deployment & HTTPS: Vercel / Render / Railway (CRITICAL: Mobile browsers block
  camera access over HTTP; deployment or ngrok/Cloudflare tunnel is required for
  HTTPS on mobile devices).


4. CRITICAL CAMERA & HARDWARE RULES (READ BEFORE CODING VIDEO)
--------------------------------------------------------------------------------
1. DO NOT open a second camera stream when pressing "FOUND IT!". Mobile browsers
   (iOS Safari / Android Chrome) will freeze or crash if you request a second
   getUserMedia() stream while WebRTC is active.
2. INSTEAD: Grab the photo frame directly from the player's active <video> DOM
   element using an offscreen <canvas>:
   - Draw video frame to canvas -> canvas.toDataURL('image/jpeg', 0.8) -> send
     base64 string to backend `/api/verify-object`.
3. Provide a single "Flip Camera" button (`facingMode: "user"` vs `"environment"`)
   that replaces the active WebRTC video track using `RTCRtpSender.replaceTrack()`.


5. SHARED DATA CONTRACTS (SINGLE SOURCE OF TRUTH FOR ALL TEAMMATES)
--------------------------------------------------------------------------------
All AI assistants MUST adhere to these exact TypeScript interfaces:

```typescript
export type RoomStatus = 'LOBBY' | 'COUNTDOWN' | 'HUNTING' | 'VERIFYING' | 'ROUND_RESULT' | 'GAME_OVER';

export type ThemeType = 'GENERAL' | 'UF_SWAMP' | 'HACKATHON' | 'OUTDOORS';

export interface Player {
  id: string;          // Socket ID or Auth UID
  peerId: string;      // PeerJS ID for WebRTC video stream
  name: string;
  score: number;
  status: 'READY' | 'SEARCHING' | 'VERIFYING' | 'PENALIZED';
  lastAttemptImage?: string; // Base64 thumbnail of their winning/failed shot
}

export interface RoundData {
  roundNumber: number;
  targetObject: string;      // e.g., "A reusable water bottle"
  hint: string;              // e.g., "Check desks or backpacks nearby!"
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  startTime: number;         // Unix timestamp (ms)
  winnerId?: string;
  refereeCommentary?: string;
}

export interface RoomState {
  roomCode: string;          // 4-letter uppercase code, e.g., "GATR"
  hostId: string;
  status: RoomStatus;
  settings: {
    maxPlayers: number;      // Default 4
    totalRounds: number;     // Default 3
    roundTimeLimitSec: number; // Default 60
    theme: ThemeType;
  };
  players: Record<string, Player>;
  currentRound: RoundData | null;
  usedObjects: string[];     // Prevent duplicate objects in same match
}

export interface VerificationResponse {
  verified: boolean;         // True ONLY if object is present and not a screen cheat
  confidence: number;        // 0 to 100
  isScreenCheat: boolean;    // True if player took a photo of a phone/laptop screen
  commentary: string;        // Short, witty 1-sentence referee verdict for the UI
}



GEMINI API PROMPTS & STRUCTURED OUTPUT SPEC
Use @google/genai with gemini-2.5-flash and responseMimeType: "application/json".
ENDPOINT 1: POST /api/generate-object Input: { theme: ThemeType, usedObjects: string[] } System Prompt: "You are the Game Master for Spotle.online, a fast-paced live scavenger hunt. Generate ONE physical, safe, everyday object that players can realistically find within 30 seconds given the theme.
Theme 'GENERAL': Common household/dorm items (mug, shoe, spoon, keys, backpack).
Theme 'UF_SWAMP': University of Florida / college campus items (Gator logo item, student ID card, blue or orange clothing, notebook, energy drink).
Theme 'HACKATHON': Items at a coding hackathon (laptop charger, sticker, headphones, hoodie, badge lanyard, mouse). Do NOT repeat any item in the usedObjects list. Return strict JSON: { targetObject: string, hint: string, difficulty: 'EASY' | 'MEDIUM' | 'HARD' }"
ENDPOINT 2: POST /api/verify-object Input: { targetObject: string, imageBase64: string, playerName: string } System Prompt: "You are the AI Referee for Spotle.online. A player named {{playerName}} claims they found the target object: '{{targetObject}}'. Analyze the attached photo carefully:
Determine if '{{targetObject}}' is clearly visible in the photo.
ANTI-CHEAT CHECK: Check if the player is cheating by pointing their camera at another digital screen/monitor/phone displaying a picture of the object. If moire patterns, monitor bezels, or browser UI surround the object, set isScreenCheat to true and verified to false.
Write a punchy, entertaining 1-sentence referee call (max 18 words) explaining why it counts or roasting their failed attempt. Return strict JSON matching VerificationResponse."
RACE CONDITION & GAME LOOP LOGIC (HOW "FOUND IT!" WORKS)
What happens if two players press "FOUND IT!" at nearly the same time?
Do NOT pause the whole room's hunting state while one player verifies (otherwise a troll could spam the button to stall the game).
Instead:
Player A presses "FOUND IT!". Player A's tile shows a "GEMINI REFEREE CHECKING..." overlay badge to all players.
Server sends Player A's frame to Gemini (gemini-2.5-flash takes ~1.2 seconds).
FIRST player to receive verified: true while room.status === 'HUNTING' locks the round, sets room.status = 'ROUND_RESULT', awards +100 pts (plus speed bonus), and broadcasts the winning photo + Gemini commentary to everyone.
If Gemini returns verified: false, Player A gets a 3-second button cooldown and Gemini's roast commentary pops up over their video tile!a
SUGGESTED REPOSITORY STRUCTURE (TO PREVENT MERGE CONFLICTS)
spotle-online/ ├── client/ │ ├── src/ │ │ ├── components/ │ │ │ ├── VideoGrid.tsx (Owner: Teammate 2 - WebRTC & Camera) │ │ │ ├── GameHUD.tsx (Owner: Teammate 1 - UI, Timer, Prompts) │ │ │ ├── LobbyView.tsx (Owner: Teammate 1 - Room Setup & Themes) │ │ │ └── RefereeModal.tsx (Owner: Teammate 1 - Round Result Overlay) │ │ ├── hooks/ │ │ │ ├── useWebRTC.ts (Owner: Teammate 2 - PeerJS streams & canvas capture) │ │ │ └── useGameSocket.ts (Owner: Teammate 3 - Socket/Room state sync) │ │ ├── types/ │ │ │ └── game.ts (LOCKED SHARED TYPES FROM SECTION 5) │ │ └── App.tsx ├── server/ │ ├── index.ts (Owner: Teammate 3 - Express + Socket.io rooms) │ ├── geminiReferee.ts (Owner: Teammate 4 - Gemini API prompts & vision) │ └── leaderboard.ts (Owner: Teammate 4 - DB / Geocache mode) └── CLAUDE.md (This Master Spec)
4-PERSON TEAM SPLIT FOR PARALLEL VIBECODING
Role 1 (Frontend & Game Feel): Landing page, Lobby UI, Countdown animations, Round HUD, Scoreboard, Sound effects, UF/SwampHacks theme styling.
Role 2 (WebRTC Video & Camera Capture): PeerJS multi-video grid, camera flip button, HTML5 frame capture utility, low-bandwidth JPEG compression.
Role 3 (Multiplayer Room Engine): Room creation/joining, 4-letter codes, round state machine, timer synchronization, first-verified-wins locking.
Role 4 (Gemini AI Referee & Anti-Cheat): Gemini SDK integration, object prompt generator with theme packs, vision verification endpoint, screen-cheat detection. ================================================================================
