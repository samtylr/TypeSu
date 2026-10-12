/**
 * Song playback driven by the audio hardware clock.
 *
 * Game time is never taken from frame timers: it is read from the
 * AudioContext's output timestamp, so notes stay locked to what the
 * player actually hears. A user offset (from calibration) shifts both
 * rendering and judging.
 */
export class SongPlayer {
  readonly ctx: AudioContext;
  private source: AudioBufferSourceNode | null = null;
  private clicks: OscillatorNode[] = [];
  /** Context time at which song time 0 is heard. */
  private zero = 0;
  private playing = false;
  /** Positive values mean "the player hears audio later than reported". */
  offsetMs = 0;
  onEnded: (() => void) | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Start the buffer `delay` seconds from now, beginning at `from` seconds into the song. */
  play(buffer: AudioBuffer | null, from = 0, delay = 0.4): void {
    this.stop();
    const startAt = this.ctx.currentTime + delay;
    this.zero = startAt - from;
    if (buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.onended = () => {
        if (this.source === source) {
          this.playing = false;
          this.onEnded?.();
        }
      };
      source.start(startAt, Math.max(0, from));
      this.source = source;
    }
    this.playing = true;
  }

  stop(): void {
    if (this.source) {
      const s = this.source;
      this.source = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
    for (const c of this.clicks) {
      try {
        c.stop();
      } catch {
        /* ignore */
      }
    }
    this.clicks = [];
    this.playing = false;
  }

  /** Context time currently coming out of the speakers, at a given performance.now() time. */
  private heardContextTime(perfMs: number): number {
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime && ts.performanceTime) {
      return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    }
    const latency = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    return this.ctx.currentTime - latency + (perfMs - performance.now()) / 1000;
  }

  /** Song time (seconds) at a performance.now() timestamp, e.g. a key event's timeStamp. */
  songTimeAt(perfMs: number, applyOffset = true): number {
    const t = this.heardContextTime(perfMs) - this.zero;
    return applyOffset ? t - this.offsetMs / 1000 : t;
  }

  now(applyOffset = true): number {
    return this.songTimeAt(performance.now(), applyOffset);
  }

  /** Schedule short metronome clicks at song times (seconds). Call after play(). */
  scheduleClicks(times: number[], accentEvery = 4): void {
    times.forEach((t, i) => {
      const at = this.zero + t;
      if (at < this.ctx.currentTime) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = i % accentEvery === 0 ? 1760 : 1320;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.5, at + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(at);
      osc.stop(at + 0.08);
      this.clicks.push(osc);
    });
  }
}
