/**
 * Dev-only regression suite for the Gemini referee.
 *   npx tsx gemini-referee/_testReferee.ts            # default model
 *   GEMINI_MODEL=gemini-3.1-flash-lite npx tsx gemini-referee/_testReferee.ts
 *
 * Fixtures live in gemini-referee/testdata (real photos from Wikimedia Commons
 * + synthetic screen-cheat images from _makeCheatFixture.ts).
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(import.meta.dirname, "..", ".env") });

const { verifyObjectPhoto } = await import("./geminiReferee.js");
const DIR = path.join(import.meta.dirname, "testdata");
const b64 = (f: string) => fs.readFileSync(path.join(DIR, f)).toString("base64");

interface Case {
  label: string;
  file: string;
  target: string;
  wantVerified: boolean;
  wantCheat?: boolean;
  dataUrl?: boolean;
}

const CASES: Case[] = [
  { label: "EXACT        claw hammer vs Hammer",      file: "hammer.jpg",              target: "Hammer",     wantVerified: true },
  { label: "CLOSE_ENOUGH sledgehammer vs Hammer",     file: "sledgehammer.jpg",        target: "Hammer",     wantVerified: true },
  { label: "TOO_DIFFERENT wrench vs Hammer",          file: "wrench.jpg",              target: "Hammer",     wantVerified: false },
  { label: "NOT_FOUND    mug vs Hammer",              file: "mug.jpg",                 target: "Hammer",     wantVerified: false },
  { label: "EXACT        mug vs Coffee Mug",          file: "mug.jpg",                 target: "Coffee Mug", wantVerified: true },
  { label: "CLOSE_ENOUGH mug vs Bowl (stretch=fail)", file: "mug.jpg",                 target: "Bowl",       wantVerified: false },
  { label: "dataURL      prefix strip (mug)",         file: "mug.jpg",                 target: "Coffee Mug", wantVerified: true, dataUrl: true },
  { label: "SCREEN_CHEAT hammer on monitor",          file: "screencheat_hammer.png",  target: "Hammer",     wantVerified: false, wantCheat: true },
  { label: "SCREEN_CHEAT mug on monitor",             file: "screencheat_mug.png",     target: "Coffee Mug", wantVerified: false, wantCheat: true },
  { label: "NO FALSE CHEAT real hammer photo",        file: "hammer.jpg",              target: "Hammer",     wantVerified: true, wantCheat: false },
];

const model = process.env.GEMINI_MODEL || "(default)";
console.log(`\n  Spotle referee suite — model: ${model}\n`);

let pass = 0;
const times: number[] = [];

for (const c of CASES) {
  const mime = c.file.endsWith(".png") ? "image/png" : "image/jpeg";
  const img = c.dataUrl ? `data:${mime};base64,${b64(c.file)}` : b64(c.file);
  const t0 = Date.now();
  try {
    const v = await verifyObjectPhoto({ targetObject: c.target, imageBase64: img, playerName: "Mason" });
    const ms = Date.now() - t0;
    times.push(ms);
    const okVerified = v.verified === c.wantVerified;
    const okCheat = c.wantCheat === undefined || v.isScreenCheat === c.wantCheat;
    const ok = okVerified && okCheat;
    if (ok) pass++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.label}  [${ms}ms]`);
    console.log(`        verified=${v.verified} quality=${v.matchQuality} conf=${v.confidence} cheat=${v.isScreenCheat}`);
    console.log(`        saw "${v.detectedObject}" — "${v.commentary}"`);
    if (!ok) console.log(`        EXPECTED verified=${c.wantVerified}${c.wantCheat !== undefined ? ` cheat=${c.wantCheat}` : ""}`);
  } catch (e) {
    console.log(`  ERROR ${c.label}: ${e instanceof Error ? e.message : e}`);
  }
}

const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
console.log(`\n  ${pass}/${CASES.length} passed — avg ${avg}ms\n`);
process.exit(pass === CASES.length ? 0 : 1);
