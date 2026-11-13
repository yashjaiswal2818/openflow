import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Fingerprint,
  Mic,
  Square,
  Trash2,
  Upload,
  Volume2,
  Wand2,
} from 'lucide-react';
import { api } from '../../lib/api';
import type { TtsResult, VoiceProfile } from '../../lib/types';
import type { EngineStore } from '../../hooks/useEngine';
import { MicRecorder } from '../../lib/recorder';
import { AudioClip } from '../AudioClip';
import { Waveform } from '../Waveform';
import { Badge, Button, cn, EmptyState, Panel, SectionHeading } from '../ui';

const MIN_SECONDS = 3;
const TARGET_SECONDS = 8;
const MAX_SECONDS = 15;

export function CloningTab({ engine }: { engine: EngineStore }) {
  const { capabilities, config, online, updateConfig } = engine;

  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const recorderRef = useRef<MicRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [enrolling, setEnrolling] = useState(false);

  const [ttsText, setTtsText] = useState('Welcome to OpenFlow. This line was synthesized on your own machine, offline.');
  const [speaking, setSpeaking] = useState(false);
  const [tts, setTts] = useState<TtsResult | null>(null);

  const micSupported = MicRecorder.isSupported();
  const activeProfileId = config?.active_voice_profile ?? null;

  const refreshProfiles = useCallback(async () => {
    try {
      const payload = await api.profiles();
      setProfiles(payload.profiles);
    } catch {
      setProfiles([]);
    } finally {
      setLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

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
      setError('This browser cannot capture audio. Use the demo profile instead.');
      return;
    }
    try {
      const recorder = new MicRecorder();
      recorderRef.current = recorder;
      setElapsed(0);
      await recorder.start(setLevel);
      setRecording(true);
    } catch {
      setError('Microphone permission was denied. Grant access, or create a demo profile to explore the flow.');
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
        setError(`That was ${capture.duration.toFixed(1)}s — record at least ${MIN_SECONDS}s of continuous speech.`);
        return;
      }
      setEnrolling(true);
      const created = await api.createProfile(name.trim() || 'My Voice', capture.base64);
      setProfiles((prev) => [...prev, created.profile]);
      await updateConfig({ active_voice_profile: created.profile.id });
      setName('');
      setNotice(`“${created.profile.name}” enrolled — ${created.profile.duration}s reference, pitch ${Math.round(
        created.profile.signature?.f0_hz ?? 0,
      )} Hz.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enrol that reference clip.');
    } finally {
      setEnrolling(false);
    }
  };

  const createDemoProfile = async () => {
    setError(null);
    setEnrolling(true);
    try {
      const created = await api.createDemoProfile(name.trim() || 'Demo Voice', TARGET_SECONDS);
      setProfiles((prev) => [...prev, created.profile]);
      await updateConfig({ active_voice_profile: created.profile.id });
      setName('');
      setNotice('Demo voice created from a synthetic reference — no microphone required.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a demo profile.');
    } finally {
      setEnrolling(false);
    }
  };

  const removeProfile = async (profile: VoiceProfile) => {
    try {
      await api.deleteProfile(profile.id);
      setProfiles((prev) => prev.filter((item) => item.id !== profile.id));
      if (activeProfileId === profile.id) {
        const fallback = profiles.find((item) => item.id !== profile.id) ?? null;
        await updateConfig({ active_voice_profile: fallback?.id ?? null });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that profile.');
    }
  };

  const synthesize = async () => {
    if (!ttsText.trim()) return;
    setSpeaking(true);
    setError(null);
    try {
      const result = await api.synthesize(ttsText, activeProfileId);
      setTts(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Synthesis failed.');
    } finally {
      setSpeaking(false);
    }
  };

  const engineLabel = capabilities?.tts.engine ?? 'preview';
  const quality = capabilities?.tts.quality ?? 'preview';
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.05fr_1fr]">
        <Panel className="p-5">
          <SectionHeading
            title="Enrol a voice clone"
            description="Record 5–15 seconds of natural speech once. OpenFlow validates loudness and clipping, extracts your pitch signature and stores the reference locally."
            action={<Badge tone="brand">local only</Badge>}
          />

          <div className="mt-4 flex flex-col gap-3">
            <label className="text-[11px] font-medium text-zinc-400" htmlFor="profile-name">
              Profile name
            </label>
            <input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Studio voice"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-brand-500/60"
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-black/25 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => (recording ? void stopRecording() : void startRecording())}
                disabled={!online || enrolling}
                aria-label={recording ? 'Stop reference recording' : 'Record reference sample'}
                className={cn(
                  'relative flex h-11 w-11 items-center justify-center rounded-full text-white transition-all disabled:opacity-50',
                  recording ? 'bg-rose-500 hover:bg-rose-400' : 'bg-brand-600 hover:bg-brand-500',
                )}
              >
                {recording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
                {recording && <span className="absolute inset-0 rounded-full ring-1 ring-rose-300/50 ping-ring" />}
              </button>
              <div>
                <p className="text-[12px] font-medium text-white">
                  {recording ? `Recording ${elapsed.toFixed(1)}s` : 'Reference sample'}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {recording
                    ? elapsed < MIN_SECONDS
                      ? `Keep going — ${(MIN_SECONDS - elapsed).toFixed(0)}s minimum`
                      : 'Speak naturally, then press stop'
                    : `${MIN_SECONDS}–${MAX_SECONDS}s of clean speech`}
                </p>
              </div>
            </div>
            <Waveform level={level} active={recording} bars={10} maxHeight={26} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => void createDemoProfile()} disabled={enrolling || !online}>
              <Wand2 className="h-3.5 w-3.5" />
              Create demo voice
            </Button>
            <span className="text-[11px] text-zinc-500">
              {micSupported ? 'Uses your browser microphone.' : 'Browser mic unavailable — demo voice still works.'}
            </span>
          </div>

          {notice && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-2 text-[11px] text-emerald-200">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {notice}
            </p>
          )}
          {error && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}

          <div className="mt-5 border-t border-white/6 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Voice profiles</p>
              <span className="font-mono text-[10px] text-zinc-600">{profiles.length} stored</span>
            </div>

            {loadingProfiles ? (
              <p className="py-4 text-center text-[11px] text-zinc-500">Loading profiles…</p>
            ) : profiles.length === 0 ? (
              <EmptyState
                icon={<Fingerprint className="h-4 w-4" />}
                title="No voices yet"
                description="Record a reference sample or generate a demo voice to unlock the synthesiser."
              />
            ) : (
              <ul className="space-y-2">
                {profiles.map((profile) => {
                  const active = profile.id === activeProfileId;
                  return (
                    <li
                      key={profile.id}
                      className={cn(
                        'rounded-xl border px-3 py-2.5 transition-colors',
                        active ? 'border-brand-500/40 bg-brand-500/[0.07]' : 'border-white/8 bg-white/[0.02] hover:border-white/15',
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => void updateConfig({ active_voice_profile: profile.id })}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="flex items-center gap-1.5 truncate text-[12px] font-medium text-white">
                            {profile.name}
                            {active && <Check className="h-3 w-3 shrink-0 text-brand-300" />}
                          </p>
                          <p className="truncate text-[10px] text-zinc-500">
                            {profile.duration}s · {Math.round(profile.signature?.f0_hz ?? 0)} Hz ·{' '}
                            {profile.description}
                          </p>
                        </button>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <AudioClip
                            src={api.audioUrl(profile.file, 'profiles')}
                            duration={profile.duration}
                            compact
                            className="border-0 bg-transparent px-0 py-0"
                          />
                          <button
                            type="button"
                            onClick={() => void removeProfile(profile)}
                            aria-label={`Delete ${profile.name}`}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Panel>

        <Panel className="p-5">
          <SectionHeading
            title="Synthesize speech"
            description="Render any text offline in the selected voice. Read-aloud uses the same engine for selected screen text."
            action={
              <Badge tone={quality === 'neural' ? 'mint' : 'amber'} title={capabilities?.tts.reason ?? ''}>
                {engineLabel}
              </Badge>
            }
          />

          <div className="mt-4">
            <label className="text-[11px] font-medium text-zinc-400" htmlFor="tts-text">
              Text
            </label>
            <textarea
              id="tts-text"
              value={ttsText}
              onChange={(event) => setTtsText(event.target.value)}
              rows={5}
              className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3.5 py-3 text-[13px] leading-relaxed text-zinc-100 outline-none transition-colors focus:border-brand-500/60"
            />
            <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
              <span>{ttsText.length} / 2000 characters</span>
              <span>{activeProfile ? `Voice: ${activeProfile.name}` : 'Default voice'}</span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={() => void synthesize()}
              disabled={speaking || !ttsText.trim() || !online}
            >
              <Volume2 className="h-3.5 w-3.5" />
              {speaking ? 'Rendering…' : 'Generate speech'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void engine.readAloud(ttsText, activeProfileId)}
              disabled={!online || !ttsText.trim()}
              title="Synthesize and play through the system audio device"
            >
              <Upload className="h-3.5 w-3.5" />
              Read aloud
            </Button>
          </div>

          {quality === 'preview' && (
            <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-100/85">
              No neural TTS weights are installed, so OpenFlow is using its built-in preview vocoder: real audio that
              follows your pitch and the text rhythm, but not intelligible speech. Install{' '}
              <code className="rounded bg-black/30 px-1 font-mono text-[10px]">kokoro-onnx</code> for Kokoro-82M.
            </p>
          )}

          <div className="mt-4">
            {tts ? (
              <div className="rise-in rounded-xl border border-white/8 bg-black/25 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
                    <Check className="h-3.5 w-3.5 text-emerald-400" /> Rendered in {tts.duration}s
                  </p>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {tts.sample_rate / 1000} kHz · {tts.engine}
                  </span>
                </div>
                <AudioClip
                  src={api.audioUrl(tts.file, 'recordings/tts_out')}
                  duration={tts.duration}
                  label={tts.profile_name}
                  onError={setError}
                />
                <p className="mt-2 text-[10px] text-zinc-500">
                  Saved to <span className="font-mono">~/.openflow/recordings/tts_out/{tts.file}</span>
                </p>
              </div>
            ) : (
              <EmptyState
                icon={<Volume2 className="h-4 w-4" />}
                title="Nothing synthesized yet"
                description="Generated audio is written to your local OpenFlow folder — nothing is uploaded anywhere."
              />
            )}
          </div>
        </Panel>
      </div>

      <Panel className="p-5">
        <SectionHeading
          title="System-wide read aloud"
          description="Highlight text in any application and trigger the read-aloud shortcut. OpenFlow speaks it in your cloned voice without leaving the app you are in."
          action={<Badge tone="violet">{config?.read_aloud_hotkey ?? 'Ctrl+Shift+Space'}</Badge>}
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { step: '1', title: 'Select text', detail: 'Highlight a paragraph in any app.' },
            { step: '2', title: 'Press the shortcut', detail: 'The engine receives the selection.' },
            { step: '3', title: 'Hear it locally', detail: 'Synthesized in your cloned voice, offline.' },
          ].map((item) => (
            <div key={item.step} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <span className="font-mono text-[10px] text-brand-300">{item.step}</span>
              <p className="mt-1 text-[12px] font-medium text-zinc-200">{item.title}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{item.detail}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
