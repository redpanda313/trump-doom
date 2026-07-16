/**
 * Steampunk vertical slice — engineer, robots, jump, height map.
 */

import { Input } from '../engine/input';
import {
  type SteamMap,
  JUMP_HEIGHT,
  EYE_HEIGHT,
  STEP_UP,
  isSolid,
  floorAt,
  wallAt,
} from './map';
import { HeightRaycaster, setAngle, type Cam, type SpriteDraw } from './raycaster';
import {
  createSteamTextures,
  drawRobot,
  drawHusk,
  drawHandWeapon,
  drawWrenchWeapon,
} from './textures';
import { levelFoundry } from './level_foundry';

const RW = 320;
const RH = 200;
const GRAVITY = 12;
const MOVE = 2.6;
const SPRINT = 3.8;

type Weapon = 'hand' | 'wrench';
type RobotState = 'active' | 'disabled' | 'ally' | 'husk';

interface Robot {
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  state: RobotState;
  anim: number;
  attackCd: number;
  hurt: number;
  bob: number;
}

interface Plaque {
  x: number;
  y: number;
  title: string;
  text: string;
}
interface Pickup {
  x: number;
  y: number;
  kind: 'cell' | 'gear' | 'oil';
  taken: boolean;
}
interface Husk {
  x: number;
  y: number;
  z: number;
}

export class SteampunkGame {
  private map: SteamMap;
  private input: Input;
  private ray: HeightRaycaster;
  private off: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private spr: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private tex = createSteamTextures();

  private x = 2.5;
  private y = 2.5;
  private z = 0;
  private vz = 0;
  private angle = 0;
  private onGround = true;
  private health = 100;
  private energy = 100; // reprogram / arc resource
  private weapon: Weapon = 'wrench';
  private atkCd = 0;
  private invuln = 0;
  private arcFlash = 0;
  private reprogFlash = 0;

  private robots: Robot[] = [];
  private plaques: Plaque[] = [];
  private pickups: Pickup[] = [];
  private husks: Husk[] = [];
  private exit: { x: number; y: number } | null = null;
  private allies: Robot[] = [];

  private frame = 0;
  private msg = '';
  private msgLife = 0;
  private won = false;
  private paused = false;
  private fireHeld = false;

  private hpFill: HTMLElement;
  private enFill: HTMLElement;
  private weaponEl: HTMLElement;
  private statsEl: HTMLElement;
  private locEl: HTMLElement | null;
  private toastEl: HTMLElement;
  private convertEl: HTMLElement;

  constructor(
    private canvas: HTMLCanvasElement,
    private dctx: CanvasRenderingContext2D,
  ) {
    this.map = structuredClone(levelFoundry) as SteamMap;
    // deep copy arrays
    this.map.walls = [...levelFoundry.walls];
    this.map.floorZ = [...levelFoundry.floorZ];
    this.map.ceilZ = [...levelFoundry.ceilZ];
    this.map.floorTex = [...levelFoundry.floorTex];
    this.map.ceilTex = [...levelFoundry.ceilTex];
    this.map.entities = levelFoundry.entities.map((e) => ({ ...e }));

    this.x = this.map.spawn.x;
    this.y = this.map.spawn.y;
    this.z = this.map.spawn.z;
    this.angle = this.map.spawn.angle;

    this.bootstrap();
    this.input = new Input(canvas);
    this.off = document.createElement('canvas');
    this.off.width = RW;
    this.off.height = RH;
    this.octx = this.off.getContext('2d')!;
    this.ray = new HeightRaycaster(this.octx, RW, RH);
    this.spr = document.createElement('canvas');
    this.spr.width = 64;
    this.spr.height = 64;
    this.sctx = this.spr.getContext('2d')!;

    this.hpFill = document.getElementById('resolve-fill')!;
    this.enFill = document.getElementById('voice-fill')!;
    this.weaponEl = document.getElementById('weapon-name')!;
    this.statsEl = document.getElementById('stats-line')!;
    this.locEl = document.getElementById('location-line');
    this.toastEl = document.getElementById('plaque-toast')!;
    this.convertEl = document.getElementById('convert-toast')!;

    // Relabel HUD for steampunk
    const lab = document.querySelector('.resolve-header .label');
    if (lab) lab.textContent = 'INTEGRITY';
    const vlab = document.querySelectorAll('.hud-bar .label');
    vlab.forEach((el) => {
      if (el.textContent === 'VOICE') el.textContent = 'PLASMA';
    });
    const face = document.getElementById('resolve-face');
    if (face) face.textContent = '🔧';
  }

