import type { GameMap } from '../../engine/map';
import { ep0Basement } from './ep0_basement';
import { ep1Parking } from './ep1_parking';
import { ep1Interior } from './ep1_interior';
import { ep1Boss } from './ep1_boss';

export const MAP_REGISTRY: Record<string, GameMap> = {
  [ep0Basement.id]: ep0Basement,
  [ep1Parking.id]: ep1Parking,
  [ep1Interior.id]: ep1Interior,
  [ep1Boss.id]: ep1Boss,
};

export const CAMPAIGN_START = ep0Basement.id;

export function getMapTemplate(id: string): GameMap {
  const m = MAP_REGISTRY[id];
  if (!m) throw new Error(`Unknown map: ${id}`);
  return m;
}

export { ep0Basement, ep1Parking, ep1Interior, ep1Boss };
