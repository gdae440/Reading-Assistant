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
