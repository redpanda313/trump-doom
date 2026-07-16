import * as THREE from 'three';
import { makeMaterials, makeFloorTexture, type Mats } from './materials';

export interface Collider {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface Interactable {
  type: 'plaque' | 'valve' | 'crate';
  position: THREE.Vector3;
  radius: number;
  mesh: THREE.Object3D;
  title?: string;
  text?: string;
  opened?: boolean;
  /** Ally channel opens valve */
  needsAlly?: boolean;
}

export interface LevelBuilt {
  group: THREE.Group;
  colliders: Collider[];
  spawn: THREE.Vector3;
  exit: THREE.Vector3;
  interactables: Interactable[];
  /** Open sky y for fog/feel */
  mats: Mats;
}

const WALL_H = 3; // full story height in world units
export const JUMP_H = WALL_H * 0.5; // half wall
export const PLAYER_H = 1.6;
export const PLAYER_R = 0.35;

function box(
  _mats: Mats,
  mat: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): { mesh: THREE.Mesh; col: Collider } {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const col: Collider = {
    min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
    max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
  };
  return { mesh, col };
}

/**
 * Visual slab is thin; collision slab is thicker so the player can't tunnel
 * through floors during large physics steps.
 */
function floorPlane(
  _mats: Mats,
  kind: 'wood' | 'grate' | 'cobble' | 'brass' | 'oil',
  w: number,
  d: number,
  x: number,
  y: number,
  z: number,
  yRot = 0,
): { mesh: THREE.Mesh; col: Collider } {
  const tex = makeFloorTexture(kind);
  tex.repeat.set(w / 3, d / 3);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: kind === 'grate' ? 0.6 : 0.85,
    metalness: kind === 'brass' || kind === 'grate' ? 0.5 : 0.05,
  });
  const visualH = 0.28;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, visualH, d), mat);
  // Top surface at y + visualH/2 ≈ walkable height
  const topY = y + visualH / 2;
  mesh.position.set(x, y, z);
  mesh.rotation.y = yRot;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  // Collision: thick volume below the top surface (harder to fall through)
  const colH = 0.85;
  const col: Collider = {
    min: new THREE.Vector3(x - w / 2, topY - colH, z - d / 2),
    max: new THREE.Vector3(x + w / 2, topY, z + d / 2),
  };
  return { mesh, col };
}

/** Inflate collider slightly for stable contact. */
export function inflateCollider(c: Collider, skin = 0.02): Collider {
  return {
    min: new THREE.Vector3(c.min.x - skin, c.min.y - skin * 0.25, c.min.z - skin),
    max: new THREE.Vector3(c.max.x + skin, c.max.y + skin * 0.15, c.max.z + skin),
  };
}

