
import { LookupResult, AnalysisResult } from "../types";

const BASE_URL = "/api/siliconflow";

export class SiliconFlowService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private getHeaders() {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "Accept-Encoding": "identity"  // 禁用压缩，Safari 兼容性
    };
  }

  /**
   * Fast lookup: Optimized for different languages (Japanese, Russian, English).
   */
  async lookupWordFast(word: string, model: string, contextLang: string = 'en'): Promise<LookupResult> {
    // 1. Detect script of the word to decide the prompt strategy
    const hasKana = /[\u3040-\u30ff\u3400-\u4dbf]/.test(word); // Hiragana, Katakana
    const hasKanji = /[\u4e00-\u9fff]/.test(word); // Kanji / Hanzi
    const isRussian = /[а-яА-ЯЁё]/.test(word);
    const isEnglish = /^[a-zA-Z\s-]+$/.test(word);

    let targetLang = 'other';
    if (hasKana) {
        targetLang = 'ja';
    } else if (hasKanji) {
        // Ambiguous: Pure Kanji word (e.g., "先生"). Could be JP or CN.
        // Use contextLang to disambiguate.
        targetLang = contextLang === 'ja' ? 'ja' : 'zh';
    } else if (isRussian) {
        targetLang = 'ru';
    } else if (isEnglish) {
        targetLang = 'en';
    }

    let prompt = `请分析这个单词或短语: "${word}".\n返回一个包含以下字段的 JSON 对象:\n`;

    if (targetLang === 'ja') {
        // Japanese Strategy: Reading (Furigana) + CN Meaning. No IPA, No RU.
        prompt += `
        - "word": 原词
        - "reading": 平假名读音 (Furigana)
        - "cn": 中文简洁释义
        - "ipa": null
        - "ru": null
        `;
    } else if (targetLang === 'ru') {
        // Russian Strategy: Word with stress marks + CN Meaning. No IPA, No RU.
        prompt += `
        - "word": 单词 (必须在主元音上标注正确的重音符号，例如 соба́ка)
        - "cn": 中文简洁释义
        - "reading": null
        - "ipa": null
        - "ru": null
        `;
    } else if (targetLang === 'en') {
        // English Strategy: IPA + CN + RU (Dual translation)
        prompt += `
        - "word": 原词 (纠正大小写)
        - "ipa": DJ 音标 (英式)
        - "cn": 中文简洁释义
        - "ru": 俄语简洁释义
        - "reading": null
        `;
    } else {
        // Fallback Strategy (Chinese or others)
        prompt += `
        - "word": 原词
        - "cn": 中文简洁释义
        - "ipa": null
        - "ru": null
        - "reading": null
        `;
    }
    
    prompt += `\n只返回有效的 JSON。`;

    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 300
        })
      });

      if (!response.ok) throw new Error("Translation failed");
      const data = await response.json();
      const content = data.choices[0].message.content;
      return JSON.parse(content);
    } catch (error) {
      console.error("Fast Lookup error:", error);
      return {
        word: word,
        ipa: "",
        cn: "获取释义失败",
        ru: "",
        example: ""
      };
    }
  }

  /**
   * Generates a context sentence separately.
   */
  async generateExample(word: string, model: string): Promise<string> {
    const prompt = `
    请为单词 "${word}" 生成一个简短的例句。
    要求：
    1. **例句必须使用单词 "${word}" 所属的语言** (例如单词是俄语就造俄语例句)。
    2. **优先与音乐相关**（歌词、乐器、乐理、演出现场等）。
    3. 如果无法关联音乐，则提供生活实用例句。
    4. 直接返回例句文本，不要包含任何解释或引号。
    `;

    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7, // Higher temp for creativity
          max_tokens: 150
        })
      });

      if (!response.ok) return "";
      const data = await response.json();
      return data.choices[0].message.content.trim().replace(/^['"]|['"]$/g, '');
    } catch (error) {
      console.error("Example generation error:", error);
      return "";
    }
  }

  /**
   * Extracts text from an image using the Vision model.
   */
  async ocrImage(base64Image: string, model: string): Promise<string> {
    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "请提取这张图片中的所有文字，保持原有排版。只输出文字内容。" },
                { type: "image_url", image_url: { url: base64Image } }
              ]
            }
          ]
        })
      });

      if (!response.ok) throw new Error("OCR failed");
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error("OCR Error:", error);
      throw error;
    }
  }

  /**
   * Fixes OCR text formatting (merging broken lines, etc.) using LLM.
   */
  async fixOCRFormatting(text: string, model: string): Promise<string> {
    const prompt = `
    You are a text formatting assistant. The user will provide text extracted from an image (OCR). It often has incorrect line breaks within sentences. 
    Your Task:
    1. Merge lines that belong to the same sentence.
    2. Preserve true paragraph breaks (double newlines).
    3. Fix obvious OCR typos if safe to do so.
    4. Return ONLY the cleaned text. Do not add markdown or explanations.
    `;

    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: text }
          ],
          temperature: 0.1
        })
      });

      if (!response.ok) return text; // Fallback to raw text if optimization fails
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error("OCR Formatting Error:", error);
      return text;
    }
  }

  /**
   * Generates audio using SiliconFlow TTS models.
   * Supported models: FunAudioLLM/CosyVoice2-0.5B, fnlp/MOSS-TTSD-v0.5
   */
  async generateSpeech(text: string, model: string, voice: string, speed: number): Promise<ArrayBuffer> {
    try {
      const response = await fetch(`${BASE_URL}/audio/speech`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: model,
          input: text,
          voice: voice,  // CosyVoice2: "FunAudioLLM/CosyVoice2-0.5B:bella"
          response_format: "mp3",
          speed: speed,
          stream: true  // 启用流式输出，可边生成边播放
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`TTS Failed: ${err}`);
      }


      return await response.arrayBuffer();
    } catch (error) {
      console.error("TTS Error:", error);
      throw error;
    }
  }

  /**
   * Translates a full article.
   */
  async translateArticle(text: string, model: string): Promise<string> {
    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: "你是一个专业的翻译助手。请将以下文本翻译成中文，保持原文的语气和结构。" },
            { role: "user", content: text }
          ]
        })
      });

      if (!response.ok) throw new Error("Translation failed");
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error("Translation Error:", error);
      throw error;
    }
  }

  /**
   * Generates a context-aware reply in Russian based on mixed input.
   */
  async generateContextAwareReply(text: string, model: string): Promise<string> {
    const prompt = `
    你是一个精通中俄双语的沟通助手。
    用户输入的文本可能包含两部分：
    1. 上下文/对方的消息 (通常是俄语，也可能是空)。
    2. 用户想要回复的内容 (通常是中文)。

    请分析文本：
    1. 识别对话的语境。
       - 如果语境显示对象是老师、长辈或陌生人，生成的俄语回复请务必使用敬语 (Вы)。
       - 如果语境显示对象是同学、朋友或家人，可以使用自然口语 (ты)。
    2. 结合上下文，将用户的中文意图翻译成地道、自然的俄语回复。
    3. 如果文本只有中文，则直接将其翻译成得体的俄语。

    ⚠️ 重要：只输出生成的俄语回复内容，不要输出任何分析过程或"以下是回复"之类的废话。
    `;

    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: model,
          messages: [
             { role: "system", content: "You are a helpful assistant for Russian communication." },
             { role: "user", content: prompt },
             { role: "user", content: `用户输入内容:\n${text}` }
          ]
        })
      });

      if (!response.ok) throw new Error("Reply generation failed");
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error("Reply Generation Error:", error);
      throw error;
    }
  }

  /**
   * Analyzes text to extract collocations and vocabulary.
   */
  async analyzeText(text: string, model: string): Promise<AnalysisResult> {
    const prompt = `
    Analyze the following text and detect its language.
    1. Extract 5-10 useful Collocations/Phrases (chunks).
    2. Extract 5-10 Core Vocabulary words (B2/C1 level or key terms).
    3. Extract 3-5 Key Sentences suitable for shadowing practice (good rhythm, useful grammar).

    For vocabulary words, provide:
    - English words: IPA (DJ phonetic), Chinese meaning, Russian meaning
    - Russian words: Stress marks (e.g., соба́ка), Chinese meaning
    - Japanese words: Hiragana reading, Chinese meaning
    - Chinese words: Chinese meaning only

    Return a strictly valid JSON object with this structure:
    {
      "collocations": [{"text": "original phrase", "cn": "chinese meaning"}],
      "vocabulary": [{"text": "word", "cn": "chinese meaning", "reading": "pronunciation/reading", "ipa": "IPA phonetic", "ru": "russian meaning"}],
      "sentences": [{"text": "full sentence", "cn": "chinese translation", "reason": "why it's good"}]
    }

    Text to analyze:
    ${text.slice(0, 3000)}
    `;

    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.1
        })
      });

      if (!response.ok) throw new Error("Analysis failed");
      const data = await response.json();
      const content = data.choices[0].message.content;
      return JSON.parse(content);
    } catch (error) {
      console.error("Analysis Error:", error);
      return { collocations: [], vocabulary: [], sentences: [] };
    }
  }
}