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

  // North wall with doorway (center gap ~4.4 wide between wall edges at ±2.2)
  wall(9, WALL_H, 0.45, -6.7, WALL_H / 2, 8, mats.brass);
  wall(9, WALL_H, 0.45, 6.7, WALL_H / 2, 8, mats.brass);
  // Sealed iron doors — full opening width + height so player cannot leave early.
  // Removed entirely on breach (meshes + colliders).
  {
    // Two leaves overlapping walls slightly so no squeeze gap at the jambs
    const doorH = WALL_H + 0.05;
    const doorD = 0.55; // thick enough that substeps can't tunnel
    const left = box(mats, mats.ironDark, 2.45, doorH, doorD, -1.15, doorH / 2, 8);
    const right = box(mats, mats.ironDark, 2.45, doorH, doorD, 1.15, doorH / 2, 8);
    // Center seam + top lintel (visual weight + extra block)
    const seam = box(mats, mats.brass, 0.28, doorH, doorD + 0.08, 0, doorH / 2, 8);
    const lintel = box(mats, mats.brass, 5.0, 0.35, doorD + 0.12, 0, doorH - 0.1, 8);
    // Invisible full-slot blocker (belt-and-suspenders collision)
    const seal = box(mats, mats.iron, 4.7, doorH, 0.7, 0, doorH / 2, 8);
    seal.mesh.visible = false;
    for (const d of [left, right, seam, lintel, seal]) {
      group.add(d.mesh);
      const c = inflateCollider(d.col, 0.06);
      colliders.push(c);
      doorMeshes.push(d.mesh);
      doorCols.push(c);
    }
    // Decorative rivets / bars (no colliders)
    for (const x of [-1.8, -0.5, 0.5, 1.8]) {
      for (const y of [0.6, 1.5, 2.4]) {
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), mats.brass);
        rivet.position.set(x, y, 8.32);
        group.add(rivet);
        doorMeshes.push(rivet); // hide with doors on breach
      }
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

  // ——— Exterior path: continuous from lab door → deck → walkway → boat ———
  // Overlapping slabs so nothing can fall between segments.
  // Lab floor ends ~z=8; door at z=8. Path starts inside the threshold.
  {
    // Door apron (overlaps interior floor past the door sill)
    const apron = floorPlane(mats, 'brass', 8, 5.5, 0, 0.01, 9.2); // z ≈ 6.45–11.95
    add(apron.mesh, apron.col);
  }
  {
    // Wide dock deck flush against apron
    const deck = floorPlane(mats, 'brass', 12, 7, 0, 0, 13.5); // z ≈ 10–17
    add(deck.mesh, deck.col);
  }
  {
    // Walkway abuts deck (overlap ~1u)
    const path = floorPlane(mats, 'grate', 4.4, 11, 0, 0, 21); // z ≈ 15.5–26.5
    add(path.mesh, path.col);
  }
  {
    // Boat platform abuts walkway
    const dock = floorPlane(mats, 'wood', 7.5, 6.5, 0, 0, 28.5); // z ≈ 25.25–31.75
    add(dock.mesh, dock.col);
  }

  // Low curb rails (keep feet on path without blocking vision)
  wall(12, 0.45, 0.18, 0, 0.28, 17, mats.iron);
  wall(0.18, 0.45, 7, -6, 0.28, 13.5, mats.iron);
  wall(0.18, 0.45, 7, 6, 0.28, 13.5, mats.iron);
  wall(0.16, 0.4, 11, -2.3, 0.28, 21, mats.iron);
  wall(0.16, 0.4, 11, 2.3, 0.28, 21, mats.iron);
  wall(7.5, 0.4, 0.16, 0, 0.28, 31.6, mats.iron);

  // Invisible recovery shelf under the whole outdoor path (slightly wider)
  {
    const shelf = box(mats, mats.stone, 14, 0.5, 28, 0, -0.35, 18);
    shelf.mesh.visible = false;
    add(shelf.mesh, shelf.col);
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
  boat.position.set(0, 0, 29);
  group.add(boat);

  // Steampunk boat controls
  {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.4), mats.brass);
    panel.position.set(0, 1.35, 27.6);
    group.add(panel);
    const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), mats.copper);
    lever.position.set(0.15, 1.7, 27.6);
    group.add(lever);
    const prompt = makePromptSprite();
    prompt.position.set(0, 2.2, 27.6);
    group.add(prompt);
    interactables.push({
      type: 'boat',
      id: 'escape_boat',
      position: new THREE.Vector3(0, 1.4, 27.6),
      radius: 2.4,
      mesh: panel,
      prompt,
      title: 'Skiff Controls',
      text: 'Brass levers and a plasma throttle. Press E to cast off — escape with Elias.',
      opened: false,
    });
  }

  // ——— Nearby detailed floating city (around workshop + path) ———
  addCityCluster(group, mats);

  // Far painted backdrops — pushed back, soft edge fade into fog
  addSkyBackdrop(group, '/forgeheart/sky/city-skyline.jpg', new THREE.Vector3(0, 10, 78), 110, 42, 0, 0.72);
  addSkyBackdrop(
    group,
    '/forgeheart/sky/floating-homes.jpg',
    new THREE.Vector3(-58, 9, 42),
    72,
    34,
    Math.PI * 0.48,
    0.65,
  );
  addSkyBackdrop(
    group,
    '/forgeheart/sky/capital-horizon.jpg',
    new THREE.Vector3(58, 9.5, 40),
    72,
    34,
    -Math.PI * 0.48,
    0.65,
  );
  addSkyBackdrop(
    group,
    '/forgeheart/sky/cloud-mountains.jpg',
    new THREE.Vector3(28, 6, 70),
    64,
    30,
    -Math.PI * 0.12,
    0.55,
  );
  addSkyBackdrop(
    group,
    '/forgeheart/sky/cloud-mountains.jpg',
    new THREE.Vector3(-30, 5.5, 68),
    60,
    28,
    Math.PI * 0.1,
    0.5,
  );

  // Cloud-only ocean under the docks — unique plate, soft edge blend into void/fog
  {
    const cloudGeo = new THREE.PlaneGeometry(180, 120);
    const alpha = makeEdgeFadeAlpha(0.42); // wide soft falloff so no hard horizon ring
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xb8c4d0,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
      alphaMap: alpha,
      fog: true,
    });
    const cloudSea = new THREE.Mesh(cloudGeo, cloudMat);
    cloudSea.rotation.x = -Math.PI / 2;
    cloudSea.position.set(0, -9, 36);
    cloudSea.renderOrder = -2;
    group.add(cloudSea);

    // Second slightly offset layer for depth / parallax softness
    const cloudMat2 = cloudMat.clone();
    cloudMat2.opacity = 0.35;
    cloudMat2.alphaMap = makeEdgeFadeAlpha(0.5);
    const cloudSea2 = new THREE.Mesh(new THREE.PlaneGeometry(200, 140), cloudMat2);
    cloudSea2.rotation.x = -Math.PI / 2;
    cloudSea2.position.set(6, -11.5, 42);
    cloudSea2.renderOrder = -3;
    group.add(cloudSea2);

    const loader = new THREE.TextureLoader();
    loader.load('/forgeheart/sky/cloud-ocean.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
      tex.repeat.set(1.6, 1.35);
      cloudMat.map = tex;
      cloudMat.color.set(0xe8eef4);
      cloudMat.opacity = 0.82;
      cloudMat.needsUpdate = true;
      // Second layer uses a shifted crop of the same cloud plate
      const tex2 = tex.clone();
      tex2.wrapS = tex2.wrapT = THREE.MirroredRepeatWrapping;
      tex2.repeat.set(1.9, 1.5);
      tex2.offset.set(0.35, 0.2);
      tex2.needsUpdate = true;
      cloudMat2.map = tex2;
      cloudMat2.color.set(0xd0dae6);
      cloudMat2.opacity = 0.45;
      cloudMat2.needsUpdate = true;
    });
  }

  return {
    group,
    colliders,
    spawn: new THREE.Vector3(0, 0.1, -5.5),
    exit: new THREE.Vector3(0, 0.1, 28.5),
    interactables,
    mats,
    labDoor: { meshes: doorMeshes, colliders: doorCols },
    anchors: {
      brotherSpot: new THREE.Vector3(0, 0, 1.8),
      doorSpot: new THREE.Vector3(0, 0, 8),
      // Spawn on solid apron/deck — not over void
      enemySpawns: [new THREE.Vector3(-1.4, 0.05, 11.2), new THREE.Vector3(1.4, 0.05, 11.2)],
      traySpots,
      boatSpot: new THREE.Vector3(0, 0, 29),
      wrenchSpot,
    },
  };
}

