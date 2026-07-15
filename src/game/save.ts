/** Campaign save / continue (localStorage). */

export const SAVE_KEY = 'trump-doom-save-v2';

export interface SaveData {
  version: 2;
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
  completedMaps: string[];
  mapFlags: Record<string, string[]>;
  locationLabel: string;
  savedAt: number;
  /** Deaths since last successful level clear */
  levelDeaths: number;
  /** Section-restart penalties this run (for Very Stable Legend ending) */
  sectionRestarts: number;
  deepfakeBeaten: boolean;
}

export function hasSave(): boolean {
  return loadSave() != null;
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem('trump-doom-save-v1');
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SaveData> & { version?: number };
    if (!data.mapId || !data.player) return null;
    return {
      version: 2,
      mapId: data.mapId,
      player: {
        ...data.player,
        hasBlueKey: data.player.hasBlueKey ?? false,
      },
      completedMaps: data.completedMaps ?? [],
      mapFlags: data.mapFlags ?? {},
      locationLabel: data.locationLabel ?? data.mapId,
      savedAt: data.savedAt ?? Date.now(),
      levelDeaths: data.levelDeaths ?? 0,
      sectionRestarts: data.sectionRestarts ?? 0,
      deepfakeBeaten: data.deepfakeBeaten ?? false,
    };
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData) {
  data.version = 2;
  data.savedAt = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem('trump-doom-save-v1');
}

export function formatSaveTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}
