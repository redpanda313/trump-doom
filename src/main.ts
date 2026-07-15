/**
 * Trump Doom — campaign entry
 * Raycaster · Ep 0–1 · Save/Continue · Settings
 */

import './styles.css';
import { Game, type StartMode } from './game/game';
import { hasSave, loadSave, formatSaveTime } from './game/save';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const titleScreen = document.getElementById('title-screen')!;
const hud = document.getElementById('hud')!;
const btnNew = document.getElementById('btn-new-game') as HTMLButtonElement;
const btnContinue = document.getElementById('btn-continue') as HTMLButtonElement;
const saveInfo = document.getElementById('save-info')!;

const ctx = canvas.getContext('2d')!;
let game: Game | null = null;
let last = 0;
let running = false;
let mouseWired = false;

function refreshTitleSaveUi() {
  const save = loadSave();
  if (save && hasSave()) {
    btnContinue.classList.remove('hidden');
    saveInfo.classList.remove('hidden');
    saveInfo.textContent = `Save: ${save.locationLabel} · ${formatSaveTime(save.savedAt)} · Train ${save.player.conversions}`;
  } else {
    btnContinue.classList.add('hidden');
    saveInfo.classList.add('hidden');
    saveInfo.textContent = '';
  }
}

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

async function startGame(mode: StartMode) {
  if (mode === 'new') {
    const ok = !hasSave() || window.confirm('Start a new game? This will overwrite your save.');
    if (!ok) return;
  }

  titleScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  game = new Game(canvas, ctx, mode);
  wireMouse();
  await game.start();
  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

btnNew.addEventListener('click', () => {
  void startGame('new');
});
btnContinue.addEventListener('click', () => {
  void startGame('continue');
});

refreshTitleSaveUi();

console.info(
  '%cTRUMP DOOM',
  'color:#ffd700;font-size:16px;font-weight:bold',
  '— Ep 0–1 campaign. Save/Continue enabled.',
);
