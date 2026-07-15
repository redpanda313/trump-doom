import type { GameMap } from '../engine/map';
import { isSolid, setCell, cloneMap } from '../engine/map';
import { Input } from '../engine/input';
import { Raycaster, setAngle, type SpriteDraw } from '../engine/raycaster';
import {
  createWallTextures,
  drawPlaqueSprite,
  drawPickupSprite,
  drawExitSprite,
  drawButtonSprite,
  drawPhoneSprite,
  drawBossSprite,
  drawFoeSprite,
} from '../engine/textures';
import { findOpenSpawn, findBossAddSpawn } from '../engine/spawn';
import { zoneThemeForEpisode, type ZoneTheme, type FoeKindName } from '../engine/zoneTheme';
import { GameAudio } from '../engine/audio';
import {
  type PlayerState,
  type Enemy,
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
  bossMeta,
} from './entities';
import { tryPrimaryFire, tryAltFire, weaponLabel, applyMetaToPlayer, syncMetaFromPlayer } from './weapons';
import { getMapTemplate, CAMPAIGN_START, countCampaignPlaques } from '../assets/maps';
import { type SaveData, writeSave, loadSave, clearSave } from './save';
import { BASE_LOOK_SENS } from './settings';
import {
  sectionForMap,
  difficultyForEpisode,
  chooseEp7Approach,
  evaluateEnding,
  type EndingResult,
} from './campaign';
import {
  defaultMeta,
  type MetaProgress,
  SHOP_CATALOG,
  itemCost,
  canShowItem,
  applyPurchase,
  isShopMapId,
} from './shop';
import type { WeaponId } from './entities';

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
  private zone: ZoneTheme = zoneThemeForEpisode(0);
  private textures = createWallTextures(this.zone);
  private raycaster: Raycaster;
  private deathFx: {
    t: number;
    duration: number;
    text: string;
    mode: 'level' | 'section';
    targetMapId: string;
  } | null = null;
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
  private levelDeaths = 0;
  private sectionRestarts = 0;
  private deepfakeBeaten = false;
  private ending: EndingResult | null = null;
  private meta: MetaProgress = defaultMeta();
  private shopOpen = false;
  private dropSerial = 0;

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
  private shopPanel: HTMLElement | null = null;
  private shopList: HTMLElement | null = null;
  private shopBrandEl: HTMLElement | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private displayCtx: CanvasRenderingContext2D,
    mode: StartMode = 'new',
  ) {
    this.mapId = CAMPAIGN_START;
    this.map = cloneMap(getMapTemplate(this.mapId));
    this.player = createDefaultPlayer(this.map.spawn);
    applyMetaToPlayer(this.player, this.meta);
    this.player.resolve = this.player.maxResolve;
    this.player.voice = this.player.maxVoice;
    this.player.shield = this.player.maxShield;

    if (mode === 'continue') {
      const save = loadSave();
      if (save) this.applySave(save);
    } else {
      clearSave();
    }

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

    // Zone look + safe spawns after save applied
    this.applyZoneTheme();
    const safePlayer = findOpenSpawn(this.map, this.player.x, this.player.y);
    if (safePlayer) {
      this.player.x = safePlayer.x;
      this.player.y = safePlayer.y;
    }
    this.bootstrapEntities();
    this.applyMapFlags();
    this.sanitizeEntityPositions();

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
    this.shopPanel = document.getElementById('shop-panel');
    this.shopList = document.getElementById('shop-list');
    this.shopBrandEl = document.getElementById('shop-brand');
    this.wirePauseMenu();
    this.wireShop();
  }

  private applySave(save: SaveData) {
    this.mapId = save.mapId;
    this.map = cloneMap(getMapTemplate(this.mapId));
    this.completedMaps = [...save.completedMaps];
    this.mapFlags = { ...save.mapFlags };
    this.meta = { ...defaultMeta(), ...save.meta };
    this.meta.weaponLevel = { ...defaultMeta().weaponLevel, ...save.meta.weaponLevel };
    this.meta.ownedWeapons = [...(save.meta.ownedWeapons ?? ['gavel', 'mic'])];
    this.meta.purchased = [...(save.meta.purchased ?? [])];
    const p = save.player;
    this.player = createDefaultPlayer({ x: p.x, y: p.y, angle: p.angle });
    this.player.brand = p.brand;
    this.player.hasRedKey = p.hasRedKey;
    this.player.hasBlueKey = p.hasBlueKey ?? false;
    this.player.weapon = p.weapon;
    this.player.plaquesRead = new Set(p.plaquesRead);
    this.player.conversions = p.conversions;
    this.player.attackCooldown = 0;
    this.player.invuln = 1;
    applyMetaToPlayer(this.player, this.meta);
    this.player.resolve = Math.min(p.resolve, this.player.maxResolve);
    this.player.voice = Math.min(p.voice, this.player.maxVoice);
    this.player.shield = Math.min(p.shield ?? this.player.maxShield, this.player.maxShield);
    this.prevResolve = this.player.resolve;
    this.levelDeaths = save.levelDeaths ?? 0;
    this.sectionRestarts = save.sectionRestarts ?? 0;
    this.deepfakeBeaten = save.deepfakeBeaten ?? false;
  }

  private wireShop() {
    document.getElementById('btn-shop-close')?.addEventListener('click', () => {
      this.setShopOpen(false);
      this.canvas.requestPointerLock();
    });
    document.getElementById('btn-shop-leave')?.addEventListener('click', () => {
      this.leaveShop();
    });
  }

  private setShopOpen(v: boolean) {
    this.shopOpen = v;
    if (!this.shopPanel) return;
    if (v) {
      this.shopPanel.classList.remove('hidden');
      if (document.pointerLockElement) document.exitPointerLock();
      this.refreshShopUi();
    } else {
      this.shopPanel.classList.add('hidden');
    }
  }

  private refreshShopUi() {
    if (!this.shopList || !this.shopBrandEl) return;
    this.shopBrandEl.textContent = String(this.player.brand);
    this.shopList.innerHTML = '';
    const items = SHOP_CATALOG.filter((it) => canShowItem(it, this.meta));
    if (!items.length) {
      this.shopList.innerHTML = '<p class="shop-item-desc">No new deals. Come back after more sections.</p>';
      return;
    }
    for (const item of items) {
      const cost = itemCost(item, this.meta);
      const row = document.createElement('div');
      row.className = `shop-item cat-${item.category}`;
      const can = this.player.brand >= cost;
      row.innerHTML = `
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.desc}</div>
        <button type="button" ${can ? '' : 'disabled'}>${cost} Brand</button>
      `;
      const btn = row.querySelector('button')!;
      btn.addEventListener('click', () => {
        if (this.player.brand < cost) return;
        this.player.brand -= cost;
        applyPurchase(item, this.meta);
        applyMetaToPlayer(this.player, this.meta);
        this.player.resolve = Math.min(this.player.maxResolve, this.player.resolve + 5);
        this.player.shield = this.player.maxShield;
        this.audio.pickup();
        this.showToast(`Purchased: ${item.name}`, 2);
        this.refreshShopUi();
        this.saveGame();
      });
      this.shopList.appendChild(row);
    }
  }

  private leaveShop() {
    if (!isShopMapId(this.mapId)) return;
    const next = this.map.nextMapId;
    this.setShopOpen(false);
    // Mark section progress for unlock gates
    const n = Number(this.mapId.replace('shop_', '')) + 1;
    this.meta.sectionsCleared = Math.max(this.meta.sectionsCleared, n);
    syncMetaFromPlayer(this.player, this.meta);
    let dest = next;
    if (dest === 'ep7_approach') {
      dest = chooseEp7Approach(this.player.brand, this.player.plaquesRead.size);
      this.showToast(
        dest === 'ep7_gold'
          ? 'High Brand — Golden path!'
          : dest === 'ep7_codex'
            ? 'Codex path unlocked!'
            : 'Swamp approach.',
        3,
      );
    }
    if (dest) {
      this.pendingNextMap = dest;
      this.transitionTimer = 0.4;
      this.mapComplete = true;
    }
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
    syncMetaFromPlayer(this.player, this.meta);
    const data: SaveData = {
      version: 3,
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
        shield: this.player.shield,
      },
      completedMaps: [...this.completedMaps],
      mapFlags: { ...this.mapFlags },
      locationLabel: this.map.name,
      savedAt: Date.now(),
      levelDeaths: this.levelDeaths,
      sectionRestarts: this.sectionRestarts,
      deepfakeBeaten: this.deepfakeBeaten,
      meta: structuredClone(this.meta),
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

    const diff = difficultyForEpisode(this.map.episode ?? 0);
    let pi = 0;
    for (const e of this.map.entities) {
      if (e.type === 'karen' || e.type === 'libtard' || e.type === 'woke' || e.type === 'bureaucrat') {
        const elite = e.type === 'karen' && !!e.elite;
        // Prefer zone roster flavor while keeping elite karens
        let kind: FoeKindName =
          e.type === 'karen'
            ? 'karen'
            : e.type;
        if (!elite && this.zone.enemyRoster.length && Math.random() < 0.35) {
          kind = this.zone.enemyRoster[(Math.random() * this.zone.enemyRoster.length) | 0]!;
        }
        const stats = foeBaseStats(kind, elite);
        const hp = Math.round(stats.hp * diff.hpMul);
        const pos = findOpenSpawn(this.map, e.x, e.y);
        if (!pos) continue;
        this.enemies.push({
          kind,
          x: pos.x,
          y: pos.y,
          hp,
          maxHp: hp,
          speed: stats.speed * diff.speedMul,
          hurt: 0,
          attackCd: 0,
          alive: true,
          bob: Math.random() * Math.PI * 2,
          elite,
          damage: Math.round(stats.dmg * diff.dmgMul),
          radius: 0.4,
        });
      } else if (e.type === 'boss' || e.type === 'boss_manager') {
        const variant = e.type === 'boss_manager' ? 'manager' : e.variant;
        const meta = bossMeta(variant);
        const hp = Math.round(meta.hp * (0.85 + (this.map.episode ?? 0) * 0.05));
        const pos = findOpenSpawn(this.map, e.x, e.y, 0.35) ?? { x: e.x, y: e.y };
        this.enemies.push({
          kind: 'boss',
          variant,
          title: meta.title,
          x: pos.x,
          y: pos.y,
          hp,
          maxHp: hp,
          speed: meta.speed,
          hurt: 0,
          attackCd: 0,
          spawnCd: 3.5,
          alive: true,
          bob: 0,
          phase: 1,
          elite: false,
          damage: meta.dmg,
          radius: 0.7,
        });
      } else if (e.type === 'plaque') {
        const pos = findOpenSpawn(this.map, e.x, e.y) ?? { x: e.x, y: e.y };
        this.plaques.push({
          kind: 'plaque',
          x: pos.x,
          y: pos.y,
          id: e.id,
          title: e.title,
          text: e.text,
          read: this.player.plaquesRead.has(e.id),
        });
      } else if (e.type === 'pickup') {
        const flag = `pickup_${pi++}`;
        const pos = findOpenSpawn(this.map, e.x, e.y);
        if (!pos) continue;
        this.pickups.push({
          kind: 'pickup',
          x: pos.x,
          y: pos.y,
          item: e.kind,
          taken: this.hasFlag(flag),
          flag,
        });
      } else if (e.type === 'exit') {
        const pos = findOpenSpawn(this.map, e.x, e.y) ?? { x: e.x, y: e.y };
        this.exit = { kind: 'exit', x: pos.x, y: pos.y };
      } else if (e.type === 'button') {
        const pos = findOpenSpawn(this.map, e.x, e.y) ?? { x: e.x, y: e.y };
        this.buttons.push({
          kind: 'button',
          x: pos.x,
          y: pos.y,
          openCells: e.openCells,
          flag: e.flag,
          label: e.label,
          used: this.hasFlag(e.flag),
        });
      } else if (e.type === 'phone') {
        const pos = findOpenSpawn(this.map, e.x, e.y) ?? { x: e.x, y: e.y };
        this.phones.push({
          kind: 'phone',
          x: pos.x,
          y: pos.y,
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

  private applyZoneTheme() {
    this.zone = zoneThemeForEpisode(this.map.episode ?? 0);
    this.map.floorColor = this.zone.floor;
    this.map.ceilingColor = this.zone.ceiling;
    this.textures = createWallTextures(this.zone);
    this.raycaster.setAtmosphere(this.zone.fog, this.zone.fogRgb);
    this.audio.setTheme(this.zone.music);
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

  private loadMap(id: string, atSpawn = true, heal = true) {
    this.mapId = id;
    this.map = cloneMap(getMapTemplate(id));
    this.applyZoneTheme();
    if (atSpawn) {
      const spawn =
        findOpenSpawn(this.map, this.map.spawn.x, this.map.spawn.y) ?? this.map.spawn;
      this.player.x = spawn.x;
      this.player.y = spawn.y;
      this.player.angle = this.map.spawn.angle;
      this.player.hasRedKey = false;
      this.player.hasBlueKey = false;
      if (heal) {
        this.player.resolve = Math.min(100, this.player.resolve + 15);
        this.player.voice = Math.min(100, this.player.voice + 25);
      } else {
        this.player.resolve = 100;
        this.player.voice = 80;
      }
    } else {
      // Continue: snap player out of walls if save put them inside
      const safe = findOpenSpawn(this.map, this.player.x, this.player.y);
      if (safe) {
        this.player.x = safe.x;
        this.player.y = safe.y;
      }
    }
    this.bootstrapEntities();
    this.applyMapFlags();
    // Re-snap entities after flags open walls/secrets
    this.sanitizeEntityPositions();
    applyMetaToPlayer(this.player, this.meta);
    if (heal) {
      this.player.resolve = Math.min(this.player.maxResolve, this.player.resolve);
      this.player.shield = this.player.maxShield;
    } else {
      this.player.resolve = this.player.maxResolve;
      this.player.voice = this.player.maxVoice;
      this.player.shield = this.player.maxShield;
    }
    this.saveGame();
    this.showToast(`${this.map.name} — ${this.zone.label}`, 3);
    this.audio.levelClear();
    if (isShopMapId(id)) {
      const n = Number(id.replace('shop_', '')) + 1;
      this.meta.sectionsCleared = Math.max(this.meta.sectionsCleared, n);
      window.setTimeout(() => this.setShopOpen(true), 400);
    }
  }

  /** After doors/secrets open, pull any stuck sprites into open floor. */
  private sanitizeEntityPositions() {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const p = findOpenSpawn(this.map, e.x, e.y, e.kind === 'boss' ? 0.35 : 0.22);
      if (p) {
        e.x = p.x;
        e.y = p.y;
      }
    }
    for (const p of this.pickups) {
      if (p.taken) continue;
      const pos = findOpenSpawn(this.map, p.x, p.y);
      if (pos) {
        p.x = pos.x;
        p.y = pos.y;
      }
    }
    for (const pl of this.plaques) {
      const pos = findOpenSpawn(this.map, pl.x, pl.y);
      if (pos) {
        pl.x = pos.x;
        pl.y = pos.y;
      }
    }
    if (this.exit) {
      const pos = findOpenSpawn(this.map, this.exit.x, this.exit.y);
      if (pos) {
        this.exit.x = pos.x;
        this.exit.y = pos.y;
      }
    }
  }

  async start() {
    await this.audio.resume();
    this.applyZoneTheme();
    this.showToast(
      this.map.episode === 0
        ? `Episode 0 — ${this.zone.label}. Esc: settings & save.`
        : `${this.map.name} — ${this.zone.ambientLabel}`,
      4,
    );
    this.saveGame();
  }

  update(dt: number) {
    // Death cinematic — freeze everything but the fade
    if (this.deathFx) {
      this.deathFx.t += dt;
      if (this.deathFx.t >= this.deathFx.duration) {
        const fx = this.deathFx;
        this.deathFx = null;
        this.finishDeathRestart(fx.mode, fx.targetMapId);
      }
      this.input.endFrame();
      return;
    }

    if (this.input.pausePressed) {
      this.setPaused(!this.paused);
    }

    if (this.paused || this.shopOpen) {
      // Allow Esc to close shop into pause? keep shop open until closed
      if (this.shopOpen && this.input.pausePressed) {
        this.setShopOpen(false);
      }
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

    const sm = p.speedMul || 1;
    if (canDash && dashVec) {
      if (!this.dashing) this.audio.dash();
      this.dashing = true;
      const speed = 7.2 * sm * dt;
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
      const speed = (this.input.sprinting() ? 3.6 : 2.4) * sm * dt;
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
    if (p.specialCooldown > 0) p.specialCooldown -= dt;
    if (p.freezePulse > 0) p.freezePulse -= dt;
    if (p.repelPulse > 0) p.repelPulse -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.bossSilenceTimer > 0) this.bossSilenceTimer -= dt;
    p.momentum = Math.max(0, p.momentum - dt * 18);
    p.voice = Math.min(p.maxVoice, p.voice + dt * 4);
    if (p.regen > 0 && p.resolve < p.maxResolve) {
      p.resolve = Math.min(p.maxResolve, p.resolve + p.regen * dt);
    }

    this.handleWeaponSwitch();
    this.handleSpecials();
    if (!isShopMapId(this.mapId)) {
      this.handleFire();
    }
    if (this.input.interactPressed) {
      if (isShopMapId(this.mapId)) this.setShopOpen(true);
      else this.tryInteract();
    }
    this.updateInteractPrompt();

    if (!isShopMapId(this.mapId)) {
      this.updateEnemies(dt);
      this.updateProjectiles(dt);
    }
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

  private handleWeaponSwitch() {
    const p = this.player;
    const slots: WeaponId[] = ['gavel', 'mic', 'framing', 'logic', 'facts', 'wall', 'charisma'];
    const slot = this.input.weaponSlot;
    if (slot != null && slot >= 1 && slot <= 7) {
      const w = slots[slot - 1]!;
      if (p.ownedWeapons.includes(w)) p.weapon = w;
    }
  }

  private handleSpecials() {
    const p = this.player;
    if (p.specialCooldown > 0) return;
    // F = Truth Bomb, C = Freeze, V = Repel
    if (this.input.keys.has('KeyF') && p.bombs > 0) {
      p.bombs -= 1;
      p.specialCooldown = 0.4;
      this.meta.bombs = p.bombs;
      this.audio.trumpTrain();
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < 3.2) this.damageEnemy(e, 55);
      }
      this.spawnParticles(p.x, p.y, '#ffd700', 24);
      this.showToast('TRUTH BOMB!', 1.2);
    } else if (this.input.keys.has('KeyC') && p.freezes > 0) {
      p.freezes -= 1;
      p.specialCooldown = 0.4;
      this.meta.freezes = p.freezes;
      this.audio.plaque();
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < 4) e.frozen = 2.8;
      }
      this.showToast('GAVEL FREEZE!', 1.2);
    } else if (this.input.keys.has('KeyV') && p.repels > 0) {
      p.repels -= 1;
      p.specialCooldown = 0.4;
      this.meta.repels = p.repels;
      p.invuln = Math.max(p.invuln, 1.2);
      this.audio.dash();
      const fx = Math.cos(p.angle);
      const fy = Math.sin(p.angle);
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < 3.5 && d > 0.01) {
          e.x += ((e.x - p.x) / d) * 1.4 + fx * 0.3;
          e.y += ((e.y - p.y) / d) * 1.4 + fy * 0.3;
        }
      }
      this.showToast('REPELLANT PULSE!', 1.2);
    }
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
      for (const [dx, dy] of [
        [Math.cos(p.angle), Math.sin(p.angle)],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const cx = Math.floor(p.x + (dx as number));
        const cy = Math.floor(p.y + (dy as number));
        if (cx < 0 || cy < 0 || cx >= this.map.width || cy >= this.map.height) continue;
        if (this.map.grid[cy * this.map.width + cx] === 3) {
          this.interactPrompt = 'E — Unlock with Red Tie Key';
          return;
        }
      }
    }
    if (this.exit && Math.hypot(this.exit.x - p.x, this.exit.y - p.y) < 2.2) {
      this.interactPrompt = 'Walk into EXIT pad to leave the basement';
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
        this.sanitizeEntityPositions();
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
      if (Math.hypot(e.x - p.x, e.y - p.y) < 1.5) {
        // Open every cell tied to this secret flag (multi-tile doors)
        for (const s of this.map.entities) {
          if (s.type === 'secret_trigger' && (s.flag ?? 'secret') === flag) {
            setCell(this.map, s.wallX, s.wallY, 0);
          }
        }
        this.addFlag(flag);
        this.audio.plaque();
        this.sanitizeEntityPositions();
        this.showToast('Secret opened — tremendous room!', 3);
        this.saveGame();
        return;
      }
    }
    if (p.hasRedKey) {
      // Face door, or stand adjacent — more forgiving than exact look cell
      const candidates: [number, number][] = [
        [Math.floor(p.x + Math.cos(p.angle)), Math.floor(p.y + Math.sin(p.angle))],
        [Math.floor(p.x + Math.cos(p.angle) * 1.2), Math.floor(p.y + Math.sin(p.angle) * 1.2)],
        [Math.floor(p.x) + 1, Math.floor(p.y)],
        [Math.floor(p.x) - 1, Math.floor(p.y)],
        [Math.floor(p.x), Math.floor(p.y) + 1],
        [Math.floor(p.x), Math.floor(p.y) - 1],
      ];
      const nearDoor = candidates.some(([cx, cy]) => {
        if (cx < 0 || cy < 0 || cx >= this.map.width || cy >= this.map.height) return false;
        return this.map.grid[cy * this.map.width + cx] === 3;
      });
      if (nearDoor) {
        for (let y = 0; y < this.map.height; y++) {
          for (let x = 0; x < this.map.width; x++) {
            if (this.map.grid[y * this.map.width + x] === 3) setCell(this.map, x, y, 0);
          }
        }
        this.addFlag('red_doors_open');
        this.sanitizeEntityPositions();
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
      e.rangedCd = Math.max(0, (e.rangedCd ?? 0) - dt);
      if ((e.frozen ?? 0) > 0) {
        e.frozen = (e.frozen ?? 0) - dt;
        continue;
      }

      if (e.kind === 'boss') {
        this.updateBoss(e, dt);
        continue;
      }

      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy);
      const range = e.elite ? 10 : e.kind === 'libtard' ? 9 : 8;

      let preferDist = 0.55;
      if (e.kind === 'libtard' && dist < 2.8) preferDist = 2.4;

      if (dist < range && dist > preferDist) {
        const sp = e.speed * dt * (e.hurt > 0 ? 0.4 : 1);
        const nx = e.x + (dx / dist) * sp;
        const ny = e.y + (dy / dist) * sp;
        if (!isSolid(this.map, nx, e.y)) e.x = nx;
        if (!isSolid(this.map, e.x, ny)) e.y = ny;
      } else if (e.kind === 'libtard' && dist < preferDist && dist > 0.2) {
        const sp = e.speed * dt;
        const nx = e.x - (dx / dist) * sp;
        const ny = e.y - (dy / dist) * sp;
        if (!isSolid(this.map, nx, e.y)) e.x = nx;
        if (!isSolid(this.map, e.x, ny)) e.y = ny;
      }

      // Libtards: slow hashtag projectiles
      if (e.kind === 'libtard' && dist < 9 && dist > 1.5 && (e.rangedCd ?? 0) <= 0) {
        e.rangedCd = 1.8;
        const sp = 3.2;
        this.projectiles.push({
          x: e.x,
          y: e.y,
          vx: (dx / dist) * sp,
          vy: (dy / dist) * sp,
          damage: Math.round((e.damage ?? 12) * 0.7),
          life: 2.8,
          kind: 'enemy_slow',
          hostile: true,
          radius: 0.28,
        });
      }

      const hitRange = e.elite ? 0.75 : e.kind === 'woke' ? 0.8 : 0.7;
      const dmg = e.damage ?? 12;
      if (dist < hitRange && e.attackCd <= 0 && p.invuln <= 0 && !this.dashing) {
        e.attackCd = e.elite ? 0.85 : e.kind === 'bureaucrat' ? 1.2 : 1.0;
        this.hurtPlayer(dmg);
      }
    }
  }

  private updateBoss(b: Enemy, dt: number) {
    const p = this.player;
    b.phase = b.hp < b.maxHp * 0.45 ? 2 : 1;
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > 1.2 && dist < 14) {
      const sp = (b.speed ?? 1) * (b.phase === 2 ? 1.25 : 1) * dt;
      const nx = b.x + (dx / dist) * sp;
      const ny = b.y + (dy / dist) * sp;
      if (!isSolid(this.map, nx, b.y)) b.x = nx;
      if (!isSolid(this.map, b.x, ny)) b.y = ny;
    }
    if (dist < 1.05 && b.attackCd <= 0 && p.invuln <= 0 && !this.dashing) {
      b.attackCd = 0.95;
      this.hurtPlayer(b.damage ?? 22);
    }

    // Distinct ranged patterns
    b.rangedCd = (b.rangedCd ?? 1.5) - dt;
    if ((b.rangedCd ?? 0) <= 0 && dist < 12) {
      b.rangedCd = b.phase === 2 ? 1.1 : 1.7;
      this.fireBossRanged(b, dx / dist, dy / dist, dist);
    }

    b.spawnCd = (b.spawnCd ?? 4) - dt;
    if ((b.spawnCd ?? 0) <= 0 && this.bossSilenceTimer <= 0 && b.variant !== 'deepfake') {
      b.spawnCd = b.phase === 2 ? 4.2 : 6.5;
      const aliveAdds = this.enemies.filter((e) => e.kind !== 'boss' && e.alive).length;
      if (aliveAdds < 5 + (this.map.episode ?? 0)) {
        const pos = findBossAddSpawn(this.map, b.x, b.y);
        if (pos) {
          const diff = difficultyForEpisode(this.map.episode ?? 0);
          const roster = this.zone.enemyRoster;
          const kind = roster[(Math.random() * roster.length) | 0] ?? 'karen';
          const stats = foeBaseStats(kind, false);
          const hp = Math.round(stats.hp * 0.75 * diff.hpMul);
          this.enemies.push({
            kind,
            x: pos.x,
            y: pos.y,
            hp,
            maxHp: hp,
            speed: stats.speed * diff.speedMul,
            hurt: 0,
            attackCd: 0.5,
            alive: true,
            bob: 0,
            elite: false,
            damage: Math.round(stats.dmg * diff.dmgMul),
            rangedCd: 1,
          });
          this.showToast(`${b.title ?? 'Boss'} summoned backup!`, 1.4);
        }
      }
    }
  }

  private fireBossRanged(b: Enemy, nx: number, ny: number, dist: number) {
    const dmg = Math.round((b.damage ?? 20) * 0.65);
    const v = b.variant ?? 'manager';
    if (v === 'manager') {
      // Slow clipboard lob
      this.projectiles.push({
        x: b.x,
        y: b.y,
        vx: nx * 2.8,
        vy: ny * 2.8,
        damage: dmg,
        life: 2.5,
        kind: 'boss_clip',
        hostile: true,
        radius: 0.35,
      });
    } else if (v === 'hydra') {
      // Fan of hashtags
      for (let i = -2; i <= 2; i++) {
        const a = Math.atan2(ny, nx) + i * 0.22;
        this.projectiles.push({
          x: b.x,
          y: b.y,
          vx: Math.cos(a) * 4.5,
          vy: Math.sin(a) * 4.5,
          damage: Math.round(dmg * 0.7),
          life: 2,
          kind: 'boss_hash',
          hostile: true,
          radius: 0.25,
        });
      }
    } else if (v === 'autopen') {
      // Fast ink bolts
      this.projectiles.push({
        x: b.x,
        y: b.y,
        vx: nx * 8,
        vy: ny * 8,
        damage: dmg + 4,
        life: 1.2,
        kind: 'boss_ink',
        hostile: true,
        radius: 0.2,
      });
    } else if (v === 'fraud') {
      // Arc of ballots
      for (let i = -1; i <= 1; i++) {
        const a = Math.atan2(ny, nx) + i * 0.35;
        this.projectiles.push({
          x: b.x,
          y: b.y,
          vx: Math.cos(a) * 3.5,
          vy: Math.sin(a) * 3.5,
          damage: dmg,
          life: 2.4,
          kind: 'boss_ballot',
          hostile: true,
          radius: 0.3,
        });
      }
    } else if (v === 'tribunal') {
      // Sideways gavel waves
      const px = -ny;
      const py = nx;
      for (const s of [-1, 1]) {
        this.projectiles.push({
          x: b.x + px * s * 0.4,
          y: b.y + py * s * 0.4,
          vx: nx * 5 + px * s * 1.2,
          vy: ny * 5 + py * s * 1.2,
          damage: dmg + 2,
          life: 1.6,
          kind: 'boss_gavel',
          hostile: true,
          radius: 0.32,
        });
      }
    } else if (v === 'media') {
      // Piercing laser shot
      this.projectiles.push({
        x: b.x,
        y: b.y,
        vx: nx * 12,
        vy: ny * 12,
        damage: dmg + 6,
        life: 0.9,
        kind: 'boss_laser',
        hostile: true,
        radius: 0.18,
      });
    } else if (v === 'swamp') {
      // Homing-ish fog orbs (slow, slightly tracking via multiple)
      for (let i = 0; i < 3; i++) {
        const a = Math.atan2(ny, nx) + (i - 1) * 0.4;
        this.projectiles.push({
          x: b.x,
          y: b.y,
          vx: Math.cos(a) * 2.4,
          vy: Math.sin(a) * 2.4,
          damage: dmg,
          life: 3,
          kind: 'boss_fog',
          hostile: true,
          radius: 0.4,
        });
      }
    } else if (v === 'deepfake') {
      this.projectiles.push({
        x: b.x,
        y: b.y,
        vx: nx * 6,
        vy: ny * 6,
        damage: dmg,
        life: 1.5,
        kind: 'boss_mirror',
        hostile: true,
        radius: 0.28,
      });
    } else {
      this.projectiles.push({
        x: b.x,
        y: b.y,
        vx: nx * 4,
        vy: ny * 4,
        damage: dmg,
        life: 2,
        kind: 'enemy_slow',
        hostile: true,
      });
    }
    void dist;
  }

  private hurtPlayer(amount: number) {
    if (this.deathFx) return;
    const p = this.player;
    let dmg = amount;
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed;
      dmg -= absorbed;
      this.spawnParticles(p.x, p.y, '#5dade2', 4);
    }
    if (dmg <= 0) {
      this.audio.hit();
      p.invuln = 0.35;
      return;
    }
    p.resolve -= dmg;
    p.invuln = 0.6;
    p.momentum = 0;
    this.audio.hurt();
    this.hurtFlash = 0.55;
    this.spawnParticles(p.x, p.y, '#c41e3a', 6);
    if (p.resolve <= 0) {
      p.resolve = 0;
      this.beginDeathSequence();
    }
  }

  private beginDeathSequence() {
    if (this.deathFx) return;
    this.audio.death();
    this.levelDeaths += 1;
    this.player.invuln = 99;
    this.player.momentum = 0;
    this.player.attackCooldown = 99;

    const mode: 'level' | 'section' = this.levelDeaths <= 1 ? 'level' : 'section';
    let targetMapId = this.mapId;
    if (mode === 'section') {
      this.sectionRestarts += 1;
      this.levelDeaths = 0;
      const sec = sectionForMap(this.mapId);
      for (const mid of sec.mapIds) this.mapFlags[mid] = [];
      targetMapId = sec.startMapId;
    } else {
      this.mapFlags[this.mapId] = [];
    }

    this.deathFx = {
      t: 0,
      duration: 3.2,
      text: randomDeathLine(),
      mode,
      targetMapId,
    };
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private finishDeathRestart(mode: 'level' | 'section', targetMapId: string) {
    this.loadMap(targetMapId, true, false);
    this.player.invuln = 2;
    this.player.attackCooldown = 0;
    this.showToast(
      mode === 'level'
        ? 'Retry this level — the train still needs you.'
        : `Section restart — ${sectionForMap(targetMapId).name}.`,
      3.5,
    );
    this.saveGame();
  }

  private updateProjectiles(dt: number) {
    const p = this.player;
    for (const pr of this.projectiles) {
      pr.life -= dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (isSolid(this.map, pr.x, pr.y)) {
        pr.life = 0;
        continue;
      }
      if (pr.hostile) {
        const hitR = pr.radius ?? 0.3;
        if (Math.hypot(pr.x - p.x, pr.y - p.y) < hitR + 0.2 && p.invuln <= 0 && !this.dashing) {
          this.hurtPlayer(pr.damage);
          pr.life = 0;
        }
        continue;
      }
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const r = (e.kind === 'boss' ? (e.radius ?? 0.7) : 0.4) + (pr.radius ?? 0);
        if (Math.hypot(e.x - pr.x, e.y - pr.y) < r) {
          this.damageEnemy(e, pr.damage);
          pr.life = 0;
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.life > 0);
  }

  private damageEnemy(e: Enemy, amount: number) {
    if (!e.alive) return;
    let dmg = amount;
    if (e.elite) dmg *= 0.9;
    if (e.kind === 'bureaucrat') dmg *= 0.75;
    if (e.variant === 'deepfake') dmg *= 1.15; // logic fantasy — more damage
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
    let brandGain = 5;
    if (e.kind === 'boss') brandGain = e.variant === 'swamp' ? 80 : e.variant === 'deepfake' ? 40 : 55;
    else if (e.elite) brandGain = 12;
    else if (e.kind === 'woke') brandGain = 8;
    else if (e.kind === 'bureaucrat') brandGain = 10;
    this.player.brand += brandGain;
    this.audio.trumpTrain();
    const line =
      e.kind === 'boss'
        ? `${(e.title ?? 'BOSS').toUpperCase()} JOINED THE TRUMP-TRAIN!`
        : randomConversionLine();
    this.showConvert(line);
    this.spawnParticles(e.x, e.y, '#c41e3a', 18);
    this.spawnParticles(e.x, e.y, '#ffd700', 12);

    // Occasional food / gold (Brand) drops
    if (e.kind !== 'boss') {
      const foodChance = e.elite ? 0.45 : 0.22;
      const goldChance = e.elite ? 0.4 : 0.18;
      if (Math.random() < foodChance) {
        const kind = Math.random() < 0.5 ? 'resolve' : 'voice';
        const pos = findOpenSpawn(this.map, e.x, e.y);
        if (pos) {
          this.pickups.push({
            kind: 'pickup',
            x: pos.x,
            y: pos.y,
            item: kind,
            taken: false,
            flag: `drop_${this.dropSerial++}`,
          });
        }
      }
      if (Math.random() < goldChance) {
        const pos = findOpenSpawn(this.map, e.x + 0.3, e.y + 0.3) ?? findOpenSpawn(this.map, e.x, e.y);
        if (pos) {
          this.pickups.push({
            kind: 'pickup',
            x: pos.x,
            y: pos.y,
            item: 'brand',
            taken: false,
            flag: `drop_${this.dropSerial++}`,
          });
        }
      }
    } else if (Math.random() < 0.85) {
      // Bosses almost always drop gold
      const pos = findOpenSpawn(this.map, e.x, e.y);
      if (pos) {
        this.pickups.push({
          kind: 'pickup',
          x: pos.x,
          y: pos.y,
          item: 'brand',
          taken: false,
          flag: `drop_${this.dropSerial++}`,
        });
      }
    }

    if (e.variant === 'deepfake') {
      this.deepfakeBeaten = true;
      this.showToast('Deepfake converted — truth prevails.', 3);
    }
    if (e.kind === 'boss' && e.variant !== 'deepfake') {
      this.showToast('Boss converted! Head to the EXIT.', 4);
    }
    this.saveGame();
  }

  private updatePickups() {
    const p = this.player;
    for (const item of this.pickups) {
      if (item.taken) continue;
      if (Math.hypot(item.x - p.x, item.y - p.y) > 0.5) continue;
      item.taken = true;
      if (!item.flag.startsWith('drop_')) this.addFlag(item.flag);
      this.audio.pickup();
      if (item.item === 'resolve') {
        p.resolve = Math.min(p.maxResolve, p.resolve + 35);
        this.showToast('Cheeseburger — Resolve up!', 2);
      } else if (item.item === 'voice') {
        p.voice = Math.min(p.maxVoice, p.voice + 40);
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
    // Required bosses must be converted (deepfake is optional)
    const blocking = this.enemies.find(
      (e) => e.kind === 'boss' && e.alive && e.variant !== 'deepfake',
    );
    if (blocking) return;

    if (Math.hypot(this.exit.x - this.player.x, this.exit.y - this.player.y) < 1.15) {
      this.mapComplete = true;
      if (!this.completedMaps.includes(this.mapId)) {
        this.completedMaps.push(this.mapId);
      }
      // Passing a level resets death-penalty ladder
      this.levelDeaths = 0;
      this.audio.levelClear();

      let next = this.map.nextMapId;
      if (next === 'ep7_approach') {
        next = chooseEp7Approach(this.player.brand, this.player.plaquesRead.size);
        this.showToast(
          next === 'ep7_gold'
            ? 'High Brand — Golden Escalator path unlocked!'
            : next === 'ep7_codex'
              ? 'Plaque scholar — Codex Hall path unlocked!'
              : 'Swamp approach — the hard road.',
          3.5,
        );
      }

      if (next) {
        this.showToast(`AREA CLEAR — ${this.map.name}`, 2.5);
        this.pendingNextMap = next;
        this.transitionTimer = 2.2;
        this.saveGame();
      } else {
        this.ending = evaluateEnding({
          plaquesRead: [...this.player.plaquesRead],
          brand: this.player.brand,
          conversions: this.player.conversions,
          sectionRestarts: this.sectionRestarts,
          deepfakeBeaten: this.deepfakeBeaten,
          totalPlaques: countCampaignPlaques(),
        });
        this.showToast(this.ending.title, 6);
        this.showConvert(this.ending.subtitle);
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
      if (e.kind === 'boss') {
        drawBossSprite(this.spriteCtx, 64, 64, e.hurt > 0 ? 1 : this.frame >> 3, e.variant);
        sprites.push({
          x: e.x,
          y: e.y,
          dist: Math.hypot(e.x - p.x, e.y - p.y),
          canvas: cloneCanvas(this.spriteBuf),
          scale: e.variant === 'deepfake' ? 1.0 : 1.35,
        });
      } else {
        drawFoeSprite(this.spriteCtx, 64, 64, e.kind, e.hurt > 0 ? 1 : this.frame >> 3);
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
      const color = pr.hostile
        ? pr.kind === 'boss_laser'
          ? '#ff3355'
          : pr.kind === 'boss_fog'
            ? '#2ecc71'
            : '#e74c3c'
        : pr.kind === 'logic'
          ? '#f1c40f'
          : pr.kind === 'frame'
            ? '#9b59b6'
            : pr.kind === 'facts'
              ? '#ecf0f1'
              : '#00c2ff';
      this.spriteCtx.fillStyle = color;
      this.spriteCtx.beginPath();
      this.spriteCtx.arc(32, 32, pr.hostile ? 12 : 14, 0, Math.PI * 2);
      this.spriteCtx.fill();
      sprites.push({
        x: pr.x,
        y: pr.y,
        dist: Math.hypot(pr.x - p.x, pr.y - p.y),
        canvas: cloneCanvas(this.spriteBuf),
        scale: pr.hostile ? 0.28 : 0.3,
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

    // Death cinematic: blue fade + freeze message
    if (this.deathFx) {
      const u = Math.min(1, this.deathFx.t / this.deathFx.duration);
      const fade = Math.min(1, u * 1.4);
      this.displayCtx.fillStyle = `rgba(10, 40, 90, ${0.35 + fade * 0.55})`;
      this.displayCtx.fillRect(0, 0, dw, dh);
      // vignette
      const grad = this.displayCtx.createRadialGradient(dw / 2, dh / 2, dh * 0.1, dw / 2, dh / 2, dh * 0.7);
      grad.addColorStop(0, 'rgba(20,60,120,0)');
      grad.addColorStop(1, `rgba(0,20,60,${fade * 0.7})`);
      this.displayCtx.fillStyle = grad;
      this.displayCtx.fillRect(0, 0, dw, dh);

      const textAlpha = Math.min(1, Math.max(0, (u - 0.15) / 0.35));
      this.displayCtx.save();
      this.displayCtx.globalAlpha = textAlpha;
      this.displayCtx.fillStyle = '#a8d4ff';
      this.displayCtx.font = 'bold 22px system-ui';
      this.displayCtx.textAlign = 'center';
      this.displayCtx.shadowColor = '#003366';
      this.displayCtx.shadowBlur = 12;
      wrapText(this.displayCtx, this.deathFx.text, dw / 2, dh / 2 - 10, dw * 0.75, 28);
      this.displayCtx.font = '13px system-ui';
      this.displayCtx.fillStyle = '#7eb6e8';
      this.displayCtx.shadowBlur = 0;
      this.displayCtx.fillText(
        this.deathFx.mode === 'level' ? 'Retrying level…' : 'Restarting section…',
        dw / 2,
        dh / 2 + 50,
      );
      this.displayCtx.restore();
      return; // skip normal HUD pulse during death
    }

    // boss HP bar (primary non-deepfake boss, or any)
    const boss =
      this.enemies.find((e) => e.kind === 'boss' && e.alive && e.variant !== 'deepfake') ??
      this.enemies.find((e) => e.kind === 'boss' && e.alive);
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
        `${boss.title ?? 'BOSS'}${this.bossSilenceTimer > 0 ? ' · LINE JAMMED' : ''}`,
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
      this.displayCtx.fillStyle = 'rgba(10,31,68,0.82)';
      this.displayCtx.fillRect(0, 0, dw, dh);
      this.displayCtx.fillStyle = '#ffd700';
      this.displayCtx.font = 'bold 26px system-ui';
      this.displayCtx.textAlign = 'center';
      const end = this.ending;
      this.displayCtx.fillText(end?.title ?? 'CAMPAIGN COMPLETE', dw / 2, dh / 2 - 50);
      this.displayCtx.font = '15px system-ui';
      this.displayCtx.fillStyle = '#82e0aa';
      this.displayCtx.fillText(end?.subtitle ?? 'Victory', dw / 2, dh / 2 - 22);
      this.displayCtx.fillStyle = '#e8e8e8';
      this.displayCtx.font = '13px system-ui';
      const blurb = end?.blurb ?? 'The train rolls on.';
      wrapText(this.displayCtx, blurb, dw / 2, dh / 2 + 8, dw * 0.7, 18);
      this.displayCtx.fillStyle = '#ffd700';
      this.displayCtx.font = '14px system-ui';
      this.displayCtx.fillText(
        `Train ${p.conversions} · Plaques ${p.plaquesRead.size}/${countCampaignPlaques()} · Brand ${p.brand} · Section restarts ${this.sectionRestarts}`,
        dw / 2,
        dh / 2 + 90,
      );
      this.displayCtx.fillStyle = '#8a95a5';
      this.displayCtx.font = '12px system-ui';
      this.displayCtx.fillText('New Game from title for another ending path.', dw / 2, dh / 2 + 118);
    }

    // HUD
    const maxR = p.maxResolve || 100;
    const resPct = Math.max(0, Math.min(100, (p.resolve / maxR) * 100));
    const res = p.resolve;
    this.resolveFill.style.width = `${resPct}%`;
    this.voiceFill.style.width = `${Math.max(0, (p.voice / (p.maxVoice || 100)) * 100)}%`;
    this.resolvePct.textContent = String(Math.round(res));
    this.resolvePct.classList.toggle('low', resPct <= 50 && resPct > 25);
    this.resolvePct.classList.toggle('critical', resPct <= 25);
    this.resolveMeter.classList.toggle('low', resPct <= 50 && resPct > 25);
    this.resolveMeter.classList.toggle('critical', resPct <= 25);
    if (resPct > 70) this.resolveFace.textContent = '😎';
    else if (resPct > 40) this.resolveFace.textContent = '😐';
    else if (resPct > 20) this.resolveFace.textContent = '😤';
    else this.resolveFace.textContent = '😵';

    this.hurtVignette.classList.remove('hidden', 'active', 'critical');
    if (res <= 25) this.hurtVignette.classList.add('critical');
    else if (this.hurtFlash > 0) this.hurtVignette.classList.add('active');
    else this.hurtVignette.classList.add('hidden');

    this.dashFill.style.width = `${Math.max(0, this.dashStamina)}%`;
    this.dashFill.classList.toggle('ready', this.dashStamina >= 95 && this.dashCooldown <= 0);
    this.dashFill.classList.toggle('active', this.dashing);

    this.weaponName.textContent = weaponLabel(p.weapon, p.weaponLevel[p.weapon] ?? 0);
    const keys = [p.hasRedKey ? '🔑R' : '', p.hasBlueKey ? '🔑B' : ''].filter(Boolean).join(' ');
    const inv = [
      p.shield > 0 ? `🛡${Math.ceil(p.shield)}` : '',
      p.bombs > 0 ? `💣${p.bombs}` : '',
      p.freezes > 0 ? `❄${p.freezes}` : '',
      p.repels > 0 ? `💨${p.repels}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    this.statsEl.textContent = `EP${this.map.episode ?? '?'} · ${this.zone.label.toUpperCase()} · TRAIN ${p.conversions} · PLAQUES ${p.plaquesRead.size} · BRAND ${p.brand} · ☠${this.levelDeaths}${keys ? ' · ' + keys : ''}${inv ? ' · ' + inv : ''}${this.dashing ? ' · DASH' : ''}${isShopMapId(this.mapId) ? ' · SHOP' : ''}`;
    if (this.locationEl) {
      this.locationEl.textContent = isShopMapId(this.mapId)
        ? `${this.map.name} · Press E for shop`
        : `${this.map.name} · ${this.zone.ambientLabel}`;
    }
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

    const wpn = this.player.weapon;
    if (wpn === 'gavel') {
      ctx.fillStyle = '#5c3317';
      ctx.fillRect(baseX + 18, baseY - 70, 10, 36);
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(baseX + 8, baseY - 78, 36, 16);
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(baseX + 12, baseY - 74, 8, 8);
    } else if (wpn === 'mic' || wpn === 'charisma') {
      ctx.fillStyle = '#333';
      ctx.fillRect(baseX + 24, baseY - 72, 6, 40);
      ctx.fillStyle = wpn === 'charisma' ? '#c41e3a' : '#222';
      ctx.beginPath();
      ctx.arc(baseX + 27, baseY - 78, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = wpn === 'charisma' ? '#ffd700' : '#00c2ff';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (wpn === 'framing') {
      ctx.fillStyle = '#9b59b6';
      ctx.fillRect(baseX + 20, baseY - 75, 22, 28);
      ctx.strokeStyle = '#ffd700';
      ctx.strokeRect(baseX + 20, baseY - 75, 22, 28);
    } else if (wpn === 'logic') {
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(baseX + 22, baseY - 80, 8, 50);
    } else if (wpn === 'facts') {
      ctx.fillStyle = '#ecf0f1';
      ctx.fillRect(baseX + 14, baseY - 70, 30, 36);
      ctx.strokeStyle = '#333';
      ctx.strokeRect(baseX + 14, baseY - 70, 30, 36);
    } else {
      ctx.fillStyle = '#0a1f44';
      ctx.fillRect(baseX + 10, baseY - 75, 40, 40);
      ctx.strokeStyle = '#ffd700';
      ctx.strokeRect(baseX + 10, baseY - 75, 40, 40);
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

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineHeight;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

function foeBaseStats(kind: FoeKindName, elite: boolean): { hp: number; speed: number; dmg: number } {
  if (elite) return { hp: 110, speed: 1.2, dmg: 18 };
  switch (kind) {
    case 'libtard':
      return { hp: 48, speed: 1.75, dmg: 14 };
    case 'woke':
      return { hp: 90, speed: 1.15, dmg: 16 };
    case 'bureaucrat':
      return { hp: 120, speed: 0.95, dmg: 15 };
    case 'karen':
    default:
      return { hp: 60, speed: 1.4, dmg: 12 };
  }
}

const DEATH_LINES = [
  'You caved to the woke mob…',
  'They got your manager. And then you.',
  'Resolve depleted. The narrative wins this round.',
  'Fact-checked into next week.',
  'Canceled. Temporarily.',
  'The Autopen signed your defeat.',
  'Injunction granted: silence.',
  'Ratings tanked. Comeback pending.',
  'You asked for the manager of reality. Reality said no.',
  'Speech bubble: "oof."',
  'The train left without you. Catch the next one.',
  'Brand damage critical. Rebuild required.',
  'Safe space claimed your spawn point.',
  'Polls say you lost. Rallies say retry.',
  'Deepfake of your defeat trending.',
];

function randomDeathLine(): string {
  return DEATH_LINES[(Math.random() * DEATH_LINES.length) | 0]!;
}

