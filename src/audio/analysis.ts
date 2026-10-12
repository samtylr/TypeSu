/**
 * One-off song analysis at import: tempo, first-beat offset and per-beat loudness.
 * Uses web-audio-beat-detector (runs in a worker) for BPM and offset.
 */
import { guess } from 'web-audio-beat-detector';

export const MIN_BPM = 85;
export const MAX_BPM = 200;

export async function decodeFile(ctx: BaseAudioContext, file: File): Promise<AudioBuffer> {
  const data = await file.arrayBuffer();
  return ctx.decodeAudioData(data);
}

/** Fold half/double-tempo detections into a playable window. */
export function foldBpm(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 120;
  let b = bpm;
  while (b < MIN_BPM) b *= 2;
  while (b > MAX_BPM) b /= 2;
  return Math.round(b * 100) / 100;
}

/** Earliest beat at or after 0, given any beat time. */
export function earliestBeat(anyBeat: number, bpm: number): number {
  const beat = 60 / bpm;
  return ((anyBeat % beat) + beat) % beat;
}

export interface DetectedTiming {
  bpm: number;
  offset: number;
}

export async function detectTiming(buffer: AudioBuffer): Promise<DetectedTiming> {
  const result = await guess(buffer, { minTempo: 80, maxTempo: 190 });
  const bpm = foldBpm(result.bpm);
  return { bpm, offset: earliestBeat(result.offset, bpm) };
}

/**
 * RMS loudness per beat, normalised so the 90th-percentile beat is 1.
 * Index i covers [offset + i*beat, offset + (i+1)*beat).
 */
export function computeBeatEnergy(buffer: AudioBuffer, bpm: number, offset: number): number[] {
  const rate = buffer.sampleRate;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const beatSamples = (60 / bpm) * rate;
  const stride = 8; // sampling every 8th sample is plenty for loudness
  const energies: number[] = [];

  for (let start = offset * rate; start < buffer.length; start += beatSamples) {
    const from = Math.floor(start);
    const to = Math.min(buffer.length, Math.floor(start + beatSamples));
    let sum = 0;
    let count = 0;
    for (let i = from; i < to; i += stride) {
      let v = 0;
      for (const ch of channels) v += ch[i];
      v /= channels.length;
      sum += v * v;
      count++;
    }
    energies.push(count ? Math.sqrt(sum / count) : 0);
  }
  return normalise(energies);
}

export function normalise(values: number[]): number[] {
  if (values.length === 0) return values;
  const sorted = values.slice().sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.9)] || sorted[sorted.length - 1] || 1;
  return values.map((v) => Math.min(1.5, ref > 0 ? v / ref : 0));
}

/** Tempo from tapped times (ms), using the median interval of the last taps. */
export function bpmFromTaps(taps: number[]): number | null {
  if (taps.length < 4) return null;
  const recent = taps.slice(-12);
  const gaps = recent.slice(1).map((t, i) => t - recent[i]).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (!median) return null;
  return Math.round((60000 / median) * 10) / 10;
}
