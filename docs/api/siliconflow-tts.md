# SiliconFlow TTS API 文档

## 目录

- [1. 功能特性](#1-功能特性)
- [2. API 使用指南](#2-api-使用指南)
- [3. 系统预置音色](#21-系统预置音色)
- [4. 用户自定义音色](#22-用户预置音色)
- [5. 支持模型列表](#3-支持模型列表)
- [6. 参考音频最佳实践](#4-参考音频的最佳实践)
- [7. 使用示例](#5-使用示例)
- [8. API 参数详解](#8-api-参数详解)
- [相关链接](#相关链接)

---

## 1. 功能特性

文本转语音模型（TTS）是一种将文本信息转换为语音输出的 AI 模型，适用于多种应用场景：

- 为博客文章提供音频朗读
- 生成多语言语音内容
- 支持实时流媒体音频输出

---

## 2. API 使用指南

**端点**: `POST https://api.siliconflow.cn/v1/audio/speech`

**认证**: `Authorization: Bearer <API_KEY>`

### 主要请求参数

| 参数 | 类型 | 必填 | 默认值 | 范围 | 说明 |
|------|------|------|--------|------|------|
| model | string | 是 | - | - | TTS 模型名称 |
| input | string | 是 | - | 1-128000字符 | 待转换为音频的文本 |
| voice | string | 是* | - | - | 音色参数 (*使用动态音色时可为 empty) |
| response_format | string | 否 | mp3 | mp3/opus/wav/pcm | 输出音频格式 |
| sample_rate | number | 否 | 32000 | 见下方 | 输出采样率 |
| speed | number | 否 | 1.0 | 0.25-4.0 | 音频速度 |
| gain | number | 否 | 0.0 | -10~10 | 音频增益(dB) |
| stream | boolean | 否 | true | true/false | 是否流式输出 |
| references | object[] | 否 | - | - | 参考音频（与 voice 二选一） |
| max_tokens | number | 否 | 2048 | - | 最大生成 token 数 |

### sample_rate 有效值

| response_format | 支持的采样率 | 默认值 |
|-----------------|--------------|--------|
| opus | 48000 Hz | 48000 |
| wav, pcm | 8000, 16000, 24000, 32000, 44100 | 44100 |
| mp3 | 32000, 44100 | 44100 |

**注意**: 输入内容不要加空格，参考音频要小于 30s

---

## 2.1 系统预置音色

CosyVoice2 和 MOSS-TTSD 使用相同的 8 种系统预置音色：

| 音色 | 描述 | CosyVoice2 ID | MOSS-TTSD ID |
|------|------|---------------|---------------|
| anna | 沉稳女声 | `FunAudioLLM/CosyVoice2-0.5B:anna` | `fnlp/MOSS-TTSD-v0.5:anna` |
| bella | 激情女声 | `FunAudioLLM/CosyVoice2-0.5B:bella` | `fnlp/MOSS-TTSD-v0.5:bella` |
| claire | 温柔女声 | `FunAudioLLM/CosyVoice2-0.5B:claire` | `fnlp/MOSS-TTSD-v0.5:claire` |
| diana | 欢快女声 | `FunAudioLLM/CosyVoice2-0.5B:diana` | `fnlp/MOSS-TTSD-v0.5:diana` |
| alex | 沉稳男声 | `FunAudioLLM/CosyVoice2-0.5B:alex` | `fnlp/MOSS-TTSD-v0.5:alex` |
| benjamin | 低沉男声 | `FunAudioLLM/CosyVoice2-0.5B:benjamin` | `fnlp/MOSS-TTSD-v0.5:benjamin` |
| charles | 磁性男声 | `FunAudioLLM/CosyVoice2-0.5B:charles` | `fnlp/MOSS-TTSD-v0.5:charles` |
| david | 欢快男声 | `FunAudioLLM/CosyVoice2-0.5B:david` | `fnlp/MOSS-TTSD-v0.5:david` |

---

## 2.2 用户预置音色

> **注意**: 使用用户预置音色，需要进行实名认证。

### 2.2.1 上传音色（Base64 编码）

```python
import requests
import json

url = "https://api.siliconflow.cn/v1/uploads/audio/voice"
headers = {
    "Authorization": "Bearer your-api-key",
    "Content-Type": "application/json"
}
data = {
    "model": "FunAudioLLM/CosyVoice2-0.5B",
    "customName": "your-voice-name",
    "audio": "data:audio/mpeg;base64,...",
    "text": "参考音频的文字内容"
}

response = requests.post(url, headers=headers, data=json.dumps(data))
# 返回: {'uri': 'speech:your-voice-name:cm04pf7az00061413w7kz5qxs:mjtkgbyuunvtybnsvbxd'}
```

### 2.2.2 上传音色（文件上传）

```python
import requests

url = "https://api.siliconflow.cn/v1/uploads/audio/voice"
headers = {"Authorization": "Bearer your-api-key"}
files = {"file": open("audio.mp3", "rb")}
data = {
    "model": "FunAudioLLM/CosyVoice2-0.5B",
    "customName": "your-voice-name",
    "text": "参考音频的文字内容"
}

response = requests.post(url, headers=headers, files=files, data=data)
# 返回: {'uri': 'speech:your-voice-name:xxx:yyy'}
```

### 2.2.3 获取音色列表

```python
import requests

url = "https://api.siliconflow.cn/v1/audio/voice/list"
headers = {"Authorization": "Bearer your-api-key"}

response = requests.get(url, headers=headers)
# 返回音色 URI 列表
```

### 2.2.4 删除音色

```python
import requests

url = "https://api.siliconflow.cn/v1/audio/voice/deletions"
headers = {
    "Authorization": "Bearer your-api-key",
    "Content-Type": "application/json"
}
payload = {
    "uri": "speech:your-voice-name:cm02pf7az00061413w7kz5qxs:mttkgbyuunvtybnsvbxd"
}

response = requests.post(url, json=payload, headers=headers)
```

---

## 3. 支持模型列表

| 模型 | 特点 |
|------|------|
| **FunAudioLLM/CosyVoice2-0.5B** | 跨语言合成（中/英/日/韩/方言）、情感控制、细粒度控制 |
| **fnlp/MOSS-TTSD-v0.5** | 高表现力对话、双人语音克隆、中英双语、长文本生成 |

---

## 4. 参考音频的最佳实践

### 4.1 音频质量指南

- 仅限单一说话人
- 吐字清晰、稳定的音量、音调和情绪
- 简短的停顿（建议 0.5 秒）
- 无背景噪音、专业录音质量、无房间回声
- 建议时长：8-10 秒左右

### 4.2 文件格式

- 支持格式：mp3, wav, pcm, opus
- 推荐使用 192kbps 以上的 mp3

---

## 5. 使用示例

### 5.1 使用系统预置音色（CosyVoice2）

```python
from pathlib import Path
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://api.siliconflow.cn/v1"
)

with client.audio.speech.with_streaming_response.create(
    model="FunAudioLLM/CosyVoice2-0.5B",
    voice="FunAudioLLM/CosyVoice2-0.5B:alex",
    input="你能用高兴的情感说吗？<|endofprompt|>今天真是太开心了！",
    response_format="mp3"
) as response:
    response.stream_to_file("output.mp3")
```

### 5.2 使用用户预置音色

```python
voice = "speech:your-voice-name:cm02pf7az00061413w7kz5qxs:mttkgbyuunvtybnsvbxd"

with client.audio.speech.with_streaming_response.create(
    model="FunAudioLLM/CosyVoice2-0.5B",
    voice=voice,
    input="请问你能模仿粤语的口音吗？",
    response_format="mp3"
) as response:
    response.stream_to_file("output.mp3")
```

### 5.3 使用动态音色（带参考音频）

```python
with client.audio.speech.with_streaming_response.create(
    model="FunAudioLLM/CosyVoice2-0.5B",
    voice="",
    input="[laughter]有时候，看着小孩子们的天真行为[laughter]",
    response_format="mp3",
    extra_body={
        "references": [{
            "audio": "https://sf-maas-xxx.oss-cn-shanghai.aliyuncs.com/voice_template/fish_audio-Alex.mp3",
            "text": "参考音频的文字内容"
        }]
    }
) as response:
    response.stream_to_file("output.mp3")
```

### 5.4 MOSS-TTSD-v0.5 双人对话

```python
import requests
import json

url = "https://api.siliconflow.cn/v1/audio/speech"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY"
}
data = {
    "model": "fnlp/MOSS-TTSD-v0.5",
    "stream": True,
    "input": "[S1]Hello, how are you today?[S2]I'm doing great![S1]That's wonderful!",
    "references": [
        {
            "audio": "https://sf-maas-xxx.oss-cn-shanghai.aliyuncs.com/voice_template/fish_audio-Charles.mp3",
            "text": "参考音频1的文字"
        },
        {
            "audio": "https://sf-maas-xxx.oss-cn-shanghai.aliyuncs.com/voice_template/fish_audio-Claire.mp3",
            "text": "参考音频2的文字"
        }
    ],
    "max_tokens": 1600,
    "response_format": "mp3",
    "speed": 1,
    "gain": 0
}

res = requests.post(url, data=json.dumps(data), headers=headers)
with open("dialogue.mp3", "wb") as f:
    f.write(res.content)
```

---

## 8. API 参数详解

### CosyVoice2-0.5B

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| model | enum | 是 | - | `FunAudioLLM/CosyVoice2-0.5B` |
| input | string | 是 | - | 支持 `<|endofprompt|>` 添加情感描述，支持 `[laughter]`、`[breath]` 等标记 |
| voice | enum | 是* | - | 系统预置音色 (*使用 references 时可为 empty) |
| references | object[] | 否 | - | 参考音频，与 voice 二选一 |
| response_format | enum | 否 | mp3 | mp3/opus/wav/pcm |
| sample_rate | number | 否 | 32000 | 采样率 |
| stream | boolean | 否 | true | 是否流式输出 |
| speed | number | 否 | 1.0 | 0.25-4.0 |
| gain | number | 否 | 0.0 | -10~10 |

**references 对象结构**:
```json
{
  "audio": "https://... 或 base64编码",
  "text": "参考音频的文字内容"
}
```

### MOSS-TTSD-v0.5

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| model | enum | 是 | - | `fnlp/MOSS-TTSD-v0.5` |
| input | string | 是 | - | 使用 `[S1]`、`[S2]` 标记说话人 |
| references | object[] | 是* | - | 需要两个音色实现双人对话 (*使用 voice 时可为单个) |
| voice | enum | 是* | - | 单音色 (*与 references 二选一) |
| max_tokens | integer | 否 | 2048 | 最大生成 token 数 |
| response_format | enum | 否 | mp3 | mp3/opus/wav/pcm |
| sample_rate | number | 否 | 32000 | 采样率 |
| stream | boolean | 否 | true | 是否流式输出 |
| speed | number | 否 | 1.0 | 0.25-4.0 |
| gain | number | 否 | 0.0 | -10~10 |

---

## 相关链接

- [上传参考音频](https://docs.siliconflow.cn/cn/api-reference/audio/upload-voice)
- [创建文本转语音请求](https://docs.siliconflow.cn/cn/api-reference/audio/create-speech)
- [参考音频列表获取](https://docs.siliconflow.cn/cn/api-reference/audio/voice-list)
- [删除参考音频](https://docs.siliconflow.cn/cn/api-reference/audio/delete-voice)
- [创建语音转文本请求](https://docs.siliconflow.cn/cn/api-reference/audio/create-audio-transcriptions)
- [SiliconFlow 文档首页](https://docs.siliconflow.cn/)
- [模型广场](https://cloud.siliconflow.cn/models)
