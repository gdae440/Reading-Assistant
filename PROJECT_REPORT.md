# 跟读助手 (PolyGlot Reader) 项目详细报告

> 最后更新: 2026-04-28

---

## 项目概述

这是一个**多语言语言学习辅助 Web 应用**，核心功能是帮助用户通过跟读（Shadowing）方式学习外语。支持日语、俄语、英语、中文四种语言，提供语音合成、翻译、查词和生词本管理等功能。

| 属性 | 详情 |
|------|------|
| **项目名称** | 跟读助手 (PolyGlot Reader) |
| **技术栈** | React 19.2.0 + TypeScript 5.8 + Vite + TailwindCSS |
| **目标平台** | 移动端 Web / PWA（针对 iOS/Android 优化） |
| **构建工具** | Vite |

---

## 目录结构

```
跟读助手/
├── .gitignore              # Git 忽略配置
├── index.html              # HTML 入口
├── index.css               # Tailwind 与全局样式
├── index.tsx               # React 渲染入口
├── App.tsx                 # 主应用组件（路由/状态管理）
├── types.ts                # TypeScript 类型定义
├── vite.config.ts          # Vite 构建配置
├── tsconfig.json           # TypeScript 编译配置
├── metadata.json           # 应用元数据
├── package.json            # 依赖配置
├── PROJECT_REPORT.md       # 本项目报告
├── views/
│   ├── ReaderView.tsx      # 文章朗读主界面 (核心功能)
│   ├── VocabularyView.tsx  # 生词本管理界面
│   └── SettingsView.tsx     # 设置界面
├── components/
│   └── WordDetailModal.tsx  # 单词详情弹窗
├── services/
│   ├── siliconFlow.ts      # SiliconFlow AI 服务（核心）
│   ├── azureTTS.ts         # Azure 语音合成服务
│   └── edgeTTSClient.ts    # Edge 免费云端 TTS 前端客户端
├── server/
│   ├── edgeTTS.ts          # Edge 非官方 TTS server-only 合成逻辑
│   └── edgeTTSDevMiddleware.ts # Vite 开发环境 /api/edge-tts
├── api/
│   └── edge-tts.ts         # Vercel Function: /api/edge-tts
└── hooks/
    └── useLocalStorage.ts   # 本地存储 Hook
```

---

## 核心功能模块

### 1. ReaderView - 文章朗读 ([views/ReaderView.tsx](views/ReaderView.tsx))

| 功能 | 说明 |
|------|------|
| **文本输入** | 支持粘贴多语言文章 |
| **OCR 图片识别** | 上传图片自动提取文字 |
| **TTS 朗读** | 支持 4 种语音引擎，语速可调 (0.5x - 1.5x) |
| **跟读模式** | 按句播放，自动留出跟读间隔 |
| **语言自动检测** | 自动识别日/俄/中/英 |
| **AI 查词** | 点击单词弹出释义（日语注音、俄语重音、IPA） |
| **全文翻译** | 调用 LLM 进行翻译 |
| **AI 文本分析** | 提取常用词块、核心词汇、重点句子 |
| **播放模式** | 全文/选中/从光标处播放 |

### 2. VocabularyView - 生词本 ([views/VocabularyView.tsx](views/VocabularyView.tsx))

| 功能 | 说明 |
|------|------|
| **语言分组** | 自动将单词分为日语/俄语/中文/英语 |
| **批量操作** | 全选/删除/导出到 Anki |
| **Anki 导出** | 生成 CSV 格式的卡片文件 |
| **历史记录** | 查看翻译/回复历史 |
| **本地持久化** | 使用 localStorage 存储 |

### 3. SettingsView - 设置 ([views/SettingsView.tsx](views/SettingsView.tsx))

| 配置项 | 说明 |
|--------|------|
| **SiliconFlow API Key** | 核心 API 认证 |
| **LLM 模型** | 默认: DeepSeek-V3.2-Exp |
| **Vision 模型** | 默认: Qwen3-VL-32B |
| **TTS 提供商** | SiliconFlow / Azure / 浏览器本地 / Edge 免费云端 |
| **跟读模式** | 开关和间隔时间设置 |

