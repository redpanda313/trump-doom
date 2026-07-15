import type { PlayerState, Projectile, KarenEnemy } from './entities';
import type { GameAudio } from '../engine/audio';

export interface AttackResult {
  projectiles: Projectile[];
  meleeHits: { enemy: KarenEnemy; damage: number }[];
  voiceCost: number;
}

export function tryPrimaryFire(
  player: PlayerState,
  enemies: KarenEnemy[],
  audio: GameAudio,
): AttackResult | null {
  if (player.attackCooldown > 0) return null;

  if (player.weapon === 'gavel') {
    player.attackCooldown = 0.35;
    audio.gavel();
    const hits: AttackResult['meleeHits'] = [];
    const range = 1.35;
    const cone = 0.7; // radians half-angle-ish via dot
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
      const dot = nx * fx + ny * fy;
      if (dot < Math.cos(cone)) continue;
      const dmg = 28 + player.momentum * 0.15;
      hits.push({ enemy: e, damage: dmg });
    }
    return { projectiles: [], meleeHits: hits, voiceCost: 0 };
  }

  // mic drop — ranged speech bubble
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
  enemies: KarenEnemy[],
  audio: GameAudio,
): AttackResult | null {
  if (player.attackCooldown > 0) return null;

  if (player.weapon === 'gavel') {
    // slam stun cone — more damage, longer CD
    if (player.voice < 5) return null;
    player.voice -= 5;
    player.attackCooldown = 0.7;
    audio.gavel();
    const hits: AttackResult['meleeHits'] = [];
    const range = 1.6;
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
      if (nx * fx + ny * fy < 0.5) continue;
      hits.push({ enemy: e, damage: 40 });
      e.attackCd = Math.max(e.attackCd, 1.2); // stun
    }
    return { projectiles: [], meleeHits: hits, voiceCost: 5 };
  }

  // mic alt — pierce soundbite beam (hits first enemy in ray)
  if (player.voice < 14) return null;
  player.voice -= 14;
  player.attackCooldown = 0.5;
  audio.mic();
  const hits: AttackResult['meleeHits'] = [];
  const fx = Math.cos(player.angle);
  const fy = Math.sin(player.angle);
  let best: KarenEnemy | null = null;
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
    // lateral distance
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
