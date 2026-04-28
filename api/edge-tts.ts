import { EdgeTTSInputError, synthesizeEdgeSpeech } from '../server/edgeTTS';

const json = (body: unknown, status: number, headers: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...headers
    }
  });

const readPayload = async (request: Request): Promise<unknown> => {
  const raw = await request.text();
  return raw ? JSON.parse(raw) : {};
};

export async function POST(request: Request) {
  try {
    const payload = await readPayload(request);
    const audio = await synthesizeEdgeSpeech(payload && typeof payload === 'object' ? payload : {});

    return new Response(audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Edge TTS 请求失败';
    const status = error instanceof SyntaxError || error instanceof EdgeTTSInputError ? 400 : 502;

    console.error('[EdgeTTS] synthesis failed', {
      status,
      message,
      stack: error instanceof Error ? error.stack : undefined
    });

    return json({ error: message }, status);
  }
}

export function GET() {
  return json({ error: 'Method Not Allowed' }, 405, { Allow: 'POST' });
}
