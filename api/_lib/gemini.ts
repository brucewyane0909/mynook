import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';

// Lazy Gemini client helper
let geminiClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Please check your environment variables.');
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

// CORS helper for Vercel Serverless / local Express
export function setCorsHeaders(res: any) {
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

// Safe JSON response helper
export function sendJsonResponse(res: any, statusCode: number, data: any) {
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

// Request body reader supporting Express pre-parsed bodies, Vercel bodies, or raw node streams
export async function parseRequestBody(req: any): Promise<any> {
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

  // Fallback for raw Node IncomingMessage streams
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: any) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

// Tool declarations for Gemini
export const getChapterContentDeclaration: FunctionDeclaration = {
  name: 'get_chapter_content',
  description: 'Request the content of a specific chapter from the user manuscript to analyze or answer questions.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      chapterNumber: {
        type: Type.NUMBER,
        description: 'The 1-based chapter number to retrieve.',
      },
    },
    required: ['chapterNumber'],
  },
};

export const proposeManuscriptEditDeclaration: FunctionDeclaration = {
  name: 'propose_manuscript_edit',
  description: 'Propose an explicit textual replacement or edit for the author to review and apply with a diff.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      target: {
        type: Type.STRING,
        description: 'Target of the edit: "selection" for selected text, "chapter" for chapter text, or "title" for chapter title.',
      },
      originalText: {
        type: Type.STRING,
        description: 'The original text to be replaced or modified.',
      },
      suggestedText: {
        type: Type.STRING,
        description: 'The proposed replacement text.',
      },
      rationale: {
        type: Type.STRING,
        description: 'Brief 1-sentence literary rationale explaining why this improves the writing.',
      },
    },
    required: ['target', 'suggestedText'],
  },
};

export const proposeCreateChapterDeclaration: FunctionDeclaration = {
  name: 'propose_create_chapter',
  description: 'Propose creating a new chapter in the manuscript with a title and optional starting text.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'The title of the new chapter.',
      },
      initialContent: {
        type: Type.STRING,
        description: 'Initial starting text or outline for the new chapter.',
      },
    },
    required: ['title'],
  },
};

// Candidate models for MYNOOK AI with automatic fallback
export const CANDIDATE_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-flash-lite-latest',
];

export async function generateStreamWithFallback(ai: GoogleGenAI, requestOptions: any) {
  let lastError: any = null;
  for (const model of CANDIDATE_MODELS) {
    try {
      console.log(`[MYNOOK AI] Attempting stream with model: ${model}`);
      const stream = await ai.models.generateContentStream({
        ...requestOptions,
        model,
      });
      return { stream, modelUsed: model };
    } catch (err: any) {
      console.warn(`[MYNOOK AI] Model ${model} stream attempt failed:`, err?.message || err);
      lastError = err;
    }
  }
  throw lastError;
}

export async function generateContentWithFallback(ai: GoogleGenAI, requestOptions: any) {
  let lastError: any = null;
  for (const model of CANDIDATE_MODELS) {
    try {
      console.log(`[MYNOOK AI] Attempting generation with model: ${model}`);
      const result = await ai.models.generateContent({
        ...requestOptions,
        model,
      });
      return { result, modelUsed: model };
    } catch (err: any) {
      console.warn(`[MYNOOK AI] Model ${model} generation attempt failed:`, err?.message || err);
      lastError = err;
    }
  }
  throw lastError;
}

