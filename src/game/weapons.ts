import type { PlayerState, Projectile, Enemy, WeaponId } from './entities';
import type { GameAudio } from '../engine/audio';
import type { MetaProgress } from './shop';

export interface AttackResult {
  projectiles: Projectile[];
  meleeHits: { enemy: Enemy; damage: number }[];
  voiceCost: number;
  /** Deploy wall segment (utility) */
  wallDeploy?: { x: number; y: number; life: number };
}

function coneHits(
  player: PlayerState,
  enemies: Enemy[],
  range: number,
  minDot: number,
  damage: number,
): AttackResult['meleeHits'] {
  const hits: AttackResult['meleeHits'] = [];
  const fx = Math.cos(player.angle);
  const fy = Math.sin(player.angle);
  for (const e of enemies) {
    if (!e.alive || (e.frozen ?? 0) > 0) continue;
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > range || dist < 0.01) continue;
    const nx = dx / dist;
    const ny = dy / dist;
    if (nx * fx + ny * fy < minDot) continue;
    hits.push({ enemy: e, damage });
  }
  return hits;
}

function lvl(player: PlayerState, w: WeaponId): number {
  return player.weaponLevel[w] ?? 0;
}

export function tryPrimaryFire(
  player: PlayerState,
  enemies: Enemy[],
  audio: GameAudio,
): AttackResult | null {
  if (player.attackCooldown > 0) return null;
  const w = player.weapon;
  const L = lvl(player, w);

  if (w === 'gavel') {
    player.attackCooldown = Math.max(0.22, 0.35 - L * 0.02);
    audio.gavel();
    const dmg = 28 + L * 8 + player.momentum * 0.15;
    const range = 1.35 + L * 0.12;
    return {
      projectiles: [],
      meleeHits: coneHits(player, enemies, range, Math.cos(0.7 - L * 0.04), dmg),
      voiceCost: 0,
    };
  }

  if (w === 'mic') {
    if (player.voice < 8) return null;
    player.attackCooldown = Math.max(0.16, 0.28 - L * 0.02);
    player.voice -= 8;
    audio.mic();
    const speed = 9 + L * 0.6;
    const ang = player.angle + (Math.random() - 0.5) * (0.08 - L * 0.01);
    return {
      projectiles: [
        {
          x: player.x + Math.cos(player.angle) * 0.4,
          y: player.y + Math.sin(player.angle) * 0.4,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          damage: 18 + L * 6 + player.momentum * 0.1,
          life: 1.4,
          kind: 'mic',
        },
      ],
      meleeHits: [],
      voiceCost: 8,
    };
  }

  if (w === 'framing') {
    if (player.voice < 6) return null;
    player.attackCooldown = Math.max(0.1, 0.18 - L * 0.015);
    player.voice -= 6;
    audio.mic();
    const projs: Projectile[] = [];
    const count = 1 + Math.min(2, Math.floor(L / 2));
    for (let i = 0; i < count; i++) {
      const ang = player.angle + (i - (count - 1) / 2) * 0.12;
      projs.push({
        x: player.x + Math.cos(player.angle) * 0.35,
        y: player.y + Math.sin(player.angle) * 0.35,
        vx: Math.cos(ang) * (11 + L),
        vy: Math.sin(ang) * (11 + L),
        damage: 14 + L * 5,
        life: 1.1,
        kind: 'frame',
      });
    }
    return { projectiles: projs, meleeHits: [], voiceCost: 6 };
  }

  if (w === 'logic') {
    if (player.voice < 12) return null;
    player.attackCooldown = 0.08;
    player.voice -= 3;
    audio.hit();
    // Continuous-ish beam as short fast projectile
    return {
      projectiles: [
        {
          x: player.x + Math.cos(player.angle) * 0.5,
          y: player.y + Math.sin(player.angle) * 0.5,
          vx: Math.cos(player.angle) * (16 + L),
          vy: Math.sin(player.angle) * (16 + L),
          damage: 10 + L * 4,
          life: 0.35,
          kind: 'logic',
          radius: 0.25,
        },
      ],
      meleeHits: [],
      voiceCost: 3,
    };
  }

  if (w === 'facts') {
    if (player.voice < 14) return null;
    player.attackCooldown = Math.max(0.35, 0.55 - L * 0.03);
    player.voice -= 14;
    audio.gavel();
    const projs: Projectile[] = [];
    for (let i = -2; i <= 2; i++) {
      const ang = player.angle + i * (0.18 - L * 0.01);
      projs.push({
        x: player.x + Math.cos(player.angle) * 0.3,
        y: player.y + Math.sin(player.angle) * 0.3,
        vx: Math.cos(ang) * (7 + L * 0.5),
        vy: Math.sin(ang) * (7 + L * 0.5),
        damage: 12 + L * 4,
        life: 0.9,
        kind: 'facts',
      });
    }
    return { projectiles: projs, meleeHits: [], voiceCost: 14 };
  }

  if (w === 'wall') {
    if (player.voice < 20) return null;
    player.attackCooldown = 0.8;
    player.voice -= 20;
    audio.button();
    const fx = Math.cos(player.angle);
    const fy = Math.sin(player.angle);
    // Melee shove + damage cone
    const hits = coneHits(player, enemies, 1.8 + L * 0.1, 0.4, 35 + L * 8);
    for (const h of hits) {
      h.enemy.x += fx * 0.6;
      h.enemy.y += fy * 0.6;
    }
    return { projectiles: [], meleeHits: hits, voiceCost: 20 };
  }

  if (w === 'charisma') {
    if (player.voice < 18) return null;
    player.attackCooldown = Math.max(0.4, 0.65 - L * 0.03);
    player.voice -= 18;
    audio.trumpTrain();
    // Wide slow bubble
    return {
      projectiles: [
        {
          x: player.x + Math.cos(player.angle) * 0.4,
          y: player.y + Math.sin(player.angle) * 0.4,
          vx: Math.cos(player.angle) * (5 + L * 0.4),
          vy: Math.sin(player.angle) * (5 + L * 0.4),
          damage: 40 + L * 10,
          life: 1.6,
          kind: 'bubble',
          radius: 0.55,
        },
      ],
      meleeHits: [],
      voiceCost: 18,
    };
  }

  return null;
}