/**
 * Soft rectangular alpha mask — white center, transparent edges.
 * Makes backdrop photos melt into fog instead of hard picture frames.
 */
function makeEdgeFadeAlpha(edge = 0.28): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  // Start fully opaque
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const e = Math.floor(size * edge);
  // Multiply soft black edges (alphaMap: black = transparent)
  const fade = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    horizontal: boolean,
    invert: boolean,
  ) => {
    const g = horizontal
      ? ctx.createLinearGradient(x0, 0, x1, 0)
      : ctx.createLinearGradient(0, y0, 0, y1);
    if (invert) {
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
    } else {
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
    }
    ctx.fillStyle = g;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillRect(0, 0, size, size);
  };
  fade(0, 0, e, 0, true, false); // left
  fade(size - e, 0, size, 0, true, true); // right
  fade(0, 0, 0, e, false, false); // top
  fade(0, size - e, 0, size, false, true); // bottom
  // Extra radial softness in corners
  const rg = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.62);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Distant painted sky-city panel with soft edge fade (non-colliding). */
function addSkyBackdrop(
  group: THREE.Group,
  url: string,
  pos: THREE.Vector3,
  width: number,
  height: number,
  rotY: number,
  opacity = 0.7,
) {
  const geo = new THREE.PlaneGeometry(width, height);
  const alpha = makeEdgeFadeAlpha(0.32);
  // Tint toward fog so hard photo edges never read as posters
  const mat = new THREE.MeshBasicMaterial({
    color: 0xa8b4c4,
    transparent: true,
    opacity,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
    alphaMap: alpha,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.rotation.y = rotY;
  mesh.renderOrder = -1;
  group.add(mesh);
  const loader = new THREE.TextureLoader();
  loader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    mat.map = tex;
    mat.color.set(0xdde6f0); // slight cool haze over photo
    mat.needsUpdate = true;
  });
}

