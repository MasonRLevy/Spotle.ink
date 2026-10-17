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
* **AI Engine:** @google/genai SDK (Model: gemini-2.5-flash).
* **Single Source of Truth:** All shared types (RoomState, Player, VerificationResponse) live in `client/src/types/game.ts`. Do not duplicate type definitions.

## Critical Gotchas & Anti-Patterns
* **CAMERA FREEZE AVOIDANCE:** Never write code that requests a second `getUserMedia()` stream while a WebRTC video track is active. Mobile browsers will crash. 
* **PHOTO CAPTURE RULE:** To capture a photo for the "FOUND IT" button, draw the active `<video>` DOM element to an offscreen `<canvas>` and export it as a base64 JPEG (`canvas.toDataURL('image/jpeg', 0.8)`).
* **AI REFEREE LOGIC:** The Gemini verification prompt must always output strict JSON containing the `VerificationResponse` interface. 
* **SECURITY:** Never commit the `GEMINI_API_KEY` to the repository. Always use `process.env.GEMINI_API_KEY`.

## Current Status & Latest Actions
*(Agents: Update this section before every push to keep the team synced!)*
* **Last Updated:** 2026-10-17 (Role 4 — Gemini AI Referee)
* **Latest Action:** Isolated backend module at `server/gemini-referee/` — does **not** touch the Vite frontend, Socket.io loop, or WebRTC. Curated **74-object** `objectPool` (28 `HACKATHON_CAMPUS` + 46 `HOUSEHOLD`) with Microsoft Fluent UI **Flat SVG** art via jsDelivr; all 74 SVG URLs verified to resolve. Goldilocks Gemini Vision referee with strict structured `VerificationResponse` JSON. Regression suite passes **10/10 at ~1.5s avg**.
* **MODEL — IMPORTANT FOR ALL ROLES:** `gemini-2.5-flash` (the original spec model) is **dead** — it still appears in ListModels but returns 404 *"no longer available to new users"* on `generateContent` for recently created keys. The referee now defaults to **`gemini-3.1-flash-lite`**, with an automatic fallback chain `gemini-3.1-flash-lite → gemini-3.8-flash → gemini-3.5-flash-lite` on 429/404/503. Override via `GEMINI_MODEL` (single model or comma-separated chain).
  * **Role 3 / Python backend:** `backend/services/gemini_service.py` still references `gemini-2.5-flash` and will 404 — needs the same model swap.
* **Timeouts:** 9s per model, 20s total, with real request aborts. Without these a stalled chain hung 68s; it now fails in <1s. Tune with `REFEREE_MODEL_TIMEOUT_MS` / `REFEREE_TOTAL_TIMEOUT_MS`.
* **Billing:** enabled on the API key project. Cost is ~$0.0004 per verification (~2¢ per 4-player match), so the free-tier 20-req/day cap is no longer a concern.
* **Object pool note:** 11 objects were removed because their Fluent flat SVG depicted a different item than the target (e.g. Towel showed a bathtub, Remote Control showed a TV). Since the flat SVG sits dead-center as the on-screen prompt, a misleading icon is worse than a smaller pool. Pool is now 74; backfill with icon-accurate items if we want 85+.
* **How to plug into the main Express server later (2 lines):**
  ```ts
  import { refereeRouter } from "./gemini-referee/index.js";
  app.use(refereeRouter);
  ```
* **Exported functions:** `getAllObjects()`, `getObjectById(id)`, `getRandomTargetObject({ category, difficulty, excludeIds })`, `verifyObjectPhoto({ targetObject, imageBase64, playerName })`, `verifyObjectPhotoDetailed(...)` (adds `model` + `skipped`), `checkGeminiApiKey()`, `getModelChain()`
* **Endpoints:** `GET /api/referee/objects` · `GET /api/referee/random-object?category=&difficulty=&exclude=` · `POST /api/referee/verify` · `GET /api/referee/health`
  * `POST /api/referee/verify` returns the `VerificationResponse` fields plus `latencyMs` and `model`.
* **Local testing:** `cd server && npm install`, then `npm run test:referee` → http://localhost:4005 (workbench UI). Also `npm run test:referee:suite` (10-case regression), `npm run test:referee:svgs` (icon URL check), `npm run test:referee:fixtures` (download/generate test images — fixtures are gitignored).
* **Secrets:** Put `GEMINI_API_KEY` in `server/.env` (see `.env.example`). All `.env` files are gitignored and have never been committed.
* **Current Focus:** Role 4 module is feature-complete and tested standalone. Other roles keep frontend / Socket.io / WebRTC work separate until we mount `refereeRouter` on the real game server.

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
