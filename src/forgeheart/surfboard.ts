/**
 * Plasma sky-surfboard — velocity-based powerslide (hold Shift), jump, grind, bumps.
 *
 * Powerslide model (arcade racers / CTR-style):
 * - Separate *facing* (yaw) from *velocity direction* (momentum).
 * - Hold drift (Shift) + steer at speed → face turns into the slide while
 *   velocity keeps most of its previous heading (low lateral grip).
 * - Slide charge builds while drifting; release → mini-turbo and velocity
 *   snaps toward facing (exit boost).
 */

import * as THREE from 'three';
import type { Mats } from './materials';
import { nearestOnPath } from './raceway';

export const BOARD = {
  maxSpeed: 22,
  accel: 15,
  brake: 18,
  drag: 1.6,
  /** Yaw rate rad/s at low speed full bank */
  turnRateSlow: 2.5,
  /** Yaw rate at max speed (normal grip) */
  turnRateFast: 0.85,
  /** Extra yaw while powersliding */
  slideTurnMul: 1.65,
  bankMax: 0.58,
  bankLerp: 7,
  /** Min speed fraction to enter powerslide */
  slideMinSpeed: 0.28,
  /** How fast velocity heading follows face when NOT sliding (grip) */
  gripAlign: 9,
  /** How fast velocity heading follows face WHILE sliding (low grip) */
  slideGripAlign: 0.55,
  /** Lateral drift push while sliding */
  slideLateral: 0.42,
  /** Charge seconds for full mini-turbo */
  slideChargeFull: 1.15,
  /** Boost impulse on slide release (0..1 charge scale) */
  slideBoostMin: 3,
  slideBoostMax: 9,
  /** Jump */
  jumpVel: 9.5,
  gravity: 26,
  rampBoostJump: 14,
  hoverHeight: 0.55,
  bobAmp: 0.12,
  bobHz: 1.4,
  fovBase: 70,
  fovFast: 108,
  camTipAccel: -0.12,
  camTipBrake: 0.14,
  offPathLimit: 32,
  /** Collision — buildings off-road only; slide along, never kill progress */
  bumpRadius: 1.1,
  bumpKeepForward: 0.94,
  grindSpeedMul: 1.08,
  grindSnap: 10,
  /** Must be this close to start a grind (was too sticky) */
  grindCatch: 1.05,
  grindHold: 1.85,
  /** If blocked, keep this fraction of path-forward motion */
  stuckNudge: 6,
} as const;

export type BoardSurface = 'air' | 'road' | 'ramp' | 'rail';

export class Surfboard {
  mesh: THREE.Group;
  position: THREE.Vector3;
  /** Facing direction (nose) */
  yaw = 0;
  /** Momentum direction (where speed actually goes) */
  velYaw = 0;
  /** Lean / bank */
  bank = 0;
  speed = 0;
  vy = 0;
  mounted = false;
  speedNorm = 0;
  onGround = true;
  surface: BoardSurface = 'road';
  /** 0..1 powerslide charge for mini-turbo */
  slideCharge = 0;
  sliding = false;

  private bobT = 0;
  private jumpBuffer = 0;
  private grindRail: { a: THREE.Vector3; b: THREE.Vector3 } | null = null;
  private prevPos = new THREE.Vector3();
  private stuckT = 0;

  constructor(mats: Mats, pos: THREE.Vector3, yaw: number) {
    this.position = pos.clone();
    this.prevPos.copy(pos);
    this.yaw = yaw;
    this.velYaw = yaw;
    this.mesh = buildBoardMesh(mats);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = yaw;
  }

  get interactPos() {
    return this.position;
  }

  tickIdle(dt: number) {
    this.bobT += dt;
    if (this.mounted) return;
    const bob = Math.sin(this.bobT * BOARD.bobHz * Math.PI * 2) * BOARD.bobAmp;
    this.mesh.position.set(this.position.x, this.position.y + bob, this.position.z);
    this.mesh.rotation.y = this.yaw + Math.sin(this.bobT * 0.7) * 0.04;
    this.mesh.rotation.z = Math.sin(this.bobT * 0.9) * 0.06;
    this.mesh.rotation.x = Math.sin(this.bobT * 0.5) * 0.03;
  }

