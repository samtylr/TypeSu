import { describe, expect, it } from 'vitest';
import { judge, Session } from '../src/engine/session';
import type { Chart, Note } from '../src/chart/types';

function chartOf(letters: string, gap = 0.25, start = 1): Chart {
  const notes: Note[] = [...letters].map((letter, i) => ({ time: start + i * gap, letter, lane: i % 4, word: 0, index: i }));
  return { difficulty: 'normal', bpm: 120, offset: 0, notes, words: [letters], poems: [], peakLps: 4, rating: 1 };
}

describe('judging', () => {
  it('maps timing error to judgements', () => {
    expect(judge(0)).toBe('marvelous');
    expect(judge(-30)).toBe('perfect');
    expect(judge(80)).toBe('great');
    expect(judge(-130)).toBe('good');
    expect(judge(170)).toBe('miss');
  });
});

describe('session', () => {
  it('hits notes by letter, not by lane', () => {
    const s = new Session(chartOf('hello'));
    expect(s.press('h', 1.0)?.judgement).toBe('marvelous');
    expect(s.press('e', 1.28)?.judgement).toBe('perfect');
    expect(s.combo).toBe(2);
    expect(s.currentWord()).toEqual({ word: 0, typed: 2 });
  });

  it('consumes the earliest matching note in a double letter', () => {
    const s = new Session(chartOf('ll', 0.1));
    s.press('l', 1.0);
    expect(s.states[0].result).toBe('marvelous');
    expect(s.states[1].result).toBeNull();
    s.press('l', 1.1);
    expect(s.states[1].result).toBe('marvelous');
  });

  it('counts a wrong letter near a note as a typo and breaks combo', () => {
    const s = new Session(chartOf('ab'));
    s.press('a', 1.0);
    const ev = s.press('z', 1.25);
    expect(ev?.kind).toBe('typo');
    expect(s.typos).toBe(1);
    expect(s.combo).toBe(0);
  });

  it('ignores presses far from any note', () => {
    const s = new Session(chartOf('a'));
    expect(s.press('a', 0.2)).toBeNull();
    expect(s.states[0].result).toBeNull();
  });

  it('misses notes that pass the window and finishes', () => {
    const s = new Session(chartOf('abc'));
    s.update(5);
    expect(s.counts.miss).toBe(3);
    expect(s.finished).toBe(true);
    expect(s.accuracy).toBe(0);
  });
});
