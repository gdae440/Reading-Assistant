# 跟读助手

一个语言学习辅助工具，支持多语言（TTS）朗读、单词查询、生词本管理。

## 功能特性

- **多引擎 TTS**: 支持浏览器本地语音、SiliconFlow (CosyVoice2)、Azure AI、Edge 免费云端实验模式
- **智能语言检测**: 自动识别中日俄英四种语言
- **单词查询**: AI 释义 + 例句生成
- **生词本**: 收藏并管理生词
- **跟读模式**: 逐句朗读练习

## 运行方式

**前置要求:** Node.js

1. 安装依赖:
   ```bash
   npm install
   ```

2. 启动后在应用“设置”里填写自己的 API Key:
   - SiliconFlow Key 用于 AI 翻译、OCR、查词和 SiliconFlow 语音
   - Azure Speech Key 为可选项，仅在选择 Azure TTS 时需要
   - Edge 免费云端模式不需要用户 Key，但会通过本项目 `/api/edge-tts` 转发到非官方 Edge Read Aloud 服务
   - Key 只保存在当前浏览器本机，不需要配置 `.env.local`

3. 启动开发服务器:
   ```bash
   npm run dev
   ```

## 技术栈

- React + TypeScript + Vite
- Web Speech API (浏览器 TTS)
- SiliconFlow API (CosyVoice2 TTS)
- Azure AI Speech (TTS)
- Edge Read Aloud 非官方 TTS 兼容接口 (`/api/edge-tts`)

## Edge 免费云端 TTS 维护说明

生产环境的 `/api/edge-tts` 是 Vercel Serverless Function。为了避免 Vercel 函数打包时漏掉 `api/` 外部的 TypeScript helper，生产合成逻辑必须保留在 [api/edge-tts.ts](api/edge-tts.ts) 单文件内；[server/edgeTTS.ts](server/edgeTTS.ts) 只供本地 Vite dev middleware 使用。

如果线上出现 `Edge TTS Error 500` 或 `FUNCTION_INVOCATION_FAILED`：

1. 先看 Vercel 函数日志：
   ```bash
   vercel logs <deployment-id> --project musicianra --no-follow --expand --limit 100
   ```
2. 直接验证生产接口：
   ```bash
   curl -s -D /tmp/edge-tts-headers.txt -o /tmp/edge-tts.mp3 \
     -X POST https://musicianra.vercel.app/api/edge-tts \
     -H 'Content-Type: application/json' \
     --data '{"text":"hello","voice":"en-US-AvaMultilingualNeural","speed":1}'
   ```
3. 成功时应返回 `HTTP 200`、`content-type: audio/mpeg`，并生成非空 MP3 文件。

2026-04-28 的线上 500 根因是 Vercel 日志中的 `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/server/edgeTTS.ts'`。修复方式是把生产函数依赖内联到 `api/edge-tts.ts`，确保 Vercel 打包出的函数启动时不再跨目录 import `server/edgeTTS.ts`。
