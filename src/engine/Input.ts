// Unified pointer input. One abstraction over mouse, touch, and Space-bar so
// the rest of the game never branches on device. Gameplay code reads the
// press/drag/flick state; it never sees a `TouchEvent` or `MouseEvent`.

interface Sample {
  x: number;
  y: number;
  t: number;
}

export interface PointerRelease {
  /** Total drag from press point, in CSS pixels. */
  dragX: number;
  dragY: number;
  /** How long the pointer was held, in seconds. */
  holdDuration: number;
  /** Flick speed at release, in CSS pixels / second. */
  flickX: number;
  flickY: number;
  flickSpeed: number;
}

export class Input {
  isDown = false;
  /** True while Space is held — a desktop charge shortcut. */
  spaceDown = false;

  readonly position = { x: 0, y: 0 };
  readonly start = { x: 0, y: 0 };
  private startTime = 0;
  private history: Sample[] = [];

  /** Set by consumers to receive semantic events. */
  onDown?: () => void;
  onMove?: () => void;
  onUp?: (release: PointerRelease) => void;
  onSpaceChange?: (down: boolean) => void;

  private readonly el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    el.addEventListener('pointerdown', this.handleDown, { passive: false });
    window.addEventListener('pointermove', this.handleMove, { passive: false });
    window.addEventListener('pointerup', this.handleUp);
    window.addEventListener('pointercancel', this.handleUp);
    window.addEventListener('keydown', this.handleKey);
    window.addEventListener('keyup', this.handleKey);
  }

  get dragX(): number {
    return this.position.x - this.start.x;
  }

  get dragY(): number {
    return this.position.y - this.start.y;
  }

  get holdDuration(): number {
    return this.isDown ? (performance.now() - this.startTime) / 1000 : 0;
  }

  private now(): number {
    return performance.now();
  }

  private handleDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.isDown = true;
    this.position.x = e.clientX;
    this.position.y = e.clientY;
    this.start.x = e.clientX;
    this.start.y = e.clientY;
    this.startTime = this.now();
    this.history = [{ x: e.clientX, y: e.clientY, t: this.startTime }];
    this.onDown?.();
  };

  private handleMove = (e: PointerEvent): void => {
    this.position.x = e.clientX;
    this.position.y = e.clientY;
    if (this.isDown) {
      e.preventDefault();
      this.history.push({ x: e.clientX, y: e.clientY, t: this.now() });
      if (this.history.length > 24) this.history.shift();
      this.onMove?.();
    }
  };

  private handleUp = (e: PointerEvent): void => {
    if (!this.isDown) return;
    this.isDown = false;
    this.position.x = e.clientX;
    this.position.y = e.clientY;
    this.onUp?.(this.computeRelease());
  };

  private handleKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    const down = e.type === 'keydown';
    if (down === this.spaceDown) return;
    this.spaceDown = down;
    this.onSpaceChange?.(down);
  };

  /** Flick velocity from the last ~120ms of pointer history. */
  private computeRelease(): PointerRelease {
    const holdDuration = (this.now() - this.startTime) / 1000;
    let flickX = 0;
    let flickY = 0;
    const last = this.history[this.history.length - 1];
    if (last) {
      const cutoff = last.t - 120;
      let ref = this.history[0];
      for (const s of this.history) {
        if (s.t >= cutoff) {
          ref = s;
          break;
        }
      }
      const dt = (last.t - ref.t) / 1000;
      if (dt > 0.001) {
        flickX = (last.x - ref.x) / dt;
        flickY = (last.y - ref.y) / dt;
      }
    }
    return {
      dragX: this.dragX,
      dragY: this.dragY,
      holdDuration,
      flickX,
      flickY,
      flickSpeed: Math.hypot(flickX, flickY),
    };
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.handleDown);
    window.removeEventListener('pointermove', this.handleMove);
    window.removeEventListener('pointerup', this.handleUp);
    window.removeEventListener('pointercancel', this.handleUp);
    window.removeEventListener('keydown', this.handleKey);
    window.removeEventListener('keyup', this.handleKey);
  }
}
