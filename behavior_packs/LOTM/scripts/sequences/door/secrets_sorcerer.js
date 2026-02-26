// ============================================
// SECRETS SORCERER - SEQUENCE 4 DOOR PATHWAY
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { TravelerSequence } from './traveler.js';

export class SecretsSorcererSequence {
  static SEQUENCE_NUMBER = 4;
  static PATHWAY = 'door';
  
  // Passive constants - NO PHYSICAL ENHANCEMENTS (spiritual focus)
  static EFFECT_DURATION = 400;
  
  // Enhanced spirituality
  static MAX_SPIRIT_BONUS = 150; // +150 max spirit over Traveler
  
  // Space Concealment - Pocket Dimension
  static POCKET_CREATE_SPIRIT_COST = 100;
  static POCKET_ENTER_SPIRIT_COST = 20;
  static POCKET_SIZE = 20; // 20x20x10 blocks (large apartment size)
  static POCKET_HEIGHT = 10;
  static MAX_POCKETS = 3; // Can have 3 personal pocket dimensions
  
  // Prison Pocket (for mob/player imprisonment)
  static PRISON_SPIRIT_COST = 80;
  static PRISON_DURATION = 400; // 20 seconds
  static PRISON_SIZE = 8; // 8x8x8 blocks
  static PRISON_COOLDOWN = 600; // 30 seconds
  
  // Transfiguration Portals
  static PORTAL_SPIRIT_COST = 40;
  static PORTAL_DURATION = 100; // 5 seconds
  static PORTAL_COOLDOWN = 60; // 3 seconds
  static MAX_ACTIVE_PORTALS = 5;
  static PORTAL_TELEPORT_MIN_DISTANCE = 15; // Won't teleport closer than this
  static PORTAL_TELEPORT_MAX_DISTANCE = 50; // Won't teleport farther than this
  static PORTAL_MAX_HEIGHT_OFFSET = 10; // Occasionally teleport up to 10 blocks high
  
  // Track active abilities
  static personalPockets = new Map(); // player name -> [{id, entryLocation, dimension, biome}]
  static activePrisonPockets = new Map(); // prisoner name -> {creator, ticksRemaining, originalLocation}
  static prisonCooldowns = new Map();
  static transfigurationPortals = new Map(); // portal id -> {creator, location, dimension, ticksRemaining}
  static portalCooldowns = new Map();
  static portalCounter = 0;
  
  // Dynamic property keys for persistence
  static POCKETS_PROPERTY = 'lotm:secrets_sorcerer_pockets';
  
  /**
   * Load saved pockets from player dynamic properties
   */
  static loadPockets(player) {
    try {
      const pocketsData = player.getDynamicProperty(this.POCKETS_PROPERTY);
      if (pocketsData) {
        const pockets = JSON.parse(pocketsData);
        this.personalPockets.set(player.name, pockets);
      }
    } catch (e) {
      // Failed to load - start fresh
    }
  }
  
  /**
   * Save pockets to player dynamic properties
   */
  static savePockets(player) {
    try {
      const pockets = this.personalPockets.get(player.name) || [];
      player.setDynamicProperty(this.POCKETS_PROPERTY, JSON.stringify(pockets));
    } catch (e) {
      // Failed to save
    }
  }
  
