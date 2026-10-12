import { describe, expect, it } from 'vitest';
import { generateChart, TIERS } from '../src/chart/generator';
import { DIFFICULTIES, type SongTiming } from '../src/chart/types';

function timing(bpm: number, duration = 90, energy?: number[]): SongTiming {
  const beats = Math.ceil((duration * bpm) / 60);
  return { bpm, offset: 0.1, duration, beatEnergy: energy ?? new Array(beats).fill(0.8) };
}

describe('chart generator', () => {
  it('is deterministic for the same seed', () => {
    const a = generateChart({ timing: timing(120), difficulty: 'hard', seed: 42 });
    const b = generateChart({ timing: timing(120), difficulty: 'hard', seed: 42 });
    expect(a.notes).toEqual(b.notes);
  });

  it('uses the same poem on every difficulty of a song', () => {
    const first = DIFFICULTIES.map((d) => generateChart({ timing: timing(140), difficulty: d, seed: 7 }).words[0]);
    expect(new Set(first).size).toBe(1);
  });

  it('places notes on the beat grid, inside the song, in order', () => {
    const t = timing(128);
    for (const difficulty of DIFFICULTIES) {
      const chart = generateChart({ timing: t, difficulty, seed: 3 });
      expect(chart.notes.length).toBeGreaterThan(20);
      const tick = 60 / t.bpm / 4;
      let prev = -Infinity;
      for (const note of chart.notes) {
        const ticks = (note.time - t.offset) / tick;
        expect(Math.abs(ticks - Math.round(ticks))).toBeLessThan(1e-6);
        expect(note.time).toBeGreaterThan(prev);
        expect(note.time).toBeLessThan(t.duration);
        prev = note.time;
      }
    }
  });

  it('respects each tier\'s letters-per-second cap', () => {
    for (const bpm of [90, 150, 200]) {
      for (const difficulty of DIFFICULTIES) {
        const chart = generateChart({ timing: timing(bpm), difficulty, seed: 11 });
        for (let i = 1; i < chart.notes.length; i++) {
          const gap = chart.notes[i].time - chart.notes[i - 1].time;
          expect(1 / gap).toBeLessThanOrEqual(TIERS[difficulty].maxLps + 1e-6);
        }
      }
    }
  });

  it('gets denser from easy to insane', () => {
    const counts = DIFFICULTIES.map((d) => generateChart({ timing: timing(150), difficulty: d, seed: 5 }).notes.length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
  });

  it('leaves near-silent sections empty', () => {
    const bpm = 120;
    const energy = new Array(200).fill(0.9);
    for (let b = 32; b < 64; b++) energy[b] = 0.02; // beats 32-63 are silent
    const chart = generateChart({ timing: timing(bpm, 90, energy), difficulty: 'hard', seed: 1 });
    const beat = (n: number) => 0.1 + (n * 60) / bpm;
    expect(chart.notes.some((n) => n.time >= beat(32) && n.time < beat(64))).toBe(false);
    expect(chart.notes.some((n) => n.time >= beat(64))).toBe(true);
  });

  it('only uses letters a to z and keeps words intact', () => {
    const chart = generateChart({ timing: timing(120), difficulty: 'normal', seed: 9 });
    for (const note of chart.notes) {
      expect(note.letter).toMatch(/^[a-z]$/);
      expect(chart.words[note.word][note.index]).toBe(note.letter);
    }
  });
});
