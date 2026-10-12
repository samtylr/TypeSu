/** Difficulty tiers, loosely following osu!mania 4K ranking-criteria guidelines. */
export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane';

export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard', 'insane'];

/** One falling letter. */
export interface Note {
  /** Hit time in seconds of song time. */
  time: number;
  /** Lowercase a–z. */
  letter: string;
  /** 0–3, left to right. */
  lane: number;
  /** Index of the word this letter belongs to (into Chart.words). */
  word: number;
  /** Position of the letter inside its word. */
  index: number;
}

export interface Chart {
  difficulty: Difficulty;
  bpm: number;
  offset: number;
  notes: Note[];
  /** Words in play order, so the HUD can show the current word. */
  words: string[];
  /** Titles of the poems used, in order. */
  poems: string[];
  /** Peak letters per second over any 2-second window. */
  peakLps: number;
  /** Simple difficulty number shown in menus. */
  rating: number;
}

/** Everything the generator needs to know about a song. */
export interface SongTiming {
  bpm: number;
  /** Time of the first beat in seconds. */
  offset: number;
  /** Length of the audio in seconds. */
  duration: number;
  /**
   * Loudness per beat, normalised so a loud beat is about 1.
   * Index i covers the beat starting at offset + i * 60 / bpm.
   * Empty means "assume constant energy".
   */
  beatEnergy: number[];
}
