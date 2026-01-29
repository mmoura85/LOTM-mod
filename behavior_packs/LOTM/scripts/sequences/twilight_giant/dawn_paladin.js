import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { WeaponMasterSequence } from './weapon_master.js';

export class DawnPaladinSequence {
  static SEQUENCE_NUMBER = 6;
  static PATHWAY = 'twilight_giant';
  
  // Enhanced passive abilities - ALL stats +1 from Weapon Master
  static EFFECT_DURATION = 400;
  static STRENGTH_AMPLIFIER = 4; // Strength V
  static SPEED_AMPLIFIER = 3; // Speed IV (when sprinting)
  static SPEED_NORMAL = 2; // Speed III (when not sprinting)
  static JUMP_AMPLIFIER = 2; // Jump Boost III (no increase)
  
  // Light of Dawn ability
  static LIGHT_OF_DAWN_RANGE = 45; // 40-50 meter range
  static LIGHT_OF_DAWN_DURATION = 300; // 15 seconds
  static LIGHT_OF_DAWN_SPIRIT_COST = 60;
  static LIGHT_OF_DAWN_COOLDOWN = 600; // 30 seconds
  
  // Track active Light of Dawn zones
  static activeLightZones = new Map(); // player name -> {location, ticksRemaining}
  static lightCooldowns = new Map(); // player name -> ticks remaining
  
  // Ability identifiers
  static ABILITIES = {
    LIGHT_OF_DAWN: 'light_of_dawn'
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
    if (!this.hasSequence(player)) return;
    
    // Enhanced physical abilities
    this.applyPhysicalEnhancements(player);
    
    // Health bonus (+4 hearts)
    this.applyHealthBonus(player, 8);
    
    // Giant size - make player larger
    this.applyGiantSize(player);
    
    // Process active Light of Dawn zones
    this.processLightOfDawn(player);
    
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
      // Set player scale to 1.5 (makes them about 2.7 blocks tall)
      // Normal player is 1.8 blocks, so 1.8 * 1.5 = 2.7 blocks
      player.runCommand('attribute @s minecraft:generic.scale base set 1.5');
    } catch (e) {
      // Attribute command failed - might not be available in this version
    }
  }
  
  /**
   * Tick down cooldowns
   */
  static tickCooldowns(player) {
    const cooldown = this.lightCooldowns.get(player.name);
    if (cooldown && cooldown > 0) {
      this.lightCooldowns.set(player.name, cooldown - 1);
    }
  }
  
  /**
   * Check if on cooldown
   */
  static isOnCooldown(player) {
    const cooldown = this.lightCooldowns.get(player.name) || 0;
    return cooldown > 0;
  }
  
  /**
   * Use Light of Dawn - creates a sacred light zone
   */
  static useLightOfDawn(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    if (this.isOnCooldown(player)) {
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
      x: player.location.x,
      y: player.location.y,
      z: player.location.z
    };
    
    this.activeLightZones.set(player.name, {
      location: location,
      dimension: player.dimension,
      ticksRemaining: this.LIGHT_OF_DAWN_DURATION
    });
    
    // Set cooldown
    this.lightCooldowns.set(player.name, this.LIGHT_OF_DAWN_COOLDOWN);
    
    // Initial activation effects
    player.playSound('beacon.activate', { pitch: 1.2, volume: 1.0 });
    player.sendMessage('§6§lLight of Dawn activated!');
    
    // Spawn initial burst of particles
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const radius = this.LIGHT_OF_DAWN_RANGE * 0.5;
      
      player.dimension.spawnParticle('minecraft:soul_particle', {
        x: location.x + Math.cos(angle) * radius,
        y: location.y + 1,
        z: location.z + Math.sin(angle) * radius
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
    
    // Zone expired
    if (zone.ticksRemaining <= 0) {
      this.activeLightZones.delete(player.name);
      player.sendMessage('§7Light of Dawn fades...');
      player.playSound('beacon.deactivate', { pitch: 1.0, volume: 0.8 });
    }
  }
  
  /**
   * Spawn dawn light particles at zone location
   */
  static spawnDawnLightParticles(dimension, location) {
    // Create a circular pattern of light particles
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = this.LIGHT_OF_DAWN_RANGE * 0.3;
      
      const particleLoc = {
        x: location.x + Math.cos(angle) * radius,
        y: location.y + 1,
        z: location.z + Math.sin(angle) * radius
      };
      
      // Spawn golden/white light particles
      dimension.spawnParticle('minecraft:soul_particle', particleLoc);
      dimension.spawnParticle('minecraft:end_rod', {
        x: particleLoc.x,
        y: particleLoc.y + 0.5,
        z: particleLoc.z
      });
    }
    
    // Center particle
    dimension.spawnParticle('minecraft:soul_particle', {
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
        `§7Cost: ${this.LIGHT_OF_DAWN_SPIRIT_COST} Spirit\n§7Creates sacred light zone (15s)\n§7Weakens and damages undead`
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
    
    // Jump Boost III (same as Weapon Master)
    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, {
        amplifier: this.JUMP_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Night Vision (see in darkness like dawn light)
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
          // Sharpness IV (+1 from Weapon Master)
          const currentSharpness = enchantments.getEnchantment('sharpness');
          if (!currentSharpness || currentSharpness.level < 4) {
            enchantments.addEnchantment({ type: 'sharpness', level: 4 });
          }
          
          // Knockback II (+1)
          const currentKnockback = enchantments.getEnchantment('knockback');
          if (!currentKnockback || currentKnockback.level < 2) {
            enchantments.addEnchantment({ type: 'knockback', level: 2 });
          }
          
          // Smite II (new)
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
          // Protection III (+1)
          const currentProtection = enchantments.getEnchantment('protection');
          if (!currentProtection || currentProtection.level < 3) {
            enchantments.addEnchantment({ type: 'protection', level: 3 });
          }
          
          // Fire Protection III (+1)
          const currentFireProt = enchantments.getEnchantment('fire_protection');
          if (!currentFireProt || currentFireProt.level < 3) {
            enchantments.addEnchantment({ type: 'fire_protection', level: 3 });
          }
          
          // Blast Protection III (+1)
          const currentBlastProt = enchantments.getEnchantment('blast_protection');
          if (!currentBlastProt || currentBlastProt.level < 3) {
            enchantments.addEnchantment({ type: 'blast_protection', level: 3 });
          }
          
          // Projectile Protection III (+1)
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
    
    // Clear active light zones and cooldowns
    this.activeLightZones.delete(player.name);
    this.lightCooldowns.delete(player.name);
    
    // Reset player size to normal
    try {
      player.runCommand('attribute @s minecraft:generic.scale base set 1.0');
    } catch (e) {
      // Failed to reset size
    }
  }
}