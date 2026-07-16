import * as THREE from 'three';
import type { Mats } from './materials';

/**
 * Combat fantasy (v2):
 * - ~4–5 rapid arc hits knock out via Integrity (they constantly repair).
 * - Scramble builds per hit and STAYS. Spread hits so they heal HP while
 *   scramble fills → eyes go dark, still fighting, ready to REPROGRAM.
 * - Close range: self-destruct fuse (cancel if player leaves blast radius).
 * - Ranged: every ~4s pause, crouch, slow spark bolt with gentle tracking.
 */

export type RobotPhase = 'active' | 'disabled' | 'ally' | 'husk';

export type CombatMode = 'chase' | 'windup_bolt' | 'fuse' | 'disabled' | 'ally';

export const ROBOT = {
  maxHp: 110,
  /** Repair per second while active */
  repairPerSec: 14,
  /** Damage per arc hit (~5 hits to KO if rapid) */
  arcDamage: 24,
  /** Scramble per arc hit (~4 hits to full) */
  scramblePerHit: 28,
  chaseSpeed: 1.55,
  allySpeed: 1.85,
  /**
   * Soft leash with hysteresis (stops edge twitching):
   * wander freely under comfort; start return above hard;
   * keep returning until back under resumeWander.
   */
  allyLeashComfort: 5.0,
  allyLeashHard: 8.0,
  allyResumeWander: 4.2,
  allyWanderSpeed: 1.35,
  allyIdleChance: 0.4,
  allyIdleMin: 1.4,
  allyIdleMax: 4.0,
  /** Max simultaneous powered allies */
  maxAllies: 3,
  /**
   * Plasma economy — equilibrium attractor (live ally count every tick):
   *
   *   dP/dt = k · (P* − P)
   *
   * P* is the rest point for the current ally load (does not drain to 0):
   *   0 allies → 100%   1 → 75%   2 → 67%   3 → 50%
   *
   * k is asymmetric: drain-toward-eq vs regen-toward-eq.
   * More allies → drains from full faster, climbs back slower.
   * Arc swings spend plasma; below P* you recover toward it.
   *
   * Indexed by ally count 0..3
   */
  plasmaEq: [100, 75, 67, 50] as const,
  /** 1/s rate constant when above equilibrium (settling down) */
  plasmaDrainK: [0.9, 0.42, 0.72, 1.15] as const,
  /** 1/s rate constant when below equilibrium (climbing back) */
  plasmaRegenK: [1.5, 0.95, 0.62, 0.36] as const,
  /** Plasma spent per arc wrench swing */
  arcPlasmaCost: 5.5,
  /** Seconds at 0 plasma before an ally risks going rogue */
  allyStarveTime: 2.8,
  /** Vertical motion — step short risers, jump half-walls / stairs */
  robotGravity: 28,
  /** Jump clears ~1.55u (half-wall platforms + small courtyard walls) */
  robotJumpVel: Math.sqrt(2 * 28 * 1.55),
  robotStepHeight: 0.65,
  robotJumpCooldown: 0.4,
  /** Max climbable ledge via jump (slightly above JUMP_H for margin) */
  robotMaxClimb: 1.85,
  /** Soft separation radius (don't clump) */
  separateRadius: 1.35,
  separateStrength: 2.8,
  enemySeparateRadius: 1.5,
  enemySeparateStrength: 2.2,
  meleeRange: 1.55,
  meleeDamage: 10,
  meleeCd: 1.15,
  /** Start self-destruct when this close */
  fuseTriggerRange: 2.15,
  /** Cancel fuse if player farther than this (past blast hurt range) */
  fuseCancelRange: 3.6,
  fuseDuration: 2.6,
  blastRadius: 3.2,
  blastDamage: 42,
  boltCd: 4.2,
  boltWindup: 0.85,
  boltSpeed: 3.35,
  /** Very gentle tracking — mostly straight, slight curve */
  boltTurnRate: 0.45,
  boltDamage: 16,
  boltLife: 5.5,
} as const;

export class RobotUnit {
  mesh: THREE.Group;
  phase: RobotPhase = 'active';
  hp: number = ROBOT.maxHp;
  maxHp: number = ROBOT.maxHp;
  /** Scramble 0–100 — persists; full = eyes dark, reprogram-ready */
  scramble = 0;
  scrambled = false;
  attackCd = 0;
  boltCd = 1.5 + Math.random() * 2;
  repairCd = 0;
  anim = 0;
  aggro = false;
  mode: CombatMode = 'chase';
  fuseT = 0;
  windupT = 0;
  flashPhase = 0;
  /** Ally autonomous wander heading (radians) */
  wanderAngle = Math.random() * Math.PI * 2;
  wanderTimer = 0.5 + Math.random() * 1.5;
  idleT = 0;
  nextIdleRoll = 1 + Math.random() * 2;
  /** Last horizontal move dir for facing */
  faceDir = new THREE.Vector3(0, 0, 1);
  /** Ally leash state — hysteresis, avoids twitch at boundary */
  returning = false;
  /** Body radius for wall collision */
  radius = 0.38;
  /** Vertical velocity for jumps / steps */
  vy = 0;
  onGround = true;
  jumpCd = 0;

