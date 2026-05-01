import type { IncomingMessage, ServerResponse } from 'node:http';

type VercelRequest = IncomingMessage & {
  body?: unknown;
  method?: string;
};

const EDGE_TTS_TEXT_LIMIT = 5000;
const EDGE_TTS_BODY_LIMIT_BYTES = 64 * 1024;
const EDGE_TTS_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const EDGE_TTS_RATE_LIMIT_MAX_REQUESTS = 20;
const DEFAULT_EDGE_VOICE = 'en-US-AvaMultilingualNeural';
const DEFAULT_EDGE_TTS_SYNTHESIS_TIMEOUT_MS = 25000;

const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8'
};

class EdgeTTSInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EdgeTTSInputError';
  }
}

class EdgeTTSTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Edge TTS 请求超时 (${Math.round(timeoutMs / 1000)} 秒)，部署环境可能无法连接 Edge Read Aloud WebSocket，请切换浏览器本地/Azure/SiliconFlow 语音`);
    this.name = 'EdgeTTSTimeoutError';
  }
}

class EdgeTTSBodyTooLargeError extends Error {
  constructor() {
    super(`Edge TTS 请求体不能超过 ${Math.round(EDGE_TTS_BODY_LIMIT_BYTES / 1024)}KB`);
    this.name = 'EdgeTTSBodyTooLargeError';
  }
}

class EdgeTTSForbiddenError extends Error {
  constructor() {
    super('Edge TTS 请求来源无效');
    this.name = 'EdgeTTSForbiddenError';
  }
}

class EdgeTTSRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('Edge TTS 请求过于频繁，请稍后再试');
    this.name = 'EdgeTTSRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface EdgeTTSRequest {
  text?: unknown;
  voice?: unknown;
  speed?: unknown;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const writeJson = (res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}) => {
  res.statusCode = status;
  for (const [key, value] of Object.entries({ ...jsonHeaders, ...extraHeaders })) {
    res.setHeader(key, value);
  }
  res.end(JSON.stringify(body));
};

const readRawBody = async (req: IncomingMessage): Promise<string> => {
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
  return Buffer.concat(chunks).toString('utf8');
};

const parseJson = (raw: string): unknown => {
  return raw ? JSON.parse(raw) : {};
};

const readPayload = async (req: VercelRequest): Promise<unknown> => {
  if (req.body !== undefined) {
    const serializedBody =
      Buffer.isBuffer(req.body) || typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body) ?? '';
    const bodySize = Buffer.byteLength(serializedBody);
    if (bodySize > EDGE_TTS_BODY_LIMIT_BYTES) {
      throw new EdgeTTSBodyTooLargeError();
    }

    if (Buffer.isBuffer(req.body)) return parseJson(req.body.toString('utf8'));
    if (typeof req.body === 'string') return parseJson(req.body);
    return req.body;
  }

  return parseJson(await readRawBody(req));
};

const getEdgeTTSTimeoutMs = (): number => {
  const configured = Number(process.env.EDGE_TTS_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_EDGE_TTS_SYNTHESIS_TIMEOUT_MS;
  return Math.min(45000, Math.max(5000, configured));
};

const normalizeSpeed = (speed: unknown): number => {
  const value = typeof speed === 'number' ? speed : Number(speed);
  if (!Number.isFinite(value)) return 1;
  return Math.min(2, Math.max(0.5, value));
};

const toRate = (speed: number): string => {
  const percentage = Math.round((speed - 1) * 100);
  return `${percentage >= 0 ? '+' : ''}${percentage}%`;
};

const normalizeVoice = (voice: unknown): string => {
  if (typeof voice !== 'string' || !voice.trim()) return DEFAULT_EDGE_VOICE;
  const value = voice.trim();
  if (!/^[a-z]{2}-[A-Z]{2}-[A-Za-z0-9]+(?:Multilingual)?Neural$/.test(value)) {
    throw new EdgeTTSInputError('Edge 音色格式无效');
  }
  return value;
};

const normalizeText = (text: unknown): string => {
  if (typeof text !== 'string') throw new EdgeTTSInputError('缺少朗读文本');
  const value = text.trim();
  if (!value) throw new EdgeTTSInputError('缺少朗读文本');
  if (value.length > EDGE_TTS_TEXT_LIMIT) {
    throw new EdgeTTSInputError(`Edge 免费云端单次最多 ${EDGE_TTS_TEXT_LIMIT} 字，请选中较短片段或开启跟读模式`);
  }
  return value;
};

const headerValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
};

const requestHost = (req: IncomingMessage): string => {
  const forwardedHost = headerValue(req.headers['x-forwarded-host']);
  return forwardedHost || headerValue(req.headers.host);
};

const configuredAllowedOrigins = (): string[] => {
  return (process.env.EDGE_TTS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
};

const assertAllowedOrigin = (req: IncomingMessage) => {
  const origin = headerValue(req.headers.origin);

  if (!origin) {
    const fetchSite = headerValue(req.headers['sec-fetch-site']);
    if (fetchSite === 'same-origin' || fetchSite === 'same-site') return;

    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      throw new EdgeTTSForbiddenError();
    }
    return;
  }

  const allowedOrigins = configuredAllowedOrigins();
  if (allowedOrigins.includes(origin)) return;

  try {
    const originUrl = new URL(origin);
    if (originUrl.host === requestHost(req)) return;
  } catch {
    throw new EdgeTTSForbiddenError();
  }

  throw new EdgeTTSForbiddenError();
};

const clientIp = (req: IncomingMessage): string => {
  const forwardedFor = headerValue(req.headers['x-forwarded-for']);
  return forwardedFor.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
};

const assertRateLimit = (req: IncomingMessage) => {
  const now = Date.now();
  const key = clientIp(req);
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + EDGE_TTS_RATE_LIMIT_WINDOW_MS
    });
    return;
  }

  if (current.count >= EDGE_TTS_RATE_LIMIT_MAX_REQUESTS) {
    throw new EdgeTTSRateLimitError(Math.ceil((current.resetAt - now) / 1000));
  }

  current.count += 1;

  for (const [storeKey, entry] of rateLimitStore) {
    if (entry.resetAt <= now) rateLimitStore.delete(storeKey);
  }
};

const synthesizeEdgeSpeech = async (payload: EdgeTTSRequest): Promise<Buffer> => {
  const timeoutMs = getEdgeTTSTimeoutMs();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new EdgeTTSTimeoutError(timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([synthesizeEdgeSpeechUnsafe(payload), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const synthesizeEdgeSpeechUnsafe = async (payload: EdgeTTSRequest): Promise<Buffer> => {
  const text = normalizeText(payload.text);
  const voice = normalizeVoice(payload.voice);
  const speed = normalizeSpeed(payload.speed);
  const { Communicate } = await import('edge-tts-universal');
  const communicate = new Communicate(text, {
    voice,
    rate: toRate(speed),
    connectionTimeout: Math.min(15000, getEdgeTTSTimeoutMs())
  });

  const buffers: Buffer[] = [];
  for await (const chunk of communicate.stream()) {
    if (chunk.type === 'audio' && chunk.data) {
      buffers.push(Buffer.from(chunk.data));
    }
  }

  if (buffers.length === 0) {
    throw new Error('Edge TTS 没有返回音频');
  }

  return Buffer.concat(buffers);
};

const getErrorStatus = (error: unknown): number => {
  if (error instanceof SyntaxError || error instanceof EdgeTTSInputError) return 400;
  if (error instanceof EdgeTTSBodyTooLargeError) return 413;
  if (error instanceof EdgeTTSForbiddenError) return 403;
  if (error instanceof EdgeTTSRateLimitError) return 429;
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
    assertAllowedOrigin(req);
    assertRateLimit(req);
    const payload = await readPayload(req);
    const audio = await synthesizeEdgeSpeech(payload && typeof payload === 'object' ? payload : {});

    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.end(audio);
  } catch (error) {
    const status = getErrorStatus(error);
    logSynthesisError(error, status);
    const headers =
      error instanceof EdgeTTSRateLimitError
        ? { 'Retry-After': String(error.retryAfterSeconds) }
        : {};
    writeJson(res, status, errorBody(error), headers);
  }
}
