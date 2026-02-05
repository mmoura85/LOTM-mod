import { world } from '@minecraft/server';
import { SpiritSystem } from './spiritSystem.js';

export class PathwayManager {
  static PATHWAY_PROPERTY = 'lotm:pathway';
  static SEQUENCE_PROPERTY = 'lotm:sequence';
  
  // Pathway types
  static PATHWAYS = {
    DARKNESS: 'darkness',
    DEATH: 'death',
    DOOR: 'door',
    SEER: 'seer',
    APPRENTICE: 'apprentice',
    SUN: 'sun',
    TWILIGHT_GIANT: 'twilight_giant'
  };
  
  // Spirit growth rates (spirit added per sequence advancement)
  static SPIRIT_GROWTH = {
    [this.PATHWAYS.DARKNESS]: 15,      // Physical pathway - slower growth
    [this.PATHWAYS.DEATH]: 20,         // Mystical pathway - moderate growth
    [this.PATHWAYS.DOOR]: 35,          // Highly mystical - faster growth
    [this.PATHWAYS.TWILIGHT_GIANT]: 12, // Very physical - slowest growth
    [this.PATHWAYS.SUN]: 18,            // Balanced pathway
    [this.PATHWAYS.SEER]: 35,           // Mystical pathway - faster growth
    [this.PATHWAYS.APPRENTICE]: 22      // Mystical pathway - faster growth
  };
  
  /**
   * Get player's current pathway
   */
  static getPathway(player) {
    return player.getDynamicProperty(this.PATHWAY_PROPERTY) || null;
  }
  
  /**
   * Get player's current sequence
   */
  static getSequence(player) {
    const sequence = player.getDynamicProperty(this.SEQUENCE_PROPERTY);
    return sequence !== undefined ? sequence : -1;
  }
  
  /**
   * Check if player has a pathway
   */
  static hasPathway(player) {
    return this.getPathway(player) !== null;
  }
  
  /**
   * Assign a new pathway to player (switches pathway, resets progress)
   */
  static assignPathway(player, pathway) {
    const currentPathway = this.getPathway(player);
    
    if (currentPathway && currentPathway !== pathway) {
      // Switching pathways - reset everything
      this.clearPathway(player);
      player.sendMessage('§cYou feel your previous abilities fade away...');
    }
    
    player.setDynamicProperty(this.PATHWAY_PROPERTY, pathway);
    player.setDynamicProperty(this.SEQUENCE_PROPERTY, 9); // Start at Sequence 9
    
    // Initialize spirit based on pathway
    let baseSpirit = 100;
    if (pathway === this.PATHWAYS.DOOR) {
      baseSpirit = 150;
    } else if (pathway === this.PATHWAYS.TWILIGHT_GIANT) {
      baseSpirit = 50; // Physical pathway, lower spirit
    }
    
    SpiritSystem.initializePlayer(player, baseSpirit);
    
    player.sendMessage(`§aYou have embarked on the §e${pathway}§a pathway!`);
  }
  
  /**
   * Advance to next sequence
   */
  static advanceSequence(player) {
    const currentSeq = this.getSequence(player);
    const pathway = this.getPathway(player);
    
    if (!pathway) {
      player.sendMessage('§cYou are not on any pathway!');
      return false;
    }
    
    if (currentSeq <= 0) {
      player.sendMessage('§cYou have already reached Sequence 0!');
      return false;
    }
    
    const newSeq = currentSeq - 1;
    player.setDynamicProperty(this.SEQUENCE_PROPERTY, newSeq);
    
    // Increase max spirit
    const growth = this.SPIRIT_GROWTH[pathway] || 20;
    const currentMax = SpiritSystem.getMaxSpirit(player);
    SpiritSystem.setMaxSpirit(player, currentMax + growth);
    
    player.sendMessage(`§aAdvanced to Sequence ${newSeq}!`);
    player.sendMessage(`§bMax Spirit increased to ${SpiritSystem.getMaxSpirit(player)}`);
    
    return true;
  }
  
  /**
   * Clear all pathway data
   */
  static clearPathway(player) {
    player.setDynamicProperty(this.PATHWAY_PROPERTY, undefined);
    player.setDynamicProperty(this.SEQUENCE_PROPERTY, undefined);
    
    // Remove all effects that might be active
    player.removeEffect('night_vision');
    player.removeEffect('speed');
    player.removeEffect('strength');
    player.removeEffect('jump_boost');
  }
  
  /**
   * Get pathway display name
   */
  static getPathwayDisplayName(pathway) {
    const names = {
      [this.PATHWAYS.DARKNESS]: 'Darkness',
      [this.PATHWAYS.DEATH]: 'Death',
      [this.PATHWAYS.DOOR]: 'Door',
      [this.PATHWAYS.SEER]: 'Seer',
      [this.PATHWAYS.APPRENTICE]: 'Apprentice',
      [this.PATHWAYS.SUN]: 'Sun',
      [this.PATHWAYS.TWILIGHT_GIANT]: 'Twilight Giant'
    };
    return names[pathway] || 'Unknown';
  }
}