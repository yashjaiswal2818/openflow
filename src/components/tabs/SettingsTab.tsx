import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { EngineStore } from '../../hooks/useEngine';
import {
  Button,
  cn,
  inputClass,
  Keycap,
  Panel,
  PanelHeader,
  Segmented,
  SettingRow,
  StatusDot,
  Switch,
} from '../ui';

export function SettingsTab({ engine }: { engine: EngineStore }) {
  const { config, capabilities, online, updateConfig, stats, state } = engine;
  const [hotkey, setHotkey] = useState(config?.hotkey ?? 'Ctrl+Space');
  const [readAloud, setReadAloud] = useState(config?.read_aloud_hotkey ?? 'Ctrl+Shift+Space');
  const [saved, setSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const diagnostics = useMemo(
    () =>
      JSON.stringify(
        { engine: 'OpenFlow', status: state?.status, online, config, capabilities, stats, apiBase: engine.apiBase },
        null,
        2,
      ),
    [capabilities, config, engine.apiBase, online, state?.status, stats],
  );

  if (!config) {
    return (
      <Panel className="px-4 py-8 text-center text-[11.5px] text-muted">
        Waiting for the engine configuration…
      </Panel>
    );
  }

  const flash = (field: string) => {
    setSaved(field);
    window.setTimeout(() => setSaved(null), 1400);
  };

  const saveHotkey = () => {
    const value = hotkey.trim();
    if (!value.includes('+')) return;
    void updateConfig({ hotkey: value });
    flash('hotkey');
  };

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title="Shortcuts" description="Handled by the native daemon, so they work in any application." />
        <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
          <div>
            <label htmlFor="hotkey" className="mb-1 block text-[11px] font-medium text-dim">
              Dictation
            </label>
            <div className="flex gap-2">
              <input
                id="hotkey"
                value={hotkey}
                onChange={(event) => setHotkey(event.target.value)}
                onBlur={saveHotkey}
                onKeyDown={(event) => event.key === 'Enter' && saveHotkey()}
                className={cn(inputClass, 'font-mono')}
              />
              <Button variant="secondary" onClick={saveHotkey} className="shrink-0">
                {saved === 'hotkey' ? <Check className="h-3.5 w-3.5 text-ok" /> : 'Save'}
              </Button>
            </div>
          </div>

          <div>
            <label htmlFor="read-aloud" className="mb-1 block text-[11px] font-medium text-dim">
              Read aloud
            </label>
            <div className="flex gap-2">
              <input
                id="read-aloud"
                value={readAloud}
                onChange={(event) => setReadAloud(event.target.value)}
                onBlur={() => {
                  if (!readAloud.includes('+')) return;
                  void updateConfig({ read_aloud_hotkey: readAloud.trim() });
                  flash('read');
                }}
                className={cn(inputClass, 'font-mono')}
              />
              <Button
                variant="secondary"
                className="shrink-0"
                onClick={() => {
                  if (!readAloud.includes('+')) return;
                  void updateConfig({ read_aloud_hotkey: readAloud.trim() });
                  flash('read');
                }}
              >
                {saved === 'read' ? <Check className="h-3.5 w-3.5 text-ok" /> : 'Save'}
              </Button>
            </div>
          </div>
        </div>
        <div className="border-t border-line-soft">
          <SettingRow
            title="Trigger mode"
            hint="Push-to-talk records while held; toggle starts and stops on tap."
            control={
              <Segmented
                value={config.hold_to_talk ? 'hold' : 'toggle'}
                onChange={(value) => void updateConfig({ hold_to_talk: value === 'hold' })}
                options={[
                  { value: 'hold', label: 'Push-to-talk' },
                  { value: 'toggle', label: 'Toggle' },
                ]}
              />
            }
          />
          <SettingRow
            title="Keystroke injection"
            hint={`Clipboard: ${capabilities?.injector.clipboard_tool ?? 'unavailable'}`}
            control={
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                <StatusDot tone={capabilities?.injector.keystroke ? 'ok' : 'warn'} />
                {capabilities?.injector.keystroke ? 'Available' : 'Install pynput'}
              </span>
            }
          />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Cleaner" description="Deterministic rules applied to every transcript." />
          <div className="divide-rows">
            <SettingRow
              title="Remove filler words"
              hint="uh, um, erm, you know, basically, hesitation like"
              control={<Switch label="Remove filler words" checked={config.strip_filler_words} onChange={(value) => void updateConfig({ strip_filler_words: value })} />}
            />
            <SettingRow
              title="Collapse stutters"
              hint="the the → the, th-the → the; rhetorical repeats kept"
              control={<Switch label="Collapse stutters" checked={config.collapse_stutters} onChange={(value) => void updateConfig({ collapse_stutters: value })} />}
            />
            <SettingRow
              title="Spoken punctuation"
              hint="comma, period, question mark, new line, new paragraph"
              control={<Switch label="Spoken punctuation" checked={config.spoken_punctuation} onChange={(value) => void updateConfig({ spoken_punctuation: value })} />}
            />
            <SettingRow
              title="Casing and acronyms"
              hint="Sentence starts, pronoun I, API, JSON, OpenFlow"
              control={<Switch label="Casing and acronyms" checked={config.fix_casing} onChange={(value) => void updateConfig({ fix_casing: value })} />}
            />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Capture" description="What is captured and where it goes." />
          <div className="divide-rows">
            <SettingRow
              title="Auto-paste"
              hint="Copy to the clipboard and fire the native paste chord"
              control={<Switch label="Auto-paste" checked={config.auto_paste} onChange={(value) => void updateConfig({ auto_paste: value })} />}
            />
            <SettingRow
              title="Archive raw audio"
              hint="Keep the 16 kHz WAV next to both transcripts"
              control={<Switch label="Archive raw audio" checked={config.save_raw_audio} onChange={(value) => void updateConfig({ save_raw_audio: value })} />}
            />
            <SettingRow
              title="Capture mode"
              hint="Auto uses hardware when available, otherwise simulates."
              control={
                <Segmented
                  value={config.demo_mode}
                  onChange={(value) => void updateConfig({ demo_mode: value })}
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'on', label: 'Demo' },
                    { value: 'off', label: 'Off' },
                  ]}
                />
              }
            />
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Diagnostics"
          description="Exactly what the engine can see on this machine."
          action={
            <Button size="sm" variant="ghost" onClick={() => void copyDiagnostics()}>
              {copied ? <Check className="h-3 w-3 text-ok" /> : null}
              {copied ? 'Copied' : 'Copy JSON'}
            </Button>
          }
        />

        <dl className="divide-rows">
          {[
            ['Engine', online ? 'connected' : 'offline'],
            ['API', engine.apiBase],
            ['Data directory', capabilities?.data_dir ?? '—'],
            ['Platform', capabilities?.platform ?? '—'],
            ['Active preset', config.active_preset],
            ['Entries stored', String(stats?.entries ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-4 py-2">
              <dt className="text-[11.5px] text-dim">{label}</dt>
              <dd className="truncate font-mono text-[11px] text-muted" title={value}>{value}</dd>
            </div>
          ))}
        </dl>

        {capabilities?.notes.length ? (
          <ul className="divide-rows border-t border-line-soft">
            {capabilities.notes.map((note) => (
              <li key={note} className="flex items-start gap-2 px-4 py-2 text-[11px] leading-relaxed text-muted">
                <StatusDot tone="warn" />
                <span className="pt-[1px]">{note}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <p className="flex flex-wrap items-center gap-2 px-1 text-[10.5px] text-muted">
        <span>Audio, transcripts and profiles stay in the data directory.</span>
        <span className="text-[#3a3a40]">·</span>
        <span>No accounts, no API keys, no telemetry.</span>
        <span className="text-[#3a3a40]">·</span>
        <span className="flex items-center gap-1">
          <Keycap>MIT</Keycap> licensed
        </span>
      </p>
    </div>
  );
}
