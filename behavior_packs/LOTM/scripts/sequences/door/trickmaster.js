import { world, system, EffectTypes } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { ApprenticeSequence } from './apprentice.js';

export class TrickmasterSequence {
  static SEQUENCE_NUMBER = 8;
  static PATHWAY = 'door';
  
  // Passive ability constants - ENHANCED from Apprentice
  static EFFECT_DURATION = 400;
  static SPEED_AMPLIFIER = 2; // Speed III (upgraded)
  static JUMP_AMPLIFIER = 2; // Jump Boost III (upgraded)
  
  // Tumble Dash ability
  static TUMBLE_SPIRIT_COST = 10;
  static TUMBLE_DURATION = 100; // 5 seconds
  static TUMBLE_COOLDOWN = 200; // 10 seconds
  static TUMBLE_SPEED_BOOST = 3; // Speed IV during dash
  
  // Flashbang ability
  static FLASHBANG_SPIRIT_COST = 20;
  static FLASHBANG_RANGE = 10;
  static FLASHBANG_BLIND_DURATION = 100; // 5 seconds
  
  // Burning ability
  static BURNING_SPIRIT_COST = 15;
  static BURNING_RANGE = 20;
  
  // Lightning ability
  static LIGHTNING_SPIRIT_COST = 25;
  static LIGHTNING_RANGE = 25;
  
  // Freeze ability
  static FREEZE_SPIRIT_COST = 20;
  static FREEZE_RAY_RANGE = 20;
  static FREEZE_AOE_RANGE = 18;
  static FREEZE_DURATION = 100; // 5 seconds
  
  // Track active effects and cooldowns
  static tumbleCooldowns = new Map(); // player name -> ticks remaining
  static tumbleActive = new Map(); // player name -> boolean
  static freezeMode = new Map(); // player name -> 'ray' or 'aoe'
  
  // Ability identifiers
  static ABILITIES = {
    TUMBLE: 'tumble',
    FLASHBANG: 'flashbang',
    BURNING: 'burning',
    LIGHTNING: 'lightning',
    FREEZE_RAY: 'freeze_ray',
    FREEZE_AOE: 'freeze_aoe'
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
    if (!this.hasSequence(player)) return;
    
    // Enhanced mobility
    this.applyMobilityEnhancements(player);
    
    // Health bonus (2 extra hearts for Sequence 8)
    this.applyHealthBonus(player, 4);
    
    // Tick down cooldowns
    this.tickCooldowns(player);
    
    // Handle tumble dash
    this.handleTumbleDash(player);

    // Night Vision (see in darkness like dawn light)
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
  }
  
  /**
   * Apply enhanced mobility
   */
  static applyMobilityEnhancements(player) {
    // Check if tumble dash is active
    const tumbleActive = this.tumbleActive.get(player.name);
    
    if (tumbleActive) {
      // During dash - Speed IV
      const speed = player.getEffect('speed');
      if (!speed || speed.amplifier !== this.TUMBLE_SPEED_BOOST || speed.duration < 10) {
        player.addEffect('speed', this.EFFECT_DURATION, {
          amplifier: this.TUMBLE_SPEED_BOOST,
          showParticles: true
        });
      }
    } else {
      // Normal - Speed III
      const speed = player.getEffect('speed');
      if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
        player.addEffect('speed', this.EFFECT_DURATION, {
          amplifier: this.SPEED_AMPLIFIER,
          showParticles: false
        });
      }
    }
    
