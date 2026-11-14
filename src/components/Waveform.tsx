import { useEffect, useRef, useState } from 'react';
import { cn } from './ui';

const WEIGHTS = [0.55, 0.8, 1, 0.72, 0.95, 0.62, 0.88, 0.48];

export interface WaveformProps {
  level: number;
  active: boolean;
  bars?: number;
  className?: string;
  minHeight?: number;
  maxHeight?: number;
}

/**
 * Level meter driven by the engine's RMS values. Heights are smoothed so the
 * bars track speech instead of flickering between polls.
 */
export function Waveform({
  level,
  active,
  bars = 12,
  className,
  minHeight = 3,
  maxHeight = 18,
}: WaveformProps) {
  const smoothed = useRef(0);
  const frame = useRef(0);
  const [, tick] = useState(0);

  useEffect(() => {
    const target = active ? Math.max(0.05, Math.min(1, level)) : 0;
    cancelAnimationFrame(frame.current);

    const step = () => {
      smoothed.current += (target - smoothed.current) * 0.3;
      tick((value) => value + 1);
      if (Math.abs(target - smoothed.current) > 0.004) {
        frame.current = requestAnimationFrame(step);
      }
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [level, active]);

  return (
    <div className={cn('flex items-center gap-[2px]', className)} aria-hidden="true">
      {Array.from({ length: bars }, (_, index) => {
        const weight = WEIGHTS[index % WEIGHTS.length];
        const height = active
          ? minHeight + (maxHeight - minHeight) * Math.min(1, smoothed.current * weight * 1.3)
          : minHeight;
        return (
          <span
            key={index}
            className={cn('w-[2px] rounded-sm', active ? 'bg-accent/80' : 'bg-[#2c2c32]')}
            style={{ height: `${Math.max(minHeight, height)}px` }}
          />
        );
      })}
    </div>
  );
}
