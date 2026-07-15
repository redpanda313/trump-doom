/** Per-section visual identity: sky, floor, walls, fog, enemy roster. */

import type { MusicThemeId } from '../game/campaign';

export type FoeKindName = 'karen' | 'libtard' | 'woke' | 'bureaucrat';

export interface ZoneTheme {
  id: number;
  label: string;
  music: MusicThemeId;
  floor: string;
  ceiling: string;
  fog: number;
  fogRgb: [number, number, number];
  /** Crosshair / accent HUD tint */
  accent: string;
  /** Wall paint recipes keyed by wall id 1–9 */
  walls: Record<number, WallStyle>;
  enemyRoster: FoeKindName[];
  ambientLabel: string;
}

export type WallStyle =
  | { kind: 'noise'; base: [number, number, number]; variance: number }
  | { kind: 'stripe'; a: [number, number, number]; b: [number, number, number]; period: number }
  | { kind: 'grid'; line: [number, number, number]; fill: [number, number, number]; step: number }
  | { kind: 'band'; band: [number, number, number]; fill: [number, number, number]; y0: number; y1: number }
  | { kind: 'chevron'; a: [number, number, number]; b: [number, number, number] }
  | { kind: 'mesh'; line: [number, number, number]; fill: [number, number, number] };

const sharedDoors = (accent: [number, number, number]): Record<number, WallStyle> => ({
  3: { kind: 'stripe', a: accent, b: [40, 40, 45], period: 8 },
  6: { kind: 'noise', base: [90, 85, 70], variance: 12 },
  7: { kind: 'chevron', a: [255, 215, 0], b: [10, 31, 68] },
  9: { kind: 'mesh', line: [90, 100, 110], fill: [40, 45, 50] },
});