  mount() {
    this.mounted = true;
    this.speed = 2.5;
    this.velYaw = this.yaw;
    this.bank = 0;
    this.vy = 0;
    this.sliding = false;
    this.slideCharge = 0;
    this.onGround = true;
  }

  dismount(): THREE.Vector3 {
    this.mounted = false;
    this.speed = 0;
    this.bank = 0;
    this.sliding = false;
    this.slideCharge = 0;
    this.speedNorm = 0;
    this.vy = 0;
    this.grindRail = null;
    const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return this.position.clone().addScaledVector(side, 1.4).add(new THREE.Vector3(0, 0.5, 0));
  }

  requestJump() {
    this.jumpBuffer = 0.15;
  }

  /**
   * @param accel -1..1
   * @param steer -1..1
   * @param slideHeld hold Shift/Ctrl for powerslide
   * @param ramps ramp segments for boost jumps
   * @param rails grind rails
   * @param bumps solid obstacle centers (hard collisions)
   */
  tick(
    dt: number,
    accel: number,
    steer: number,
    path: THREE.Vector3[],
    pathDist: number[],
    slideHeld: boolean,
    ramps: { pos: THREE.Vector3; yaw: number; len: number }[],
    rails: { a: THREE.Vector3; b: THREE.Vector3 }[],
    bumps: THREE.Vector3[],
  ) {
    this.bobT += dt;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    const near = nearestOnPath(path, pathDist, this.position);
    const roadY = near.point.y + BOARD.hoverHeight;

    // ——— Detect ramp / rail surface ———
    this.surface = 'road';
    let onRamp = false;
    let rampPitch = 0;
    for (const r of ramps) {
      const local = this.position.clone().sub(r.pos);
      const forward = new THREE.Vector3(Math.sin(r.yaw), 0, Math.cos(r.yaw));
      const along = local.dot(forward);
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const lat = Math.abs(local.dot(right));
      if (along > -0.5 && along < r.len + 0.5 && lat < 4.5) {
        onRamp = true;
        this.surface = 'ramp';
        // Ramp rises along length
        const t = THREE.MathUtils.clamp(along / r.len, 0, 1);
        rampPitch = -0.35; // nose up feel
        const rampTop = r.pos.y + t * 4.5 + BOARD.hoverHeight;
        if (this.vy <= 0.5) {
          this.position.y = Math.max(this.position.y, rampTop);
          if (this.position.y <= rampTop + 0.35) {
            this.onGround = true;
            this.vy = 0;
          }
        }
        break;
      }
    }

    // Grind rails — only catch when very close / already grinding; jump or steer away to leave
    let grinding = false;
    if (this.grindRail || this.onGround || this.vy < 2) {
      const candidates = this.grindRail ? [this.grindRail, ...rails] : rails;
      for (const rail of candidates) {
        const closest = closestPointOnSegment(this.position, rail.a, rail.b);
        const d = Math.hypot(this.position.x - closest.x, this.position.z - closest.z);
        const catchR = this.grindRail === rail ? BOARD.grindHold : BOARD.grindCatch;
        const heightOk =
          this.position.y < closest.y + 2.2 && this.position.y > closest.y - 0.8;
        if (d < catchR && heightOk) {
          // Break free if steering hard away from rail or jumping
          const railMid = rail.a.clone().add(rail.b).multiplyScalar(0.5);
          const away = new THREE.Vector3(
            this.position.x - railMid.x,
            0,
            this.position.z - railMid.z,
          );
          if (away.lengthSq() > 1e-4) away.normalize();
          const face = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          const steerAway = away.dot(face) > 0.35 && Math.abs(steer) > 0.55;
          if (steerAway && this.grindRail === rail) {
            this.grindRail = null;
            continue;
          }
          grinding = true;
          this.surface = 'rail';
          this.grindRail = rail;
          const railDir = rail.b.clone().sub(rail.a);
          if (railDir.lengthSq() > 0.01) {
            railDir.normalize();
            if (face.dot(railDir) < 0) railDir.negate();
            this.velYaw = Math.atan2(railDir.x, railDir.z);
            this.yaw = dampAngle(this.yaw, this.velYaw, 6, dt);
            this.position.x = THREE.MathUtils.damp(this.position.x, closest.x, BOARD.grindSnap, dt);
            this.position.z = THREE.MathUtils.damp(this.position.z, closest.z, BOARD.grindSnap, dt);
            this.position.y = closest.y + 0.45;
            this.onGround = true;
            this.vy = 0;
            this.speed = Math.min(
              BOARD.maxSpeed * BOARD.grindSpeedMul,
              Math.max(this.speed, 8) + 3 * dt,
            );
          }
          break;
        }
      }
    }
    if (!grinding) this.grindRail = null;

    // ——— Powerslide enter/exit (hold Shift) ———
    const canSlide = this.speedNorm >= BOARD.slideMinSpeed && this.onGround && !grinding;
    const wantSlide = slideHeld && canSlide && Math.abs(steer) > 0.15;
    if (wantSlide) {
      if (!this.sliding) this.sliding = true;
      this.slideCharge = Math.min(1, this.slideCharge + dt / BOARD.slideChargeFull);
    } else if (this.sliding) {
      // Release → mini-turbo
      this.endPowerslide();
    }

    // ——— Speed ———
    if (grinding) {
      // rails keep speed up
      this.speed = Math.min(BOARD.maxSpeed * BOARD.grindSpeedMul, this.speed + 1.5 * dt);
    } else if (accel > 0.1) {
      this.speed += BOARD.accel * accel * dt;
    } else if (accel < -0.1) {
      this.speed -= BOARD.brake * -accel * dt;
    } else {
      this.speed -= BOARD.drag * dt * (this.sliding ? 0.5 : 1);
    }
    this.speed = Math.max(0, Math.min(BOARD.maxSpeed * (grinding ? BOARD.grindSpeedMul : 1), this.speed));
    this.speedNorm = this.speed / BOARD.maxSpeed;

    // ——— Bank & yaw (facing) ———
    const bankTarget = THREE.MathUtils.clamp(steer, -1, 1) * BOARD.bankMax * (this.sliding ? 1.15 : 1);
    const bankSpeed = BOARD.bankLerp * (1.2 - this.speedNorm * 0.5);
    this.bank = THREE.MathUtils.damp(this.bank, bankTarget, bankSpeed, dt);

    const turnBase = THREE.MathUtils.lerp(BOARD.turnRateSlow, BOARD.turnRateFast, this.speedNorm);
    const turnMul = this.sliding ? BOARD.slideTurnMul : 1;
    this.yaw += -this.bank * turnBase * turnMul * 1.75 * dt;

    // ——— Velocity heading vs facing (the core of powerslide) ———
    const align = this.sliding ? BOARD.slideGripAlign : BOARD.gripAlign;
    this.velYaw = dampAngle(this.velYaw, this.yaw, align, dt);

    // While sliding, bleed velocity heading slower + add lateral
    const velFwd = new THREE.Vector3(Math.sin(this.velYaw), 0, Math.cos(this.velYaw));
    const faceFwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const faceRight = new THREE.Vector3(faceFwd.z, 0, -faceFwd.x);

    let move = velFwd.multiplyScalar(this.speed * dt);
    if (this.sliding) {
      move.addScaledVector(faceRight, -Math.sign(this.bank || steer || 0.001) * this.speed * BOARD.slideLateral * dt);
    }

    // Jump
    if (this.jumpBuffer > 0 && this.onGround) {
      this.jumpBuffer = 0;
      const rampBoost = onRamp && this.speedNorm > 0.4;
      this.vy = rampBoost ? BOARD.rampBoostJump : BOARD.jumpVel;
      this.onGround = false;
      this.surface = 'air';
      this.sliding = false;
      if (rampBoost) {
        this.speed = Math.min(BOARD.maxSpeed, this.speed + 4);
      }
    }

    // Vertical
    if (!this.onGround || this.surface === 'air') {
      this.vy -= BOARD.gravity * dt;
      this.position.y += this.vy * dt;
      if (this.position.y <= roadY && this.vy <= 0 && !onRamp) {
        this.position.y = roadY;
        this.vy = 0;
        this.onGround = true;
        this.surface = 'road';
      }
    } else if (!onRamp && !grinding) {
      this.position.y = THREE.MathUtils.damp(this.position.y, roadY, 8, dt);
      this.vy = 0;
    }

    this.position.x += move.x;
    this.position.z += move.z;

    // Soft path magnet when far (not a hard wall)
    const lateral = new THREE.Vector3(this.position.x - near.point.x, 0, this.position.z - near.point.z);
    let latLen = lateral.length();
    if (latLen > 12 && this.onGround && !grinding) {
      const pull = Math.min(1, (latLen - 12) / 16);
      this.position.x = THREE.MathUtils.damp(this.position.x, near.point.x, 0.7 * pull, dt);
      this.position.z = THREE.MathUtils.damp(this.position.z, near.point.z, 0.7 * pull, dt);
    }

    // Hard bumps (roadside buildings only) — slide along, keep path progress
    this.resolveBumps(bumps, near.yaw, dt);

    // Anti-stuck: speed high but almost no displacement → shove along the road
    const moved = this.position.distanceTo(this.prevPos);
    if (this.speed > 5 && moved < this.speed * dt * 0.12 && this.onGround) {
      this.stuckT += dt;
      if (this.stuckT > 0.2) {
        const pathFwd = new THREE.Vector3(Math.sin(near.yaw), 0, Math.cos(near.yaw));
        this.position.addScaledVector(pathFwd, BOARD.stuckNudge * dt * this.speed);
        this.velYaw = near.yaw;
        this.yaw = dampAngle(this.yaw, near.yaw, 4, dt);
        this.speed = Math.max(this.speed, 6);
        this.stuckT = 0;
      }
    } else {
      this.stuckT = Math.max(0, this.stuckT - dt * 2);
    }
    this.prevPos.copy(this.position);

    // Recompute lateral after bumps
    latLen = Math.hypot(this.position.x - near.point.x, this.position.z - near.point.z);

    // Void rescue while mounted
    if (this.position.y < -8 || latLen > BOARD.offPathLimit) {
      this.position.copy(near.point);
      this.position.y = near.point.y + BOARD.hoverHeight;
      this.yaw = near.yaw;
      this.velYaw = near.yaw;
      this.speed = Math.max(this.speed * 0.5, 4);
      this.vy = 0;
      this.onGround = true;
      this.stuckT = 0;
    }

    // Visuals
    const bob =
      Math.sin(this.bobT * BOARD.bobHz * Math.PI * 2) *
      BOARD.bobAmp *
      (this.onGround ? 0.35 + this.speedNorm * 0.25 : 0);
    this.mesh.position.set(this.position.x, this.position.y + bob, this.position.z);
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = this.yaw;
    // Bank shows slide more aggressively
    const slideKick = this.sliding ? -Math.sign(steer || this.bank || 1) * 0.2 : 0;
    this.mesh.rotation.z = this.bank + slideKick;
    this.mesh.rotation.x =
      -this.speedNorm * 0.08 +
      (accel > 0 ? -0.05 : accel < 0 ? 0.06 : 0) +
      rampPitch +
      (this.onGround ? 0 : -0.12);
  }

