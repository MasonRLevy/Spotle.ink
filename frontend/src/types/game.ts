/** Locked shared types — single source of truth for all teammates. */

export type RoomStatus =
  | 'LOBBY'
  | 'COUNTDOWN'
  | 'HUNTING'
  | 'VERIFYING'
  | 'ROUND_RESULT'
  | 'GAME_OVER';

export type ThemeType = 'GENERAL' | 'UF_SWAMP' | 'HACKATHON' | 'OUTDOORS';

export interface Player {
  id: string;
  peerId: string;
  name: string;
  score: number;
  status: 'READY' | 'SEARCHING' | 'VERIFYING' | 'PENALIZED';
  lastAttemptImage?: string;
}

export interface RoundData {
  roundNumber: number;
  targetObject: string;
  hint: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  startTime: number;
  winnerId?: string;
  refereeCommentary?: string;
}

export interface RoomState {
  roomCode: string;
  hostId: string;
  status: RoomStatus;
  settings: {
    maxPlayers: number;
    totalRounds: number;
    roundTimeLimitSec: number;
    theme: ThemeType;
  };
  players: Record<string, Player>;
  currentRound: RoundData | null;
  usedObjects: string[];
}

export interface VerificationResponse {
  verified: boolean;
  confidence: number;
  isScreenCheat: boolean;
  commentary: string;
}