---

## 技术架构

### 音频合成 (TTS) 四层架构

| 层级 | 服务 | 特点 | 文件 |
|------|------|------|------|
| **SiliconFlow TTS** | CosyVoice2/IndexTTS | 支持音色选择，返回 MP3 | [services/siliconFlow.ts](services/siliconFlow.ts) |
| **Azure TTS** | Azure Speech Services | 30+ 种神经网络音色，SSML 控制 | [services/azureTTS.ts](services/azureTTS.ts) |
| **Edge 免费云端** | 非官方 Edge Read Aloud 兼容接口 | 免用户 Key，经 `/api/edge-tts` server-side 转发，实验性质；生产函数为单文件 Vercel handler | [api/edge-tts.ts](api/edge-tts.ts), [server/edgeTTS.ts](server/edgeTTS.ts) |
| **浏览器原生** | window.speechSynthesis | iOS 优化，无需 API | ReaderView 内置 |

### TTS 音色支持

**SiliconFlow TTS:**
- 女声: Bella, Qian, Meimei
- 男声: Adam, Zhe

**Azure TTS:**
- 英语: Ava, Emma, Andrew, Brian, Ryan, Libby, Sonia, Abbi
- 俄语: Svetlana, Dariya, Dmitry, Donat
- 日语: Nanami, Keita
- 中文: Xiaoxiao, Yunxi

**Edge 免费云端:**
- 使用 Edge Read Aloud 风格 Neural 音色，不需要用户 Key。
- 不是微软公开 API，可能因服务协议变化而失效；前端不能直接稳定调用，必须走 server-side `/api/edge-tts`。
- 生产环境的 Vercel Function 不应跨目录 import `server/edgeTTS.ts`；生产合成逻辑已内联在 [api/edge-tts.ts](api/edge-tts.ts)，避免函数包启动时找不到 `server/` 下的 TS 文件。

### Edge TTS 生产部署排障记录

**问题现象:** 前端提示 `Edge TTS Error 500: 部署环境的 /api/edge-tts 服务端函数异常，请查看部署平台 Function 日志`。

**真实根因:** Vercel Function 启动阶段失败，日志显示：

```text
ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/server/edgeTTS.ts' imported from /var/task/api/edge-tts.js
```

这说明请求没有进入业务 catch 分支，而是在 serverless 函数模块加载时就崩溃。原因是 Vercel 打包 `/api/edge-tts.ts` 后，没有把根目录 `server/edgeTTS.ts` 作为运行时文件放进 `/var/task/server/`。

**最终修复:**

- [api/edge-tts.ts](api/edge-tts.ts) 改为自包含的 Vercel Node.js handler。
- Edge TTS 输入校验、超时控制、`edge-tts-universal` 动态导入和 MP3 拼接都保留在 `api/edge-tts.ts` 内。
- [server/edgeTTS.ts](server/edgeTTS.ts) 保留给本地 Vite dev middleware 使用，不作为生产函数依赖。
- 超时 timer 在 `finally` 中清理，避免 serverless 请求结束后残留未清理计时器。

**验证命令:**

```bash
npx tsc --noEmit
npm run build
node --experimental-strip-types --input-type=module -e "import { Readable } from 'node:stream'; const { default: handler } = await import('./api/edge-tts.ts'); const req = Readable.from([JSON.stringify({ text: 'hello', voice: 'en-US-AvaMultilingualNeural', speed: 1 })]); req.method = 'POST'; const headers = {}; const res = { statusCode: 0, setHeader(k, v) { headers[k] = v; }, end(data) { console.log('status', this.statusCode); console.log('contentType', headers['Content-Type']); console.log('bytes', Buffer.isBuffer(data) ? data.length : Buffer.byteLength(String(data || ''))); } }; await handler(req, res);"
curl -s -D /tmp/edge-tts-headers.txt -o /tmp/edge-tts.mp3 \
  -X POST https://musicianra.vercel.app/api/edge-tts \
  -H 'Content-Type: application/json' \
  --data '{"text":"hello","voice":"en-US-AvaMultilingualNeural","speed":1}'
```