export const ZONE_THEMES: ZoneTheme[] = [
  {
    id: 0,
    label: 'Basement',
    music: 'ambition',
    floor: '#2a2e35',
    ceiling: '#0a1f44',
    fog: 12,
    fogRgb: [8, 12, 28],
    accent: '#ffd700',
    ambientLabel: 'Concrete & ambition',
    enemyRoster: ['karen'],
    walls: {
      1: { kind: 'noise', base: [70, 72, 78], variance: 15 },
      2: { kind: 'band', band: [220, 180, 40], fill: [30, 35, 55], y0: 20, y1: 44 },
      4: { kind: 'noise', base: [110, 70, 35], variance: 12 },
      5: { kind: 'grid', line: [0, 140, 180], fill: [15, 25, 40], step: 8 },
      8: { kind: 'noise', base: [180, 160, 130], variance: 8 },
      ...sharedDoors([160, 30, 40]),
    },
  },
  {
    id: 1,
    label: 'Strip Mall',
    music: 'ambition',
    floor: '#4a4540',
    ceiling: '#87a0b8',
    fog: 14,
    fogRgb: [100, 120, 140],
    accent: '#e67e22',
    ambientLabel: 'Stucco & parking heat',
    enemyRoster: ['karen', 'karen'],
    walls: {
      1: { kind: 'noise', base: [190, 175, 150], variance: 10 },
      2: { kind: 'band', band: [200, 40, 40], fill: [200, 190, 170], y0: 10, y1: 20 },
      4: { kind: 'stripe', a: [40, 80, 140], b: [220, 220, 210], period: 16 },
      5: { kind: 'grid', line: [255, 200, 0], fill: [50, 50, 55], step: 10 },
      8: { kind: 'noise', base: [210, 190, 160], variance: 6 },
      ...sharedDoors([180, 40, 40]),
    },
  },
  {
    id: 2,
    label: 'Campus',
    music: 'campus',
    floor: '#3d4a38',
    ceiling: '#6fa8dc',
    fog: 13,
    fogRgb: [80, 130, 90],
    accent: '#58d68d',
    ambientLabel: 'Quad grass & protest chalk',
    enemyRoster: ['libtard', 'woke', 'karen'],
    walls: {
      1: { kind: 'noise', base: [90, 110, 70], variance: 14 },
      2: { kind: 'band', band: [155, 89, 182], fill: [60, 90, 50], y0: 24, y1: 40 },
      4: { kind: 'stripe', a: [200, 180, 100], b: [80, 100, 60], period: 12 },
      5: { kind: 'grid', line: [46, 204, 113], fill: [30, 50, 35], step: 8 },
      8: { kind: 'noise', base: [180, 200, 160], variance: 10 },
      ...sharedDoors([142, 68, 173]),
    },
  },
  {
    id: 3,
    label: 'Bureau',
    music: 'bureau',
    floor: '#4a4840',
    ceiling: '#5d6d7e',
    fog: 11,
    fogRgb: [50, 55, 60],
    accent: '#aab7b8',
    ambientLabel: 'Forms, fluorescent hum',
    enemyRoster: ['bureaucrat', 'bureaucrat', 'libtard'],
    walls: {
      1: { kind: 'grid', line: [120, 120, 115], fill: [70, 70, 68], step: 6 },
      2: { kind: 'band', band: [180, 160, 40], fill: [90, 90, 95], y0: 28, y1: 36 },
      4: { kind: 'noise', base: [100, 95, 85], variance: 8 },
      5: { kind: 'stripe', a: [200, 200, 190], b: [60, 65, 70], period: 4 },
      8: { kind: 'noise', base: [130, 125, 115], variance: 5 },
      ...sharedDoors([100, 30, 30]),
    },
  },
  {
    id: 4,
    label: 'Catacombs',
    music: 'catacombs',
    floor: '#1a1a22',
    ceiling: '#0d0d14',
    fog: 9,
    fogRgb: [20, 15, 30],
    accent: '#bb8fce',
    ambientLabel: 'Ballot dust & server chill',
    enemyRoster: ['bureaucrat', 'woke', 'libtard'],
    walls: {
      1: { kind: 'noise', base: [35, 35, 45], variance: 10 },
      2: { kind: 'band', band: [100, 40, 120], fill: [25, 25, 35], y0: 18, y1: 46 },
      4: { kind: 'stripe', a: [40, 40, 50], b: [20, 20, 28], period: 10 },
      5: { kind: 'grid', line: [0, 80, 100], fill: [15, 20, 30], step: 12 },
      8: { kind: 'noise', base: [50, 45, 55], variance: 8 },
      ...sharedDoors([120, 20, 80]),
    },
  },
  {
    id: 5,
    label: 'Tribunal',
    music: 'tribunal',
    floor: '#3c3c44',
    ceiling: '#2c3e50',
    fog: 12,
    fogRgb: [40, 45, 60],
    accent: '#f4d03f',
    ambientLabel: 'Marble & gavels',
    enemyRoster: ['bureaucrat', 'libtard', 'karen'],
    walls: {
      1: { kind: 'noise', base: [180, 175, 170], variance: 8 },
      2: { kind: 'band', band: [40, 40, 80], fill: [200, 195, 185], y0: 8, y1: 56 },
      4: { kind: 'stripe', a: [120, 100, 60], b: [190, 185, 175], period: 20 },
      5: { kind: 'grid', line: [80, 70, 40], fill: [160, 155, 150], step: 16 },
      8: { kind: 'noise', base: [150, 145, 140], variance: 6 },
      ...sharedDoors([80, 20, 20]),
    },
  },
  {
    id: 6,
    label: 'Prime Time',
    music: 'primetime',
    floor: '#1a1018',
    ceiling: '#4a1020',
    fog: 11,
    fogRgb: [60, 10, 25],
    accent: '#ff3355',
    ambientLabel: 'Neon chyron glow',
    enemyRoster: ['libtard', 'woke', 'woke'],
    walls: {
      1: { kind: 'grid', line: [255, 40, 80], fill: [30, 10, 20], step: 8 },
      2: { kind: 'band', band: [0, 200, 255], fill: [40, 10, 25], y0: 22, y1: 42 },
      4: { kind: 'stripe', a: [255, 200, 0], b: [20, 10, 15], period: 6 },
      5: { kind: 'grid', line: [0, 255, 180], fill: [25, 15, 30], step: 5 },
      8: { kind: 'noise', base: [80, 20, 40], variance: 15 },
      ...sharedDoors([255, 50, 80]),
    },
  },
  {
    id: 7,
    label: 'Swamp & Oval',
    music: 'finale',
    floor: '#1a3028',
    ceiling: '#0a1f44',
    fog: 10,
    fogRgb: [15, 40, 30],
    accent: '#ffd700',
    ambientLabel: 'Fog, gold, destiny',
    enemyRoster: ['woke', 'bureaucrat', 'libtard', 'karen'],
    walls: {
      1: { kind: 'noise', base: [30, 70, 50], variance: 12 },
      2: { kind: 'band', band: [255, 215, 0], fill: [20, 50, 40], y0: 16, y1: 48 },
      4: { kind: 'stripe', a: [10, 31, 68], b: [40, 90, 60], period: 14 },
      5: { kind: 'grid', line: [255, 215, 0], fill: [15, 40, 55], step: 10 },
      8: { kind: 'noise', base: [50, 90, 70], variance: 10 },
      ...sharedDoors([200, 30, 40]),
    },
  },
];

export function zoneThemeForEpisode(episode: number): ZoneTheme {
  const i = Math.max(0, Math.min(ZONE_THEMES.length - 1, episode));
  return ZONE_THEMES[i]!;
}
