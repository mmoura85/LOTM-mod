import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { AstrologerSequence } from './astrologer.js';

export class ScribeSequence {
  static SEQUENCE_NUMBER = 6;
  static PATHWAY = 'door';
  
  // Passive ability constants - ENHANCED from Astrologer
  static EFFECT_DURATION = 999999;
  static SPEED_AMPLIFIER = 3; // Speed IV
  static JUMP_AMPLIFIER = 2; // Jump Boost III (maintained)
  
  // Record ability constants
  static RECORD_SPIRIT_COST = 40;
  static RECORD_COOLDOWN = 300; // 15 seconds
  static MAX_RECORDED_ABILITIES = 8; // For Sequence 5-6 abilities
  static RECORD_PROBABILITY_BASE = 0.8; // 80% for same sequence
  
  // Track recorded abilities
  static recordedAbilities = new Map(); // player name -> [{type, ability, strength, uses}]
  
  // Dynamic property keys for persistence
  static RECORDINGS_PROPERTY = 'lotm:scribe_recordings';
  
  /**
   * Load recorded abilities from player dynamic properties
   */
  static loadRecordings(player) {
    try {
      const recordingsData = player.getDynamicProperty(this.RECORDINGS_PROPERTY);
      if (recordingsData) {
        const recordings = JSON.parse(recordingsData);
        this.recordedAbilities.set(player.name, recordings);
      }
    } catch (e) {
      // Failed to load - start fresh
    }
  }
  
  /**
   * Save recordings to player dynamic properties
   */
  static saveRecordings(player) {
    try {
      const recordings = this.recordedAbilities.get(player.name) || [];
      player.setDynamicProperty(this.RECORDINGS_PROPERTY, JSON.stringify(recordings));
    } catch (e) {
      // Failed to save
    }
  }
  static recordCooldowns = new Map();
  
  // Ability identifiers
  static ABILITIES = {
    RECORD: 'record',
    VIEW_RECORDINGS: 'view_recordings',
    USE_RECORDING: 'use_recording'
  };
  
