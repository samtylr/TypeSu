/**
 * Chart generator: song timing + poem + difficulty -> timed, laned letters.
 *
 * Positions are counted in ticks of 1/4 beat. Each letter of a word goes on
 * consecutive slots at the section's snap; words are separated by one empty
 * slot, and poem lines end with a rest. Loud sections use the tier's fast
 * snap, quiet ones its slow snap, and near-silent sections get no notes.
 * Deterministic: the same inputs always produce the same chart.
 */
import { assignLanes } from './lanes';
import { POEMS, preparePoem, type Poem } from './poems';
import { createRng, shuffle } from './rng';
import type { Chart, Difficulty, Note, SongTiming } from './types';

const TICKS_PER_BEAT = 4;
const BEATS_PER_SECTION = 16; // 4 bars of 4/4
const LEAD_IN_SECONDS = 2;
const TAIL_SECONDS = 1.5;
const SILENCE = 0.12;

interface Tier {
  /** Letters per beat in quiet / loud sections. */
  slowPerBeat: number;
  fastPerBeat: number;
  /** Section energy at or above which the fast snap is used. */
  loudThreshold: number;
  /** Hard cap on letters per second; snaps are halved until under it. */
  maxLps: number;
  /** Longest word allowed at the fast snap; longer words use the slow snap. */
  maxFastRun: number;
  /** Rest after each poem line, in beats. */
  lineRestBeats: number;
  /** Whether the comfort solver may move letters off their home lane. */
  flexibleLanes: boolean;
}

export const TIERS: Record<Difficulty, Tier> = {
  easy: { slowPerBeat: 1, fastPerBeat: 1, loudThreshold: 2, maxLps: 3, maxFastRun: 5, lineRestBeats: 2, flexibleLanes: false },
  normal: { slowPerBeat: 1, fastPerBeat: 2, loudThreshold: 0.7, maxLps: 5, maxFastRun: 5, lineRestBeats: 2, flexibleLanes: false },
  hard: { slowPerBeat: 2, fastPerBeat: 4, loudThreshold: 0.9, maxLps: 8.5, maxFastRun: 6, lineRestBeats: 1, flexibleLanes: true },
  insane: { slowPerBeat: 4, fastPerBeat: 4, loudThreshold: 0, maxLps: 13, maxFastRun: 14, lineRestBeats: 0.5, flexibleLanes: true },
};

export interface GenerateOptions {
  timing: SongTiming;
  difficulty: Difficulty;
  /** Seed, normally a hash of the song's identity. */
  seed: number;
  poems?: Poem[];
}

/** Ticks between letters for a given letters-per-beat, respecting the LPS cap. */
function stepTicks(perBeat: number, bpm: number, maxLps: number): number {
  let lettersPerBeat = perBeat;
  while (lettersPerBeat > 0.5 && (bpm / 60) * lettersPerBeat > maxLps) lettersPerBeat /= 2;
  return Math.round(TICKS_PER_BEAT / lettersPerBeat);
}

function sectionEnergies(timing: SongTiming, totalBeats: number): number[] {
  const sections = Math.ceil(totalBeats / BEATS_PER_SECTION) + 1;
  const out: number[] = [];
  for (let s = 0; s < sections; s++) {
    if (timing.beatEnergy.length === 0) {
      out.push(0.7);
      continue;
    }
    const from = s * BEATS_PER_SECTION;
    const slice = timing.beatEnergy.slice(from, from + BEATS_PER_SECTION);
    out.push(slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0);
  }
  return out;
}