export const SYSTEM_INSTRUCTION = `You are MYNOOK AI, the intelligent, empathetic literary writing assistant and novel editor built inside the MYNOOK book studio.
Your purpose is to help authors write, brainstorm, refine, structure, and polish their books with high literary craftsmanship, sensory depth, emotional resonance, and respect for their unique voice.

GREETING BEHAVIOR:
When greeted with a simple or introductory greeting (such as "Hello", "Hi", "Hey", "Hello there"), respond warmly, politely, and concisely:
"Hello! I'm your MYNOOK writing assistant. How can I help with your book?"

CORE INSTRUCTIONS:
1. Preserve Author Voice: Adapt to the author's genre, tone, and pacing. Enhance and elevate without imposing an artificial style.
2. Targeted Edits & Suggestions:
   - When suggesting rewrites or improvements for text (especially when selectedText is provided), provide expressive, immersive prose.
   - For any concrete textual revision, format your suggestion clearly so the author can inspect and apply it:
     <<<SUGGESTION>>>
     ORIGINAL: [exact original text or excerpt being replaced]
     SUGGESTED: [your proposed new text]
     RATIONALE: [brief 1-sentence literary explanation]
     <<<END_SUGGESTION>>>
   - You can also explain your creative thinking in natural, conversational prose around the block.
3. Quick Actions:
   - "Improve Writing": Polish cadence, vocabulary, and sensory resonance while keeping meaning intact.
   - "Rewrite": Offer an alternative version with elevated tone or specific stylistic nuance.
   - "Continue Writing": Pick up seamlessly from where the passage ends, matching voice and narrative momentum.
   - "Give Ideas": Offer 3-5 distinct, imaginative narrative directions, stakes, or subplots.
   - "Improve Dialogue": Make speech sound natural, punchy, character-distinct, and loaded with subtext.
   - "Summarize": Provide a concise, insightful synopsis of key developments and character arcs.
   - "Analyze Chapter": Evaluate pacing, character motivation, tone, and sensory worldbuilding.
   - "Fix Grammar": Correct mechanics, spelling, and punctuation without altering the author's voice.
   - "Suggest Title": Suggest 5 captivating, genre-appropriate title ideas.
4. Book Awareness:
   - You have access to the book's metadata (title, author, genre), chapter outline, and current chapter content.
   - If the user asks about other chapters or needs data from another part of the book, refer to the provided chapter outline or invoke the get_chapter_content function.
5. Safety & Consent:
   - Never suggest silently deleting or overwriting any chapter or manuscript.
   - All proposed edits must be explicit and non-destructive.`;

// Common handler for /api/health
export async function handleHealthRequest(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status ? res.status(200).end() : res.end();
  }
  return sendJsonResponse(res, 200, {
    status: 'ok',
    geminiConfigured: !!process.env.GEMINI_API_KEY,
  });
}

