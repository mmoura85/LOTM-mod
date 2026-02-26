import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

export class BardSequence {
  static SEQUENCE_NUMBER = 9;
  static PATHWAY = 'sun';
  
  // Passive ability constants (similar to Sleepless)
  static EFFECT_DURATION = 999999; // ~20 seconds to prevent flicker
  static SPEED_AMPLIFIER = 1; // Speed II
  static STRENGTH_AMPLIFIER = 1; // Strength II
  static JUMP_AMPLIFIER = 1; // Jump Boost II
  
  // Song ability constants
  static SONG_DURATION = 240; // 12 seconds
  static SONG_RANGE = 16; // Blocks
  static COURAGE_SPIRIT_COST = 25;
  static STRENGTH_SPIRIT_COST = 25;
  static RECOVERY_SPIRIT_COST = 30;
  
  // Active song tracking
  static activeSongs = new Map(); // player name -> song data
  static selectedSongs = new Map(); // player name -> song ID
  
  // Ability identifiers
  static ABILITIES = {
    SONG_OF_COURAGE: 'song_of_courage',
    SONG_OF_STRENGTH: 'song_of_strength',
    SONG_OF_RECOVERY: 'song_of_recovery'
  };
  
  // Dynamic property for persistence
  static SELECTED_SONG_PROPERTY = 'lotm:bard_selected_song';
  
  /**
   * Load selected song from player dynamic properties
   */
  static loadSelectedSong(player) {
    try {
      const selected = player.getDynamicProperty(this.SELECTED_SONG_PROPERTY);
      if (selected) {
        this.selectedSongs.set(player.name, selected);
      }
    } catch (e) {
      // Failed to load
    }
  }
  
  /**
   * Save selected song to player dynamic properties
   */
  static saveSelectedSong(player) {
    try {
      const selected = this.selectedSongs.get(player.name);
      if (selected) {
        player.setDynamicProperty(this.SELECTED_SONG_PROPERTY, selected);
      }
    } catch (e) {
      // Failed to save
    }
  }
  
