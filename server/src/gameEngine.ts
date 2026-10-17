/**
 * Server-authoritative round loop.
 */
import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  Player,
  RoomState,
  RoundData,
  ServerToClientEvents,
  VerificationResponse,
} from '../../shared/game.js';
import { pointsForPlacement } from '../../shared/game.js';
import { isPlayerHuntMode } from '../../shared/game.js';
import { verifyObjectHunt, verifyObjectPhoto, verifyPlayerHunt } from '../gemini-referee/geminiReferee.js';
import { MASTER_ITEM_DATABASE, pickRoundTarget } from './data/itemRegistry.js';
import { resetForNewGame, serializeRoom } from './rooms.js';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

const COOLDOWN_MS = 3000;
const ROUND_RESULT_PAUSE_MS = 4000;
const COUNTDOWN_MS = 3000;

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

export function assignTargets(players: Player[]): Map<string, Player> {
  const shuffled = [...players];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  const targetMap = new Map<string, Player>();
  for (let i = 0; i < shuffled.length; i += 1) {
    targetMap.set(shuffled[i].id, shuffled[(i + 1) % shuffled.length]);
  }
  return targetMap;
}

function buildRoundForPlayer(room: RoomState, roundNumber: number, playerId: string, base: RoundData): RoundData {
  const player = room.players[playerId];
  if (!isPlayerHuntMode(room.settings.mode) || !player?.targetPlayerId) {
    return { ...base, mode: 'OBJECTS' };
  }

  const target = room.players[player.targetPlayerId];
  if (!target) {
    return {
      ...base,
      mode: room.settings.mode,
      targetObject: 'Hunt the target player!',
      difficulty: 'MEDIUM',
      targetPlayerId: player.targetPlayerId,
    };
  }

  return {
    ...base,
    mode: room.settings.mode,
    roundNumber,
    targetObject: `Hunt ${target.name}!`,
    difficulty: 'MEDIUM',
    targetPlayerId: target.id,
    targetPlayerSelfie: target.selfieBase64,
  };
}

export function maybeStartMeRound(io: GameServer, room: RoomState): boolean {
  if (!isPlayerHuntMode(room.settings.mode) || room.status !== 'SELFIE_REGISTRATION') return false;
  const players = Object.values(room.players);
  if (players.length === 0 || players.some((player) => !player.selfieBase64)) return false;

  room.status = 'COUNTDOWN';
  broadcastRoom(io, room);
  schedule(room.roomCode, () => beginRound(io, room, 1), COUNTDOWN_MS);
  return true;
}

export function startGame(io: GameServer, room: RoomState): void {
  clearTimers(room.roomCode);
  resetForNewGame(room);

  if (isPlayerHuntMode(room.settings.mode)) {
    if (Object.keys(room.players).length < 2) {
      io.to(room.roomCode).emit('game:error', { message: 'Player Hunt needs at least two players.' });
      return;
    }
    room.status = 'SELFIE_REGISTRATION';
    broadcastRoom(io, room);
    io.to(room.roomCode).emit('PROMPT_SELFIE_REGISTRATION', { timeoutMs: 30000 });
    schedule(room.roomCode, () => {
      if (room.status !== 'SELFIE_REGISTRATION') return;
      resetForNewGame(room);
      broadcastRoom(io, room);
      io.to(room.roomCode).emit('game:error', { message: 'Selfie registration timed out. Start the game again when everyone is ready.' });
    }, 30000);
    return;
  }

  room.status = 'COUNTDOWN';
  broadcastRoom(io, room);
  schedule(room.roomCode, () => beginRound(io, room, 1), COUNTDOWN_MS);
}

export function beginRound(io: GameServer, room: RoomState, roundNumber: number): void {
  if (isPlayerHuntMode(room.settings.mode)) {
    const targets = assignTargets(Object.values(room.players));
    for (const player of Object.values(room.players)) {
      player.status = 'SEARCHING';
      player.targetPlayerId = targets.get(player.id)?.id;
      delete player.placement;
      delete player.reactionMs;
    }

    const baseRound: RoundData = {
      roundNumber,
      mode: room.settings.mode,
      targetObject: 'Hunt the target player!',
      difficulty: 'MEDIUM',
      startTime: Date.now(),
      finishers: [],
    };

    room.currentRound = baseRound;
    room.status = 'HUNTING';
    broadcastRoom(io, room);

    for (const player of Object.values(room.players)) {
      const playerRound = buildRoundForPlayer(room, roundNumber, player.id, baseRound);
      io.to(player.id).emit('round:start', playerRound);
    }

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
    return;
  }

  // null theme = no filter; draw from the whole database.
  const theme = room.settings.theme;
  const forcedId = process.env.SPOTLE_FORCE_TARGET?.trim();
  // Resolve the override separately: `(forcedId && find(...)) ?? fallback`
  // yields '' when the env var is set but empty, because ?? only catches
  // null/undefined - which then blew up on pick.id.
  const forced = forcedId
    ? MASTER_ITEM_DATABASE.find((item) => item.id === forcedId)
    : undefined;
  const pick = forced ?? pickRoundTarget(room.usedObjects, theme);

  const round: RoundData = {
    roundNumber,
    mode: 'OBJECTS',
    targetId: pick.id,
    targetObject: pick.name,
    emoji: pick.emoji,
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

  let verdict: VerificationResponse;
  try {
    if (isPlayerHuntMode(room.settings.mode)) {
      const targetPlayer = player.targetPlayerId ? room.players[player.targetPlayerId] : undefined;
      if (!targetPlayer?.selfieBase64) {
        player.status = 'SEARCHING';
        broadcastRoom(io, room);
        return;
      }
      verdict = await verifyPlayerHunt({
        targetSelfieBase64: targetPlayer.selfieBase64,
        capturedFrameBase64: imageDataUrl,
        targetName: targetPlayer.name,
        hunterName: player.name,
      });
    } else {
      const item = round.targetId
        ? MASTER_ITEM_DATABASE.find((candidate) => candidate.id === round.targetId)
        : undefined;
      verdict = item
        ? await verifyObjectHunt(item, imageDataUrl, player.name)
        : await verifyObjectPhoto({
            targetObject: round.targetObject,
            imageBase64: imageDataUrl,
            playerName: player.name,
          });
    }
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

  if (room.status !== 'HUNTING' || room.currentRound?.roundNumber !== round.roundNumber) return;

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

export function giveUpPlayer(io: GameServer, room: RoomState, playerId: string): void {
  const player = room.players[playerId];
  const round = room.currentRound;

  if (!player || !round || room.status !== 'HUNTING') return;
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
