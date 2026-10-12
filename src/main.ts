import './style.css';
import { generateChart } from './chart/generator';
import { hashString } from './chart/rng';
import { DIFFICULTIES, type Chart, type Difficulty, type SongTiming } from './chart/types';
import { bpmFromTaps, computeBeatEnergy, decodeFile, detectTiming, earliestBeat, foldBpm } from './audio/analysis';
import { SongPlayer } from './audio/clock';
import { DEMO_BPM, DEMO_OFFSET, makeDemoBuffer } from './audio/demo';
import { Renderer } from './engine/render';
import { grade, JUDGEMENT_ORDER, Session, wordsPerMinute } from './engine/session';
import { clearOverride, loadOverride, loadSettings, saveOverride, saveSettings } from './ui/storage';
import { POEMS } from './chart/poems';

// ---------------------------------------------------------------------------
// State

interface Song {
  id: string;
  title: string;
  buffer: AudioBuffer;
  /** What the detector found, so the timing screen can reset to it. */
  detected: { bpm: number; offset: number };
  bpm: number;
  offset: number;
  isDemo: boolean;
}

type Mode = 'menu' | 'playing' | 'calibrating' | 'other';

const canvas = document.getElementById('playfield') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;
const renderer = new Renderer(canvas);
const settings = loadSettings();

// Decoding and analysis use an offline context, so no user gesture is needed until playback.
const decoder = new OfflineAudioContext(2, 1, 44100);

let audio: AudioContext | null = null;
let player: SongPlayer | null = null;
let mode: Mode = 'menu';
let song: Song = makeDemoSong();
let charts = buildCharts(song);
let session: Session | null = null;
let gameKeyHandler: ((e: KeyboardEvent) => void) | null = null;

function ensureAudio(): SongPlayer {
  if (!audio) {
    audio = new AudioContext({ latencyHint: 'interactive' });
    player = new SongPlayer(audio);
  }
  void audio.resume();
  player!.offsetMs = settings.offsetMs;
  return player!;
}

function makeDemoSong(): Song {
  const buffer = makeDemoBuffer(decoder);
  return {
    id: 'demo',
    title: 'Demo track (built in)',
    buffer,
    detected: { bpm: DEMO_BPM, offset: DEMO_OFFSET },
    bpm: DEMO_BPM,
    offset: DEMO_OFFSET,
    isDemo: true,
  };
}

function timingOf(s: Song): SongTiming {
  return {
    bpm: s.bpm,
    offset: s.offset,
    duration: s.buffer.duration,
    beatEnergy: computeBeatEnergy(s.buffer, s.bpm, s.offset),
  };
}

function buildCharts(s: Song): Record<Difficulty, Chart> {
  const timing = timingOf(s);
  const seed = hashString(s.id);
  return Object.fromEntries(DIFFICULTIES.map((d) => [d, generateChart({ timing, difficulty: d, seed })])) as Record<
    Difficulty,
    Chart
  >;
}

// ---------------------------------------------------------------------------
// Small DOM helpers

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el, props);
  for (const c of children) el.append(c);
  return el;
}

