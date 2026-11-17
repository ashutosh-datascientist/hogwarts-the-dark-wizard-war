import * as THREE from 'three';
import { CharacterController } from './CharacterController';
import { CharacterDefinition, CreatureType, SpellDefinition } from './types';
import { MagicVFX } from './MagicVFX';
import { AudioManager } from './AudioManager';
import { HealthSystem } from './HealthSystem';
import { DestructibleEnvironment } from './DestructibleEnvironment';

interface CreatureVisualParts {
  root: THREE.Group;
  portalRing: THREE.Mesh;
  leftWing?: THREE.Object3D;
  rightWing?: THREE.Object3D;
  legs: THREE.Object3D[];
  segments: THREE.Object3D[];
  swarmBirds: THREE.Object3D[];
  jaw?: THREE.Object3D;
  hood?: THREE.Object3D;
  rings: THREE.Object3D[];
  coreMat: THREE.MeshStandardMaterial;
  accentMat: THREE.MeshBasicMaterial;
}

interface ActiveCreature {
  id: number;
  ownerTeam: 'ally' | 'enemy';
  caster: CharacterController;
  spell: SpellDefinition;
  targetFighter: CharacterController | null;
  targetPos: THREE.Vector3;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  phase: 'CHARGE' | 'EMERGE' | 'TRAVEL' | 'STRIKE' | 'DISSOLVE';
  age: number;
  phaseTimer: number;
  cryPlayed: boolean;
  moveSoundPlayed: boolean;
  damageApplied: boolean;
  visual: CreatureVisualParts;
}

export interface CreatureEvents {
  hitstopMs: number;
  shakeAmount: number;
}

export class CreatureUltimateSystem {
  private scene: THREE.Scene;
  private vfx: MagicVFX;
  private audio: AudioManager;
  private active: ActiveCreature[] = [];
  private nextId = 1;

  constructor(scene: THREE.Scene, vfx: MagicVFX, audio: AudioManager) {
    this.scene = scene;
    this.vfx = vfx;
    this.audio = audio;
  }

  public getActiveNames(): string[] {
    return this.active
      .filter((c) => c.phase !== 'DISSOLVE')
      .map((c) => `${c.caster.def.name}: ${c.spell.name}`);
  }

  public getPrimaryCreaturePosition(out = new THREE.Vector3()): THREE.Vector3 | null {
    for (let i = 0; i < this.active.length; i++) {
      const c = this.active[i];
      if (c.phase === 'TRAVEL' || c.phase === 'STRIKE') {
        out.copy(c.pos);
        return out;
      }
    }
    return null;
  }

  public summonCreature(
    caster: CharacterController,
    ownerTeam: 'ally' | 'enemy',
    aimPoint: THREE.Vector3,
    targetFighter: CharacterController | null
  ): void {
    const spell = caster.def.spells.ultimate;
    const origin = caster.wand.getTipWorldPosition();
    const targetPos = targetFighter ? targetFighter.getPosition() : aimPoint.clone();
    targetPos.y = 1.25;

    const dir = new THREE.Vector3().subVectors(targetPos, origin);
    dir.y = 0;
    if (dir.lengthSq() < 0.01) {
      const yaw = caster.rig.root.rotation.y;
      dir.set(Math.sin(yaw), 0, Math.cos(yaw));
    }
    dir.normalize();

    const visual = this.buildCreatureModel(caster.def.ultimateCreature, caster.def, spell);
    visual.root.position.copy(origin);
    visual.root.lookAt(origin.x + dir.x, origin.y, origin.z + dir.z);
    visual.root.scale.setScalar(0.22);
    visual.root.visible = false; // Appears on wand release thrust after voice & charge begin
    this.scene.add(visual.root);

    // Initial wand charge gathering sparks
    this.vfx.spawnBurst(
      origin,
      spell.primaryColor,
      spell.secondaryColor,
      spell.smokeColor,
      18,
      4.2,
      false,
      0,
      false
    );

    this.active.push({
      id: this.nextId++,
      ownerTeam,
      caster,
      spell,
      targetFighter,
      targetPos,
      pos: origin.clone(),
      dir,
      phase: 'CHARGE',
      age: 0,
      phaseTimer: 0,
      cryPlayed: false,
      moveSoundPlayed: false,
      damageApplied: false,
      visual,
    });
  }

