import type { GameMap } from '../engine/map';
import { isSolid, setCell, cloneMap } from '../engine/map';
import { Input } from '../engine/input';
import { Raycaster, setAngle, type SpriteDraw } from '../engine/raycaster';
import {
  createWallTextures,
  drawKarenSprite,
  drawPlaqueSprite,
  drawPickupSprite,
  drawExitSprite,
  drawButtonSprite,
  drawPhoneSprite,
  drawBossSprite,
} from '../engine/textures';
import { GameAudio } from '../engine/audio';
import {
  type PlayerState,
  type Enemy,
  type BossManager,
  type PlaqueEntity,
  type PickupEntity,
  type ExitEntity,
  type ButtonEntity,
  type PhoneEntity,
  type Floater,
  type Particle,
  type Projectile,
  randomConversionLine,
  createDefaultPlayer,
} from './entities';
import { tryPrimaryFire, tryAltFire, weaponLabel } from './weapons';
import { getMapTemplate, CAMPAIGN_START } from '../assets/maps';
import { type SaveData, writeSave, loadSave, clearSave } from './save';
import { BASE_LOOK_SENS } from './settings';

const RENDER_W = 320;
const RENDER_H = 200;

export type StartMode = 'new' | 'continue';

export class Game {
  private map: GameMap;
  private mapId: string;
  private player: PlayerState;
  private enemies: Enemy[] = [];
  private plaques: PlaqueEntity[] = [];
  private pickups: PickupEntity[] = [];
  private buttons: ButtonEntity[] = [];
  private phones: PhoneEntity[] = [];
  private exit: ExitEntity | null = null;
  private projectiles: Projectile[] = [];
  private floaters: Floater[] = [];
  private particles: Particle[] = [];
  private input: Input;
  private audio = new GameAudio();
  private textures = createWallTextures();
  private raycaster: Raycaster;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private spriteBuf: HTMLCanvasElement;
  private spriteCtx: CanvasRenderingContext2D;
  private time = 0;
  private mapComplete = false;
  private campaignComplete = false;
  private message = '';
  private messageLife = 0;
  private weaponBob = 0;
  private frame = 0;
  private paused = false;
  private dashStamina = 100;
  private dashCooldown = 0;
  private dashing = false;
  private hurtFlash = 0;
  private prevResolve = 100;
  private completedMaps: string[] = [];
  private mapFlags: Record<string, string[]> = {};
  private bossSilenceTimer = 0;
  private transitionTimer = 0;
  private pendingNextMap: string | null = null;
  private autosaveTimer = 0;
  private interactPrompt = '';

  private resolveFill: HTMLElement;
  private voiceFill: HTMLElement;
  private weaponName: HTMLElement;
  private plaqueToast: HTMLElement;
  private convertToast: HTMLElement;
  private statsEl: HTMLElement;
  private resolvePct: HTMLElement;
  private resolveFace: HTMLElement;
  private resolveMeter: HTMLElement;
  private hurtVignette: HTMLElement;
  private dashFill: HTMLElement;
  private pauseMenu: HTMLElement;
  private locationEl: HTMLElement | null;

  constructor(
    private canvas: HTMLCanvasElement,
    private displayCtx: CanvasRenderingContext2D,
    mode: StartMode = 'new',
  ) {
    this.mapId = CAMPAIGN_START;
    this.map = cloneMap(getMapTemplate(this.mapId));
    this.player = createDefaultPlayer(this.map.spawn);

    if (mode === 'continue') {
      const save = loadSave();
      if (save) this.applySave(save);
    } else {
      clearSave();
    }

    this.bootstrapEntities();
    this.applyMapFlags();
    this.input = new Input(canvas);

    this.offscreen = document.createElement('canvas');
    this.offscreen.width = RENDER_W;
    this.offscreen.height = RENDER_H;
    this.offCtx = this.offscreen.getContext('2d')!;
    this.raycaster = new Raycaster(this.offCtx, RENDER_W, RENDER_H);

    this.spriteBuf = document.createElement('canvas');
    this.spriteBuf.width = 64;
    this.spriteBuf.height = 64;
    this.spriteCtx = this.spriteBuf.getContext('2d')!;

    this.resolveFill = document.getElementById('resolve-fill')!;
    this.voiceFill = document.getElementById('voice-fill')!;
    this.weaponName = document.getElementById('weapon-name')!;
    this.plaqueToast = document.getElementById('plaque-toast')!;
    this.convertToast = document.getElementById('convert-toast')!;
    this.statsEl = document.getElementById('stats-line')!;
    this.resolvePct = document.getElementById('resolve-pct')!;
    this.resolveFace = document.getElementById('resolve-face')!;
    this.resolveMeter = document.querySelector('.meter-resolve') as HTMLElement;
    this.hurtVignette = document.getElementById('hurt-vignette')!;
    this.dashFill = document.getElementById('dash-fill')!;
    this.pauseMenu = document.getElementById('pause-menu')!;
    this.locationEl = document.getElementById('location-line');
    this.wirePauseMenu();
  }

