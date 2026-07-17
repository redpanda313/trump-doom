/**
 * ForgeHeart — 3 local save slots.
 * Slot display name = level that was saved (e.g. "Voss Workshop").
 */

export type LevelId = 'workshop' | 'sky_race';

export const LEVEL_NAMES: Record<LevelId, string> = {
  workshop: 'Voss Workshop',
  sky_race: 'Sky City Racetrack',
};

export const SLOT_COUNT = 3;
const PREFIX = 'forgeheart-save-slot-';
const LAST_SLOT_KEY = 'forgeheart-last-slot';

export type TutorialPhaseSave =
  | 'explore'
  | 'rebuild'
  | 'siege'
  | 'breach'
  | 'escape'
  | 'won'
  | 'race';

export interface ForgeSaveData {
  version: 1;
  levelId: LevelId;
  /** Display name of the level at save time */
  levelName: string;
  savedAt: number;
  health: number;
  plasma: number;
  brass: number;
  gears: number;
  wrenchUnlocked: boolean;
  bringElias: boolean;
  tutorialPhase: TutorialPhaseSave;
  raceCheckpoint: number;
  raceFinished: boolean;
  /** Last board camera preference (defaults first person for new games) */
  boardCamMode?: 'first' | 'third';
}

export interface SlotInfo {
  index: number;
  empty: boolean;
  data: ForgeSaveData | null;
  /** Label for UI: level name or "Empty" */
  label: string;
  sublabel: string;
}

function slotKey(i: number) {
  return `${PREFIX}${i}`;
}

export function emptySave(levelId: LevelId = 'workshop'): ForgeSaveData {
  return {
    version: 1,
    levelId,
    levelName: LEVEL_NAMES[levelId],
    savedAt: Date.now(),
    health: 100,
    plasma: 100,
    brass: 0,
    gears: 0,
    wrenchUnlocked: false,
    bringElias: false,
    tutorialPhase: 'explore',
    raceCheckpoint: 0,
    raceFinished: false,
    boardCamMode: 'first',
  };
}

export function readSlot(index: number): ForgeSaveData | null {
  if (index < 0 || index >= SLOT_COUNT) return null;
  try {
    const raw = localStorage.getItem(slotKey(index));
    if (!raw) return null;
    const data = JSON.parse(raw) as ForgeSaveData;
    if (!data || data.version !== 1 || !data.levelId) return null;
    data.levelName = data.levelName || LEVEL_NAMES[data.levelId] || data.levelId;
    if (data.boardCamMode !== 'first' && data.boardCamMode !== 'third') {
      data.boardCamMode = 'first';
    }
    return data;
  } catch {
    return null;
  }
}

export function writeSlot(index: number, data: ForgeSaveData): void {
  if (index < 0 || index >= SLOT_COUNT) return;
  data.savedAt = Date.now();
  data.levelName = LEVEL_NAMES[data.levelId] ?? data.levelName;
  localStorage.setItem(slotKey(index), JSON.stringify(data));
  localStorage.setItem(LAST_SLOT_KEY, String(index));
}

export function clearSlot(index: number): void {
  localStorage.removeItem(slotKey(index));
}

export function getLastSlotIndex(): number | null {
  const raw = localStorage.getItem(LAST_SLOT_KEY);
  if (raw == null) return null;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0 || n >= SLOT_COUNT) return null;
  if (!readSlot(n)) return null;
  return n;
}

export function listSlots(): SlotInfo[] {
  const out: SlotInfo[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const data = readSlot(i);
    if (!data) {
      out.push({
        index: i,
        empty: true,
        data: null,
        label: 'Empty',
        sublabel: `Slot ${i + 1}`,
      });
    } else {
      const when = new Date(data.savedAt);
      const time = when.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      out.push({
        index: i,
        empty: false,
        data,
        label: data.levelName,
        sublabel: `Slot ${i + 1} · ${time}`,
      });
    }
  }
  return out;
}

export function formatLevelProgress(data: ForgeSaveData): string {
  if (data.levelId === 'sky_race') {
    if (data.raceFinished) return 'Racetrack complete';
    return `Racetrack · CP ${data.raceCheckpoint}`;
  }
  const phase = data.tutorialPhase;
  if (phase === 'won' || phase === 'race') return 'Workshop clear';
  if (phase === 'escape' || phase === 'breach') return 'Escape in progress';
  if (phase === 'siege') return 'Under siege';
  if (phase === 'rebuild') return 'Rebuilding Elias';
  return 'In the workshop';
}
