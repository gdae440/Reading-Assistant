
export class GoogleFreeTTS {
  private audioElement: HTMLAudioElement;
  private isStopped = false;

  constructor() {
    this.audioElement = new Audio();
    this.audioElement.autoplay = false;
  }

  /**
   * Splits long text into smaller chunks (max ~180 chars by punctuation)
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

  async play(text: string, lang: string, speed: number): Promise<void> {
    console.log('[GoogleTTS] 开始播放, 语言:', lang);

    // 停止当前播放
    this.isStopped = true;
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    this.audioElement.removeAttribute('src');

    // 重置状态
    this.isStopped = false;

    const chunks = this.chunkText(text);
    let googleLang = lang;
    if (lang === 'zh') googleLang = 'zh-CN';
    if (lang === 'ja') googleLang = 'ja';
    if (lang === 'ru') googleLang = 'ru';
    if (lang === 'en') googleLang = 'en';

    console.log('[GoogleTTS] 片段数:', chunks.length);

    // 递归播放所有 chunks
    await this.playNextChunk(chunks, googleLang, speed);
  }

  private async playNextChunk(chunks: string[], lang: string, speed: number): Promise<void> {
    // 检查是否被停止
    if (this.isStopped || chunks.length === 0) {
        return;
    }

    const text = chunks.shift();
    if (!text) return;

    return new Promise<void>((resolve) => {
        // 如果已经被停止，直接返回
        if (this.isStopped) {
            resolve();
            return;
        }

        // 使用代理 URL 绕过 CORS
        const url = `/api/google/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;

        console.log('[GoogleTTS] 加载:', text.substring(0, 30) + '...');

        // 设置音频源
        this.audioElement.src = url;
        this.audioElement.playbackRate = speed;

        const onEnded = () => {
            console.log('[GoogleTTS] 片段完成');
            this.audioElement.onended = null;
            this.audioElement.onerror = null;
            this.playNextChunk(chunks, lang, speed).then(resolve);
        };

        const onError = (e: Event) => {
            console.error('[GoogleTTS] 音频错误:', e);
            this.audioElement.onended = null;
            this.audioElement.onerror = null;
            // 跳过错误，继续播放
            this.playNextChunk(chunks, lang, speed).then(resolve);
        };

        this.audioElement.onended = onEnded;
        this.audioElement.onerror = onError;

        // 直接播放，不需要 load()
        const playPromise = this.audioElement.play();
        if (playPromise) {
            playPromise.then(() => {
                console.log('[GoogleTTS] 播放成功');
            }).catch(err => {
                console.error('[GoogleTTS] 播放失败:', err);
                // 跳过错误，继续播放
                this.playNextChunk(chunks, lang, speed).then(resolve);
            });
        }
    });
  }

  stop() {
    // 设置停止标志
    this.isStopped = true;

    // 停止音频
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    this.audioElement.removeAttribute('src');

    // 清理回调
    this.audioElement.onended = null;
    this.audioElement.onerror = null;
  }
}
