/** Procedural wall textures + sprite drawing (in-engine art). */

import type { WallStyle, ZoneTheme } from './zoneTheme';
import { zoneThemeForEpisode } from './zoneTheme';

export type Texture = ImageData;

const TEX_SIZE = 64;

function makeTexture(paint: (x: number, y: number) => [number, number, number]): Texture {
  const data = new ImageData(TEX_SIZE, TEX_SIZE);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * TEX_SIZE + x) * 4;
      data.data[i] = Math.max(0, Math.min(255, r));
      data.data[i + 1] = Math.max(0, Math.min(255, g));
      data.data[i + 2] = Math.max(0, Math.min(255, b));
      data.data[i + 3] = 255;
    }
  }
  return data;
}

function paintStyle(style: WallStyle): (x: number, y: number) => [number, number, number] {
  switch (style.kind) {
    case 'noise':
      return (x, y) => {
        const n = ((x * 13 + y * 7) ^ (x * y)) & 15;
        const v = n - 7;
        return [
          style.base[0] + v * (style.variance / 8),
          style.base[1] + v * (style.variance / 8),
          style.base[2] + v * (style.variance / 8),
        ];
      };
    case 'stripe':
      return (_x, y) => {
        const on = Math.floor(y / style.period) % 2 === 0;
        return on ? style.a : style.b;
      };
    case 'grid':
      return (x, y) => {
        const g = x % style.step === 0 || y % style.step === 0;
        return g ? style.line : style.fill;
      };
    case 'band':
      return (x, y) => {
        if (y > style.y0 && y < style.y1) return style.band;
        const n = ((x + y) & 7);
        return [style.fill[0] + n, style.fill[1] + n, style.fill[2] + n];
      };
    case 'chevron':
      return (x, y) => {
        const chev = (x + y) % 16 < 8;
        return chev ? style.a : style.b;
      };
    case 'mesh':
      return (x, y) => {
        const mesh = (x + y) % 4 === 0 || (x - y) % 4 === 0;
        return mesh ? style.line : style.fill;
      };
  }
}

/** Zone-themed wall set — each episode looks distinct. */
export function createWallTextures(theme?: ZoneTheme): Map<number, Texture> {
  const z = theme ?? zoneThemeForEpisode(0);
  const map = new Map<number, Texture>();
  const fallback: WallStyle = { kind: 'noise', base: [80, 80, 85], variance: 10 };
  for (let id = 1; id <= 9; id++) {
    const style = z.walls[id] ?? fallback;
    map.set(id, makeTexture(paintStyle(style)));
  }
  return map;
}

/** @deprecated use createWallTextures(theme) */
export function createDefaultWallTextures(): Map<number, Texture> {
  return createWallTextures(zoneThemeForEpisode(0));
}

export function sampleTexture(tex: Texture, u: number, v: number, shade: number): [number, number, number] {
  const tx = Math.min(TEX_SIZE - 1, Math.max(0, Math.floor(u * TEX_SIZE)));
  const ty = Math.min(TEX_SIZE - 1, Math.max(0, Math.floor(v * TEX_SIZE)));
  const i = (ty * TEX_SIZE + tx) * 4;
  const s = Math.max(0.15, Math.min(1, shade));
  return [
    (tex.data[i]! * s) | 0,
    (tex.data[i + 1]! * s) | 0,
    (tex.data[i + 2]! * s) | 0,
  ];
}

export { TEX_SIZE };

/** Draw in-engine billboard sprites into a temp canvas for blit. */
export function drawKarenSprite(ctx: CanvasRenderingContext2D, w: number, h: number, frame: number) {
  ctx.clearRect(0, 0, w, h);
  // body
  ctx.fillStyle = '#e8d5c4';
  ctx.fillRect(w * 0.3, h * 0.25, w * 0.4, h * 0.35);
  // blonde helmet hair
  ctx.fillStyle = '#d4a017';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.22, w * 0.28, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  // sunglasses
  ctx.fillStyle = '#111';
  ctx.fillRect(w * 0.32, h * 0.28, w * 0.15, h * 0.06);
  ctx.fillRect(w * 0.53, h * 0.28, w * 0.15, h * 0.06);
  // sweater (pink)
  ctx.fillStyle = '#f4a0c0';
  ctx.fillRect(w * 0.22, h * 0.48, w * 0.56, h * 0.35);
  // clipboard
  ctx.fillStyle = '#f5f0e0';
  ctx.fillRect(w * 0.55, h * 0.5, w * 0.22, h * 0.28);
  ctx.strokeStyle = '#333';
  ctx.strokeRect(w * 0.55, h * 0.5, w * 0.22, h * 0.28);
  // angry mouth
  ctx.strokeStyle = '#a33';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.4, w * 0.06, 0.1, Math.PI - 0.1);
  ctx.stroke();
  // bob animation
  if (frame % 2 === 1) {
    ctx.fillStyle = 'rgba(255,80,80,0.3)';
    ctx.fillRect(0, 0, w, h);
  }
}

export function drawPlaqueSprite(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0a1f44';
  ctx.fillRect(w * 0.1, h * 0.25, w * 0.8, h * 0.5);
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 3;
  ctx.strokeRect(w * 0.1, h * 0.25, w * 0.8, h * 0.5);
  ctx.fillStyle = '#ffd700';
  ctx.font = `${Math.floor(h * 0.12)}px serif`;
  ctx.textAlign = 'center';
  ctx.fillText('★', w * 0.5, h * 0.52);
}

