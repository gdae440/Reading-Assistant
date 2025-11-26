
import { LookupResult } from "../types";

const BASE_URL = "https://api.siliconflow.cn/v1";

export class SiliconFlowService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private getHeaders() {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };
  }

  /**
   * Fast lookup: Only gets definitions and IPA. No examples.
   */
  async lookupWordFast(word: string, model: string): Promise<LookupResult> {
    const prompt = `
    请分析这个单词或短语: "${word}".
    返回一个包含以下字段的 JSON 对象:
    - "word": 原词 (纠正大小写)
    - "ipa": IPA 音标 (如果是英文，否则为 null)
    - "cn": 中文简洁释义 (不要长篇大论)
    - "ru": 俄语简洁释义
    
    只返回有效的 JSON。
    `;

    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.1, // Lower temp for factual data
          max_tokens: 200   // Limit tokens for speed
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
    请为单词 "${word}" 生成一个简短的英文例句。
    要求：
    1. **优先与音乐相关**（歌词、乐器、乐理、演出现场等）。
    2. 如果无法关联音乐，则提供生活实用例句。
    3. 直接返回例句文本，不要包含任何解释或引号。
    `;

    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7, // Higher temp for creativity
          max_tokens: 100
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
   * Generates audio using SiliconFlow TTS models.
   */
  async generateSpeech(text: string, model: string, voice: string, speed: number): Promise<ArrayBuffer> {
    try {
      const response = await fetch(`${BASE_URL}/audio/speech`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: model,
          input: text,
          voice: voice, 
          response_format: "mp3",
          speed: speed
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
}