  private buildCreatureModel(
    type: CreatureType,
    def: CharacterDefinition,
    spell: SpellDefinition
  ): CreatureVisualParts {
    const root = new THREE.Group();
    const legs: THREE.Object3D[] = [];
    const segments: THREE.Object3D[] = [];
    const swarmBirds: THREE.Object3D[] = [];
    const rings: THREE.Object3D[] = [];

    const isDark = def.faction === 'DARK_ARTS';
    const coreMat = new THREE.MeshStandardMaterial({
      color: isDark ? '#0b0e12' : spell.secondaryColor,
      emissive: spell.primaryColor,
      emissiveIntensity: isDark ? 0.72 : 1.05,
      roughness: isDark ? 0.38 : 0.25,
      metalness: isDark ? 0.42 : 0.18,
      transparent: true,
      opacity: 0.96,
    });
    const accentMat = new THREE.MeshBasicMaterial({
      color: spell.primaryColor,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const eyeMat = new THREE.MeshBasicMaterial({
      color: isDark ? '#ff2d2d' : '#ffffff',
    });

    // Wand emergence portal ring
    const portalRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.08, 10, 32),
      accentMat
    );
    portalRing.position.z = -0.3;
    root.add(portalRing);

    let leftWing: THREE.Object3D | undefined;
    let rightWing: THREE.Object3D | undefined;
    let jaw: THREE.Object3D | undefined;
    let hood: THREE.Object3D | undefined;

    if (
      type === 'phoenix_eternal_fire' ||
      type === 'arcane_silver_owl' ||
      type === 'ice_wraith_dragon'
    ) {
      // Winged aerial beasts (Phoenix / Owl / Ice Wraith Dragon)
      const isDragon = type === 'ice_wraith_dragon';
      const isPhoenix = type === 'phoenix_eternal_fire';
      const bodyLen = isDragon ? 2.6 : 1.65;

      const torso = new THREE.Mesh(
        new THREE.ConeGeometry(isDragon ? 0.55 : 0.42, bodyLen, 10),
        coreMat
      );
      torso.rotation.x = Math.PI / 2;
      root.add(torso);

      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.3, isDragon ? 1.15 : 0.6, 8),
        coreMat
      );
      neck.position.set(0, 0.35, bodyLen * 0.42);
      neck.rotation.x = 0.5;
      root.add(neck);

      const head = new THREE.Mesh(
        isDragon ? new THREE.BoxGeometry(0.48, 0.38, 0.72) : new THREE.SphereGeometry(0.28, 10, 10),
        coreMat
      );
      head.position.set(0, isDragon ? 0.85 : 0.6, bodyLen * 0.68);
      root.add(head);

