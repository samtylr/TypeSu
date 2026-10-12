/**
 * Canvas renderer: 4 lanes scrolling downwards, diamond notes with letters,
 * receptors on the judgement line, word bar, combo and judgement HUD.
 */
import type { Chart } from '../chart/types';
import type { HitEvent, Judgement, Session } from './session';

export const COLORS = {
  bg: '#0c0a12',
  field: '#13101c',
  fieldEdge: '#2a2338',
  grid: 'rgba(255,255,255,0.045)',
  outer: '#6ef2c8',
  inner: '#b49bff',
  ink: '#120f1c',
  text: '#f3eefe',
  dim: '#7d7392',
  judge: {
    marvelous: '#ffffff',
    perfect: '#ffe27a',
    great: '#6ef2c8',
    good: '#7fb5ff',
    miss: '#ff5d7a',
  } as Record<Judgement, string>,
  typo: '#ff5d7a',
};

const LABEL: Record<Judgement, string> = {
  marvelous: 'MARVELOUS',
  perfect: 'PERFECT',
  great: 'GREAT',
  good: 'GOOD',
  miss: 'MISS',
};

export const laneColor = (lane: number) => (lane === 0 || lane === 3 ? COLORS.outer : COLORS.inner);

export interface Layout {
  width: number;
  height: number;
  laneW: number;
  left: number;
  judgeY: number;
  noteR: number;
}

export function computeLayout(width: number, height: number): Layout {
  const laneW = Math.max(56, Math.min(104, width / 7, height / 8));
  const left = (width - laneW * 4) / 2;
  return { width, height, laneW, left, judgeY: height * 0.84, noteR: laneW * 0.4 };
}

