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
  examples: string;
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
}
