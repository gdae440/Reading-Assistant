# 生词复习系统开发文档

## 目标

把现有“生词本”从收藏列表升级为轻量复习系统，保持本地优先、无账号、低维护成本。第一版只覆盖以下能力：

- 生词熟悉度：新词 / 认识 / 掌握
- 今日复习
- 错词优先
- 在文章阅读区自动标出已收藏词

不做“每个词保留来源句子”的新增能力。当前 `WordEntry.contextSentence` 字段可以继续兼容旧数据和 Anki 导出，但本次升级不围绕来源句子设计流程。

## 非目标

- 不引入用户系统或云同步。
- 不改变 API Key 的浏览器本地保存方式。
- 不做复杂 SM-2 算法或长期记忆曲线建模。
- 不强制用户每天打卡。
- 不修改现有查词、翻译、OCR、TTS 的主流程。

## 现状

关键文件：

- `types.ts`: `WordEntry` 只有词条、释义、读音、时间戳等基础字段。
- `App.tsx`: `polyglot_vocab` 通过 `useLocalStorage` 持久化。
- `views/VocabularyView.tsx`: 负责分组展示、生词删除、Anki 导出、历史查看。
- `views/ReaderView.tsx`: 阅读区按 chunk 渲染文章，并支持点击查词。

现有生词去重逻辑按 `word.toLowerCase()` 判断重复。该规则保留。

## 数据模型

扩展 `WordEntry`：

```ts
export type VocabFamiliarity = 'new' | 'known' | 'mastered';

export interface WordEntry {
  id: string;
  word: string;
  reading?: string;
  ipa?: string;
  meaningCn: string;
  meaningRu: string;
  contextSentence?: string;
  timestamp: number;

  familiarity?: VocabFamiliarity;
  reviewStats?: {
    dueAt: number;
    lastReviewedAt?: number;
    reviewCount: number;
    correctCount: number;
    wrongCount: number;
  };
}
```

兼容策略：

- 旧词条没有 `familiarity` 时视为 `new`。
- 旧词条没有 `reviewStats` 时在读数据时用派生默认值，不需要一次性写回。
- 第一次复习后再把 `reviewStats` 写入 localStorage。

默认值：

```ts
const defaultReviewStats = (timestamp: number) => ({
  dueAt: timestamp,
  reviewCount: 0,
  correctCount: 0,
  wrongCount: 0
});
```

## 熟悉度规则

三个状态含义：

- `new`: 新词，还没有稳定记住。
- `known`: 认识，但仍需要复习。
- `mastered`: 已掌握，默认不进入今日复习，但仍可在列表里看到。

状态更新：

- 用户点“认识”：`new -> known`，`known -> mastered`，`mastered` 保持。
- 用户点“不认识”：状态降到 `new`。
- 用户可以在生词本里手动切换状态。

复习间隔采用轻量规则：

```ts
const nextDueDelayDays = {
  new: 1,
  known: 3,
  mastered: 14
};
```

回答正确后：

- `reviewCount + 1`
- `correctCount + 1`
- `lastReviewedAt = now`
- 根据新熟悉度设置 `dueAt`

回答错误后：

- `reviewCount + 1`
- `wrongCount + 1`
- `lastReviewedAt = now`
- `familiarity = 'new'`
- `dueAt = now`

## 今日复习

今日复习列表定义：

```ts
const isDueToday = (entry: WordEntry, now = Date.now()) => {
  const stats = normalizedReviewStats(entry);
  return entry.familiarity !== 'mastered' && stats.dueAt <= endOfToday(now);
};
```

排序规则：

1. 错词优先：`wrongCount` 高的在前。
2. 到期更早的在前。
3. 新增更早的在前。

展示位置：

- `VocabularyView` 顶部增加一个紧凑的“今日复习”区域。
- 显示数量：`今日待复习 N`。
- 点击进入复习模式。

复习模式第一版保持简单：

- 卡片正面：单词、读音/IPA。
- 点击“显示释义”后显示中文/俄文释义。
- 底部两个操作：`不认识`、`认识`。
- 复习完显示空状态：今日已完成。

## 错词优先

错词来源：

- 复习时点击“不认识”。

错词展示：

- 生词本顶部显示 `错词 N`，N 为 `wrongCount > 0 && familiarity !== 'mastered'` 的数量。
- 今日复习排序优先展示错词。
- 生词列表中给错词加一个低调标记，例如 `错 3`。

错词清除：

- 当词条进入 `mastered` 后，不删除 `wrongCount`，但不再显示为当前错词。
- 这样保留历史统计，同时减少界面噪音。

## 文章内标出已收藏词

目标：

- 阅读文章时，已在生词本中的词自动高亮。
- 高亮不能覆盖“AI 重点句”样式，需要两者能共存。

数据传递：

