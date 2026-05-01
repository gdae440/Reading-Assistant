# 跟读助手项目升级开发文档

## 文档目的

这是项目级升级路线图，用来统筹后续开发方向。专项功能文档继续单独维护，例如：

- 生词复习系统：[docs/vocabulary-review-system.md](vocabulary-review-system.md)

本文覆盖：

- 稳定性和测试
- ReaderView 架构拆分
- 跟读体验升级
- 生词复习系统
- PWA、离线和备份
- AI 输出结构化校验
- 部署策略

## 当前状态

已完成或基本完成：

- Edge TTS API 基础防护：请求体上限、来源检查、限流、明确错误状态。
- 生词复习系统第一版：
  - 熟悉度：新词 / 认识 / 掌握
  - 今日复习
  - 错词优先
  - 文章内已收藏词高亮
  - FSRS-lite 调度
  - 四档评分：不认识 / 困难 / 认识 / 掌握
  - `reviewStats` 和 `reviewLog`
- Vitest 已接入，用于复习调度核心逻辑。
- JSON 备份/恢复已完成基础能力：可导出设置、生词、复习记录、历史记录和阅读文本；导入时做 schema 检查和旧生词归一化。

明确不做或暂不做：

- 不修改 API Key 本地保存方案。
- 不做“每个词保留来源句子”的新增能力。
- 不做语音跟读评分、录音回放、ASR 发音打分。
- 不做复习卡键盘快捷键，主要体验面向手机端。
- 不做账号系统或自动云同步。
- 不做 Netlify 部署策略，项目部署方向固定为 Vercel。
- 不直接复刻墨墨私有 MM/MMX 算法；优先走公开 FSRS-compatible 路线。

## 当前收口状态

收口日期：2026-05-01。

本轮已完成：

- P0 测试和稳定性补强。
- ReaderView 基础拆分。
- 跟读播放高亮、底部句子轨道、单句循环和从指定句继续播放。
- Edge/API TTS 的全文音频缓存和时间线估算高亮。
- 移除 A-B repeat。
- 播放器底部布局多轮移动端/桌面端适配。
- JSON 备份/恢复基础能力。

本轮最后验证：

- `npm test` 通过。
- `npx tsc --noEmit` 通过。
- `npm run build` 通过。

注意：

- 当前工作区有未提交改动，除非明确要求，不要提交。
- 继续开发前先看 `git status --short`，不要回滚用户或上轮开发留下的改动。
- 下一步优先进入“AI 输出结构化校验”。

## P0：测试和稳定性

目标：让核心逻辑可回归，避免后续重构 ReaderView 和调度算法时破坏功能。

现状：

- 已安装 Vitest。
- 已覆盖 `utils/vocabReview.ts`。
- 已覆盖 `api/edge-tts.ts` 的输入校验、来源拦截、请求体大小和限流。
- 已抽出并覆盖 `utils/textSegmentation.ts`、`utils/ttsCache.ts`、`utils/ankiExport.ts`、`utils/settingsMigration.ts`。

已完成：

1. Edge TTS API 测试
   - 输入为空返回 400。
   - voice 格式非法返回 400。
   - 请求体超过上限返回 413。
   - 跨来源生产请求返回 403。
   - 超过限流返回 429。

2. 断句逻辑测试
   - 中英文标点。
   - 多段落换行。
   - 长句切分。
   - 空文本处理。

3. TTS 缓存 key 测试
   - provider、voice、speed、model、region 变化时 key 不相同。
   - 同配置同文本 key 稳定。

4. localStorage 数据迁移测试
   - 旧 `polyglot_settings` 里的 Key 能迁移到 `polyglot_secret_keys`。
   - 旧生词缺少 `reviewStats`、`reviewLog` 时能正常归一化。

5. Anki/CSV 导出转义测试
   - HTML 转义。
   - CSV 引号转义。
   - 公式注入防护。

待做：

- 浏览器环境下的集成回归：确认导出按钮、TTS 播放和设置迁移在真实 UI 中仍保持原行为。
- 后续如果继续拆 `ReaderView`，每抽出一个 hook 先补对应测试，再移动 UI 调用。

验收标准：

- `npm test` 通过。
- `npx tsc --noEmit` 通过。
- `npm run build` 通过。

## P0：ReaderView 拆分

目标：降低 [views/ReaderView.tsx](../views/ReaderView.tsx) 的复杂度。当前它同时承担输入、OCR、TTS、查词、翻译、分析、导出、播放器状态和 UI 渲染，后续继续加功能会越来越难维护。

拆分原则：

- 第一轮只移动代码，不改变行为。
- 先抽纯逻辑和 hook，再抽 UI 组件。
- 每一步都保持构建通过。

计划拆分：

1. `utils/textSegmentation.ts`（已完成基础抽离）
   - `splitTextIntoSentences`
   - `splitBrowserSpeechSegments`
   - 语言/字符相关 helper

2. `utils/ttsCache.ts`（已完成基础抽离）
   - TTS cache key 生成
   - LRU URL 缓存 helper

3. `hooks/useTTSPlayback.ts`（已完成基础抽离）
   - 播放状态
   - stop / pause / resume
   - browser TTS 和 API TTS 播放流程
   - 跟读模式播放循环

4. `hooks/useWordLookup.ts`（已完成基础抽离）
   - 单词清洗
   - 弹窗位置计算
   - 查词请求
   - 自动加入生词本

5. `hooks/useTextAnalysis.ts`（已完成基础抽离）
   - 翻译
   - 俄语回复
   - AI 分析
   - CSV 导出

