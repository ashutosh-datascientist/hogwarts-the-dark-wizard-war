import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { MagicVFX } from './MagicVFX';
import { SpellTier } from './types';

export type DestructibleKind = 'rock' | 'wall' | 'pillar' | 'statue' | 'structure';
export type DestructionSoundKind = 'crack' | 'rock' | 'wall' | 'pillar' | 'statue' | 'ground';

export interface DestructibleObject {
  id: number;
  kind: DestructibleKind;
  x: number;
  z: number;
  radius: number;
  height: number;
  hp: number;
  maxHp: number;
  stage: 0 | 1 | 2 | 3; // 0: intact, 1: cracked, 2: breached/split, 3: destroyed
  group: THREE.Group;
  sections: THREE.Mesh[];
  crackOverlay: THREE.Mesh;
  staticBody: CANNON.Body;
}

interface DynamicDebris {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  age: number;
  settled: boolean;
}

export class DestructibleEnvironment {
  private scene: THREE.Scene;
  private world: CANNON.World;
  private vfx: MagicVFX;

  public readonly items: DestructibleObject[] = [];
  private dynamicDebris: DynamicDebris[] = [];
  private settledRubble: THREE.Mesh[] = [];
  private craters: THREE.Mesh[] = [];
  private nextId = 1;

  private stoneMat: THREE.MeshStandardMaterial;
  private darkStoneMat: THREE.MeshStandardMaterial;
  private crackMat: THREE.MeshStandardMaterial;
  private glassMat: THREE.MeshStandardMaterial;

  private readonly maxDynamicDebris = 42;
  private readonly maxSettledRubble = 110;
  private readonly maxCraters = 28;