  private applySave(save: SaveData) {
    this.mapId = save.mapId;
    this.map = cloneMap(getMapTemplate(this.mapId));
    this.completedMaps = [...save.completedMaps];
    this.mapFlags = { ...save.mapFlags };
    const p = save.player;
    this.player = {
      x: p.x,
      y: p.y,
      angle: p.angle,
      resolve: p.resolve,
      voice: p.voice,
      brand: p.brand,
      momentum: 0,
      hasRedKey: p.hasRedKey,
      hasBlueKey: p.hasBlueKey ?? false,
      weapon: p.weapon,
      attackCooldown: 0,
      invuln: 1,
      plaquesRead: new Set(p.plaquesRead),
      conversions: p.conversions,
    };
    this.prevResolve = this.player.resolve;
  }

  private wirePauseMenu() {
    const master = document.getElementById('vol-master') as HTMLInputElement;
    const music = document.getElementById('vol-music') as HTMLInputElement;
    const sfx = document.getElementById('vol-sfx') as HTMLInputElement;
    const sens = document.getElementById('mouse-sens') as HTMLInputElement | null;
    const masterVal = document.getElementById('vol-master-val')!;
    const musicVal = document.getElementById('vol-music-val')!;
    const sfxVal = document.getElementById('vol-sfx-val')!;
    const sensVal = document.getElementById('mouse-sens-val');
    const resume = document.getElementById('btn-resume')!;
    const saveBtn = document.getElementById('btn-save') as HTMLButtonElement | null;

    const s = this.audio.getSettings();
    master.value = String(Math.round(s.master * 100));
    music.value = String(Math.round(s.music * 100));
    sfx.value = String(Math.round(s.sfx * 100));
    masterVal.textContent = master.value;
    musicVal.textContent = music.value;
    sfxVal.textContent = sfx.value;
    if (sens && sensVal) {
      // slider 20–250 represents 0.2–2.5
      sens.value = String(Math.round(s.mouseSensitivity * 100));
      sensVal.textContent = `${s.mouseSensitivity.toFixed(2)}x`;
      sens.addEventListener('input', () => {
        const v = Number(sens.value) / 100;
        this.audio.setMouseSensitivity(v);
        sensVal.textContent = `${v.toFixed(2)}x`;
      });
    }

    master.addEventListener('input', () => {
      this.audio.setMaster(Number(master.value) / 100);
      masterVal.textContent = master.value;
    });
    music.addEventListener('input', () => {
      this.audio.setMusic(Number(music.value) / 100);
      musicVal.textContent = music.value;
    });
    sfx.addEventListener('input', () => {
      this.audio.setSfx(Number(sfx.value) / 100);
      sfxVal.textContent = sfx.value;
      this.audio.uiClick();
    });
    resume.addEventListener('click', () => this.setPaused(false));
    saveBtn?.addEventListener('click', () => {
      this.saveGame();
      this.showToast('Game saved.', 2);
      this.audio.uiClick();
    });
  }

  setPaused(v: boolean) {
    this.paused = v;
    if (v) {
      this.pauseMenu.classList.remove('hidden');
      if (document.pointerLockElement) document.exitPointerLock();
      this.audio.uiClick();
      this.saveGame();
    } else {
      this.pauseMenu.classList.add('hidden');
      this.canvas.requestPointerLock();
    }
  }

  private flagsForMap(): string[] {
    return this.mapFlags[this.mapId] ?? [];
  }

  private hasFlag(flag: string): boolean {
    return this.flagsForMap().includes(flag);
  }

  private addFlag(flag: string) {
    const list = this.mapFlags[this.mapId] ?? [];
    if (!list.includes(flag)) {
      this.mapFlags[this.mapId] = [...list, flag];
    }
  }

  private saveGame() {
    if (this.campaignComplete) return;
    const data: SaveData = {
      version: 1,
      mapId: this.mapId,
      player: {
        x: this.player.x,
        y: this.player.y,
        angle: this.player.angle,
        resolve: this.player.resolve,
        voice: this.player.voice,
        brand: this.player.brand,
        hasRedKey: this.player.hasRedKey,
        hasBlueKey: this.player.hasBlueKey,
        weapon: this.player.weapon,
        plaquesRead: [...this.player.plaquesRead],
        conversions: this.player.conversions,
      },
      completedMaps: [...this.completedMaps],
      mapFlags: { ...this.mapFlags },
      locationLabel: this.map.name,
      savedAt: Date.now(),
    };
    writeSave(data);
  }

