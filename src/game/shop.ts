/** Between-section shop: permanent upgrades, weapons, consumables. */

import type { WeaponId } from './entities';

export type ShopItemId =
  | 'hp1' | 'hp2' | 'hp3'
  | 'spd1' | 'spd2' | 'spd3'
  | 'regen1' | 'regen2'
  | 'shield1' | 'shield2' | 'shield3'
  | 'gavel_up' | 'mic_up' | 'framing_up' | 'logic_up' | 'facts_up'
  | 'unlock_framing' | 'unlock_logic' | 'unlock_facts' | 'unlock_wall' | 'unlock_charisma'
  | 'bomb_pack' | 'freeze_pack' | 'repel_pack'
  | 'voice_cap';

export interface MetaProgress {
  /** Bonus max Resolve (base 100) */
  maxResolveBonus: number;
  /** Move speed multiplier bonus (0–0.45) */
  speedBonus: number;
  /** Resolve per second */
  regen: number;
  /** Max shield points */
  shieldMax: number;
  weaponLevel: Record<WeaponId, number>;
  ownedWeapons: WeaponId[];
  bombs: number;
  freezes: number;
  repels: number;
  /** Max voice bonus */
  voiceBonus: number;
  /** Highest section index fully cleared (for unlock gates) */
  sectionsCleared: number;
  /** Purchased item ids (for one-time upgrades) */
  purchased: string[];
}

export function defaultMeta(): MetaProgress {
  return {
    maxResolveBonus: 0,
    speedBonus: 0,
    regen: 0,
    shieldMax: 0,
    weaponLevel: {
      gavel: 0,
      mic: 0,
      framing: 0,
      logic: 0,
      facts: 0,
      wall: 0,
      charisma: 0,
    },
    ownedWeapons: ['gavel', 'mic'],
    bombs: 0,
    freezes: 0,
    repels: 0,
    voiceBonus: 0,
    sectionsCleared: 0,
    purchased: [],
  };
}

export interface ShopItem {
  id: ShopItemId;
  name: string;
  desc: string;
  /** Base brand cost */
  baseCost: number;
  /** Min sections cleared to appear */
  unlockAt: number;
  /** Repeatable? */
  stackable: boolean;
  /** Max purchases if stackable (upgrade tiers) */
  maxStacks?: number;
  category: 'body' | 'weapon' | 'unlock' | 'consumable';
}

