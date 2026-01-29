import { world, system, EffectTypes } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

export class CorpseCollectorSequence {
  static SEQUENCE_NUMBER = 9;
  static PATHWAY = 'death';
  
  // Passive ability constants
  static EFFECT_DURATION = 400; // ~20 seconds to prevent flicker
  static SPEED_AMPLIFIER = 1; // Speed I
  static STRENGTH_AMPLIFIER = 2; // Strength I
  static RESISTANCE_AMPLIFIER = 1; // Resistance I (for decay/cold)
  
  // Track undead that have been made passive
  static passiveUndead = new Map(); // entity id -> true
  
  // Ability identifiers
  static ABILITIES = {
    SPIRIT_VISION: 'spirit_vision'
  };
  
  /**
   * Check if player has this sequence
   */
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) === this.SEQUENCE_NUMBER;
  }
  
  /**
   * Apply passive abilities (called every tick for active players)
   */
  static applyPassiveAbilities(player) {
    if (!this.hasSequence(player)) return;
    
    // Physical enhancements
    this.applyPhysicalEnhancements(player);
    
    // Resistance to cold and decay (Resistance effect)
    this.applyResistances(player);
    
    // Health bonus (1 extra heart for Sequence 9)
    this.applyHealthBonus(player, 2);
    
    // Make undead ignore the player
    this.makeUndeadPassive(player);
    
    // Spirit Vision effect (Night Vision to see in darkness, Glowing for spirit bodies)
    this.applyNightVision(player);
  }
  
  /**
   * Apply physical enhancements
   */
  static applyPhysicalEnhancements(player) {
    // Speed I
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, {
        amplifier: this.SPEED_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Strength I
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, {
        amplifier: this.STRENGTH_AMPLIFIER,
        showParticles: false
      });
    }
  }
  
  /**
   * Apply resistances (cold, decay, poison effects)
   */
  static applyResistances(player) {
    // Resistance I - helps against poison, wither (decay), and general damage
    const resistance = player.getEffect('resistance');
    if (!resistance || resistance.amplifier !== this.RESISTANCE_AMPLIFIER || resistance.duration < 200) {
      player.addEffect('resistance', this.EFFECT_DURATION, {
        amplifier: this.RESISTANCE_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Fire Resistance for protection against cold/temperature extremes
    // In Minecraft, this also helps with powder snow freezing
    const fireRes = player.getEffect('fire_resistance');
    if (!fireRes || fireRes.duration < 200) {
      player.addEffect('fire_resistance', this.EFFECT_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }
  }
  
  /**
   * Apply health bonus
   */
  static applyHealthBonus(player, bonusHearts) {
    const healthBoost = player.getEffect('health_boost');
    const amplifier = bonusHearts - 1;
    
    if (!healthBoost || healthBoost.amplifier !== amplifier || healthBoost.duration < 200) {
      player.addEffect('health_boost', this.EFFECT_DURATION, {
        amplifier: amplifier,
        showParticles: false
      });
    }
  }
  
  /**
   * Apply night vision for Spirit Vision
   */
  static applyNightVision(player) {
    const nightVision = player.getEffect('night_vision');
    if (!nightVision || nightVision.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }
  }
  
  /**
   * Make undead creatures passive towards the player
   * Undead don't attack Corpse Collectors unless provoked
   */
  static makeUndeadPassive(player) {
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: 32
      });
      
      for (const entity of entities) {
        if (this.isUndeadCreature(entity)) {
          // Apply extreme weakness and slowness to make them passive
          // This simulates them ignoring the player
          entity.addEffect('weakness', 100, { 
            amplifier: 10, 
            showParticles: false 
          });
          
          entity.addEffect('slowness', 100, { 
            amplifier: 3, 
            showParticles: false 
          });
          
          // Mark as passive
          this.passiveUndead.set(entity.id, true);
        }
      }
    } catch (e) {
      // Silently fail if we can't access entities
    }
  }
  
  /**
   * Check if entity is an undead creature
   */
  static isUndeadCreature(entity) {
    const undeadMobs = [
      'minecraft:zombie',
      'minecraft:zombie_villager',
      'minecraft:husk',
      'minecraft:drowned',
      'minecraft:skeleton',
      'minecraft:stray',
      'minecraft:wither_skeleton',
      'minecraft:zombie_pigman',
      'minecraft:zombified_piglin',
      'minecraft:phantom',
      'minecraft:wither',
      'minecraft:zoglin'
    ];
    
    return undeadMobs.includes(entity.typeId);
  }
  
  /**
   * Use Spirit Vision ability (toggle-able in future)
   */
  static useSpiritVision(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // For now, Spirit Vision is always active via Night Vision
    // In the future, this could apply Glowing effect to nearby entities
    player.sendMessage('§7Spirit Vision is always active for Corpse Collectors');
    
    // Apply glowing to nearby entities temporarily for visual feedback
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: 16,
        excludeTypes: ['minecraft:item']
      });
      
      for (const entity of entities) {
        entity.addEffect('glowing', 200, { 
          amplifier: 0, 
          showParticles: false 
        });
      }
      
      player.sendMessage('§bYou peer into the spirit world...');
    } catch (e) {
      // Silently fail
    }
    
    return true;
  }
  
  /**
   * Handle ability usage from item
   */
  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
      case this.ABILITIES.SPIRIT_VISION:
        return this.useSpiritVision(player);
      default:
        return false;
    }
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.SPIRIT_VISION]: 
        '§7Always Active: See in darkness and sense spirits'
    };
    return descriptions[abilityId] || 'Unknown ability';
  }
  
  /**
   * Clean up effects when player loses this sequence
   */
  static removeEffects(player) {
    player.removeEffect('speed');
    player.removeEffect('strength');
    player.removeEffect('resistance');
    player.removeEffect('fire_resistance');
    player.removeEffect('health_boost');
    player.removeEffect('night_vision');
    this.passiveUndead.clear();
  }
}