/**
 * A/B test: does the generic "a printed picture instead of the real object"
 * cheat risk make the referee reject legitimate photos?
 *
 * Same image, same target, same model - only the cheatRisks list differs.
 * Run several trials because the referee is non-deterministic (temp 0.4).
 *
 *   npx tsx gemini-referee/_abCheatRisks.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(import.meta.dirname, '..', '.env') });

const { verifyObjectPhoto } = await import('./geminiReferee.js');

const FIXTURES = path.resolve(import.meta.dirname, 'testdata');
const image = `data:image/jpeg;base64,${fs.readFileSync(path.join(FIXTURES, 'hammer.jpg')).toString('base64')}`;

/** What convertLegacyItem() attaches to all 133 bridged legacy items. */
const LEGACY_GENERIC = [
  'a picture of the object displayed on a phone or computer screen',
  'a printed picture instead of the real object',
];

/** What the hand-written core items use: specific, screen-focused. */
const SPECIFIC = ['hardware store listing on a monitor'];

const TRIALS = 5;

async function run(label: string, cheatRisks: string[] | undefined) {
  let verified = 0;
  let screenCheat = 0;
  const notes: string[] = [];

  for (let i = 0; i < TRIALS; i += 1) {
    const verdict = await verifyObjectPhoto({
      targetObject: 'Hammer',
      imageBase64: image,
      playerName: 'Mason',
      acceptedVariations: ['claw hammer', 'sledgehammer', 'mallet'],
      cheatRisks,
    });
    if (verdict.verified) verified += 1;
    if (verdict.isScreenCheat) screenCheat += 1;
    notes.push(`${verdict.verified ? 'OK ' : 'NO '}${verdict.isScreenCheat ? '(cheat) ' : ''}${verdict.commentary}`);
  }

  console.log(`\n  ${label}`);
  console.log(`    verified ${verified}/${TRIALS}, flagged as screen cheat ${screenCheat}/${TRIALS}`);
  for (const note of notes) console.log(`      - ${note}`);
  return { verified, screenCheat };
}

console.log('\n  A/B: real hammer photo, identical except for cheatRisks');
console.log(`  ${TRIALS} trials each\n  ${'-'.repeat(60)}`);

const none = await run('no cheatRisks', undefined);
const specific = await run('specific cheat risk (core items)', SPECIFIC);
const legacy = await run('generic legacy cheat risks (bridged items)', LEGACY_GENERIC);

console.log(`\n  ${'-'.repeat(60)}`);
console.log(`  none     : ${none.verified}/${TRIALS} accepted`);
console.log(`  specific : ${specific.verified}/${TRIALS} accepted`);
console.log(`  legacy   : ${legacy.verified}/${TRIALS} accepted  <-- 133 of 145 items use this`);
console.log('');
