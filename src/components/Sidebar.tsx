import type { LucideIcon } from 'lucide-react';
import { Clock, Layers, Mic, Settings, ShieldCheck, Sparkles, Volume2 } from 'lucide-react';
import { Badge, cn } from './ui';

export type TabId = 'dictation' | 'cloning' | 'presets' | 'history' | 'settings';

export const TABS: Array<{ id: TabId; label: string; icon: LucideIcon; title: string; subtitle: string }> = [
  {
    id: 'dictation',
    label: 'Dictation',
    icon: Mic,
    title: 'Intelligent dictation',
    subtitle: 'Speak anywhere · cleaned text lands at your cursor',
  },
  {
    id: 'cloning',
    label: 'Voice clone',
    icon: Volume2,
    title: 'Voice cloning & TTS',
    subtitle: 'Zero-shot profiles · fully offline synthesis',
  },
  {
    id: 'presets',
    label: 'Models',
    icon: Layers,
    title: 'Model tiers',
    subtitle: 'Fast, Balanced and Pro Studio profiles',
  },
  {
    id: 'history',
    label: 'Archive',
    icon: Clock,
    title: 'Recordings archive',
    subtitle: 'Raw WAV + raw and cleaned transcripts',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    title: 'Preferences',
    subtitle: 'Shortcuts, cleaner rules and diagnostics',
  },
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
    <aside className="hidden w-[232px] shrink-0 flex-col justify-between border-r border-white/6 bg-ink-900/70 px-3 py-4 backdrop-blur-xl md:flex">
      <div>
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 via-purple-500 to-pink-500 shadow-lg shadow-brand-500/25">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight text-white">
              OpenFlow
              <span className="rounded bg-brand-500/15 px-1 py-0.5 font-mono text-[9px] font-medium text-brand-300">1.0</span>
            </p>
            <p className="text-[10px] text-zinc-500">Local voice OS</p>
          </div>
        </div>

        <nav className="space-y-1" aria-label="Primary">
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
                  'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12px] font-medium transition-colors',
                  isActive
                    ? 'bg-brand-500/12 text-brand-200 ring-1 ring-brand-500/25'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white',
                )}
              >
                <Icon className={cn('h-4 w-4', isActive && 'text-brand-300')} />
                <span className="flex-1 text-left">{tab.label}</span>
                {tab.id === 'history' && entryCount > 0 && (
                  <span className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">{entryCount}</span>
                )}
                {tab.id === 'presets' && (
                  <span className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-400">
                    {presetLabel}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-2">
        <div className="rounded-xl border border-white/6 bg-white/[0.02] p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            100% offline
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
            No cloud, no API keys, no telemetry. Your audio never leaves this machine.
          </p>
        </div>
        <div className="flex items-center justify-between px-1">
          <Badge tone={online ? 'mint' : 'hot'}>{online ? 'engine online' : 'engine offline'}</Badge>
          <span className="font-mono text-[9px] text-zinc-600">v1.0.0</span>
        </div>
      </div>
    </aside>
  );
}
