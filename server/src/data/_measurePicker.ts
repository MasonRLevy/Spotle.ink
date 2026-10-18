/**
 * Measures round-target variety, the way the picker change was originally
 * settled: simulate many full games per theme and count repeats.
 *
 * The floor is unavoidable: a 10-round game drawn from a pool of N items
 * must repeat max(0, 10 - N) times. Anything above that floor is a picker
 * bug; anything at the floor is a missing-items problem.
 *
 *   npx tsx src/data/_measurePicker.ts
 */
import type { ThemeType } from '../../../shared/game.js';
import { itemsForTheme, MASTER_ITEM_DATABASE, pickRoundTarget, unusedCount } from './itemRegistry.js';

const GAMES = 500;
const ROUNDS = 10;
const THEMES: (ThemeType | null)[] = ['UF_SWAMP', 'HACKATHON', 'GENERAL', 'OUTDOORS', null];

/** Mirrors the cycle reset in gameEngine.beginRound. */
function playGame(theme: ThemeType | null): string[] {
  const used: string[] = [];
  const drawn: string[] = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    if (unusedCount(theme, used) === 0 && used.length > 0) {
      used.splice(0, used.length, used[used.length - 1]!);
    }
    const pick = pickRoundTarget(used, theme);
    used.push(pick.id);
    drawn.push(pick.id);
  }
  return drawn;
}

let anyAboveFloor = false;

console.log(`\n  ${GAMES} simulated ${ROUNDS}-round games per theme\n`);
console.log('  theme        pool  floor  worst  avg repeats  back-to-back');
console.log('  ---------------------------------------------------------');

for (const theme of THEMES) {
  const pool = theme ? itemsForTheme(theme).length : MASTER_ITEM_DATABASE.length;
  const floor = Math.max(0, ROUNDS - pool);
  let totalRepeats = 0;
  let worst = 0;
  let backToBack = 0;

  for (let game = 0; game < GAMES; game += 1) {
    const drawn = playGame(theme);
    const repeats = drawn.length - new Set(drawn).size;
    totalRepeats += repeats;
    if (repeats > worst) worst = repeats;
    for (let i = 1; i < drawn.length; i += 1) {
      if (drawn[i] === drawn[i - 1]) backToBack += 1;
    }
  }

  const avg = (totalRepeats / GAMES).toFixed(2);
  if (worst > floor) anyAboveFloor = true;
  console.log(
    `  ${(theme ?? 'ANY').padEnd(12)} ${String(pool).padStart(4)}  ${String(floor).padStart(5)}  ${String(worst).padStart(5)}  ${avg.padStart(11)}  ${String(backToBack).padStart(12)}`,
  );
}

console.log('');
console.log(
  anyAboveFloor
    ? '  FAIL: some theme repeated more than the unavoidable floor - picker bug.'
    : '  PASS: every theme sits at the unavoidable floor, with no back-to-back repeats.',
);
console.log('');
process.exit(anyAboveFloor ? 1 : 0);
