/**
 * Sky City Racetrack — long organic roadway for the plasma surfboard.
 * Target path length ~2800–3200u ≈ 4–6 min at cruise speeds.
 */

import * as THREE from 'three';
import { makeMaterials, type Mats } from './materials';
import type { Collider } from './level';

export interface RaceCheckpoint {
  position: THREE.Vector3;
  index: number;
}

export interface RaceRamp {
  pos: THREE.Vector3;
  yaw: number;
  len: number;
}

export interface RaceRail {
  a: THREE.Vector3;
  b: THREE.Vector3;
}

export interface RacewayBuilt {
  group: THREE.Group;
  colliders: Collider[];
  mats: Mats;
  /** Sampled path points (road centerline) */
  path: THREE.Vector3[];
  /** Cumulative distance at each path point */
  pathDist: number[];
  totalLength: number;
  boardSpawn: THREE.Vector3;
  boardYaw: number;
  finishPos: THREE.Vector3;
  checkpoints: RaceCheckpoint[];
  /** Pass-by whoosh (cars, props) — not solid */
  whooshPoints: THREE.Vector3[];
  /** Solid roadside obstacles only (off the racing line) */
  bumpPoints: THREE.Vector3[];
  ramps: RaceRamp[];
  rails: RaceRail[];
}

const ROAD_W = 10;
const SIDE_W = 3.2;

function boxMesh(
  mat: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Organic heading path — long enough for ~5 min ride. */
export function generateRacePath(): { path: THREE.Vector3[]; pathDist: number[]; total: number } {
  const path: THREE.Vector3[] = [];
  const pathDist: number[] = [];
  let x = 0;
  let z = 0;
  let y = 2;
  let heading = 0;
  let dist = 0;
  const step = 7.5;
  // ~380 segments × 7.5 ≈ 2850 units
  const segments = 380;

  path.push(new THREE.Vector3(x, y, z));
  pathDist.push(0);

  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    // Organic steering: long sweeps + tighter park meanders
    const park = t > 0.22 && t < 0.38 || t > 0.55 && t < 0.7;
    const turn =
      Math.sin(i * 0.045) * (park ? 0.18 : 0.1) +
      Math.sin(i * 0.017) * 0.07 +
      Math.sin(i * 0.11) * (park ? 0.12 : 0.03) +
      Math.cos(i * 0.009) * 0.04;
    heading += turn;

    x += Math.cos(heading) * step;
    z += Math.sin(heading) * step;
    y = 2 + Math.sin(i * 0.04) * 1.8 + Math.sin(i * 0.11) * 0.6;

    const p = new THREE.Vector3(x, y, z);
    dist += step;
    path.push(p);
    pathDist.push(dist);
  }

  return { path, pathDist, total: dist };
}

function zoneColor(t: number): {
  road: number;
  side: number;
  accent: number;
  foliage: number;
  name: string;
} {
  // Vibrant districts along the track
  if (t < 0.18) return { road: 0x5a5348, side: 0xc4a35a, accent: 0xb87333, foliage: 0x3d6b3a, name: 'brass' };
  if (t < 0.38) return { road: 0x4a5a48, side: 0x7ec850, accent: 0xe8b84a, foliage: 0x2f8f4e, name: 'park' };
  if (t < 0.55) return { road: 0x4a3a55, side: 0xd45d9a, accent: 0x5ec8e8, foliage: 0x6a3d8a, name: 'market' };
  if (t < 0.75) return { road: 0x3a4a5a, side: 0x4a9ec8, accent: 0xf0d080, foliage: 0x3a7a6a, name: 'canal' };
  return { road: 0x5a4030, side: 0xe07040, accent: 0xffd070, foliage: 0x5a8a30, name: 'sunset' };
}

