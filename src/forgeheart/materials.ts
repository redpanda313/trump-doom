import * as THREE from 'three';

/** Shared steampunk materials — readable low-poly brass world. */

export function makeMaterials() {
  const brass = new THREE.MeshStandardMaterial({
    color: 0xb8923a,
    metalness: 0.75,
    roughness: 0.4,
  });
  const brassDark = new THREE.MeshStandardMaterial({
    color: 0x7a6028,
    metalness: 0.8,
    roughness: 0.45,
  });
  const copper = new THREE.MeshStandardMaterial({
    color: 0xb87333,
    metalness: 0.7,
    roughness: 0.35,
  });
  const iron = new THREE.MeshStandardMaterial({
    color: 0x4a4e55,
    metalness: 0.85,
    roughness: 0.5,
  });
  const ironDark = new THREE.MeshStandardMaterial({
    color: 0x2a2e33,
    metalness: 0.9,
    roughness: 0.55,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: 0x6b4a2a,
    metalness: 0.05,
    roughness: 0.85,
  });
  const woodDark = new THREE.MeshStandardMaterial({
    color: 0x4a3218,
    metalness: 0.05,
    roughness: 0.9,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x5a8aaa,
    metalness: 0.2,
    roughness: 0.15,
    transparent: true,
    opacity: 0.55,
  });
  const stone = new THREE.MeshStandardMaterial({
    color: 0x6a6560,
    metalness: 0.1,
    roughness: 0.9,
  });
  const oil = new THREE.MeshStandardMaterial({
    color: 0x2a2410,
    metalness: 0.3,
    roughness: 0.4,
  });
  const emissiveAmber = new THREE.MeshStandardMaterial({
    color: 0xffaa33,
    emissive: 0xff6600,
    emissiveIntensity: 0.6,
    metalness: 0.3,
    roughness: 0.4,
  });
  const emissiveGreen = new THREE.MeshStandardMaterial({
    color: 0x33ff99,
    emissive: 0x00ff66,
    emissiveIntensity: 0.7,
    metalness: 0.2,
    roughness: 0.35,
  });
  const emissiveRed = new THREE.MeshStandardMaterial({
    color: 0xff5533,
    emissive: 0xff2200,
    emissiveIntensity: 0.8,
    metalness: 0.2,
    roughness: 0.35,
  });

  return {
    brass,
    brassDark,
    copper,
    iron,
    ironDark,
    wood,
    woodDark,
    glass,
    stone,
    oil,
    emissiveAmber,
    emissiveGreen,
    emissiveRed,
  };
}

export type Mats = ReturnType<typeof makeMaterials>;

/** Procedural canvas texture for floors with story variation. */
export function makeFloorTexture(kind: 'wood' | 'grate' | 'cobble' | 'brass' | 'oil'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  if (kind === 'wood') {
    g.fillStyle = '#6b4a2a';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      g.fillStyle = y % 32 === 0 ? '#5a3a1a' : '#7a5a32';
      g.fillRect(0, y, 128, 14);
      g.strokeStyle = '#3a2810';
      g.strokeRect(0, y, 128, 14);
    }
  } else if (kind === 'grate') {
    g.fillStyle = '#2a2e33';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#6a7078';
    g.lineWidth = 2;
    for (let i = 0; i < 128; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 128);
      g.moveTo(0, i);
      g.lineTo(128, i);
      g.stroke();
    }
  } else if (kind === 'cobble') {
    g.fillStyle = '#5a5550';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        g.fillStyle = `rgb(${90 + ((x * y) % 20)},${85 + (x % 10)},${75})`;
        g.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
      }
    }
  } else if (kind === 'brass') {
    g.fillStyle = '#8a6a28';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#c4a35a';
    g.fillRect(40, 0, 48, 128);
    g.fillStyle = '#e8d090';
    for (let y = 8; y < 128; y += 24) {
      g.beginPath();
      g.arc(64, y, 3, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    g.fillStyle = '#4a4840';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(30,25,10,0.7)';
    g.beginPath();
    g.ellipse(70, 80, 40, 25, 0.3, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
