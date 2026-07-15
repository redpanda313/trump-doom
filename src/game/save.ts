/** Campaign save / continue (localStorage). */

export const SAVE_KEY = 'trump-doom-save-v1';

export interface SaveData {
  version: 1;
  mapId: string;
  player: {
    x: number;
    y: number;
    angle: number;
    resolve: number;
    voice: number;
    brand: number;
    hasRedKey: boolean;
    hasBlueKey: boolean;
    weapon: 'gavel' | 'mic';
    plaquesRead: string[];
    conversions: number;
  };
  /** Map ids fully cleared (exited). */
  completedMaps: string[];
  /** Per-map flags (doors, secrets, buttons, taken pickups). */
  mapFlags: Record<string, string[]>;
  /** Episode display name last played */
  locationLabel: string;
  savedAt: number;
}

export function hasSave(): boolean {
  return loadSave() != null;
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 1 || !data.mapId || !data.player) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData) {
  data.savedAt = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

export function formatSaveTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}
