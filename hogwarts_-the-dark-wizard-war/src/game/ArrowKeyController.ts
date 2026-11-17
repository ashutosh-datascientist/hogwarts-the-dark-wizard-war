export class ArrowKeyController {
  private held = new Set<string>();
  private dodgeQueued = false;
  private pauseQueued = false;

  private onKeyDown = (e: KeyboardEvent) => {
    if (
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight' ||
      e.code === 'Space'
    ) {
      e.preventDefault();
    }

    if (e.code === 'Space' && !e.repeat) {
      this.dodgeQueued = true;
    }
    if (e.code === 'Escape' && !e.repeat) {
      this.pauseQueued = true;
    }

    this.held.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private onBlur = () => {
    this.held.clear();
    this.dodgeQueued = false;
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  /**
   * Returns movement vector in camera-relative X (right) and Z (forward).
   * Strictly uses ArrowUp, ArrowDown, ArrowLeft, ArrowRight (never WASD).
   */
  public getMoveInput(): { forward: number; right: number; running: boolean } {
    const forward =
      (this.held.has('ArrowUp') ? 1 : 0) - (this.held.has('ArrowDown') ? 1 : 0);
    const right =
      (this.held.has('ArrowRight') ? 1 : 0) - (this.held.has('ArrowLeft') ? 1 : 0);
    const running =
      this.held.has('ShiftLeft') || this.held.has('ShiftRight');

    return { forward, right, running };
  }

  public consumeDodge(): boolean {
    if (this.dodgeQueued) {
      this.dodgeQueued = false;
      return true;
    }
    return false;
  }

  public consumePause(): boolean {
    if (this.pauseQueued) {
      this.pauseQueued = false;
      return true;
    }
    return false;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
