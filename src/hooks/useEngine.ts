import { useCallback, useEffect, useRef, useState } from 'react';
import { api, API_BASE, EngineError } from '../lib/api';
import type {
  AppConfig,
  Capabilities,
  CleanReport,
  DictationResult,
  EngineState,
  HistoryStats,
  Preset,
  TtsResult,
} from '../lib/types';

const ACTIVE_POLL_MS = 120; // while recording / transcribing: keep the HUD at ~8 fps
const IDLE_POLL_MS = 1_200;

export interface EngineStore {
  online: boolean;
  connecting: boolean;
  state: EngineState | null;
  capabilities: Capabilities | null;
  config: AppConfig | null;
  presets: Preset[];
  stats: HistoryStats | null;
  error: string | null;
  apiBase: string;
  refresh: (full?: boolean) => Promise<void>;
  startDictation: (source?: string) => Promise<void>;
  stopDictation: () => Promise<DictationResult | null>;
  toggleDictation: () => Promise<void>;
  cleanText: (raw: string, save?: boolean) => Promise<CleanReport | null>;
  selectPreset: (presetId: string) => Promise<void>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
  readAloud: (text: string, profileId?: string | null) => Promise<TtsResult | null>;
  setError: (message: string | null) => void;
}

/**
 * Single source of truth for engine connectivity and live dictation state.
 * Polling speeds up automatically while the pill is animating so the HUD stays
 * responsive without hammering the daemon while idle.
 */
export function useEngine(): EngineStore {
  const [state, setState] = useState<EngineState | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [online, setOnline] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async (full = true) => {
    if (busy.current) return;
    busy.current = true;
    try {
      // Light polls keep the HUD at 120 ms without re-reading the archive.
      const next = await api.state(!full);
      setState(next);
      setOnline(true);
      setConnecting(false);
      if (next.capabilities) setCapabilities(next.capabilities);
      if (next.config) setConfig(next.config);
      if (next.stats) setStats(next.stats);
    } catch (err) {
      const offline = err instanceof EngineError && offlineCheck(err);
      if (offline) {
        setOnline(false);
        setConnecting(false);
      }
    } finally {
      busy.current = false;
    }
  }, []);

  // Initial load: capabilities, presets and config in parallel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [caps, presetPayload] = await Promise.all([api.capabilities(), api.presets()]);
        if (cancelled) return;
        setCapabilities(caps);
        setPresets(presetPayload.presets);
        setConfig(presetPayload.config);
        setOnline(true);
        setConnecting(false);
        await refresh();
      } catch (err) {
        if (cancelled) return;
        setConnecting(false);
        setOnline(false);
        if (err instanceof EngineError && !offlineCheck(err)) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Adaptive polling loop.
  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;

    const tick = async () => {
      await refresh(false);
      if (cancelled) return;
      const active = state?.status === 'listening' || state?.status === 'processing';
      timer = window.setTimeout(tick, active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };

    timer = window.setTimeout(tick, online ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
    // Re-arming on status changes keeps the fast cadence exactly while needed.
  }, [online, refresh, state?.status]);

  const startDictation = useCallback(
    async (source = 'studio') => {
      try {
        await api.startDictation(source);
        setError(null);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start dictation.');
      }
    },
    [refresh],
  );

  const stopDictation = useCallback(async () => {
    try {
      const result = await api.stopDictation();
      await refresh();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not stop dictation.');
      return null;
    }
  }, [refresh]);

  const toggleDictation = useCallback(async () => {
    if (state?.is_recording) {
      await stopDictation();
    } else {
      await startDictation();
    }
  }, [startDictation, state?.is_recording, stopDictation]);

  const cleanText = useCallback(async (raw: string, save = false) => {
    try {
      const result = await api.clean(raw, save);
      return (result.report ?? null) as CleanReport | null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clean the text.');
      return null;
    }
  }, []);

  const selectPreset = useCallback(async (presetId: string) => {
    try {
      const result = await api.selectPreset(presetId);
      setConfig(result.config);
      const payload = await api.presets();
      setPresets(payload.presets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch presets.');
    }
  }, []);

  const updateConfig = useCallback(async (patch: Partial<AppConfig>) => {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
    try {
      const result = await api.updateConfig(patch);
      setConfig(result.config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.');
      await refresh();
    }
  }, [refresh]);

  const readAloud = useCallback(async (text: string, profileId?: string | null) => {
    try {
      return await api.readAloud(text, profileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate speech.');
      return null;
    }
  }, []);

  return {
    online,
    connecting,
    state,
    capabilities,
    config,
    presets,
    stats,
    error,
    apiBase: API_BASE || 'same-origin proxy',
    refresh,
    startDictation,
    stopDictation,
    toggleDictation,
    cleanText,
    selectPreset,
    updateConfig,
    readAloud,
    setError,
  };
}

function offlineCheck(err: EngineError): boolean {
  return err.offline;
}
