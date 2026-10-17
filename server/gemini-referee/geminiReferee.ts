import { GoogleGenAI, Type } from "@google/genai";
import type { ScavengerItem } from "../../shared/game.js";
import type {
  MatchQuality,
  VerificationResponse,
  VerifyObjectPhotoInput,
} from "./types.js";

/**
 * Gemini model chain used by the referee, tried in order.
 *
 * Measured 2026-10-17 against the fixture suite in `_testReferee.ts`:
 *   gemini-3.1-flash-lite  10/10 correct, ~1.5s avg   <- default
 *   gemini-3.8-flash       10/10 correct, ~4.1s avg   <- fallback
 *
 * WHY A CHAIN: billing is now enabled on the project, so quota is no longer the
 * day-to-day constraint — but the chain still covers a model going 404 (as
 * gemini-2.5-flash did), a 503 overload during judging, or a billing lapse. On
 * 429 / 404 / 503 we fall through to the next model instead of failing the round.
 *
 * NOTE: `gemini-2.5-flash` (the original spec model) now 404s with
 * "no longer available to new users" on recently-created keys.
 *
 * Override with GEMINI_MODEL in server/.env — a single model or a
 * comma-separated chain, e.g. GEMINI_MODEL=gemini-3.8-flash,gemini-3.1-flash-lite
 */
export const DEFAULT_MODEL_CHAIN = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
];

export function getModelChain(): string[] {
  const override = process.env.GEMINI_MODEL?.trim();
  if (!override) return [...DEFAULT_MODEL_CHAIN];
  const chain = override.split(",").map((m) => m.trim()).filter(Boolean);
  return chain.length ? chain : [...DEFAULT_MODEL_CHAIN];
}

/**
 * Per-model wall-clock budget. Without this a quota-exhausted model can burn
 * ~30s in SDK-internal 429 backoff before we fall through — measured 68s
 * across a 3-model chain, which would hang a live round.
 */
export const PER_MODEL_TIMEOUT_MS = Number(process.env.REFEREE_MODEL_TIMEOUT_MS) || 9000;

/** Total budget across the whole chain; we stop trying once it is spent. */
export const TOTAL_TIMEOUT_MS = Number(process.env.REFEREE_TOTAL_TIMEOUT_MS) || 20000;

/** Errors worth retrying on the next model in the chain. */
function isFalloverError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("404") ||
    msg.includes("not_found") ||
    msg.includes("no longer available") ||
    msg.includes("503") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded")
  );
}

const MATCH_QUALITIES: MatchQuality[] = [
  "EXACT",
  "CLOSE_ENOUGH",
  "TOO_DIFFERENT",
  "NOT_FOUND",
  "SCREEN_CHEAT",
];

export const GOLDILOCKS_SYSTEM_PROMPT = `You are the official AI Referee for Spotle.online, a live scavenger-hunt game.

Judgment philosophy — COMMON-SENSE SEMANTIC EQUIVALENCE (not too picky, not too loosey-goosey):

PASS (matchQuality EXACT or CLOSE_ENOUGH):
- Count the item if the player shows the target object OR a legitimate physical subtype, variant, or close functional equivalent in the same family.
- Example: target "Hammer" → claw hammer, sledgehammer, ball-peen hammer, or mallet all PASS.
- Example: target "Mug" → ceramic coffee mug, travel tumbler, or teacup all PASS.
- Example: target "Pen" → ballpoint pen, Sharpie marker, or mechanical pencil all PASS.

FAIL (matchQuality TOO_DIFFERENT or NOT_FOUND):
- Reject items that only share a word pun, belong to a completely different tool/object category, or are a stretch.
- Example: target "Hammer" → REJECT a jackhammer, wrench, or screwdriver.
- Example: target "Apple" → REJECT an Apple MacBook, iPhone, or Apple logo (unless the target is specifically a laptop).

STRICT ANTI-CHEAT (screen / monitor / printout detection):
- Inspect the image for signs the player photographed ANOTHER digital screen (phone, laptop, tablet, TV) showing a picture of the object.
- Look for pixel grids, moiré patterns, screen glare, monitor bezels, browser tabs, or cursor icons around the object.
- If a screen cheat is detected you MUST set isScreenCheat true, matchQuality "SCREEN_CHEAT", and verified false.

WITTY REFEREE COMMENTARY:
- Provide a punchy, entertaining 1-sentence verdict (MAX 20 words).
- If CLOSE_ENOUGH, playfully acknowledge the variant (e.g. "That's a sledgehammer, not a standard hammer, but heavy artillery counts!").
- If failed or caught cheating, lightly roast the attempt.

verified must be true ONLY if matchQuality is EXACT or CLOSE_ENOUGH AND isScreenCheat is false.
confidence is an integer from 0 to 100.
detectedObject is what you actually see in the photo.`;

const VERIFICATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    verified: { type: Type.BOOLEAN },
    detectedObject: { type: Type.STRING },
    matchQuality: {
      type: Type.STRING,
      enum: MATCH_QUALITIES,
    },
    confidence: { type: Type.INTEGER },
    isScreenCheat: { type: Type.BOOLEAN },
    commentary: { type: Type.STRING },
  },
  required: [
    "verified",
    "detectedObject",
    "matchQuality",
    "confidence",
    "isScreenCheat",
    "commentary",
  ],
};

export function sanitizeImageBase64(imageBase64: string): {
  data: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
} {
  const raw = imageBase64.trim();
  const dataUrl = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(raw);

  let mimeType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";
  let data = raw;

  if (dataUrl) {
    const declared = dataUrl[1].toLowerCase();
    if (declared === "image/png" || declared === "image/webp" || declared === "image/jpeg") {
      mimeType = declared;
    } else if (declared === "image/jpg") {
      mimeType = "image/jpeg";
    }
    data = dataUrl[2].replace(/\s/g, "");
  } else {
    data = raw.replace(/\s/g, "");
    mimeType = sniffMimeType(data);
  }

  return { data, mimeType };
}

function sniffMimeType(b64: string): "image/jpeg" | "image/png" | "image/webp" {
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("UklGR") || b64.startsWith("UklGRg")) return "image/webp";
  return "image/jpeg";
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing. Add it to server/.env");
  }
  return new GoogleGenAI({ apiKey });
}

function normalizeVerdict(parsed: Partial<VerificationResponse>): VerificationResponse {
  let matchQuality: MatchQuality = MATCH_QUALITIES.includes(
    parsed.matchQuality as MatchQuality,
  )
    ? (parsed.matchQuality as MatchQuality)
    : "NOT_FOUND";

  const isScreenCheat = Boolean(parsed.isScreenCheat) || matchQuality === "SCREEN_CHEAT";
  if (isScreenCheat) matchQuality = "SCREEN_CHEAT";

  const confidence = Math.max(
    0,
    Math.min(100, Math.round(Number(parsed.confidence) || 0)),
  );

  const verified =
    !isScreenCheat &&
    (matchQuality === "EXACT" || matchQuality === "CLOSE_ENOUGH");

  const commentary = String(parsed.commentary ?? "No comment from the booth.")
    .trim()
    .split(/\s+/)
    .slice(0, 20)
    .join(" ");

  return {
    verified,
    detectedObject: String(parsed.detectedObject ?? "unknown").slice(0, 120),
    matchQuality,
    confidence,
    isScreenCheat,
    commentary,
  };
}

export interface VerifyResult {
  verdict: VerificationResponse;
  /** Which model in the chain actually produced the verdict. */
  model: string;
  /** Models that were skipped (quota/unavailable) before one succeeded. */
  skipped: string[];
}

/**
 * Full-detail verification: returns the verdict plus which model served it.
 * The plain `verifyObjectPhoto` wrapper below is what the game server calls.
 */