- `App.tsx` 将 `vocab` 传给 `ReaderView`。
- `ReaderView` 构建 `savedWordSet`。

匹配规则第一版：

- 英语/俄语：大小写不敏感，去掉首尾标点后匹配。
- 中文/日语：按当前 chunk 精确匹配。
- 不做复杂词形还原，不做分词引擎。

建议 helper：

```ts
const normalizeWordKey = (value: string) =>
  value
    .trim()
    .replace(/^[^\w\u0400-\u04FF\u4e00-\u9fa5\u3040-\u30ff\u3400-\u4dbf]+|[^\w\u0400-\u04FF\u4e00-\u9fa5\u3040-\u30ff\u3400-\u4dbf]+$/g, '')
    .toLowerCase();
```

样式规则：

- 未收藏词：保持当前 hover 查词样式。
- 已收藏词：使用蓝绿色底色或下划线，避免和重点句的黄色冲突。
- 如果同时属于重点句和已收藏词：保留重点句底色，额外加已收藏词下划线或左侧标记。

点击行为：

- 已收藏词点击仍然执行查词。
- 后续可以考虑点击时优先展示本地生词卡，但第一版不做。

## UI 结构

`VocabularyView` 建议改成三段：

1. 顶部统计条
   - 总词数
   - 今日待复习
   - 错词数
   - 掌握数

2. 复习入口/复习卡片
   - 默认显示入口。
   - 进入复习模式后占据顶部主区域。

3. 原生词列表
   - 保留语言分组。
   - 每个词条增加熟悉度 badge 和错词次数。
   - 批量删除、Anki 导出保持原位置。

按钮文案：

- 状态：`新词`、`认识`、`掌握`
- 复习操作：`不认识`、`认识`
- 入口：`开始今日复习`

## 状态管理

`App.tsx` 需要新增更新入口：

```ts
const handleUpdateVocabEntry = (id: string, updates: Partial<WordEntry>) => {
  setVocab(current =>
    current.map(entry => entry.id === id ? { ...entry, ...updates } : entry)
  );
};
```

当前已经有同名能力给 `ReaderView` 使用。需要把它也传给 `VocabularyView`：

```tsx
<VocabularyView
  vocab={vocab}
  history={history}
  onRemove={handleRemoveFromVocab}
  onUpdate={handleUpdateVocabEntry}
/>
```

`VocabularyView` 只负责计算复习队列和触发更新，不直接操作 localStorage。

## 实现步骤

### 阶段 1：类型和工具函数

- 在 `types.ts` 增加 `VocabFamiliarity` 和 `reviewStats`。
- 新建 `utils/vocabReview.ts`。
- 实现：
  - `normalizeWordKey`
  - `normalizeVocabEntry`
  - `isDueToday`
  - `getReviewQueue`
  - `applyReviewResult`

### 阶段 2：生词本 UI

- 更新 `VocabularyView` props，接收 `onUpdate`。
- 顶部加入统计条。
- 加入今日复习入口。
- 实现复习卡片。
- 给词条显示熟悉度 badge 和错词次数。

### 阶段 3：阅读区收藏词高亮

- 更新 `ReaderView` props，接收 `vocab`。
- 构建 `savedWordSet`。
- 渲染 chunk 时计算 `isSavedWord`。
- 合并重点句和已收藏词样式。

### 阶段 4：兼容和导出

- Anki 导出保持现有字段。
- 不把复习统计写入 Anki CSV。
- 旧数据不需要迁移脚本，运行时兼容即可。

### 阶段 5：测试

建议先加 Vitest，再覆盖：

- 旧 `WordEntry` 缺少复习字段时能正常归一化。
- `applyReviewResult` 正确更新熟悉度和统计。
- 错词在复习队列中排在普通到期词前。
- `mastered` 不进入今日复习。
- `normalizeWordKey` 对大小写、首尾标点一致。
- 阅读区高亮匹配不会改变点击查词行为。

## 验收标准

- 老用户打开应用后，已有生词正常显示，不丢数据。
- 今日复习数量能正确反映到期且未掌握的词。
- 点击“不认识”后，该词立即成为错词，并优先出现在复习队列。
- 点击“认识”后，词条熟悉度按规则提升，并推迟下次复习时间。
- 掌握词不再进入今日复习。
- 阅读文章中已收藏词有明显但不刺眼的标识。
- Anki 导出仍能正常生成 CSV。
- `npm run build` 和 `npx tsc --noEmit` 通过。

## 后续可选增强

- 复习时支持键盘快捷键。
- 生词列表增加过滤器：全部 / 今日 / 错词 / 掌握。
- 复习卡片支持随机顺序。
- 给已收藏词点击弹窗增加“熟悉度”和“加入复习”操作。
- JSON 备份/恢复时包含复习统计。
