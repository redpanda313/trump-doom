/**
 * Brasswork / Steampunk vertical slice entry
 * Branch: feature/steampunk-vertical-slice
 */

import './styles.css';
import { SteampunkGame } from './steampunk/game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const titleScreen = document.getElementById('title-screen')!;
const hud = document.getElementById('hud')!;
const btnNew = document.getElementById('btn-new-game') as HTMLButtonElement;
const btnContinue = document.getElementById('btn-continue') as HTMLButtonElement;
const saveInfo = document.getElementById('save-info')!;

const ctx = canvas.getContext('2d')!;
let game: SteampunkGame | null = null;
let last = 0;
let running = false;
let mouseWired = false;

// Vertical slice: no continue yet
btnContinue.classList.add('hidden');
saveInfo.classList.add('hidden');

function loop(ts: number) {
  if (!running || !game) return;
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
  last = ts;
  game.update(dt);
  game.render();
  requestAnimationFrame(loop);
}

function wireMouse() {
  if (mouseWired) return;
  mouseWired = true;
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) game?.setFireHeld(true);
    if (e.button === 2) game?.setAltHeld(true);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) game?.setFireHeld(false);
    if (e.button === 2) game?.setAltHeld(false);
  });
}

async function startGame() {
  titleScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  game = new SteampunkGame(canvas, ctx);
  wireMouse();
  await game.start();
  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

btnNew.addEventListener('click', () => {
  void startGame();
});
btnNew.textContent = 'ENTER THE FOUNDRY';

console.info(
  '%cBRASSWORK',
  'color:#c4a35a;font-size:16px;font-weight:bold',
  '— Steampunk vertical slice (jump · reprogram · arc wrench)',
);
