import * as THREE from 'three';

const _worldPos = new THREE.Vector3();

export class WandController {
  private wandTip: THREE.Object3D;
  private wandLight: THREE.PointLight;
  private chargeGlow = 0;

  constructor(wandTip: THREE.Object3D, primaryColor: string, scene: THREE.Scene) {
    this.wandTip = wandTip;
    this.wandLight = new THREE.PointLight(primaryColor, 0, 7, 2);
    scene.add(this.wandLight);
  }

  public triggerCastFlash(colorHex: string, intensity: number): void {
    this.wandLight.color.set(colorHex);
    this.chargeGlow = Math.max(this.chargeGlow, intensity);
  }

  public getTipWorldPosition(out = new THREE.Vector3()): THREE.Vector3 {
    this.wandTip.getWorldPosition(out);
    return out;
  }

  public update(dt: number): void {
    this.wandTip.getWorldPosition(_worldPos);
    this.wandLight.position.copy(_worldPos);
    this.chargeGlow = THREE.MathUtils.damp(this.chargeGlow, 0, 7.5, dt);
    this.wandLight.intensity = this.chargeGlow;
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.wandLight);
  }
}
