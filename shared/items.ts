export type VisualType = 'emoji' | 'lucide' | 'image';

export interface ScavengerItem {
  id: string;
  name: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  hint: string;
  visualType: VisualType;
  visualValue: string;
  aliases: string[];
  cheatRisks: string[];
}

export interface RoundStartPayload {
  roundNumber: number;
  targetObject: string;
  hint: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  visualType: VisualType;
  visualValue: string;
  startTime: number;
}
