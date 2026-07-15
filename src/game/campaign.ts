/** Sections, difficulty, branching, endings. */

export interface SectionDef {
  id: number;
  name: string;
  /** First map id when section restarts */
  startMapId: string;
  mapIds: string[];
  music: MusicThemeId;
}

export type MusicThemeId =
  | 'ambition'
  | 'campus'
  | 'bureau'
  | 'catacombs'
  | 'tribunal'
  | 'primetime'
  | 'finale';

export const SECTIONS: SectionDef[] = [
  {
    id: 0,
    name: 'Basement of Ambition',
    startMapId: 'ep0_basement',
    mapIds: ['ep0_basement'],
    music: 'ambition',
  },
  {
    id: 1,
    name: 'Strip Mall of Suffering',
    startMapId: 'ep1_parking',
    mapIds: ['ep1_parking', 'ep1_interior', 'ep1_boss'],
    music: 'ambition',
  },
  {
    id: 2,
    name: 'Campus of Eternal Protest',
    startMapId: 'ep2_quad',
    mapIds: ['ep2_quad', 'ep2_admin', 'ep2_hydra'],
    music: 'campus',
  },
  {
    id: 3,
    name: 'Bureau of Infinite Forms',
    startMapId: 'ep3_forms',
    mapIds: ['ep3_forms', 'ep3_autopen'],
    music: 'bureau',
  },
  {
    id: 4,
    name: 'Ballot Catacombs',
    startMapId: 'ep4_warehouse',
    mapIds: ['ep4_warehouse', 'ep4_fraud'],
    music: 'catacombs',
  },
  {
    id: 5,
    name: 'Tribunal of the Unelected',
    startMapId: 'ep5_court',
    mapIds: ['ep5_court', 'ep5_tribunal'],
    music: 'tribunal',
  },
  {
    id: 6,
    name: 'Prime Time Abyss',
    startMapId: 'ep6_studio',
    mapIds: ['ep6_studio', 'ep6_leviathan'],
    music: 'primetime',
  },
  {
    id: 7,
    name: 'The Swamp & The Oval',
    startMapId: 'ep7_approach',
    mapIds: ['ep7_gold', 'ep7_codex', 'ep7_swamp', 'ep7_oval'],
    music: 'finale',
  },
];

export function sectionForMap(mapId: string): SectionDef {
  if (mapId.startsWith('shop_')) {
    const n = Number(mapId.replace('shop_', '')) || 0;
    // Shop after section n belongs to transition after that section
    return SECTIONS[Math.min(n, SECTIONS.length - 1)]!;
  }
  const s = SECTIONS.find((sec) => sec.mapIds.includes(mapId) || sec.startMapId === mapId);
  return s ?? SECTIONS[0]!;
}

/** Difficulty scales with episode number. */
export function difficultyForEpisode(ep: number): {
  hpMul: number;
  dmgMul: number;
  speedMul: number;
  enemyCountHint: number;
} {
  const t = Math.max(0, ep);
  return {
    hpMul: 1 + t * 0.18,
    dmgMul: 1 + t * 0.12,
    speedMul: 1 + t * 0.06,
    enemyCountHint: 3 + t,
  };
}

export type EndingId =
  | 'peoples_inauguration'
  | 'brand_empire'
  | 'mandate_codex'
  | 'very_stable_legend'
  | 'hollow_victory'
  | 'standard_inauguration';

export interface EndingResult {
  id: EndingId;
  title: string;
  subtitle: string;
  blurb: string;
}

export interface EndingInput {
  plaquesRead: string[];
  brand: number;
  conversions: number;
  /** Times player suffered section-restart death penalty this run */
  sectionRestarts: number;
  deepfakeBeaten: boolean;
  /** Approximate total plaques in campaign */
  totalPlaques: number;
}

/**
 * Priority (highest first):
 * 1. People's Inauguration — all plaques
 * 2. Brand Empire — huge brand
 * 3. Mandate of the Codices — many plaques + solid brand
 * 4. Very Stable Legend — never section-restarted
 * 5. Hollow Victory — low investment
 * 6. Standard Inauguration — default
 */
export function evaluateEnding(input: EndingInput): EndingResult {
  const plaques = input.plaquesRead.length;
  const allPlaques = plaques >= Math.max(1, input.totalPlaques - 1); // allow 1 miss for true-ish
  const trueAll = plaques >= input.totalPlaques;

  if (trueAll || (allPlaques && input.brand >= 100)) {
    return {
      id: 'peoples_inauguration',
      title: "THE PEOPLE'S INAUGURATION",
      subtitle: 'True Ending',
      blurb:
        'Every plaque. Every lesson. The Oval is not a room — it is a story you finished reading. The train has no last car.',
    };
  }
  if (input.brand >= 180) {
    return {
      id: 'brand_empire',
      title: 'BRAND EMPIRE',
      subtitle: 'Golden Ending',
      blurb:
        'Brand so high the monuments rebrand themselves. You did not merely win — you licensed the victory.',
    };
  }
  if (plaques >= 12 && input.brand >= 90) {
    return {
      id: 'mandate_codex',
      title: 'MANDATE OF THE CODICES',
      subtitle: 'Scholar-King Ending',
      blurb:
        'You collected the walls. Lore becomes law. The codex hums under the Resolute Desk.',
    };
  }
  if (input.sectionRestarts === 0) {
    return {
      id: 'very_stable_legend',
      title: 'VERY STABLE LEGEND',
      subtitle: 'Flawless Section Run',
      blurb:
        'No section restarts. Resolve never sent you back to the chapter start. Stable. Genius. Framed in gold.',
    };
  }
  if (input.brand < 70 && plaques < 6) {
    return {
      id: 'hollow_victory',
      title: 'HOLLOW VICTORY',
      subtitle: 'Pyrrhic Ending',
      blurb:
        'You reached the Oval with thin Brand and few plaques. The desk is Resolute. The story is not. Try reading the walls next time.',
    };
  }
  return {
    id: 'standard_inauguration',
    title: 'INAUGURATION DAY',
    subtitle: 'Standard Ending',
    blurb:
      'The swamp yields. The train arrives. Credits roll under synth-rock thunder. Destiny: delivered.',
  };
}

/** Branch into ep7 approach map based on plaques & brand. */
export function chooseEp7Approach(brand: number, plaqueCount: number): string {
  if (brand >= 120) return 'ep7_gold';
  if (plaqueCount >= 8) return 'ep7_codex';
  return 'ep7_swamp';
}
