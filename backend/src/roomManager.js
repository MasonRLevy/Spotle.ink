const rooms = new Map();

function generateRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function createRoom({ roomCode, hostId, hostName = 'Host' }) {
  const code = roomCode || generateRoomCode();
  const room = {
    roomCode: code,
    hostId,
    status: 'LOBBY',
    settings: {
      maxPlayers: 4,
      totalRounds: 5,
      roundTimeLimitSec: 60,
      theme: 'GENERAL',
    },
    players: {},
    currentRound: null,
    usedObjects: [],
  };

  rooms.set(code, room);
  room.players[hostId] = {
    id: hostId,
    peerId: hostId,
    name: hostName,
    score: 0,
    status: 'READY',
  };

  return room;
}

export function getRoom(roomCode) {
  return rooms.get(roomCode) || null;
}

export function joinRoom({ roomCode, playerId, name }) {
  const room = rooms.get(roomCode);
  if (!room) {
    throw new Error('Room not found.');
  }

  if (!playerId) {
    throw new Error('playerId is required.');
  }

  room.players[playerId] = {
    id: playerId,
    peerId: playerId,
    name: name || `Player ${Object.keys(room.players).length + 1}`,
    score: 0,
    status: 'READY',
  };

  return room;
}

export function removePlayer(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  delete room.players[playerId];

  if (room.hostId === playerId) {
    const nextHost = Object.keys(room.players)[0];
    if (nextHost) room.hostId = nextHost;
  }

  return room;
}

export function listRooms() {
  return Array.from(rooms.values());
}
