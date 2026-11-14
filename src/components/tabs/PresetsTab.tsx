import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { EngineStore } from '../../hooks/useEngine';
import { cn, Panel, PanelHeader, StatusDot } from '../ui';

function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-3 py-2.5 align-top text-[11.5px] text-dim', className)}>{children}</td>;
}

export function PresetsTab({ engine }: { engine: EngineStore }) {
  const { presets, config, capabilities, selectPreset, online } = engine;
  const activeId = config?.active_preset ?? 'balanced';

  const runtime = [
    {
      label: 'Microphone',
      ok: !!capabilities?.microphone.available,
      detail: capabilities?.microphone.available
        ? capabilities.microphone.device ?? 'default input'
        : capabilities?.microphone.reason ?? 'not detected',
    },
    {
      label: 'Speech-to-text',
      ok: !!capabilities?.stt.available,
      detail: capabilities?.stt.available
        ? `${capabilities?.stt.backend} · ${capabilities?.stt.model}`
        : capabilities?.stt.reason ?? 'not installed',
    },
    {
      label: 'Speech synthesis',
      ok: (capabilities?.tts.quality ?? 'preview') === 'neural',
      detail: `${capabilities?.tts.engine ?? 'preview'} · ${capabilities?.tts.quality ?? 'preview'} quality`,
    },
    {
      label: 'Clipboard',
      ok: !!capabilities?.injector.clipboard,
      detail: capabilities?.injector.clipboard
        ? capabilities.injector.clipboard_tool ?? 'available'
        : 'no clipboard tool',
    },
    {
      label: 'Keystroke injection',
      ok: !!capabilities?.injector.keystroke,
      detail: capabilities?.injector.keystroke ? 'pynput' : 'pynput not installed',
    },
  ];

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Preset"
          description="Switching releases the current Whisper model before loading the next one."
          action={<span className="font-mono text-[10.5px] text-muted">{activeId}</span>}
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line-soft text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Tier</th>
                <th className="px-3 py-2 font-medium">Speech-to-text</th>
                <th className="px-3 py-2 font-medium">Text-to-speech</th>
                <th className="px-3 py-2 font-medium">Latency</th>
                <th className="px-3 py-2 font-medium">Memory</th>
              </tr>
            </thead>
            <tbody>
              {presets.map((preset) => {
                const isActive = preset.id === activeId;
                return (
                  <tr
                    key={preset.id}
                    onClick={() => void selectPreset(preset.id)}
                    className={cn(
                      'cursor-pointer border-b border-line-soft transition-colors last:border-0',
                      isActive ? 'bg-accent/[0.06]' : 'hover:bg-white/[0.025]',
                      !online && 'pointer-events-none opacity-60',
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <span
                          className={cn(
                            'mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border',
                            isActive ? 'border-accent' : 'border-line',
                          )}
                        >
                          {isActive && <Check className="h-2.5 w-2.5 text-accent" />}
                        </span>
                        <span>
                          <span className="block text-[12px] font-medium text-ink">{preset.name}</span>
                          <span className="block text-[10.5px] text-muted">{preset.tagline}</span>
                        </span>
                      </div>
                    </td>
                    <Cell className="font-mono text-[10.5px]">{preset.stt_model}</Cell>
                    <Cell className="font-mono text-[10.5px]">{preset.tts_model}</Cell>
                    <Cell className="tabular font-mono text-[10.5px]">~{preset.latency_target_ms} ms</Cell>
                    <Cell className="tabular font-mono text-[10.5px]">{preset.ram_required}</Cell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="border-t border-line-soft px-3 py-2 text-[10.5px] leading-relaxed text-muted">
          {presets.find((preset) => preset.id === activeId)?.description}
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Runtime" description="Capabilities detected on this machine." />
          <dl className="divide-rows">
            {runtime.map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-[11.5px] text-dim">{item.label}</dt>
                <dd className="flex min-w-0 items-center gap-1.5 text-right text-[11px] text-muted">
                  <StatusDot tone={item.ok ? 'ok' : 'warn'} />
                  <span className="truncate" title={item.detail}>{item.detail}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel>
          <PanelHeader title="Optional dependencies" description="Install only what you need; the engine starts without them." />
          <div className="divide-rows">
            {[
              ['faster-whisper', 'On-device transcription'],
              ['sounddevice numpy', 'Microphone capture'],
              ['pynput', 'Global shortcuts and paste'],
              ['kokoro-onnx', 'Kokoro-82M neural voices'],
            ].map(([pkg, detail]) => (
              <div key={pkg} className="flex items-center justify-between gap-3 px-4 py-2">
                <code className="font-mono text-[11px] text-dim">pip install {pkg}</code>
                <span className="text-[10.5px] text-muted">{detail}</span>
              </div>
            ))}
          </div>
          <p className="border-t border-line-soft px-4 py-2 text-[10.5px] leading-relaxed text-muted">
            Models are fetched once by their own tooling and then run offline. Nothing is proxied through a server.
          </p>
        </Panel>
      </div>
    </div>
  );
}
