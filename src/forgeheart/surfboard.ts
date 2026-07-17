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
  maxSpeed: 24,
  accel: 18,
  brake: 18,
  drag: 1.2,
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
  /** Soft circle bumps — glance off, never drain speed when free */
  bumpRadius: 1.25,
  /** Grind */
  grindCatchDist: 1.35,
  grindCatchHeight: 1.8,
  /** Min alignment (dot) between velocity and rail to mount */
  grindAlign: 0.45,
  grindMinSpeed: 4,
  /** |balance| over this → fall off slow */
  grindTipLimit: 0.9,
  grindBalanceSteer: 2.4,
  grindWobble: 0.85,
  grindFallSpeedMul: 0.45,
  grindEndSpeedMul: 1.0,
  stuckNudge: 8,
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
  /** -1..1 lean while grinding — tip too far to fall */
  grindBalance = 0;
  /** 0..1 along current rail segment */
  grindT = 0;
  /** +1 or -1 travel sense on rail */
  grindSense = 1;

  private bobT = 0;
  private jumpBuffer = 0;
  private grindRail: { a: THREE.Vector3; b: THREE.Vector3 } | null = null;
  private prevPos = new THREE.Vector3();
  private stuckT = 0;
  private wasAirborne = false;
  private sparks: GrindSpark[] = [];
  private sparkGroup = new THREE.Group();

  constructor(mats: Mats, pos: THREE.Vector3, yaw: number) {
    this.position = pos.clone();
    this.prevPos.copy(pos);
    this.yaw = yaw;
    this.velYaw = yaw;
    this.mesh = buildBoardMesh(mats);
    this.mesh.add(this.sparkGroup);
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
    this.exitGrind(false);
  }

  dismount(): THREE.Vector3 {
    this.mounted = false;
    this.speed = 0;
    this.bank = 0;
    this.sliding = false;
    this.slideCharge = 0;
    this.speedNorm = 0;
    this.vy = 0;
    this.exitGrind(false);
    const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return this.position.clone().addScaledVector(side, 1.4).add(new THREE.Vector3(0, 0.5, 0));
  }

  isGrinding() {
    return this.grindRail != null;
  }

  getGrindBalance() {
    return this.grindBalance;
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

    // Jump buffer (checked in grind + normal)
    const wantJump = this.jumpBuffer > 0;

    // ——— Grind: enter / update / exit ———
    let grinding = this.grindRail != null;
    if (grinding && this.grindRail) {
      // Jump off rail — keep most speed
      if (wantJump) {
        this.jumpBuffer = 0;
        this.exitGrind(false);
        this.vy = BOARD.jumpVel * 0.95;
        this.onGround = false;
        this.surface = 'air';
        grinding = false;
      } else {
        const result = this.tickGrind(dt, steer);
        grinding = result.still;
        if (!result.still) {
          // fell or end of rail
        }
      }
    } else {
      // Try to enter grind when landing or skimming a rail
      this.tryEnterGrind(rails, wantJump);
      grinding = this.grindRail != null;
    }

    // ——— Powerslide enter/exit (hold Shift) ———
    const canSlide = this.speedNorm >= BOARD.slideMinSpeed && this.onGround && !grinding;
    const wantSlide = slideHeld && canSlide && Math.abs(steer) > 0.15;
    if (wantSlide) {
      if (!this.sliding) this.sliding = true;
      this.slideCharge = Math.min(1, this.slideCharge + dt / BOARD.slideChargeFull);
    } else if (this.sliding) {
      this.endPowerslide();
    }

    // ——— Speed (road) ———
    if (!grinding) {
      if (accel > 0.1) {
        this.speed += BOARD.accel * accel * dt;
      } else if (accel < -0.1) {
        this.speed -= BOARD.brake * -accel * dt;
      } else {
        this.speed -= BOARD.drag * dt * (this.sliding ? 0.5 : 1);
      }
      this.speed = Math.max(0, Math.min(BOARD.maxSpeed, this.speed));
    }
    this.speedNorm = this.speed / BOARD.maxSpeed;

    // ——— Bank & yaw (facing) — skipped while rail-locked except balance visual ———
    if (!grinding) {
      const bankTarget = THREE.MathUtils.clamp(steer, -1, 1) * BOARD.bankMax * (this.sliding ? 1.15 : 1);
      const bankSpeed = BOARD.bankLerp * (1.2 - this.speedNorm * 0.5);
      this.bank = THREE.MathUtils.damp(this.bank, bankTarget, bankSpeed, dt);

      const turnBase = THREE.MathUtils.lerp(BOARD.turnRateSlow, BOARD.turnRateFast, this.speedNorm);
      const turnMul = this.sliding ? BOARD.slideTurnMul : 1;
      this.yaw += -this.bank * turnBase * turnMul * 1.75 * dt;

      const align = this.sliding ? BOARD.slideGripAlign : BOARD.gripAlign;
      this.velYaw = dampAngle(this.velYaw, this.yaw, align, dt);
    }

    const velFwd = new THREE.Vector3(Math.sin(this.velYaw), 0, Math.cos(this.velYaw));
    const faceFwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const faceRight = new THREE.Vector3(faceFwd.z, 0, -faceFwd.x);

    let move = new THREE.Vector3();
    if (!grinding) {
      move = velFwd.multiplyScalar(this.speed * dt);
      if (this.sliding) {
        move.addScaledVector(
          faceRight,
          -Math.sign(this.bank || steer || 0.001) * this.speed * BOARD.slideLateral * dt,
        );
      }
    }

    // Jump (road / ramp — not already handled by grind exit)
    if (wantJump && this.onGround && !grinding) {
      this.jumpBuffer = 0;
      const rampBoost = onRamp && this.speedNorm > 0.4;
      this.vy = rampBoost ? BOARD.rampBoostJump : BOARD.jumpVel;
      this.onGround = false;
      this.surface = 'air';
      this.sliding = false;
      if (rampBoost) {
        this.speed = Math.min(BOARD.maxSpeed, this.speed + 4);
      }
    } else if (wantJump && grinding) {
      this.jumpBuffer = 0;
    }

    // Vertical
    if (!grinding) {
      if (!this.onGround || this.surface === 'air') {
        this.vy -= BOARD.gravity * dt;
        this.position.y += this.vy * dt;
        if (this.position.y <= roadY && this.vy <= 0 && !onRamp) {
          this.position.y = roadY;
          this.vy = 0;
          this.onGround = true;
          this.surface = 'road';
        }
      } else if (!onRamp) {
        this.position.y = THREE.MathUtils.damp(this.position.y, roadY, 8, dt);
        this.vy = 0;
      }
      this.position.x += move.x;
      this.position.z += move.z;
    }

    this.updateSparks(dt, grinding);

    // Soft path magnet / bumps / anti-stuck only off-rail
    if (!grinding) {
      const lateral = new THREE.Vector3(this.position.x - near.point.x, 0, this.position.z - near.point.z);
      let latLen = lateral.length();
      if (latLen > 12 && this.onGround) {
        const pull = Math.min(1, (latLen - 12) / 16);
        this.position.x = THREE.MathUtils.damp(this.position.x, near.point.x, 0.7 * pull, dt);
        this.position.z = THREE.MathUtils.damp(this.position.z, near.point.z, 0.7 * pull, dt);
      }

      this.resolveBumps(bumps, near.yaw, dt);

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

      latLen = Math.hypot(this.position.x - near.point.x, this.position.z - near.point.z);
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
    }
    this.prevPos.copy(this.position);
    this.wasAirborne = !this.onGround && !grinding;

    // Visuals
    const bob =
      Math.sin(this.bobT * BOARD.bobHz * Math.PI * 2) *
      BOARD.bobAmp *
      (grinding ? 0.08 : this.onGround ? 0.35 + this.speedNorm * 0.25 : 0);
    this.mesh.position.set(this.position.x, this.position.y + bob, this.position.z);
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = this.yaw;
    if (grinding) {
      this.bank = this.grindBalance * BOARD.bankMax;
      this.mesh.rotation.z = this.bank;
      this.mesh.rotation.x = -0.04;
    } else {
      const slideKick = this.sliding ? -Math.sign(steer || this.bank || 1) * 0.2 : 0;
      this.mesh.rotation.z = this.bank + slideKick;
      this.mesh.rotation.x =
        -this.speedNorm * 0.08 +
        (accel > 0 ? -0.05 : accel < 0 ? 0.06 : 0) +
        rampPitch +
        (this.onGround ? 0 : -0.12);
    }
  }

  /**
   * Mount a rail when near it, aligned with travel, landing or skimming.
   */
  private tryEnterGrind(rails: { a: THREE.Vector3; b: THREE.Vector3 }[], _wantJump: boolean) {
    if (this.speed < BOARD.grindMinSpeed) return;
    const vel = new THREE.Vector3(Math.sin(this.velYaw), 0, Math.cos(this.velYaw));
    // Prefer landing from air, but also allow skimming while grounded if very close
    const canCatch = this.wasAirborne || this.vy < -0.5 || this.onGround;

    for (const rail of rails) {
      const closest = closestPointOnSegment(this.position, rail.a, rail.b);
      const d = Math.hypot(this.position.x - closest.x, this.position.z - closest.z);
      const dy = this.position.y - closest.y;
      if (d > BOARD.grindCatchDist) continue;
      if (dy > BOARD.grindCatchHeight || dy < -1.2) continue;

      const railDir = rail.b.clone().sub(rail.a);
      const railLen = railDir.length();
      if (railLen < 0.5) continue;
      railDir.multiplyScalar(1 / railLen);

      let sense = 1;
      let align = vel.dot(railDir);
      if (align < 0) {
        sense = -1;
        align = -align;
      }
      if (align < BOARD.grindAlign && !this.wasAirborne) continue;
      // Landing is more forgiving
      if (align < BOARD.grindAlign * 0.65 && this.wasAirborne) continue;
      if (!canCatch) continue;

      // Parametric t on rail
      const toA = this.position.clone().sub(rail.a);
      let t = toA.dot(railDir) / railLen;
      if (sense < 0) t = 1 - t;
      t = THREE.MathUtils.clamp(t, 0.02, 0.98);

      this.grindRail = rail;
      this.grindSense = sense;
      this.grindT = t;
      this.grindBalance = 0;
      this.sliding = false;
      this.surface = 'rail';
      this.onGround = true;
      this.vy = 0;
      this.speed = Math.max(this.speed, BOARD.grindMinSpeed + 2);
      // Snap onto rail
      const along = sense > 0 ? t : 1 - t;
      this.position.copy(rail.a).addScaledVector(railDir, along * railLen);
      this.position.y = closest.y + 0.42;
      const faceDir = railDir.clone().multiplyScalar(sense);
      this.yaw = Math.atan2(faceDir.x, faceDir.z);
      this.velYaw = this.yaw;
      return;
    }
  }

  /**
   * Locked rail movement + balance. Returns whether still grinding.
   */
  private tickGrind(dt: number, steer: number): { still: boolean } {
    const rail = this.grindRail;
    if (!rail) return { still: false };

    const railDir = rail.b.clone().sub(rail.a);
    const railLen = railDir.length();
    if (railLen < 0.4) {
      this.exitGrind(true);
      return { still: false };
    }
    railDir.multiplyScalar(1 / railLen);
    const travel = railDir.clone().multiplyScalar(this.grindSense);

    // Hold speed on rail (slight gain)
    this.speed = Math.min(BOARD.maxSpeed * 1.05, Math.max(this.speed, 6) + 1.2 * dt);
    this.speedNorm = this.speed / BOARD.maxSpeed;

    // Advance along rail
    const dtAlong = (this.speed * dt) / railLen;
    this.grindT += dtAlong;
    if (this.grindT >= 1 || this.grindT <= 0) {
      // End of rail — launch off at full speed
      this.position.copy(this.grindT >= 1 ? rail.b : rail.a);
      this.position.y += 0.35;
      this.yaw = Math.atan2(travel.x, travel.z);
      this.velYaw = this.yaw;
      this.speed = Math.min(BOARD.maxSpeed, this.speed * BOARD.grindEndSpeedMul + 2);
      this.exitGrind(false);
      return { still: false };
    }

    // Lock transform to rail
    const along = this.grindSense > 0 ? this.grindT : 1 - this.grindT;
    this.position.copy(rail.a).addScaledVector(railDir, along * railLen);
    this.position.y = THREE.MathUtils.lerp(rail.a.y, rail.b.y, along) + 0.42;
    this.yaw = Math.atan2(travel.x, travel.z);
    this.velYaw = this.yaw;
    this.onGround = true;
    this.vy = 0;
    this.surface = 'rail';

    // Balance: wobble fights you; A/D counters
    const wobble =
      Math.sin(this.bobT * 4.2) * 0.55 +
      Math.sin(this.bobT * 9.7) * 0.3 +
      Math.sin(this.bobT * 2.1) * 0.2;
    this.grindBalance += wobble * BOARD.grindWobble * dt * (0.7 + this.speedNorm);
    this.grindBalance += steer * BOARD.grindBalanceSteer * dt;
    this.grindBalance = THREE.MathUtils.clamp(this.grindBalance, -1.15, 1.15);

    if (Math.abs(this.grindBalance) >= BOARD.grindTipLimit) {
      // Fall off — slower recovery
      const side = new THREE.Vector3(travel.z, 0, -travel.x);
      this.position.addScaledVector(side, Math.sign(this.grindBalance) * 1.4);
      this.speed *= BOARD.grindFallSpeedMul;
      this.velYaw = this.yaw + Math.sign(this.grindBalance) * 0.4;
      this.exitGrind(false);
      return { still: false };
    }

    return { still: true };
  }

  private exitGrind(_fullStop: boolean) {
    this.grindRail = null;
    this.grindBalance = 0;
    this.grindT = 0;
    if (this.surface === 'rail') this.surface = 'road';
  }

  private updateSparks(dt: number, grinding: boolean) {
    // Age existing
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.vel.y -= 18 * dt;
      s.mesh.scale.multiplyScalar(0.92);
      if (s.life <= 0) {
        this.sparkGroup.remove(s.mesh);
        s.mesh.geometry.dispose();
        (s.mesh.material as THREE.Material).dispose();
        this.sparks.splice(i, 1);
      }
    }
    if (!grinding) return;

    // Emit yellow sparks under the board
    const n = 3 + Math.floor(this.speedNorm * 4);
    for (let i = 0; i < n; i++) {
      if (this.sparks.length > 48) break;
      const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
      const mat = new THREE.MeshBasicMaterial({
        color: Math.random() > 0.35 ? 0xffee44 : 0xffaa22,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 0.5,
        -0.15,
        -0.6 + (Math.random() - 0.5) * 0.4,
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        1 + Math.random() * 5,
        -2 - Math.random() * 4,
      );
      this.sparkGroup.add(mesh);
      this.sparks.push({ mesh, vel, life: 0.15 + Math.random() * 0.25 });
    }
  }

  private endPowerslide() {
    if (!this.sliding) return;
    const charge = this.slideCharge;
    this.sliding = false;
    this.slideCharge = 0;
    this.velYaw = this.yaw;
    const boost = THREE.MathUtils.lerp(BOARD.slideBoostMin, BOARD.slideBoostMax, charge);
    this.speed = Math.min(BOARD.maxSpeed, this.speed + boost);
  }

  /**
   * Soft circle bumps. Only runs when actually overlapping something.
   * Important: do NOT rewrite speed when free of obstacles (that was draining
   * speed every frame and felt like mud).
   */
  private resolveBumps(bumps: THREE.Vector3[], pathYaw: number, _dt: number) {
    const r = BOARD.bumpRadius + 1.5;
    let vx = Math.sin(this.velYaw) * this.speed;
    let vz = Math.cos(this.velYaw) * this.speed;
    const pathFwdX = Math.sin(pathYaw);
    const pathFwdZ = Math.cos(pathYaw);
    let hit = false;

    for (const b of bumps) {
      const dx = this.position.x - b.x;
      const dz = this.position.z - b.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= r || dist < 1e-5) continue;
      hit = true;

      const nx = dx / dist;
      const nz = dz / dist;
      // Separate out of overlap
      const pen = r - dist;
      this.position.x += nx * (pen + 0.02);
      this.position.z += nz * (pen + 0.02);

      // Strip only the into-wall component of velocity (N = obstacle → player)
      const into = vx * nx + vz * nz;
      if (into < 0) {
        vx -= into * nx;
        vz -= into * nz;
      }
      // Keep progress: add a little along the road so corners never pin you
      vx += pathFwdX * this.speed * 0.08;
      vz += pathFwdZ * this.speed * 0.08;
    }

    if (!hit) return; // free road — leave speed/heading alone

    const sp = Math.hypot(vx, vz);
    if (sp > 0.05) {
      this.velYaw = Math.atan2(vx, vz);
      // Preserve almost all speed on a glance
      this.speed = Math.min(BOARD.maxSpeed, Math.max(this.speed * 0.92, sp));
    }
  }

  isPowersliding() {
    return this.sliding;
  }
}

interface GrindSpark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
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
