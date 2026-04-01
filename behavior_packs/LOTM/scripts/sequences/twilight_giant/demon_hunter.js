// ============================================
// DEMON HUNTER (WITCHER) - SEQUENCE 4 TWILIGHT GIANT PATHWAY
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { GuardianSequence } from './guardian.js';

export class DemonHunterSequence {
  static SEQUENCE_NUMBER = 4;
  static PATHWAY = 'twilight_giant';
  
  // Passive abilities - GODLIKE strength
  static EFFECT_DURATION = 999999;
  static STRENGTH_AMPLIFIER = 7; // Strength VIII (terrifying physical strength)
  static SPEED_AMPLIFIER = 6; // Speed VII (hurricane-force winds)
  static JUMP_AMPLIFIER = 4; // Jump Boost V
  
  // Enhanced spirituality
  static MAX_SPIRIT_BONUS = 100; // +100 max spirit over Guardian
  
  // Eye of Demon Hunting ability
  static EYE_SPIRIT_COST = 30;
  static EYE_DURATION = 300; // 15 seconds
  static EYE_RANGE = 50; // Detection range
  static EYE_COOLDOWN = 200; // 10 seconds
  
  // Enhanced Protection (Anchored Shield)
  static PROTECTION_SPIRIT_COST = 80;
  static PROTECTION_DURATION = 600; // 30 seconds
  static PROTECTION_RADIUS = 8; // Larger than Guardian
  static PROTECTION_COOLDOWN = 800; // 40 seconds
  
  // Alchemy/Ointment System
  static OINTMENT_SPIRIT_COST = 40;
  static OINTMENT_DURATION = 400; // 20 seconds
  static OINTMENT_COOLDOWN = 300; // 15 seconds
  
  // Mind Concealment (passive - blocks divination)
  static CONCEALMENT_ACTIVE = true;

  // ---- Selected Ability (persisted) ----
  static selectedAbilities = new Map();
  static SELECTED_ABILITY_PROPERTY = 'lotm:demonhunter_selected_ability';

  static getSelectedAbility(player) {
    if (!this.selectedAbilities.has(player.name)) {
      try {
        const saved = player.getDynamicProperty(this.SELECTED_ABILITY_PROPERTY);
        if (saved) this.selectedAbilities.set(player.name, saved);
      } catch (e) {}
    }
    return this.selectedAbilities.get(player.name) || this.ABILITIES.EYE_OF_DEMON_HUNTING;
  }

  static setSelectedAbility(player, abilityId) {
    this.selectedAbilities.set(player.name, abilityId);
    try { player.setDynamicProperty(this.SELECTED_ABILITY_PROPERTY, abilityId); } catch (e) {}
  }

  static useSelectedAbility(player) {
    return this.handleAbilityUse(player, this.getSelectedAbility(player));
  }
  
  // Track active abilities
  static eyeOfDemonHuntingActive = new Map(); // player name -> {ticksRemaining, targets[]}
  static eyeCooldowns = new Map();
  static anchoredProtection = new Map(); // player name -> {location, ticksRemaining, anchored: true}
  static protectionCooldowns = new Map();
  static activeOintments = new Map(); // player name -> {type, ticksRemaining}
  static ointmentCooldowns = new Map();
  
  // Ability identifiers
  static ABILITIES = {
    EYE_OF_DEMON_HUNTING: 'eye_of_demon_hunting',
    ANCHORED_PROTECTION: 'anchored_protection',
    APPLY_OINTMENT_LIGHTNING: 'ointment_lightning',
    APPLY_OINTMENT_FREEZING: 'ointment_freezing',
    APPLY_OINTMENT_PURIFICATION: 'ointment_purification',
    APPLY_OINTMENT_BURNING: 'ointment_burning',
    APPLY_OINTMENT_DECAY: 'ointment_decay',
    APPLY_OINTMENT_EXORCISM: 'ointment_exorcism',
    // Inherited
    LIGHT_OF_DAWN: 'light_of_dawn'
  };
  
  // Ointment types
  static OINTMENT_TYPES = {
    LIGHTNING: 'lightning',
    FREEZING: 'freezing',
    PURIFICATION: 'purification',
    BURNING: 'burning',
    DECAY: 'decay',
    EXORCISM: 'exorcism'
  };
  
