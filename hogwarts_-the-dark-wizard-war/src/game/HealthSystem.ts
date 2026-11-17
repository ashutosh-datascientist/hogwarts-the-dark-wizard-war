import { CharacterController } from './CharacterController';
import { CharacterManager } from './CharacterManager';
import { SpellDefinition } from './types';
import * as THREE from 'three';

export interface HitOutcome {
  damage: number;
  blocked: boolean;
  dodged: boolean;
  heavy: boolean;
}

export class HealthSystem {
  /**
   * Computes long-duration battle damage:
   * - Normal characters: 2,000 HP; Dumbledore/Voldemort: 2,500 HP
   * - Basic: 15-30, Mid: 45-75, Ultimate: 100-160 (~5-8% max HP)
   * - Scaled by attacker/defender Power Ratings, Protego shield mitigation, and Dodge i-frames.
   */
  public static resolveHit(
    attackerPower: number,
    defender: CharacterController,
    spell: SpellDefinition,
    impactDir: THREE.Vector3
  ): HitOutcome {
    const isUltimate = spell.tier === 'ULTIMATE';

    // Dodge i-frames avoid Basic and Mid spells, NEVER Ultimates
    if (!isUltimate && defender.invulnTimer > 0) {
      return { damage: 0, blocked: false, dodged: true, heavy: false };
    }

    const baseDamage = THREE.MathUtils.lerp(
      spell.damageMin,
      spell.damageMax,
      Math.random()
    );

    const attackScale = CharacterManager.getDamageMultiplier(attackerPower);
    const defReduction = CharacterManager.getDefenseReduction(defender.def.powerRating);

    let finalDamage = baseDamage * attackScale * (1 - defReduction);
    let blocked = false;

    if (defender.shieldActive) {
      if (isUltimate) {
        // Ultimates shatter/overpower shields and still deal heavy guaranteed damage
        finalDamage *= 0.72;
        defender.shieldIntegrity = Math.max(0, defender.shieldIntegrity - 55);
        defender.shieldActive = false;
      } else {
        blocked = true;
        const shieldMult = spell.tier === 'BASIC' ? 0.14 : 0.25;
        finalDamage *= shieldMult;
        defender.shieldIntegrity = Math.max(0, defender.shieldIntegrity - 18);
      }
    }

    const rounded = Math.max(1, Math.round(finalDamage));
    const heavy = isUltimate || (!blocked && spell.tier !== 'BASIC');
    defender.applyHit(rounded, impactDir, heavy);

    return {
      damage: rounded,
      blocked,
      dodged: false,
      heavy,
    };
  }
}
