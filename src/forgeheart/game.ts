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
import {
  RobotUnit,
  SparkBolt,
  createHusk,
  createBlastFx,
  ROBOT,
} from './robot';

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
  private bolts: SparkBolt[] = [];
  private blasts: THREE.Group[] = [];
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
  /** Time spent at 0 plasma while holding allies */
  private allyStarveT = 0;

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
    this.tickAllyPower(dt);

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
    this.updateBolts(dt);
    this.updateBlasts(dt);
    this.updateArcVisual(dt);
    this.checkExit();

    // HUD
    this.hpFill.style.width = `${this.health}%`;
    this.plasmaFill.style.width = `${this.plasma}%`;
    const pct = document.getElementById('resolve-pct');
    if (pct) pct.textContent = String(Math.round(this.health));
    this.weaponEl.textContent = this.weapon === 'hand' ? 'REPROGRAM HAND' : 'ARC WRENCH';
    const allies = this.countPoweredAllies();
    const dis = this.robots.filter((r) => r.phase === 'disabled' && r.mesh.visible).length;
    const cap = ROBOT.maxAllies;
    const net = this.plasmaNetPerSec(allies);
    const netLabel = `${net >= 0 ? '+' : ''}${net.toFixed(1)}/s`;
    const powerWarn = allies > 0 && this.plasma < 15 ? ' · ⚠ LOW' : '';
    this.statsEl.textContent = `BRASS ${this.brass} · GEARS ${this.gears} · ALLIES ${allies}/${cap} · ${netLabel}${powerWarn} · DOWN ${dis}${this.onGround ? '' : ' · AIR'}`;
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
      this.atkCd = 0.36;
      this.spawnArcFx();
      const origin = this.camera.position.clone();
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      for (const r of this.robots) {
        if (r.phase !== 'active') continue;
        const to = r.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(origin);
        const dist = to.length();
        if (dist > 2.5 || dist < 0.01) continue;
        to.normalize();
        if (to.dot(dir) < 0.52) continue;
        const res = r.applyArc(ROBOT.arcDamage, ROBOT.scramblePerHit);
        if (res === 'disabled') {
          this.flash('KNOCKED OUT — E scrap · Hand reprogram');
        } else if (res === 'scrambled') {
          this.flash('SCRAMBLE FULL — eyes dark! Hand to rewrite while it still walks');
        }
      }
    } else {
      // Reprogram: scrambled (eyes out) OR disabled
      let best: RobotUnit | null = null;
      let bestD = 2.4;
      for (const r of this.robots) {
        if (!r.reprogramReady) continue;
        const d = r.position.distanceTo(this.camera.position);
        if (d < bestD) {
          best = r;
          bestD = d;
        }
      }
      if (!best) {
        this.atkCd = 0.35;
        this.toast('Need scramble-full (dark eyes) or knocked-out frame nearby.');
        return;
      }
      const allyCount = this.countPoweredAllies();
      if (allyCount >= ROBOT.maxAllies) {
        this.atkCd = 0.35;
        this.toast(`Power grid full — only ${ROBOT.maxAllies} allies.`);
        return;
      }
      const reprogramCost = 18;
      if (this.plasma < reprogramCost) {
        this.atkCd = 0.35;
        this.toast(`Need ${reprogramCost} plasma to reprogram (have ${Math.floor(this.plasma)}).`);
        return;
      }
      this.atkCd = 0.5;
      this.plasma -= reprogramCost;
      best.setPhase('ally');
      best.returning = false;
      best.vy = 0;
      best.onGround = true;
      const next = allyCount + 1;
      const net = this.plasmaNetPerSec(next);
      this.flash(
        `REPROGRAMMED ${next}/${ROBOT.maxAllies} · plasma ${net >= 0 ? '+' : ''}${net.toFixed(1)}/s`,
      );
    }
  }

  /**
   * Live powered allies only — re-scanned every call.
   * Excludes husks, invisible meshes, and units removed from the scene
   * so upkeep never sticks at a peak (e.g. 3→1) ally count.
   */
  private countPoweredAllies(): number {
    let n = 0;
    for (const r of this.robots) {
      if (this.isPoweredAlly(r)) n++;
    }
    return Math.min(n, ROBOT.maxAllies);
  }

  private isPoweredAlly(r: RobotUnit): boolean {
    return r.phase === 'ally' && r.mesh.visible && r.mesh.parent != null;
  }

  private getPoweredAllies(): RobotUnit[] {
    return this.robots.filter((r) => this.isPoweredAlly(r));
  }

  /** Single source of truth for plasma rate (must match tickAllyPower). */
  private plasmaNetPerSec(allyCount: number): number {
    return ROBOT.plasmaRegen - ROBOT.allyUpkeep * allyCount;
  }

  /**
   * One formula only: plasma += (regen − upkeep×allies) × dt
   * Ally count is always live — never cached.
   */
  private tickAllyPower(dt: number) {
    // Rescue allies that fell out of the world
    for (const r of this.robots) {
      if (r.phase !== 'ally') continue;
      if (r.position.y < -2) {
        r.position.y = 0.05;
        r.vy = 0;
        r.onGround = true;
      }
    }

    const allies = this.getPoweredAllies();
    const n = allies.length;
    const net = this.plasmaNetPerSec(n);

    // Single application: no separate regen-then-drain (that felt like random swings)
    this.plasma = Math.max(0, Math.min(100, this.plasma + net * dt));

    if (n === 0) {
      this.allyStarveT = 0;
      return;
    }

    if (this.plasma <= 0.05) {
      this.allyStarveT += dt;
      if (Math.floor(this.allyStarveT * 2) !== Math.floor((this.allyStarveT - dt) * 2)) {
        if (this.allyStarveT < ROBOT.allyStarveTime) {
          this.toast(`⚠ Plasma empty — ${n} link${n > 1 ? 's' : ''} destabilizing…`);
        }
      }
      if (this.allyStarveT >= ROBOT.allyStarveTime) {
        let worst = allies[0]!;
        let bestD = -1;
        const p = this.camera.position;
        for (const a of allies) {
          const d = a.position.distanceTo(p);
          if (d > bestD) {
            bestD = d;
            worst = a;
          }
        }
        this.turnAllyRogue(worst);
        this.allyStarveT = 0;
      }
    } else {
      this.allyStarveT = Math.max(0, this.allyStarveT - dt * 1.5);
    }
  }

  private turnAllyRogue(r: RobotUnit) {
    r.scrambled = false;
    r.scramble = 0;
    r.hp = Math.max(50, r.hp);
    r.maxHp = ROBOT.maxHp;
    r.vy = 0;
    r.onGround = true;
    r.setPhase('active'); // clears ally phase + eyes
    r.mode = 'chase';
    r.returning = false;
    r.fuseT = 0;
    const left = this.countPoweredAllies(); // already not counting this unit
    const net = this.plasmaNetPerSec(left);
    this.flash(
      `LINK SEVERED — rogue! Grid ${left}/${ROBOT.maxAllies} · ${net >= 0 ? '+' : ''}${net.toFixed(1)}/s`,
    );
  }

  /**
   * Move robot in XZ with wall collision + auto step/jump onto ledges.
   * Returns horizontal delta applied.
   */
  private moveRobot(r: RobotUnit, wish: THREE.Vector3, speed: number, dt: number): THREE.Vector3 {
    const applied = new THREE.Vector3();
    r.jumpCd = Math.max(0, r.jumpCd - dt);

    // Gravity + vertical resolve first
    r.vy -= ROBOT.robotGravity * dt;
    r.vy = Math.max(r.vy, -24);
    r.position.y += r.vy * dt;
    this.resolveRobotVertical(r);

    if (wish.lengthSq() < 1e-6) {
      if (r.onGround) this.snapRobotToFloor(r);
      return applied;
    }
    const dir = wish.clone().setY(0);
    if (dir.lengthSq() < 1e-6) {
      if (r.onGround) this.snapRobotToFloor(r);
      return applied;
    }
    dir.normalize();

    const tryAxis = (axis: 'x' | 'z', amount: number): number => {
      if (Math.abs(amount) < 1e-8) return 0;
      const prev = r.position[axis];
      r.position[axis] += amount;
      if (this.robotBodyHitsWall(r)) {
        r.position[axis] = prev;
        if (r.onGround && r.jumpCd <= 0 && this.tryRobotStepOrJump(r, dir)) {
          // After step/jump, nudge along wish so we clear the riser
          const nudge = amount * (r.onGround ? 0.55 : 0.4);
          r.position[axis] += nudge;
          if (this.robotBodyHitsWall(r)) r.position[axis] = prev;
        }
      }
      return r.position[axis] - prev;
    };

    const dx = dir.x * speed * dt;
    const dz = dir.z * speed * dt;
    applied.x = tryAxis('x', dx);
    applied.z = tryAxis('z', dz);

    // Blocked + player clearly above → jump to follow stairs / platforms
    const playerFeetY = this.camera.position.y - PLAYER_H * 0.9;
    const stuck = applied.lengthSq() < (speed * dt * 0.25) ** 2;
    if (r.onGround && r.jumpCd <= 0 && wish.lengthSq() > 0.1) {
      if (stuck && playerFeetY > r.position.y + 0.35) {
        this.robotJump(r);
      } else if (stuck) {
        // Flat obstacle — try climb in move dir before random turn
        if (!this.tryRobotStepOrJump(r, dir)) {
          r.wanderAngle += (Math.random() > 0.5 ? 1 : -1) * (0.9 + Math.random());
        }
      } else if (playerFeetY > r.position.y + 0.55) {
        // Moving toward player who is upstairs — hop onto riser if one is ahead
        this.tryRobotStepOrJump(r, dir);
      }
    }

    if (r.onGround) this.snapRobotToFloor(r);
    return applied;
  }

  private robotBodyHitsWall(r: RobotUnit): boolean {
    const rad = r.radius;
    const feet = r.position.y;
    // Body starts slightly above feet so pure floors don't count as walls
    const min = new THREE.Vector3(r.position.x - rad, feet + 0.18, r.position.z - rad);
    const max = new THREE.Vector3(r.position.x + rad, feet + 1.45, r.position.z + rad);
    for (const c of this.colliders) {
      // Skip surfaces we're standing on (tops at/near feet) — not climbable risers
      if (c.max.y <= feet + 0.12) continue;
      if (aabbOverlap(min, max, c.min, c.max)) return true;
    }
    return false;
  }

  private resolveRobotVertical(r: RobotUnit) {
    const rad = r.radius;
    const min = new THREE.Vector3(r.position.x - rad, r.position.y - 0.05, r.position.z - rad);
    const max = new THREE.Vector3(r.position.x + rad, r.position.y + 1.55, r.position.z + rad);
    let grounded = false;
    for (const c of this.colliders) {
      if (!aabbOverlap(min, max, c.min, c.max)) continue;
      // Land on top when falling / resting
      if (r.vy <= 0.05 && r.position.y + 0.25 >= c.max.y - 0.2 && r.position.y <= c.max.y + 0.35) {
        r.position.y = c.max.y;
        r.vy = 0;
        grounded = true;
      } else if (r.vy > 0 && r.position.y + 1.45 > c.min.y && r.position.y + 0.4 < c.min.y) {
        // Head bump
        r.position.y = c.min.y - 1.5;
        r.vy = 0;
      }
    }
    r.onGround = grounded;
  }

  private robotJump(r: RobotUnit) {
    r.vy = ROBOT.robotJumpVel;
    r.onGround = false;
    r.jumpCd = ROBOT.robotJumpCooldown;
  }

  /**
   * Climb short risers (stairs / curbs) or jump half-walls.
   * Only considers standable tops in a climb window — never ceilings / full walls.
   */
  private tryRobotStepOrJump(r: RobotUnit, dir: THREE.Vector3): boolean {
    const probeDist = r.radius + 0.4;
    const samples = [
      r.position.clone().addScaledVector(dir, probeDist),
      r.position.clone().addScaledVector(dir, probeDist * 0.55),
      r.position
        .clone()
        .addScaledVector(dir, probeDist)
        .add(new THREE.Vector3(-dir.z * 0.25, 0, dir.x * 0.25)),
      r.position
        .clone()
        .addScaledVector(dir, probeDist)
        .add(new THREE.Vector3(dir.z * 0.25, 0, -dir.x * 0.25)),
    ];

    let bestTop = -Infinity;
    const feet = r.position.y;
    for (const ahead of samples) {
      for (const c of this.colliders) {
        if (ahead.x < c.min.x || ahead.x > c.max.x || ahead.z < c.min.z || ahead.z > c.max.z) continue;
        const rise = c.max.y - feet;
        // Climb window only — skip floors under us and tall walls / ceilings
        if (rise <= 0.06 || rise > ROBOT.robotMaxClimb) continue;
        if (c.max.y > bestTop) bestTop = c.max.y;
      }
    }
    if (bestTop === -Infinity) return false;

    const rise = bestTop - feet;
    if (rise <= ROBOT.robotStepHeight) {
      r.position.y = bestTop + 0.02;
      r.vy = 0;
      r.onGround = true;
      return true;
    }
    // Need a jump to clear
    this.robotJump(r);
    return true;
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
    const playerFeet = playerPos.clone();
    playerFeet.y -= 0.4;

    for (const r of this.robots) {
      if (r.phase === 'husk') continue;
      r.attackCd = Math.max(0, r.attackCd - dt);
      r.boltCd = Math.max(0, r.boltCd - dt);
      r.repairCd = Math.max(0, r.repairCd - dt);
      r.tickRepair(dt);

      if (r.phase === 'disabled') {
        r.mode = 'disabled';
        r.tickAnim(dt, false, 'disabled');
        if (r.onGround) this.snapRobotToFloor(r);
        continue;
      }

      if (r.phase === 'ally') {
        this.updateAlly(r, dt, playerFeet);
        // snap only when grounded — airborne jump/fall handled inside moveRobot
        if (r.onGround) this.snapRobotToFloor(r);
        continue;
      }

      // ——— Hostile AI ———
      const dist = r.position.distanceTo(playerFeet);
      r.mesh.lookAt(playerFeet.x, r.position.y, playerFeet.z);

      // Self-destruct fuse when very close
      if (r.mode === 'fuse') {
        r.fuseT += dt;
        r.tickAnim(dt, false, 'fuse');
        if (dist > ROBOT.fuseCancelRange) {
          r.mode = 'chase';
          r.fuseT = 0;
          this.toast('Self-destruct cancelled — frame resumes pursuit.');
        } else if (r.fuseT >= ROBOT.fuseDuration) {
          this.detonateRobot(r);
        }
        if (r.onGround) this.snapRobotToFloor(r);
        continue;
      }

      // Bolt windup
      if (r.mode === 'windup_bolt') {
        r.windupT -= dt;
        r.tickAnim(dt, false, 'windup_bolt');
        if (r.windupT <= 0) {
          r.mode = 'chase';
          r.boltCd = ROBOT.boltCd;
          this.fireBolt(r, playerFeet);
        }
        if (r.onGround) this.snapRobotToFloor(r);
        continue;
      }

      // Start fuse if in melee bubble
      if (dist < ROBOT.fuseTriggerRange && dist > 0.3) {
        r.mode = 'fuse';
        r.fuseT = 0;
        this.toast('⚠ SELF-DESTRUCT ARMED — back away!');
        r.tickAnim(dt, false, 'fuse');
        if (r.onGround) this.snapRobotToFloor(r);
        continue;
      }

      // Start bolt windup on cooldown when mid range
      if (r.boltCd <= 0 && dist > 2.5 && dist < 14) {
        r.mode = 'windup_bolt';
        r.windupT = ROBOT.boltWindup;
        r.tickAnim(dt, false, 'windup_bolt');
        if (r.onGround) this.snapRobotToFloor(r);
        continue;
      }

      // Chase (slow) + separation so hostiles don't stack + wall collision
      let moving = false;
      const wish = new THREE.Vector3();
      if (dist < 18 && dist > ROBOT.fuseTriggerRange + 0.15) {
        const dir = playerFeet.clone().sub(r.position);
        dir.y = 0;
        if (dir.lengthSq() > 0.01) {
          dir.normalize();
          const sep = this.separation(r, ROBOT.enemySeparateRadius, ROBOT.enemySeparateStrength, 'hostile');
          wish.copy(dir).add(sep);
        }
      } else {
        const sep = this.separation(r, ROBOT.enemySeparateRadius, ROBOT.enemySeparateStrength, 'hostile');
        if (sep.lengthSq() > 0.01) wish.copy(sep);
      }
      if (wish.lengthSq() > 0.01) {
        const applied = this.moveRobot(r, wish, ROBOT.chaseSpeed, dt);
        moving = applied.lengthSq() > 1e-6 || !r.onGround;
        if (moving && r.onGround) this.faceMoveDir(r, applied);
      }
      r.mode = 'chase';
      r.tickAnim(dt, moving, 'chase');
      if (r.onGround) this.snapRobotToFloor(r);
    }

    // Pickup orbs
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

  /**
   * Soft push away from other robots so units don't stack.
   * kind: who to avoid (allies only / hostiles only / both active bodies)
   */
  private separation(
    self: RobotUnit,
    radius: number,
    strength: number,
    kind: 'ally' | 'hostile' | 'all',
  ): THREE.Vector3 {
    const push = new THREE.Vector3();
    for (const o of this.robots) {
      if (o === self || o.phase === 'husk' || o.phase === 'disabled') continue;
      if (kind === 'ally' && o.phase !== 'ally') continue;
      if (kind === 'hostile' && o.phase !== 'active') continue;
      const d = self.position.distanceTo(o.position);
      if (d < 0.01 || d > radius) continue;
      const away = self.position.clone().sub(o.position);
      away.y = 0;
      const falloff = 1 - d / radius;
      away.normalize().multiplyScalar(strength * falloff * falloff);
      push.add(away);
    }
    return push;
  }

  private faceMoveDir(r: RobotUnit, move: THREE.Vector3) {
    if (move.lengthSq() < 0.0004) return;
    r.faceDir.copy(move).setY(0).normalize();
    const look = r.position.clone().add(r.faceDir);
    r.mesh.lookAt(look.x, r.position.y, look.z);
  }

  private updateAlly(r: RobotUnit, dt: number, playerFeet: THREE.Vector3) {
    r.mode = 'ally';
    const dist = r.position.distanceTo(playerFeet);
    let moving = false;
    const wish = new THREE.Vector3();

    // Hysteresis leash — no twitching at one threshold
    if (!r.returning && dist > ROBOT.allyLeashHard) r.returning = true;
    if (r.returning && dist < ROBOT.allyResumeWander) r.returning = false;

    // Idle only when not returning and not in combat
    if (r.idleT > 0 && !r.returning) {
      r.idleT -= dt;
      const sep = this.separation(r, ROBOT.separateRadius, ROBOT.separateStrength, 'ally');
      if (sep.lengthSq() > 0.05) {
        const applied = this.moveRobot(r, sep, ROBOT.allySpeed * 0.4, dt);
        if (applied.lengthSq() > 1e-6) {
          this.faceMoveDir(r, applied);
          moving = true;
        }
      } else {
        const look = r.position.clone().add(r.faceDir);
        r.mesh.lookAt(look.x, r.position.y, look.z);
      }
      if (dist > ROBOT.allyLeashHard * 0.9) r.idleT = 0;
      else {
        r.tickAnim(dt, moving, 'ally');
        this.allyCombatAndRepair(r, dt, playerFeet);
        if (r.onGround) this.snapRobotToFloor(r);
        return;
      }
    }

    r.nextIdleRoll -= dt;
    if (r.nextIdleRoll <= 0) {
      r.nextIdleRoll = 2.8 + Math.random() * 4;
      if (!r.returning && dist < ROBOT.allyLeashComfort && Math.random() < ROBOT.allyIdleChance) {
        r.idleT = ROBOT.allyIdleMin + Math.random() * (ROBOT.allyIdleMax - ROBOT.allyIdleMin);
      }
    }

    let foe: RobotUnit | null = null;
    let fd = 6;
    for (const o of this.robots) {
      if (o.phase !== 'active') continue;
      const d = o.position.distanceTo(r.position);
      if (d < fd) {
        fd = d;
        foe = o;
      }
    }

    let speed: number = ROBOT.allyWanderSpeed;

    if (foe && fd < 7.5) {
      if (fd > 1.5) {
        const toward = foe.position.clone().sub(r.position);
        toward.y = 0;
        if (toward.lengthSq() > 0.01) wish.add(toward.normalize());
      }
      speed = ROBOT.allySpeed * 0.95;
      r.mesh.lookAt(foe.position.x, r.position.y, foe.position.z);
    } else if (r.returning) {
      // Steady catch-up until inside resumeWander — no flip-flop
      const toward = playerFeet.clone().sub(r.position);
      toward.y = 0;
      if (toward.lengthSq() > 0.01) wish.add(toward.normalize());
      speed = ROBOT.allySpeed;
      // If player is upstairs and we're close in XZ, bias into stairs/walls to trigger step/jump
      const horiz = Math.hypot(playerFeet.x - r.position.x, playerFeet.z - r.position.z);
      if (playerFeet.y > r.position.y + 0.45 && horiz < 6 && r.onGround && r.jumpCd <= 0) {
        // Prefer world stairs zone near courtyard upper (nudge if player is higher)
        if (horiz < 1.2) {
          // Already under player — hop straight up
          this.robotJump(r);
        }
      }
    } else {
      // Autonomous wander
      r.wanderTimer -= dt;
      if (r.wanderTimer <= 0) {
        r.wanderTimer = 1.4 + Math.random() * 3.2;
        r.wanderAngle += (Math.random() - 0.5) * 1.6;
      }
      const wander = new THREE.Vector3(Math.cos(r.wanderAngle), 0, Math.sin(r.wanderAngle));

      if (dist < 1.5) {
        const away = r.position.clone().sub(playerFeet);
        away.y = 0;
        if (away.lengthSq() > 0.01) wander.addScaledVector(away.normalize(), 0.5);
      }
      // Very mild bias when past comfort but not yet "returning"
      if (dist > ROBOT.allyLeashComfort && dist < ROBOT.allyLeashHard) {
        const t = (dist - ROBOT.allyLeashComfort) / (ROBOT.allyLeashHard - ROBOT.allyLeashComfort);
        const toward = playerFeet.clone().sub(r.position);
        toward.y = 0;
        if (toward.lengthSq() > 0.01) wander.addScaledVector(toward.normalize(), 0.15 + t * 0.35);
      }

      if (wander.lengthSq() > 0.01) wish.add(wander.normalize());
      speed = ROBOT.allyWanderSpeed;
    }

    const sep = this.separation(r, ROBOT.separateRadius, ROBOT.separateStrength, 'ally');
    sep.add(this.separation(r, ROBOT.enemySeparateRadius * 0.9, 1.4, 'hostile'));
    wish.add(sep);

    if (wish.lengthSq() > 0.02) {
      const applied = this.moveRobot(r, wish, speed, dt);
      if (applied.lengthSq() > 1e-6) {
        moving = true;
        if (!(foe && fd < 2.2)) this.faceMoveDir(r, applied);
      }
    }

    this.allyCombatAndRepair(r, dt, playerFeet);
    r.tickAnim(dt, moving, 'ally');
  }

  private allyCombatAndRepair(r: RobotUnit, dt: number, playerFeet: THREE.Vector3) {
    let foe: RobotUnit | null = null;
    let fd = 6;
    for (const o of this.robots) {
      if (o.phase !== 'active') continue;
      const d = o.position.distanceTo(r.position);
      if (d < fd) {
        fd = d;
        foe = o;
      }
    }
    if (foe && fd < 1.55 && r.attackCd <= 0) {
      r.attackCd = 0.9;
      foe.aggro = true;
      const res = foe.applyArc(12, 18);
      if (res === 'disabled') this.toast('Ally knocked a frame out!');
      else if (res === 'scrambled') this.toast('Ally scrambled a frame!');
    }

    if (r.repairCd <= 0) {
      for (const o of this.robots) {
        if (o === r || o.phase !== 'ally') continue;
        if (o.position.distanceTo(r.position) < 3.2 && o.hp < o.maxHp) {
          o.hp = Math.min(o.maxHp, o.hp + 8);
          r.repairCd = 1.1;
        }
      }
      if (r.position.distanceTo(playerFeet) < 3.2 && this.health < 100) {
        this.health = Math.min(100, this.health + 5);
        r.repairCd = 1.1;
      }
    }
    void dt;
  }

  private fireBolt(r: RobotUnit, target: THREE.Vector3) {
    const dir = target.clone().sub(r.position);
    dir.y = 0.2;
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    const bolt = new SparkBolt(r.position.clone(), dir);
    this.bolts.push(bolt);
    this.scene.add(bolt.mesh);
  }

  private updateBolts(dt: number) {
    const target = this.camera.position.clone();
    const alive: SparkBolt[] = [];
    for (const b of this.bolts) {
      const ok = b.update(dt, target);
      if (!ok) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        continue;
      }
      // Hit player
      if (b.mesh.position.distanceTo(this.camera.position) < 0.7 && this.invuln <= 0) {
        this.hurtPlayer(b.damage);
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        this.toast('Spark bolt hit!');
        continue;
      }
      // Hit wall roughly (out of map bounds / below ground)
      if (b.mesh.position.y < -1 || b.mesh.position.y > 12) {
        this.scene.remove(b.mesh);
        continue;
      }
      alive.push(b);
    }
    this.bolts = alive;
  }

  private detonateRobot(r: RobotUnit) {
    const pos = r.position.clone();
    const blast = createBlastFx(pos);
    this.blasts.push(blast);
    this.scene.add(blast);

    const dist = pos.distanceTo(this.camera.position);
    if (dist < ROBOT.blastRadius && this.invuln <= 0) {
      const falloff = 1 - dist / ROBOT.blastRadius;
      this.hurtPlayer(ROBOT.blastDamage * (0.45 + 0.55 * falloff));
      this.toast('Self-destruct blast!');
    }
    // Splash damage to nearby hostiles
    for (const o of this.robots) {
      if (o === r || o.phase !== 'active') continue;
      if (o.position.distanceTo(pos) < ROBOT.blastRadius) {
        o.applyArc(35, 40);
      }
    }

    // Detonation destroys the frame as husk with reduced scrap (no player scrap)
    r.setPhase('husk');
    const husk = createHusk(this.level.mats, pos);
    this.scene.add(husk);
    this.husks.push(husk);
    this.scene.remove(r.mesh);
    this.flash('Frame detonated');
  }

  private updateBlasts(dt: number) {
    const keep: THREE.Group[] = [];
    for (const b of this.blasts) {
      b.userData.life -= dt;
      const life = b.userData.life as number;
      const max = b.userData.maxLife as number;
      const t = 1 - life / max;
      const scale = 0.5 + t * ROBOT.blastRadius * 2.2;
      b.scale.setScalar(scale);
      const sphere = b.children[0] as THREE.Mesh;
      if (sphere?.material) {
        const m = sphere.material as THREE.MeshBasicMaterial;
        m.opacity = Math.max(0, 0.9 * (1 - t));
      }
      if (life > 0) keep.push(b);
      else this.scene.remove(b);
    }
    this.blasts = keep;
  }

  private hurtPlayer(amount: number) {
    if (this.invuln > 0) return;
    this.health -= amount;
    this.invuln = 0.55;
    if (this.health <= 0) {
      this.health = 100;
      this.camera.position.set(
        this.level.spawn.x,
        this.level.spawn.y + PLAYER_H * 0.9 + 0.2,
        this.level.spawn.z,
      );
      this.safePos.copy(this.camera.position);
      this.velocity.set(0, 0, 0);
      this.toast('Integrity failed — returned to annex door.');
    }
  }

  private snapRobotToFloor(r: RobotUnit) {
    // Never cancel a jump / fall with a snap
    if (!r.onGround || r.vy > 0.2) {
      if (!r.onGround) this.resolveRobotVertical(r);
      return;
    }
    const x = r.position.x;
    const z = r.position.z;
    const rad = r.radius * 0.65;
    let bestY = -Infinity;
    for (const c of this.colliders) {
      if (x + rad < c.min.x || x - rad > c.max.x || z + rad < c.min.z || z - rad > c.max.z) continue;
      // Standable tops near current feet (not ceilings far above)
      if (c.max.y <= r.position.y + 0.4 && c.max.y >= r.position.y - 1.4) {
        if (c.max.y > bestY) bestY = c.max.y;
      }
    }
    if (bestY > -Infinity) {
      r.position.y = bestY;
      r.vy = 0;
      r.onGround = true;
    } else if (r.position.y < -1) {
      r.position.y = 0;
      r.vy = 0;
      r.onGround = true;
    }
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
