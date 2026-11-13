/** Shared types mirroring the OpenFlow engine HTTP contract. */

export type DictationStatus =
  | 'ready'
  | 'listening'
  | 'processing'
  | 'pasted'
  | 'copied'
  | 'saved'
  | 'error';

export interface Preset {
  id: string;
  name: string;
  badge: string;
  tagline: string;
  stt_model: string;
  stt_model_key: string;
  tts_model: string;
  tts_backend: string;
  vad: string;
  latency_target_ms: number;
  ram_required: string;
  vram_required: string;
  accuracy_score: number;
  speed_score: number;
  description: string;
  is_active: boolean;
}

export interface AppConfig {
  active_preset: string;
  hotkey: string;
  hold_to_talk: boolean;
  strip_filler_words: boolean;
  spoken_punctuation: boolean;
  fix_casing: boolean;
  collapse_stutters: boolean;
  save_raw_audio: boolean;
  auto_paste: boolean;
  read_aloud_hotkey: string;
  active_voice_profile: string | null;
  audio_input_device: string | number;
  audio_output_device: string | number;
  demo_mode: 'auto' | 'on' | 'off';
  appearance: string;
}

export interface CleanReport {
  raw: string;
  cleaned: string;
  changed: boolean;
  total_fixes: number;
  fillers_removed: number;
  stutters_collapsed: number;
  punctuation_converted: number;
  crutches_removed: number;
  acronyms_fixed: number;
  sentences_capitalized: number;
  stages: string[];
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  created_at: string;
  raw_text: string;
  cleaned_text: string;
  audio_path: string | null;
  audio_file: string | null;
  duration: number;
  preset: string;
  starred: boolean;
  meta: Record<string, unknown>;
}

export interface VoiceSignature {
  duration?: number;
  sample_rate?: number;
  rms?: number;
  peak?: number;
  f0_hz?: number;
  speech_ratio?: number;
}

export interface VoiceProfile {
  id: string;
  name: string;
  wav_path: string;
  file: string;
  duration: number;
  description: string;
  created_at: string;
  signature: VoiceSignature;
}

export interface CapabilityFlag {
  available: boolean;
  backend?: string | null;
  model?: string | null;
  reason?: string | null;
  device?: string;
}

export interface Capabilities {
  demo_mode: boolean;
  microphone: CapabilityFlag;
  stt: CapabilityFlag;
  tts: { available: boolean; engine: string; quality: 'preview' | 'neural'; reason?: string | null };
  injector: {
    clipboard: boolean;
    clipboard_tool: string | null;
    keystroke: boolean;
    platform: string;
    reason?: string | null;
  };
  platform?: string;
  data_dir: string;
  preset: string;
  notes: string[];
}

export interface PasteResult {
  ok: boolean;
  reason: string | null;
}

export interface DictationResult {
  ok: boolean;
  raw_text?: string;
  cleaned_text?: string;
  report?: CleanReport;
  audio_file?: string | null;
  duration?: number;
  latency_ms?: number;
  demo?: boolean;
  paste?: PasteResult;
  entry?: HistoryEntry | null;
  error?: string;
}

export interface EngineState {
  status: DictationStatus;
  is_recording: boolean;
  audio_level: number;
  preview_text: string;
  message: string;
  demo: boolean;
  started_at: number | null;
  last_result: DictationResult | null;
  paste: PasteResult | null;
  latency_ms: number | null;
  updated_at: string;
  capabilities?: Capabilities;
  config?: AppConfig;
  stats?: HistoryStats;
}

export interface HistoryStats {
  entries: number;
  starred: number;
  words: number;
  speech_seconds: number;
  recordings_dir?: string;
  history_file?: string;
}

export interface TtsResult {
  ok: boolean;
  engine: string;
  quality: 'preview' | 'neural';
  output_wav: string;
  file: string;
  duration: number;
  sample_rate: number;
  syllables: number;
  profile_id?: string | null;
  profile_name?: string;
  text: string;
  generated_at: string;
  played?: boolean;
  playback_note?: string | null;
}

export interface ApiErrorPayload {
  ok: false;
  error: string;
}
