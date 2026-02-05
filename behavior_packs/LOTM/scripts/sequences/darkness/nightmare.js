import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { MidnightPoetSequence } from './midnight_poet.js';

export class NightmareSequence {
  static SEQUENCE_NUMBER = 7;
  static PATHWAY = PathwayManager.PATHWAYS.DARKNESS;
  
  // Passive ability constants - ENHANCED from Midnight Poet
  static NIGHT_VISION_DURATION = 400;
  static SPEED_AMPLIFIER = 3; // Speed III
  static STRENGTH_AMPLIFIER = 3; // Strength III
  static JUMP_AMPLIFIER = 3; // Jump Boost III
  
  // Nightmare State ability
  static NIGHTMARE_STATE_SPIRIT_COST = 50;
  static NIGHTMARE_STATE_DURATION = 400; // 20 seconds
  static NIGHTMARE_STATE_SPEED = 5; // Speed VI while phased
  static NIGHTMARE_STATE_COOLDOWN = 600; // 30 seconds
  
  // Dream Invasion ability
  static DREAM_INVASION_SPIRIT_COST = 40;
  static DREAM_INVASION_RANGE = 100; // 100 meter coax range
  static DREAM_INVASION_DURATION = 200; // 10 seconds
  static DREAM_INVASION_COOLDOWN = 400; // 20 seconds
  static MAX_DREAM_TARGETS = 10;
  
  // Nightmare Limbs ability
  static NIGHTMARE_LIMBS_SPIRIT_COST = 30;
  static NIGHTMARE_LIMBS_DURATION = 300; // 15 seconds
  static NIGHTMARE_LIMBS_DAMAGE = 8; // Extra damage per hit
  static NIGHTMARE_LIMBS_RANGE = 6; // Extended attack range
  static NIGHTMARE_LIMBS_COOLDOWN = 200; // 10 seconds
  
  // Ability tracking
  static nightmareStateActive = new Map(); // player name -> {ticksRemaining, originalLocation}
  static nightmareCooldowns = new Map(); // player name -> ticks remaining
  static dreamInvasionActive = new Map(); // player name -> {targets[], ticksRemaining}
  static dreamInvasionCooldowns = new Map();
  static nightmareLimbsActive = new Map(); // player name -> ticksRemaining
  static nightmareLimbsCooldowns = new Map();
  