function show(...nodes: Node[]): void {
  ui.replaceChildren(...nodes);
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const DIFF_NAMES: Record<Difficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard', insane: 'Insane' };

// ---------------------------------------------------------------------------
// Menu

function showMenu(status = ''): void {
  mode = 'menu';
  player?.stop();

  const fileInput = h('input', { type: 'file', accept: 'audio/*,.mp3,.ogg,.wav,.flac,.m4a' });
  fileInput.hidden = true;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void loadSongFile(file);
  });

  const diffButtons = DIFFICULTIES.map((d) => {
    const chart = charts[d];
    const btn = h(
      'button',
      { className: `diff${settings.difficulty === d ? ' selected' : ''}`, title: `${chart.notes.length} letters` },
      h('b', {}, DIFF_NAMES[d]),
      h('small', {}, `★ ${chart.rating.toFixed(1)} · ${chart.notes.length}`),
    );
    btn.addEventListener('click', () => {
      settings.difficulty = d;
      saveSettings(settings);
      showMenu();
    });
    return btn;
  });

  const scrollValue = h('span', { className: 'value' }, settings.scroll.toFixed(1) + '×');
  const scroll = h('input', { type: 'range', min: '0.6', max: '3', step: '0.1', value: String(settings.scroll) });
  scroll.addEventListener('input', () => {
    settings.scroll = Number(scroll.value);
    scrollValue.textContent = settings.scroll.toFixed(1) + '×';
    saveSettings(settings);
  });

  const offset = h('input', { type: 'number', step: '1', value: String(settings.offsetMs) });
  offset.addEventListener('change', () => {
    settings.offsetMs = Math.round(Number(offset.value) || 0);
    saveSettings(settings);
  });
  const calibrate = h('button', {}, 'Calibrate');
  calibrate.addEventListener('click', showCalibration);

  const load = h('button', {}, 'Load audio file…');
  load.addEventListener('click', () => fileInput.click());
  const timing = h('button', {}, 'Adjust timing');
  timing.addEventListener('click', showTiming);
  const demo = h('button', {}, 'Use demo track');
  demo.disabled = song.isDemo;
  demo.addEventListener('click', () => {
    song = makeDemoSong();
    charts = buildCharts(song);
    showMenu();
  });

  const play = h('button', { className: 'primary' }, 'Play', h('kbd', {}, 'Enter'));
  play.addEventListener('click', startGame);

  const chart = charts[settings.difficulty];
  const poems = chart.poems
    .map((t) => POEMS.find((p) => p.title === t))
    .filter(Boolean)
    .map((p) => `${p!.title} (${p!.author})`)
    .join(', ');

  show(
    h(
      'div',
      { className: 'panel' },
      h('h1', {}, 'Type', h('span', {}, 'Su')),
      h('p', { className: 'tag' }, 'Type the falling letters on the beat.'),
      h(
        'section',
        {},
        h('div', { className: 'label' }, 'Song'),
        h('div', { className: 'song-name' }, song.title),
        h('div', { className: 'meta' }, `${song.bpm} BPM · ${fmtTime(song.buffer.duration)} · first beat ${Math.round(song.offset * 1000)} ms`),
        h('div', { className: 'meta' }, poems ? `Poems: ${poems}` : ''),
        h('div', { className: 'row' }, load, timing, demo, fileInput),
        h('div', { className: 'status' }, status),
      ),
      h('section', {}, h('div', { className: 'label' }, 'Difficulty'), h('div', { className: 'diffs' }, ...diffButtons)),
      play,
      h(
        'section',
        {},
        h('div', { className: 'label' }, 'Settings'),
        h('div', { className: 'setting' }, h('span', {}, 'Scroll speed'), scroll, scrollValue),
        h('div', { className: 'setting' }, h('span', {}, 'Audio offset'), offset, calibrate),
      ),
      h(
        'p',
        { className: 'hint' },
        'Type each letter as its diamond reaches the line. Lanes follow your hands on a QWERTY keyboard: left-hand letters fall on the left, right-hand letters on the right. Keys 1–4 pick a difficulty.',
      ),
    ),
  );
}

async function loadSongFile(file: File): Promise<void> {
  showMenu(`Analysing ${file.name}…`);
  try {
    const buffer = await decodeFile(decoder, file);
    const detected = await detectTiming(buffer);
    const id = `${file.name}:${file.size}`;
    const override = loadOverride(id);
    song = {
      id,
      title: file.name.replace(/\.[^.]+$/, ''),
      buffer,
      detected,
      bpm: override?.bpm ?? detected.bpm,
      offset: override?.offset ?? detected.offset,
      isDemo: false,
    };
    charts = buildCharts(song);
    showTiming();
  } catch (err) {
    console.error(err);
    showMenu(`Couldn't read that file: ${(err as Error).message || 'unsupported format'}.`);
    ui.querySelector('.status')?.classList.add('error');
  }
}

// ---------------------------------------------------------------------------
// Timing screen: BPM, offset, tap tempo, preview with clicks

