/** Steampunk procedural textures — walls, floors, robots. */

export type Tex = ImageData;
const S = 64;

function make(paint: (x: number, y: number) => [number, number, number]): Tex {
  const d = new ImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * S + x) * 4;
      d.data[i] = clamp(r);
      d.data[i + 1] = clamp(g);
      d.data[i + 2] = clamp(b);
      d.data[i + 3] = 255;
    }
  }
  return d;
}
function clamp(n: number) {
  return Math.max(0, Math.min(255, n | 0));
}

export function createSteamTextures(): {
  walls: Map<number, Tex>;
  floors: Map<number, Tex>;
  ceils: Map<number, Tex>;
} {
  const walls = new Map<number, Tex>();
  const floors = new Map<number, Tex>();
  const ceils = new Map<number, Tex>();

  // 1 — riveted brass plate
  walls.set(
    1,
    make((x, y) => {
      const panel = (Math.floor(x / 16) + Math.floor(y / 16)) % 2;
      const base = panel ? [140, 100, 45] : [120, 85, 38];
      const rivet = (x % 16 < 2 || y % 16 < 2) && (x + y) % 8 < 2;
      if (rivet) return [200, 170, 90];
      const n = ((x * 3 + y * 7) & 7) - 3;
      return [base[0]! + n, base[1]! + n, base[2]! + n];
    }),
  );

  // 2 — copper pipe wall
  walls.set(
    2,
    make((x, y) => {
      const pipe = Math.abs((x % 20) - 10) < 4;
      if (pipe) {
        const shine = 160 + Math.sin(y * 0.3) * 30;
        return [shine, shine * 0.55, 40];
      }
      return [55, 48, 42];
    }),
  );

  // 3 — stained glass / window
  walls.set(
    3,
    make((x, y) => {
      if (x < 4 || x > 59 || y < 8 || y > 55) return [80, 60, 40];
      const pane = Math.floor(x / 12) + Math.floor(y / 14);
      const colors: [number, number, number][] = [
        [40, 90, 120],
        [90, 50, 30],
        [50, 100, 60],
        [100, 80, 30],
      ];
      const c = colors[pane % 4]!;
      const lead = x % 12 < 1 || y % 14 < 1;
      return lead ? [30, 28, 25] : c;
    }),
  );

  // 4 — gear / cog relief
  walls.set(
    4,
    make((x, y) => {
      const cx = 32;
      const cy = 32;
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const tooth = Math.abs(Math.sin(ang * 6)) > 0.7 && r > 18 && r < 28;
      if (tooth || (r > 10 && r < 22 && r % 3 < 1.2)) return [180, 140, 60];
      if (r < 10) return [100, 80, 40];
      return [70, 55, 40];
    }),
  );

  // 5 — dark iron boiler
  walls.set(
    5,
    make((x, y) => {
      const band = y > 20 && y < 28;
      const n = ((x * 5 + y) & 15);
      if (band) return [160, 120, 50];
      return [40 + n, 42 + n, 48 + n];
    }),
  );

  // 6 — secret / slightly different brass
  walls.set(
    6,
    make((x, y) => {
      const n = ((x * 11 + y * 5) ^ 3) & 15;
      return [150 + n, 110 + n, 50];
    }),
  );

  // 7 — exit / warning chevron
  walls.set(
    7,
    make((x, y) => {
      const chev = (x + y) % 16 < 8;
      return chev ? [220, 160, 40] : [40, 30, 20];
    }),
  );

  // Floors
  // 1 — worn workshop wood
  floors.set(
    1,
    make((x, y) => {
      const grain = Math.sin(y * 0.5 + x * 0.05) * 15;
      return [90 + grain, 60 + grain * 0.6, 30];
    }),
  );
  // 2 — iron grate / walkway
  floors.set(
    2,
    make((x, y) => {
      const g = x % 8 === 0 || y % 8 === 0;
      return g ? [90, 90, 95] : [35, 35, 40];
    }),
  );
  // 3 — oil-stained concrete (story: leaks)
  floors.set(
    3,
    make((x, y) => {
      const stain = Math.sin(x * 0.2) * Math.cos(y * 0.15) > 0.5;
      const n = ((x + y * 3) & 7);
      return stain ? [40, 35, 20] : [70 + n, 68 + n, 65];
    }),
  );
  // 4 — brass inlay path
  floors.set(
    4,
    make((x, _y) => {
      const path = Math.abs(x - 32) < 10;
      if (path) return [170, 130, 55];
      return [55, 50, 45];
    }),
  );
  // 5 — outdoor cobble
  floors.set(
    5,
    make((x, y) => {
      const cx = x % 12;
      const cy = y % 10;
      const edge = cx < 1 || cy < 1;
      return edge ? [50, 48, 45] : [85 + ((x * y) & 7), 80, 70];
    }),
  );

  // Ceilings
  ceils.set(
    1,
    make((_x, y) => {
      const beam = y % 20 < 3;
      return beam ? [60, 40, 20] : [45, 42, 40];
    }),
  );
  ceils.set(
    2,
    make((x, y) => {
      const vent = Math.hypot(x - 32, y - 32) < 12;
      return vent ? [30, 30, 35] : [50 + (x & 3), 45, 40];
    }),
  );

  return { walls, floors, ceils };
}

export function sample(tex: Tex, u: number, v: number, shade: number): [number, number, number] {
  const tx = Math.min(S - 1, Math.max(0, Math.floor(((u % 1) + 1) % 1 * S)));
  const ty = Math.min(S - 1, Math.max(0, Math.floor(((v % 1) + 1) % 1 * S)));
  const i = (ty * S + tx) * 4;
  const s = Math.max(0.12, Math.min(1, shade));
  return [(tex.data[i]! * s) | 0, (tex.data[i + 1]! * s) | 0, (tex.data[i + 2]! * s) | 0];
}

