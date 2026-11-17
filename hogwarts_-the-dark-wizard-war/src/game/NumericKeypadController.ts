import { SpellTier } from './types';

export class NumericKeypadController {
  private queuedTier: SpellTier | null = null;
  private clashSurgeCount = 0;

  private onKeyDown = (e: KeyboardEvent) => {
    // Physical KeyboardEvent.code guarantees Numpad1/2/3 work regardless of NumLock ON or OFF,
    // and remain completely distinct from top-row Digit1/2/3 and Arrow keys.
    if (e.code === 'Numpad1') {
      e.preventDefault();
      if (!e.repeat) {
        this.queuedTier = 'BASIC';
        this.clashSurgeCount++;
      }
    } else if (e.code === 'Numpad2') {
      e.preventDefault();
      if (!e.repeat) {
        this.queuedTier = 'MID';
        this.clashSurgeCount += 2;
      }
    } else if (e.code === 'Numpad3') {
      e.preventDefault();
      if (!e.repeat) {
        this.queuedTier = 'ULTIMATE';
        this.clashSurgeCount += 3;
      }
    }
  };

  private onBlur = () => {
    this.queuedTier = null;
    this.clashSurgeCount = 0;
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('blur', this.onBlur);
  }

  public consumeSpellCast(): SpellTier | null {
    const tier = this.queuedTier;
    this.queuedTier = null;
    return tier;
  }

  public consumeClashSurges(): number {
    const count = this.clashSurgeCount;
    this.clashSurgeCount = 0;
    return count;
  }

  public clear(): void {
    this.queuedTier = null;
    this.clashSurgeCount = 0;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('blur', this.onBlur);
  }
}
