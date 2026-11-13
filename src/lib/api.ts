/**
 * OpenFlow engine client.
 *
 * The browser always talks to `/api/...` on its own origin. In development and
 * inside the hosted preview, Vite proxies that prefix to the local engine
 * (see vite.config.ts). For the Tauri shell the origin is the bundled asset
 * server, so VITE_ENGINE_URL can point directly at 127.0.0.1:18488.
 */
import type {
  AppConfig,
  Capabilities,
  DictationResult,
  EngineState,
  HistoryEntry,
  HistoryStats,
  Preset,
  TtsResult,
  VoiceProfile,
} from './types';

/** Reads a Vite env var without assuming a bundler is present (SSR/tests). */
function readEnv(key: string): string | undefined {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.[key];
  } catch {
    return undefined;
  }
}

const RAW_BASE = readEnv('VITE_ENGINE_URL') ?? '';
export const API_BASE = RAW_BASE.replace(/\/$/, '');

export class EngineError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'EngineError';
    this.status = status;
  }

  get offline(): boolean {
    return this.status === 0;
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new EngineError(payload?.error ?? `Engine responded ${response.status}`, response.status);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof EngineError) throw error;
    if ((error as Error)?.name === 'AbortError') {
      throw new EngineError('The engine took too long to respond.', 0);
    }
    throw new EngineError('Cannot reach the OpenFlow engine. Is `npm run engine` running?', 0);
  } finally {
    clearTimeout(timer);
  }
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const api = {
  // -- introspection -------------------------------------------------------
  health: () => request<{ ok: boolean; version: string; data_dir: string }>('/api/health', {}, 4_000),
  state: (light = false) => request<EngineState>(`/api/state${light ? '?light=1' : ''}`, {}, 4_000),
  capabilities: () => request<Capabilities>('/api/capabilities'),

  // -- config / presets ----------------------------------------------------
  presets: () => request<{ presets: Preset[]; config: AppConfig }>('/api/presets'),
  selectPreset: (presetId: string) => request<{ ok: boolean; config: AppConfig }>('/api/presets/select', json({ preset_id: presetId })),
  config: () => request<{ config: AppConfig }>('/api/config'),
  updateConfig: (patch: Partial<AppConfig>) =>
    request<{ ok: boolean; config: AppConfig }>('/api/config/update', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // -- dictation -----------------------------------------------------------
  startDictation: (source = 'studio') =>
    request<{ ok: boolean; demo?: boolean }>('/api/dictation/start', json({ source })),
  stopDictation: (wait = false) =>
    request<DictationResult>('/api/dictation/stop', json({ wait }), wait ? 120_000 : 20_000),
  clean: (rawText: string, saveHistory = false) =>
    request<{ cleaned_text: string; raw_text: string; report: DictationResult['report'] }>(
      '/api/dictation/clean',
      json({ raw_text: rawText, save_history: saveHistory }),
    ),
  readAloud: (text: string, profileId?: string | null) =>
    request<TtsResult>('/api/read-aloud', json({ text, profile_id: profileId ?? null }), 60_000),

  // -- history -------------------------------------------------------------
  history: (query = '', limit?: number) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (limit) params.set('limit', String(limit));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request<{ history: HistoryEntry[]; stats: HistoryStats }>(`/api/history${suffix}`);
  },
  star: (entryId: string) => request<{ ok: boolean; starred: boolean }>('/api/history/star', json({ entry_id: entryId })),
  deleteEntry: (entryId: string) => request<{ ok: boolean }>(`/api/history/${entryId}`, { method: 'DELETE' }),
  clearHistory: (deleteAudio = false) =>
    request<{ ok: boolean; removed: number }>('/api/history', { method: 'DELETE', body: JSON.stringify({ delete_audio: deleteAudio }) }),
  exportUrl: () => `${API_BASE}/api/history/export`,

  // -- voice cloning -------------------------------------------------------
  profiles: () => request<{ profiles: VoiceProfile[] }>('/api/profiles'),
  createProfile: (name: string, audioBase64: string, description = '') =>
    request<{ ok: boolean; profile: VoiceProfile }>(
      '/api/profiles/create',
      json({ name, audio_base64: audioBase64, description }),
      60_000,
    ),
  createDemoProfile: (name = 'Demo Voice', duration = 7) =>
    request<{ ok: boolean; profile: VoiceProfile; demo: boolean }>('/api/profiles/demo', json({ name, duration })),
  deleteProfile: (profileId: string) =>
    request<{ ok: boolean }>(`/api/profiles/${profileId}`, { method: 'DELETE' }),
  synthesize: (text: string, profileId?: string | null) =>
    request<TtsResult>('/api/tts/synthesize', json({ text, profile_id: profileId ?? null }), 60_000),

  // -- audio ---------------------------------------------------------------
  /**
   * Builds a URL the <audio> element can stream. `folder` is relative to the
   * OpenFlow data directory: `recordings`, `recordings/tts_out` or `profiles`.
   */
  audioUrl: (file: string, folder: 'recordings' | 'recordings/tts_out' | 'profiles' = 'recordings') =>
    `${API_BASE}/api/audio/${folder}/${encodeURIComponent(file)}`,
};
