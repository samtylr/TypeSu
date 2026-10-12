/**
 * Letter-to-lane mapping by comfort.
 *
 * Each letter has a home lane from the touch-typing finger that presses it.
 * Left-hand letters live in lanes 0–1, right-hand letters in lanes 2–3.
 * A small dynamic-programming solver may move a letter to the other lane on
 * the same hand when that avoids an awkward pattern (mainly "fake jacks":
 * two different letters stacked in one lane, which read like one key twice).
 */

export const LANE_COUNT = 4;

/** QWERTY home lanes. Swap this table to support other layouts. */
export const QWERTY_LANES: Record<string, number> = buildTable([
  'qazwsx', // lane 0: left pinky + ring
  'edcrfvtgb', // lane 1: left middle + index
  'yhnujmik', // lane 2: right index + middle
  'olp', // lane 3: right ring + pinky
]);

function buildTable(rows: string[]): Record<string, number> {
  const table: Record<string, number> = {};
  rows.forEach((letters, lane) => {
    for (const ch of letters) table[ch] = lane;
  });
  return table;
}

export function homeLane(letter: string, table = QWERTY_LANES): number {
  const lane = table[letter];
  if (lane === undefined) throw new Error(`No lane for letter "${letter}"`);
  return lane;
}

export const handOf = (lane: number): 0 | 1 => (lane < 2 ? 0 : 1);

/** Input to the solver: one entry per note, in time order. */
export interface LaneInput {
  letter: string;
  /** Seconds. */
  time: number;
  /** Word id; consecutive letters of the same word share it. */
  word: number;
}

export interface SolverOptions {
  /** When false every letter stays on its home lane (Easy/Normal). */
  flexible: boolean;
  table?: Record<string, number>;
}

/** Cost weights, kept together so they are easy to tune after playtesting. */
export const COSTS = {
  offHome: 2,
  fakeJack: 8,
  fakeJackFastMultiplier: 2,
  /** Gap in seconds below which a fake jack counts as fast. */
  fastGap: 0.16,
  /** Gap in seconds above which a stacked lane no longer reads as a jack. */
  restGap: 0.6,
  handAlternation: -1,
  inconsistent: 3,
  threeInLane: 4,
};

const INF = Number.POSITIVE_INFINITY;

/**
 * Assign a lane to every note, minimising total discomfort.
 * State is the pair (lane of previous note, lane of note before that),
 * which lets the solver see minijacks, anchors and one-hand trills.
 */
export function assignLanes(notes: LaneInput[], options: SolverOptions): number[] {
  const table = options.table ?? QWERTY_LANES;
  const n = notes.length;
  if (n === 0) return [];

  const choices = notes.map((note) => {
    const home = homeLane(note.letter, table);
    return options.flexible ? [home, home ^ 1] : [home];
  });

  const isDouble = (i: number) =>
    i > 0 && notes[i].letter === notes[i - 1].letter && notes[i].word === notes[i - 1].word;

  const S = LANE_COUNT + 1; // extra slot "LANE_COUNT" means "no note"
  const NONE = LANE_COUNT;
  const key = (p1: number, p2: number) => p1 * S + p2;

  // dp[i] maps state key (lane[i], lane[i-1]) -> best cost
  let dp = new Map<number, number>();
  const back: Map<number, number>[] = [];

  for (const lane of choices[0]) {
    dp.set(key(lane, NONE), stepCost(0, lane, NONE, NONE));
  }
  back.push(new Map());

  for (let i = 1; i < n; i++) {
    const next = new Map<number, number>();
    const bp = new Map<number, number>();
    for (const [state, cost] of dp) {
      const p1 = Math.floor(state / S);
      const p2 = state % S;
      for (const lane of choices[i]) {
        const c = cost + stepCost(i, lane, p1, p2);
        if (c === INF) continue;
        const k = key(lane, p1);
        if (c < (next.get(k) ?? INF)) {
          next.set(k, c);
          bp.set(k, state);
        }
      }
    }
    if (next.size === 0) {
      // Only possible if a forced double letter conflicts; fall back to home lanes.
      return notes.map((note) => homeLane(note.letter, table));
    }
    dp = next;
    back.push(bp);
  }

  let bestState = -1;
  let best = INF;
  for (const [state, cost] of dp) {
    if (cost < best) {
      best = cost;
      bestState = state;
    }
  }

  const lanes = new Array<number>(n);
  let state = bestState;
  for (let i = n - 1; i >= 0; i--) {
    lanes[i] = Math.floor(state / S);
    if (i > 0) state = back[i].get(state)!;
  }
  return lanes;

  function stepCost(i: number, lane: number, p1: number, p2: number): number {
    const note = notes[i];
    let cost = lane === homeLane(note.letter, table) ? 0 : COSTS.offHome;
    if (p1 === NONE) return cost;

    const prev = notes[i - 1];
    const gap = note.time - prev.time;

    // A doubled letter is the same key twice, so it must read as a jack.
    if (isDouble(i)) return lane === p1 ? cost : INF;

    if (lane === p1 && gap < COSTS.restGap) {
      cost += gap < COSTS.fastGap ? COSTS.fakeJack * COSTS.fakeJackFastMultiplier : COSTS.fakeJack;
    }
    if (handOf(lane) !== handOf(p1)) cost += COSTS.handAlternation;

    if (p2 !== NONE && i >= 2) {
      const prev2 = notes[i - 2];
      // Same letter two notes back should sit in the same lane (consistency).
      if (prev2.letter === note.letter && prev2.word === note.word && lane !== p2) {
        cost += COSTS.inconsistent;
      }
      // Three notes in one lane in a row is a short anchor, tiring at speed.
      if (lane === p1 && lane === p2 && !isDouble(i)) cost += COSTS.threeInLane;
    }
    return cost;
  }
}

/** Count "fake jacks": adjacent notes in one lane with different letters inside a word. */
export function countFakeJacks(notes: LaneInput[], lanes: number[]): number {
  let count = 0;
  for (let i = 1; i < notes.length; i++) {
    if (
      lanes[i] === lanes[i - 1] &&
      notes[i].word === notes[i - 1].word &&
      notes[i].letter !== notes[i - 1].letter
    ) {
      count++;
    }
  }
  return count;
}
