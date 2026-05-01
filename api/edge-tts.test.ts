import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './edge-tts';

type TestRequest = Readable & {
  body?: unknown;
  method?: string;
  headers: IncomingMessage['headers'];
  socket: IncomingMessage['socket'];
};

interface RequestOptions {
  body?: unknown;
  rawBody?: string;
  headers?: IncomingMessage['headers'];
  ip?: string;
  method?: string;
}

interface CapturedResponse {
  statusCode: number;
  headers: Record<string, string | number | readonly string[]>;
  text: string;
  setHeader: ServerResponse['setHeader'];
  end: ServerResponse['end'];
}

const originalEnv = {
  EDGE_TTS_ALLOWED_ORIGINS: process.env.EDGE_TTS_ALLOWED_ORIGINS,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL
};

const restoreEnvValue = (key: keyof typeof originalEnv) => {
  const value = originalEnv[key];
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
};

const makeRequest = ({
  body = { text: '' },
  rawBody,
  headers,
  ip = '203.0.113.1',
  method = 'POST'
}: RequestOptions = {}): TestRequest => {
  const serialized = rawBody ?? JSON.stringify(body);
  const request = Readable.from([serialized]) as TestRequest;
  request.method = method;
  request.headers = {
    host: 'localhost:3000',
    origin: 'http://localhost:3000',
    ...headers
  };
  request.socket = {
    remoteAddress: ip
  } as IncomingMessage['socket'];
  return request;
};

const makeResponse = (): CapturedResponse => {
  const response: CapturedResponse = {
    statusCode: 200,
    headers: {},
    text: '',
    setHeader(name, value) {
      response.headers[String(name).toLowerCase()] = value;
      return response as unknown as ServerResponse;
    },
    end(chunk?: unknown) {
      if (Buffer.isBuffer(chunk)) {
        response.text = chunk.toString('utf8');
      } else if (chunk !== undefined) {
        response.text = String(chunk);
      }
      return response as unknown as ServerResponse;
    }
  };
  return response;
};

const callHandler = async (request: TestRequest): Promise<CapturedResponse> => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const response = makeResponse();
  await handler(request as unknown as Parameters<typeof handler>[0], response as unknown as ServerResponse);
  return response;
};

const parseJson = (response: CapturedResponse): { error?: string } => JSON.parse(response.text);

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnvValue('EDGE_TTS_ALLOWED_ORIGINS');
  restoreEnvValue('NODE_ENV');
  restoreEnvValue('VERCEL');
});

describe('Edge TTS API handler', () => {
  it('rejects non-POST requests', async () => {
    const response = await callHandler(makeRequest({ method: 'GET', ip: '203.0.113.10' }));

    expect(response.statusCode).toBe(405);
    expect(response.headers.allow).toBe('POST');
    expect(parseJson(response).error).toBe('Method Not Allowed');
  });

  it('rejects missing origins in Vercel production requests', async () => {
    process.env.VERCEL = '1';
    const response = await callHandler(
      makeRequest({
        headers: {
          host: 'example.com',
          origin: undefined
        },
        ip: '203.0.113.11'
      })
    );

    expect(response.statusCode).toBe(403);
    expect(parseJson(response).error).toBe('Edge TTS 请求来源无效');
  });

  it('rejects cross-site origins that do not match the request host', async () => {
    process.env.VERCEL = '1';
    const response = await callHandler(
      makeRequest({
        headers: {
          host: 'reader.example.com',
          origin: 'https://evil.example.com'
        },
        ip: '203.0.113.12'
      })
    );

    expect(response.statusCode).toBe(403);
    expect(parseJson(response).error).toBe('Edge TTS 请求来源无效');
  });

  it('allows explicitly configured origins before validating the payload', async () => {
    process.env.VERCEL = '1';
    process.env.EDGE_TTS_ALLOWED_ORIGINS = 'https://reader.example.com';
    const response = await callHandler(
      makeRequest({
        body: { text: '' },
        headers: {
          host: 'api.example.com',
          origin: 'https://reader.example.com'
        },
        ip: '203.0.113.13'
      })
    );

    expect(response.statusCode).toBe(400);
    expect(parseJson(response).error).toBe('缺少朗读文本');
  });

  it('rejects bodies larger than the configured limit from content-length', async () => {
    const response = await callHandler(
      makeRequest({
        body: { text: 'hello' },
        headers: {
          'content-length': String(65 * 1024)
        },
        ip: '203.0.113.14'
      })
    );

    expect(response.statusCode).toBe(413);
    expect(parseJson(response).error).toBe('Edge TTS 请求体不能超过 64KB');
  });

  it('rejects invalid JSON payloads', async () => {
    const response = await callHandler(
      makeRequest({
        rawBody: '{"text":',
        ip: '203.0.113.15'
      })
    );

    expect(response.statusCode).toBe(400);
    expect(parseJson(response).error).toMatch(/JSON/);
  });

  it('rejects empty text input', async () => {
    const response = await callHandler(
      makeRequest({
        body: { text: '   ' },
        ip: '203.0.113.16'
      })
    );

    expect(response.statusCode).toBe(400);
    expect(parseJson(response).error).toBe('缺少朗读文本');
  });

  it('rejects text input above the Edge free cloud limit', async () => {
    const response = await callHandler(
      makeRequest({
        body: { text: 'a'.repeat(5001) },
        ip: '203.0.113.17'
      })
    );

    expect(response.statusCode).toBe(400);
    expect(parseJson(response).error).toContain('Edge 免费云端单次最多 5000 字');
  });

  it('rejects invalid voice names before calling the upstream Edge TTS package', async () => {
    const response = await callHandler(
      makeRequest({
        body: {
          text: 'hello',
          voice: '../bad'
        },
        ip: '203.0.113.18'
      })
    );

    expect(response.statusCode).toBe(400);
    expect(parseJson(response).error).toBe('Edge 音色格式无效');
  });

  it('rate limits repeated requests from the same client IP', async () => {
    for (let index = 0; index < 20; index += 1) {
      const response = await callHandler(
        makeRequest({
          body: { text: '' },
          ip: '203.0.113.200'
        })
      );
      expect(response.statusCode).toBe(400);
    }

    const limited = await callHandler(
      makeRequest({
        body: { text: '' },
        ip: '203.0.113.200'
      })
    );

    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toMatch(/^\d+$/);
    expect(parseJson(limited).error).toBe('Edge TTS 请求过于频繁，请稍后再试');
  });
});
