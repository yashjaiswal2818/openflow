import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Mic, Square, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { TtsResult, VoiceProfile } from '../../lib/types';
import type { EngineStore } from '../../hooks/useEngine';
import { MicRecorder } from '../../lib/recorder';
import { AudioClip } from '../AudioClip';
import { Waveform } from '../Waveform';
import {
  Badge,
  Button,
  cn,
  EmptyState,
  Field,
  IconButton,
  inputClass,
  Panel,
  PanelHeader,
  StatusDot,
} from '../ui';

const MIN_SECONDS = 3;
const MAX_SECONDS = 15;

export function CloningTab({ engine }: { engine: EngineStore }) {
  const { capabilities, config, online, updateConfig } = engine;

  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const recorderRef = useRef<MicRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [enrolling, setEnrolling] = useState(false);

  const [text, setText] = useState('OpenFlow renders this sentence locally, using the voice profile selected above.');
  const [speaking, setSpeaking] = useState(false);
  const [tts, setTts] = useState<TtsResult | null>(null);

  const activeId = config?.active_voice_profile ?? null;
  const micSupported = MicRecorder.isSupported();

  const load = useCallback(async () => {
    try {
      const payload = await api.profiles();
      setProfiles(payload.profiles);
    } catch {
      setProfiles([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 0.1), 100);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (recording && elapsed >= MAX_SECONDS) void stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, recording]);

  useEffect(() => () => recorderRef.current?.cancel(), []);

  const startRecording = async () => {
    setError(null);
    setNotice(null);
    if (!micSupported) {
      setError('This browser cannot capture audio. Create a demo voice instead.');
      return;
    }
    try {
      const recorder = new MicRecorder();
      recorderRef.current = recorder;
      setElapsed(0);
      await recorder.start(setLevel);
      setRecording(true);
    } catch {
      setError('Microphone permission denied. Create a demo voice to explore the flow.');
      recorderRef.current = null;
    }
  };

  const stopRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    setRecording(false);
    setLevel(0);
    try {
      const capture = await recorder.stop();
      recorderRef.current = null;
      if (capture.duration < MIN_SECONDS) {
        setError(`Sample was ${capture.duration.toFixed(1)}s. Record at least ${MIN_SECONDS}s.`);
        return;
      }
      setEnrolling(true);
      const created = await api.createProfile(name.trim() || 'My voice', capture.base64);
      setProfiles((prev) => [...prev, created.profile]);
      await updateConfig({ active_voice_profile: created.profile.id });
      setName('');
      setNotice(`Saved “${created.profile.name}” (${created.profile.duration}s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that sample.');
    } finally {
      setEnrolling(false);
    }
  };

  const createDemo = async () => {
    setError(null);
    setEnrolling(true);
    try {
      const created = await api.createDemoProfile(name.trim() || 'Demo voice', 8);
      setProfiles((prev) => [...prev, created.profile]);
      await updateConfig({ active_voice_profile: created.profile.id });
      setName('');
      setNotice('Demo voice created from a synthetic reference.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a demo voice.');
    } finally {
      setEnrolling(false);
    }
  };

  const remove = async (profile: VoiceProfile) => {
    try {
      await api.deleteProfile(profile.id);
      const remaining = profiles.filter((item) => item.id !== profile.id);
      setProfiles(remaining);
      if (activeId === profile.id) {
        await updateConfig({ active_voice_profile: remaining[0]?.id ?? null });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that profile.');
    }
  };

  const synthesize = async () => {
    if (!text.trim()) return;
    setSpeaking(true);
    setError(null);
    try {
      setTts(await api.synthesize(text, activeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Synthesis failed.');
    } finally {
      setSpeaking(false);
    }
  };

  const engineName = capabilities?.tts.engine ?? 'preview';
  const quality = capabilities?.tts.quality ?? 'preview';
  const active = profiles.find((profile) => profile.id === activeId) ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <Panel className="h-fit">
        <PanelHeader
          title="Voice profiles"
          description="A 3–15s reference is validated, analysed for pitch and stored locally."
          action={<span className="tabular font-mono text-[10.5px] text-muted">{profiles.length}</span>}
        />

        {!loaded ? (
          <p className="px-4 py-6 text-center text-[11px] text-muted">Loading…</p>
        ) : profiles.length === 0 ? (
          <EmptyState title="No voices yet" description="Record a sample, or create a demo voice to try synthesis." />
        ) : (
          <ul className="divide-rows">
            {profiles.map((profile) => {
              const isActive = profile.id === activeId;
              return (
                <li key={profile.id} className="flex items-center gap-2 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => void updateConfig({ active_voice_profile: profile.id })}
                    aria-pressed={isActive}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className={cn(
                        'grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border',
                        isActive ? 'border-accent bg-accent/20' : 'border-line',
                      )}
                    >
                      {isActive && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] text-ink">{profile.name}</span>
                      <span className="tabular block truncate font-mono text-[10px] text-muted">
                        {profile.duration}s · {Math.round(profile.signature?.f0_hz ?? 0)} Hz
                      </span>
                    </span>
                  </button>

                  <AudioClip
                    src={api.audioUrl(profile.file, 'profiles')}
                    duration={profile.duration}
                    showDownload={false}
                    className="w-[104px] shrink-0"
                  />
                  <IconButton label={`Delete ${profile.name}`} onClick={() => void remove(profile)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}

        <div className="space-y-3 border-t border-line-soft px-4 py-3">
          <Field label="Profile name" htmlFor="profile-name">
            <input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Studio voice"
              className={inputClass}
            />
          </Field>

          {recording ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-raised px-2.5 py-2">
              <span className="flex items-center gap-2 text-[11.5px] text-ink">
                <Square className="h-3 w-3 fill-err text-err" />
                <span className="tabular font-mono text-[11px]">{elapsed.toFixed(1)}s</span>
                <span className="text-muted">{elapsed < MIN_SECONDS ? 'keep speaking' : 'ready to stop'}</span>
              </span>
              <div className="flex items-center gap-2">
                <Waveform level={level} active bars={10} maxHeight={16} />
                <Button size="sm" variant="danger" onClick={() => void stopRecording()}>
                  Stop
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => void startRecording()}
                disabled={!online || enrolling || !micSupported}
                title={micSupported ? 'Record a reference sample' : 'Browser microphone unavailable'}
                className="flex-1"
              >
                <Mic className="h-3.5 w-3.5" />
                Record sample
              </Button>
              <Button variant="ghost" onClick={() => void createDemo()} disabled={!online || enrolling}>
                {enrolling ? 'Saving…' : 'Demo voice'}
              </Button>
            </div>
          )}

          {notice && <p className="flex items-center gap-1.5 text-[11px] text-ok"><Check className="h-3 w-3" />{notice}</p>}
          {error && <p className="text-[11px] text-err">{error}</p>}
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel>
          <PanelHeader
            title="Synthesize"
            description="Rendered on this machine and written to ~/.openflow/recordings/tts_out."
            action={
              <Badge tone={quality === 'neural' ? 'ok' : 'neutral'} title={capabilities?.tts.reason ?? ''}>
                {engineName}
              </Badge>
            }
          />

          <div className="space-y-3 px-4 py-3">
            <Field label="Text" htmlFor="tts-text">
              <textarea
                id="tts-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={5}
                className={cn(inputClass, 'resize-none font-normal leading-relaxed')}
              />
            </Field>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[10.5px] text-muted">
                <StatusDot tone={active ? 'accent' : 'muted'} />
                {active ? active.name : 'Default voice'}
                <span className="text-[#3a3a40]">·</span>
                {text.length}/2000
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => void engine.readAloud(text, activeId)} disabled={!online || !text.trim()}>
                  Read aloud
                </Button>
                <Button variant="primary" onClick={() => void synthesize()} disabled={speaking || !text.trim() || !online}>
                  {speaking ? 'Rendering…' : 'Generate speech'}
                </Button>
              </div>
            </div>

            {quality === 'preview' && (
              <p className="rounded-md border border-line bg-raised px-2.5 py-2 text-[11px] leading-relaxed text-muted">
                No neural TTS weights installed, so output uses the built-in preview vocoder. It follows your pitch and
                the sentence rhythm but is not intelligible speech. Install <code className="font-mono text-dim">kokoro-onnx</code> for Kokoro-82M.
              </p>
            )}

            {tts && (
              <div className="fade-in rounded-md border border-line bg-raised px-2.5 py-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] text-dim">
                    <Check className="h-3 w-3 text-ok" />
                    {tts.duration}s · {tts.sample_rate / 1000} kHz
                  </span>
                  <span className="font-mono text-[10px] text-muted">{tts.profile_name}</span>
                </div>
                <AudioClip
                  src={api.audioUrl(tts.file, 'recordings/tts_out')}
                  duration={tts.duration}
                  onError={setError}
                />
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Read aloud" description="Highlight text anywhere and trigger the read-aloud shortcut." />
          <div className="flex flex-wrap items-center gap-6 px-4 py-3 text-[11.5px] text-muted">
            <span>
              Shortcut <code className="ml-1 font-mono text-dim">{config?.read_aloud_hotkey ?? 'Ctrl+Shift+Space'}</code>
            </span>
            <span>Voice: {active ? active.name : 'default'}</span>
            <span>Output: system audio device</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