  /**
   * Check if player has this sequence
   */
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) === this.SEQUENCE_NUMBER;
  }
  
  /**
   * Apply passive abilities
   */
  static applyPassiveAbilities(player) {
    // if (!this.hasSequence(player)) return;
    
    // Load selected song on first tick
    if (!this.selectedSongs.has(player.name)) {
      this.loadSelectedSong(player);
    }
    
    // Apply physical enhancements
    this.applyPhysicalEnhancements(player);
    
    // Health bonus (1 extra heart for Sequence 9)
    this.applyHealthBonus(player, 2);
    
    // Process active songs
    this.processSongs(player);
  }
  
  /**
   * Apply physical enhancements
   */
  static applyPhysicalEnhancements(player) {
    // Speed II
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, {
        amplifier: this.SPEED_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Strength II
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, {
        amplifier: this.STRENGTH_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Jump Boost II
    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, {
        amplifier: this.JUMP_AMPLIFIER,
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
   * Get selected song
   */
  static getSelectedSong(player) {
    return this.selectedSongs.get(player.name) || this.ABILITIES.SONG_OF_COURAGE;
  }
  
  /**
   * Set selected song
   */
  static setSelectedSong(player, songId) {
    this.selectedSongs.set(player.name, songId);
    this.saveSelectedSong(player);
    return true;
  }
  
  /**
   * Use currently selected song
   */
  static useSelectedSong(player) {
    const songId = this.getSelectedSong(player);
    return this.useSong(player, songId);
  }
  
  /**
   * Use specific song
   */
  static useSong(player, songId) {
    switch (songId) {
      case this.ABILITIES.SONG_OF_COURAGE:
        return this.useSongOfCourage(player);
      case this.ABILITIES.SONG_OF_STRENGTH:
        return this.useSongOfStrength(player);
      case this.ABILITIES.SONG_OF_RECOVERY:
        return this.useSongOfRecovery(player);
      default:
        return false;
    }
  }
  
  /**
   * Use Song of Courage - removes fear, grants resistance
   */
  static useSongOfCourage(player) {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    // Allow both Bard (9) and Light Suppliant (8)
    if (pathway !== this.PATHWAY || (sequence !== 9 && sequence !== 8)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check if already singing
    if (this.activeSongs.has(player.name)) {
      player.sendMessage('§cYou are already performing a song!');
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.COURAGE_SPIRIT_COST)) {
      player.sendMessage('§cNot enough spirit! Need ' + this.COURAGE_SPIRIT_COST);
      return false;
    }
    
    // Start the song
    this.activeSongs.set(player.name, {
      type: this.ABILITIES.SONG_OF_COURAGE,
      ticksRemaining: this.SONG_DURATION,
      playerLocation: player.location
    });
    
    player.sendMessage('§6♪ You begin singing a song of courage... ♪');
    player.playSound('note.harp', { pitch: 1.0, volume: 1.0 });
    
    return true;
  }
  
  /**
   * Use Song of Strength - enhances all allies' strength
   */
  static useSongOfStrength(player) {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    // Allow both Bard (9) and Light Suppliant (8)
    if (pathway !== this.PATHWAY || (sequence !== 9 && sequence !== 8)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check if already singing
    if (this.activeSongs.has(player.name)) {
      player.sendMessage('§cYou are already performing a song!');
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.STRENGTH_SPIRIT_COST)) {
      player.sendMessage('§cNot enough spirit! Need ' + this.STRENGTH_SPIRIT_COST);
      return false;
    }
    
    // Start the song
    this.activeSongs.set(player.name, {
      type: this.ABILITIES.SONG_OF_STRENGTH,
      ticksRemaining: this.SONG_DURATION,
      playerLocation: player.location
    });
    
    player.sendMessage('§c♪ You begin singing a song of strength... ♪');
    player.playSound('note.harp', { pitch: 0.8, volume: 1.0 });
    
    return true;
  }
  
  /**
   * Use Song of Recovery - heals and restores spirit to allies
   */
  static useSongOfRecovery(player) {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    // Allow both Bard (9) and Light Suppliant (8)
    if (pathway !== this.PATHWAY || (sequence !== 9 && sequence !== 8)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check if already singing
    if (this.activeSongs.has(player.name)) {
      player.sendMessage('§cYou are already performing a song!');
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.RECOVERY_SPIRIT_COST)) {
      player.sendMessage('§cNot enough spirit! Need ' + this.RECOVERY_SPIRIT_COST);
      return false;
    }
    
    // Start the song
    this.activeSongs.set(player.name, {
      type: this.ABILITIES.SONG_OF_RECOVERY,
      ticksRemaining: this.SONG_DURATION,
      playerLocation: player.location
    });
    
    player.sendMessage('§b♪ You begin singing a song of recovery... ♪');
    player.playSound('note.harp', { pitch: 1.2, volume: 1.0 });
    
    return true;
  }
  
  /**
   * Process active songs each tick
   */
  static processSongs(player) {
    const songData = this.activeSongs.get(player.name);
    if (!songData) return;
    
    // Decrease duration
    songData.ticksRemaining--;
    
    // Apply song effects to nearby allies
    this.applySongEffects(player, songData);
    
    // Play periodic sound effects (every 40 ticks = 2 seconds)
    if (songData.ticksRemaining % 40 === 0) {
      let pitch = 1.0;
      if (songData.type === this.ABILITIES.SONG_OF_COURAGE) pitch = 1.0;
      else if (songData.type === this.ABILITIES.SONG_OF_STRENGTH) pitch = 0.8;
      else if (songData.type === this.ABILITIES.SONG_OF_RECOVERY) pitch = 1.2;
      
      player.playSound('note.harp', { pitch: pitch, volume: 0.8 });
    }
    
    // End song if duration expired
    if (songData.ticksRemaining <= 0) {
      this.endSong(player);
    }
  }
  
  /**
   * Apply song effects to nearby players
   */
  static applySongEffects(player, songData) {
    const players = player.dimension.getPlayers({
      location: player.location,
      maxDistance: this.SONG_RANGE
    });
    
    for (const targetPlayer of players) {
      if (songData.type === this.ABILITIES.SONG_OF_COURAGE) {
        this.applyCourageEffect(targetPlayer, player);
      } else if (songData.type === this.ABILITIES.SONG_OF_STRENGTH) {
        this.applyStrengthEffect(targetPlayer, player);
      } else if (songData.type === this.ABILITIES.SONG_OF_RECOVERY) {
        this.applyRecoveryEffect(targetPlayer, player);
        
        // Restore spirit every 2 seconds for recovery song
        if (songData.ticksRemaining % 40 === 0) {
          SpiritSystem.restoreSpirit(targetPlayer, 5);
        }
      }
    }
  }
  
  /**
   * Apply courage effect - remove fear, grant resistance
   */
  static applyCourageEffect(targetPlayer, bard) {
    // Remove negative effects
    targetPlayer.removeEffect('weakness');
    targetPlayer.removeEffect('slowness');
    targetPlayer.removeEffect('mining_fatigue');
    
    // Grant resistance (stacks with existing)
    const currentResistance = targetPlayer.getEffect('resistance');
    const newLevel = currentResistance ? currentResistance.amplifier + 1 : 0;
    
    targetPlayer.addEffect('resistance', 60, { 
      amplifier: Math.min(newLevel, 3), // Cap at Resistance IV
      showParticles: true 
    });
    
    // Particles
    if (targetPlayer.id !== bard.id) {
      targetPlayer.dimension.spawnParticle('minecraft:totem_particle', {
        x: targetPlayer.location.x,
        y: targetPlayer.location.y + 1,
        z: targetPlayer.location.z
      });
    }
  }
  
  /**
   * Apply strength effect - enhance strength (stacks)
   */
  static applyStrengthEffect(targetPlayer, bard) {
    // Stack strength by one level (or grant if none)
    const currentStrength = targetPlayer.getEffect('strength');
    const newLevel = currentStrength ? currentStrength.amplifier + 1 : 0;
    
    targetPlayer.addEffect('strength', 60, { 
      amplifier: Math.min(newLevel, 4), // Cap at Strength V
      showParticles: true 
    });
    
    // Also buff speed slightly
    const currentSpeed = targetPlayer.getEffect('speed');
    const speedLevel = currentSpeed ? currentSpeed.amplifier + 1 : 0;
    
    targetPlayer.addEffect('speed', 60, {
      amplifier: Math.min(speedLevel, 3), // Cap at Speed IV
      showParticles: false
    });
    
    // Particles
    if (targetPlayer.id !== bard.id) {
      targetPlayer.dimension.spawnParticle('minecraft:lava_particle', {
        x: targetPlayer.location.x,
        y: targetPlayer.location.y + 1,
        z: targetPlayer.location.z
      });
    }
  }
  
  /**
   * Apply recovery effect - heal and restore spirit
   */
  static applyRecoveryEffect(targetPlayer, bard) {
    // Grant regeneration (stacks)
    const currentRegen = targetPlayer.getEffect('regeneration');
    const newLevel = currentRegen ? currentRegen.amplifier + 1 : 0;
    
    targetPlayer.addEffect('regeneration', 60, { 
      amplifier: Math.min(newLevel, 3), // Cap at Regen IV
      showParticles: true 
    });
    
    // Restore spirit (every 2 seconds) - done in processSongs
    // Note: Spirit restoration happens in the main processing loop
    
    // Particles
    if (targetPlayer.id !== bard.id) {
      targetPlayer.dimension.spawnParticle('minecraft:heart_particle', {
        x: targetPlayer.location.x,
        y: targetPlayer.location.y + 1,
        z: targetPlayer.location.z
      });
    }
  }
  
  /**
   * End the song
   */
  static endSong(player) {
    const songData = this.activeSongs.get(player.name);
    if (!songData) return;
    
    const songName = songData.type === this.ABILITIES.SONG_OF_COURAGE ? 'courage' 
      : songData.type === this.ABILITIES.SONG_OF_STRENGTH ? 'strength'
      : 'recovery';
      
    player.sendMessage(`§7Your song of ${songName} fades away...`);
    
    this.activeSongs.delete(player.name);
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.SONG_OF_COURAGE]: 
        `§7Cost: ${this.COURAGE_SPIRIT_COST} Spirit\n§7Removes debuffs, grants Resistance`,
      [this.ABILITIES.SONG_OF_STRENGTH]: 
        `§7Cost: ${this.STRENGTH_SPIRIT_COST} Spirit\n§7Enhances Strength and Speed for allies`,
      [this.ABILITIES.SONG_OF_RECOVERY]:
        `§7Cost: ${this.RECOVERY_SPIRIT_COST} Spirit\n§7Grants Regeneration and restores Spirit`
    };
    return descriptions[abilityId] || 'Unknown ability';
  }
  
  /**
   * Get all available songs
   */
  static getAllSongs() {
    return [
      {
        id: this.ABILITIES.SONG_OF_COURAGE,
        name: '§6Song of Courage',
        description: 'Removes debuffs, grants Resistance',
        cost: this.COURAGE_SPIRIT_COST
      },
      {
        id: this.ABILITIES.SONG_OF_STRENGTH,
        name: '§cSong of Strength',
        description: 'Enhances Strength and Speed',
        cost: this.STRENGTH_SPIRIT_COST
      },
      {
        id: this.ABILITIES.SONG_OF_RECOVERY,
        name: '§bSong of Recovery',
        description: 'Grants Regeneration and Spirit',
        cost: this.RECOVERY_SPIRIT_COST
      }
    ];
  }
  
  /**
   * Clean up effects when player loses this sequence
   */
  static removeEffects(player) {
    player.removeEffect('speed');
    player.removeEffect('strength');
    player.removeEffect('jump_boost');
    player.removeEffect('health_boost');
    this.activeSongs.delete(player.name);
    this.selectedSongs.delete(player.name);
  }
}