export function tryAltFire(
  player: PlayerState,
  enemies: Enemy[],
  audio: GameAudio,
): AttackResult | null {
  if (player.attackCooldown > 0) return null;
  const w = player.weapon;
  const L = lvl(player, w);

  if (w === 'gavel') {
    if (player.voice < 5) return null;
    player.voice -= 5;
    player.attackCooldown = 0.7;
    audio.gavel();
    const hits = coneHits(player, enemies, 1.6 + L * 0.1, 0.5, 40 + L * 8);
    for (const h of hits) h.enemy.attackCd = Math.max(h.enemy.attackCd, 1.2 + L * 0.1);
    return { projectiles: [], meleeHits: hits, voiceCost: 5 };
  }

  if (w === 'mic' || w === 'framing' || w === 'logic' || w === 'facts' || w === 'charisma') {
    if (player.voice < 14) return null;
    player.voice -= 14;
    player.attackCooldown = 0.5;
    audio.mic();
    const hits: AttackResult['meleeHits'] = [];
    const fx = Math.cos(player.angle);
    const fy = Math.sin(player.angle);
    let best: Enemy | null = null;
    let bestD = 12 + L;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > bestD) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      if (nx * fx + ny * fy < 0.9) continue;
      const lat = Math.abs(dx * fy - dy * fx);
      if (lat > 0.4) continue;
      best = e;
      bestD = dist;
    }
    if (best) hits.push({ enemy: best, damage: 45 + L * 10 });
    return { projectiles: [], meleeHits: hits, voiceCost: 14 };
  }

  if (w === 'wall') {
    // Alt: temporary invuln pulse
    if (player.voice < 15) return null;
    player.voice -= 15;
    player.attackCooldown = 1.0;
    player.invuln = Math.max(player.invuln, 0.8 + L * 0.1);
    audio.plaque();
    return { projectiles: [], meleeHits: [], voiceCost: 15 };
  }

  return null;
}

export function weaponLabel(id: WeaponId, level = 0): string {
  const names: Record<WeaponId, string> = {
    gavel: 'DEBATE GAVEL',
    mic: 'MIC DROP',
    framing: 'FRAMING NAILGUN',
    logic: 'LOGIC LASER',
    facts: 'SPREADSHEET STORM',
    wall: 'WALL OF TEXT',
    charisma: 'CHARISMA CANNON',
  };
  const base = names[id] ?? id.toUpperCase();
  return level > 0 ? `${base} +${level}` : base;
}

export function applyMetaToPlayer(player: PlayerState, meta: MetaProgress) {
  player.maxResolve = 100 + meta.maxResolveBonus;
  player.maxVoice = 100 + meta.voiceBonus;
  player.speedMul = 1 + meta.speedBonus;
  player.regen = meta.regen;
  player.maxShield = meta.shieldMax;
  player.shield = Math.min(player.maxShield, player.shield || meta.shieldMax);
  player.bombs = meta.bombs;
  player.freezes = meta.freezes;
  player.repels = meta.repels;
  player.ownedWeapons = [...meta.ownedWeapons];
  player.weaponLevel = { ...meta.weaponLevel };
  if (!player.ownedWeapons.includes(player.weapon)) {
    player.weapon = 'gavel';
  }
  player.resolve = Math.min(player.resolve, player.maxResolve);
  player.voice = Math.min(player.voice, player.maxVoice);
}

export function syncMetaFromPlayer(player: PlayerState, meta: MetaProgress) {
  meta.bombs = player.bombs;
  meta.freezes = player.freezes;
  meta.repels = player.repels;
}
