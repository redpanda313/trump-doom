/**
 * Plasma sky-surfboard — mountable vehicle with lean, boost powerslide, FOV rush.
 */

import * as THREE from 'three';
import type { Mats } from './materials';
import { nearestOnPath } from './raceway';

export const BOARD = {
  maxSpeed: 22,
  accel: 14,
  brake: 18,
  drag: 1.8,
  /** Yaw rate rad/s at low speed full bank */
  turnRateSlow: 2.4,
  /** Yaw rate at max speed */
  turnRateFast: 0.75,
  bankMax: 0.55,
  bankLerp: 6,
  powerslideWindow: 0.32,
  powerslideDuration: 0.55,
  powerslideBoost: 8,
  powerslideYawExtra: 1.8,
  hoverHeight: 0.55,
  bobAmp: 0.12,
  bobHz: 1.4,
  fovBase: 70,
  fovFast: 108, // +38° "lens" rush
  camTipAccel: -0.12, // pitch down when accel (radians offset)
  camTipBrake: 0.14,
  offPathLimit: 28,
} as const;

export class Surfboard {
  mesh: THREE.Group;
  position: THREE.Vector3;
  yaw = 0;
  /** Lean / bank angle (visual + turn) */
  bank = 0;
  speed = 0;
  mounted = false;
  /** 0 idle hum … 1 full jet */
  speedNorm = 0;

  private bobT = 0;
  private powerslideT = 0;
  private powerslideDir = 0; // -1 left +1 right
  private lastLeftT = -9;
  private lastRightT = -9;
  private now = 0;
  private releaseBoost = 0;
  private releaseBoostDir = 0;

  constructor(mats: Mats, pos: THREE.Vector3, yaw: number) {
    this.position = pos.clone();
    this.yaw = yaw;
    this.mesh = buildBoardMesh(mats);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = yaw;
  }

  get interactPos() {
    return this.position;
  }

