# 跟读助手 (PolyGlot Reader) 项目详细报告

> 最后更新: 2026-02-06

---

## 项目概述

这是一个**多语言语言学习辅助 Web 应用**，核心功能是帮助用户通过跟读（Shadowing）方式学习外语。支持日语、俄语、英语、中文四种语言，提供语音合成、翻译、查词和生词本管理等功能。

| 属性 | 详情 |
|------|------|
| **项目名称** | 跟读助手 (PolyGlot Reader) |
| **技术栈** | React 19.2.0 + TypeScript 5.8 + Vite 6.2 + TailwindCSS |
| **目标平台** | 移动端 Web / PWA（针对 iOS/Android 优化） |
| **构建工具** | Vite 6.2.0 |

---

## 目录结构

```
跟读助手/
├── .env.local              # 环境变量（GEMINI_API_KEY）
├── .gitignore              # Git 忽略配置
├── index.html              # HTML 入口（含 Tailwind CDN）
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
│   └── googleTTS.ts        # Google 免费 TTS 服务
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
| **TTS 提供商** | SiliconFlow / Azure / Google / 浏览器 |
| **跟读模式** | 开关和间隔时间设置 |

---

## 技术架构

### 音频合成 (TTS) 四层架构

| 层级 | 服务 | 特点 | 文件 |
|------|------|------|------|
| **SiliconFlow TTS** | CosyVoice2/IndexTTS | 支持音色选择，返回 MP3 | [services/siliconFlow.ts](services/siliconFlow.ts) |
| **Azure TTS** | Azure Speech Services | 30+ 种神经网络音色，SSML 控制 | [services/azureTTS.ts](services/azureTTS.ts) |
| **Google TTS** | Google Translate TTS | 免费接口，智能长文本分块 (<180 字符) | [services/googleTTS.ts](services/googleTTS.ts) |
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

### 环境变量 (.env.local)

```
GEMINI_API_KEY=PLACEHOLDER_API_KEY
```

---

## 需要配置的 API

| 服务 | 必需性 | 用途 | 配置位置 |
|------|--------|------|----------|
| **SiliconFlow** | 必需 | AI 翻译、查词、OCR、TTS | SettingsView |
| Azure Speech | 可选 | 高质量语音合成 | SettingsView |
| Google TTS | 可选 | 免费语音合成 (无需 API Key) | - |
| 浏览器 TTS | 可选 | 原生语音合成 (无需 API Key) | - |

**SiliconFlow API Base URL:** `https://api.siliconflow.cn/v1`

---

## 构建配置

### Vite Config ([vite.config.ts](vite.config.ts))

```typescript
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
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
| [services/googleTTS.ts](services/googleTTS.ts) | Google 免费 TTS |
| [hooks/useLocalStorage.ts](hooks/useLocalStorage.ts) | 本地存储 |
| [types.ts](types.ts) | 类型定义 |
