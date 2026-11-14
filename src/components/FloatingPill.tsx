import { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, Maximize2, Mic, Square } from 'lucide-react';
import type { DictationStatus } from '../lib/types';
import { Waveform } from './Waveform';
import { cn, Keycap } from './ui';

export interface FloatingPillProps {
  status: DictationStatus;
  audioLevel: number;
  isRecording: boolean;
  latencyMs?: number | null;
  hotkey: string;
  message?: string;
  online: boolean;
  onToggle: () => void;
  onOpenStudio?: () => void;
}

const LABELS: Record<DictationStatus, string> = {
  ready: 'Ready',
  listening: 'Listening',
  processing: 'Formatting',
  pasted: 'Pasted',
  copied: 'Copied',
  saved: 'Saved',
  error: 'Error',
};

export function FloatingPill({
  status,
  audioLevel,
  isRecording,
  latencyMs,
  hotkey,
  message,
  online,
  onToggle,
  onOpenStudio,
}: FloatingPillProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  const busy = status === 'processing';
  const settled = status === 'pasted' || status === 'copied' || status === 'saved';
  const failed = status === 'error' || !online;
  const showDetail = status === 'listening' || busy || settled || status === 'error';

  const detail = !online
    ? 'Engine not running'
    : status === 'listening'
      ? 'Release to transcribe'
      : busy
        ? 'Cleaning transcript'
        : settled
          ? message || 'Archived to history'
          : status === 'error'
            ? message || 'Capture failed'
            : 'Hold the shortcut and speak';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'pointer-events-auto flex h-11 items-center gap-2 rounded-full border border-line bg-[#141416]/95 pl-1.5 pr-2 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-[max-width] duration-200',
          showDetail ? 'max-w-[min(92vw,440px)]' : 'max-w-[min(92vw,260px)]',
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          disabled={!online}
          aria-label={isRecording ? 'Stop dictation' : 'Start dictation'}
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors',
            !online
              ? 'cursor-not-allowed bg-raised text-muted'
              : isRecording
                ? 'bg-err text-white hover:bg-err/90'
                : 'bg-accent text-white hover:bg-accent-strong',
          )}
        >
          {!online ? <Mic className="h-3.5 w-3.5" /> : isRecording ? <Square className="h-3 w-3 fill-current" /> : <Mic className="h-3.5 w-3.5" />}
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isRecording ? (
            <Waveform level={audioLevel} active />
          ) : busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-warn" />
          ) : failed ? (
            <AlertCircle className={cn('h-3.5 w-3.5', online ? 'text-err' : 'text-warn')} />
          ) : settled ? (
            <Check className="h-3.5 w-3.5 text-ok" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          )}

          <span className="shrink-0 text-[11.5px] font-medium text-ink">
            {online ? LABELS[status] : 'Disconnected'}
          </span>

          {isRecording && (
            <span className="tabular shrink-0 font-mono text-[10.5px] text-muted">{elapsed.toFixed(1)}s</span>
          )}

          {showDetail && (
            <span className="min-w-0 truncate border-l border-line pl-2 text-[10.5px] text-muted">{detail}</span>
          )}

          {latencyMs != null && latencyMs > 0 && !isRecording && (
            <span className="tabular ml-auto shrink-0 font-mono text-[10px] text-muted">
              {latencyMs >= 1000 ? `${(latencyMs / 1000).toFixed(1)}s` : `${latencyMs}ms`}
            </span>
          )}
        </div>

        {!showDetail && online && (
          <div className="hidden items-center gap-1 pr-0.5 sm:flex">
            <Keycap>{hotkey}</Keycap>
          </div>
        )}

        {onOpenStudio && (
          <button
            type="button"
            onClick={onOpenStudio}
            aria-label="Open studio"
            title="Open studio"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
