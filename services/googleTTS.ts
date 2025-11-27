
export class GoogleFreeTTS {
  private isPlaying = false;
  private audioQueue: string[] = [];
  // Use a static instance or ensure the class manages one instance effectively. 
  // Since the service is instantiated via useRef in ReaderView, it effectively acts as a singleton per view.
  // We keep it as an instance property but ensure we manage it carefully.
  private audioElement: HTMLAudioElement;
  private onComplete: () => void = () => {};

  constructor() {
    this.audioElement = new Audio();
    // iOS Safari requires the audio element to be configured in a user interaction.
    // We set autoplay to false initially.
    this.audioElement.autoplay = false;
  }

  /**
   * Splits long text into smaller chunks (max ~200 chars) by punctuation
   * to satisfy Google TTS API limits.
   */
  private chunkText(text: string): string[] {
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
    
    this.audioQueue = this.chunkText(text);
    
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

    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;

    return new Promise<void>((resolve) => {
        // Essential for iOS: Reuse the same audio element and just change src
        this.audioElement.src = url;
        this.audioElement.playbackRate = speed;
        
        // Essential for iOS: Call load() to ensure the new source is ready
        this.audioElement.load();

        this.audioElement.onended = () => {
            resolve();
            // Recursive call is fine here as it's triggered by the previous audio ending
            this.playNextChunk(lang, speed);
        };
        
        this.audioElement.onerror = (e) => {
            console.error("Google TTS Playback Error", e);
            resolve();
            this.playNextChunk(lang, speed);
        };

        this.audioElement.play().catch(e => {
            console.error("Audio play failed (interaction required?)", e);
            this.stop();
        });
    });
  }

  stop() {
    this.isPlaying = false;
    this.audioQueue = [];
    if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        // Removing src can help reset the element state
        this.audioElement.removeAttribute('src');
    }
  }
}
