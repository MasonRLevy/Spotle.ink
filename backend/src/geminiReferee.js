/**
 * Spotle.online - AI Referee adapter (Role 4).
 *
 * Mirrors the tested implementation in `server/gemini-referee/geminiReferee.ts`.
 * Kept as plain JS with the SAME `verifyObject({ imageDataUrl, targetObject })`
 * signature so `backend/server.js` needs no changes.
 *
 * Replaces the previous referee, which:
 *   - called `gemini-2.5-flash`, now dead (404 "no longer available to new
 *     users" on generateContent for recently created keys), and
 *   - returned `verified: true` on ANY failure - missing key, parse error,
 *     API outage - which silently rubber-stamped every submission.
 *
 * If you change the judging logic, change it in BOTH files.
 */
import { GoogleGenAI } from '@google/genai';

/** Tried in order; each model has its own quota bucket. */
const DEFAULT_MODEL_CHAIN = [
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
];

const PER_MODEL_TIMEOUT_MS = Number(process.env.REFEREE_MODEL_TIMEOUT_MS) || 9000;
const TOTAL_TIMEOUT_MS = Number(process.env.REFEREE_TOTAL_TIMEOUT_MS) || 20000;

const MATCH_QUALITIES = [
  'EXACT',
  'CLOSE_ENOUGH',
  'TOO_DIFFERENT',
  'NOT_FOUND',
  'SCREEN_CHEAT',
];

function getModelChain() {
  const override = process.env.GEMINI_MODEL && process.env.GEMINI_MODEL.trim();
  if (!override) return [...DEFAULT_MODEL_CHAIN];
  const chain = override.split(',').map((m) => m.trim()).filter(Boolean);
  return chain.length ? chain : [...DEFAULT_MODEL_CHAIN];
}

function isFalloverError(err) {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('404') ||
    msg.includes('not_found') ||
    msg.includes('no longer available') ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded')
  );
}

const GOLDILOCKS_SYSTEM_PROMPT = [
  'You are the official AI Referee for Spotle.online, a live scavenger-hunt game.',
  '',
  'Judgment philosophy - COMMON-SENSE SEMANTIC EQUIVALENCE (not too picky, not too loosey-goosey):',
  '',
  'PASS (matchQuality EXACT or CLOSE_ENOUGH):',
  '- Count the item if the player shows the target object OR a legitimate physical subtype, variant, or close functional equivalent in the same family.',
  '- Example: target "Hammer" -> claw hammer, sledgehammer, ball-peen hammer, or mallet all PASS.',
  '- Example: target "Mug" -> ceramic coffee mug, travel tumbler, or teacup all PASS.',
  '- Example: target "Pen" -> ballpoint pen, Sharpie marker, or mechanical pencil all PASS.',
  '',
  'FAIL (matchQuality TOO_DIFFERENT or NOT_FOUND):',
  '- Reject items that only share a word pun, belong to a completely different tool/object category, or are a stretch.',
  '- Example: target "Hammer" -> REJECT a jackhammer, wrench, or screwdriver.',
  '- Example: target "Apple" -> REJECT an Apple MacBook, iPhone, or Apple logo (unless the target is specifically a laptop).',
  '',
  'STRICT ANTI-CHEAT (screen / monitor / printout detection):',
  '- Inspect the image for signs the player photographed ANOTHER digital screen (phone, laptop, tablet, TV) showing a picture of the object.',
  '- Look for pixel grids, moire patterns, screen glare, monitor bezels, browser tabs, or cursor icons around the object.',
  '- If a screen cheat is detected you MUST set isScreenCheat true, matchQuality "SCREEN_CHEAT", and verified false.',
  '',
  'WITTY REFEREE COMMENTARY:',
  '- Provide a punchy, entertaining 1-sentence verdict (MAX 20 words).',
  '- If CLOSE_ENOUGH, playfully acknowledge the variant.',
  '- If failed or caught cheating, lightly roast the attempt.',
  '',
  'verified must be true ONLY if matchQuality is EXACT or CLOSE_ENOUGH AND isScreenCheat is false.',
  'confidence is an integer from 0 to 100.',
  'detectedObject is what you actually see in the photo.',
].join('\n');

const VERIFICATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    verified: { type: 'BOOLEAN' },
    detectedObject: { type: 'STRING' },
    matchQuality: { type: 'STRING', enum: MATCH_QUALITIES },
    confidence: { type: 'INTEGER' },
    isScreenCheat: { type: 'BOOLEAN' },
    commentary: { type: 'STRING' },
  },
  required: [
    'verified',
    'detectedObject',
    'matchQuality',
    'confidence',
    'isScreenCheat',
    'commentary',
  ],
};

/** Strips any `data:image/...;base64,` prefix and detects the mime type. */
function sanitizeImageBase64(input) {
  const raw = String(input).trim();
  const dataUrl = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(raw);

  if (dataUrl) {
    const declared = dataUrl[1].toLowerCase();
    let mimeType = 'image/jpeg';
    if (declared === 'image/png' || declared === 'image/webp' || declared === 'image/jpeg') {
      mimeType = declared;
    }
    return { data: dataUrl[2].replace(/\s/g, ''), mimeType };
  }

  const data = raw.replace(/\s/g, '');
  if (data.startsWith('iVBOR')) return { data, mimeType: 'image/png' };
  if (data.startsWith('UklGR')) return { data, mimeType: 'image/webp' };
  return { data, mimeType: 'image/jpeg' };
}

/** Server-side truth: never trust the model self-reported `verified` field. */
function normalizeVerdict(parsed) {
  const source = parsed || {};
  let matchQuality = MATCH_QUALITIES.includes(source.matchQuality)
    ? source.matchQuality
    : 'NOT_FOUND';

  const isScreenCheat = Boolean(source.isScreenCheat) || matchQuality === 'SCREEN_CHEAT';
  if (isScreenCheat) matchQuality = 'SCREEN_CHEAT';

  const pct = Math.max(0, Math.min(100, Math.round(Number(source.confidence) || 0)));
  const verified =
    !isScreenCheat && (matchQuality === 'EXACT' || matchQuality === 'CLOSE_ENOUGH');

  const commentary = String(source.commentary || 'No comment from the booth.')
    .trim()
    .split(/\s+/)
    .slice(0, 20)
    .join(' ');

  return {
    verified,
    // 0-1 scale, matching what the existing frontend expects.
    confidence: Number((pct / 100).toFixed(2)),
    confidencePct: pct,
    isScreenCheat,
    detectedObject: String(source.detectedObject || 'unknown').slice(0, 120),
    matchQuality,
    commentary,
  };
}

/**
 * Failure verdict. Deliberately NOT `verified: true` - a broken referee must
 * never award points, otherwise anyone can score by breaking the API call.
 */
function failVerdict(commentary) {
  return {
    verified: false,
    confidence: 0,
    confidencePct: 0,
    isScreenCheat: false,
    detectedObject: 'unknown',
    matchQuality: 'NOT_FOUND',
    commentary,
  };
}

export async function verifyObject({ imageDataUrl, targetObject = 'target object' }) {
  if (!imageDataUrl) {
    throw new Error('imageDataUrl is required.');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[gemini-referee] GEMINI_API_KEY missing - rejecting instead of auto-passing.');
    return failVerdict('Referee is offline (no API key configured), so this one does not count.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const { data, mimeType } = sanitizeImageBase64(imageDataUrl);
  const chain = getModelChain();
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  let lastError;

  for (const model of chain) {
    const remaining = deadline - Date.now();
    if (remaining <= 500) break;

    const controller = new AbortController();
    const budget = Math.min(PER_MODEL_TIMEOUT_MS, remaining);
    const timer = setTimeout(() => controller.abort(), budget);

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text:
                  'A player claims they found: "' +
                  String(targetObject).trim() +
                  '". Referee this photo now.',
              },
              { inlineData: { mimeType, data } },
            ],
          },
        ],
        config: {
          systemInstruction: GOLDILOCKS_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: VERIFICATION_SCHEMA,
          temperature: 0.4,
          abortSignal: controller.signal,
        },
      });

      const text = response.text;
      if (!text) throw new Error('Gemini returned an empty verification payload');
      return normalizeVerdict(JSON.parse(text));
    } catch (error) {
      lastError = error;
      const timedOut = controller.signal.aborted;
      if (!timedOut && !isFalloverError(error)) break;
      console.warn(
        '[gemini-referee] ' +
          model +
          (timedOut ? ' timed out after ' + budget + 'ms' : ' unavailable') +
          ' - trying next model.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  console.warn('[gemini-referee] verification failed:', lastError);
  return failVerdict('The referee could not review that shot in time - try again!');
}