  // Ability identifiers
  static ABILITIES = {
    CREATE_POCKET: 'create_pocket',
    ENTER_POCKET: 'enter_pocket',
    EXIT_POCKET: 'exit_pocket',
    IMPRISON: 'imprison',
    SPAWN_PORTAL: 'spawn_portal',
    // Inherited
    BLINK: TravelerSequence.ABILITIES.BLINK,
    TRAVEL: TravelerSequence.ABILITIES.TRAVEL,
    INVISIBLE_HAND: TravelerSequence.ABILITIES.INVISIBLE_HAND
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
    if (!this.hasSequence(player)) return;
    
    // CRITICAL: Load Traveler's saved locations
    // Since main.js doesn't call TravelerSequence.applyPassiveAbilities when we're Seq 4,
    // we need to explicitly load Traveler's data here so the menu works
    if (!TravelerSequence.savedLocations.has(player.name)) {
      TravelerSequence.loadLocations(player);
    }
    
    // CRITICAL: Load our own pocket dimensions
    if (!this.personalPockets.has(player.name)) {
      this.loadPockets(player);
    }
    
    // Inherit Traveler mobility (Speed V, Jump IV)
    this.applyMobilityEnhancements(player);
    
    // Health bonus (6 extra hearts)
    this.applyHealthBonus(player, 12);
    
    // Spiritual Intuition (night vision + enhanced senses)
    this.applySpiritualIntuition(player);
    
    // Process active abilities
    this.processActivePrisonPockets(player);
    this.processTransfigurationPortals(player);
    
    // Process inherited Traveler abilities
    TravelerSequence.processActiveDoors();
    TravelerSequence.processInvisibleHand(player);
    
    // Tick down cooldowns
    this.tickCooldowns(player);
    TravelerSequence.tickCooldowns(player);
    
    // Check for Blink trigger
    if (TravelerSequence.shouldTriggerBlink(player)) {
      TravelerSequence.useBlink(player);
    }
  }
  
