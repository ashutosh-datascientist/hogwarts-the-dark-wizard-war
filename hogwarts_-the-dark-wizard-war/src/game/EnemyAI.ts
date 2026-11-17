import * as THREE from 'three';
import { CharacterController } from './CharacterController';
import { ActiveProjectile } from './SpellSystem';
import { CombatSystem } from './CombatSystem';
import { SpellTier } from './types';
import { AudioManager } from './AudioManager';

export interface AIDecision {
  moveX: number;
  moveZ: number;
  running: boolean;
  shield: boolean;
  aimTarget: THREE.Vector3;
}

interface FighterAIState {
  strafeDir: number;
  strafeTimer: number;
  thinkTimer: number;
  shieldHoldTimer: number;
}

export class EnemyAI {
  private states = new Map<number, FighterAIState>();

  private getState(fighterId: number): FighterAIState {
    let st = this.states.get(fighterId);
    if (!st) {
      st = {
        strafeDir: Math.random() > 0.5 ? 1 : -1,
        strafeTimer: 1.4 + Math.random() * 1.8,
        thinkTimer: 0.25 + Math.random() * 0.4,
        shieldHoldTimer: 0,
      };
      this.states.set(fighterId, st);
    }
    return st;
  }

  public reset(): void {
    this.states.clear();
  }

  private chooseTarget(
    ai: CharacterController,
    slotIndex: number,
    alliesOfFighter: CharacterController[],
    enemiesOfFighter: CharacterController[]
  ): CharacterController | null {
    const aliveEnemies = enemiesOfFighter.filter((e) => e.isAlive());
    if (aliveEnemies.length === 0) return null;

    const aiPos = ai.getPosition();

    // If this AI is an ally defending a low-HP teammate (like the player), prioritize who threatens them
    if (ai.def.aiPersonality === 'SUPPORT_GUARDIAN' || ai.def.aiPersonality === 'STRATEGIC_DEFENSIVE') {
      const endangeredAlly = alliesOfFighter.find(
        (al) => al !== ai && al.isAlive() && al.hp / al.maxHp < 0.45
      );
      if (endangeredAlly) {
        const allyPos = endangeredAlly.getPosition();
        let closestToAlly = aliveEnemies[0];
        let minD = Infinity;
        for (const en of aliveEnemies) {
          const d = en.getPosition().distanceTo(allyPos);
          if (d < minD) {
            minD = d;
            closestToAlly = en;
          }
        }
        return closestToAlly;
      }
    }

    // Spread targets across teammates initially, or hunt weakest/nearest enemy
    let bestTarget = aliveEnemies[slotIndex % aliveEnemies.length];
    let bestScore = -Infinity;
    for (let i = 0; i < aliveEnemies.length; i++) {
      const en = aliveEnemies[i];
      const d = en.getPosition().distanceTo(aiPos);
      const lowHpBonus = (1 - en.hp / en.maxHp) * 14;
      const spreadBonus = i === slotIndex % aliveEnemies.length ? 4 : 0;
      const score = -d + lowHpBonus + spreadBonus;
      if (score > bestScore) {
        bestScore = score;
        bestTarget = en;
      }
    }
    return bestTarget;
  }