  private body: THREE.Group;
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private eyeL: THREE.Mesh;
  private eyeR: THREE.Mesh;
  private antenna: THREE.Mesh;
  private torso: THREE.Mesh;
  private mats: Mats;
  private flashMat: THREE.MeshStandardMaterial;

  constructor(mats: Mats, position: THREE.Vector3) {
    this.mats = mats;
    this.mesh = new THREE.Group();
    this.body = new THREE.Group();

    this.flashMat = mats.brass.clone();
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.45), this.flashMat);
    this.torso.position.y = 1.1;
    this.torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.4), mats.brassDark);
    head.position.y = 1.7;
    head.castShadow = true;
    this.eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.05), mats.emissiveRed);
    this.eyeR = this.eyeL.clone();
    this.eyeL.position.set(-0.12, 1.72, 0.2);
    this.eyeR.position.set(0.12, 1.72, 0.2);
    this.antenna = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), mats.emissiveRed);
    this.antenna.position.set(0, 1.95, 0);

    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), mats.iron);
    this.legR = this.legL.clone();
    this.legL.position.set(-0.18, 0.35, 0);
    this.legR.position.set(0.18, 0.35, 0);

    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), mats.ironDark);
    this.armR = this.armL.clone();
    this.armL.position.set(-0.48, 1.15, 0);
    this.armR.position.set(0.48, 1.15, 0);

    const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), mats.emissiveAmber);
    gauge.position.set(0, 1.15, 0.24);

    this.body.add(
      this.torso,
      head,
      this.eyeL,
      this.eyeR,
      this.antenna,
      this.legL,
      this.legR,
      this.armL,
      this.armR,
      gauge,
    );
    this.mesh.add(this.body);
    this.mesh.position.copy(position);
  }

  get position() {
    return this.mesh.position;
  }

  get reprogramReady(): boolean {
    return this.scrambled || this.phase === 'disabled';
  }

  setPhase(p: RobotPhase) {
    this.phase = p;
    this.mode = p === 'ally' ? 'ally' : p === 'disabled' ? 'disabled' : 'chase';
    if (p === 'disabled') {
      this.body.rotation.x = 0.4;
      this.setEyes('off');
      this.fuseT = 0;
      this.windupT = 0;
    } else if (p === 'ally') {
      this.body.rotation.x = 0;
      this.setEyes('ally');
      this.hp = 45;
      this.maxHp = 45;
      this.scramble = 0;
      this.scrambled = false;
      this.fuseT = 0;
      this.mesh.visible = true;
    } else if (p === 'husk') {
      // No longer a powered ally — visible/parent cleared so drain drops immediately
      this.mesh.visible = false;
      this.mode = 'disabled';
    } else {
      // active / rogue — explicitly not ally
      this.body.rotation.x = 0;
      this.setEyes(this.scrambled ? 'off' : 'hostile');
      this.mesh.visible = true;
    }
  }

  private setEyes(mode: 'hostile' | 'ally' | 'off') {
    if (mode === 'hostile') {
      this.eyeL.material = this.mats.emissiveRed;
      this.eyeR.material = this.mats.emissiveRed;
      this.antenna.material = this.mats.emissiveRed;
    } else if (mode === 'ally') {
      this.eyeL.material = this.mats.emissiveGreen;
      this.eyeR.material = this.mats.emissiveGreen;
      this.antenna.material = this.mats.emissiveGreen;
    } else {
      this.eyeL.material = this.mats.iron;
      this.eyeR.material = this.mats.iron;
      this.antenna.material = this.mats.ironDark;
    }
  }

  tickAnim(dt: number, moving: boolean, mode: CombatMode) {
    this.anim += dt * (moving ? 6 : mode === 'fuse' ? 14 : 2);
    const s = Math.sin(this.anim);

    if (mode === 'disabled') {
      this.legL.rotation.x = 0.55;
      this.legR.rotation.x = 0.55;
      this.armL.rotation.x = 0.3;
      this.armR.rotation.x = 0.3;
      this.body.position.y = -0.15;
      return;
    }

    if (mode === 'fuse') {
      // Stop, tremble, flash
      this.legL.rotation.x = 0.15;
      this.legR.rotation.x = 0.15;
      this.armL.rotation.x = -0.4 + s * 0.15;
      this.armR.rotation.x = -0.4 - s * 0.15;
      this.body.position.y = Math.abs(s) * 0.06;
      this.body.rotation.y = s * 0.08;
      // Flash white-hot faster as fuse progresses
      const t = this.fuseT / ROBOT.fuseDuration;
      const flashHz = 2 + t * 14;
      this.flashPhase += dt * flashHz * Math.PI * 2;
      const on = Math.sin(this.flashPhase) > 0;
      this.flashMat.emissive = new THREE.Color(on ? 0xff4400 : 0x000000);
      this.flashMat.emissiveIntensity = on ? 0.3 + t * 1.4 : 0;
      this.flashMat.color.set(on ? 0xffcc88 : 0xb8923a);
      return;
    } else {
      this.flashMat.emissive.setHex(0x000000);
      this.flashMat.emissiveIntensity = 0;
      this.flashMat.color.set(0xb8923a);
      this.body.rotation.y = 0;
    }

    if (mode === 'windup_bolt') {
      // Crouch and charge
      this.body.position.y = -0.22;
      this.legL.rotation.x = 0.6;
      this.legR.rotation.x = 0.6;
      this.armR.rotation.x = -1.4;
      this.armL.rotation.x = 0.2;
      return;
    }

    this.body.position.y = moving ? Math.abs(s) * 0.035 : 0;
    this.armR.rotation.x = moving ? s * 0.35 : 0;
    this.armL.rotation.x = moving ? -s * 0.35 : 0;
    this.legL.rotation.x = moving ? s * 0.45 : 0;
    this.legR.rotation.x = moving ? -s * 0.45 : 0;
  }

  /** Passive repair while active (including scrambled). */
  tickRepair(dt: number) {
    if (this.phase !== 'active') return;
    if (this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + ROBOT.repairPerSec * dt);
    }
  }

  /**
   * Arc hit. Returns:
   * - hurt: still fighting
   * - scrambled: scramble just filled (eyes out, reprogram-ready, still fighting)
   * - disabled: integrity depleted (kneel — scrap or reprogram)
   */
  applyArc(damage: number, scrambleAdd: number): 'hurt' | 'scrambled' | 'disabled' | 'none' {
    if (this.phase !== 'active') return 'none';
    // Cancel fuse if hit hard mid-sequence (stagger interrupt)
    if (this.mode === 'fuse') {
      this.mode = 'chase';
      this.fuseT = 0;
    }
    this.hp -= damage;
    const wasScrambled = this.scrambled;
    this.scramble = Math.min(100, this.scramble + scrambleAdd);
    if (this.scramble >= 100 && !this.scrambled) {
      this.scrambled = true;
      this.setEyes('off');
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.setPhase('disabled');
      return 'disabled';
    }
    if (this.scrambled && !wasScrambled) return 'scrambled';
    return 'hurt';
  }
}

