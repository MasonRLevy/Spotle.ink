/**
 * Spotle.ink - THE universal game server.
 *
 * Replaces the three separate prototypes:
 *   - backend/main.py        (Python FastAPI round loop)      -> gameEngine.ts
 *   - backend/server.js      (Node rooms + verify endpoint)   -> rooms.ts + here
 *   - server/gemini-referee  (AI referee + object pool)       -> imported directly
 *
 * One process serves: REST, Socket.io game traffic, and the referee.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { ExpressPeerServer } from 'peer';
import { Server } from 'socket.io';
import { WebSocketServer } from 'ws';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../shared/game.js';
import { isPlayerHuntMode } from '../../shared/game.js';
import {
  createRoom,
  getRoom,
  joinRoom,
  removePlayer,
  serializeRoom,
  setHidingDuration,
  setMode,
  setPeerId,
  setTheme,
} from './rooms.js';
import {
  broadcastRoom,
  clearTimers,
  giveUpPlayer,
  handleAttempt,
  handleTagAttempt,
  maybeStartMeRound,
  nextRound,
  reconcileAfterPlayerLeft,
  startGame,
} from './gameEngine.js';
import { refereeRouter } from '../gemini-referee/refereeRouter.js';
import { checkGeminiApiKey, getModelChain } from '../gemini-referee/geminiReferee.js';
import { getAllObjects } from '../gemini-referee/objectPool.js';
import { describeRtcConfig, getRtcConfig } from './rtcConfig.js';
import { MASTER_ITEM_DATABASE, themeCoverage } from './data/itemRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: path.join(serverRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env') });

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

const httpServer = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 15e6, // room for base64 frames
});

/* --------------------- PeerJS signalling ---------------------- */
/**
 * Our own PeerJS broker at /peerjs.
 *
 * PeerJS clients default to the project's free public broker at
 * 0.peerjs.com, which is shared with every other PeerJS app and is
 * rate-limited. When it drops or throttles a signalling message the two
 * browsers never exchange an offer, so one pair of players silently never
 * connects while the others do. Running the broker ourselves makes
 * signalling exactly as reliable as the site itself.
 *
 * The client still falls back to the public broker if this one cannot be
 * reached, so the worst case is the old behaviour rather than no camera.
 */
/**
 * CAREFUL: two WebSocket servers, one HTTP server.
 *
 * peer builds its socket server as `new WebSocketServer({ path, server })`.
 * Given a `server`, the ws library installs its own 'upgrade' listener on it
 * and DESTROYS every upgrade whose path it does not recognise - which
 * includes Socket.io's /socket.io/ upgrades. Mounting the broker naively
 * therefore kills the game's own connection: measured directly, the host
 * created a room, its socket was torn down immediately, the room was deleted
 * as empty, and every join then failed with "No room with that PIN".
 *
 * peer exposes a createWebSocketServer hook, so we hand it a `noServer`
 * instance and route upgrades ourselves. Socket.io's engine.io is
 * well-behaved about foreign upgrades (it waits to see whether another
 * handler writes to the socket before giving up on it), so once we answer
 * the /peerjs handshake promptly the two coexist.
 */
let peerWss: WebSocketServer | null = null;
let peerWsPath = '/peerjs';

const peerServer = ExpressPeerServer(httpServer, {
  path: '/',
  // Nobody needs to enumerate the peers in the broker; the room roster
  // already tells each client exactly who to call.
  allow_discovery: false,
  createWebSocketServer: (options) => {
    // Keep peer's own computed path so the two never drift apart. Getting
    // this wrong is silent: the upgrade simply never matches, every client
    // falls back to the PeerJS cloud, and the self-hosted broker looks like
    // it is working because nothing errors. Hence the log.
    if (typeof options.path === 'string') peerWsPath = options.path;
    console.log(`[peerjs] broker websocket path: ${peerWsPath}`);
    peerWss = new WebSocketServer({
      ...options,
      server: undefined,
      noServer: true,
    });
    return peerWss;
  },
});
app.use('/peerjs', peerServer);

httpServer.on('upgrade', (req, socket, head) => {
  if (!peerWss) return;
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (pathname !== peerWsPath) return; // Socket.io's listener handles its own.
  peerWss.handleUpgrade(req, socket, head, (ws) => {
    peerWss!.emit('connection', ws, req);
  });
});

peerServer.on('connection', (client) => {
  console.log(`[peerjs] ${client.getId()} connected`);
});
peerServer.on('disconnect', (client) => {
  console.log(`[peerjs] ${client.getId()} disconnected`);
});

/* ---------------------------- REST ---------------------------- */

/**
 * ICE servers + broker path for the browser. Fetched by useWebRTC before it
 * creates its Peer, so TURN credentials stay out of the bundle and can be
 * changed on Render without a frontend rebuild.
 */