  private bootstrap() {
    for (const e of this.map.entities) {
      if (e.type === 'robot') {
        const z = e.z ?? floorAt(this.map, e.x, e.y);
        this.robots.push({
          x: e.x,
          y: e.y,
          z,
          hp: 70,
          maxHp: 70,
          state: 'active',
          anim: Math.random() * 8,
          attackCd: 0,
          hurt: 0,
          bob: 0,
        });
      } else if (e.type === 'plaque') {
        this.plaques.push({ x: e.x, y: e.y, title: e.title, text: e.text });
      } else if (e.type === 'pickup') {
        this.pickups.push({ x: e.x, y: e.y, kind: e.kind, taken: false });
      } else if (e.type === 'exit') {
        this.exit = { x: e.x, y: e.y };
      }
    }
  }

  async start() {
    this.toast('Foundry Annex — Space jump · 1 Hand · 2 Wrench · E interact', 4.5);
  }

  setFireHeld(v: boolean) {
    this.fireHeld = v;
  }
  setAltHeld(_v: boolean) {}

  update(dt: number) {
    if (this.input.pausePressed) {
      this.paused = !this.paused;
      if (this.paused) document.exitPointerLock();
      else this.canvas.requestPointerLock();
    }
    if (this.paused || this.won) {
      this.input.endFrame();
      return;
    }

    this.frame++;
    this.msgLife -= dt;
    if (this.atkCd > 0) this.atkCd -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.arcFlash > 0) this.arcFlash -= dt;
    if (this.reprogFlash > 0) this.reprogFlash -= dt;
    this.energy = Math.min(100, this.energy + dt * 8);

    // look
    this.angle += this.input.mouseDX * 0.0022;

    // jump
    if (
      (this.input.keys.has('Space') || this.input.keys.has('KeyJ')) &&
      this.onGround
    ) {
      this.vz = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
      this.onGround = false;
    }

    // gravity + vertical
    this.vz -= GRAVITY * dt;
    let nz = this.z + this.vz * dt;
    const ground = floorAt(this.map, this.x, this.y);
    if (nz <= ground) {
      nz = ground;
      this.vz = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    this.z = nz;

    // move
    const axis = this.input.axis();
    const speed = (this.input.sprinting() ? SPRINT : MOVE) * dt;
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const rx = -fy;
    const ry = fx;
    this.tryMove(this.x + (fx * axis.y + rx * axis.x) * speed, this.y);
    this.tryMove(this.x, this.y + (fy * axis.y + ry * axis.x) * speed);

    // snap to floor when grounded after move
    if (this.onGround) {
      this.z = floorAt(this.map, this.x, this.y);
    }

    if (this.input.weaponSlot === 1) this.weapon = 'hand';
    if (this.input.weaponSlot === 2) this.weapon = 'wrench';

    if (this.fireHeld || this.input.firePressed || this.input.keys.has('ControlLeft')) {
      this.fire();
    }
    if (this.input.interactPressed) this.interact();

    this.updateRobots(dt);
    this.updateAllies(dt);
    this.updatePickups();
    this.checkExit();
    this.input.endFrame();
  }

  private tryMove(nx: number, ny: number) {
    const r = 0.18;
    if (!this.blocked(nx, this.y, r)) this.x = nx;
    if (!this.blocked(this.x, ny, r)) this.y = ny;
  }

  private blocked(px: number, py: number, r: number): boolean {
    for (const ox of [-r, r]) {
      for (const oy of [-r, r]) {
        const tx = px + ox;
        const ty = py + oy;
        if (isSolid(this.map, tx, ty)) return true;
        // Can't walk into higher floor without enough height
        const f = floorAt(this.map, tx, ty);
        if (f > this.z + STEP_UP && this.onGround) return true;
        if (f > this.z + JUMP_HEIGHT + 0.05) return true;
      }
    }
    return false;
  }