export function buildSkyRaceway(): RacewayBuilt {
  const mats = makeMaterials();
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const whooshPoints: THREE.Vector3[] = [];
  const bumpPoints: THREE.Vector3[] = [];
  const ramps: RaceRamp[] = [];
  const rails: RaceRail[] = [];
  const { path, pathDist, total } = generateRacePath();

  // Road mats by zone (shared)
  const roadMats = new Map<string, THREE.MeshStandardMaterial>();
  const getRoadMat = (hex: number, metal = 0.15, rough = 0.75) => {
    const key = hex.toString(16);
    let m = roadMats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: hex, metalness: metal, roughness: rough });
      roadMats.set(key, m);
    }
    return m;
  };

  // Build road segments
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const len = dir.length();
    dir.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    const t = i / (path.length - 1);
    const zc = zoneColor(t);

    // Roadway
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_W, 0.35, len + 0.4),
      getRoadMat(zc.road, 0.2, 0.7),
    );
    road.position.copy(mid);
    road.position.y = mid.y;
    road.rotation.y = yaw;
    road.receiveShadow = true;
    road.castShadow = true;
    group.add(road);
    // Collision slab (slightly thicker)
    {
      const hw = ROAD_W / 2 + 0.3;
      const hd = len / 2 + 0.5;
      // Axis-aligned approx for board hover snap — store as oriented later via path
      const col: Collider = {
        min: new THREE.Vector3(mid.x - hw - 2, mid.y - 0.6, mid.z - hd - 2),
        max: new THREE.Vector3(mid.x + hw + 2, mid.y + 0.5, mid.z + hd + 2),
      };
      // Skip dense colliders for every segment — board uses path snap instead
      void col;
    }

    // Sidewalks left/right (organic: sometimes park verge)
    const isPark = zc.name === 'park' || (i % 17 === 0);
    for (const side of [-1, 1]) {
      const right = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(side);
      const sidePos = mid.clone().addScaledVector(right, ROAD_W / 2 + SIDE_W / 2);
      sidePos.y = mid.y + 0.08;
      if (isPark && side === (i % 2 === 0 ? -1 : 1)) {
        // Hedge strip
        const hedge = new THREE.Mesh(
          new THREE.BoxGeometry(SIDE_W * 0.9, 0.9, len + 0.2),
          getRoadMat(zc.foliage, 0.05, 0.9),
        );
        hedge.position.copy(sidePos);
        hedge.position.y = mid.y + 0.5;
        hedge.rotation.y = yaw;
        group.add(hedge);
      } else {
        const walk = new THREE.Mesh(
          new THREE.BoxGeometry(SIDE_W, 0.28, len + 0.3),
          getRoadMat(zc.side, 0.25, 0.65),
        );
        walk.position.copy(sidePos);
        walk.rotation.y = yaw;
        walk.receiveShadow = true;
        group.add(walk);
      }
    }

    // Center dashed line
    if (i % 2 === 0) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.04, Math.min(2.5, len * 0.45)),
        getRoadMat(0xf0e8c8, 0.1, 0.5),
      );
      line.position.set(mid.x, mid.y + 0.2, mid.z);
      line.rotation.y = yaw;
      group.add(line);
    }

    // Buildings / trees / props every few segments
    if (i % 3 === 0) {
      placeRoadsideProps(group, mats, mid, dir, yaw, t, zc, whooshPoints, bumpPoints, i);
    }

    // Archways
    if (i % 28 === 14) {
      placeArch(group, mats, mid, yaw, zc.accent);
    }

    // Bridges overhead
    if (i % 35 === 20) {
      placeBridge(group, mats, mid, yaw, zc.accent);
    }

    // Fountains in park/canal
    if ((zc.name === 'park' || zc.name === 'canal') && i % 22 === 5) {
      placeFountain(group, mats, mid, dir, zc.accent);
    }

    // Traffic — floating cars/trucks
    if (i % 9 === 3) {
      placeVehicle(group, mats, mid, dir, yaw, i, whooshPoints);
    }

    // Boost ramps
    if (i % 42 === 18 && i > 10) {
      const ramp = placeRamp(group, mats, mid, yaw, zc.accent);
      ramps.push(ramp);
    }

    // Grind rails on one side
    if (i % 31 === 7 && i + 4 < path.length) {
      const rail = placeRail(group, mats, path[i]!, path[i + 4]!, dir, yaw, zc.side);
      rails.push(rail);
    }
  }

  // Start plaza
  {
    const start = path[0]!.clone();
    const pad = boxMesh(getRoadMat(0xc4a35a, 0.4, 0.5), 18, 0.4, 18, start.x, start.y - 0.05, start.z - 4);
    group.add(pad);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(6, 0.15, 8, 32),
      getRoadMat(0x66ccff, 0.6, 0.3),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(start.x, start.y + 0.3, start.z - 4);
    group.add(ring);
  }

  // Finish gate
  const finish = path[path.length - 1]!.clone();
  {
    const postL = boxMesh(getRoadMat(0xffdd44, 0.5, 0.4), 0.6, 6, 0.6, finish.x - 6, finish.y + 3, finish.z);
    const postR = boxMesh(getRoadMat(0xffdd44, 0.5, 0.4), 0.6, 6, 0.6, finish.x + 6, finish.y + 3, finish.z);
    const banner = boxMesh(getRoadMat(0xff6688, 0.3, 0.5), 12, 1.2, 0.3, finish.x, finish.y + 5.5, finish.z);
    group.add(postL, postR, banner);
  }

  // Checkpoints every ~400u
  const checkpoints: RaceCheckpoint[] = [];
  for (let d = 0; d < total; d += 400) {
    const idx = pathDist.findIndex((pd) => pd >= d);
    const i = Math.max(0, idx);
    checkpoints.push({ position: path[i]!.clone(), index: checkpoints.length });
  }
  checkpoints.push({ position: finish.clone(), index: checkpoints.length });

  // Board spawn slightly before start on the road
  const boardSpawn = path[2]!.clone();
  boardSpawn.y += 0.35;
  const d0 = path[3]!.clone().sub(path[1]!);
  const boardYaw = Math.atan2(d0.x, d0.z);

  // Soft cloud underlay (simple)
  {
    const cloud = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshBasicMaterial({
        color: 0xd0dae8,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    cloud.rotation.x = -Math.PI / 2;
    cloud.position.set(path[Math.floor(path.length / 2)]!.x, -12, path[Math.floor(path.length / 2)]!.z);
    group.add(cloud);
  }

  // Ambient lights along path
  for (let i = 0; i < path.length; i += 40) {
    const p = path[i]!;
    const t = i / path.length;
    const zc = zoneColor(t);
    const light = new THREE.PointLight(zc.accent, 0.7, 35);
    light.position.set(p.x, p.y + 8, p.z);
    group.add(light);
  }

  return {
    group,
    colliders,
    mats,
    path,
    pathDist,
    totalLength: total,
    boardSpawn,
    boardYaw,
    finishPos: finish,
    checkpoints,
    whooshPoints,
    bumpPoints,
    ramps,
    rails,
  };
}

function placeRamp(
  group: THREE.Group,
  _mats: Mats,
  mid: THREE.Vector3,
  yaw: number,
  color: number,
): RaceRamp {
  const g = new THREE.Group();
  const len = 12;
  // Wedge approximation: stacked slabs rising
  for (let s = 0; s < 6; s++) {
    const t = s / 5;
    const h = 0.35 + t * 3.8;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(8, h, len / 6 + 0.15),
      new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.5 }),
    );
    slab.position.set(0, h / 2, -len / 2 + (s + 0.5) * (len / 6));
    g.add(slab);
  }
  // Lip glow
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(8.2, 0.2, 0.4),
    new THREE.MeshStandardMaterial({
      color: 0x66e0ff,
      emissive: 0x22aaff,
      emissiveIntensity: 0.7,
    }),
  );
  lip.position.set(0, 4.1, len / 2 - 0.3);
  g.add(lip);
  g.position.copy(mid);
  g.rotation.y = yaw;
  group.add(g);
  return { pos: mid.clone(), yaw, len };
}