type BuildingStyle = 'tower' | 'factory' | 'home' | 'capital' | 'stack';

/** Multi-part steampunk building (decorative, no collision). */
function addBuilding(
  group: THREE.Group,
  mats: Mats,
  x: number,
  z: number,
  w: number,
  h: number,
  d: number,
  style: BuildingStyle,
  yBase = 0,
) {
  const bodyMat =
    style === 'home'
      ? mats.wood
      : style === 'capital'
        ? mats.stone
        : style === 'factory'
          ? mats.iron
          : mats.brassDark;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
  body.position.set(x, yBase + h / 2, z);
  body.castShadow = true;
  group.add(body);

  // Floating underside plate
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(w * 1.15, 0.2, d * 1.15),
    mats.ironDark,
  );
  plate.position.set(x, yBase + 0.05, z);
  group.add(plate);

  // Roof / crown
  if (style === 'tower' || style === 'capital') {
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.85, h * 0.12, d * 0.85),
      mats.brass,
    );
    roof.position.set(x, yBase + h + h * 0.05, z);
    group.add(roof);
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.18, h * 0.35, 6),
      mats.copper,
    );
    spire.position.set(x, yBase + h + h * 0.28, z);
    group.add(spire);
  } else if (style === 'factory' || style === 'stack') {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, 0.25, d * 1.05), mats.ironDark);
    roof.position.set(x, yBase + h + 0.1, z);
    group.add(roof);
    // Smokestacks
    const stacks = style === 'stack' ? 3 : 2;
    for (let i = 0; i < stacks; i++) {
      const sx = x + (i - (stacks - 1) / 2) * (w * 0.28);
      const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.28, h * 0.55, 8),
        mats.ironDark,
      );
      stack.position.set(sx, yBase + h + h * 0.28, z + d * 0.15);
      group.add(stack);
      // Soft steam puff
      const steam = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 6, 6),
        new THREE.MeshBasicMaterial({
          color: 0xc8c4bc,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
      );
      steam.position.set(sx, yBase + h + h * 0.55, z + d * 0.15);
      group.add(steam);
    }
  } else {
    // home roof peak
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.1, 0.35, d * 1.1), mats.copper);
    roof.position.set(x, yBase + h + 0.15, z);
    group.add(roof);
  }

  // Window lights on long faces
  const winMat = mats.emissiveAmber;
  const cols = Math.max(2, Math.floor(w / 0.9));
  const rows = Math.max(2, Math.floor(h / 1.1));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.25) continue; // some dark
      const wx = x - w / 2 + 0.45 + (c / Math.max(1, cols - 1)) * (w - 0.9);
      const wy = yBase + 0.6 + (r / Math.max(1, rows - 1)) * (h - 1.1);
      // Front (+Z) and side windows
      for (const [oz, ox, face] of [
        [d / 2 + 0.04, 0, 'z'],
        [0, w / 2 + 0.04, 'x'],
      ] as const) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.35, 0.06), winMat);
        if (face === 'z') win.position.set(wx, wy, z + oz);
        else {
          win.rotation.y = Math.PI / 2;
          win.position.set(x + ox * (ox > 0 ? 1 : -1), wy, z - d / 2 + 0.45 + (c / Math.max(1, cols - 1)) * (d - 0.9));
        }
        // Only place one set carefully
        if (face === 'z') group.add(win);
      }
      // Side windows simpler
      if (c < Math.max(1, Math.floor(d / 0.9))) {
        const wz = z - d / 2 + 0.45 + (c / Math.max(1, Math.floor(d / 0.9) - 1 || 1)) * (d - 0.9);
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.26), winMat);
        side.position.set(x + w / 2 + 0.03, wy, wz);
        group.add(side);
      }
    }
  }

  // Pipes / braces
  if (style === 'factory' || style === 'tower') {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, h * 0.7, 6), mats.copper);
    pipe.position.set(x + w / 2 + 0.2, yBase + h * 0.4, z);
    group.add(pipe);
  }
  // Support struts under floating base
  for (const sx of [-w * 0.35, w * 0.35]) {
    for (const sz of [-d * 0.35, d * 0.35]) {
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.12, Math.max(0.8, yBase + 1.2), 5),
        mats.iron,
      );
      strut.position.set(x + sx, yBase * 0.5 - 0.2, z + sz);
      group.add(strut);
    }
  }
}