  /** Idle float + hum phase when not mounted */
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
    this.speed = 2;
    this.bank = 0;
  }

  dismount(): THREE.Vector3 {
    this.mounted = false;
    this.speed = 0;
    this.bank = 0;
    this.powerslideT = 0;
    this.speedNorm = 0;
    // Off board to the side
    const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return this.position.clone().addScaledVector(side, 1.4).add(new THREE.Vector3(0, 0.5, 0));
  }

  /**
   * @param accel -1..1 (S/down brake, W/up accel)
   * @param steer -1..1 held left/right
   * @param path race path for soft snap
   */
  tick(
    dt: number,
    accel: number,
    steer: number,
    path: THREE.Vector3[],
    pathDist: number[],
  ) {
    this.now += dt;
    this.bobT += dt;

    // Powerslide timer
    if (this.powerslideT > 0) {
      this.powerslideT = Math.max(0, this.powerslideT - dt);
    }
    if (this.releaseBoost > 0) {
      this.releaseBoost = Math.max(0, this.releaseBoost - dt);
    }

    // Speed
    if (accel > 0.1) {
      this.speed += BOARD.accel * accel * dt;
    } else if (accel < -0.1) {
      this.speed -= BOARD.brake * -accel * dt;
    } else {
      this.speed -= BOARD.drag * dt;
    }
    if (this.releaseBoost > 0) {
      this.speed += BOARD.powerslideBoost * dt;
    }
    this.speed = Math.max(0, Math.min(BOARD.maxSpeed, this.speed));
    this.speedNorm = this.speed / BOARD.maxSpeed;

    // Bank: sharp at low speed, gentle at high
    const bankTarget = THREE.MathUtils.clamp(steer, -1, 1) * BOARD.bankMax;
    const bankSpeed = BOARD.bankLerp * (1.15 - this.speedNorm * 0.55);
    this.bank = THREE.MathUtils.damp(this.bank, bankTarget, bankSpeed, dt);

    // Turn rate vs speed
    const turnRate = THREE.MathUtils.lerp(BOARD.turnRateSlow, BOARD.turnRateFast, this.speedNorm);
    let yawRate = -this.bank * turnRate * 1.8;

    if (this.powerslideT > 0) {
      // Camera/board yaws harder; motion stays mostly forward (applied below)
      yawRate += -this.powerslideDir * BOARD.powerslideYawExtra * (0.5 + this.speedNorm * 0.5);
    }
    if (this.releaseBoost > 0) {
      yawRate += -this.releaseBoostDir * 2.6 * (this.releaseBoost / 0.35);
    }

    this.yaw += yawRate * dt;

    // Movement — mostly forward; powerslide adds slight lateral drift
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const move = forward.clone().multiplyScalar(this.speed * dt);
    if (this.powerslideT > 0) {
      move.addScaledVector(right, -this.powerslideDir * this.speed * 0.25 * dt);
      // Keep more of pre-slide forward: blend yaw already turned board
    }
    this.position.add(move);

    // Soft height follow path + bob
    const near = nearestOnPath(path, pathDist, this.position);
    const targetY = near.point.y + BOARD.hoverHeight;
    this.position.y = THREE.MathUtils.damp(this.position.y, targetY, 4, dt);
    // Pull gently toward road if far off
    const lateral = new THREE.Vector3(this.position.x - near.point.x, 0, this.position.z - near.point.z);
    const latLen = lateral.length();
    if (latLen > 6) {
      const pull = Math.min(1, (latLen - 6) / 12);
      this.position.x = THREE.MathUtils.damp(this.position.x, near.point.x, 1.2 * pull, dt);
      this.position.z = THREE.MathUtils.damp(this.position.z, near.point.z, 1.2 * pull, dt);
    }
    // Respawn snap if way off
    if (latLen > BOARD.offPathLimit || this.position.y < -5) {
      this.position.copy(near.point);
      this.position.y += BOARD.hoverHeight;
      this.yaw = near.yaw;
      this.speed *= 0.4;
    }

    const bob = Math.sin(this.bobT * BOARD.bobHz * Math.PI * 2) * BOARD.bobAmp * (0.4 + this.speedNorm * 0.3);
    this.mesh.position.set(this.position.x, this.position.y + bob, this.position.z);
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = this.yaw;
    this.mesh.rotation.z = this.bank;
    this.mesh.rotation.x = -this.speedNorm * 0.08 + (accel > 0 ? -0.05 : accel < 0 ? 0.06 : 0);
  }

  /** Double-tap left/right → powerslide; call on keydown */
  onSteerTap(dir: -1 | 1) {
    const t = this.now;
    if (dir < 0) {
      if (t - this.lastLeftT < BOARD.powerslideWindow) {
        this.powerslideT = BOARD.powerslideDuration;
        this.powerslideDir = -1;
      }
      this.lastLeftT = t;
    } else {
      if (t - this.lastRightT < BOARD.powerslideWindow) {
        this.powerslideT = BOARD.powerslideDuration;
        this.powerslideDir = 1;
      }
      this.lastRightT = t;
    }
  }

  /** Release left/right after powerslide → boost curve */
  onSteerRelease(dir: -1 | 1) {
    if (this.powerslideT > 0 && this.powerslideDir === dir) {
      this.releaseBoost = 0.35;
      this.releaseBoostDir = dir;
      this.powerslideT = 0;
      this.speed = Math.min(BOARD.maxSpeed, this.speed + 4);
    }
  }

  isPowersliding() {
    return this.powerslideT > 0;
  }
}

function buildBoardMesh(mats: Mats): THREE.Group {
  const g = new THREE.Group();
  // Deck — long surfboard silhouette
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0xe8d4a8,
    metalness: 0.35,
    roughness: 0.45,
  });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 2.8), deckMat);
  deck.castShadow = true;
  // Nose taper via scaled tip
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.7), deckMat);
  nose.position.set(0, 0.02, 1.5);
  nose.scale.set(0.7, 1, 1);
  // Rails
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
  // Plasma keel glow
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
  // Fin
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.5), mats.brass);
  fin.position.set(0, -0.28, -0.9);
  // Soft pad
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.04, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x3a3040, roughness: 0.9 }),
  );
  pad.position.set(0, 0.1, -0.2);

  g.add(deck, nose, railL, railR, keel, fin, pad);
  return g;
}
