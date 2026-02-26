import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { BardSequence } from './bard.js';

export class LightSuppliantSequence {
  static SEQUENCE_NUMBER = 8;
  static PATHWAY = 'sun';
  
  // Passive ability constants - ENHANCED from Bard
  static EFFECT_DURATION = 999999;
  static SPEED_AMPLIFIER = 2; // Speed III
  static STRENGTH_AMPLIFIER = 2; // Strength III
  static JUMP_AMPLIFIER = 2; // Jump Boost III
  
  // Sunshine ability
  static SUNSHINE_SPIRIT_COST = 35;
  static SUNSHINE_DURATION = 200; // 10 seconds
  static SUNSHINE_RANGE = 20; // blocks
  static SUNSHINE_DAMAGE = 6; // vs undead
  static SUNSHINE_COOLDOWN = 300; // 15 seconds
  
  // Daytime ability
  static DAYTIME_SPIRIT_COST = 40;
  static DAYTIME_DURATION = 300; // 15 seconds
  static DAYTIME_RANGE = 10; // initial 10m, spreads further
  static DAYTIME_SPREAD_RANGE = 30; // total spread
  static DAYTIME_COOLDOWN = 400; // 20 seconds
  
  // Blessing ability
  static BLESSING_SPIRIT_COST = 30;
  static BLESSING_DURATION = 240; // 12 seconds
  static BLESSING_RANGE = 16; // blocks
  
  // Cleansing Song (new)
  static CLEANSING_SPIRIT_COST = 35;
  static CLEANSING_SONG_DURATION = 200; // 10 seconds
  static CLEANSING_RANGE = 20; // blocks
  
  // Tracking
  static sunshineCooldowns = new Map();
  static daytimeCooldowns = new Map();
  static activeSunshines = new Map(); // player name -> {location, dimension, ticksRemaining}
  static activeDaytimes = new Map(); // player name -> {location, dimension, ticksRemaining}
  
  // Ability identifiers
  static ABILITIES = {
    SUNSHINE: 'sunshine',
    BLESSING: 'blessing',
    DAYTIME: 'daytime',
    SONG_OF_CLEANSING: 'song_of_cleansing' // New song
  };
  
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
    
    // INHERIT Bard songs
    BardSequence.processSongs(player);
    
    // Load Bard's selected song
    if (!BardSequence.selectedSongs.has(player.name)) {
      BardSequence.loadSelectedSong(player);
    }
    
    // Enhanced physical abilities
    this.applyPhysicalEnhancements(player);
    
    // Health bonus (2 extra hearts for Sequence 8)
    this.applyHealthBonus(player, 4);
    
    // Night Vision (permanent)
    const nightVision = player.getEffect('night_vision');
    if (!nightVision || nightVision.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }
    
    // Evil Detection - apply glowing to undead in range
    this.applyEvilDetection(player);
    
    // Process active abilities
    this.processSunshine(player);
    this.processDaytime(player);
    
