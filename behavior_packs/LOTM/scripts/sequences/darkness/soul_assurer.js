// ============================================
// SOUL ASSURER - SEQUENCE 6 DARKNESS PATHWAY
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { NightmareSequence } from './nightmare.js';

export class SoulAssurerSequence {
  static SEQUENCE_NUMBER = 6;
  static PATHWAY = PathwayManager.PATHWAYS.DARKNESS;
  
  // Passive constants - NO PHYSICAL ENHANCEMENTS (spiritual focus)
  static NIGHT_VISION_DURATION = 999999;
  static NOCTURNALITY_REST = 2; // Only need 2 hours rest per day (gameplay: saturation effect?)
  
  // Enhanced spirituality
  static MAX_SPIRIT_BONUS = 50; // +50 max spirit over Nightmare
  
  // Requiem ability
  static REQUIEM_SPIRIT_COST = 35;
  static REQUIEM_RANGE = 20; // blocks
  static REQUIEM_DURATION = 300; // 15 seconds
  static REQUIEM_COOLDOWN = 300; // 15 seconds
  static MAX_REQUIEM_TARGETS = 15;
  
  // Enhanced Dream Invasion (strengthened from Nightmare)
  static DREAM_INVASION_RANGE = 150; // Increased from 100
  static DREAM_INVASION_SPIRIT_COST = 35; // Reduced from 40
  static DREAM_INVASION_DURATION = 200;
  static MAX_DREAM_TARGETS = 12; // Increased from 10
  
  // Agitate ability (enhanced singing)
  static AGITATE_SPIRIT_COST = 30;
  static AGITATE_RANGE = 15;
  static AGITATE_DURATION = 200; // 10 seconds
  static AGITATE_COOLDOWN = 200;
  
  // Ability tracking
  static requiemActive = new Map(); // player name -> {targets[], ticksRemaining}
  static requiemCooldowns = new Map();
  static agitateActive = new Map(); // player name -> {targets[], ticksRemaining}
  static agitateCooldowns = new Map();
  
  // Ability identifiers
  static ABILITIES = {
    REQUIEM: 'requiem',
    AGITATE: 'agitate',
    // Inherited abilities
    NIGHTMARE_STATE: NightmareSequence.ABILITIES.NIGHTMARE_STATE,
    DREAM_INVASION: NightmareSequence.ABILITIES.DREAM_INVASION,
    NIGHTMARE_LIMBS: NightmareSequence.ABILITIES.NIGHTMARE_LIMBS
  };
  
  /**
   * Check if player has this sequence or higher (lower number = higher sequence)
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
    
    // Apply night vision
    const nightVision = player.getEffect('night_vision');
    if (!nightVision || nightVision.duration < 200) {
      player.addEffect('night_vision', this.NIGHT_VISION_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }
    
    // INHERIT PHYSICAL BUFFS FROM NIGHTMARE
    // Soul Assurer still gets Speed III, Strength III, Jump III
    this.applyPhysicalEnhancements(player);
    
    // Apply saturation for nocturnality (less hunger/need for rest)
    const saturation = player.getEffect('saturation');
    if (!saturation || saturation.duration < 200) {
      player.addEffect('saturation', 400, {
        amplifier: 0,
        showParticles: false
      });
    }
    
    // Health bonus (3.5 extra hearts for Sequence 6)
    this.applyHealthBonus(player, 7);
    
    // Process active abilities
    this.processRequiem(player);
    this.processAgitate(player);
    
    // IMPORTANT: Process inherited Nightmare abilities too
    NightmareSequence.processNightmareState(player);
    NightmareSequence.processDreamInvasion(player);
    NightmareSequence.processNightmareLimbs(player);
    
    // Tick down cooldowns
    this.tickCooldowns(player);
    NightmareSequence.tickCooldowns(player);
  }
  
  /**
   * Apply physical enhancements (inherited from Nightmare)
   */
  static applyPhysicalEnhancements(player) {
    // Speed III
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== 2 || speed.duration < 200) {
      player.addEffect('speed', 400, {
        amplifier: 2,
        showParticles: false
      });
    }
    