// Common handler for /api/ai and /api/ai/chat
export async function handleAiChatRequest(req: any, res: any) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status ? res.status(200).end() : res.end();
  }

  if (req.method !== 'POST') {
    return sendJsonResponse(res, 405, { error: 'Method Not Allowed' });
  }

  try {
    const body = await parseRequestBody(req);
    const {
      messages = [],
      bookContext = {},
      action,
      stream = true,
      chapterLookup = {},
    } = body;

    console.log(`[MYNOOK AI] AI request started (stream: ${stream}, action: ${action || 'none'}, messages: ${messages?.length || 0})`);

    if (!Array.isArray(messages) || messages.length === 0) {
      return sendJsonResponse(res, 400, { error: 'Messages array is required.' });
    }

    const ai = getGeminiClient();

    // Construct contextual system prompt incorporating current book status
    let contextBlock = `CURRENT BOOK CONTEXT:\n`;
    if (bookContext.bookTitle) contextBlock += `- Title: "${bookContext.bookTitle}"\n`;
    if (bookContext.bookAuthor) contextBlock += `- Author: "${bookContext.bookAuthor}"\n`;
    if (bookContext.genre) contextBlock += `- Genre: "${bookContext.genre}"\n`;
    if (bookContext.currentChapterTitle) {
      contextBlock += `- Current Chapter: Chapter ${bookContext.currentChapterNumber || 1} ("${bookContext.currentChapterTitle}")\n`;
    }
    if (bookContext.totalChapters) {
      contextBlock += `- Total Chapters: ${bookContext.totalChapters}\n`;
    }

    if (Array.isArray(bookContext.chapterList) && bookContext.chapterList.length > 0) {
      contextBlock += `- Chapters Outline:\n`;
      bookContext.chapterList.forEach((ch: any) => {
        contextBlock += `  * Chapter ${ch.pageNumber}: "${ch.title}"\n`;
      });
    }

    if (bookContext.selectedText) {
      contextBlock += `\nCURRENTLY SELECTED TEXT IN EDITOR:\n"""\n${bookContext.selectedText}\n"""\n`;
    }

    if (bookContext.currentChapterContent) {
      const plainChapterText = bookContext.currentChapterContent
        .replace(/<p><br><\/p>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const truncatedContent =
        plainChapterText.length > 6000
          ? plainChapterText.slice(0, 6000) + '... [remaining chapter content truncated]'
          : plainChapterText;

      contextBlock += `\nCURRENT CHAPTER CONTENT:\n"""\n${truncatedContent}\n"""\n`;
    }

    if (bookContext.requestedChapterContent) {
      contextBlock += `\nREQUESTED CHAPTER CONTENT (Chapter ${bookContext.requestedChapterNumber || ''}):\n"""\n${bookContext.requestedChapterContent}\n"""\n`;
    }

    if (chapterLookup && typeof chapterLookup === 'object') {
      const entries = Object.entries(chapterLookup);
      if (entries.length > 0) {
        contextBlock += `\nOTHER CHAPTERS REFERENCE:\n`;
        for (const [chNum, content] of entries) {
          contextBlock += `--- Chapter ${chNum} ---\n${String(content).slice(0, 3000)}\n`;
        }
      }
    }

    const fullSystemInstruction = `${SYSTEM_INSTRUCTION}\n\n${contextBlock}`;

    // Build contents for Gemini generateContent
    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // If an action was specified, tailor the last user message
    if (action) {
      const actionPrompts: Record<string, string> = {
        improve: bookContext.selectedText
          ? `Please improve this selected excerpt with richer sensory detail, evocative prose, and refined rhythm:\n"${bookContext.selectedText}"`
          : `Please improve the writing and literary cadence of the current chapter.`,
        rewrite: bookContext.selectedText
          ? `Please provide an evocative, literary rewrite of this selected passage:\n"${bookContext.selectedText}"`
          : `Please offer a fresh literary rewrite for the current section.`,
        continue: `Continue writing seamlessly from the end of the current passage, matching the author's voice and momentum.`,
        dialogue: bookContext.selectedText
          ? `Sharpen and refine the dialogue in this selected text so it sounds natural, character-distinct, and layered with subtext:\n"${bookContext.selectedText}"`
          : `Analyze and improve the dialogue in this chapter to make it more natural and emotionally charged.`,
        ideas: `Give me 5 inventive and compelling creative narrative directions, plot twists, or scene developments for this story.`,
        summarize: `Provide a concise, insightful literary summary of the current chapter and its key developments.`,
        analyze: `Provide a comprehensive literary critique of this chapter: pacing, tone, character voice, sensory immersion, and areas to polish.`,
        grammar: bookContext.selectedText
          ? `Check and fix grammar, spelling, punctuation, and awkward phrasing in this selected text without changing my voice:\n"${bookContext.selectedText}"`
          : `Check and fix grammar and mechanics in the current chapter while preserving the author's natural style.`,
        suggest_title: `Suggest 5 captivating, genre-appropriate titles for this book or chapter.`,
      };

      if (actionPrompts[action]) {
        const last = contents[contents.length - 1];
        if (last && last.role === 'user') {
          last.parts = [{ text: actionPrompts[action] }];
        } else {
          contents.push({ role: 'user', parts: [{ text: actionPrompts[action] }] });
        }
      }
    }

    console.log(`[MYNOOK AI] Gemini request started (candidate models: ${CANDIDATE_MODELS.join(', ')})`);

    // Handle Streaming SSE
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }

      let isClosed = false;
      res.on('close', () => {
        if (!res.writableEnded) {
          isClosed = true;
          console.log('[MYNOOK AI] Client disconnected stream connection');
        }
      });

      let fullText = '';
      let streamSucceeded = false;

      for (const model of CANDIDATE_MODELS) {
        if (isClosed) break;
        let chunkCount = 0;

        try {
          console.log(`[MYNOOK AI] Attempting stream with model: ${model}`);
          const streamResponse = await ai.models.generateContentStream({
            contents,
            model,
            config: {
              systemInstruction: fullSystemInstruction,
              temperature: 0.7,
              tools: [
                {
                  functionDeclarations: [
                    getChapterContentDeclaration,
                    proposeManuscriptEditDeclaration,
                    proposeCreateChapterDeclaration,
                  ],
                },
              ],
            },
          });

          for await (const chunk of streamResponse) {
            if (isClosed) break;

            chunkCount++;
            if (chunkCount === 1) {
              console.log(`[MYNOOK AI] Gemini response received (first chunk streamed from ${model})`);
            }

            const chunkText = chunk.text;
            if (chunkText) {
              fullText += chunkText;
              res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunkText })}\n\n`);
            }

            const functionCalls = chunk.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              for (const fc of functionCalls) {
                res.write(
                  `data: ${JSON.stringify({
                    type: 'tool_call',
                    name: fc.name,
                    args: fc.args,
                    id: (fc as any).id,
                  })}\n\n`
                );
              }
            }
          }

          if (!isClosed) {
            console.log(`[MYNOOK AI] Gemini response completed successfully (${fullText.length} chars using ${model})`);
            res.write(`data: ${JSON.stringify({ type: 'done', fullText })}\n\n`);
            res.end();
          }
          streamSucceeded = true;
          break; // successfully finished stream
        } catch (streamError: any) {
          console.warn(`[MYNOOK AI] Stream with model ${model} failed (chunkCount: ${chunkCount}):`, streamError?.message || streamError);
          if (chunkCount > 0) {
            // Already started outputting chunks to client, cannot switch model mid-stream
            break;
          }
          // If no chunks were written yet, continue loop to next candidate model!
        }
      }

      if (!streamSucceeded && !isClosed) {
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: 'Gemini API request failed. Check the server configuration.',
          })}\n\n`
        );
        res.end();
      }
    } else {
      // Non-streaming
      const { result: response, modelUsed } = await generateContentWithFallback(ai, {
        contents,
        config: {
          systemInstruction: fullSystemInstruction,
          temperature: 0.7,
          tools: [
            {
              functionDeclarations: [
                getChapterContentDeclaration,
                proposeManuscriptEditDeclaration,
                proposeCreateChapterDeclaration,
              ],
            },
          ],
        },
      });

      console.log(`[MYNOOK AI] Gemini response received (non-streaming using ${modelUsed})`);
      return sendJsonResponse(res, 200, {
        text: response.text || '',
        functionCalls: response.functionCalls || [],
      });
    }
  } catch (error: any) {
    console.error('[MYNOOK AI] Gemini request failed (endpoint error):', error?.message || error);
    return sendJsonResponse(res, 500, {
      error: 'Gemini API request failed. Check the server configuration.',
    });
  }
}

