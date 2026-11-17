import * as THREE from 'three';
import { CharacterController } from './CharacterController';
import { SpellSystem } from './SpellSystem';
import { CreatureUltimateSystem } from './CreatureUltimateSystem';
import { AudioManager } from './AudioManager';
import { SpellTier } from './types';

export class CombatSystem {
  private spellSystem: SpellSystem;
  private creatureSystem: CreatureUltimateSystem;
  private audio: AudioManager;

  constructor(
    spellSystem: SpellSystem,
    creatureSystem: CreatureUltimateSystem,
    audio: AudioManager
  ) {
    this.spellSystem = spellSystem;
    this.creatureSystem = creatureSystem;
    this.audio = audio;
  }

  public tryCastSpell(
    caster: CharacterController,
    team: 'ally' | 'enemy',
    tier: SpellTier,
    aimPoint: THREE.Vector3,
    targetFighter?: CharacterController | null
  ): boolean {
    if (!caster.canCast(tier)) return false;

    const spell =
      tier === 'BASIC'
        ? caster.def.spells.basic
        : tier === 'MID'
          ? caster.def.spells.mid
          : caster.def.spells.ultimate;

    caster.triggerCast(tier);
    const origin = caster.wand.getTipWorldPosition();

    // Combat spells and Ultimates use magical & creature SFX only (NO combat character dialogue)
    if (tier === 'ULTIMATE') {
      this.audio.playSpellCast('ULTIMATE', caster.def.audioProfile);
      this.creatureSystem.summonCreature(
        caster,
        team,
        aimPoint,
        targetFighter ?? null
      );
      return true;
    }

    if (tier === 'MID') {
      this.audio.playWandCharge(caster.def.audioProfile);
    }
    this.spellSystem.spawnProjectile(
      team,
      caster.fighterIndex,
      caster.def.powerRating,
      spell,
      origin,
      aimPoint
    );
    this.audio.playSpellCast(tier, caster.def.audioProfile);
    return true;
  }
}