  private onSound?: (kind: DestructionSoundKind, intensity: number) => void;

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    vfx: MagicVFX,
    stoneMat: THREE.MeshStandardMaterial,
    darkStoneMat: THREE.MeshStandardMaterial,
    onSound?: (kind: DestructionSoundKind, intensity: number) => void
  ) {
    this.scene = scene;
    this.world = world;
    this.vfx = vfx;
    this.stoneMat = stoneMat;
    this.darkStoneMat = darkStoneMat;
    this.onSound = onSound;

    this.crackMat = new THREE.MeshStandardMaterial({
      color: '#090b0f',
      roughness: 0.95,
      transparent: true,
      opacity: 0.78,
    });
    this.glassMat = new THREE.MeshStandardMaterial({
      color: '#3b648f',
      emissive: '#d97706',
      emissiveIntensity: 0.25,
      roughness: 0.2,
      metalness: 0.35,
    });

    this.populateBattlefield();
  }

  public getIntactCount(): number {
    let count = 0;
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].stage < 3) count++;
    }
    return count;
  }

  public getTotalCount(): number {
    return this.items.length;
  }

  private populateBattlefield(): void {
    // 1. Tall Stone Pillars (6 pre-fractured Gothic pillars)
    const pillars: [number, number][] = [
      [-14.5, -12],
      [14.5, -12],
      [-17, 1],
      [17, 1],
      [-14, 13.5],
      [14, 13.5],
    ];
    pillars.forEach(([x, z]) => this.spawnPillar(x, z));

    // 2. Massive Stone Walls (6 destructible courtyard ruin & parapet walls)
    const walls: [number, number, number][] = [
      [-9.5, -18, 0.22],
      [9.5, -18, -0.22],
      [-9.5, 18, -0.2],
      [9.5, 18, 0.2],
      [-11, -3, 1.32],
      [11, 3, -1.32],
    ];
    walls.forEach(([x, z, rotY]) => this.spawnWall(x, z, rotY));

    // 3. Huge Stone Rocks & Boulders (6 fractured courtyard boulders)
    const boulders: [number, number, number][] = [
      [-21, -8, 1.45],
      [21, -8, 1.6],
      [-21, 9, 1.55],
      [21, 9, 1.4],
      [-5.5, -14.5, 1.25],
      [5.5, 14.5, 1.3],
    ];
    boulders.forEach(([x, z, scale]) => this.spawnBoulder(x, z, scale));

    // 4. Stone Wizard / Gargoyle Statues (4 detailed composite stone statues)
    const statues: [number, number, number][] = [
      [-7.5, -8.5, 0.4],
      [7.5, -8.5, -0.4],
      [-7.5, 8.5, 2.7],
      [7.5, 8.5, -2.7],
    ];
    statues.forEach(([x, z, rotY]) => this.spawnStatue(x, z, rotY));

    // 5. Decorative Courtyard Gothic Window Buttresses & Stone Urns (4 structures)
    const structures: [number, number][] = [
      [-22.5, -1.5],
      [22.5, -1.5],
      [0, -21],
      [0, 21],
    ];
    structures.forEach(([x, z]) => this.spawnDecorativeStructure(x, z));
  }

  private createCrackOverlay(radius: number, height: number): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.96, radius * 1.01, height * 0.6, 8, 1, true),
      this.crackMat
    );
    m.position.y = height * 0.45;
    m.visible = false;
    return m;
  }

  private spawnPillar(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.9, 2.35), this.darkStoneMat);
    plinth.position.y = 0.45;
    plinth.castShadow = true;
    plinth.receiveShadow = true;

    const lowerDrum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.84, 0.92, 3.3, 12),
      this.stoneMat
    );
    lowerDrum.position.y = 2.55;
    lowerDrum.castShadow = true;
    lowerDrum.receiveShadow = true;

    const upperDrum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.76, 0.84, 3.6, 12),
      this.stoneMat
    );
    upperDrum.position.y = 6.0;
    upperDrum.castShadow = true;
    upperDrum.receiveShadow = true;

    const capital = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.72, 2.15), this.darkStoneMat);
    capital.position.y = 8.15;
    capital.castShadow = true;

    const crackOverlay = this.createCrackOverlay(0.95, 5.5);
    group.add(plinth, lowerDrum, upperDrum, capital, crackOverlay);
    this.scene.add(group);

    const staticBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      position: new CANNON.Vec3(x, 4.2, z),
      shape: new CANNON.Cylinder(1.2, 1.2, 8.4, 10),
    });
    this.world.addBody(staticBody);

    this.items.push({
      id: this.nextId++,
      kind: 'pillar',
      x,
      z,
      radius: 1.35,
      height: 8.5,
      hp: 300,
      maxHp: 300,
      stage: 0,
      group,
      sections: [capital, upperDrum, lowerDrum, plinth],
      crackOverlay,
      staticBody,
    });
  }

  private spawnWall(x: number, z: number, rotY: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;

    const baseSection = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.9, 1.15), this.darkStoneMat);
    baseSection.position.y = 0.45;
    baseSection.castShadow = true;
    baseSection.receiveShadow = true;

    const leftMasonry = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.05), this.stoneMat);
    leftMasonry.position.set(-1.35, 1.45, 0);
    leftMasonry.castShadow = true;

    const rightMasonry = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.05), this.stoneMat);
    rightMasonry.position.set(1.35, 1.45, 0);
    rightMasonry.castShadow = true;

    const topCrenel = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.55, 0.95), this.darkStoneMat);
    topCrenel.position.set(0, 2.25, 0);
    topCrenel.castShadow = true;

    const crackOverlay = this.createCrackOverlay(1.2, 2.0);
    crackOverlay.scale.set(2.2, 1, 0.7);
    group.add(baseSection, leftMasonry, rightMasonry, topCrenel, crackOverlay);
    this.scene.add(group);

    const staticBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      position: new CANNON.Vec3(x, 1.2, z),
      shape: new CANNON.Box(new CANNON.Vec3(2.7, 1.2, 0.6)),
    });
    staticBody.quaternion.setFromEuler(0, rotY, 0);
    this.world.addBody(staticBody);

    this.items.push({
      id: this.nextId++,
      kind: 'wall',
      x,
      z,
      radius: 2.35,
      height: 2.5,
      hp: 320,
      maxHp: 320,
      stage: 0,
      group,
      sections: [topCrenel, rightMasonry, leftMasonry, baseSection],
      crackOverlay,
      staticBody,
    });
  }

  private spawnBoulder(x: number, z: number, scale: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const chunkA = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95 * scale, 1), this.stoneMat);
    chunkA.position.set(-0.3 * scale, 0.72 * scale, 0);
    chunkA.castShadow = true;
    chunkA.receiveShadow = true;

    const chunkB = new THREE.Mesh(new THREE.DodecahedronGeometry(0.82 * scale, 1), this.darkStoneMat);
    chunkB.position.set(0.38 * scale, 0.64 * scale, 0.25 * scale);
    chunkB.castShadow = true;

    const topCap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68 * scale, 0), this.stoneMat);
    topCap.position.set(0.05 * scale, 1.32 * scale, -0.1 * scale);
    topCap.castShadow = true;

    const crackOverlay = this.createCrackOverlay(1.1 * scale, 1.5 * scale);
    group.add(chunkA, chunkB, topCap, crackOverlay);
    this.scene.add(group);

    const staticBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      position: new CANNON.Vec3(x, 0.9 * scale, z),
      shape: new CANNON.Sphere(1.25 * scale),
    });
    this.world.addBody(staticBody);

    this.items.push({
      id: this.nextId++,
      kind: 'rock',
      x,
      z,
      radius: 1.45 * scale,
      height: 2.1 * scale,
      hp: 250,
      maxHp: 250,
      stage: 0,
      group,
      sections: [topCap, chunkB, chunkA],
      crackOverlay,
      staticBody,
    });
  }

  private spawnStatue(x: number, z: number, rotY: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;

    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.05, 1.65), this.darkStoneMat);
    pedestal.position.y = 0.525;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.62, 1.7, 10), this.stoneMat);
    torso.position.y = 1.9;
    torso.castShadow = true;

    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.3, 8), this.darkStoneMat);
    staff.position.set(0.55, 2.0, 0.25);
    staff.rotation.z = -0.18;
    staff.castShadow = true;

    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 1), this.stoneMat);
    head.position.y = 2.98;
    head.castShadow = true;

    const crackOverlay = this.createCrackOverlay(0.75, 2.8);
    group.add(pedestal, torso, staff, head, crackOverlay);
    this.scene.add(group);

    const staticBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      position: new CANNON.Vec3(x, 1.6, z),
      shape: new CANNON.Cylinder(0.9, 0.9, 3.2, 8),
    });
    this.world.addBody(staticBody);

    this.items.push({
      id: this.nextId++,
      kind: 'statue',
      x,
      z,
      radius: 1.15,
      height: 3.3,
      hp: 210,
      maxHp: 210,
      stage: 0,
      group,
      sections: [head, staff, torso, pedestal],
      crackOverlay,
      staticBody,
    });
  }

  private spawnDecorativeStructure(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.85, 1.8), this.darkStoneMat);
    base.position.y = 0.425;
    base.castShadow = true;

    const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.1, 0.45), this.stoneMat);
    windowFrame.position.y = 1.9;
    windowFrame.castShadow = true;

    const glassPane = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.5), this.glassMat);
    glassPane.position.y = 1.9;

    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.72, 1.0, 4), this.darkStoneMat);
    finial.rotation.y = Math.PI / 4;
    finial.position.y = 3.45;
    finial.castShadow = true;

    const crackOverlay = this.createCrackOverlay(0.95, 2.8);
    group.add(base, windowFrame, glassPane, finial, crackOverlay);
    this.scene.add(group);

    const staticBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      position: new CANNON.Vec3(x, 1.8, z),
      shape: new CANNON.Box(new CANNON.Vec3(0.95, 1.8, 0.95)),
    });
    this.world.addBody(staticBody);

    this.items.push({
      id: this.nextId++,
      kind: 'structure',
      x,
      z,
      radius: 1.25,
      height: 3.8,
      hp: 150,
      maxHp: 150,
      stage: 0,
      group,
      sections: [glassPane, finial, windowFrame, base],
      crackOverlay,
      staticBody,
    });
  }

  private spawnRigidDebris(
    origin: THREE.Vector3,
    impactDir: THREE.Vector3,
    count: number,
    speed: number,
    chunkScale = 1.0,
    useGlass = false
  ): void {
    for (let i = 0; i < count; i++) {
      // Recycle oldest dynamic body if cap reached
      if (this.dynamicDebris.length >= this.maxDynamicDebris) {
        const oldest = this.dynamicDebris.shift()!;
        this.world.removeBody(oldest.body);
        this.settledRubble.push(oldest.mesh);
        if (this.settledRubble.length > this.maxSettledRubble) {
          const drop = this.settledRubble.shift()!;
          this.scene.remove(drop);
        }
      }

      const sx = (0.22 + Math.random() * 0.36) * chunkScale;
      const sy = (0.18 + Math.random() * 0.3) * chunkScale;
      const sz = (0.22 + Math.random() * 0.36) * chunkScale;

      const geo =
        Math.random() > 0.45
          ? new THREE.DodecahedronGeometry(sx * 0.65, 0)
          : new THREE.BoxGeometry(sx, sy, sz);
      const mat = useGlass && i % 3 === 0 ? this.glassMat : i % 2 === 0 ? this.stoneMat : this.darkStoneMat;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const px = origin.x + (Math.random() - 0.5) * 1.4;
      const py = Math.max(0.4, origin.y + Math.random() * 1.4);
      const pz = origin.z + (Math.random() - 0.5) * 1.4;
      mesh.position.set(px, py, pz);
      this.scene.add(mesh);

      const body = new CANNON.Body({
        mass: 8 * chunkScale,
        position: new CANNON.Vec3(px, py, pz),
        linearDamping: 0.25,
        angularDamping: 0.35,
        shape: new CANNON.Box(new CANNON.Vec3(sx * 0.5, sy * 0.5, sz * 0.5)),
      });

      body.velocity.set(
        impactDir.x * speed * (0.6 + Math.random() * 0.7) + (Math.random() - 0.5) * speed * 0.9,
        2.5 + Math.random() * speed * 0.75,
        impactDir.z * speed * (0.6 + Math.random() * 0.7) + (Math.random() - 0.5) * speed * 0.9
      );
      body.angularVelocity.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14
      );
      this.world.addBody(body);

      this.dynamicDebris.push({
        mesh,
        body,
        age: 0,
        settled: false,
      });
    }
  }

  public spawnGroundCrater(pos: THREE.Vector3, radius: number, glowHex: string): void {
    if (this.craters.length >= this.maxCraters) {
      const old = this.craters.shift()!;
      this.scene.remove(old);
      old.geometry.dispose();
    }

    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
    grad.addColorStop(0, 'rgba(6, 7, 10, 0.95)');
    grad.addColorStop(0.45, 'rgba(18, 22, 30, 0.78)');
    grad.addColorStop(1, 'rgba(10, 12, 16, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Jagged radial fractures
    ctx.strokeStyle = '#030406';
    ctx.lineWidth = 3.2;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.2;
      ctx.beginPath();
      ctx.moveTo(128, 128);
      const midR = 45 + Math.random() * 25;
      ctx.lineTo(128 + Math.cos(a + 0.12) * midR, 128 + Math.sin(a + 0.12) * midR);
      const endR = 92 + Math.random() * 30;
      ctx.lineTo(128 + Math.cos(a - 0.08) * endR, 128 + Math.sin(a - 0.08) * endR);
      ctx.stroke();
    }

    // Subtle magical scorch rim
    ctx.strokeStyle = glowHex;
    ctx.globalAlpha = 0.26;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(128, 128, 52, 0, Math.PI * 2);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const crater = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(pos.x, 0.036, pos.z);
    this.scene.add(crater);
    this.craters.push(crater);
    this.onSound?.('ground', 0.9);
  }

  /**
   * Applies spell impact damage to a hit destructible object based on spell tier:
   * - BASIC: small chips, sparks, cracks appear
   * - MID: large cracks, outer stone section breaks away, small structures/pillars collapse
   * - ULTIMATE: shatters & collapses boulders, walls, pillars, statues + leaves crater & rubble
   */
  public damageObject(
    obj: DestructibleObject,
    tier: SpellTier,
    hitPos: THREE.Vector3,
    impactDir: THREE.Vector3,
    spellColor: string
  ): void {
    if (obj.stage >= 3) return;

    const dmg = tier === 'ULTIMATE' ? 360 : tier === 'MID' ? 140 : 42;
    obj.hp = Math.max(0, obj.hp - dmg);

    if (tier === 'BASIC') {
      this.spawnRigidDebris(hitPos, impactDir, 3, 5.5, 0.55, obj.kind === 'structure');
      this.vfx.spawnBurst(hitPos, spellColor, '#94a3b8', '#2a303c', 12, 6, false);
      this.onSound?.('crack', 0.45);
    } else if (tier === 'MID') {
      this.spawnRigidDebris(hitPos, impactDir, 6, 9.0, 0.95, obj.kind === 'structure');
      this.vfx.spawnBurst(hitPos, spellColor, '#64748b', '#1e242e', 28, 9.5, true, 5.5, false);
      this.onSound?.('crack', 0.85);
    } else {
      this.spawnRigidDebris(hitPos, impactDir, 10, 14.0, 1.35, obj.kind === 'structure');
      this.spawnGroundCrater(new THREE.Vector3(obj.x, 0, obj.z), Math.max(3.0, obj.radius * 1.5), spellColor);
      this.vfx.spawnBurst(hitPos, spellColor, '#475569', '#141820', 55, 13, true, 9.5, false);
    }

    const ratio = obj.hp / obj.maxHp;

    if (obj.hp <= 0) {
      obj.stage = 3;
      obj.crackOverlay.visible = false;
      // Leave base plinth low rubble only, detach upper sections as tumbling debris
      for (let s = 0; s < obj.sections.length - 1; s++) {
        obj.sections[s].visible = false;
      }
      // Leave battered low stump/plinth
      const stump = obj.sections[obj.sections.length - 1];
      stump.scale.set(1.0, 0.42, 1.0);
      stump.position.y *= 0.42;

      this.world.removeBody(obj.staticBody);
      this.spawnRigidDebris(
        new THREE.Vector3(obj.x, 1.2, obj.z),
        impactDir,
        tier === 'ULTIMATE' ? 10 : 7,
        tier === 'ULTIMATE' ? 14 : 9.5,
        1.45,
        obj.kind === 'structure'
      );

      if (obj.kind === 'wall') this.onSound?.('wall', 1.0);
      else if (obj.kind === 'pillar') this.onSound?.('pillar', 1.0);
      else if (obj.kind === 'statue') this.onSound?.('statue', 1.0);
      else this.onSound?.('rock', 1.0);
    } else if (ratio < 0.55 && obj.stage < 2) {
      obj.stage = 2;
      obj.crackOverlay.visible = true;
      // Break off topmost section into physical debris
      if (obj.sections[0]?.visible) {
        obj.sections[0].visible = false;
        this.spawnRigidDebris(
          new THREE.Vector3(obj.x, obj.height * 0.72, obj.z),
          impactDir,
          5,
          8.5,
          1.2,
          obj.kind === 'structure'
        );
      }
      this.onSound?.(obj.kind === 'rock' ? 'rock' : 'crack', 0.8);
    } else if (ratio < 0.92 && obj.stage < 1) {
      obj.stage = 1;
      obj.crackOverlay.visible = true;
    }
  }

  /**
   * Damages all destructibles within blastRadius (e.g. Ultimate explosions / collapses).
   */
  public applyAreaDestruction(
    center: THREE.Vector3,
    blastRadius: number,
    tier: SpellTier,
    spellColor: string
  ): void {
    if (tier === 'ULTIMATE') {
      this.spawnGroundCrater(center, Math.min(5.2, blastRadius * 0.75), spellColor);
    }
    const dir = new THREE.Vector3();
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (item.stage >= 3) continue;
      const dx = item.x - center.x;
      const dz = item.z - center.z;
      const d = Math.hypot(dx, dz);
      if (d <= blastRadius + item.radius) {
        dir.set(dx, 0.25, dz).normalize();
        if (dir.lengthSq() < 0.01) dir.set(0, 0.25, 1);
        this.damageObject(
          item,
          tier,
          new THREE.Vector3(item.x, Math.min(1.8, item.height * 0.5), item.z),
          dir,
          spellColor
        );
      }
    }
  }

  public update(dt: number): void {
    for (let i = this.dynamicDebris.length - 1; i >= 0; i--) {
      const db = this.dynamicDebris[i];
      db.age += dt;
      db.mesh.position.set(db.body.position.x, db.body.position.y, db.body.position.z);
      db.mesh.quaternion.set(
        db.body.quaternion.x,
        db.body.quaternion.y,
        db.body.quaternion.z,
        db.body.quaternion.w
      );

      const speedSq =
        db.body.velocity.x * db.body.velocity.x +
        db.body.velocity.y * db.body.velocity.y +
        db.body.velocity.z * db.body.velocity.z;

      if (db.age > 4.2 || (db.age > 1.2 && speedSq < 0.04)) {
        this.world.removeBody(db.body);
        this.dynamicDebris.splice(i, 1);
        this.settledRubble.push(db.mesh);
        if (this.settledRubble.length > this.maxSettledRubble) {
          const drop = this.settledRubble.shift()!;
          this.scene.remove(drop);
        }
      }
    }
  }

  public reset(): void {
    // Clear previous debris, craters, and static colliders
    for (const db of this.dynamicDebris) {
      this.world.removeBody(db.body);
      this.scene.remove(db.mesh);
    }
    this.dynamicDebris = [];

    for (const r of this.settledRubble) {
      this.scene.remove(r);
    }
    this.settledRubble = [];

    for (const c of this.craters) {
      this.scene.remove(c);
      c.geometry.dispose();
    }
    this.craters = [];

    for (const item of this.items) {
      if (item.stage < 3) {
        this.world.removeBody(item.staticBody);
      }
      this.scene.remove(item.group);
    }
    this.items.length = 0;

    this.populateBattlefield();
  }
}
