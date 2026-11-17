import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CharacterAnimState, CharacterDefinition, SpellTier } from './types';
import { CharacterRigBuilder, RigHandles } from './CharacterRigBuilder';
import { WandController } from './WandController';
import { CharacterManager, ImportedCharacterAsset } from './CharacterManager';

const _aimDir = new THREE.Vector3();

export class CharacterController {
  public readonly def: CharacterDefinition;
  public readonly rig: RigHandles;
  public readonly wand: WandController;
  public readonly body: CANNON.Body;
  public team: 'ally' | 'enemy' = 'ally';
  public fighterIndex = 0;

  public hp: number;
  public maxHp: number;
  public energy = 40;
  public readonly maxEnergy = 100;

  public shieldActive = false;
  public shieldIntegrity = 100;
  public dodgeTimer = 0;
  public dodgeCooldown = 0;
  public invulnTimer = 0;
  public hitFlashTimer = 0;
  public stunTimer = 0;
  public actionLockTimer = 0;

  public cooldowns: Record<SpellTier, number> = {
    BASIC: 0,
    MID: 0,
    ULTIMATE: 0,
  };

  private currentAnim: CharacterAnimState = 'idle';
  private isDead = false;
  private isVictor = false;
  private animTime = Math.random() * 10;
  private blinkTimer = 1.8 + Math.random() * 2.8;
  private blinkPhase = 0;

  private dodgeVel = new THREE.Vector3();

  constructor(
    def: CharacterDefinition,
    scene: THREE.Scene,
    physicsWorld: CANNON.World,
    spawnPos: THREE.Vector3,
    imported?: ImportedCharacterAsset
  ) {
    this.def = def;
    this.maxHp = def.maxHp;
    this.hp = def.maxHp;

    this.rig = CharacterRigBuilder.build(def, imported);
    this.rig.root.position.copy(spawnPos);
    scene.add(this.rig.root);

    this.wand = new WandController(
      this.rig.wandTip,
      def.spells.basic.primaryColor,
      scene
    );

    // 3D Physics collider (Cannon-es Sphere/Cylinder approximation)
    this.body = new CANNON.Body({
      mass: 78,
      position: new CANNON.Vec3(spawnPos.x, 1.0, spawnPos.z),
      fixedRotation: true,
      linearDamping: 0.9,
      shape: new CANNON.Sphere(0.75),
    });
    physicsWorld.addBody(this.body);
  }

  public getPosition(out = new THREE.Vector3()): THREE.Vector3 {
    out.set(this.body.position.x, 0, this.body.position.z);
    return out;
  }

  public isAlive(): boolean {
    return !this.isDead;
  }

  public playAnim(next: CharacterAnimState, fade = 0.14): void {
    if (this.currentAnim === next) {
      if (
        next === 'cast_basic' ||
        next === 'cast_mid' ||
        next === 'cast_ultimate' ||
        next === 'hit'
      ) {
        this.rig.actions[next].reset().play();
      }
      return;
    }
    const prevAction = this.rig.actions[this.currentAnim];
    const nextAction = this.rig.actions[next];
    if (!nextAction) return;

    nextAction.reset();
    nextAction.setEffectiveTimeScale(1);
    nextAction.setEffectiveWeight(1);
    nextAction.play();
    if (prevAction && prevAction !== nextAction) {
      prevAction.crossFadeTo(nextAction, fade, true);
    }
    this.currentAnim = next;
  }

  public tryDodge(moveX: number, moveZ: number): boolean {
    if (this.isDead || this.dodgeCooldown > 0 || this.stunTimer > 0) return false;
    let dx = moveX;
    let dz = moveZ;
    const len = Math.hypot(dx, dz);
    if (len < 0.1) {
      // Dodge sideways/backwards relative to facing
      const yaw = this.rig.root.rotation.y;
      dx = -Math.sin(yaw);
      dz = -Math.cos(yaw);
    } else {
      dx /= len;
      dz /= len;
    }

    this.dodgeVel.set(dx * 21, 0, dz * 21);
    this.dodgeTimer = 0.24;
    this.invulnTimer = 0.34;
    this.dodgeCooldown = 1.35;
    this.playAnim('dodge', 0.06);
    return true;
  }

  public canCast(tier: SpellTier): boolean {
    if (this.isDead || this.stunTimer > 0 || this.dodgeTimer > 0) return false;
    const spell =
      tier === 'BASIC'
        ? this.def.spells.basic
        : tier === 'MID'
          ? this.def.spells.mid
          : this.def.spells.ultimate;
    return this.cooldowns[tier] <= 0 && this.energy >= spell.energyCost;
  }

