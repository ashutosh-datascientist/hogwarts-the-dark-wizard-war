import * as THREE from 'three';
import { ActiveProjectile, SpellSystem } from './SpellSystem';
import { CharacterController } from './CharacterController';
import { MagicVFX } from './MagicVFX';
import { ArenaEnvironment } from './ArenaEnvironment';
import { HealthSystem } from './HealthSystem';
import { AudioManager } from './AudioManager';
import { ClashHudState, SpellDefinition, SpellTier } from './types';

interface ActiveClash {
  balance: number; // 0 = enemy winning, 1 = ally winning
  allyFighter: CharacterController;
  enemyFighter: CharacterController;
  allySpell: SpellDefinition;
  enemySpell: SpellDefinition;
  timeRemaining: number;
  shockwaveTimer: number;
  group: THREE.Group;
  orbMesh: THREE.Mesh;
  orbMat: THREE.ShaderMaterial;
  beamAlly: THREE.Mesh;
  beamEnemy: THREE.Mesh;
  lightningLines: THREE.Line[];
  light: THREE.PointLight;
  worldPos: THREE.Vector3;
}

export interface CollisionEvents {
  hitstopMs: number;
  shakeAmount: number;
}

export class SpellCollisionSystem {
  private scene: THREE.Scene;
  private vfx: MagicVFX;
  private audio: AudioManager;
  private activeClash: ActiveClash | null = null;

  constructor(scene: THREE.Scene, vfx: MagicVFX, audio: AudioManager) {
    this.scene = scene;
    this.vfx = vfx;
    this.audio = audio;
  }

  public isClashActive(): boolean {
    return this.activeClash !== null;
  }

  public isFighterInClash(fighter: CharacterController): boolean {
    if (!this.activeClash) return false;
    return (
      this.activeClash.allyFighter === fighter ||
      this.activeClash.enemyFighter === fighter
    );
  }

  public getClashWorldPosition(out = new THREE.Vector3()): THREE.Vector3 | null {
    if (!this.activeClash) return null;
    out.copy(this.activeClash.worldPos);
    return out;
  }

  public getClashHudState(): ClashHudState {
    if (!this.activeClash) {
      return {
        active: false,
        balance: 0.5,
        playerSpellName: '',
        opponentSpellName: '',
        timeRemaining: 0,
      };
    }
    return {
      active: true,
      balance: this.activeClash.balance,
      playerSpellName: `${this.activeClash.allyFighter.def.name}: ${this.activeClash.allySpell.name}`,
      opponentSpellName: `${this.activeClash.enemyFighter.def.name}: ${this.activeClash.enemySpell.name}`,
      timeRemaining: this.activeClash.timeRemaining,
    };
  }

  public applyPlayerClashSurge(surgeWeight: number): void {
    if (!this.activeClash || surgeWeight <= 0) return;
    this.activeClash.balance = THREE.MathUtils.clamp(
      this.activeClash.balance + surgeWeight * 0.04,
      0,
      1
    );
  }

  private tierPower(tier: SpellTier): number {
    return tier === 'ULTIMATE' ? 32 : tier === 'MID' ? 16 : 6;
  }

  private findFighterById(
    id: number,
    allies: CharacterController[],
    enemies: CharacterController[]
  ): CharacterController | null {
    for (const a of allies) {
      if (a.fighterIndex === id) return a;
    }
    for (const e of enemies) {
      if (e.fighterIndex === id) return e;
    }
    return null;
  }

