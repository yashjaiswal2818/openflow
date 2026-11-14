import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Mic, Square } from 'lucide-react';
import { api } from '../../lib/api';
import type { CleanReport, DictationResult } from '../../lib/types';
import type { EngineStore } from '../../hooks/useEngine';
import { AudioClip } from '../AudioClip';
import { Waveform } from '../Waveform';
import {
  Badge,
  Button,
  cn,
  EmptyState,
  Keycap,
  Panel,
  PanelHeader,
  StatusDot,
  Switch,
} from '../ui';

const SAMPLE = 'uh so basically i think that the the openflow engine is super fast comma new line ready for production period';

const RULE_LABELS: Array<[keyof CleanReport, string]> = [
  ['fillers_removed', 'fillers'],
  ['stutters_collapsed', 'stutters'],
  ['punctuation_converted', 'punctuation'],
  ['acronyms_fixed', 'acronyms'],
  ['sentences_capitalized', 'casing'],
  ['crutches_removed', 'crutches'],
];

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function FixSummary({ report }: { report: CleanReport }) {
  const items = RULE_LABELS.map(([key, label]) => [label, Number(report[key] ?? 0)] as const).filter(
    ([, value]) => value > 0,
  );

  if (!items.length) return <span className="text-[10.5px] text-muted">no changes</span>;

  return (
    <span className="tabular font-mono text-[10.5px] text-muted">
      {items.map(([label, value], index) => (
        <span key={label}>
          {index > 0 && <span className="px-1 text-[#3a3a40]">·</span>}
          {value} {label}
        </span>
      ))}
    </span>
  );
}

function PhaseRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="px-4 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn('mt-0.5 flex items-center gap-1.5 truncate text-[11.5px]', ok ? 'text-dim' : 'text-warn')}>
        <StatusDot tone={ok ? 'ok' : 'warn'} />
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}

