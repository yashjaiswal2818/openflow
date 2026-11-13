/**
 * Browser microphone capture for voice-profile enrolment.
 *
 * Records raw PCM through the Web Audio API, downsamples to the 16 kHz mono
 * format the engine expects and encodes a real 16-bit WAV in memory — no
 * ffmpeg, no MediaRecorder codec guesswork.
 */

export interface CapturedAudio {
  blob: Blob;
  base64: string;
  duration: number;
  sampleRate: number;
}

type LevelHandler = (level: number) => void;

export class MicRecorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private sink: GainNode | null = null;
  private chunks: Float32Array[] = [];
  private inputRate = 48_000;
  private startedAt = 0;
  private onLevel?: LevelHandler;

  static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof window !== 'undefined' &&
      !!(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    );
  }

  get isRecording(): boolean {
    return this.stream !== null;
  }

  async start(onLevel?: LevelHandler): Promise<void> {
    if (this.isRecording) return;
    this.onLevel = onLevel;
    this.chunks = [];

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new Ctor();
    this.inputRate = this.context.sampleRate;
    this.source = this.context.createMediaStreamSource(this.stream);

    const analyser = this.context.createAnalyser();
    analyser.fftSize = 512;
    const buffer = new Float32Array(analyser.fftSize);

    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      const samples = event.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(samples));
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
      const rms = Math.sqrt(sum / buffer.length);
      this.onLevel?.(Math.min(1, Math.sqrt(rms * 14)));
    };

    // Keep the graph alive without routing the microphone back to the speakers
    // (a direct processor -> destination connection causes feedback/howling).
    this.sink = this.context.createGain();
    this.sink.gain.value = 0;
    this.source.connect(analyser);
    analyser.connect(this.processor);
    this.processor.connect(this.sink);
    this.sink.connect(this.context.destination);
    this.startedAt = performance.now();
  }

  async stop(): Promise<CapturedAudio> {
    const duration = this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0;
    const merged = this.merge();
    this.teardown();

    const samples = downsample(merged, this.inputRate, 16_000);
    const blob = encodeWav(samples, 16_000);
    const base64 = await blobToBase64(blob);
    return { blob, base64, duration, sampleRate: 16_000 };
  }

  cancel(): void {
    this.teardown();
    this.chunks = [];
  }

  private merge(): Float32Array {
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  private teardown(): void {
    try {
      this.processor?.disconnect();
      this.sink?.disconnect();
      this.source?.disconnect();
      this.stream?.getTracks().forEach((track) => track.stop());
      void this.context?.close();
    } catch {
      // best-effort teardown
    }
    this.processor = null;
    this.sink = null;
    this.source = null;
    this.stream = null;
    this.context = null;
    this.onLevel = undefined;
  }
}

function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  let position = 0;
  for (let i = 0; i < length; i += 1) {
    const next = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = position; j < next && j < input.length; j += 1) {
      sum += input[j];
      count += 1;
    }
    output[i] = count ? sum / count : 0;
    position = next;
  }
  return output;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([view], { type: 'audio/wav' });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the recorded audio.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',', 2)[1] : result);
    };
    reader.readAsDataURL(blob);
  });
}