6. UI 组件（已完成基础抽离）
   - `ReaderToolbar`（已完成基础抽离）
   - `VoiceSelector`（已完成基础抽离）
   - `PlaybackControls`（已完成基础抽离）
   - `AnalysisPanel`（已完成基础抽离）
   - `ReaderTextArea`（已完成基础抽离）
   - `ReaderContent`（已完成基础抽离）

验收标准：

- 拆分后功能不变。
- ReaderView 行数明显下降。
- `npm test`、`npx tsc --noEmit`、`npm run build` 通过。

## P0：跟读体验升级

目标：强化产品核心体验，让用户能看到当前听到哪里，并能围绕句子做点读和循环练习。

功能范围：

1. 当前播放句子高亮（已完成基础能力）
   - 播放时定位当前句子。
   - 阅读模式里高亮当前句。
   - 普通朗读和跟读模式都支持。

2. 句子列表和进度（已完成基础能力）
   - 显示当前句 / 总句数。
   - 进度条或紧凑计数器。
   - 可点击某句开始播放。

3. 单句循环（已完成基础能力）
   - 当前句重复播放。
   - 适合精听和模仿。

验收标准：

- 用户能明确看到当前播放句子。
- 用户能点击某句单独播放，也能从该句继续播放到结尾。
- 单句循环不影响原有全文播放。

## P1：生词复习系统

专项文档：[docs/vocabulary-review-system.md](vocabulary-review-system.md)

当前状态：

- 第一版核心功能已完成。
- FSRS-lite 已实现。
- 已记录 `reviewLog`，为后续完整 FSRS 参数优化做准备。

剩余方向：

1. 复习完成总结
   - 本轮复习数量。
   - 错词数量。
   - 掌握数量。
   - 下次到期预估。

2. 单词复习详情
   - 复习次数。
   - 错词次数。
   - 上次复习。
   - 下次复习。
   - D/S/R 状态。

3. 完整 FSRS 默认参数版本
   - 从 FSRS-lite 升级到更接近公开 FSRS 默认参数公式。
   - 暂不做个人参数优化器。

4. 本地参数优化器
   - 需要足够复习日志后再做。
   - 可能需要 Web Worker，避免阻塞 UI。

## P1：PWA、离线和备份

目标：保护学习数据，并提升移动端可用性。

功能范围：

1. JSON 备份/恢复（已完成基础能力）
   - 导出生词。
   - 导出复习统计。
   - 导出复习日志。
   - 导出历史记录。
   - 导出设置。
   - 导入时做 schema 检查和版本兼容。

2. PWA 离线能力
   - Service Worker。
   - 离线打开最近文章。
   - 静态资源缓存。

3. 安装体验
   - manifest。
   - 图标。
   - iOS/Android 添加到主屏幕后显示正常。

## P1：AI 输出结构化校验

目标：降低 LLM 输出不稳定造成的空结果或 JSON 解析失败。

待做：

1. 查词结果校验
   - `word`
   - `cn`
   - `ipa`
   - `reading`
   - `ru`

2. 分析结果校验
   - `collocations`
   - `vocabulary`
   - `sentences`

3. JSON 修复重试
   - 第一次解析失败后，要求模型修复 JSON。
   - 最多重试一次。

4. 降级策略
   - 无法解析时返回空结构。
   - UI 给明确错误，而不是静默失败。

实现建议：

- 不一定马上引入大型 schema 库。
- 可以先写轻量 TypeScript type guard。

## P1：部署策略固定为 Vercel

目标：避免误触 Netlify 导致重复部署和额度消耗。

待做：

1. README 明确：
   - 推荐部署平台：Vercel。
   - 不维护 Netlify 部署配置。

2. 文档说明：
   - 本仓库没有 `netlify.toml`。
   - 本仓库没有 Netlify deploy script。
   - 如果 Netlify 自动部署，需要检查 Netlify site 的 linked repository 和 GitHub App 授权。

3. 可选：
   - 增加 `docs/deployment.md`。
   - 写清楚 Vercel 部署和 Edge TTS Function 注意事项。

## P2：完整 FSRS 参数优化

目标：从 FSRS-lite 升级到更完整的 FSRS 个性化调度。

前置条件：

- 已有 `reviewLog`。
- 用户积累足够复习记录。
- 默认参数调度稳定。

待研究：

- 采用哪个公开 FSRS 版本。
- 是否引入现成 JS 实现。
- 是否在 Web Worker 中计算。
- 参数优化触发方式：手动按钮或后台空闲时计算。

风险：

- 记录太少时参数不可靠。
- 计算复杂度可能影响前端响应。
- FSRS 版本变化会带来迁移成本。

## 推荐下一步

建议顺序：

1. **AI 输出结构化校验**
   - 先写轻量 TypeScript type guard。
   - 查词和分析结果解析失败时给明确降级。

2. **复习完成总结**
   - 复习结束后给本轮数量、错词、掌握和下次到期预估。

3. **单词复习详情**
   - 作为可选增强，在生词本或复习卡里显示复习次数、错词次数和 D/S/R 状态。

4. **部署策略文档**
   - 明确推荐 Vercel。
   - 写清 Edge TTS Function 注意事项。

5. **PWA 离线能力和安装体验**
   - 离线打开最近文章。
   - iOS/Android 添加到主屏幕后显示正常。

6. **完整 FSRS 默认参数版本**
   - 从 FSRS-lite 升级到更接近公开 FSRS 默认参数公式。

7. **本地参数优化器**
   - 等复习日志足够后再做，优先放到 Web Worker，避免阻塞 UI。
