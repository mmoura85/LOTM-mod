import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { WeaponMasterSequence } from './weapon_master.js';

export class DawnPaladinSequence {
  static SEQUENCE_NUMBER = 6;
  static PATHWAY = 'twilight_giant';
  
  // Enhanced passive abilities - ALL stats +1 from Weapon Master
  static EFFECT_DURATION = 999999;
  static STRENGTH_AMPLIFIER = 4; // Strength V
  static SPEED_AMPLIFIER = 3; // Speed IV (when sprinting)
  static SPEED_NORMAL = 2; // Speed III (when not sprinting)
  static JUMP_AMPLIFIER = 2; // Jump Boost III (no increase)
  
  // Light of Dawn ability - ENHANCED with holy ground
  static LIGHT_OF_DAWN_RANGE = 45; // 40-50 meter range
  static LIGHT_OF_DAWN_DURATION = 300; // 15 seconds
  static LIGHT_OF_DAWN_SPIRIT_COST = 60;
  static LIGHT_OF_DAWN_COOLDOWN = 600; // 30 seconds
  
  // Hurricane of Light ability - NEW
  static HURRICANE_SPIRIT_COST = 70; // Reduced to be affordable at Seq 6
  static HURRICANE_RANGE = 20; // 20 block radius
  static HURRICANE_DURATION = 100; // 5 seconds of sword rain
  static HURRICANE_COOLDOWN = 2400; // 2 minutes (120 seconds)
  static HURRICANE_SWORDS_PER_WAVE = 12; // Swords per wave
  
  // Track active Light of Dawn zones
  static activeLightZones = new Map(); // player name -> {location, ticksRemaining, blocks: []}
  static lightCooldowns = new Map(); // player name -> ticks remaining
  
  // Track Hurricane of Light
  static hurricaneCooldowns = new Map(); // player name -> ticks remaining
  static activeHurricanes = new Map(); // player name -> {location, ticksRemaining, waveCount}
  
  // Ability identifiers
  static ABILITIES = {
    LIGHT_OF_DAWN: 'light_of_dawn',
    HURRICANE_OF_LIGHT: 'hurricane_of_light'
  };
  
