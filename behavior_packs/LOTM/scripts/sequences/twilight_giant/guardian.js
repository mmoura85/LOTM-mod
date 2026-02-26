import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { DawnPaladinSequence } from './dawn_paladin.js';

export class GuardianSequence {
  static SEQUENCE_NUMBER = 5;
  static PATHWAY = 'twilight_giant';
  
  // MASSIVELY enhanced passive abilities - "Strength of Giants"
  static EFFECT_DURATION = 999999;
  static STRENGTH_AMPLIFIER = 6; // Strength VII (adult vs child compared to Dawn Paladin)
  static SPEED_AMPLIFIER = 4; // Speed V (when sprinting)
  static SPEED_NORMAL = 3; // Speed IV (when not sprinting)
  static JUMP_AMPLIFIER = 3; // Jump Boost IV
  
  // Enhanced Light of Dawn - INCREASED DAMAGE
  static LIGHT_OF_DAWN_RANGE = 50; // Increased from 45
  static LIGHT_OF_DAWN_DURATION = 300; // 15 seconds
  static LIGHT_OF_DAWN_SPIRIT_COST = 60;
  static LIGHT_OF_DAWN_COOLDOWN = 600; // 30 seconds
  static LIGHT_OF_DAWN_DAMAGE = 8; // Increased from 5 (initial) and 3 (ongoing)
  static LIGHT_OF_DAWN_DAMAGE_ONGOING = 5; // Increased from 3
  
  // Enhanced Hurricane of Light - INCREASED AREA AND DAMAGE
  static HURRICANE_SPIRIT_COST = 70;
  static HURRICANE_RANGE = 30; // Increased from 20
  static HURRICANE_DURATION = 100; // 5 seconds
  static HURRICANE_COOLDOWN = 2400; // 2 minutes
  static HURRICANE_SWORDS_PER_WAVE = 15; // Increased from 12
  static HURRICANE_SWORD_DAMAGE = 12; // Increased from 8
  static HURRICANE_SWORD_DAMAGE_UNDEAD = 20; // Increased from 15
  
  // Protection ability - Guardian's signature defensive stance
  static PROTECTION_SPIRIT_COST = 40;
  static PROTECTION_DURATION = 200; // 10 seconds
  static PROTECTION_COOLDOWN = 400; // 20 seconds
  static PROTECTION_RANGE = 10; // Blocks - protects allies in this range
  static PROTECTION_DAMAGE_REDUCTION = 0.9; // 90% damage reduction for Guardian
  static PROTECTION_ALLY_REDUCTION = 0.7; // 70% damage reduction for allies
  
  // Track active abilities
  static activeLightZones = new Map();
  static lightCooldowns = new Map();
  static hurricaneCooldowns = new Map();
  static activeHurricanes = new Map();
  static protectionActive = new Map(); // player name -> {ticksRemaining, allies: Set()}
  static protectionCooldowns = new Map();
  
  // Ability identifiers
  static ABILITIES = {
    LIGHT_OF_DAWN: 'light_of_dawn',
    HURRICANE_OF_LIGHT: 'hurricane_of_light',
    PROTECTION: 'protection'
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
    
    // MASSIVELY enhanced physical abilities - "Strength of Giants"
    this.applyPhysicalEnhancements(player);
    
    // Health bonus (+10 hearts - adult vs child)
    this.applyHealthBonus(player, 20);
    
    // Giant size - larger than Dawn Paladin
    this.applyGiantSize(player);
    
    // Process active Light of Dawn zones (enhanced version)
    this.processLightOfDawn(player);
    
    // Process Hurricane of Light (enhanced version)
    this.processHurricaneOfLight(player);
    
    // Process Protection stance
    this.processProtection(player);
    
    // Tick down cooldowns
    this.tickCooldowns(player);
    
    // Apply weapon enchantments (enhanced)
    this.applyWeaponEnchantments(player);
    
    // Apply armor enchantments (enhanced)
    this.applyArmorEnchantments(player);
    
    // Illusion Immunity - automatically clear negative effects
    this.applyIllusionImmunity(player);
  }
  
