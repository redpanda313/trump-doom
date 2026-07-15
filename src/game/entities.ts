export type WeaponId = 'gavel' | 'mic';

export interface PlayerState {
  x: number;
  y: number;
  angle: number;
  resolve: number;
  voice: number;
  brand: number;
  momentum: number;
  hasRedKey: boolean;
  hasBlueKey: boolean;
  weapon: WeaponId;
  attackCooldown: number;
  invuln: number;
  plaquesRead: Set<string>;
  conversions: number;
}

export type EnemyKind = 'karen' | 'libtard' | 'woke' | 'bureaucrat' | 'boss';

export interface Foe {
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  hurt: number;
  attackCd: number;
  alive: boolean;
  bob: number;
  elite: boolean;
  /** Boss only */
  variant?: string;
  spawnCd?: number;
  phase?: number;
  title?: string;
  damage?: number;
  radius?: number;
}

export type Enemy = Foe;
export type BossManager = Foe; // compat alias
export type KarenEnemy = Foe;

export interface PlaqueEntity {
  kind: 'plaque';
  x: number;
  y: number;
  id: string;
  title: string;
  text: string;
  read: boolean;
}

export interface PickupEntity {
  kind: 'pickup';
  x: number;
  y: number;
  item: 'resolve' | 'voice' | 'brand' | 'key_red' | 'key_blue';
  taken: boolean;
  flag: string;
}

export interface ExitEntity {
  kind: 'exit';
  x: number;
  y: number;
}

export interface ButtonEntity {
  kind: 'button';
  x: number;
  y: number;
  openCells: { x: number; y: number }[];
  flag: string;
  label: string;
  used: boolean;
}

export interface PhoneEntity {
  kind: 'phone';
  x: number;
  y: number;
  flag: string;
  label: string;
  effect: 'open' | 'silence' | 'toast';
  openCells?: { x: number; y: number }[];
  message: string;
  used: boolean;
  cooldown: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  vy: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  kind: 'mic' | 'bubble';
}

export const CONVERSION_LINES = [
  'JOINED THE TRUMP-TRAIN!',
  'ALL ABOARD!',
  'CONVERTED!',
  'TREMENDOUS RECRUIT!',
  'WELCOME TO THE TRAIN!',
];

export function randomConversionLine(): string {
  return CONVERSION_LINES[(Math.random() * CONVERSION_LINES.length) | 0]!;
}

export function createDefaultPlayer(spawn: { x: number; y: number; angle: number }): PlayerState {
  return {
    x: spawn.x,
    y: spawn.y,
    angle: spawn.angle,
    resolve: 100,
    voice: 100,
    brand: 0,
    momentum: 0,
    hasRedKey: false,
    hasBlueKey: false,
    weapon: 'gavel',
    attackCooldown: 0,
    invuln: 0,
    plaquesRead: new Set(),
    conversions: 0,
  };
}

export function bossMeta(variant: string): { title: string; hp: number; speed: number; dmg: number } {
  switch (variant) {
    case 'manager':
      return { title: 'MANAGER OF KARENS', hp: 420, speed: 0.9, dmg: 22 };
    case 'hydra':
      return { title: 'CANCEL CULTURE HYDRA', hp: 520, speed: 1.0, dmg: 24 };
    case 'autopen':
      return { title: 'THE AUTOPEN', hp: 600, speed: 0.75, dmg: 26 };
    case 'fraud':
      return { title: 'ELECTION FRAUD', hp: 680, speed: 1.05, dmg: 28 };
    case 'tribunal':
      return { title: 'ROGUE JUDGE TRIBUNAL', hp: 750, speed: 0.85, dmg: 30 };
    case 'media':
      return { title: 'MEDIA LEVIATHAN', hp: 820, speed: 0.95, dmg: 32 };
    case 'swamp':
      return { title: 'THE SWAMP', hp: 1000, speed: 1.0, dmg: 34 };
    case 'deepfake':
      return { title: 'DEEPFAKE DONALD', hp: 400, speed: 1.2, dmg: 20 };
    default:
      return { title: 'NARRATIVE DEMON', hp: 500, speed: 0.9, dmg: 22 };
  }
}