  /**
   * Check if player has this sequence
   */
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }
  
  /**
   * Apply passive abilities
   */
  static applyPassiveAbilities(player) {
    // if (!this.hasSequence(player)) return;
    
    // Enhanced physical abilities
    this.applyPhysicalEnhancements(player);
    
    // Health bonus (+4 hearts)
    this.applyHealthBonus(player, 8);
    
    // Giant size - make player larger
    this.applyGiantSize(player);
    
    // Process active Light of Dawn zones
    this.processLightOfDawn(player);
    
    // Process active Hurricane of Light
    this.processHurricaneOfLight(player);
    
    // Tick down cooldowns
    this.tickCooldowns(player);
    
    // Apply weapon enchantments
    this.applyWeaponEnchantments(player);
    
    // Apply armor enchantments
    this.applyArmorEnchantments(player);
  }
  
  /**
   * Apply giant size transformation
   */
  static applyGiantSize(player) {
    try {
      player.runCommand('attribute @s minecraft:generic.scale base set 1.5');
    } catch (e) {
      // Attribute command failed
    }
  }
  
  /**
   * Tick down cooldowns
   */
  static tickCooldowns(player) {
    const lightCd = this.lightCooldowns.get(player.name);
    if (lightCd && lightCd > 0) {
      this.lightCooldowns.set(player.name, lightCd - 1);
    }
    
    const hurricaneCd = this.hurricaneCooldowns.get(player.name);
    if (hurricaneCd && hurricaneCd > 0) {
      this.hurricaneCooldowns.set(player.name, hurricaneCd - 1);
    }
  }
  
  /**
   * Check if on cooldown
   */
  static isOnLightCooldown(player) {
    const cooldown = this.lightCooldowns.get(player.name) || 0;
    return cooldown > 0;
  }
  
  static isOnHurricaneCooldown(player) {
    const cooldown = this.hurricaneCooldowns.get(player.name) || 0;
    return cooldown > 0;
  }
  
  /**
   * Use Light of Dawn - creates a sacred light zone with holy ground
   */
  static useLightOfDawn(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    if (this.isOnLightCooldown(player)) {
      const remaining = Math.ceil(this.lightCooldowns.get(player.name) / 20);
      player.sendMessage(`§cLight of Dawn on cooldown: ${remaining}s`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.LIGHT_OF_DAWN_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.LIGHT_OF_DAWN_SPIRIT_COST}`);
      return false;
    }
    
    // Create light zone at current location
    const location = {
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y),
      z: Math.floor(player.location.z)
    };
    
    // Store original blocks and replace with glowstone
    const replacedBlocks = [];
    const radius = Math.floor(this.LIGHT_OF_DAWN_RANGE / 2);
    
    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        const distance = Math.sqrt(x * x + z * z);
        if (distance <= radius) {
          const blockLoc = {
            x: location.x + x,
            y: location.y - 1, // Ground level
            z: location.z + z
          };
          
          try {
            const block = player.dimension.getBlock(blockLoc);
            if (block && !block.isAir && !block.isLiquid) {
              // Store original block type
              replacedBlocks.push({
                location: blockLoc,
                originalType: block.typeId
              });
              
              // Replace with glowstone for holy ground effect
              player.dimension.runCommand(
                `setblock ${blockLoc.x} ${blockLoc.y} ${blockLoc.z} glowstone`
              );
            }
          } catch (e) {
            // Failed to replace this block
          }
        }
      }
    }
    
    this.activeLightZones.set(player.name, {
      location: location,
      dimension: player.dimension,
      ticksRemaining: this.LIGHT_OF_DAWN_DURATION,
      blocks: replacedBlocks
    });
    
    // Set cooldown
    this.lightCooldowns.set(player.name, this.LIGHT_OF_DAWN_COOLDOWN);
    
    // Initial activation effects
    player.playSound('beacon.activate', { pitch: 1.2, volume: 1.0 });
    player.sendMessage('§6§lLight of Dawn activated!');
    
    // Spawn initial burst of golden dawn particles
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const r = radius * 0.8;
      
      player.dimension.spawnParticle('minecraft:totem_particle', {
        x: location.x + Math.cos(angle) * r,
        y: location.y + 1,
        z: location.z + Math.sin(angle) * r
      });
      player.dimension.spawnParticle('minecraft:villager_happy', {
        x: location.x + Math.cos(angle) * r,
        y: location.y + 0.5,
        z: location.z + Math.sin(angle) * r
      });
    }
    
    // Apply initial debuffs to all undead/evil in range
    this.applyInitialDawnEffects(player.dimension, location);
    
    return true;
  }
  
  /**
   * Apply initial dawn effects to entities in range
   */
  static applyInitialDawnEffects(dimension, location) {
    try {
      const entities = dimension.getEntities({
        location: location,
        maxDistance: this.LIGHT_OF_DAWN_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      
      for (const entity of entities) {
        // Apply glowing to all entities (reveals concealment)
        entity.addEffect('glowing', this.LIGHT_OF_DAWN_DURATION, {
          amplifier: 0,
          showParticles: false
        });
        
        // Check if entity is undead/evil
        if (this.isUndeadOrEvil(entity)) {
          // Apply strong debuffs for full duration
          entity.addEffect('weakness', this.LIGHT_OF_DAWN_DURATION, {
            amplifier: 3,
            showParticles: true
          });
          
          entity.addEffect('slowness', this.LIGHT_OF_DAWN_DURATION, {
            amplifier: 2,
            showParticles: true
          });
          
          // Initial purification damage
          entity.applyDamage(5);
        }
      }
    } catch (e) {
      // Failed to apply effects
    }
  }
  
  /**
   * Process active Light of Dawn zones
   */
  static processLightOfDawn(player) {
    const zone = this.activeLightZones.get(player.name);
    if (!zone) return;
    
    // Decrease duration
    zone.ticksRemaining--;
    
    // Spawn particles every 10 ticks (0.5 seconds)
    if (zone.ticksRemaining % 10 === 0) {
      this.spawnDawnLightParticles(zone.dimension, zone.location);
    }
    
    // Apply damage to undead every 2 seconds
    if (zone.ticksRemaining % 40 === 0) {
      this.applyDawnDamage(zone.dimension, zone.location);
    }
    
    // Zone expired - restore original blocks
    if (zone.ticksRemaining <= 0) {
      this.restoreHolyGround(zone);
      this.activeLightZones.delete(player.name);
      player.sendMessage('§7Light of Dawn fades...');
      player.playSound('beacon.deactivate', { pitch: 1.0, volume: 0.8 });
    }
  }
  
  /**
   * Restore original blocks after Light of Dawn ends
   */
  static restoreHolyGround(zone) {
    for (const blockData of zone.blocks) {
      try {
        zone.dimension.runCommand(
          `setblock ${blockData.location.x} ${blockData.location.y} ${blockData.location.z} ${blockData.originalType}`
        );
      } catch (e) {
        // Failed to restore this block
      }
    }
  }
  
  /**
   * Spawn dawn light particles at zone location
   */
  static spawnDawnLightParticles(dimension, location) {
    // Create a circular pattern of golden light particles
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = this.LIGHT_OF_DAWN_RANGE * 0.3;
      
      const particleLoc = {
        x: location.x + Math.cos(angle) * radius,
        y: location.y + 1,
        z: location.z + Math.sin(angle) * radius
      };
      
      // Spawn golden/white light particles (dawn theme)
      dimension.spawnParticle('minecraft:villager_happy', particleLoc);
      dimension.spawnParticle('minecraft:totem_particle', particleLoc);
      dimension.spawnParticle('minecraft:end_rod', {
        x: particleLoc.x,
        y: particleLoc.y + 0.5,
        z: particleLoc.z
      });
    }
    
    // Center particle - bright golden glow
    dimension.spawnParticle('minecraft:totem_particle', {
      x: location.x,
      y: location.y + 0.5,
      z: location.z
    });
  }
  
  /**
   * Apply damage to undead in the light zone
   */
  static applyDawnDamage(dimension, location) {
    try {
      const entities = dimension.getEntities({
        location: location,
        maxDistance: this.LIGHT_OF_DAWN_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      
      for (const entity of entities) {
        if (this.isUndeadOrEvil(entity)) {
          // Purification damage over time
          entity.applyDamage(3);
        }
      }
    } catch (e) {
      // Failed to apply damage
    }
  }
  
  /**
   * Use Hurricane of Light - rain down swords of dawn
   */
  static useHurricaneOfLight(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    if (this.isOnHurricaneCooldown(player)) {
      const remaining = Math.ceil(this.hurricaneCooldowns.get(player.name) / 20);
      player.sendMessage(`§cHurricane of Light on cooldown: ${remaining}s`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.HURRICANE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.HURRICANE_SPIRIT_COST}`);
      return false;
    }
    
    const location = {
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y),
      z: Math.floor(player.location.z)
    };
    
    // Activate hurricane
    this.activeHurricanes.set(player.name, {
      location: location,
      dimension: player.dimension,
      ticksRemaining: this.HURRICANE_DURATION,
      waveCount: 0
    });
    
    // Set cooldown
    this.hurricaneCooldowns.set(player.name, this.HURRICANE_COOLDOWN);
    
    player.sendMessage('§6§l§oHURRICANE OF LIGHT!');
    player.playSound('item.trident.thunder', { pitch: 0.8, volume: 1.5 });
    
    // Initial golden light burst
    for (let i = 0; i < 50; i++) {
      const angle = (i / 50) * Math.PI * 2;
      const radius = this.HURRICANE_RANGE * 0.5;
      
      player.dimension.spawnParticle('minecraft:totem_particle', {
        x: location.x + Math.cos(angle) * radius,
        y: location.y + 10,
        z: location.z + Math.sin(angle) * radius
      });
      player.dimension.spawnParticle('minecraft:villager_happy', {
        x: location.x + Math.cos(angle) * radius,
        y: location.y + 8,
        z: location.z + Math.sin(angle) * radius
      });
    }
    
    return true;
  }
  
  /**
   * Process Hurricane of Light - spawn falling swords
   */
  static processHurricaneOfLight(player) {
    const hurricane = this.activeHurricanes.get(player.name);
    if (!hurricane) return;
    
    hurricane.ticksRemaining--;
    
    // Spawn sword wave every 5 ticks
    if (hurricane.ticksRemaining % 5 === 0) {
      this.spawnSwordWave(player, hurricane);
      hurricane.waveCount++;
    }
    
    // Apply damage to entities every tick
    this.applyHurricaneDamage(hurricane);
    
    // Hurricane ended
    if (hurricane.ticksRemaining <= 0) {
      this.activeHurricanes.delete(player.name);
      player.sendMessage('§7The hurricane subsides...');
      player.playSound('item.trident.return', { pitch: 1.0, volume: 1.0 });
    }
  }
  
  /**
   * Spawn a wave of falling swords
   */
  static spawnSwordWave(player, hurricane) {
    const location = hurricane.location;
    const dimension = hurricane.dimension;
    
    // Spawn swords in a circle
    for (let i = 0; i < this.HURRICANE_SWORDS_PER_WAVE; i++) {
      const angle = (i / this.HURRICANE_SWORDS_PER_WAVE) * Math.PI * 2 + (hurricane.waveCount * 0.3);
      const radius = Math.random() * this.HURRICANE_RANGE;
      
      const swordX = location.x + Math.cos(angle) * radius;
      const swordZ = location.z + Math.sin(angle) * radius;
      const swordY = location.y + 15 + Math.random() * 5; // High in the air
      
      // Spawn the falling sword entity (we'll use armor stands with dawnsword item)
      this.spawnFallingSword(dimension, {
        x: swordX,
        y: swordY,
        z: swordZ
      }, location);
    }
  }
  
  /**
   * Spawn a single falling sword
   */
  static spawnFallingSword(dimension, startLoc, groundLocation) {
    // Create falling sword effect with particles
    const fallDuration = 20; // 1 second fall
    
    // Find ground level at this location
    let groundY = groundLocation.y;
    try {
      for (let y = Math.floor(startLoc.y); y >= groundLocation.y - 10; y--) {
        const block = dimension.getBlock({ x: Math.floor(startLoc.x), y: y, z: Math.floor(startLoc.z) });
        if (block && !block.isAir && !block.isLiquid) {
          groundY = y + 1;
          break;
        }
      }
    } catch (e) {
      groundY = groundLocation.y;
    }
    
    // Spawn falling block entity with sword
    try {
      dimension.runCommand(`summon falling_block ${startLoc.x} ${startLoc.y} ${startLoc.z} minecraft:iron_block`);
    } catch (e) {
      // Falling block failed
    }
    
    for (let tick = 0; tick < fallDuration; tick++) {
      system.runTimeout(() => {
        const progress = tick / fallDuration;
        const currentY = startLoc.y - (progress * (startLoc.y - groundY));
        
        const particleLoc = {
          x: startLoc.x,
          y: currentY,
          z: startLoc.z
        };
        
        // Sword trail particles - golden dawn light
        dimension.spawnParticle('minecraft:villager_happy', particleLoc);
        dimension.spawnParticle('minecraft:totem_particle', particleLoc);
        dimension.spawnParticle('minecraft:end_rod', particleLoc);
        
        // On impact
        if (tick === fallDuration - 1) {
          const impactLoc = {
            x: startLoc.x,
            y: groundY,
            z: startLoc.z
          };
          
          // Impact particles
          for (let i = 0; i < 10; i++) {
            const impactAngle = (i / 10) * Math.PI * 2;
            dimension.spawnParticle('minecraft:critical_hit_emitter', {
              x: impactLoc.x + Math.cos(impactAngle) * 0.5,
              y: impactLoc.y + 0.5,
              z: impactLoc.z + Math.sin(impactAngle) * 0.5
            });
          }
          
          // Sound effect - play for all players in the dimension
          try {
            const allPlayers = world.getAllPlayers();
            for (const p of allPlayers) {
              if (p.dimension.id === dimension.id) {
                const dist = Math.sqrt(
                  Math.pow(p.location.x - impactLoc.x, 2) +
                  Math.pow(p.location.z - impactLoc.z, 2)
                );
                if (dist < 48) {
                  p.playSound('random.anvil_land', { pitch: 1.5, volume: 0.3 });
                }
              }
            }
          } catch (e) {
            // Sound failed
          }
          
          // Damage nearby entities
          try {
            const entities = dimension.getEntities({
              location: impactLoc,
              maxDistance: 2,
              excludeTypes: ['minecraft:item', 'minecraft:player']
            });
            
            for (const entity of entities) {
              try {
                let damage = 8;
                
                // Extra damage to undead/evil
                if (DawnPaladinSequence.isUndeadOrEvil(entity)) {
                  damage = 15;
                  entity.addEffect('weakness', 60, { amplifier: 2, showParticles: true });
                }
                
                entity.applyDamage(damage);
              } catch (e) {
                // Entity died
              }
            }
          } catch (e) {
            // Failed to damage entities
          }
        }
      }, tick);
    }
  }
  
  /**
   * Apply continuous hurricane damage
   */
  static applyHurricaneDamage(hurricane) {
    try {
      const entities = hurricane.dimension.getEntities({
        location: hurricane.location,
        maxDistance: this.HURRICANE_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      
      for (const entity of entities) {
        // Small continuous damage
        entity.applyDamage(1);
        
        if (this.isUndeadOrEvil(entity)) {
          // Extra purification damage
          entity.applyDamage(2);
        }
      }
    } catch (e) {
      // Failed to apply damage
    }
  }
  
  /**
   * Check if entity is undead or evil
   */
  static isUndeadOrEvil(entity) {
    const undeadTypes = [
      'minecraft:zombie', 'minecraft:zombie_villager', 'minecraft:husk',
      'minecraft:drowned', 'minecraft:skeleton', 'minecraft:stray',
      'minecraft:wither_skeleton', 'minecraft:zombie_pigman',
      'minecraft:zombified_piglin', 'minecraft:phantom', 'minecraft:wither',
      'minecraft:zoglin', 'minecraft:skeleton_horse', 'minecraft:zombie_horse',
      // Evil creatures
      'minecraft:witch', 'minecraft:vex', 'minecraft:evoker',
      'minecraft:vindicator', 'minecraft:pillager', 'minecraft:ravager',
      'minecraft:enderman', 'minecraft:endermite', 'minecraft:shulker'
    ];
    
    return undeadTypes.includes(entity.typeId);
  }
  
  /**
   * Handle ability usage
   */
  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
      case this.ABILITIES.LIGHT_OF_DAWN:
        return this.useLightOfDawn(player);
      case this.ABILITIES.HURRICANE_OF_LIGHT:
        return this.useHurricaneOfLight(player);
      default:
        return false;
    }
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.LIGHT_OF_DAWN]: 
        `§7Cost: ${this.LIGHT_OF_DAWN_SPIRIT_COST} Spirit\n§7Creates sacred light zone (15s)\n§7Holy ground weakens and damages undead`,
      [this.ABILITIES.HURRICANE_OF_LIGHT]:
        `§7Cost: ${this.HURRICANE_SPIRIT_COST} Spirit\n§7Rain down swords of dawn (5s)\n§72 minute cooldown`
    };
    return descriptions[abilityId] || 'Unknown ability';
  }
  
  /**
   * Apply enhanced physical abilities
   */
  static applyPhysicalEnhancements(player) {
    // Strength V
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, {
        amplifier: this.STRENGTH_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Speed - IV when sprinting, III when not
    const isSprinting = player.isSprinting;
    const speedLevel = isSprinting ? this.SPEED_AMPLIFIER : this.SPEED_NORMAL;
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== speedLevel || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, {
        amplifier: speedLevel,
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
    
    // Night Vision
    const nightVision = player.getEffect('night_vision');
    if (!nightVision || nightVision.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }
    
    // Absorption IV
    const absorption = player.getEffect('absorption');
    if (!absorption || absorption.amplifier !== 3 || absorption.duration < 200) {
      player.addEffect('absorption', this.EFFECT_DURATION, {
        amplifier: 3,
        showParticles: false
      });
    }
    
    // Resistance IV
    const resistance = player.getEffect('resistance');
    if (!resistance || resistance.amplifier !== 3 || resistance.duration < 200) {
      player.addEffect('resistance', this.EFFECT_DURATION, {
        amplifier: 3,
        showParticles: false
      });
    }
    
    // Haste III
    const haste = player.getEffect('haste');
    if (!haste || haste.amplifier !== 2 || haste.duration < 200) {
      player.addEffect('haste', this.EFFECT_DURATION, {
        amplifier: 2,
        showParticles: false
      });
    }
    
    // Fire Resistance
    const fireRes = player.getEffect('fire_resistance');
    if (!fireRes || fireRes.duration < 200) {
      player.addEffect('fire_resistance', this.EFFECT_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }
    
    // Regeneration II
    const regen = player.getEffect('regeneration');
    if (!regen || regen.amplifier !== 1 || regen.duration < 200) {
      player.addEffect('regeneration', this.EFFECT_DURATION, {
        amplifier: 1,
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
   * Apply weapon enchantments
   */
  static applyWeaponEnchantments(player) {
    const inventory = player.getComponent('minecraft:inventory');
    if (!inventory || !inventory.container) return;
    
    const heldSlot = player.selectedSlotIndex;
    const heldItem = inventory.container.getItem(heldSlot);
    
    if (!heldItem) return;
    
    const weaponTypes = [
      'minecraft:wooden_sword', 'minecraft:stone_sword', 'minecraft:iron_sword',
      'minecraft:golden_sword', 'minecraft:diamond_sword', 'minecraft:netherite_sword',
      'minecraft:wooden_axe', 'minecraft:stone_axe', 'minecraft:iron_axe',
      'minecraft:golden_axe', 'minecraft:diamond_axe', 'minecraft:netherite_axe',
      'minecraft:trident'
    ];
    
    if (weaponTypes.includes(heldItem.typeId)) {
      try {
        const enchantments = heldItem.getComponent('minecraft:enchantable');
        if (enchantments) {
          // Sharpness IV
          const currentSharpness = enchantments.getEnchantment('sharpness');
          if (!currentSharpness || currentSharpness.level < 4) {
            enchantments.addEnchantment({ type: 'sharpness', level: 4 });
          }
          
          // Knockback II
          const currentKnockback = enchantments.getEnchantment('knockback');
          if (!currentKnockback || currentKnockback.level < 2) {
            enchantments.addEnchantment({ type: 'knockback', level: 2 });
          }
          
          // Smite II
          const currentSmite = enchantments.getEnchantment('smite');
          if (!currentSmite || currentSmite.level < 2) {
            enchantments.addEnchantment({ type: 'smite', level: 2 });
          }
          
          inventory.container.setItem(heldSlot, heldItem);
        }
      } catch (e) {
        // Enchantment failed
      }
    }
  }
  
  /**
   * Apply armor enchantments
   */
  static applyArmorEnchantments(player) {
    const equipment = player.getComponent('minecraft:equippable');
    if (!equipment) return;
    
    const armorSlots = ['Head', 'Chest', 'Legs', 'Feet'];
    
    for (const slot of armorSlots) {
      try {
        const armorItem = equipment.getEquipment(slot);
        if (!armorItem) continue;
        
        const enchantments = armorItem.getComponent('minecraft:enchantable');
        if (enchantments) {
          // Protection III
          const currentProtection = enchantments.getEnchantment('protection');
          if (!currentProtection || currentProtection.level < 3) {
            enchantments.addEnchantment({ type: 'protection', level: 3 });
          }
          
          // Fire Protection III
          const currentFireProt = enchantments.getEnchantment('fire_protection');
          if (!currentFireProt || currentFireProt.level < 3) {
            enchantments.addEnchantment({ type: 'fire_protection', level: 3 });
          }
          
          // Blast Protection III
          const currentBlastProt = enchantments.getEnchantment('blast_protection');
          if (!currentBlastProt || currentBlastProt.level < 3) {
            enchantments.addEnchantment({ type: 'blast_protection', level: 3 });
          }
          
          // Projectile Protection III
          const currentProjProt = enchantments.getEnchantment('projectile_protection');
          if (!currentProjProt || currentProjProt.level < 3) {
            enchantments.addEnchantment({ type: 'projectile_protection', level: 3 });
          }
          
          equipment.setEquipment(slot, armorItem);
        }
      } catch (e) {
        // Enchantment failed
      }
    }
  }
  
  /**
   * Clean up effects
   */
  static removeEffects(player) {
    WeaponMasterSequence.removeEffects(player);
    player.removeEffect('regeneration');
    player.removeEffect('night_vision');
    
    // Clear active light zones and restore blocks
    const zone = this.activeLightZones.get(player.name);
    if (zone) {
      this.restoreHolyGround(zone);
    }
    
    this.activeLightZones.delete(player.name);
    this.lightCooldowns.delete(player.name);
    this.activeHurricanes.delete(player.name);
    this.hurricaneCooldowns.delete(player.name);
    
    // Reset player size to normal
    try {
      player.runCommand('attribute @s minecraft:generic.scale base set 1.0');
    } catch (e) {
      // Failed to reset size
    }
  }
}