  public triggerCast(tier: SpellTier): void {
    const spell =
      tier === 'BASIC'
        ? this.def.spells.basic
        : tier === 'MID'
          ? this.def.spells.mid
          : this.def.spells.ultimate;
    this.cooldowns[tier] = spell.cooldown;
    this.energy = Math.max(0, this.energy - spell.energyCost);
    this.actionLockTimer = tier === 'ULTIMATE' ? 0.85 : tier === 'MID' ? 0.32 : 0.18;

    this.wand.triggerCastFlash(
      spell.primaryColor,
      tier === 'ULTIMATE' ? 9.0 : tier === 'MID' ? 5.0 : 2.8
    );

    const anim: CharacterAnimState =
      tier === 'ULTIMATE'
        ? 'cast_ultimate'
        : tier === 'MID'
          ? 'cast_mid'
          : 'cast_basic';
    this.playAnim(anim, 0.08);
  }

  public applyHit(damage: number, knockbackDir: THREE.Vector3, heavy: boolean): void {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - damage);
    this.hitFlashTimer = 0.16;

    const kbStrength = heavy ? 11 : 4.5;
    this.body.velocity.x += knockbackDir.x * kbStrength;
    this.body.velocity.z += knockbackDir.z * kbStrength;

    if (heavy) {
      this.stunTimer = 0.26;
      this.playAnim('hit', 0.06);
    }

