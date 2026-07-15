/**
 * Trump Doom — M1 vertical slice entry
 * Classic 2.5D raycaster · Adult Legend Donald · Trump-Train conversions
 */

import { Game } from './game/game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const titleScreen = document.getElementById('title-screen')!;
const hud = document.getElementById('hud')!;
const btnStart = document.getElementById('btn-start') as HTMLButtonElement;

const ctx = canvas.getContext('2d')!;
let game: Game | null = null;
let last = 0;
let running = false;

function loop(ts: number) {
  if (!running || !game) return;
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
  last = ts;
  game.update(dt);
  game.render();
  requestAnimationFrame(loop);
}

async function startGame() {
  titleScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  game = new Game(canvas, ctx);

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) game?.setFireHeld(true);
    if (e.button === 2) game?.setAltHeld(true);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) game?.setFireHeld(false);
    if (e.button === 2) game?.setAltHeld(false);
  });

  await game.start();
  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

btnStart.addEventListener('click', () => {
  void startGame();
});

console.info(
  '%cTRUMP DOOM',
  'color:#ffd700;font-size:16px;font-weight:bold',
  '— M1 raycaster slice. Vision lock: docs/VISION_LOCK.md',
);
