import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { TrickmasterSequence } from './trickmaster.js';

export class AstrologerSequence {
  static SEQUENCE_NUMBER = 7;
  static PATHWAY = 'door';
  
  // Passive ability constants - ENHANCED from Trickmaster
  static EFFECT_DURATION = 999999;
  static SPEED_AMPLIFIER = 2; // Speed III (maintained)
  static JUMP_AMPLIFIER = 2; // Jump Boost III (maintained)
  
  // Crystal Ball ability
  static CRYSTAL_BALL_SPIRIT_COST = 30;
  static CRYSTAL_BALL_SCAN_RANGE = 256; // blocks to scan
  static CRYSTAL_BALL_COOLDOWN = 600; // 30 seconds
  
  // Enhanced Door Opening
  static DOOR_OPENING_SPIRIT_COST = 12; // Reduced from 15
  static MAX_WALL_THICKNESS = 10; // Increased from 6
  
  // Spiritual Intuition (danger sense)
  static DANGER_SENSE_RANGE = 16;
  static DANGER_SENSE_INTERVAL = 40; // Check every 2 seconds
  
  // Track cooldowns and states
  static crystalBallCooldowns = new Map();
  static dangerSenseTicks = new Map();
  static trackedStructures = new Map(); // player name -> {type, location}
  
  // Ability identifiers
  static ABILITIES = {
    CRYSTAL_BALL_SCRYING: 'crystal_ball_scrying',
    DOOR_OPENING: 'door_opening',
    PEEK_DOOR: 'peek_door'
  };
  
  // Scryable targets
  static SCRYABLE_TARGETS = {
    VILLAGE: 'village',
    TEMPLE: 'temple',
    MANSION: 'mansion',
    STRONGHOLD: 'stronghold',
    MINESHAFT: 'mineshaft',
    MONUMENT: 'monument',
    FORTRESS: 'fortress',
    BASTION: 'bastion',
    END_CITY: 'endcity',
    BURIED_TREASURE: 'buriedtreasure',
    RUINED_PORTAL: 'ruinedportal'
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
    
    // Enhanced mobility (same as Trickmaster)
    this.applyMobilityEnhancements(player);
    
    // Health bonus (3 extra hearts for Sequence 7)
    this.applyHealthBonus(player, 6);
    
    // Spiritual Intuition - danger sense
    this.applySpiritualIntuition(player);
    
    // Night Vision and Regeneration
    const nightVision = player.getEffect('night_vision');
    if (!nightVision || nightVision.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }

    const regen = player.getEffect('regeneration');
    if (!regen || regen.amplifier !== 1 || regen.duration < 200) {
      player.addEffect('regeneration', this.EFFECT_DURATION, {
        amplifier: 1,
        showParticles: false
      });
    }
    
    // Tick down cooldowns
    this.tickCooldowns(player);
    
    // Update crystal ball tracking
    this.updateCrystalBallTracking(player);
  }
  