**成功标准:** 生产接口返回 `HTTP 200`、`content-type: audio/mpeg`，响应体是非空 MP3。2026-04-28 修复后的生产验证结果为 `HTTP/2 200`、`content-length: 5616`。

**后续维护规则:**

- 修改生产 `/api/edge-tts` 时，优先保持 [api/edge-tts.ts](api/edge-tts.ts) 单文件自包含。
- 不要从 `api/edge-tts.ts` 直接 import `../server/*.ts`，除非同时确认 Vercel 函数包包含该文件。
- 看到 `FUNCTION_INVOCATION_FAILED` 时先查 Vercel 日志，不要先假设是 Edge Read Aloud 上游失效。
- 如果日志进入 `[EdgeTTS] synthesis failed`，才继续排查上游 WebSocket、超时或音色参数。

### AI 服务 ([services/siliconFlow.ts](services/siliconFlow.ts))

| 功能 | 说明 | 模型 |
|------|------|------|
| **智能查词** | 根据语言返回注音/重音/IPA + 双语释义 | DeepSeek-V3.2-Exp |
| **例句生成** | 自动生成语境例句 | DeepSeek-V3.2-Exp |
| **OCR 识别** | Qwen3-VL-32B 图片文字识别 | Qwen3-VL-32B |
| **全文翻译** | 多语言翻译 | DeepSeek-V3.2-Exp |
| **文本分析** | 提取常用词块、核心词汇、重点句子 | DeepSeek-V3.2-Exp |

### 语言检测逻辑 ([views/ReaderView.tsx](views/ReaderView.tsx))

```typescript
// 优先级: 日语 -> 俄语 -> 中文 -> 英语
if (/[\u3040-\u30ff\u3400-\u4dbf]/.test(textSample)) return 'ja';  // 日语
if (/[а-яА-ЯЁё]/.test(textSample)) return 'ru';                    // 俄语
if (/[\u4e00-\u9fa5]/.test(textSample)) return 'zh';              // 中文
return 'en';                                                      // 英语
```

---

## 数据模型 ([types.ts](types.ts))

### WordEntry - 生词条目

```typescript
interface WordEntry {
  id: string;              // 唯一标识
  word: string;            // 单词文本
  reading?: string;        // 读音 (日语假名等)
  ipa?: string;           // 国际音标
  meaningCn: string;       // 中文释义
  meaningRu: string;       // 俄语释义
  contextSentence?: string; // 例句
  timestamp: number;       // 添加时间
}
```

### AppSettings - 应用设置

```typescript
interface AppSettings {
  apiKey: string;         // SiliconFlow API Key
  llmModel: string;       // LLM 模型名称
  visionModel: string;    // 视觉模型名称
  ttsProvider: TTSProvider; // TTS 提供商
  ttsSpeed: number;       // 语速

  // 跟读模式
  shadowingMode: boolean;
  shadowingPause: number; // 跟读间隔(秒)

  // SiliconFlow TTS
  sfTtsModel: string;
  sfTtsVoice: string;

  // Azure TTS
  azureKey: string;
  azureRegion: string;
  azureVoice: string;

  // 浏览器 TTS
  browserVoice: string;

  // Edge 免费云端 TTS
  edgeVoice: string;
}
```

---

## 数据持久化 ([hooks/useLocalStorage.ts](hooks/useLocalStorage.ts))

| 存储键 | 内容 |
|--------|------|
| `polyglot_settings` | 应用设置 |
| `polyglot_vocab` | 生词本数据 |
| `polyglot_history` | 翻译历史 (最多 50 条) |
| `reader_text` | 阅读文本 |
| `reader_translation_result` | 翻译结果 |
| `reader_analysis_result` | AI 分析结果 |

---

## 依赖配置

### package.json

```json
{
  "name": "copy-of-跟读助手",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "~5.8.2",
    "vite": "^6.2.0"
  }
}
```

