
export class GoogleFreeTTS {
  private isPlaying = false;
  private audioQueue: string[] = [];
  private currentAudio: HTMLAudioElement | null = null;
  private onComplete: () => void = () => {};

  /**
   * Splits long text into smaller chunks (max ~200 chars) by punctuation
   * to satisfy Google TTS API limits.
   */
  private chunkText(text: string): string[] {
    // Split by sentence delimiters (period, question mark, exclamation, etc.)
    // Keep the delimiter with the chunk
    const sentences = text.match(/[^.!?。！？\n]+[.!?。！？\n]*/g) || [text];
    const chunks: string[] = [];
    
    let currentChunk = "";
    
    for (const sentence of sentences) {
        if ((currentChunk + sentence).length < 180) {
            currentChunk += sentence;
        } else {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = sentence;
        }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
    
    return chunks;
  }

  async play(text: string, lang: string, speed: number, onComplete: () => void) {
    this.stop();
    this.isPlaying = true;
    this.onComplete = onComplete;
    
    // Chunk the text
    this.audioQueue = this.chunkText(text);
    
    // Map 'auto' or complex lang codes to Google TTS supported codes
    let googleLang = lang;
    if (lang === 'zh') googleLang = 'zh-CN';
    if (lang === 'ja') googleLang = 'ja';
    if (lang === 'ru') googleLang = 'ru';
    if (lang === 'en') googleLang = 'en';

    await this.playNextChunk(googleLang, speed);
  }

  private async playNextChunk(lang: string, speed: number) {
    if (!this.isPlaying || this.audioQueue.length === 0) {
        this.isPlaying = false;
        this.onComplete();
        return;
    }

    const text = this.audioQueue.shift();
    if (!text) return;

    // Google Translate TTS API (Unofficial but widely used)
    // client=tw-ob is the standard client ID for text-only requests
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;

    return new Promise<void>((resolve) => {
        const audio = new Audio(url);
        this.currentAudio = audio;
        audio.playbackRate = speed;
        
        audio.onended = () => {
            resolve();
            this.playNextChunk(lang, speed);
        };
        
        audio.onerror = (e) => {
            console.error("Google TTS Playback Error", e);
            // Skip to next chunk on error
            resolve();
            this.playNextChunk(lang, speed);
        };

        audio.play().catch(e => {
            console.error("Audio play failed (interaction required?)", e);
            this.stop();
        });
    });
  }

  stop() {
    this.isPlaying = false;
    this.audioQueue = [];
    if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
    }
  }
}