function placeRail(
  group: THREE.Group,
  mats: Mats,
  a: THREE.Vector3,
  b: THREE.Vector3,
  dir: THREE.Vector3,
  yaw: number,
  color: number,
): RaceRail {
  const right = new THREE.Vector3(dir.z, 0, -dir.x);
  const side = ROAD_W / 2 + 1.2;
  const ra = a.clone().addScaledVector(right, side);
  const rb = b.clone().addScaledVector(right, side);
  ra.y = a.y + 0.9;
  rb.y = b.y + 0.9;
  const mid = ra.clone().add(rb).multiplyScalar(0.5);
  const len = ra.distanceTo(rb);
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.25, len),
    new THREE.MeshStandardMaterial({
      color: 0xc0d0e0,
      metalness: 0.85,
      roughness: 0.25,
      emissive: color,
      emissiveIntensity: 0.15,
    }),
  );
  rail.position.copy(mid);
  rail.rotation.y = yaw;
  group.add(rail);
  // Supports
  for (const p of [ra, rb]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2, 6), mats.iron);
    post.position.set(p.x, p.y - 0.5, p.z);
    group.add(post);
  }
  return { a: ra, b: rb };
}

function placeRoadsideProps(
  group: THREE.Group,
  mats: Mats,
  mid: THREE.Vector3,
  dir: THREE.Vector3,
  _yaw: number,
  _t: number,
  zc: ReturnType<typeof zoneColor>,
  whoosh: THREE.Vector3[],
  bumps: THREE.Vector3[],
  seed: number,
) {
  const right = new THREE.Vector3(dir.z, 0, -dir.x);
  for (const side of [-1, 1] as const) {
    // Well clear of the 10u roadway so bumps never sit on the racing line
    const dist = ROAD_W / 2 + SIDE_W + 4.2 + (seed % 5) * 0.35;
    const base = mid.clone().addScaledVector(right, side * dist);
    base.y = mid.y;

    if (zc.name === 'park' || seed % 5 === 0) {
      // Floating tree (whoosh only — soft foliage)
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6),
        mats.wood,
      );
      trunk.position.set(base.x, base.y + 1.5, base.z);
      group.add(trunk);
      const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(1.4 + (seed % 3) * 0.2, 8, 6),
        new THREE.MeshStandardMaterial({
          color: zc.foliage,
          roughness: 0.85,
          metalness: 0.05,
        }),
      );
      canopy.position.set(base.x, base.y + 3.2, base.z);
      canopy.scale.y = 0.75;
      group.add(canopy);
      const isle = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.9, 0.5, 8),
        mats.stone,
      );
      isle.position.set(base.x, base.y + 0.2, base.z);
      group.add(isle);
      whoosh.push(base.clone());
    } else {
      // Building — solid bump (center well off-road)
      const h = 4 + (seed % 7) * 0.9;
      const w = 2.5 + (seed % 4) * 0.4;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, w),
        new THREE.MeshStandardMaterial({
          color: zc.accent,
          metalness: 0.45,
          roughness: 0.45,
        }),
      );
      body.position.set(base.x, base.y + h / 2 + 0.3, base.z);
      body.castShadow = true;
      group.add(body);
      const winMat = mats.emissiveAmber;
      for (let row = 0; row < Math.floor(h / 1.2); row++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.08), winMat);
        win.position.set(base.x + side * (w / 2 + 0.04), base.y + 1 + row * 1.2, base.z);
        group.add(win);
      }
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.1, 0.3, w * 1.1),
        mats.brass,
      );
      roof.position.set(base.x, base.y + h + 0.4, base.z);
      group.add(roof);
      whoosh.push(body.position.clone());
      bumps.push(body.position.clone());
    }
  }
}

