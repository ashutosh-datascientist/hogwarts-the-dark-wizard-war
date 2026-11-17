import * as THREE from 'three';
import { AudioManager } from './AudioManager';

export class LightningSystem {
  private flashLight: THREE.DirectionalLight;
  private boltLine: THREE.Line;
  private flashIntensity = 0;
  private nextStrikeTimer = 4.5;
  private boltFade = 0;

  constructor(scene: THREE.Scene) {
    this.flashLight = new THREE.DirectionalLight(0xcbe4ff, 0);
    this.flashLight.position.set(-15, 42, -25);
    scene.add(this.flashLight);

    const boltGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 48, -55),
      new THREE.Vector3(0, 0, -55),
    ]);
    const boltMat = new THREE.LineBasicMaterial({
      color: 0xe6f4ff,
      transparent: true,
      opacity: 0,
    });
    this.boltLine = new THREE.Line(boltGeo, boltMat);
    scene.add(this.boltLine);
  }

  public triggerStrike(audio?: AudioManager): void {
    this.flashIntensity = 4.6 + Math.random() * 2.4;
    this.boltFade = 1.0;

    // Build jagged lightning path above Hogwarts castle
    const startX = (Math.random() - 0.5) * 80;
    const startZ = -48 - Math.random() * 24;
    const pts: THREE.Vector3[] = [];
    const steps = 11;
    let cx = startX;
    for (let i = 0; i <= steps; i++) {
      const y = 52 - (i / steps) * 44;
      cx += (Math.random() - 0.5) * 6.5;
      pts.push(new THREE.Vector3(cx, y, startZ + (Math.random() - 0.5) * 3));
    }
    this.boltLine.geometry.dispose();
    this.boltLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);

    audio?.playThunder(0.8 + Math.random() * 0.4);
  }

  public update(dt: number, audio?: AudioManager): number {
    this.nextStrikeTimer -= dt;
    if (this.nextStrikeTimer <= 0) {
      this.nextStrikeTimer = 5.5 + Math.random() * 8.5;
      this.triggerStrike(audio);
    }

    // Double-flicker decay
    this.flashIntensity = THREE.MathUtils.damp(this.flashIntensity, 0, 11, dt);
    this.flashLight.intensity = this.flashIntensity;

    this.boltFade = THREE.MathUtils.damp(this.boltFade, 0, 14, dt);
    const mat = this.boltLine.material as THREE.LineBasicMaterial;
    mat.opacity = this.boltFade;
    this.boltLine.visible = this.boltFade > 0.03;

    return Math.min(1, this.flashIntensity / 5.0);
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.flashLight);
    scene.remove(this.boltLine);
    this.boltLine.geometry.dispose();
    (this.boltLine.material as THREE.Material).dispose();
  }
}
