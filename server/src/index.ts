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
import { Server } from 'socket.io';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../shared/game.js';
import {
  createRoom,
  getRoom,
  joinRoom,
  removePlayer,
  serializeRoom,
  setMode,
  setPeerId,
  setTheme,
} from './rooms.js';
import {
  broadcastRoom,
  clearTimers,
  giveUpPlayer,
  handleAttempt,
  maybeStartMeRound,
  nextRound,
  startGame,
} from './gameEngine.js';
import { refereeRouter } from '../gemini-referee/refereeRouter.js';
import { checkGeminiApiKey, getModelChain } from '../gemini-referee/geminiReferee.js';
import { getAllObjects } from '../gemini-referee/objectPool.js';

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

/* ---------------------------- REST ---------------------------- */

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
    req.path.startsWith('/referee')
  ) {
    return next();
  }
  return res.sendFile(clientIndex);
});

/* -------------------------- Socket.io -------------------------- */

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

  socket.on('SUBMIT_SELFIE', ({ selfieBase64 }) => {
    const room = pin ? getRoom(pin) : undefined;
    const player = room?.players[socket.id];
    if (!room || !player || room.status !== 'SELFIE_REGISTRATION' || room.settings.mode !== 'ME') return;
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(selfieBase64) || selfieBase64.length > 4_000_000) {
      socket.emit('game:error', { message: 'That selfie could not be accepted. Capture a new frame.' });
      return;
    }
    player.selfieBase64 = selfieBase64;
    player.selfieReady = true;
    broadcastRoom(io, room);
    maybeStartMeRound(io, room);
  });

  socket.on('game:start', () => {
    const room = pin ? getRoom(pin) : undefined;
    if (!room || room.hostId !== socket.id) return;
    startGame(io, room);
  });

  socket.on('round:attempt', ({ imageDataUrl }) => {
    const room = pin ? getRoom(pin) : undefined;
    if (!room || !imageDataUrl) return;
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
    if (room) broadcastRoom(io, room);
    else clearTimers(pin);
  });
});

/* --------------------------- Startup --------------------------- */

httpServer.listen(PORT, async () => {
  console.log('');
  console.log('  Spotle.ink - universal server');
  console.log(`  Game + API      : http://localhost:${PORT}`);
  console.log(`  Referee bench   : http://localhost:${PORT}/referee`);
  console.log(`  Objects loaded  : ${getAllObjects().length}`);
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
