import type { LucideIcon } from 'lucide-react';
import { Clock, Layers, Mic, Settings, Volume2 } from 'lucide-react';
import { cn, StatusDot } from './ui';

export type TabId = 'dictation' | 'cloning' | 'presets' | 'history' | 'settings';

export const TABS: Array<{ id: TabId; label: string; icon: LucideIcon; title: string }> = [
  { id: 'dictation', label: 'Dictation', icon: Mic, title: 'Dictation' },
  { id: 'cloning', label: 'Voice clone', icon: Volume2, title: 'Voice cloning' },
  { id: 'presets', label: 'Models', icon: Layers, title: 'Models' },
  { id: 'history', label: 'History', icon: Clock, title: 'History' },
  { id: 'settings', label: 'Settings', icon: Settings, title: 'Settings' },
];

export function Sidebar({
  active,
  onChange,
  presetLabel,
  online,
  entryCount,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
  presetLabel: string;
  online: boolean;
  entryCount: number;
}) {
  return (
    <aside className="hidden w-[212px] shrink-0 flex-col justify-between border-r border-line bg-[#0c0c0e] px-2.5 py-3 md:flex">
      <div>
        <div className="flex items-center gap-2 px-1.5 pb-4">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-accent">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
              <g fill="#fff">
                <rect x="3" y="9" width="2.4" height="6" rx="1.2" />
                <rect x="7.4" y="6" width="2.4" height="12" rx="1.2" />
                <rect x="11.8" y="3" width="2.4" height="18" rx="1.2" />
                <rect x="16.2" y="7" width="2.4" height="10" rx="1.2" />
                <rect x="20.6" y="10" width="2.4" height="4" rx="1.2" />
              </g>
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold leading-tight text-ink">OpenFlow</p>
            <p className="text-[10px] leading-tight text-muted">Local voice OS</p>
          </div>
        </div>

        <nav aria-label="Sections" className="space-y-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-[12px] transition-colors',
                  isActive ? 'bg-white/[0.07] text-ink' : 'text-dim hover:bg-white/[0.04] hover:text-ink',
                )}
              >
                <Icon className={cn('h-3.5 w-3.5', isActive ? 'text-accent' : 'text-muted')} />
                <span className="flex-1 text-left">{tab.label}</span>
                {tab.id === 'history' && entryCount > 0 && (
                  <span className="tabular font-mono text-[10px] text-muted">{entryCount}</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-2 px-1.5 pb-1">
        <div className="flex items-center justify-between text-[10.5px]">
          <span className="flex items-center gap-1.5 text-muted">
            <StatusDot tone={online ? 'ok' : 'err'} />
            {online ? 'Engine connected' : 'Engine offline'}
          </span>
        </div>
        <p className="font-mono text-[10px] text-muted">
          {presetLabel} preset · v1.0.0
        </p>
      </div>
    </aside>
  );
}