export const SHOP_CATALOG: ShopItem[] = [
  // Body
  { id: 'hp1', name: 'Iron Resolve I', desc: '+25 max Resolve', baseCost: 40, unlockAt: 0, stackable: false, category: 'body' },
  { id: 'hp2', name: 'Iron Resolve II', desc: '+40 max Resolve', baseCost: 90, unlockAt: 2, stackable: false, category: 'body' },
  { id: 'hp3', name: 'Iron Resolve III', desc: '+60 max Resolve', baseCost: 160, unlockAt: 4, stackable: false, category: 'body' },
  { id: 'spd1', name: 'Golden Sneakers I', desc: '+12% move speed', baseCost: 45, unlockAt: 0, stackable: false, category: 'body' },
  { id: 'spd2', name: 'Golden Sneakers II', desc: '+15% move speed', baseCost: 100, unlockAt: 2, stackable: false, category: 'body' },
  { id: 'spd3', name: 'Golden Sneakers III', desc: '+18% move speed', baseCost: 170, unlockAt: 5, stackable: false, category: 'body' },
  { id: 'regen1', name: 'Diet Coke IV', desc: 'Regen 1.5 Resolve/sec', baseCost: 70, unlockAt: 1, stackable: false, category: 'body' },
  { id: 'regen2', name: 'Rally Drip', desc: 'Regen 3 Resolve/sec', baseCost: 150, unlockAt: 4, stackable: false, category: 'body' },
  { id: 'shield1', name: 'Podium Shield I', desc: '25 shield (absorbs hits)', baseCost: 55, unlockAt: 1, stackable: false, category: 'body' },
  { id: 'shield2', name: 'Podium Shield II', desc: '+35 shield capacity', baseCost: 120, unlockAt: 3, stackable: false, category: 'body' },
  { id: 'shield3', name: 'Wall of Brand', desc: '+50 shield capacity', baseCost: 200, unlockAt: 5, stackable: false, category: 'body' },
  { id: 'voice_cap', name: 'Megaphone Lungs', desc: '+40 max Voice', baseCost: 65, unlockAt: 1, stackable: false, category: 'body' },

  // Weapon unlocks
  { id: 'unlock_framing', name: 'Framing Nailgun', desc: 'Unlock weapon (key 3)', baseCost: 80, unlockAt: 1, stackable: false, category: 'unlock' },
  { id: 'unlock_logic', name: 'Logic Laser', desc: 'Unlock weapon (key 4)', baseCost: 120, unlockAt: 2, stackable: false, category: 'unlock' },
  { id: 'unlock_facts', name: 'Spreadsheet Storm', desc: 'Unlock weapon (key 5)', baseCost: 160, unlockAt: 3, stackable: false, category: 'unlock' },
  { id: 'unlock_wall', name: 'Wall of Text', desc: 'Unlock weapon (key 6)', baseCost: 200, unlockAt: 4, stackable: false, category: 'unlock' },
  { id: 'unlock_charisma', name: 'Charisma Cannon', desc: 'Unlock weapon (key 7)', baseCost: 260, unlockAt: 5, stackable: false, category: 'unlock' },

  // Weapon upgrades (stackable levels)
  { id: 'gavel_up', name: 'Gavel Upgrade', desc: '+dmg / wider swing per level', baseCost: 50, unlockAt: 0, stackable: true, maxStacks: 5, category: 'weapon' },
  { id: 'mic_up', name: 'Mic Upgrade', desc: '+dmg / faster shots per level', baseCost: 50, unlockAt: 0, stackable: true, maxStacks: 5, category: 'weapon' },
  { id: 'framing_up', name: 'Framing Upgrade', desc: 'Stronger nails per level', baseCost: 70, unlockAt: 1, stackable: true, maxStacks: 4, category: 'weapon' },
  { id: 'logic_up', name: 'Logic Upgrade', desc: 'Hotter beam per level', baseCost: 85, unlockAt: 2, stackable: true, maxStacks: 4, category: 'weapon' },
  { id: 'facts_up', name: 'Facts Upgrade', desc: 'Bigger paper storm per level', baseCost: 95, unlockAt: 3, stackable: true, maxStacks: 4, category: 'weapon' },

  // Consumables
  { id: 'bomb_pack', name: 'Truth Bomb ×2', desc: 'F key — AOE convert burst', baseCost: 35, unlockAt: 1, stackable: true, maxStacks: 20, category: 'consumable' },
  { id: 'freeze_pack', name: 'Gavel Freeze ×2', desc: 'G key — freeze foes briefly', baseCost: 40, unlockAt: 2, stackable: true, maxStacks: 20, category: 'consumable' },
  { id: 'repel_pack', name: 'Repellant ×2', desc: 'R key — shove + invuln pulse', baseCost: 45, unlockAt: 3, stackable: true, maxStacks: 20, category: 'consumable' },
];

export function itemCost(item: ShopItem, meta: MetaProgress): number {
  let stacks = 0;
  if (item.id === 'gavel_up') stacks = meta.weaponLevel.gavel;
  else if (item.id === 'mic_up') stacks = meta.weaponLevel.mic;
  else if (item.id === 'framing_up') stacks = meta.weaponLevel.framing;
  else if (item.id === 'logic_up') stacks = meta.weaponLevel.logic;
  else if (item.id === 'facts_up') stacks = meta.weaponLevel.facts;
  else if (item.id === 'bomb_pack') stacks = Math.floor(meta.bombs / 2);
  else if (item.id === 'freeze_pack') stacks = Math.floor(meta.freezes / 2);
  else if (item.id === 'repel_pack') stacks = Math.floor(meta.repels / 2);

  const scale = 1 + stacks * 0.45 + meta.sectionsCleared * 0.08;
  return Math.round(item.baseCost * scale);
}

