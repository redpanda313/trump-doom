import type { GameMap } from './map';
import { cell } from './map';
import { sampleTexture, type Texture } from './textures';

export interface SpriteDraw {
  x: number;
  y: number;
  dist: number;
  canvas: HTMLCanvasElement;
  scale?: number;
}

export interface RaycasterState {
  posX: number;
  posY: number;
  dirX: number;
  dirY: number;
  planeX: number;
  planeY: number;
}

const FOG = 12;

export class Raycaster {
  private zBuffer: Float64Array;
  private img: ImageData;
  private w: number;
  private h: number;

  constructor(
    private ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ) {
    this.w = w;
    this.h = h;
    this.zBuffer = new Float64Array(w);
    this.img = new ImageData(w, h);
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.zBuffer = new Float64Array(w);
    this.img = new ImageData(w, h);
  }

  render(
    map: GameMap,
    cam: RaycasterState,
    textures: Map<number, Texture>,
    sprites: SpriteDraw[],
  ) {
    const { w, h } = this;
    const data = this.img.data;

    // ceiling + floor solid (fast)
    const ceil = hexToRgb(map.ceilingColor);
    const floor = hexToRgb(map.floorColor);
    for (let y = 0; y < h; y++) {
      const isCeil = y < h / 2;
      const t = isCeil ? y / (h / 2) : (y - h / 2) / (h / 2);
      const r = isCeil ? lerp(ceil[0], 20, t * 0.3) : lerp(floor[0], 10, t);
      const g = isCeil ? lerp(ceil[1], 20, t * 0.3) : lerp(floor[1], 10, t);
      const b = isCeil ? lerp(ceil[2], 30, t * 0.3) : lerp(floor[2], 15, t);
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }

    // walls
    for (let x = 0; x < w; x++) {
      const cameraX = (2 * x) / w - 1;
      const rayDirX = cam.dirX + cam.planeX * cameraX;
      const rayDirY = cam.dirY + cam.planeY * cameraX;

      let mapX = Math.floor(cam.posX);
      let mapY = Math.floor(cam.posY);

      const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
      const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

      let stepX: number;
      let stepY: number;
      let sideDistX: number;
      let sideDistY: number;

      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (cam.posX - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1 - cam.posX) * deltaDistX;
      }
      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (cam.posY - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1 - cam.posY) * deltaDistY;
      }

      let hit = 0;
      let side = 0;
      let wallId = 0;
      for (let depth = 0; depth < 64 && hit === 0; depth++) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }
        wallId = cell(map, mapX, mapY);
        if (wallId > 0) hit = 1;
      }

      let perpWallDist: number;
      if (side === 0) perpWallDist = (mapX - cam.posX + (1 - stepX) / 2) / rayDirX;
      else perpWallDist = (mapY - cam.posY + (1 - stepY) / 2) / rayDirY;
      if (perpWallDist < 0.0001) perpWallDist = 0.0001;

      this.zBuffer[x] = perpWallDist;

      const lineHeight = Math.floor(h / perpWallDist);
      let drawStart = Math.floor(-lineHeight / 2 + h / 2);
      let drawEnd = Math.floor(lineHeight / 2 + h / 2);
      if (drawStart < 0) drawStart = 0;
      if (drawEnd >= h) drawEnd = h - 1;

      let wallX: number;
      if (side === 0) wallX = cam.posY + perpWallDist * rayDirY;
      else wallX = cam.posX + perpWallDist * rayDirX;
      wallX -= Math.floor(wallX);

      const tex = textures.get(wallId) ?? textures.get(1)!;
      let texX = Math.floor(wallX * 64);
      if (side === 0 && rayDirX > 0) texX = 64 - texX - 1;
      if (side === 1 && rayDirY < 0) texX = 64 - texX - 1;

      const shade = (side === 1 ? 0.7 : 1) * Math.max(0.2, 1 - perpWallDist / FOG);

      for (let y = drawStart; y <= drawEnd; y++) {
        const d = y * 256 - h * 128 + lineHeight * 128;
        const texY = Math.floor(((d * 64) / lineHeight / 256 + 64) % 64);
        const u = texX / 64;
        const v = texY / 64;
        const [r, g, b] = sampleTexture(tex, u, v, shade);
        const i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
    }

    this.ctx.putImageData(this.img, 0, 0);

    // sprites (painter's algorithm far → near)
    const sorted = [...sprites].sort((a, b) => b.dist - a.dist);
    for (const sp of sorted) {
      this.drawSprite(cam, sp);
    }
  }

  private drawSprite(cam: RaycasterState, sp: SpriteDraw) {
    const { w, h } = this;
    const spriteX = sp.x - cam.posX;
    const spriteY = sp.y - cam.posY;

    const invDet = 1 / (cam.planeX * cam.dirY - cam.dirX * cam.planeY);
    const transformX = invDet * (cam.dirY * spriteX - cam.dirX * spriteY);
    const transformY = invDet * (-cam.planeY * spriteX + cam.planeX * spriteY);
    if (transformY <= 0.05) return;

    const scale = sp.scale ?? 1;
    const spriteScreenX = Math.floor((w / 2) * (1 + transformX / transformY));
    const spriteHeight = Math.abs(Math.floor((h / transformY) * scale));
    const spriteWidth = spriteHeight;

    const drawStartY = Math.floor(-spriteHeight / 2 + h / 2);
    const drawEndY = Math.floor(spriteHeight / 2 + h / 2);
    const drawStartX = Math.floor(-spriteWidth / 2 + spriteScreenX);
    const drawEndX = Math.floor(spriteWidth / 2 + spriteScreenX);

    // column occlusion via z-buffer
    for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
      if (stripe < 0 || stripe >= w) continue;
      if (transformY >= this.zBuffer[stripe]!) continue;
      const texX = ((stripe - (-spriteWidth / 2 + spriteScreenX)) * sp.canvas.width) / spriteWidth;
      this.ctx.drawImage(
        sp.canvas,
        texX,
        0,
        1,
        sp.canvas.height,
        stripe,
        Math.max(0, drawStartY),
        1,
        Math.min(h, drawEndY) - Math.max(0, drawStartY),
      );
    }
  }

  getZBuffer(): Float64Array {
    return this.zBuffer;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lerp(a: number, b: number, t: number) {
  return (a + (b - a) * t) | 0;
}

export function setAngle(cam: RaycasterState, angle: number) {
  cam.dirX = Math.cos(angle);
  cam.dirY = Math.sin(angle);
  // plane perpendicular, FOV ~66°
  cam.planeX = -cam.dirY * 0.66;
  cam.planeY = cam.dirX * 0.66;
}

export function getAngle(cam: RaycasterState): number {
  return Math.atan2(cam.dirY, cam.dirX);
}