### NPM 脚本

```bash
npm run dev      # 启动开发服务器 (端口 3000)
npm run build    # 构建生产版本
npm run preview  # 预览构建结果
```

### API Key 管理

用户在应用“设置”里填写自己的 SiliconFlow 或 Azure Key。Key 只保存在当前浏览器本机，不再通过 Vite 环境变量注入前端产物。

---

## 需要配置的 API

| 服务 | 必需性 | 用途 | 配置位置 |
|------|--------|------|----------|
| **SiliconFlow** | 必需 | AI 翻译、查词、OCR、TTS | SettingsView |
| Azure Speech | 可选 | 高质量语音合成 | SettingsView |
| Edge 免费云端 | 可选 | 非官方 Edge Read Aloud 云端语音 (无需用户 Key) | `/api/edge-tts` |
| 浏览器 TTS | 可选 | 原生语音合成 (无需 API Key) | - |

**SiliconFlow API Base URL:** `https://api.siliconflow.cn/v1`

---

## 构建配置

### Vite Config ([vite.config.ts](vite.config.ts))

```typescript
export default defineConfig(({ mode }) => {
  return {
    server: {
      port: 3000,
      host: '127.0.0.1',
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
```

### TypeScript Config ([tsconfig.json](tsconfig.json))

- 目标: ES2022
- JSX: react-jsx
- 路径别名: `@/*` 指向项目根目录

---

## 项目特点

| 特点 | 说明 |
|------|------|
| **Apple 风格设计** | 毛玻璃效果 (backdrop-filter: blur) |
| **PWA 支持** | Apple Mobile Web App 配置 |
| **暗色模式** | 自动跟随系统设置 |
| **移动端优化** | iOS Safari 音频播放兼容性处理 |
| **音频缓存** | LRU 缓存（最多 10 条），减少 API 调用 |
| **智能断句** | 正则表达式处理多语言标点 |
| **Anki 导出** | 支持生词本导出为 CSV 格式 |

---

## 当前状态

| 项目 | 状态 | 备注 |
|------|------|------|
| 代码完整性 | ✅ 完整 | 所有功能模块已实现 |
| 测试配置 | ❌ 未配置 | 无测试框架 |
| 类型安全 | ✅ TypeScript | 完整类型定义 |
| 构建状态 | ✅ 正常 | Vite 配置完整 |

---

## 启动方式

```bash
cd /Users/paganini/跟读助手
npm install
npm run dev
```

访问 `http://localhost:3000` 即可使用。

---

## 后续开发建议

1. **添加测试框架** - 建议配置 Vitest 或 Jest
2. **API Key 管理** - 考虑后端代理保护 API Key
3. **离线支持** - Service Worker 完善 PWA 离线功能
4. **性能优化** - 音频缓存策略可以优化
5. **多用户支持** - 考虑添加用户系统和云同步

---

## 关键文件速查

| 文件 | 用途 |
|------|------|
| [App.tsx](App.tsx) | 主应用组件，状态管理 |
| [views/ReaderView.tsx](views/ReaderView.tsx) | 核心阅读/跟读界面 |
| [views/VocabularyView.tsx](views/VocabularyView.tsx) | 生词本管理 |
| [views/SettingsView.tsx](views/SettingsView.tsx) | 设置界面 |
| [services/siliconFlow.ts](services/siliconFlow.ts) | AI 服务集成 |
| [services/azureTTS.ts](services/azureTTS.ts) | Azure 语音合成 |
| [services/edgeTTSClient.ts](services/edgeTTSClient.ts) | Edge 免费云端 TTS 前端客户端 |
| [server/edgeTTS.ts](server/edgeTTS.ts) | Edge 非官方 TTS server-only 合成逻辑 |
| [api/edge-tts.ts](api/edge-tts.ts) | Vercel Function 语音合成入口 |
| [hooks/useLocalStorage.ts](hooks/useLocalStorage.ts) | 本地存储 |
| [types.ts](types.ts) | 类型定义 |