app.get('/api/rtc-config', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await getRtcConfig());
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'spotle-universal-server',
    models: getModelChain(),
    objectCount: getAllObjects().length,
  });
});

/**
 * Debug view of a room. Open https://<host>/api/rooms/<pin>/debug on any
 * device to see whether every player actually registered a PeerJS id.
 *
 * Reading this answers the usual "I can't see their camera" question:
 *   peerId "MISSING" -> that device never reached the PeerJS broker, so
 *                       nobody can call it. Signalling problem.
 *   all peerIds present but no video -> the call is being set up but media
 *                       is blocked between the networks. NAT/firewall problem.
 */
app.get('/api/rooms/:pin/debug', (req, res) => {
  const room = getRoom(req.params.pin);
  if (!room) {
    res.status(404).json({ error: 'No room with that PIN.' });
    return;
  }
  res.json({
    roomCode: room.roomCode,
    status: room.status,
    playerCount: Object.keys(room.players).length,
    players: Object.values(room.players).map((p) => ({
      name: p.name,
      isHost: p.isHost,
      status: p.status,
      peerId: p.peerId || 'MISSING - this device never registered with PeerJS',
      score: p.score,
    })),
  });
});

// Role 4's standalone referee endpoints stay mounted for testing.
app.use(refereeRouter);

// Referee workbench (object pool browser + vision tester) at /referee.
app.use('/referee', express.static(path.join(serverRoot, 'gemini-referee', 'public')));

/**
 * TURN check at /rtc-check.
 *
 * Open it on a phone on the venue wifi. It asks every configured ICE server
 * for candidates and says whether a `relay` one came back, which is the only
 * way to know a TURN server actually works from a given network - a blocked
 * relay does not error, gathering just quietly comes back short.
 */
app.use('/rtc-check', express.static(path.join(serverRoot, 'diagnostics')));

/* ---------------------- Built frontend ------------------------ */
// In production this process serves the UI too, so the whole game is ONE
// origin on ONE port: no proxy, no CORS, no second service to deploy, and
// Socket.io connects same-origin. Run `npm run build --prefix frontend`.
const clientDist = path.join(repoRoot, 'frontend', 'dist');
const clientIndex = path.join(clientDist, 'index.html');
const hasClient = fs.existsSync(clientIndex);

if (hasClient) {
  app.use(express.static(clientDist));
}

// SPA fallback: any GET that is not an API/socket/workbench route returns
// index.html so client-side routing and deep links work.
app.use((req, res, next) => {
  if (!hasClient || req.method !== 'GET') return next();
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/socket.io') ||
    req.path.startsWith('/peerjs') ||
    req.path.startsWith('/rtc-check') ||
    req.path.startsWith('/referee')
  ) {
    return next();
  }
  return res.sendFile(clientIndex);
});

/* -------------------------- Socket.io -------------------------- */

/**
 * Shape check for a captured frame.
 *
 * The client only ever sends a data URL produced by canvas.toDataURL, so
 * anything else is either a bug or someone poking at the socket. Rejecting
 * early keeps junk out of the Gemini call (which costs quota) and bounds
 * what a single socket can push into memory. Selfies already did this; round
 * attempts and tags did not.
 */
const MAX_IMAGE_CHARS = 4_000_000;
function isCapturedImage(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.length <= MAX_IMAGE_CHARS
    && /^data:image\/(jpeg|png|webp);base64,/.test(value)
  );
}

