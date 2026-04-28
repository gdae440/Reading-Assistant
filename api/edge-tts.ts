import { EdgeTTSInputError, synthesizeEdgeSpeech } from '../server/edgeTTS';
import type { IncomingMessage, ServerResponse } from 'node:http';

type EdgeTTSRequest = IncomingMessage & {
  body?: unknown;
  method?: string;
};

type EdgeTTSResponse = ServerResponse;

const sendJson = (
  response: EdgeTTSResponse,
  body: unknown,
  status: number,
  headers: Record<string, string> = {}
) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(headers)) {
    response.setHeader(key, value);
  }
  response.end(JSON.stringify(body));
};

const readPayload = async (request: EdgeTTSRequest): Promise<unknown> => {
  if (request.body !== undefined) {
    return typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

export default async function handler(request: EdgeTTSRequest, response: EdgeTTSResponse) {
  if (request.method !== 'POST') {
    sendJson(response, { error: 'Method Not Allowed' }, 405, { Allow: 'POST' });
    return;
  }

  try {
    const payload = await readPayload(request);
    const audio = await synthesizeEdgeSpeech(payload && typeof payload === 'object' ? payload : {});

    response.statusCode = 200;
    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader('Cache-Control', 'no-store');
    response.end(audio);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Edge TTS 请求失败';
    const status = error instanceof SyntaxError || error instanceof EdgeTTSInputError ? 400 : 502;

    console.error('[EdgeTTS] synthesis failed', {
      status,
      message,
      stack: error instanceof Error ? error.stack : undefined
    });

    sendJson(response, { error: message }, status);
  }
}
