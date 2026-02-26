import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { MidnightPoetSequence } from './midnight_poet.js';

export class NightmareSequence {
  static SEQUENCE_NUMBER = 7;
  static PATHWAY = PathwayManager.PATHWAYS.DARKNESS;
  
  // Passive ability constants - ENHANCED from Midnight Poet
  static NIGHT_VISION_DURATION = 999999;
  static SPEED_AMPLIFIER = 3; // Speed IV
  static STRENGTH_AMPLIFIER = 3; // Strength IV
  static JUMP_AMPLIFIER = 3; // Jump Boost IV
  
  // Nightmare State ability - FIXED: More spectator-like
  static NIGHTMARE_STATE_SPIRIT_COST = 50;
  static NIGHTMARE_STATE_DURATION = 400; // 20 seconds
  static NIGHTMARE_STATE_SPEED = 6; // Speed VII while phased
  static NIGHTMARE_STATE_COOLDOWN = 600; // 30 seconds
  
  // Dream Invasion ability - FIXED: No camera zoom
  static DREAM_INVASION_SPIRIT_COST = 40;
  static DREAM_INVASION_RANGE = 50; // Reduced from 100
  static DREAM_INVASION_DURATION = 200; // 10 seconds
  static DREAM_INVASION_COOLDOWN = 400; // 20 seconds
  static MAX_DREAM_TARGETS = 10;
  
  // Nightmare Limbs ability - FIXED: Visible tentacles
  static NIGHTMARE_LIMBS_SPIRIT_COST = 30;
  static NIGHTMARE_LIMBS_DURATION = 300; // 15 seconds
  static NIGHTMARE_LIMBS_DAMAGE = 8;
  static NIGHTMARE_LIMBS_RANGE = 6;
  static NIGHTMARE_LIMBS_COOLDOWN = 200; // 10 seconds
  
  // Ability tracking
  static nightmareStateActive = new Map();
  static nightmareCooldowns = new Map();
  static dreamInvasionActive = new Map();
  static dreamInvasionCooldowns = new Map();
  static nightmareLimbsActive = new Map();
  static nightmareLimbsCooldowns = new Map();
  static selectedAbilities = new Map(); // NEW: Track selected ability
  
  // Dynamic property for persistence
  static SELECTED_ABILITY_PROPERTY = 'lotm:nightmare_selected';
  
  // Ability identifiers
  static ABILITIES = {
    NIGHTMARE_STATE: 'nightmare_state',
    DREAM_INVASION: 'dream_invasion',
    NIGHTMARE_LIMBS: 'nightmare_limbs'
  };
  
  /**
   * Load selected ability from player dynamic properties
   */
  static loadSelectedAbility(player) {
    try {
      const selected = player.getDynamicProperty(this.SELECTED_ABILITY_PROPERTY);
      if (selected) {
        this.selectedAbilities.set(player.name, selected);
      }
    } catch (e) {
      // Failed to load
    }
  }
  
  /**
   * Save selected ability to player dynamic properties
   */
  static saveSelectedAbility(player) {
    try {
      const selected = this.selectedAbilities.get(player.name);
      if (selected) {
        player.setDynamicProperty(this.SELECTED_ABILITY_PROPERTY, selected);
      }
    } catch (e) {
      // Failed to save
    }
  }
  
  /**
   * Get selected ability
   */
  static getSelectedAbility(player) {
    return this.selectedAbilities.get(player.name) || this.ABILITIES.NIGHTMARE_STATE;
  }
  
  /**
   * Set selected ability
   */
  static setSelectedAbility(player, abilityId) {
    this.selectedAbilities.set(player.name, abilityId);
    this.saveSelectedAbility(player);
    return true;
  }
  
  /**
   * Use currently selected ability
   */
  static useSelectedAbility(player) {
    const abilityId = this.getSelectedAbility(player);
    return this.handleAbilityUse(player, abilityId);
  }
  
