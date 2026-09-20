import { GoogleGenAI, Type } from '@google/genai';

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
      'GEMINI_API_KEY is missing on the server. Please configure GEMINI_API_KEY in Vercel Project Settings -> Environment Variables and redeploy.'
    );
  }
  return new GoogleGenAI({ apiKey });
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

// Tool declarations
const getChapterContentDeclaration = {
  name: 'get_chapter_content',
  description: 'Retrieve the written prose content for a specific chapter number in the manuscript.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      chapterNumber: {
        type: Type.NUMBER,
        description: 'The 1-based index of the chapter to read.',
      },
    },
    required: ['chapterNumber'],
  },
};

const getBookStructureDeclaration = {
  name: 'get_book_structure',
  description: 'Retrieve the overall book title, author, genre, total chapter count, and list of chapter titles.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

const searchManuscriptDeclaration = {
  name: 'search_manuscript',
  description: 'Search across all chapters in the manuscript for a specific keyword or character name.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The search term or phrase to locate.',
      },
    },
    required: ['query'],
  },
};

const proposeManuscriptEditDeclaration = {
  name: 'propose_manuscript_edit',
  description: 'Propose a polished, creative edit or replacement for the current selected text or chapter paragraph.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      target: {
        type: Type.STRING,
        description: 'Target of the edit: "selection", "chapter", or "title".',
      },
      originalText: {
        type: Type.STRING,
        description: 'The original excerpt from the manuscript that is being improved.',
      },
      suggestedText: {
        type: Type.STRING,
        description: 'The newly rewritten and improved literary text.',
      },
      rationale: {
        type: Type.STRING,
        description: 'Brief explanation of how this edit strengthens pacing, tone, sensory detail, or dialogue.',
      },
    },
    required: ['target', 'suggestedText'],
  },
};

const proposeCreateChapterDeclaration = {
  name: 'propose_create_chapter',
  description: 'Propose creating a new chapter draft with a title and starting narrative content.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'The title of the new chapter.',
      },
      initialContent: {
        type: Type.STRING,
        description: 'The initial draft prose or outline for this new chapter.',
      },
    },
    required: ['title', 'initialContent'],
  },
};

const ALL_TOOLS = [
  {
    functionDeclarations: [
      getChapterContentDeclaration,
      getBookStructureDeclaration,
      searchManuscriptDeclaration,
      proposeManuscriptEditDeclaration,
      proposeCreateChapterDeclaration,
    ],
  },
];

// Active candidate models with automatic fallback
const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-3.8-flash',
];

const MAX_TOOL_ROUNDS = 8;

const SYSTEM_INSTRUCTION = `You are the MYNOOK Master Literary Assistant, an intelligent, empathetic, and craft-conscious book-writing co-creator embedded within the MYNOOK book studio.

Core Responsibilities:
1. Literary Craft: Assist authors with plotting, pacing, character development, worldbuilding, thematic depth, dialogue, sensory descriptions, and line editing.
2. Context Awareness: You have full access to the author's book metadata, active chapter, selected text, and manuscript chapters via built-in tools.
3. Interactive Suggestions: When suggesting specific text rewrites, you can use the \`propose_manuscript_edit\` tool or standard suggestion blocks.
4. Tone: Professional, encouraging, respectful of authorial voice, and deeply attuned to storytelling craftsmanship.

When requested to give ideas, outline scenes, rewrite passages, or brainstorm, ALWAYS provide rich, creative, and detailed prose. Never return an empty answer.`;

/**
 * Executes a tool call using available book context and manuscript lookup
 */
