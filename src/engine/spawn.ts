import type { GameMap } from './map';
import { isSolid } from './map';

/** True if center + small radius is free of solid walls. */
export function isOpenSpawn(map: GameMap, x: number, y: number, radius = 0.22): boolean {
  if (x < 0.3 || y < 0.3 || x >= map.width - 0.3 || y >= map.height - 0.3) return false;
  if (isSolid(map, x, y)) return false;
  for (const ox of [-radius, 0, radius]) {
    for (const oy of [-radius, 0, radius]) {
      if (isSolid(map, x + ox, y + oy)) return false;
    }
  }
  // Prefer actual empty floor cells (not wall texture pads)
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return false;
  if (map.grid[cy * map.width + cx]! > 0) return false;
  return true;
}

/**
 * Find a walkable spawn near a preferred point.
 * Spiral search then full-map scan fallback.
 */
export function findOpenSpawn(
  map: GameMap,
  preferX: number,
  preferY: number,
  radius = 0.22,
): { x: number; y: number } | null {
  if (isOpenSpawn(map, preferX, preferY, radius)) {
    return { x: preferX, y: preferY };
  }
  // Snap to cell center first
  const scx = Math.floor(preferX) + 0.5;
  const scy = Math.floor(preferY) + 0.5;
  if (isOpenSpawn(map, scx, scy, radius)) return { x: scx, y: scy };

  for (let ring = 1; ring <= 8; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const x = Math.floor(preferX) + dx + 0.5;
        const y = Math.floor(preferY) + dy + 0.5;
        if (isOpenSpawn(map, x, y, radius)) return { x, y };
      }
    }
  }

  // Full map fallback
  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (isOpenSpawn(map, px, py, radius)) return { x: px, y: py };
    }
  }
  return null;
}

/** Open cells near a boss for add spawns (avoids walls). */
export function findBossAddSpawn(
  map: GameMap,
  bossX: number,
  bossY: number,
  minDist = 1.4,
  maxDist = 3.5,
): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 24; attempt++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const x = bossX + Math.cos(ang) * dist;
    const y = bossY + Math.sin(ang) * dist;
    const open = findOpenSpawn(map, x, y);
    if (open) return open;
  }
  return findOpenSpawn(map, bossX + 2, bossY);
}
