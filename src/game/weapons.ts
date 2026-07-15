import type { PlayerState, Projectile, Enemy } from './entities';
import type { GameAudio } from '../engine/audio';

export interface AttackResult {
  projectiles: Projectile[];
  meleeHits: { enemy: Enemy; damage: number }[];
  voiceCost: number;
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
    if (!e.alive) continue;
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

export function tryPrimaryFire(
  player: PlayerState,
  enemies: Enemy[],
  audio: GameAudio,
): AttackResult | null {
  if (player.attackCooldown > 0) return null;

  if (player.weapon === 'gavel') {
    player.attackCooldown = 0.35;
    audio.gavel();
    const dmg = 28 + player.momentum * 0.15;
    return {
      projectiles: [],
      meleeHits: coneHits(player, enemies, 1.35, Math.cos(0.7), dmg),
      voiceCost: 0,
    };
  }

  if (player.voice < 8) return null;
  player.attackCooldown = 0.28;
  player.voice -= 8;
  audio.mic();
  const speed = 9;
  const spread = (Math.random() - 0.5) * 0.08;
  const ang = player.angle + spread;
  const proj: Projectile = {
    x: player.x + Math.cos(player.angle) * 0.4,
    y: player.y + Math.sin(player.angle) * 0.4,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    damage: 18 + player.momentum * 0.1,
    life: 1.4,
    kind: 'mic',
  };
  return { projectiles: [proj], meleeHits: [], voiceCost: 8 };
}

export function tryAltFire(
  player: PlayerState,
  enemies: Enemy[],
  audio: GameAudio,
): AttackResult | null {
  if (player.attackCooldown > 0) return null;

  if (player.weapon === 'gavel') {
    if (player.voice < 5) return null;
    player.voice -= 5;
    player.attackCooldown = 0.7;
    audio.gavel();
    const hits = coneHits(player, enemies, 1.6, 0.5, 40);
    for (const h of hits) h.enemy.attackCd = Math.max(h.enemy.attackCd, 1.2);
    return { projectiles: [], meleeHits: hits, voiceCost: 5 };
  }

  if (player.voice < 14) return null;
  player.voice -= 14;
  player.attackCooldown = 0.5;
  audio.mic();
  const hits: AttackResult['meleeHits'] = [];
  const fx = Math.cos(player.angle);
  const fy = Math.sin(player.angle);
  let best: Enemy | null = null;
  let bestD = 12;
  for (const e of enemies) {
    if (!e.alive) continue;
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > bestD) continue;
    const nx = dx / dist;
    const ny = dy / dist;
    if (nx * fx + ny * fy < 0.92) continue;
    const lat = Math.abs(dx * fy - dy * fx);
    if (lat > 0.35) continue;
    best = e;
    bestD = dist;
  }
  if (best) hits.push({ enemy: best, damage: 45 });
  return { projectiles: [], meleeHits: hits, voiceCost: 14 };
}

export function weaponLabel(id: PlayerState['weapon']): string {
  return id === 'gavel' ? 'DEBATE GAVEL' : 'MIC DROP';
}
