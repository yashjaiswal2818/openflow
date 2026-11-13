import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Eraser,
  Gauge,
  Mic,
  Sparkles,
  Square,
  Wand2,
} from 'lucide-react';
import { api } from '../../lib/api';
import type { CleanReport, DictationResult } from '../../lib/types';
import type { EngineStore } from '../../hooks/useEngine';
import { AudioClip } from '../AudioClip';
import { Waveform } from '../Waveform';
import { Badge, Button, cn, EmptyState, KeyCap, Panel, SectionHeading, Toggle } from '../ui';

const SAMPLE_RAW =
  'uh so basically i think that the the openflow engine is super fast comma new line ready for production period';

function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function ReportChips({ report }: { report: CleanReport }) {
  const items = [
    { label: 'fillers', value: report.fillers_removed },
    { label: 'stutters', value: report.stutters_collapsed },
    { label: 'punctuation', value: report.punctuation_converted },
    { label: 'acronyms', value: report.acronyms_fixed },
    { label: 'casing', value: report.sentences_capitalized },
    { label: 'crutches', value: report.crutches_removed },
  ].filter((item) => item.value > 0);

  if (!items.length) {
    return <span className="text-[11px] text-zinc-500">No changes — the transcript was already clean.</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium text-emerald-300">
        {report.total_fixes} fixes
      </span>
      {items.map((item) => (
        <span
          key={item.label}
          className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 ring-1 ring-white/8"
        >
          {item.value} {item.label}
        </span>
      ))}
    </div>
  );
}

