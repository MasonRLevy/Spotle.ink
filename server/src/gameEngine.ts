/**
 * Server-authoritative round loop.
 *
 * Ported from Role 3's Python `game_manager.py` (START_ROUND /
 * PLAYER_FOUND_ITEM / winner / scoreboard) and extended with:
 *   - real Gemini verification before a find counts,
 *   - placement scoring (1st 4pts, 2nd 3, 3rd 2, 4th 1),
 *   - targets drawn from the curated 74-object pool,
 *   - a per-round time limit.
 *
 * The client is never trusted: it sends a photo, the server decides.
 */
import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  RoomState,
  RoundData,
  ServerToClientEvents,
} from '../../shared/game.js';
import { pointsForPlacement } from '../../shared/game.js';
import { getObjectById, getRandomTargetObject } from '../gemini-referee/objectPool.js';
import { verifyObjectPhoto } from '../gemini-referee/geminiReferee.js';
import { resetForNewGame, serializeRoom } from './rooms.js';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

const COOLDOWN_MS = 3000;
const ROUND_RESULT_PAUSE_MS = 4000;
const COUNTDOWN_MS = 3000;

/** Per-room timers so a disconnect or reset can cancel pending work. */
const roundTimers = new Map<string, NodeJS.Timeout[]>();

function schedule(pin: string, fn: () => void, ms: number): void {
  const timer = setTimeout(fn, ms);
  const list = roundTimers.get(pin) ?? [];
  list.push(timer);
  roundTimers.set(pin, list);
}

export function clearTimers(pin: string): void {
  for (const timer of roundTimers.get(pin) ?? []) clearTimeout(timer);
  roundTimers.delete(pin);
}

export function broadcastRoom(io: GameServer, room: RoomState): void {
  io.to(room.roomCode).emit('room:update', serializeRoom(room));
}

/** Host pressed START GAME. */
export function startGame(io: GameServer, room: RoomState): void {
  clearTimers(room.roomCode);
  resetForNewGame(room);
  room.status = 'COUNTDOWN';
  broadcastRoom(io, room);
  schedule(room.roomCode, () => beginRound(io, room, 1), COUNTDOWN_MS);
}

export function beginRound(io: GameServer, room: RoomState, roundNumber: number): void {
  // Demo/test hook: pin the target so a run is reproducible.
  //   SPOTLE_FORCE_TARGET=hammer npm start
  const forcedId = process.env.SPOTLE_FORCE_TARGET?.trim();
  const forced = forcedId ? getObjectById(forcedId) : undefined;

  const target = forced ?? getRandomTargetObject({ excludeIds: room.usedObjects });
  if (!target) {
    // Pool exhausted - recycle rather than stalling the game.
    room.usedObjects = [];
  }
  const pick = target ?? getRandomTargetObject({});
  if (!pick) {
    io.to(room.roomCode).emit('game:error', { message: 'Object pool is empty.' });
    return;
  }

  const round: RoundData = {
    roundNumber,
    targetId: pick.id,
    targetObject: pick.name,
    targetIconUrl: pick.flatSvgUrl,
    hint: pick.examples,
    difficulty: pick.difficulty,
    startTime: Date.now(),
    finishers: [],
  };

  room.usedObjects.push(pick.id);
  room.currentRound = round;
  room.status = 'HUNTING';

  for (const player of Object.values(room.players)) {
    player.status = 'SEARCHING';
    delete player.placement;
    delete player.reactionMs;
  }

  broadcastRoom(io, room);
  io.to(room.roomCode).emit('round:start', round);

  // Safety net: never let a round hang forever.
  schedule(
    room.roomCode,
    () => {
      if (room.status === 'HUNTING' && room.currentRound?.roundNumber === roundNumber) {
        for (const player of Object.values(room.players)) {
          if (player.status !== 'FOUND') player.status = 'SKIPPED';
        }
        endRound(io, room);
      }
    },
    room.settings.roundTimeLimitSec * 1000,
  );
}

/**
 * A player pressed FOUND IT. Runs Gemini, and on success locks in their
 * placement. Players who have already finished cannot score twice.
 */