  private endPowerslide() {
    if (!this.sliding) return;
    const charge = this.slideCharge;
    this.sliding = false;
    this.slideCharge = 0;
    // Snap momentum toward face + boost
    this.velYaw = this.yaw;
    const boost = THREE.MathUtils.lerp(BOARD.slideBoostMin, BOARD.slideBoostMax, charge);
    this.speed = Math.min(BOARD.maxSpeed, this.speed + boost);
  }

  /**
   * Circle vs building centers. Push out of penetration, then project velocity
   * so only the into-wall component is removed — path-forward progress remains.
   */
  private resolveBumps(bumps: THREE.Vector3[], pathYaw: number, _dt: number) {
    const r = BOARD.bumpRadius + 1.35;
    let vx = Math.sin(this.velYaw) * this.speed;
    let vz = Math.cos(this.velYaw) * this.speed;
    const pathFwdX = Math.sin(pathYaw);
    const pathFwdZ = Math.cos(pathYaw);

    for (const b of bumps) {
      const dx = this.position.x - b.x;
      const dz = this.position.z - b.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= r || dist < 1e-5) continue;

      const nx = dx / dist;
      const nz = dz / dist;
      // Separate
      const pen = r - dist;
      this.position.x += nx * pen;
      this.position.z += nz * pen;

      // Remove velocity into the obstacle (N points from obstacle → player)
      const into = vx * nx + vz * nz; // negative if moving into obstacle
      if (into < 0) {
        vx -= into * nx;
        vz -= into * nz;
      }
      // Nudge along path so a wall corner never fully stops you
      const along = Math.max(0, this.speed * 0.35);
      vx += pathFwdX * along * 0.15;
      vz += pathFwdZ * along * 0.15;
    }