  /**
   * Check if player has this sequence or higher (lower sequence number)
   */
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }
  
  /**
   * Apply passive abilities
   */
  static applyPassiveAbilities(player) {
    // const pathway = PathwayManager.getPathway(player);
    // const sequence = PathwayManager.getSequence(player);
    
    // // Only apply if player is exactly this sequence
    // if (pathway !== this.PATHWAY || sequence !== this.SEQUENCE_NUMBER) return;
    
    // Load saved recordings on first tick (if not already loaded)
    if (!this.recordedAbilities.has(player.name)) {
      this.loadRecordings(player);
    }
    
    // Enhanced mobility
    this.applyMobilityEnhancements(player);
    
    // Health bonus (4 extra hearts for Sequence 6)
    this.applyHealthBonus(player, 8);
    
    // Apply passive resistances from recorded abilities
    this.applyRecordedPassives(player);
    
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
  }
  
  /**
   * Apply mobility enhancements
   */
  static applyMobilityEnhancements(player) {
    // Speed IV
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
   * Apply passive effects from recorded abilities (resistances, immunities)
   */
  static applyRecordedPassives(player) {
    const recordings = this.recordedAbilities.get(player.name) || [];
    
    for (const recording of recordings) {
      if (recording.type === 'passive') {
        // Apply the passive effect
        switch (recording.ability) {
          case 'fire_resistance':
            const fireRes = player.getEffect('fire_resistance');
            if (!fireRes || fireRes.duration < 200) {
              player.addEffect('fire_resistance', this.EFFECT_DURATION, {
                amplifier: 0,
                showParticles: false
              });
            }
            break;
            
          case 'water_breathing':
            const waterBreath = player.getEffect('water_breathing');
            if (!waterBreath || waterBreath.duration < 200) {
              player.addEffect('water_breathing', this.EFFECT_DURATION, {
                amplifier: 0,
                showParticles: false
              });
            }
            break;
            
          case 'resistance':
            const resistance = player.getEffect('resistance');
            if (!resistance || resistance.amplifier !== recording.strength || resistance.duration < 200) {
              player.addEffect('resistance', this.EFFECT_DURATION, {
                amplifier: recording.strength,
                showParticles: false
              });
            }
            break;
        }
      }
    }
  }
  
  /**
   * Tick down cooldowns
   */
  static tickCooldowns(player) {
    const cooldown = this.recordCooldowns.get(player.name);
    if (cooldown && cooldown > 0) {
      this.recordCooldowns.set(player.name, cooldown - 1);
    }
  }
  
  /**
   * Attempt to record an ability
   */
  static useRecord(player, targetPlayerName, abilitySlot) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.recordCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      const remaining = Math.ceil(cooldown / 20);
      player.sendMessage(`§cRecord on cooldown: ${remaining}s`);
      return false;
    }
    
    // Check if already at max recordings
    const recordings = this.recordedAbilities.get(player.name) || [];
    if (recordings.length >= this.MAX_RECORDED_ABILITIES) {
      player.sendMessage('§cYou have reached the maximum number of recordings!');
      player.sendMessage('§7Use an existing recording to free up space.');
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.RECORD_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.RECORD_SPIRIT_COST}`);
      return false;
    }
    
    // Find target player
    const targetPlayer = world.getAllPlayers().find(p => p.name === targetPlayerName);
    if (!targetPlayer) {
      player.sendMessage('§cTarget player not found!');
      SpiritSystem.restoreSpirit(player, this.RECORD_SPIRIT_COST);
      return false;
    }
    
    // Check if target is too far
    const distance = Math.sqrt(
      Math.pow(player.location.x - targetPlayer.location.x, 2) +
      Math.pow(player.location.y - targetPlayer.location.y, 2) +
      Math.pow(player.location.z - targetPlayer.location.z, 2)
    );
    
    if (distance > 32) {
      player.sendMessage('§cTarget is too far away!');
      SpiritSystem.restoreSpirit(player, this.RECORD_SPIRIT_COST);
      return false;
    }
    
    // Get target's pathway and sequence
    const targetPathway = PathwayManager.getPathway(targetPlayer);
    const targetSequence = PathwayManager.getSequence(targetPlayer);
    
    if (!targetPathway || targetSequence === -1) {
      player.sendMessage('§cTarget has no Beyonder abilities to record!');
      SpiritSystem.restoreSpirit(player, this.RECORD_SPIRIT_COST);
      return false;
    }
    
    // Recording visualization
    player.sendMessage('§5§l§oI came, I saw, I recorded');
    player.playSound('block.enchantment_table.use', { pitch: 1.0, volume: 1.0 });
    
    // Spawn particles
    for (let i = 0; i < 20; i++) {
      system.runTimeout(() => {
        const angle = (i / 20) * Math.PI * 2;
        try {
          player.dimension.spawnParticle('minecraft:soul_particle', {
            x: targetPlayer.location.x + Math.cos(angle) * 2,
            y: targetPlayer.location.y + 1,
            z: targetPlayer.location.z + Math.sin(angle) * 2
          });
        } catch (e){}
      }, i * 2);
    }
    
    // Attempt to record based on target's abilities
    const success = this.attemptRecording(player, targetPlayer, targetPathway, targetSequence, abilitySlot);
    
    if (success) {
      player.sendMessage('§a§lRecording successful!');
      player.playSound('random.levelup', { pitch: 1.5, volume: 1.0 });
      targetPlayer.sendMessage(`§7${player.name} recorded one of your abilities!`);
    } else {
      player.sendMessage('§c§oRecording failed...');
      player.playSound('random.break', { pitch: 0.8, volume: 1.0 });
      // Restore half the spirit cost on failure
      SpiritSystem.restoreSpirit(player, Math.floor(this.RECORD_SPIRIT_COST / 2));
    }
    
    // Set cooldown
    this.recordCooldowns.set(player.name, this.RECORD_COOLDOWN);
    
    return success;
  }
  
  /**
   * Attempt to record an ability from target
   */
  static attemptRecording(player, targetPlayer, targetPathway, targetSequence, abilitySlot) {
    // Calculate success probability based on sequence
    let probability = this.RECORD_PROBABILITY_BASE;
    
    if (targetSequence < 6) {
      // Higher sequences are harder to record
      probability = Math.max(0.1, probability - (6 - targetSequence) * 0.15);
    }
    
    // Roll for success
    if (Math.random() > probability) {
      return false;
    }
    
    // Get ability to record based on pathway and sequence
    const abilityData = this.getRecordableAbility(targetPathway, targetSequence, abilitySlot);
    
    if (!abilityData) {
      return false;
    }
    
    // Calculate strength reduction
    let strength = 1.0;
    if (targetSequence <= 4) {
      strength = 0.5; // Demigod powers halved
    } else if (targetSequence <= 6) {
      strength = 0.7; // Sequence 5-6 at 70%
    } else {
      strength = 0.9; // Sequence 7-9 at 90%
    }
    
    // Add to recordings
    const recordings = this.recordedAbilities.get(player.name) || [];
    recordings.push({
      type: abilityData.type,
      ability: abilityData.ability,
      pathway: targetPathway,
      sequence: targetSequence,
      strength: strength,
      uses: 1, // Single use
      name: abilityData.name
    });
    
    this.recordedAbilities.set(player.name, recordings);
    this.saveRecordings(player); // PERSIST TO STORAGE
    
    return true;
  }
  
  /**
   * Get recordable ability based on pathway and sequence
   */
  static getRecordableAbility(pathway, sequence, slot = 0) {
    // Define abilities by pathway
    const abilities = {
      'darkness': {
        9: [
          { type: 'passive', ability: 'night_vision', name: 'Night Vision' }
        ],
        8: [
          { type: 'active', ability: 'song_of_fear', name: 'Song of Fear' },
          { type: 'active', ability: 'song_of_pacification', name: 'Song of Pacification' }
        ]
      },
      'death': {
        9: [
          { type: 'passive', ability: 'fire_resistance', name: 'Cold Resistance' },
          { type: 'passive', ability: 'resistance', name: 'Decay Resistance' }
        ]
      },
      'door': {
        9: [
          { type: 'active', ability: 'door_opening', name: 'Door Opening' }
        ],
        8: [
          { type: 'active', ability: 'flashbang', name: 'Flashbang' },
          { type: 'active', ability: 'burning', name: 'Flame Manipulation' },
          { type: 'active', ability: 'lightning', name: 'Lightning Strike' },
          { type: 'active', ability: 'freeze', name: 'Freezing' }
        ]
      },
      'twilight_giant': {
        9: [],
        8: [],
        7: [],
        6: [
          { type: 'active', ability: 'light_of_dawn', name: 'Light of Dawn' }
        ]
      }
    };
    
    const pathwayAbilities = abilities[pathway];
    if (!pathwayAbilities) return null;
    
    const sequenceAbilities = pathwayAbilities[sequence];
    if (!sequenceAbilities || sequenceAbilities.length === 0) return null;
    
    // Return specific slot or random ability
    if (slot >= 0 && slot < sequenceAbilities.length) {
      return sequenceAbilities[slot];
    }
    
    return sequenceAbilities[Math.floor(Math.random() * sequenceAbilities.length)];
  }
  
  /**
   * Use a recorded ability
   */
  static useRecording(player, recordingIndex) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    const recordings = this.recordedAbilities.get(player.name) || [];
    
    if (recordingIndex < 0 || recordingIndex >= recordings.length) {
      player.sendMessage('§cInvalid recording index!');
      return false;
    }
    
    const recording = recordings[recordingIndex];
    
    if (recording.type === 'passive') {
      player.sendMessage('§7Passive abilities are automatically applied!');
      return false;
    }
    
    // Calculate spirit cost based on recording strength
    const baseCost = 30;
    const actualCost = Math.floor(baseCost * (1 / recording.strength));
    
    if (!SpiritSystem.consumeSpirit(player, actualCost)) {
      player.sendMessage(`§cNot enough spirit! Need ${actualCost}`);
      return false;
    }
    
    player.sendMessage(`§5§oUsing recorded ability: ${recording.name}`);
    player.playSound('block.enchantment_table.use', { pitch: 1.2, volume: 1.0 });
    
    // Execute the recorded ability with reduced effectiveness
    const success = this.executeRecordedAbility(player, recording);
    
    if (success) {
      // Remove used recording
      recordings.splice(recordingIndex, 1);
      this.recordedAbilities.set(player.name, recordings);
      this.saveRecordings(player); // PERSIST TO STORAGE
      player.sendMessage('§7Recording consumed');
    }
    
    return success;
  }
  
  /**
   * Execute a recorded ability
   */
  static executeRecordedAbility(player, recording) {
    const strength = recording.strength;
    
    switch (recording.ability) {
      case 'song_of_fear':
        return this.executeRecordedSongOfFear(player, strength);
        
      case 'song_of_pacification':
        return this.executeRecordedSongOfPacification(player, strength);
        
      case 'door_opening':
        return this.executeRecordedDoorOpening(player, strength);
        
      case 'flashbang':
        return this.executeRecordedFlashbang(player, strength);
        
      case 'burning':
        return this.executeRecordedBurning(player, strength);
        
      case 'lightning':
        return this.executeRecordedLightning(player, strength);
        
      case 'freeze':
        return this.executeRecordedFreeze(player, strength);
        
      case 'light_of_dawn':
        return this.executeRecordedLightOfDawn(player, strength);
        
      default:
        player.sendMessage('§cUnknown recorded ability!');
        return false;
    }
  }
  
  /**
   * Execute recorded Song of Fear (reduced effectiveness)
   */
  static executeRecordedSongOfFear(player, strength) {
    const range = Math.floor(16 * strength);
    const duration = Math.floor(240 * strength);
    
    const entities = player.dimension.getEntities({
      location: player.location,
      maxDistance: range,
      excludeTypes: ['minecraft:player', 'minecraft:item']
    });
    
    for (const entity of entities) {
      entity.addEffect('weakness', duration, { amplifier: 1, showParticles: true });
      entity.addEffect('slowness', duration, { amplifier: 0, showParticles: false });
    }
    
    player.playSound('note.harp', { pitch: 0.5, volume: 0.8 });
    return true;
  }
  
  /**
   * Execute recorded Song of Pacification
   */
  static executeRecordedSongOfPacification(player, strength) {
    const range = Math.floor(16 * strength);
    const duration = Math.floor(240 * strength);
    
    const entities = player.dimension.getEntities({
      location: player.location,
      maxDistance: range,
      excludeTypes: ['minecraft:player', 'minecraft:item']
    });
    
    for (const entity of entities) {
      entity.addEffect('slowness', duration, { amplifier: 3, showParticles: false });
      entity.addEffect('weakness', duration, { amplifier: 5, showParticles: false });
      try {
        entity.dimension.spawnParticle('minecraft:heart_particle', entity.location);
      } catch (e){}
    }
    
    player.playSound('note.harp', { pitch: 1.5, volume: 0.8 });
    return true;
  }
  
  /**
   * Execute recorded Door Opening
   */
  static executeRecordedDoorOpening(player, strength) {
    // Simplified door opening with reduced range
    const maxThickness = Math.floor(6 * strength);
    return AstrologerSequence.useDoorOpening(player, false);
  }
  
  /**
   * Execute recorded Flashbang
   */
  static executeRecordedFlashbang(player, strength) {
    const range = Math.floor(10 * strength);
    const duration = Math.floor(100 * strength);
    
    player.playSound('random.explode', { pitch: 2.0, volume: 0.8 });
    try {
      player.dimension.spawnParticle('minecraft:huge_explosion_emitter', player.location);
    } catch (e){}
    const entities = player.dimension.getEntities({
      location: player.location,
      maxDistance: range,
      excludeTypes: ['minecraft:item']
    });
    
    for (const entity of entities) {
      if (entity.id === player.id) continue;
      entity.addEffect('blindness', duration, { amplifier: 0, showParticles: true });
      entity.addEffect('slowness', duration, { amplifier: 1, showParticles: false });
    }
    
    return true;
  }
  
  /**
   * Execute recorded Burning
   */
  static executeRecordedBurning(player, strength) {
    const damage = Math.floor(12 * strength);
    const fireDuration = Math.floor(8 * strength);
    
    const viewDirection = player.getViewDirection();
    const startLoc = {
      x: player.location.x + viewDirection.x * 2,
      y: player.location.y + player.getHeadLocation().y - player.location.y,
      z: player.location.z + viewDirection.z * 2
    };
    
    let hasHit = false;
    
    for (let i = 0; i < 15; i++) {
      const particleLoc = {
        x: startLoc.x + viewDirection.x * i * 0.5,
        y: startLoc.y + viewDirection.y * i * 0.5,
        z: startLoc.z + viewDirection.z * i * 0.5
      };
      
      system.runTimeout(() => {
        if (hasHit) return;
        try {
          player.dimension.spawnParticle('minecraft:basic_flame_particle', particleLoc);
        } catch (e){}
        const entities = player.dimension.getEntities({
          location: particleLoc,
          maxDistance: 1.5,
          excludeTypes: ['minecraft:item']
        });
        
        for (const entity of entities) {
          if (entity.id !== player.id) {
            hasHit = true;
            entity.applyDamage(damage);
            entity.setOnFire(fireDuration, true);
            break;
          }
        }
      }, i * 1);
    }
    
    player.playSound('fire.fire', { pitch: 1.0, volume: 0.8 });
    return true;
  }
  
  /**
   * Execute recorded Lightning
   */
  static executeRecordedLightning(player, strength) {
    const range = Math.floor(25 * strength);
    
    const viewDirection = player.getViewDirection();
    const eyeLoc = player.getHeadLocation();
    
    for (let i = 1; i <= range; i++) {
      const checkLoc = {
        x: Math.floor(eyeLoc.x + viewDirection.x * i),
        y: Math.floor(eyeLoc.y + viewDirection.y * i),
        z: Math.floor(eyeLoc.z + viewDirection.z * i)
      };
      
      const block = player.dimension.getBlock(checkLoc);
      if (block && !block.isAir) {
        try {
          player.dimension.runCommand(`summon lightning_bolt ${checkLoc.x} ${checkLoc.y} ${checkLoc.z}`);
          return true;
        } catch (e) {
          return false;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Execute recorded Freeze
   */
  static executeRecordedFreeze(player, strength) {
    const range = Math.floor(18 * strength);
    const duration = Math.floor(100 * strength);
    
    const entities = player.dimension.getEntities({
      location: player.location,
      maxDistance: range,
      excludeTypes: ['minecraft:item']
    });
    
    for (const entity of entities) {
      if (entity.id === player.id) continue;
      entity.addEffect('slowness', duration, { amplifier: 2, showParticles: true });
    }
    
    player.playSound('random.glass', { pitch: 0.8, volume: 1.0 });
    return true;
  }
  
  /**
   * Execute recorded Light of Dawn
   */
  static executeRecordedLightOfDawn(player, strength) {
    const range = Math.floor(45 * strength);
    const duration = Math.floor(300 * strength);
    
    player.playSound('beacon.activate', { pitch: 1.2, volume: 0.8 });
    
    // Create light zone (simplified version)
    for (let i = 0; i < 10; i++) {
      system.runTimeout(() => {
        const angle = (i / 10) * Math.PI * 2;
        const radius = range * 0.5;
        try {
          player.dimension.spawnParticle('minecraft:soul_particle', {
            x: player.location.x + Math.cos(angle) * radius,
            y: player.location.y + 1,
            z: player.location.z + Math.sin(angle) * radius
          });
        } catch (e){}
      }, i * 5);
    }
    
    // Apply effects to undead
    const entities = player.dimension.getEntities({
      location: player.location,
      maxDistance: range,
      excludeTypes: ['minecraft:item', 'minecraft:player']
    });
    
    for (const entity of entities) {
      const undeadTypes = [
        'minecraft:zombie', 'minecraft:skeleton', 'minecraft:wither_skeleton',
        'minecraft:drowned', 'minecraft:husk', 'minecraft:phantom'
      ];
      
      if (undeadTypes.includes(entity.typeId)) {
        entity.addEffect('weakness', duration, { amplifier: 2, showParticles: true });
        entity.applyDamage(Math.floor(3 * strength));
      }
    }
    
    return true;
  }
  
  /**
   * View current recordings
   */
  static viewRecordings(player) {
    const recordings = this.recordedAbilities.get(player.name) || [];
    
    if (recordings.length === 0) {
      player.sendMessage('§7You have no recorded abilities.');
      return;
    }
    
    player.sendMessage('§6=== Recorded Abilities ===');
    recordings.forEach((rec, index) => {
      const strengthPercent = Math.floor(rec.strength * 100);
      const typeSymbol = rec.type === 'passive' ? '§a[P]' : '§c[A]';
      player.sendMessage(`§e${index}. ${typeSymbol} §f${rec.name} §7(${strengthPercent}% strength)`);
    });
    player.sendMessage(`§7Capacity: ${recordings.length}/${this.MAX_RECORDED_ABILITIES}`);
  }
  
  /**
   * Handle ability usage
   */
  static handleAbilityUse(player, abilityId, param, param2) {
    switch (abilityId) {
      case this.ABILITIES.RECORD:
        return this.useRecord(player, param, param2);
      case this.ABILITIES.VIEW_RECORDINGS:
        this.viewRecordings(player);
        return true;
      case this.ABILITIES.USE_RECORDING:
        return this.useRecording(player, param);
      default:
        // Inherit Astrologer abilities
        return AstrologerSequence.handleAbilityUse(player, abilityId, param);
    }
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.RECORD]: 
        `§7Cost: ${this.RECORD_SPIRIT_COST} Spirit\n§7Record target's Beyonder ability\n§7Capacity: ${this.MAX_RECORDED_ABILITIES} abilities`,
      [this.ABILITIES.VIEW_RECORDINGS]: 
        '§7View all recorded abilities',
      [this.ABILITIES.USE_RECORDING]: 
        '§7Use a recorded ability (single use)'
    };
    return descriptions[abilityId] || 'Unknown ability';
  }
  
  /**
   * Clean up effects
   */
  static removeEffects(player) {
    AstrologerSequence.removeEffects(player);
    this.recordedAbilities.delete(player.name);
    this.recordCooldowns.delete(player.name);
  }
}
