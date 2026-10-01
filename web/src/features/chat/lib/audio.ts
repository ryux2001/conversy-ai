const TARGET_SAMPLE_RATE = 16_000;

export interface DecodedSpeechAudio {
  samples: Float32Array;
  sampleRate: 16_000;
  durationSeconds: number;
}

export async function decodeAudioToMono16k(source: Blob): Promise<DecodedSpeechAudio> {
  if (!source.size || source.size > 40 * 1024 * 1024) throw new Error("AUDIO_SIZE_INVALID");
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) throw new Error("AUDIO_DECODE_UNSUPPORTED");

  const context = new AudioContextConstructor();
  try {
    const decoded = await context.decodeAudioData(await source.arrayBuffer());
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration > 30) {
      throw new Error("AUDIO_DURATION_INVALID");
    }

    const frameCount = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
    const samples = new Float32Array(frameCount);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
    const ratio = decoded.sampleRate / TARGET_SAMPLE_RATE;
    for (let frame = 0; frame < frameCount; frame += 1) {
      const position = frame * ratio;
      const before = Math.floor(position);
      const after = Math.min(before + 1, decoded.length - 1);
      const fraction = position - before;
      let mixed = 0;
      for (const channel of channels) {
        mixed += channel[before]! * (1 - fraction) + channel[after]! * fraction;
      }
      const normalized = Math.max(-1, Math.min(1, mixed / channels.length));
      samples[frame] = normalized;
    }
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    if (!Number.isFinite(rms) || rms < 0.002) throw new Error("NO_SPEECH_DETECTED");
    return { samples, sampleRate: TARGET_SAMPLE_RATE, durationSeconds: decoded.duration };
  } finally {
    await context.close().catch(() => undefined);
  }
}
