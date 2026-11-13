import { Check, Cpu, Gauge, HardDrive, Info, Zap } from 'lucide-react';
import type { EngineStore } from '../../hooks/useEngine';
import { Badge, Button, cn, Panel, SectionHeading } from '../ui';

function ScoreBar({ label, value, max = 10, tone }: { label: string; value: number; max?: number; tone: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
        <span>{label}</span>
        <span className="font-mono text-zinc-400">{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}

export function PresetsTab({ engine }: { engine: EngineStore }) {
  const { presets, config, capabilities, selectPreset, online } = engine;
  const activeId = config?.active_preset ?? capabilities?.preset ?? 'balanced';

  return (
    <div className="space-y-6">
      <Panel className="p-5">
        <SectionHeading
          title="Hardware performance tiers"
          description="Each tier selects an STT model size, a TTS backend and a VAD strategy. Switching is instant — the Whisper model is released and reloaded so RAM stays predictable."
          action={<Badge tone="brand">{activeId} active</Badge>}
        />

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {presets.map((preset) => {
            const active = preset.id === activeId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => void selectPreset(preset.id)}
                disabled={!online}
                className={cn(
                  'flex flex-col rounded-2xl border p-4 text-left transition-all disabled:opacity-60',
                  active
                    ? 'border-brand-500/50 bg-brand-500/[0.08] shadow-lg shadow-brand-500/10'
                    : 'border-white/8 bg-white/[0.02] hover:border-white/20',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg" aria-hidden="true">{preset.badge}</span>
                  {active ? (
                    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-brand-300">
                      <Check className="h-3 w-3" /> active
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-zinc-600">select</span>
                  )}
                </div>

                <h4 className="mt-2 text-[15px] font-semibold text-white">{preset.name}</h4>
                <p className="text-[11px] text-zinc-500">{preset.tagline}</p>

                <div className="mt-3 space-y-1.5 rounded-xl bg-black/25 p-2.5 font-mono text-[10px]">
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">STT</span>
                    <span className="truncate text-zinc-300">{preset.stt_model}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">TTS</span>
                    <span className="truncate text-zinc-300">{preset.tts_model}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">VAD</span>
                    <span className="truncate text-zinc-300">{preset.vad}</span>
                  </div>
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">{preset.description}</p>

                <div className="mt-4 space-y-2">
                  <ScoreBar label="Accuracy" value={preset.accuracy_score} tone="bg-gradient-to-r from-brand-500 to-purple-400" />
                  <ScoreBar label="Speed" value={preset.speed_score} tone="bg-gradient-to-r from-emerald-500 to-teal-400" />
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/6 pt-3 text-[10px] text-zinc-500">
                  <span className="inline-flex items-center gap-1">
                    <Gauge className="h-3 w-3" /> ~{preset.latency_target_ms} ms
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <HardDrive className="h-3 w-3" /> {preset.ram_required}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Cpu className="h-3 w-3" /> {preset.vram_required}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <SectionHeading title="Runtime detected" description="What the engine can actually load on this machine right now." />
          <ul className="mt-4 space-y-2 text-[12px]">
            {[
              {
                label: 'Microphone',
                ok: capabilities?.microphone.available ?? false,
                detail: capabilities?.microphone.available
                  ? capabilities.microphone.device ?? 'default input'
                  : capabilities?.microphone.reason ?? 'not detected',
              },
              {
                label: 'Whisper runtime',
                ok: capabilities?.stt.available ?? false,
                detail: capabilities?.stt.available
                  ? `${capabilities?.stt.backend} · ${capabilities?.stt.model}`
                  : capabilities?.stt.reason ?? 'not installed',
              },
              {
                label: 'TTS backend',
                ok: (capabilities?.tts.quality ?? 'preview') === 'neural',
                detail: `${capabilities?.tts.engine ?? 'preview'} (${capabilities?.tts.quality ?? 'preview'})`,
              },
              {
                label: 'Keystroke injection',
                ok: capabilities?.injector.keystroke ?? false,
                detail: capabilities?.injector.clipboard
                  ? `clipboard via ${capabilities.injector.clipboard_tool}`
                  : 'no clipboard tool',
              },
            ].map((row) => (
              <li key={row.label} className="flex items-start gap-2.5 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2">
                <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', row.ok ? 'bg-emerald-400' : 'bg-amber-400')} />
                <div className="min-w-0">
                  <p className="text-zinc-200">{row.label}</p>
                  <p className="truncate text-[11px] text-zinc-500" title={row.detail}>{row.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="p-5">
          <SectionHeading title="Install the heavy models" description="Optional dependencies unlock real transcription and neural voices." />
          <div className="mt-4 space-y-2 font-mono text-[11px]">
            {[
              ['pip install faster-whisper', 'Whisper inference (CPU, int8)'],
              ['pip install sounddevice numpy', 'Microphone capture via PortAudio'],
              ['pip install pynput', 'Global hotkeys + keystroke paste'],
              ['pip install kokoro-onnx', 'Kokoro-82M neural TTS'],
            ].map(([command, detail]) => (
              <div key={command} className="rounded-lg border border-white/8 bg-black/30 px-3 py-2">
                <code className="block truncate text-brand-200">{command}</code>
                <span className="text-[10px] text-zinc-500">{detail}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-brand-500/20 bg-brand-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-brand-100/80">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Models are downloaded once by their own tooling and then run permanently offline. OpenFlow never proxies
            audio to a server.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void selectPreset('balanced')} disabled={!online}>
              <Zap className="h-3.5 w-3.5" /> Use recommended tier
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