function addSkyBridge(
  group: THREE.Group,
  mats: Mats,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const midX = (x0 + x1) / 2;
  const midZ = (z0 + z1) / 2;
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 0.7), mats.brassDark);
  bridge.position.set(midX, y, midZ);
  bridge.rotation.y = -Math.atan2(dz, dx);
  group.add(bridge);
  // Rail
  const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 0.08), mats.iron);
  rail.position.set(midX, y + 0.25, midZ);
  rail.rotation.y = bridge.rotation.y;
  group.add(rail);
}

/** Dense steampunk city around the outdoor path and workshop flanks. */
function addCityCluster(group: THREE.Group, mats: Mats) {
  // Near workshop flanks (just outside walls)
  addBuilding(group, mats, -14, 4, 3.2, 5.5, 3.5, 'factory', 0);
  addBuilding(group, mats, -15.5, 10, 2.8, 4.2, 2.8, 'home', 0.3);
  addBuilding(group, mats, -13, 15, 3.5, 6.5, 3.2, 'tower', 0);
  addBuilding(group, mats, 14, 3, 3, 5, 3, 'home', 0.2);
  addBuilding(group, mats, 15.5, 9, 3.6, 7, 3.4, 'factory', 0);
  addBuilding(group, mats, 13.5, 15, 2.6, 4.5, 2.8, 'tower', 0.4);

  // Along the dock path sides
  addBuilding(group, mats, -11, 18, 3, 5, 3, 'stack', 0.1);
  addBuilding(group, mats, -12.5, 23, 2.5, 4, 2.5, 'home', 0.5);
  addBuilding(group, mats, -14, 28, 3.8, 6, 3.5, 'factory', 0);
  addBuilding(group, mats, 11, 19, 2.8, 4.8, 2.8, 'home', 0.2);
  addBuilding(group, mats, 12.5, 24, 3.4, 6.2, 3.2, 'tower', 0);
  addBuilding(group, mats, 14, 29, 3, 5.5, 3, 'factory', 0.15);

  // Mid ring — denser skyline
  addBuilding(group, mats, -20, 16, 4.5, 8, 4, 'capital', 0);
  addBuilding(group, mats, -22, 26, 3.5, 6.5, 3.5, 'tower', 0.3);
  addBuilding(group, mats, -18, 34, 4, 7, 4, 'factory', 0);
  addBuilding(group, mats, 20, 15, 4, 7.5, 4, 'tower', 0);
  addBuilding(group, mats, 22, 25, 5, 9, 4.5, 'capital', 0);
  addBuilding(group, mats, 18, 33, 3.5, 6, 3.5, 'stack', 0.2);
  addBuilding(group, mats, -8, 34, 3, 4.5, 3, 'home', 1.2);
  addBuilding(group, mats, 8, 35, 3.2, 5, 3, 'home', 0.8);
  addBuilding(group, mats, 0, 40, 5, 8, 4, 'capital', 0.5);
  addBuilding(group, mats, -26, 22, 3, 5.5, 3, 'factory', 0.4);
  addBuilding(group, mats, 26, 21, 3.2, 6, 3.2, 'tower', 0.2);
  addBuilding(group, mats, -24, 32, 4, 7, 4, 'stack', 0);
  addBuilding(group, mats, 25, 34, 3.8, 6.5, 3.5, 'factory', 0.1);

  // Sky bridges linking neighbors
  addSkyBridge(group, mats, -14, 10, -13, 15, 3.2);
  addSkyBridge(group, mats, 14, 9, 13.5, 15, 3.5);
  addSkyBridge(group, mats, -11, 18, -12.5, 23, 2.8);
  addSkyBridge(group, mats, 11, 19, 12.5, 24, 3.0);
  addSkyBridge(group, mats, -20, 16, -14, 15, 4.0);
  addSkyBridge(group, mats, 20, 15, 15.5, 15, 4.2);
  addSkyBridge(group, mats, -14, 28, -18, 34, 3.5);
  addSkyBridge(group, mats, 14, 29, 18, 33, 3.8);
  addSkyBridge(group, mats, -8, 34, 0, 40, 4.5);
  addSkyBridge(group, mats, 8, 35, 0, 40, 4.5);

  // Small hanging platforms / watch posts near path
  for (const [x, z, y] of [
    [-7.5, 16, 2.2],
    [7.5, 17, 2.0],
    [-8, 26, 2.5],
    [8.2, 27, 2.3],
  ] as [number, number, number][]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 2.2), mats.brass);
    pad.position.set(x, y, z);
    group.add(pad);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, y + 0.4, 6), mats.iron);
    pole.position.set(x, y / 2, z);
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), mats.emissiveAmber);
    lamp.position.set(x, y + 1.1, z);
    group.add(lamp);
    const light = new THREE.PointLight(0xff9944, 0.55, 8);
    light.position.set(x, y + 1.1, z);
    group.add(light);
  }

  // Gear decorations on nearby towers
  for (const [x, y, z, r] of [
    [-13, 5.5, 15, 0.7],
    [13.5, 4.8, 15, 0.55],
    [22, 7, 25, 0.9],
    [-20, 6, 16, 0.65],
  ] as [number, number, number, number][]) {
    const gear = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.15, 12), mats.brass);
    gear.rotation.x = Math.PI / 2;
    gear.position.set(x, y, z);
    group.add(gear);
  }
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
