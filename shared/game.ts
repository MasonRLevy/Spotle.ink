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
  | 'SELFIE_REGISTRATION'
  | 'HUNTING'
  | 'ROUND_RESULT'
  | 'GAME_OVER';

export type GameMode = 'OBJECTS' | 'ME' | 'HIDE_N_SEEK';
export function isPlayerHuntMode(mode: GameMode): boolean {
  return mode === 'ME' || mode === 'HIDE_N_SEEK';
}
export type ThemeType = 'UF_SWAMP' | 'HACKATHON' | 'GENERAL' | 'OUTDOORS';

/**
 * Legacy/theme compatibility buffer for older clients while the new theme set
 * is adopted across the app.
 */
export type ThemeId = ThemeType | 'HOME' | 'UF';

export interface GameTheme {
  id: ThemeType;
  name: string;
  emoji: string;
}

export const GAME_THEMES: GameTheme[] = [
  { id: 'UF_SWAMP', name: 'UF / Swamp', emoji: '🐊' },
  { id: 'HACKATHON', name: 'Hackathon', emoji: '💻' },
  { id: 'GENERAL', name: 'General Indoor', emoji: '🏠' },
  { id: 'OUTDOORS', name: 'Outdoors', emoji: '🌳' },
];

export function getTheme(id: ThemeId | null | undefined): GameTheme | undefined {
  if (id === 'HOME') id = 'GENERAL';
  if (id === 'UF') id = 'UF_SWAMP';
  return GAME_THEMES.find((t) => t.id === id);
}

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

export interface ScavengerItem {
  id: string;
  name: string;
  themes: ThemeType[];
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  emoji: string;
  aliases: string[];
  cheatRisks: string[];
}

export interface Player {
  id: string;
  peerId: string;
  name: string;
  score: number;
  status: PlayerStatus;
  isHost: boolean;
  selfieBase64?: string;
  selfieReady?: boolean;
  targetPlayerId?: string;
  /** Set once this player has been verified in the current round. */
  placement?: number;
  reactionMs?: number;
  lastAttemptImage?: string;
}

export interface ImageAttribution {
  author: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
}

export interface RoundData {
  roundNumber: number;
  mode: GameMode;
  targetId?: string;
  targetObject: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  emoji?: string;
  targetPlayerId?: string;
  targetPlayerSelfie?: string;
  startTime: number;
  finishers: string[];
  winnerId?: string;
  refereeCommentary?: string;
  imageAttribution?: ImageAttribution;
}

export interface RoundStartPayload {
  roundNumber: number;
  mode: GameMode;
  targetObject: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  emoji?: string;
  targetPlayerId?: string;
  targetPlayerSelfie?: string;
  startTime: number;
}

export interface RoomSettings {
  maxPlayers: number;
  totalRounds: number;
  roundTimeLimitSec: number;
  mode: GameMode;
  theme: ThemeType | null;
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
  mode?: GameMode;
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
  placement?: number;
  pointsAwarded?: number;
  reactionMs?: number;
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
  'room:set-mode': (payload: { mode: GameMode }) => void;
  'room:set-theme': (payload: { theme: ThemeType | null }) => void;
  'game:start': () => void;
  'round:attempt': (payload: AttemptPayload) => void;
  'round:give-up': () => void;
  'round:skip': () => void;
  'SUBMIT_SELFIE': (payload: { selfieBase64: string }) => void;
  'game:reset': () => void;
}

/** Server -> Client */
export interface ServerToClientEvents {
  'room:update': (room: RoomState) => void;
  'round:start': (round: RoundData) => void;
  'PROMPT_SELFIE_REGISTRATION': (payload: { timeoutMs: number }) => void;
  'round:verdict': (event: VerdictEvent) => void;
  'round:end': (event: RoundEndEvent) => void;
  'game:over': (room: RoomState) => void;
  'game:error': (payload: { message: string }) => void;
}
