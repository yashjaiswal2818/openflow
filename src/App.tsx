import { useState } from 'react';
import { X } from 'lucide-react';
import { useEngine } from './hooks/useEngine';
import { FloatingPill } from './components/FloatingPill';
import { StudioDashboard } from './components/StudioDashboard';
import type { TabId } from './components/Sidebar';

export function App() {
  const engine = useEngine();
  const [tab, setTab] = useState<TabId>('dictation');
  const { state, config } = engine;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas text-ink">
      <StudioDashboard engine={engine} tab={tab} onTabChange={setTab} />

      {engine.error && (
        <div className="fixed bottom-20 right-4 z-50 flex max-w-xs items-start gap-2 rounded-lg border border-err/30 bg-panel px-3 py-2 text-[11px] text-err shadow-lg">
          <p className="flex-1 leading-relaxed">{engine.error}</p>
          <button
            type="button"
            onClick={() => engine.setError(null)}
            aria-label="Dismiss"
            className="text-err/60 transition-colors hover:text-err"
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
        hotkey={config?.hotkey ?? 'Ctrl+Space'}
        message={state?.message}
        online={engine.online}
        onToggle={() => void engine.toggleDictation()}
        onOpenStudio={() => setTab('dictation')}
      />
    </div>
  );
}

export default App;
