/**
 * Elias in the sky race: ally robot on foot, rides his own surfboard when you do.
 */

import * as THREE from 'three';
import type { Mats } from './materials';
import { RobotUnit } from './robot';
import { Surfboard, buildBoardMesh, BOARD } from './surfboard';
import { nearestOnPath } from './raceway';

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

export class EliasCompanion {
  robot: RobotUnit;
  boardMesh: THREE.Group;
  boardPos = new THREE.Vector3();
  boardYaw = 0;
  private surfing = false;
  private bobT = Math.random() * 10;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, mats: Mats, spawn: THREE.Vector3) {
    this.scene = scene;
    this.robot = new RobotUnit(mats, spawn.clone());
    this.robot.isBrother = true;
    this.robot.displayName = 'Elias';
    this.robot.setPhase('ally');
    this.robot.hp = 60;
    this.robot.maxHp = 60;
    this.robot.mesh.visible = true;
    this.scene.add(this.robot.mesh);

    this.boardMesh = buildBoardMesh(mats);
    // Distinct green plasma keel for Elias's board
    this.boardMesh.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m?.emissive && m.emissiveIntensity > 0.5) {
        m.color?.setHex?.(0x66ffaa);
        m.emissive?.setHex?.(0x22ff88);
      }
    });
    this.boardMesh.visible = false;
    this.boardPos.copy(spawn);
    this.boardMesh.position.copy(spawn);
    this.scene.add(this.boardMesh);

    // Start on foot next to the player (not stuck on a board)
    this.surfing = false;
    this.placeOnFootAt(spawn);
  }

  /** Force Elias on foot at a world position (path-snapped by caller if needed). */
  placeOnFootAt(worldPos: THREE.Vector3) {
    this.ensureRobotOnFoot(true);
    this.robot.mesh.position.copy(worldPos);
    this.robot.mesh.position.y = worldPos.y;
    this.robot.mesh.visible = true;
    this.robot.mesh.scale.setScalar(1);
    this.robot.mesh.rotation.set(0, 0, 0);
    this.boardPos.copy(worldPos);
  }

  /**
   * @param playerMounted player is on their surfboard
   * @param leader player board when mounted
   * @param playerPos camera/player feet position when on foot
   */
  update(
    dt: number,
    playerMounted: boolean,
    leader: Surfboard | null,
    playerPos: THREE.Vector3,
    path: THREE.Vector3[],
    pathDist: number[],
  ) {
    this.bobT += dt;

    if (playerMounted && leader) {
      this.updateSurfing(dt, leader);
    } else {
      this.updateWalking(dt, playerPos, path, pathDist);
    }
  }

  private ensureRobotOnBoard() {
    if (this.surfing && this.robot.mesh.parent === this.boardMesh) return;
    this.surfing = true;
    this.boardMesh.visible = true;
    this.robot.mesh.visible = true;
    // Detach robot from scene world and seat on board
    if (this.robot.mesh.parent) this.robot.mesh.parent.remove(this.robot.mesh);
    this.boardMesh.add(this.robot.mesh);
    // Stand on deck (board local space)
    this.robot.mesh.position.set(0, 0.12, -0.12);
    this.robot.mesh.rotation.set(0, 0, 0);
    this.robot.mesh.scale.setScalar(0.92);
    this.robot.setPhase('ally');
  }

  private ensureRobotOnFoot(force = false) {
    if (!force && !this.surfing && this.robot.mesh.parent === this.scene) {
      this.robot.mesh.visible = true;
      this.boardMesh.visible = false;
      return;
    }
    // Capture world pos if currently parented to board
    const world = new THREE.Vector3();
    if (this.robot.mesh.parent && this.robot.mesh.parent !== this.scene) {
      this.robot.mesh.getWorldPosition(world);
    } else {
      world.copy(this.robot.mesh.position);
    }
    this.surfing = false;
    this.boardMesh.visible = false;
    if (this.robot.mesh.parent) this.robot.mesh.parent.remove(this.robot.mesh);
    this.robot.mesh.position.copy(world);
    this.robot.mesh.rotation.set(0, this.boardYaw, 0);
    this.robot.mesh.scale.setScalar(1);
    this.robot.mesh.visible = true;
    this.scene.add(this.robot.mesh);
    this.robot.setPhase('ally');
  }

  private updateSurfing(dt: number, leader: Surfboard) {
    this.ensureRobotOnBoard();

    const back = new THREE.Vector3(-Math.sin(leader.yaw), 0, -Math.cos(leader.yaw));
    const target = leader.position.clone().addScaledVector(back, 4.8);
    target.y = leader.position.y;
    // Slight lateral offset so boards don't stack
    const right = new THREE.Vector3(Math.cos(leader.yaw), 0, -Math.sin(leader.yaw));
    target.addScaledVector(right, -1.1);

    this.boardPos.lerp(target, 1 - Math.exp(-5.5 * dt));
    this.boardYaw = dampAngle(this.boardYaw, leader.yaw, 7, dt);

    const bob = Math.sin(this.bobT * BOARD.bobHz * Math.PI * 2) * BOARD.bobAmp * 0.5;
    this.boardMesh.position.set(this.boardPos.x, this.boardPos.y + bob, this.boardPos.z);
    this.boardMesh.rotation.order = 'YXZ';
    this.boardMesh.rotation.y = this.boardYaw;
    this.boardMesh.rotation.z = leader.bank * 0.65;
    this.boardMesh.rotation.x = -leader.speedNorm * 0.06;

    // Light stance anim while riding
    this.robot.tickAnim(dt, leader.speedNorm > 0.15, 'ally');
  }

  private updateWalking(
    dt: number,
    playerPos: THREE.Vector3,
    path: THREE.Vector3[],
    pathDist: number[],
  ) {
    this.ensureRobotOnFoot();
    this.robot.mesh.visible = true;

    const pos = this.robot.mesh.position;
    const toPlayer = new THREE.Vector3(
      playerPos.x - pos.x,
      0,
      playerPos.z - pos.z,
    );
    const dist = toPlayer.length();

    let moving = false;
    if (dist > 2.4) {
      toPlayer.normalize();
      const speed = dist > 10 ? 8.5 : dist > 5 ? 6.5 : 5;
      pos.x += toPlayer.x * speed * dt;
      pos.z += toPlayer.z * speed * dt;
      this.robot.faceDir.copy(toPlayer);
      this.robot.mesh.lookAt(pos.x + toPlayer.x, pos.y, pos.z + toPlayer.z);
      moving = true;
    }

    // Snap feet to race path (critical — wrong Y makes him invisible underground)
    const near = nearestOnPath(path, pathDist, pos);
    pos.y = near.point.y;
    const lat = Math.hypot(pos.x - near.point.x, pos.z - near.point.z);
    if (lat > 12) {
      pos.x = THREE.MathUtils.damp(pos.x, near.point.x, 3, dt);
      pos.z = THREE.MathUtils.damp(pos.z, near.point.z, 3, dt);
      pos.y = nearestOnPath(path, pathDist, pos).point.y;
    }
    // If somehow miles away (bad spawn), warp beside player
    if (dist > 40) {
      const side = new THREE.Vector3(2.5, 0, 1.5);
      pos.set(playerPos.x + side.x, playerPos.y, playerPos.z + side.z);
      const n2 = nearestOnPath(path, pathDist, pos);
      pos.copy(n2.point);
    }

    this.robot.tickAnim(dt, moving, 'ally');
    this.robot.onGround = true;
    this.boardPos.copy(pos);
    this.boardYaw = Math.atan2(this.robot.faceDir.x, this.robot.faceDir.z);
  }

  dispose() {
    if (this.robot.mesh.parent) this.robot.mesh.parent.remove(this.robot.mesh);
    if (this.boardMesh.parent) this.boardMesh.parent.remove(this.boardMesh);
  }
}