  /**
   * Apply giant size transformation - LARGER than Dawn Paladin
   */
  static applyGiantSize(player) {
    try {
      // Set player scale to 1.8 (Dawn Paladin is 1.5)
      // Normal player is 1.8 blocks, so 1.8 * 1.8 = 3.24 blocks tall
      player.runCommand('attribute @s minecraft:generic.scale base set 1.8');
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
    
    const protectionCd = this.protectionCooldowns.get(player.name);
    if (protectionCd && protectionCd > 0) {
      this.protectionCooldowns.set(player.name, protectionCd - 1);
    }
  }
  
  /**
   * Apply MASSIVELY enhanced physical abilities
   */
  static applyPhysicalEnhancements(player) {
    // Strength VII - "like an adult to a child" compared to Dawn Paladin
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, {
        amplifier: this.STRENGTH_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Speed - V when sprinting, IV when not
    const isSprinting = player.isSprinting;
    const speedLevel = isSprinting ? this.SPEED_AMPLIFIER : this.SPEED_NORMAL;
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== speedLevel || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, {
        amplifier: speedLevel,
        showParticles: false
      });
    }
    
    // Jump Boost IV
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
    
    // Absorption V (enhanced protection)
    const absorption = player.getEffect('absorption');
    if (!absorption || absorption.amplifier !== 4 || absorption.duration < 200) {
      player.addEffect('absorption', this.EFFECT_DURATION, {
        amplifier: 4,
        showParticles: false
      });
    }
    
    // Resistance V (massive damage reduction)
    const resistance = player.getEffect('resistance');
    if (!resistance || resistance.amplifier !== 4 || resistance.duration < 200) {
      player.addEffect('resistance', this.EFFECT_DURATION, {
        amplifier: 4,
        showParticles: false
      });
    }
    
    // Haste IV
    const haste = player.getEffect('haste');
    if (!haste || haste.amplifier !== 3 || haste.duration < 200) {
      player.addEffect('haste', this.EFFECT_DURATION, {
        amplifier: 3,
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
    
    // Regeneration III (enhanced healing)
    const regen = player.getEffect('regeneration');
    if (!regen || regen.amplifier !== 2 || regen.duration < 200) {
      player.addEffect('regeneration', this.EFFECT_DURATION, {
        amplifier: 2,
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
   * Illusion Immunity - clear blindness, nausea, other illusion effects
   */
  static applyIllusionImmunity(player) {
    const illusionEffects = ['blindness', 'nausea', 'darkness'];
    
    for (const effect of illusionEffects) {
      if (player.getEffect(effect)) {
        player.removeEffect(effect);
      }
    }
  }
  
  /**
   * Use Protection stance - kneel and create protective walls
   */
  static useProtection(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.protectionCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      const remaining = Math.ceil(cooldown / 20);
      player.sendMessage(`§cProtection on cooldown: ${remaining}s`);
      return false;
    }
    
    // Check if already in Protection stance
    if (this.protectionActive.has(player.name)) {
      player.sendMessage('§cProtection already active!');
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.PROTECTION_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.PROTECTION_SPIRIT_COST}`);
      return false;
    }
    
    // Activate Protection stance
    this.protectionActive.set(player.name, {
      ticksRemaining: this.PROTECTION_DURATION,
      location: player.location,
      allies: new Set()
    });
    
    // Visual and audio effects
    player.sendMessage('§6§l§oYou kneel and plant your sword!');
    player.sendMessage('§7Dawn-like light forms protective walls!');
    player.playSound('beacon.activate', { pitch: 0.8, volume: 1.5 });
    
    // Create visual barrier walls
    for (let i = 0; i < 20; i++) {
      system.runTimeout(() => {
        const stance = this.protectionActive.get(player.name);
        if (stance) {
          this.spawnProtectionParticles(player, stance.location);
        }
      }, i * 10);
    }
    
    return true;
  }
  
  /**
   * Spawn Protection stance particles - invisible walls of light
   */
  static spawnProtectionParticles(player, location) {
    const dimension = player.dimension;
    
    // Create left and right wall particles (perpendicular to player facing)
    const rotation = player.getRotation();
    const yaw = rotation.y * (Math.PI / 180); // Convert to radians
    
    // Left wall (90 degrees left)
    const leftAngle = yaw + Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const distance = i - 4; // -4 to 4 range
      dimension.spawnParticle('minecraft:totem_particle', {
        x: location.x + Math.cos(leftAngle) * distance,
        y: location.y + 1,
        z: location.z + Math.sin(leftAngle) * distance
      });
      dimension.spawnParticle('minecraft:end_rod', {
        x: location.x + Math.cos(leftAngle) * distance,
        y: location.y + 2,
        z: location.z + Math.sin(leftAngle) * distance
      });
    }
    
    // Right wall (90 degrees right)
    const rightAngle = yaw - Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const distance = i - 4;
      dimension.spawnParticle('minecraft:totem_particle', {
        x: location.x + Math.cos(rightAngle) * distance,
        y: location.y + 1,
        z: location.z + Math.sin(rightAngle) * distance
      });
      dimension.spawnParticle('minecraft:end_rod', {
        x: location.x + Math.cos(rightAngle) * distance,
        y: location.y + 2,
        z: location.z + Math.sin(rightAngle) * distance
      });
    }
  }
  
  /**
   * Process Protection stance each tick
   */
  static processProtection(player) {
    const stance = this.protectionActive.get(player.name);
    if (!stance) return;
    
    stance.ticksRemaining--;
    
    // Immobilize player during Protection stance (kneeling)
    player.addEffect('slowness', 20, { amplifier: 255, showParticles: false });
    
    // Apply massive damage reduction to Guardian
    player.addEffect('resistance', 20, { amplifier: 9, showParticles: true });
    
    // Find nearby allies to protect
    stance.allies.clear();
    const nearbyPlayers = player.dimension.getPlayers({
      location: player.location,
      maxDistance: this.PROTECTION_RANGE,
      excludeNames: [player.name]
    });
    
    for (const ally of nearbyPlayers) {
      stance.allies.add(ally.name);
      
      // Grant protection to allies (70% damage reduction)
      ally.addEffect('resistance', 20, { amplifier: 6, showParticles: true });
      ally.addEffect('absorption', 20, { amplifier: 2, showParticles: false });
    }
    
    // Spawn particles every 10 ticks
    if (stance.ticksRemaining % 10 === 0) {
      this.spawnProtectionParticles(player, player.location);
    }
    
    // End stance
    if (stance.ticksRemaining <= 0) {
      this.protectionActive.delete(player.name);
      this.protectionCooldowns.set(player.name, this.PROTECTION_COOLDOWN);
      
      player.sendMessage('§7You rise from your protective stance...');
      player.playSound('beacon.deactivate', { pitch: 0.8, volume: 1.0 });
    }
  }
  
  /**
   * Enhanced Light of Dawn - increased damage
   */
  static useLightOfDawn(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.lightCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      const remaining = Math.ceil(cooldown / 20);
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
    player.sendMessage('§6§lLight of Dawn activated! §7(Enhanced: 50m range)');
    
    // Spawn initial burst of particles - GOLDEN theme
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const radius = this.LIGHT_OF_DAWN_RANGE * 0.5;
      
      player.dimension.spawnParticle('minecraft:totem_particle', {
        x: location.x + Math.cos(angle) * radius,
        y: location.y + 1,
        z: location.z + Math.sin(angle) * radius
      });
    }
    
    // Apply initial debuffs with ENHANCED damage
    this.applyInitialDawnEffects(player.dimension, location);
    
    return true;
  }
  
  /**
   * Apply initial dawn effects with enhanced damage
   */
  static applyInitialDawnEffects(dimension, location) {
    try {
      const entities = dimension.getEntities({
        location: location,
        maxDistance: this.LIGHT_OF_DAWN_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      
      for (const entity of entities) {
        // Apply glowing to all entities
        entity.addEffect('glowing', this.LIGHT_OF_DAWN_DURATION, {
          amplifier: 0,
          showParticles: false
        });
        
        // Check if entity is undead/evil
        if (this.isUndeadOrEvil(entity)) {
          // Apply strong debuffs
          entity.addEffect('weakness', this.LIGHT_OF_DAWN_DURATION, {
            amplifier: 3,
            showParticles: true
          });
          
          entity.addEffect('slowness', this.LIGHT_OF_DAWN_DURATION, {
            amplifier: 2,
            showParticles: true
          });
          
          // Enhanced initial damage (8 vs Dawn Paladin's 5)
          entity.applyDamage(this.LIGHT_OF_DAWN_DAMAGE_INITIAL);
        }
      }
    } catch (e) {
      // Failed to apply effects
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
   * Process Light of Dawn with enhanced damage
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
    
    // Apply damage to undead every 2 seconds (ENHANCED damage)
    if (zone.ticksRemaining % 40 === 0) {
      this.applyEnhancedDawnDamage(zone.dimension, zone.location);
    }
    
    // Zone expired
    if (zone.ticksRemaining <= 0) {
      this.activeLightZones.delete(player.name);
      player.sendMessage('§7Light of Dawn fades...');
      player.playSound('beacon.deactivate', { pitch: 1.0, volume: 0.8 });
    }
  }
  
  /**
   * Spawn dawn light particles - golden theme
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
      
      // Spawn golden/yellow light particles
      dimension.spawnParticle('minecraft:totem_particle', particleLoc);
      dimension.spawnParticle('minecraft:villager_happy', particleLoc);
      dimension.spawnParticle('minecraft:end_rod', {
        x: particleLoc.x,
        y: particleLoc.y + 0.5,
        z: particleLoc.z
      });
    }
    
    // Center particle
    dimension.spawnParticle('minecraft:totem_particle', {
      x: location.x,
      y: location.y + 0.5,
      z: location.z
    });
  }

  
  /**
   * Apply enhanced dawn damage
   */
  static applyEnhancedDawnDamage(dimension, location) {
    try {
      const entities = dimension.getEntities({
        location: location,
        maxDistance: this.LIGHT_OF_DAWN_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      
      for (const entity of entities) {
        if (DawnPaladinSequence.isUndeadOrEvil(entity)) {
          // Enhanced purification damage
          entity.applyDamage(this.LIGHT_OF_DAWN_DAMAGE_ONGOING);
        }
      }
    } catch (e) {
      // Failed to apply damage
    }
  }
  
  /**
   * Enhanced Hurricane of Light - increased area and damage
   */
  static useHurricaneOfLight(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.hurricaneCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      const remaining = Math.ceil(cooldown / 20);
      player.sendMessage(`§cHurricane of Light on cooldown: ${remaining}s`);
      return false;
    }
    
    // Check if already active
    if (this.activeHurricanes.has(player.name)) {
      player.sendMessage('§cHurricane already active!');
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.HURRICANE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.HURRICANE_SPIRIT_COST}`);
      return false;
    }
    
    const location = player.location;
    
    // Activate enhanced Hurricane
    this.activeHurricanes.set(player.name, {
      location: location,
      dimension: player.dimension,
      ticksRemaining: this.HURRICANE_DURATION,
      waveCount: 0
    });
    
    // Set cooldown
    this.hurricaneCooldowns.set(player.name, this.HURRICANE_COOLDOWN);
    
    player.sendMessage('§6§l§oENHANCED HURRICANE OF LIGHT!');
    player.playSound('item.trident.thunder', { pitch: 0.8, volume: 1.5 });
    
    // Initial golden light burst - LARGER
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2;
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
   * Process Hurricane of Light - Enhanced Guardian version
   */
  static processHurricaneOfLight(player) {
    const hurricane = this.activeHurricanes.get(player.name);
    if (!hurricane) return;
    
    hurricane.ticksRemaining--;
    
    // Spawn sword waves every 25 ticks (1.25 seconds) - 4 waves total over 5 seconds
    if (hurricane.ticksRemaining % 25 === 0 && hurricane.waveCount < 4) {
      hurricane.waveCount++;
      this.spawnSwordWave(player, hurricane.location, hurricane.dimension);
    }
    
    // End hurricane
    if (hurricane.ticksRemaining <= 0) {
      this.activeHurricanes.delete(player.name);
      player.sendMessage('§7The hurricane subsides...');
    }
  }
  
  /**
   * Spawn a wave of falling swords - ENHANCED (15 swords, 30m range)
   */
  static spawnSwordWave(player, centerLocation, dimension) {
    const swordCount = this.HURRICANE_SWORDS_PER_WAVE; // 15 swords
    const range = this.HURRICANE_RANGE; // 30 blocks
    
    for (let i = 0; i < swordCount; i++) {
      // Random location within range
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * range;
      
      const spawnX = centerLocation.x + Math.cos(angle) * distance;
      const spawnZ = centerLocation.z + Math.sin(angle) * distance;
      const spawnY = centerLocation.y + 40; // High in the sky
      
      // Spawn falling block (anvil for sword visual)
      try {
        dimension.runCommand(
          `summon falling_block ${spawnX} ${spawnY} ${spawnZ} minecraft:anvil`
        );
      } catch (e) {
        // Failed to spawn - use particle trail instead
      }
      
      // Create golden particle trail
      system.runTimeout(() => {
        for (let j = 0; j < 40; j++) {
          system.runTimeout(() => {
            const currentY = spawnY - (j * 1);
            if (currentY > centerLocation.y) {
              dimension.spawnParticle('minecraft:totem_particle', {
                x: spawnX,
                y: currentY,
                z: spawnZ
              });
              dimension.spawnParticle('minecraft:end_rod', {
                x: spawnX,
                y: currentY,
                z: spawnZ
              });
            }
          }, j * 2);
        }
      }, i * 5);
      
      // Check for entities to damage on impact (after fall time)
      system.runTimeout(() => {
        try {
          const impactLoc = {
            x: spawnX,
            y: centerLocation.y,
            z: spawnZ
          };
          
          const entities = dimension.getEntities({
            location: impactLoc,
            maxDistance: 3,
            excludeTypes: ['minecraft:item', 'minecraft:player']
          });
          
          for (const entity of entities) {
            // Enhanced damage: 12 normal, 20 undead
            const damage = this.isUndeadOrEvil(entity) 
              ? this.HURRICANE_UNDEAD_DAMAGE 
              : this.HURRICANE_SWORD_DAMAGE;
            
            entity.applyDamage(damage);
            
            // Impact particles
            for (let k = 0; k < 10; k++) {
              const particleAngle = (k / 10) * Math.PI * 2;
              dimension.spawnParticle('minecraft:totem_particle', {
                x: entity.location.x + Math.cos(particleAngle) * 0.5,
                y: entity.location.y + 0.5,
                z: entity.location.z + Math.sin(particleAngle) * 0.5
              });
            }
          }
          
          // Ground impact effect
          dimension.spawnParticle('minecraft:huge_explosion_emitter', impactLoc);
          dimension.spawnParticle('minecraft:totem_particle', impactLoc);
          player.dimension.playSound('random.explode', {
            location: impactLoc,
            pitch: 1.5,
            volume: 0.3
          });
          
        } catch (e) {
          // Failed to apply damage
        }
      }, 80); // 4 second fall time
    }
  }
  
  /**
   * Apply weapon enchantments (enhanced from Dawn Paladin)
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
          // Sharpness V (enhanced)
          const currentSharpness = enchantments.getEnchantment('sharpness');
          if (!currentSharpness || currentSharpness.level < 5) {
            enchantments.addEnchantment({ type: 'sharpness', level: 5 });
          }
          
          // Knockback III (enhanced)
          const currentKnockback = enchantments.getEnchantment('knockback');
          if (!currentKnockback || currentKnockback.level < 3) {
            enchantments.addEnchantment({ type: 'knockback', level: 3 });
          }
          
          // Smite III (enhanced)
          const currentSmite = enchantments.getEnchantment('smite');
          if (!currentSmite || currentSmite.level < 3) {
            enchantments.addEnchantment({ type: 'smite', level: 3 });
          }
          
          inventory.container.setItem(heldSlot, heldItem);
        }
      } catch (e) {
        // Enchantment failed
      }
    }
  }
  
  /**
   * Apply armor enchantments (enhanced from Dawn Paladin)
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
          // Protection IV (enhanced)
          const currentProtection = enchantments.getEnchantment('protection');
          if (!currentProtection || currentProtection.level < 4) {
            enchantments.addEnchantment({ type: 'protection', level: 4 });
          }
          
          // Fire Protection IV
          const currentFireProt = enchantments.getEnchantment('fire_protection');
          if (!currentFireProt || currentFireProt.level < 4) {
            enchantments.addEnchantment({ type: 'fire_protection', level: 4 });
          }
          
          // Blast Protection IV
          const currentBlastProt = enchantments.getEnchantment('blast_protection');
          if (!currentBlastProt || currentBlastProt.level < 4) {
            enchantments.addEnchantment({ type: 'blast_protection', level: 4 });
          }
          
          // Projectile Protection IV
          const currentProjProt = enchantments.getEnchantment('projectile_protection');
          if (!currentProjProt || currentProjProt.level < 4) {
            enchantments.addEnchantment({ type: 'projectile_protection', level: 4 });
          }
          
          equipment.setEquipment(slot, armorItem);
        }
      } catch (e) {
        // Enchantment failed
      }
    }
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
      case this.ABILITIES.PROTECTION:
        return this.useProtection(player);
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
        `§7Cost: ${this.LIGHT_OF_DAWN_SPIRIT_COST} Spirit\n§7Enhanced: 50m range, ${this.LIGHT_OF_DAWN_DAMAGE_ONGOING} damage/tick`,
      [this.ABILITIES.HURRICANE_OF_LIGHT]:
        `§7Cost: ${this.HURRICANE_SPIRIT_COST} Spirit\n§7Enhanced: 30m range, ${this.HURRICANE_SWORD_DAMAGE} damage/sword`,
      [this.ABILITIES.PROTECTION]:
        `§7Cost: ${this.PROTECTION_SPIRIT_COST} Spirit\n§7Kneel and protect (10s)\n§790% damage reduction, shields allies in 10m`
    };
    return descriptions[abilityId] || 'Unknown ability';
  }
  
  /**
   * Clean up effects
   */
  static removeEffects(player) {
    DawnPaladinSequence.removeEffects(player);
    this.protectionActive.delete(player.name);
    this.protectionCooldowns.delete(player.name);
    
    // Reset player size to normal
    try {
      player.runCommand('attribute @s minecraft:generic.scale base set 1.0');
    } catch (e) {
      // Failed to reset size
    }
  }
}
