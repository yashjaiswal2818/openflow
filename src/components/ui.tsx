import type { ReactNode } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const inputClass =
  'w-full rounded-md border border-line bg-canvas px-2.5 py-1.5 text-[12px] text-ink placeholder:text-muted outline-none transition-colors focus:border-accent/60';

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('panel', className)}>{children}</section>;
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-line-soft px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[12.5px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-[11px] font-medium text-dim">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[10.5px] text-muted">{hint}</p>}
    </div>
  );
}

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'err';

const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-raised text-dim',
  accent: 'border-accent/30 bg-accent/10 text-accent-strong',
  ok: 'border-ok/30 bg-ok/10 text-ok',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  err: 'border-err/30 bg-err/10 text-err',
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
        'inline-flex h-[19px] items-center gap-1 rounded border px-1.5 text-[10px] font-medium leading-none',
        TONES[tone],
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
    primary: 'bg-accent text-white hover:bg-accent-strong disabled:bg-accent/40',
    secondary: 'border border-line bg-raised text-ink hover:border-line hover:bg-[#1c1c20]',
    ghost: 'text-dim hover:bg-white/[0.06] hover:text-ink',
    danger: 'border border-err/30 text-err hover:bg-err/10',
  } as const;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2 text-[11px]' : 'h-8 px-3 text-[12px]',
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  onClick,
  label,
  active,
  className,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  active?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        'grid h-7 w-7 place-items-center rounded-md transition-colors disabled:opacity-40',
        active ? 'bg-white/[0.08] text-ink' : 'text-muted hover:bg-white/[0.06] hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[18px] w-8 shrink-0 rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-[#2e2e34]',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-transform',
          checked ? 'translate-x-[16px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
}: {
  options: Array<{ value: T; label: string; title?: string }>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex rounded-md border border-line bg-canvas p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-[5px] font-medium transition-colors',
            size === 'sm' ? 'px-2 py-1 text-[10.5px]' : 'px-2.5 py-1 text-[11.5px]',
            value === option.value ? 'bg-raised text-ink shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]' : 'text-muted hover:text-dim',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SettingRow({
  title,
  hint,
  control,
}: {
  title: string;
  hint?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[12px] text-ink">{title}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{hint}</p>}
      </div>
      {control}
    </div>
  );
}

export function Keycap({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-raised px-1 py-[1px] font-mono text-[10px] font-normal text-dim">
      {children}
    </kbd>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-[12px] text-dim">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-muted">{description}</p>
    </div>
  );
}

export function StatusDot({ tone = 'muted' }: { tone?: 'ok' | 'warn' | 'err' | 'muted' | 'accent' }) {
  const colors = {
    ok: 'bg-ok',
    warn: 'bg-warn',
    err: 'bg-err',
    muted: 'bg-muted',
    accent: 'bg-accent',
  } as const;
  return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', colors[tone])} />;
}
