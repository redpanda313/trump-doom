import type { GameMap } from '../engine/map';
import { isSolid, setCell } from '../engine/map';
import { Input } from '../engine/input';
import { Raycaster, setAngle, type SpriteDraw } from '../engine/raycaster';
import {
  createWallTextures,
  drawKarenSprite,
  drawPlaqueSprite,
  drawPickupSprite,
  drawExitSprite,
} from '../engine/textures';
import { GameAudio } from '../engine/audio';
import {
  type PlayerState,
  type KarenEnemy,
  type PlaqueEntity,
  type PickupEntity,
  type ExitEntity,
  type Floater,
  type Particle,
  type Projectile,
  randomConversionLine,
} from './entities';
import { tryPrimaryFire, tryAltFire, weaponLabel } from './weapons';
import { ep0Basement } from '../assets/maps/ep0_basement';

const RENDER_W = 320;
const RENDER_H = 200;

export class Game {
  private map: GameMap;
  private player: PlayerState;
  private enemies: KarenEnemy[] = [];
  private plaques: PlaqueEntity[] = [];
  private pickups: PickupEntity[] = [];
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
  private won = false;
  private message = '';
  private messageLife = 0;
  private weaponBob = 0;
  private secretOpened = false;
  private frame = 0;

  // HUD DOM
  private resolveFill: HTMLElement;
  private voiceFill: HTMLElement;
  private weaponName: HTMLElement;
  private plaqueToast: HTMLElement;
  private convertToast: HTMLElement;
  private statsEl: HTMLElement;

  constructor(
    private canvas: HTMLCanvasElement,
    private displayCtx: CanvasRenderingContext2D,
  ) {
    this.map = structuredClone(ep0Basement) as GameMap;
    // deep-ish clone grid
    this.map.grid = [...ep0Basement.grid];
    this.map.entities = ep0Basement.entities.map((e) => ({ ...e }));

    this.player = {
      x: this.map.spawn.x,
      y: this.map.spawn.y,
      angle: this.map.spawn.angle,
      resolve: 100,
      voice: 100,
      brand: 0,
      momentum: 0,
      hasRedKey: false,
      weapon: 'gavel',
      attackCooldown: 0,
      invuln: 0,
      plaquesRead: new Set(),
      conversions: 0,
    };

    this.bootstrapEntities();
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
  }

  private bootstrapEntities() {
    for (const e of this.map.entities) {
      if (e.type === 'karen') {
        this.enemies.push({
          kind: 'karen',
          x: e.x,
          y: e.y,
          hp: 60,
          maxHp: 60,
          speed: 1.4,
          hurt: 0,
          attackCd: 0,
          alive: true,
          bob: Math.random() * Math.PI * 2,
        });
      } else if (e.type === 'plaque') {
        this.plaques.push({
          kind: 'plaque',
          x: e.x,
          y: e.y,
          id: e.id,
          title: e.title,
          text: e.text,
          read: false,
        });
      } else if (e.type === 'pickup') {
        this.pickups.push({
          kind: 'pickup',
          x: e.x,
          y: e.y,
          item: e.kind,
          taken: false,
        });
      } else if (e.type === 'exit') {
        this.exit = { kind: 'exit', x: e.x, y: e.y };
      }
    }
  }

  async start() {
    await this.audio.resume();
    this.showToast('Pointer lock on click · WASD move · Mouse look · LMB fire · E interact', 4);
  }

  update(dt: number) {
    if (this.won) {
      this.messageLife -= dt;
      this.updateFloaters(dt);
      return;
    }

    this.time += dt;
    this.frame++;
    const p = this.player;

    // look
    const sens = 0.0022;
    p.angle += this.input.mouseDX * sens;
    // move
    const axis = this.input.axis();
    const speed = (this.input.sprinting() ? 3.6 : 2.4) * dt;
    const fx = Math.cos(p.angle);
    const fy = Math.sin(p.angle);
    const rx = -fy;
    const ry = fx;
    this.tryMove(p.x + (fx * axis.y + rx * axis.x) * speed, p.y);
    this.tryMove(p.x, p.y + (fy * axis.y + ry * axis.x) * speed);

    this.weaponBob += Math.hypot(axis.x, axis.y) * dt * 12;

    if (p.attackCooldown > 0) p.attackCooldown -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    p.momentum = Math.max(0, p.momentum - dt * 18);
    p.voice = Math.min(100, p.voice + dt * 4);

    // weapons
    if (this.input.weaponSlot === 1) p.weapon = 'gavel';
    if (this.input.weaponSlot === 2) p.weapon = 'mic';

    const lmb = this.input.firePressed || this.input.keys.has('Space');
    // hold-to-fire for primary while button held — use keys Mouse via mousedown only fires once;
    // allow Space hold and continuous if we track buttons — for now fire on press + Space hold
    if (lmb || (this.input.pointerLocked && this.input.keys.has('ControlLeft'))) {
      // handled below with continuous check
    }
    // Continuous fire while mouse held: track via buttons not available easily — use Space or re-click.
    // Improve: check buttons on pointer lock via a flag set on mousedown/up
    this.handleFire(dt);

    if (this.input.interactPressed) this.tryInteract();

    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickups();
    this.updateFloaters(dt);
    this.updateParticles(dt);
    this.checkExit();

    this.messageLife -= dt;
    this.input.endFrame();
    // re-set fire if still holding — Input clears firePressed; use keys for space
  }

