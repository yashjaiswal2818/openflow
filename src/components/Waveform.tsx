import { useEffect, useRef, useState } from 'react';
import { cn } from './ui';

const BAR_COUNT = 8;
// Slight per-bar character so the visualizer looks organic rather than uniform.
const BAR_WEIGHTS = [0.62, 0.86, 1, 0.78, 1.05, 0.72, 0.9, 0.58];

export interface WaveformProps {
  /** Live RMS level from the engine, 0–1. */
  level: number;
  active: boolean;
  bars?: number;
  className?: string;
  barClassName?: string;
  minHeight?: number;
  maxHeight?: number;
}

/**
 * Audio-reactive bars. Levels are smoothed with an exponential filter so the
 * HUD breathes with speech instead of flickering between poll frames.
 */
export function Waveform({
  level,
  active,
  bars = BAR_COUNT,
  className,
  barClassName,
  minHeight = 4,
  maxHeight = 30,
}: WaveformProps) {
  const smoothed = useRef(0);
  const [, force] = useState(0);

  useEffect(() => {
    const target = active ? Math.max(0.06, Math.min(1, level)) : 0;
    let frame = 0;
    const step = () => {
      smoothed.current += (target - smoothed.current) * 0.35;
      force((n) => n + 1);
      if (Math.abs(target - smoothed.current) > 0.004) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [level, active]);

  const weights = Array.from({ length: bars }, (_, index) => BAR_WEIGHTS[index % BAR_WEIGHTS.length]);

  return (
    <div className={cn('flex items-center gap-[3px]', className)} aria-hidden="true">
      {weights.map((weight, index) => {
        const height = active
          ? minHeight + (maxHeight - minHeight) * Math.min(1, smoothed.current * weight * 1.35)
          : minHeight;
        return (
          <span
            key={index}
            className={cn(
              'w-[3px] rounded-full bg-gradient-to-t from-brand-500 via-brand-400 to-purple-300 transition-[height] duration-75',
              !active && 'bg-white/20 bg-none',
              barClassName,
            )}
            style={{ height: `${Math.max(minHeight, height)}px` }}
          />
        );
      })}
    </div>
  );
}
