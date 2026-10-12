/** Small localStorage wrapper that never throws (private mode, blocked storage, etc.). */
import type { Difficulty } from '../chart/types';

export interface Settings {
  /** Scroll speed multiplier. */
  scroll: number;
  /** Global audio offset in ms from calibration. */
  offsetMs: number;
  difficulty: Difficulty;
}

const DEFAULTS: Settings = { scroll: 1.3, offsetMs: 0, difficulty: 'normal' };
const SETTINGS_KEY = 'typesu.settings.v1';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}

export function loadSettings(): Settings {
  return { ...DEFAULTS, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

/** Manual timing overrides per song, keyed by a song id. */
export interface TimingOverride {
  bpm: number;
  offset: number;
}

export function loadOverride(songId: string): TimingOverride | null {
  return read<TimingOverride>(`typesu.timing.${songId}`);
}

export function saveOverride(songId: string, value: TimingOverride): void {
  write(`typesu.timing.${songId}`, value);
}

export function clearOverride(songId: string): void {
  try {
    localStorage.removeItem(`typesu.timing.${songId}`);
  } catch {
    /* ignore */
  }
}
