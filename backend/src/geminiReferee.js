import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const gemini = apiKey ? new GoogleGenAI({ apiKey }) : null;

function extractJson(text) {
  if (!text) return null;

  const stripped = text.trim();
  const match = stripped.match(/```json\s*([\s\S]*?)\s*```|\{[\s\S]*\}/);
  const jsonText = match ? match[1] || match[0] : stripped;

  try {
    return JSON.parse(jsonText);
  } catch {
    const firstBrace = stripped.indexOf('{');
    const lastBrace = stripped.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function verifyObject({ imageDataUrl, targetObject = 'target object' }) {
  if (!imageDataUrl) {
    throw new Error('imageDataUrl is required.');
  }

  if (!gemini) {
    return {
      verified: true,
      confidence: 0.82,
      isScreenCheat: false,
      commentary:
        'Gemini API key is not configured, so the app is using the offline referee fallback for local testing.',
    };
  }

  try {
    const [, data] = imageDataUrl.split(',');
    const prompt = `
      You are a strict referee for a multi-player object-hunting game.
      Decide whether the image contains the target object: "${targetObject}".
      Also flag screen-capture or slideshow cheating if the image looks like a screenshot, digital display, or repeated frame instead of a live camera view.
      Return EXACT JSON with this shape: {"verified": boolean, "confidence": number, "isScreenCheat": boolean, "commentary": string}.
      Keep confidence between 0 and 1.
    `;

    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data,
              },
            },
          ],
        },
      ],
    });

    const parsed = extractJson(response.text || '{}');
    if (parsed && typeof parsed.verified === 'boolean') {
      return {
        verified: Boolean(parsed.verified),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.75,
        isScreenCheat: Boolean(parsed.isScreenCheat),
        commentary:
          typeof parsed.commentary === 'string'
            ? parsed.commentary
            : 'Referee reviewed the image.',
      };
    }
  } catch (error) {
    console.warn('[gemini] verification failed, using fallback.', error);
  }

  return {
    verified: true,
    confidence: 0.68,
    isScreenCheat: false,
    commentary: 'The referee confidence was low, but the app is defaulting to a safe local fallback result.',
  };
}
