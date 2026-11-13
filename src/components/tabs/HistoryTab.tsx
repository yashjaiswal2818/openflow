import { useCallback, useEffect, useState } from 'react';
import { Check, Clock, Copy, Download, Search, Star, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { HistoryEntry, HistoryStats } from '../../lib/types';
import type { EngineStore } from '../../hooks/useEngine';
import { AudioClip } from '../AudioClip';
import { Badge, Button, cn, EmptyState, Panel, SectionHeading } from '../ui';

type Filter = 'all' | 'starred';

export function HistoryTab({ engine }: { engine: EngineStore }) {
  const { state, online } = engine;
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await api.history(query);
      setEntries(payload.history);
      setStats(payload.stats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load history.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh when a new dictation lands so the archive stays current.
  useEffect(() => {
    void load();
  }, [state?.last_result?.entry?.id, load]);

  const visible = filter === 'starred' ? entries.filter((entry) => entry.starred) : entries;

  const toggleStar = async (entry: HistoryEntry) => {
    try {
      const result = await api.star(entry.id);
      setEntries((prev) => prev.map((item) => (item.id === entry.id ? { ...item, starred: result.starred } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that entry.');
    }
  };

  const remove = async (entry: HistoryEntry) => {
    try {
      await api.deleteEntry(entry.id);
      setEntries((prev) => prev.filter((item) => item.id !== entry.id));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that entry.');
    }
  };

  const copy = async (entry: HistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.cleaned_text);
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      setError('Clipboard access was blocked by the browser.');
    }
  };

  const clearAll = async () => {
    if (!window.confirm('Delete every dictation entry? Recorded WAV files stay on disk.')) return;
    try {
      await api.clearHistory(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear history.');
    }
  };

  return (
    <div className="space-y-5">
      <Panel className="p-5">
        <SectionHeading
          title="Recordings archive"
          description="Every dictation keeps its raw WAV, the raw transcript and the cleaned text. Nothing is discarded, and nothing leaves the machine."
          action={
            <div className="flex items-center gap-2">
              <a href={api.exportUrl()} download="openflow-history.md">
                <Button size="sm" variant="secondary">
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
              </a>
              <Button size="sm" variant="danger" onClick={() => void clearAll()} disabled={!entries.length}>
                <Trash2 className="h-3.5 w-3.5" /> Clear
              </Button>
            </div>
          }
        />

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {[
            { label: 'Entries', value: stats?.entries ?? 0 },
            { label: 'Word count', value: stats?.words ?? 0 },
            { label: 'Audio archived', value: `${Math.round(stats?.speech_seconds ?? 0)}s` },
            { label: 'Starred', value: stats?.starred ?? 0 },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2">
              <p className="font-mono text-[15px] font-semibold text-white">{item.value}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search transcripts…"
              className="w-full bg-transparent text-[12px] text-zinc-200 outline-none placeholder:text-zinc-600"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-[10px] text-zinc-500 hover:text-zinc-200">
                clear
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
            {(['all', 'starred'] as Filter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-[11px] font-medium capitalize transition-colors',
                  filter === option ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-200',
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            Refresh
          </Button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">{error}</p>
        )}
      </Panel>

      {loading ? (
        <Panel className="p-8 text-center text-[12px] text-zinc-500">Loading archive…</Panel>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-4 w-4" />}
          title={query ? 'No matching dictations' : 'No dictations yet'}
          description={
            query
              ? 'Try a different search term — both the raw and cleaned transcripts are searched.'
              : online
                ? 'Capture something from the Dictation tab. Raw audio and both transcripts are archived here automatically.'
                : 'Start the engine, then capture your first dictation.'
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {visible.map((entry) => {
            const isOpen = expanded === entry.id;
            const fixes = Number((entry.meta as { report?: { total_fixes?: number } })?.report?.total_fixes ?? 0);
            return (
              <li key={entry.id} className="glass-panel rounded-2xl px-4 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                    <span className="font-mono text-zinc-400">{entry.timestamp}</span>
                    <span>·</span>
                    <span>{entry.duration}s</span>
                    <span>·</span>
                    <span className="uppercase tracking-wider text-brand-300/80">{entry.preset}</span>
                    {fixes > 0 && <Badge tone="mint">{fixes} fixes</Badge>}
                    {(entry.meta as { demo?: boolean })?.demo && <Badge tone="amber">demo</Badge>}
                    {entry.starred && <Star className="h-3 w-3 fill-amber-300 text-amber-300" />}
                  </div>

                  <div className="flex items-center gap-1">
                    {entry.audio_file && (
                      <AudioClip
                        src={api.audioUrl(entry.audio_file, 'recordings')}
                        duration={entry.duration}
                        compact
                        className="border-0 bg-transparent px-0 py-0"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => void copy(entry)}
                      aria-label="Copy cleaned text"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      {copiedId === entry.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleStar(entry)}
                      aria-label={entry.starred ? 'Unstar entry' : 'Star entry'}
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/5',
                        entry.starred ? 'text-amber-300' : 'text-zinc-500 hover:text-white',
                      )}
                    >
                      <Star className={cn('h-3.5 w-3.5', entry.starred && 'fill-current')} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(entry)}
                      aria-label="Delete entry"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-100">{entry.cleaned_text}</p>

                {entry.raw_text !== entry.cleaned_text && (
                  <div className="mt-1.5">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : entry.id)}
                      className="text-[10px] text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300 hover:underline"
                    >
                      {isOpen ? 'hide raw transcript' : 'show raw transcript'}
                    </button>
                    {isOpen && (
                      <p className="mt-1.5 rounded-lg border border-white/6 bg-black/25 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-zinc-500">
                        {entry.raw_text}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
