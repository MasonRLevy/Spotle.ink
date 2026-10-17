/**
 * Dev-only: downloads the referee test photos from Wikimedia Commons.
 * The images are third-party (CC-licensed) so they are gitignored, not
 * committed — run this once on a fresh clone, then _makeCheatFixture.ts.
 *
 *   npm run test:referee:fixtures   (runs both)
 */
import fs from "node:fs/promises";
import path from "node:path";

const UA = "SpotleOnline-RefereeTests/1.0 (SwampHacks XII project)";
const DIR = path.join(import.meta.dirname, "testdata");

const WANTED: Record<string, string> = {
  hammer: "claw hammer tool",
  sledgehammer: "sledgehammer tool",
  wrench: "adjustable wrench spanner",
  mug: "coffee mug cup",
};

await fs.mkdir(DIR, { recursive: true });

for (const [name, query] of Object.entries(WANTED)) {
  const target = path.join(DIR, `${name}.jpg`);
  try {
    await fs.access(target);
    console.log(`${name}.jpg already present — skipping`);
    continue;
  } catch {
    /* not downloaded yet */
  }

  const api =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json` +
    `&generator=search&gsrsearch=${encodeURIComponent("filetype:bitmap " + query)}` +
    `&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|mime&iiurlwidth=800`;

  const meta = (await (await fetch(api, { headers: { "User-Agent": UA } })).json()) as any;
  const pages: any[] = Object.values(meta?.query?.pages ?? {});
  const hit = pages.find(
    (p) => p.imageinfo?.[0]?.thumburl && /jpeg|png/.test(p.imageinfo[0].mime),
  );
  if (!hit) {
    console.error(`${name}: no Commons match for "${query}"`);
    continue;
  }

  const bytes = Buffer.from(
    await (await fetch(hit.imageinfo[0].thumburl, { headers: { "User-Agent": UA } })).arrayBuffer(),
  );
  await fs.writeFile(target, bytes);
  console.log(`${name}.jpg  ${bytes.length} bytes  <- ${hit.title}`);
}
