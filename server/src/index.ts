/**
 * Spotle.online - THE universal game server.
 *
 * Replaces the three separate prototypes:
 *   - backend/main.py        (Python FastAPI round loop)      -> gameEngine.ts
 *   - backend/server.js      (Node rooms + verify endpoint)   -> rooms.ts + here
 *   - server/gemini-referee  (AI referee + object pool)       -> imported directly
 *
 * One process serves: REST, Socket.io game traffic, and the referee.
 */
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
  setPeerId,
} from './rooms.js';
import {
  broadcastRoom,
  clearTimers,
  handleAttempt,
  nextRound,
  skipRound,
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

// Role 4's standalone referee endpoints stay mounted for testing.
app.use(refereeRouter);

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

  socket.on('round:skip', () => {
    const room = pin ? getRoom(pin) : undefined;
    if (!room || room.hostId !== socket.id) return;
    // During the scoreboard this advances; mid-hunt it ends the round.
    if (room.status === 'ROUND_RESULT') nextRound(io, room);
    else skipRound(io, room);
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
  console.log('  Spotle.online - universal server');
  console.log(`  API + Socket.io : http://localhost:${PORT}`);
  console.log(`  Referee bench   : http://localhost:${PORT}/  (object pool + vision test)`);
  console.log(`  Objects loaded  : ${getAllObjects().length}`);
  console.log('');

  const health = await checkGeminiApiKey();
  console.log(`  ${health.message}`);
  if (!health.ok) {
    console.warn('  Rounds will reject every attempt until the key works.');
  }
  console.log('');
});
