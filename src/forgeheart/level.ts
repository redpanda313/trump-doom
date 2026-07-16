import * as THREE from 'three';
import { makeMaterials, makeFloorTexture, type Mats } from './materials';

export interface Collider {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export type InteractKind =
  | 'plaque'
  | 'photo'
  | 'note'
  | 'tray'
  | 'boat'
  | 'wrench_pickup'
  | 'valve'
  | 'crate';

export interface Interactable {
  type: InteractKind;
  position: THREE.Vector3;
  radius: number;
  mesh: THREE.Object3D;
  title?: string;
  text?: string;
  opened?: boolean;
  needsAlly?: boolean;
  /** Floating prompt sprite (E) */
  prompt?: THREE.Object3D;
  /** Story / tutorial id */
  id?: string;
  parts?: number;
}

export interface LevelBuilt {
  group: THREE.Group;
  colliders: Collider[];
  spawn: THREE.Vector3;
  exit: THREE.Vector3;
  interactables: Interactable[];
  mats: Mats;
  /** Lab exit door mesh + colliders (removed on breach) */
  labDoor: { meshes: THREE.Object3D[]; colliders: Collider[] };
  /** World anchors for tutorial scripting */
  anchors: {
    brotherSpot: THREE.Vector3;
    doorSpot: THREE.Vector3;
    enemySpawns: THREE.Vector3[];
    traySpots: THREE.Vector3[];
    boatSpot: THREE.Vector3;
    wrenchSpot: THREE.Vector3;
  };
}

const WALL_H = 3.2;
export const JUMP_H = WALL_H * 0.5;
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

function floorPlane(
  _mats: Mats,
  kind: 'wood' | 'grate' | 'cobble' | 'brass' | 'oil',
  w: number,
  d: number,
  x: number,
  y: number,
  z: number,
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
  const topY = y + visualH / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  const colH = 0.85;
  const col: Collider = {
    min: new THREE.Vector3(x - w / 2, topY - colH, z - d / 2),
    max: new THREE.Vector3(x + w / 2, topY, z + d / 2),
  };
  return { mesh, col };
}

export function inflateCollider(c: Collider, skin = 0.02): Collider {
  return {
    min: new THREE.Vector3(c.min.x - skin, c.min.y - skin * 0.25, c.min.z - skin),
    max: new THREE.Vector3(c.max.x + skin, c.max.y + skin * 0.15, c.max.z + skin),
  };
}

/** Floating "E" marker above interactables */
export function makePromptSprite(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(20,14,8,0.75)';
  ctx.fillRect(8, 8, 48, 48);
  ctx.strokeStyle = '#c4a35a';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 44, 44);
  ctx.fillStyle = '#f0e0b0';
  ctx.font = 'bold 32px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('E', 32, 34);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), mat);
  m.visible = false;
  return m;
}

/**
 * Tutorial level: brother's workshop lab + exterior floating walkway to escape boat.
 * Story: engineer brings brother's soul into a frame; demons batter the door.
 */
