import type { Connect } from 'vite';
import { EDGE_TTS_BODY_LIMIT_BYTES, synthesizeEdgeSpeech } from './edgeTTS';

class EdgeTTSBodyTooLargeError extends Error {
  constructor() {
    super(`Edge TTS 请求体不能超过 ${Math.round(EDGE_TTS_BODY_LIMIT_BYTES / 1024)}KB`);
    this.name = 'EdgeTTSBodyTooLargeError';
  }
}

const readBody = async (req: Connect.IncomingMessage): Promise<unknown> => {
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > EDGE_TTS_BODY_LIMIT_BYTES) {
    throw new EdgeTTSBodyTooLargeError();
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > EDGE_TTS_BODY_LIMIT_BYTES) {
      throw new EdgeTTSBodyTooLargeError();
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const errorStatus = (error: unknown): number => {
  if (error instanceof SyntaxError) return 400;
  if (error instanceof EdgeTTSBodyTooLargeError) return 413;
  if (error instanceof Error && error.name === 'EdgeTTSInputError') return 400;
  if (error instanceof Error && error.name === 'EdgeTTSTimeoutError') return 504;
  return 502;
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
      res.statusCode = errorStatus(error);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : 'Edge TTS 请求失败'
      }));
    }
  };
};
