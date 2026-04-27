
export const AZURE_VOICES = [
    // English (US)
    { label: "🇺🇸 英文 (美) - Ava (多语言)", value: "en-US-AvaMultilingualNeural" },
    { label: "🇺🇸 英文 (美) - Emma (女)", value: "en-US-EmmaNeural" },
    { label: "🇺🇸 英文 (美) - Andrew (多语言)", value: "en-US-AndrewMultilingualNeural" },
    { label: "🇺🇸 英文 (美) - Brian (男)", value: "en-US-BrianNeural" },

    // English (UK)
    { label: "🇬🇧 英文 (英) - Ryan (男)", value: "en-GB-RyanNeural" },
    { label: "🇬🇧 英文 (英) - Libby (女)", value: "en-GB-LibbyNeural" },
    { label: "🇬🇧 英文 (英) - Sonia (女)", value: "en-GB-SoniaNeural" },
    { label: "🇬🇧 英文 (英) - Abbi (女)", value: "en-GB-AbbiNeural" },

    // Russian
    { label: "🇷🇺 俄文 - Svetlana (女)", value: "ru-RU-SvetlanaNeural" },
    { label: "🇷🇺 俄文 - Dariya (女)", value: "ru-RU-DariyaNeural" },
    { label: "🇷🇺 俄文 - Dmitry (男)", value: "ru-RU-DmitryNeural" },
    { label: "🇷🇺 俄文 - Donat (男)", value: "ru-RU-DonatNeural" },

    // Japanese
    { label: "🇯🇵 日文 - Nanami (女)", value: "ja-JP-NanamiNeural" },
    { label: "🇯🇵 日文 - Keita (男)", value: "ja-JP-KeitaNeural" },

    // Chinese
    { label: "🇨🇳 中文 -晓晓 (女)", value: "zh-CN-XiaoxiaoNeural" },
    { label: "🇨🇳 中文 -云希 (男)", value: "zh-CN-YunxiNeural" },

    // French
    { label: "🇫🇷 法文 - Denise (女)", value: "fr-FR-DeniseNeural" },
    { label: "🇫🇷 法文 - Henri (男)", value: "fr-FR-HenriNeural" },

    // Italian
    { label: "🇮🇹 意文 - Isabella (女)", value: "it-IT-IsabellaNeural" },
    { label: "🇮🇹 意文 - Diego (男)", value: "it-IT-DiegoNeural" },
];

export class AzureTTSService {
  private key: string;
  private region: string;

  constructor(key: string, region: string) {
    this.key = key;
    this.region = region;
  }

  async generateSpeech(text: string, voiceName: string, speed: number): Promise<ArrayBuffer> {
    if (!/^[a-z0-9-]+$/i.test(this.region)) {
      throw new Error("Azure 区域格式无效");
    }

    const url = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    
    // Extract language from voice name
    const langMatch = voiceName.match(/^([a-z]{2}-[A-Z]{2})/);
    const lang = langMatch ? langMatch[1] : 'en-US';

    // SSML to control voice and speed
    // Logic update: If speed is 1.0, do NOT use <prosody>. This fixes compatibility with certain voices.
    const escapeXml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const safeText = escapeXml(text);
    const safeLang = escapeXml(lang);
    const safeVoiceName = escapeXml(voiceName);
    let content = safeText;
    if (speed !== 1) {
        const percentage = Math.round((speed - 1) * 100);
        const rateStr = `${percentage > 0 ? '+' : ''}${percentage}%`;
        content = `<prosody rate='${escapeXml(rateStr)}'>${safeText}</prosody>`;
    }

    const ssml = `
      <speak version='1.0' xml:lang='${safeLang}'>
        <voice xml:lang='${safeLang}' name='${safeVoiceName}'>
          ${content}
        </voice>
      </speak>
    `;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
        },
        body: ssml
      });

      if (!response.ok) {
        if (response.status === 429) {
            throw new Error("Azure_429");
        }
        const errText = await response.text();
        throw new Error(`Azure TTS Error ${response.status}: ${errText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      console.error("Azure TTS Request Failed:", error);
      throw error;
    }
  }
}
