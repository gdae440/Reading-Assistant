import { Buffer } from 'node:buffer';

export const EDGE_TTS_TEXT_LIMIT = 5000;
export const DEFAULT_EDGE_VOICE = 'en-US-AvaMultilingualNeural';
const EDGE_TTS_SYNTHESIS_TIMEOUT_MS = 30000;

export class EdgeTTSInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EdgeTTSInputError';
  }
}

export interface EdgeTTSRequest {
  text?: unknown;
  voice?: unknown;
  speed?: unknown;
}

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

export async function synthesizeEdgeSpeech(payload: EdgeTTSRequest): Promise<Buffer> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Edge TTS 请求超时，请稍后重试或切换本地/Azure')), EDGE_TTS_SYNTHESIS_TIMEOUT_MS);
  });

  return Promise.race([synthesizeEdgeSpeechUnsafe(payload), timeout]);
}

async function synthesizeEdgeSpeechUnsafe(payload: EdgeTTSRequest): Promise<Buffer> {
  const text = normalizeText(payload.text);
  const voice = normalizeVoice(payload.voice);
  const speed = normalizeSpeed(payload.speed);
  const { Communicate } = await import('edge-tts-universal');
  const communicate = new Communicate(text, {
    voice,
    rate: toRate(speed),
    connectionTimeout: 15000
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
}
