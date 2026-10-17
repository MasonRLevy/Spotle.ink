import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { createRoom, getRoom, joinRoom, removePlayer } from './src/roomManager.js';
import { verifyObject } from './src/geminiReferee.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'Spotle backend is live.' });
});

app.post('/api/rooms', (req, res) => {
  try {
    const { roomCode, hostId, hostName } = req.body || {};
    if (!hostId) {
      return res.status(400).json({ error: 'hostId is required.' });
    }

    const room = createRoom({ roomCode, hostId, hostName });
    return res.status(201).json({ room });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not create room.' });
  }
});

app.get('/api/rooms/:code', (req, res) => {
  const room = getRoom(req.params.code.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }
  return res.json({ room });
});

app.post('/api/rooms/:code/join', (req, res) => {
  try {
    const roomCode = req.params.code.toUpperCase();
    const { playerId, name } = req.body || {};
    const room = joinRoom({ roomCode, playerId, name });
    io.to(roomCode).emit('room:update', room);
    return res.json({ room });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not join room.' });
  }
});

app.post('/api/verify-object', async (req, res) => {
  try {
    const { imageDataUrl, targetObject, roomCode, playerId } = req.body || {};
    if (!imageDataUrl) {
      return res.status(400).json({ error: 'imageDataUrl is required.' });
    }

    const result = await verifyObject({ imageDataUrl, targetObject });

    if (roomCode && playerId) {
      const room = getRoom(roomCode.toUpperCase());
      if (room && room.players[playerId]) {
        room.players[playerId].lastAttemptImage = imageDataUrl;
        room.players[playerId].status = result.verified ? 'SEARCHING' : 'VERIFYING';
        io.to(roomCode.toUpperCase()).emit('room:update', room);
      }
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Verification failed.' });
  }
});

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomCode, playerId, name }) => {
    if (!roomCode || !playerId) return;

    const normalizedCode = String(roomCode).toUpperCase();
    socket.data.playerId = playerId;
    socket.data.roomCode = normalizedCode;
    socket.join(normalizedCode);

    try {
      const room = joinRoom({ roomCode: normalizedCode, playerId, name });
      io.to(normalizedCode).emit('room:update', room);
    } catch {
      // ignore room errors for now; client can fetch the room explicitly
    }
  });

  socket.on('disconnect', () => {
    const roomCode = [...socket.rooms].find((room) => room !== socket.id);
    if (roomCode && socket.data.playerId) {
      const room = removePlayer(roomCode, socket.data.playerId);
      if (room) {
        io.to(roomCode).emit('room:update', room);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Spotle backend listening on http://localhost:${PORT}`);
});
