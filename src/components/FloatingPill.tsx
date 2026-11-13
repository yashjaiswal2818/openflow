import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  AudioLines,
  Check,
  ClipboardCopy,
  Loader2,
  Mic,
  Radio,
  Square,
  WifiOff,
} from 'lucide-react';
import type { DictationStatus } from '../lib/types';
import { Waveform } from './Waveform';
import { cn, KeyCap } from './ui';

export interface FloatingPillProps {
  status: DictationStatus;
  audioLevel: number;
  isRecording: boolean;
  latencyMs?: number | null;
  demo: boolean;
  hotkey: string;
  message?: string;
  previewText?: string;
  online: boolean;
  onToggle: () => void;
  onOpenStudio?: () => void;
}

const STATUS_COPY: Record<DictationStatus, { label: string; tone: string }> = {
  ready: { label: 'Ready', tone: 'text-zinc-300' },
  listening: { label: 'Listening', tone: 'text-brand-300' },
  processing: { label: 'Formatting', tone: 'text-amber-300' },
  pasted: { label: 'Pasted', tone: 'text-emerald-300' },
  copied: { label: 'Copied', tone: 'text-emerald-300' },
  saved: { label: 'Saved', tone: 'text-brand-300' },
  error: { label: 'Error', tone: 'text-rose-300' },
};

function formatLatency(ms?: number | null): string | null {
  if (ms == null || ms <= 0) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/**
 * The Wispr-Flow-style floating pill. Three widths:
 *   resting  ->  260px  (status + hotkey)
 *   listening->  auto   (waveform + elapsed seconds)
 *   result   ->  auto   (latency + text preview)
 */
export function FloatingPill({
  status,
  audioLevel,
  isRecording,
  latencyMs,
  demo,
  hotkey,
  message,
  previewText,
  online,
  onToggle,
  onOpenStudio,
}: FloatingPillProps) {
  const [elapsed, setElapsed] = useState(0);
  const active = status === 'listening';
  const processing = status === 'processing';

  useEffect(() => {
    if (!isRecording) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  const copy = STATUS_COPY[status] ?? STATUS_COPY.ready;
  const latency = formatLatency(latencyMs);
  const expanded =
    active || processing || status === 'pasted' || status === 'copied' || status === 'saved' || status === 'error';

  const detail = useMemo(() => {
    if (!online) return 'Engine offline — start it with npm run engine';
    if (status === 'listening') return 'Release to transcribe';
    if (processing) return 'Removing fillers and formatting punctuation';
    if (status === 'pasted') return message || 'Inserted into the active app';
    if (status === 'copied') return message || 'On your clipboard — press paste';
    if (status === 'saved') return message || 'Archived in history — clipboard unavailable';
    if (status === 'error') return message || 'Something went wrong';
    return previewText || message || 'Hold the hotkey and speak';
  }, [message, online, previewText, processing, status]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        className={cn(
          'pointer-events-auto glass-pill flex items-center gap-3 rounded-full px-2.5 py-2 transition-all duration-300 ease-out',
          expanded ? 'max-w-[min(92vw,560px)]' : 'max-w-[min(92vw,340px)]',
          active && 'ring-1 ring-brand-400/40 shadow-[0_0_40px_-8px_rgba(99,102,241,0.55)]',
          status === 'pasted' && 'ring-1 ring-emerald-400/35 shadow-[0_0_40px_-10px_rgba(52,211,153,0.5)]',
          status === 'error' && 'ring-1 ring-rose-400/40',
          !online && 'ring-1 ring-amber-400/30',
        )}
        role="status"
        aria-live="polite"
      >
        <button
          type="button"
          onClick={onToggle}
          disabled={!online}
          aria-label={isRecording ? 'Stop dictation' : 'Start dictation'}
          className={cn(
            'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-all',
            !online && 'cursor-not-allowed bg-white/10 text-zinc-500',
            online && isRecording && 'bg-rose-500 shadow-lg shadow-rose-500/40 hover:bg-rose-400',
            online && !isRecording && 'bg-brand-600 shadow-lg shadow-brand-600/30 hover:bg-brand-500',
          )}
        >
          {!online ? (
            <WifiOff className="h-4 w-4" />
          ) : isRecording ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
          {active && (
            <span className="absolute inset-0 rounded-full ring-1 ring-rose-300/50 ping-ring" />
          )}
        </button>

        <div className="min-w-0 flex-1 pr-1">
          <div className="flex items-center gap-2">
            {active && (
              <Waveform level={audioLevel} active={active} maxHeight={22} className="mr-0.5" />
            )}

            {processing && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-300 spinner" />}
            {status === 'pasted' && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
            {status === 'copied' && <ClipboardCopy className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
            {status === 'saved' && <Archive className="h-3.5 w-3.5 shrink-0 text-brand-300" />}
            {status === 'error' && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-300" />}
            {status === 'ready' && online && <Radio className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
            {!online && <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-300" />}

            <span className={cn('truncate text-xs font-semibold tracking-wide', !online ? 'text-amber-200' : copy.tone)}>
              {!online ? 'Disconnected' : copy.label}
              {active && (
                <span className="ml-1.5 font-mono text-[11px] font-normal text-brand-200/70">
                  {elapsed.toFixed(1)}s
                </span>
              )}
            </span>

            {demo && (
              <span className="shrink-0 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/25">
                demo
              </span>
            )}
            {latency && !isRecording && (
              <span className="shrink-0 font-mono text-[10px] text-zinc-500">{latency}</span>
            )}
          </div>

          <p className="mt-0.5 truncate text-[11px] leading-tight text-zinc-500">{detail}</p>
        </div>

        {!expanded && online && (
          <div className="hidden items-center gap-1 pr-1 sm:flex">
            <KeyCap>{hotkey}</KeyCap>
          </div>
        )}

        {onOpenStudio && (
          <button
            type="button"
            onClick={onOpenStudio}
            aria-label="Open OpenFlow Studio"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <AudioLines className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
