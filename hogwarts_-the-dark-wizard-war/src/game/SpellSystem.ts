import * as THREE from 'three';
import { SpellDefinition } from './types';
import { MagicVFX } from './MagicVFX';

export interface ActiveProjectile {
  id: number;
  team: 'ally' | 'enemy';
  ownerId: number;
  powerRating: number;
  spell: SpellDefinition;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  group: THREE.Group;
  plasmaMat: THREE.ShaderMaterial;
  lightningLine: THREE.Line;
  age: number;
  maxLife: number;
  trailTimer: number;
}

export class SpellSystem {
  private scene: THREE.Scene;
  private vfx: MagicVFX;
  public projectiles: ActiveProjectile[] = [];
  private nextId = 1;

  constructor(scene: THREE.Scene, vfx: MagicVFX) {
    this.scene = scene;
    this.vfx = vfx;
  }

  public spawnProjectile(
    team: 'ally' | 'enemy',
    ownerId: number,
    powerRating: number,
    spell: SpellDefinition,
    origin: THREE.Vector3,
    target: THREE.Vector3
  ): ActiveProjectile {
    const dir = new THREE.Vector3().subVectors(target, origin);
    dir.y = 0; // Keep duel projectiles along horizontal combat plane for crisp skillshots & clashes
    if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
    dir.normalize();

    const { group, plasmaMat, lightningLine } = this.vfx.createProjectileVisual(spell);
    group.position.set(origin.x, 1.25, origin.z);
    group.lookAt(origin.x + dir.x, 1.25, origin.z + dir.z);
    this.scene.add(group);

    // Muzzle burst
    this.vfx.spawnBurst(
      group.position,
      spell.primaryColor,
      spell.secondaryColor,
      spell.smokeColor,
      spell.tier === 'ULTIMATE' ? 35 : 14,
      spell.tier === 'ULTIMATE' ? 9 : 5,
      spell.tier === 'ULTIMATE',
      5.5,
      false
    );

    const proj: ActiveProjectile = {
      id: this.nextId++,
      team,
      ownerId,
      powerRating,
      spell,
      pos: group.position.clone(),
      dir,
      group,
      plasmaMat,
      lightningLine,
      age: 0,
      maxLife: 2.6,
      trailTimer: 0,
    };
    this.projectiles.push(proj);
    return proj;
  }

  public removeProjectile(index: number): void {
    const proj = this.projectiles[index];
    if (!proj) return;
    this.scene.remove(proj.group);
    proj.plasmaMat.dispose();
    this.projectiles.splice(index, 1);
  }

  public clearAll(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.removeProjectile(i);
    }
  }

  public update(dt: number, elapsed: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      if (p.age >= p.maxLife || Math.abs(p.pos.x) > 32 || Math.abs(p.pos.z) > 32) {
        this.removeProjectile(i);
        continue;
      }

      p.pos.addScaledVector(p.dir, p.spell.speed * dt);
      p.group.position.copy(p.pos);
      p.group.rotation.z += dt * 9.5;
      p.plasmaMat.uniforms.uTime.value = elapsed;

      // Jitter lightning halo vertices
      const attr = p.lightningLine.geometry.attributes.position as THREE.BufferAttribute;
      const scale = p.spell.tier === 'ULTIMATE' ? 1.85 : p.spell.tier === 'MID' ? 1.15 : 0.72;
      for (let v = 0; v < attr.count; v++) {
        const a = (v / attr.count) * Math.PI * 2 + elapsed * 12;
        const r = (0.4 + Math.random() * 0.45) * scale;
        attr.setXYZ(v, Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 0.9);
      }
      attr.needsUpdate = true;

      p.trailTimer += dt;
      if (p.trailTimer >= 0.03) {
        p.trailTimer = 0;
        this.vfx.spawnTrailSmoke(p.pos, p.spell);
      }
    }
  }
}