export async function handleAttempt(
  io: GameServer,
  room: RoomState,
  playerId: string,
  imageDataUrl: string,
): Promise<void> {
  const player = room.players[playerId];
  const round = room.currentRound;

  if (!player || !round || room.status !== 'HUNTING') return;
  if (player.status === 'FOUND' || player.status === 'VERIFYING') return;
  if (round.finishers.includes(playerId)) return;

  player.status = 'VERIFYING';
  broadcastRoom(io, room);

  let verdict;
  try {
    verdict = await verifyObjectPhoto({
      targetObject: round.targetObject,
      imageBase64: imageDataUrl,
      playerName: player.name,
    });
  } catch (error) {
    console.error('[gameEngine] verification error:', error);
    if (room.status !== 'HUNTING' || room.currentRound?.roundNumber !== round.roundNumber) {
      return;
    }
    player.status = 'SEARCHING';
    broadcastRoom(io, room);
    io.to(room.roomCode).emit('round:verdict', {
      playerId,
      playerName: player.name,
      verdict: {
        verified: false,
        detectedObject: 'unknown',
        matchQuality: 'NOT_FOUND',
        confidence: 0,
        isScreenCheat: false,
        commentary: 'The referee could not review that shot - try again!',
      },
      cooldownMs: 1000,
    });
    return;
  }

  // The round may have ended while Gemini was thinking.
  if (room.status !== 'HUNTING' || room.currentRound?.roundNumber !== round.roundNumber) {
    return;
  }

  if (!verdict.verified) {
    player.status = 'PENALIZED';
    broadcastRoom(io, room);
    io.to(room.roomCode).emit('round:verdict', {
      playerId,
      playerName: player.name,
      verdict,
      cooldownMs: COOLDOWN_MS,
    });

    schedule(
      room.roomCode,
      () => {
        if (room.players[playerId]?.status === 'PENALIZED') {
          room.players[playerId]!.status = 'SEARCHING';
          broadcastRoom(io, room);
        }
      },
      COOLDOWN_MS,
    );
    return;
  }

  // Accepted - lock in placement and points.
  round.finishers.push(playerId);
  const placement = round.finishers.length;
  const pointsAwarded = pointsForPlacement(placement);
  const reactionMs = Date.now() - round.startTime;

  player.status = 'FOUND';
  player.placement = placement;
  player.reactionMs = reactionMs;
  player.score += pointsAwarded;

  broadcastRoom(io, room);
  io.to(room.roomCode).emit('round:verdict', {
    playerId,
    playerName: player.name,
    verdict,
    placement,
    pointsAwarded,
    reactionMs,
  });

  const everyoneFinished = Object.values(room.players).every(
    (roundPlayer) => roundPlayer.status === 'FOUND' || roundPlayer.status === 'SKIPPED',
  );
  if (everyoneFinished) {
    schedule(room.roomCode, () => endRound(io, room), 1200);
  }
}

/** A player gave up on their own attempt without affecting other players. */
export function giveUpPlayer(io: GameServer, room: RoomState, playerId: string): void {
  const player = room.players[playerId];
  const round = room.currentRound;

  if (!player || !round || room.status !== 'HUNTING') return;
  if (Date.now() - round.startTime < 30_000) return;
  if (player.status === 'FOUND' || player.status === 'VERIFYING' || player.status === 'SKIPPED') {
    return;
  }

  player.status = 'SKIPPED';
  broadcastRoom(io, room);

  const everyoneFinished = Object.values(room.players).every(
    (roundPlayer) => roundPlayer.status === 'FOUND' || roundPlayer.status === 'SKIPPED',
  );
  if (everyoneFinished) {
    schedule(room.roomCode, () => endRound(io, room), 1200);
  }
}

export function endRound(io: GameServer, room: RoomState): void {
  const round = room.currentRound;
  if (!round || room.status !== 'HUNTING') return;
  const everyoneFinished = Object.values(room.players).every(
    (player) => player.status === 'FOUND' || player.status === 'SKIPPED',
  );
  if (!everyoneFinished) return;

  room.status = 'ROUND_RESULT';
  for (const player of Object.values(room.players)) {
    if (player.status !== 'FOUND' && player.status !== 'SKIPPED') player.status = 'READY';
  }

  const isFinalRound = round.roundNumber >= room.settings.totalRounds;
  broadcastRoom(io, room);
  io.to(room.roomCode).emit('round:end', {
    roundNumber: round.roundNumber,
    finishers: round.finishers,
    isFinalRound,
  });

  if (isFinalRound) {
    schedule(
      room.roomCode,
      () => {
        room.status = 'GAME_OVER';
        broadcastRoom(io, room);
        io.to(room.roomCode).emit('game:over', serializeRoom(room));
      },
      ROUND_RESULT_PAUSE_MS,
    );
  }
}

/** Host advances past the scoreboard. */
export function nextRound(io: GameServer, room: RoomState): void {
  if (room.status !== 'ROUND_RESULT') return;
  const next = (room.currentRound?.roundNumber ?? 0) + 1;
  if (next > room.settings.totalRounds) {
    room.status = 'GAME_OVER';
    broadcastRoom(io, room);
    io.to(room.roomCode).emit('game:over', serializeRoom(room));
    return;
  }
  beginRound(io, room, next);
}
