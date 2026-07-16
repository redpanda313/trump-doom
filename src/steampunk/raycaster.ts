import type { SteamMap } from './map';
import { wallAt, floorAt, ceilAt } from './map';
import { sample, type Tex } from './textures';

export interface Cam {
  posX: number;
  posY: number;
  posZ: number; // feet elevation
  dirX: number;
  dirY: number;
  planeX: number;
  planeY: number;
  eye: number; // eye height above feet
}

export interface SpriteDraw {
  x: number;
  y: number;
  z: number;
  dist: number;
  canvas: HTMLCanvasElement;
  scale?: number;
}

export class HeightRaycaster {
  private zBuffer: Float64Array;
  private img: ImageData;
  private w: number;
  private h: number;
  fog = 14;

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

  render(
    map: SteamMap,
    cam: Cam,
    walls: Map<number, Tex>,
    floors: Map<number, Tex>,
    ceils: Map<number, Tex>,
    sprites: SpriteDraw[],
  ) {
    const { w, h } = this;
    const data = this.img.data;
    const eyeZ = cam.posZ + cam.eye;
    const skyTop = hex(map.skyTop);
    const skyBot = hex(map.skyBot);

    // Sky gradient fill (overwritten by ceilings/floors/walls)
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const r = lerp(skyTop[0], skyBot[0], t);
      const g = lerp(skyTop[1], skyBot[1], t);
      const b = lerp(skyTop[2], skyBot[2], t);
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }

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
      for (let depth = 0; depth < 64 && !hit; depth++) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }
        wallId = wallAt(map, mapX, mapY);
        if (wallId > 0) hit = 1;
      }

      let perpWallDist: number;
      if (side === 0) perpWallDist = (mapX - cam.posX + (1 - stepX) / 2) / rayDirX;
      else perpWallDist = (mapY - cam.posY + (1 - stepY) / 2) / rayDirY;
      if (perpWallDist < 0.0001) perpWallDist = 0.0001;
      this.zBuffer[x] = perpWallDist;

      // Floor height at wall base (adjacent cell outside wall)
      const floorZ = floorAt(map, mapX - (side === 0 ? stepX : 0), mapY - (side === 1 ? stepY : 0));
      // Wall spans floorZ to floorZ+1 typically; use neighbor floor for bottom
      const wallBot = floorZ;
      const wallTop = floorZ + 1;

      // Project wall top/bottom into screen space relative to eye
      // screen y: horizon at h/2, scale by 1/dist
      const scale = h / perpWallDist;
      const drawTop = Math.floor(h / 2 - (wallTop - eyeZ) * scale);
      const drawBot = Math.floor(h / 2 - (wallBot - eyeZ) * scale);

      let y0 = Math.max(0, drawTop);
      let y1 = Math.min(h - 1, drawBot);
      if (y0 > y1) {
        const t = y0;
        y0 = y1;
        y1 = t;
      }

      let wallX: number;
      if (side === 0) wallX = cam.posY + perpWallDist * rayDirY;
      else wallX = cam.posX + perpWallDist * rayDirX;
      wallX -= Math.floor(wallX);

      const tex = walls.get(wallId) ?? walls.get(1)!;
      let texX = Math.floor(wallX * 64);
      if (side === 0 && rayDirX > 0) texX = 63 - texX;
      if (side === 1 && rayDirY < 0) texX = 63 - texX;
      const shade = (side === 1 ? 0.65 : 1) * Math.max(0.15, 1 - perpWallDist / this.fog);

      for (let y = y0; y <= y1; y++) {
        const v = (y - drawTop) / Math.max(1, drawBot - drawTop);
        const [r, g, b] = sample(tex, texX / 64, v, shade);
        const i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }

      // Floor casting from drawBot to bottom (and ceiling from top to drawTop)
      this.castFloorCeil(
        map,
        cam,
        data,
        x,
        y1 + 1,
        h - 1,
        true,
        rayDirX,
        rayDirY,
        eyeZ,
        floors,
        ceils,
      );
      this.castFloorCeil(
        map,
        cam,
        data,
        x,
        0,
        y0 - 1,
        false,
        rayDirX,
        rayDirY,
        eyeZ,
        floors,
        ceils,
      );
    }

    this.ctx.putImageData(this.img, 0, 0);

    // Sprites
    const sorted = [...sprites].sort((a, b) => b.dist - a.dist);
    for (const sp of sorted) this.drawSprite(cam, sp, eyeZ);
  }

  private castFloorCeil(
    map: SteamMap,
    cam: Cam,
    data: Uint8ClampedArray,
    x: number,
    yStart: number,
    yEnd: number,
    isFloor: boolean,
    rayDirX: number,
    rayDirY: number,
    eyeZ: number,
    floors: Map<number, Tex>,
    ceils: Map<number, Tex>,
  ) {
    if (yStart > yEnd) return;
    const { w, h } = this;
    for (let y = yStart; y <= yEnd; y++) {
      // Row distance: how far the floor/ceiling plane is
      const p = y - h / 2;
      if (Math.abs(p) < 0.5) continue;
      // Plane at z = current cell under foot approx player floor
      // Use world plane at z = cam.posZ for floor, high for sky skip
      const planeZ = isFloor ? cam.posZ : cam.posZ + 1.2;
      const rowDist = ((eyeZ - planeZ) * (h / 2)) / p;
      if (rowDist <= 0) continue;

      const floorX = cam.posX + rowDist * rayDirX;
      const floorY = cam.posY + rowDist * rayDirY;
      const cellX = Math.floor(floorX);
      const cellY = Math.floor(floorY);
      if (cellX < 0 || cellY < 0 || cellX >= map.width || cellY >= map.height) continue;

      // Skip ceiling draw for open sky
      const cZ = ceilAt(map, cellX, cellY);
      if (!isFloor && cZ >= 8) continue;

      // Adjust for actual floor height of that cell
      const fZ = floorAt(map, cellX, cellY);
      const targetZ = isFloor ? fZ : Math.min(cZ, fZ + 1.2);
      const adjDist = ((eyeZ - targetZ) * (h / 2)) / p;
      if (adjDist <= 0) continue;
      const fx = cam.posX + adjDist * rayDirX;
      const fy = cam.posY + adjDist * rayDirY;
      const u = fx - Math.floor(fx);
      const v = fy - Math.floor(fy);

      const shade = Math.max(0.15, 1 - adjDist / this.fog);
      let tex: Tex | undefined;
      if (isFloor) {
        const id = map.floorTex[cellY * map.width + cellX] ?? 1;
        tex = floors.get(id) ?? floors.get(1);
      } else {
        const id = map.ceilTex[cellY * map.width + cellX] ?? 1;
        if (!id) continue;
        tex = ceils.get(id) ?? ceils.get(1);
      }
      if (!tex) continue;
      const [r, g, b] = sample(tex, u, v, shade * (isFloor ? 0.9 : 0.7));
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  private drawSprite(cam: Cam, sp: SpriteDraw, eyeZ: number) {
    const { w, h } = this;
    const spriteX = sp.x - cam.posX;
    const spriteY = sp.y - cam.posY;
    const invDet = 1 / (cam.planeX * cam.dirY - cam.dirX * cam.planeY);
    const transformX = invDet * (cam.dirY * spriteX - cam.dirX * spriteY);
    const transformY = invDet * (-cam.planeY * spriteX + cam.planeX * spriteY);
    if (transformY <= 0.05) return;

    const scale = sp.scale ?? 1;
    const spriteScreenX = Math.floor((w / 2) * (1 + transformX / transformY));
    const spriteH = Math.abs(Math.floor((h / transformY) * scale));
    const spriteW = spriteH;

    // Vertical placement from sprite feet z
    const vMove = (sp.z - eyeZ) * (h / transformY);
    const drawStartY = Math.floor(-spriteH / 2 + h / 2 - vMove);
    const drawEndY = Math.floor(spriteH / 2 + h / 2 - vMove);
    const drawStartX = Math.floor(-spriteW / 2 + spriteScreenX);
    const drawEndX = Math.floor(spriteW / 2 + spriteScreenX);

    for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
      if (stripe < 0 || stripe >= w) continue;
      if (transformY >= this.zBuffer[stripe]!) continue;
      const texX = ((stripe - (-spriteW / 2 + spriteScreenX)) * sp.canvas.width) / spriteW;
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
}

export function setAngle(cam: Cam, angle: number) {
  cam.dirX = Math.cos(angle);
  cam.dirY = Math.sin(angle);
  cam.planeX = -cam.dirY * 0.66;
  cam.planeY = cam.dirX * 0.66;
}

function hex(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function lerp(a: number, b: number, t: number) {
  return (a + (b - a) * t) | 0;
}
