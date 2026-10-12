/**
 * A built-in demo track synthesised in code, so the game is playable without
 * loading any music. 120 BPM, first beat at 0 s, with quiet and loud sections
 * so the chart generator's energy-based snapping has something to react to.
 */
export const DEMO_BPM = 120;
export const DEMO_OFFSET = 0;

type Section = 'intro' | 'groove' | 'break' | 'drive' | 'outro';

const PLAN: [Section, number][] = [
  ['intro', 4],
  ['groove', 12],
  ['break', 4],
  ['drive', 16],
  ['outro', 4],
];

// A minor, F, C, G (Hz of bass roots)
const ROOTS = [55, 43.65, 65.41, 49];
const CHORDS = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [261.63, 329.63, 392],
  [196, 246.94, 293.66],
];

export function makeDemoBuffer(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const beat = 60 / DEMO_BPM;
  const bars = PLAN.reduce((n, [, b]) => n + b, 0);
  const length = Math.ceil((bars * 4 * beat + 1.5) * rate);
  const out = new Float32Array(length);

  let seed = 1234567;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x3fffffff - 1;
  };

  const add = (startSec: number, durSec: number, fn: (t: number) => number) => {
    const s = Math.floor(startSec * rate);
    const n = Math.floor(durSec * rate);
    for (let i = 0; i < n && s + i < length; i++) out[s + i] += fn(i / rate);
  };

  const kick = (at: number, amp = 0.9) =>
    add(at, 0.4, (t) => {
      const f = 45 + 105 * Math.exp(-t * 30);
      return amp * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9);
    });
  const snare = (at: number, amp = 0.45) => {
    let prev = 0;
    add(at, 0.2, (t) => {
      const n = noise();
      const hp = n - prev;
      prev = n;
      return amp * (0.7 * hp * Math.exp(-t * 22) + 0.4 * Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 30));
    });
  };
  const hat = (at: number, amp = 0.18) => {
    let prev = 0;
    add(at, 0.05, (t) => {
      const n = noise();
      const hp = n - prev;
      prev = n;
      return amp * hp * Math.exp(-t * 90);
    });
  };
  const bass = (at: number, freq: number, amp = 0.28) =>
    add(at, beat * 0.45, (t) => amp * Math.tanh(3 * Math.sin(2 * Math.PI * freq * t)) * Math.exp(-t * 6));
  const pad = (at: number, chord: number[], dur: number, amp = 0.05) =>
    add(at, dur, (t) => {
      const env = Math.min(1, t / 0.3) * Math.min(1, (dur - t) / 0.3);
      return amp * env * chord.reduce((s, f) => s + Math.sin(2 * Math.PI * f * t), 0);
    });

  let bar = 0;
  for (const [section, count] of PLAN) {
    for (let b = 0; b < count; b++, bar++) {
      const t0 = bar * 4 * beat;
      const chordIndex = bar % 4;
      pad(t0, CHORDS[chordIndex], 4 * beat, section === 'break' ? 0.07 : 0.045);
      for (let q = 0; q < 4; q++) {
        const t = t0 + q * beat;
        if (section === 'intro' || section === 'outro') {
          hat(t, 0.1);
          if (q === 0) kick(t, 0.5);
          continue;
        }
        if (section === 'break') {
          if (q === 0) hat(t, 0.08);
          continue;
        }
        kick(t);
        if (q === 1 || q === 3) snare(t);
        hat(t + beat / 2);
        bass(t, ROOTS[chordIndex]);
        bass(t + beat / 2, ROOTS[chordIndex] * 2, 0.18);
        if (section === 'drive') {
          hat(t + beat / 4, 0.1);
          hat(t + (3 * beat) / 4, 0.1);
        }
      }
    }
  }

  // Normalise to a safe peak.
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? 0.85 / peak : 1;
  for (let i = 0; i < length; i++) out[i] *= gain;

  const buffer = ctx.createBuffer(2, length, rate);
  buffer.copyToChannel(out, 0);
  buffer.copyToChannel(out, 1);
  return buffer;
}
