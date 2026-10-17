/**
 * Spotle.online - LOCKED SHARED CONTRACT
 *
 * Single source of truth for the server AND the frontend. Both import this
 * exact file (frontend via the `@shared` Vite alias), so the two can never
 * drift apart. Types only - no runtime dependencies.
 */

export type RoomStatus =
  | 'LOBBY'
  | 'COUNTDOWN'
  | 'HUNTING'
  | 'ROUND_RESULT'
  | 'GAME_OVER';

export type PlayerStatus =
  | 'READY'
  | 'SEARCHING'
  | 'VERIFYING'
  | 'FOUND'
  | 'PENALIZED'
  | 'SKIPPED';

export type MatchQuality =
  | 'EXACT'
  | 'CLOSE_ENOUGH'
  | 'TOO_DIFFERENT'
  | 'NOT_FOUND'
  | 'SCREEN_CHEAT';

export interface Player {
  id: string;
  peerId: string;
  name: string;
  score: number;
  status: PlayerStatus;
  isHost: boolean;
  /** Set once this player has been verified in the current round. */
  placement?: number;
  reactionMs?: number;
  lastAttemptImage?: string;
}

export interface RoundData {
  roundNumber: number;
  /** Object id from the curated pool, e.g. "coffee-mug". */
  targetId: string;
  targetObject: string;
  /** Fluent flat SVG shown dead-center as the on-screen prompt. */
  targetIconUrl: string;
  hint: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  startTime: number;
  /** Player ids in the order they were verified. */
  finishers: string[];
}

export interface RoundStartPayload {
  roundNumber: number;
  targetObject: string;
  hint: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  visualType?: 'emoji' | 'lucide' | 'image';
  visualValue?: string;
  startTime: number;
}

export interface RoomSettings {
  maxPlayers: number;
  totalRounds: number;
  roundTimeLimitSec: number;
}

export interface RoomState {
  /** 6-digit numeric PIN, e.g. "847291". */
  roomCode: string;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: Record<string, Player>;
  currentRound: RoundData | null;
  usedObjects: string[];
}

export interface VerificationResponse {
  verified: boolean;
  detectedObject: string;
  matchQuality: MatchQuality;
  /** 0-100. */
  confidence: number;
  isScreenCheat: boolean;
  commentary: string;
}

/** Points awarded by finishing position: 1st -> 4, 2nd -> 3, 3rd -> 2, 4th -> 1. */
export const PLACEMENT_POINTS = [4, 3, 2, 1] as const;

export function pointsForPlacement(placement: number): number {
  return PLACEMENT_POINTS[placement - 1] ?? 0;
}

/* ------------------------------------------------------------------ */
/* Socket.io event payloads                                            */
/* ------------------------------------------------------------------ */

export interface CreateRoomPayload {
  name: string;
}

export interface JoinRoomPayload {
  pin: string;
  name: string;
}

export interface JoinAck {
  ok: boolean;
  error?: string;
  playerId?: string;
  room?: RoomState;
}

export interface AttemptPayload {
  /** Full data URL captured from the live <video> element. */
  imageDataUrl: string;
}

export interface VerdictEvent {
  playerId: string;
  playerName: string;
  verdict: VerificationResponse;
  /** Present only when the attempt was accepted. */
  placement?: number;
  pointsAwarded?: number;
  reactionMs?: number;
  /** Milliseconds of cooldown applied after a rejected attempt. */
  cooldownMs?: number;
}

export interface RoundEndEvent {
  roundNumber: number;
  finishers: string[];
  isFinalRound: boolean;
}

/** Client -> Server */
export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload, ack: (res: JoinAck) => void) => void;
  'room:join': (payload: JoinRoomPayload, ack: (res: JoinAck) => void) => void;
  'peer:register': (payload: { peerId: string }) => void;
  'game:start': () => void;
  'round:attempt': (payload: AttemptPayload) => void;
  'round:give-up': () => void;
  'round:skip': () => void;
  'game:reset': () => void;
}

/** Server -> Client */
export interface ServerToClientEvents {
  'room:update': (room: RoomState) => void;
  'round:start': (round: RoundData) => void;
  'round:verdict': (event: VerdictEvent) => void;
  'round:end': (event: RoundEndEvent) => void;
  'game:over': (room: RoomState) => void;
  'game:error': (payload: { message: string }) => void;
}