export function canShowItem(item: ShopItem, meta: MetaProgress): boolean {
  if (meta.sectionsCleared < item.unlockAt) return false;
  if (!item.stackable && meta.purchased.includes(item.id)) return false;
  if (item.id === 'unlock_framing' && meta.ownedWeapons.includes('framing')) return false;
  if (item.id === 'unlock_logic' && meta.ownedWeapons.includes('logic')) return false;
  if (item.id === 'unlock_facts' && meta.ownedWeapons.includes('facts')) return false;
  if (item.id === 'unlock_wall' && meta.ownedWeapons.includes('wall')) return false;
  if (item.id === 'unlock_charisma' && meta.ownedWeapons.includes('charisma')) return false;
  if (item.id === 'framing_up' && !meta.ownedWeapons.includes('framing')) return false;
  if (item.id === 'logic_up' && !meta.ownedWeapons.includes('logic')) return false;
  if (item.id === 'facts_up' && !meta.ownedWeapons.includes('facts')) return false;
  if (item.id === 'gavel_up' && meta.weaponLevel.gavel >= (item.maxStacks ?? 5)) return false;
  if (item.id === 'mic_up' && meta.weaponLevel.mic >= (item.maxStacks ?? 5)) return false;
  if (item.id === 'framing_up' && meta.weaponLevel.framing >= (item.maxStacks ?? 4)) return false;
  if (item.id === 'logic_up' && meta.weaponLevel.logic >= (item.maxStacks ?? 4)) return false;
  if (item.id === 'facts_up' && meta.weaponLevel.facts >= (item.maxStacks ?? 4)) return false;
  return true;
}

export function applyPurchase(item: ShopItem, meta: MetaProgress): void {
  switch (item.id) {
    case 'hp1':
      meta.maxResolveBonus += 25;
      break;
    case 'hp2':
      meta.maxResolveBonus += 40;
      break;
    case 'hp3':
      meta.maxResolveBonus += 60;
      break;
    case 'spd1':
      meta.speedBonus += 0.12;
      break;
    case 'spd2':
      meta.speedBonus += 0.15;
      break;
    case 'spd3':
      meta.speedBonus += 0.18;
      break;
    case 'regen1':
      meta.regen += 1.5;
      break;
    case 'regen2':
      meta.regen += 3;
      break;
    case 'shield1':
      meta.shieldMax += 25;
      break;
    case 'shield2':
      meta.shieldMax += 35;
      break;
    case 'shield3':
      meta.shieldMax += 50;
      break;
    case 'voice_cap':
      meta.voiceBonus += 40;
      break;
    case 'unlock_framing':
      if (!meta.ownedWeapons.includes('framing')) meta.ownedWeapons.push('framing');
      break;
    case 'unlock_logic':
      if (!meta.ownedWeapons.includes('logic')) meta.ownedWeapons.push('logic');
      break;
    case 'unlock_facts':
      if (!meta.ownedWeapons.includes('facts')) meta.ownedWeapons.push('facts');
      break;
    case 'unlock_wall':
      if (!meta.ownedWeapons.includes('wall')) meta.ownedWeapons.push('wall');
      break;
    case 'unlock_charisma':
      if (!meta.ownedWeapons.includes('charisma')) meta.ownedWeapons.push('charisma');
      break;
    case 'gavel_up':
      meta.weaponLevel.gavel += 1;
      break;
    case 'mic_up':
      meta.weaponLevel.mic += 1;
      break;
    case 'framing_up':
      meta.weaponLevel.framing += 1;
      break;
    case 'logic_up':
      meta.weaponLevel.logic += 1;
      break;
    case 'facts_up':
      meta.weaponLevel.facts += 1;
      break;
    case 'bomb_pack':
      meta.bombs += 2;
      break;
    case 'freeze_pack':
      meta.freezes += 2;
      break;
    case 'repel_pack':
      meta.repels += 2;
      break;
  }
  if (!item.stackable && !meta.purchased.includes(item.id)) {
    meta.purchased.push(item.id);
  }
}

/** After clearing a section's last map, insert shop then continue. */
export const SECTION_SHOP_GATES: Record<string, { shopId: string; nextMapId: string }> = {
  ep0_basement: { shopId: 'shop_0', nextMapId: 'ep1_parking' },
  ep1_boss: { shopId: 'shop_1', nextMapId: 'ep2_quad' },
  ep2_hydra: { shopId: 'shop_2', nextMapId: 'ep3_forms' },
  ep3_autopen: { shopId: 'shop_3', nextMapId: 'ep4_warehouse' },
  ep4_fraud: { shopId: 'shop_4', nextMapId: 'ep5_court' },
  ep5_tribunal: { shopId: 'shop_5', nextMapId: 'ep6_studio' },
  ep6_leviathan: { shopId: 'shop_6', nextMapId: 'ep7_approach' },
};

export function isShopMapId(id: string): boolean {
  return id.startsWith('shop_');
}
