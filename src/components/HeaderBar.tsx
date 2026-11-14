import { RefreshCw } from 'lucide-react';
import { TABS, type TabId } from './Sidebar';
import { Badge, cn, Keycap, StatusDot } from './ui';

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
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="flex h-12 items-center justify-between gap-3 px-4 sm:px-6">
        <h1 className="truncate text-[13px] font-semibold text-ink">{meta?.title}</h1>

        <div className="flex items-center gap-3">
          {demo && (
            <Badge tone="warn" title="No microphone or Whisper runtime; captures are simulated">
              demo mode
            </Badge>
          )}

          <span className="hidden items-center gap-1.5 text-[11px] text-muted sm:flex">
            <StatusDot tone={online ? 'ok' : 'err'} />
            {online ? 'Connected' : 'Offline'}
          </span>

          {online ? (
            <span className="hidden items-center gap-1 lg:flex">
              <Keycap>{hotkey}</Keycap>
            </span>
          ) : (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1 text-[11px] text-accent transition-colors hover:text-accent-strong"
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          )}
        </div>
      </div>

      <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-t border-line-soft px-3 md:hidden">
        {TABS.map((item) => {
          const isActive = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'shrink-0 border-b px-2 py-2 text-[11.5px] transition-colors',
                isActive
                  ? 'border-accent text-ink'
                  : 'border-transparent text-muted hover:text-dim',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