  private fireHeld = false;
  private altHeld = false;

  /** Call from main to wire mouse buttons continuous. */
  setFireHeld(v: boolean) {
    this.fireHeld = v;
  }
  setAltHeld(v: boolean) {
    this.altHeld = v;
  }

  private handleFire(_dt: number) {
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
    // locked door cells — use wall type 3 as red-key door in narrow gap
    // handled as solid until key; we open wall cells when key collected near door
    return false;
  }

  private tryInteract() {
    const p = this.player;
    // plaques
    for (const pl of this.plaques) {
      const d = Math.hypot(pl.x - p.x, pl.y - p.y);
      if (d < 1.2) {
        pl.read = true;
        p.plaquesRead.add(pl.id);
        this.audio.plaque();
        this.showPlaque(`${pl.title}: ${pl.text}`);
        return;
      }
    }
    // secret wall open if nearby and has explored
    for (const e of this.map.entities) {
      if (e.type !== 'secret_trigger') continue;
      if (this.secretOpened) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < 1.3) {
        setCell(this.map, e.wallX, e.wallY, 0);
        this.secretOpened = true;
        this.audio.plaque();
        this.showToast('Secret opened — tremendous room.', 3);
        return;
      }
    }
    // red key door: open cells marked 3 near player if has key
    if (p.hasRedKey) {
      const cx = Math.floor(p.x + Math.cos(p.angle));
      const cy = Math.floor(p.y + Math.sin(p.angle));
      if (this.map.grid[cy * this.map.width + cx] === 3) {
        setCell(this.map, cx, cy, 0);
        // open neighbors that are door red
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const id = this.map.grid[(cy + dy!) * this.map.width + (cx + dx!)]!;
          if (id === 3) setCell(this.map, cx + dx!, cy + dy!, 0);
        }
        this.showToast('Red Tie Key accepted. Door open.', 2.5);
        this.audio.pickup();
      }
    }
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.bob += dt * 6;
      e.hurt = Math.max(0, e.hurt - dt);
      e.attackCd = Math.max(0, e.attackCd - dt);

      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 8 && dist > 0.55) {
        const sp = e.speed * dt * (e.hurt > 0 ? 0.4 : 1);
        const nx = e.x + (dx / dist) * sp;
        const ny = e.y + (dy / dist) * sp;
        if (!isSolid(this.map, nx, e.y)) e.x = nx;
        if (!isSolid(this.map, e.x, ny)) e.y = ny;
      }

      if (dist < 0.7 && e.attackCd <= 0 && p.invuln <= 0) {
        e.attackCd = 1.1;
        p.resolve -= 12;
        p.invuln = 0.6;
        p.momentum = 0;
        this.audio.hurt();
        this.spawnParticles(p.x, p.y, '#c41e3a', 6);
        if (p.resolve <= 0) {
          p.resolve = 0;
          this.respawn();
        }
      }
    }
  }

  private respawn() {
    this.player.x = this.map.spawn.x;
    this.player.y = this.map.spawn.y;
    this.player.angle = this.map.spawn.angle;
    this.player.resolve = 100;
    this.player.voice = 80;
    this.player.invuln = 2;
    this.showToast('Resolve failed — back to the basement. Try again.', 3);
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
        if (Math.hypot(e.x - pr.x, e.y - pr.y) < 0.4) {
          this.damageEnemy(e, pr.damage);
          pr.life = 0;
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  private damageEnemy(e: KarenEnemy, amount: number) {
    if (!e.alive) return;
    e.hp -= amount;
    e.hurt = 0.25;
    this.player.momentum = Math.min(100, this.player.momentum + 12);
    this.audio.hit();
    this.spawnParticles(e.x, e.y, '#ffd700', 4);
    if (e.hp <= 0) {
      e.alive = false;
      this.convertEnemy(e);
    }
  }

  private convertEnemy(e: KarenEnemy) {
    this.player.conversions++;
    this.player.brand += 5;
    this.audio.trumpTrain();
    const line = randomConversionLine();
    this.showConvert(line);
    this.spawnParticles(e.x, e.y, '#c41e3a', 18);
    this.spawnParticles(e.x, e.y, '#ffd700', 12);
    // world floater approx via screen message is enough; also particles
  }

  private updatePickups() {
    const p = this.player;
    for (const item of this.pickups) {
      if (item.taken) continue;
      if (Math.hypot(item.x - p.x, item.y - p.y) > 0.5) continue;
      item.taken = true;
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
        this.showToast('Red Tie Key acquired. Find the red door.', 3);
      }
    }
  }

  private checkExit() {
    if (!this.exit || this.won) return;
    if (Math.hypot(this.exit.x - this.player.x, this.exit.y - this.player.y) < 0.6) {
      // require at least one conversion for tutorial? optional — allow always
      this.won = true;
      this.showToast(
        `EPISODE CLEAR — Conversions: ${this.player.conversions} · Plaques: ${this.player.plaquesRead.size}`,
        10,
      );
      this.showConvert('THE TRAIN ROLLS ON…');
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

    // enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      drawKarenSprite(this.spriteCtx, 64, 64, e.hurt > 0 ? 1 : this.frame >> 3);
      const c = cloneCanvas(this.spriteBuf);
      sprites.push({
        x: e.x,
        y: e.y,
        dist: Math.hypot(e.x - p.x, e.y - p.y),
        canvas: c,
        scale: 0.9,
      });
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

    // projectile sprites as gold dots via small canvas
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

    // weapon hand overlay on offscreen
    this.drawWeapon();

    // scale to display
    const dw = this.canvas.clientWidth;
    const dh = this.canvas.clientHeight;
    this.canvas.width = dw * Math.min(devicePixelRatio, 2);
    this.canvas.height = dh * Math.min(devicePixelRatio, 2);
    this.displayCtx.setTransform(Math.min(devicePixelRatio, 2), 0, 0, Math.min(devicePixelRatio, 2), 0, 0);
    this.displayCtx.imageSmoothingEnabled = false;
    this.displayCtx.drawImage(this.offscreen, 0, 0, dw, dh);

    // crosshair
    this.displayCtx.strokeStyle = 'rgba(255,215,0,0.85)';
    this.displayCtx.lineWidth = 2;
    const cx = dw / 2;
    const cy = dh / 2;
    this.displayCtx.beginPath();
    this.displayCtx.moveTo(cx - 8, cy);
    this.displayCtx.lineTo(cx + 8, cy);
    this.displayCtx.moveTo(cx, cy - 8);
    this.displayCtx.lineTo(cx, cy + 8);
    this.displayCtx.stroke();

    if (this.messageLife > 0) {
      this.displayCtx.fillStyle = 'rgba(0,0,0,0.55)';
      this.displayCtx.fillRect(dw * 0.15, 40, dw * 0.7, 36);
      this.displayCtx.fillStyle = '#ffd700';
      this.displayCtx.font = '14px system-ui';
      this.displayCtx.textAlign = 'center';
      this.displayCtx.fillText(this.message, dw / 2, 63);
    }

    if (this.won) {
      this.displayCtx.fillStyle = 'rgba(10,31,68,0.7)';
      this.displayCtx.fillRect(0, 0, dw, dh);
      this.displayCtx.fillStyle = '#ffd700';
      this.displayCtx.font = 'bold 32px system-ui';
      this.displayCtx.textAlign = 'center';
      this.displayCtx.fillText('EPISODE 0 COMPLETE', dw / 2, dh / 2 - 20);
      this.displayCtx.font = '16px system-ui';
      this.displayCtx.fillStyle = '#e8e8e8';
      this.displayCtx.fillText(
        `Trump-Train recruits: ${p.conversions} · Plaques: ${p.plaquesRead.size}/3 · Brand: ${p.brand}`,
        dw / 2,
        dh / 2 + 16,
      );
      this.displayCtx.fillText('M1 vertical slice — Ep 1 next. Refresh to replay.', dw / 2, dh / 2 + 44);
    }

    // HUD DOM
    this.resolveFill.style.width = `${Math.max(0, p.resolve)}%`;
    this.voiceFill.style.width = `${Math.max(0, p.voice)}%`;
    this.weaponName.textContent = weaponLabel(p.weapon);
    this.statsEl.textContent = `TRAIN ${p.conversions} · PLAQUES ${p.plaquesRead.size} · BRAND ${p.brand}${p.hasRedKey ? ' · 🔑 RED TIE' : ''}`;
  }

  private drawWeapon() {
    const ctx = this.offCtx;
    const bob = Math.sin(this.weaponBob) * 3;
    const kick = this.player.attackCooldown > 0.15 ? 8 : 0;
    const baseY = RENDER_H - 10 + bob + kick;
    const baseX = RENDER_W * 0.55;

    // suit sleeve
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.moveTo(baseX - 10, RENDER_H);
    ctx.lineTo(baseX + 5, baseY - 40);
    ctx.lineTo(baseX + 50, baseY - 30);
    ctx.lineTo(baseX + 70, RENDER_H);
    ctx.fill();

    // hand
    ctx.fillStyle = '#e0b892';
    ctx.fillRect(baseX + 8, baseY - 48, 28, 22);

    // red tie tip peek
    ctx.fillStyle = '#c41e3a';
    ctx.fillRect(baseX - 4, baseY - 20, 8, 24);

    // gold cuff
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
      // mic
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