export function generateChart(options: GenerateOptions): Chart {
  const { timing, difficulty, seed } = options;
  const tier = TIERS[difficulty];
  const beatLen = 60 / timing.bpm;
  const tickLen = beatLen / TICKS_PER_BEAT;
  const tickTime = (tick: number) => timing.offset + tick * tickLen;

  // First full beat after the lead-in, and the last usable tick.
  let firstBeat = Math.ceil((LEAD_IN_SECONDS - timing.offset) / beatLen);
  if (firstBeat < 0) firstBeat = 0;
  const endTick = Math.floor((timing.duration - TAIL_SECONDS - timing.offset) / tickLen);
  const totalBeats = Math.max(0, Math.ceil(endTick / TICKS_PER_BEAT));
  const energy = sectionEnergies(timing, totalBeats);

  const slowStep = stepTicks(tier.slowPerBeat, timing.bpm, tier.maxLps);
  const fastStep = stepTicks(tier.fastPerBeat, timing.bpm, tier.maxLps);

  // Poem order is seeded by song only, so every difficulty types the same poem.
  const rng = createRng(seed);
  const pool = (options.poems ?? POEMS).map(preparePoem);
  let queue = shuffle(pool, rng);

  const placed: { tick: number; letter: string; word: number; index: number }[] = [];
  const words: string[] = [];
  const poemsUsed: string[] = [];

  let cursor = firstBeat * TICKS_PER_BEAT;
  let done = false;
  let guard = 0;

  while (!done && guard++ < 10_000) {
    if (queue.length === 0) queue = shuffle(pool, rng);
    const poem = queue.shift()!;
    poemsUsed.push(poem.title);

    for (const line of poem.lines) {
      for (let w = 0; w < line.length && !done; w++) {
        const word = line[w];

        const sectionTicks = BEATS_PER_SECTION * TICKS_PER_BEAT;
        const sectionOf = (tick: number) => Math.floor(tick / sectionTicks);
        let step = slowStep;
        let last = 0;

        // Find a spot where the whole word fits outside near-silent sections.
        for (;;) {
          let section = sectionOf(cursor);
          while (section < energy.length && energy[section] < SILENCE) {
            section++;
            cursor = section * sectionTicks;
          }
          if (section >= energy.length) {
            done = true;
            break;
          }

          step = energy[section] >= tier.loudThreshold ? fastStep : slowStep;
          if (step === fastStep && word.length > tier.maxFastRun) step = slowStep;

          // Words start on a half beat (or a full beat for slow snaps).
          const align = Math.min(Math.max(step, 2), TICKS_PER_BEAT);
          cursor = Math.ceil(cursor / align) * align;
          last = cursor + (word.length - 1) * step;

          let silentAt = -1;
          for (let s = sectionOf(cursor); s <= sectionOf(last) && s < energy.length; s++) {
            if (energy[s] < SILENCE) {
              silentAt = s;
              break;
            }
          }
          if (silentAt < 0) break;
          cursor = (silentAt + 1) * sectionTicks;
        }
        if (done) break;
        if (last > endTick) {
          done = true;
          break;
        }

        const wordId = words.length;
        words.push(word);
        for (let i = 0; i < word.length; i++) {
          placed.push({ tick: cursor + i * step, letter: word[i], word: wordId, index: i });
        }
        // One empty slot acts as the space between words.
        cursor = last + 2 * step;
      }
      if (done) break;
      // Rest at the end of each line, then start on a beat.
      cursor = Math.ceil(cursor / TICKS_PER_BEAT) * TICKS_PER_BEAT + tier.lineRestBeats * TICKS_PER_BEAT;
    }
    if (placed.length === 0 && cursor > endTick) break;
  }

  const laneInput = placed.map((p) => ({ letter: p.letter, time: tickTime(p.tick), word: p.word }));
  const lanes = assignLanes(laneInput, { flexible: tier.flexibleLanes });

  const notes: Note[] = placed.map((p, i) => ({
    time: tickTime(p.tick),
    letter: p.letter,
    lane: lanes[i],
    word: p.word,
    index: p.index,
  }));

  const peakLps = peakLettersPerSecond(notes, 2);
  const span = notes.length > 1 ? notes[notes.length - 1].time - notes[0].time : 1;
  const avgLps = notes.length / Math.max(span, 1);
  const rating = Math.round((peakLps * 0.7 + avgLps * 0.5) * 10) / 10;

  // Only list poems that actually received words.
  const usedCount = new Set<string>();
  let wordCursor = 0;
  for (const title of poemsUsed) {
    if (wordCursor >= words.length) break;
    usedCount.add(title);
    const poem = pool.find((p) => p.title === title)!;
    wordCursor += poem.lines.reduce((n, l) => n + l.length, 0);
  }

  return {
    difficulty,
    bpm: timing.bpm,
    offset: timing.offset,
    notes,
    words,
    poems: [...usedCount],
    peakLps,
    rating,
  };
}

export function peakLettersPerSecond(notes: Note[], window: number): number {
  let peak = 0;
  let start = 0;
  for (let end = 0; end < notes.length; end++) {
    while (notes[end].time - notes[start].time > window) start++;
    peak = Math.max(peak, (end - start + 1) / window);
  }
  return Math.round(peak * 10) / 10;
}
