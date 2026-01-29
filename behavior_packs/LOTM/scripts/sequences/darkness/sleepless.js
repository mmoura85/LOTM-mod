import { world, system, EffectTypes } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

export class SleeplessSequence {
  static SEQUENCE_NUMBER = 9;
  static PATHWAY = PathwayManager.PATHWAYS.DARKNESS;
  
  // Passive ability constants
  static NIGHT_VISION_DURATION = 400; // ~20 seconds to prevent flicker
  static SPEED_AMPLIFIER =1; // Speed I
  static STRENGTH_AMPLIFIER = 1; // Strength I
  static JUMP_AMPLIFIER = 1; // Jump Boost I
  
  // Ability identifiers
  static ABILITIES = {
    ENHANCED_PHYSIQUE: 'enhanced_physique'
  };
  
  /**
   * Check if player has this sequence
   */
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) === this.SEQUENCE_NUMBER;
  }
  
  /**
   * Check if it's nighttime for the player
   */
  static isNighttime(player) {
    try {
      // Get time of day using command (returns value 0-24000)
      const result = player.dimension.runCommand('time query daytime');
      
      // Parse the time value from the message
      // Result format is usually "The time is [number]"
      const timeMatch = result.statusMessage ? result.statusMessage.match(/(\d+)/) : null;
      
      if (timeMatch) {
        const timeOfDay = parseInt(timeMatch[1]);
        // Night is from 13000 to 23000 ticks (sunset to sunrise)
        return timeOfDay >= 13000 && timeOfDay < 23000;
      }
    } catch (e) {
      // If we can't get time, default to false (day)
      return false;
    }
    return false;
  }
  
  /**
   * Check if it's nighttime for the player
   */
  static isNighttime(player) {
    try {
      // Get time of day using command (returns value 0-24000)
      const result = player.dimension.runCommand('time query daytime');
      
      // Parse the time value from the message
      // Result format is usually "The time is [number]"
      const timeMatch = result.statusMessage ? result.statusMessage.match(/(\d+)/) : null;
      
      if (timeMatch) {
        const timeOfDay = parseInt(timeMatch[1]);
        // Night is from 13000 to 23000 ticks (sunset to sunrise)
        return timeOfDay >= 13000 && timeOfDay < 23000;
      }
    } catch (e) {
      // If we can't get time, default to false (day)
      return false;
    }
    return false;
  }
  
  /**
   * Apply passive abilities (called every tick for active players)
   */
  static applyPassiveAbilities(player) {
    if (!this.hasSequence(player)) return;
    
    // Night Vision - permanent effect
    const nightVision = player.getEffect('night_vision');
    if (!nightVision || nightVision.duration < 200) {
      player.addEffect('night_vision', this.NIGHT_VISION_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }
    
    // Enhanced physical abilities
    this.applyPhysicalEnhancements(player);
    
    // Health bonus (1 extra heart for Sequence 9)
    this.applyHealthBonus(player, 2);
    
    // Phantom immunity - Sleepless don't need sleep!
    this.preventPhantomSpawns(player);
  }
  
  /**
   * Apply health bonus
   */
  static applyHealthBonus(player, bonusHearts) {
    const healthBoost = player.getEffect('health_boost');
    const amplifier = bonusHearts - 2; // health_boost amplifier 0 = 1 heart, 1 = 2 hearts, etc.
    
    if (!healthBoost || healthBoost.amplifier !== amplifier || healthBoost.duration < 200) {
      player.addEffect('health_boost', this.NIGHT_VISION_DURATION, {
        amplifier: amplifier,
        showParticles: false
      });
    }
  }
  
  /**
   * Prevent phantom spawns by resetting time since rest
   * Sleepless don't need sleep!
   */
  static preventPhantomSpawns(player) {
    // Kill any nearby phantoms targeting this player
    try {
      const phantoms = player.dimension.getEntities({
        type: 'minecraft:phantom',
        location: player.location,
        maxDistance: 64
      });
      
      for (const phantom of phantoms) {
        // Phantoms near Sleepless beyonders are destroyed
        phantom.kill();
      }
    } catch (e) {
      // Silently fail if we can't access entities
    }
  }
  
  /**
   * Apply physical enhancements (Speed, Strength, Jump)
   */
  static applyPhysicalEnhancements(player) {
    // Speed
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
      player.addEffect('speed', this.NIGHT_VISION_DURATION, {
        amplifier: this.SPEED_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Strength
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.NIGHT_VISION_DURATION, {
        amplifier: this.STRENGTH_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Jump Boost
    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200) {
      player.addEffect('jump_boost', this.NIGHT_VISION_DURATION, {
        amplifier: this.JUMP_AMPLIFIER,
        showParticles: false
      });
    }
  }
  
  /**
   * Use enhanced physique ability (active toggle for combat)
   * This can be expanded later for temporary boosts
   */
  static useEnhancedPhysique(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // For Sequence 9, this just confirms the passive abilities
    // In higher sequences, this could provide temporary boosts
    player.sendMessage('§aEnhanced physique is always active!');
    return true;
  }
  
  /**
   * Handle ability usage from item
   */
  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
      case this.ABILITIES.ENHANCED_PHYSIQUE:
        return this.useEnhancedPhysique(player);
      default:
        return false;
    }
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.ENHANCED_PHYSIQUE]: 
        '§7Passive: Night Vision, Speed I, Strength I, Jump Boost I'
    };
    return descriptions[abilityId] || 'Unknown ability';
  }
  
  /**
   * Clean up effects when player loses this sequence
   */
  static removeEffects(player) {
    player.removeEffect('night_vision');
    player.removeEffect('speed');
    player.removeEffect('strength');
    player.removeEffect('jump_boost');
    player.removeEffect('health_boost');
  }
}