import { GoogleGenAI, Type } from '@google/genai';

// Lazy client singleton
let geminiClient: GoogleGenAI | null = null;

// Safe API Key extraction and sanitization helper
function getCleanApiKey(): string {
  const rawKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY;

  if (!rawKey) return '';

  let key = String(rawKey).trim();
  // Strip surrounding quotes
  while (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  // Strip accidental key name prefix if pasted into Vercel value field
  if (key.startsWith('GEMINI_API_KEY=')) {
    key = key.substring('GEMINI_API_KEY='.length).trim();
    while (
      (key.startsWith('"') && key.endsWith('"')) ||
      (key.startsWith("'") && key.endsWith("'"))
    ) {
      key = key.slice(1, -1).trim();
    }
  }
  return key;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = getCleanApiKey();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is missing on the server. Please verify GEMINI_API_KEY in Vercel Project Settings -> Environment Variables and redeploy.'
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

// Function tools for Gemini assistant
const getChapterContentDeclaration = {
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

const proposeManuscriptEditDeclaration = {
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

const proposeCreateChapterDeclaration = {
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

const SYSTEM_INSTRUCTION = `You are the MYNOOK Master Literary Assistant, an intelligent, empathetic, and craft-conscious book-writing co-creator embedded within the MYNOOK book studio.

Your role:
1. Deeply understand the author's manuscript, narrative arc, tone, character voices, world-building, and thematic resonance.
2. Provide constructive, literary-grade critique, prose refinement, narrative pacing improvements, sensory immersion, and scene development.
3. Respect the author's unique voice and artistic agency. Never overwrite their style with generic cliches.
4. When editing text or proposing revisions, provide compelling rationales based on storytelling craft, pacing, dramatic irony, or sensory detail.
5. You have access to tool functions to interact with the manuscript:
   - "get_chapter_content": Retrieve another chapter's full text when needed for cross-chapter continuity or character arc consistency.
   - "propose_manuscript_edit": Propose precise text replacements so the author can review and apply them directly with a visual diff.
   - "propose_create_chapter": Suggest adding a new chapter with an outline or starting draft.
6. Important guidelines:
   - When asked to write, continue, or rewrite prose, write evocative, polished literary text.
   - Keep answers focused, insightful, and formatted with clean Markdown for readability.
   - All proposed edits must be explicit and non-destructive.`;

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
    const {
      messages = [],
      bookContext = {},
      action,
      stream = true,
      chapterLookup = {},
    } = body;

    console.log(
      `[MYNOOK AI] Request started (stream: ${stream}, action: ${action || 'none'}, messages: ${messages?.length || 0})`
    );

    if (!Array.isArray(messages) || messages.length === 0) {
      return sendJsonResponse(res, 400, {
        error: 'Invalid request',
        details: 'Messages array is required and must not be empty.',
      });
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

    // Build contents for Gemini
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

    console.log(`[MYNOOK AI] Gemini request dispatched (candidate models: ${CANDIDATE_MODELS.join(', ')})`);

    // Handle Streaming SSE
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
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
      let lastStreamError: any = null;

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
              console.log(`[MYNOOK AI] Response stream active with model: ${model}`);
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
            console.log(`[MYNOOK AI] Response completed successfully (${fullText.length} chars using ${model})`);
            res.write(`data: ${JSON.stringify({ type: 'done', fullText })}\n\n`);
            res.end();
          }
          streamSucceeded = true;
          break;
        } catch (streamError: any) {
          lastStreamError = streamError;
          console.warn(`[MYNOOK AI] Model ${model} stream failed:`, streamError?.message || streamError);
          if (chunkCount > 0) {
            break;
          }
        }
      }

      if (!streamSucceeded && !isClosed) {
        const errorDetails = lastStreamError?.message || 'Unable to generate response from Gemini API.';
        console.error('[MYNOOK AI] Stream failed across all candidate models:', errorDetails);
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: 'Gemini request failed',
            details: errorDetails,
          })}\n\n`
        );
        res.end();
      }
    } else {
      // Non-streaming fallback
      let response: any = null;
      let modelUsed = '';
      let lastErr: any = null;

      for (const model of CANDIDATE_MODELS) {
        try {
          console.log(`[MYNOOK AI] Attempting non-streaming with model: ${model}`);
          response = await ai.models.generateContent({
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
          modelUsed = model;
          break;
        } catch (err: any) {
          lastErr = err;
          console.warn(`[MYNOOK AI] Non-streaming model ${model} failed:`, err?.message || err);
        }
      }

      if (!response) {
        throw lastErr || new Error('All candidate models failed to generate content.');
      }

      console.log(`[MYNOOK AI] Non-streaming response received using ${modelUsed}`);
      return sendJsonResponse(res, 200, {
        text: response.text || '',
        functionCalls: response.functionCalls || [],
      });
    }
  } catch (error: any) {
    const errorDetails = error?.message || String(error);
    const statusCode = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    console.error('[MYNOOK AI] Error in /api/ai/chat:', errorDetails, 'status:', statusCode);
    return sendJsonResponse(res, statusCode, {
      error: 'Gemini request failed',
      details: errorDetails,
    });
  }
}
