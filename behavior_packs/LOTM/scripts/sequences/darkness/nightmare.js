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
  static DREAM_INVASION_DURATION = 400; // 10 seconds
  static DREAM_INVASION_COOLDOWN = 600; // 20 seconds
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

    const cooldown = this.dreamInvasionCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cDream Invasion on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.DREAM_INVASION_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.DREAM_INVASION_SPIRIT_COST}`);
      return false;
    }

    const entities = player.dimension.getEntities({
      location: player.location,
      maxDistance: this.DREAM_INVASION_RANGE,
      excludeTypes: ['minecraft:item']
    });

    const targets = [];
    for (const entity of entities) {
      if (entity.id === player.id) continue;
      if (targets.length >= this.MAX_DREAM_TARGETS) break;
      targets.push(entity);
    }

    if (targets.length === 0) {
      player.sendMessage('§cNo targets in range!');
      SpiritSystem.restoreSpirit(player, this.DREAM_INVASION_SPIRIT_COST);
      return false;
    }

    this.dreamInvasionActive.set(player.name, {
      targets: targets,
      ticksRemaining: this.DREAM_INVASION_DURATION
    });

    player.sendMessage(`§5§lDream Invasion! §7Darkness falls on ${targets.length} target(s)!`);
    player.playSound('block.bell.hit', { pitch: 0.3, volume: 1.0 });

    // Apply immediately on activation
    for (const target of targets) {
      try {
        // Darkness - 15 seconds (300 ticks)
        target.addEffect('darkness', 300, { amplifier: 0, showParticles: true });
        // Slowness III - 20 seconds (400 ticks)
        target.addEffect('slowness', 400, { amplifier: 2, showParticles: true });
        // Weakness I - 15 seconds
        target.addEffect('weakness', 300, { amplifier: 0, showParticles: false });

        // Soul particles on target
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          player.dimension.spawnParticle('minecraft:soul_particle', {
            x: target.location.x + Math.cos(a),
            y: target.location.y + 1,
            z: target.location.z + Math.sin(a)
          });
        }
      } catch (e) {}
    }

    return true;
  }
  
  /**
   * Process Dream Invasion each tick - FIXED: Removed camera changes
   */
  static processDreamInvasion(player) {
    const invasion = this.dreamInvasionActive.get(player.name);
    if (!invasion) return;

    invasion.ticksRemaining--;

    // Ambient soul particles on targets every 40 ticks
    if (invasion.ticksRemaining % 40 === 0) {
      for (const target of invasion.targets) {
        try {
          player.dimension.spawnParticle('minecraft:soul_particle', {
            x: target.location.x,
            y: target.location.y + 1.5,
            z: target.location.z
          });
        } catch (e) {}
      }
    }

    if (invasion.ticksRemaining <= 0) {
      this.dreamInvasionActive.delete(player.name);
      this.dreamInvasionCooldowns.set(player.name, this.DREAM_INVASION_COOLDOWN);
      player.sendMessage('§7Dream Invasion fades...');
      player.playSound('block.bell.hit', { pitch: 1.2, volume: 0.6 });
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

    const loc = player.location;
    const dim = player.dimension;
    const t = newTicks;

    // ── 4 tentacles rotating around player ────────────────────────────────
    // Each tentacle is drawn as a chain of segments from player outward
    // The tip "reaches" toward nearby entities

    if (t % 2 === 0) {  // every 2 ticks for smooth animation
      const numTentacles = 4;
      const baseAngle = (t * 0.08); // slowly rotate over time

      for (let tentIdx = 0; tentIdx < numTentacles; tentIdx++) {
        const angle = baseAngle + (tentIdx / numTentacles) * Math.PI * 2;

        // Tentacle "reach" length oscillates - makes them writhe
        const reach = 3.0 + Math.sin(t * 0.15 + tentIdx * 1.5) * 1.5;
        const segments = 8;

        for (let seg = 0; seg < segments; seg++) {
          const progress = seg / segments; // 0 = base (player), 1 = tip

          // Curve the tentacle with a sine wave - gives organic writhing
          const wave = Math.sin(t * 0.2 + seg * 0.8 + tentIdx) * 0.4 * progress;
          const wavePerp = Math.cos(t * 0.2 + seg * 0.8 + tentIdx) * 0.3 * progress;

          // Position along tentacle
          const segAngle = angle + wave;
          const segDist = progress * reach;

          const px = loc.x + Math.cos(segAngle) * segDist + Math.sin(segAngle + Math.PI/2) * wavePerp;
          const py = loc.y + 1.2 + Math.sin(t * 0.1 + seg * 0.5) * 0.3 * progress - progress * 0.5;
          const pz = loc.z + Math.sin(segAngle) * segDist + Math.cos(segAngle + Math.PI/2) * wavePerp;

          const pos = { x: px, y: py, z: pz };

          // Base segments: sculk soul (dark blue tendrils)
          // Tip segments: squid ink (darker, thicker)
          try {
            if (progress < 0.5) {
              dim.spawnParticle('minecraft:sculk_soul', pos);
            } else if (progress < 0.8) {
              dim.spawnParticle('minecraft:warden_tendril_clicks', pos);
            } else {
              // Tip - squid ink splash
              dim.spawnParticle('minecraft:squid_ink_bubble', pos);
              dim.spawnParticle('minecraft:soul_particle', pos);
            }
          } catch (e) {}
        }

        // ── Tip charges toward nearest entity ────────────────────────────
        // Every 10 ticks, find a target and "lash" toward it
        if (t % 10 === tentIdx * 2) {
          try {
            const tipX = loc.x + Math.cos(angle) * (this.NIGHTMARE_LIMBS_RANGE * 0.7);
            const tipZ = loc.z + Math.sin(angle) * (this.NIGHTMARE_LIMBS_RANGE * 0.7);
            const tipLoc = { x: tipX, y: loc.y + 1, z: tipZ };

            const nearby = dim.getEntities({
              location: tipLoc,
              maxDistance: 2.5,
              excludeTypes: ['minecraft:item', 'minecraft:player']
            });

            for (const target of nearby) {
              // Draw a sculk charge "lash" line from tip to target
              const tx = target.location.x - tipX;
              const ty = (target.location.y + 1) - (loc.y + 1);
              const tz = target.location.z - tipZ;
              const tlen = Math.sqrt(tx*tx + ty*ty + tz*tz);

              if (tlen > 0 && tlen < 4) {
                const lashSteps = 6;
                for (let l = 0; l < lashSteps; l++) {
                  const lp = l / lashSteps;
                  try {
                    dim.spawnParticle('minecraft:sculk_charge_pop', {
                      x: tipX + (tx/tlen) * lp * tlen,
                      y: (loc.y + 1) + ty * lp,
                      z: tipZ + (tz/tlen) * lp * tlen
                    });
                  } catch (e) {}
                }

                // Deal damage
                try { target.applyDamage(this.NIGHTMARE_LIMBS_DAMAGE); } catch (e) {}

                // Hit sound
                try {
                  dim.playSound('mob.warden.tendril_clicks', {
                    location: target.location,
                    pitch: 1.5 + Math.random() * 0.5,
                    volume: 0.6
                  });
                } catch (e) {
                  try {
                    dim.playSound('mob.wither.hurt', {
                      location: target.location,
                      pitch: 1.8,
                      volume: 0.4
                    });
                  } catch (e2) {}
                }
              }
            }
          } catch (e) {}
        }
      }
    }

    // ── Ambient sculk "pulse" ring at base every 20 ticks ─────────────────
    if (t % 20 === 0) {
      const ringSteps = 16;
      for (let i = 0; i < ringSteps; i++) {
        const a = (i / ringSteps) * Math.PI * 2;
        try {
          dim.spawnParticle('minecraft:sculk_soul', {
            x: loc.x + Math.cos(a) * 1.2,
            y: loc.y + 0.1,
            z: loc.z + Math.sin(a) * 1.2
          });
        } catch (e) {}
      }
      try {
        dim.playSound('mob.warden.listening', {
          location: loc,
          pitch: 0.6 + Math.random() * 0.3,
          volume: 0.4
        });
      } catch (e) {}
    }

    // ── End effect ─────────────────────────────────────────────────────────
    if (newTicks <= 0) {
      this.nightmareLimbsActive.delete(player.name);
      this.nightmareLimbsCooldowns.set(player.name, this.NIGHTMARE_LIMBS_COOLDOWN);

      // Retraction burst
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        try {
          dim.spawnParticle('minecraft:sculk_soul', {
            x: loc.x + Math.cos(a) * 2,
            y: loc.y + 1,
            z: loc.z + Math.sin(a) * 2
          });
        } catch (e) {}
      }

      player.sendMessage('§7Your Nightmare Limbs retract into shadow...');
      try {
        dim.playSound('mob.warden.hurt', { location: loc, pitch: 0.8, volume: 0.5 });
      } catch (e) {}
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
