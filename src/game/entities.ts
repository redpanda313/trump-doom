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
  elite: boolean;
}

export interface BossManager {
  kind: 'boss_manager';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  hurt: number;
  attackCd: number;
  spawnCd: number;
  alive: boolean;
  bob: number;
  phase: number;
}

export type Enemy = KarenEnemy | BossManager;

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
  /** Cooldown for re-usable silence phones */
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
