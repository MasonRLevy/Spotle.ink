/**
 * In-memory room registry for the unified Spotle server.
 *
 * Merges Role 3's two prototypes: the 6-digit PIN scheme and host/player
 * model from the Python `game_manager.py`, kept in the spec-shaped
 * `RoomState` from the Node `roomManager.js`.
 */
import type { Player, RoomState, RoomStatus } from '../../shared/game.js';

const rooms = new Map<string, RoomState>();

const DEFAULT_SETTINGS = {
  maxPlayers: 4,
  totalRounds: 10,
  roundTimeLimitSec: 90,
  theme: 'GENERAL' as const,
};

/** 6-digit numeric PIN, matching the join modal in the UI. */
export function generateUniquePin(): string {
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    if (!rooms.has(pin)) return pin;
  }
  throw new Error('Could not allocate a free room PIN.');
}

export function createRoom(hostId: string, hostName: string): RoomState {
  const roomCode = generateUniquePin();
  const room: RoomState = {
    roomCode,
    hostId,
    status: 'LOBBY',
    settings: { ...DEFAULT_SETTINGS },
    players: {
      [hostId]: makePlayer(hostId, hostName || 'Host', true),
    },
    currentRound: null,
    usedObjects: [],
  };
  rooms.set(roomCode, room);
  return room;
}

function makePlayer(id: string, name: string, isHost: boolean): Player {
  return {
    id,
    peerId: '',
    name,
    score: 0,
    status: 'READY',
    isHost,
  };
}

export function getRoom(pin: string): RoomState | undefined {
  return rooms.get(String(pin).trim());
}

export function joinRoom(
  pin: string,
  playerId: string,
  name: string,
): { ok: true; room: RoomState } | { ok: false; error: string } {
  const room = getRoom(pin);
  if (!room) return { ok: false, error: 'No room with that PIN.' };

  if (room.players[playerId]) return { ok: true, room };

  const count = Object.keys(room.players).length;
  if (count >= room.settings.maxPlayers) {
    return { ok: false, error: 'That room is full.' };
  }
  if (room.status !== 'LOBBY') {
    return { ok: false, error: 'That game has already started.' };
  }

  room.players[playerId] = makePlayer(playerId, name || `Player ${count + 1}`, false);
  return { ok: true, room };
}

export function removePlayer(pin: string, playerId: string): RoomState | undefined {
  const room = getRoom(pin);
  if (!room) return undefined;

  delete room.players[playerId];

  const remaining = Object.keys(room.players);
  if (remaining.length === 0) {
    rooms.delete(pin);
    return undefined;
  }

  // Promote someone if the host left, so the room stays playable.
  if (room.hostId === playerId) {
    const nextHostId = remaining[0]!;
    room.hostId = nextHostId;
    room.players[nextHostId]!.isHost = true;
  }

  return room;
}

export function setPeerId(pin: string, playerId: string, peerId: string): RoomState | undefined {
  const room = getRoom(pin);
  const player = room?.players[playerId];
  if (!room || !player) return undefined;
  player.peerId = peerId;
  return room;
}

export function setStatus(room: RoomState, status: RoomStatus): void {
  room.status = status;
}

export function playerList(room: RoomState): Player[] {
  return Object.values(room.players);
}

/** Strips heavy base64 images before broadcasting room state over the wire. */
export function serializeRoom(room: RoomState): RoomState {
  return {
    ...room,
    players: Object.fromEntries(
      Object.entries(room.players).map(([id, player]) => {
        const { lastAttemptImage: _omit, ...rest } = player;
        return [id, rest as Player];
      }),
    ),
  };
}

export function resetForNewGame(room: RoomState): void {
  room.status = 'LOBBY';
  room.currentRound = null;
  room.usedObjects = [];
  for (const player of Object.values(room.players)) {
    player.score = 0;
    player.status = 'READY';
    delete player.placement;
    delete player.reactionMs;
    delete player.lastAttemptImage;
  }
}
