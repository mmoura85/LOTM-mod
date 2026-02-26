import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { SleeplessSequence } from './sleepless.js';

export class MidnightPoetSequence {
  static SEQUENCE_NUMBER = 8;
  static PATHWAY = PathwayManager.PATHWAYS.DARKNESS;
  
  // Passive ability constants - STRONGER than Sleepless
  static NIGHT_VISION_DURATION = 999999;
  static SPEED_AMPLIFIER = 2; // Speed II (upgraded from Sleepless)
  static STRENGTH_AMPLIFIER = 2; // Strength II (upgraded from Sleepless)
  static JUMP_AMPLIFIER = 2; // Jump Boost II (upgraded from Sleepless)
  
  // Poet ability constants
  static SONG_DURATION = 240; // 12 seconds (20 ticks per second)
  static SONG_RANGE = 16; // Blocks
  static FEAR_SPIRIT_COST = 30;
  static PACIFY_SPIRIT_COST = 25;
  static CLEANSE_SPIRIT_COST = 35; // NEW
  
  // Active song tracking (player name -> song data)
  static activeSongs = new Map();
  static selectedSongs = new Map(); // player name -> ability ID
  
  // Ability identifiers
  static ABILITIES = {
    SONG_OF_FEAR: 'song_of_fear',
    SONG_OF_PACIFICATION: 'song_of_pacification',
    SONG_OF_CLEANSING: 'song_of_cleansing' // NEW
  };
  
