import { gridFromStrings, type GameMap, type MapEntity } from '../engine/map';

/** Build a solid-border room grid filled with empty, then stamp walls. */
export function buildGrid(
  w: number,
  h: number,
  paint: (x: number, y: number, set: (v: number) => void) => void,
): { width: number; height: number; grid: number[] } {
  const rows: string[] = [];
  const cells: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      row.push(x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 1 : 0);
    }
    cells.push(row);
  }
  const set = (x: number, y: number, v: number) => {
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) cells[y]![x] = v;
  };
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      paint(x, y, (v) => set(x, y, v));
    }
  }
  for (let y = 0; y < h; y++) {
    rows.push(cells[y]!.map((c) => (c === 0 ? '.' : String(c))).join(''));
  }
  return gridFromStrings(rows);
}

export function makeMap(
  partial: Omit<GameMap, 'width' | 'height' | 'grid'> & {
    width: number;
    height: number;
    grid: number[];
  },
): GameMap {
  return partial as GameMap;
}

export function secretPair(
  x: number,
  y: number,
  wallX: number,
  wallY: number,
  flag: string,
): MapEntity[] {
  return [
    { type: 'secret_trigger', x, y, wallX, wallY, flag },
    {
      type: 'secret_trigger',
      x,
      y: y + 1,
      wallX,
      wallY: wallY + 1,
      flag,
    },
  ];
}