io.on('connection', (socket) => {
  let pin: string | null = null;

  socket.on('room:create', ({ name }, ack) => {
    const room = createRoom(socket.id, name);
    pin = room.roomCode;
    socket.join(room.roomCode);
    ack({ ok: true, playerId: socket.id, room: serializeRoom(room) });
    broadcastRoom(io, room);
    console.log(`[room] ${name} created PIN ${room.roomCode}`);
  });

  socket.on('room:join', ({ pin: joinPin, name }, ack) => {
    const result = joinRoom(joinPin, socket.id, name);
    if (!result.ok) {
      ack({ ok: false, error: result.error });
      return;
    }
    pin = result.room.roomCode;
    socket.join(result.room.roomCode);
    ack({ ok: true, playerId: socket.id, room: serializeRoom(result.room) });
    broadcastRoom(io, result.room);
    console.log(`[room] ${name} joined PIN ${result.room.roomCode}`);
  });

  socket.on('peer:register', ({ peerId }) => {
    if (!pin) return;
    const room = setPeerId(pin, socket.id, peerId);
    if (room) broadcastRoom(io, room);
  });

  socket.on('room:set-theme', ({ theme }) => {
    const room = pin ? getRoom(pin) : undefined;
    // Host-only, and only while the game has not started.
    if (!room || room.hostId !== socket.id || room.status !== 'LOBBY') return;
    setTheme(room, theme);
    broadcastRoom(io, room);
    console.log(`[room] ${room.roomCode} theme set to ${theme ?? 'ANY'}`);
  });

  socket.on('room:set-mode', ({ mode }) => {
    const room = pin ? getRoom(pin) : undefined;
    if (!room || room.hostId !== socket.id || room.status !== 'LOBBY') return;
    setMode(room, mode);
    broadcastRoom(io, room);
  });

  socket.on('room:set-hiding-duration', ({ durationSec }) => {
    const room = pin ? getRoom(pin) : undefined;
    if (!room || room.hostId !== socket.id || room.status !== 'LOBBY') return;
    setHidingDuration(room, durationSec);
    broadcastRoom(io, room);
  });

  socket.on('SUBMIT_SELFIE', ({ selfieBase64 }) => {
    const room = pin ? getRoom(pin) : undefined;
    const player = room?.players[socket.id];
    if (!room || !player || room.status !== 'SELFIE_REGISTRATION' || !isPlayerHuntMode(room.settings.mode)) return;
    if (!isCapturedImage(selfieBase64)) {
      socket.emit('game:error', { message: 'That selfie could not be accepted. Capture a new frame.' });
      return;
    }
    player.selfieBase64 = selfieBase64;
    player.selfieReady = true;
    broadcastRoom(io, room);
    maybeStartMeRound(io, room);
  });

  socket.on('SUBMIT_TAG_ATTEMPT', ({ targetPlayerId, capturedFrameBase64 }) => {
    const room = pin ? getRoom(pin) : undefined;
    if (!room || !targetPlayerId || !isCapturedImage(capturedFrameBase64)) return;
    void handleTagAttempt(io, room, socket.id, targetPlayerId, capturedFrameBase64);
  });

  socket.on('game:start', () => {
    const room = pin ? getRoom(pin) : undefined;
    if (!room || room.hostId !== socket.id) return;
    startGame(io, room);
  });

  socket.on('round:attempt', ({ imageDataUrl }) => {
    const room = pin ? getRoom(pin) : undefined;
    if (!room) return;
    if (!isCapturedImage(imageDataUrl)) {
      socket.emit('game:error', { message: 'That photo could not be read. Try FOUND IT again.' });
      return;
    }
    void handleAttempt(io, room, socket.id, imageDataUrl);
  });

  socket.on('round:give-up', () => {
    const room = pin ? getRoom(pin) : undefined;
    if (!room) return;
    giveUpPlayer(io, room, socket.id);
  });

  socket.on('round:skip', () => {
    const room = pin ? getRoom(pin) : undefined;
    if (!room || room.hostId !== socket.id) return;
    if (room.status === 'ROUND_RESULT') nextRound(io, room);
  });

  socket.on('game:reset', () => {
    const room = pin ? getRoom(pin) : undefined;
    if (!room || room.hostId !== socket.id) return;
    startGame(io, room);
  });

  socket.on('disconnect', () => {
    if (!pin) return;
    const room = removePlayer(pin, socket.id);
    if (!room) {
      clearTimers(pin);
      return;
    }
    broadcastRoom(io, room);
    // The leaver may have been the only player still hunting, in which case
    // the round can finish now instead of waiting out the round timer.
    reconcileAfterPlayerLeft(io, room);
  });
});

/* --------------------------- Startup --------------------------- */

httpServer.listen(PORT, async () => {
  console.log('');
  console.log('  Spotle.ink - universal server');
  console.log(`  Game + API      : http://localhost:${PORT}`);
  console.log(`  Referee bench   : http://localhost:${PORT}/referee`);
  console.log(`  PeerJS broker   : http://localhost:${PORT}/peerjs`);
  console.log(`  TURN check      : http://localhost:${PORT}/rtc-check`);
  console.log(`  Objects loaded  : ${getAllObjects().length}`);
  console.log(describeRtcConfig());

  // A theme with fewer items than there are rounds MUST repeat, whatever the
  // picker does. Printing the counts keeps that visible instead of it being
  // rediscovered mid-demo.
  const coverage = themeCoverage();
  const rounds = 10;
  const thin = Object.entries(coverage).filter(([, count]) => count < rounds);
  console.log(
    `  Round items     : ${MASTER_ITEM_DATABASE.length} total (${Object.entries(coverage)
      .map(([theme, count]) => `${theme} ${count}`)
      .join(', ')})`,
  );
  if (thin.length > 0) {
    console.warn(
      `  WARNING: ${thin
        .map(([theme, count]) => `${theme} has ${count} items for ${rounds} rounds`)
        .join('; ')} - those games will repeat items.`,
    );
  }
  console.log(
    hasClient
      ? '  Frontend        : serving frontend/dist (single origin)'
      : '  Frontend        : not built - run `npm run build --prefix frontend`, or use the Vite dev server on :5173',
  );
  console.log('');

  const health = await checkGeminiApiKey();
  console.log(`  ${health.message}`);
  if (!health.ok) {
    console.warn('  Rounds will reject every attempt until the key works.');
  }
  console.log('');
});
