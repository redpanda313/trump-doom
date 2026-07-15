/** Persistent player settings (audio + mouse). */

const KEY = 'trump-doom-settings';

export interface GameSettings {
  master: number;
  music: number;
  sfx: number;
  /** Look speed multiplier. 1 = default, range ~0.2–2.5 */
  mouseSensitivity: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  master: 0.8,
  music: 0.55,
  sfx: 0.85,
  mouseSensitivity: 1,
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<GameSettings>;
    return {
      master: clamp(p.master ?? DEFAULT_SETTINGS.master, 0, 1),
      music: clamp(p.music ?? DEFAULT_SETTINGS.music, 0, 1),
      sfx: clamp(p.sfx ?? DEFAULT_SETTINGS.sfx, 0, 1),
      mouseSensitivity: clamp(p.mouseSensitivity ?? DEFAULT_SETTINGS.mouseSensitivity, 0.15, 3),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: GameSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** Base look speed before sensitivity multiplier. */
export const BASE_LOOK_SENS = 0.0022;
