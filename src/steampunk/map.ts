/** Height-aware map for steampunk vertical slice. */

export type CellSolid = number; // 0 empty, >0 wall texture id

export interface SteamMap {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Wall solids (0 = empty walkable) */
  walls: number[];
  /** Floor elevation in wall-heights (0 = ground, 0.5 = half platform, 1 = full story) */
  floorZ: number[];
  /** Ceiling elevation; large value (e.g. 10) = open sky */
  ceilZ: number[];
  /** Floor texture id per cell */
  floorTex: number[];
  /** Ceiling texture id; 0 = sky gradient */
  ceilTex: number[];
  spawn: { x: number; y: number; z: number; angle: number };
  entities: SteamEntity[];
  skyTop: string;
  skyBot: string;
}

export type SteamEntity =
  | { type: 'robot'; x: number; y: number; z?: number }
  | { type: 'plaque'; x: number; y: number; title: string; text: string }
  | { type: 'pickup'; x: number; y: number; kind: 'cell' | 'gear' | 'oil' }
  | { type: 'exit'; x: number; y: number };

export const WALL_UNIT = 1; // world units per wall height
export const JUMP_HEIGHT = 0.5; // half a wall
export const EYE_HEIGHT = 0.45;
export const STEP_UP = 0.35; // max auto step without jump

export function idx(map: SteamMap, x: number, y: number): number {
  return Math.floor(y) * map.width + Math.floor(x);
}

export function inBounds(map: SteamMap, x: number, y: number): boolean {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  return ix >= 0 && iy >= 0 && ix < map.width && iy < map.height;
}

export function wallAt(map: SteamMap, x: number, y: number): number {
  if (!inBounds(map, x, y)) return 1;
  return map.walls[idx(map, x, y)]!;
}

export function isSolid(map: SteamMap, x: number, y: number): boolean {
  return wallAt(map, x, y) > 0;
}

export function floorAt(map: SteamMap, x: number, y: number): number {
  if (!inBounds(map, x, y)) return 0;
  return map.floorZ[idx(map, x, y)]!;
}

export function ceilAt(map: SteamMap, x: number, y: number): number {
  if (!inBounds(map, x, y)) return 10;
  return map.ceilZ[idx(map, x, y)]!;
}

/** Build map from string rows + height overlays. */
export function buildSteamMap(opts: {
  id: string;
  name: string;
  walls: string[];
  floors?: string[]; // digits 0-9 * 0.25 or '0','h'=0.5,'1'=1
  ceils?: string[]; // 's'=sky 10, '1'=1, '2'=2
  floorTex?: string[];
  ceilTex?: string[];
  spawn: SteamMap['spawn'];
  entities: SteamEntity[];
  skyTop?: string;
  skyBot?: string;
}): SteamMap {
  const height = opts.walls.length;
  const width = opts.walls[0]!.length;
  const walls: number[] = [];
  const floorZ: number[] = [];
  const ceilZ: number[] = [];
  const floorTex: number[] = [];
  const ceilTex: number[] = [];

  const parseFloor = (ch: string): number => {
    if (ch === 'h' || ch === 'H') return 0.5;
    if (ch === '1') return 1;
    if (ch === '2') return 1.5;
    if (ch >= '0' && ch <= '9') return parseInt(ch, 10) * 0.25;
    return 0;
  };
  const parseCeil = (ch: string): number => {
    if (ch === 's' || ch === 'S' || ch === '.') return 10;
    if (ch === '1') return 1.0;
    if (ch === '2') return 1.5;
    if (ch === '3') return 2.0;
    if (ch >= '0' && ch <= '9') return parseInt(ch, 10) * 0.5 + 0.5;
    return 10;
  };

  for (let y = 0; y < height; y++) {
    const wr = opts.walls[y]!;
    const fr = opts.floors?.[y] ?? '.'.repeat(width);
    const cr = opts.ceils?.[y] ?? 's'.repeat(width);
    const ftr = opts.floorTex?.[y] ?? '1'.repeat(width);
    const ctr = opts.ceilTex?.[y] ?? '0'.repeat(width);
    if (wr.length !== width) throw new Error(`wall row ${y}`);
    for (let x = 0; x < width; x++) {
      const wc = wr[x]!;
      if (wc === '.') walls.push(0);
      else if (wc >= '0' && wc <= '9') walls.push(parseInt(wc, 10));
      else walls.push(1);
      floorZ.push(parseFloor(fr[x] ?? '0'));
      ceilZ.push(parseCeil(cr[x] ?? 's'));
      floorTex.push(parseInt(ftr[x] ?? '1', 10) || 1);
      ceilTex.push(parseInt(ctr[x] ?? '0', 10) || 0);
    }
  }

  return {
    id: opts.id,
    name: opts.name,
    width,
    height,
    walls,
    floorZ,
    ceilZ,
    floorTex,
    ceilTex,
    spawn: opts.spawn,
    entities: opts.entities,
    skyTop: opts.skyTop ?? '#3d2a1a',
    skyBot: opts.skyBot ?? '#8b6914',
  };
}
