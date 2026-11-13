import type { EngineStore } from '../hooks/useEngine';
import { HeaderBar } from './HeaderBar';
import { Sidebar, type TabId } from './Sidebar';
import { CloningTab } from './tabs/CloningTab';
import { DictationTab } from './tabs/DictationTab';
import { HistoryTab } from './tabs/HistoryTab';
import { PresetsTab } from './tabs/PresetsTab';
import { SettingsTab } from './tabs/SettingsTab';

export function StudioDashboard({
  engine,
  tab,
  onTabChange,
}: {
  engine: EngineStore;
  tab: TabId;
  onTabChange: (tab: TabId) => void;
}) {
  const { capabilities, config, stats, online, refresh } = engine;
  const demo = capabilities?.demo_mode ?? false;
  const presetLabel = config?.active_preset ?? capabilities?.preset ?? 'balanced';

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar
        active={tab}
        onChange={onTabChange}
        presetLabel={presetLabel}
        online={online}
        entryCount={stats?.entries ?? 0}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <HeaderBar
          tab={tab}
          online={online}
          demo={demo}
          hotkey={config?.hotkey ?? 'Ctrl+Space'}
          onRetry={() => void refresh()}
          onTabChange={onTabChange}
        />

        <div className="flex-1 overflow-y-auto px-5 pb-32 pt-5 sm:px-7">
          <div className="mx-auto w-full max-w-6xl">
            {tab === 'dictation' && <DictationTab engine={engine} />}
            {tab === 'cloning' && <CloningTab engine={engine} />}
            {tab === 'presets' && <PresetsTab engine={engine} />}
            {tab === 'history' && <HistoryTab engine={engine} />}
            {tab === 'settings' && <SettingsTab engine={engine} />}
          </div>
        </div>
      </main>
    </div>
  );
}
