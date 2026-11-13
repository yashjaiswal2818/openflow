import { useEffect, useRef, useState } from 'react';
import { Download, Pause, Play } from 'lucide-react';
import { cn } from './ui';

export interface AudioClipProps {
  src: string;
  /** Duration reported by the engine (used until the browser knows better). */
  duration?: number;
  label?: string;
  compact?: boolean;
  className?: string;
  onError?: (message: string) => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Inline player for raw dictation snippets and synthesized speech. */
export function AudioClip({ src, duration, label, compact, className, onError }: AudioClipProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setTotal(duration ?? 0);
    setFailed(false);
  }, [src, duration]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setFailed(true);
      onError?.('The browser blocked audio playback. Try again from a user gesture.');
    }
  };

  const progress = total > 0 ? Math.min(100, (current / total) * 100) : 0;

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-1.5',
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause audio' : 'Play audio'}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300 transition-colors hover:bg-brand-500/25 hover:text-white"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-[1px]" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          {!compact && label && (
            <span className="truncate text-[11px] font-medium text-zinc-400">{label}</span>
          )}
          <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-500">
            {formatTime(current)} / {formatTime(total)}
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-purple-400 transition-[width] duration-100"
            style={{ width: `${failed ? 0 : progress}%` }}
          />
        </div>
      </div>

      <a
        href={src}
        download
        aria-label="Download audio"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
      >
        <Download className="h-3.5 w-3.5" />
      </a>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value) && value > 0) setTotal(value);
        }}
        onError={() => {
          setFailed(true);
          onError?.('That recording could not be loaded from the engine.');
        }}
        className="hidden"
      />
    </div>
  );
}
