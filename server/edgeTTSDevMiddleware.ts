import type { Connect } from 'vite';
import { synthesizeEdgeSpeech } from './edgeTTS';

const readBody = async (req: Connect.IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

export const createEdgeTTSDevMiddleware = (): Connect.NextHandleFunction => {
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/edge-tts')) {
      next();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    try {
      const payload = await readBody(req);
      const audio = await synthesizeEdgeSpeech(payload && typeof payload === 'object' ? payload : {});
      res.statusCode = 200;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.end(audio);
    } catch (error) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : 'Edge TTS 请求失败'
      }));
    }
  };
};