function showTiming(): void {
  mode = 'other';
  const taps: number[] = [];

  const bpmInput = h('input', { type: 'number', step: '0.01', min: '40', max: '300', value: String(song.bpm) });
  const offsetValue = h('span', { className: 'big' }, '');
  const tapValue = h('span', { className: 'value' }, '–');
  const status = h('div', { className: 'status' }, '');

  const refresh = () => {
    bpmInput.value = String(song.bpm);
    offsetValue.textContent = `${Math.round(song.offset * 1000)} ms`;
  };
  const setBpm = (bpm: number) => {
    song.bpm = Math.round(Math.max(40, Math.min(300, bpm)) * 100) / 100;
    song.offset = earliestBeat(song.offset, song.bpm);
    refresh();
  };
  const nudge = (ms: number) => {
    song.offset = earliestBeat(song.offset + ms / 1000, song.bpm);
    refresh();
  };
  bpmInput.addEventListener('change', () => setBpm(Number(bpmInput.value) || song.bpm));

  const btn = (label: string, fn: () => void) => {
    const b = h('button', {}, label);
    b.addEventListener('click', fn);
    return b;
  };

  const tap = () => {
    taps.push(performance.now());
    const bpm = bpmFromTaps(taps);
    tapValue.textContent = bpm ? `${bpm}` : `${taps.length} taps`;
  };

  const preview = () => {
    const p = ensureAudio();
    const beat = 60 / song.bpm;
    const from = Math.max(0, song.offset + Math.floor(song.buffer.duration * 0.25 / beat) * beat);
    p.play(song.buffer, from, 0.3);
    const clicks: number[] = [];
    for (let t = from; t < from + 12; t += beat) clicks.push(t);
    p.scheduleClicks(clicks);
    status.textContent = 'Previewing 12 s with clicks on each beat. The clicks should land on the kick drum.';
    window.setTimeout(() => {
      if (mode === 'other') {
        p.stop();
        status.textContent = '';
      }
    }, 12500);
  };

  const done = () => {
    player?.stop();
    if (!song.isDemo) saveOverride(song.id, { bpm: song.bpm, offset: song.offset });
    charts = buildCharts(song);
    document.removeEventListener('keydown', onKey);
    showMenu();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 't' || e.key === 'T') tap();
    if (e.key === 'Escape') done();
  };
  document.addEventListener('keydown', onKey);

  refresh();
  show(
    h(
      'div',
      { className: 'panel' },
      h('h2', {}, 'Timing'),
      h('div', { className: 'meta' }, song.title),
      h('div', { className: 'meta' }, `Detected ${song.detected.bpm} BPM, first beat at ${Math.round(song.detected.offset * 1000)} ms`),
      h(
        'section',
        {},
        h('div', { className: 'label' }, 'Tempo (BPM)'),
        h('div', { className: 'row' }, bpmInput, btn('½×', () => setBpm(song.bpm / 2)), btn('2×', () => setBpm(song.bpm * 2)), btn('Fold to 85–200', () => setBpm(foldBpm(song.bpm)))),
      ),
      h(
        'section',
        {},
        h('div', { className: 'label' }, 'First-beat offset'),
        h('div', { className: 'row' }, btn('−10', () => nudge(-10)), btn('−1', () => nudge(-1)), offsetValue, btn('+1', () => nudge(1)), btn('+10', () => nudge(10))),
      ),
      h(
        'section',
        {},
        h('div', { className: 'label' }, 'Tap tempo'),
        h(
          'div',
          { className: 'row' },
          btn('Tap', tap),
          h('kbd', {}, 'T'),
          tapValue,
          btn('Use tapped BPM', () => {
            const bpm = bpmFromTaps(taps);
            if (bpm) setBpm(bpm);
          }),
          btn('Clear', () => {
            taps.length = 0;
            tapValue.textContent = '–';
          }),
        ),
      ),
      h(
        'div',
        { className: 'row' },
        btn('Preview with clicks', preview),
        btn('Stop', () => player?.stop()),
        btn('Reset to detected', () => {
          song.bpm = song.detected.bpm;
          song.offset = song.detected.offset;
          if (!song.isDemo) clearOverride(song.id);
          refresh();
        }),
      ),
      status,
      (() => {
        const b = h('button', { className: 'primary' }, 'Done', h('kbd', {}, 'Esc'));
        b.addEventListener('click', done);
        return b;
      })(),
    ),
  );
}

// ---------------------------------------------------------------------------
// Calibration: tap along to clicks to measure audio latency

function showCalibration(): void {
  mode = 'calibrating';
  const p = ensureAudio();
  const interval = 0.6;
  const clicks = Array.from({ length: 28 }, (_, i) => 1 + i * interval);
  const deltas: number[] = [];
  const count = h('div', { className: 'big' }, '0 / 20');
  const result = h('div', { className: 'status' }, 'Press Space on every click you hear.');

  p.play(null, 0, 0.3);
  p.scheduleClicks(clicks);

  const median = () => {
    const sorted = deltas.slice(4).sort((a, b) => a - b);
    return sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : 0;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return finish(false);
    if (e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    const t = p.songTimeAt(e.timeStamp, false);
    const nearest = clicks.reduce((best, c) => (Math.abs(c - t) < Math.abs(best - t) ? c : best), clicks[0]);
    const delta = (t - nearest) * 1000;
    if (Math.abs(delta) > interval * 500) return;
    deltas.push(delta);
    const used = Math.max(0, deltas.length - 4);
    count.textContent = `${Math.min(used, 20)} / 20`;
    if (used > 0) result.textContent = `Current estimate: ${median()} ms`;
    if (used >= 20) finish(true);
  };

  const finish = (apply: boolean) => {
    document.removeEventListener('keydown', onKey);
    p.stop();
    if (apply && deltas.length > 6) {
      settings.offsetMs = median();
      saveSettings(settings);
      p.offsetMs = settings.offsetMs;
      showMenu(`Audio offset set to ${settings.offsetMs} ms.`);
    } else {
      showMenu();
    }
  };

  document.addEventListener('keydown', onKey);
  const cancel = h('button', {}, 'Cancel');
  cancel.addEventListener('click', () => finish(false));
  const apply = h('button', {}, 'Apply now');
  apply.addEventListener('click', () => finish(true));

  show(
    h(
      'div',
      { className: 'panel' },
      h('h2', {}, 'Calibrate audio offset'),
      h('p', { className: 'tag' }, 'Listen, and press Space exactly on each click. The first 4 taps are warm-up.'),
      count,
      result,
      h('div', { className: 'row' }, cancel, apply),
    ),
  );
}

// ---------------------------------------------------------------------------
// Gameplay

function startGame(): void {
  const p = ensureAudio();
  const chart = charts[settings.difficulty];
  session = new Session(chart);
  mode = 'playing';
  show();

  p.onEnded = () => {
    if (mode === 'playing') endGame();
  };
  p.play(song.buffer, 0, 0.6);

  gameKeyHandler = (e: KeyboardEvent) => {
    if (mode !== 'playing' || !session) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      quitGame();
      return;
    }
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 && /[a-z]/i.test(e.key)) {
      e.preventDefault();
      session.press(e.key.toLowerCase(), p.songTimeAt(e.timeStamp));
    }
  };
  document.addEventListener('keydown', gameKeyHandler);
}

