<div align="center">
  <h1>⚡ OpenFlow</h1>
  <h3>The Open-Source, Local-First Voice OS</h3>
  <p><strong>Intelligent Wispr Flow dictation + Zero-shot voice cloning. 100% offline on your device.</strong></p>

  <p>
    <a href="#quick-start"><img src="https://img.shields.io/badge/Status-Beta%20v1.0-6366f1?style=for-the-badge" alt="Status" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge" alt="License" /></a>
    <a href="#privacy"><img src="https://img.shields.io/badge/Privacy-100%25%20Offline-pink?style=for-the-badge" alt="Offline" /></a>
    <a href="#presets"><img src="https://img.shields.io/badge/Models-Fast%20%7C%20Balanced%20%7C%20Pro-purple?style=for-the-badge" alt="Presets" /></a>
  </p>

  <p>
    <a href="#features">Features</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#model-presets">Model Presets</a> •
    <a href="#roadmap">Roadmap</a>
  </p>

  <p><sub>
    <strong>English</strong> • <a href="docs/README_CN.md">简体中文</a> • <a href="docs/README_JA.md">日本語</a> • <a href="docs/README_DE.md">Deutsch</a> • <a href="docs/README_ES.md">Español</a>
  </sub></p>
</div>

---

## 🌟 Why OpenFlow?

Paid subscriptions like **Wispr Flow** ($15/mo) and **ElevenLabs** ($30/mo) charge continuous fees and send your private microphone recordings and sensitive documents to third-party cloud servers.

**OpenFlow replaces both tools with one lightweight, local-first desktop application:**
1. **Intelligent Dictation (Voice-IN)**: Hold a global hotkey anywhere (`Ctrl+Space` / `Fn`), speak naturally, and get cleaned, punctuated, stutter-free text typed directly into whichever application you are using.
2. **Zero-Shot Voice Cloning (Voice-OUT)**: Record a 5–15 second audio sample once. OpenFlow synthesizes speech in your own voice offline.
3. **Dual Recording Preservation**: Saves timestamped raw `.wav` audio snippets alongside intelligent transcriptions so you never lose your original thoughts.

---

## 🚀 Comparison Matrix

| Feature | Wispr Flow | ElevenLabs | **OpenFlow** |
| :--- | :---: | :---: | :---: |
| **Price** | $15 / month | $5 - $330 / month | **Free & Open Source** |
| **Privacy** | Cloud uploads | Cloud uploads | **100% Local & Offline** |
| **Intelligent Dictation** | ✅ | ❌ | **✅ Built-in** |
| **Voice Cloning & TTS** | ❌ | ✅ | **✅ Built-in** |
| **Filler Word Removal** | ✅ | ❌ | **✅ Built-in ("uh", "um", "like")** |
| **Spoken Punctuation** | ✅ | ❌ | **✅ Built-in ("comma", "new line")** |
| **Preserves Raw Audio** | ❌ | ❌ | **✅ Timestamped .wav archive** |
| **Floating Dynamic Pill HUD** | ✅ | ❌ | **✅ Glassmorphic Waveform** |

---

## 🧠 Architecture

```mermaid
flowchart LR
    subgraph Input ["Voice Input (Dictation)"]
        MIC["Microphone"] --> VAD["Silero VAD (Silence Trimming)"]
        VAD --> RAW["Save Raw Audio Snippet (.wav)"]
        VAD --> STT["Whisper Engine (Local)"]
        STT --> CLEANER["Intelligent NLP Cleaner\n- Removes 'uh/um'\n- Collapses stutters\n- Formats punctuation"]
        CLEANER --> PASTE["Auto-Paste into Active App"]
    end

    subgraph Output ["Voice Output (Cloning)"]
        REF["5-15s Voice Sample"] --> PROFILE["Speaker Profile Extraction"]
        PROFILE --> TTS["Zero-Shot TTS (Kokoro / Piper)"]
        TTS --> AUDIO["Audio Playback / Read Back"]
    end

    Input <--> HUD["Floating HUD Overlay"]
    Output <--> HUD
```

---

## ⚡ Model Presets

OpenFlow provides 3 performance tiers to run optimally on any hardware:

| Preset | STT Model | TTS / Cloning | Latency | Target Machine |
| :--- | :--- | :--- | :--- | :--- |
| ⚡ **Fast** | Whisper Tiny / Base | Piper TTS | `<150ms` | Any laptop / CPU |
| ⚖️ **Balanced** | Whisper Small (q5) | Kokoro-82M | `<400ms` | Apple Silicon / 8GB RAM |
| 💎 **Pro Studio** | Whisper Large-v3 Turbo | F5-TTS / Zero-Shot | High fidelity | High-end GPU / 16GB+ Mac |

---

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+ & npm
- Python 3.10+ (for local AI engine)

### Run OpenFlow Locally

```bash
# 1. Clone repository
git clone https://github.com/your-username/openflow.git
cd openflow

# 2. Install dependencies
npm install

# 3. Start local engine daemon
npm run engine &

# 4. Start OpenFlow Studio & Floating HUD
npm run dev
```

---

## 📁 Repository Structure

```
openflow/
├── engine/                       # Python AI & Audio Processing Pipeline
│   ├── dictation_cleaner.py      # Intelligent deterministic cleanup engine
│   ├── voice_cloner.py           # Zero-shot speaker profile & TTS engine
│   ├── models_manager.py         # Fast / Balanced / Pro tier manager
│   ├── history_manager.py        # Dual archive: raw .wav + clean text
│   └── server.py                 # Local IPC HTTP daemon (localhost:18488)
├── src-tauri/                    # Rust Desktop Shell
│   ├── src/main.rs               # Background daemon & global hotkeys
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Native window & tray configuration
├── src/                          # Modern React + Tailwind Frontend
│   ├── components/
│   │   ├── FloatingPill.tsx      # Wispr Flow style Dynamic Island HUD
│   │   └── StudioDashboard.tsx   # Full audio workstation & settings
│   ├── App.tsx                   # Main container
│   └── index.css                 # Glassmorphic UI & waveform animations
├── package.json
└── vite.config.ts
```

---

## 🔒 Privacy & Local-First Guarantee

- **Zero Cloud Calls**: No audio data or transcripts ever leave your local machine.
- **Zero API Keys Required**: All models run locally on your CPU or GPU.
- **Your Data Stays Yours**: Recordings and voice profiles are stored in `~/.openflow/`.

---

## 📄 License

OpenFlow is open-source software licensed under the [MIT License](LICENSE).
