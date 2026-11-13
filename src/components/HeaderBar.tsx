import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { TABS, type TabId } from './Sidebar';
import { Badge, Button, KeyCap, cn } from './ui';

export function HeaderBar({
  tab,
  online,
  demo,
  hotkey,
  onRetry,
  onTabChange,
}: {
  tab: TabId;
  online: boolean;
  demo: boolean;
  hotkey: string;
  onRetry: () => void;
  onTabChange: (tab: TabId) => void;
}) {
  const meta = TABS.find((item) => item.id === tab);

  return (
    <header className="sticky top-0 z-20 border-b border-white/6 bg-ink-950/80 px-5 py-3 backdrop-blur-xl sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-white">{meta?.title}</h1>
          <p className="truncate text-[11px] text-zinc-500">{meta?.subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          {demo && <Badge tone="amber" title="No microphone or Whisper runtime — simulated pipeline">demo mode</Badge>}

          <span
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium',
              online
                ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-300'
                : 'border-rose-500/25 bg-rose-500/8 text-rose-300',
            )}
          >
            {online ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                engine online
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                engine offline
              </>
            )}
          </span>

          {online ? (
            <span className="hidden items-center gap-1.5 text-[10px] text-zinc-500 sm:flex">
              <KeyCap>{hotkey}</KeyCap>
            </span>
          ) : (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              <RefreshCw className="h-3 w-3" /> Retry
            </Button>
          )}
        </div>
      </div>

      {/* Compact tab switcher for narrow screens */}
      <nav className="mt-3 flex gap-1 overflow-x-auto md:hidden" aria-label="Sections">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                active ? 'bg-brand-500/15 text-brand-200' : 'text-zinc-400 hover:bg-white/5 hover:text-white',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {!online && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          Start the daemon with <code className="rounded bg-black/40 px-1 font-mono">npm run engine</code>, then retry.
        </p>
      )}
    </header>
  );
}
