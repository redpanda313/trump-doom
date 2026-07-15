/**
 * Trump Doom — entry point
 * Playable shell: title screen + placeholder first-person canvas.
 * Full engine lands in M1 vertical slice.
 */

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const titleScreen = document.getElementById('title-screen')!;
const hud = document.getElementById('hud')!;
const btnStart = document.getElementById('btn-start')!;
const resolveFill = document.getElementById('resolve-fill') as HTMLElement;
const voiceFill = document.getElementById('voice-fill') as HTMLElement;
const weaponName = document.getElementById('weapon-name')!;
const plaqueToast = document.getElementById('plaque-toast')!;

const ctx = canvas.getContext('2d')!;

let running = false;
let resolve = 100;
let voice = 100;
let time = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function showPlaque(text: string) {
  plaqueToast.textContent = text;
  plaqueToast.classList.remove('hidden');
  window.setTimeout(() => plaqueToast.classList.add('hidden'), 4500);
}

function drawPlaceholderFrame(w: number, h: number) {
  // Doom-ish corridor placeholder until raycaster / WebGL lands
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.5);
  sky.addColorStop(0, '#0a1f44');
  sky.addColorStop(1, '#1a1040');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.5);

  const floor = ctx.createLinearGradient(0, h * 0.5, 0, h);
  floor.addColorStop(0, '#2a2e35');
  floor.addColorStop(1, '#12141a');
  ctx.fillStyle = floor;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);

  // Perspective walls
  const pulse = 0.5 + 0.5 * Math.sin(time * 0.8);
  ctx.strokeStyle = `rgba(255, 215, 0, ${0.15 + pulse * 0.1})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const t = i / 8;
    const inset = t * w * 0.35;
    const top = h * 0.5 * t;
    const bot = h - top;
    ctx.beginPath();
    ctx.moveTo(inset, top);
    ctx.lineTo(w - inset, top);
    ctx.lineTo(w - inset, bot);
    ctx.lineTo(inset, bot);
    ctx.closePath();
    ctx.stroke();
  }

  // Fake plaque on far wall
  const pw = 120;
  const ph = 40;
  const px = w / 2 - pw / 2;
  const py = h * 0.38;
  ctx.fillStyle = 'rgba(10, 31, 68, 0.85)';
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeRect(px, py, pw, ph);
  ctx.fillStyle = '#f0e6c8';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('STORY PLAQUE', w / 2, py + 16);
  ctx.fillText('[E] to read', w / 2, py + 30);

  // Weapon hand placeholder
  ctx.fillStyle = '#c4a574';
  ctx.beginPath();
  ctx.moveTo(w * 0.55, h);
  ctx.lineTo(w * 0.62, h * 0.72);
  ctx.lineTo(w * 0.78, h * 0.78);
  ctx.lineTo(w * 0.85, h);
  ctx.fill();

  // Gavel head
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(w * 0.68, h * 0.68, 48, 22);
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(w * 0.7, h * 0.7, 12, 8);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('M0 SHELL — Raycaster / combat arrives in M1', w / 2, 28);
  ctx.fillStyle = 'rgba(255,215,0,0.85)';
  ctx.fillText('WASD soon · Click to lock pointer · E plaque demo', w / 2, 48);
}

function loop(ts: number) {
  if (!running) return;
  time = ts * 0.001;
  const w = window.innerWidth;
  const h = window.innerHeight;

  drawPlaceholderFrame(w, h);

  // Idle regen demo
  voice = Math.min(100, voice + 0.02);
  resolveFill.style.width = `${resolve}%`;
  voiceFill.style.width = `${voice}%`;

  requestAnimationFrame(loop);
}

function startGame() {
  titleScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  running = true;
  weaponName.textContent = 'DEBATE GAVEL';
  showPlaque(
    '“I was always going to be big. The buildings just had to catch up.” — Plaque P01',
  );
  resize();
  requestAnimationFrame(loop);
}

btnStart.addEventListener('click', startGame);

window.addEventListener('resize', () => {
  if (running) resize();
});

window.addEventListener('keydown', (e) => {
  if (!running) return;
  if (e.code === 'KeyE') {
    showPlaque(
      '“The static said President. I believed the static.” — Radio Prophecy (P02)',
    );
  }
  if (e.code === 'KeyF') {
    // demo voice spend
    voice = Math.max(0, voice - 12);
  }
  if (e.code === 'Digit1') weaponName.textContent = 'DEBATE GAVEL';
  if (e.code === 'Digit2') weaponName.textContent = 'MIC DROP';
  if (e.code === 'Digit3') weaponName.textContent = 'FRAMING NAILGUN';
  if (e.code === 'Digit4') weaponName.textContent = 'LOGIC LASER';
});

resize();
console.info('%cTRUMP DOOM', 'color:#ffd700;font-size:16px;font-weight:bold', '— shell ready. See docs/GAME_DESIGN_DOCUMENT.md');
