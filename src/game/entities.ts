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
  weapon: WeaponId;
  attackCooldown: number;
  invuln: number;
  plaquesRead: Set<string>;
  conversions: number;
}

export interface KarenEnemy {
  kind: 'karen';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  hurt: number;
  attackCd: number;
  alive: boolean;
  bob: number;
}

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
  item: 'resolve' | 'voice' | 'brand' | 'key_red';
  taken: boolean;
}

export interface ExitEntity {
  kind: 'exit';
  x: number;
  y: number;
}

export interface Floater {
  x: number; // screen ratio 0-1 or world — we use screen px
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

export type WorldEntity = KarenEnemy | PlaqueEntity | PickupEntity | ExitEntity;

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