  /**
   * Check if player has this sequence or higher
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
    
    // Apply GODLIKE physical enhancements
    this.applyPhysicalEnhancements(player);
    
    // Health bonus (+7 hearts = 14 extra health)
    this.applyHealthBonus(player, 14);
    
    // Giant size
    this.applyGiantSize(player);
    
    // Spiritual Intuition (represented by night vision + glowing)
    this.applySpiritualIntuition(player);
    
    // Mind Concealment (passive resistance effects)
    this.applyMindConcealment(player);
    
    // Process active abilities (own + inherited)
    this.processEyeOfDemonHunting(player);
    this.processAnchoredProtection(player);
    this.processOintment(player);
    
    // IMPORTANT: Process inherited Guardian abilities
    GuardianSequence.processProtection(player);
    GuardianSequence.processLightOfDawn(player);
    
    // Tick down cooldowns (own + inherited)
    this.tickCooldowns(player);
    GuardianSequence.tickCooldowns(player);
    
    // Apply weapon enhancements
    this.applyWeaponEnhancements(player);
    
    // Apply armor enhancements
    this.applyArmorEnhancements(player);
  }
  
  /**
   * Apply GODLIKE physical enhancements
   */
  static applyPhysicalEnhancements(player) {
    // Strength VIII - "terrifying physical strength"
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, {
        amplifier: this.STRENGTH_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Speed VII - "whips up hurricane-force winds"
    // Speed: only reapply if the CORRECT level isn't active
    // (isSprinting changes frame by frame — we don't want to reapply every 4 ticks)
    const isSprinting = player.isSprinting;
    const desiredSpeed = isSprinting ? this.SPEED_AMPLIFIER : this.SPEED_AMPLIFIER - 1;
    const speed = player.getEffect('speed');
    // Only reapply if we have the WRONG level or it's about to expire
    if (!speed || speed.amplifier !== desiredSpeed || speed.duration < 40) {
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: desiredSpeed, showParticles: false });
    }
    