    const sp = Math.hypot(vx, vz);
    if (sp > 0.05) {
      this.velYaw = Math.atan2(vx, vz);
      this.speed = Math.min(BOARD.maxSpeed, Math.max(sp * BOARD.bumpKeepForward, this.speed * 0.85));
    }
  }

  isPowersliding() {
    return this.sliding;
  }

  isGrinding() {
    return this.surface === 'rail';
  }
}

/** Follow-board for Elias (visual + simple chase). */
export class FollowerBoard {
  mesh: THREE.Group;
  position = new THREE.Vector3();
  yaw = 0;

  constructor(mats: Mats) {
    this.mesh = buildBoardMesh(mats);
    // Tint rails green for Elias
    this.mesh.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (m?.emissive) {
          // leave keel; scale deck slightly
        }
      }
    });
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0x44ff88,
        emissive: 0x22aa44,
        emissiveIntensity: 0.8,
      }),
    );
    marker.position.set(0, 0.85, 0);
    this.mesh.add(marker);
  }

  /** Trail behind leader */
  follow(leader: Surfboard, dt: number) {
    const back = new THREE.Vector3(-Math.sin(leader.yaw), 0, -Math.cos(leader.yaw));
    const target = leader.position.clone().addScaledVector(back, 4.5);
    target.y = leader.position.y;
    this.position.lerp(target, 1 - Math.exp(-5 * dt));
    this.yaw = dampAngle(this.yaw, leader.yaw, 6, dt);
    this.mesh.position.copy(this.position);
    this.mesh.position.y += Math.sin(performance.now() * 0.004) * 0.08;
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = this.yaw;
    this.mesh.rotation.z = leader.bank * 0.7;
  }
}

function closestPointOnSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  const ab = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
  return a.clone().addScaledVector(ab, t);
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

export function buildBoardMesh(mats: Mats): THREE.Group {
  const g = new THREE.Group();
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0xe8d4a8,
    metalness: 0.35,
    roughness: 0.45,
  });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 2.8), deckMat);
  deck.castShadow = true;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.7), deckMat);
  nose.position.set(0, 0.02, 1.5);
  nose.scale.set(0.7, 1, 1);
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x2a8fbf,
    metalness: 0.5,
    roughness: 0.4,
    emissive: 0x0a3a55,
    emissiveIntensity: 0.35,
  });
  const railL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 2.6), railMat);
  const railR = railL.clone();
  railL.position.set(-0.42, 0.02, 0);
  railR.position.set(0.42, 0.02, 0);
  const keel = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.08, 2.2),
    new THREE.MeshStandardMaterial({
      color: 0x66e0ff,
      emissive: 0x22aaff,
      emissiveIntensity: 0.9,
      metalness: 0.3,
      roughness: 0.3,
    }),
  );
  keel.position.y = -0.1;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.5), mats.brass);
  fin.position.set(0, -0.28, -0.9);
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.04, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x3a3040, roughness: 0.9 }),
  );
  pad.position.set(0, 0.1, -0.2);
  g.add(deck, nose, railL, railR, keel, fin, pad);
  return g;
}
