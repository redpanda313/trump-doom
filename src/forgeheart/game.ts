/**
 * ForgeHeart: Gift of the Brass Gods — Three.js vertical slice
 * Solid 3D platforming; separate product from Trump Doom.
 */

import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import {
  buildFoundryAnnex,
  JUMP_H,
  PLAYER_H,
  PLAYER_R,
  type Collider,
  type Interactable,
  type LevelBuilt,
  aabbOverlap,
} from './level';
import { RobotUnit, createHusk } from './robot';

const GRAVITY = 28;
const MOVE_SPEED = 7;
const JUMP_VEL = Math.sqrt(2 * GRAVITY * JUMP_H);

type Weapon = 'hand' | 'wrench';

export class ForgeHeartGame {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: PointerLockControls;
  private clock = new THREE.Clock();

  private level: LevelBuilt;
  private colliders: Collider[] = [];
  private velocity = new THREE.Vector3();
  private onGround = false;
  private keys = new Set<string>();

  private health = 100;
  private plasma = 100;
  private brass = 0;
  private gears = 0;
  private weapon: Weapon = 'wrench';
  private atkCd = 0;
  private invuln = 0;
  private arcMesh: THREE.Mesh | null = null;

  private robots: RobotUnit[] = [];
  private husks: THREE.Object3D[] = [];
  private interactables: Interactable[] = [];
  private exit: THREE.Vector3;
  private won = false;
  private paused = false;

  private hpFill: HTMLElement;
  private plasmaFill: HTMLElement;
  private weaponEl: HTMLElement;
  private statsEl: HTMLElement;
  private locEl: HTMLElement | null;
  private toastEl: HTMLElement;
  private convertEl: HTMLElement;
  private msg = '';
  private msgT = 0;

  private fireHeld = false;
  /** Last stable standing position — used if we fall through the world */
  private safePos = new THREE.Vector3();
  private safeTimer = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(70, canvas.clientWidth / canvas.clientHeight, 0.08, 120);
    this.controls = new PointerLockControls(this.camera, canvas);

    this.scene.background = new THREE.Color(0x3d2818);
    this.scene.fog = new THREE.Fog(0x4a3020, 18, 55);

