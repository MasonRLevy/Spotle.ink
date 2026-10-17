import type { ImageAttribution } from "../../shared/game.js";

// Re-exported so modules importing from "./types.js" (e.g. objectPool) can
// reach it without reaching across into shared/ themselves.
export type { ImageAttribution };

export type ObjectCategory = "HACKATHON_CAMPUS" | "HOUSEHOLD";
export type ObjectDifficulty = "EASY" | "MEDIUM" | "HARD";

export type MatchQuality =
  | "EXACT"
  | "CLOSE_ENOUGH"
  | "TOO_DIFFERENT"
  | "NOT_FOUND"
  | "SCREEN_CHEAT";

export interface FindableObject {
  id: string;
  name: string;
  category: ObjectCategory;
  difficulty: ObjectDifficulty;
  emoji: string;
  unicodeHex: string;
  flatSvgUrl: string;
  imageAttribution?: ImageAttribution;
  examples: string;
  /**
   * Themes this item belongs to, e.g. ["HOME"] or ["HOME", "UF"].
   * Supplied by the new item dataset. Until every item has it, items without
   * it fall back to a category mapping - see themesForObject() in objectPool.
   */
  themes?: string[];
}

export interface VerificationResponse {
  verified: boolean;
  detectedObject: string;
  matchQuality: MatchQuality;
  confidence: number;
  isScreenCheat: boolean;
  commentary: string;
}

export interface VerifyObjectPhotoInput {
  targetObject: string;
  imageBase64: string;
  playerName?: string;
}

export interface RandomObjectOptions {
  category?: string;
  difficulty?: string;
  excludeIds?: string[];
  /** Only draw items belonging to this theme. Omit/null for any item. */
  theme?: string | null;
}