  private bootstrapEntities() {
    this.enemies = [];
    this.plaques = [];
    this.pickups = [];
    this.buttons = [];
    this.phones = [];
    this.exit = null;
    this.projectiles = [];
    this.bossSilenceTimer = 0;
    this.mapComplete = false;
    this.pendingNextMap = null;
    this.transitionTimer = 0;

    let pi = 0;
    for (const e of this.map.entities) {
      if (e.type === 'karen') {
        const elite = !!e.elite;
        this.enemies.push({
          kind: 'karen',
          x: e.x,
          y: e.y,
          hp: elite ? 110 : 60,
          maxHp: elite ? 110 : 60,
          speed: elite ? 1.15 : 1.4,
          hurt: 0,
          attackCd: 0,
          alive: true,
          bob: Math.random() * Math.PI * 2,
          elite,
        });
      } else if (e.type === 'boss_manager') {
        this.enemies.push({
          kind: 'boss_manager',
          x: e.x,
          y: e.y,
          hp: 420,
          maxHp: 420,
          speed: 0.9,
          hurt: 0,
          attackCd: 0,
          spawnCd: 3,
          alive: true,
          bob: 0,
          phase: 1,
        });
      } else if (e.type === 'plaque') {
        this.plaques.push({
          kind: 'plaque',
          x: e.x,
          y: e.y,
          id: e.id,
          title: e.title,
          text: e.text,
          read: this.player.plaquesRead.has(e.id),
        });
      } else if (e.type === 'pickup') {
        const flag = `pickup_${pi++}`;
        this.pickups.push({
          kind: 'pickup',
          x: e.x,
          y: e.y,
          item: e.kind,
          taken: this.hasFlag(flag),
          flag,
        });
      } else if (e.type === 'exit') {
        this.exit = { kind: 'exit', x: e.x, y: e.y };
      } else if (e.type === 'button') {
        this.buttons.push({
          kind: 'button',
          x: e.x,
          y: e.y,
          openCells: e.openCells,
          flag: e.flag,
          label: e.label,
          used: this.hasFlag(e.flag),
        });
      } else if (e.type === 'phone') {
        this.phones.push({
          kind: 'phone',
          x: e.x,
          y: e.y,
          flag: e.flag,
          label: e.label,
          effect: e.effect,
          openCells: e.openCells,
          message: e.message,
          used: e.effect !== 'silence' && this.hasFlag(e.flag),
          cooldown: 0,
        });
      }
    }
  }

  private applyMapFlags() {
    for (const e of this.map.entities) {
      if (e.type === 'secret_trigger' && this.hasFlag(e.flag ?? 'secret')) {
        setCell(this.map, e.wallX, e.wallY, 0);
      }
      if (e.type === 'button' && this.hasFlag(e.flag)) {
        for (const c of e.openCells) setCell(this.map, c.x, c.y, 0);
      }
      if (e.type === 'phone' && e.effect === 'open' && this.hasFlag(e.flag)) {
        for (const c of e.openCells ?? []) setCell(this.map, c.x, c.y, 0);
      }
    }
    // red key doors opened flag
    if (this.hasFlag('red_doors_open')) {
      for (let y = 0; y < this.map.height; y++) {
        for (let x = 0; x < this.map.width; x++) {
          if (this.map.grid[y * this.map.width + x] === 3) setCell(this.map, x, y, 0);
        }
      }
    }
  }

  private loadMap(id: string, atSpawn = true) {
    this.mapId = id;
    this.map = cloneMap(getMapTemplate(id));
    if (atSpawn) {
      this.player.x = this.map.spawn.x;
      this.player.y = this.map.spawn.y;
      this.player.angle = this.map.spawn.angle;
      this.player.hasRedKey = false; // keys are per-map for doors in that map
      this.player.resolve = Math.min(100, this.player.resolve + 15);
      this.player.voice = Math.min(100, this.player.voice + 25);
    }
    this.bootstrapEntities();
    this.applyMapFlags();
    this.saveGame();
    this.showToast(this.map.name, 3);
    this.audio.levelClear();
  }

  async start() {
    await this.audio.resume();
    this.showToast(
      this.map.episode === 0
        ? 'Episode 0 — Basement. Esc: settings & save.'
        : `${this.map.name} — good luck.`,
      4,
    );
    this.saveGame();
  }

  update(dt: number) {
    if (this.input.pausePressed) {
      this.setPaused(!this.paused);
    }

    if (this.paused) {
      this.input.endFrame();
      return;
    }

    // inter-map transition
    if (this.pendingNextMap) {
      this.transitionTimer -= dt;
      this.messageLife -= dt;
      if (this.transitionTimer <= 0) {
        const next = this.pendingNextMap;
        this.pendingNextMap = null;
        if (next === '__END__') {
          this.campaignComplete = true;
        } else {
          this.loadMap(next, true);
        }
      }
      this.input.endFrame();
      return;
    }

    if (this.campaignComplete) {
      this.input.endFrame();
      return;
    }

    this.time += dt;
    this.frame++;
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 20) {
      this.autosaveTimer = 0;
      this.saveGame();
    }

    const p = this.player;
    const sens = BASE_LOOK_SENS * this.audio.getSettings().mouseSensitivity;
    p.angle += this.input.mouseDX * sens;

    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (!this.dashing) this.dashStamina = Math.min(100, this.dashStamina + dt * 28);

    const axis = this.input.axis();
    const dashVec = this.input.getDashWorldDir(p.angle);
    const canDash = dashVec && this.dashStamina > 5 && this.dashCooldown <= 0;

    if (canDash && dashVec) {
      if (!this.dashing) this.audio.dash();
      this.dashing = true;
      const speed = 7.2 * dt;
      this.dashStamina = Math.max(0, this.dashStamina - dt * 55);
      if (this.dashStamina <= 0) {
        this.dashCooldown = 0.45;
        this.dashing = false;
        this.input.dashDir = null;
      }
      this.tryMove(p.x + dashVec.x * speed, p.y);
      this.tryMove(p.x, p.y + dashVec.y * speed);
      p.invuln = Math.max(p.invuln, 0.05);
    } else {
      this.dashing = false;
      const speed = (this.input.sprinting() ? 3.6 : 2.4) * dt;
      const fx = Math.cos(p.angle);
      const fy = Math.sin(p.angle);
      const rx = -fy;
      const ry = fx;
      this.tryMove(p.x + (fx * axis.y + rx * axis.x) * speed, p.y);
      this.tryMove(p.x, p.y + (fy * axis.y + ry * axis.x) * speed);
    }