/** Animated robot billboard frames */
export function drawRobot(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame: number,
  state: 'walk' | 'attack' | 'disabled' | 'ally',
) {
  ctx.clearRect(0, 0, w, h);
  const t = frame % 8;
  const bob = state === 'walk' ? Math.sin(t * 0.9) * (h * 0.03) : 0;
  const lean = state === 'attack' ? w * 0.06 : 0;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.9, w * 0.28, h * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyY = h * 0.28 + bob;
  const brass = state === 'ally' ? '#3d8b6e' : state === 'disabled' ? '#5a5048' : '#c4a35a';
  const dark = state === 'ally' ? '#1a4030' : '#3a3020';
  const eye = state === 'disabled' ? '#444' : state === 'ally' ? '#5ef0a0' : '#ff6030';

  // legs shuffle
  const legSpread = state === 'walk' ? Math.sin(t) * w * 0.06 : state === 'attack' ? w * 0.08 : 0;
  ctx.fillStyle = dark;
  ctx.fillRect(w * 0.35 - legSpread, h * 0.62 + bob, w * 0.12, h * 0.22);
  ctx.fillRect(w * 0.53 + legSpread, h * 0.62 + bob, w * 0.12, h * 0.22);

  // body
  ctx.fillStyle = brass;
  ctx.fillRect(w * 0.28 + lean, bodyY, w * 0.44, h * 0.38);
  // rivets
  ctx.fillStyle = '#e8d090';
  for (const ry of [0.32, 0.42, 0.52]) {
    ctx.beginPath();
    ctx.arc(w * 0.35 + lean, h * ry + bob, 2, 0, Math.PI * 2);
    ctx.arc(w * 0.65 + lean, h * ry + bob, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // chest gauge
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(w * 0.5 + lean, h * 0.45 + bob, w * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = eye;
  ctx.beginPath();
  ctx.moveTo(w * 0.5 + lean, h * 0.45 + bob);
  ctx.lineTo(w * 0.5 + lean + w * 0.06, h * 0.45 + bob - h * 0.04);
  ctx.stroke();

  // head
  ctx.fillStyle = brass;
  ctx.fillRect(w * 0.34 + lean, bodyY - h * 0.16, w * 0.32, h * 0.18);
  // eyes
  ctx.fillStyle = eye;
  ctx.fillRect(w * 0.38 + lean, bodyY - h * 0.1, w * 0.08, h * 0.05);
  ctx.fillRect(w * 0.54 + lean, bodyY - h * 0.1, w * 0.08, h * 0.05);
  // antenna
  ctx.strokeStyle = '#888';
  ctx.beginPath();
  ctx.moveTo(w * 0.5 + lean, bodyY - h * 0.16);
  ctx.lineTo(w * 0.5 + lean, bodyY - h * 0.24);
  ctx.stroke();
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.arc(w * 0.5 + lean, bodyY - h * 0.25, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // attack arm forward
  if (state === 'attack') {
    ctx.fillStyle = dark;
    ctx.fillRect(w * 0.7, h * 0.4, w * 0.22, h * 0.1);
    ctx.fillStyle = eye;
    ctx.beginPath();
    ctx.arc(w * 0.92, h * 0.45, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = dark;
    ctx.fillRect(w * 0.18, h * 0.4 + bob, w * 0.12, h * 0.2);
    ctx.fillRect(w * 0.7, h * 0.4 + bob, w * 0.12, h * 0.2);
  }

  if (state === 'disabled') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, w, h);
  }
}

export function drawHusk(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.75, w * 0.3, h * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a4038';
  ctx.fillRect(w * 0.25, h * 0.55, w * 0.5, h * 0.2);
  ctx.fillStyle = '#6a5a48';
  ctx.fillRect(w * 0.3, h * 0.48, w * 0.4, h * 0.12);
  ctx.fillStyle = '#333';
  ctx.fillRect(w * 0.38, h * 0.52, w * 0.08, h * 0.04);
  ctx.fillRect(w * 0.54, h * 0.52, w * 0.08, h * 0.04);
}

export function drawHandWeapon(ctx: CanvasRenderingContext2D, w: number, h: number, reprogram: boolean) {
  // drawn on game canvas overlay — glove + plasma ring
  ctx.fillStyle = '#8b6914';
  ctx.beginPath();
  ctx.moveTo(w * 0.55, h);
  ctx.lineTo(w * 0.62, h * 0.7);
  ctx.lineTo(w * 0.82, h * 0.75);
  ctx.lineTo(w * 0.88, h);
  ctx.fill();
  ctx.fillStyle = '#c4a574';
  ctx.fillRect(w * 0.64, h * 0.62, w * 0.14, h * 0.12);
  if (reprogram) {
    ctx.strokeStyle = '#5ef0a0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.58, 14, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawWrenchWeapon(ctx: CanvasRenderingContext2D, w: number, h: number, arc: boolean) {
  ctx.fillStyle = '#6a5a48';
  ctx.fillRect(w * 0.68, h * 0.55, 8, 50);
  ctx.fillStyle = '#b0b0b8';
  ctx.fillRect(w * 0.62, h * 0.48, 28, 14);
  ctx.fillRect(w * 0.64, h * 0.42, 10, 12);
  ctx.fillRect(w * 0.78, h * 0.42, 10, 12);
  if (arc) {
    ctx.strokeStyle = '#6ec8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.75, h * 0.45);
    ctx.quadraticCurveTo(w * 0.9, h * 0.35, w * 0.85, h * 0.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.75, h * 0.48);
    ctx.quadraticCurveTo(w * 0.95, h * 0.4, w * 0.92, h * 0.3);
    ctx.stroke();
  }
}
