/** Keyboard + mouse look. Multi-device-ready for future local co-op. */

export type MoveDir = 'forward' | 'back' | 'left' | 'right';

const DOUBLE_TAP_MS = 280;

/**
 * Double-tap a movement key, then keep holding that direction to dash.
 * Tap-tap-hold on W/A/S/D (or arrows).
 */
export class Input {
  readonly keys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  pointerLocked = false;
  firePressed = false;
  altFirePressed = false;
  interactPressed = false;
  pausePressed = false;
  weaponSlot: number | null = null;

  /** Active dash direction while hold continues after double-tap */
  dashDir: MoveDir | null = null;

  private lastTap: Partial<Record<MoveDir, number>> = {};
  private dashHoldKeys: Record<MoveDir, string[]> = {
    forward: ['KeyW', 'ArrowUp'],
    back: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
  };

  constructor(canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      const wasDown = this.keys.has(e.code);
      this.keys.add(e.code);

      if (e.code === 'KeyE') this.interactPressed = true;
      if (e.code === 'Digit1') this.weaponSlot = 1;
      if (e.code === 'Digit2') this.weaponSlot = 2;
      if (e.code === 'Digit3') this.weaponSlot = 3;
      if (e.code === 'Digit4') this.weaponSlot = 4;
      if (e.code === 'Digit5') this.weaponSlot = 5;
      if (e.code === 'Digit6') this.weaponSlot = 6;
      if (e.code === 'Digit7') this.weaponSlot = 7;
      if (e.code === 'KeyQ') this.altFirePressed = true;
      if (e.code === 'Escape' || e.code === 'Tab') {
        e.preventDefault();
        if (!wasDown) this.pausePressed = true;
      }

      if (!wasDown) this.onMoveKeyDown(e.code);

      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.onMoveKeyUp(e.code);
    });

    canvas.addEventListener('click', () => {
      if (!this.pointerLocked) {
        canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) return;
      if (e.button === 0) this.firePressed = true;
      if (e.button === 2) this.altFirePressed = true;
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private codeToDir(code: string): MoveDir | null {
    if (code === 'KeyW' || code === 'ArrowUp') return 'forward';
    if (code === 'KeyS' || code === 'ArrowDown') return 'back';
    if (code === 'KeyA' || code === 'ArrowLeft') return 'left';
    if (code === 'KeyD' || code === 'ArrowRight') return 'right';
    return null;
  }

  private onMoveKeyDown(code: string) {
    const dir = this.codeToDir(code);
    if (!dir) return;
    const now = performance.now();
    const last = this.lastTap[dir] ?? 0;
    if (now - last <= DOUBLE_TAP_MS) {
      this.dashDir = dir;
    }
    this.lastTap[dir] = now;
  }

  private onMoveKeyUp(code: string) {
    const dir = this.codeToDir(code);
    if (!dir) return;
    const stillHeld = this.dashHoldKeys[dir].some((c) => this.keys.has(c));
    if (!stillHeld && this.dashDir === dir) {
      this.dashDir = null;
    }
  }

  /** Call once per frame after reading. */
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.firePressed = false;
    this.altFirePressed = false;
    this.interactPressed = false;
    this.pausePressed = false;
    this.weaponSlot = null;
  }

  axis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  sprinting(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  /** Camera-relative unit dash direction, or null if not dashing. */
  getDashWorldDir(angle: number): { x: number; y: number } | null {
    if (!this.dashDir) return null;
    const keys = this.dashHoldKeys[this.dashDir];
    if (!keys.some((c) => this.keys.has(c))) {
      this.dashDir = null;
      return null;
    }
    const fx = Math.cos(angle);
    const fy = Math.sin(angle);
    const rx = -fy;
    const ry = fx;
    switch (this.dashDir) {
      case 'forward':
        return { x: fx, y: fy };
      case 'back':
        return { x: -fx, y: -fy };
      case 'left':
        return { x: -rx, y: -ry };
      case 'right':
        return { x: rx, y: ry };
    }
  }
}