  private fire() {
    if (this.atkCd > 0) return;
    if (this.weapon === 'wrench') {
      this.atkCd = 0.35;
      this.arcFlash = 0.15;
      // Arc melee cone
      const range = 1.45;
      const fx = Math.cos(this.angle);
      const fy = Math.sin(this.angle);
      for (const rob of this.robots) {
        if (rob.state !== 'active' && rob.state !== 'ally') continue;
        if (rob.state === 'ally') continue;
        const dx = rob.x - this.x;
        const dy = rob.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d > range || d < 0.01) continue;
        if ((dx / d) * fx + (dy / d) * fy < 0.55) continue;
        this.hurtRobot(rob, 28);
      }
    } else {
      // Hand — reprogram disabled robots in range
      this.atkCd = 0.4;
      if (this.energy < 20) {
        this.toast('Low plasma — wait to reprogram.', 1.5);
        return;
      }
      let best: Robot | null = null;
      let bestD = 1.6;
      for (const rob of this.robots) {
        if (rob.state !== 'disabled') continue;
        const d = Math.hypot(rob.x - this.x, rob.y - this.y);
        if (d < bestD) {
          best = rob;
          bestD = d;
        }
      }
      if (best) {
        this.energy -= 20;
        this.reprogFlash = 0.35;
        best.state = 'ally';
        best.hp = 35;
        best.maxHp = 35;
        this.allies.push(best);
        this.flash('REPROGRAMMED — unit online', true);
      } else {
        this.toast('No disabled frame in range. Arc them first.', 2);
      }
    }
  }

  private hurtRobot(rob: Robot, dmg: number) {
    if (rob.state !== 'active') return;
    rob.hp -= dmg;
    rob.hurt = 0.2;
    if (rob.hp <= 0) {
      rob.hp = 0;
      rob.state = 'disabled';
      this.toast('Frame disabled — Hand to reprogram, or destroy.', 2.5);
    }
  }

  private interact() {
    // Destroy disabled robot → husk
    for (const rob of this.robots) {
      if (rob.state !== 'disabled') continue;
      if (Math.hypot(rob.x - this.x, rob.y - this.y) < 1.4) {
        rob.state = 'husk';
        this.husks.push({ x: rob.x, y: rob.y, z: rob.z });
        this.toast('Frame scrapped — metal husk remains.', 2);
        return;
      }
    }
    for (const pl of this.plaques) {
      if (Math.hypot(pl.x - this.x, pl.y - this.y) < 1.3) {
        this.plaque(`${pl.title}: ${pl.text}`);
        return;
      }
    }
  }

  private updateRobots(dt: number) {
    for (const rob of this.robots) {
      if (rob.state === 'husk' || rob.state === 'ally') continue;
      rob.anim += dt * (rob.attackCd > 0.7 ? 10 : 6);
      rob.hurt = Math.max(0, rob.hurt - dt);
      rob.attackCd = Math.max(0, rob.attackCd - dt);
      rob.z = floorAt(this.map, rob.x, rob.y);

      if (rob.state === 'disabled') continue;

      const dx = this.x - rob.x;
      const dy = this.y - rob.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 9 && dist > 0.7) {
        const sp = 1.25 * dt;
        const nx = rob.x + (dx / dist) * sp;
        const ny = rob.y + (dy / dist) * sp;
        if (!isSolid(this.map, nx, rob.y)) rob.x = nx;
        if (!isSolid(this.map, rob.x, ny)) rob.y = ny;
        // shuffle: slight lateral wobble via anim
      }

      if (dist < 0.85 && rob.attackCd <= 0 && this.invuln <= 0) {
        rob.attackCd = 1.0;
        rob.anim = 0; // attack frames
        this.health -= 12;
        this.invuln = 0.55;
        if (this.health <= 0) {
          this.health = 100;
          this.x = this.map.spawn.x;
          this.y = this.map.spawn.y;
          this.z = this.map.spawn.z;
          this.toast('Integrity failed — respawn at annex door.', 3);
        }
      }
    }
  }

  private updateAllies(dt: number) {
    for (const a of this.allies) {
      if (a.state !== 'ally') continue;
      a.anim += dt * 7;
      a.z = floorAt(this.map, a.x, a.y);
      // Follow player
      const dx = this.x - a.x;
      const dy = this.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1.4 && dist < 12) {
        const sp = 1.6 * dt;
        const nx = a.x + (dx / dist) * sp;
        const ny = a.y + (dy / dist) * sp;
        if (!isSolid(this.map, nx, a.y)) a.x = nx;
        if (!isSolid(this.map, a.x, ny)) a.y = ny;
      }
      // Attack nearest active robot
      a.attackCd = Math.max(0, a.attackCd - dt);
      let target: Robot | null = null;
      let td = 4;
      for (const r of this.robots) {
        if (r.state !== 'active') continue;
        const d = Math.hypot(r.x - a.x, r.y - a.y);
        if (d < td) {
          td = d;
          target = r;
        }
      }
      if (target && td < 1.1 && a.attackCd <= 0) {
        a.attackCd = 0.9;
        this.hurtRobot(target, 12);
      }
    }
  }

  private updatePickups() {
    for (const p of this.pickups) {
      if (p.taken) continue;
      if (Math.hypot(p.x - this.x, p.y - this.y) > 0.5) continue;
      p.taken = true;
      if (p.kind === 'cell') {
        this.energy = Math.min(100, this.energy + 40);
        this.toast('Plasma cell — energy up.', 1.5);
      } else if (p.kind === 'oil') {
        this.health = Math.min(100, this.health + 30);
        this.toast('Machine oil — integrity up.', 1.5);
      } else {
        this.toast('Gear scrap recovered.', 1.5);
      }
    }
  }

  private checkExit() {
    if (!this.exit || this.won) return;
    if (Math.hypot(this.exit.x - this.x, this.exit.y - this.y) < 1.0) {
      this.won = true;
      this.flash('FOUNDRY ANNEX CLEAR — Vertical slice complete', true);
    }
  }

  private toast(t: string, sec: number) {
    this.msg = t;
    this.msgLife = sec;
  }
  private plaque(t: string) {
    this.toastEl.textContent = t;
    this.toastEl.classList.remove('hidden');
    window.setTimeout(() => this.toastEl.classList.add('hidden'), 4500);
  }
  private flash(t: string, convert = false) {
    if (convert) {
      this.convertEl.textContent = t;
      this.convertEl.classList.remove('hidden');
      window.setTimeout(() => this.convertEl.classList.add('hidden'), 2200);
    } else this.toast(t, 2);
  }

  render() {
    const cam: Cam = {
      posX: this.x,
      posY: this.y,
      posZ: this.z,
      dirX: 0,
      dirY: 0,
      planeX: 0,
      planeY: 0,
      eye: EYE_HEIGHT,
    };
    setAngle(cam, this.angle);

    const sprites: SpriteDraw[] = [];
    const f = this.frame >> 2;

    for (const rob of this.robots) {
      if (rob.state === 'husk') continue;
      let st: 'walk' | 'attack' | 'disabled' | 'ally' = 'walk';
      if (rob.state === 'disabled') st = 'disabled';
      else if (rob.state === 'ally') st = 'ally';
      else if (rob.state === 'active' && rob.attackCd > 0.7) st = 'attack';
      drawRobot(this.sctx, 64, 64, f + (rob.anim | 0), st);
      sprites.push({
        x: rob.x,
        y: rob.y,
        z: rob.z,
        dist: Math.hypot(rob.x - this.x, rob.y - this.y),
        canvas: clone(this.spr),
        scale: 0.95,
      });
    }
    for (const h of this.husks) {
      drawHusk(this.sctx, 64, 64);
      sprites.push({
        x: h.x,
        y: h.y,
        z: h.z,
        dist: Math.hypot(h.x - this.x, h.y - this.y),
        canvas: clone(this.spr),
        scale: 0.7,
      });
    }
    for (const pl of this.plaques) {
      this.sctx.clearRect(0, 0, 64, 64);
      this.sctx.fillStyle = '#3a2a18';
      this.sctx.fillRect(8, 16, 48, 32);
      this.sctx.strokeStyle = '#c4a35a';
      this.sctx.strokeRect(8, 16, 48, 32);
      this.sctx.fillStyle = '#c4a35a';
      this.sctx.font = '12px serif';
      this.sctx.textAlign = 'center';
      this.sctx.fillText('⚙', 32, 38);
      sprites.push({
        x: pl.x,
        y: pl.y,
        z: floorAt(this.map, pl.x, pl.y),
        dist: Math.hypot(pl.x - this.x, pl.y - this.y),
        canvas: clone(this.spr),
        scale: 0.5,
      });
    }
    for (const p of this.pickups) {
      if (p.taken) continue;
      this.sctx.clearRect(0, 0, 64, 64);
      this.sctx.fillStyle = p.kind === 'cell' ? '#5ef0a0' : p.kind === 'oil' ? '#6a5a20' : '#c4a35a';
      this.sctx.beginPath();
      this.sctx.arc(32, 36, 12, 0, Math.PI * 2);
      this.sctx.fill();
      sprites.push({
        x: p.x,
        y: p.y,
        z: floorAt(this.map, p.x, p.y),
        dist: Math.hypot(p.x - this.x, p.y - this.y),
        canvas: clone(this.spr),
        scale: 0.35,
      });
    }
    if (this.exit) {
      this.sctx.clearRect(0, 0, 64, 64);
      this.sctx.fillStyle = '#c47830';
      this.sctx.fillRect(12, 12, 40, 44);
      this.sctx.fillStyle = '#1a1008';
      this.sctx.font = 'bold 11px sans-serif';
      this.sctx.textAlign = 'center';
      this.sctx.fillText('EXIT', 32, 38);
      sprites.push({
        x: this.exit.x,
        y: this.exit.y,
        z: floorAt(this.map, this.exit.x, this.exit.y),
        dist: Math.hypot(this.exit.x - this.x, this.exit.y - this.y),
        canvas: clone(this.spr),
        scale: 0.65,
      });
    }

    this.ray.render(this.map, cam, this.tex.walls, this.tex.floors, this.tex.ceils, sprites);

    // weapon overlay
    if (this.weapon === 'hand') drawHandWeapon(this.octx, RW, RH, this.reprogFlash > 0);
    else drawWrenchWeapon(this.octx, RW, RH, this.arcFlash > 0);

    // present
    const dw = this.canvas.clientWidth;
    const dh = this.canvas.clientHeight;
    const dpr = Math.min(devicePixelRatio, 2);
    this.canvas.width = dw * dpr;
    this.canvas.height = dh * dpr;
    this.dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dctx.imageSmoothingEnabled = false;
    this.dctx.drawImage(this.off, 0, 0, dw, dh);

    // crosshair
    this.dctx.strokeStyle = this.weapon === 'hand' ? '#5ef0a0' : '#6ec8ff';
    this.dctx.lineWidth = 2;
    const cx = dw / 2;
    const cy = dh / 2;
    this.dctx.beginPath();
    this.dctx.moveTo(cx - 8, cy);
    this.dctx.lineTo(cx + 8, cy);
    this.dctx.moveTo(cx, cy - 8);
    this.dctx.lineTo(cx, cy + 8);
    this.dctx.stroke();

    if (!this.onGround) {
      this.dctx.fillStyle = 'rgba(200,160,80,0.15)';
      this.dctx.fillRect(0, 0, dw, dh * 0.08);
    }

    if (this.msgLife > 0) {
      this.dctx.fillStyle = 'rgba(20,12,5,0.7)';
      this.dctx.fillRect(dw * 0.12, 36, dw * 0.76, 36);
      this.dctx.fillStyle = '#e8c060';
      this.dctx.font = '14px system-ui';
      this.dctx.textAlign = 'center';
      this.dctx.fillText(this.msg, dw / 2, 59);
    }

    if (this.won) {
      this.dctx.fillStyle = 'rgba(20,12,5,0.8)';
      this.dctx.fillRect(0, 0, dw, dh);
      this.dctx.fillStyle = '#e8c060';
      this.dctx.font = 'bold 26px system-ui';
      this.dctx.textAlign = 'center';
      this.dctx.fillText('FOUNDRY ANNEX — SLICE CLEAR', dw / 2, dh / 2 - 20);
      this.dctx.font = '14px system-ui';
      this.dctx.fillStyle = '#c4a574';
      this.dctx.fillText('Jump · Platforms · Reprogram · Arc wrench validated', dw / 2, dh / 2 + 16);
    }

    // HUD
    this.hpFill.style.width = `${this.health}%`;
    this.enFill.style.width = `${this.energy}%`;
    const pct = document.getElementById('resolve-pct');
    if (pct) pct.textContent = String(Math.round(this.health));
    this.weaponEl.textContent =
      this.weapon === 'hand' ? 'REPROGRAM HAND' : 'ARC WRENCH';
    const allies = this.allies.filter((a) => a.state === 'ally').length;
    const disabled = this.robots.filter((r) => r.state === 'disabled').length;
    this.statsEl.textContent = `ALLIES ${allies} · DISABLED ${disabled} · HUSKS ${this.husks.length}${this.onGround ? '' : ' · AIR'}`;
    if (this.locEl) this.locEl.textContent = `${this.map.name} · Steampunk slice`;
  }
}

function clone(src: HTMLCanvasElement) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

// silence unused
void wallAt;
