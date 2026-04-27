export const EDGE_TTS_VOICES = [
  { label: "🇺🇸 英文 (美) - Ava (多语言)", value: "en-US-AvaMultilingualNeural" },
  { label: "🇺🇸 英文 (美) - Emma (女)", value: "en-US-EmmaNeural" },
  { label: "🇺🇸 英文 (美) - Andrew (多语言)", value: "en-US-AndrewMultilingualNeural" },
  { label: "🇺🇸 英文 (美) - Brian (男)", value: "en-US-BrianNeural" },
  { label: "🇺🇸 英文 (美) - Jenny (女)", value: "en-US-JennyNeural" },
  { label: "🇺🇸 英文 (美) - Guy (男)", value: "en-US-GuyNeural" },

  { label: "🇬🇧 英文 (英) - Ryan (男)", value: "en-GB-RyanNeural" },
  { label: "🇬🇧 英文 (英) - Libby (女)", value: "en-GB-LibbyNeural" },
  { label: "🇬🇧 英文 (英) - Sonia (女)", value: "en-GB-SoniaNeural" },
  { label: "🇬🇧 英文 (英) - Thomas (男)", value: "en-GB-ThomasNeural" },

  { label: "🇷🇺 俄文 - Svetlana (女)", value: "ru-RU-SvetlanaNeural" },
  { label: "🇷🇺 俄文 - Dariya (女)", value: "ru-RU-DariyaNeural" },
  { label: "🇷🇺 俄文 - Dmitry (男)", value: "ru-RU-DmitryNeural" },
  { label: "🇷🇺 俄文 - Donat (男)", value: "ru-RU-DonatNeural" },

  { label: "🇯🇵 日文 - Nanami (女)", value: "ja-JP-NanamiNeural" },
  { label: "🇯🇵 日文 - Keita (男)", value: "ja-JP-KeitaNeural" },

  { label: "🇨🇳 中文 - 晓晓 (女)", value: "zh-CN-XiaoxiaoNeural" },
  { label: "🇨🇳 中文 - 云希 (男)", value: "zh-CN-YunxiNeural" },
  { label: "🇨🇳 中文 - 晓伊 (女)", value: "zh-CN-XiaoyiNeural" },
  { label: "🇨🇳 中文 - 云扬 (男)", value: "zh-CN-YunyangNeural" },

  { label: "🇫🇷 法文 - Denise (女)", value: "fr-FR-DeniseNeural" },
  { label: "🇫🇷 法文 - Henri (男)", value: "fr-FR-HenriNeural" },
  { label: "🇮🇹 意文 - Isabella (女)", value: "it-IT-IsabellaNeural" },
  { label: "🇮🇹 意文 - Diego (男)", value: "it-IT-DiegoNeural" }
];

export class EdgeCloudTTSService {
  async generateSpeech(text: string, voice: string, speed: number): Promise<ArrayBuffer> {
    const response = await fetch('/api/edge-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, speed })
    });

    if (!response.ok) {
      let message = `Edge TTS Error ${response.status}`;
      try {
        const data = await response.json();
        if (typeof data?.error === 'string') message = data.error;
      } catch {
        const text = await response.text().catch(() => '');
        if (text) message = text;
      }
      throw new Error(message);
    }

    return await response.arrayBuffer();
  }
}
