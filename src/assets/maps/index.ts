import type { GameMap } from '../../engine/map';
import { ep0Basement } from './ep0_basement';
import { ep1Parking } from './ep1_parking';
import { ep1Interior } from './ep1_interior';
import { ep1Boss } from './ep1_boss';
import {
  ep2Quad,
  ep2Admin,
  ep2Hydra,
  ep3Forms,
  ep3Autopen,
  ep4Warehouse,
  ep4Fraud,
  ep5Court,
  ep5Tribunal,
  ep6Studio,
  ep6Leviathan,
  ep7Gold,
  ep7Codex,
  ep7Swamp,
  ep7Oval,
} from './late_campaign';

export const MAP_REGISTRY: Record<string, GameMap> = {
  [ep0Basement.id]: ep0Basement,
  [ep1Parking.id]: ep1Parking,
  [ep1Interior.id]: ep1Interior,
  [ep1Boss.id]: ep1Boss,
  [ep2Quad.id]: ep2Quad,
  [ep2Admin.id]: ep2Admin,
  [ep2Hydra.id]: ep2Hydra,
  [ep3Forms.id]: ep3Forms,
  [ep3Autopen.id]: ep3Autopen,
  [ep4Warehouse.id]: ep4Warehouse,
  [ep4Fraud.id]: ep4Fraud,
  [ep5Court.id]: ep5Court,
  [ep5Tribunal.id]: ep5Tribunal,
  [ep6Studio.id]: ep6Studio,
  [ep6Leviathan.id]: ep6Leviathan,
  [ep7Gold.id]: ep7Gold,
  [ep7Codex.id]: ep7Codex,
  [ep7Swamp.id]: ep7Swamp,
  [ep7Oval.id]: ep7Oval,
};

export const CAMPAIGN_START = ep0Basement.id;

export function getMapTemplate(id: string): GameMap {
  const m = MAP_REGISTRY[id];
  if (!m) throw new Error(`Unknown map: ${id}`);
  return m;
}

export function countCampaignPlaques(): number {
  const ids = new Set<string>();
  for (const map of Object.values(MAP_REGISTRY)) {
    for (const e of map.entities) {
      if (e.type === 'plaque') ids.add(e.id);
    }
  }
  return ids.size;
}

export {
  ep0Basement,
  ep1Parking,
  ep1Interior,
  ep1Boss,
};
