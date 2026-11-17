import * as THREE from 'three';

const _dummy = new THREE.Object3D();

export class RainSystem {
  private readonly maxDrops = 2600;
  private activeDrops = 2600;
  private mesh: THREE.InstancedMesh;
  private dropPositions: Float32Array;
  private dropSpeeds: Float32Array;

  private readonly maxSplashes = 110;
  private splashMesh: THREE.InstancedMesh;
  private splashTimers: Float32Array;
  private splashCoords: Float32Array;

  constructor(scene: THREE.Scene) {
    // 1. Angled rain streaks via InstancedMesh
    const dropGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.25, 4);
    const dropMat = new THREE.MeshBasicMaterial({
      color: 0x9ec5e8,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(dropGeo, dropMat, this.maxDrops);
    this.mesh.frustumCulled = false;

    this.dropPositions = new Float32Array(this.maxDrops * 3);
    this.dropSpeeds = new Float32Array(this.maxDrops);

    for (let i = 0; i < this.maxDrops; i++) {
      this.dropPositions[i * 3] = (Math.random() - 0.5) * 64;
      this.dropPositions[i * 3 + 1] = Math.random() * 28;
      this.dropPositions[i * 3 + 2] = (Math.random() - 0.5) * 64;
      this.dropSpeeds[i] = 28 + Math.random() * 14;
    }
    scene.add(this.mesh);

    // 2. Ground water splash ripples via InstancedMesh
    const splashGeo = new THREE.RingGeometry(0.08, 0.14, 12);
    splashGeo.rotateX(-Math.PI / 2);
    const splashMat = new THREE.MeshBasicMaterial({
      color: 0xb7d9f7,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.splashMesh = new THREE.InstancedMesh(splashGeo, splashMat, this.maxSplashes);
    this.splashMesh.frustumCulled = false;

    this.splashTimers = new Float32Array(this.maxSplashes);
    this.splashCoords = new Float32Array(this.maxSplashes * 2);
    for (let i = 0; i < this.maxSplashes; i++) {
      this.splashTimers[i] = Math.random();
      this.splashCoords[i * 2] = (Math.random() - 0.5) * 50;
      this.splashCoords[i * 2 + 1] = (Math.random() - 0.5) * 50;
    }
    scene.add(this.splashMesh);
  }

  public setDensity(ratio: number): void {
    this.activeDrops = Math.max(400, Math.floor(this.maxDrops * THREE.MathUtils.clamp(ratio, 0.2, 1)));
    this.mesh.count = this.activeDrops;
  }

  public update(dt: number, centerPos: THREE.Vector3): void {
    const windX = 3.8;
    const windZ = -1.6;

    for (let i = 0; i < this.activeDrops; i++) {
      const idx = i * 3;
      let x = this.dropPositions[idx] + windX * dt;
      let y = this.dropPositions[idx + 1] - this.dropSpeeds[i] * dt;
      let z = this.dropPositions[idx + 2] + windZ * dt;

      if (y < 0.2) {
        y = 26 + Math.random() * 4;
        x = centerPos.x + (Math.random() - 0.5) * 58;
        z = centerPos.z + (Math.random() - 0.5) * 58;
      }

      this.dropPositions[idx] = x;
      this.dropPositions[idx + 1] = y;
      this.dropPositions[idx + 2] = z;

      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0.05, 0, -0.14);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    // Ground water splashes
    for (let i = 0; i < this.maxSplashes; i++) {
      this.splashTimers[i] += dt * 3.4;
      if (this.splashTimers[i] >= 1.0) {
        this.splashTimers[i] = 0;
        this.splashCoords[i * 2] = centerPos.x + (Math.random() - 0.5) * 42;
        this.splashCoords[i * 2 + 1] = centerPos.z + (Math.random() - 0.5) * 42;
      }
      const t = this.splashTimers[i];
      const scale = 0.4 + t * 2.1;
      _dummy.position.set(this.splashCoords[i * 2], 0.04, this.splashCoords[i * 2 + 1]);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(scale, 1, scale);
      _dummy.updateMatrix();
      this.splashMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.splashMesh.instanceMatrix.needsUpdate = true;
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    scene.remove(this.splashMesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.splashMesh.geometry.dispose();
    (this.splashMesh.material as THREE.Material).dispose();
  }
}