  /**
   * Get all available abilities
   */
  static getAllAbilities() {
    return [
      {
        id: this.ABILITIES.NIGHTMARE_STATE,
        name: '§5Nightmare State',
        description: 'Become incorporeal',
        cost: this.NIGHTMARE_STATE_SPIRIT_COST,
        icon: 'textures/ui/invisibility_effect'
      },
      {
        id: this.ABILITIES.DREAM_INVASION,
        name: '§bDream Invasion',
        description: 'Put targets to sleep',
        cost: this.DREAM_INVASION_SPIRIT_COST,
        icon: 'textures/ui/regeneration_effect'
      },
      {
        id: this.ABILITIES.NIGHTMARE_LIMBS,
        name: '§cNightmare Limbs',
        description: 'Summon attacking tentacles',
        cost: this.NIGHTMARE_LIMBS_SPIRIT_COST,
        icon: 'textures/ui/wither_effect'
      }
    ];
  }
  
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
    
    // Load selected ability on first tick
    if (!this.selectedAbilities.has(player.name)) {
      this.loadSelectedAbility(player);
    }
    
    // INHERIT: Apply all Midnight Poet passive abilities
    MidnightPoetSequence.applyPassiveAbilities(player);
    
    // Apply enhanced physical abilities (overrides Midnight Poet's)
    this.applyPhysicalEnhancements(player);
    
    // Health bonus (3 extra hearts for Sequence 7)
    this.applyHealthBonus(player, 6);
    
    // Process active abilities
    this.processNightmareState(player);
    this.processDreamInvasion(player);
    this.processNightmareLimbs(player);
    
