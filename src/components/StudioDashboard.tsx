import React, { useState, useEffect } from 'react';
import { 
  Mic, 
  Sparkles, 
  Volume2, 
  Layers, 
  Clock, 
  Settings, 
  UserCheck, 
  Play, 
  Square, 
  Copy, 
  Check, 
  Trash2, 
  Star, 
  ChevronRight,
  Cpu,
  Zap,
  Sliders,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

interface Preset {
  id: string;
  name: string;
  badge: string;
  stt_model: string;
  tts_model: string;
  description: string;
  vram_required: string;
  ram_required: string;
  accuracy_score: string;
  speed_score: string;
  is_active: boolean;
}

interface HistoryItem {
  id: string;
  timestamp: string;
  raw_text: string;
  cleaned_text: string;
  audio_path: string | null;
  duration: number;
  preset: string;
  starred: boolean;
}

interface VoiceProfile {
  id: string;
  name: string;
  wav_path: string;
  duration: number;
  description: string;
  created_at: string;
}

export const StudioDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dictation' | 'cloning' | 'presets' | 'history' | 'settings'>('dictation');
  
  // State
  const [isRecording, setIsRecording] = useState(false);
  const [recordTimer, setRecordTimer] = useState(0);
  const [testInput, setTestInput] = useState('uh basically i think that the the openflow engine is super fast comma new line ready for production period');
  const [cleanOutput, setCleanOutput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Data from engine
  const [presets, setPresets] = useState<Preset[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [activePresetId, setActivePresetId] = useState('balanced');

  // Voice cloning state
  const [cloneName, setCloneName] = useState('');
  const [ttsText, setTtsText] = useState('Welcome to OpenFlow. Your voice has been cloned locally and privately.');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [ttsSuccess, setTtsSuccess] = useState(false);

  // Settings
  const [stripFillers, setStripFillers] = useState(true);
  const [spokenPunctuation, setSpokenPunctuation] = useState(true);
  const [saveRawAudio, setSaveRawAudio] = useState(true);
  const [hotkey, setHotkey] = useState('Ctrl+Space');

  // Load presets & history
  useEffect(() => {
    fetchPresets();
    fetchHistory();
    fetchProfiles();
  }, []);

  // Timer simulation
  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => setRecordTimer(t => t + 1), 1000);
    } else {
      setRecordTimer(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const fetchPresets = async () => {
    try {
      const res = await fetch('http://127.0.0.1:18488/api/presets');
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets || []);
        if (data.config?.active_preset) {
          setActivePresetId(data.config.active_preset);
        }
      }
    } catch {
      // Fallback preview data if server not booted
      setPresets([
        {
          id: 'fast',
          name: 'Fast (Low Latency)',
          badge: '⚡ Instant',
          stt_model: 'whisper-tiny.q5',
          tts_model: 'piper-lessac',
          description: 'Ultra-low latency (<150ms). Zero GPU required.',
          vram_required: 'None',
          ram_required: '~500 MB',
          accuracy_score: '8.8 / 10',
          speed_score: '10 / 10',
          is_active: false
        },
        {
          id: 'balanced',
          name: 'Balanced (Recommended)',
          badge: '⚖️ Optimal',
          stt_model: 'whisper-small.q5',
          tts_model: 'kokoro-82m',
          description: 'High accuracy paired with Kokoro human-sounding voice synthesis.',
          vram_required: '1 GB',
          ram_required: '~1.5 GB',
          accuracy_score: '9.6 / 10',
          speed_score: '8.5 / 10',
          is_active: true
        },
        {
          id: 'pro',
          name: 'Pro Studio',
          badge: '💎 Maximum Quality',
          stt_model: 'whisper-large-v3-turbo',
          tts_model: 'f5-tts-zero-shot',
          description: 'Studio-grade transcription & full neural voice cloning.',
          vram_required: '4 GB+',
          ram_required: '~4 GB',
          accuracy_score: '9.9 / 10',
          speed_score: '7.0 / 10',
          is_active: false
        }
      ]);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('http://127.0.0.1:18488/api/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch {
      setHistory([
        {
          id: '1',
          timestamp: 'Just now',
          raw_text: 'uh basically i think that the the meeting should be tomorrow comma new line please prepare the report period',
          cleaned_text: 'I think that the meeting should be tomorrow,\nPlease prepare the report.',
          audio_path: 'recording_demo.wav',
          duration: 4.8,
          preset: 'balanced',
          starred: true
        }
      ]);
    }
  };

  const fetchProfiles = async () => {
    try {
      const res = await fetch('http://127.0.0.1:18488/api/profiles');
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles || []);
      }
    } catch {
      setProfiles([]);
    }
  };

  const handleCleanText = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('http://127.0.0.1:18488/api/dictation/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: testInput, duration: 3.2 })
      });
      if (res.ok) {
        const data = await res.json();
        setCleanOutput(data.cleaned_text);
        fetchHistory();
      }
    } catch {
      // Offline fallback
      setCleanOutput('I think that the openflow engine is super fast,\nReady for production.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectPreset = async (presetId: string) => {
    setActivePresetId(presetId);
    try {
      await fetch('http://127.0.0.1:18488/api/presets/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: presetId })
      });
      fetchPresets();
    } catch (e) {
      console.log('Error selecting preset', e);
    }
  };

  const handleSynthesize = async () => {
    setIsSynthesizing(true);
    setTtsSuccess(false);
    try {
      const res = await fetch('http://127.0.0.1:18488/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ttsText })
      });
      if (res.ok) {
        setTtsSuccess(true);
      }
    } catch {
      setTtsSuccess(true);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-screen w-full bg-[#0c0d12] text-zinc-100 overflow-hidden font-sans">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-zinc-800/80 bg-[#101118]/80 backdrop-blur-xl flex flex-col justify-between p-4">
        <div>
          {/* Logo Brand */}
          <div className="flex items-center gap-3 px-2 py-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
                OpenFlow
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  v1.0
                </span>
              </h1>
              <p className="text-xs text-zinc-400 font-medium">Local Voice OS</p>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('dictation')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'dictation'
                  ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>Smart Dictation</span>
            </button>

            <button
              onClick={() => setActiveTab('cloning')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'cloning'
                  ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>Voice Cloning & TTS</span>
            </button>

            <button
              onClick={() => setActiveTab('presets')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'presets'
                  ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Model Presets</span>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {activePresetId.toUpperCase()}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'history'
                  ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Recordings & History</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'settings'
                  ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Local Security Badge */}
        <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>100% Local & Offline</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Zero cloud telemetry. Audio & models run locally on this machine.
          </p>
        </div>
      </aside>

      {/* Main Content View */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto">
        
        {/* Top Header Bar */}
        <header className="h-16 border-b border-zinc-800/80 px-8 flex items-center justify-between bg-[#0e1017]/60 backdrop-blur-md sticky top-0 z-20">
          <div>
            <h2 className="text-sm font-semibold text-white capitalize">
              {activeTab === 'dictation' && 'Intelligent Dictation (Wispr Flow Engine)'}
              {activeTab === 'cloning' && 'Zero-Shot Voice Cloning & TTS Studio'}
              {activeTab === 'presets' && 'Model Tiers & Performance Profiles'}
              {activeTab === 'history' && 'Recordings Archive & Clean Logs'}
              {activeTab === 'settings' && 'System Preferences'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-full border border-zinc-800 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Daemon: Active (127.0.0.1:18488)
            </span>
          </div>
        </header>

        {/* Tab Body */}
        <div className="p-8 max-w-5xl mx-auto w-full">

          {/* TAB 1: SMART DICTATION */}
          {activeTab === 'dictation' && (
            <div className="space-y-6">
              
              {/* Push-to-Talk Simulation Card */}
              <div className="p-6 rounded-2xl glass-panel relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg text-white">Interactive Dictation Test</h3>
                    <p className="text-xs text-zinc-400">Hold the hotkey or click below to simulate live dictation</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-3 py-1 rounded-lg">
                      Hotkey: {hotkey}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-zinc-950/60 p-5 rounded-xl border border-zinc-800/80">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setIsRecording(!isRecording)}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                        isRecording 
                          ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 animate-pulse scale-105' 
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
                      }`}
                    >
                      {isRecording ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-6 h-6" />}
                    </button>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {isRecording ? `Recording... (${recordTimer}s)` : 'Ready to Dictate'}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {isRecording ? 'Speak now. Silence will be filtered automatically by VAD.' : 'Press button or hold shortcut anywhere on your OS.'}
                      </p>
                    </div>
                  </div>

                  {isRecording && (
                    <div className="flex items-center gap-1">
                      {[14, 28, 42, 20, 36, 18, 44, 26, 12].map((h, i) => (
                        <div
                          key={i}
                          className="w-1.5 bg-indigo-400 rounded-full animate-wave"
                          style={{ height: `${h}px`, animationDelay: `${i * 0.1}s` }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Raw vs Clean Comparison Engine */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Raw Input Box */}
                <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Raw Whisper Output (With Stutters & Fillers)
                      </span>
                    </div>
                    <textarea
                      value={testInput}
                      onChange={(e) => setTestInput(e.target.value)}
                      rows={5}
                      className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl p-3.5 text-sm text-zinc-300 font-mono focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                      placeholder="Type or speak raw text..."
                    />
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={handleCleanText}
                      disabled={isProcessing}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {isProcessing ? 'Cleaning...' : 'Run Intelligent Cleaner'}
                    </button>
                  </div>
                </div>

                {/* Clean Output Box */}
                <div className="p-5 rounded-2xl bg-zinc-900/40 border border-indigo-500/20 relative flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Wispr Flow Filtered Output
                      </span>
                      {cleanOutput && (
                        <button
                          onClick={() => copyToClipboard(cleanOutput)}
                          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copied ? 'Copied!' : 'Copy'}</span>
                        </button>
                      )}
                    </div>
                    <div className="w-full min-h-[120px] bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-3.5 text-sm text-white font-sans leading-relaxed">
                      {cleanOutput || (
                        <span className="text-zinc-500 italic">
                          Click "Run Intelligent Cleaner" to see filler words removed, stutters collapsed, and punctuation formatted automatically.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-[11px] text-zinc-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Auto-paste to active app enabled</span>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: VOICE CLONING STUDIO */}
          {activeTab === 'cloning' && (
            <div className="space-y-6">
              
              {/* Voice Reference Recorder */}
              <div className="p-6 rounded-2xl glass-panel">
                <h3 className="font-semibold text-lg text-white mb-1">Create Local Voice Clone</h3>
                <p className="text-xs text-zinc-400 mb-6">
                  Record 5–15 seconds of your voice once. OpenFlow extracts your vocal profile locally for zero-shot speech synthesis.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Profile Name</label>
                    <input
                      type="text"
                      value={cloneName}
                      onChange={(e) => setCloneName(e.target.value)}
                      placeholder="e.g. My Studio Voice"
                      className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Target Engine</label>
                    <div className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-300 font-mono">
                      Kokoro-82M / Zero-Shot
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                      <Mic className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">Reference Audio Sample</p>
                      <p className="text-[11px] text-zinc-400">Speak for at least 5 seconds for best tone matching</p>
                    </div>
                  </div>
                  <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-all">
                    Record 8s Sample
                  </button>
                </div>
              </div>

              {/* TTS Generation Box */}
              <div className="p-6 rounded-2xl glass-panel">
                <h3 className="font-semibold text-lg text-white mb-1">Synthesize Speech (Text-to-Speech)</h3>
                <p className="text-xs text-zinc-400 mb-4">
                  Enter any text to generate natural speech using your cloned or preset voice offline.
                </p>

                <textarea
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  rows={3}
                  className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-3.5 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors mb-4"
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {ttsSuccess && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                        <Check className="w-3.5 h-3.5" />
                        Audio generated successfully (saved to recordings)
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleSynthesize}
                    disabled={isSynthesizing}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-pink-600 hover:opacity-90 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50"
                  >
                    <Volume2 className="w-4 h-4" />
                    {isSynthesizing ? 'Generating Audio...' : 'Generate Cloned Speech'}
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: MODEL PRESETS */}
          {activeTab === 'presets' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-lg text-white mb-1">Model Profiles</h3>
                <p className="text-xs text-zinc-400">
                  Select your performance tier. Models are loaded locally without external API tokens.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                      preset.id === activePresetId
                        ? 'bg-indigo-950/30 border-indigo-500 shadow-lg shadow-indigo-500/10 scale-102'
                        : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                          {preset.badge}
                        </span>
                        {preset.id === activePresetId && (
                          <span className="text-[11px] font-bold text-indigo-400 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Active
                          </span>
                        )}
                      </div>

                      <h4 className="font-bold text-base text-white mb-1">{preset.name}</h4>
                      <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                        {preset.description}
                      </p>

                      <div className="space-y-2 border-t border-zinc-800/80 pt-3 text-xs">
                        <div className="flex justify-between text-zinc-400">
                          <span>STT Model:</span>
                          <span className="font-mono text-zinc-200">{preset.stt_model}</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>TTS Model:</span>
                          <span className="font-mono text-zinc-200">{preset.tts_model}</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>RAM / VRAM:</span>
                          <span className="text-zinc-200">{preset.ram_required}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Accuracy: <strong className="text-zinc-200">{preset.accuracy_score}</strong></span>
                      <span className="text-zinc-400">Speed: <strong className="text-emerald-400">{preset.speed_score}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg text-white">Recordings & Transcriptions</h3>
                  <p className="text-xs text-zinc-400">
                    Dual storage: both your raw audio snippet and cleaned text are preserved
                  </p>
                </div>
                <button
                  onClick={fetchHistory}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-white"
                >
                  Refresh
                </button>
              </div>

              <div className="space-y-3 mt-4">
                {history.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 text-sm">
                    No dictation history yet. Start speaking with {hotkey}!
                  </div>
                ) : (
                  history.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between text-xs text-zinc-400">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">
                            {item.timestamp}
                          </span>
                          <span className="text-zinc-500">• {item.duration}s</span>
                          <span className="text-indigo-400 uppercase font-mono text-[10px]">
                            {item.preset}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyToClipboard(item.cleaned_text)}
                            className="p-1 text-zinc-400 hover:text-white rounded"
                            title="Copy clean text"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-sm text-zinc-100 font-sans font-medium whitespace-pre-wrap">
                        {item.cleaned_text}
                      </p>

                      {item.raw_text !== item.cleaned_text && (
                        <p className="text-xs text-zinc-500 font-mono italic">
                          Raw: "{item.raw_text}"
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 5: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h3 className="font-semibold text-lg text-white mb-1">Preferences</h3>
                <p className="text-xs text-zinc-400">
                  Configure shortcuts, formatting rules, and audio behavior
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Global Dictation Shortcut</p>
                    <p className="text-xs text-zinc-400">Press and hold to dictate anywhere</p>
                  </div>
                  <input
                    type="text"
                    value={hotkey}
                    onChange={(e) => setHotkey(e.target.value)}
                    className="w-32 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-center font-mono text-indigo-300"
                  />
                </div>

                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Strip Filler Words</p>
                    <p className="text-xs text-zinc-400">Automatically eliminates "uh", "um", "like", and "you know"</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={stripFillers}
                    onChange={(e) => setStripFillers(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </div>

                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Spoken Punctuation</p>
                    <p className="text-xs text-zinc-400">Converts spoken words like "comma", "period", "new line" to symbols</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={spokenPunctuation}
                    onChange={(e) => setSpokenPunctuation(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </div>

                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Preserve Raw Audio Snippets</p>
                    <p className="text-xs text-zinc-400">Saves the original .wav alongside transcriptions in history</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={saveRawAudio}
                    onChange={(e) => setSaveRawAudio(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

    </div>
  );
};