  private startClash(
    allyProj: ActiveProjectile,
    enemyProj: ActiveProjectile,
    allyFighter: CharacterController,
    enemyFighter: CharacterController,
    midPoint: THREE.Vector3
  ): void {
    const group = new THREE.Group();

    const orbMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(allyProj.spell.primaryColor) },
        uColorB: { value: new THREE.Color(enemyProj.spell.primaryColor) },
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position + normal * (sin(position.x * 10.0 + uTime * 20.0) * 0.14);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vUv;
        void main() {
          float wave = sin(vUv.x * 20.0 + uTime * 16.0) * cos(vUv.y * 16.0 - uTime * 14.0);
          vec3 col = mix(uColorA, uColorB, smoothstep(-0.6, 0.6, wave));
          col += vec3(0.7) * smoothstep(0.5, 1.0, abs(wave));
          gl_FragColor = vec4(col, 0.98);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const orbMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 3), orbMat);
    orbMesh.position.copy(midPoint);
    group.add(orbMesh);

    const beamGeo = new THREE.CylinderGeometry(0.14, 0.14, 1, 10, 1, true);
    beamGeo.rotateX(Math.PI / 2);

    const beamAlly = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: allyProj.spell.primaryColor,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const beamEnemy = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: enemyProj.spell.primaryColor,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    group.add(beamAlly, beamEnemy);

    const lightningLines: THREE.Line[] = [];
    for (let i = 0; i < 4; i++) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k < 8; k++) pts.push(new THREE.Vector3());
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: i % 2 === 0 ? allyProj.spell.primaryColor : enemyProj.spell.primaryColor,
        })
      );
      group.add(line);
      lightningLines.push(line);
    }

    const light = new THREE.PointLight(0xe0f2fe, 9.5, 22, 2);
    light.position.copy(midPoint);
    group.add(light);

    this.scene.add(group);

    const aScore = allyProj.powerRating + this.tierPower(allyProj.spell.tier);
    const eScore = enemyProj.powerRating + this.tierPower(enemyProj.spell.tier);
    const initBal = THREE.MathUtils.clamp(0.5 + (aScore - eScore) * 0.004, 0.32, 0.68);

    this.activeClash = {
      balance: initBal,
      allyFighter,
      enemyFighter,
      allySpell: allyProj.spell,
      enemySpell: enemyProj.spell,
      timeRemaining: 4.0,
      shockwaveTimer: 0,
      group,
      orbMesh,
      orbMat,
      beamAlly,
      beamEnemy,
      lightningLines,
      light,
      worldPos: midPoint.clone(),
    };

    this.vfx.spawnShockwave(midPoint, '#e0f2fe', 11, 0.6);
    this.audio.playSpellCollision();
    this.audio.setClashHum(
      true,
      initBal,
      allyFighter.def.audioProfile,
      enemyFighter.def.audioProfile
    );
  }

  private endClash(winner: 'ally' | 'enemy'): CollisionEvents {
    const clash = this.activeClash!;
    const loser = winner === 'ally' ? clash.enemyFighter : clash.allyFighter;
    const winnerCtrl = winner === 'ally' ? clash.allyFighter : clash.enemyFighter;
    const winningSpell = winner === 'ally' ? clash.allySpell : clash.enemySpell;

    const loserPos = loser.getPosition().setY(1.2);
    const dir = new THREE.Vector3()
      .subVectors(loserPos, winnerCtrl.getPosition().setY(1.2))
      .normalize();

    const clashDamageSpell: SpellDefinition = {
      ...winningSpell,
      tier: 'ULTIMATE',
      damageMin: Math.max(90, winningSpell.damageMin * 1.35),
      damageMax: Math.max(130, winningSpell.damageMax * 1.45),
    };
    HealthSystem.resolveHit(winnerCtrl.def.powerRating, loser, clashDamageSpell, dir);

    this.vfx.spawnBurst(
      clash.worldPos,
      winningSpell.primaryColor,
      winningSpell.secondaryColor,
      winningSpell.smokeColor,
      105,
      18,
      true,
      15,
      true
    );
    this.audio.playImpact('ULTIMATE', winnerCtrl.def.audioProfile, false);
    this.audio.setClashHum(false);

    this.scene.remove(clash.group);
    clash.orbMat.dispose();
    this.activeClash = null;

    return { hitstopMs: 70, shakeAmount: 0.92 };
  }

  public update(
    dt: number,
    elapsed: number,
    spellSystem: SpellSystem,
    allies: CharacterController[],
    enemies: CharacterController[],
    arena: ArenaEnvironment
  ): CollisionEvents {
    const events: CollisionEvents = { hitstopMs: 0, shakeAmount: 0 };

    // 1. Active Priori Incantatem Clash
    if (this.activeClash) {
      const c = this.activeClash;
      if (!c.allyFighter.isAlive() || !c.enemyFighter.isAlive()) {
        const res = this.endClash(c.allyFighter.isAlive() ? 'ally' : 'enemy');
        return res;
      }

      c.timeRemaining -= dt;
      c.orbMat.uniforms.uTime.value = elapsed;

      const aWand = c.allyFighter.wand.getTipWorldPosition();
      const eWand = c.enemyFighter.wand.getTipWorldPosition();

      const aStrength =
        c.allyFighter.def.powerRating + this.tierPower(c.allySpell.tier);
      const eStrength =
        c.enemyFighter.def.powerRating + this.tierPower(c.enemySpell.tier);
      const drift =
        ((aStrength - eStrength) * 0.0045 - 0.03 * Math.sin(elapsed * 2)) * dt;
      c.balance = THREE.MathUtils.clamp(c.balance + drift, 0, 1);

      c.worldPos.lerpVectors(aWand, eWand, c.balance);
      c.orbMesh.position.copy(c.worldPos);
      const pulse = 1.0 + Math.sin(elapsed * 22) * 0.14;
      c.orbMesh.scale.setScalar(pulse);
      c.light.position.copy(c.worldPos);
      this.audio.setClashHum(
        true,
        c.balance,
        c.allyFighter.def.audioProfile,
        c.enemyFighter.def.audioProfile
      );

      const distA = aWand.distanceTo(c.worldPos);
      c.beamAlly.position.lerpVectors(aWand, c.worldPos, 0.5);
      c.beamAlly.scale.set(1, 1, Math.max(0.2, distA));
      c.beamAlly.lookAt(c.worldPos);

      const distE = eWand.distanceTo(c.worldPos);
      c.beamEnemy.position.lerpVectors(eWand, c.worldPos, 0.5);
      c.beamEnemy.scale.set(1, 1, Math.max(0.2, distE));
      c.beamEnemy.lookAt(c.worldPos);

      for (let l = 0; l < c.lightningLines.length; l++) {
        const attr = c.lightningLines[l].geometry.attributes
          .position as THREE.BufferAttribute;
        for (let k = 0; k < attr.count; k++) {
          const ang = (k / attr.count) * Math.PI * 2 + l * 1.6 + elapsed * 10;
          const rad = 1.2 + Math.random() * 1.4;
          attr.setXYZ(
            k,
            c.worldPos.x + Math.cos(ang) * rad,
            c.worldPos.y + (Math.random() - 0.5) * 1.8,
            c.worldPos.z + Math.sin(ang) * rad
          );
        }
        attr.needsUpdate = true;
      }

      c.shockwaveTimer += dt;
      if (c.shockwaveTimer >= 0.42) {
        c.shockwaveTimer = 0;
        const col =
          c.balance >= 0.5 ? c.allySpell.primaryColor : c.enemySpell.primaryColor;
        this.vfx.spawnShockwave(c.worldPos, col, 9.5, 0.48);
        events.shakeAmount = Math.max(events.shakeAmount, 0.22);
      }

      if (c.balance >= 0.92 || (c.timeRemaining <= 0 && c.balance >= 0.5)) {
        return this.endClash('ally');
      } else if (c.balance <= 0.08 || c.timeRemaining <= 0) {
        return this.endClash('enemy');
      }

      spellSystem.clearAll();
      return events;
    }

    // 2. Cross-team Projectile vs Projectile Collision -> Initiate Spell Clash
    const projs = spellSystem.projectiles;
    for (let i = projs.length - 1; i >= 0; i--) {
      const a = projs[i];
      if (!a) continue;
      let collided = false;
      for (let j = i - 1; j >= 0; j--) {
        const b = projs[j];
        if (!b || a.team === b.team) continue;
        const dist = a.pos.distanceTo(b.pos);
        if (dist < a.spell.radius + b.spell.radius + 0.55) {
          const allyProj = a.team === 'ally' ? a : b;
          const enemyProj = a.team === 'enemy' ? a : b;
          const allyFighter = this.findFighterById(allyProj.ownerId, allies, enemies);
          const enemyFighter = this.findFighterById(enemyProj.ownerId, allies, enemies);
          if (
            allyFighter &&
            enemyFighter &&
            allyFighter.isAlive() &&
            enemyFighter.isAlive()
          ) {
            const mid = new THREE.Vector3()
              .addVectors(a.pos, b.pos)
              .multiplyScalar(0.5);
            spellSystem.removeProjectile(i);
            spellSystem.removeProjectile(j);
            this.startClash(allyProj, enemyProj, allyFighter, enemyFighter, mid);
            events.shakeAmount = 0.5;
            collided = true;
            break;
          }
        }
      }
      if (collided) return events;
    }

    // 3. Projectile vs Destructible Courtyard Environment, Static Obstacles & Opposing Fighters
    const destructibles = arena.destructibles.items;
    const obstacles = arena.obstacles;

    for (let i = projs.length - 1; i >= 0; i--) {
      const proj = projs[i];
      if (!proj) continue;

      const casterCtrl = this.findFighterById(proj.ownerId, allies, enemies);
      const casterProfile = casterCtrl
        ? casterCtrl.def.audioProfile
        : allies[0]?.def.audioProfile;

      // 3a. Destructible Rocks, Walls, Pillars, Statues & Decorative Windows
      let hitDestructible = false;
      for (let d = 0; d < destructibles.length; d++) {
        const obj = destructibles[d];
        if (obj.stage >= 3) continue; // Destroyed obstacles let subsequent spells fly through!
        const dist = Math.hypot(proj.pos.x - obj.x, proj.pos.z - obj.z);
        if (dist < obj.radius + proj.spell.radius * 0.65) {
          arena.destructibles.damageObject(
            obj,
            proj.spell.tier,
            proj.pos,
            proj.dir,
            proj.spell.primaryColor
          );
          if (casterProfile) {
            this.audio.playImpact(proj.spell.tier, casterProfile, true);
          }
          events.shakeAmount = Math.max(
            events.shakeAmount,
            proj.spell.tier === 'MID' ? 0.32 : 0.14
          );
          spellSystem.removeProjectile(i);
          hitDestructible = true;
          break;
        }
      }
      if (hitDestructible) continue;

      // 3b. Static Arena Perimeter Obstacles (Cloisters & Braziers)
      let hitStatic = false;
      for (let k = 0; k < obstacles.length; k++) {
        const ob = obstacles[k];
        const d = Math.hypot(proj.pos.x - ob.x, proj.pos.z - ob.z);
        if (d < ob.radius + proj.spell.radius * 0.7) {
          this.vfx.spawnImpactForTier(proj.pos, proj.spell);
          if (casterProfile) {
            this.audio.playImpact(proj.spell.tier, casterProfile, true);
          }
          events.shakeAmount = Math.max(
            events.shakeAmount,
            proj.spell.tier === 'MID' ? 0.25 : 0.12
          );
          spellSystem.removeProjectile(i);
          hitStatic = true;
          break;
        }
      }
      if (hitStatic) continue;

      // 3c. Opposing Team Fighters ONLY (Zero friendly fire)
      const opposingTeam = proj.team === 'ally' ? enemies : allies;
      for (let f = 0; f < opposingTeam.length; f++) {
        const targetCtrl = opposingTeam[f];
        if (!targetCtrl.isAlive()) continue;
        const tPos = targetCtrl.getPosition();
        const hitDist = Math.hypot(proj.pos.x - tPos.x, proj.pos.z - tPos.z);
        const hitThreshold =
          (targetCtrl.shieldActive ? 1.45 : 0.95) + proj.spell.radius;

        if (hitDist <= hitThreshold) {
          const outcome = HealthSystem.resolveHit(
            proj.powerRating,
            targetCtrl,
            proj.spell,
            proj.dir
          );
          if (!outcome.dodged) {
            this.vfx.spawnImpactForTier(proj.pos, proj.spell);
            if (casterProfile) {
              this.audio.playImpact(proj.spell.tier, casterProfile, outcome.blocked);
            }
            if (proj.spell.tier === 'MID') {
              events.hitstopMs = Math.max(events.hitstopMs, 38);
              events.shakeAmount = Math.max(events.shakeAmount, 0.34);
            } else {
              events.shakeAmount = Math.max(events.shakeAmount, 0.14);
            }
            spellSystem.removeProjectile(i);
            break;
          }
        }
      }
    }

    return events;
  }

  public reset(): void {
    if (this.activeClash) {
      this.scene.remove(this.activeClash.group);
      this.activeClash.orbMat.dispose();
      this.activeClash = null;
      this.audio.setClashHum(false);
    }
  }
}
