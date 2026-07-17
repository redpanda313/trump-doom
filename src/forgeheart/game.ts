/**
 * ForgeHeart: Gift of the Brass Gods — Tutorial (Brother's Workshop)
 * Solid 3D platforming; separate product from Trump Doom.
 */

import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import {
  buildBrotherWorkshop,
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
import { ForgeAudio } from './audio';
import { buildSkyRaceway, nearestOnPath, type RacewayBuilt } from './raceway';
import { Surfboard, FollowerBoard, BOARD } from './surfboard';
import {
  writeSlot,
  emptySave,
  LEVEL_NAMES,
  type ForgeSaveData,
  type LevelId,
  type TutorialPhaseSave,
} from './save';

export interface GameStartOptions {
  slot: number;
  /** null = new game on that slot */
  save: ForgeSaveData | null;
}

const GRAVITY = 28;
const MOVE_SPEED = 7;
const JUMP_VEL = Math.sqrt(2 * GRAVITY * JUMP_H);

type Weapon = 'hand' | 'wrench';

/** Tutorial progression */
type TutorialPhase =
  | 'explore' // lab, hand only, brother disabled
  | 'rebuild' // scrapped brother — gather trays
  | 'siege' // ally online, demons banging
  | 'breach' // door open, fight 2 demons
  | 'escape' // get to the boat
  | 'won'
  | 'race'; // sky city surfboard leg

export class ForgeHeartGame {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: PointerLockControls;
  private clock = new THREE.Clock();
  private audio = new ForgeAudio();

  private level: LevelBuilt;
  private colliders: Collider[] = [];
  private velocity = new THREE.Vector3();
  private onGround = false;
  private keys = new Set<string>();

  private health = 100;
  private plasma = 100;
  private brass = 0;
  private gears = 0;
  private weapon: Weapon = 'hand';
  private wrenchUnlocked = false;
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
  private helpEl: HTMLElement | null = null;
  private msg = '';
  private msgT = 0;

  private fireHeld = false;
  private safePos = new THREE.Vector3();
  private safeTimer = 0;
  private allyStarveT = 0;

  // ——— Tutorial state ———
  private tutorial: TutorialPhase = 'explore';
  private traysCollected = 0;
  private bangCount = 0;
  private bangTimer = 0;
  private readonly bangsTotal = 10;
  private readonly bangInterval = 3;
  /** Arc wrench hits needed to force the lab door during siege */
  private doorHp = 4;
  private readonly doorHpMax = 4;
  private brotherScrapped = false;
  private hadAllyOnce = false;
  private objective = 'Read the lab. Wake Elias with the Hand (1) — do not scrap him.';

  // ——— Race / surfboard ———
  private raceway: RacewayBuilt | null = null;
  private board: Surfboard | null = null;
  private eliasBoard: FollowerBoard | null = null;
  private raceActive = false;
  private raceFinished = false;
  private checkpointIdx = 0;
  private lastCheckpointPos = new THREE.Vector3();
  private lastCheckpointYaw = 0;
  private speedBlurEl: HTMLElement | null = null;
  private camPitchOffset = 0;
  private whooshCursor = 0;
  private bringEliasToRace = false;
  private activeSlot = 0;
  private pendingLoad: ForgeSaveData | null = null;
  private autosaveT = 0;
  private disposed = false;
  /** Prevent respawn spam when race floor was missing */
  private respawnCd = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    options: GameStartOptions = { slot: 0, save: null },
  ) {
    this.activeSlot = options.slot;
    this.pendingLoad = options.save;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(70, canvas.clientWidth / canvas.clientHeight, 0.08, 120);
    this.controls = new PointerLockControls(this.camera, canvas);

    // Warm lab interior; cooler open sky outside
    // Cool sky haze — far fog so painted backdrops dissolve instead of cutting off hard
    this.scene.background = new THREE.Color(0x7a92a8);
    this.scene.fog = new THREE.Fog(0x8a9eb0, 28, 95);

    const hemi = new THREE.HemisphereLight(0xffe8c8, 0x3a3028, 0.6);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.15);
    sun.position.set(8, 28, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    this.scene.add(sun);

    this.level = buildBrotherWorkshop();
    this.scene.add(this.level.group);
    this.colliders = [...this.level.colliders];
    this.interactables = this.level.interactables;
    this.exit = this.level.exit.clone();

    // Only Elias — deactivated, leaned on the workstation
    const brother = new RobotUnit(this.level.mats, this.level.anchors.brotherSpot.clone());
    brother.isBrother = true;
    brother.displayName = 'Elias';
    brother.setPhase('disabled');
    brother.scramble = 100;
    brother.scrambled = true;
    this.robots.push(brother);
    this.scene.add(brother.mesh);

    this.camera.position.set(
      this.level.spawn.x,
      this.level.spawn.y + PLAYER_H * 0.9 + 0.2,
      this.level.spawn.z,
    );
    this.safePos.copy(this.camera.position);

    this.hpFill = document.getElementById('resolve-fill')!;
    this.plasmaFill = document.getElementById('voice-fill')!;
    this.weaponEl = document.getElementById('weapon-name')!;
    this.statsEl = document.getElementById('stats-line')!;
    this.locEl = document.getElementById('location-line');
    this.toastEl = document.getElementById('plaque-toast')!;
    this.convertEl = document.getElementById('convert-toast')!;
    this.helpEl = document.querySelector('.help-line');
    this.speedBlurEl = document.getElementById('speed-blur');
    const face = document.getElementById('resolve-face');
    if (face) face.textContent = '⚙️';
    document.querySelectorAll('.hud-bar .label').forEach((el) => {
      if (el.textContent === 'VOICE' || el.textContent === 'PLASMA') el.textContent = 'PLASMA';
      if (el.textContent === 'RESOLVE' || el.textContent === 'INTEGRITY') el.textContent = 'INTEGRITY';
    });

    this.bindInput();
    window.addEventListener('resize', () => this.onResize());
    this.setHelp('WASD look · E read / interact · 1 Hand reprogram · Space jump');
  }

  private bindInput() {
    window.addEventListener('keydown', (e) => {
      const wasDown = this.keys.has(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
      if (e.code === 'Digit1' && !this.board?.mounted) this.weapon = 'hand';
      if (e.code === 'Digit2' && !this.board?.mounted) {
        if (this.wrenchUnlocked) this.weapon = 'wrench';
        else this.toast('Arc wrench is on the wall rack — claim it when the door fails.');
      }
      if (e.code === 'KeyE') this.tryInteract();
      // Jump while boarded (Space) — Shift is powerslide
      if (this.board?.mounted && !wasDown && (e.code === 'Space' || e.code === 'KeyJ')) {
        e.preventDefault();
        this.board.requestJump();
      }
      if (e.code === 'Escape') {
        this.setPaused(!this.paused);
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    this.canvas.addEventListener('click', () => {
      if (!this.paused && !this.disposed) this.controls.lock();
    });
  }

  setFireHeld(v: boolean) {
    this.fireHeld = v;
  }
  setAltHeld(_v: boolean) {}

  isPaused() {
    return this.paused;
  }

  setPaused(p: boolean) {
    this.paused = p;
    const menu = document.getElementById('pause-menu');
    const label = document.getElementById('pause-slot-label');
    if (label) {
      const lvl = this.raceActive ? LEVEL_NAMES.sky_race : LEVEL_NAMES.workshop;
      label.textContent = `Slot ${this.activeSlot + 1} · ${lvl} · Esc to resume`;
    }
    if (p) {
      this.controls.unlock();
      menu?.classList.remove('hidden');
    } else {
      menu?.classList.add('hidden');
      if (!this.disposed) this.canvas.requestPointerLock();
    }
  }

  /** Public toast for main.ts save button */
  toastPublic(t: string, sec = 2) {
    this.toast(t, sec);
  }

  private setHelp(t: string) {
    if (this.helpEl) this.helpEl.textContent = t;
  }

  /** Build snapshot for the active slot (named by current level). */
  buildSaveData(): ForgeSaveData {
    const levelId: LevelId = this.raceActive ? 'sky_race' : 'workshop';
    const phase = this.tutorial as TutorialPhaseSave;
    return {
      version: 1,
      levelId,
      levelName: LEVEL_NAMES[levelId],
      savedAt: Date.now(),
      health: this.health,
      plasma: this.plasma,
      brass: this.brass,
      gears: this.gears,
      wrenchUnlocked: this.wrenchUnlocked,
      bringElias: this.bringEliasToRace || this.hadAllyOnce,
      tutorialPhase: this.raceActive ? 'race' : phase,
      raceCheckpoint: this.checkpointIdx,
      raceFinished: this.raceFinished,
    };
  }

  saveProgress() {
    const data = this.buildSaveData();
    writeSlot(this.activeSlot, data);
    this.toast(`Saved · Slot ${this.activeSlot + 1} · ${data.levelName}`, 2.5);
  }

  dispose() {
    this.disposed = true;
    this.paused = false;
    try {
      this.controls.unlock();
    } catch {
      /* ignore */
    }
    try {
      this.renderer.dispose();
    } catch {
      /* ignore */
    }
  }

  async start() {
    await this.audio.resume();

    // New game: seed empty save on slot
    if (!this.pendingLoad) {
      writeSlot(this.activeSlot, emptySave('workshop'));
      this.flash('The Workshop — Elias waits on the bench');
      this.toast(
        'Your brother is gone. The frame holds a talisman of his. Walk the lab. Read. Then use the Hand (1) to wake him — not scrap (E).',
        8,
      );
      this.controls.lock();
      return;
    }

    const s = this.pendingLoad;
    this.health = s.health;
    this.plasma = s.plasma;
    this.brass = s.brass;
    this.gears = s.gears;
    this.wrenchUnlocked = s.wrenchUnlocked;
    this.bringEliasToRace = s.bringElias;
    this.hadAllyOnce = s.bringElias;

    if (s.levelId === 'sky_race' || s.tutorialPhase === 'race' || s.tutorialPhase === 'won') {
      this.flash(`Continue — ${LEVEL_NAMES.sky_race}`);
      this.toast(`Loading ${s.levelName}…`, 3);
      this.enterRaceway(s);
      return;
    }

    // Workshop continue — restore gear; open late-game states if needed
    const phase = s.tutorialPhase;
    if (phase === 'breach' || phase === 'escape' || phase === 'siege' || phase === 'rebuild' || phase === 'explore') {
      this.tutorial = phase === 'rebuild' ? 'rebuild' : phase === 'explore' ? 'explore' : phase;
    } else {
      this.tutorial = 'explore';
    }
    if (s.wrenchUnlocked) {
      for (const it of this.interactables) {
        if (it.type === 'wrench_pickup') {
          it.mesh.visible = true;
          it.opened = false;
        }
      }
    }
    if (phase === 'breach' || phase === 'escape') {
      this.tutorial = 'siege';
      this.breachDoor('forced');
      if (phase === 'escape') {
        this.tutorial = 'escape';
        this.objective = 'Reach the escape skiff on the sky dock';
      }
    } else if (phase === 'siege') {
      this.beginSiege();
    }

    this.flash(`Continue — ${s.levelName}`);
    this.toast(`Slot ${this.activeSlot + 1} · ${s.levelName}. Esc to save.`, 4);
    this.controls.lock();
  }

  update(_dtExternal?: number) {
    if (this.disposed) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.paused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    // won freezes only the brief skiff cinematic before race loads
    if (this.won && !this.raceActive) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.msgT -= dt;
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.audio.tickWhooshCd(dt);

    this.autosaveT += dt;
    if (this.autosaveT > 45) {
      this.autosaveT = 0;
      writeSlot(this.activeSlot, this.buildSaveData());
    }

    if (this.raceActive) {
      this.tickRace(dt);
    } else {
      this.tickAllyPower(dt);
      this.tickTutorial(dt);
      this.updateInteractPrompts();
      // Wind swells when outside the lab door (z past ~8)
      const outdoor = Math.max(0, Math.min(1, (this.camera.position.z - 7.5) / 6));
      this.audio.setWind(outdoor);

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
    }

    // HUD
    this.hpFill.style.width = `${this.health}%`;
    this.plasmaFill.style.width = `${this.plasma}%`;
    const pct = document.getElementById('resolve-pct');
    if (pct) pct.textContent = String(Math.round(this.health));
    if (this.raceActive && this.board?.mounted) {
      const sp = Math.round(this.board.speed);
      const max = BOARD.maxSpeed;
      let mode = 'SKY SURF';
      if (this.board.isGrinding()) mode = 'GRIND';
      else if (this.board.isPowersliding())
        mode = `SLIDE ${Math.round(this.board.slideCharge * 100)}%`;
      this.weaponEl.textContent = mode;
      this.statsEl.textContent = `${this.objective} · ${sp}/${max} u/s`;
      if (this.locEl) this.locEl.textContent = 'Sky City · Racetrack';
    } else if (this.raceActive) {
      this.weaponEl.textContent = 'APPROACH BOARD';
      this.statsEl.textContent = this.objective;
      if (this.locEl) this.locEl.textContent = 'Sky City · Boarding';
    } else {
      this.weaponEl.textContent =
        this.weapon === 'hand'
          ? 'REPROGRAM HAND'
          : this.wrenchUnlocked
            ? 'ARC WRENCH'
            : 'HAND ONLY';
      const allies = this.countPoweredAllies();
      const eq = this.plasmaEquilibrium(allies);
      const net = this.plasmaNetPerSec(allies);
      const nearEq = Math.abs(this.plasma - eq) < 1.5;
      const rateLabel =
        allies === 0
          ? 'PLASMA STEADY'
          : nearEq
            ? `EQ ${eq}%`
            : `${net >= 0 ? '+' : ''}${net.toFixed(1)}/s →${eq}%`;
      this.statsEl.textContent = `${this.objective} · ${rateLabel}`;
      if (this.locEl) {
        const z = this.camera.position.z;
        this.locEl.textContent =
          z > 9 ? 'Sky Docks · Escape' : 'Voss Workshop · Tutorial';
      }
    }

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
      if (!this.wrenchUnlocked) {
        this.toast('You only have the Hand for now.');
        this.weapon = 'hand';
        return;
      }
      this.atkCd = 0.36;
      this.plasma = Math.max(0, this.plasma - ROBOT.arcPlasmaCost);
      this.spawnArcFx();
      const origin = this.camera.position.clone();
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      // Optional: force the lab door open early during the siege
      if (this.tryBashLabDoor(origin, dir)) return;
      for (const r of this.robots) {
        if (r.phase !== 'active') continue;
        const to = r.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(origin);
        const dist = to.length();
        if (dist > 2.5 || dist < 0.01) continue;
        to.normalize();
        if (to.dot(dir) < 0.52) continue;
        const res = r.applyArc(ROBOT.arcDamage, ROBOT.scramblePerHit);
        if (res === 'disabled') {
          this.flash('KNOCKED OUT — eyes dark. Hand reprogram or E scrap');
        } else if (res === 'scrambled') {
          this.flash('SCRAMBLE FULL — Hand (1) to rewrite while it still walks');
        }
      }
    } else {
      // Reprogram: scrambled OR disabled
      let best: RobotUnit | null = null;
      let bestD = 2.6;
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
        this.toast(
          this.tutorial === 'explore' || this.tutorial === 'rebuild'
            ? 'Stand close to the deactivated frame. Click with Hand (1) to wake a soul.'
            : 'Need a scramble-full or knocked-out frame nearby.',
        );
        return;
      }
      const allyCount = this.countPoweredAllies();
      if (allyCount >= ROBOT.maxAllies) {
        this.atkCd = 0.35;
        this.toast(`Power grid full — only ${ROBOT.maxAllies} allies.`);
        return;
      }
      const reprogramCost = best.isBrother ? 12 : 16;
      if (this.plasma < reprogramCost) {
        this.atkCd = 0.35;
        this.toast(`Need ${reprogramCost} plasma (have ${Math.floor(this.plasma)}).`);
        return;
      }
      this.atkCd = 0.5;
      this.plasma -= reprogramCost;
      best.setPhase('ally');
      best.returning = false;
      best.vy = 0;
      best.onGround = true;
      this.audio.playReprogram();
      if (best.isBrother) {
        this.flash('ELIAS — the talisman finds him. Green eyes. Your brother.');
        this.toast('Plasma will settle near three-quarters with one ally. Stay close to him.', 5);
      } else {
        const eq = this.plasmaEquilibrium(allyCount + 1);
        this.flash(`REPROGRAMMED · grid settles ~${eq}%`);
      }
      this.onAllyCreated();
    }
  }

  private onAllyCreated() {
    if (this.hadAllyOnce) return;
    this.hadAllyOnce = true;
    this.bringEliasToRace = true;
    if (this.tutorial === 'explore' || this.tutorial === 'rebuild') {
      this.beginSiege();
    }
  }

  private beginSiege() {
    this.tutorial = 'siege';
    this.bangCount = 0;
    this.bangTimer = 1.2;
    this.doorHp = this.doorHpMax;
    this.audio.setTension(0.55);
    this.objective = 'Something is at the door…';
    this.setHelp('Grab Arc Wrench (E) · wait out the bangs — or bash the door open with 2');
    this.flash('A BANG at the lab door —');
    this.toast(
      'Demon-ridden frames. Hold the workshop — or take the Arc Wrench and force the door open early.',
      5,
    );
    // Reveal wrench on the rack
    for (const it of this.interactables) {
      if (it.type === 'wrench_pickup') {
        it.mesh.visible = true;
        if (it.prompt) it.prompt.visible = true;
      }
    }
  }

  /**
   * Arc the sealed lab door during siege. Returns true if the swing hit the door.
   * Enough hits force a breach without waiting for all outside bangs.
   */
  private tryBashLabDoor(origin: THREE.Vector3, dir: THREE.Vector3): boolean {
    if (this.tutorial !== 'siege') return false;
    // Intersect ray with door plane (z ≈ 8)
    const doorZ = this.level.anchors.doorSpot.z;
    if (Math.abs(dir.z) < 0.08) return false;
    const t = (doorZ - origin.z) / dir.z;
    if (t < 0.35 || t > 3.4) return false;
    const hit = origin.clone().addScaledVector(dir, t);
    // Door opening bounds (must face the seal, not side walls)
    if (Math.abs(hit.x) > 2.55) return false;
    if (hit.y < 0.15 || hit.y > 3.4) return false;
    // Prefer swinging from inside the lab
    if (origin.z > doorZ + 0.4) return false;

    this.doorHp = Math.max(0, this.doorHp - 1);
    this.audio.playBang(0.45 + (1 - this.doorHp / this.doorHpMax) * 0.5);
    // Visual rattle
    for (const m of this.level.labDoor.meshes) {
      m.position.x += (Math.random() - 0.5) * 0.08;
      m.position.z += (Math.random() - 0.5) * 0.03;
    }

    if (this.doorHp <= 0) {
      this.flash('DOOR BREACHED — you forced it open!');
      this.toast('The seal yields to the arc. Whatever was banging is coming through.', 4);
      this.breachDoor('forced');
      return true;
    }

    const left = this.doorHp;
    this.objective = `Bash the door · ${this.doorHpMax - left}/${this.doorHpMax} arc hits`;
    this.toast(
      left === 1
        ? 'Door almost broken — one more arc!'
        : `Iron rings under the wrench — ${left} hits left.`,
      2,
    );
    return true;
  }

  private tickTutorial(dt: number) {
    if (this.tutorial === 'siege') {
      this.bangTimer -= dt;
      if (this.bangTimer <= 0) {
        this.bangCount++;
        this.bangTimer = this.bangInterval;
        const intensity = 0.55 + (this.bangCount / this.bangsTotal) * 0.55;
        this.audio.playBang(intensity);
        this.audio.setTension(0.4 + (this.bangCount / this.bangsTotal) * 0.6);
        // Rattle door meshes
        for (const m of this.level.labDoor.meshes) {
          m.position.x += (Math.random() - 0.5) * 0.04 * intensity;
        }
        if (this.bangCount === 1) {
          this.toast('BANG. The iron door shudders.', 2);
        } else if (this.bangCount === 5) {
          this.toast('Five strikes. Take the Arc Wrench from the rack (E).', 4);
          this.objective = 'Take the Arc Wrench (E) — the door is failing';
        } else if (this.bangCount === 8) {
          this.toast('Almost through — stand ready with Elias.', 3);
        }
        if (this.bangCount >= this.bangsTotal) {
          this.breachDoor();
        } else {
          this.objective = `Door under assault · ${this.bangCount}/${this.bangsTotal}`;
        }
      }
    }

    if (this.tutorial === 'breach' || this.tutorial === 'escape') {
      const hostiles = this.robots.filter((r) => r.phase === 'active' && r.mesh.visible).length;
      if (hostiles === 0 && this.tutorial === 'breach') {
        this.tutorial = 'escape';
        this.objective = 'Reach the escape skiff on the sky dock';
        this.setHelp('Follow the walkway · E on boat controls to cast off');
        this.flash('Demons down — get to the boat!');
        this.toast('Outside: a floating city. The skiff waits at the end of the brass walkway.', 5);
        this.audio.setTension(0.15);
      }
    }
  }

  private breachDoor(reason: 'timer' | 'forced' = 'timer') {
    if (this.tutorial !== 'siege') return; // already open / not in siege
    this.tutorial = 'breach';
    this.doorHp = 0;
    this.audio.setTension(1);
    this.audio.playBang(1.2);
    // Remove door collision + hide meshes
    for (const m of this.level.labDoor.meshes) {
      m.visible = false;
      m.position.y = -40;
    }
    const doorSet = new Set(this.level.labDoor.colliders);
    this.colliders = this.colliders.filter((c) => !doorSet.has(c));
    // Spawn 2 demon bots
    for (const spot of this.level.anchors.enemySpawns) {
      const r = new RobotUnit(this.level.mats, spot.clone());
      r.displayName = 'Possessed Frame';
      r.setPhase('active');
      r.aggro = true;
      this.robots.push(r);
      this.scene.add(r.mesh);
    }
    this.objective = 'Survive — arc the demons, keep Elias close';
    this.setHelp('2 Wrench · scramble or KO · Hand reprogram optional · flee to the dock if needed');
    if (reason === 'forced') {
      this.flash('YOU OPENED THE DOOR — two demon frames!');
      this.toast('They wear scrap like coats. Fight with Elias or run for the skiff.', 5);
    } else {
      this.flash('THE DOOR GIVES — two demon frames!');
      this.toast('They wear scrap like coats. Arc wrench for combat. Elias will fight beside you.', 5);
    }
    // Auto-offer wrench if not taken
    if (!this.wrenchUnlocked) {
      this.toast('Arc Wrench still on the rack — grab it (E)!', 3);
    }
  }

  private updateInteractPrompts() {
    const pos = this.camera.position;
    for (const it of this.interactables) {
      if (!it.prompt) continue;
      // Trays only when scrapped path active and not collected
      if (it.type === 'tray') {
        const show = this.brotherScrapped && !it.opened && it.mesh.visible;
        it.prompt.visible = show && it.position.distanceTo(pos) < 5;
        if (it.prompt.visible) it.prompt.lookAt(pos);
        continue;
      }
      if (it.type === 'wrench_pickup') {
        const show = !it.opened && it.mesh.visible && !this.wrenchUnlocked;
        it.prompt.visible = show && it.position.distanceTo(pos) < 5;
        if (it.prompt.visible) it.prompt.lookAt(pos);
        continue;
      }
      if (it.type === 'boat') {
        const show = !it.opened && (this.tutorial === 'escape' || this.tutorial === 'breach');
        it.prompt.visible = show && it.position.distanceTo(pos) < 6;
        if (it.prompt.visible) it.prompt.lookAt(pos);
        continue;
      }
      // lore / photo always when near
      if (it.type === 'photo' || it.type === 'note' || it.type === 'plaque') {
        it.prompt.visible = !it.opened && it.position.distanceTo(pos) < 3.5;
        if (it.prompt.visible) it.prompt.lookAt(pos);
      }
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

  /** Rest point for plasma given current ally load (0..3). */
  private plasmaEquilibrium(allyCount: number): number {
    const n = Math.max(0, Math.min(ROBOT.maxAllies, allyCount | 0));
    return ROBOT.plasmaEq[n]!;
  }

  /**
   * Instantaneous dP/dt toward equilibrium.
   * dP/dt = k · (P* − P)  with separate k for regen vs drain.
   */
  private plasmaNetPerSec(allyCount: number, plasma = this.plasma): number {
    const n = Math.max(0, Math.min(ROBOT.maxAllies, allyCount | 0));
    const eq = ROBOT.plasmaEq[n]!;
    const err = eq - plasma;
    if (Math.abs(err) < 0.05) return 0;
    // Below eq → regen k; above eq → drain k (err negative)
    const k = err > 0 ? ROBOT.plasmaRegenK[n]! : ROBOT.plasmaDrainK[n]!;
    return k * err;
  }

  /**
   * Equilibrium attractor — settles at P*(allies), never free-falls to 0
   * unless the player dumps plasma with arcs / reprograms.
   */
  private tickAllyPower(dt: number) {
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
    this.plasma = Math.max(0, Math.min(100, this.plasma + net * dt));

    // Soft snap when very close (stops micro-jitter at the rest point)
    const eq = this.plasmaEquilibrium(n);
    if (Math.abs(this.plasma - eq) < 0.35 && Math.abs(net) < 0.4) {
      this.plasma = eq;
    }

    if (n === 0) {
      this.allyStarveT = 0;
      return;
    }

    // Starvation only if attacks/reprograms emptied the bar (passive never does)
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
    r.setPhase('active');
    r.mode = 'chase';
    r.returning = false;
    r.fuseT = 0;
    const left = this.countPoweredAllies();
    const eq = this.plasmaEquilibrium(left);
    this.flash(`LINK SEVERED — rogue! Grid ${left}/${ROBOT.maxAllies} · settles ~${eq}%`);
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
    if (this.raceActive) {
      this.tryBoardInteract();
      return;
    }
    const pos = this.camera.position;

    // Priority: world interactables near crosshair/proximity
    let bestIt: Interactable | null = null;
    let bestD = 2.8;
    for (const it of this.interactables) {
      if (it.opened) continue;
      if (it.type === 'tray' && (!this.brotherScrapped || !it.mesh.visible)) continue;
      if (it.type === 'wrench_pickup' && (!it.mesh.visible || this.wrenchUnlocked)) continue;
      if (it.type === 'boat' && this.tutorial !== 'escape' && this.tutorial !== 'breach') continue;
      const d = it.position.distanceTo(pos);
      if (d < bestD && d <= it.radius + 0.4) {
        bestIt = it;
        bestD = d;
      }
    }
    if (bestIt) {
      this.useInteractable(bestIt);
      return;
    }

    // Scrap disabled robots (including accidental brother scrap)
    for (const r of this.robots) {
      if (r.phase !== 'disabled') continue;
      if (r.position.distanceTo(pos) < 2.4) {
        this.scrapRobot(r);
        return;
      }
    }
  }

  private useInteractable(it: Interactable) {
    if (it.type === 'photo' || it.type === 'note' || it.type === 'plaque') {
      this.plaque(`${it.title ?? 'Note'}\n\n${it.text ?? ''}`);
      return;
    }
    if (it.type === 'tray' && !it.opened) {
      it.opened = true;
      it.mesh.visible = false;
      if (it.prompt) it.prompt.visible = false;
      this.traysCollected++;
      this.audio.playPickup();
      this.flash(`Part recovered — ${it.title} (${this.traysCollected}/3)`);
      this.objective = `Rebuild Elias — trays ${this.traysCollected}/3`;
      if (this.traysCollected >= 3) this.rebuildBrotherFrame();
      return;
    }
    if (it.type === 'wrench_pickup' && !it.opened) {
      it.opened = true;
      it.mesh.visible = false;
      if (it.prompt) it.prompt.visible = false;
      this.wrenchUnlocked = true;
      this.weapon = 'wrench';
      this.audio.playPickup();
      this.flash('ARC WRENCH — bash the door or wait · plasma per swing');
      this.setHelp(
        this.tutorial === 'siege'
          ? 'Aim at the lab door and swing · or wait for it to fail · 1 Hand'
          : '2 Wrench · 1 Hand · arcs cost plasma · settle back to EQ',
      );
      return;
    }
    if (it.type === 'boat' && !it.opened) {
      if (this.tutorial !== 'escape' && this.tutorial !== 'breach') {
        this.toast('Not yet — the lab door still holds.');
        return;
      }
      // Allow early boat if demons still up but player flees
      it.opened = true;
      this.winTutorial();
      return;
    }
  }

  private scrapRobot(r: RobotUnit) {
    const wasBrother = r.isBrother;
    const bonus = r.scramble >= 100 ? 1.0 : 0.55;
    const b = Math.round(6 * bonus + Math.random() * 4);
    const g = Math.round(2 * bonus + Math.random() * 2);
    this.brass += b;
    this.gears += g;
    r.setPhase('husk');
    const husk = createHusk(this.level.mats, r.position.clone());
    this.scene.add(husk);
    this.husks.push(husk);
    this.scene.remove(r.mesh);

    if (wasBrother && !this.brotherScrapped && !this.hadAllyOnce) {
      this.brotherScrapped = true;
      this.tutorial = 'rebuild';
      this.objective = 'You dismantled him — gather 3 trays to rebuild';
      this.setHelp('E on glowing trays around the workstation · then Hand to wake him');
      this.flash('The talisman frame is scrap —');
      this.toast(
        'No. The trays on the worktables still hold his parts. Gather all three (E), then rebuild.',
        7,
      );
      for (const it of this.interactables) {
        if (it.type === 'tray') {
          it.mesh.visible = true;
          it.opened = false;
          if (it.prompt) it.prompt.visible = true;
        }
      }
      this.audio.playBang(0.3);
    } else {
      this.flash(`Scrapped — +${b} brass, +${g} gears`);
    }
  }

  private rebuildBrotherFrame() {
    const spot = this.level.anchors.brotherSpot.clone();
    const brother = new RobotUnit(this.level.mats, spot);
    brother.isBrother = true;
    brother.displayName = 'Elias';
    brother.setPhase('disabled');
    brother.scramble = 100;
    brother.scrambled = true;
    this.robots.push(brother);
    this.scene.add(brother.mesh);
    this.traysCollected = 0;
    this.brotherScrapped = false;
    for (const it of this.interactables) {
      if (it.type === 'tray') {
        it.mesh.visible = false;
        if (it.prompt) it.prompt.visible = false;
      }
    }
    this.objective = 'Frame rebuilt — Hand (1) to call Elias home';
    this.flash('A new shell stands — the talisman gear is reseated');
    this.toast('Stand close. Hand weapon. Click to reprogram. Speak his name in the plasma.', 6);
    this.audio.playPickup();
  }

  private winTutorial() {
    if (this.won) return;
    this.won = true;
    this.tutorial = 'won';
    this.objective = 'Tutorial complete — sky surf awaits';
    this.audio.setTension(0);
    this.audio.playWin();
    this.flash('SKIFF AWAY — Elias is with you');
    this.toast(
      'Casting off… a plasma surfboard waits in the sky city. Board it to ride the racetrack.',
      5,
    );
    this.setHelp('Loading sky racetrack…');
    // Advance save to next level name before loading
    this.bringEliasToRace = this.bringEliasToRace || this.hadAllyOnce;
    const pre = this.buildSaveData();
    pre.levelId = 'sky_race';
    pre.levelName = LEVEL_NAMES.sky_race;
    pre.tutorialPhase = 'won';
    writeSlot(this.activeSlot, pre);
    window.setTimeout(() => this.enterRaceway(), 2800);
  }

  /** Tear down workshop, load sky city racetrack + surfboard. */
  private enterRaceway(fromSave?: ForgeSaveData | null) {
    // Remove tutorial world
    this.scene.remove(this.level.group);
    for (const r of this.robots) this.scene.remove(r.mesh);
    for (const h of this.husks) this.scene.remove(h);
    for (const b of this.bolts) this.scene.remove(b.mesh);
    for (const bl of this.blasts) this.scene.remove(bl);
    this.robots = [];
    this.husks = [];
    this.bolts = [];
    this.blasts = [];
    this.interactables = [];

    this.raceway = buildSkyRaceway();
    this.scene.add(this.raceway.group);
    this.colliders = [...this.raceway.colliders];
    this.board = new Surfboard(this.raceway.mats, this.raceway.boardSpawn, this.raceway.boardYaw);
    this.scene.add(this.board.mesh);

    if (this.bringEliasToRace) {
      this.eliasBoard = new FollowerBoard(this.raceway.mats);
      this.eliasBoard.position.copy(this.raceway.boardSpawn).add(new THREE.Vector3(-2, 0, -3));
      this.eliasBoard.mesh.position.copy(this.eliasBoard.position);
      this.scene.add(this.eliasBoard.mesh);
    }

    this.scene.background = new THREE.Color(0x6a90b0);
    this.scene.fog = new THREE.Fog(0x8aabcc, 40, 180);

    this.raceActive = true;
    this.raceFinished = fromSave?.raceFinished ?? false;
    this.checkpointIdx = fromSave?.raceCheckpoint ?? 0;
    this.respawnCd = 0;
    this.velocity.set(0, 0, 0);
    this.onGround = true;
    this.camera.fov = BOARD.fovBase;
    this.camera.updateProjectionMatrix();
    this.camera.up.set(0, 1, 0);
    this.applySpeedFx(0, 0);

    // Resolve spawn: always co-locate board + player on solid path height
    let spawnPath = this.raceway.boardSpawn.clone();
    let spawnYaw = this.raceway.boardYaw;
    if (fromSave && fromSave.raceCheckpoint > 0) {
      const cpIdx = Math.min(
        fromSave.raceCheckpoint - 1,
        this.raceway.checkpoints.length - 1,
      );
      const cp = this.raceway.checkpoints[Math.max(0, cpIdx)]!;
      const near = nearestOnPath(this.raceway.path, this.raceway.pathDist, cp.position);
      spawnPath = near.point.clone();
      spawnYaw = near.yaw;
    } else {
      const near = nearestOnPath(
        this.raceway.path,
        this.raceway.pathDist,
        this.raceway.boardSpawn,
      );
      spawnPath = near.point.clone();
      spawnYaw = near.yaw;
    }
    this.lastCheckpointPos.copy(spawnPath);
    this.lastCheckpointYaw = spawnYaw;
    this.placeBoardAndPlayerAt(spawnPath, spawnYaw, false);

    this.tutorial = 'race';
    this.won = false;
    this.objective = this.raceFinished
      ? 'Racetrack complete · board again anytime'
      : 'Approach the humming surfboard · press E to board';
    this.setHelp(
      'E board · W accel · S brake · A/D bank · hold Shift slide · Space jump · E dismount (slow)',
    );
    this.flash(fromSave ? `CONTINUE — ${LEVEL_NAMES.sky_race}` : 'SKY CITY RACETRACK');
    this.toast(
      this.bringEliasToRace
        ? 'Elias rides with you. Hold Shift + A/D to powerslide — release for mini-turbo. Space jumps; hit ramps and rails.'
        : 'Hold Shift + A/D to powerslide (release for boost). Space jump · ramps boost · grind rails.',
      8,
    );
    this.audio.setWind(0.35);
    writeSlot(this.activeSlot, this.buildSaveData());
    this.controls.lock();
  }

  private tickRace(dt: number) {
    if (!this.raceway || !this.board) return;
    this.respawnCd = Math.max(0, this.respawnCd - dt);

    this.board.tickIdle(dt);
    const nearBoard =
      !this.board.mounted && this.camera.position.distanceTo(this.board.position) < 8;

    if (!this.board.mounted) {
      this.audio.setBoardAudio(nearBoard ? 1 : 0.15, 0);
      // Clear any stuck speed-FX from a previous ride
      this.applySpeedFx(0, 0);
      if (this.camera.fov > BOARD.fovBase + 1) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, BOARD.fovBase, 6, dt);
        this.camera.updateProjectionMatrix();
      }
      this.camera.up.set(0, 1, 0);

      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
      else forward.normalize();
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
      // Horizontal step only — vertical handled by path snap (race has no solid colliders)
      this.camera.position.x += this.velocity.x * dt;
      this.camera.position.z += this.velocity.z * dt;
      this.camera.position.y += this.velocity.y * dt;
      this.snapRaceFeetToRoad(dt);

      if (this.camera.position.y < -4 && this.respawnCd <= 0) {
        this.respawnAtCheckpoint(true);
      }
      this.audio.setWind(0.4);
      if (this.eliasBoard) {
        const wait = this.board.position.clone().add(new THREE.Vector3(-2, 0, -2));
        this.eliasBoard.position.lerp(wait, 1 - Math.exp(-3 * dt));
        this.eliasBoard.mesh.position.copy(this.eliasBoard.position);
        this.eliasBoard.mesh.position.y += 0.1;
      }
      return;
    }

    // ——— Mounted ———
    let accel = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) accel += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) accel -= 1;
    let steer = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steer -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steer += 1;
    // Shift only — Ctrl is fire in workshop and was falsely holding slide
    const slideHeld = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

    this.board.tick(
      dt,
      accel,
      steer,
      this.raceway.path,
      this.raceway.pathDist,
      slideHeld,
      this.raceway.ramps,
      this.raceway.rails,
      this.raceway.bumpPoints,
    );

    if (this.eliasBoard) this.eliasBoard.follow(this.board, dt);

    // Chase camera
    const sn = this.board.speedNorm;
    const targetFov = THREE.MathUtils.lerp(BOARD.fovBase, BOARD.fovFast, sn * sn);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5, dt);
    this.camera.updateProjectionMatrix();

    const tipTarget =
      accel > 0.2 ? BOARD.camTipAccel * (0.5 + sn) : accel < -0.2 ? BOARD.camTipBrake : 0;
    this.camPitchOffset = THREE.MathUtils.damp(this.camPitchOffset, tipTarget, 6, dt);

    const back = new THREE.Vector3(-Math.sin(this.board.yaw), 0, -Math.cos(this.board.yaw));
    const camDist = 5.2 + sn * 1.4;
    const camHeight = 2.1 + sn * 0.35 + (this.board.onGround ? 0 : 0.4);
    const ideal = this.board.position
      .clone()
      .addScaledVector(back, camDist)
      .add(new THREE.Vector3(0, camHeight, 0));
    if (this.board.isPowersliding()) {
      const right = new THREE.Vector3(Math.cos(this.board.yaw), 0, -Math.sin(this.board.yaw));
      ideal.addScaledVector(right, this.board.bank * 2.8);
    }
    this.camera.position.lerp(ideal, 1 - Math.exp(-8 * dt));

    const look = this.board.position.clone().add(new THREE.Vector3(0, 0.6, 0));
    look.y += this.camPitchOffset * 8;
    this.camera.up.set(Math.sin(this.board.bank) * 0.4, 1, 0).normalize();
    this.camera.lookAt(look);

    this.audio.setBoardAudio(0.2, sn);
    this.audio.setWind(0.25 + sn * 0.75);
    this.applySpeedFx(sn, accel);
    this.tickWhooshes(dt);

    const near = nearestOnPath(this.raceway.path, this.raceway.pathDist, this.board.position);
    const pct = Math.min(99, Math.floor((near.dist / this.raceway.totalLength) * 100));
    this.objective = this.raceFinished
      ? 'Racetrack complete!'
      : `Sky road · ${pct}% · CP ${this.checkpointIdx}/${this.raceway.checkpoints.length}`;

    if (!this.raceFinished && this.checkpointIdx < this.raceway.checkpoints.length) {
      const cp = this.raceway.checkpoints[this.checkpointIdx]!;
      if (this.board.position.distanceTo(cp.position) < 18) {
        this.checkpointIdx++;
        this.lastCheckpointPos.copy(cp.position);
        this.lastCheckpointYaw = near.yaw;
        this.audio.playPickup();
        if (this.checkpointIdx < this.raceway.checkpoints.length) {
          this.toast(`Checkpoint ${this.checkpointIdx}`, 1.5);
        }
      }
    }

    if (!this.raceFinished && this.board.position.distanceTo(this.raceway.finishPos) < 14) {
      this.finishRace();
    }
  }

  /**
   * Race road has no mesh colliders — pin feet to nearest path height
   * so on-foot never free-falls into the cloud void.
   */
  private snapRaceFeetToRoad(_dt: number) {
    if (!this.raceway) return;
    const near = nearestOnPath(
      this.raceway.path,
      this.raceway.pathDist,
      this.camera.position,
    );
    const lateral = Math.hypot(
      this.camera.position.x - near.point.x,
      this.camera.position.z - near.point.z,
    );
    const standY = near.point.y + PLAYER_H * 0.9 + 0.15;
    // Soft pull back onto road if slightly off
    if (lateral > 14) {
      const t = Math.min(1, (lateral - 14) / 20);
      this.camera.position.x += (near.point.x - this.camera.position.x) * t * 0.08;
      this.camera.position.z += (near.point.z - this.camera.position.z) * t * 0.08;
    }
    if (lateral < 16) {
      if (this.velocity.y <= 0.5 && this.camera.position.y <= standY + 0.35) {
        this.camera.position.y = standY;
        this.velocity.y = 0;
        this.onGround = true;
        this.safePos.copy(this.camera.position);
      }
    } else if (this.camera.position.y < standY - 3 && this.respawnCd <= 0) {
      // Far off road and falling — soft reset near board
      this.respawnAtCheckpoint(true);
    }
  }

  /** Put board + player together on the path (mount always reachable). */
  private placeBoardAndPlayerAt(pathPoint: THREE.Vector3, yaw: number, mount: boolean) {
    if (!this.board) return;
    const boardPos = pathPoint.clone();
    boardPos.y = pathPoint.y + BOARD.hoverHeight;
    this.board.position.copy(boardPos);
    this.board.yaw = yaw;
    this.board.velYaw = yaw;
    this.board.speed = 0;
    this.board.vy = 0;
    this.board.slideCharge = 0;
    this.board.sliding = false;
    this.board.mounted = mount;
    this.board.onGround = true;
    this.board.mesh.position.copy(boardPos);
    this.board.mesh.rotation.set(0, yaw, 0);

    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    this.camera.position.set(
      boardPos.x + side.x * 1.6,
      pathPoint.y + PLAYER_H * 0.9 + 0.15,
      boardPos.z + side.z * 1.6,
    );
    this.safePos.copy(this.camera.position);
    this.velocity.set(0, 0, 0);
    this.onGround = true;
    this.camera.fov = BOARD.fovBase;
    this.camera.updateProjectionMatrix();
    this.camera.up.set(0, 1, 0);
    this.applySpeedFx(0, 0);
  }

  private respawnAtCheckpoint(onFoot: boolean) {
    if (!this.raceway || !this.board) return;
    if (this.respawnCd > 0) return;
    this.respawnCd = 1.2;

    const near = nearestOnPath(
      this.raceway.path,
      this.raceway.pathDist,
      this.lastCheckpointPos,
    );
    const yaw = this.lastCheckpointYaw || near.yaw;
    this.placeBoardAndPlayerAt(near.point, yaw, !onFoot && this.board.mounted);
    if (onFoot) this.board.mounted = false;

    this.audio.playBang(0.35);
    this.toast('Respawned at checkpoint — board is beside you (E).', 2.5);
  }

  private applySpeedFx(speedNorm: number, accel: number) {
    if (!this.speedBlurEl) return;
    const rush = Math.max(speedNorm, accel > 0 ? speedNorm * 0.45 : 0);
    if (rush > 0.22) {
      this.speedBlurEl.classList.remove('hidden');
      this.speedBlurEl.classList.add('active');
      // Edge-only: opacity scales; blur amount via CSS mask (center stays clear)
      const blurPx = 6 + Math.floor(rush * rush * 14);
      this.speedBlurEl.style.opacity = String(Math.min(1, 0.35 + rush * 0.75));
      this.speedBlurEl.style.backdropFilter = `blur(${blurPx}px)`;
      (
        this.speedBlurEl.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }
      ).webkitBackdropFilter = `blur(${blurPx}px)`;
    } else {
      this.speedBlurEl.classList.remove('active');
      this.speedBlurEl.style.opacity = '0';
      if (rush <= 0.05) this.speedBlurEl.classList.add('hidden');
    }
  }

  private tickWhooshes(_dt: number) {
    if (!this.raceway || !this.board || this.board.speedNorm < 0.35) return;
    const pos = this.board.position;
    // Scan a window of whoosh points
    const pts = this.raceway.whooshPoints;
    if (pts.length === 0) return;
    for (let k = 0; k < 12; k++) {
      const i = (this.whooshCursor + k) % pts.length;
      const p = pts[i]!;
      const d = pos.distanceTo(p);
      if (d < 7 + this.board.speedNorm * 4) {
        this.audio.playPassWhoosh(0.5 + this.board.speedNorm * 0.6);
        this.whooshCursor = (i + 1) % pts.length;
        break;
      }
    }
    this.whooshCursor = (this.whooshCursor + 1) % pts.length;
  }

  private finishRace() {
    this.raceFinished = true;
    this.objective = 'Racetrack complete!';
    this.audio.playWin();
    this.flash('FINISH — Sky City run complete');
    this.toast(
      'You carved a line through brass districts and cloud parks. Progress saved to your slot.',
      8,
    );
    this.setHelp('E to dismount · Esc to save · Title from pause menu');
    writeSlot(this.activeSlot, this.buildSaveData());
  }

  private tryBoardInteract() {
    if (!this.board || !this.raceway) return false;
    if (this.board.mounted) {
      if (this.board.speed > 5) {
        this.toast('Slow down to dismount (S).');
        return true;
      }
      // Over open sky? Respawn checkpoint instead of falling forever
      const near = nearestOnPath(this.raceway.path, this.raceway.pathDist, this.board.position);
      const lat = Math.hypot(
        this.board.position.x - near.point.x,
        this.board.position.z - near.point.z,
      );
      if (lat > 9 || this.board.position.y < near.point.y - 2) {
        this.board.dismount();
        this.respawnAtCheckpoint(true);
        return true;
      }
      this.board.dismount();
      // Stand on path next to board (not floating in void)
      this.placeBoardAndPlayerAt(near.point, this.board.yaw, false);
      this.audio.setBoardAudio(0.5, 0);
      this.flash('Dismounted');
      this.objective = this.raceFinished
        ? 'Racetrack complete · board again with E'
        : 'Board again with E · or explore on foot';
      return true;
    }
    // Generous mount range — board may sit slightly below camera height
    const flatDist = Math.hypot(
      this.camera.position.x - this.board.position.x,
      this.camera.position.z - this.board.position.z,
    );
    if (flatDist < 4.5) {
      this.board.mount();
      this.board.speed = 0;
      this.board.speedNorm = 0;
      this.applySpeedFx(0, 0);
      this.audio.playPickup();
      this.flash('BOARDED — W to soar');
      this.toast(
        'W accel · S brake · A/D bank · hold Shift+steer to powerslide · release for turbo · Space jump',
        7,
      );
      this.setHelp(
        'W/S speed · A/D bank · hold Shift slide · Space jump · grind rails · E dismount (slow)',
      );
      this.objective = 'Ride the sky road to the golden finish gate';
      return true;
    }
    // Too far — pull board to player so continue/respawn never soft-locks
    if (flatDist > 12 && this.raceway) {
      const near = nearestOnPath(
        this.raceway.path,
        this.raceway.pathDist,
        this.camera.position,
      );
      this.placeBoardAndPlayerAt(near.point, near.yaw, false);
      this.toast('Board recalled to your side — press E.', 2);
      return true;
    }
    return false;
  }

  private updateRobots(dt: number) {
    const playerPos = this.camera.position.clone();
    const playerFeet = playerPos.clone();
    playerFeet.y -= 0.4;

    for (const r of this.robots) {
      if (r.phase === 'husk') continue;
      // Rescue frames that slipped into the void (path gaps / chase off edge)
      if (r.position.y < -0.8) {
        const rescue = this.level.anchors.doorSpot;
        r.position.set(rescue.x + (Math.random() - 0.5) * 1.2, 0.08, rescue.z + 2.5);
        r.vy = 0;
        r.onGround = true;
      }
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
    // Boat controls (E) are the intentional win; proximity only hints
    if (this.won) return;
    if (this.tutorial !== 'escape' && this.tutorial !== 'breach') return;
    const p = this.camera.position;
    if (Math.hypot(p.x - this.exit.x, p.z - this.exit.z) < 3.5 && p.y < 4) {
      // Soft reminder once near boat
      if (this.msgT <= 0) {
        this.toast('Boat controls — press E to cast off.', 2);
      }
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