      // Eyes
      [-0.14, 0.14].forEach((ex) => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
        eye.position.set(ex, head.position.y + 0.04, head.position.z + 0.24);
        root.add(eye);
      });

      if (isDragon) {
        // Jagged dragon horns + frost jaw
        [-0.18, 0.18].forEach((hx) => {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.55, 6), accentMat);
          horn.position.set(hx, head.position.y + 0.3, head.position.z - 0.15);
          horn.rotation.x = -0.5;
          root.add(horn);
        });
        jaw = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.55), accentMat);
        jaw.position.set(0, head.position.y - 0.18, head.position.z + 0.08);
        root.add(jaw);
      } else {
        // Beak + crest
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), accentMat);
        beak.rotation.x = Math.PI / 2;
        beak.position.set(0, head.position.y - 0.03, head.position.z + 0.32);
        root.add(beak);
      }

      // Articulated Left & Right Wings
      const wingSpan = isDragon ? 3.5 : isPhoenix ? 3.2 : 2.5;
      const makeWing = (side: number) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.32, 0.18, 0.1);
        const shape = new THREE.Shape();
        shape.moveTo(0, 0.25);
        shape.quadraticCurveTo(side * wingSpan * 0.45, 0.9, side * wingSpan, 0.35);
        shape.quadraticCurveTo(side * wingSpan * 0.65, -0.55, side * 0.2, -0.45);
        const featherMesh = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshBasicMaterial({
            color: spell.primaryColor,
            transparent: true,
            opacity: 0.78,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        featherMesh.rotation.x = Math.PI / 2;
        const spar = new THREE.Mesh(
          new THREE.BoxGeometry(wingSpan * 0.85, 0.09, 0.12),
          coreMat
        );
        spar.position.x = side * wingSpan * 0.42;
        pivot.add(featherMesh, spar);
        root.add(pivot);
        return pivot;
      };
      leftWing = makeWing(-1);
      rightWing = makeWing(1);

      // Articulated tail plumes
      for (let t = 0; t < 4; t++) {
        const tailSeg = new THREE.Mesh(
          new THREE.ConeGeometry(0.22 - t * 0.03, 0.9, 6),
          t % 2 === 0 ? accentMat : coreMat
        );
        tailSeg.rotation.x = -Math.PI / 2;
        tailSeg.position.set(0, 0.05, -0.9 - t * 0.55);
        root.add(tailSeg);
        segments.push(tailSeg);
      }
    } else if (
      type === 'giant_black_serpent' ||
      type === 'shadow_serpent' ||
      type === 'dark_mark_serpent'
    ) {
      // Articulated Multi-Segment Giant Serpents (10-12 segments + fangs + cobra hood)
      const isGiant = type === 'giant_black_serpent';
      const segCount = isGiant ? 12 : 10;
      const headScale = isGiant ? 1.45 : 1.05;

      const headGroup = new THREE.Group();
      headGroup.position.set(0, 0.55, 1.35);
      const skull = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.48 * headScale, 1),
        coreMat
      );
      skull.scale.set(1.0, 0.78, 1.45);
      headGroup.add(skull);

      // Glowing serpent eyes
      [-0.22 * headScale, 0.22 * headScale].forEach((ex) => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 6), eyeMat);
        eye.position.set(ex, 0.14 * headScale, 0.42 * headScale);
        headGroup.add(eye);
      });

      // Lower jaw + twin glowing fangs
      jaw = new THREE.Group();
      jaw.position.set(0, -0.14 * headScale, 0.25 * headScale);
      const lowerJaw = new THREE.Mesh(
        new THREE.BoxGeometry(0.44 * headScale, 0.12 * headScale, 0.6 * headScale),
        coreMat
      );
      jaw.add(lowerJaw);
      [-0.14 * headScale, 0.14 * headScale].forEach((fx) => {
        const fang = new THREE.Mesh(
          new THREE.ConeGeometry(0.045, 0.34 * headScale, 5),
          accentMat
        );
        fang.rotation.x = Math.PI;
        fang.position.set(fx, 0.18 * headScale, 0.3 * headScale);
        headGroup.add(fang);
      });
      headGroup.add(jaw);

      // Cobra Hood (especially dramatic on Voldemort's Giant Black Serpent)
      hood = new THREE.Mesh(
        new THREE.ConeGeometry(isGiant ? 1.25 : 0.78, 1.45, 6),
        new THREE.MeshStandardMaterial({
          color: '#050708',
          emissive: spell.primaryColor,
          emissiveIntensity: 0.45,
          roughness: 0.5,
          side: THREE.DoubleSide,
        })
      );
      hood.scale.set(1.35, 1, 0.3);
      hood.position.set(0, -0.1, -0.35);
      headGroup.add(hood);

      root.add(headGroup);
      segments.push(headGroup);

      if (type === 'dark_mark_serpent') {
        // Floating emerald Dark Mark Skull behind the serpent
        const markRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.15, 0.08, 8, 24),
          accentMat
        );
        markRing.position.set(0, 0.9, 0.5);
        root.add(markRing);
        rings.push(markRing);
      }

      for (let s = 1; s < segCount; s++) {
        const radius = Math.max(0.12, (0.48 - s * 0.032) * headScale);
        const seg = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 10, 8),
          s % 3 === 0 ? accentMat : coreMat
        );
        seg.scale.set(1.0, 0.88, 1.35);
        seg.position.set(0, 0.38, 1.2 - s * 0.58);
        root.add(seg);
        segments.push(seg);
      }
    } else if (type === 'infernal_raven_swarm') {
      // Bellatrix's 9-bird Infernal Raven Swarm + central Dread Raven core
      for (let b = 0; b < 9; b++) {
        const bird = new THREE.Group();
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.72, 6), coreMat);
        body.rotation.x = Math.PI / 2;
        const lWing = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.04, 0.25), coreMat);
        lWing.position.set(-0.36, 0.05, 0);
        const rWing = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.04, 0.25), coreMat);
        rWing.position.set(0.36, 0.05, 0);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 5), eyeMat);
        eye.position.set(0, 0.08, 0.34);
        bird.add(body, lWing, rWing, eye);

        const ang = (b / 9) * Math.PI * 2;
        const rad = b === 0 ? 0 : 1.45;
        bird.position.set(Math.cos(ang) * rad, Math.sin(b * 1.4) * 0.55, Math.sin(ang) * rad);
        if (b === 0) bird.scale.setScalar(1.85);
        root.add(bird);
        swarmBirds.push(bird);
      }
    } else if (type === 'ancient_thorn_guardian') {
      // Neville's Towering Enchanted Thorn-Tree Sentinel
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 2.5, 9), coreMat);
      trunk.position.y = 0.8;
      const coreHeart = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), accentMat);
      coreHeart.position.set(0, 1.1, 0.45);
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), coreMat);
      crown.position.y = 2.25;
      root.add(trunk, coreHeart, crown);

      [-1, 1].forEach((side) => {
        const arm = new THREE.Group();
        arm.position.set(side * 0.85, 1.5, 0);
        const branch = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.5, 0.35), coreMat);
        branch.position.set(side * 0.3, -0.4, 0.45);
        branch.rotation.x = -0.6;
        const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.75, 5), accentMat);
        thorn.position.set(side * 0.35, -0.95, 0.85);
        thorn.rotation.x = Math.PI / 2;
        arm.add(branch, thorn);
        root.add(arm);
        legs.push(arm);
      });
    } else if (type === 'house_elf_cosmic_guardian') {
      // Dobby's Liberating Golden-Cyan Cosmic Guardian
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.52, 1.35, 10), coreMat);
      torso.position.y = 0.4;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), coreMat);
      head.position.y = 1.35;
      root.add(torso, head);

      [-1, 1].forEach((side) => {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.88, 6), accentMat);
        ear.position.set(side * 0.65, 1.45, 0);
        ear.rotation.z = -side * 1.15;
        root.add(ear);

        const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), accentMat);
        fist.position.set(side * 0.9, 0.6, 0.7);
        root.add(fist);
        legs.push(fist);
      });

      for (let r = 0; r < 3; r++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.95 + r * 0.38, 0.055, 8, 28),
          accentMat
        );
        ring.position.y = 0.75;
        ring.rotation.set(r * 0.6, r * 0.9, 0);
        root.add(ring);
        rings.push(ring);
      }
    } else {
      // Quadruped Spectral Beasts (Ancient Cat, Blue Stag, Black Hound, Moonlit Wolf, Crimson Fire Horse, Flaming Jack Russell)
      const isStag = type === 'blue_stag';
      const isHorse = type === 'crimson_fire_horse';
      const isSmall = type === 'flaming_jack_russell' || type === 'ancient_cat';
      const bScale = isHorse || isStag ? 1.25 : isSmall ? 0.85 : 1.08;

      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.38 * bScale, 1.35 * bScale, 6, 12),
        coreMat
      );
      body.rotation.x = Math.PI / 2;
      body.position.y = 0.5 * bScale;
      root.add(body);

      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2 * bScale, 0.32 * bScale, 0.75 * bScale, 8),
        coreMat
      );
      neck.position.set(0, 0.95 * bScale, 0.68 * bScale);
      neck.rotation.x = 0.48;
      root.add(neck);

      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.42 * bScale, 0.38 * bScale, 0.62 * bScale),
        coreMat
      );
      head.position.set(0, 1.32 * bScale, 0.98 * bScale);
      root.add(head);

      [-0.14 * bScale, 0.14 * bScale].forEach((ex) => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
        eye.position.set(ex, head.position.y + 0.05, head.position.z + 0.3);
        root.add(eye);
      });

      if (isStag) {
        // Branching Luminous Antlers
        [-1, 1].forEach((side) => {
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.1, 6), accentMat);
          beam.position.set(side * 0.32, 1.85 * bScale, 0.85 * bScale);
          beam.rotation.z = -side * 0.45;
          beam.rotation.x = -0.25;
          const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.55, 5), accentMat);
          tine.position.set(side * 0.45, 2.05 * bScale, 1.05 * bScale);
          tine.rotation.x = 0.55;
          root.add(beam, tine);
        });
      } else {
        // Ears
        [-0.16 * bScale, 0.16 * bScale].forEach((ex) => {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 5), accentMat);
          ear.position.set(ex, head.position.y + 0.28 * bScale, head.position.z - 0.12);
          if (type === 'flaming_jack_russell') ear.rotation.x = 0.8; // Floppy terrier ears
          root.add(ear);
        });
      }

      // 4 Articulated Legs
      const legCoords: [number, number][] = [
        [-0.28 * bScale, 0.55 * bScale],
        [0.28 * bScale, 0.55 * bScale],
        [-0.28 * bScale, -0.55 * bScale],
        [0.28 * bScale, -0.55 * bScale],
      ];
      legCoords.forEach(([lx, lz]) => {
        const legPivot = new THREE.Group();
        legPivot.position.set(lx, 0.38 * bScale, lz);
        const legMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09 * bScale, 0.06 * bScale, 0.82 * bScale, 7),
          accentMat
        );
        legMesh.position.y = -0.36 * bScale;
        legPivot.add(legMesh);
        root.add(legPivot);
        legs.push(legPivot);
      });

      // Flowing tail
      const tail = new THREE.Mesh(
        new THREE.ConeGeometry(0.14 * bScale, 0.95 * bScale, 6),
        accentMat
      );
      tail.rotation.x = -Math.PI / 2.4;
      tail.position.set(0, 0.55 * bScale, -1.05 * bScale);
      root.add(tail);
      segments.push(tail);
    }

    // Creature point light for wet courtyard reflections
    const glow = new THREE.PointLight(spell.primaryColor, 5.5, 16, 2);
    glow.position.set(0, 0.6, 0.4);
    root.add(glow);

    return {
      root,
      portalRing,
      leftWing,
      rightWing,
      legs,
      segments,
      swarmBirds,
      jaw,
      hood,
      rings,
      coreMat,
      accentMat,
    };
  }

  private animateCreature(c: ActiveCreature, dt: number): void {
    const v = c.visual;
    const t = c.age;

    v.portalRing.rotation.z += dt * 4.5;
    v.portalRing.visible = c.phase === 'EMERGE';

    if (v.leftWing && v.rightWing) {
      const flap = Math.sin(t * 14) * (c.phase === 'STRIKE' ? 0.95 : 0.65);
      v.leftWing.rotation.z = flap;
      v.rightWing.rotation.z = -flap;
    }

    for (let i = 0; i < v.legs.length; i++) {
      const phaseOffset = i % 2 === 0 ? 0 : Math.PI;
      const frontRear = i < 2 ? 0 : 0.65;
      v.legs[i].rotation.x = Math.sin(t * 18 + phaseOffset + frontRear) * 0.72;
    }

    // Undulate serpent / tail segments
    for (let s = 0; s < v.segments.length; s++) {
      const seg = v.segments[s];
      if (s === 0 && v.hood) {
        // Serpent head sway + hood flare during strike
        seg.position.x = Math.sin(t * 10) * 0.14;
        const flare = c.phase === 'STRIKE' ? 1.65 : 1.15;
        v.hood.scale.x = THREE.MathUtils.damp(v.hood.scale.x, flare, 10, dt);
      } else {
        seg.position.x = Math.sin(t * 11 - s * 0.75) * (0.28 + s * 0.03);
        seg.position.y = 0.42 + Math.cos(t * 9 - s * 0.6) * 0.08;
      }
    }

    if (v.jaw) {
      v.jaw.rotation.x = c.phase === 'STRIKE' ? 0.48 : 0.12 + Math.sin(t * 8) * 0.08;
    }

    // Infernal raven swarm orbits menacingly during travel and merges into 1 giant raven on strike
    const distToTarget = c.pos.distanceTo(c.targetPos);
    const mergeFactor =
      c.phase === 'STRIKE'
        ? 1.0
        : c.phase === 'TRAVEL'
          ? THREE.MathUtils.clamp(1 - (distToTarget - 2.0) / 8.0, 0, 0.72)
          : 0;

    for (let b = 0; b < v.swarmBirds.length; b++) {
      const bird = v.swarmBirds[b];
      if (b === 0) {
        bird.position.y = Math.sin(t * 10) * 0.22;
        bird.scale.setScalar(1.85 + mergeFactor * 1.15);
      } else {
        const ang = (b / v.swarmBirds.length) * Math.PI * 2 + t * (6.5 + mergeFactor * 5.0);
        const rad = THREE.MathUtils.lerp(1.55, 0.12, mergeFactor);
        bird.position.set(
          Math.cos(ang) * rad,
          Math.sin(t * 9 + b) * 0.48 * (1 - mergeFactor * 0.75),
          Math.sin(ang) * rad
        );
        bird.scale.setScalar(Math.max(0.25, 1 - mergeFactor * 0.65));
        bird.rotation.y = -ang;
      }
    }

    for (let r = 0; r < v.rings.length; r++) {
      v.rings[r].rotation.x += dt * (2.5 + r);
      v.rings[r].rotation.y += dt * (3.2 - r * 0.5);
    }
  }

  private disposeCreatureVisual(visual: CreatureVisualParts): void {
    this.scene.remove(visual.root);
    const mats = new Set<THREE.Material>();
    visual.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => mats.add(m));
        } else {
          mats.add(mesh.material);
        }
      }
    });
    mats.forEach((m) => m.dispose());
  }

  private findClosestAliveEnemy(
    fromPos: THREE.Vector3,
    opposingTeam: CharacterController[]
  ): CharacterController | null {
    let best: CharacterController | null = null;
    let minD = Infinity;
    for (let i = 0; i < opposingTeam.length; i++) {
      const e = opposingTeam[i];
      if (!e.isAlive()) continue;
      const d = e.getPosition().distanceTo(fromPos);
      if (d < minD) {
        minD = d;
        best = e;
      }
    }
    return best;
  }

  public update(
    dt: number,
    allies: CharacterController[],
    enemies: CharacterController[],
    destructibles: DestructibleEnvironment
  ): CreatureEvents {
    const events: CreatureEvents = { hitstopMs: 0, shakeAmount: 0 };

    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];
      c.age += dt;
      c.phaseTimer += dt;

      const opposingTeam = c.ownerTeam === 'ally' ? enemies : allies;
      if (!c.targetFighter || !c.targetFighter.isAlive()) {
        c.targetFighter = this.findClosestAliveEnemy(c.pos, opposingTeam);
      }

      if (c.targetFighter && c.targetFighter.isAlive()) {
        c.targetFighter.getPosition(c.targetPos);
        c.targetPos.y = 1.25;
      }

      this.animateCreature(c, dt);

      if (c.phase === 'CHARGE') {
        // Steps 1-3: Wand raised, gathering magical energy while character delivers emotional Ultimate line
        c.caster.wand.getTipWorldPosition(c.pos);
        c.caster.wand.triggerCastFlash(c.spell.primaryColor, 7.5 + c.phaseTimer * 4);
        if (Math.random() < 0.55) {
          this.vfx.spawnTrailSmoke(c.pos, c.spell);
        }
        if (c.phaseTimer >= 0.68) {
          // Steps 4-5: Wand releases energy forward -> creature emerges from portal!
          const toAim = new THREE.Vector3().subVectors(c.targetPos, c.pos);
          toAim.y = 0;
          if (toAim.lengthSq() > 0.01) c.dir.copy(toAim.normalize());
          c.visual.root.visible = true;
          c.visual.root.position.copy(c.pos);
          c.visual.root.lookAt(c.pos.x + c.dir.x, c.pos.y, c.pos.z + c.dir.z);
          this.vfx.spawnBurst(
            c.pos,
            c.spell.primaryColor,
            c.spell.secondaryColor,
            c.spell.smokeColor,
            46,
            10,
            true,
            6.5,
            false
          );
          c.phase = 'EMERGE';
          c.phaseTimer = 0;
        }
      } else if (c.phase === 'EMERGE') {
        const p = Math.min(1, c.phaseTimer / 0.34);
        c.visual.root.scale.setScalar(0.22 + p * 0.94);
        c.caster.wand.getTipWorldPosition(c.pos);
        c.pos.addScaledVector(c.dir, p * 1.4);
        c.visual.root.position.copy(c.pos);

        if (!c.cryPlayed && c.phaseTimer >= 0.14) {
          c.cryPlayed = true;
          this.audio.playCreatureCry(c.caster.def.audioProfile);
          events.shakeAmount = Math.max(events.shakeAmount, 0.28);
        }
        if (c.phaseTimer >= 0.34) {
          c.phase = 'TRAVEL';
          c.phaseTimer = 0;
        }
      } else if (c.phase === 'TRAVEL') {
        const toTarget = new THREE.Vector3().subVectors(c.targetPos, c.pos);
        const dist = toTarget.length();
        if (dist > 0.05) {
          // Strong adaptive homing so running/dodging opponents cannot outrun an Ultimate
          c.dir.lerp(toTarget.normalize(), Math.min(1, dt * 13)).normalize();
        }
        const ramp = 1 + Math.min(1.6, c.phaseTimer * 0.9);
        const travelSpeed = Math.min(48, Math.max(24, c.spell.speed) * ramp);
        const step = Math.min(dist, travelSpeed * dt);
        c.pos.addScaledVector(c.dir, step);
        c.visual.root.position.copy(c.pos);
        c.visual.root.lookAt(
          c.pos.x + c.dir.x,
          c.pos.y,
          c.pos.z + c.dir.z
        );

        if (!c.moveSoundPlayed && c.phaseTimer >= 0.12) {
          c.moveSoundPlayed = true;
          this.audio.playCreatureMovement(c.caster.def.audioProfile);
        }

        if (Math.random() < 0.72) {
          this.vfx.spawnTrailSmoke(c.pos, c.spell);
        }

        const remaining = c.pos.distanceTo(c.targetPos);
        if (remaining <= 2.1 || c.phaseTimer >= 4.5) {
          c.pos.copy(c.targetPos);
          c.visual.root.position.copy(c.pos);
          c.phase = 'STRIKE';
          c.phaseTimer = 0;
        }
      } else if (c.phase === 'STRIKE') {
        // Keep creature locked right on target during strike impact
        if (c.targetFighter && c.targetFighter.isAlive()) {
          c.pos.lerp(c.targetPos, Math.min(1, dt * 18));
          c.visual.root.position.copy(c.pos);
        }

        const p = Math.min(1, c.phaseTimer / 0.32);
        c.visual.root.scale.setScalar(1.15 + Math.sin(p * Math.PI) * 0.52);
        if (c.caster.def.ultimateCreature === 'ancient_cat') {
          c.visual.root.position.y = c.pos.y + Math.sin(p * Math.PI) * 1.35;
        }

        if (!c.damageApplied && c.phaseTimer >= 0.12) {
          c.damageApplied = true;
          this.detonateCreatureImpact(c, allies, enemies, destructibles, events);
        }

        if (c.phaseTimer >= 0.32) {
          c.phase = 'DISSOLVE';
          c.phaseTimer = 0;
        }
      } else {
        // DISSOLVE
        const fade = Math.max(0, 1 - c.phaseTimer / 0.42);
        c.visual.root.scale.setScalar(1.15 * fade + 0.05);
        c.visual.coreMat.opacity = fade * 0.95;
        c.visual.accentMat.opacity = fade * 0.85;
        if (c.phaseTimer >= 0.42) {
          this.disposeCreatureVisual(c.visual);
          this.active.splice(i, 1);
        }
      }
    }

    return events;
  }

  private detonateCreatureImpact(
    c: ActiveCreature,
    allies: CharacterController[],
    enemies: CharacterController[],
    destructibles: DestructibleEnvironment,
    events: CreatureEvents
  ): void {
    const opposingTeam = c.ownerTeam === 'ally' ? enemies : allies;
    const hitRadius = 5.8;
    const hitSet = new Set<CharacterController>();
    let anyBlocked = false;

    const applyTo = (target: CharacterController) => {
      if (!target.isAlive() || hitSet.has(target)) return;
      hitSet.add(target);
      const tPos = target.getPosition();
      const kbDir = new THREE.Vector3(tPos.x - c.pos.x, 0, tPos.z - c.pos.z);
      if (kbDir.lengthSq() < 0.01) kbDir.copy(c.dir);
      kbDir.normalize();

      const outcome = HealthSystem.resolveHit(
        c.caster.def.powerRating,
        target,
        c.spell,
        kbDir
      );
      if (outcome.blocked) anyBlocked = true;
    };

    // Guaranteed direct strike on the locked enemy target
    if (c.targetFighter && c.targetFighter.isAlive() && opposingTeam.includes(c.targetFighter)) {
      applyTo(c.targetFighter);
    }

    // Plus AoE splash to any nearby opposing fighters (strictly zero friendly fire)
    for (let i = 0; i < opposingTeam.length; i++) {
      const target = opposingTeam[i];
      if (!target.isAlive() || hitSet.has(target)) continue;
      const tPos = target.getPosition();
      const d = Math.hypot(tPos.x - c.pos.x, tPos.z - c.pos.z);
      if (d <= hitRadius) {
        applyTo(target);
      }
    }

    // Shatter & crater Hogwarts courtyard environment around impact!
    destructibles.applyAreaDestruction(
      c.pos,
      6.4,
      'ULTIMATE',
      c.spell.primaryColor
    );

    this.vfx.spawnImpactForTier(c.pos, c.spell);
    this.audio.playImpact('ULTIMATE', c.caster.def.audioProfile, anyBlocked);

    events.hitstopMs = Math.max(events.hitstopMs, 65);
    events.shakeAmount = Math.max(events.shakeAmount, 0.92);
  }

  public clearAll(): void {
    for (const c of this.active) {
      this.disposeCreatureVisual(c.visual);
    }
    this.active = [];
  }
}
