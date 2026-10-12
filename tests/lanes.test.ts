import { describe, expect, it } from 'vitest';
import { assignLanes, countFakeJacks, handOf, homeLane, type LaneInput } from '../src/chart/lanes';

/** Letters of a word at a fixed gap, all in one word. */
function word(text: string, gap = 0.125, wordId = 0, start = 0): LaneInput[] {
  return [...text].map((letter, i) => ({ letter, time: start + i * gap, word: wordId }));
}

describe('home lanes', () => {
  it('maps every letter to a lane', () => {
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
      expect(homeLane(ch)).toBeGreaterThanOrEqual(0);
      expect(homeLane(ch)).toBeLessThan(4);
    }
  });

  it('puts left-hand letters left and right-hand letters right', () => {
    for (const ch of 'qwertasdfgzxcvb') expect(handOf(homeLane(ch))).toBe(0);
    for (const ch of 'yuiophjklnm') expect(handOf(homeLane(ch))).toBe(1);
  });
});

describe('comfort solver', () => {
  it('solves "hello" as in the plan: 2-1-3-3-2', () => {
    expect(assignLanes(word('hello'), { flexible: true })).toEqual([2, 1, 3, 3, 2]);
  });

  it('keeps double letters as a true jack', () => {
    const notes = word('lollipop');
    const lanes = assignLanes(notes, { flexible: true });
    expect(lanes[2]).toBe(lanes[3]); // the "ll"
  });

  it('never moves a letter to the other hand', () => {
    const notes = word('thequickbrownfoxjumpsoverthelazydog');
    const lanes = assignLanes(notes, { flexible: true });
    notes.forEach((n, i) => expect(handOf(lanes[i])).toBe(handOf(homeLane(n.letter))));
  });

  it('removes fake jacks from tricky words', () => {
    for (const text of ['hello', 'minimum', 'sweaters', 'kin', 'look', 'pool', 'jump']) {
      const notes = word(text);
      const lanes = assignLanes(notes, { flexible: true });
      expect(countFakeJacks(notes, lanes), text).toBe(0);
    }
  });

  it('keeps every letter on its home lane when not flexible', () => {
    const notes = word('sweaters');
    const lanes = assignLanes(notes, { flexible: false });
    notes.forEach((n, i) => expect(lanes[i]).toBe(homeLane(n.letter)));
  });

  it('handles an empty input', () => {
    expect(assignLanes([], { flexible: true })).toEqual([]);
  });
});
