import * as THREE from 'three';
import { CharacterController } from './CharacterController';

const _desiredPos = new THREE.Vector3();
const _desiredLook = new THREE.Vector3();
const _avgEnemy = new THREE.Vector3();
const _tempPos = new THREE.Vector3();

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private currentLook = new THREE.Vector3(0, 1.5, 0);
  private shakeIntensity = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  public addShake(amount: number): void {
    this.shakeIntensity = Math.min(1.2, Math.max(this.shakeIntensity, amount));
  }

  public getForwardXZ(out = new THREE.Vector3()): THREE.Vector3 {
    this.camera.getWorldDirection(out);
    out.y = 0;
    if (out.lengthSq() < 0.001) out.set(0, 0, -1);
    return out.normalize();
  }

  public updateTitleOrbit(dt: number, elapsed: number): void {
    const angle = elapsed * 0.14;
    const rad = 21;
    _desiredPos.set(
      Math.sin(angle) * rad,
      6.2 + Math.sin(elapsed * 0.3) * 0.6,
      Math.cos(angle) * rad + 2
    );
    _desiredLook.set(0, 2.2, -8);

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _desiredPos.x, 3, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _desiredPos.y, 3, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _desiredPos.z, 3, dt);
    this.currentLook.lerp(_desiredLook, Math.min(1, dt * 3));
    this.camera.lookAt(this.currentLook);
  }

  public updatePreview(dt: number, targetPos: THREE.Vector3, orbitYaw: number): void {
    const dist = 3.55;
    _desiredPos.set(
      targetPos.x + Math.sin(orbitYaw) * dist,
      targetPos.y + 1.48,
      targetPos.z + Math.cos(orbitYaw) * dist
    );
    _desiredLook.set(targetPos.x, targetPos.y + 1.15, targetPos.z);

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _desiredPos.x, 8, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _desiredPos.y, 8, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _desiredPos.z, 8, dt);
    this.currentLook.lerp(_desiredLook, Math.min(1, dt * 10));
    this.camera.lookAt(this.currentLook);
  }

  public updateTeamIntro(
    dt: number,
    introStep: number,
    allies: CharacterController[],
    enemies: CharacterController[]
  ): void {
    const firstAlly = allies[0]?.getPosition() ?? new THREE.Vector3(0, 0, 10);
    const firstEnemy = enemies[0]?.getPosition() ?? new THREE.Vector3(0, 0, -10);

    if (introStep === 0) {
      // Sweep across opposing team / Dark Arts line-up
      _desiredPos.set(firstEnemy.x + 4.5, 2.8, firstEnemy.z + 6.5);
      _desiredLook.set(0, 1.45, firstEnemy.z);
    } else if (introStep === 1) {
      // Sweep across player team / Dumbledore's Army line-up
      _desiredPos.set(firstAlly.x - 4.5, 2.8, firstAlly.z - 6.5);
      _desiredLook.set(0, 1.45, firstAlly.z);
    } else {
      // Wide courtyard face-off establishing shot showing both full teams
      const teamSpread = Math.max(allies.length, enemies.length);
      _desiredPos.set(11.5 + teamSpread * 1.4, 3.8 + teamSpread * 0.4, 0);
      _desiredLook.set(0, 1.45, 0);
    }

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _desiredPos.x, 4.5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _desiredPos.y, 4.5, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _desiredPos.z, 4.5, dt);
    this.currentLook.lerp(_desiredLook, Math.min(1, dt * 5));
    this.camera.lookAt(this.currentLook);
  }

  public updateTeamDuel(
    dt: number,
    player: CharacterController,
    allies: CharacterController[],
    enemies: CharacterController[],
    clashPos: THREE.Vector3 | null,
    activeCreaturePos: THREE.Vector3 | null,
    shakeEnabled: boolean
  ): void {
    const focusActor = player.isAlive()
      ? player
      : allies.find((a) => a.isAlive()) ?? player;
    const focusPos = focusActor.getPosition(_tempPos);

    // Compute centroid of alive enemies
    let enemyCount = 0;
    _avgEnemy.set(0, 0, 0);
    for (let i = 0; i < enemies.length; i++) {
      if (enemies[i].isAlive()) {
        _avgEnemy.add(enemies[i].getPosition());
        enemyCount++;
      }
    }
    if (enemyCount > 0) {
      _avgEnemy.divideScalar(enemyCount);
    } else {
      _avgEnemy.set(0, 0, -8);
    }

    if (clashPos) {
      const duelAxis = new THREE.Vector3().subVectors(_avgEnemy, focusPos).normalize();
      if (duelAxis.lengthSq() < 0.01) duelAxis.set(0, 0, -1);
      const side = new THREE.Vector3(-duelAxis.z, 0, duelAxis.x);
      _desiredPos
        .copy(clashPos)
        .addScaledVector(side, 9.6)
        .add(new THREE.Vector3(0, 2.8, 0));
      _desiredLook.copy(clashPos).add(new THREE.Vector3(0, 0.35, 0));
    } else {
      const toEnemies = new THREE.Vector3().subVectors(_avgEnemy, focusPos);
      const dist = Math.max(4, toEnemies.length());
      toEnemies.y = 0;
      if (toEnemies.lengthSq() < 0.01) toEnemies.set(0, 0, -1);
      toEnemies.normalize();

      const sideRight = new THREE.Vector3(-toEnemies.z, 0, toEnemies.x);
      const squadCount = allies.length + enemies.length;
      const pullBack = -7.2 - Math.max(0, squadCount - 2) * 0.55 - (activeCreaturePos ? 1.2 : 0);
      const height = 3.8 + Math.min(2.4, dist * 0.06) + Math.max(0, squadCount - 2) * 0.35;

      _desiredPos
        .copy(focusPos)
        .addScaledVector(toEnemies, pullBack)
        .addScaledVector(sideRight, 2.25)
        .add(new THREE.Vector3(0, height, 0));

      _desiredLook
        .lerpVectors(focusPos, _avgEnemy, 0.55)
        .add(new THREE.Vector3(0, 1.55, 0));
      if (activeCreaturePos) {
        _desiredLook.lerp(activeCreaturePos, 0.25);
      }
    }

    // Clamp camera within courtyard bounds so it never clips through outer cliff/arch geometry
    _desiredPos.x = THREE.MathUtils.clamp(_desiredPos.x, -26.0, 26.0);
    _desiredPos.z = THREE.MathUtils.clamp(_desiredPos.z, -26.0, 26.0);
    _desiredPos.y = Math.max(2.4, _desiredPos.y);

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _desiredPos.x, 7.5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _desiredPos.y, 7.5, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _desiredPos.z, 7.5, dt);

    this.currentLook.x = THREE.MathUtils.damp(this.currentLook.x, _desiredLook.x, 9, dt);
    this.currentLook.y = THREE.MathUtils.damp(this.currentLook.y, _desiredLook.y, 9, dt);
    this.currentLook.z = THREE.MathUtils.damp(this.currentLook.z, _desiredLook.z, 9, dt);

    this.camera.lookAt(this.currentLook);

    if (shakeEnabled && this.shakeIntensity > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity * 0.75;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 0.65;
      this.shakeIntensity = THREE.MathUtils.damp(this.shakeIntensity, 0, 10, dt);
    } else {
      this.shakeIntensity = 0;
    }
  }
}
