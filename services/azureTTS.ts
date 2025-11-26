
export class AzureTTSService {
  private key: string;
  private region: string;

  constructor(key: string, region: string) {
    this.key = key;
    this.region = region;
  }

  async generateSpeech(text: string, voiceName: string, speed: number): Promise<ArrayBuffer> {
    const url = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    
    // SSML to control voice and speed
    // Speed: 1.0 is default. Azure uses percentage or relative numbers. 
    // 0.5x -> -50.00%, 1.5x -> +50.00%
    let rateStr = "0%";
    if (speed !== 1) {
        const percentage = Math.round((speed - 1) * 100);
        rateStr = `${percentage > 0 ? '+' : ''}${percentage}%`;
    }

    const ssml = `
      <speak version='1.0' xml:lang='en-US'>
        <voice xml:lang='en-US' xml:gender='Female' name='${voiceName}'>
          <prosody rate='${rateStr}'>
            ${text}
          </prosody>
        </voice>
      </speak>
    `;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
          'User-Agent': 'PolyGlot'
        },
        body: ssml
      });

      if (!response.ok) {
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