// Common handler for /api/ai/translate
export async function handleTranslateRequest(req: any, res: any) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status ? res.status(200).end() : res.end();
  }

  if (req.method !== 'POST') {
    return sendJsonResponse(res, 405, { error: 'Method Not Allowed' });
  }

  try {
    const body = await parseRequestBody(req);
    const { text, sourceLang = 'Auto', targetLang = 'English' } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return sendJsonResponse(res, 400, { error: 'Text to translate is required.' });
    }

    const ai = getGeminiClient();
    const prompt = `You are an expert literary translator for the MYNOOK book studio.
Translate the following literary manuscript text from ${sourceLang} to ${targetLang}.
Preserve emotional nuance, tone, metaphor, idioms, and natural rhythm of speech.
Do not add introductory commentary, markdown code fences, or surrounding quotation marks; return ONLY the translated prose.

TEXT TO TRANSLATE:
${text.trim()}`;

    console.log(`[MYNOOK AI] Translation requested: ${sourceLang} -> ${targetLang} (${text.trim().length} chars)`);
    const { result: response, modelUsed } = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        temperature: 0.3,
      },
    });

    console.log(`[MYNOOK AI] Translation completed successfully using ${modelUsed}`);
    return sendJsonResponse(res, 200, {
      translation: (response.text || '').trim(),
      sourceLang,
      targetLang,
    });
  } catch (error: any) {
    console.error('[MYNOOK AI] Translation error:', error?.message || error);
    return sendJsonResponse(res, 500, {
      error: 'Gemini API request failed. Check the server configuration.',
    });
  }
}
