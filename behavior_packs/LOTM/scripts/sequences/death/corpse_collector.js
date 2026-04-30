import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

export class CorpseCollectorSequence {
  static SEQUENCE_NUMBER = 9;
  static PATHWAY = 'death';

  static EFFECT_DURATION = 999999;
  static SPEED_AMPLIFIER = 0;      // Speed I
  static STRENGTH_AMPLIFIER = 1;   // Strength II
  static SMITE_BONUS = 4;          // Extra damage vs undead

  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  static applyPassiveAbilities(player) {
    // Speed I
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: this.SPEED_AMPLIFIER, showParticles: false });
    }

    // Strength II
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: this.STRENGTH_AMPLIFIER, showParticles: false });
    }

    // Night vision
    const nv = player.getEffect('night_vision');
    if (!nv || nv.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    // Saturation - no hunger
    const sat = player.getEffect('saturation');
    if (!sat || sat.duration < 200) {
      player.addEffect('saturation', 400, { amplifier: 0, showParticles: false });
    }

    // Fire resistance - cold/decay immunity
    const fire = player.getEffect('fire_resistance');
    if (!fire || fire.duration < 200) {
      player.addEffect('fire_resistance', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    // Resistance I
    const res = player.getEffect('resistance');
    if (!res || res.amplifier !== 0 || res.duration < 200) {
      player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    // Health bonus (+1 heart)
    const hb = player.getEffect('health_boost');
    if (!hb || hb.amplifier !== 0 || hb.duration < 200) {
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    // Undead passive - make them ignore player
    this.makeUndeadPassive(player);
  }

  /**
   * Undead ignore the player unless attacked
   */
  static makeUndeadPassive(player) {
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: 24
      });
      for (const entity of entities) {
        if (this.isUndeadCreature(entity)) {
          entity.addEffect('weakness', 60, { amplifier: 255, showParticles: false });
        }
      }
    } catch (e) {}
  }

  static isUndeadCreature(entity) {
    const undeadMobs = [
      'minecraft:zombie', 'minecraft:zombie_villager', 'minecraft:husk',
      'minecraft:drowned', 'minecraft:skeleton', 'minecraft:stray',
      'minecraft:wither_skeleton', 'minecraft:zombified_piglin',
      'minecraft:phantom', 'minecraft:zoglin',
      'lotm:ghoul', 'lotm:ghost', 'lotm:vengeful_ghost', 'lotm:shade'
    ];
    return undeadMobs.includes(entity.typeId);
  }

  static removeEffects(player) {
    player.removeEffect('speed');
    player.removeEffect('strength');
    player.removeEffect('night_vision');
    player.removeEffect('saturation');
    player.removeEffect('fire_resistance');
    player.removeEffect('resistance');
    player.removeEffect('health_boost');
  }
}