export function buildBrotherWorkshop(): LevelBuilt {
  const mats = makeMaterials();
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const doorMeshes: THREE.Object3D[] = [];
  const doorCols: Collider[] = [];

  const add = (m: THREE.Object3D, col?: Collider) => {
    group.add(m);
    if (col) colliders.push(inflateCollider(col, 0.03));
  };

  const wall = (w: number, h: number, d: number, x: number, y: number, z: number, m = mats.brass) => {
    const b = box(mats, m, w, h, d, x, y, z);
    add(b.mesh, b.col);
    return b;
  };

  // ——— Large workshop floor ———
  {
    const f = floorPlane(mats, 'wood', 22, 16, 0, 0, 0);
    add(f.mesh, f.col);
  }
  {
    const f = floorPlane(mats, 'oil', 5, 4, 0, 0.02, 1);
    add(f.mesh);
  }

  // Outer walls (north wall has door gap later)
  wall(22.5, WALL_H, 0.45, 0, WALL_H / 2, -8, mats.iron); // south
  wall(0.45, WALL_H, 16.5, -11, WALL_H / 2, 0, mats.iron); // west
  wall(0.45, WALL_H, 16.5, 11, WALL_H / 2, 0, mats.brassDark); // east

  // North wall with doorway (center gap ~2.4 wide)
  wall(9, WALL_H, 0.45, -6.7, WALL_H / 2, 8, mats.brass);
  wall(9, WALL_H, 0.45, 6.7, WALL_H / 2, 8, mats.brass);
  // Door leafs (removed on breach)
  {
    const left = box(mats, mats.ironDark, 1.15, 2.5, 0.2, -0.7, 1.25, 8);
    const right = box(mats, mats.ironDark, 1.15, 2.5, 0.2, 0.7, 1.25, 8);
    const bar = box(mats, mats.brass, 2.5, 0.2, 0.25, 0, 2.55, 8);
    for (const d of [left, right, bar]) {
      group.add(d.mesh);
      const c = inflateCollider(d.col, 0.03);
      colliders.push(c);
      doorMeshes.push(d.mesh);
      doorCols.push(c);
    }
  }

  // Ceiling
  {
    const ceil = box(mats, mats.woodDark, 22, 0.3, 16.5, 0, WALL_H + 0.1, 0);
    add(ceil.mesh, ceil.col);
  }
  for (const bx of [-7, 0, 7]) {
    const beam = box(mats, mats.wood, 0.4, 0.35, 15, bx, WALL_H - 0.25, 0);
    add(beam.mesh);
  }

  // Big industrial windows (west + east)
  for (const side of [-1, 1] as const) {
    const x = side * 10.85;
    for (const wz of [-4.5, -1.5, 1.5, 4.5]) {
      const frame = box(mats, mats.brassDark, 0.2, 2.2, 2.0, x, 1.6, wz);
      add(frame.mesh);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 1.55), mats.glass);
      pane.position.set(side * 10.95, 1.6, wz);
      group.add(pane);
      // Soft daylight
      const light = new THREE.PointLight(0xffe0b0, 0.45, 10);
      light.position.set(side * 9.5, 2.0, wz);
      group.add(light);
    }
  }

  // Pipes / gears atmosphere
  for (const pz of [-5, -2, 2, 5]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 10, 8), mats.copper);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 2.6, pz);
    group.add(pipe);
  }
  const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.18, 14), mats.brass);
  gear.rotation.x = Math.PI / 2;
  gear.position.set(-9, 1.8, -6);
  group.add(gear);

  // ——— Workstation (center) ———
  const bench = box(mats, mats.wood, 3.2, 0.9, 1.6, 0, 0.45, 0.5);
  add(bench.mesh, bench.col);
  // Side tables for trays
  const traySpots = [
    new THREE.Vector3(-2.8, 0.95, 0.2),
    new THREE.Vector3(2.8, 0.95, 0.2),
    new THREE.Vector3(0, 0.95, -1.6),
  ];
  const tablePositions = [
    new THREE.Vector3(-2.8, 0.4, 0.2),
    new THREE.Vector3(2.8, 0.4, 0.2),
    new THREE.Vector3(0, 0.4, -1.6),
  ];
  for (const tp of tablePositions) {
    const t = box(mats, mats.woodDark, 1.4, 0.8, 1.0, tp.x, tp.y, tp.z);
    add(t.mesh, t.col);
  }

  // Pre-place tray meshes (hidden until brother is scrapped)
  const trayLabels = ['Heart Chassis', 'Soul Coil', 'Memory Gears'];
  traySpots.forEach((spot, i) => {
    const tray = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.5), mats.brass);
    const part = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.25), mats.copper);
    part.position.y = 0.12;
    tray.add(base, part);
    tray.position.copy(spot);
    tray.visible = false;
    group.add(tray);
    const prompt = makePromptSprite();
    prompt.position.set(spot.x, spot.y + 0.7, spot.z);
    group.add(prompt);
    interactables.push({
      type: 'tray',
      id: `tray_${i}`,
      position: spot.clone(),
      radius: 1.6,
      mesh: tray,
      prompt,
      title: trayLabels[i],
      text: `Workbench tray: ${trayLabels[i]}. Press E to reclaim the part.`,
      opened: false,
      parts: 1,
    });
  });

  // Brother's photograph on south wall
  {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.08), mats.brass);
    frame.position.set(-3.5, 1.7, -7.7);
    group.add(frame);
    const photo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x6a5538, roughness: 0.9 }),
    );
    photo.position.set(-3.5, 1.7, -7.62);
    group.add(photo);
    // Simple face suggestion
    const head = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 12),
      new THREE.MeshBasicMaterial({ color: 0xc4a882 }),
    );
    head.position.set(-3.5, 1.9, -7.6);
    group.add(head);
    const prompt = makePromptSprite();
    prompt.position.set(-3.5, 2.5, -7.5);
    group.add(prompt);
    interactables.push({
      type: 'photo',
      id: 'brother_photo',
      position: new THREE.Vector3(-3.5, 1.7, -7.5),
      radius: 2.2,
      mesh: frame,
      prompt,
      title: 'Photograph — Elias',
      text:
        'Elias Voss, your brother. The card on the back is water-stained: “Taken the spring before the fever. He laughed at the camera — always first into the light.” You buried him under the ash-trees. The lab still smells like his coats.',
    });
  }

  // Workbench notes
  const notes: { pos: THREE.Vector3; title: string; text: string }[] = [
    {
      pos: new THREE.Vector3(1.2, 1.0, 0.5),
      title: 'Journal — Consciousness Imprint',
      text:
        'I found the coil pattern in Grandfather’s sealed folio: plasma laced through brass can hold a pattern of mind. Not a program — a guest. When the frame is quiet and the talisman is true, a soul may take seat.',
    },
    {
      pos: new THREE.Vector3(-1.1, 1.0, 0.6),
      title: 'Theory — Souls in Steel',
      text:
        'I no longer believe the automata are empty. Something looks out of their eyes when the plasma sings. Demons wear scrap like coats. But love is a beacon too — if I can call Elias home, he will know my voice.',
    },
    {
      pos: new THREE.Vector3(0.2, 1.0, -1.5),
      title: 'Talisman Note',
      text:
        'Wired his pocket-watch gear into the chest plate — the one Mother gave him. If any spark of Elias remains between stars and steam, it will know this weight. Do not scrap the frame. Reprogram with the Hand. Speak his name.',
    },
  ];
  for (const n of notes) {
    const paper = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.02, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xd8c49a, roughness: 0.95 }),
    );
    paper.position.copy(n.pos);
    group.add(paper);
    const prompt = makePromptSprite();
    prompt.position.set(n.pos.x, n.pos.y + 0.55, n.pos.z);
    group.add(prompt);
    interactables.push({
      type: 'note',
      id: n.title,
      position: n.pos.clone(),
      radius: 1.5,
      mesh: paper,
      prompt,
      title: n.title,
      text: n.text,
    });
  }

  // Wrench on rack (pickup when siege begins — mesh present, interaction gated in game)
  const wrenchSpot = new THREE.Vector3(4.5, 1.1, -6.5);
  {
    const rack = box(mats, mats.iron, 0.8, 1.4, 0.3, 4.5, 0.7, -6.8);
    add(rack.mesh, rack.col);
    const wrench = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), mats.ironDark);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.2), mats.brass);
    head.position.y = 0.4;
    wrench.add(handle, head);
    wrench.position.copy(wrenchSpot);
    wrench.rotation.z = 0.3;
    wrench.visible = false;
    group.add(wrench);
    const prompt = makePromptSprite();
    prompt.position.set(wrenchSpot.x, wrenchSpot.y + 0.6, wrenchSpot.z);
    group.add(prompt);
    interactables.push({
      type: 'wrench_pickup',
      id: 'arc_wrench',
      position: wrenchSpot.clone(),
      radius: 1.8,
      mesh: wrench,
      prompt,
      title: 'Arc Wrench',
      text: 'Your father’s arc wrench. Plasma teeth for rogue frames. Press E to take it.',
      opened: false,
    });
  }

  // Warm lamps
  for (const [lx, ly, lz] of [
    [-8, 2.4, -5],
    [8, 2.4, -5],
    [-8, 2.4, 5],
    [8, 2.4, 5],
    [0, 2.6, 0],
  ] as [number, number, number][]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), mats.emissiveAmber);
    lamp.position.set(lx, ly, lz);
    group.add(lamp);
    const light = new THREE.PointLight(0xff9944, 1.0, 11);
    light.position.copy(lamp.position);
    group.add(light);
  }

  // ——— Exterior: floating deck beyond door ———
  {
    const f = floorPlane(mats, 'brass', 10, 8, 0, 0, 13);
    add(f.mesh, f.col);
  }
  // Railings
  wall(10, 0.5, 0.15, 0, 0.4, 17, mats.iron);
  wall(0.15, 0.5, 8, -5, 0.4, 13, mats.iron);
  wall(0.15, 0.5, 8, 5, 0.4, 13, mats.iron);

  // Walkway to boat
  {
    const f = floorPlane(mats, 'grate', 3.2, 14, 0, 0, 24);
    add(f.mesh, f.col);
  }
  wall(0.12, 0.45, 14, -1.7, 0.35, 24, mats.iron);
  wall(0.12, 0.45, 14, 1.7, 0.35, 24, mats.iron);

  // Boat platform
  {
    const f = floorPlane(mats, 'wood', 6, 5, 0, 0, 33);
    add(f.mesh, f.col);
  }
  // Boat hull
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.8, 4.5), mats.woodDark);
  hull.position.y = 0.5;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 1.8), mats.brassDark);
  cabin.position.set(0, 1.3, -0.5);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.2, 8), mats.iron);
  stack.position.set(0, 2.2, -0.3);
  boat.add(hull, cabin, stack);
  boat.position.set(0, 0, 33.5);
  group.add(boat);

  // Steampunk boat controls
  {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.4), mats.brass);
    panel.position.set(0, 1.35, 32.2);
    group.add(panel);
    const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), mats.copper);
    lever.position.set(0.15, 1.7, 32.2);
    group.add(lever);
    const prompt = makePromptSprite();
    prompt.position.set(0, 2.2, 32.2);
    group.add(prompt);
    interactables.push({
      type: 'boat',
      id: 'escape_boat',
      position: new THREE.Vector3(0, 1.4, 32.2),
      radius: 2.4,
      mesh: panel,
      prompt,
      title: 'Skiff Controls',
      text: 'Brass levers and a plasma throttle. Press E to cast off — escape with Elias.',
      opened: false,
    });
  }

  // Floating city silhouette (decorative, no collision)
  const cityMat = mats.ironDark;
  const skyline: [number, number, number, number, number, number][] = [
    [-18, 2, 20, 3, 5, 3],
    [-22, 3, 28, 4, 7, 4],
    [16, 2.5, 18, 3.5, 6, 3],
    [20, 4, 30, 5, 8, 4],
    [-14, 1.5, 36, 2.5, 4, 2.5],
    [12, 2, 40, 3, 5, 3],
    [-8, 5, 45, 4, 3, 4],
    [8, 3, 48, 6, 4, 3],
  ];
  for (const [x, y, z, w, h, d] of skyline) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat);
    b.position.set(x, y, z);
    group.add(b);
    // little walkway connectors
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x) * 0.3, 0.15, 0.4), mats.brassDark);
    bridge.position.set(x * 0.4, y - h * 0.3, z - 2);
    group.add(bridge);
  }
  // Fog-ish sky discs
  for (const [x, z] of [
    [-25, 22],
    [24, 26],
    [-20, 42],
    [18, 44],
  ] as [number, number][]) {
    const cloud = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xc4b8a0, transparent: true, opacity: 0.35 }),
    );
    cloud.position.set(x, 8, z);
    group.add(cloud);
  }

  // Void safety platforms under walkway (invisible catch)
  {
    const catcher = box(mats, mats.stone, 14, 0.4, 40, 0, -2.5, 18);
    catcher.mesh.visible = false;
    add(catcher.mesh, catcher.col);
  }

  return {
    group,
    colliders,
    spawn: new THREE.Vector3(0, 0.1, -5.5),
    exit: new THREE.Vector3(0, 0.1, 33),
    interactables,
    mats,
    labDoor: { meshes: doorMeshes, colliders: doorCols },
    anchors: {
      brotherSpot: new THREE.Vector3(0, 0, 1.8),
      doorSpot: new THREE.Vector3(0, 0, 8),
      enemySpawns: [new THREE.Vector3(-1.2, 0, 10.5), new THREE.Vector3(1.2, 0, 10.5)],
      traySpots,
      boatSpot: new THREE.Vector3(0, 0, 33),
      wrenchSpot,
    },
  };
}

/** @deprecated use buildBrotherWorkshop — kept name for any old imports */
export function buildFoundryAnnex(): LevelBuilt {
  return buildBrotherWorkshop();
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