function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  layout: Layout = computeLayout(800, 600);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.layout = computeLayout(w, h);
  }

  clear(): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.layout.width, this.layout.height);
  }

  /** Draw one gameplay frame. `speed` is in pixels per second. */
  draw(session: Session, now: number, speed: number, songLength: number): void {
    this.clear();
    const { ctx } = this;
    const L = this.layout;
    const chart = session.chart;

    this.drawField(now, chart, speed);
    this.drawLaneFlashes(session.events, now);
    this.drawReceptors(session.events, now);
    // Combo and judgement go under the notes so they never hide a letter.
    this.drawComboAndJudgement(session, now);

    // Notes, drawn from far to near so nearer ones sit on top.
    const lookAhead = (L.judgeY + L.noteR) / speed;
    const states = session.states;
    let first = 0;
    // Binary search the first note that could be on screen.
    let lo = 0;
    let hi = states.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (states[mid].note.time < now - 0.5) lo = mid + 1;
      else hi = mid;
    }
    first = lo;
    let last = first;
    while (last < states.length && states[last].note.time < now + lookAhead) last++;

    ctx.font = `800 ${Math.round(L.noteR * 0.95)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = last - 1; i >= first; i--) {
      const s = states[i];
      if (s.result && s.result !== 'miss') continue;
      const y = L.judgeY - (s.note.time - now) * speed;
      if (y < -L.noteR || y > L.height + L.noteR) continue;
      const cx = L.left + (s.note.lane + 0.5) * L.laneW;
      const alpha = s.result === 'miss' ? Math.max(0, 0.45 - (now - s.resolvedAt) * 1.2) : 1;
      if (alpha <= 0) continue;
      this.drawNote(cx, y, s.note.letter, s.note.lane, alpha);
    }

    this.drawHitBursts(session.events, now);
    this.drawErrorBar(session, now);
    this.drawWordBar(session);
    this.drawHud(session, now, songLength);
  }

  private drawField(now: number, chart: Chart, speed: number): void {
    const { ctx } = this;
    const L = this.layout;
    const w = L.laneW * 4;

    ctx.fillStyle = COLORS.field;
    ctx.fillRect(L.left, 0, w, L.height);
    ctx.strokeStyle = COLORS.fieldEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(L.left, 0);
    ctx.lineTo(L.left, L.height);
    ctx.moveTo(L.left + w, 0);
    ctx.lineTo(L.left + w, L.height);
    ctx.stroke();

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lane = 1; lane < 4; lane++) {
      const x = L.left + lane * L.laneW;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, L.height);
    }
    ctx.stroke();

    // Beat lines, stronger on each bar.
    const beat = 60 / chart.bpm;
    const firstBeat = Math.floor((now - chart.offset) / beat);
    for (let b = firstBeat; ; b++) {
      const t = chart.offset + b * beat;
      const y = L.judgeY - (t - now) * speed;
      if (y < 0) break;
      if (y > L.height) continue;
      ctx.fillStyle = b % 4 === 0 ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.035)';
      ctx.fillRect(L.left, Math.round(y), w, b % 4 === 0 ? 2 : 1);
    }

    // Shade below the judgement line.
    ctx.fillStyle = 'rgba(12,10,18,0.55)';
    ctx.fillRect(L.left, L.judgeY + L.noteR + 6, w, L.height);
  }

  private drawLaneFlashes(events: HitEvent[], now: number): void {
    const { ctx } = this;
    const L = this.layout;
    for (const e of events) {
      const age = now - e.time;
      if (age < 0 || age > 0.14) continue;
      const a = 1 - age / 0.14;
      const x = L.left + e.lane * L.laneW;
      const color = e.kind === 'typo' || e.kind === 'miss' ? COLORS.typo : laneColor(e.lane);
      const g = ctx.createLinearGradient(0, L.judgeY, 0, L.judgeY - L.height * 0.45);
      g.addColorStop(0, hexA(color, 0.28 * a));
      g.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x, L.judgeY - L.height * 0.45, L.laneW, L.height * 0.45);
    }
  }

  private drawReceptors(events: HitEvent[], now: number): void {
    const { ctx } = this;
    const L = this.layout;
    const lit = [0, 0, 0, 0];
    for (const e of events) {
      const age = now - e.time;
      if (e.kind === 'hit' && age >= 0 && age < 0.1) lit[e.lane] = Math.max(lit[e.lane], 1 - age / 0.1);
    }
    for (let lane = 0; lane < 4; lane++) {
      const cx = L.left + (lane + 0.5) * L.laneW;
      diamond(ctx, cx, L.judgeY, L.noteR);
      ctx.fillStyle = hexA(laneColor(lane), 0.08 + lit[lane] * 0.35);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = hexA(laneColor(lane), 0.55 + lit[lane] * 0.45);
      ctx.stroke();
    }
  }

  drawNote(cx: number, cy: number, letter: string, lane: number, alpha = 1): void {
    const { ctx } = this;
    const r = this.layout.noteR;
    const color = laneColor(lane);
    ctx.globalAlpha = alpha;
    diamond(ctx, cx, cy, r);
    const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    g.addColorStop(0, lighten(color, 0.35));
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(letter.toUpperCase(), cx, cy + r * 0.05);
    ctx.globalAlpha = 1;
  }

  private drawHitBursts(events: HitEvent[], now: number): void {
    const { ctx } = this;
    const L = this.layout;
    for (const e of events) {
      if (e.kind !== 'hit') continue;
      const age = now - e.time;
      if (age < 0 || age > 0.18) continue;
      const t = age / 0.18;
      const cx = L.left + (e.lane + 0.5) * L.laneW;
      diamond(ctx, cx, L.judgeY, L.noteR * (1 + t * 0.6));
      ctx.lineWidth = 3 * (1 - t) + 0.5;
      ctx.strokeStyle = hexA(COLORS.judge[e.judgement ?? 'great'], 1 - t);
      ctx.stroke();
    }
  }

  private drawErrorBar(session: Session, now: number): void {
    const { ctx } = this;
    const L = this.layout;
    const y = L.judgeY + L.noteR + 22;
    const half = Math.min(L.laneW * 1.6, 150);
    const cx = L.left + L.laneW * 2;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(cx - half, y, half * 2, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(cx - 1, y - 6, 2, 14);
    const recent = session.events.filter((e) => e.kind === 'hit' && now - e.time < 3);
    for (const e of recent) {
      const x = cx + Math.max(-1, Math.min(1, e.delta / 135)) * half;
      ctx.fillStyle = hexA(COLORS.judge[e.judgement!], 1 - (now - e.time) / 3);
      ctx.fillRect(x - 1.5, y - 5, 3, 12);
    }
  }

  private drawWordBar(session: Session): void {
    const { ctx } = this;
    const L = this.layout;
    const current = session.currentWord();
    if (!current) return;
    const words = session.chart.words;
    const word = words[current.word];
    const y = Math.max(54, L.height * 0.09);
    const size = Math.round(Math.min(46, L.laneW * 0.5));
    ctx.font = `700 ${size}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const charW = ctx.measureText('M').width;
    const total = charW * word.length;
    let x = L.left + L.laneW * 2 - total / 2;
    for (let i = 0; i < word.length; i++) {
      ctx.fillStyle = i < current.typed ? COLORS.outer : COLORS.text;
      ctx.globalAlpha = i < current.typed ? 1 : 0.92;
      ctx.fillText(word[i].toUpperCase(), x, y);
      if (i === current.typed) {
        ctx.fillStyle = COLORS.inner;
        ctx.fillRect(x, y + size * 0.62, charW * 0.9, 3);
      }
      x += charW;
    }
    ctx.globalAlpha = 1;

    const upcoming = words.slice(current.word + 1, current.word + 4).join('  ');
    if (upcoming) {
      ctx.font = `500 ${Math.round(size * 0.42)}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.dim;
      ctx.fillText(upcoming.toUpperCase(), L.left + L.laneW * 2, y + size * 1.15);
    }
  }

  private drawComboAndJudgement(session: Session, now: number): void {
    const { ctx } = this;
    const L = this.layout;
    const cx = L.left + L.laneW * 2;

    if (session.combo >= 3) {
      ctx.font = `800 ${Math.round(L.laneW * 0.8)}px "Space Grotesk", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(243,238,254,0.22)';
      ctx.fillText(String(session.combo), cx, L.height * 0.42);
    }

    const last = [...session.events].reverse().find((e) => e.kind !== 'typo' || now - e.time < 0.4);
    if (last && now - last.time < 0.45) {
      const age = now - last.time;
      const scale = 1 + Math.max(0, 0.12 - age) * 2;
      const label = last.kind === 'typo' ? 'TYPO' : LABEL[last.judgement ?? 'miss'];
      const color = last.kind === 'typo' ? COLORS.typo : COLORS.judge[last.judgement ?? 'miss'];
      ctx.font = `700 ${Math.round(L.laneW * 0.32 * scale)}px "Space Grotesk", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = hexA(color, 0.75 - Math.max(0, age - 0.3) / 0.2);
      ctx.fillText(label, cx, L.height * 0.53);
    }
  }

  private drawHud(session: Session, now: number, songLength: number): void {
    const { ctx } = this;
    const L = this.layout;

    // Progress along the top edge.
    const p = Math.max(0, Math.min(1, now / Math.max(1, songLength)));
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 0, L.width, 3);
    ctx.fillStyle = COLORS.outer;
    ctx.fillRect(0, 0, L.width * p, 3);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = `700 28px "Space Grotesk", system-ui, sans-serif`;
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`${session.accuracy.toFixed(2)}%`, L.width - 24, 22);
    ctx.font = `500 14px "Space Grotesk", system-ui, sans-serif`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(`${session.chart.difficulty.toUpperCase()} · ${session.chart.bpm} BPM`, L.width - 24, 56);
    ctx.fillText('Esc to quit', L.width - 24, 76);
  }
}

export function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}
