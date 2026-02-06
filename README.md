# 跟读助手

一个语言学习辅助工具，支持多语言（TTS）朗读、单词查询、生词本管理。

## 功能特性

- **多引擎 TTS**: 支持浏览器内置语音、SiliconFlow (CosyVoice2)、Azure AI
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

2. 配置 API Key (在 [.env.local](.env.local)):
   - `GEMINI_API_KEY` - 保留用于环境变量兼容（当前使用 SiliconFlow API）
   - `SILICONFLOW_API_KEY` - SiliconFlow API Key

3. 启动开发服务器:
   ```bash
   npm run dev
   ```

## 技术栈

- React + TypeScript + Vite
- Web Speech API (浏览器 TTS)
- SiliconFlow API (CosyVoice2 TTS)
- Azure AI Speech (TTS)