    // Tick down cooldowns
    this.tickCooldowns(player);
  }
  
  /**
   * Apply enhanced physical abilities
   */
  static applyPhysicalEnhancements(player) {
    // Speed III
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, {
        amplifier: this.SPEED_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Strength III
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, {
        amplifier: this.STRENGTH_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Jump Boost III
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
   * Evil Detection - sense undead/evil nearby
   */
  static applyEvilDetection(player) {
    // Every 2 seconds, check for undead
    if (world.getAbsoluteTime() % 40 !== 0) return;
    
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: 32,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      
      for (const entity of entities) {
        if (this.isUndeadOrEvil(entity)) {
          // Apply glowing for detection
          entity.addEffect('glowing', 100, { 
            amplifier: 0, 
            showParticles: false 
          });
        }
      }
    } catch (e) {
      // Failed
    }
  }
  
  /**
   * Check if entity is undead or evil
   */
  static isUndeadOrEvil(entity) {
    const evilTypes = [
      'minecraft:zombie', 'minecraft:zombie_villager', 'minecraft:husk',
      'minecraft:drowned', 'minecraft:skeleton', 'minecraft:stray',
      'minecraft:wither_skeleton', 'minecraft:zombie_pigman',
      'minecraft:zombified_piglin', 'minecraft:phantom', 'minecraft:wither',
      'minecraft:zoglin', 'minecraft:witch', 'minecraft:vex', 
      'minecraft:evoker', 'minecraft:vindicator', 'minecraft:pillager',
      'minecraft:enderman', 'minecraft:endermite', 'minecraft:shulker'
    ];
    
    return evilTypes.includes(entity.typeId);
  }
  
  /**
   * Tick down cooldowns
   */
  static tickCooldowns(player) {
    const sunshineCd = this.sunshineCooldowns.get(player.name);
    if (sunshineCd && sunshineCd > 0) {
      this.sunshineCooldowns.set(player.name, sunshineCd - 1);
    }
    
    const daytimeCd = this.daytimeCooldowns.get(player.name);
    if (daytimeCd && daytimeCd > 0) {
      this.daytimeCooldowns.set(player.name, daytimeCd - 1);
    }
  }
  
  /**
   * Use Sunshine - create scorching sun that damages undead
   */
  static useSunshine(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.sunshineCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cSunshine on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.SUNSHINE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.SUNSHINE_SPIRIT_COST}`);
      return false;
    }
    
    // Create sunshine
    this.activeSunshines.set(player.name, {
      location: player.location,
      dimension: player.dimension,
      ticksRemaining: this.SUNSHINE_DURATION
    });
    
    player.sendMessage('§e§l☀ SUNSHINE! ☀');
    player.playSound('beacon.activate', { pitch: 1.5, volume: 1.0 });
    
    // Set cooldown
    this.sunshineCooldowns.set(player.name, this.SUNSHINE_COOLDOWN);
    
    return true;
  }
  
  /**
   * Process Sunshine each tick
   */
  static processSunshine(player) {
    const sunshine = this.activeSunshines.get(player.name);
    if (!sunshine) return;
    
    sunshine.ticksRemaining--;
    
    // Spawn sun particles
    if (sunshine.ticksRemaining % 5 === 0) {
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        sunshine.dimension.spawnParticle('minecraft:lava_particle', {
          x: sunshine.location.x + Math.cos(angle) * 3,
          y: sunshine.location.y + 5,
          z: sunshine.location.z + Math.sin(angle) * 3
        });
        sunshine.dimension.spawnParticle('minecraft:totem_particle', {
          x: sunshine.location.x,
          y: sunshine.location.y + 5,
          z: sunshine.location.z
        });
      }
    }
    
    // Damage undead every second
    if (sunshine.ticksRemaining % 20 === 0) {
      this.applySunshineDamage(sunshine.dimension, sunshine.location);
    }
    
    // Blind nearby entities every 2 seconds
    if (sunshine.ticksRemaining % 40 === 0) {
      this.applySunshineBlind(sunshine.dimension, sunshine.location);
    }
    
    // End sunshine
    if (sunshine.ticksRemaining <= 0) {
      this.activeSunshines.delete(player.name);
      player.sendMessage('§7The sunshine fades...');
    }
  }
  
  /**
   * Apply sunshine damage to undead
   */
  static applySunshineDamage(dimension, location) {
    try {
      const entities = dimension.getEntities({
        location: location,
        maxDistance: this.SUNSHINE_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      
      for (const entity of entities) {
        if (this.isUndeadOrEvil(entity)) {
          entity.applyDamage(this.SUNSHINE_DAMAGE);
          entity.setOnFire(2, true);
        }
      }
    } catch (e) {
      // Failed
    }
  }
  
  /**
   * Apply sunshine blindness effect
   */
  static applySunshineBlind(dimension, location) {
    try {
      const entities = dimension.getEntities({
        location: location,
        maxDistance: this.SUNSHINE_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      
      for (const entity of entities) {
        entity.addEffect('blindness', 40, {
          amplifier: 0,
          showParticles: true
        });
      }
    } catch (e) {
      // Failed
    }
  }
  
  /**
   * Use Blessing - protect allies from fear, cold, darkness, death
   */
  static useBlessing(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.BLESSING_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.BLESSING_SPIRIT_COST}`);
      return false;
    }
    
    // Apply blessing to nearby players
    const players = player.dimension.getPlayers({
      location: player.location,
      maxDistance: this.BLESSING_RANGE
    });
    
    for (const targetPlayer of players) {
      // Remove negative effects
      targetPlayer.removeEffect('wither');
      targetPlayer.removeEffect('poison');
      targetPlayer.removeEffect('weakness');
      targetPlayer.removeEffect('slowness');
      targetPlayer.removeEffect('blindness');
      
      // Grant protective buffs
      targetPlayer.addEffect('resistance', this.BLESSING_DURATION, {
        amplifier: 2,
        showParticles: true
      });
      
      targetPlayer.addEffect('fire_resistance', this.BLESSING_DURATION, {
        amplifier: 0,
        showParticles: false
      });
      
      // Extra damage vs undead (Strength II)
      targetPlayer.addEffect('strength', this.BLESSING_DURATION, {
        amplifier: 1,
        showParticles: true
      });
      
      // Visual effect
      targetPlayer.dimension.spawnParticle('minecraft:totem_particle', {
        x: targetPlayer.location.x,
        y: targetPlayer.location.y + 1,
        z: targetPlayer.location.z
      });
      
      if (targetPlayer.id !== player.id) {
        targetPlayer.sendMessage('§e§oYou feel blessed by holy light!');
      }
    }
    
    player.sendMessage('§e§lBlessing granted!');
    player.playSound('random.levelup', { pitch: 1.2, volume: 1.0 });
    
    return true;
  }
  
  /**
   * Use Daytime - create spreading light zone
   */
  static useDaytime(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.daytimeCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cDaytime on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.DAYTIME_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.DAYTIME_SPIRIT_COST}`);
      return false;
    }
    
    // Create daytime zone
    this.activeDaytimes.set(player.name, {
      location: player.location,
      dimension: player.dimension,
      ticksRemaining: this.DAYTIME_DURATION
    });
    
    player.sendMessage('§e§lLet there be light!');
    player.playSound('beacon.activate', { pitch: 1.0, volume: 1.0 });
    
    // Set cooldown
    this.daytimeCooldowns.set(player.name, this.DAYTIME_COOLDOWN);
    
    return true;
  }
  
  /**
   * Process Daytime each tick
   */
  static processDaytime(player) {
    const daytime = this.activeDaytimes.get(player.name);
    if (!daytime) return;
    
    daytime.ticksRemaining--;
    
    // Spawn spreading light particles
    if (daytime.ticksRemaining % 10 === 0) {
      const progress = 1 - (daytime.ticksRemaining / this.DAYTIME_DURATION);
      const currentRange = this.DAYTIME_RANGE + (this.DAYTIME_SPREAD_RANGE - this.DAYTIME_RANGE) * progress;
      
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        daytime.dimension.spawnParticle('minecraft:totem_particle', {
          x: daytime.location.x + Math.cos(angle) * currentRange,
          y: daytime.location.y + 1,
          z: daytime.location.z + Math.sin(angle) * currentRange
        });
      }
    }
    
    // Apply light effects (every 2 seconds)
    if (daytime.ticksRemaining % 40 === 0) {
      this.applyDaytimeEffects(daytime.dimension, daytime.location);
    }
    
    // End daytime
    if (daytime.ticksRemaining <= 0) {
      this.activeDaytimes.delete(player.name);
      player.sendMessage('§7The light fades...');
    }
  }
  
  /**
   * Apply daytime light effects
   */
  static applyDaytimeEffects(dimension, location) {
    try {
      const entities = dimension.getEntities({
        location: location,
        maxDistance: this.DAYTIME_SPREAD_RANGE,
        excludeTypes: ['minecraft:item']
      });
      
      for (const entity of entities) {
        if (this.isUndeadOrEvil(entity)) {
          // Damage undead in the light
          entity.applyDamage(3);
          entity.addEffect('weakness', 40, {
            amplifier: 1,
            showParticles: true
          });
        } else if (entity.typeId === 'minecraft:player') {
          // Buff players in the light
          entity.addEffect('regeneration', 40, {
            amplifier: 0,
            showParticles: false
          });
        }
      }
    } catch (e) {
      // Failed
    }
  }
  
  /**
   * Use Song of Cleansing (NEW) - removes debuffs from allies
   */
  static useSongOfCleansing(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check if already singing
    if (BardSequence.activeSongs.has(player.name)) {
      player.sendMessage('§cYou are already performing a song!');
      return false;
    }
    
    // Consume spirit (cheaper than Bard's songs due to ritualistic knowledge)
    if (!SpiritSystem.consumeSpirit(player, this.CLEANSING_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.CLEANSING_SPIRIT_COST}`);
      return false;
    }
    
    // Start the song using Bard's system
    BardSequence.activeSongs.set(player.name, {
      type: this.ABILITIES.SONG_OF_CLEANSING,
      ticksRemaining: this.CLEANSING_SONG_DURATION,
      playerLocation: player.location
    });
    
    player.sendMessage('§a♪ You begin singing a song of cleansing... ♪');
    player.playSound('note.harp', { pitch: 1.4, volume: 1.0 });
    
    return true;
  }
  
  /**
   * Handle ability usage
   */
  static handleAbilityUse(player, abilityId) {
    // Check for Light Suppliant abilities first
    switch (abilityId) {
      case this.ABILITIES.SUNSHINE:
        return this.useSunshine(player);
      case this.ABILITIES.BLESSING:
        return this.useBlessing(player);
      case this.ABILITIES.DAYTIME:
        return this.useDaytime(player);
      case this.ABILITIES.SONG_OF_CLEANSING:
        return this.useSongOfCleansing(player);
      default:
        // Fall back to Bard songs - use the song directly
        return BardSequence.useSong(player, abilityId);
    }
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.SUNSHINE]: 
        `§7Cost: ${this.SUNSHINE_SPIRIT_COST} Spirit\n§7Create scorching sun (10s)\n§7Damages and blinds enemies`,
      [this.ABILITIES.BLESSING]:
        `§7Cost: ${this.BLESSING_SPIRIT_COST} Spirit\n§7Protect allies from evil\n§7Remove debuffs, grant buffs`,
      [this.ABILITIES.DAYTIME]:
        `§7Cost: ${this.DAYTIME_SPIRIT_COST} Spirit\n§7Create spreading light (15s)\n§7Damages undead, heals allies`,
      [this.ABILITIES.SONG_OF_CLEANSING]:
        `§7Cost: ${this.CLEANSING_SPIRIT_COST} Spirit\n§7Remove all debuffs from allies\n§7Enhanced by ritualistic knowledge`
    };
    return descriptions[abilityId] || BardSequence.getAbilityDescription(abilityId);
  }
  
  /**
   * Get all available songs (includes Bard + new cleansing)
   */
  static getAllSongs() {
    const bardSongs = BardSequence.getAllSongs();
    return [
      ...bardSongs,
      {
        id: this.ABILITIES.SONG_OF_CLEANSING,
        name: '§aSong of Cleansing',
        description: 'Removes all debuffs from allies',
        cost: this.CLEANSING_SPIRIT_COST
      }
    ];
  }
  
  /**
   * Clean up effects
   */
  static removeEffects(player) {
    BardSequence.removeEffects(player);
    player.removeEffect('night_vision');
    this.activeSunshines.delete(player.name);
    this.activeDaytimes.delete(player.name);
    this.sunshineCooldowns.delete(player.name);
    this.daytimeCooldowns.delete(player.name);
  }
}