/** Build Foundry Annex: ground workshop + upper walkway + open courtyard. */
export function buildFoundryAnnex(): LevelBuilt {
  const mats = makeMaterials();
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];

  const add = (m: THREE.Object3D, col?: Collider) => {
    group.add(m);
    if (col) colliders.push(inflateCollider(col, 0.03));
  };

  // ——— Ground floor hall (interior) ———
  // Floor wood with oil stain zone
  {
    const f = floorPlane(mats, 'wood', 20, 12, 0, 0, 0);
    add(f.mesh, f.col);
  }
  {
    const f = floorPlane(mats, 'oil', 6, 4, -4, 0.02, 2);
    add(f.mesh); // decorative overlay — thin, no extra collider needed
  }

  // Walls room 1
  const wall = (w: number, h: number, d: number, x: number, y: number, z: number, m = mats.brass) => {
    const b = box(mats, m, w, h, d, x, y, z);
    add(b.mesh, b.col);
  };

  // Outer shell ground story (partial — open to courtyard +Z)
  wall(20.5, WALL_H, 0.4, 0, WALL_H / 2, -6, mats.iron); // south wall
  wall(0.4, WALL_H, 12, -10, WALL_H / 2, 0, mats.iron); // west
  wall(0.4, WALL_H, 12, 10, WALL_H / 2, 0, mats.brassDark); // east

  // North interior wall with doorway gap
  wall(7, WALL_H, 0.4, -6.5, WALL_H / 2, 6, mats.brass);
  wall(7, WALL_H, 0.4, 6.5, WALL_H / 2, 6, mats.brass);

  // Ceiling beams (interior only, over hall z < 5)
  {
    const ceil = box(mats, mats.woodDark, 19.5, 0.3, 11.5, 0, WALL_H + 0.1, 0);
    add(ceil.mesh, ceil.col);
  }
  // Decorative beams
  for (const bx of [-6, 0, 6]) {
    const beam = box(mats, mats.wood, 0.4, 0.35, 11, bx, WALL_H - 0.2, 0);
    add(beam.mesh);
  }

  // Window panels on east wall
  for (const wz of [-3, 0, 3]) {
    const frame = box(mats, mats.brassDark, 0.15, 1.8, 1.6, 9.7, 1.4, wz);
    add(frame.mesh);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 1.2), mats.glass);
    pane.position.set(9.85, 1.4, wz);
    group.add(pane);
  }

  // Pipes along wall
  for (const pz of [-4, -1, 2]) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 8, 8),
      mats.copper,
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 2.2, pz);
    pipe.castShadow = true;
    group.add(pipe);
  }

  // Gear decoration
  const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.2, 12), mats.brass);
  gear.rotation.x = Math.PI / 2;
  gear.position.set(-8, 1.5, -4.5);
  group.add(gear);

  // ——— Courtyard (open sky) beyond doorway ———
  {
    const f = floorPlane(mats, 'cobble', 18, 16, 0, 0, 14);
    add(f.mesh, f.col);
  }
  {
    const f = floorPlane(mats, 'brass', 3, 14, 0, 0.03, 12);
    add(f.mesh); // path story
  }

  // Courtyard walls low + towers
  wall(18, 1.2, 0.4, 0, 0.6, 22, mats.stone);
  wall(0.4, 1.2, 16, -9, 0.6, 14, mats.stone);
  wall(0.4, 1.2, 16, 9, 0.6, 14, mats.stone);

  // ——— Upper walkway (second story) along west of courtyard ———
  const upperY = WALL_H; // top of first story
  {
    const f = floorPlane(mats, 'grate', 4, 14, -6, upperY, 12);
    add(f.mesh, f.col);
  }
  // Side walls / railings for platform (visual solidity)
  wall(0.2, 0.9, 14, -8, upperY + 0.5, 12, mats.iron);
  wall(0.2, 0.9, 14, -4, upperY + 0.5, 12, mats.iron);
  wall(4, 0.9, 0.2, -6, upperY + 0.5, 5, mats.iron);
  wall(4, 0.9, 0.2, -6, upperY + 0.5, 19, mats.iron);
  // Support pillars
  for (const pz of [7, 12, 17]) {
    const pillar = box(mats, mats.ironDark, 0.5, upperY, 0.5, -6, upperY / 2, pz);
    add(pillar.mesh, pillar.col);
  }

  // Stairs from courtyard to upper (thick solid steps — hard to fall through)
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const sy = 0.15 + t * (upperY - 0.15);
    const sz = 6.5 + i * 0.55;
    const step = box(mats, mats.iron, 2.2, Math.max(0.35, sy), 0.6, -3.5, sy / 2, sz);
    add(step.mesh, step.col);
    const top = floorPlane(mats, 'grate', 2.2, 0.6, -3.5, sy, sz);
    add(top.mesh); // visual only — collision from thick body
    wall(0.15, Math.max(0.4, sy), 0.6, -4.55, sy / 2, sz, mats.iron);
  }

  // Half-height platform in courtyard (jump puzzle)
  {
    const f = floorPlane(mats, 'brass', 3, 3, 4, JUMP_H / 2, 11);
    // thicker platform body with sides
    const body = box(mats, mats.brassDark, 3, JUMP_H, 3, 4, JUMP_H / 2, 11);
    add(body.mesh, body.col);
    add(f.mesh);
  }
  // Second half platform
  {
    const body = box(mats, mats.brassDark, 3, JUMP_H, 3, 7, JUMP_H / 2, 14);
    add(body.mesh, body.col);
  }

  // Upper interior loft above workshop (two-story building)
  {
    const f = floorPlane(mats, 'wood', 12, 8, 0, upperY, -1);
    add(f.mesh, f.col);
  }
  // Loft walls
  wall(12, WALL_H * 0.85, 0.35, 0, upperY + (WALL_H * 0.85) / 2, -5, mats.brass);
  wall(0.35, WALL_H * 0.85, 8, -6, upperY + (WALL_H * 0.85) / 2, -1, mats.brass);
  wall(0.35, WALL_H * 0.85, 8, 6, upperY + (WALL_H * 0.85) / 2, -1, mats.iron);
  // Loft ceiling
  {
    const c = box(mats, mats.woodDark, 11.5, 0.25, 7.5, 0, upperY + WALL_H * 0.85, -1);
    add(c.mesh, c.col);
  }
  // Stairs inside workshop to loft (solid risers)
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const sy = 0.2 + t * (upperY - 0.2);
    const sx = 7 - i * 0.35;
    const step = box(mats, mats.wood, 1.5, Math.max(0.35, sy), 1.3, sx, sy / 2, 3.5);
    add(step.mesh, step.col);
  }

  // Boiler tank (story prop)
  {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 2.5, 12), mats.iron);
    tank.position.set(7, 1.25, -3);
    tank.castShadow = true;
    group.add(tank);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), mats.copper);
    cap.position.set(7, 2.6, -3);
    group.add(cap);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), mats.emissiveAmber);
    glow.position.set(7, 1.5, -1.7);
    group.add(glow);
  }

  // Plaques
  const addPlaque = (x: number, y: number, z: number, title: string, text: string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.08), mats.brass);
    mesh.position.set(x, y, z);
    group.add(mesh);
    interactables.push({
      type: 'plaque',
      position: new THREE.Vector3(x, y, z),
      radius: 1.8,
      mesh,
      title,
      text,
    });
  };
  addPlaque(
    -9.5,
    1.5,
    0,
    'Shift Log',
    '“The loft holds the old seals. Mind the oil on the boards — the annex remembers every leak.”',
  );
  addPlaque(
    0,
    1.4,
    5.6,
    'Yard Notice',
    '“Open sky beyond the arch. Brass path leads true. Jump the half-blocks if the stairs feel long.”',
  );
  addPlaque(
    -6,
    upperY + 1.2,
    12,
    'Walkway Rule',
    '“Disabled frames may be rewritten — or returned to scrap. The hand of the engineer chooses.”',
  );

  // Valve (ally opens)
  {
    const valve = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.8, 10), mats.iron);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.08, 8, 16), mats.brass);
    wheel.position.y = 0.6;
    wheel.rotation.x = Math.PI / 2;
    valve.add(base, wheel);
    valve.position.set(8, 0.4, 18);
    group.add(valve);
    // Hidden door (closed wall)
    const door = box(mats, mats.brassDark, 0.4, 2.4, 2.2, 9.2, 1.2, 18);
    door.mesh.name = 'hidden_door';
    add(door.mesh, door.col);
    interactables.push({
      type: 'valve',
      position: valve.position.clone(),
      radius: 2.2,
      mesh: valve,
      title: 'Pressure Valve',
      text: 'An ally frame can turn this seal…',
      needsAlly: true,
      opened: false,
    });
    (valve.userData as { doorMesh?: THREE.Mesh; doorCol?: Collider }).doorMesh = door.mesh;
    (valve.userData as { doorCol?: Collider }).doorCol = door.col;
  }

  // Crate (ally uncovers loot)
  {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), mats.wood);
    crate.position.set(5, 0.5, 16);
    crate.castShadow = true;
    group.add(crate);
    interactables.push({
      type: 'crate',
      position: crate.position.clone(),
      radius: 1.8,
      mesh: crate,
      title: 'Sealed Crate',
      text: 'Brass-bound. An ally can pry it.',
      needsAlly: true,
      opened: false,
    });
  }

  // Ambient light helpers already in game — lanterns
  for (const [lx, ly, lz] of [
    [-8, 2.5, -2],
    [8, 2.5, 2],
    [-6, upperY + 1.5, 12],
    [3, 2, 15],
  ] as [number, number, number][]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), mats.emissiveAmber);
    lamp.position.set(lx, ly, lz);
    group.add(lamp);
    const light = new THREE.PointLight(0xff9944, 1.2, 12);
    light.position.copy(lamp.position);
    group.add(light);
  }

  return {
    group,
    colliders,
    spawn: new THREE.Vector3(0, 0.1, -3),
    exit: new THREE.Vector3(0, 0.1, 20),
    interactables,
    mats,
  };
}

export function aabbOverlap(
  minA: THREE.Vector3,
  maxA: THREE.Vector3,
  minB: THREE.Vector3,
  maxB: THREE.Vector3,
): boolean {
  return (
    minA.x <= maxB.x &&
    maxA.x >= minB.x &&
    minA.y <= maxB.y &&
    maxA.y >= minB.y &&
    minA.z <= maxB.z &&
    maxA.z >= minB.z
  );
}
