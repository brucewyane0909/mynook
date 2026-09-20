import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  handleHealthRequest,
  handleAiChatRequest,
  handleTranslateRequest,
} from './api/_lib/gemini';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// API health route
app.get('/api/health', (req, res) => handleHealthRequest(req, res));

// POST /api/ai and /api/ai/chat - Streaming SSE and standard chat endpoint
app.post(['/api/ai', '/api/ai/chat'], (req, res) => handleAiChatRequest(req, res));

// POST /api/ai/translate - Dedicated literary translation endpoint
app.post('/api/ai/translate', (req, res) => handleTranslateRequest(req, res));

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MYNOOK server running on port ${PORT}`);
  });
}

startServer();

