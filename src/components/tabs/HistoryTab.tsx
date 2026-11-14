import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Search, Star, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { HistoryEntry } from '../../lib/types';
import type { EngineStore } from '../../hooks/useEngine';
import { AudioClip } from '../AudioClip';
import { Button, cn, EmptyState, IconButton, inputClass, Panel, Segmented } from '../ui';

type Filter = 'all' | 'starred';

export function HistoryTab({ engine }: { engine: EngineStore }) {
  const { state, online } = engine;
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await api.history(query);
      setEntries(payload.history);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load history.');
    } finally {
      setLoaded(true);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load, state?.last_result?.entry?.id]);

  const visible = filter === 'starred' ? entries.filter((entry) => entry.starred) : entries;
  const words = entries.reduce((sum, entry) => sum + (entry.cleaned_text ?? '').split(/\s+/).filter(Boolean).length, 0);
  const seconds = entries.reduce((sum, entry) => sum + (entry.duration ?? 0), 0);

  const star = async (entry: HistoryEntry) => {
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that entry.');
    }
  };

  const copy = async (entry: HistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.cleaned_text);
      setCopied(entry.id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setError('Clipboard access was blocked by the browser.');
    }
  };

  const clear = async () => {
    if (!window.confirm('Delete every entry? Recorded WAV files stay on disk.')) return;
    try {
      await api.clearHistory(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear history.');
    }
  };

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search transcripts"
              className={cn(inputClass, 'pl-7')}
            />
          </div>

          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'starred', label: 'Starred' },
            ]}
          />

          <div className="ml-auto flex items-center gap-2">
            <a href={api.exportUrl()} download="openflow-history.md" className="hidden sm:block">
              <Button size="sm" variant="ghost">Export</Button>
            </a>
            <Button size="sm" variant="ghost" onClick={() => void clear()} disabled={!entries.length}>
              Clear
            </Button>
          </div>
        </div>

        <div className="tabular flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-3 py-2 font-mono text-[10.5px] text-muted">
          <span>{entries.length} entries</span>
          <span className="text-[#3a3a40]">·</span>
          <span>{words} words</span>
          <span className="text-[#3a3a40]">·</span>
          <span>{Math.round(seconds)}s archived</span>
          <span className="text-[#3a3a40]">·</span>
          <span>{entries.filter((entry) => entry.starred).length} starred</span>
          {error && <span className="ml-auto text-err">{error}</span>}
        </div>
      </Panel>

      <Panel>
        {!loaded ? (
          <p className="px-4 py-8 text-center text-[11px] text-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            title={query ? 'No matching entries' : 'Nothing archived yet'}
            description={
              query
                ? 'Search covers both the raw and the cleaned transcript.'
                : online
                  ? 'Captures appear here with their raw WAV alongside both transcripts.'
                  : 'Start the engine to load the archive.'
            }
          />
        ) : (
          <ul className="divide-rows">
            {visible.map((entry) => {
              const open = expanded === entry.id;
              const fixes = Number((entry.meta as { report?: { total_fixes?: number } })?.report?.total_fixes ?? 0);
              return (
                <li key={entry.id} className="px-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <div className="tabular w-[86px] shrink-0 font-mono text-[10px] leading-relaxed text-muted">
                      <div className="text-dim">{entry.timestamp.slice(11, 16) || entry.timestamp}</div>
                      <div>{entry.timestamp.slice(0, 10)}</div>
                      <div>{entry.duration}s · {entry.preset}</div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{entry.cleaned_text}</p>

                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {entry.audio_file && (
                          <AudioClip
                            src={api.audioUrl(entry.audio_file, 'recordings')}
                            duration={entry.duration}
                            showDownload={false}
                            className="w-[132px]"
                          />
                        )}
                        {fixes > 0 && <span className="tabular font-mono text-[10px] text-muted">{fixes} fixes</span>}
                        {(entry.meta as { demo?: boolean })?.demo && (
                          <span className="font-mono text-[10px] text-warn">demo</span>
                        )}
                        {entry.raw_text !== entry.cleaned_text && (
                          <button
                            type="button"
                            onClick={() => setExpanded(open ? null : entry.id)}
                            className="text-[10.5px] text-muted underline-offset-2 transition-colors hover:text-dim hover:underline"
                          >
                            {open ? 'hide raw' : 'raw'}
                          </button>
                        )}
                      </div>

                      {open && (
                        <p className="mt-1.5 rounded border border-line-soft bg-raised px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-muted">
                          {entry.raw_text}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <IconButton label="Copy text" onClick={() => void copy(entry)}>
                        {copied === entry.id ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
                      </IconButton>
                      <IconButton label={entry.starred ? 'Unstar' : 'Star'} active={entry.starred} onClick={() => void star(entry)}>
                        <Star className={cn('h-3.5 w-3.5', entry.starred && 'fill-current text-warn')} />
                      </IconButton>
                      <IconButton label="Delete" onClick={() => void remove(entry)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
