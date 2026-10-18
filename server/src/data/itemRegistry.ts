import type { ScavengerItem, ThemeType } from '../../../shared/game.js';
import { randomInt } from 'node:crypto';
import { OBJECT_POOL, themesForObject } from '../../gemini-referee/objectPool.js';
import type { FindableObject } from '../../gemini-referee/types.js';

const CORE_ITEM_DATABASE: ScavengerItem[] = [
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

const HACKATHON_ITEM_IDS = new Set([
  'headphones',
  'laptop-charger',
  'backpack',
  'sneaker',
  'eyeglasses',
  'hoodie',
  'pen',
  'notebook',
  'wristwatch',
  'computer-mouse',
  'id-card',
  'baseball-cap',
  'sticker',
  'laptop',
  'smartphone',
  'keyboard',
  'clipboard',
  'sticky-notes',
  't-shirt',
  'jeans',
  'pencil',
  'name-badge',
  'usb-cable',
  'marker',
  'planner',
  'microphone',
  'usb-drive',
  'mousepad',
  'power-bank',
  'wallet-card',
  'camera',
  'tablet',
  'headset',
  'keyboard-shortcut',
  'folder',
  'binder',
  'whiteboard',
  'printer',
  'speaker',
  'keyboard-dock',
  'usb-hub',
  'gluestick',
  'stapler',
  'tape',
  'ruler',
  'eraser',
  'pencil-case',
  'phone-charger',
  'laptop-stand',
  'desktop-cleaner',
]);

const OUTDOOR_ITEM_IDS = new Set([
  'backpack',
  'sneaker',
  'umbrella',
  'flashlight',
  'gloves',
  'scarf',
  'water-bottle',
  'sunglasses',
  'hat',
  'sandal',
  'backpack-strap',
  'shoe-laces',
  'socks-pair',
]);

function legacyThemes(item: FindableObject): ThemeType[] {
  const oldThemes = themesForObject(item);
  const themes = new Set<ThemeType>(
    oldThemes.flatMap((theme) => {
      if (theme === 'HOME' || theme === 'GENERAL') return ['GENERAL'] as const;
      if (theme === 'UF' || theme === 'UF_SWAMP') return ['UF_SWAMP'] as const;
      if (theme === 'HACKATHON') return ['HACKATHON'] as const;
      if (theme === 'OUTDOORS') return ['OUTDOORS'] as const;
      return [];
    }),
  );

  if (item.category === 'HOUSEHOLD') themes.add('GENERAL');
  if (item.category === 'HACKATHON_CAMPUS') themes.add('UF_SWAMP');
  if (item.id === 'french-fries-sculpture') themes.add('UF_SWAMP');
  if (HACKATHON_ITEM_IDS.has(item.id)) themes.add('HACKATHON');
  if (OUTDOOR_ITEM_IDS.has(item.id)) themes.add('OUTDOORS');

  return [...themes];
}

function normalizeItemName(name: string): string {
  return name.toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '');
}

function convertLegacyItem(item: FindableObject): ScavengerItem {
  const aliases = item.examples
    .split(',')
    .map((example) => example.trim())
    .filter(Boolean);
  return {
    id: item.id,
    name: item.name,
    themes: legacyThemes(item),
    difficulty: item.difficulty,
    emoji: item.emoji,
    aliases,
    cheatRisks: [
      'a picture of the object displayed on a phone or computer screen',
      'a printed picture instead of the real object',
    ],
  };
}

const existingNames = new Set(
  CORE_ITEM_DATABASE.flatMap((item) => [item.name, ...item.aliases].map(normalizeItemName)),
);
const existingIds = new Set(CORE_ITEM_DATABASE.map((item) => item.id));

const LEGACY_ITEM_DATABASE = OBJECT_POOL
  .filter((item) => {
    if (existingIds.has(item.id)) return false;
    const itemNames = [item.name, ...item.examples.split(',')].map(normalizeItemName);
    return !itemNames.some((name) => existingNames.has(name));
  })
  .map(convertLegacyItem);

export const MASTER_ITEM_DATABASE: ScavengerItem[] = [
  ...CORE_ITEM_DATABASE,
  ...LEGACY_ITEM_DATABASE,
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

/** Begin a fresh pool cycle after exhausting the current theme or full pool. */
export function prepareUsedObjectsForNextRound(
  theme: ThemeType | null,
  usedObjectIds: string[],
): string[] {
  if (usedObjectIds.length === 0 || unusedCount(theme, usedObjectIds) > 0) {
    return usedObjectIds;
  }
  return usedObjectIds.slice(-1);
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

/**
 * Resolves SPOTLE_FORCE_TARGET, which pins the round target for a repeatable
 * demo or for npm run simulate.
 *
 * Matches an id, a name or any alias, case-insensitively, and honours the
 * room's theme filter the same way an unforced pick would. Exact-id-only
 * matching failed silently: the server just drew a random item instead, so
 * `npm run simulate` reported four confusing "that is not a laptop" verdicts
 * that looked like a referee bug. Returning null lets the caller say so out
 * loud rather than quietly ignoring the setting.
 */
export function findItemByRef(ref: string, theme: ThemeType | null = null): ScavengerItem | null {
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  const pool = theme ? itemsForTheme(theme) : MASTER_ITEM_DATABASE;
  return (
    pool.find((item) => item.id.toLowerCase() === needle)
    ?? pool.find((item) => item.name.toLowerCase() === needle)
    ?? pool.find((item) => item.aliases.some((alias) => alias.toLowerCase() === needle))
    ?? null
  );
}

/** Item counts per theme, for the boot log and the demo-risk check. */
export function themeCoverage(): Record<ThemeType, number> {
  const themes: ThemeType[] = ['UF_SWAMP', 'HACKATHON', 'GENERAL', 'OUTDOORS'];
  return Object.fromEntries(
    themes.map((theme) => [theme, itemsForTheme(theme).length]),
  ) as Record<ThemeType, number>;
}