export function DictationTab({ engine }: { engine: EngineStore }) {
  const { state, capabilities, config, online } = engine;
  const [input, setInput] = useState(SAMPLE);
  const [report, setReport] = useState<CleanReport | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [save, setSave] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copyTimer = useRef<number | null>(null);

  const isRecording = !!state?.is_recording;
  const now = useNow(isRecording);
  const elapsed = state?.started_at ? Math.max(0, (now - state.started_at * 1000) / 1000) : 0;
  const last: DictationResult | null = state?.last_result ?? null;
  const demo = capabilities?.demo_mode ?? false;
  const hotkey = config?.hotkey ?? 'Ctrl+Space';

  useEffect(() => () => {
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
  }, []);

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setError('Clipboard access was blocked by the browser.');
    }
  };

  const runCleaner = async () => {
    setCleaning(true);
    setError(null);
    const result = await engine.cleanText(input, save);
    if (!result) setError('The cleaner did not return a result. Is the engine running?');
    setReport(result);
    setCleaning(false);
  };

  const phases = useMemo(
    () => [
      {
        label: 'Input',
        ok: !!capabilities?.microphone.available,
        value: capabilities?.microphone.available
          ? capabilities.microphone.device ?? 'Microphone'
          : demo
            ? 'Simulated capture'
            : 'No microphone',
      },
      {
        label: 'Speech-to-text',
        ok: !!capabilities?.stt.available,
        value: capabilities?.stt.available
          ? `${capabilities.stt.backend ?? 'whisper'} · ${capabilities.stt.model ?? ''}`.trim()
          : demo
            ? 'Demo transcript'
            : 'Whisper not installed',
      },
      {
        label: 'Cleaner',
        ok: true,
        value: 'Local rules, deterministic',
      },
      {
        label: 'Insertion',
        ok: !!capabilities?.injector.clipboard,
        value: capabilities?.injector.clipboard
          ? `Clipboard · ${capabilities.injector.clipboard_tool}`
          : 'Clipboard unavailable',
      },
    ],
    [capabilities, demo],
  );

  const stateLabel = !online
    ? 'Engine offline'
    : isRecording
      ? 'Listening'
      : state?.status === 'processing'
        ? 'Formatting'
        : demo
          ? 'Ready — simulated capture'
          : 'Ready';

  const hint = !online
    ? 'Start the engine with npm run engine'
    : isRecording
      ? 'Speak, then release or click stop'
      : demo
        ? 'A simulated clip is captured, transcribed and cleaned'
        : 'Click the button or hold the shortcut anywhere';

  return (
    <div className="space-y-4">
      {demo && (
        <p className="rounded-md border border-line bg-panel px-3 py-2 text-[11.5px] leading-relaxed text-dim">
          <span className="font-medium text-warn">Demo mode.</span>{' '}
          {capabilities?.notes[0] ?? 'No microphone or Whisper runtime detected.'} The cleaner, history, WAV archive and
          speech synthesis are real.
        </p>
      )}

      <Panel>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <button
            type="button"
            onClick={() => void engine.toggleDictation()}
            disabled={!online}
            aria-label={isRecording ? 'Stop dictation' : 'Start dictation'}
            className={cn(
              'grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors',
              !online
                ? 'cursor-not-allowed bg-raised text-muted'
                : isRecording
                  ? 'bg-err text-white hover:bg-err/90'
                  : 'bg-accent text-white hover:bg-accent-strong',
            )}
          >
            {isRecording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[12.5px] font-medium text-ink">{stateLabel}</span>
              {isRecording && (
                <span className="tabular font-mono text-[11px] text-dim">{elapsed.toFixed(1)}s</span>
              )}
            </div>
            <p className="truncate text-[11px] text-muted">{hint}</p>
          </div>

          <Waveform level={state?.audio_level ?? 0} active={isRecording} className="hidden sm:flex" />

          <div className="hidden shrink-0 items-center gap-2 text-[10.5px] text-muted sm:flex">
            <Keycap>{hotkey}</Keycap>
            <span className="tabular font-mono">
              {state?.latency_ms ? `${state.latency_ms}ms` : '—'}
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-2 border-t border-line-soft sm:grid-cols-4 sm:divide-x sm:divide-line-soft">
          {phases.map((phase) => (
            <PhaseRow key={phase.label} {...phase} />
          ))}
        </dl>
      </Panel>

      {last?.cleaned_text && (
        <Panel className="fade-in">
          <PanelHeader
            title="Last capture"
            description={`${last.demo ? 'Demo transcript' : 'Whisper'} · ${last.duration ?? 0}s of audio`}
            action={
              <>
                {last.report && <FixSummary report={last.report} />}
                <Button size="sm" variant="ghost" onClick={() => void copy(last.cleaned_text ?? '', 'last')}>
                  {copied === 'last' ? <Check className="h-3 w-3 text-ok" /> : <Copy className="h-3 w-3" />}
                  {copied === 'last' ? 'Copied' : 'Copy'}
                </Button>
              </>
            }
          />

          <div className="grid divide-y divide-line-soft md:grid-cols-2 md:divide-x md:divide-y-0">
            <div className="px-4 py-3">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">Raw</p>
              <p className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-dim">{last.raw_text}</p>
            </div>
            <div className="px-4 py-3">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">Cleaned</p>
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{last.cleaned_text}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-2.5">
            {last.audio_file ? (
              <AudioClip
                src={api.audioUrl(last.audio_file, 'recordings')}
                duration={last.duration}
                className="w-full max-w-xs"
              />
            ) : (
              <span className="text-[11px] text-muted">Audio not archived</span>
            )}
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <StatusDot tone={last.paste?.ok ? 'ok' : 'warn'} />
              {last.paste?.ok ? 'Inserted at cursor' : last.paste?.reason ?? 'Not inserted'}
            </span>
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          title="Cleaner test bench"
          description="Paste a raw transcript and run the local rule engine. No model, no network."
          action={<Badge>offline</Badge>}
        />

        <div className="grid divide-y divide-line-soft lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="flex flex-col">
            <div className="flex items-center justify-between px-4 pt-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Raw input</p>
              <button
                type="button"
                onClick={() => setInput(SAMPLE)}
                className="text-[10.5px] text-muted transition-colors hover:text-dim"
              >
                reset
              </button>
            </div>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={7}
              spellCheck={false}
              className="min-h-[132px] flex-1 resize-none bg-transparent px-4 py-2 font-mono text-[11.5px] leading-relaxed text-dim outline-none placeholder:text-muted"
              placeholder="Type or paste a raw dictation transcript"
            />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center justify-between px-4 pt-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Cleaned output</p>
              {report?.cleaned && (
                <button
                  type="button"
                  onClick={() => void copy(report.cleaned, 'out')}
                  className="flex items-center gap-1 text-[10.5px] text-muted transition-colors hover:text-dim"
                >
                  {copied === 'out' ? <Check className="h-3 w-3 text-ok" /> : <Copy className="h-3 w-3" />}
                  {copied === 'out' ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
            {report?.cleaned ? (
              <>
                <p className="flex-1 whitespace-pre-wrap px-4 py-2 text-[12.5px] leading-relaxed text-ink">
                  {report.cleaned}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2">
                  <FixSummary report={report} />
                  <span className="font-mono text-[10px] text-muted">
                    {report.total_fixes} fixes
                  </span>
                </div>
              </>
            ) : (
              <EmptyState
                title="Nothing cleaned yet"
                description="Run the cleaner to see filler removal, stutter collapse and punctuation."
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-2.5">
          <label className="flex items-center gap-2 text-[11px] text-dim">
            <Switch checked={save} onChange={setSave} label="Archive result to history" />
            Archive result
          </label>
          <div className="flex items-center gap-2">
            {error && <span className="text-[11px] text-err">{error}</span>}
            <Button variant="primary" onClick={() => void runCleaner()} disabled={cleaning || !input.trim()}>
              {cleaning ? 'Cleaning…' : 'Run cleaner'}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