  /**
   * Apply mobility enhancements (inherited)
   */
  static applyMobilityEnhancements(player) {
    // Speed V
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== 4 || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, {
        amplifier: 4,
        showParticles: false
      });
    }
    
    // Jump Boost IV
    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== 3 || jump.duration < 200) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, {
        amplifier: 3,
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
   * Apply Spiritual Intuition
   */
  static applySpiritualIntuition(player) {
    // Night vision + Regeneration (spiritual awareness)
    const nightVision = player.getEffect('night_vision');
    if (!nightVision || nightVision.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }
    
    const regen = player.getEffect('regeneration');
    if (!regen || regen.amplifier !== 2 || regen.duration < 200) {
      player.addEffect('regeneration', this.EFFECT_DURATION, {
        amplifier: 2,
        showParticles: false
      });
    }
  }
  
  /**
   * Tick down cooldowns
   */
  static tickCooldowns(player) {
    const prisonCd = this.prisonCooldowns.get(player.name) || 0;
    if (prisonCd > 0) {
      this.prisonCooldowns.set(player.name, prisonCd - 1);
    }
    
    const portalCd = this.portalCooldowns.get(player.name) || 0;
    if (portalCd > 0) {
      this.portalCooldowns.set(player.name, portalCd - 1);
    }
  }
  
  /**
   * Create personal pocket dimension
   */
  static createPocket(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check pocket limit
    const pockets = this.personalPockets.get(player.name) || [];
    if (pockets.length >= this.MAX_POCKETS) {
      player.sendMessage(`§cMaximum pockets reached (${this.MAX_POCKETS})!`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.POCKET_CREATE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.POCKET_CREATE_SPIRIT_COST}`);
      return false;
    }
    
    // Create pocket data
    const pocketId = `pocket_${player.name}_${Date.now()}`;
    const pocket = {
      id: pocketId,
      entryLocation: { ...player.location },
      dimension: player.dimension.id,
      biome: 'plains' // Simple flat biome
    };
    
    pockets.push(pocket);
    this.personalPockets.set(player.name, pockets);
    
    // PERSIST TO STORAGE
    this.savePockets(player);
    
    player.sendMessage('§5§lPocket Dimension created!');
    player.sendMessage('§7A concealed space now exists at your location');
    player.playSound('block.portal.travel', { pitch: 0.8, volume: 1.0 });
    
    // Visual effect
    this.spawnPocketCreationParticles(player);
    
    return true;
  }
  
  /**
   * Enter pocket dimension
   */
  static enterPocket(player, pocketIndex = 0) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    const pockets = this.personalPockets.get(player.name) || [];
    if (pockets.length === 0) {
      player.sendMessage('§cYou have no pockets! Create one first.');
      return false;
    }
    
    if (pocketIndex >= pockets.length) {
      pocketIndex = 0;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.POCKET_ENTER_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.POCKET_ENTER_SPIRIT_COST}`);
      return false;
    }
    
    const pocket = pockets[pocketIndex];
    
    // SAVE CURRENT LOCATION as return point (not creation point!)
    player.setDynamicProperty('lotm:pocket_entry_x', player.location.x);
    player.setDynamicProperty('lotm:pocket_entry_y', player.location.y);
    player.setDynamicProperty('lotm:pocket_entry_z', player.location.z);
    player.setDynamicProperty('lotm:pocket_entry_dim', player.dimension.id);
    
    // Teleport to Nether dimension (pocket space simulation)
    // Use a specific Y level (100) with platform generation
    try {
      const netherDim = world.getDimension('nether');
      const pocketLoc = {
        x: pocket.entryLocation.x * 0.125, // Nether coordinate conversion
        y: 100, // Safe Y level in Nether
        z: pocket.entryLocation.z * 0.125
      };
      
      // Generate a platform to prevent falling
      this.generatePocketPlatform(netherDim, pocketLoc);
      
      player.teleport(pocketLoc, {
        dimension: netherDim
      });
      
      player.sendMessage('§5§lEntered pocket dimension!');
      player.sendMessage('§7Exit will return you to where you entered from');
      player.playSound('block.portal.travel', { pitch: 1.2, volume: 1.0 });
      
      // Spawn particles
      this.spawnPocketEntryParticles(player);
      
      return true;
    } catch (e) {
      player.sendMessage('§cFailed to enter pocket!');
      SpiritSystem.restoreSpirit(player, this.POCKET_ENTER_SPIRIT_COST);
      return false;
    }
  }
  
  /**
   * Generate a safe platform in pocket dimension
   */
  static generatePocketPlatform(dimension, location) {
    try {
      const size = this.POCKET_SIZE;
      const centerX = Math.floor(location.x);
      const centerY = Math.floor(location.y) - 1; // Platform below player
      const centerZ = Math.floor(location.z);
      
      // Create a platform of obsidian
      for (let x = centerX - Math.floor(size / 2); x <= centerX + Math.floor(size / 2); x++) {
        for (let z = centerZ - Math.floor(size / 2); z <= centerZ + Math.floor(size / 2); z++) {
          // Floor
          dimension.runCommand(`setblock ${x} ${centerY} ${z} obsidian`);
          // Ceiling (for enclosed space feel)
          dimension.runCommand(`setblock ${x} ${centerY + this.POCKET_HEIGHT} ${z} obsidian`);
        }
      }
      
      // Create walls
      for (let y = centerY + 1; y < centerY + this.POCKET_HEIGHT; y++) {
        // North and South walls
        for (let x = centerX - Math.floor(size / 2); x <= centerX + Math.floor(size / 2); x++) {
          dimension.runCommand(`setblock ${x} ${y} ${centerZ - Math.floor(size / 2)} obsidian`);
          dimension.runCommand(`setblock ${x} ${y} ${centerZ + Math.floor(size / 2)} obsidian`);
        }
        // East and West walls
        for (let z = centerZ - Math.floor(size / 2); z <= centerZ + Math.floor(size / 2); z++) {
          dimension.runCommand(`setblock ${centerX - Math.floor(size / 2)} ${y} ${z} obsidian`);
          dimension.runCommand(`setblock ${centerX + Math.floor(size / 2)} ${y} ${z} obsidian`);
        }
      }
      
      // Add some light sources
      dimension.runCommand(`setblock ${centerX} ${centerY + 1} ${centerZ} glowstone`);
      dimension.runCommand(`setblock ${centerX + 5} ${centerY + 1} ${centerZ + 5} glowstone`);
      dimension.runCommand(`setblock ${centerX - 5} ${centerY + 1} ${centerZ - 5} glowstone`);
      dimension.runCommand(`setblock ${centerX + 5} ${centerY + 1} ${centerZ - 5} glowstone`);
      dimension.runCommand(`setblock ${centerX - 5} ${centerY + 1} ${centerZ + 5} glowstone`);
    } catch (e) {
      // Platform generation failed
    }
  }
  
  /**
   * Exit pocket dimension (returns to entry point)
   */
  static exitPocket(player) {
    try {
      // Get stored entry location
      const entryX = player.getDynamicProperty('lotm:pocket_entry_x');
      const entryY = player.getDynamicProperty('lotm:pocket_entry_y');
      const entryZ = player.getDynamicProperty('lotm:pocket_entry_z');
      const entryDimId = player.getDynamicProperty('lotm:pocket_entry_dim');
      
      if (entryX === undefined || entryY === undefined || entryZ === undefined) {
        player.sendMessage('§cNo entry point found!');
        return false;
      }
      
      const exitLoc = {
        x: entryX,
        y: entryY,
        z: entryZ
      };
      
      const exitDim = world.getDimension(entryDimId || 'overworld');
      
      player.teleport(exitLoc, {
        dimension: exitDim
      });
      
      player.sendMessage('§7Exited pocket dimension');
      player.playSound('block.portal.travel', { pitch: 0.6, volume: 1.0 });
      
      // Clear entry data
      player.setDynamicProperty('lotm:pocket_entry_x', undefined);
      player.setDynamicProperty('lotm:pocket_entry_y', undefined);
      player.setDynamicProperty('lotm:pocket_entry_z', undefined);
      player.setDynamicProperty('lotm:pocket_entry_dim', undefined);
      
      return true;
    } catch (e) {
      player.sendMessage('§cFailed to exit pocket!');
      return false;
    }
  }
  
  /**
   * Imprison entity in prison pocket
   */
  static imprisonEntity(player, target) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.prisonCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cImprisonment on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.PRISON_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.PRISON_SPIRIT_COST}`);
      return false;
    }
    
    // Imprison target
    const prisonData = {
      creator: player.name,
      ticksRemaining: this.PRISON_DURATION,
      originalLocation: { ...target.location },
      originalDimension: target.dimension.id
    };
    
    this.activePrisonPockets.set(target.id, prisonData);
    
    // Debug: Show where they'll return to
    const returnCoords = `(${Math.floor(prisonData.originalLocation.x)}, ${Math.floor(prisonData.originalLocation.y)}, ${Math.floor(prisonData.originalLocation.z)})`;
    player.sendMessage(`§7Return location: ${returnCoords} in ${prisonData.originalDimension}`);
    
    // Teleport target to prison dimension (Nether with small prison cell)
    try {
      const netherDim = world.getDimension('nether');
      const prisonLoc = {
        x: Math.floor(target.location.x * 0.125), // Nether coordinates
        y: 200, // High up in Nether (isolated)
        z: Math.floor(target.location.z * 0.125)
      };
      
      // Generate prison cell BEFORE teleporting
      this.generatePrisonCell(netherDim, prisonLoc);
      
      // Small delay to ensure cell is built
      system.runTimeout(() => {
        try {
          target.teleport(prisonLoc, {
            dimension: netherDim
          });
          
          // Apply effects
          target.addEffect('slowness', this.PRISON_DURATION, {
            amplifier: 5,
            showParticles: true
          });
          
          target.addEffect('weakness', this.PRISON_DURATION, {
            amplifier: 3,
            showParticles: false
          });
          
          target.addEffect('mining_fatigue', this.PRISON_DURATION, {
            amplifier: 5,
            showParticles: false
          });
        } catch (e) {
          // Teleport failed
        }
      }, 5);
      
      player.sendMessage('§5§lTarget imprisoned!');
      player.sendMessage(`§7They will return in ${this.PRISON_DURATION / 20}s`);
      player.playSound('mob.endermen.portal', { pitch: 0.5, volume: 1.0 });
      
      return true;
    } catch (e) {
      player.sendMessage('§cFailed to imprison target!');
      SpiritSystem.restoreSpirit(player, this.PRISON_SPIRIT_COST);
      this.activePrisonPockets.delete(target.id);
      return false;
    }
  }
  
  /**
   * Generate small prison cell
   */
  static generatePrisonCell(dimension, location) {
    try {
      const size = this.PRISON_SIZE;
      const centerX = Math.floor(location.x);
      const centerY = Math.floor(location.y) - 1;
      const centerZ = Math.floor(location.z);
      
      // Create a small prison cell with bedrock
      for (let x = centerX - Math.floor(size / 2); x <= centerX + Math.floor(size / 2); x++) {
        for (let z = centerZ - Math.floor(size / 2); z <= centerZ + Math.floor(size / 2); z++) {
          // Floor
          dimension.runCommand(`setblock ${x} ${centerY} ${z} bedrock`);
          // Ceiling
          dimension.runCommand(`setblock ${x} ${centerY + size} ${z} bedrock`);
        }
      }
      
      // Create walls
      for (let y = centerY + 1; y < centerY + size; y++) {
        // North and South walls
        for (let x = centerX - Math.floor(size / 2); x <= centerX + Math.floor(size / 2); x++) {
          dimension.runCommand(`setblock ${x} ${y} ${centerZ - Math.floor(size / 2)} bedrock`);
          dimension.runCommand(`setblock ${x} ${y} ${centerZ + Math.floor(size / 2)} bedrock`);
        }
        // East and West walls
        for (let z = centerZ - Math.floor(size / 2); z <= centerZ + Math.floor(size / 2); z++) {
          dimension.runCommand(`setblock ${centerX - Math.floor(size / 2)} ${y} ${z} bedrock`);
          dimension.runCommand(`setblock ${centerX + Math.floor(size / 2)} ${y} ${z} bedrock`);
        }
      }
      
      // Add a light source
      dimension.runCommand(`setblock ${centerX} ${centerY + 1} ${centerZ} glowstone`);
    } catch (e) {
      // Prison generation failed
    }
  }
  
  /**
   * Process prison pockets
   */
  static processActivePrisonPockets(player) {
    const toRemove = [];
    
    for (const [entityId, prisonData] of this.activePrisonPockets) {
      prisonData.ticksRemaining--;
      
      if (prisonData.ticksRemaining <= 0) {
        // Release prisoner - return to original location
        try {
          // First check if it's a player
          const allPlayers = world.getAllPlayers();
          const prisoner = allPlayers.find(p => p.id === entityId);
          
          if (prisoner) {
            const originalDim = world.getDimension(prisonData.originalDimension || 'overworld');
            
            prisoner.teleport(prisonData.originalLocation, {
              dimension: originalDim
            });
            
            prisoner.removeEffect('slowness');
            prisoner.removeEffect('weakness');
            prisoner.removeEffect('mining_fatigue');
            
            prisoner.sendMessage('§7You have been released from the prison pocket');
          } else {
            // It's a mob - search all dimensions for it
            let entity = null;
            
            // Search Nether first (most likely)
            const netherDim = world.getDimension('nether');
            const netherEntities = netherDim.getEntities();
            entity = netherEntities.find(e => e.id === entityId);
            
            // If not found in Nether, search original dimension
            if (!entity) {
              const originalDim = world.getDimension(prisonData.originalDimension || 'overworld');
              const originalDimEntities = originalDim.getEntities();
              entity = originalDimEntities.find(e => e.id === entityId);
            }
            
            // If found, return to original location
            if (entity) {
              const originalDim = world.getDimension(prisonData.originalDimension || 'overworld');
              
              // Add small upward offset to prevent suffocation
              const returnLoc = {
                x: prisonData.originalLocation.x,
                y: prisonData.originalLocation.y + 0.5,
                z: prisonData.originalLocation.z
              };
              
              entity.teleport(returnLoc, {
                dimension: originalDim
              });
              
              entity.removeEffect('slowness');
              entity.removeEffect('weakness');
              entity.removeEffect('mining_fatigue');
            }
          }
        } catch (e) {
          // Release failed - entity may have been killed
        }
        
        toRemove.push(entityId);
        this.prisonCooldowns.set(prisonData.creator, this.PRISON_COOLDOWN);
      }
    }
    
    for (const id of toRemove) {
      this.activePrisonPockets.delete(id);
    }
  }
  
  /**
   * Spawn Transfiguration Portal
   */
  static spawnTransfigurationPortal(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.portalCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      return false; // Silent fail
    }
    
    // Check portal limit
    let playerPortalCount = 0;
    for (const [id, portalData] of this.transfigurationPortals) {
      if (portalData.creator === player.name) {
        playerPortalCount++;
      }
    }
    
    if (playerPortalCount >= this.MAX_ACTIVE_PORTALS) {
      player.sendMessage(`§cMaximum portals reached (${this.MAX_ACTIVE_PORTALS})!`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.PORTAL_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.PORTAL_SPIRIT_COST}`);
      return false;
    }
    
    // Create portal at player's look direction
    const viewDir = player.getViewDirection();
    const portalLoc = {
      x: player.location.x + viewDir.x * 3,
      y: player.location.y + viewDir.y * 3 + 1,
      z: player.location.z + viewDir.z * 3
    };
    
    const portalId = `portal_${this.portalCounter++}`;
    const portalData = {
      creator: player.name,
      location: portalLoc,
      dimension: player.dimension.id,
      ticksRemaining: this.PORTAL_DURATION,
      blockLocation: {
        x: Math.floor(portalLoc.x),
        y: Math.floor(portalLoc.y),
        z: Math.floor(portalLoc.z)
      }
    };
    
    this.transfigurationPortals.set(portalId, portalData);
    
    // Spawn portal BLOCK (not just particles)
    try {
      const x = portalData.blockLocation.x;
      const y = portalData.blockLocation.y;
      const z = portalData.blockLocation.z;
      
      // Try to place custom blocks (or fall back to sea_lantern for testing)
      const result1 = player.dimension.runCommand(`setblock ${x} ${y} ${z} lotm:traveler_portal`);
      const result2 = player.dimension.runCommand(`setblock ${x} ${y + 1} ${z} lotm:traveler_portal`);
      
      player.sendMessage(`§7Portal blocks placed: ${result1.successCount + result2.successCount}/2`);
    } catch (e) {
      player.sendMessage(`§cBlock placement failed: ${e.message || e}`);
      // Fall back to sea lantern if custom block doesn't exist
      try {
        player.dimension.runCommand(`setblock ${portalData.blockLocation.x} ${portalData.blockLocation.y} ${portalData.blockLocation.z} sea_lantern`);
        player.dimension.runCommand(`setblock ${portalData.blockLocation.x} ${portalData.blockLocation.y + 1} ${portalData.blockLocation.z} sea_lantern`);
        player.sendMessage(`§7Using fallback blocks`);
      } catch (e2) {}
    }
    
    player.sendMessage('§d§lTransfiguration Portal spawned!');
    player.playSound('block.portal.trigger', { pitch: 1.5, volume: 0.8 });
    
    // Spawn portal particles
    this.spawnPortalParticles(player.dimension, portalLoc);
    
    return true;
  }
  
  /**
   * Process Transfiguration Portals
   */
  static processTransfigurationPortals(player) {
    const toRemove = [];
    
    for (const [portalId, portalData] of this.transfigurationPortals) {
      portalData.ticksRemaining--;
      
      // Spawn particles
      if (portalData.ticksRemaining % 2 === 0) {
        this.spawnPortalParticles(player.dimension, portalData.location);
      }
      
      // Check for entities touching portal
      try {
        const nearbyEntities = player.dimension.getEntities({
          location: portalData.location,
          maxDistance: 2
        });
        
        for (const entity of nearbyEntities) {
          // Skip the portal creator temporarily
          if (entity.name === portalData.creator && portalData.ticksRemaining > this.PORTAL_DURATION - 20) {
            continue; // Grace period
          }
          
          // Teleport entity randomly
          this.randomTeleportEntity(entity, portalData.location);
        }
      } catch (e) {}
      
      // Remove expired portals
      if (portalData.ticksRemaining <= 0) {
        toRemove.push(portalId);
        
        // Remove portal blocks (both bottom and top)
        if (portalData.blockLocation) {
          try {
            const x = portalData.blockLocation.x;
            const y = portalData.blockLocation.y;
            const z = portalData.blockLocation.z;
            player.dimension.runCommand(`setblock ${x} ${y} ${z} air`);
            player.dimension.runCommand(`setblock ${x} ${y + 1} ${z} air`);
          } catch (e) {}
        }
        
        // Set cooldown for creator
        if (portalData.creator) {
          this.portalCooldowns.set(portalData.creator, this.PORTAL_COOLDOWN);
        }
      }
    }
    
    for (const id of toRemove) {
      this.transfigurationPortals.delete(id);
    }
  }
  
  /**
   * Random teleport entity
   */
  static randomTeleportEntity(entity, portalLoc) {
    try {
      // Random distance and angle
      const minDist = this.PORTAL_TELEPORT_MIN_DISTANCE;
      const maxDist = this.PORTAL_TELEPORT_MAX_DISTANCE;
      const distance = minDist + Math.random() * (maxDist - minDist);
      const angle = Math.random() * Math.PI * 2;
      
      // Occasionally teleport up
      const heightOffset = Math.random() < 0.3 ? Math.random() * this.PORTAL_MAX_HEIGHT_OFFSET : 0;
      
      const teleportLoc = {
        x: portalLoc.x + Math.cos(angle) * distance,
        y: portalLoc.y + heightOffset,
        z: portalLoc.z + Math.sin(angle) * distance
      };
      
      entity.teleport(teleportLoc, {
        dimension: entity.dimension
      });
      
      // Visual effect
      entity.dimension.spawnParticle('minecraft:portal', entity.location);
      entity.dimension.spawnParticle('minecraft:endrod', entity.location);
      
      entity.playSound('mob.endermen.portal', { pitch: 1.5, volume: 0.6 });
    } catch (e) {
      // Teleport failed
    }
  }
  
  /**
   * Spawn pocket creation particles
   */
  static spawnPocketCreationParticles(player) {
    for (let i = 0; i < 30; i++) {
      system.runTimeout(() => {
        try {
          const angle = (i / 30) * Math.PI * 2;
          player.dimension.spawnParticle('minecraft:portal', {
            x: player.location.x + Math.cos(angle) * 2,
            y: player.location.y + 1,
            z: player.location.z + Math.sin(angle) * 2
          });
        } catch (e) {}
      }, i * 2);
    }
  }
  
  /**
   * Spawn pocket entry particles
   */
  static spawnPocketEntryParticles(player) {
    for (let i = 0; i < 20; i++) {
      system.runTimeout(() => {
        try {
          player.dimension.spawnParticle('minecraft:endrod', {
            x: player.location.x,
            y: player.location.y + i * 0.5,
            z: player.location.z
          });
        } catch (e) {}
      }, i * 2);
    }
  }
  
  /**
   * Spawn portal particles
   */
  static spawnPortalParticles(dimension, location) {
    try {
      // Center particles (purple/magenta)
      dimension.spawnParticle('minecraft:portal', location);
      dimension.spawnParticle('minecraft:dragon_breath_trail', location);
      
      // Create a proper ring effect with multiple particles
      const numParticles = 8;
      const radius = 1.5;
      for (let i = 0; i < numParticles; i++) {
        const angle = (i / numParticles) * Math.PI * 2;
        dimension.spawnParticle('minecraft:endrod', {
          x: location.x + Math.cos(angle) * radius,
          y: location.y,
          z: location.z + Math.sin(angle) * radius
        });
      }
    } catch (e) {}
  }
  
  /**
   * Handle ability usage
   */
  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
      case this.ABILITIES.CREATE_POCKET:
        return this.createPocket(player);
      
      case this.ABILITIES.ENTER_POCKET:
        return this.enterPocket(player);
      
      case this.ABILITIES.EXIT_POCKET:
        return this.exitPocket(player);
      
      case this.ABILITIES.IMPRISON:
        // Find nearest entity to imprison
        const target = this.findNearestEntity(player, 10);
        if (target) {
          return this.imprisonEntity(player, target);
        } else {
          player.sendMessage('§cNo target in range!');
          return false;
        }
      
      case this.ABILITIES.SPAWN_PORTAL:
        return this.spawnTransfigurationPortal(player);
      
      // Inherited abilities
      case this.ABILITIES.BLINK:
        return TravelerSequence.useBlink(player);
      
      case this.ABILITIES.TRAVEL:
      case this.ABILITIES.INVISIBLE_HAND:
        return TravelerSequence.handleAbilityUse(player, abilityId);
      
      default:
        return false;
    }
  }
  
  /**
   * Find nearest entity
   */
  static findNearestEntity(player, range) {
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: range,
        excludeNames: [player.name],
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb']
      });
      
      if (entities.length === 0) return null;
      
      // Return closest
      let closest = entities[0];
      let closestDist = this.getDistance(player.location, closest.location);
      
      for (const entity of entities) {
        const dist = this.getDistance(player.location, entity.location);
        if (dist < closestDist) {
          closest = entity;
          closestDist = dist;
        }
      }
      
      return closest;
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Get distance between two locations
   */
  static getDistance(loc1, loc2) {
    const dx = loc1.x - loc2.x;
    const dy = loc1.y - loc2.y;
    const dz = loc1.z - loc2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.CREATE_POCKET]:
        `§7Cost: ${this.POCKET_CREATE_SPIRIT_COST} Spirit\n§7Create personal pocket dimension\n§7Max ${this.MAX_POCKETS} pockets`,
      [this.ABILITIES.ENTER_POCKET]:
        `§7Cost: ${this.POCKET_ENTER_SPIRIT_COST} Spirit\n§7Enter your pocket dimension`,
      [this.ABILITIES.EXIT_POCKET]:
        '§7Exit pocket dimension',
      [this.ABILITIES.IMPRISON]:
        `§7Cost: ${this.PRISON_SPIRIT_COST} Spirit\n§7Imprison target (20s)\n§710m range`,
      [this.ABILITIES.SPAWN_PORTAL]:
        `§7Cost: ${this.PORTAL_SPIRIT_COST} Spirit\n§7Defensive portal (5s)\n§7Random teleports enemies\n§7Max ${this.MAX_ACTIVE_PORTALS} active`
    };
    
    return descriptions[abilityId] || TravelerSequence.getAbilityDescription(abilityId);
  }
  
  /**
   * Get all available abilities
   */
  static getAllAbilities() {
    return [
      {
        id: this.ABILITIES.CREATE_POCKET,
        name: '§5Create Pocket',
        description: 'Personal dimension',
        cost: this.POCKET_CREATE_SPIRIT_COST
      },
      {
        id: this.ABILITIES.ENTER_POCKET,
        name: '§5Enter Pocket',
        description: 'Go to pocket',
        cost: this.POCKET_ENTER_SPIRIT_COST
      },
      {
        id: this.ABILITIES.EXIT_POCKET,
        name: '§7Exit Pocket',
        description: 'Return to world',
        cost: 0
      },
      {
        id: this.ABILITIES.IMPRISON,
        name: '§cImprison',
        description: 'Prison pocket (20s)',
        cost: this.PRISON_SPIRIT_COST
      },
      {
        id: this.ABILITIES.SPAWN_PORTAL,
        name: '§dTransfiguration Portal',
        description: 'Random teleport trap',
        cost: this.PORTAL_SPIRIT_COST
      },
      {
        id: this.ABILITIES.BLINK,
        name: '§bBlink (inherited)',
        description: 'Quick teleport',
        cost: 5
      }
    ];
  }
  
  /**
   * Clean up effects
   */
  static removeEffects(player) {
    TravelerSequence.removeEffects(player);
    
    this.personalPockets.delete(player.name);
    this.prisonCooldowns.delete(player.name);
    this.portalCooldowns.delete(player.name);
    
    // Remove player's portals
    const toRemove = [];
    for (const [portalId, portalData] of this.transfigurationPortals) {
      if (portalData.creator === player.name) {
        toRemove.push(portalId);
      }
    }
    
    for (const id of toRemove) {
      this.transfigurationPortals.delete(id);
    }
  }
}