    // Lights
    const hemi = new THREE.HemisphereLight(0xffd0a0, 0x2a2018, 0.55);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe0b0, 1.1);
    sun.position.set(12, 24, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -25;
    sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 25;
    sun.shadow.camera.bottom = -25;
    this.scene.add(sun);

    this.level = buildFoundryAnnex();
    this.scene.add(this.level.group);
    this.colliders = [...this.level.colliders];
    this.interactables = this.level.interactables;
    this.exit = this.level.exit.clone();

    // Exit marker
    const exitMat = new THREE.MeshStandardMaterial({
      color: 0xc47830,
      emissive: 0x884400,
      emissiveIntensity: 0.4,
    });
    const exitMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 0.3), exitMat);
    exitMesh.position.set(this.exit.x, 1.1, this.exit.z);
    this.scene.add(exitMesh);

    // Spawn robots
    const spots = [
      new THREE.Vector3(3, 0, 2),
      new THREE.Vector3(-5, 0, 1),
      new THREE.Vector3(2, 0, 12),
      new THREE.Vector3(6, 0, 15),
      new THREE.Vector3(-5, JUMP_H, 11), // on platform
      new THREE.Vector3(-6, 3, 14), // upper walkway
      new THREE.Vector3(2, 3, -2), // loft
    ];
    for (const s of spots) {
      const r = new RobotUnit(this.level.mats, s);
      this.robots.push(r);
      this.scene.add(r.mesh);
    }

    // Player start (feet on spawn collider top)
    this.camera.position.set(
      this.level.spawn.x,
      this.level.spawn.y + PLAYER_H * 0.9 + 0.2,
      this.level.spawn.z,
    );
    this.safePos.copy(this.camera.position);

    // HUD
    this.hpFill = document.getElementById('resolve-fill')!;
    this.plasmaFill = document.getElementById('voice-fill')!;
    this.weaponEl = document.getElementById('weapon-name')!;
    this.statsEl = document.getElementById('stats-line')!;
    this.locEl = document.getElementById('location-line');
    this.toastEl = document.getElementById('plaque-toast')!;
    this.convertEl = document.getElementById('convert-toast')!;
    const face = document.getElementById('resolve-face');
    if (face) face.textContent = '⚙️';
    document.querySelectorAll('.hud-bar .label').forEach((el) => {
      if (el.textContent === 'VOICE' || el.textContent === 'PLASMA') el.textContent = 'PLASMA';
      if (el.textContent === 'RESOLVE' || el.textContent === 'INTEGRITY') el.textContent = 'INTEGRITY';
    });

    this.bindInput();
    window.addEventListener('resize', () => this.onResize());
  }

  private bindInput() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
      if (e.code === 'Digit1') this.weapon = 'hand';
      if (e.code === 'Digit2') this.weapon = 'wrench';
      if (e.code === 'KeyE') this.tryInteract();
      if (e.code === 'Escape') {
        this.paused = !this.paused;
        if (this.paused) this.controls.unlock();
        else this.canvas.requestPointerLock();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    this.canvas.addEventListener('click', () => {
      if (!this.paused) this.controls.lock();
    });
  }

  setFireHeld(v: boolean) {
    this.fireHeld = v;
  }
  setAltHeld(_v: boolean) {}

  async start() {
    this.toast(
      'ForgeHeart — Space jump · 1 Hand · 2 Wrench · E scrap/valve · Allies open seals',
      5,
    );
    this.controls.lock();
  }

  update(_dtExternal?: number) {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.paused || this.won) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.msgT -= dt;
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.plasma = Math.min(100, this.plasma + dt * 6);

    // Movement relative to camera yaw
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const wish = new THREE.Vector3();
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) wish.add(forward);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) wish.sub(forward);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) wish.add(right);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(MOVE_SPEED);

    this.velocity.x = wish.x;
    this.velocity.z = wish.z;
    this.velocity.y -= GRAVITY * dt;

    if ((this.keys.has('Space') || this.keys.has('KeyJ')) && this.onGround) {
      this.velocity.y = JUMP_VEL;
      this.onGround = false;
    }

    this.moveWithCollision(dt);

    if (this.fireHeld || this.keys.has('ControlLeft')) this.tryFire();

    this.updateRobots(dt);
    this.updateArcVisual(dt);
    this.checkExit();

    // HUD
    this.hpFill.style.width = `${this.health}%`;
    this.plasmaFill.style.width = `${this.plasma}%`;
    const pct = document.getElementById('resolve-pct');
    if (pct) pct.textContent = String(Math.round(this.health));
    this.weaponEl.textContent = this.weapon === 'hand' ? 'REPROGRAM HAND' : 'ARC WRENCH';
    const allies = this.robots.filter((r) => r.phase === 'ally').length;
    const dis = this.robots.filter((r) => r.phase === 'disabled').length;
    this.statsEl.textContent = `BRASS ${this.brass} · GEARS ${this.gears} · ALLIES ${allies} · DOWN ${dis}${this.onGround ? '' : ' · AIR'}`;
    if (this.locEl) this.locEl.textContent = 'Foundry Annex · ForgeHeart';

    if (this.msgT > 0) {
      // drawn via toast element for plaques; on-canvas for short msgs in render
    }

    this.renderer.render(this.scene, this.camera);
    // overlay messages
    this.drawOverlay();
  }

  /** Compatibility with main loop that calls render separately */
  render() {
    // rendering happens in update for Three.js
    if (!this.clock.running) this.renderer.render(this.scene, this.camera);
  }

  private drawOverlay() {
    // Use convert toast for big messages
    if (this.msgT > 0 && this.msg) {
      // keep lightweight — toast element
    }
  }

  /**
   * Robust character collision:
   * - Cap fall speed
   * - Fixed substeps (prevents tunneling)
   * - Sweep per axis with full body AABB
   * - Ground snap to highest surface under feet
   * - Void rescue to last safe position
   */
  private moveWithCollision(dt: number) {
    // Terminal velocity — limits how far we can tunnel in one frame
    this.velocity.y = Math.max(this.velocity.y, -22);

    const maxStep = 1 / 120;
    const steps = Math.max(1, Math.min(10, Math.ceil(dt / maxStep)));
    const sdt = dt / steps;

    for (let s = 0; s < steps; s++) {
      this.physicsSubstep(sdt);
    }

    this.snapToGround(0.45);

    // Remember safe standing spots
    if (this.onGround) {
      this.safeTimer += dt;
      if (this.safeTimer > 0.15) {
        this.safePos.copy(this.camera.position);
      }
    } else {
      this.safeTimer = 0;
    }

    // Fell through the world
    if (this.camera.position.y < -2) {
      this.camera.position.copy(this.safePos);
      this.velocity.set(0, 0, 0);
      this.onGround = true;
      this.toast('Brass gods catch you — restored to solid ground.');
    }
  }

  private playerAabb(pos: THREE.Vector3): { min: THREE.Vector3; max: THREE.Vector3 } {
    const feet = pos.y - PLAYER_H * 0.9;
    const head = pos.y + 0.15;
    return {
      min: new THREE.Vector3(pos.x - PLAYER_R, feet, pos.z - PLAYER_R),
      max: new THREE.Vector3(pos.x + PLAYER_R, head, pos.z + PLAYER_R),
    };
  }

  private physicsSubstep(dt: number) {
    const pos = this.camera.position;

    const resolveAxis = (axis: 'x' | 'y' | 'z') => {
      const delta = this.velocity[axis] * dt;
      if (Math.abs(delta) < 1e-8) return;
      pos[axis] += delta;

      let { min, max } = this.playerAabb(pos);
      // Slight skin so we don't jitter inside surfaces
      for (const c of this.colliders) {
        if (!aabbOverlap(min, max, c.min, c.max)) continue;

        if (axis === 'y') {
          if (delta < 0) {
            // Landing on top
            pos.y = c.max.y + PLAYER_H * 0.9 + 0.002;
            this.velocity.y = 0;
            this.onGround = true;
          } else {
            // Hit ceiling / underside
            pos.y = c.min.y - 0.16;
            this.velocity.y = Math.min(0, this.velocity.y);
          }
          min = this.playerAabb(pos).min;
          max = this.playerAabb(pos).max;
        } else if (axis === 'x') {
          // Prefer sliding: only push if not mostly standing on this box
          const feet = pos.y - PLAYER_H * 0.9;
          const onTop = feet >= c.max.y - 0.08 && feet <= c.max.y + 0.35;
          if (onTop && this.velocity.y <= 0) continue;
          if (delta > 0) pos.x = c.min.x - PLAYER_R - 0.002;
          else pos.x = c.max.x + PLAYER_R + 0.002;
          this.velocity.x = 0;
          min = this.playerAabb(pos).min;
          max = this.playerAabb(pos).max;
        } else {
          const feet = pos.y - PLAYER_H * 0.9;
          const onTop = feet >= c.max.y - 0.08 && feet <= c.max.y + 0.35;
          if (onTop && this.velocity.y <= 0) continue;
          if (delta > 0) pos.z = c.min.z - PLAYER_R - 0.002;
          else pos.z = c.max.z + PLAYER_R + 0.002;
          this.velocity.z = 0;
          min = this.playerAabb(pos).min;
          max = this.playerAabb(pos).max;
        }
      }
    };

    // Only clear grounded when actually falling / jumping
    if (this.velocity.y > 0.5) this.onGround = false;
    if (this.velocity.y < -0.5) this.onGround = false;

    resolveAxis('x');
    resolveAxis('z');
    resolveAxis('y');
  }

  /**
   * Place feet on the highest solid surface directly under the player
   * within snapDist. Critical for stairs, platform edges, thin floors.
   */
  private snapToGround(snapDist: number) {
    const pos = this.camera.position;
    const feetY = pos.y - PLAYER_H * 0.9;
    // Horizontal footprint (slightly smaller than body to reduce edge catches)
    const r = PLAYER_R * 0.75;
    let bestTop = -Infinity;
    let found = false;

    for (const c of this.colliders) {
      // Must overlap footprint in XZ
      if (pos.x + r < c.min.x || pos.x - r > c.max.x) continue;
      if (pos.z + r < c.min.z || pos.z - r > c.max.z) continue;
      const top = c.max.y;
      // Surface at or below feet, within snap range
      if (top <= feetY + 0.12 && top >= feetY - snapDist) {
        if (top > bestTop) {
          bestTop = top;
          found = true;
        }
      }
    }

    if (found && this.velocity.y <= 0.5) {
      pos.y = bestTop + PLAYER_H * 0.9 + 0.002;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.onGround = true;
    }
  }

  private tryFire() {
    if (this.atkCd > 0) return;
    if (this.weapon === 'wrench') {
      this.atkCd = 0.38;
      this.spawnArcFx();
      const origin = this.camera.position.clone();
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      for (const r of this.robots) {
        if (r.phase !== 'active') continue;
        const to = r.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(origin);
        const dist = to.length();
        if (dist > 2.4 || dist < 0.01) continue;
        to.normalize();
        if (to.dot(dir) < 0.55) continue;
        const res = r.applyArc(18, 34);
        if (res === 'disabled') this.flash('Frame disabled — Hand to rewrite, E to scrap');
      }
    } else {
      // Reprogram
      this.atkCd = 0.45;
      if (this.plasma < 22) {
        this.toast('Plasma low — wait to reprogram.');
        return;
      }
      let best: RobotUnit | null = null;
      let bestD = 2.2;
      for (const r of this.robots) {
        if (r.phase !== 'disabled') continue;
        const d = r.position.distanceTo(this.camera.position);
        if (d < bestD) {
          best = r;
          bestD = d;
        }
      }
      if (best) {
        this.plasma -= 22;
        best.setPhase('ally');
        this.flash('REPROGRAMMED — ally frame online');
      } else {
        this.toast('No disabled frame nearby. Arc them first.');
      }
    }
  }

  private spawnArcFx() {
    if (this.arcMesh) {
      this.scene.remove(this.arcMesh);
      this.arcMesh.geometry.dispose();
    }
    const geo = new THREE.SphereGeometry(0.15, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0x66ccff });
    this.arcMesh = new THREE.Mesh(geo, mat);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.arcMesh.position.copy(this.camera.position).add(dir.multiplyScalar(1.2));
    this.scene.add(this.arcMesh);
    window.setTimeout(() => {
      if (this.arcMesh) {
        this.scene.remove(this.arcMesh);
        this.arcMesh = null;
      }
    }, 120);
  }

  private updateArcVisual(_dt: number) {}

  private tryInteract() {
    const pos = this.camera.position;
    // Scrap disabled
    for (const r of this.robots) {
      if (r.phase !== 'disabled') continue;
      if (r.position.distanceTo(pos) < 2.4) {
        const bonus = r.scramble >= 100 ? 1.0 : 0.55;
        const b = Math.round(8 * bonus + Math.random() * 6);
        const g = Math.round(3 * bonus + Math.random() * 3);
        this.brass += b;
        this.gears += g;
        r.setPhase('husk');
        const husk = createHusk(this.level.mats, r.position.clone());
        this.scene.add(husk);
        this.husks.push(husk);
        this.scene.remove(r.mesh);
        this.flash(`Scrapped — +${b} brass, +${g} gears`);
        return;
      }
    }

    for (const it of this.interactables) {
      if (it.position.distanceTo(pos) > it.radius + 0.5) continue;
      if (it.type === 'plaque') {
        this.plaque(`${it.title}: ${it.text}`);
        return;
      }
      if (it.type === 'valve' && !it.opened) {
        const allyNear = this.robots.some(
          (r) => r.phase === 'ally' && r.position.distanceTo(it.position) < 3.5,
        );
        if (!allyNear) {
          this.toast('Needs an ally frame to turn the seal.');
          return;
        }
        it.opened = true;
        const ud = it.mesh.userData as { doorMesh?: THREE.Mesh; doorCol?: Collider };
        if (ud.doorMesh) {
          ud.doorMesh.visible = false;
          ud.doorMesh.position.y = -50;
        }
        if (ud.doorCol) {
          this.colliders = this.colliders.filter((c) => c !== ud.doorCol);
        }
        this.flash('Seal opened — passageway revealed!');
        // loot behind
        this.spawnPickup(new THREE.Vector3(11, 0.5, 18), 'oil');
        return;
      }
      if (it.type === 'crate' && !it.opened) {
        const allyNear = this.robots.some(
          (r) => r.phase === 'ally' && r.position.distanceTo(it.position) < 3,
        );
        if (!allyNear) {
          this.toast('An ally can pry this crate.');
          return;
        }
        it.opened = true;
        it.mesh.position.y = -10;
        this.health = Math.min(100, this.health + 35);
        this.plasma = Math.min(100, this.plasma + 25);
        this.brass += 5;
        this.flash('Crate opened — oil, plasma, brass!');
        return;
      }
    }
  }

  private spawnPickup(pos: THREE.Vector3, kind: 'oil' | 'cell') {
    const mat =
      kind === 'oil'
        ? new THREE.MeshStandardMaterial({ color: 0x6a5a20 })
        : new THREE.MeshStandardMaterial({
            color: 0x33ff99,
            emissive: 0x00ff66,
            emissiveIntensity: 0.5,
          });
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 10), mat);
    m.position.copy(pos);
    this.scene.add(m);
    // simple auto pickup zone tracked via interactables hack
    this.interactables.push({
      type: 'crate',
      position: pos.clone(),
      radius: 1.2,
      mesh: m,
      opened: false,
      title: kind,
      text: 'pickup',
    });
  }

  private updateRobots(dt: number) {
    const playerPos = this.camera.position.clone();
    playerPos.y -= 0.5;

    for (const r of this.robots) {
      if (r.phase === 'husk') continue;
      r.attackCd = Math.max(0, r.attackCd - dt);
      r.repairCd = Math.max(0, r.repairCd - dt);

      if (r.phase === 'disabled') {
        r.tickAnim(dt, false, false);
        continue;
      }

      if (r.phase === 'active') {
        // Chase player or aggro
        const target = playerPos;
        const dist = r.position.distanceTo(target);
        let moving = false;
        if (dist < 16 && dist > 1.3) {
          const dir = target.clone().sub(r.position);
          dir.y = 0;
          dir.normalize();
          r.position.addScaledVector(dir, 2.1 * dt);
          r.mesh.lookAt(target.x, r.position.y, target.z);
          moving = true;
        }
        const attacking = dist < 1.6 && r.attackCd <= 0;
        if (attacking && this.invuln <= 0) {
          r.attackCd = 1.05;
          this.health -= 11;
          this.invuln = 0.5;
          if (this.health <= 0) {
            this.health = 100;
            this.camera.position.set(
              this.level.spawn.x,
              this.level.spawn.y + PLAYER_H * 0.9,
              this.level.spawn.z,
            );
            this.toast('Integrity failed — returned to annex door.');
          }
        }
        r.tickAnim(dt, moving, r.attackCd > 0.75);
      }

      if (r.phase === 'ally') {
        // Follow player
        const dist = r.position.distanceTo(playerPos);
        let moving = false;
        if (dist > 2.2 && dist < 20) {
          const dir = playerPos.clone().sub(r.position);
          dir.y = 0;
          dir.normalize();
          r.position.addScaledVector(dir, 2.8 * dt);
          moving = true;
        }
        // Attack nearest hostile + aggro
        let foe: RobotUnit | null = null;
        let fd = 5;
        for (const o of this.robots) {
          if (o.phase !== 'active') continue;
          const d = o.position.distanceTo(r.position);
          if (d < fd) {
            fd = d;
            foe = o;
          }
        }
        if (foe && fd < 1.5 && r.attackCd <= 0) {
          r.attackCd = 0.85;
          foe.aggro = true;
          const res = foe.applyArc(10, 20);
          if (res === 'disabled') this.toast('Ally disabled a frame!');
        }
        // Chase aggro targets slightly
        if (foe && fd < 8 && fd > 1.5) {
          const dir = foe.position.clone().sub(r.position);
          dir.y = 0;
          dir.normalize();
          r.position.addScaledVector(dir, 2.4 * dt);
          moving = true;
        }
        // Repair allies and player
        if (r.repairCd <= 0) {
          for (const o of this.robots) {
            if (o === r || o.phase !== 'ally') continue;
            if (o.position.distanceTo(r.position) < 3 && o.hp < o.maxHp) {
              o.hp = Math.min(o.maxHp, o.hp + 6);
              r.repairCd = 1.2;
            }
          }
          if (r.position.distanceTo(playerPos) < 3 && this.health < 100) {
            this.health = Math.min(100, this.health + 4);
            r.repairCd = 1.2;
          }
        }
        // Ally channel valve / crate when near
        for (const it of this.interactables) {
          if (!it.needsAlly || it.opened) continue;
          if (r.position.distanceTo(it.position) < 2.5) {
            // auto-assist slowly — player still presses E when ally present
          }
        }
        r.tickAnim(dt, moving, r.attackCd > 0.7);
        // Keep on floor height approximate
        this.snapRobotToFloor(r);
      }

      if (r.phase === 'active') this.snapRobotToFloor(r);
    }

    // Pickup orbs from opened crates (title oil/cell)
    for (const it of this.interactables) {
      if (it.text !== 'pickup' || it.opened) continue;
      if (it.position.distanceTo(this.camera.position) < 1.4) {
        it.opened = true;
        it.mesh.visible = false;
        if (it.title === 'oil') this.health = Math.min(100, this.health + 25);
        else this.plasma = Math.min(100, this.plasma + 30);
        this.toast(it.title === 'oil' ? 'Machine oil.' : 'Plasma cell.');
      }
    }
  }

  private snapRobotToFloor(r: RobotUnit) {
    // Simple: ray down against colliders top surfaces
    const x = r.position.x;
    const z = r.position.z;
    let bestY = 0;
    for (const c of this.colliders) {
      if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z) {
        if (c.max.y > bestY && c.max.y < r.position.y + 2.5) bestY = c.max.y;
      }
    }
    r.position.y = bestY;
  }

  private checkExit() {
    if (this.won) return;
    const p = this.camera.position;
    if (Math.hypot(p.x - this.exit.x, p.z - this.exit.z) < 1.6 && p.y < 3) {
      this.won = true;
      this.flash('FOUNDRY ANNEX CLEAR — ForgeHeart slice complete');
      this.controls.unlock();
    }
  }

  private toast(t: string, sec = 2.5) {
    this.msg = t;
    this.msgT = sec;
    this.toastEl.textContent = t;
    this.toastEl.classList.remove('hidden');
    window.setTimeout(() => this.toastEl.classList.add('hidden'), sec * 1000);
  }
  private plaque(t: string) {
    this.toastEl.textContent = t;
    this.toastEl.classList.remove('hidden');
    window.setTimeout(() => this.toastEl.classList.add('hidden'), 5000);
  }
  private flash(t: string) {
    this.convertEl.textContent = t;
    this.convertEl.classList.remove('hidden');
    window.setTimeout(() => this.convertEl.classList.add('hidden'), 2200);
  }

  private onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}
