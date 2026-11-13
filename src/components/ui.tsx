import type { ReactNode } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function Panel({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'aside';
}) {
  return <Tag className={cn('glass-panel rounded-2xl panel-hairline', className)}>{children}</Tag>;
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-white">{title}</h3>
        {description && <p className="mt-1 max-w-xl text-xs leading-relaxed text-zinc-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = 'neutral' | 'brand' | 'mint' | 'amber' | 'hot' | 'violet';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-white/5 text-zinc-300 ring-white/10',
  brand: 'bg-brand-500/12 text-brand-300 ring-brand-500/25',
  mint: 'bg-emerald-500/12 text-emerald-300 ring-emerald-500/25',
  amber: 'bg-amber-500/12 text-amber-300 ring-amber-500/25',
  hot: 'bg-rose-500/12 text-rose-300 ring-rose-500/25',
  violet: 'bg-purple-500/12 text-purple-300 ring-purple-500/25',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled,
  title,
  className,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  title?: string;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const variants = {
    primary:
      'bg-brand-600 text-white hover:bg-brand-500 shadow-lg shadow-brand-600/20 disabled:bg-brand-600/50',
    secondary:
      'bg-white/5 text-zinc-200 ring-1 ring-white/10 hover:bg-white/10 hover:text-white',
    ghost: 'text-zinc-400 hover:text-white hover:bg-white/5',
    danger: 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/25 hover:bg-rose-500/20',
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs',
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex items-center justify-between gap-6 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3.5 transition-colors',
        disabled ? 'opacity-60' : 'hover:border-white/12',
      )}
    >
      <span>
        <span className="block text-[13px] font-medium text-zinc-100">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-500' : 'bg-white/12',
          disabled && 'cursor-not-allowed',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function KeyCap({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-white/12 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-300 shadow-sm">
      {children}
    </kbd>
  );
}