export function DictationTab({ engine }: { engine: EngineStore }) {
  const { state, capabilities, config, online } = engine;
  const [testInput, setTestInput] = useState(SAMPLE_RAW);
  const [report, setReport] = useState<CleanReport | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [saveToHistory, setSaveToHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const copyTimer = useRef<number | null>(null);

  const isRecording = !!state?.is_recording;
  const now = useTicker(isRecording);
  const elapsed = state?.started_at ? Math.max(0, (now - state.started_at * 1000) / 1000) : 0;
  const lastResult: DictationResult | null = state?.last_result ?? null;
  const demo = capabilities?.demo_mode ?? state?.demo ?? false;
  const hotkey = config?.hotkey ?? 'Ctrl+Space';

  useEffect(() => () => {
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
  }, []);

  const runCleaner = async () => {
    setCleaning(true);
    setLocalError(null);
    const result = await engine.cleanText(testInput, saveToHistory);
    if (!result) {
      setLocalError('The cleaner did not return a result. Is the engine running?');
    }
    setReport(result);
    setCleaning(false);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setLocalError('Clipboard access was blocked by the browser.');
    }
  };

  const pipeline = useMemo(() => ([
    {
      title: 'Capture',
      detail: capabilities?.microphone.available
        ? capabilities.microphone.device ?? 'Microphone ready'
        : demo ? 'Simulated capture' : 'No microphone',
      ok: capabilities?.microphone.available ?? false,
    },
    {
      title: 'Transcribe',
      detail: capabilities?.stt.available
        ? `${capabilities.stt.backend} · ${capabilities.stt.model}`
        : demo ? 'Demo transcript' : 'Whisper missing',
      ok: capabilities?.stt.available ?? false,
    },
    {
      title: 'Clean',
      detail: 'Deterministic rules, <1 ms',
      ok: true,
    },
    {
      title: 'Insert',
      detail: capabilities?.injector.clipboard
        ? `Clipboard via ${capabilities.injector.clipboard_tool ?? 'system tool'}`
        : demo ? 'Clipboard unavailable' : 'Clipboard unavailable',
      ok: capabilities?.injector.clipboard ?? false,
    },
  ]), [capabilities, demo]);

  const lastReport = (lastResult?.report ?? null) as CleanReport | null;

  return (
    <div className="space-y-6">
      {demo && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div className="text-[12px] leading-relaxed text-amber-100/90">
            <span className="font-semibold text-amber-200">Demo mode.</span>{' '}
            {capabilities?.notes[0] ?? 'No microphone or Whisper runtime detected.'} Captures and transcripts are
            simulated so you can exercise the full pipeline; the cleaner, history, WAV archiving and TTS are real.
          </div>
        </div>
      )}

      {!online && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-400/25 bg-rose-500/[0.07] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
          <div className="text-[12px] leading-relaxed text-rose-100/90">
            <span className="font-semibold text-rose-200">Engine unreachable.</span> Start the local daemon with{' '}
            <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[11px]">npm run engine</code> — the Studio
            reconnects automatically.
          </div>
        </div>
      )}

      <Panel className="overflow-hidden">
        <div className="border-b border-white/6 px-5 py-4">
          <SectionHeading
            title="Live dictation"
            description="Hold the global shortcut anywhere on your system, speak, and release. The cleaned text is inserted at your cursor."
            action={
              <div className="flex items-center gap-2">
                <Badge tone="brand">{hotkey}</Badge>
                <Badge tone={config?.hold_to_talk ? 'violet' : 'neutral'}>
                  {config?.hold_to_talk ? 'push-to-talk' : 'toggle'}
                </Badge>
              </div>
            }
          />
        </div>

        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => void engine.toggleDictation()}
              disabled={!online}
              aria-label={isRecording ? 'Stop dictation' : 'Start dictation'}
              className={cn(
                'relative flex h-14 w-14 items-center justify-center rounded-full text-white transition-all',
                !online && 'cursor-not-allowed bg-white/10 text-zinc-500',
                online && isRecording
                  ? 'bg-rose-500 shadow-xl shadow-rose-500/30 hover:bg-rose-400'
                  : 'bg-brand-600 shadow-xl shadow-brand-600/25 hover:bg-brand-500',
              )}
            >
              {isRecording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
              {isRecording && <span className="absolute inset-0 rounded-full ring-1 ring-rose-300/50 ping-ring" />}
            </button>

            <div>
              <p className="text-sm font-semibold text-white">
                {isRecording ? `Listening — ${elapsed.toFixed(1)}s` : demo ? 'Click to simulate dictation' : 'Ready to dictate'}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {isRecording
                  ? 'Speak naturally. Silence is trimmed by the VAD before transcription.'
                  : demo
                    ? 'A simulated capture is recorded, transcribed and cleaned end-to-end.'
                    : 'Click the mic or hold the shortcut anywhere in the OS.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Waveform
              level={state?.audio_level ?? 0}
              active={isRecording}
              bars={12}
              maxHeight={38}
              minHeight={5}
              className="h-10"
            />
            <div className="flex flex-col items-end gap-1 font-mono text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <Gauge className="h-3 w-3" />
                {state?.latency_ms ? `${state.latency_ms} ms` : '— ms'}
              </span>
              <span>{state?.status ?? 'offline'}</span>
            </div>
          </div>
        </div>

        {pipeline.length > 0 && (
          <div className="grid grid-cols-2 gap-px border-t border-white/6 bg-white/[0.03] sm:grid-cols-4">
            {pipeline.map((step) => (
              <div key={step.title} className="bg-ink-900/60 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className={cn('h-1.5 w-1.5 rounded-full', step.ok ? 'bg-emerald-400' : 'bg-amber-400')} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{step.title}</span>
                </div>
                <p className="mt-1 truncate text-[11px] text-zinc-300" title={step.detail}>{step.detail}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {lastResult?.cleaned_text && (
        <Panel className="rise-in p-5">
          <SectionHeading
            title="Last capture"
            description={`${lastResult.demo ? 'Demo transcript' : 'Whisper transcript'} · ${lastResult.duration ?? 0}s of audio`}
            action={
              <div className="flex items-center gap-2">
                {lastReport && <ReportChips report={lastReport} />}
                <Button size="sm" variant="secondary" onClick={() => void copyText(lastResult.cleaned_text ?? '')}>
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            }
          />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/6 bg-black/25 p-3.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Raw transcript</p>
              <p className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-zinc-400">{lastResult.raw_text}</p>
            </div>
            <div className="rounded-xl border border-brand-500/20 bg-brand-500/[0.06] p-3.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-300">Cleaned output</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white">{lastResult.cleaned_text}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {lastResult.audio_file ? (
              <AudioClip
                src={api.audioUrl(lastResult.audio_file, 'recordings')}
                duration={lastResult.duration}
                label="Raw audio snippet"
                className="w-full max-w-sm"
              />
            ) : (
              <span className="text-[11px] text-zinc-500">Raw audio was not archived for this capture.</span>
            )}
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              {lastResult.paste?.ok ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> Pasted into the active app
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  {lastResult.paste?.reason ?? 'Auto-paste unavailable'}
                </>
              )}
            </div>
          </div>
        </Panel>
      )}

      <Panel className="p-5">
        <SectionHeading
          title="Dictation cleaner — live test bench"
          description="Paste any raw transcript. The deterministic cleaner strips hesitations, collapses stutters, converts spoken punctuation and fixes casing — no network, no model."
          action={<Badge tone="mint">offline</Badge>}
        />

        {localError && (
          <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
            {localError}
          </p>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-white/8 bg-black/25 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Raw input</p>
                <button
                  type="button"
                  onClick={() => setTestInput(SAMPLE_RAW)}
                  className="text-[10px] text-zinc-500 transition-colors hover:text-zinc-200"
                >
                  reset sample
                </button>
              </div>
              <textarea
                value={testInput}
                onChange={(event) => setTestInput(event.target.value)}
                rows={6}
                spellCheck={false}
                className="w-full resize-none bg-transparent font-mono text-[12px] leading-relaxed text-zinc-300 outline-none placeholder:text-zinc-600"
                placeholder="Type or paste a raw dictation transcript…"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Toggle
                checked={saveToHistory}
                onChange={setSaveToHistory}
                label="Archive to history"
                hint="Keeps the raw and cleaned pair"
              />
              <Button variant="primary" onClick={() => void runCleaner()} disabled={cleaning || !testInput.trim()}>
                <Wand2 className="h-3.5 w-3.5" />
                {cleaning ? 'Cleaning…' : 'Run cleaner'}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-brand-500/20 bg-brand-500/[0.06] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-300">
                <Sparkles className="h-3 w-3" /> Cleaned output
              </p>
              {report?.cleaned && (
                <button
                  type="button"
                  onClick={() => void copyText(report.cleaned)}
                  className="flex items-center gap-1 text-[10px] text-zinc-400 transition-colors hover:text-white"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
            {report?.cleaned ? (
              <p className="min-h-[132px] whitespace-pre-wrap text-[13px] leading-relaxed text-white">{report.cleaned}</p>
            ) : (
              <EmptyState
                icon={<Eraser className="h-4 w-4" />}
                title="Nothing cleaned yet"
                description="Run the cleaner to see fillers removed, stutters collapsed and punctuation restored."
              />
            )}
            {report && (
              <div className="mt-3 border-t border-white/8 pt-3">
                <ReportChips report={report} />
                {report.stages.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {report.stages.map((stage) => (
                      <span key={stage} className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[9px] text-zinc-500">
                        {stage}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
          Try saying <KeyCap>comma</KeyCap> <KeyCap>new line</KeyCap> <KeyCap>question mark</KeyCap> — they become
          real typography.
        </p>
      </Panel>
    </div>
  );
}