export class SparkBolt {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  damage: number;
  light: THREE.PointLight;

  constructor(origin: THREE.Vector3, dir: THREE.Vector3) {
    const geo = new THREE.SphereGeometry(0.18, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x88ddff });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(origin).add(new THREE.Vector3(0, 1.2, 0));
    this.velocity = dir.clone().normalize().multiplyScalar(ROBOT.boltSpeed);
    this.life = ROBOT.boltLife;
    this.damage = ROBOT.boltDamage;
    this.light = new THREE.PointLight(0x66ccff, 1.5, 6);
    this.mesh.add(this.light);
  }

  /**
   * Gentle homing — limited turn rate so the bolt can't spin-track.
   */
  update(dt: number, target: THREE.Vector3): boolean {
    this.life -= dt;
    if (this.life <= 0) return false;

    const desired = target.clone().sub(this.mesh.position);
    desired.y *= 0.3;
    if (desired.lengthSq() > 0.01) {
      desired.normalize();
      const cur = this.velocity.clone().normalize();
      // Slerp direction with max turn
      const maxTurn = ROBOT.boltTurnRate * dt;
      const dot = Math.max(-1, Math.min(1, cur.dot(desired)));
      const ang = Math.acos(dot);
      if (ang > 0.001) {
        const t = Math.min(1, maxTurn / ang);
        const newDir = cur.lerp(desired, t).normalize();
        this.velocity.copy(newDir.multiplyScalar(ROBOT.boltSpeed));
      }
    }

    this.mesh.position.addScaledVector(this.velocity, dt);
    // Spark pulse
    const s = 0.9 + Math.sin(this.life * 20) * 0.15;
    this.mesh.scale.setScalar(s);
    return true;
  }
}

export function createHusk(mats: Mats, pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.5), mats.ironDark);
  a.position.y = 0.12;
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.35), mats.brassDark);
  b.position.set(0.1, 0.28, 0);
  b.rotation.z = 0.4;
  g.add(a, b);
  g.position.copy(pos);
  g.position.y = 0;
  return g;
}

export function createBlastFx(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0xff6622,
      transparent: true,
      opacity: 0.85,
    }),
  );
  g.add(sphere);
  const light = new THREE.PointLight(0xff5500, 4, 10);
  g.add(light);
  g.position.copy(pos);
  g.position.y += 1;
  g.userData.life = 0.45;
  g.userData.maxLife = 0.45;
  return g;
}