export async function verifyObjectPhotoDetailed({
  targetObject,
  imageBase64,
  playerName,
  acceptedVariations,
  cheatRisks,
}: VerifyObjectPhotoInput): Promise<VerifyResult> {
  if (!targetObject?.trim()) {
    throw new Error("targetObject is required");
  }
  if (!imageBase64?.trim()) {
    throw new Error("imageBase64 is required");
  }

  const { data, mimeType } = sanitizeImageBase64(imageBase64);
  const who = playerName?.trim() || "Player";
  const ai = getClient();
  const chain = getModelChain();
  const skipped: string[] = [];
  let lastError: unknown;

  const deadline = Date.now() + TOTAL_TIMEOUT_MS;

  for (const model of chain) {
    const remaining = deadline - Date.now();
    if (remaining <= 500) {
      skipped.push(`${model} (no time left in budget)`);
      break;
    }

    const controller = new AbortController();
    const budget = Math.min(PER_MODEL_TIMEOUT_MS, remaining);
    const timer = setTimeout(() => controller.abort(), budget);

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  `Player "${who}" claims they found: "${targetObject.trim()}". Referee this photo now.`,
                  acceptedVariations?.length
                    ? `Accepted physical variations: ${acceptedVariations.join(", ")}.`
                    : "",
                  cheatRisks?.length
                    ? `Item-specific screen/photo cheat risks to check: ${cheatRisks.join(", ")}.`
                    : "",
                ].filter(Boolean).join(" "),
              },
              { inlineData: { mimeType, data } },
            ],
          },
        ],
        config: {
          systemInstruction: GOLDILOCKS_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: VERIFICATION_SCHEMA,
          temperature: 0.4,
          abortSignal: controller.signal,
          // No thinkingConfig on purpose: measured no latency win on
          // flash-lite, and omitting it keeps the call compatible with any
          // model a teammate sets via GEMINI_MODEL.
        },
      });

      const text = response.text;
      if (!text) throw new Error("Gemini returned an empty verification payload");

      let parsed: Partial<VerificationResponse>;
      try {
        parsed = JSON.parse(text) as Partial<VerificationResponse>;
      } catch {
        throw new Error("Gemini returned invalid JSON");
      }

      return { verdict: normalizeVerdict(parsed), model, skipped };
    } catch (error) {
      lastError = error;
      const timedOut = controller.signal.aborted;
      if (!timedOut && !isFalloverError(error)) throw error;
      skipped.push(timedOut ? `${model} (timeout ${budget}ms)` : model);
      console.warn(
        `[gemini-referee] ${model} ${timedOut ? `timed out after ${budget}ms` : "unavailable (quota/404/overload)"} — falling through to next model.`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `All referee models were unavailable (tried: ${chain.join(", ")}). Last error: ${detail}`,
  );
}

export async function verifyObjectPhoto(
  input: VerifyObjectPhotoInput,
): Promise<VerificationResponse> {
  const { verdict } = await verifyObjectPhotoDetailed(input);
  return verdict;
}

export async function verifyObjectHunt(
  item: ScavengerItem,
  capturedFrameBase64: string,
  playerName: string,
): Promise<VerificationResponse> {
  return verifyObjectPhoto({
    targetObject: item.name,
    imageBase64: capturedFrameBase64,
    playerName,
    acceptedVariations: item.aliases,
    cheatRisks: item.cheatRisks,
  });
}

