import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useEngine } from './hooks/useEngine';
import { FloatingPill } from './components/FloatingPill';
import { StudioDashboard } from './components/StudioDashboard';
import type { TabId } from './components/Sidebar';

export function App() {
  const engine = useEngine();
  const [tab, setTab] = useState<TabId>('dictation');
  const { state, capabilities, config } = engine;

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-ink-950 text-zinc-100 grid-backdrop">
      <StudioDashboard engine={engine} tab={tab} onTabChange={setTab} />

      {engine.error && (
        <div className="pointer-events-auto fixed right-4 top-4 z-50 flex max-w-sm items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-950/80 px-3.5 py-2.5 text-[11px] text-rose-100 shadow-xl backdrop-blur">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
          <p className="flex-1 leading-relaxed">{engine.error}</p>
          <button
            type="button"
            onClick={() => engine.setError(null)}
            aria-label="Dismiss error"
            className="rounded p-0.5 text-rose-300/70 transition-colors hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <FloatingPill
        status={state?.status ?? 'ready'}
        audioLevel={state?.audio_level ?? 0}
        isRecording={!!state?.is_recording}
        latencyMs={state?.latency_ms ?? null}
        demo={capabilities?.demo_mode ?? state?.demo ?? false}
        hotkey={config?.hotkey ?? 'Ctrl+Space'}
        message={state?.message}
        previewText={state?.preview_text}
        online={engine.online}
        onToggle={() => void engine.toggleDictation()}
        onOpenStudio={() => setTab('dictation')}
      />
    </div>
  );
}

export default App;
