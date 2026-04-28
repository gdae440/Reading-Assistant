import type { IncomingMessage, ServerResponse } from 'node:http';
import { EdgeTTSInputError, EdgeTTSTimeoutError, synthesizeEdgeSpeech } from '../server/edgeTTS';

type VercelRequest = IncomingMessage & {
  body?: unknown;
  method?: string;
};

const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8'
};

const writeJson = (res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}) => {
  res.statusCode = status;
  for (const [key, value] of Object.entries({ ...jsonHeaders, ...extraHeaders })) {
    res.setHeader(key, value);
  }
  res.end(JSON.stringify(body));
};

const readRawBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const parseJson = (raw: string): unknown => {
  return raw ? JSON.parse(raw) : {};
};

const readPayload = async (req: VercelRequest): Promise<unknown> => {
  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) return parseJson(req.body.toString('utf8'));
    if (typeof req.body === 'string') return parseJson(req.body);
    return req.body;
  }

  return parseJson(await readRawBody(req));
};

const getErrorStatus = (error: unknown): number => {
  if (error instanceof SyntaxError || error instanceof EdgeTTSInputError) return 400;
  if (error instanceof EdgeTTSTimeoutError) return 504;
  return 502;
};

const errorBody = (error: unknown): { error: string } => ({
  error: error instanceof Error ? error.message : 'Edge TTS 请求失败'
});

const logSynthesisError = (error: unknown, status: number) => {
  console.error('[EdgeTTS] synthesis failed', {
    status,
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
};

const methodNotAllowed = (res: ServerResponse) => {
  writeJson(res, 405, { error: 'Method Not Allowed' }, { Allow: 'POST' });
};

export default async function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    methodNotAllowed(res);
    return;
  }

  try {
    const payload = await readPayload(req);
    const audio = await synthesizeEdgeSpeech(payload && typeof payload === 'object' ? payload : {});

    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.end(audio);
  } catch (error) {
    const status = getErrorStatus(error);
    logSynthesisError(error, status);
    writeJson(res, status, errorBody(error));
  }
}