    // Jump Boost V
    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, {
        amplifier: this.JUMP_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Regeneration II (godlike recovery)
    const regen = player.getEffect('regeneration');
    if (!regen || regen.amplifier !== 1 || regen.duration < 200) {
      player.addEffect('regeneration', this.EFFECT_DURATION, {
        amplifier: 1,
        showParticles: false
      });
    }
    
    // Resistance II (nearly god-like durability)
    const resistance = player.getEffect('resistance');
    if (!resistance || resistance.amplifier !== 1 || resistance.duration < 200) {
      player.addEffect('resistance', this.EFFECT_DURATION, {
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
    const amplifier = Math.floor(bonusHearts / 2) - 1;
    
    if (!healthBoost || healthBoost.amplifier !== amplifier || healthBoost.duration < 200) {
      player.addEffect('health_boost', this.EFFECT_DURATION, {
        amplifier: amplifier,
        showParticles: false
      });
    }
  }
  
  /**
   * Apply giant size
   */
  static applyGiantSize(player) {
    try {
      player.runCommand('attribute @s minecraft:generic.scale base set 1.4');
    } catch (e) {
      // Scale attribute not available
    }
  }
  
  /**
   * Apply Spiritual Intuition
   */
  // Track how often we scan for hostile mobs (per player)
  static intuitionTicks = new Map(); // playerName -> tick counter

  static applySpiritualIntuition(player) {
    // Night vision is always on
    const nightVision = player.getEffect('night_vision');
    if (!nightVision || nightVision.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    // Throttle: only scan for nearby hostiles every 80 ticks (4 seconds)
    // was running every 4 ticks — this alone is a 20x improvement
    const t = this.intuitionTicks.get(player.name) || 0;
    this.intuitionTicks.set(player.name, t + 1);
    if (t % 80 !== 0) return;

    try {
      const nearbyEntities = player.dimension.getEntities({
        location: player.location,
        maxDistance: 30,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });

      const hostileKeywords = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'phantom', 'pillager', 'vindicator', 'evoker', 'warden', 'blaze', 'ghast'];
      for (const entity of nearbyEntities) {
        const isHostile = hostileKeywords.some(kw => entity.typeId.includes(kw));
        if (isHostile) {
          // Apply 90-tick glowing (4.5 seconds) — covers the next scan interval
          try { entity.addEffect('glowing', 90, { amplifier: 0, showParticles: false }); } catch (e) {}
        }
      }
    } catch (e) {}
  }
  
  /**
   * Apply Mind Concealment (passive resistance to mental effects)
   */
  static applyMindConcealment(player) {
    // Represent as immunity to certain effects
    // Remove confusion, nausea, blindness (represent divination interference)
    player.removeEffect('nausea');
    player.removeEffect('blindness');
  }
  
  /**
   * Tick down cooldowns
   */
  static tickCooldowns(player) {
    // Eye cooldown
    const eyeCd = this.eyeCooldowns.get(player.name) || 0;
    if (eyeCd > 0) {
      this.eyeCooldowns.set(player.name, eyeCd - 1);
    }
    
    // Protection cooldown
    const protCd = this.protectionCooldowns.get(player.name) || 0;
    if (protCd > 0) {
      this.protectionCooldowns.set(player.name, protCd - 1);
    }
    
    // Ointment cooldown
    const ointCd = this.ointmentCooldowns.get(player.name) || 0;
    if (ointCd > 0) {
      this.ointmentCooldowns.set(player.name, ointCd - 1);
    }
  }
  
  /**
   * Use Eye of Demon Hunting
   */
  static useEyeOfDemonHunting(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.eyeCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cEye of Demon Hunting on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.EYE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.EYE_SPIRIT_COST}`);
      return false;
    }
    
    // Find nearby entities
    const entities = player.dimension.getEntities({
      location: player.location,
      maxDistance: this.EYE_RANGE,
      excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow']
    });
    
    const targets = [];
    for (const entity of entities) {
      if (entity.id === player.id) continue;
      targets.push(entity);
    }
    
    if (targets.length === 0) {
      player.sendMessage('§cNo entities in range!');
      SpiritSystem.restoreSpirit(player, this.EYE_SPIRIT_COST);
      return false;
    }
    
    // Activate Eye of Demon Hunting
    this.eyeOfDemonHuntingActive.set(player.name, {
      targets: targets,
      ticksRemaining: this.EYE_DURATION
    });
    
    player.sendMessage(`§2§lEye of Demon Hunting activated!`);
    player.sendMessage(`§7Analyzing ${targets.length} target(s)...`);
    player.playSound('mob.wither.shoot', { pitch: 1.5, volume: 0.8 });
    
    // Show complex dark green symbol in eyes (particle effect)
    this.spawnEyeSymbol(player);
    
    return true;
  }
  
  /**
   * Spawn Eye of Demon Hunting symbol particles
   */
  static spawnEyeSymbol(player) {
    const loc = player.location;
    
    // Green particles in front of player's face (eyes)
    for (let i = 0; i < 20; i++) {
      system.runTimeout(() => {
        try {
          player.dimension.spawnParticle('minecraft:villager_happy', {
            x: loc.x,
            y: loc.y + 1.6,
            z: loc.z
          });
        } catch (e) {}
      }, i * 2);
    }
  }
  
  /**
   * Process Eye of Demon Hunting each tick
   */
  static processEyeOfDemonHunting(player) {
    const eye = this.eyeOfDemonHuntingActive.get(player.name);
    if (!eye) return;
    
    eye.ticksRemaining--;
    
    // Analyze targets every second
    if (eye.ticksRemaining % 20 === 0) {
      for (const target of eye.targets) {
        try {
          // Make target glow (identify them)
          target.addEffect('glowing', 60, {
            amplifier: 0,
            showParticles: true
          });
          
          // Apply weakness (reveal weakness)
          target.addEffect('weakness', 60, {
            amplifier: 2,
            showParticles: false
          });
          
          // Show analysis particles
          target.dimension.spawnParticle('minecraft:villager_happy', {
            x: target.location.x,
            y: target.location.y + 1,
            z: target.location.z
          });
          
          // Display target info
          const health = target.getComponent('minecraft:health');
          if (health) {
            const currentHealth = health.currentValue;
            const maxHealth = health.effectiveMax;
            player.sendMessage(`§2${target.typeId}: §c${Math.floor(currentHealth)}§7/§c${Math.floor(maxHealth)} HP`);
          }
        } catch (e) {
          // Target analysis failed
        }
      }
    }
    
    // End effect
    if (eye.ticksRemaining <= 0) {
      this.eyeOfDemonHuntingActive.delete(player.name);
      this.eyeCooldowns.set(player.name, this.EYE_COOLDOWN);
      
      player.sendMessage('§7Eye of Demon Hunting fades...');
    }
  }
  
  /**
   * Use Anchored Protection (enhanced Guardian protection)
   */
  static useAnchoredProtection(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.protectionCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cAnchored Protection on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.PROTECTION_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.PROTECTION_SPIRIT_COST}`);
      return false;
    }
    
    // Create anchored protection at player's location
    this.anchoredProtection.set(player.name, {
      location: { ...player.location },
      ticksRemaining: this.PROTECTION_DURATION,
      anchored: true
    });
    
    player.sendMessage(`§6§lAnchored Protection activated!`);
    player.sendMessage('§7A solid wall of divine protection forms around you!');
    player.playSound('random.levelup', { pitch: 0.8, volume: 1.0 });
    
    // Spawn activation burst
    this.spawnProtectionBurst(player);
    
    return true;
  }
  
