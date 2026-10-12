/**
 * Gameplay rules: matching keypresses to notes, judging timing, combo and accuracy.
 * Pure logic with no DOM or audio, so it can be unit-tested.
 */
import type { Chart, Note } from '../chart/types';

export type Judgement = 'marvelous' | 'perfect' | 'great' | 'good' | 'miss';

/** Hit windows in milliseconds (absolute timing error). */
export const WINDOWS: Record<Exclude<Judgement, 'miss'>, number> = {
  marvelous: 22,
  perfect: 45,
  great: 90,
  good: 135,
};
/** A press further than this from any matching note does not consume it. */
export const MISS_WINDOW = 180;
/** A wrong letter this close to a pending note counts as a typo. */
const TYPO_WINDOW = WINDOWS.good;

export const WEIGHTS: Record<Judgement, number> = {
  marvelous: 1,
  perfect: 0.97,
  great: 0.66,
  good: 0.33,
  miss: 0,
};

export const JUDGEMENT_ORDER: Judgement[] = ['marvelous', 'perfect', 'great', 'good', 'miss'];

export interface NoteState {
  note: Note;
  result: Judgement | null;
  /** Timing error in ms (positive = late). */
  delta: number;
  /** Song time when it was resolved, for animations. */
  resolvedAt: number;
}

export interface HitEvent {
  kind: 'hit' | 'miss' | 'typo';
  judgement?: Judgement;
  lane: number;
  delta: number;
  time: number;
}

export function judge(deltaMs: number): Judgement {
  const abs = Math.abs(deltaMs);
  if (abs <= WINDOWS.marvelous) return 'marvelous';
  if (abs <= WINDOWS.perfect) return 'perfect';
  if (abs <= WINDOWS.great) return 'great';
  if (abs <= WINDOWS.good) return 'good';
  return 'miss';
}

export class Session {
  readonly chart: Chart;
  readonly states: NoteState[];
  counts: Record<Judgement, number> = { marvelous: 0, perfect: 0, great: 0, good: 0, miss: 0 };
  combo = 0;
  maxCombo = 0;
  typos = 0;
  /** Recent events for HUD effects. */
  events: HitEvent[] = [];
  /** First note that is not yet resolved; everything before it is done. */
  private head = 0;

  constructor(chart: Chart) {
    this.chart = chart;
    this.states = chart.notes.map((note) => ({ note, result: null, delta: 0, resolvedAt: 0 }));
  }

  get judged(): number {
    return JUDGEMENT_ORDER.reduce((n, j) => n + this.counts[j], 0);
  }

  /** Accuracy 0–100 over notes judged so far. */
  get accuracy(): number {
    const n = this.judged;
    if (n === 0) return 100;
    const sum = JUDGEMENT_ORDER.reduce((s, j) => s + this.counts[j] * WEIGHTS[j], 0);
    return (sum / n) * 100;
  }

  get finished(): boolean {
    return this.head >= this.states.length;
  }

  /** Mark notes that have passed the miss window. */
  update(songTime: number): void {
    for (let i = this.head; i < this.states.length; i++) {
      const s = this.states[i];
      if (s.result) continue;
      if ((songTime - s.note.time) * 1000 > MISS_WINDOW) {
        this.resolve(s, 'miss', MISS_WINDOW, songTime);
        this.events.push({ kind: 'miss', lane: s.note.lane, delta: 0, time: songTime });
      } else {
        break;
      }
    }
    this.advanceHead();
    this.trimEvents(songTime);
  }

  /** Handle a typed letter at a song time. */
  press(letter: string, songTime: number): HitEvent | null {
    let target: NoteState | null = null;
    let nearestPending: NoteState | null = null;

    for (let i = this.head; i < this.states.length; i++) {
      const s = this.states[i];
      const deltaMs = (songTime - s.note.time) * 1000;
      if (deltaMs < -MISS_WINDOW) break; // later notes are even further away
      if (s.result) continue;
      if (Math.abs(deltaMs) > MISS_WINDOW) continue;
      if (!nearestPending || Math.abs(deltaMs) < Math.abs((songTime - nearestPending.note.time) * 1000)) {
        nearestPending = s;
      }
      if (s.note.letter === letter) {
        target = s; // earliest matching note
        break;
      }
    }

    if (target) {
      const delta = (songTime - target.note.time) * 1000;
      const result = judge(delta);
      this.resolve(target, result, delta, songTime);
      const event: HitEvent = { kind: result === 'miss' ? 'miss' : 'hit', judgement: result, lane: target.note.lane, delta, time: songTime };
      this.events.push(event);
      this.advanceHead();
      return event;
    }

    if (nearestPending && Math.abs((songTime - nearestPending.note.time) * 1000) <= TYPO_WINDOW) {
      this.typos++;
      this.combo = 0;
      const event: HitEvent = { kind: 'typo', lane: nearestPending.note.lane, delta: 0, time: songTime };
      this.events.push(event);
      return event;
    }
    return null;
  }

  /** The word being typed now and how many of its letters are done. */
  currentWord(): { word: number; typed: number } | null {
    for (let i = this.head; i < this.states.length; i++) {
      const s = this.states[i];
      if (!s.result) return { word: s.note.word, typed: s.note.index };
    }
    return null;
  }

  private resolve(s: NoteState, result: Judgement, delta: number, time: number): void {
    s.result = result;
    s.delta = delta;
    s.resolvedAt = time;
    this.counts[result]++;
    if (result === 'miss') {
      this.combo = 0;
    } else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
  }

  private advanceHead(): void {
    while (this.head < this.states.length && this.states[this.head].result) this.head++;
  }

  private trimEvents(now: number): void {
    if (this.events.length > 64) this.events = this.events.filter((e) => now - e.time < 2);
  }
}

export function grade(accuracy: number): string {
  if (accuracy >= 99) return 'SS';
  if (accuracy >= 95) return 'S';
  if (accuracy >= 90) return 'A';
  if (accuracy >= 80) return 'B';
  if (accuracy >= 70) return 'C';
  return 'D';
}

/** Words per minute over the chart's span, counting 5 letters as a word. */
export function wordsPerMinute(session: Session): number {
  const notes = session.chart.notes;
  if (notes.length < 2) return 0;
  const hits = session.judged - session.counts.miss;
  const minutes = (notes[notes.length - 1].time - notes[0].time) / 60;
  return minutes > 0 ? Math.round(hits / 5 / minutes) : 0;
}