  // Ability identifiers
  static ABILITIES = {
    NIGHTMARE_STATE: 'nightmare_state',
    DREAM_INVASION: 'dream_invasion',
    NIGHTMARE_LIMBS: 'nightmare_limbs'
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
    
    // INHERIT: Apply all Midnight Poet passive abilities
    MidnightPoetSequence.applyPassiveAbilities(player);
    
    // Apply night vision (redundant but ensures it's there)
    const nightVision = player.getEffect('night_vision');
    if (!nightVision || nightVision.duration < 200) {
      player.addEffect('night_vision', this.NIGHT_VISION_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }
    
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
    // Check if nightmare state is active - different buffs
    const nightmareActive = this.nightmareStateActive.has(player.name);
    
    if (nightmareActive) {
      // In Nightmare State - extreme speed, no collision
      const speed = player.getEffect('speed');
      if (!speed || speed.amplifier !== this.NIGHTMARE_STATE_SPEED || speed.duration < 10) {
        player.addEffect('speed', this.NIGHT_VISION_DURATION, {
          amplifier: this.NIGHTMARE_STATE_SPEED,
          showParticles: true
        });
      }
      
      // Reduced gravity in nightmare state
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
    
    // Strength III (always)
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.NIGHT_VISION_DURATION, {
        amplifier: this.STRENGTH_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Jump Boost III (always)
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
   * Prevent phantom spawns
   */
  static preventPhantomSpawns(player) {
    try {
      const phantoms = player.dimension.getEntities({
        type: 'minecraft:phantom',
        location: player.location,
        maxDistance: 64
      });
      
      for (const phantom of phantoms) {
        phantom.kill();
      }
    } catch (e) {
      // Silently fail
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
   * Use Nightmare State - become incorporeal, phase through walls
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
    
    // Visual effects
    player.addEffect('invisibility', this.NIGHTMARE_STATE_DURATION, {
      amplifier: 0,
      showParticles: false
    });
    
    player.sendMessage('§5§lYour soul separates from your body!');
    player.sendMessage('§7You enter the Nightmare State...');
    player.playSound('mob.endermen.portal', { pitch: 0.5, volume: 1.0 });
    
    // Spawn particles
    for (let i = 0; i < 20; i++) {
      system.runTimeout(() => {
        if (this.nightmareStateActive.has(player.name)) {
          player.dimension.spawnParticle('minecraft:portal', player.location);
        }
      }, i * 5);
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
    
    // Spawn particles
    if (state.ticksRemaining % 10 === 0) {
      player.dimension.spawnParticle('minecraft:portal', player.location);
      player.dimension.spawnParticle('minecraft:soul_particle', {
        x: player.location.x,
        y: player.location.y + 1,
        z: player.location.z
      });
    }
    
    // End effect
    if (state.ticksRemaining <= 0) {
      this.nightmareStateActive.delete(player.name);
      this.nightmareCooldowns.set(player.name, this.NIGHTMARE_STATE_COOLDOWN);
      
      player.sendMessage('§7You return to your physical form...');
      player.playSound('mob.endermen.portal', { pitch: 1.5, volume: 0.8 });
    }
  }
  
  /**
   * Use Dream Invasion - put nearby entities to sleep
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
   * Process Dream Invasion each tick
   */
  static processDreamInvasion(player) {
    const invasion = this.dreamInvasionActive.get(player.name);
    if (!invasion) return;
    
    invasion.ticksRemaining--;
    
    // Apply sleep effects to targets
    for (const target of invasion.targets) {
      try {
        // Apply slowness, weakness, and blindness to simulate sleep
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
        }
      } catch (e) {
        // Target may have died or despawned
      }
    }
    
    // Player cannot move while using Dream Invasion
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
   * Use Nightmare Limbs - spawn attacking tentacles
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
   * Process Nightmare Limbs each tick
   */
  static processNightmareLimbs(player) {
    const ticksRemaining = this.nightmareLimbsActive.get(player.name);
    if (!ticksRemaining) return;
    
    const newTicks = ticksRemaining - 1;
    this.nightmareLimbsActive.set(player.name, newTicks);
    
    // Spawn tentacle particles around player
    if (newTicks % 5 === 0) {
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + (newTicks * 0.1);
        const radius = 1.5;
        
        player.dimension.spawnParticle('minecraft:portal', {
          x: player.location.x + Math.cos(angle) * radius,
          y: player.location.y + 1,
          z: player.location.z + Math.sin(angle) * radius
        });
      }
    }
    
    // Auto-attack nearby enemies
    if (newTicks % 20 === 0) {
      const nearbyEntities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.NIGHTMARE_LIMBS_RANGE,
        excludeTypes: ['minecraft:player', 'minecraft:item']
      });
      
      for (const entity of nearbyEntities) {
        try {
          entity.applyDamage(this.NIGHTMARE_LIMBS_DAMAGE);
          
          // Visual feedback
          entity.dimension.spawnParticle('minecraft:critical_hit_emitter', entity.location);
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
      // Nightmares can use Poet songs!
      return MidnightPoetSequence.useSong(player, abilityId);
    }
    
    // Otherwise, use Nightmare abilities
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
        `§7Cost: ${this.NIGHTMARE_STATE_SPIRIT_COST} Spirit\n§7Become incorporeal (20s)\n§7Phase through walls, extreme speed`,
      [this.ABILITIES.DREAM_INVASION]:
        `§7Cost: ${this.DREAM_INVASION_SPIRIT_COST} Spirit\n§7Put up to 10 targets to sleep (10s)\n§7100m range, immobilizes caster`,
      [this.ABILITIES.NIGHTMARE_LIMBS]:
        `§7Cost: ${this.NIGHTMARE_LIMBS_SPIRIT_COST} Spirit\n§7Spawn attacking tentacles (15s)\n§7Auto-damages nearby enemies`
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
  }
}