function stopGameInput(): void {
  if (gameKeyHandler) document.removeEventListener('keydown', gameKeyHandler);
  gameKeyHandler = null;
  if (player) player.onEnded = null;
}

function quitGame(): void {
  stopGameInput();
  player?.stop();
  session = null;
  showMenu();
}

function endGame(): void {
  stopGameInput();
  player?.stop();
  const s = session!;
  // Anything still pending counts as a miss.
  s.update(Number.POSITIVE_INFINITY);
  mode = 'other';
  showResults(s);
}

function showResults(s: Session): void {
  const acc = s.accuracy;
  const stat = (k: string, n: string | number) => h('div', { className: 'stat' }, h('div', { className: 'n' }, String(n)), h('div', { className: 'k' }, k));
  const retry = h('button', {}, 'Retry', h('kbd', {}, 'R'));
  const menu = h('button', {}, 'Menu', h('kbd', {}, 'Esc'));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'r' || e.key === 'R') go(startGame);
    if (e.key === 'Escape' || e.key === 'Enter') go(() => showMenu());
  };
  const go = (fn: () => void) => {
    document.removeEventListener('keydown', onKey);
    fn();
  };
  retry.addEventListener('click', () => go(startGame));
  menu.addEventListener('click', () => go(() => showMenu()));
  document.addEventListener('keydown', onKey);

  show(
    h(
      'div',
      { className: 'panel' },
      h('div', { className: 'label' }, `${song.title} · ${DIFF_NAMES[s.chart.difficulty]}`),
      h('div', { className: 'grade' }, grade(acc)),
      h('div', { className: 'big' }, `${acc.toFixed(2)}%`),
      h(
        'div',
        { className: 'stats' },
        ...JUDGEMENT_ORDER.map((j) => stat(j, s.counts[j])),
        stat('max combo', s.maxCombo),
        stat('typos', s.typos),
        stat('wpm', wordsPerMinute(s)),
      ),
      h('div', { className: 'row' }, retry, menu),
    ),
  );
}

// ---------------------------------------------------------------------------
// Frame loop: gameplay, or a slow decorative scroll behind menus

const IDLE_WORD = 'typesu';
function frame(): void {
  if (mode === 'playing' && session && player) {
    const now = player.now();
    session.update(now);
    const L = renderer.layout;
    renderer.draw(session, now, settings.scroll * L.height * 0.6, song.buffer.duration);
    const lastNote = session.chart.notes.at(-1)?.time ?? 0;
    if (session.finished && now > lastNote + 1.5) endGame();
  } else {
    renderer.clear();
    const L = renderer.layout;
    const t = performance.now() / 1000;
    for (let i = 0; i < 14; i++) {
      const letter = IDLE_WORD[i % IDLE_WORD.length];
      const lane = [2, 1, 3, 3, 0, 2][i % 6];
      const y = ((t * 70 + i * 140) % (L.height + 200)) - 100;
      const x = L.width * (0.08 + ((i * 0.37) % 0.84));
      renderer.drawNote(x + lane * 4, y, letter, lane, 0.12);
    }
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Global keys on the menu

document.addEventListener('keydown', (e) => {
  if (mode !== 'menu') return;
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    startGame();
  }
  const n = Number(e.key);
  if (n >= 1 && n <= 4) {
    settings.difficulty = DIFFICULTIES[n - 1];
    saveSettings(settings);
    showMenu();
  }
});

// Read-only hook for automated browser tests.
(window as unknown as { __typesu: object }).__typesu = {
  get session() {
    return session;
  },
  get player() {
    return player;
  },
  get mode() {
    return mode;
  },
};

showMenu();
requestAnimationFrame(frame);