function placeArch(
  group: THREE.Group,
  mats: Mats,
  mid: THREE.Vector3,
  yaw: number,
  color: number,
) {
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.4 });
  const left = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, 1.2), mat);
  const right = left.clone();
  const top = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 1.4), mat);
  left.position.set(mid.x, mid.y + 3.5, mid.z);
  right.position.copy(left.position);
  // Offset in local right after rotation
  const g = new THREE.Group();
  left.position.set(-6, 3.5, 0);
  right.position.set(6, 3.5, 0);
  top.position.set(0, 7.2, 0);
  g.add(left, right, top);
  // Decorative keystone
  const key = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.6), mats.brass);
  key.position.set(0, 7.2, 0);
  g.add(key);
  g.position.copy(mid);
  g.rotation.y = yaw;
  group.add(g);
}

function placeBridge(
  group: THREE.Group,
  mats: Mats,
  mid: THREE.Vector3,
  yaw: number,
  color: number,
) {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.4, 3.5),
    new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.45 }),
  );
  deck.position.y = 9;
  g.add(deck);
  for (const x of [-7, 7]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 9, 5), mats.iron);
    cable.position.set(x, 4.5, 0);
    g.add(cable);
  }
  g.position.copy(mid);
  g.rotation.y = yaw;
  group.add(g);
}

