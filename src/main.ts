/**
 * ForgeHeart: Gift of the Brass Gods
 * Separate product from Trump Doom (main branch).
 * Branch: feature/steampunk-vertical-slice
 */

import './styles.css';
import { ForgeHeartGame } from './forgeheart/game';
import {
  listSlots,
  getLastSlotIndex,
  formatLevelProgress,
  type ForgeSaveData,
} from './forgeheart/save';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const titleScreen = document.getElementById('title-screen')!;
const hud = document.getElementById('hud')!;
const btnNew = document.getElementById('btn-new-game') as HTMLButtonElement;
const btnContinue = document.getElementById('btn-continue') as HTMLButtonElement;
const saveInfo = document.getElementById('save-info')!;
const slotsEl = document.getElementById('save-slots')!;
const pauseMenu = document.getElementById('pause-menu');
const btnSave = document.getElementById('btn-save') as HTMLButtonElement | null;
const btnResume = document.getElementById('btn-resume') as HTMLButtonElement | null;
const btnTitle = document.getElementById('btn-title') as HTMLButtonElement | null;

let game: ForgeHeartGame | null = null;
let running = false;
let mouseWired = false;
/** Selected slot on title (0–2) */
let selectedSlot = getLastSlotIndex() ?? 0;

function refreshSlots() {
  const slots = listSlots();
  const last = getLastSlotIndex();
  slotsEl.innerHTML = '';
  for (const s of slots) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'save-slot' + (s.empty ? ' empty' : '') + (s.index === selectedSlot ? ' selected' : '');
    const name = document.createElement('span');
    name.className = 'slot-name';
    name.textContent = s.empty ? `Slot ${s.index + 1} — Empty` : s.label;
    const meta = document.createElement('span');
    meta.className = 'slot-meta';
    if (s.data) {
      meta.textContent = `${s.sublabel} · ${formatLevelProgress(s.data)}`;
    } else {
      meta.textContent = 'New game will use this slot';
    }
    btn.appendChild(name);
    btn.appendChild(meta);
    btn.addEventListener('click', () => {
      selectedSlot = s.index;
      refreshSlots();
      updateContinueButton();
    });
    slotsEl.appendChild(btn);
  }

  // Prefer last used if still valid
  if (last != null && slots[last] && !slots[last]!.empty && selectedSlot !== last) {
    // keep user selection if they clicked; only set default once via selectedSlot init
  }
  updateContinueButton();
}

function updateContinueButton() {
  const last = getLastSlotIndex();
  const slots = listSlots();
  const contSlot = last != null && slots[last] && !slots[last]!.empty ? last : null;
  const selected = slots[selectedSlot];

  if (contSlot != null) {
    btnContinue.classList.remove('hidden');
    const d = slots[contSlot]!.data!;
    btnContinue.textContent = `CONTINUE — ${d.levelName}`;
  } else if (selected && !selected.empty && selected.data) {
    btnContinue.classList.remove('hidden');
    btnContinue.textContent = `LOAD — ${selected.data.levelName}`;
  } else {
    btnContinue.classList.add('hidden');
  }

  if (selected?.empty) {
    btnNew.textContent = `NEW GAME (Slot ${selectedSlot + 1})`;
    saveInfo.textContent = `Slot ${selectedSlot + 1} is empty · New Game starts Voss Workshop`;
  } else if (selected?.data) {
    btnNew.textContent = `NEW GAME (overwrite Slot ${selectedSlot + 1})`;
    saveInfo.textContent = `Selected: ${selected.label} · New Game overwrites this slot`;
  } else {
    btnNew.textContent = 'NEW GAME';
    saveInfo.textContent = 'Select a slot · New Game · Continue loads last used save';
  }
  saveInfo.classList.remove('hidden');
}

function loop() {
  if (!running || !game) return;
  game.update();
  // Sync pause menu visibility
  if (pauseMenu) {
    if (game.isPaused()) pauseMenu.classList.remove('hidden');
    else pauseMenu.classList.add('hidden');
  }
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

async function startGame(opts: { slot: number; save: ForgeSaveData | null }) {
  titleScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  pauseMenu?.classList.add('hidden');

  // If a previous game exists, try to clean up
  if (game) {
    try {
      game.dispose?.();
    } catch {
      /* ignore */
    }
    game = null;
  }

  game = new ForgeHeartGame(canvas, { slot: opts.slot, save: opts.save });
  wireMouse();
  await game.start();
  running = true;
  requestAnimationFrame(loop);
}

btnNew.addEventListener('click', () => {
  const slots = listSlots();
  const s = slots[selectedSlot];
  if (s && !s.empty) {
    const ok = window.confirm(
      `Overwrite Slot ${selectedSlot + 1} (“${s.label}”) with a new game at Voss Workshop?`,
    );
    if (!ok) return;
  }
  void startGame({ slot: selectedSlot, save: null });
});

btnContinue.addEventListener('click', () => {
  const last = getLastSlotIndex();
  const slots = listSlots();
  let idx = last;
  if (idx == null || !slots[idx] || slots[idx]!.empty) {
    idx = selectedSlot;
  }
  const data = slots[idx!]?.data;
  if (!data) {
    saveInfo.textContent = 'No save in that slot — start a New Game.';
    return;
  }
  selectedSlot = idx!;
  void startGame({ slot: idx!, save: data });
});

btnSave?.addEventListener('click', () => {
  if (!game) return;
  game.saveProgress();
  game.toastPublic?.('Progress saved.');
});

btnResume?.addEventListener('click', () => {
  game?.setPaused(false);
  pauseMenu?.classList.add('hidden');
});

btnTitle?.addEventListener('click', () => {
  if (!game) return;
  const ok = window.confirm('Return to title? Unsaved progress will be lost unless you Save first.');
  if (!ok) return;
  game.saveProgress();
  game.setPaused(false);
  try {
    game.dispose?.();
  } catch {
    /* ignore */
  }
  game = null;
  running = false;
  hud.classList.add('hidden');
  pauseMenu?.classList.add('hidden');
  titleScreen.classList.remove('hidden');
  refreshSlots();
});

refreshSlots();

console.info(
  '%cForgeHeart',
  'color:#c4a35a;font-size:16px;font-weight:bold',
  '— Gift of the Brass Gods · 3 save slots',
);
