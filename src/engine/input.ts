/** Keyboard + mouse look. Multi-device-ready for future local co-op. */

export class Input {
  readonly keys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  pointerLocked = false;
  firePressed = false;
  altFirePressed = false;
  interactPressed = false;
  weaponSlot: number | null = null;

  constructor(canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.interactPressed = true;
      if (e.code === 'Digit1') this.weaponSlot = 1;
      if (e.code === 'Digit2') this.weaponSlot = 2;
      if (e.code === 'Digit3') this.weaponSlot = 3;
      if (e.code === 'Digit4') this.weaponSlot = 4;
      if (e.code === 'KeyQ') this.altFirePressed = true;
      // prevent page scroll on space/arrows during play
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
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

  /** Call once per frame after reading. */
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.firePressed = false;
    this.altFirePressed = false;
    this.interactPressed = false;
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
}
