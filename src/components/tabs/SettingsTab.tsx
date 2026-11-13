import { useMemo, useState } from 'react';
import { Check, ClipboardCopy, Database, Info, Keyboard, ShieldCheck, Sliders } from 'lucide-react';
import type { EngineStore } from '../../hooks/useEngine';
import { Badge, Button, cn, KeyCap, Panel, SectionHeading, Toggle } from '../ui';

export function SettingsTab({ engine }: { engine: EngineStore }) {
  const { config, capabilities, online, updateConfig, stats, state } = engine;
  const [hotkeyDraft, setHotkeyDraft] = useState(config?.hotkey ?? 'Ctrl+Space');
  const [readAloudDraft, setReadAloudDraft] = useState(config?.read_aloud_hotkey ?? 'Ctrl+Shift+Space');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const diagnostics = useMemo(
    () => JSON.stringify(
      {
        engine: 'OpenFlow',
        status: state?.status,
        online,
        config,
        capabilities,
        stats,
        apiBase: engine.apiBase,
      },
      null,
      2,
    ),
    [capabilities, config, engine.apiBase, online, state?.status, stats],
  );

  const saveHotkey = () => {
    const value = hotkeyDraft.trim();
    if (!value.includes('+')) return;
    void updateConfig({ hotkey: value });
    flashSaved();
  };

  const flashSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  if (!config) {
    return <Panel className="p-8 text-center text-[12px] text-zinc-500">Waiting for engine configuration…</Panel>;
  }

  return (
    <div className="space-y-5">
      <Panel className="p-5">
        <SectionHeading
          title="Dictation shortcuts"
          description="Global shortcuts are captured by the native daemon, so they work in any application."
          action={saved ? <Badge tone="mint"><Check className="h-3 w-3" /> saved</Badge> : <Keyboard className="h-4 w-4 text-zinc-500" />}
        />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="hotkey" className="text-[11px] font-medium text-zinc-400">Dictation hotkey</label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="hotkey"
                value={hotkeyDraft}
                onChange={(event) => setHotkeyDraft(event.target.value)}
                onBlur={saveHotkey}
                onKeyDown={(event) => event.key === 'Enter' && saveHotkey()}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-[12px] text-brand-200 outline-none transition-colors focus:border-brand-500/60"
              />
              <Button size="sm" variant="secondary" onClick={saveHotkey}>Save</Button>
            </div>
          </div>

          <div>
            <label htmlFor="read-aloud" className="text-[11px] font-medium text-zinc-400">Read-aloud hotkey</label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="read-aloud"
                value={readAloudDraft}
                onChange={(event) => setReadAloudDraft(event.target.value)}
                onBlur={() => {
                  if (readAloudDraft.includes('+')) {
                    void updateConfig({ read_aloud_hotkey: readAloudDraft.trim() });
                    flashSaved();
                  }
                }}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-[12px] text-brand-200 outline-none transition-colors focus:border-brand-500/60"
              />
              <Button size="sm" variant="secondary" onClick={() => void updateConfig({ read_aloud_hotkey: readAloudDraft.trim() })}>
                Save
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-[11px] font-medium text-zinc-400">Trigger behaviour</p>
          <div className="mt-1.5 inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
            {[
              { value: true, label: 'Push-to-talk', hint: 'Hold the shortcut while speaking' },
              { value: false, label: 'Toggle', hint: 'Tap once to start, again to stop' },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                title={option.hint}
                onClick={() => {
                  void updateConfig({ hold_to_talk: option.value });
                  flashSaved();
                }}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors',
                  config.hold_to_talk === option.value ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-200',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2.5 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', capabilities?.injector.keystroke ? 'bg-emerald-400' : 'bg-amber-400')} />
            Keystroke injection {capabilities?.injector.keystroke ? 'available' : 'unavailable (install pynput)'}
          </span>
          <span className="flex items-center gap-1.5">
            <KeyCap>{config.hotkey}</KeyCap> hold to dictate
          </span>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-5">
          <SectionHeading
            title="Cleaner rules"
            description="Deterministic and instant. Each rule can be disabled independently."
            action={<Sliders className="h-4 w-4 text-zinc-500" />}
          />
          <div className="mt-4 space-y-2">
            <Toggle
              label="Remove filler words"
              hint="uh, um, erm, “you know”, “basically”, hesitation “like”"
              checked={config.strip_filler_words}
              onChange={(value) => void updateConfig({ strip_filler_words: value })}
            />
            <Toggle
              label="Collapse stutters"
              hint="“the the” → “the”, “th-the” → “the”; rhetorical repeats are preserved"
              checked={config.collapse_stutters}
              onChange={(value) => void updateConfig({ collapse_stutters: value })}
            />
            <Toggle
              label="Spoken punctuation"
              hint="“comma”, “period”, “question mark”, “new line”, “new paragraph”"
              checked={config.spoken_punctuation}
              onChange={(value) => void updateConfig({ spoken_punctuation: value })}
            />
            <Toggle
              label="Fix casing & acronyms"
              hint="Sentence starts, pronoun “I”, API / JSON / GPU / OpenFlow"
              checked={config.fix_casing}
              onChange={(value) => void updateConfig({ fix_casing: value })}
            />
          </div>
        </Panel>

        <Panel className="p-5">
          <SectionHeading
            title="Capture & insertion"
            description="Where dictation goes and what is kept on disk."
            action={<Database className="h-4 w-4 text-zinc-500" />}
          />
          <div className="mt-4 space-y-2">
            <Toggle
              label="Auto-paste into the active app"
              hint="Copies through the clipboard and fires the native paste chord"
              checked={config.auto_paste}
              onChange={(value) => void updateConfig({ auto_paste: value })}
            />
            <Toggle
              label="Archive raw audio"
              hint="Keeps the 16 kHz WAV next to both transcripts in history"
              checked={config.save_raw_audio}
              onChange={(value) => void updateConfig({ save_raw_audio: value })}
            />
            <div className="rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3.5">
              <p className="text-[13px] font-medium text-zinc-100">Capture mode</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                Auto uses real hardware when available and falls back to simulated captures.
              </p>
              <div className="mt-2 inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
                {(['auto', 'on', 'off'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => void updateConfig({ demo_mode: mode })}
                    className={cn(
                      'rounded-lg px-3 py-1 text-[11px] font-medium capitalize transition-colors',
                      config.demo_mode === mode ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-200',
                    )}
                  >
                    {mode === 'auto' ? 'auto' : mode === 'on' ? 'demo on' : 'demo off'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel className="p-5">
        <SectionHeading
          title="Diagnostics"
          description="Everything OpenFlow can see about this machine. Useful when a capability is missing."
          action={
            <Button size="sm" variant="secondary" onClick={() => void copyDiagnostics()}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy JSON'}
            </Button>
          }
        />

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            ['Engine', online ? 'connected' : 'offline'],
            ['API', engine.apiBase],
            ['Data directory', capabilities?.data_dir ?? '—'],
            ['Platform', capabilities?.platform ?? '—'],
            ['Preset', capabilities?.preset ?? config.active_preset],
            ['Entries stored', String(stats?.entries ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
              <p className="truncate font-mono text-[11px] text-zinc-300" title={value}>{value}</p>
            </div>
          ))}
        </div>

        {capabilities?.notes.length ? (
          <ul className="mt-4 space-y-1.5">
            {capabilities.notes.map((note) => (
              <li key={note} className="flex items-start gap-2 text-[11px] leading-relaxed text-zinc-400">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                {note}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <PrivacyNote />
    </div>
  );
}

function PrivacyNote() {
  return (
    <Panel className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[13px] font-medium text-white">100% local, no telemetry</p>
          <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-zinc-500">
            Audio, transcripts, voice profiles and models stay in your OpenFlow data directory. There is no account, no
            API key and no outbound request at runtime.
          </p>
        </div>
      </div>
      <Badge tone="mint">MIT licensed</Badge>
    </Panel>
  );
}