export function drawPickupSprite(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  kind: 'resolve' | 'voice' | 'brand' | 'key_red' | 'key_blue',
) {
  ctx.clearRect(0, 0, w, h);
  if (kind === 'resolve') {
    ctx.fillStyle = '#c4a35a';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.4, w * 0.28, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b3';
    ctx.fillRect(w * 0.25, h * 0.42, w * 0.5, h * 0.08);
    ctx.fillStyle = '#a0522d';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.55, w * 0.28, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'voice') {
    ctx.fillStyle = '#00c2ff';
    ctx.fillRect(w * 0.35, h * 0.25, w * 0.3, h * 0.45);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.floor(h * 0.15)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('DC', w * 0.5, h * 0.52);
  } else if (kind === 'brand') {
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(w * 0.3, h * 0.3, w * 0.4, h * 0.35);
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.3, h * 0.3, w * 0.4, h * 0.35);
  } else if (kind === 'key_blue') {
    ctx.fillStyle = '#3498db';
    ctx.fillRect(w * 0.4, h * 0.2, w * 0.2, h * 0.45);
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.25, w * 0.14, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#c41e3a';
    ctx.fillRect(w * 0.4, h * 0.2, w * 0.2, h * 0.45);
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.25, w * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawButtonSprite(ctx: CanvasRenderingContext2D, w: number, h: number, used: boolean) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = used ? '#555' : '#2ecc71';
  ctx.fillRect(w * 0.25, h * 0.35, w * 0.5, h * 0.35);
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.strokeRect(w * 0.25, h * 0.35, w * 0.5, h * 0.35);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.floor(h * 0.12)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(used ? 'OK' : 'BTN', w * 0.5, h * 0.58);
}

export function drawPhoneSprite(ctx: CanvasRenderingContext2D, w: number, h: number, used: boolean) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = used ? '#444' : '#222';
  ctx.fillRect(w * 0.3, h * 0.2, w * 0.4, h * 0.55);
  ctx.fillStyle = used ? '#666' : '#2ecc71';
  ctx.fillRect(w * 0.35, h * 0.28, w * 0.3, h * 0.2);
  ctx.strokeStyle = '#ffd700';
  ctx.strokeRect(w * 0.3, h * 0.2, w * 0.4, h * 0.55);
  ctx.fillStyle = '#ffd700';
  ctx.font = `${Math.floor(h * 0.1)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(used ? '…' : '☎', w * 0.5, h * 0.7);
}

export function drawBossSprite(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame: number,
  variant = 'manager',
) {
  ctx.clearRect(0, 0, w, h);
  const colors: Record<string, [string, string, string]> = {
    manager: ['#2c3e50', '#ecf0f1', 'MGR'],
    hydra: ['#6c3483', '#f5b7b1', 'HYD'],
    autopen: ['#1a5276', '#d5dbdb', 'PEN'],
    fraud: ['#7b241c', '#fadbd8', 'FRD'],
    tribunal: ['#4a235a', '#e8daef', 'JDG'],
    media: ['#922b21', '#f5b7b1', 'TV'],
    swamp: ['#145a32', '#d5f5e3', 'SWP'],
    deepfake: ['#ffd700', '#1a1a2e', 'FAK'],
  };
  const [body, face, tag] = colors[variant] ?? colors.manager!;
  ctx.fillStyle = body;
  ctx.fillRect(w * 0.2, h * 0.15, w * 0.6, h * 0.7);
  ctx.fillStyle = face;
  ctx.fillRect(w * 0.28, h * 0.25, w * 0.44, h * 0.45);
  ctx.fillStyle = variant === 'deepfake' ? '#ffd700' : '#c0392b';
  ctx.font = `bold ${Math.floor(h * 0.11)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(tag, w * 0.5, h * 0.48);
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(w * 0.15, h * 0.1, w * 0.7, h * 0.08);
  if (frame % 2 === 1) {
    ctx.fillStyle = 'rgba(231,76,60,0.25)';
    ctx.fillRect(0, 0, w, h);
  }
}

export function drawFoeSprite(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  kind: string,
  frame: number,
) {
  ctx.clearRect(0, 0, w, h);
  if (kind === 'karen') {
    drawKarenSprite(ctx, w, h, frame);
    return;
  }
  // body
  const palette: Record<string, string> = {
    libtard: '#5dade2',
    woke: '#af7ac5',
    bureaucrat: '#7f8c8d',
  };
  ctx.fillStyle = '#e8d5c4';
  ctx.fillRect(w * 0.3, h * 0.25, w * 0.4, h * 0.3);
  ctx.fillStyle = palette[kind] ?? '#888';
  ctx.fillRect(w * 0.22, h * 0.48, w * 0.56, h * 0.38);
  ctx.fillStyle = '#222';
  ctx.fillRect(w * 0.34, h * 0.3, w * 0.12, h * 0.06);
  ctx.fillRect(w * 0.54, h * 0.3, w * 0.12, h * 0.06);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.floor(h * 0.1)}px sans-serif`;
  ctx.textAlign = 'center';
  const tag = kind === 'libtard' ? 'LT' : kind === 'woke' ? 'WK' : 'BR';
  ctx.fillText(tag, w * 0.5, h * 0.7);
  if (frame % 2 === 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, 0, w, h);
  }
}

export function drawExitSprite(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(w * 0.2, h * 0.15, w * 0.6, h * 0.7);
  ctx.fillStyle = '#0a1f44';
  ctx.font = `bold ${Math.floor(h * 0.12)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', w * 0.5, h * 0.5);
  ctx.fillText('↑', w * 0.5, h * 0.65);
}
