import * as THREE from 'three';
import type { Mats } from './materials';

export type RobotPhase = 'active' | 'disabled' | 'ally' | 'husk';

export class RobotUnit {
  mesh: THREE.Group;
  phase: RobotPhase = 'active';
  /** Integrity */
  hp = 80;
  maxHp = 80;
  /** Scramble / EMP build-up 0–100 */
  scramble = 0;
  attackCd = 0;
  repairCd = 0;
  anim = 0;
  /** Aggro target player or null */
  aggro = false;
  velocity = new THREE.Vector3();

  private body: THREE.Group;
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private eyeL: THREE.Mesh;
  private eyeR: THREE.Mesh;
  private mats: Mats;

  constructor(mats: Mats, position: THREE.Vector3) {
    this.mats = mats;
    this.mesh = new THREE.Group();
    this.body = new THREE.Group();

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.45), mats.brass);
    torso.position.y = 1.1;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.4), mats.brassDark);
    head.position.y = 1.7;
    head.castShadow = true;
    this.eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.05), mats.emissiveRed);
    this.eyeR = this.eyeL.clone();
    this.eyeL.position.set(-0.12, 1.72, 0.2);
    this.eyeR.position.set(0.12, 1.72, 0.2);

    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), mats.iron);
    this.legR = this.legL.clone();
    this.legL.position.set(-0.18, 0.35, 0);
    this.legR.position.set(0.18, 0.35, 0);
    this.legL.castShadow = true;
    this.legR.castShadow = true;

    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), mats.ironDark);
    this.armR = this.armL.clone();
    this.armL.position.set(-0.48, 1.15, 0);
    this.armR.position.set(0.48, 1.15, 0);

    const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), mats.emissiveAmber);
    gauge.position.set(0, 1.15, 0.24);

    this.body.add(torso, head, this.eyeL, this.eyeR, this.legL, this.legR, this.armL, this.armR, gauge);
    this.mesh.add(this.body);
    this.mesh.position.copy(position);
  }

  get position() {
    return this.mesh.position;
  }

  setPhase(p: RobotPhase) {
    this.phase = p;
    if (p === 'disabled') {
      this.body.rotation.x = 0.35;
      this.eyeL.material = this.mats.iron;
      this.eyeR.material = this.mats.iron;
    } else if (p === 'ally') {
      this.body.rotation.x = 0;
      this.eyeL.material = this.mats.emissiveGreen;
      this.eyeR.material = this.mats.emissiveGreen;
      this.hp = 40;
      this.maxHp = 40;
      this.scramble = 0;
    } else if (p === 'husk') {
      this.mesh.visible = false;
    } else {
      this.body.rotation.x = 0;
      this.eyeL.material = this.mats.emissiveRed;
      this.eyeR.material = this.mats.emissiveRed;
    }
  }

  /** Shuffle walk + attack lean */
  tickAnim(dt: number, moving: boolean, attacking: boolean) {
    this.anim += dt * (moving ? 8 : 2);
    const s = Math.sin(this.anim);
    if (this.phase === 'disabled') {
      this.legL.rotation.x = 0.5;
      this.legR.rotation.x = 0.5;
      return;
    }
    if (attacking) {
      this.armR.rotation.x = -1.2;
      this.body.position.z = 0.08;
    } else {
      this.armR.rotation.x = moving ? s * 0.4 : 0;
      this.armL.rotation.x = moving ? -s * 0.4 : 0;
      this.body.position.z = 0;
    }
    this.legL.rotation.x = moving ? s * 0.55 : 0;
    this.legR.rotation.x = moving ? -s * 0.55 : 0;
    this.body.position.y = moving ? Math.abs(s) * 0.04 : 0;
  }

  applyArc(damage: number, scrambleAdd: number): 'hurt' | 'disabled' | 'none' {
    if (this.phase !== 'active') return 'none';
    this.hp -= damage;
    this.scramble = Math.min(100, this.scramble + scrambleAdd);
    if (this.scramble >= 100 || this.hp <= 0) {
      this.hp = Math.max(0, this.hp);
      this.setPhase('disabled');
      return 'disabled';
    }
    return 'hurt';
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