function executeToolCall(
  fc: { name?: string; args?: any },
  bookContext: any,
  chapterLookup: Record<number, string>
): any {
  const name = fc.name || '';
  const args = fc.args || {};

  if (name === 'get_chapter_content') {
    const chNum = Number(args.chapterNumber) || 1;
    const fromLookup = chapterLookup[chNum];
    const fromContext =
      chNum === bookContext?.currentChapterNumber ? bookContext?.currentChapterContent : null;
    const content = fromLookup || fromContext || '';
    const chInfo = bookContext?.chapterList?.find((c: any) => c.pageNumber === chNum);

    if (content && content.trim()) {
      return {
        chapterNumber: chNum,
        title: chInfo?.title || `Chapter ${chNum}`,
        content: String(content).slice(0, 8000),
      };
    }
    return {
      chapterNumber: chNum,
      title: chInfo?.title || `Chapter ${chNum}`,
      status: 'empty_or_not_found',
      message: `Chapter ${chNum} currently has no text in the manuscript.`,
    };
  }

  if (name === 'get_book_structure') {
    return {
      bookTitle: bookContext?.bookTitle || 'Untitled Book',
      bookAuthor: bookContext?.bookAuthor || 'Unknown Author',
      genre: bookContext?.genre || 'Fiction',
      totalChapters: bookContext?.totalChapters || bookContext?.chapterList?.length || 1,
      chapterList: bookContext?.chapterList || [],
    };
  }

  if (name === 'search_manuscript') {
    const query = String(args.query || '').toLowerCase().trim();
    if (!query) {
      return { query, matches: [] };
    }
    const matches: any[] = [];
    for (const [chNum, text] of Object.entries(chapterLookup)) {
      if (typeof text === 'string' && text.toLowerCase().includes(query)) {
        const idx = text.toLowerCase().indexOf(query);
        matches.push({
          chapterNumber: Number(chNum),
          snippet: text.slice(Math.max(0, idx - 100), Math.min(text.length, idx + 200)),
        });
      }
    }
    return { query, matches };
  }

  if (name === 'propose_manuscript_edit') {
    return {
      status: 'recorded',
      message: 'Revision proposal recorded for the author to review in the studio.',
    };
  }

  if (name === 'propose_create_chapter') {
    return {
      status: 'recorded',
      message: 'New chapter proposal recorded for the author.',
    };
  }

  return { status: 'acknowledged', message: `Tool ${name} executed.` };
}

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

  const rawKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY;

  console.log('[MYNOOK AI] Chat request received. hasGeminiKey:', Boolean(rawKey));

  if (!rawKey || !getCleanApiKey()) {
    console.error('[MYNOOK AI] GEMINI_API_KEY is missing in server environment.');
    return sendJsonResponse(res, 500, {
      error: 'Gemini request failed',
      details:
        'GEMINI_API_KEY is missing on the server. Please verify GEMINI_API_KEY in Vercel Project Settings -> Environment Variables and redeploy.',
    });
  }

  try {
    const body = await parseRequestBody(req);
    const { messages = [], bookContext = {}, action, chapterLookup = {}, stream = true } = body;

    let contextIntro = '';
    if (bookContext.bookTitle) {
      contextIntro += `\n[BOOK CONTEXT: "${bookContext.bookTitle}" by ${bookContext.bookAuthor || 'Author'} (Genre: ${bookContext.genre || 'General'})]`;
    }
    if (bookContext.currentChapterTitle) {
      contextIntro += `\n[CURRENT CHAPTER: "${bookContext.currentChapterTitle}" (Chapter ${bookContext.currentChapterNumber || 1} of ${bookContext.totalChapters || 1})]`;
    }
    if (bookContext.selectedText) {
      contextIntro += `\n[AUTHOR SELECTED TEXT: "${bookContext.selectedText}"]`;
    }
    if (bookContext.currentChapterContent) {
      const excerpt = String(bookContext.currentChapterContent).slice(0, 3000);
      contextIntro += `\n[CURRENT CHAPTER PROSE EXCERPT:\n${excerpt}\n]`;
    }

    let actionInstruction = '';
    if (action === 'improve') {
      actionInstruction = `\n[ACTION: The author wants to IMPROVE the selected passage or current chapter. Provide vivid sensory details, rhythmic cadence, and strong verbs.]`;
    } else if (action === 'rewrite') {
      actionInstruction = `\n[ACTION: The author wants a complete REWRITE of the selected text with alternative phrasing, deeper emotional resonance, and crisp pacing.]`;
    } else if (action === 'continue') {
      actionInstruction = `\n[ACTION: The author wants to CONTINUE writing from where the current chapter leaves off. Maintain the author's tone and natural voice.]`;
    } else if (action === 'ideas') {
      actionInstruction = `\n[ACTION: The author is requesting CREATIVE IDEAS, unexpected plot turns, character conflicts, or atmospheric worldbuilding twists for this story.]`;
    }

    const fullSystemInstruction = `${SYSTEM_INSTRUCTION}${contextIntro}${actionInstruction}`;

    // Format initial conversation contents
    const initialContents: any[] = [];
    for (const msg of messages) {
      const role = msg.role === 'model' || msg.role === 'assistant' ? 'model' : 'user';
      initialContents.push({
        role,
        parts: [{ text: msg.content || '' }],
      });
    }

    if (initialContents.length === 0) {
      initialContents.push({
        role: 'user',
        parts: [{ text: 'Hello! I am working on my book manuscript.' }],
      });
    }

    const ai = getGeminiClient();

    if (stream) {
      if (typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
      }

      let isClosed = false;
      if (req.on) {
        req.on('close', () => {
          isClosed = true;
        });
      }

      let streamSucceeded = false;
      let lastStreamError: any = null;

      for (const model of CANDIDATE_MODELS) {
        if (isClosed) break;

        try {
          console.log(`[MYNOOK AI] Attempting model: ${model}`);
          const runningContents: any[] = JSON.parse(JSON.stringify(initialContents));
          let fullText = '';
          let finalDoneEmitted = false;

          // Multi-turn tool execution loop
          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            if (isClosed) break;

            const resRound = await ai.models.generateContent({
              model,
              contents: runningContents,
              config: {
                systemInstruction: fullSystemInstruction,
                temperature: 0.7,
                tools: ALL_TOOLS,
              },
            });

            const functionCalls = resRound.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              // Append model response containing the function calls
              if (resRound.candidates && resRound.candidates[0]?.content) {
                runningContents.push(resRound.candidates[0].content);
              }

              for (const fc of functionCalls) {
                console.log(`[MYNOOK AI] Executing tool '${fc.name}' on round ${round}:`, fc.args);
                const toolResult = executeToolCall(fc, bookContext, chapterLookup);

                // Notify frontend of the tool call
                res.write(
                  `data: ${JSON.stringify({
                    type: 'tool_call',
                    name: fc.name,
                    args: fc.args,
                    id: (fc as any).id,
                    result: toolResult,
                  })}\n\n`
                );

                // Append functionResponse to conversation with role: 'user'
                runningContents.push({
                  role: 'user',
                  parts: [
                    {
                      functionResponse: {
                        name: fc.name,
                        response: { output: toolResult },
                        id: (fc as any).id,
                      },
                    },
                  ],
                });
              }

              // If model also returned some text in the same round, stream it
              if (resRound.text) {
                fullText += resRound.text;
                res.write(`data: ${JSON.stringify({ type: 'chunk', text: resRound.text })}\n\n`);
              }

              // Continue to next round so Gemini can process the tool results
              continue;
            }

            // No function calls: Gemini produced its final text response!
            const text = resRound.text || '';
            if (text) {
              fullText += text;
              res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
            }

            if (!fullText) {
              fullText = "I've analyzed your manuscript context. How would you like to develop this scene next?";
              res.write(`data: ${JSON.stringify({ type: 'chunk', text: fullText })}\n\n`);
            }

            if (!isClosed) {
              res.write(`data: ${JSON.stringify({ type: 'done', fullText })}\n\n`);
              res.end();
            }
            finalDoneEmitted = true;
            streamSucceeded = true;
            break;
          }

          if (streamSucceeded) {
            console.log(`[MYNOOK AI] Completed successfully (${fullText.length} chars using ${model})`);
            break;
          }
        } catch (streamError: any) {
          lastStreamError = streamError;
          console.warn(`[MYNOOK AI] Model ${model} failed:`, streamError?.message || streamError);
        }
      }

      if (!streamSucceeded && !isClosed) {
        const errorDetails = lastStreamError?.message || 'Unable to generate response from Gemini API.';
        console.error('[MYNOOK AI] Request failed across candidate models:', errorDetails);
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
      let lastNonStreamError: any = null;

      for (const model of CANDIDATE_MODELS) {
        try {
          const runningContents: any[] = JSON.parse(JSON.stringify(initialContents));
          let finalResponseText = '';

          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const resRound = await ai.models.generateContent({
              model,
              contents: runningContents,
              config: {
                systemInstruction: fullSystemInstruction,
                temperature: 0.7,
                tools: ALL_TOOLS,
              },
            });

            if (resRound.functionCalls && resRound.functionCalls.length > 0) {
              if (resRound.candidates && resRound.candidates[0]?.content) {
                runningContents.push(resRound.candidates[0].content);
              }
              for (const fc of resRound.functionCalls) {
                const toolResult = executeToolCall(fc, bookContext, chapterLookup);
                runningContents.push({
                  role: 'user',
                  parts: [
                    {
                      functionResponse: {
                        name: fc.name,
                        response: { output: toolResult },
                        id: (fc as any).id,
                      },
                    },
                  ],
                });
              }
              if (resRound.text) {
                finalResponseText += resRound.text;
              }
              continue;
            }

            finalResponseText += resRound.text || '';
            break;
          }

          response = finalResponseText || "I've reviewed your manuscript context. Let me know what you'd like to work on!";
          break;
        } catch (err: any) {
          lastNonStreamError = err;
        }
      }

      if (!response) {
        throw lastNonStreamError || new Error('All candidate models failed to generate response.');
      }

      return sendJsonResponse(res, 200, {
        response,
        role: 'model',
      });
    }
  } catch (error: any) {
    const errorDetails = error?.message || String(error);
    const statusCode = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    console.error('[MYNOOK AI] Handler error:', errorDetails);
    return sendJsonResponse(res, statusCode, {
      error: 'Gemini request failed',
      details: errorDetails,
    });
  }
}
