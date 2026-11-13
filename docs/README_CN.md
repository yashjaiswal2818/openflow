<div align="center">
  <h3>OpenFlow · 开源、100% 离线的本地语音操作系统</h3>
  <p><strong>智能听写 + 零样本语音克隆。一个本地应用，全程不联网。</strong></p>
  <p><a href="../README.md">English</a> • <strong>简体中文</strong> • <a href="README_JA.md">日本語</a> • <a href="README_DE.md">Deutsch</a> • <a href="README_ES.md">Español</a></p>
</div>

---

## OpenFlow 是什么？

OpenFlow 用同一个本地程序取代两类订阅服务：

1. **智能听写（Voice-IN）**：在任何应用中按住全局快捷键说话，松手后得到经过清洗、
   自动标点的文本，并直接输入到光标位置。
2. **零样本语音克隆（Voice-OUT）**：录制一次 5–15 秒的语音样本，之后就能用自己的声音
   离线合成语音、朗读屏幕上选中的文字。

不需要账号、不需要 API Key、没有遥测。所有音频、文本、声音档案与模型都保存在
`~/.openflow` 目录中；删除该目录即可彻底清除。

## 快速开始

环境要求：**Node.js 18+** 与 **Python 3.10+**。

```bash
git clone https://github.com/yashjaiswal2818/openflow.git
cd openflow
npm install
npm run dev          # 引擎 (127.0.0.1:18488) + Studio (localhost:1420)
```

打开 <http://localhost:1420>。

未安装麦克风依赖或 Whisper 时，引擎会自动进入 **演示模式**：模拟采集音频、生成演示
转写，但文本清洗、历史归档、WAV 保存与语音合成都是真实运行的。界面会持续显示
"demo mode" 徽标，接口返回也会带有 `demo: true`，绝不伪装成真实识别。

### 启用真实语音（可选）

```bash
pip install -r requirements.txt
npm run dev
```

安装完成后，在 **设置 → 诊断** 中可以看到麦克风、Whisper 后端、TTS 后端、剪贴板注入
的实际可用状态。

## 当前能力

| 能力 | 状态 |
| :--- | :--- |
| 确定性听写清洗（口头禅、结巴、语音标点、大小写、技术缩写） | ✅ 完成，20 个单元测试，单次 <1 ms |
| 双重录音保存（原始 WAV + 原始转写 + 清洗后文本） | ✅ 完成，可搜索、可导出 |
| 声音档案（浏览器录音 → 16 kHz WAV → 响度/削波校验 → 音高分析） | ✅ 完成 |
| 离线语音合成 | ✅ 可用（预览音质）；安装 Kokoro-82M 后升级为神经语音 |
| 全局快捷键 + 自动粘贴 | ✅ 已实现（需要 `pynput` 与剪贴板工具） |
| Whisper 转写 | ✅ 已实现（faster-whisper / whisper） |
| Kokoro-82M / Piper 适配器 | ⏳ 进行中 |
| Tauri 桌面外壳 | ⏳ 脚手架 |

## 模型档位

| 档位 | 语音识别 | 语音合成 | 目标延迟 | 内存 |
| :--- | :--- | :--- | :--- | :--- |
| ⚡ 极速 | `tiny.en` | Piper VITS | `<150 ms` | `<500 MB` |
| ⚖️ 均衡 | `small.en` | Kokoro-82M | `<350 ms` | `~1.5 GB` |
| 💎 专业 | `large-v3-turbo` | F5-TTS | 高保真 | `~4 GB` |

## 目录结构与测试

```text
engine/   Python 本地引擎（HTTP 守护进程，核心仅用标准库）
src/      React 19 + TypeScript + Tailwind v4 的 Studio 界面
tests/    62 个单元测试（清洗器、存储、音频、HTTP API）
src-tauri/ Tauri v2 桌面外壳（脚手架）
```

```bash
npm test        # TypeScript 类型检查 + 62 个引擎测试
npm run build   # 生产构建
```

详细架构、完整 API 与路线图请参阅 [英文 README](../README.md)。

## 许可证

[MIT](../LICENSE)