    if (this.hp <= 0) {
      this.isDead = true;
      this.shieldActive = false;
      this.playAnim('defeat', 0.15);
    }
  }

  public setVictory(): void {
    this.isVictor = true;
    this.shieldActive = false;
    this.playAnim('victory', 0.2);
  }

  public heal(amount: number): void {
    if (this.isDead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  public update(
    dt: number,
    moveX: number,
    moveZ: number,
    running: boolean,
    aimTarget: THREE.Vector3,
    wantsShield: boolean,
    inClash: boolean
  ): void {
    this.animTime += dt;

    // Cooldowns & timers
    this.cooldowns.BASIC = Math.max(0, this.cooldowns.BASIC - dt);
    this.cooldowns.MID = Math.max(0, this.cooldowns.MID - dt);
    this.cooldowns.ULTIMATE = Math.max(0, this.cooldowns.ULTIMATE - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    this.stunTimer = Math.max(0, this.stunTimer - dt);
    this.actionLockTimer = Math.max(0, this.actionLockTimer - dt);

    if (!this.isDead && !this.isVictor) {
      // Passive magical energy regeneration scaled by Power Rating
      const regen = CharacterManager.getEnergyRegenRate(this.def.powerRating);
      if (this.shieldActive) {
        this.energy = Math.max(0, this.energy - 6.5 * dt);
        this.shieldIntegrity = Math.max(0, this.shieldIntegrity - 12 * dt);
      } else {
        this.energy = Math.min(this.maxEnergy, this.energy + regen * dt);
        this.shieldIntegrity = Math.min(100, this.shieldIntegrity + 14 * dt);
      }

      this.shieldActive =
        wantsShield &&
        !inClash &&
        this.dodgeTimer <= 0 &&
        this.stunTimer <= 0 &&
        this.shieldIntegrity > 5;

      // Physics movement
      if (inClash) {
        this.body.velocity.x *= 0.6;
        this.body.velocity.z *= 0.6;
        this.playAnim('clash', 0.12);
      } else if (this.dodgeTimer > 0) {
        this.body.velocity.x = this.dodgeVel.x;
        this.body.velocity.z = this.dodgeVel.z;
      } else if (this.stunTimer > 0) {
        this.body.velocity.x *= 0.85;
        this.body.velocity.z *= 0.85;
      } else {
        const speedBase = running ? 9.6 : 6.0;
        const shieldSlow = this.shieldActive ? 0.55 : 1.0;
        const speed = speedBase * shieldSlow;
        this.body.velocity.x = THREE.MathUtils.damp(
          this.body.velocity.x,
          moveX * speed,
          12,
          dt
        );
        this.body.velocity.z = THREE.MathUtils.damp(
          this.body.velocity.z,
          moveZ * speed,
          12,
          dt
        );

        if (this.actionLockTimer <= 0) {
          if (this.shieldActive) {
            this.playAnim('shield', 0.12);
          } else if (Math.hypot(moveX, moveZ) > 0.15) {
            this.playAnim(running ? 'run' : 'walk', 0.12);
          } else {
            this.playAnim('idle', 0.16);
          }
        }
      }

      // Smoothly face aimTarget
      _aimDir.set(
        aimTarget.x - this.body.position.x,
        0,
        aimTarget.z - this.body.position.z
      );
      if (_aimDir.lengthSq() > 0.01) {
        const targetYaw = Math.atan2(_aimDir.x, _aimDir.z);
        let diff = targetYaw - this.rig.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.rig.root.rotation.y += diff * Math.min(1, dt * 12);
      }
    } else {
      this.body.velocity.x *= 0.8;
      this.body.velocity.z *= 0.8;
    }

    // Clamp to courtyard bounds (-28..28)
    this.body.position.x = THREE.MathUtils.clamp(this.body.position.x, -27.5, 27.5);
    this.body.position.z = THREE.MathUtils.clamp(this.body.position.z, -27.5, 27.5);
    this.body.position.y = 1.0;

    // Sync mesh position to Cannon body
    this.rig.root.position.set(this.body.position.x, 0, this.body.position.z);

    // Update skeletal mixer
    this.rig.mixer.update(dt);

    // Wind sway on robes & natural facial eye blink + gaze tracking
    if (!this.rig.isImportedGlb) {
      const speedMag = Math.hypot(this.body.velocity.x, this.body.velocity.z);
      const windFlutter = Math.sin(this.animTime * 6.5) * 0.08 + Math.sin(this.animTime * 11.2) * 0.04;
      this.rig.robeBack.rotation.x = 0.15 + speedMag * 0.045 + windFlutter;
      this.rig.robeLeft.rotation.z = -0.06 + windFlutter * 0.6;
      this.rig.robeRight.rotation.z = 0.06 - windFlutter * 0.6;

      // Natural blinking
      if (this.isDead) {
        for (let i = 0; i < this.rig.eyelids.length; i++) {
          this.rig.eyelids[i].rotation.x = 0.36;
        }
      } else {
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) {
          this.blinkPhase = 1.0;
          this.blinkTimer = 2.4 + Math.random() * 3.4;
        }
        let blinkAmount = 0;
        if (this.blinkPhase > 0) {
          this.blinkPhase = Math.max(0, this.blinkPhase - dt * 5.8);
          blinkAmount = Math.sin(this.blinkPhase * Math.PI);
        }
        const lidRot = -0.28 + blinkAmount * 0.66;
        for (let i = 0; i < this.rig.eyelids.length; i++) {
          this.rig.eyelids[i].rotation.x = lidRot;
        }

        // Subtle eye gaze tracking + organic micro-saccade
        const dxEye = aimTarget.x - this.body.position.x;
        const dzEye = aimTarget.z - this.body.position.z;
        const targetYaw = Math.atan2(dxEye, dzEye);
        let relYaw = targetYaw - this.rig.root.rotation.y;
        while (relYaw > Math.PI) relYaw -= Math.PI * 2;
        while (relYaw < -Math.PI) relYaw += Math.PI * 2;
        const gazeYaw =
          THREE.MathUtils.clamp(relYaw * 0.45, -0.22, 0.22) +
          Math.sin(this.animTime * 2.1 + this.fighterIndex) * 0.025;
        const gazePitch = Math.cos(this.animTime * 1.4 + this.fighterIndex) * 0.02;
        for (let i = 0; i < this.rig.eyes.length; i++) {
          this.rig.eyes[i].rotation.y = gazeYaw;
          this.rig.eyes[i].rotation.x = gazePitch;
        }
      }
    }

    // Protego shield shader update
    const shieldMat = this.rig.shieldMesh.material as THREE.ShaderMaterial;
    const targetShieldOp = this.shieldActive ? 0.92 : 0;
    shieldMat.uniforms.uTime.value = this.animTime;
    shieldMat.uniforms.uOpacity.value = THREE.MathUtils.damp(
      shieldMat.uniforms.uOpacity.value,
      targetShieldOp,
      14,
      dt
    );
    this.rig.shieldMesh.visible = shieldMat.uniforms.uOpacity.value > 0.02;

    // Hit flash emissive pulse
    const flashIntensity = this.hitFlashTimer > 0 ? (this.hitFlashTimer / 0.16) * 0.85 : 0;
    for (let i = 0; i < this.rig.materialsForHitFlash.length; i++) {
      const m = this.rig.materialsForHitFlash[i];
      if (flashIntensity > 0) {
        m.emissive.setHex(0xffffff);
        m.emissiveIntensity = flashIntensity;
      } else {
        m.emissiveIntensity = 0;
      }
    }

    this.wand.update(dt);
  }

  public dispose(scene: THREE.Scene, physicsWorld: CANNON.World): void {
    this.wand.dispose(scene);
    scene.remove(this.rig.root);
    this.rig.dispose();
    physicsWorld.removeBody(this.body);
  }
}
