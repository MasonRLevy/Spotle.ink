import type { ScavengerItem, ThemeType } from '../../../shared/game.js';
import { randomInt } from 'node:crypto';

export const MASTER_ITEM_DATABASE: ScavengerItem[] = [
  {
    id: 'uf-century-tower',
    name: 'Century Tower',
    themes: ['UF_SWAMP'],
    difficulty: 'MEDIUM',
    emoji: '🔍',
    aliases: ['century tower', 'bell tower', 'carillon'],
    cheatRisks: ['google images on laptop', 'phone wallpaper'],
  },
  {
    id: 'uf-french-fries',
    name: '"The French Fries" Sculpture',
    themes: ['UF_SWAMP'],
    difficulty: 'MEDIUM',
    emoji: '🍟',
    aliases: ['french fries sculpture', 'alachua sculpture', 'yellow metal sculpture'],
    cheatRisks: ['instagram photos', 'reddit screenshots'],
  },
  {
    id: 'uf-gator-card',
    name: 'Gator 1 Card / Student ID',
    themes: ['UF_SWAMP'],
    difficulty: 'EASY',
    emoji: '🪪',
    aliases: ['student id', 'gator 1', 'id badge', 'college id'],
    cheatRisks: ['digital id on phone screen'],
  },
  {
    id: 'uf-bull-gator',
    name: 'Bull Gator Statue',
    themes: ['UF_SWAMP'],
    difficulty: 'HARD',
    emoji: '🐊',
    aliases: ['bull gator', 'bronze alligator statue', 'stadium gator'],
    cheatRisks: ['gator athletics wallpaper'],
  },
  {
    id: 'hack-lanyard',
    name: 'Event Badge / Lanyard',
    themes: ['HACKATHON', 'UF_SWAMP'],
    difficulty: 'EASY',
    emoji: '🏷️',
    aliases: ['lanyard', 'hackathon badge', 'pass'],
    cheatRisks: ['photo of a badge online'],
  },
  {
    id: 'hack-energy-drink',
    name: 'Energy Drink Can',
    themes: ['HACKATHON', 'GENERAL'],
    difficulty: 'EASY',
    emoji: '⚡',
    aliases: ['celsius', 'red bull', 'monster', 'energy drink'],
    cheatRisks: ['google image search'],
  },
  {
    id: 'hack-stickers-laptop',
    name: 'Laptop Covered in Stickers',
    themes: ['HACKATHON'],
    difficulty: 'MEDIUM',
    emoji: '💻',
    aliases: ['sticker bombed laptop', 'macbook stickers'],
    cheatRisks: ['desktop wallpaper'],
  },
  {
    id: 'gen-headphones',
    name: 'Headphones or Earbuds',
    themes: ['GENERAL', 'HACKATHON'],
    difficulty: 'EASY',
    emoji: '🎧',
    aliases: ['airpods', 'earphones', 'headset'],
    cheatRisks: ['apple store webpage screenshot'],
  },
  {
    id: 'gen-water-bottle',
    name: 'Reusable Water Bottle',
    themes: ['GENERAL', 'HACKATHON', 'OUTDOORS'],
    difficulty: 'EASY',
    emoji: '🍶',
    aliases: ['water bottle', 'hydro flask', 'flask'],
    cheatRisks: ['photo of water bottle on screen'],
  },
  {
    id: 'gen-keys',
    name: 'Keyring with Keys',
    themes: ['GENERAL'],
    difficulty: 'EASY',
    emoji: '🔑',
    aliases: ['car keys', 'house keys', 'keychain'],
    cheatRisks: ['stock photo of keys'],
  },
  {
    id: 'out-blue-light',
    name: 'Blue Light Emergency Pole',
    themes: ['OUTDOORS', 'UF_SWAMP'],
    difficulty: 'EASY',
    emoji: '🚨',
    aliases: ['emergency blue light', 'blue light phone', 'campus call box'],
    cheatRisks: ['campus safety webpage'],
  },
  {
    id: 'out-bicycle',
    name: 'Bicycle or Scooter',
    themes: ['OUTDOORS'],
    difficulty: 'EASY',
    emoji: '🚲',
    aliases: ['bike', 'e-scooter', 'bicycle'],
    cheatRisks: ['picture of a bike on a screen'],
  },
];

/**
 * Unbiased random index backed by the crypto RNG.
 *
 * `Math.floor(Math.random() * n)` is fine statistically, but randomInt draws
 * from the OS entropy source and is rejection-sampled, so there is no modulo
 * bias and no shared pseudo-random sequence across rooms.
 */
function randomIndex(length: number): number {
  return length <= 1 ? 0 : randomInt(length);
}

function pickFrom(pool: ScavengerItem[], usedObjectIds: string[]): ScavengerItem {
  const unused = pool.filter((item) => !usedObjectIds.includes(item.id));
  if (unused.length > 0) return unused[randomIndex(unused.length)]!;

  // Theme exhausted. Start a fresh cycle, but never hand back the item that
  // just played - a back-to-back repeat is the one that really looks broken.
  const last = usedObjectIds[usedObjectIds.length - 1];
  const avoidLast = pool.filter((item) => item.id !== last);
  const recycled = avoidLast.length > 0 ? avoidLast : pool;
  return recycled[randomIndex(recycled.length)]!;
}

export function itemsForTheme(theme: ThemeType): ScavengerItem[] {
  return MASTER_ITEM_DATABASE.filter((item) => item.themes.includes(theme));
}

/** How many items are still unplayed, so the caller can start a new cycle. */
export function unusedCount(theme: ThemeType | null, usedObjectIds: string[]): number {
  const pool = theme ? itemsForTheme(theme) : MASTER_ITEM_DATABASE;
  return pool.filter((item) => !usedObjectIds.includes(item.id)).length;
}

export function pickThemeTarget(theme: ThemeType, usedObjectIds: string[] = []): ScavengerItem {
  const pool = itemsForTheme(theme);
  if (pool.length === 0) return MASTER_ITEM_DATABASE[randomIndex(MASTER_ITEM_DATABASE.length)]!;
  return pickFrom(pool, usedObjectIds);
}

/** No theme selected: draw from the whole database rather than a default theme. */
export function pickAnyTarget(usedObjectIds: string[] = []): ScavengerItem {
  return pickFrom(MASTER_ITEM_DATABASE, usedObjectIds);
}

export function pickRoundTarget(usedObjectIds: string[] = [], theme: ThemeType | null = null): ScavengerItem {
  return theme ? pickThemeTarget(theme, usedObjectIds) : pickAnyTarget(usedObjectIds);
}
