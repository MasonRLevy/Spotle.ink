/**
 * Dev-only fixture generator: synthesizes a realistic "screen cheat" photo —
 * a target object displayed on a monitor, re-photographed off the screen
 * (bezel, moiré scanlines, glare, pixel grid). Used by _testReferee.ts to
 * prove the anti-cheat branch actually fires.
 *
 *   npx tsx gemini-referee/_makeCheatFixture.ts
 */
import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

const DIR = path.join(import.meta.dirname, "testdata");

function makeScreenCheat(srcFile: string, outFile: string) {
  const raw = jpeg.decode(fs.readFileSync(path.join(DIR, srcFile)), { useTArray: true });

  // Canvas = dark room; monitor sits inside with a chunky bezel.
  const W = 900, H = 680;
  const bezel = 46;
  const sx0 = bezel, sy0 = bezel;
  const sw = W - bezel * 2, sh = H - bezel * 2;

  const out = new PNG({ width: W, height: H });
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * W + x) << 2;
    out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = 255;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inScreen = x >= sx0 && x < sx0 + sw && y >= sy0 && y < sy0 + sh;

      if (!inScreen) {
        // Plastic bezel with a soft vertical sheen.
        const sheen = 18 + Math.round(14 * (1 - y / H));
        put(x, y, sheen, sheen, sheen + 3);
        continue;
      }

      // Sample the source photo (letterboxed, nearest-neighbour is fine here).
      const u = (x - sx0) / sw, v = (y - sy0) / sh;
      const scale = Math.min(raw.width / sw, raw.height / sh);
      const srcX = Math.min(raw.width - 1, Math.max(0, Math.round((u - 0.5) * sw * scale + raw.width / 2)));
      const srcY = Math.min(raw.height - 1, Math.max(0, Math.round((v - 0.5) * sh * scale + raw.height / 2)));
      const si = (srcY * raw.width + srcX) << 2;
      let r = raw.data[si], g = raw.data[si + 1], b = raw.data[si + 2];

      // --- screen artifacts ---
      // 1. RGB sub-pixel / pixel-grid structure
      const sub = (x % 3);
      r *= sub === 0 ? 1.06 : 0.95;
      g *= sub === 1 ? 1.06 : 0.95;
      b *= sub === 2 ? 1.06 : 0.95;

      // 2. Horizontal scanlines + moiré beat pattern
      const scan = 1 - 0.14 * (y % 3 === 0 ? 1 : 0);
      const moire = 1 + 0.07 * Math.sin((x * 0.9 + y * 0.55) * Math.PI / 3.7);
      r *= scan * moire; g *= scan * moire; b *= scan * moire;

      // 3. Diagonal specular glare across the glass
      const glare = Math.max(0, 1 - Math.abs((x * 0.6 + y) - H * 0.75) / 240);
      const gl = glare * 62;
      r += gl; g += gl; b += gl + 6;

      put(x, y,
        Math.min(255, Math.max(0, Math.round(r))),
        Math.min(255, Math.max(0, Math.round(g))),
        Math.min(255, Math.max(0, Math.round(b))));
    }
  }

  const target = path.join(DIR, outFile);
  fs.writeFileSync(target, PNG.sync.write(out));
  console.log(`wrote ${outFile} (${fs.statSync(target).size} bytes)`);
}

makeScreenCheat("hammer.jpg", "screencheat_hammer.png");
makeScreenCheat("mug.jpg", "screencheat_mug.png");