  /**
   * Spawn Anchored Protection particles
   */
  static spawnProtectionBurst(player) {
    const loc = player.location;
    const r = this.PROTECTION_RADIUS;
    
    // Full sphere burst
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      system.runTimeout(() => {
        try {
          player.dimension.spawnParticle('minecraft:totem_particle', {
            x: loc.x + Math.cos(angle) * r,
            y: loc.y + 1,
            z: loc.z + Math.sin(angle) * r
          });
        } catch (e) {}
      }, i);
    }
  }
  
  /**
   * Process Anchored Protection each tick
   */
  static processAnchoredProtection(player) {
    const protection = this.anchoredProtection.get(player.name);
    if (!protection) return;
    
    protection.ticksRemaining--;
    
    // Apply protection effects
    player.addEffect('resistance', 40, {
      amplifier: 3,
      showParticles: false
    });
    
    player.addEffect('regeneration', 40, {
      amplifier: 2,
      showParticles: false
    });
    
    // Repel entities at boundary
    try {
      const nearbyEntities = player.dimension.getEntities({
        location: protection.location,
        maxDistance: this.PROTECTION_RADIUS + 1,
        excludeNames: [player.name]
      });
      
      for (const entity of nearbyEntities) {
        if (entity.typeId === 'minecraft:item' || 
            entity.typeId === 'minecraft:player') continue;
        
        const ex = entity.location.x - protection.location.x;
        const ez = entity.location.z - protection.location.z;
        const dist = Math.sqrt(ex * ex + ez * ez);
        
        if (dist <= this.PROTECTION_RADIUS) {
          try {
            entity.applyKnockback(ex / dist, ez / dist, 1.5, 0.4);
          } catch (e) {}
        }
      }
    } catch (e) {}
    
    // Spawn barrier particles every 4 ticks
    if (protection.ticksRemaining % 4 === 0) {
      const steps = 16;
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        try {
          player.dimension.spawnParticle('minecraft:totem_particle', {
            x: protection.location.x + Math.cos(angle) * this.PROTECTION_RADIUS,
            y: protection.location.y + 1,
            z: protection.location.z + Math.sin(angle) * this.PROTECTION_RADIUS
          });
        } catch (e) {}
      }
    }
    
    // End effect
    if (protection.ticksRemaining <= 0) {
      this.anchoredProtection.delete(player.name);
      this.protectionCooldowns.set(player.name, this.PROTECTION_COOLDOWN);
      
      player.sendMessage('§7Anchored Protection fades...');
    }
  }
  
  /**
   * Apply ointment to weapon
   */
  static applyOintment(player, ointmentType) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.ointmentCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cOintment on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.OINTMENT_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.OINTMENT_SPIRIT_COST}`);
      return false;
    }
    
    // Apply ointment
    this.activeOintments.set(player.name, {
      type: ointmentType,
      ticksRemaining: this.OINTMENT_DURATION
    });
    
    const ointmentNames = {
      [this.OINTMENT_TYPES.LIGHTNING]: '§e§lLightning',
      [this.OINTMENT_TYPES.FREEZING]: '§b§lFreezing',
      [this.OINTMENT_TYPES.PURIFICATION]: '§f§lPurification',
      [this.OINTMENT_TYPES.BURNING]: '§c§lBurning',
      [this.OINTMENT_TYPES.DECAY]: '§2§lDecay',
      [this.OINTMENT_TYPES.EXORCISM]: '§d§lExorcism'
    };
    
    player.sendMessage(`${ointmentNames[ointmentType]} §7ointment applied to weapon!`);
    player.playSound('random.levelup', { pitch: 1.2, volume: 0.8 });
    
    return true;
  }
  
  /**
   * Process ointment effects
   */
  static processOintment(player) {
    const ointment = this.activeOintments.get(player.name);
    if (!ointment) return;
    
    ointment.ticksRemaining--;
    
    // Show particles on held weapon
    if (ointment.ticksRemaining % 5 === 0) {
      const particleType = this.getOintmentParticle(ointment.type);
      try {
        player.dimension.spawnParticle(particleType, {
          x: player.location.x,
          y: player.location.y + 1.2,
          z: player.location.z
        });
      } catch (e) {}
    }
    
    // End effect
    if (ointment.ticksRemaining <= 0) {
      this.activeOintments.delete(player.name);
      this.ointmentCooldowns.set(player.name, this.OINTMENT_COOLDOWN);
      
      player.sendMessage('§7Ointment wears off...');
    }
  }
  
  /**
   * Get particle type for ointment
   */
  static getOintmentParticle(ointmentType) {
    const particles = {
      [this.OINTMENT_TYPES.LIGHTNING]: 'minecraft:critical_hit_emitter',
      [this.OINTMENT_TYPES.FREEZING]: 'minecraft:water_evaporation_actor_emitter',
      [this.OINTMENT_TYPES.PURIFICATION]: 'minecraft:totem_particle',
      [this.OINTMENT_TYPES.BURNING]: 'minecraft:lava_particle',
      [this.OINTMENT_TYPES.DECAY]: 'minecraft:soul_particle',
      [this.OINTMENT_TYPES.EXORCISM]: 'minecraft:endrod'
    };
    return particles[ointmentType] || 'minecraft:endrod';
  }
  
  /**
   * Apply weapon enhancements
   */
  static applyWeaponEnhancements(player) {
    // Dawn's glow can be blanketed on weapons
    // Applied via Light of Dawn ability
  }
  
  /**
   * Apply armor enhancements
   */
  static applyArmorEnhancements(player) {
    const equipment = player.getComponent('minecraft:equippable');
    if (!equipment) return;
    
    const armorSlots = ['Head', 'Chest', 'Legs', 'Feet'];
    
    for (const slot of armorSlots) {
      try {
        const armorItem = equipment.getEquipment(slot);
        if (armorItem) {
          const enchantments = armorItem.getComponent('minecraft:enchantable');
          if (!enchantments) continue;
          
          // Protection V
          const currentProt = enchantments.getEnchantment('protection');
          if (!currentProt || currentProt.level < 5) {
            enchantments.addEnchantment({ type: 'protection', level: 5 });
          }
          
          equipment.setEquipment(slot, armorItem);
        }
      } catch (e) {}
    }
  }
  
  /**
   * Handle ability usage
   */
  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
      case this.ABILITIES.EYE_OF_DEMON_HUNTING:
        return this.useEyeOfDemonHunting(player);
      
      case this.ABILITIES.ANCHORED_PROTECTION:
        return this.useAnchoredProtection(player);
      
      case this.ABILITIES.APPLY_OINTMENT_LIGHTNING:
        return this.applyOintment(player, this.OINTMENT_TYPES.LIGHTNING);
      case this.ABILITIES.APPLY_OINTMENT_FREEZING:
        return this.applyOintment(player, this.OINTMENT_TYPES.FREEZING);
      case this.ABILITIES.APPLY_OINTMENT_PURIFICATION:
        return this.applyOintment(player, this.OINTMENT_TYPES.PURIFICATION);
      case this.ABILITIES.APPLY_OINTMENT_BURNING:
        return this.applyOintment(player, this.OINTMENT_TYPES.BURNING);
      case this.ABILITIES.APPLY_OINTMENT_DECAY:
        return this.applyOintment(player, this.OINTMENT_TYPES.DECAY);
      case this.ABILITIES.APPLY_OINTMENT_EXORCISM:
        return this.applyOintment(player, this.OINTMENT_TYPES.EXORCISM);
      
      // Inherited Light of Dawn from Guardian
      case this.ABILITIES.LIGHT_OF_DAWN:
        return GuardianSequence.handleAbilityUse(player, abilityId);
      
      default:
        return false;
    }
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.EYE_OF_DEMON_HUNTING]:
        `§7Cost: ${this.EYE_SPIRIT_COST} Spirit\n§7Analyze targets (15s)\n§7Reveals nature, weaknesses, health\n§750m range`,
      [this.ABILITIES.ANCHORED_PROTECTION]:
        `§7Cost: ${this.PROTECTION_SPIRIT_COST} Spirit\n§7Solid anchored shield (30s)\n§7Blocks Spirit World traversal\n§78m radius`,
      [this.ABILITIES.APPLY_OINTMENT_LIGHTNING]:
        `§7Cost: ${this.OINTMENT_SPIRIT_COST} Spirit\n§7Lightning Strike on hit`,
      [this.ABILITIES.APPLY_OINTMENT_FREEZING]:
        `§7Cost: ${this.OINTMENT_SPIRIT_COST} Spirit\n§7Freezing effect on hit`,
      [this.ABILITIES.APPLY_OINTMENT_PURIFICATION]:
        `§7Cost: ${this.OINTMENT_SPIRIT_COST} Spirit\n§7Purification on hit`,
      [this.ABILITIES.APPLY_OINTMENT_BURNING]:
        `§7Cost: ${this.OINTMENT_SPIRIT_COST} Spirit\n§7Burning damage on hit`,
      [this.ABILITIES.APPLY_OINTMENT_DECAY]:
        `§7Cost: ${this.OINTMENT_SPIRIT_COST} Spirit\n§7Decay/poison on hit`,
      [this.ABILITIES.APPLY_OINTMENT_EXORCISM]:
        `§7Cost: ${this.OINTMENT_SPIRIT_COST} Spirit\n§7Exorcism/holy damage on hit`
    };
    
    return descriptions[abilityId] || 'Unknown ability';
  }
  
  /**
   * Get all available abilities
   */
  static getAllAbilities() {
    return [
      {
        id: this.ABILITIES.EYE_OF_DEMON_HUNTING,
        name: '§2Eye of Demon Hunting',
        description: 'Analyze targets',
        cost: this.EYE_SPIRIT_COST
      },
      {
        id: this.ABILITIES.ANCHORED_PROTECTION,
        name: '§6Anchored Protection',
        description: 'Solid divine shield',
        cost: this.PROTECTION_SPIRIT_COST
      },
      {
        id: this.ABILITIES.APPLY_OINTMENT_LIGHTNING,
        name: '§eOintment: Lightning',
        description: 'Lightning strikes',
        cost: this.OINTMENT_SPIRIT_COST
      },
      {
        id: this.ABILITIES.APPLY_OINTMENT_FREEZING,
        name: '§bOintment: Freezing',
        description: 'Freeze enemies',
        cost: this.OINTMENT_SPIRIT_COST
      },
      {
        id: this.ABILITIES.APPLY_OINTMENT_BURNING,
        name: '§cOintment: Burning',
        description: 'Burn enemies',
        cost: this.OINTMENT_SPIRIT_COST
      },
      {
        id: this.ABILITIES.APPLY_OINTMENT_PURIFICATION,
        name: '§fOintment: Purification',
        description: 'Purify/heal',
        cost: this.OINTMENT_SPIRIT_COST
      }
    ];
  }
  
  /**
   * Clean up effects
   */
  static removeEffects(player) {
    GuardianSequence.removeEffects(player);
    
    this.eyeOfDemonHuntingActive.delete(player.name);
    this.eyeCooldowns.delete(player.name);
    this.anchoredProtection.delete(player.name);
    this.protectionCooldowns.delete(player.name);
    this.activeOintments.delete(player.name);
    this.ointmentCooldowns.delete(player.name);
    
    // Reset size
    try {
      player.runCommand('attribute @s minecraft:generic.scale base set 1.0');
    } catch (e) {}
  }
}
