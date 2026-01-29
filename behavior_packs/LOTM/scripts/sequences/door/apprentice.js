import { world, system, EffectTypes } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

export class ApprenticeSequence {
  static SEQUENCE_NUMBER = 9;
  static PATHWAY = 'door';
  
  // Passive ability constants
  static EFFECT_DURATION = 400; // ~20 seconds to prevent flicker
  static SPEED_AMPLIFIER = 0; // Speed I
  static JUMP_AMPLIFIER = 0; // Jump Boost I
  
  // Door Opening ability constants
  static DOOR_OPENING_SPIRIT_COST = 15;
  static MAX_WALL_THICKNESS = 6; // Maximum blocks to phase through
  static TELEPORT_COOLDOWN = 60; // 3 seconds between uses
  
  // Track teleport cooldowns (player name -> ticks remaining)
  static teleportCooldowns = new Map();
  
  // Ability identifiers
  static ABILITIES = {
    DOOR_OPENING: 'door_opening'
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
    
    // Enhanced mobility for mystical travel
    this.applyMobilityEnhancements(player);
    
    // Small health bonus (1 extra heart for Sequence 9)
    this.applyHealthBonus(player, 2);
    
    // Tick down cooldowns
    this.tickCooldowns(player);
  }
  
  /**
   * Apply mobility enhancements
   */
  static applyMobilityEnhancements(player) {
    // Speed II - for quick escapes through doors
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, {
        amplifier: this.SPEED_AMPLIFIER,
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
   * Tick down cooldowns
   */
  static tickCooldowns(player) {
    const cooldown = this.teleportCooldowns.get(player.name);
    if (cooldown && cooldown > 0) {
      this.teleportCooldowns.set(player.name, cooldown - 1);
    }
  }
  
  /**
   * Check if on cooldown
   */
  static isOnCooldown(player) {
    const cooldown = this.teleportCooldowns.get(player.name) || 0;
    return cooldown > 0;
  }
  
  /**
   * Use Door Opening ability - phase through walls
   */
  static useDoorOpening(player) {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    // Allow both Apprentice (Seq 9) and Trickmaster (Seq 8) to use this
    if (pathway !== this.PATHWAY || (sequence !== 9 && sequence !== 8)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    // if (this.isOnCooldown(player)) {
      const remaining = Math.ceil(this.teleportCooldowns.get(player.name) / 20);
    //   player.sendMessage(`§cDoor Opening on cooldown: ${remaining}s`);
    //   return false;
    // }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.DOOR_OPENING_SPIRIT_COST)) {
      player.sendMessage('§cNot enough spirit! Need ' + this.DOOR_OPENING_SPIRIT_COST);
      return false;
    }
    
    // Get player's view direction and eye location
    const viewDirection = player.getViewDirection();
    const eyeLoc = player.getHeadLocation();
    
    // Find wall block player is looking at
    let wallLoc = null;
    for (let i = 1; i <= 5; i++) {
      const checkLoc = {
        x: Math.floor(eyeLoc.x + viewDirection.x * i),
        y: Math.floor(eyeLoc.y + viewDirection.y * i),
        z: Math.floor(eyeLoc.z + viewDirection.z * i)
      };
      
      const block = player.dimension.getBlock(checkLoc);
      if (block && !block.isAir && !block.isLiquid) {
        wallLoc = checkLoc;
        break;
      }
    }
    
    if (!wallLoc) {
      player.sendMessage('§cNo wall detected!');
      SpiritSystem.restoreSpirit(player, this.DOOR_OPENING_SPIRIT_COST);
      return false;
    }
    
    // Check if there's a cavity behind the wall (up to 6 blocks deep)
    let teleportLoc = null;
    let wallDepth = 0;
    
    for (let depth = 1; depth <= this.MAX_WALL_THICKNESS; depth++) {
      const checkLoc = {
        x: wallLoc.x + Math.round(viewDirection.x * depth),
        y: wallLoc.y,
        z: wallLoc.z + Math.round(viewDirection.z * depth)
      };
      
      const checkBlock = player.dimension.getBlock(checkLoc);
      const blockAbove = player.dimension.getBlock({
        x: checkLoc.x,
        y: checkLoc.y + 1,
        z: checkLoc.z
      });
      const blockBelow = player.dimension.getBlock({
        x: checkLoc.x,
        y: checkLoc.y - 1,
        z: checkLoc.z
      });
      
      // Found a cavity (air block with air above and solid floor below)
      if (checkBlock && (checkBlock.isAir || checkBlock.isLiquid) && 
          blockAbove && (blockAbove.isAir || blockAbove.isLiquid)) {
        teleportLoc = {
          x: checkLoc.x + 0.5,
          y: checkLoc.y,
          z: checkLoc.z + 0.5
        };
        wallDepth = depth;
        break;
      }
    }
    
    // Place visual indicator at wall location
    const doorLoc = {
      x: wallLoc.x + 0.5,
      y: wallLoc.y + 0.5,
      z: wallLoc.z + 0.5
    };
    
    if (teleportLoc) {
      // SUCCESS - Found cavity
      player.sendMessage(`§5§oA Door opens ${wallDepth} blocks ahead...`);
      player.playSound('block.portal.trigger', { pitch: 1.2, volume: 1.0 });
      
      // Spawn particles at door location
      for (let i = 0; i < 20; i++) {
        system.runTimeout(() => {
          player.dimension.spawnParticle('minecraft:portal_directional', doorLoc);
          player.dimension.spawnParticle('minecraft:portal_directional', {
            x: doorLoc.x,
            y: doorLoc.y + 1,
            z: doorLoc.z
          });
        }, i * 3);
      }
      
      // Teleport after brief delay
      system.runTimeout(() => {
        try {
          player.teleport(teleportLoc, { 
            dimension: player.dimension, 
            rotation: player.getRotation() 
          });
          player.playSound('mob.endermen.portal', { pitch: 1.0, volume: 1.0 });
          
          // Spawn particles at destination
          for (let i = 0; i < 10; i++) {
            system.runTimeout(() => {
              player.dimension.spawnParticle('minecraft:portal_directional', teleportLoc);
            }, i * 2);
          }
          
          player.sendMessage('§5§oYou step through the Door...');
          
          // Set cooldown ONLY on successful teleport
          ApprenticeSequence.teleportCooldowns.set(player.name, ApprenticeSequence.TELEPORT_COOLDOWN);
          
        } catch (e) {
          player.sendMessage('§cTeleportation failed!');
          SpiritSystem.restoreSpirit(player, this.DOOR_OPENING_SPIRIT_COST);
        }
      }, 40); // 2 second delay
      
      return true;
      
    } else {
      // FAILURE - No cavity found
      player.sendMessage('§c§oNo passage detected - wall too thick or no cavity');
      player.playSound('random.break', { pitch: 0.8, volume: 1.0 });
      SpiritSystem.restoreSpirit(player, this.DOOR_OPENING_SPIRIT_COST);
      
      // Spawn failure particles
      for (let i = 0; i < 10; i++) {
        system.runTimeout(() => {
          player.dimension.spawnParticle('minecraft:lava_particle', doorLoc);
        }, i * 3);
      }
      
      return false;
    }
  }
  
  /**
   * Open locks - break nearby locked blocks (chests, doors, trapdoors, gates)
   */
  static openLocks(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Consume small amount of spirit
    if (!SpiritSystem.consumeSpirit(player, 10)) {
      player.sendMessage('§cNot enough spirit! Need 10');
      return false;
    }
    
    try {
      const location = player.location;
      const viewDirection = player.getViewDirection();
      
      // Check block player is looking at (up to 5 blocks away)
      for (let i = 1; i <= 5; i++) {
        const checkX = Math.floor(location.x + viewDirection.x * i);
        const checkY = Math.floor(location.y + viewDirection.y * i + 1.6); // Eye level
        const checkZ = Math.floor(location.z + viewDirection.z * i);
        
        const block = player.dimension.getBlock({ x: checkX, y: checkY, z: checkZ });
        
        if (block && this.isLockableBlock(block)) {
          // "Open" the lock by setting the block to air or open state
          player.runCommand(`setblock ${checkX} ${checkY} ${checkZ} air destroy`);
          player.playSound('random.door_open', { pitch: 0.8, volume: 1.0 });
          player.sendMessage('§aLock opened!');
          return true;
        }
      }
      
      player.sendMessage('§7No locks found nearby.');
      SpiritSystem.restoreSpirit(player, 10);
      return false;
      
    } catch (e) {
      player.sendMessage('§cFailed to open lock!');
      SpiritSystem.restoreSpirit(player, 10);
      return false;
    }
  }
  
  /**
   * Check if block can be "locked"
   */
  static isLockableBlock(block) {
    const lockableBlocks = [
      'minecraft:chest',
      'minecraft:trapped_chest',
      'minecraft:barrel',
      'minecraft:oak_door',
      'minecraft:spruce_door',
      'minecraft:birch_door',
      'minecraft:jungle_door',
      'minecraft:acacia_door',
      'minecraft:dark_oak_door',
      'minecraft:iron_door',
      'minecraft:iron_trapdoor',
      'minecraft:oak_trapdoor',
      'minecraft:fence_gate',
      'minecraft:spruce_fence_gate',
      'minecraft:birch_fence_gate',
      'minecraft:jungle_fence_gate',
      'minecraft:acacia_fence_gate',
      'minecraft:dark_oak_fence_gate'
    ];
    
    return lockableBlocks.some(type => block.typeId === type);
  }
  
  /**
   * Handle ability usage from item
   */
  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
      case this.ABILITIES.DOOR_OPENING:
        return this.useDoorOpening(player);
      default:
        return false;
    }
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.DOOR_OPENING]: 
        `§7Cost: ${this.DOOR_OPENING_SPIRIT_COST} Spirit\n§7Phase through walls (max ${this.MAX_WALL_THICKNESS} blocks)`
    };
    return descriptions[abilityId] || 'Unknown ability';
  }
  
  /**
   * Clean up effects when player loses this sequence
   */
  static removeEffects(player) {
    player.removeEffect('speed');
    player.removeEffect('jump_boost');
    player.removeEffect('health_boost');
    this.teleportCooldowns.delete(player.name);
  }
}