function placeFountain(
  group: THREE.Group,
  _mats: Mats,
  mid: THREE.Vector3,
  dir: THREE.Vector3,
  accent: number,
) {
  const right = new THREE.Vector3(dir.z, 0, -dir.x);
  const pos = mid.clone().addScaledVector(right, ROAD_W / 2 + SIDE_W + 5);
  pos.y = mid.y;
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.5, 0.6, 12),
    new THREE.MeshStandardMaterial({ color: accent, metalness: 0.6, roughness: 0.35 }),
  );
  basin.position.set(pos.x, pos.y + 0.4, pos.z);
  group.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 1.8, 0.2, 12),
    new THREE.MeshStandardMaterial({
      color: 0x6ec8ff,
      transparent: true,
      opacity: 0.65,
      metalness: 0.2,
      roughness: 0.2,
    }),
  );
  water.position.set(pos.x, pos.y + 0.75, pos.z);
  group.add(water);
  // Water fall column into clouds
  const fall = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.9, 14, 8),
    new THREE.MeshStandardMaterial({
      color: 0xa8e0ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  fall.position.set(pos.x, pos.y - 6, pos.z);
  group.add(fall);
  const mist = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xd0e8ff, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  mist.position.set(pos.x, pos.y - 12, pos.z);
  group.add(mist);
}

function placeVehicle(
  group: THREE.Group,
  mats: Mats,
  mid: THREE.Vector3,
  dir: THREE.Vector3,
  yaw: number,
  seed: number,
  whoosh: THREE.Vector3[],
) {
  // Park on the shoulder — never on the racing line (was ±2.2 and blocked the board)
  const lane = (seed % 2 === 0 ? -1 : 1) * (ROAD_W / 2 + SIDE_W * 0.55);
  const right = new THREE.Vector3(dir.z, 0, -dir.x);
  const pos = mid.clone().addScaledVector(right, lane);
  pos.y = mid.y + 1.15 + Math.sin(seed) * 0.15;
  const truck = seed % 3 === 0;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(truck ? 2.2 : 1.6, truck ? 1.4 : 0.9, truck ? 4.5 : 3.2),
    new THREE.MeshStandardMaterial({
      color: truck ? 0x4a80c0 : 0xe05050,
      metalness: 0.55,
      roughness: 0.4,
    }),
  );
  body.position.copy(pos);
  body.rotation.y = yaw;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.7, 1.2),
    mats.glass,
  );
  cabin.position.set(pos.x, pos.y + 0.7, pos.z);
  cabin.rotation.y = yaw;
  group.add(cabin);
  // Whoosh only — not a hard bump
  whoosh.push(pos.clone());
}

/** Nearest point on path + heading for board snap / AI. */
export function nearestOnPath(
  path: THREE.Vector3[],
  pathDist: number[],
  pos: THREE.Vector3,
): { point: THREE.Vector3; yaw: number; dist: number; index: number } {
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = path[i]!.distanceToSquared(pos);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  const a = path[bestI]!;
  const b = path[Math.min(path.length - 1, bestI + 1)]!;
  const dir = b.clone().sub(a);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  const yaw = Math.atan2(dir.x, dir.z);
  return {
    point: a.clone(),
    yaw,
    dist: pathDist[bestI] ?? 0,
    index: bestI,
  };
}
