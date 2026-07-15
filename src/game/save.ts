/** Campaign save / continue (localStorage). */

import { defaultMeta, type MetaProgress } from './shop';
import type { WeaponId } from './entities';

export const SAVE_KEY = 'trump-doom-save-v3';

export interface SaveData {
  version: 3;
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
    weapon: WeaponId;
    plaquesRead: string[];
    conversions: number;
    shield: number;
  };
  completedMaps: string[];
  mapFlags: Record<string, string[]>;
  locationLabel: string;
  savedAt: number;
  levelDeaths: number;
  sectionRestarts: number;
  deepfakeBeaten: boolean;
  meta: MetaProgress;
  shopNextMapId?: string;
}

export function hasSave(): boolean {
  return loadSave() != null;
}

export function loadSave(): SaveData | null {
  try {
    const raw =
      localStorage.getItem(SAVE_KEY) ??
      localStorage.getItem('trump-doom-save-v2') ??
      localStorage.getItem('trump-doom-save-v1');
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SaveData> & {
      version?: number;
      player?: SaveData['player'] & { weapon?: string };
    };
    if (!data.mapId || !data.player) return null;
    const meta = { ...defaultMeta(), ...(data.meta ?? {}) };
    meta.weaponLevel = { ...defaultMeta().weaponLevel, ...(data.meta?.weaponLevel ?? {}) };
    meta.ownedWeapons = data.meta?.ownedWeapons ?? ['gavel', 'mic'];
    const weapon = (data.player.weapon as WeaponId) || 'gavel';
    return {
      version: 3,
      mapId: data.mapId,
      player: {
        x: data.player.x,
        y: data.player.y,
        angle: data.player.angle,
        resolve: data.player.resolve,
        voice: data.player.voice,
        brand: data.player.brand,
        hasRedKey: data.player.hasRedKey,
        hasBlueKey: data.player.hasBlueKey ?? false,
        weapon: meta.ownedWeapons.includes(weapon) ? weapon : 'gavel',
        plaquesRead: data.player.plaquesRead ?? [],
        conversions: data.player.conversions ?? 0,
        shield: data.player.shield ?? meta.shieldMax,
      },
      completedMaps: data.completedMaps ?? [],
      mapFlags: data.mapFlags ?? {},
      locationLabel: data.locationLabel ?? data.mapId,
      savedAt: data.savedAt ?? Date.now(),
      levelDeaths: data.levelDeaths ?? 0,
      sectionRestarts: data.sectionRestarts ?? 0,
      deepfakeBeaten: data.deepfakeBeaten ?? false,
      meta,
      shopNextMapId: data.shopNextMapId,
    };
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData) {
  data.version = 3;
  data.savedAt = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem('trump-doom-save-v2');
  localStorage.removeItem('trump-doom-save-v1');
}

export function formatSaveTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}
