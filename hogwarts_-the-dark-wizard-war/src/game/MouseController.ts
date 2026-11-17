import * as THREE from 'three';

export class MouseController {
  private ndc = new THREE.Vector2(0, 0);
  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.1);
  private hitPoint = new THREE.Vector3(0, 1.1, 0);
  private hasMoved = false;

  private rightHeld = false;
  private leftQueued = false;
  private targetEl: HTMLElement | null = null;
  private sensitivity = 1.0;

  public setSensitivity(value: number): void {
    this.sensitivity = THREE.MathUtils.clamp(value, 0.4, 1.8);
  }

  private onPointerMove = (e: PointerEvent) => {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    const rawX = (e.clientX / w) * 2 - 1;
    const rawY = -(e.clientY / h) * 2 + 1;
    this.ndc.x = THREE.MathUtils.clamp(rawX * this.sensitivity, -1, 1);
    this.ndc.y = THREE.MathUtils.clamp(rawY * this.sensitivity, -1, 1);
    this.hasMoved = true;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.targetEl && e.target !== this.targetEl && !this.targetEl.contains(e.target as Node)) {
      return;
    }
    if (e.button === 2) {
      e.preventDefault();
      this.rightHeld = true;
    } else if (e.button === 0) {
      this.leftQueued = true;
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 2) {
      this.rightHeld = false;
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onBlur = () => {
    this.rightHeld = false;
    this.leftQueued = false;
  };

  public attach(element: HTMLElement): void {
    this.targetEl = element;
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    element.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('blur', this.onBlur);
  }

  public isShieldHeld(): boolean {
    return this.rightHeld;
  }

  public consumeLeftClick(): boolean {
    if (this.leftQueued) {
      this.leftQueued = false;
      return true;
    }
    return false;
  }

  public getAimWorldPoint(camera: THREE.Camera, fallbackTarget: THREE.Vector3): THREE.Vector3 {
    if (!this.hasMoved) {
      return fallbackTarget;
    }
    this.raycaster.setFromCamera(this.ndc, camera);
    const hit = this.raycaster.ray.intersectPlane(this.aimPlane, this.hitPoint);
    if (!hit) return fallbackTarget;
    return this.hitPoint;
  }

  public dispose(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    if (this.targetEl) {
      this.targetEl.removeEventListener('contextmenu', this.onContextMenu);
    }
    window.removeEventListener('blur', this.onBlur);
  }
}