export async function verifyPlayerHunt({
  targetSelfieBase64,
  capturedFrameBase64,
  targetName,
  hunterName,
}: {
  targetSelfieBase64: string;
  capturedFrameBase64: string;
  targetName: string;
  hunterName: string;
}): Promise<VerificationResponse> {
  if (!targetSelfieBase64.trim() || !capturedFrameBase64.trim()) {
    throw new Error('Both the registered selfie and captured frame are required.');
  }

  const targetImage = sanitizeImageBase64(targetSelfieBase64);
  const capturedImage = sanitizeImageBase64(capturedFrameBase64);
  const ai = getClient();
  const chain = getModelChain();
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  let lastError: unknown;

  for (const model of chain) {
    const remaining = deadline - Date.now();
    if (remaining <= 500) break;
    const controller = new AbortController();
    const budget = Math.min(PER_MODEL_TIMEOUT_MS, remaining);
    const timer = setTimeout(() => controller.abort(), budget);

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{
          role: 'user',
          parts: [
            { text: `Compare these two photos. Image 1 is the registered selfie of ${targetName}; image 2 is ${hunterName}'s live camera capture. Verify only if the same person is clearly visible in image 2. Reject a photo of a screen or a different person. In particular, reject a phone or laptop showing a WebRTC video tile; look for bezels, moire, browser UI, reflections, or screen glare. Keep the referee comment to one short sentence.` },
            { text: 'Image 1: registered target selfie.' },
            { inlineData: { mimeType: targetImage.mimeType, data: targetImage.data } },
            { text: 'Image 2: captured hunt frame.' },
            { inlineData: { mimeType: capturedImage.mimeType, data: capturedImage.data } },
          ],
        }],
        config: {
          systemInstruction: 'You are Spotle.online\'s Hide & Seek referee. Compare facial features and distinguishing characteristics; clothing and surroundings alone are not identity evidence. Reject any photograph of an in-app WebRTC tile on a phone, laptop, or monitor, including visible bezels, moire, browser UI, reflections, or screen glare. Return strict JSON matching the verification schema.',
          responseMimeType: 'application/json',
          responseSchema: VERIFICATION_SCHEMA,
          temperature: 0.2,
          abortSignal: controller.signal,
        },
      });
      if (!response.text) throw new Error('Gemini returned an empty verification payload');
      return normalizeVerdict(JSON.parse(response.text) as Partial<VerificationResponse>);
    } catch (error) {
      lastError = error;
      if (!controller.signal.aborted && !isFalloverError(error)) throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'time budget exhausted');
  throw new Error(`Player verification failed across the model chain. Last error: ${detail}`);
}

export function verifyHideAndSeekTag(
  hiderSelfieBase64: string,
  capturedFrameBase64: string,
  hiderName: string,
  seekerName: string,
): Promise<VerificationResponse> {
  return verifyPlayerHunt({
    targetSelfieBase64: hiderSelfieBase64,
    capturedFrameBase64,
    targetName: hiderName,
    hunterName: seekerName,
  });
}

export async function checkGeminiApiKey(): Promise<{
  ok: boolean;
  message: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      message:
        "[gemini-referee] GEMINI_API_KEY is missing. Copy server/.env.example to server/.env and add your key.",
    };
  }

  if (apiKey === "your_gemini_api_key_here") {
    return {
      ok: false,
      message:
        "[gemini-referee] GEMINI_API_KEY is still the placeholder from .env.example. Replace it with a real key.",
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const chain = getModelChain();
  const skipped: string[] = [];
  let lastError: unknown;

  for (const model of chain) {
    try {
      const ping = await ai.models.generateContent({
        model,
        contents: "Reply with the single word PONG.",
      });
      const reply = ping.text?.trim() ?? "";
      if (!reply) throw new Error(`${model} returned an empty response`);
      const note = skipped.length
        ? ` (skipped unavailable: ${skipped.join(", ")})`
        : "";
      return {
        ok: true,
        message: `[gemini-referee] GEMINI_API_KEY valid. Serving model: ${model}${note}`,
      };
    } catch (error) {
      lastError = error;
      skipped.push(model);
      if (!isFalloverError(error)) break;
    }
  }

  {
    const error = lastError;
    const detail = error instanceof Error ? error.message : String(error);
    const lower = detail.toLowerCase();
    let hint =
      "[gemini-referee] GEMINI_API_KEY was rejected or the request failed.";
    if (lower.includes("api key") || lower.includes("permission") || lower.includes("401") || lower.includes("403")) {
      hint =
        "[gemini-referee] GEMINI_API_KEY format/credentials were rejected. Create a new key at https://aistudio.google.com/apikey and put it in server/.env as GEMINI_API_KEY=...";
    } else if (lower.includes("quota") || lower.includes("429") || lower.includes("resource_exhausted")) {
      hint =
        `[gemini-referee] Every model in the chain (${chain.join(", ")}) is out of free-tier quota. The Gemini free tier allows only ~20 requests/day per model — enable billing or wait for the daily reset before the demo.`;
    } else if (lower.includes("not found") || lower.includes("404")) {
      hint =
        `[gemini-referee] No model in the chain (${chain.join(", ")}) was callable with this key. Set GEMINI_MODEL in server/.env to a model your key can call.`;
    }
    return { ok: false, message: `${hint}\n  Details: ${detail}` };
  }
}