  /**
   * Apply mobility enhancements
   */
  static applyMobilityEnhancements(player) {
    // Speed III
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, {
        amplifier: this.SPEED_AMPLIFIER,
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
   * Apply spiritual intuition - warns of danger
   */
  static applySpiritualIntuition(player) {
    const ticks = this.dangerSenseTicks.get(player.name) || 0;
    
    if (ticks >= this.DANGER_SENSE_INTERVAL) {
      this.checkForDanger(player);
      this.dangerSenseTicks.set(player.name, 0);
    } else {
      this.dangerSenseTicks.set(player.name, ticks + 1);
    }
  }
  
  /**
   * Check for nearby dangers
   */
  static checkForDanger(player) {
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.DANGER_SENSE_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      
      let dangerLevel = 0;
      const hostileMobs = [
        'minecraft:zombie', 'minecraft:skeleton', 'minecraft:creeper',
        'minecraft:spider', 'minecraft:cave_spider', 'minecraft:enderman',
        'minecraft:witch', 'minecraft:blaze', 'minecraft:ghast',
        'minecraft:phantom', 'minecraft:drowned', 'minecraft:husk',
        'minecraft:wither_skeleton', 'minecraft:evoker', 'minecraft:vindicator',
        'minecraft:ravager', 'minecraft:pillager', 'minecraft:vex',
        'minecraft:warden', 'minecraft:wither', 'minecraft:ender_dragon'
      ];
      
      for (const entity of entities) {
        if (hostileMobs.includes(entity.typeId)) {
          dangerLevel++;
          
          // Higher danger for boss mobs
          if (entity.typeId === 'minecraft:warden' || 
              entity.typeId === 'minecraft:wither' ||
              entity.typeId === 'minecraft:ender_dragon') {
            dangerLevel += 5;
          }
        }
      }
      
      // Warn player if danger detected
      if (dangerLevel >= 3) {
        player.sendMessage('§c§l⚠ Your spiritual intuition screams of danger!');
        player.playSound('mob.warden.listening_angry', { pitch: 1.5, volume: 0.5 });
        
        // Apply glowing to dangerous mobs
        for (const entity of entities) {
          if (hostileMobs.includes(entity.typeId)) {
            entity.addEffect('glowing', 100, { amplifier: 0, showParticles: false });
          }
        }
      } else if (dangerLevel > 0) {
        player.sendMessage('§e§oYou sense hostile presences nearby...');
      }
    } catch (e) {
      // Failed to check for danger
    }
  }
  
  /**
   * Tick down cooldowns
   */
  static tickCooldowns(player) {
    const cooldown = this.crystalBallCooldowns.get(player.name);
    if (cooldown && cooldown > 0) {
      this.crystalBallCooldowns.set(player.name, cooldown - 1);
    }
  }
  
  /**
   * Use Crystal Ball Scrying
   */
  static useCrystalBallScrying(player, targetType) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.crystalBallCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      const remaining = Math.ceil(cooldown / 20);
      player.sendMessage(`§cCrystal Ball on cooldown: ${remaining}s`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.CRYSTAL_BALL_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.CRYSTAL_BALL_SPIRIT_COST}`);
      return false;
    }
    
    // Start scrying
    player.sendMessage('§5§oThe crystal ball swirls with mystical energy...');
    player.playSound('block.portal.trigger', { pitch: 1.5, volume: 1.0 });
    
    // Attempt to locate structure
    this.locateStructure(player, targetType);
    
    // Set cooldown
    this.crystalBallCooldowns.set(player.name, this.CRYSTAL_BALL_COOLDOWN);
    
    return true;
  }
  
  /**
   * Locate a structure using the crystal ball
   */
  static locateStructure(player, targetType) {
    try {
      const structureMap = {
        [this.SCRYABLE_TARGETS.VILLAGE]: 'village',
        [this.SCRYABLE_TARGETS.TEMPLE]: 'temple',
        [this.SCRYABLE_TARGETS.MANSION]: 'mansion',
        [this.SCRYABLE_TARGETS.STRONGHOLD]: 'stronghold',
        [this.SCRYABLE_TARGETS.MINESHAFT]: 'mineshaft',
        [this.SCRYABLE_TARGETS.MONUMENT]: 'monument',
        [this.SCRYABLE_TARGETS.FORTRESS]: 'fortress',
        [this.SCRYABLE_TARGETS.BASTION]: 'bastion',
        [this.SCRYABLE_TARGETS.END_CITY]: 'endcity',
        [this.SCRYABLE_TARGETS.BURIED_TREASURE]: 'buriedtreasure',
        [this.SCRYABLE_TARGETS.RUINED_PORTAL]: 'ruinedportal'
      };
      
      const mcStructure = structureMap[targetType];
      if (!mcStructure) {
        player.sendMessage('§cUnknown structure type!');
        return;
      }
      
      const result = player.dimension.runCommand(
        `locate structure ${mcStructure}`
      );
      
      if (result.successCount > 0) {
        // Parse location from result
        const match = result.statusMessage?.match(/(-?\d+),?\s*~?,?\s*(-?\d+)/);
        
        if (match) {
          const structureX = parseInt(match[1]);
          const structureZ = parseInt(match[2]);
          
          // Calculate distance and direction
          const dx = structureX - player.location.x;
          const dz = structureZ - player.location.z;
          const distance = Math.sqrt(dx * dx + dz * dz);
          
          // Store tracking info
          this.trackedStructures.set(player.name, {
            type: targetType,
            location: { x: structureX, z: structureZ },
            distance: distance
          });
          
          player.sendMessage(`§a§lVision revealed! §r§a${targetType} located ${Math.floor(distance)} blocks away`);
          player.playSound('random.levelup', { pitch: 1.2, volume: 1.0 });
        } else {
          player.sendMessage('§c§oThe vision is unclear...');
        }
      } else {
        // No structure found
        player.sendMessage('§c§lThe crystal ball flashes red!');
        player.sendMessage(`§7No ${targetType} found within range.`);
        player.playSound('random.break', { pitch: 0.8, volume: 1.0 });
        
        // Clear tracking
        this.trackedStructures.delete(player.name);
      }
    } catch (e) {
      player.sendMessage('§c§oThe scrying failed!');
      this.trackedStructures.delete(player.name);
    }
  }
  
  /**
   * Update crystal ball tracking display
   */
  static updateCrystalBallTracking(player) {
    const tracked = this.trackedStructures.get(player.name);
    if (!tracked) return;
    
    // Calculate current distance and direction
    const dx = tracked.location.x - player.location.x;
    const dz = tracked.location.z - player.location.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    // Calculate direction (angle in degrees)
    let angle = Math.atan2(dz, dx) * 180 / Math.PI;
    const playerYaw = player.getRotation().y;
    let relativeAngle = angle - playerYaw;
    
    // Normalize angle to -180 to 180
    while (relativeAngle > 180) relativeAngle -= 360;
    while (relativeAngle < -180) relativeAngle += 360;
    
    // Get direction arrow
    let arrow = '↑';
    if (relativeAngle < -157.5 || relativeAngle > 157.5) arrow = '↓';
    else if (relativeAngle >= -157.5 && relativeAngle < -112.5) arrow = '↙';
    else if (relativeAngle >= -112.5 && relativeAngle < -67.5) arrow = '←';
    else if (relativeAngle >= -67.5 && relativeAngle < -22.5) arrow = '↖';
    else if (relativeAngle >= -22.5 && relativeAngle < 22.5) arrow = '↑';
    else if (relativeAngle >= 22.5 && relativeAngle < 67.5) arrow = '↗';
    else if (relativeAngle >= 67.5 && relativeAngle < 112.5) arrow = '→';
    else if (relativeAngle >= 112.5 && relativeAngle < 157.5) arrow = '↘';
    
    // Show actionbar with tracking info
    player.onScreenDisplay.setActionBar(
      `§5${tracked.type} ${arrow} §f${Math.floor(distance)}m §7| §bSpirit: §f${Math.floor(SpiritSystem.getSpirit(player))}§7/§f${SpiritSystem.getMaxSpirit(player)}`
    );
  }
  
  /**
   * Enhanced Door Opening - can bring others
   */
  static useDoorOpening(player, bringOthers = false) {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway !== this.PATHWAY || sequence > 7) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Consume spirit
    const spiritCost = bringOthers ? this.DOOR_OPENING_SPIRIT_COST * 2 : this.DOOR_OPENING_SPIRIT_COST;
    if (!SpiritSystem.consumeSpirit(player, spiritCost)) {
      player.sendMessage(`§cNot enough spirit! Need ${spiritCost}`);
      return false;
    }
    
    const viewDirection = player.getViewDirection();
    const eyeLoc = player.getHeadLocation();
    
    // Find wall
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
      SpiritSystem.restoreSpirit(player, spiritCost);
      return false;
    }
    
    // Find cavity
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
    
    const doorLoc = {
      x: wallLoc.x + 0.5,
      y: wallLoc.y + 0.5,
      z: wallLoc.z + 0.5
    };
    
    if (teleportLoc) {
      player.sendMessage(`§5§oA Door opens ${wallDepth} blocks ahead...`);
      player.playSound('block.portal.trigger', { pitch: 1.2, volume: 1.0 });
      
      // Spawn particles
      for (let i = 0; i < 20; i++) {
        system.runTimeout(() => {
          try {
            player.dimension.spawnParticle('minecraft:portal_directional', doorLoc);
          } catch (e){}
          try {
            player.dimension.spawnParticle('minecraft:portal_directional', {
              x: doorLoc.x,
              y: doorLoc.y + 1,
              z: doorLoc.z
            });
          } catch (e){}
        }, i * 3);
      }
      
      // Teleport after delay
      system.runTimeout(() => {
        try {
          // Teleport player
          player.teleport(teleportLoc, { 
            dimension: player.dimension, 
            rotation: player.getRotation() 
          });
          player.playSound('mob.endermen.portal', { pitch: 1.0, volume: 1.0 });
          
          // If bringing others, teleport nearby players
          if (bringOthers) {
            const nearbyPlayers = player.dimension.getPlayers({
              location: player.location,
              maxDistance: 3,
              excludeNames: [player.name]
            });
            
            for (const otherPlayer of nearbyPlayers) {
              otherPlayer.teleport(teleportLoc, {
                dimension: player.dimension,
                rotation: otherPlayer.getRotation()
              });
              otherPlayer.sendMessage('§5§oYou are pulled through the Door...');
              otherPlayer.playSound('mob.endermen.portal', { pitch: 1.0, volume: 1.0 });
            }
          }
          
          // Spawn particles at destination
          for (let i = 0; i < 10; i++) {
            system.runTimeout(() => {
              try {
                player.dimension.spawnParticle('minecraft:portal_directional', teleportLoc);
              } catch (e){}
            }, i * 2);
          }
          
          player.sendMessage('§5§oYou step through the Door...');
          
        } catch (e) {
          player.sendMessage('§cTeleportation failed!');
          SpiritSystem.restoreSpirit(player, spiritCost);
        }
      }, 40);
      
      return true;
      
    } else {
      player.sendMessage('§c§oNo passage detected - wall too thick or no cavity');
      player.playSound('random.break', { pitch: 0.8, volume: 1.0 });
      SpiritSystem.restoreSpirit(player, spiritCost);
      
      for (let i = 0; i < 10; i++) {
        system.runTimeout(() => {
          try {
            player.dimension.spawnParticle('minecraft:lava_particle', doorLoc);
          } catch (e){}
        }, i * 3);
      }
      
      return false;
    }
  }
  
  /**
   * Peek Door - open small door to see through walls
   */
  static usePeekDoor(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Small spirit cost
    if (!SpiritSystem.consumeSpirit(player, 5)) {
      player.sendMessage('§cNot enough spirit! Need 5');
      return false;
    }
    
    const viewDirection = player.getViewDirection();
    const eyeLoc = player.getHeadLocation();
    
    // Find wall to peek through
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
      player.sendMessage('§cNo wall to peek through!');
      SpiritSystem.restoreSpirit(player, 5);
      return false;
    }
    
    // Create viewing portal - apply glowing to entities on other side
    player.sendMessage('§5§oA tiny door opens, revealing the other side...');
    player.playSound('block.portal.trigger', { pitch: 2.0, volume: 0.5 });
    
    try {
      const beyondLoc = {
        x: wallLoc.x + Math.round(viewDirection.x * 3),
        y: wallLoc.y,
        z: wallLoc.z + Math.round(viewDirection.z * 3)
      };
      
      // Apply glowing to entities on other side
      const entities = player.dimension.getEntities({
        location: beyondLoc,
        maxDistance: 8,
        excludeTypes: ['minecraft:item']
      });
      
      let count = 0;
      for (const entity of entities) {
        entity.addEffect('glowing', 200, { amplifier: 0, showParticles: false });
        count++;
      }
      
      if (count > 0) {
        player.sendMessage(`§7Revealed ${count} entities beyond the wall`);
      } else {
        player.sendMessage('§7Nothing detected on the other side');
      }
      
      // Visual effect at wall
      for (let i = 0; i < 5; i++) {
        system.runTimeout(() => {
          try {
            player.dimension.spawnParticle('minecraft:soul_particle', {
              x: wallLoc.x + 0.5,
              y: wallLoc.y + 0.5,
              z: wallLoc.z + 0.5
            });
          } catch (e){}
        }, i * 10);
      }
      
    } catch (e) {
      player.sendMessage('§cPeeking failed!');
    }
    
    return true;
  }
  
  /**
   * Handle ability usage
   */
  static handleAbilityUse(player, abilityId, param) {
    switch (abilityId) {
      case this.ABILITIES.CRYSTAL_BALL_SCRYING:
        return this.useCrystalBallScrying(player, param);
      case this.ABILITIES.DOOR_OPENING:
        return this.useDoorOpening(player, param);
      case this.ABILITIES.PEEK_DOOR:
        return this.usePeekDoor(player);
      case this.ABILITIES.FLASHBANG:
        return this.useFlashbang(player);
      case this.ABILITIES.BURNING:
        return this.useBurning(player);
      case this.ABILITIES.LIGHTNING:
        return this.useLightning(player);
      case this.ABILITIES.FREEZE_RAY:
      case this.ABILITIES.FREEZE_AOE:
        return this.useFreeze(player);
      default:
        return false;
    }
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.CRYSTAL_BALL_SCRYING]: 
        `§7Cost: ${this.CRYSTAL_BALL_SPIRIT_COST} Spirit\n§7Scry for structures within ${this.CRYSTAL_BALL_SCAN_RANGE}m`,
      [this.ABILITIES.DOOR_OPENING]: 
        `§7Cost: ${this.DOOR_OPENING_SPIRIT_COST} Spirit (x2 for others)\n§7Phase through walls up to ${this.MAX_WALL_THICKNESS} blocks`,
      [this.ABILITIES.PEEK_DOOR]: 
        '§7Cost: 5 Spirit\n§7Open small door to see through walls'
    };
    return descriptions[abilityId] || 'Unknown ability';
  }
  
  /**
   * Clean up effects
   */
  static removeEffects(player) {
    TrickmasterSequence.removeEffects(player);
    this.crystalBallCooldowns.delete(player.name);
    this.dangerSenseTicks.delete(player.name);
    this.trackedStructures.delete(player.name);
  }
}