    // Strength III
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== 2 || strength.duration < 200) {
      player.addEffect('strength', 400, {
        amplifier: 2,
        showParticles: false
      });
    }
    
    // Jump Boost III
    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== 2 || jump.duration < 200) {
      player.addEffect('jump_boost', 400, {
        amplifier: 2,
        showParticles: false
      });
    }
  }
  
  /**
   * Apply health bonus
   */
  static applyHealthBonus(player, bonusHearts) {
    const health = player.getEffect('health_boost');
    if (!health || health.amplifier !== Math.floor(bonusHearts / 2) - 1 || health.duration < 200) {
      player.addEffect('health_boost', 400, {
        amplifier: Math.floor(bonusHearts / 2) - 1,
        showParticles: false
      });
    }
  }
  
  /**
   * Tick down cooldowns
   */
  static tickCooldowns(player) {
    // Requiem cooldown
    const requiemCd = this.requiemCooldowns.get(player.name) || 0;
    if (requiemCd > 0) {
      this.requiemCooldowns.set(player.name, requiemCd - 1);
    }
    
    // Agitate cooldown
    const agitateCd = this.agitateCooldowns.get(player.name) || 0;
    if (agitateCd > 0) {
      this.agitateCooldowns.set(player.name, agitateCd - 1);
    }
  }
  
  /**
   * Use Requiem - suppress Spirit Body, cause sleep/freeze
   */
  static useRequiem(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.requiemCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cRequiem on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.REQUIEM_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.REQUIEM_SPIRIT_COST}`);
      return false;
    }
    
    // Find nearby entities
    const entities = player.dimension.getEntities({
      location: player.location,
      maxDistance: this.REQUIEM_RANGE,
      excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow']
    });
    
    const targets = [];
    let targetCount = 0;
    
    for (const entity of entities) {
      if (entity.id === player.id) continue;
      if (targetCount >= this.MAX_REQUIEM_TARGETS) break;
      
      targets.push(entity);
      targetCount++;
    }
    
    if (targets.length === 0) {
      player.sendMessage('§cNo targets in range!');
      SpiritSystem.restoreSpirit(player, this.REQUIEM_SPIRIT_COST);
      return false;
    }
    
    // Activate Requiem
    this.requiemActive.set(player.name, {
      targets: targets,
      ticksRemaining: this.REQUIEM_DURATION
    });
    
    player.sendMessage(`§b§lRequiem activated on ${targets.length} target(s)!`);
    player.sendMessage('§7Their souls are soothed into silence...');
    player.playSound('ambient.cave', { pitch: 1.5, volume: 1.0 });
    
    return true;
  }
  
  /**
   * Process Requiem each tick
   */
  static processRequiem(player) {
    const requiem = this.requiemActive.get(player.name);
    if (!requiem) return;
    
    requiem.ticksRemaining--;
    
    // Apply suppression effects to targets
    for (const target of requiem.targets) {
      try {
        // Suppress movement and actions - freeze on spot
        target.addEffect('slowness', 40, { amplifier: 10, showParticles: false });
        target.addEffect('mining_fatigue', 40, { amplifier: 5, showParticles: false });
        target.addEffect('weakness', 40, { amplifier: 3, showParticles: false });
        
        // Sooth their mind - silence
        if (target.typeId !== 'minecraft:player') {
          // For mobs, also add nausea to simulate confusion
          target.addEffect('nausea', 40, { amplifier: 0, showParticles: false });
        }
        
        // Spawn soul particles
        if (requiem.ticksRemaining % 10 === 0) {
          target.dimension.spawnParticle('minecraft:soul_particle', {
            x: target.location.x,
            y: target.location.y + 1,
            z: target.location.z
          });
          
          target.dimension.spawnParticle('minecraft:water_evaporation_actor_emitter', {
            x: target.location.x,
            y: target.location.y + 1.5,
            z: target.location.z
          });
        }
      } catch (e) {
        // Target may have died or despawned
      }
    }
    
    // End effect
    if (requiem.ticksRemaining <= 0) {
      this.requiemActive.delete(player.name);
      this.requiemCooldowns.set(player.name, this.REQUIEM_COOLDOWN);
      
      player.sendMessage('§7Requiem fades...');
      player.playSound('ambient.cave', { pitch: 0.8, volume: 0.6 });
    }
  }
  
  /**
   * Use Agitate - heighten frustration and destructive urges
   */
  static useAgitate(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.agitateCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cAgitate on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.AGITATE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.AGITATE_SPIRIT_COST}`);
      return false;
    }
    
    // Find nearby entities
    const entities = player.dimension.getEntities({
      location: player.location,
      maxDistance: this.AGITATE_RANGE,
      excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow']
    });
    
    const targets = [];
    
    for (const entity of entities) {
      if (entity.id === player.id) continue;
      targets.push(entity);
    }
    
    if (targets.length === 0) {
      player.sendMessage('§cNo targets in range!');
      SpiritSystem.restoreSpirit(player, this.AGITATE_SPIRIT_COST);
      return false;
    }
    
    // Activate Agitate
    this.agitateActive.set(player.name, {
      targets: targets,
      ticksRemaining: this.AGITATE_DURATION
    });
    
    player.sendMessage(`§c§lAgitate activated on ${targets.length} target(s)!`);
    player.sendMessage('§7Their spirits burn with rage...');
    player.playSound('mob.ghast.scream', { pitch: 1.8, volume: 0.8 });
    
    return true;
  }
  
  /**
   * Process Agitate each tick
   */
  static processAgitate(player) {
    const agitate = this.agitateActive.get(player.name);
    if (!agitate) return;
    
    agitate.ticksRemaining--;
    
    // Apply agitation effects to targets
    for (const target of agitate.targets) {
      try {
        // Heighten aggression and destructiveness
        target.addEffect('strength', 40, { amplifier: 2, showParticles: true });
        target.addEffect('speed', 40, { amplifier: 1, showParticles: false });
        target.addEffect('resistance', 40, { amplifier: -1, showParticles: false }); // Reduce defense (reckless)
        
        // Make them attack aggressively (handled by AI naturally with strength/speed)
        
        // Spawn angry particles
        if (agitate.ticksRemaining % 10 === 0) {
          target.dimension.spawnParticle('minecraft:lava_particle', {
            x: target.location.x,
            y: target.location.y + 1,
            z: target.location.z
          });
          
          target.dimension.spawnParticle('minecraft:critical_hit_emitter', {
            x: target.location.x,
            y: target.location.y + 1.5,
            z: target.location.z
          });
        }
      } catch (e) {
        // Target may have died or despawned
      }
    }
    
    // End effect
    if (agitate.ticksRemaining <= 0) {
      this.agitateActive.delete(player.name);
      this.agitateCooldowns.set(player.name, this.AGITATE_COOLDOWN);
      
      player.sendMessage('§7Agitation subsides...');
      player.playSound('mob.ghast.scream', { pitch: 0.8, volume: 0.4 });
    }
  }
  
  /**
   * Enhanced Dream Invasion (overrides Nightmare version)
   */
  static useDreamInvasion(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown (use Nightmare's cooldown map)
    const cooldown = NightmareSequence.dreamInvasionCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cDream Invasion on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }
    
    // Consume spirit (reduced cost)
    if (!SpiritSystem.consumeSpirit(player, this.DREAM_INVASION_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.DREAM_INVASION_SPIRIT_COST}`);
      return false;
    }
    
    // Find nearby entities (ENHANCED RANGE: 150m)
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
    
    // Activate Dream Invasion (use Nightmare's tracking)
    NightmareSequence.dreamInvasionActive.set(player.name, {
      targets: targets,
      ticksRemaining: this.DREAM_INVASION_DURATION
    });
    
    player.sendMessage(`§5§lDream Invasion activated on ${targets.length} target(s)!`);
    player.sendMessage('§7(Enhanced: 150m range, 12 targets max)');
    player.playSound('block.bell.hit', { pitch: 0.5, volume: 1.0 });
    
    return true;
  }
  
  /**
   * Handle ability usage
   */
  static handleAbilityUse(player, abilityId) {
    // Check if it's a Soul Assurer ability
    if (abilityId === this.ABILITIES.REQUIEM) {
      return this.useRequiem(player);
    }
    
    if (abilityId === this.ABILITIES.AGITATE) {
      return this.useAgitate(player);
    }
    
    // Check if it's enhanced Dream Invasion
    if (abilityId === this.ABILITIES.DREAM_INVASION) {
      return this.useDreamInvasion(player);
    }
    
    // Check if it's an inherited Nightmare ability
    if (abilityId === this.ABILITIES.NIGHTMARE_STATE ||
        abilityId === this.ABILITIES.NIGHTMARE_LIMBS) {
      return NightmareSequence.handleAbilityUse(player, abilityId);
    }
    
    // Check if it's an inherited song (from Midnight Poet)
    const songAbilities = [
      'song_of_fear',
      'song_of_pacification',
      'song_of_cleansing'
    ];
    
    if (songAbilities.includes(abilityId)) {
      return NightmareSequence.handleAbilityUse(player, abilityId);
    }
    
    return false;
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.REQUIEM]: 
        `§7Cost: ${this.REQUIEM_SPIRIT_COST} Spirit\n§7Suppress Spirit Body (15s)\n§7Freeze targets in place, 20m range\n§7Max 15 targets`,
      [this.ABILITIES.AGITATE]:
        `§7Cost: ${this.AGITATE_SPIRIT_COST} Spirit\n§7Heighten aggression (10s)\n§7Makes enemies aggressive and reckless\n§715m range`,
      [this.ABILITIES.DREAM_INVASION]:
        `§7Cost: ${this.DREAM_INVASION_SPIRIT_COST} Spirit (reduced!)\n§7Enhanced: 150m range, 12 targets\n§7Put targets to sleep (10s)`
    };
    
    // Fall back to Nightmare descriptions for inherited abilities
    return descriptions[abilityId] || NightmareSequence.getAbilityDescription(abilityId);
  }
  
  /**
   * Get all available abilities for menu
   */
  static getAllAbilities() {
    return [
      {
        id: this.ABILITIES.REQUIEM,
        name: '§bRequiem',
        description: 'Suppress Spirit Body',
        cost: this.REQUIEM_SPIRIT_COST
      },
      {
        id: this.ABILITIES.AGITATE,
        name: '§cAgitate',
        description: 'Heighten aggression',
        cost: this.AGITATE_SPIRIT_COST
      },
      {
        id: this.ABILITIES.DREAM_INVASION,
        name: '§5Dream Invasion (Enhanced)',
        description: '150m range, 12 targets',
        cost: this.DREAM_INVASION_SPIRIT_COST
      },
      {
        id: this.ABILITIES.NIGHTMARE_STATE,
        name: '§5Nightmare State',
        description: 'Incorporeal form',
        cost: NightmareSequence.NIGHTMARE_STATE_SPIRIT_COST
      },
      {
        id: this.ABILITIES.NIGHTMARE_LIMBS,
        name: '§cNightmare Limbs',
        description: 'Attacking tentacles',
        cost: NightmareSequence.NIGHTMARE_LIMBS_SPIRIT_COST
      }
    ];
  }
  
  /**
   * Clean up effects
   */
  static removeEffects(player) {
    NightmareSequence.removeEffects(player);
    this.requiemActive.delete(player.name);
    this.requiemCooldowns.delete(player.name);
    this.agitateActive.delete(player.name);
    this.agitateCooldowns.delete(player.name);
  }
}
