/**
 * ForgeHeart: Gift of the Brass Gods
 * Separate product from Trump Doom (main branch).
 * Branch: feature/steampunk-vertical-slice
 */

import './styles.css';
import { ForgeHeartGame } from './forgeheart/game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const titleScreen = document.getElementById('title-screen')!;
const hud = document.getElementById('hud')!;
const btnNew = document.getElementById('btn-new-game') as HTMLButtonElement;
const btnContinue = document.getElementById('btn-continue') as HTMLButtonElement;
const saveInfo = document.getElementById('save-info')!;

let game: ForgeHeartGame | null = null;
let running = false;
let mouseWired = false;

btnContinue.classList.add('hidden');
saveInfo.classList.add('hidden');

function loop() {
  if (!running || !game) return;
  game.update();
  requestAnimationFrame(loop);
}

function wireMouse() {
  if (mouseWired) return;
  mouseWired = true;
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) game?.setFireHeld(true);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) game?.setFireHeld(false);
  });
}

async function startGame() {
  titleScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  // Important: do not getContext('2d') — WebGL needs a clean canvas
  game = new ForgeHeartGame(canvas);
  wireMouse();
  await game.start();
  running = true;
  requestAnimationFrame(loop);
}

btnNew.addEventListener('click', () => {
  void startGame();
});
btnNew.textContent = 'ENTER THE WORKSHOP';

console.info(
  '%cForgeHeart',
  'color:#c4a35a;font-size:16px;font-weight:bold',
  '— Gift of the Brass Gods · Brother workshop tutorial',
);
