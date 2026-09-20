import { GoogleGenAI } from '@google/genai';

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const rawKey = process.env.GEMINI_API_KEY;
  const apiKey = rawKey ? rawKey.replace(/^["']|["']$/g, '').trim() : '';
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured in environment variables. Please verify GEMINI_API_KEY in Vercel Project Settings -> Environment Variables.'
    );
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

function setCorsHeaders(res: any) {
  if (typeof res.setHeader === 'function') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );
  }
}

function sendJsonResponse(res: any, statusCode: number, data: any) {
  setCorsHeaders(res);
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json');
  }
  res.end(JSON.stringify(data));
}

async function parseRequestBody(req: any): Promise<any> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    if (Buffer.isBuffer(req.body)) {
      try {
        return JSON.parse(req.body.toString('utf-8'));
      } catch {
        return {};
      }
    }
    return req.body;
  }

  if (req.readableEnded || (req.complete && !req.readable)) {
    return {};
  }

  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => resolve({}), 2000);
    req.on('data', (chunk: any) => {
      data += chunk;
    });
    req.on('end', () => {
      clearTimeout(timer);
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => {
      clearTimeout(timer);
      resolve({});
    });
  });
}

const CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-flash-lite-latest',
];

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status ? res.status(200).end() : res.end();
  }

  if (req.method !== 'POST') {
    return sendJsonResponse(res, 405, {
      error: 'Method Not Allowed',
      details: `Expected POST, received ${req.method}`,
    });
  }

  try {
    const body = await parseRequestBody(req);
    const { text, sourceLang = 'Auto', targetLang = 'English' } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return sendJsonResponse(res, 400, {
        error: 'Invalid request',
        details: 'Text to translate is required.',
      });
    }

    const ai = getGeminiClient();
    const prompt = `You are an expert literary translator for the MYNOOK book studio.
Translate the following literary manuscript text from ${sourceLang} to ${targetLang}.
Preserve emotional nuance, tone, metaphor, idioms, and natural rhythm of speech.
Do not add introductory commentary, markdown code fences, or surrounding quotation marks; return ONLY the translated prose.

TEXT TO TRANSLATE:
${text.trim()}`;

    console.log(`[MYNOOK AI] Translation requested: ${sourceLang} -> ${targetLang} (${text.trim().length} chars)`);

    let response: any = null;
    let modelUsed = '';
    let lastErr: any = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        console.log(`[MYNOOK AI] Attempting translation with model: ${model}`);
        response = await ai.models.generateContent({
          contents: prompt,
          model,
          config: {
            temperature: 0.3,
          },
        });
        modelUsed = model;
        break;
      } catch (err: any) {
        lastErr = err;
        console.warn(`[MYNOOK AI] Translation with model ${model} failed:`, err?.message || err);
      }
    }

    if (!response) {
      throw lastErr || new Error('All candidate models failed to generate translation.');
    }

    console.log(`[MYNOOK AI] Translation completed successfully using ${modelUsed}`);
    return sendJsonResponse(res, 200, {
      translation: (response.text || '').trim(),
      sourceLang,
      targetLang,
    });
  } catch (error: any) {
    const errorDetails = error?.message || String(error);
    const statusCode = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    console.error('[MYNOOK AI] Translation error:', errorDetails, 'status:', statusCode);
    return sendJsonResponse(res, statusCode, {
      error: 'Gemini translation failed',
      details: errorDetails,
    });
  }
}