    // Tick down cooldowns
    this.tickCooldowns(player);
  }
  
  /**
   * Apply physical enhancements
   */
  static applyPhysicalEnhancements(player) {
    const nightmareActive = this.nightmareStateActive.has(player.name);
    
    if (nightmareActive) {
      // In Nightmare State - extreme speed
      const speed = player.getEffect('speed');
      if (!speed || speed.amplifier !== this.NIGHTMARE_STATE_SPEED || speed.duration < 10) {
        player.addEffect('speed', this.NIGHT_VISION_DURATION, {
          amplifier: this.NIGHTMARE_STATE_SPEED,
          showParticles: false // Hide particles in nightmare state
        });
      }
      
      // Slow falling in nightmare state
      const levitation = player.getEffect('slow_falling');
      if (!levitation || levitation.duration < 10) {
        player.addEffect('slow_falling', this.NIGHT_VISION_DURATION, {
          amplifier: 0,
          showParticles: false
        });
      }
    } else {
      // Normal state - enhanced stats
      const speed = player.getEffect('speed');
      if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
        player.addEffect('speed', this.NIGHT_VISION_DURATION, {
          amplifier: this.SPEED_AMPLIFIER,
          showParticles: false
        });
      }
    }
    
    // Strength IV (always)
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.NIGHT_VISION_DURATION, {
        amplifier: this.STRENGTH_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Jump Boost IV (always)
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
   * Tick down cooldowns
   */
  static tickCooldowns(player) {
    const nightmareCd = this.nightmareCooldowns.get(player.name);
    if (nightmareCd && nightmareCd > 0) {
      this.nightmareCooldowns.set(player.name, nightmareCd - 1);
    }
    
    const dreamCd = this.dreamInvasionCooldowns.get(player.name);
    if (dreamCd && dreamCd > 0) {
      this.dreamInvasionCooldowns.set(player.name, dreamCd - 1);
    }
    
    const limbsCd = this.nightmareLimbsCooldowns.get(player.name);
    if (limbsCd && limbsCd > 0) {
      this.nightmareLimbsCooldowns.set(player.name, limbsCd - 1);
    }
  }
  
  /**
   * Use Nightmare State - FIXED: Better invisibility
   */
  static useNightmareState(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.nightmareCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cNightmare State on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }
    
    // Check if already active
    if (this.nightmareStateActive.has(player.name)) {
      player.sendMessage('§cNightmare State already active!');
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.NIGHTMARE_STATE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.NIGHTMARE_STATE_SPIRIT_COST}`);
      return false;
    }
    
    // Activate Nightmare State
    this.nightmareStateActive.set(player.name, {
      ticksRemaining: this.NIGHTMARE_STATE_DURATION,
      originalLocation: player.location
    });
    
    // Full invisibility including armor
    player.addEffect('invisibility', this.NIGHTMARE_STATE_DURATION, {
      amplifier: 0,
      showParticles: false
    });
    
    player.sendMessage('§5§lYour soul separates from your body!');
    player.sendMessage('§7You phase into the Nightmare realm...');
    player.playSound('mob.endermen.portal', { pitch: 0.5, volume: 1.0 });
    
    // Spawn entry particles
    for (let i = 0; i < 30; i++) {
      system.runTimeout(() => {
        if (this.nightmareStateActive.has(player.name)) {
          const angle = (i / 30) * Math.PI * 2;
          player.dimension.spawnParticle('minecraft:soul_particle', {
            x: player.location.x + Math.cos(angle),
            y: player.location.y + 1,
            z: player.location.z + Math.sin(angle)
          });
        }
      }, i * 2);
    }
    
    return true;
  }
  
  /**
   * Process Nightmare State each tick
   */
  static processNightmareState(player) {
    const state = this.nightmareStateActive.get(player.name);
    if (!state) return;
    
    state.ticksRemaining--;
    
    // Spawn particles at feet only (less intrusive)
    if (state.ticksRemaining % 20 === 0) {
      player.dimension.spawnParticle('minecraft:soul_particle', {
        x: player.location.x,
        y: player.location.y + 0.2,
        z: player.location.z
      });
    }
    
    // End effect
    if (state.ticksRemaining <= 0) {
      this.nightmareStateActive.delete(player.name);
      this.nightmareCooldowns.set(player.name, this.NIGHTMARE_STATE_COOLDOWN);
      
      player.sendMessage('§7You return to your physical form...');
      player.playSound('mob.endermen.portal', { pitch: 1.5, volume: 0.8 });
      
      // Exit particles
      for (let i = 0; i < 20; i++) {
        system.runTimeout(() => {
          const angle = (i / 20) * Math.PI * 2;
          player.dimension.spawnParticle('minecraft:portal', {
            x: player.location.x + Math.cos(angle) * 0.5,
            y: player.location.y + 1,
            z: player.location.z + Math.sin(angle) * 0.5
          });
        }, i);
      }
    }
  }
  
  /**
   * Use Dream Invasion - FIXED: No camera zoom
   */
  static useDreamInvasion(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.dreamInvasionCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cDream Invasion on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.DREAM_INVASION_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.DREAM_INVASION_SPIRIT_COST}`);
      return false;
    }
    
    // Find nearby entities
    const entities = player.dimension.getEntities({
      location: player.location,
      maxDistance: this.DREAM_INVASION_RANGE,
      excludeTypes: ['minecraft:item']
    });
    
    const targets = [];
    let targetCount = 0;
    
    for (const entity of entities) {
      if (entity.id === player.id) continue;
      if (targetCount >= this.MAX_DREAM_TARGETS) break;
      
      targets.push(entity);
      targetCount++;
    }
    
    if (targets.length === 0) {
      player.sendMessage('§cNo targets in range!');
      SpiritSystem.restoreSpirit(player, this.DREAM_INVASION_SPIRIT_COST);
      return false;
    }
    
    // Activate Dream Invasion
    this.dreamInvasionActive.set(player.name, {
      targets: targets,
      ticksRemaining: this.DREAM_INVASION_DURATION
    });
    
    player.sendMessage(`§5§lDream Invasion activated on ${targets.length} target(s)!`);
    player.playSound('block.bell.hit', { pitch: 0.5, volume: 1.0 });
    
    return true;
  }
  
  /**
   * Process Dream Invasion each tick - FIXED: Removed camera changes
   */
  static processDreamInvasion(player) {
    const invasion = this.dreamInvasionActive.get(player.name);
    if (!invasion) return;
    
    invasion.ticksRemaining--;
    
    // Apply sleep effects to targets
    for (const target of invasion.targets) {
      try {
        // Simulate sleep with effects
        target.addEffect('slowness', 60, { amplifier: 10, showParticles: true });
        target.addEffect('weakness', 60, { amplifier: 5, showParticles: false });
        target.addEffect('blindness', 60, { amplifier: 0, showParticles: true });
        
        // Spawn sleep particles
        if (invasion.ticksRemaining % 20 === 0) {
          target.dimension.spawnParticle('minecraft:villager_happy', {
            x: target.location.x,
            y: target.location.y + 1,
            z: target.location.z
          });
          
          // Add "Z" particles for sleep effect
          for (let i = 0; i < 3; i++) {
            system.runTimeout(() => {
              target.dimension.spawnParticle('minecraft:crop_growth_emitter', {
                x: target.location.x,
                y: target.location.y + 1 + (i * 0.3),
                z: target.location.z
              });
            }, i * 5);
          }
        }
      } catch (e) {
        // Target may have died
      }
    }
    
    // Player movement restricted but NO camera changes
    player.addEffect('slowness', 20, { amplifier: 255, showParticles: false });
    
    // End effect
    if (invasion.ticksRemaining <= 0) {
      this.dreamInvasionActive.delete(player.name);
      this.dreamInvasionCooldowns.set(player.name, this.DREAM_INVASION_COOLDOWN);
      
      player.sendMessage('§7Dream Invasion ends...');
      player.playSound('block.bell.hit', { pitch: 1.5, volume: 0.8 });
    }
  }
  
  /**
   * Use Nightmare Limbs - FIXED: Visible tentacles
   */
  static useNightmareLimbs(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.nightmareLimbsCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cNightmare Limbs on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }
    
    // Check if already active
    if (this.nightmareLimbsActive.has(player.name)) {
      player.sendMessage('§cNightmare Limbs already active!');
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.NIGHTMARE_LIMBS_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.NIGHTMARE_LIMBS_SPIRIT_COST}`);
      return false;
    }
    
    // Activate Nightmare Limbs
    this.nightmareLimbsActive.set(player.name, this.NIGHTMARE_LIMBS_DURATION);
    
    player.sendMessage('§5§lNightmare Limbs erupt from your back!');
    player.playSound('mob.wither.spawn', { pitch: 1.5, volume: 0.5 });
    
    return true;
  }
  
  /**
   * Process Nightmare Limbs each tick - FIXED: Visible tentacle effects
   */
  static processNightmareLimbs(player) {
    const ticksRemaining = this.nightmareLimbsActive.get(player.name);
    if (!ticksRemaining) return;
    
    const newTicks = ticksRemaining - 1;
    this.nightmareLimbsActive.set(player.name, newTicks);
    
    // Spawn VISIBLE tentacle particles (dense particle streams)
    if (newTicks % 3 === 0) {
      // Create 4 tentacles rotating around player
      for (let i = 0; i < 4; i++) {
        const baseAngle = (i / 4) * Math.PI * 2;
        const waveAngle = baseAngle + (newTicks * 0.1);
        const radius = 1.5;
        
        // Create tentacle "segments" going outward
        for (let segment = 0; segment < 5; segment++) {
          const segmentRadius = radius * (segment / 5);
          const height = 1 + Math.sin(newTicks * 0.1 + segment) * 0.5;
          
          const tentacleLoc = {
            x: player.location.x + Math.cos(waveAngle) * segmentRadius,
            y: player.location.y + height,
            z: player.location.z + Math.sin(waveAngle) * segmentRadius
          };
          
          // Dark particles for tentacles
          player.dimension.spawnParticle('minecraft:soul_particle', tentacleLoc);
          player.dimension.spawnParticle('minecraft:portal', tentacleLoc);
          
          // Add ink splash particles at tips
          if (segment === 4) {
            player.dimension.spawnParticle('minecraft:squid_ink_bubble', tentacleLoc);
          }
        }
      }
    }
    
    // Auto-attack nearby enemies with tentacle strikes
    if (newTicks % 20 === 0) {
      const nearbyEntities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.NIGHTMARE_LIMBS_RANGE,
        excludeTypes: ['minecraft:player', 'minecraft:item']
      });
      
      for (const entity of nearbyEntities) {
        try {
          entity.applyDamage(this.NIGHTMARE_LIMBS_DAMAGE);
          
          // Visual feedback - tentacle strike
          for (let i = 0; i < 10; i++) {
            system.runTimeout(() => {
              entity.dimension.spawnParticle('minecraft:critical_hit_emitter', {
                x: entity.location.x,
                y: entity.location.y + 1,
                z: entity.location.z
              });
              entity.dimension.spawnParticle('minecraft:soul_particle', {
                x: entity.location.x,
                y: entity.location.y + 0.5,
                z: entity.location.z
              });
            }, i * 2);
          }
          
          // Sound effect
          player.playSound('mob.wither.hurt', { pitch: 1.2, volume: 0.8 });
        } catch (e) {
          // Entity may have died
        }
      }
    }
    
    // End effect
    if (newTicks <= 0) {
      this.nightmareLimbsActive.delete(player.name);
      this.nightmareLimbsCooldowns.set(player.name, this.NIGHTMARE_LIMBS_COOLDOWN);
      
      player.sendMessage('§7Your Nightmare Limbs retract...');
      player.playSound('mob.wither.hurt', { pitch: 0.8, volume: 0.5 });
    }
  }
  
  /**
   * Handle ability usage
   */
  static handleAbilityUse(player, abilityId) {
    // Check if it's a Midnight Poet song ability
    if (Object.values(MidnightPoetSequence.ABILITIES).includes(abilityId)) {
      return MidnightPoetSequence.useSong(player, abilityId);
    }
    
    // Use Nightmare abilities
    switch (abilityId) {
      case this.ABILITIES.NIGHTMARE_STATE:
        return this.useNightmareState(player);
      case this.ABILITIES.DREAM_INVASION:
        return this.useDreamInvasion(player);
      case this.ABILITIES.NIGHTMARE_LIMBS:
        return this.useNightmareLimbs(player);
      default:
        return false;
    }
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.NIGHTMARE_STATE]: 
        `§7Cost: ${this.NIGHTMARE_STATE_SPIRIT_COST} Spirit\n§7Become fully invisible (20s)\n§7Extreme speed, phase-like movement`,
      [this.ABILITIES.DREAM_INVASION]:
        `§7Cost: ${this.DREAM_INVASION_SPIRIT_COST} Spirit\n§7Put up to 10 targets to sleep (10s)\n§750m range, immobilizes caster`,
      [this.ABILITIES.NIGHTMARE_LIMBS]:
        `§7Cost: ${this.NIGHTMARE_LIMBS_SPIRIT_COST} Spirit\n§7Summon visible dark tentacles (15s)\n§7Auto-damages nearby enemies`
    };
    return descriptions[abilityId] || 'Unknown ability';
  }
  
  /**
   * Clean up effects
   */
  static removeEffects(player) {
    MidnightPoetSequence.removeEffects(player);
    this.nightmareStateActive.delete(player.name);
    this.nightmareCooldowns.delete(player.name);
    this.dreamInvasionActive.delete(player.name);
    this.dreamInvasionCooldowns.delete(player.name);
    this.nightmareLimbsActive.delete(player.name);
    this.nightmareLimbsCooldowns.delete(player.name);
    this.selectedAbilities.delete(player.name);
  }
}
