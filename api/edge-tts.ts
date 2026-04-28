import { EdgeTTSInputError, EdgeTTSTimeoutError, synthesizeEdgeSpeech } from '../server/edgeTTS.ts';

const jsonHeaders = {
  'Cache-Control': 'no-store'
};

const methodNotAllowed = (): Response => {
  return Response.json(
    { error: 'Method Not Allowed' },
    {
      status: 405,
      headers: {
        ...jsonHeaders,
        Allow: 'POST'
      }
    }
  );
};

const readPayload = async (request: Request): Promise<unknown> => {
  const raw = await request.text();
  return raw ? JSON.parse(raw) : {};
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

export async function POST(request: Request): Promise<Response> {
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
    const status = getErrorStatus(error);
    logSynthesisError(error, status);

    return Response.json(errorBody(error), {
      status,
      headers: jsonHeaders
    });
  }
}

export function GET(): Response {
  return methodNotAllowed();
}

export default {
  fetch(request: Request): Promise<Response> | Response {
    if (request.method === 'POST') return POST(request);
    return methodNotAllowed();
  }
};
