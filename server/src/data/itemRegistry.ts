import type { ScavengerItem } from '../../../shared/items.js';
import { getAllObjects } from '../../gemini-referee/objectPool.js';

export const MASTER_ITEM_DATABASE: ScavengerItem[] = getAllObjects().map((item) => ({
  id: item.id,
  name: item.name,
  difficulty: item.difficulty,
  hint: item.examples,
  visualType: 'emoji',
  visualValue: item.emoji,
  aliases: [item.name, item.examples, ...item.examples.split(',').map((entry) => entry.trim()).filter(Boolean)],
  cheatRisks: ['screen photo', 'browser image search', 'monitor display', 'phone wallpaper'],
}));

export function pickRoundTarget(usedObjectIds: string[] = []): ScavengerItem {
  const available = MASTER_ITEM_DATABASE.filter((item) => !usedObjectIds.includes(item.id));
  const pool = available.length > 0 ? available : MASTER_ITEM_DATABASE;
  return pool[Math.floor(Math.random() * pool.length)] ?? MASTER_ITEM_DATABASE[0]!;
}
