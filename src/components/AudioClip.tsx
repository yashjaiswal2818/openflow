import { useEffect, useRef, useState } from 'react';
import { Download, Pause, Play } from 'lucide-react';
import { cn } from './ui';

export interface AudioClipProps {
  src: string;
  duration?: number;
  className?: string;
  onError?: (message: string) => void;
  showDownload?: boolean;
}

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Minimal inline player: play/pause, scrub line, elapsed time. */
export function AudioClip({ src, duration, className, onError, showDownload = true }: AudioClipProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setTotal(duration ?? 0);
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
      onError?.('Playback was blocked. Try again.');
    }
  };

  const progress = total > 0 ? Math.min(100, (current / total) * 100) : 0;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line bg-raised text-dim transition-colors hover:text-ink"
      >
        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 translate-x-[0.5px]" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="h-[3px] overflow-hidden rounded-full bg-[#26262b]">
          <div className="h-full rounded-full bg-accent/70" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <span className="tabular shrink-0 font-mono text-[10px] text-muted">
        {clock(current)} / {clock(total)}
      </span>

      {showDownload && (
        <a
          href={src}
          download
          aria-label="Download audio"
          title="Download audio"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
        >
          <Download className="h-3 w-3" />
        </a>
      )}

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
        onError={() => onError?.('That recording could not be loaded.')}
        className="hidden"
      />
    </div>
  );
}