    // Jump Boost III (always active)
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
    const cooldown = this.tumbleCooldowns.get(player.name);
    if (cooldown && cooldown > 0) {
      this.tumbleCooldowns.set(player.name, cooldown - 1);
    }
  }
  
  /**
   * Handle tumble dash when sprinting
   */
  static handleTumbleDash(player) {
    const isSprinting = player.isSprinting;
    const onCooldown = (this.tumbleCooldowns.get(player.name) || 0) > 0;
    const tumbleActive = this.tumbleActive.get(player.name);
    
    if (isSprinting && !onCooldown && !tumbleActive) {
      // Activate tumble dash
      if (SpiritSystem.consumeSpirit(player, this.TUMBLE_SPIRIT_COST)) {
        this.tumbleActive.set(player.name, true);
        player.sendMessage('§6Tumble activated!');
        player.playSound('mob.shulker.teleport', { pitch: 1.5, volume: 1.0 });
        
        // Spawn particles
        for (let i = 0; i < 20; i++) {
          system.runTimeout(() => {
            if (this.tumbleActive.get(player.name)) {
              player.dimension.spawnParticle('minecraft:endrod', player.location);
            }
          }, i * 5);
        }
        
        // End tumble after duration
        system.runTimeout(() => {
          this.tumbleActive.set(player.name, false);
          this.tumbleCooldowns.set(player.name, this.TUMBLE_COOLDOWN);
          player.sendMessage('§7Tumble ended');
        }, this.TUMBLE_DURATION);
      }
    }
  }
  
  /**
   * Use Flashbang - blinds and deafens nearby entities
   */
  static useFlashbang(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    if (!SpiritSystem.consumeSpirit(player, this.FLASHBANG_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.FLASHBANG_SPIRIT_COST}`);
      return false;
    }
    
    const location = player.location;
    
    // Visual and audio effects
    player.playSound('random.explode', { pitch: 2.0, volume: 1.0 });
    player.dimension.spawnParticle('minecraft:huge_explosion_emitter', location);
    
    // Affect nearby entities
    const entities = player.dimension.getEntities({
      location: location,
      maxDistance: this.FLASHBANG_RANGE,
      excludeTypes: ['minecraft:item']
    });
    
    for (const entity of entities) {
      if (entity.id === player.id) continue; // Don't affect self
      
      // Apply blindness and slowness
      entity.addEffect('blindness', this.FLASHBANG_BLIND_DURATION, {
        amplifier: 0,
        showParticles: true
      });
      entity.addEffect('slowness', this.FLASHBANG_BLIND_DURATION, {
        amplifier: 2,
        showParticles: false
      });
    }
    
    player.sendMessage('§f§lFLASH!');
    return true;
  }
  
  /**
   * Use Burning - fire bolt that ignites targets
   */
  static useBurning(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    if (!SpiritSystem.consumeSpirit(player, this.BURNING_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.BURNING_SPIRIT_COST}`);
      return false;
    }
    
    const viewDirection = player.getViewDirection();
    const startLoc = {
      x: player.location.x + viewDirection.x * 2,
      y: player.location.y + player.getHeadLocation().y - player.location.y,
      z: player.location.z + viewDirection.z * 2
    };
    
    let hasHit = false;
    
    // Create fire bolt projectile with dense flame stream
    for (let i = 0; i < 20; i++) {
      const particleLoc = {
        x: startLoc.x + viewDirection.x * i * 0.5,
        y: startLoc.y + viewDirection.y * i * 0.5,
        z: startLoc.z + viewDirection.z * i * 0.5
      };
      
      system.runTimeout(() => {
        if (hasHit) return; // Stop if we already hit something
        
        // Check for block impact
        const block = player.dimension.getBlock({
          x: Math.floor(particleLoc.x),
          y: Math.floor(particleLoc.y),
          z: Math.floor(particleLoc.z)
        });
        
        if (block && !block.isAir) {
          hasHit = true;
          
          // Impact effects - burst of flames
          for (let j = 0; j < 15; j++) {
            const angle = (j / 15) * Math.PI * 2;
            player.dimension.spawnParticle('minecraft:basic_flame_particle', {
              x: particleLoc.x + Math.cos(angle) * 0.5,
              y: particleLoc.y,
              z: particleLoc.z + Math.sin(angle) * 0.5
            });
          }
          player.dimension.spawnParticle('minecraft:lava_particle', particleLoc);
          
          // 5% chance to set burnable blocks on fire
          if (Math.random() < 0.05) {
            const blockAbove = player.dimension.getBlock({
              x: Math.floor(particleLoc.x),
              y: Math.floor(particleLoc.y) + 1,
              z: Math.floor(particleLoc.z)
            });
            
            if (blockAbove && blockAbove.isAir) {
              try {
                blockAbove.setType('minecraft:fire');
              } catch (e) {
                // Failed to set fire
              }
            }
          }
          
          player.playSound('fire.ignite', { pitch: 1.0, volume: 1.0 });
          return;
        }
        
        // Spawn dense fire bolt particles (single stream with multiple flames)
        player.dimension.spawnParticle('minecraft:basic_flame_particle', particleLoc);
        player.dimension.spawnParticle('minecraft:basic_flame_particle', {
          x: particleLoc.x + 0.2,
          y: particleLoc.y,
          z: particleLoc.z
        });
        player.dimension.spawnParticle('minecraft:basic_flame_particle', {
          x: particleLoc.x - 0.2,
          y: particleLoc.y,
          z: particleLoc.z
        });
        player.dimension.spawnParticle('minecraft:basic_flame_particle', {
          x: particleLoc.x,
          y: particleLoc.y + 0.2,
          z: particleLoc.z
        });
        player.dimension.spawnParticle('minecraft:basic_flame_particle', {
          x: particleLoc.x,
          y: particleLoc.y - 0.2,
          z: particleLoc.z
        });
        player.dimension.spawnParticle('minecraft:lava_particle', particleLoc);
        player.dimension.spawnParticle('minecraft:mobflame_single', particleLoc);
        
        // Melt ice/snow along the path
        if (block) {
          if (block.typeId === 'minecraft:ice' || 
              block.typeId === 'minecraft:packed_ice' || 
              block.typeId === 'minecraft:blue_ice') {
            try {
              block.setType('minecraft:water');
            } catch (e) {}
          } else if (block.typeId === 'minecraft:snow' || 
                     block.typeId === 'minecraft:snow_layer' ||
                     block.typeId === 'minecraft:powder_snow') {
            try {
              block.setType('minecraft:air');
            } catch (e) {}
          }
        }
        
        // Check for entities and set them on fire
        const entities = player.dimension.getEntities({
          location: particleLoc,
          maxDistance: 1.5,
          excludeTypes: ['minecraft:item']
        });
        
        for (const entity of entities) {
          if (entity.id !== player.id) {
            hasHit = true;
            entity.applyDamage(12);
            entity.setOnFire(8, true);
            player.sendMessage('§c§oTarget ignited!');
            
            // Impact particles on entity hit - burst of flames
            for (let j = 0; j < 12; j++) {
              const angle = (j / 12) * Math.PI * 2;
              player.dimension.spawnParticle('minecraft:basic_flame_particle', {
                x: entity.location.x + Math.cos(angle) * 0.5,
                y: entity.location.y + 0.5,
                z: entity.location.z + Math.sin(angle) * 0.5
              });
            }
            break;
          }
        }
        
        // Max range reached
        if (i === 25) {
          hasHit = true;
        }
      }, i * 1);
    }
    
    player.playSound('fire.fire', { pitch: 1.2, volume: 1.0 });
    player.sendMessage('§c§oFlames!');
    
    return true;
  }
  
  /**
   * Use Lightning - strike target with lightning
   */
  static useLightning(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    if (!SpiritSystem.consumeSpirit(player, this.LIGHTNING_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.LIGHTNING_SPIRIT_COST}`);
      return false;
    }
    
    const viewDirection = player.getViewDirection();
    const eyeLoc = player.getHeadLocation();
    
    // Ray cast to find target location
    for (let i = 1; i <= this.LIGHTNING_RANGE; i++) {
      const checkLoc = {
        x: Math.floor(eyeLoc.x + viewDirection.x * i),
        y: Math.floor(eyeLoc.y + viewDirection.y * i),
        z: Math.floor(eyeLoc.z + viewDirection.z * i)
      };
      
      const block = player.dimension.getBlock(checkLoc);
      if (block && !block.isAir) {
        // Strike lightning
        try {
          player.dimension.runCommand(`summon lightning_bolt ${checkLoc.x} ${checkLoc.y} ${checkLoc.z}`);
          player.sendMessage('§b§lZAP!');
          return true;
        } catch (e) {
          player.sendMessage('§cFailed to summon lightning!');
        }
        break;
      }
    }
    
    player.sendMessage('§cNo valid target!');
    SpiritSystem.restoreSpirit(player, this.LIGHTNING_SPIRIT_COST);
    return false;
  }
  
  /**
   * Use Freeze Ray - shoots ice ray at target
   */
  static useFreezeRay(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    if (!SpiritSystem.consumeSpirit(player, this.FREEZE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.FREEZE_SPIRIT_COST}`);
      return false;
    }
    
    const viewDirection = player.getViewDirection();
    const startLoc = {
      x: player.location.x + viewDirection.x * 2,
      y: player.location.y + player.getHeadLocation().y - player.location.y,
      z: player.location.z + viewDirection.z * 2
    };
    
    let hasHitBlock = false;
    
    // Create ice lance projectile
    for (let i = 0; i < 25; i++) {
      const particleLoc = {
        x: startLoc.x + viewDirection.x * i * 0.5,
        y: startLoc.y + viewDirection.y * i * 0.5,
        z: startLoc.z + viewDirection.z * i * 0.5
      };
      
      system.runTimeout(() => {
        if (hasHitBlock) return; // Stop if we hit something
        
        // Check for block impact
        const block = player.dimension.getBlock({
          x: Math.floor(particleLoc.x),
          y: Math.floor(particleLoc.y),
          z: Math.floor(particleLoc.z)
        });
        
        if (block && !block.isAir) {
          hasHitBlock = true;
          
          // Create ice explosion at impact
          player.dimension.spawnParticle('minecraft:water_evaporation_actor_emitter', particleLoc);
          for (let j = 0; j < 10; j++) {
            player.dimension.spawnParticle('minecraft:blue_flame_particle', particleLoc);
          }
          
          // Freeze area around impact (2 block radius)
          const freezeRadius = 2;
          for (let x = -freezeRadius; x <= freezeRadius; x++) {
            for (let y = -freezeRadius; y <= freezeRadius; y++) {
              for (let z = -freezeRadius; z <= freezeRadius; z++) {
                const distance = Math.sqrt(x*x + y*y + z*z);
                if (distance <= freezeRadius) {
                  const freezeLoc = {
                    x: Math.floor(particleLoc.x) + x,
                    y: Math.floor(particleLoc.y) + y,
                    z: Math.floor(particleLoc.z) + z
                  };
                  
                  const freezeBlock = player.dimension.getBlock(freezeLoc);
                  
                  if (freezeBlock) {
                    try {
                      if (freezeBlock.typeId === 'minecraft:water' || 
                          freezeBlock.typeId === 'minecraft:flowing_water') {
                        freezeBlock.setType('minecraft:ice');
                      } else if (freezeBlock.typeId === 'minecraft:lava' || 
                                 freezeBlock.typeId === 'minecraft:flowing_lava') {
                        freezeBlock.setType('minecraft:obsidian');
                      } else if (freezeBlock.typeId === 'minecraft:fire') {
                        freezeBlock.setType('minecraft:air');
                      }
                    } catch (e) {
                      // Failed to modify block
                    }
                  }
                }
              }
            }
          }
          
          // Freeze and damage entities in explosion radius
          const explosionEntities = player.dimension.getEntities({
            location: particleLoc,
            maxDistance: freezeRadius,
            excludeTypes: ['minecraft:item']
          });
          
          for (const entity of explosionEntities) {
            if (entity.id !== player.id) {
              entity.applyDamage(8);
              entity.addEffect('slowness', 120, { amplifier: 4, showParticles: true });
            }
          }
          
          player.playSound('random.glass', { pitch: 1.0, volume: 1.0 });
          return;
        }
        
        // Spawn ice ray particles - dense stream
        player.dimension.spawnParticle('minecraft:blue_flame_particle', particleLoc);
        player.dimension.spawnParticle('minecraft:blue_flame_particle', {
          x: particleLoc.x + 0.2,
          y: particleLoc.y,
          z: particleLoc.z
        });
        player.dimension.spawnParticle('minecraft:blue_flame_particle', {
          x: particleLoc.x - 0.2,
          y: particleLoc.y,
          z: particleLoc.z
        });
        player.dimension.spawnParticle('minecraft:blue_flame_particle', {
          x: particleLoc.x,
          y: particleLoc.y + 0.2,
          z: particleLoc.z
        });
        player.dimension.spawnParticle('minecraft:blue_flame_particle', {
          x: particleLoc.x,
          y: particleLoc.y - 0.2,
          z: particleLoc.z
        });
        player.dimension.spawnParticle('minecraft:water_evaporation_actor_emitter', particleLoc);
        player.dimension.spawnParticle('minecraft:water_evaporation_actor_emitter', {
          x: particleLoc.x + 0.15,
          y: particleLoc.y,
          z: particleLoc.z + 0.15
        });
        
        // Check for entities along the ray
        const entities = player.dimension.getEntities({
          location: particleLoc,
          maxDistance: 1.5,
          excludeTypes: ['minecraft:item']
        });
        
        for (const entity of entities) {
          if (entity.id !== player.id) {
            hasHitBlock = true;
            entity.applyDamage(12);
            entity.addEffect('slowness', 100, { amplifier: 3, showParticles: true });
            
            // Impact particles on entity
            for (let j = 0; j < 15; j++) {
              const angle = (j / 15) * Math.PI * 2;
              player.dimension.spawnParticle('minecraft:blue_flame_particle', {
                x: entity.location.x + Math.cos(angle) * 0.5,
                y: entity.location.y + 0.5,
                z: entity.location.z + Math.sin(angle) * 0.5
              });
            }
            
            player.sendMessage('§b§oTarget frozen!');
            break;
          }
        }
        
        // End of lance or max range
        if (i === 24) {
          player.dimension.spawnParticle('minecraft:water_evaporation_actor_emitter', particleLoc);
          player.playSound('random.glass', { pitch: 1.2, volume: 0.8 });
        }
      }, i * 1);
    }
    
    player.playSound('random.glass', { pitch: 1.0, volume: 1.0 });
    player.sendMessage('§b§o*Ice lance pierces forward*');
    
    return true;
  }
  
  /**
   * Use Freeze AOE - creates freezing aura around player
   */
  static useFreezeAOE(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    if (!SpiritSystem.consumeSpirit(player, this.FREEZE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.FREEZE_SPIRIT_COST}`);
      return false;
    }
    
    const location = player.location;
    
    player.playSound('random.glass', { pitch: 0.8, volume: 1.0 });
    player.sendMessage('§b§oFrost spreads...');
    
    // Create frost particles in area
    for (let i = 0; i < 30; i++) {
      system.runTimeout(() => {
        const angle = (i / 30) * Math.PI * 2;
        const radius = this.FREEZE_AOE_RANGE;
        
        for (let r = 0; r < radius; r += 2) {
          const particleLoc = {
            x: location.x + Math.cos(angle) * r,
            y: location.y + 0.1,
            z: location.z + Math.sin(angle) * r
          };
          
          player.dimension.spawnParticle('minecraft:blue_flame_particle', particleLoc);
        }
      }, i * 3);
    }
    
    // Affect entities in range
    const entities = player.dimension.getEntities({
      location: location,
      maxDistance: this.FREEZE_AOE_RANGE,
      excludeTypes: ['minecraft:item']
    });
    
    for (const entity of entities) {
      if (entity.id === player.id) continue;
      
      entity.addEffect('slowness', this.FREEZE_DURATION, {
        amplifier: 2,
        showParticles: true
      });
    }
    
    // Try to freeze water blocks
    for (let x = -this.FREEZE_AOE_RANGE; x <= this.FREEZE_AOE_RANGE; x++) {
      for (let z = -this.FREEZE_AOE_RANGE; z <= this.FREEZE_AOE_RANGE; z++) {
        const dist = Math.sqrt(x * x + z * z);
        if (dist <= this.FREEZE_AOE_RANGE) {
          const blockLoc = {
            x: Math.floor(location.x + x),
            y: Math.floor(location.y),
            z: Math.floor(location.z + z)
          };
          
          const block = player.dimension.getBlock(blockLoc);
          if (block && block.typeId === 'minecraft:water') {
            try {
              player.dimension.runCommand(`setblock ${blockLoc.x} ${blockLoc.y} ${blockLoc.z} ice`);
            } catch (e) {
              // Failed to freeze this block
            }
          }
        }
      }
    }
    
    return true;
  }
  
  /**
   * Toggle freeze mode
   */
  static toggleFreezeMode(player) {
    const currentMode = this.freezeMode.get(player.name) || 'ray';
    const newMode = currentMode === 'ray' ? 'aoe' : 'ray';
    this.freezeMode.set(player.name, newMode);
    
    const modeName = newMode === 'ray' ? '§bIce Ray' : '§3Frost Aura';
    player.sendMessage(`§7Freeze mode: ${modeName}`);
    
    return true;
  }
  
  /**
   * Use currently selected freeze ability
   */
  static useFreeze(player) {
    const mode = this.freezeMode.get(player.name) || 'ray';
    
    if (mode === 'ray') {
      return this.useFreezeRay(player);
    } else {
      return this.useFreezeAOE(player);
    }
  }
  
  /**
   * Handle ability usage
   */
  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
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
      [this.ABILITIES.FLASHBANG]: `§7Cost: ${this.FLASHBANG_SPIRIT_COST}\n§7Blinds nearby enemies`,
      [this.ABILITIES.BURNING]: `§7Cost: ${this.BURNING_SPIRIT_COST}\n§7Ignite target at range`,
      [this.ABILITIES.LIGHTNING]: `§7Cost: ${this.LIGHTNING_SPIRIT_COST}\n§7Strike with lightning`,
      [this.ABILITIES.FREEZE_RAY]: `§7Cost: ${this.FREEZE_SPIRIT_COST}\n§7Ray/AOE freeze (toggle mode)`
    };
    return descriptions[abilityId] || 'Unknown ability';
  }
  
  /**
   * Clean up effects
   */
  static removeEffects(player) {
    ApprenticeSequence.removeEffects(player);
    this.tumbleCooldowns.delete(player.name);
    this.tumbleActive.delete(player.name);
    this.freezeMode.delete(player.name);
  }
}