  public update(
    dt: number,
    ai: CharacterController,
    slotIndex: number,
    alliesOfFighter: CharacterController[],
    enemiesOfFighter: CharacterController[],
    projectiles: ActiveProjectile[],
    combat: CombatSystem,
    audio: AudioManager,
    inClash: boolean
  ): AIDecision {
    const aiPos = ai.getPosition();
    const target = this.chooseTarget(ai, slotIndex, alliesOfFighter, enemiesOfFighter);
    const tPos = target ? target.getPosition() : new THREE.Vector3(0, 0, 0);

    if (!ai.isAlive() || inClash || !target) {
      return {
        moveX: 0,
        moveZ: 0,
        running: false,
        shield: false,
        aimTarget: tPos,
      };
    }

    const st = this.getState(ai.fighterIndex);
    const toTarget = new THREE.Vector3().subVectors(tPos, aiPos);
    const dist = toTarget.length();
    const dirToTarget =
      dist > 0.01 ? toTarget.clone().divideScalar(dist) : new THREE.Vector3(0, 0, 1);

    // Periodic strafe direction switch
    st.strafeTimer -= dt;
    if (st.strafeTimer <= 0) {
      st.strafeTimer = 1.4 + Math.random() * 2.1;
      st.strafeDir = Math.random() > 0.5 ? 1 : -1;
    }

    // Detect incoming opposing projectile threat (strictly ignore teammate projectiles)
    let threatProj: ActiveProjectile | null = null;
    for (let i = 0; i < projectiles.length; i++) {
      const pr = projectiles[i];
      if (pr.team === ai.team) continue;
      const toAi = new THREE.Vector3().subVectors(aiPos, pr.pos);
      toAi.y = 0;
      const d = toAi.length();
      if (d < 9.5 && toAi.normalize().dot(pr.dir) > 0.72) {
        threatProj = pr;
        break;
      }
    }

    st.shieldHoldTimer = Math.max(0, st.shieldHoldTimer - dt);
    const skillFactor = (ai.def.powerRating - 70) / 30; // 0.16..1.0

    if (threatProj) {
      if (
        threatProj.spell.tier === 'MID' &&
        ai.dodgeCooldown <= 0 &&
        Math.random() < 0.45 + skillFactor * 0.35
      ) {
        const perpX = -threatProj.dir.z * st.strafeDir;
        const perpZ = threatProj.dir.x * st.strafeDir;
        if (ai.tryDodge(perpX, perpZ)) {
          audio.playDodge();
        }
      } else if (ai.shieldIntegrity > 15 && Math.random() < 0.44 + skillFactor * 0.38) {
        st.shieldHoldTimer = 0.65;
      }
    }

    const shield = st.shieldHoldTimer > 0;

    // Personality-tuned combat spacing
    const preferredMin =
      ai.def.aiPersonality === 'AGGRESSIVE_BOSS' ||
      ai.def.aiPersonality === 'CHAOTIC_AGGRESSIVE'
        ? 7.5
        : 10.0;
    const preferredMax =
      ai.def.aiPersonality === 'STRATEGIC_DEFENSIVE' ||
      ai.def.aiPersonality === 'CALCULATED_TACTICAL'
        ? 18.0
        : 14.5;

    const perp = new THREE.Vector3(
      -dirToTarget.z * st.strafeDir,
      0,
      dirToTarget.x * st.strafeDir
    );
    let forwardFactor = 0;
    let running = false;
    if (dist > preferredMax) {
      forwardFactor = 1;
      running = dist > preferredMax + 4.5;
    } else if (dist < preferredMin) {
      forwardFactor = -0.85;
    }

    // Teammate separation so multi-wizard squads don't overlap on one spot
    let sepX = 0;
    let sepZ = 0;
    for (let a = 0; a < alliesOfFighter.length; a++) {
      const mate = alliesOfFighter[a];
      if (mate === ai || !mate.isAlive()) continue;
      const mPos = mate.getPosition();
      const dx = aiPos.x - mPos.x;
      const dz = aiPos.z - mPos.z;
      const md = Math.hypot(dx, dz);
      if (md < 3.5 && md > 0.01) {
        sepX += (dx / md) * (3.5 - md) * 0.65;
        sepZ += (dz / md) * (3.5 - md) * 0.65;
      }
    }

    const moveX = dirToTarget.x * forwardFactor + perp.x * 0.78 + sepX;
    const moveZ = dirToTarget.z * forwardFactor + perp.z * 0.78 + sepZ;
    const mLen = Math.hypot(moveX, moveZ) || 1;

    // Spell casting cadence scaled by Power Rating + Personality (NO combat dialogue)
    st.thinkTimer -= dt;
    if (st.thinkTimer <= 0 && !shield) {
      const aggressionSpeed =
        ai.def.aiPersonality === 'AGGRESSIVE_BOSS' ||
        ai.def.aiPersonality === 'CHAOTIC_AGGRESSIVE'
          ? 0.08
          : 0;
      st.thinkTimer =
        Math.max(0.28, 0.56 - skillFactor * 0.2 - aggressionSpeed) +
        Math.random() * 0.45;

      const aimTarget = tPos.clone();
      aimTarget.x += target.body.velocity.x * 0.16;
      aimTarget.z += target.body.velocity.z * 0.16;

      let chosenTier: SpellTier | null = null;
      if (ai.canCast('ULTIMATE') && Math.random() < 0.7) {
        chosenTier = 'ULTIMATE';
      } else if (ai.canCast('MID') && Math.random() < 0.45 + skillFactor * 0.22) {
        chosenTier = 'MID';
      } else if (ai.canCast('BASIC') && Math.random() < 0.8) {
        chosenTier = 'BASIC';
      }

      if (chosenTier) {
        combat.tryCastSpell(ai, ai.team, chosenTier, aimTarget, target);
      }
    }

    return {
      moveX: (moveX / mLen) * (Math.hypot(moveX, moveZ) > 0.1 ? 1 : 0),
      moveZ: (moveZ / mLen) * (Math.hypot(moveX, moveZ) > 0.1 ? 1 : 0),
      running,
      shield,
      aimTarget: tPos,
    };
  }
}
