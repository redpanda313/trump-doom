/** Grid map format for the raycaster. */

export type WallId = number;

/** 0 = empty. Positive = solid wall texture id. Negative reserved for specials. */
export interface GameMap {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Row-major grid[y * width + x] */
  grid: WallId[];
  floorColor: string;
  ceilingColor: string;
  spawn: { x: number; y: number; angle: number };
  /** World entities placed on map (sprites, plaques, pickups, enemies). */
  entities: MapEntity[];
}

export type MapEntity =
  | { type: 'karen'; x: number; y: number }
  | { type: 'plaque'; x: number; y: number; title: string; text: string; id: string }
  | { type: 'pickup'; x: number; y: number; kind: 'resolve' | 'voice' | 'brand' | 'key_red' }
  | { type: 'exit'; x: number; y: number }
  | { type: 'secret_trigger'; x: number; y: number; wallX: number; wallY: number };

export function cell(map: GameMap, x: number, y: number): WallId {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= map.width || iy >= map.height) return 1;
  return map.grid[iy * map.width + ix]!;
}

export function isSolid(map: GameMap, x: number, y: number): boolean {
  return cell(map, x, y) > 0;
}

export function setCell(map: GameMap, ix: number, iy: number, value: WallId) {
  if (ix < 0 || iy < 0 || ix >= map.width || iy >= map.height) return;
  map.grid[iy * map.width + ix] = value;
}

/** Helper: build grid from string rows (digits 0-9, letters A-F = 10-15). */
export function gridFromStrings(rows: string[]): { width: number; height: number; grid: WallId[] } {
  const height = rows.length;
  const width = rows[0]!.length;
  const grid: WallId[] = [];
  for (let y = 0; y < height; y++) {
    const row = rows[y]!;
    if (row.length !== width) throw new Error(`Map row ${y} width mismatch`);
    for (let x = 0; x < width; x++) {
      const ch = row[x]!;
      if (ch === '.') grid.push(0);
      else if (ch >= '0' && ch <= '9') grid.push(parseInt(ch, 10));
      else if (ch >= 'A' && ch <= 'F') grid.push(10 + (ch.charCodeAt(0) - 65));
      else grid.push(1);
    }
  }
  return { width, height, grid };
}