    this.weaponBob += Math.hypot(axis.x, axis.y) * dt * (this.dashing ? 20 : 12);

    if (p.attackCooldown > 0) p.attackCooldown -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.bossSilenceTimer > 0) this.bossSilenceTimer -= dt;
    p.momentum = Math.max(0, p.momentum - dt * 18);
    p.voice = Math.min(100, p.voice + dt * 4);

    if (this.input.weaponSlot === 1) p.weapon = 'gavel';
    if (this.input.weaponSlot === 2) p.weapon = 'mic';

    this.handleFire();
    if (this.input.interactPressed) this.tryInteract();
    this.updateInteractPrompt();

    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickups();
    this.updateFloaters(dt);
    this.updateParticles(dt);
    this.updatePhones(dt);
    this.checkExit();
    this.updateHealthFeedback();

    this.messageLife -= dt;
    this.input.endFrame();
  }

  private fireHeld = false;
  private altHeld = false;

  setFireHeld(v: boolean) {
    this.fireHeld = v;
  }
  setAltHeld(v: boolean) {
    this.altHeld = v;
  }

  private handleFire() {
    const p = this.player;
    const wantPrimary = this.fireHeld || this.input.firePressed || this.input.keys.has('Space');
    const wantAlt = this.altHeld || this.input.altFirePressed || this.input.keys.has('KeyQ');
    if (wantPrimary) {
      const res = tryPrimaryFire(p, this.enemies, this.audio);
      if (res) {
        this.projectiles.push(...res.projectiles);
        for (const h of res.meleeHits) this.damageEnemy(h.enemy, h.damage);
      }
    } else if (wantAlt) {
      const res = tryAltFire(p, this.enemies, this.audio);
      if (res) {
        this.projectiles.push(...res.projectiles);
        for (const h of res.meleeHits) this.damageEnemy(h.enemy, h.damage);
      }
    }
  }

  private tryMove(nx: number, ny: number) {
    const r = 0.18;
    const p = this.player;
    if (!this.blocked(nx, p.y, r)) p.x = nx;
    if (!this.blocked(p.x, ny, r)) p.y = ny;
  }

  private blocked(x: number, y: number, r: number): boolean {
    for (const ox of [-r, r]) {
      for (const oy of [-r, r]) {
        if (isSolid(this.map, x + ox, y + oy)) return true;
      }
    }
    return false;
  }

  private updateInteractPrompt() {
    const p = this.player;
    this.interactPrompt = '';
    for (const pl of this.plaques) {
      if (Math.hypot(pl.x - p.x, pl.y - p.y) < 1.2) {
        this.interactPrompt = `E — Read: ${pl.title}`;
        return;
      }
    }
    for (const b of this.buttons) {
      if (!b.used && Math.hypot(b.x - p.x, b.y - p.y) < 1.2) {
        this.interactPrompt = `E — ${b.label}`;
        return;
      }
    }
    for (const ph of this.phones) {
      if (Math.hypot(ph.x - p.x, ph.y - p.y) < 1.2) {
        if (ph.effect === 'silence' || !ph.used) {
          this.interactPrompt = `E — ${ph.label}`;
          return;
        }
      }
    }
    for (const e of this.map.entities) {
      if (e.type === 'secret_trigger' && !this.hasFlag(e.flag ?? 'secret')) {
        if (Math.hypot(e.x - p.x, e.y - p.y) < 1.3) {
          this.interactPrompt = 'E — Inspect wall';
          return;
        }
      }
    }
    if (p.hasRedKey) {
      const cx = Math.floor(p.x + Math.cos(p.angle));
      const cy = Math.floor(p.y + Math.sin(p.angle));
      if (this.map.grid[cy * this.map.width + cx] === 3) {
        this.interactPrompt = 'E — Unlock with Red Tie Key';
      }
    }
  }

  private tryInteract() {
    const p = this.player;
    for (const pl of this.plaques) {
      if (Math.hypot(pl.x - p.x, pl.y - p.y) < 1.2) {
        pl.read = true;
        p.plaquesRead.add(pl.id);
        this.audio.plaque();
        this.showPlaque(`${pl.title}: ${pl.text}`);
        this.saveGame();
        return;
      }
    }
    for (const b of this.buttons) {
      if (b.used) continue;
      if (Math.hypot(b.x - p.x, b.y - p.y) < 1.2) {
        b.used = true;
        this.addFlag(b.flag);
        for (const c of b.openCells) setCell(this.map, c.x, c.y, 0);
        this.audio.button();
        this.showToast(`${b.label} — activated!`, 2.5);
        this.saveGame();
        return;
      }
    }
    for (const ph of this.phones) {
      if (Math.hypot(ph.x - p.x, ph.y - p.y) < 1.2) {
        if (ph.effect === 'silence') {
          if (ph.cooldown > 0) {
            this.showToast('Phone busy…', 1.5);
            return;
          }
          this.bossSilenceTimer = 8;
          ph.cooldown = 14;
          this.audio.phone();
          this.showToast(ph.message, 3);
          return;
        }
        if (ph.used) return;
        ph.used = true;
        this.addFlag(ph.flag);
        if (ph.effect === 'open') {
          for (const c of ph.openCells ?? []) setCell(this.map, c.x, c.y, 0);
        }
        this.audio.phone();
        this.showToast(ph.message, 3);
        this.saveGame();
        return;
      }
    }
    for (const e of this.map.entities) {
      if (e.type !== 'secret_trigger') continue;
      const flag = e.flag ?? 'secret';
      if (this.hasFlag(flag)) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < 1.3) {
        setCell(this.map, e.wallX, e.wallY, 0);
        this.addFlag(flag);
        this.audio.plaque();
        this.showToast('Secret opened — tremendous room.', 3);
        this.saveGame();
        return;
      }
    }
    if (p.hasRedKey) {
      const cx = Math.floor(p.x + Math.cos(p.angle));
      const cy = Math.floor(p.y + Math.sin(p.angle));
      if (this.map.grid[cy * this.map.width + cx] === 3) {
        for (let y = 0; y < this.map.height; y++) {
          for (let x = 0; x < this.map.width; x++) {
            if (this.map.grid[y * this.map.width + x] === 3) setCell(this.map, x, y, 0);
          }
        }
        this.addFlag('red_doors_open');
        this.showToast('Red Tie Key accepted. Doors open.', 2.5);
        this.audio.pickup();
        this.saveGame();
      }
    }
  }

  private updatePhones(dt: number) {
    for (const ph of this.phones) {
      if (ph.cooldown > 0) ph.cooldown -= dt;
    }
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.bob += dt * 6;
      e.hurt = Math.max(0, e.hurt - dt);
      e.attackCd = Math.max(0, e.attackCd - dt);

      if (e.kind === 'boss_manager') {
        this.updateBoss(e, dt);
        continue;
      }

      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy);
      const range = e.elite ? 10 : 8;

      if (dist < range && dist > 0.55) {
        const sp = e.speed * dt * (e.hurt > 0 ? 0.4 : 1);
        const nx = e.x + (dx / dist) * sp;
        const ny = e.y + (dy / dist) * sp;
        if (!isSolid(this.map, nx, e.y)) e.x = nx;
        if (!isSolid(this.map, e.x, ny)) e.y = ny;
      }

      const hitRange = e.elite ? 0.75 : 0.7;
      const dmg = e.elite ? 18 : 12;
      if (dist < hitRange && e.attackCd <= 0 && p.invuln <= 0 && !this.dashing) {
        e.attackCd = e.elite ? 0.9 : 1.1;
        this.hurtPlayer(dmg);
      }
    }
  }

  private updateBoss(b: BossManager, dt: number) {
    const p = this.player;
    b.phase = b.hp < b.maxHp * 0.45 ? 2 : 1;
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1.2 && dist < 14) {
      const sp = b.speed * (b.phase === 2 ? 1.25 : 1) * dt;
      const nx = b.x + (dx / dist) * sp;
      const ny = b.y + (dy / dist) * sp;
      if (!isSolid(this.map, nx, b.y)) b.x = nx;
      if (!isSolid(this.map, b.x, ny)) b.y = ny;
    }
    if (dist < 1.0 && b.attackCd <= 0 && p.invuln <= 0 && !this.dashing) {
      b.attackCd = 1.0;
      this.hurtPlayer(22);
    }
    // spawn adds unless silenced
    b.spawnCd -= dt;
    if (b.spawnCd <= 0 && this.bossSilenceTimer <= 0) {
      b.spawnCd = b.phase === 2 ? 4.5 : 7;
      const aliveAdds = this.enemies.filter((e) => e.kind === 'karen' && e.alive).length;
      if (aliveAdds < 6) {
        const ang = Math.random() * Math.PI * 2;
        const sx = b.x + Math.cos(ang) * 2.2;
        const sy = b.y + Math.sin(ang) * 2.2;
        if (!isSolid(this.map, sx, sy)) {
          this.enemies.push({
            kind: 'karen',
            x: sx,
            y: sy,
            hp: 50,
            maxHp: 50,
            speed: 1.5,
            hurt: 0,
            attackCd: 0.5,
            alive: true,
            bob: 0,
            elite: false,
          });
          this.showToast('Manager summoned backup!', 1.5);
        }
      }
    }
  }

  private hurtPlayer(amount: number) {
    const p = this.player;
    p.resolve -= amount;
    p.invuln = 0.6;
    p.momentum = 0;
    this.audio.hurt();
    this.hurtFlash = 0.55;
    this.spawnParticles(p.x, p.y, '#c41e3a', 6);
    if (p.resolve <= 0) {
      p.resolve = 0;
      this.respawn();
    }
  }

  private respawn() {
    this.player.x = this.map.spawn.x;
    this.player.y = this.map.spawn.y;
    this.player.angle = this.map.spawn.angle;
    this.player.resolve = 100;
    this.player.voice = 80;
    this.player.invuln = 2;
    this.showToast('Resolve failed — back to the entrance.', 3);
    this.saveGame();
  }

  private updateProjectiles(dt: number) {
    for (const pr of this.projectiles) {
      pr.life -= dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (isSolid(this.map, pr.x, pr.y)) {
        pr.life = 0;
        continue;
      }
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const r = e.kind === 'boss_manager' ? 0.7 : 0.4;
        if (Math.hypot(e.x - pr.x, e.y - pr.y) < r) {
          this.damageEnemy(e, pr.damage);
          pr.life = 0;
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  private damageEnemy(e: Enemy, amount: number) {
    if (!e.alive) return;
    // bosses take full; elites 0.85
    let dmg = amount;
    if (e.kind === 'karen' && e.elite) dmg *= 0.9;
    e.hp -= dmg;
    e.hurt = 0.25;
    this.player.momentum = Math.min(100, this.player.momentum + 12);
    this.audio.hit();
    this.spawnParticles(e.x, e.y, '#ffd700', 4);
    if (e.hp <= 0) {
      e.alive = false;
      this.convertEnemy(e);
    }
  }

  private convertEnemy(e: Enemy) {
    this.player.conversions++;
    this.player.brand += e.kind === 'boss_manager' ? 50 : e.kind === 'karen' && e.elite ? 12 : 5;
    this.audio.trumpTrain();
    this.showConvert(
      e.kind === 'boss_manager' ? 'MANAGER JOINED THE TRUMP-TRAIN!' : randomConversionLine(),
    );
    this.spawnParticles(e.x, e.y, '#c41e3a', 18);
    this.spawnParticles(e.x, e.y, '#ffd700', 12);
    if (e.kind === 'boss_manager') {
      this.showToast('Boss converted! Head to the EXIT.', 4);
      this.saveGame();
    }
  }

  private updatePickups() {
    const p = this.player;
    for (const item of this.pickups) {
      if (item.taken) continue;
      if (Math.hypot(item.x - p.x, item.y - p.y) > 0.5) continue;
      item.taken = true;
      this.addFlag(item.flag);
      this.audio.pickup();
      if (item.item === 'resolve') {
        p.resolve = Math.min(100, p.resolve + 35);
        this.showToast('Cheeseburger — Resolve up!', 2);
      } else if (item.item === 'voice') {
        p.voice = Math.min(100, p.voice + 40);
        this.showToast('Diet Coke — Voice up!', 2);
      } else if (item.item === 'brand') {
        p.brand += 15;
        this.showToast('Gold bar — Brand +15', 2);
      } else if (item.item === 'key_red') {
        p.hasRedKey = true;
        this.showToast('Red Tie Key acquired.', 3);
      } else if (item.item === 'key_blue') {
        p.hasBlueKey = true;
        this.showToast('Blue Check Key acquired.', 3);
      }
      this.saveGame();
    }
  }

  private checkExit() {
    if (!this.exit || this.mapComplete) return;
    // Boss map: require boss dead
    const boss = this.enemies.find((e) => e.kind === 'boss_manager');
    if (boss && boss.alive) return;

    if (Math.hypot(this.exit.x - this.player.x, this.exit.y - this.player.y) < 0.65) {
      this.mapComplete = true;
      if (!this.completedMaps.includes(this.mapId)) {
        this.completedMaps.push(this.mapId);
      }
      this.audio.levelClear();
      const next = this.map.nextMapId;
      if (next) {
        this.showToast(`AREA CLEAR — ${this.map.name}`, 2.5);
        this.pendingNextMap = next;
        this.transitionTimer = 2.2;
        this.saveGame();
      } else {
        this.showToast('EPISODE 1 COMPLETE — Campaign continues later!', 6);
        this.showConvert('THE TRAIN ROLLS ON…');
        this.pendingNextMap = '__END__';
        this.transitionTimer = 3.5;
        this.saveGame();
      }
    }
  }

  private spawnParticles(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.5 + Math.random() * 2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.5,
        color,
        size: 1 + Math.random() * 2,
      });
    }
  }

  private updateParticles(dt: number) {
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private updateFloaters(dt: number) {
    for (const f of this.floaters) {
      f.life -= dt;
      f.y += f.vy * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  private updateHealthFeedback() {
    const r = this.player.resolve;
    if (r < this.prevResolve - 0.5) {
      this.hurtFlash = 0.45;
      this.resolveFace.classList.add('hurt');
      window.setTimeout(() => this.resolveFace.classList.remove('hurt'), 200);
    }
    this.prevResolve = r;
  }

  private showToast(msg: string, sec: number) {
    this.message = msg;
    this.messageLife = sec;
  }

  private showPlaque(text: string) {
    this.plaqueToast.textContent = text;
    this.plaqueToast.classList.remove('hidden');
    window.setTimeout(() => this.plaqueToast.classList.add('hidden'), 5000);
  }

  private showConvert(text: string) {
    this.convertToast.textContent = text;
    this.convertToast.classList.remove('hidden');
    window.setTimeout(() => this.convertToast.classList.add('hidden'), 2200);
  }

  render() {
    const p = this.player;
    const cam = {
      posX: p.x,
      posY: p.y,
      dirX: 0,
      dirY: 0,
      planeX: 0,
      planeY: 0,
    };
    setAngle(cam, p.angle);

    const sprites: SpriteDraw[] = [];

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.kind === 'boss_manager') {
        drawBossSprite(this.spriteCtx, 64, 64, e.hurt > 0 ? 1 : this.frame >> 3);
        sprites.push({
          x: e.x,
          y: e.y,
          dist: Math.hypot(e.x - p.x, e.y - p.y),
          canvas: cloneCanvas(this.spriteBuf),
          scale: 1.35,
        });
      } else {
        drawKarenSprite(this.spriteCtx, 64, 64, e.hurt > 0 ? 1 : this.frame >> 3);
        if (e.elite) {
          this.spriteCtx.strokeStyle = '#9b59b6';
          this.spriteCtx.lineWidth = 3;
          this.spriteCtx.strokeRect(4, 4, 56, 56);
        }
        sprites.push({
          x: e.x,
          y: e.y,
          dist: Math.hypot(e.x - p.x, e.y - p.y),
          canvas: cloneCanvas(this.spriteBuf),
          scale: e.elite ? 1.05 : 0.9,
        });
      }
    }

    for (const pl of this.plaques) {
      drawPlaqueSprite(this.spriteCtx, 64, 64);
      sprites.push({
        x: pl.x,
        y: pl.y,
        dist: Math.hypot(pl.x - p.x, pl.y - p.y),
        canvas: cloneCanvas(this.spriteBuf),
        scale: 0.55,
      });
    }

    for (const b of this.buttons) {
      drawButtonSprite(this.spriteCtx, 64, 64, b.used);
      sprites.push({
        x: b.x,
        y: b.y,
        dist: Math.hypot(b.x - p.x, b.y - p.y),
        canvas: cloneCanvas(this.spriteBuf),
        scale: 0.45,
      });
    }

    for (const ph of this.phones) {
      const used = ph.effect === 'silence' ? ph.cooldown > 0 : ph.used;
      drawPhoneSprite(this.spriteCtx, 64, 64, used);
      sprites.push({
        x: ph.x,
        y: ph.y,
        dist: Math.hypot(ph.x - p.x, ph.y - p.y),
        canvas: cloneCanvas(this.spriteBuf),
        scale: 0.5,
      });
    }

    for (const item of this.pickups) {
      if (item.taken) continue;
      drawPickupSprite(this.spriteCtx, 64, 64, item.item);
      sprites.push({
        x: item.x,
        y: item.y,
        dist: Math.hypot(item.x - p.x, item.y - p.y),
        canvas: cloneCanvas(this.spriteBuf),
        scale: 0.4,
      });
    }

    if (this.exit) {
      drawExitSprite(this.spriteCtx, 64, 64);
      sprites.push({
        x: this.exit.x,
        y: this.exit.y,
        dist: Math.hypot(this.exit.x - p.x, this.exit.y - p.y),
        canvas: cloneCanvas(this.spriteBuf),
        scale: 0.7,
      });
    }

    for (const pr of this.projectiles) {
      this.spriteCtx.clearRect(0, 0, 64, 64);
      this.spriteCtx.fillStyle = '#00c2ff';
      this.spriteCtx.beginPath();
      this.spriteCtx.arc(32, 32, 14, 0, Math.PI * 2);
      this.spriteCtx.fill();
      this.spriteCtx.fillStyle = '#fff';
      this.spriteCtx.font = '10px sans-serif';
      this.spriteCtx.textAlign = 'center';
      this.spriteCtx.fillText('MIC', 32, 36);
      sprites.push({
        x: pr.x,
        y: pr.y,
        dist: Math.hypot(pr.x - p.x, pr.y - p.y),
        canvas: cloneCanvas(this.spriteBuf),
        scale: 0.3,
      });
    }

    this.raycaster.render(this.map, cam, this.textures, sprites);
    this.drawWeapon();

    const dw = this.canvas.clientWidth;
    const dh = this.canvas.clientHeight;
    this.canvas.width = dw * Math.min(devicePixelRatio, 2);
    this.canvas.height = dh * Math.min(devicePixelRatio, 2);
    this.displayCtx.setTransform(Math.min(devicePixelRatio, 2), 0, 0, Math.min(devicePixelRatio, 2), 0, 0);
    this.displayCtx.imageSmoothingEnabled = false;
    this.displayCtx.drawImage(this.offscreen, 0, 0, dw, dh);

    this.displayCtx.strokeStyle = this.dashing ? 'rgba(0,194,255,0.95)' : 'rgba(255,215,0,0.85)';
    this.displayCtx.lineWidth = 2;
    const cx = dw / 2;
    const cy = dh / 2;
    this.displayCtx.beginPath();
    this.displayCtx.moveTo(cx - 8, cy);
    this.displayCtx.lineTo(cx + 8, cy);
    this.displayCtx.moveTo(cx, cy - 8);
    this.displayCtx.lineTo(cx, cy + 8);
    this.displayCtx.stroke();

    if (this.dashing) {
      this.displayCtx.fillStyle = 'rgba(255,215,0,0.06)';
      this.displayCtx.fillRect(0, 0, dw, dh);
    }

    // boss HP bar
    const boss = this.enemies.find((e) => e.kind === 'boss_manager' && e.alive) as
      | BossManager
      | undefined;
    if (boss) {
      const pct = boss.hp / boss.maxHp;
      this.displayCtx.fillStyle = 'rgba(0,0,0,0.6)';
      this.displayCtx.fillRect(dw * 0.2, 56, dw * 0.6, 18);
      this.displayCtx.fillStyle = '#e74c3c';
      this.displayCtx.fillRect(dw * 0.2, 56, dw * 0.6 * pct, 18);
      this.displayCtx.strokeStyle = '#ffd700';
      this.displayCtx.strokeRect(dw * 0.2, 56, dw * 0.6, 18);
      this.displayCtx.fillStyle = '#ffd700';
      this.displayCtx.font = '12px system-ui';
      this.displayCtx.textAlign = 'center';
      this.displayCtx.fillText(
        `MANAGER OF KARENS${this.bossSilenceTimer > 0 ? ' · LINE JAMMED' : ''}`,
        dw / 2,
        70,
      );
    }

    if (this.interactPrompt) {
      this.displayCtx.fillStyle = 'rgba(10,31,68,0.85)';
      this.displayCtx.fillRect(dw * 0.25, dh * 0.62, dw * 0.5, 28);
      this.displayCtx.strokeStyle = '#ffd700';
      this.displayCtx.strokeRect(dw * 0.25, dh * 0.62, dw * 0.5, 28);
      this.displayCtx.fillStyle = '#ffd700';
      this.displayCtx.font = '13px system-ui';
      this.displayCtx.textAlign = 'center';
      this.displayCtx.fillText(this.interactPrompt, dw / 2, dh * 0.62 + 19);
    }

    if (this.messageLife > 0) {
      this.displayCtx.fillStyle = 'rgba(0,0,0,0.55)';
      this.displayCtx.fillRect(dw * 0.12, 36, dw * 0.76, 36);
      this.displayCtx.fillStyle = '#ffd700';
      this.displayCtx.font = '14px system-ui';
      this.displayCtx.textAlign = 'center';
      this.displayCtx.fillText(this.message, dw / 2, 59);
    }

    if (this.campaignComplete) {
      this.displayCtx.fillStyle = 'rgba(10,31,68,0.75)';
      this.displayCtx.fillRect(0, 0, dw, dh);
      this.displayCtx.fillStyle = '#ffd700';
      this.displayCtx.font = 'bold 28px system-ui';
      this.displayCtx.textAlign = 'center';
      this.displayCtx.fillText('EPISODE 1 COMPLETE', dw / 2, dh / 2 - 30);
      this.displayCtx.font = '15px system-ui';
      this.displayCtx.fillStyle = '#e8e8e8';
      this.displayCtx.fillText(
        `Train: ${p.conversions} · Plaques: ${p.plaquesRead.size} · Brand: ${p.brand}`,
        dw / 2,
        dh / 2 + 8,
      );
      this.displayCtx.fillText('Save kept — Continue later for Ep 2. New Game to restart.', dw / 2, dh / 2 + 36);
    }

    // HUD
    const res = Math.max(0, Math.min(100, p.resolve));
    this.resolveFill.style.width = `${res}%`;
    this.voiceFill.style.width = `${Math.max(0, p.voice)}%`;
    this.resolvePct.textContent = String(Math.round(res));
    this.resolvePct.classList.toggle('low', res <= 50 && res > 25);
    this.resolvePct.classList.toggle('critical', res <= 25);
    this.resolveMeter.classList.toggle('low', res <= 50 && res > 25);
    this.resolveMeter.classList.toggle('critical', res <= 25);
    if (res > 70) this.resolveFace.textContent = '😎';
    else if (res > 40) this.resolveFace.textContent = '😐';
    else if (res > 20) this.resolveFace.textContent = '😤';
    else this.resolveFace.textContent = '😵';

    this.hurtVignette.classList.remove('hidden', 'active', 'critical');
    if (res <= 25) this.hurtVignette.classList.add('critical');
    else if (this.hurtFlash > 0) this.hurtVignette.classList.add('active');
    else this.hurtVignette.classList.add('hidden');

    this.dashFill.style.width = `${Math.max(0, this.dashStamina)}%`;
    this.dashFill.classList.toggle('ready', this.dashStamina >= 95 && this.dashCooldown <= 0);
    this.dashFill.classList.toggle('active', this.dashing);

    this.weaponName.textContent = weaponLabel(p.weapon);
    const keys = [p.hasRedKey ? '🔑R' : '', p.hasBlueKey ? '🔑B' : ''].filter(Boolean).join(' ');
    this.statsEl.textContent = `EP${this.map.episode ?? '?'} · TRAIN ${p.conversions} · PLAQUES ${p.plaquesRead.size} · BRAND ${p.brand}${keys ? ' · ' + keys : ''}${this.dashing ? ' · DASH' : ''}`;
    if (this.locationEl) this.locationEl.textContent = this.map.name;
  }

  private drawWeapon() {
    const ctx = this.offCtx;
    const bob = Math.sin(this.weaponBob) * 3;
    const kick = this.player.attackCooldown > 0.15 ? 8 : 0;
    const baseY = RENDER_H - 10 + bob + kick;
    const baseX = RENDER_W * 0.55;

    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.moveTo(baseX - 10, RENDER_H);
    ctx.lineTo(baseX + 5, baseY - 40);
    ctx.lineTo(baseX + 50, baseY - 30);
    ctx.lineTo(baseX + 70, RENDER_H);
    ctx.fill();

    ctx.fillStyle = '#e0b892';
    ctx.fillRect(baseX + 8, baseY - 48, 28, 22);
    ctx.fillStyle = '#c41e3a';
    ctx.fillRect(baseX - 4, baseY - 20, 8, 24);
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(baseX + 6, baseY - 28, 14, 5);

    if (this.player.weapon === 'gavel') {
      ctx.fillStyle = '#5c3317';
      ctx.fillRect(baseX + 18, baseY - 70, 10, 36);
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(baseX + 8, baseY - 78, 36, 16);
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(baseX + 12, baseY - 74, 8, 8);
    } else {
      ctx.fillStyle = '#333';
      ctx.fillRect(baseX + 24, baseY - 72, 6, 40);
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(baseX + 27, baseY - 78, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#00c2ff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