  // Dynamic property for persistence
  static SELECTED_SONG_PROPERTY = 'lotm:poet_selected_song';
  
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
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    // Allow both Midnight Poet (8) and Nightmare (7)
    return pathway === this.PATHWAY && (sequence <= this.SEQUENCE_NUMBER || sequence === 7);
  }
  
  /**
   * Check if it's nighttime for the player
   */
  static isNighttime(player) {
    return SleeplessSequence.isNighttime(player);
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
    
    // Apply night vision
    const nightVision = player.getEffect('night_vision');
    if (!nightVision || nightVision.duration < 200) {
      player.addEffect('night_vision', this.NIGHT_VISION_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }
    
    // Apply STRONGER physical enhancements
    this.applyPhysicalEnhancements(player);
    
    // Health bonus (2 extra hearts for Sequence 8)
    this.applyHealthBonus(player, 4);
    
    // Phantom immunity (inherited from Sleepless)
    SleeplessSequence.preventPhantomSpawns(player);
    
    // Process active songs
    this.processSongs(player);
  }
  
  /**
   * Apply physical enhancements - STRONGER than Sleepless
   */
  static applyPhysicalEnhancements(player) {
    // Speed II
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
      player.addEffect('speed', this.NIGHT_VISION_DURATION, {
        amplifier: this.SPEED_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Strength II
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.NIGHT_VISION_DURATION, {
        amplifier: this.STRENGTH_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Jump Boost II
    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200) {
      player.addEffect('jump_boost', this.NIGHT_VISION_DURATION, {
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
    const amplifier = bonusHearts - 2;
    
    if (!healthBoost || healthBoost.amplifier !== amplifier || healthBoost.duration < 200) {
      player.addEffect('health_boost', this.NIGHT_VISION_DURATION, {
        amplifier: amplifier,
        showParticles: false
      });
    }
  }
  
  /**
   * Get selected song
   */
  static getSelectedSong(player) {
    return this.selectedSongs.get(player.name) || this.ABILITIES.SONG_OF_FEAR;
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
      case this.ABILITIES.SONG_OF_FEAR:
        return this.useSongOfFear(player);
      case this.ABILITIES.SONG_OF_PACIFICATION:
        return this.useSongOfPacification(player);
      case this.ABILITIES.SONG_OF_CLEANSING:
        return this.useSongOfCleansing(player);
      default:
        return false;
    }
  }
  
  /**
   * Use Song of Fear - makes nearby monsters flee
   */
  static useSongOfFear(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check if already singing
    if (this.activeSongs.has(player.name)) {
      player.sendMessage('§cYou are already performing a song!');
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.FEAR_SPIRIT_COST)) {
      player.sendMessage('§cNot enough spirit! Need ' + this.FEAR_SPIRIT_COST);
      return false;
    }
    
    // Start the song
    this.activeSongs.set(player.name, {
      type: this.ABILITIES.SONG_OF_FEAR,
      ticksRemaining: this.SONG_DURATION,
      playerLocation: player.location
    });
    
    player.sendMessage('§5♪ You begin singing a song of terror... ♪');
    player.playSound('note.harp', { pitch: 0.5, volume: 1.0 });
    
    return true;
  }
  
  /**
   * Use Song of Pacification - makes nearby monsters peaceful
   */
  static useSongOfPacification(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check if already singing
    if (this.activeSongs.has(player.name)) {
      player.sendMessage('§cYou are already performing a song!');
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.PACIFY_SPIRIT_COST)) {
      player.sendMessage('§cNot enough spirit! Need ' + this.PACIFY_SPIRIT_COST);
      return false;
    }
    
    // Start the song
    this.activeSongs.set(player.name, {
      type: this.ABILITIES.SONG_OF_PACIFICATION,
      ticksRemaining: this.SONG_DURATION,
      playerLocation: player.location
    });
    
    player.sendMessage('§b♪ You begin singing a song of peace... ♪');
    player.playSound('note.harp', { pitch: 1.5, volume: 1.0 });
    
    return true;
  }
  
  /**
   * Use Song of Cleansing - removes debuffs from nearby players (NEW)
   */
  static useSongOfCleansing(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check if already singing
    if (this.activeSongs.has(player.name)) {
      player.sendMessage('§cYou are already performing a song!');
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.CLEANSE_SPIRIT_COST)) {
      player.sendMessage('§cNot enough spirit! Need ' + this.CLEANSE_SPIRIT_COST);
      return false;
    }
    
    // Start the song
    this.activeSongs.set(player.name, {
      type: this.ABILITIES.SONG_OF_CLEANSING,
      ticksRemaining: this.SONG_DURATION,
      playerLocation: player.location
    });
    
    player.sendMessage('§a♪ You begin singing a song of cleansing... ♪');
    player.playSound('note.harp', { pitch: 1.0, volume: 1.0 });
    
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
    
    // Apply song effects to nearby entities
    this.applySongEffects(player, songData);
    
    // Play periodic sound effects (every 40 ticks = 2 seconds)
    if (songData.ticksRemaining % 40 === 0) {
      let pitch = 1.0;
      if (songData.type === this.ABILITIES.SONG_OF_FEAR) pitch = 0.5;
      else if (songData.type === this.ABILITIES.SONG_OF_PACIFICATION) pitch = 1.5;
      
      player.playSound('note.harp', { pitch: pitch, volume: 0.8 });
    }
    
    // End song if duration expired
    if (songData.ticksRemaining <= 0) {
      this.endSong(player);
    }
  }
  
  /**
   * Apply song effects to nearby entities
   */
  static applySongEffects(player, songData) {
    if (songData.type === this.ABILITIES.SONG_OF_CLEANSING) {
      // Cleansing affects players only
      this.applyCleansing(player);
    } else {
      // Fear and Pacification affect mobs
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.SONG_RANGE,
        excludeTypes: ['minecraft:player', 'minecraft:item']
      });
      
      for (const entity of entities) {
        // Only affect hostile mobs
        if (!this.isHostileMob(entity)) continue;
        
        if (songData.type === this.ABILITIES.SONG_OF_FEAR) {
          this.applyFearEffect(entity, player);
        } else if (songData.type === this.ABILITIES.SONG_OF_PACIFICATION) {
          this.applyPacifyEffect(entity);
        }
      }
    }
  }
  
  /**
   * Apply cleansing effect - remove debuffs from nearby players (NEW)
   */
  static applyCleansing(player) {
    const players = player.dimension.getPlayers({
      location: player.location,
      maxDistance: this.SONG_RANGE
    });
    
    // List of debuffs to remove
    const debuffs = [
      'wither',
      'poison',
      'weakness',
      'slowness',
      'mining_fatigue',
      'nausea',
      'blindness',
      'hunger',
      'levitation',
      'fatal_poison'
    ];
    
    for (const targetPlayer of players) {
      let cleansedAny = false;
      
      for (const debuff of debuffs) {
        const effect = targetPlayer.getEffect(debuff);
        if (effect) {
          targetPlayer.removeEffect(debuff);
          cleansedAny = true;
        }
      }
      
      if (cleansedAny) {
        // Visual feedback
        targetPlayer.dimension.spawnParticle('minecraft:heart_particle', {
          x: targetPlayer.location.x,
          y: targetPlayer.location.y + 1,
          z: targetPlayer.location.z
        });
        
        if (targetPlayer.id !== player.id) {
          targetPlayer.sendMessage('§a§oYou feel refreshed by the cleansing song!');
        }
      }
    }
  }
  
  /**
   * Apply fear effect - mob runs away
   */
  static applyFearEffect(entity, player) {
    // Apply slowness so they don't run too fast, and weakness
    entity.addEffect('slowness', 60, { amplifier: 1, showParticles: true });
    entity.addEffect('weakness', 60, { amplifier: 2, showParticles: false });
    
    // Calculate direction away from player
    const dx = entity.location.x - player.location.x;
    const dz = entity.location.z - player.location.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance > 0) {
      // Normalize and apply knockback in opposite direction
      const knockbackX = (dx / distance) * 0.5;
      const knockbackZ = (dz / distance) * 0.5;
      
      entity.applyKnockback(knockbackX, knockbackZ, 0.5, 0.2);
    }
    
    // Add particle effect
    entity.dimension.spawnParticle('minecraft:villager_angry', entity.location);
  }
  
  /**
   * Apply pacification effect - mob becomes peaceful
   */
  static applyPacifyEffect(entity) {
    // Apply slowness to make them stand mostly still
    entity.addEffect('slowness', 60, { amplifier: 5, showParticles: false });
    entity.addEffect('weakness', 60, { amplifier: 10, showParticles: false });
    
    // Add particle effect
    entity.dimension.spawnParticle('minecraft:heart_particle', entity.location);
  }
  
  /**
   * Check if entity is a hostile mob
   */
  static isHostileMob(entity) {
    const hostileMobs = [
      'minecraft:zombie', 'minecraft:skeleton', 'minecraft:creeper',
      'minecraft:spider', 'minecraft:cave_spider', 'minecraft:enderman',
      'minecraft:witch', 'minecraft:blaze', 'minecraft:ghast',
      'minecraft:phantom', 'minecraft:drowned', 'minecraft:husk',
      'minecraft:stray', 'minecraft:wither_skeleton', 'minecraft:piglin',
      'minecraft:hoglin', 'minecraft:zoglin', 'minecraft:pillager',
      'minecraft:vindicator', 'minecraft:evoker', 'minecraft:ravager',
      'minecraft:vex', 'minecraft:silverfish', 'minecraft:endermite',
      'minecraft:shulker', 'minecraft:slime', 'minecraft:magma_cube'
    ];
    
    return hostileMobs.includes(entity.typeId);
  }
  
  /**
   * End the song
   */
  static endSong(player) {
    const songData = this.activeSongs.get(player.name);
    if (!songData) return;
    
    const songName = songData.type === this.ABILITIES.SONG_OF_FEAR ? 'terror' 
      : songData.type === this.ABILITIES.SONG_OF_PACIFICATION ? 'peace'
      : 'cleansing';
      
    player.sendMessage(`§7Your song of ${songName} fades away...`);
    
    this.activeSongs.delete(player.name);
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.SONG_OF_FEAR]: 
        `§7Cost: ${this.FEAR_SPIRIT_COST} Spirit\n§7Makes enemies flee in terror`,
      [this.ABILITIES.SONG_OF_PACIFICATION]: 
        `§7Cost: ${this.PACIFY_SPIRIT_COST} Spirit\n§7Pacifies enemies, preventing attacks`,
      [this.ABILITIES.SONG_OF_CLEANSING]:
        `§7Cost: ${this.CLEANSE_SPIRIT_COST} Spirit\n§7Removes debuffs from nearby players`
    };
    return descriptions[abilityId] || 'Unknown ability';
  }
  
  /**
   * Get all available songs
   */
  static getAllSongs() {
    return [
      {
        id: this.ABILITIES.SONG_OF_FEAR,
        name: '§cSong of Fear',
        description: 'Makes enemies flee',
        cost: this.FEAR_SPIRIT_COST
      },
      {
        id: this.ABILITIES.SONG_OF_PACIFICATION,
        name: '§bSong of Pacification',
        description: 'Calms enemies',
        cost: this.PACIFY_SPIRIT_COST
      },
      {
        id: this.ABILITIES.SONG_OF_CLEANSING,
        name: '§aSong of Cleansing',
        description: 'Removes ally debuffs',
        cost: this.CLEANSE_SPIRIT_COST
      }
    ];
  }
  
  /**
   * Clean up effects when player loses this sequence
   */
  static removeEffects(player) {
    SleeplessSequence.removeEffects(player);
    this.activeSongs.delete(player.name);
    this.selectedSongs.delete(player.name);
  }
}
