import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { ScribeSequence } from './scribe.js';

export class TravelerSequence {
  static SEQUENCE_NUMBER = 5;
  static PATHWAY = 'door';
  
  // Passive ability constants - GREATLY ENHANCED from Scribe
  static EFFECT_DURATION = 400;
  static SPEED_AMPLIFIER = 4; // Speed V
  static JUMP_AMPLIFIER = 3; // Jump Boost IV
  
  // Blink ability
  static BLINK_SPIRIT_COST = 5;
  static BLINK_RANGE = 8; // blocks
  static BLINK_COOLDOWN = 20; // 1 second
  
  // Traveler's Door ability - TIERED SPIRIT COST
  static TRAVEL_SPIRIT_CLOSE = 20; // 0-50m (very close)
  static TRAVEL_SPIRIT_NEARBY = 30; // 50-100m (nearby)
  static TRAVEL_SPIRIT_FAR = 50; // 100m+ (all far distances)
  static TRAVEL_COOLDOWN = 200; // 10 seconds
  
  // Door placement
  static DOOR_DURATION = 1200; // 60 seconds (1 minute)
  static MAX_ACTIVE_DOORS = 3;
  
  // Invisible Hand ability
  static INVISIBLE_HAND_SPIRIT_COST = 15;
  static INVISIBLE_HAND_RANGE = 16;
  static INVISIBLE_HAND_DURATION = 100; // 5 seconds channel
  static INVISIBLE_HAND_PICKUP_COOLDOWN = 40; // 2 seconds between pickups
  
  // Track abilities state
  static blinkCooldowns = new Map();
  static travelCooldowns = new Map();
  static savedLocations = new Map(); // player name -> [{name, location, dimension}]
  static selectedLocation = new Map(); // player name -> location index (NEW)
  static activeDoors = new Map(); // door id -> {creator, location, destinations, ticksRemaining}
  static doorCounter = 0;
  static invisibleHandActive = new Map(); // player name -> {ticksRemaining, lastPickup}
  
  // Dynamic property keys for persistence
  static LOCATIONS_PROPERTY = 'lotm:traveler_locations';
  static SELECTED_LOCATION_PROPERTY = 'lotm:traveler_selected';
  
  /**
   * Load saved locations from player dynamic properties
   */
  static loadLocations(player) {
    try {
      const locationsData = player.getDynamicProperty(this.LOCATIONS_PROPERTY);
      if (locationsData) {
        const locations = JSON.parse(locationsData);
        this.savedLocations.set(player.name, locations);
      }
      
      const selectedIndex = player.getDynamicProperty(this.SELECTED_LOCATION_PROPERTY);
      if (selectedIndex !== undefined) {
        this.selectedLocation.set(player.name, selectedIndex);
      }
    } catch (e) {
      // Failed to load - start fresh
    }
  }
  
  /**
   * Save locations to player dynamic properties
   */
  static saveLocations(player) {
    try {
      const locations = this.savedLocations.get(player.name) || [];
      player.setDynamicProperty(this.LOCATIONS_PROPERTY, JSON.stringify(locations));
      
      const selectedIndex = this.selectedLocation.get(player.name);
      if (selectedIndex !== undefined) {
        player.setDynamicProperty(this.SELECTED_LOCATION_PROPERTY, selectedIndex);
      } else {
        player.setDynamicProperty(this.SELECTED_LOCATION_PROPERTY, undefined);
      }
    } catch (e) {
      // Failed to save
    }
  }
  
  // Enhanced Record capacity
  static MAX_DEMIGOD_RECORDINGS = 4;
  static MAX_SEQUENCE_56_RECORDINGS = 16;
  
  // Ability identifiers
  static ABILITIES = {
    BLINK: 'blink',
    TRAVEL: 'travel',
    SAVE_LOCATION: 'save_location',
    VIEW_LOCATIONS: 'view_locations',
    PLACE_DOOR: 'place_door',
    INVISIBLE_HAND: 'invisible_hand'
  };
  
  /**
   * Check if player has this sequence or higher (lower sequence number)
   */
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }
  
  /**
   * Calculate spirit cost based on distance (tiered system)
   */
  static calculateTravelCost(distance) {
    if (distance <= 50) {
      return this.TRAVEL_SPIRIT_CLOSE; // 20 spirit for very close (0-50m)
    } else if (distance <= 100) {
      return this.TRAVEL_SPIRIT_NEARBY; // 30 spirit for nearby (50-100m)
    } else {
      return this.TRAVEL_SPIRIT_FAR; // 50 spirit for far (100m+)
    }
  }
  
  /**
   * Apply passive abilities
   */
  static applyPassiveAbilities(player) {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    // Only apply if player is exactly this sequence
    if (pathway !== this.PATHWAY || sequence !== this.SEQUENCE_NUMBER) return;
    
    // Load saved data on first tick (if not already loaded)
    if (!this.savedLocations.has(player.name)) {
      this.loadLocations(player);
    }
    
    // GREATLY enhanced mobility
    this.applyMobilityEnhancements(player);
    
    // Health bonus (5 extra hearts for Sequence 5)
    this.applyHealthBonus(player, 10);
    
    // Night Vision and Regeneration
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
    
    // Tick down cooldowns
    this.tickCooldowns(player);
    
    // Check for Blink trigger (sneak without shield)
    if (this.shouldTriggerBlink(player)) {
      this.useBlink(player);
    }
    
    // Process invisible hand
    this.processInvisibleHand(player);
    
    // Process active doors
    this.processActiveDoors();
  }
  
  /**
   * Apply mobility enhancements
   */
  static applyMobilityEnhancements(player) {
    // Speed V
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, {
        amplifier: this.SPEED_AMPLIFIER,
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
    const blinkCd = this.blinkCooldowns.get(player.name);
    if (blinkCd && blinkCd > 0) {
      this.blinkCooldowns.set(player.name, blinkCd - 1);
    }
    
    const travelCd = this.travelCooldowns.get(player.name);
    if (travelCd && travelCd > 0) {
      this.travelCooldowns.set(player.name, travelCd - 1);
    }
  }
  
  /**
   * Check if player should trigger blink
   * Activates when sneaking WITHOUT holding a shield
   */
  static shouldTriggerBlink(player) {
    // Must be sneaking
    if (!player.isSneaking) return false;
    
    // Check if NOT holding a shield
    const inventory = player.getComponent('minecraft:inventory');
    if (!inventory || !inventory.container) return false;
    
    const mainHand = inventory.container.getItem(player.selectedSlotIndex);
    const offhand = player.getComponent('minecraft:equippable')?.getEquipment('Offhand');
    
    // Don't blink if holding shield in either hand
    if (mainHand && mainHand.typeId === 'minecraft:shield') return false;
    if (offhand && offhand.typeId === 'minecraft:shield') return false;
    
    return true;
  }
  
  /**
   * Use Blink - short range teleport with afterimages
   */
  static useBlink(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.blinkCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      return false; // Silent fail for blink (used via sneak+sprint)
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.BLINK_SPIRIT_COST)) {
      return false; // Silent fail
    }
    
    // Calculate blink destination
    const viewDirection = player.getViewDirection();
    const blinkDistance = this.BLINK_RANGE;
    
    const destination = {
      x: player.location.x + viewDirection.x * blinkDistance,
      y: player.location.y + viewDirection.y * blinkDistance,
      z: player.location.z + viewDirection.z * blinkDistance
    };
    
    // Find safe landing spot
    const safeDest = this.findSafeTeleportLocation(player.dimension, destination);
    
    if (!safeDest) {
      player.sendMessage('§cCannot blink there!');
      SpiritSystem.restoreSpirit(player, this.BLINK_SPIRIT_COST);
      return false;
    }
    
    // Create afterimages
    const startLoc = player.location;
    for (let i = 0; i < 5; i++) {
      system.runTimeout(() => {
        const t = i / 5;
        const particleLoc = {
          x: startLoc.x + (safeDest.x - startLoc.x) * t,
          y: startLoc.y + (safeDest.y - startLoc.y) * t + 1,
          z: startLoc.z + (safeDest.z - startLoc.z) * t
        };
        
        player.dimension.spawnParticle('minecraft:portal_directional', particleLoc);
        player.dimension.spawnParticle('minecraft:endrod', particleLoc);
      }, i * 2);
    }
    
    // Teleport
    try {
      player.teleport(safeDest, {
        dimension: player.dimension,
        rotation: player.getRotation()
      });
      
      player.playSound('mob.shulker.teleport', { pitch: 1.8, volume: 0.8 });
      
      // Spawn particles at destination
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        player.dimension.spawnParticle('minecraft:portal_directional', {
          x: safeDest.x + Math.cos(angle) * 0.5,
          y: safeDest.y + 1,
          z: safeDest.z + Math.sin(angle) * 0.5
        });
      }
      
      // Set cooldown
      this.blinkCooldowns.set(player.name, this.BLINK_COOLDOWN);
      
      return true;
    } catch (e) {
      player.sendMessage('§cBlink failed!');
      SpiritSystem.restoreSpirit(player, this.BLINK_SPIRIT_COST);
      return false;
    }
  }
  
  /**
   * Find safe teleport location
   */
  static findSafeTeleportLocation(dimension, targetLoc) {
    // Check if target location is safe (air blocks with solid ground below)
    const checkLoc = {
      x: Math.floor(targetLoc.x),
      y: Math.floor(targetLoc.y),
      z: Math.floor(targetLoc.z)
    };
    
    // Try target height and nearby heights
    for (let yOffset = 0; yOffset >= -3; yOffset--) {
      const testY = checkLoc.y + yOffset;
      
      const blockFeet = dimension.getBlock({ x: checkLoc.x, y: testY, z: checkLoc.z });
      const blockHead = dimension.getBlock({ x: checkLoc.x, y: testY + 1, z: checkLoc.z });
      const blockGround = dimension.getBlock({ x: checkLoc.x, y: testY - 1, z: checkLoc.z });
      
      if (blockFeet && blockHead && blockGround &&
          (blockFeet.isAir || blockFeet.isLiquid) &&
          (blockHead.isAir || blockHead.isLiquid) &&
          !blockGround.isAir && !blockGround.isLiquid) {
        return {
          x: checkLoc.x + 0.5,
          y: testY,
          z: checkLoc.z + 0.5
        };
      }
    }
    
    return null;
  }
  
  /**
   * Save current location
   */
  static saveLocation(player, locationName) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    const locations = this.savedLocations.get(player.name) || [];
    
    // Check if name already exists
    if (locations.find(loc => loc.name === locationName)) {
      player.sendMessage('§cA location with that name already exists!');
      return false;
    }
    
    // Max 10 saved locations
    if (locations.length >= 10) {
      player.sendMessage('§cMaximum saved locations reached (10)!');
      return false;
    }
    
    // Save location
    locations.push({
      name: locationName,
      location: {
        x: player.location.x,
        y: player.location.y,
        z: player.location.z
      },
      dimension: player.dimension.id
    });
    
    this.savedLocations.set(player.name, locations);
    this.saveLocations(player); // PERSIST TO STORAGE
    
    player.sendMessage(`§a§lLocation saved: §r§e${locationName}`);
    player.playSound('random.levelup', { pitch: 1.5, volume: 0.8 });
    
    return true;
  }
  
  /**
   * View saved locations
   */
  static viewLocations(player) {
    const locations = this.savedLocations.get(player.name) || [];
    
    if (locations.length === 0) {
      player.sendMessage('§7No saved locations.');
      return;
    }
    
    player.sendMessage('§6=== Saved Locations ===');
    locations.forEach((loc, index) => {
      const distance = Math.floor(Math.sqrt(
        Math.pow(loc.location.x - player.location.x, 2) +
        Math.pow(loc.location.y - player.location.y, 2) +
        Math.pow(loc.location.z - player.location.z, 2)
      ));
      
      player.sendMessage(`§e${index}. §f${loc.name} §7(${distance}m away)`);
    });
  }
  
  /**
   * Travel to saved location
   */
  static travelToLocation(player, locationIndex) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.travelCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      const remaining = Math.ceil(cooldown / 20);
      player.sendMessage(`§cTravel on cooldown: ${remaining}s`);
      return false;
    }
    
    const locations = this.savedLocations.get(player.name) || [];
    
    if (locationIndex < 0 || locationIndex >= locations.length) {
      player.sendMessage('§cInvalid location index!');
      return false;
    }
    
    const destination = locations[locationIndex];
    
    // Calculate distance
    const distance = Math.sqrt(
      Math.pow(destination.location.x - player.location.x, 2) +
      Math.pow(destination.location.y - player.location.y, 2) +
      Math.pow(destination.location.z - player.location.z, 2)
    );
    
    // Calculate tiered spirit cost
    const spiritCost = this.calculateTravelCost(distance);
    
    if (!SpiritSystem.consumeSpirit(player, spiritCost)) {
      player.sendMessage(`§cNot enough spirit! Need ${spiritCost}`);
      return false;
    }
    
    // Start travel sequence
    player.sendMessage(`§5§oOpening Door to §e${destination.name}§5...`);
    player.playSound('block.portal.trigger', { pitch: 1.0, volume: 1.0 });
    
    // Visual effects during travel
    const travelTime = Math.min(60, Math.floor(distance / 20)); // 3 seconds max
    
    for (let i = 0; i < travelTime; i++) {
      system.runTimeout(() => {
        const angle = (i / travelTime) * Math.PI * 4;
        player.dimension.spawnParticle('minecraft:portal_directional', {
          x: player.location.x + Math.cos(angle) * 2,
          y: player.location.y + 1,
          z: player.location.z + Math.sin(angle) * 2
        });
      }, i);
    }
    
    // Teleport after delay
    system.runTimeout(() => {
      try {
        // Get destination dimension
        const destDimension = world.getDimension(destination.dimension);
        
        player.teleport(destination.location, {
          dimension: destDimension,
          rotation: player.getRotation()
        });
        
        player.playSound('mob.endermen.portal', { pitch: 0.8, volume: 1.0 });
        player.sendMessage(`§a§lArrived at §e${destination.name}`);
        
        // Arrival particles
        for (let i = 0; i < 20; i++) {
          system.runTimeout(() => {
            const angle = (i / 20) * Math.PI * 2;
            destDimension.spawnParticle('minecraft:portal_directional', {
              x: destination.location.x + Math.cos(angle) * 2,
              y: destination.location.y + 1,
              z: destination.location.z + Math.sin(angle) * 2
            });
          }, i * 2);
        }
        
        // Set cooldown
        this.travelCooldowns.set(player.name, this.TRAVEL_COOLDOWN);
        
      } catch (e) {
        player.sendMessage('§cTravel failed!');
        SpiritSystem.restoreSpirit(player, spiritCost);
      }
    }, travelTime);
    
    return true;
  }
  
  /**
   * Place a Traveler's Door
   */
  static placeDoor(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Count player's active doors
    let playerDoorCount = 0;
    const playerDoors = [];
    for (const [doorId, doorData] of this.activeDoors) {
      if (doorData.creator === player.name) {
        playerDoorCount++;
        playerDoors.push({ id: doorId, data: doorData });
      }
    }
    
    if (playerDoorCount >= this.MAX_ACTIVE_DOORS) {
      // Show deletion menu instead of blocking
      player.sendMessage(`§cMaximum active doors reached (${this.MAX_ACTIVE_DOORS})!`);
      player.sendMessage('§7Opening deletion menu...');
      
      // We'll need to handle this in the menu system
      // For now, auto-delete oldest portal
      if (playerDoors.length > 0) {
        const oldestDoor = playerDoors[0]; // First one is oldest
        this.removeDoor(oldestDoor.id);
        player.sendMessage(`§7Removed oldest portal to make room`);
      }
      
      // Continue with placement
    }
    
    // Spirit cost
    if (!SpiritSystem.consumeSpirit(player, 30)) {
      player.sendMessage('§cNot enough spirit! Need 30');
      return false;
    }
    
    // Get saved locations
    const locations = this.savedLocations.get(player.name) || [];
    
    if (locations.length === 0) {
      player.sendMessage('§cYou have no saved locations to link!');
      SpiritSystem.restoreSpirit(player, 30);
      return false;
    }
    
    // Get selected location (REQUIRED - door must have a destination when placed)
    const selectedIndex = this.selectedLocation.get(player.name);
    
    if (selectedIndex === undefined || selectedIndex < 0 || selectedIndex >= locations.length) {
      // No selection - require player to select one first
      player.sendMessage('§c§lPlease select a destination first!');
      player.sendMessage('§7Open Traveler\'s Log → Manage Locations → Set as Default');
      SpiritSystem.restoreSpirit(player, 30);
      return false;
    }
    
    // Use selected location as the ONLY destination for this door
    const destination = locations[selectedIndex];
    
    // Get player's facing direction to orient the portal
    const rotation = player.getRotation();
    const yaw = rotation.y;
    
    // Determine portal orientation (North/South or East/West)
    // Yaw: -180 to 180, where 0 = South, -90 = East, 90 = West, 180/-180 = North
    const isNorthSouth = (yaw >= -45 && yaw <= 45) || (yaw >= 135 || yaw <= -135);
    
    // Create door at current location
    const doorId = `door_${this.doorCounter++}`;
    const doorLocation = {
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y),
      z: Math.floor(player.location.z)
    };
    
    // Place portal blocks (2 high, 1 wide) using custom portal block
    try {
      const dimension = player.dimension;
      const x = doorLocation.x;
      const y = doorLocation.y;
      const z = doorLocation.z;
      
      // Use custom traveler_portal block (no collision, glows, semi-transparent)
      dimension.runCommand(`setblock ${x} ${y} ${z} lotm:traveler_portal`);
      dimension.runCommand(`setblock ${x} ${y + 1} ${z} lotm:traveler_portal`);
      
      player.sendMessage('§7Portal blocks placed!');
    } catch (e) {
      player.sendMessage('§7Using particle visualization');
      // Continue anyway - particles will show it
    }
    
    this.activeDoors.set(doorId, {
      creator: player.name,
      location: doorLocation,
      dimension: player.dimension.id,
      destination: destination, // Single destination only
      ticksRemaining: this.DOOR_DURATION,
      isNorthSouth: isNorthSouth // Store orientation for cleanup
    });
    
    player.sendMessage('§5§lTraveler\'s Door placed!');
    player.sendMessage(`§7Destination: §e${destination.name}`);
    player.sendMessage(`§7Anyone can walk through to travel there!`);
    player.sendMessage(`§7Active portals: ${playerDoorCount}/${this.MAX_ACTIVE_DOORS}`);
    player.playSound('block.portal.trigger', { pitch: 1.0, volume: 1.0 });
    
    // Spawn initial particles around the portal
    for (let i = 0; i < 20; i++) {
      system.runTimeout(() => {
        this.spawnDoorParticles(player.dimension, doorLocation);
      }, i * 3);
    }
    
    return true;
  }
  
  /**
   * Remove a specific door
   */
  static removeDoor(doorId) {
    const doorData = this.activeDoors.get(doorId);
    if (!doorData) return false;
    
    // Remove portal blocks
    try {
      const dimension = world.getDimension(doorData.dimension);
      const x = doorData.location.x;
      const y = doorData.location.y;
      const z = doorData.location.z;
      
      dimension.runCommand(`setblock ${x} ${y} ${z} air`);
      dimension.runCommand(`setblock ${x} ${y + 1} ${z} air`);
    } catch (e) {
      // Failed to remove blocks
    }
    
    // Remove from tracking
    this.activeDoors.delete(doorId);
    return true;
  }
  
  /**
   * Get all portals for a player
   */
  static getPlayerDoors(playerName) {
    const doors = [];
    for (const [doorId, doorData] of this.activeDoors) {
      if (doorData.creator === playerName) {
        doors.push({
          id: doorId,
          destination: doorData.destination.name,
          location: doorData.location,
          dimension: doorData.dimension,
          timeLeft: Math.ceil(doorData.ticksRemaining / 20) // Convert to seconds
        });
      }
    }
    return doors;
  }
  
  /**
   * Spawn door particles
   */
  static spawnDoorParticles(dimension, location) {
    // Wrap in try-catch to handle unloaded chunks
    try {
      // Simple portal particles only (avoid complex particle types)
      for (let y = 0; y < 2; y++) {
        // Create a ring of particles at each level
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const radius = 0.4;
          
          // Basic portal particles only
          dimension.spawnParticle('minecraft:portal', {
            x: location.x + 0.5 + Math.cos(angle) * radius,
            y: location.y + y + 0.5,
            z: location.z + 0.5 + Math.sin(angle) * radius
          });
        }
      }
    } catch (e) {
      // Silently fail if chunk is unloaded - this is normal
    }
  }
  
  /**
   * Process active doors
   */
  static processActiveDoors() {
    const toRemove = [];
    
    for (const [doorId, doorData] of this.activeDoors) {
      doorData.ticksRemaining--;
      
      // Spawn particles every 10 ticks (more frequent for better visibility)
      if (doorData.ticksRemaining % 10 === 0) {
        try {
          const dimension = world.getDimension(doorData.dimension);
          this.spawnDoorParticles(dimension, doorData.location);
        } catch (e) {
          // Dimension not loaded
        }
      }
      
      // Check for players entering door
      if (doorData.ticksRemaining % 5 === 0) {
        try {
          const dimension = world.getDimension(doorData.dimension);
          const players = dimension.getPlayers({
            location: doorData.location,
            maxDistance: 2 // Slightly larger to catch players walking through
          });
          
          for (const player of players) {
            this.handleDoorEntry(player, doorData, doorId);
          }
        } catch (e) {
          // Failed to check
        }
      }
      
      // Remove expired doors
      if (doorData.ticksRemaining <= 0) {
        toRemove.push(doorId);
        
        // Remove portal blocks (try multiple types)
        try {
          const dimension = world.getDimension(doorData.dimension);
          const x = doorData.location.x;
          const y = doorData.location.y;
          const z = doorData.location.z;
          
          // Remove both blocks (bottom and top)
          dimension.runCommand(`setblock ${x} ${y} ${z} air`);
          dimension.runCommand(`setblock ${x} ${y + 1} ${z} air`);
        } catch (e) {
          // Failed to remove portal blocks
        }
      }
    }
    
    // Clean up expired doors
    for (const doorId of toRemove) {
      this.activeDoors.delete(doorId);
    }
  }
  
  /**
   * Handle player entering door
   */
  static handleDoorEntry(player, doorData, doorId) {
    // Check if door has a pre-selected destination
    if (doorData.destination) {
      // Auto-teleport to selected destination
      const destination = doorData.destination;
      
      // Calculate distance
      const distance = Math.sqrt(
        Math.pow(destination.location.x - player.location.x, 2) +
        Math.pow(destination.location.y - player.location.y, 2) +
        Math.pow(destination.location.z - player.location.z, 2)
      );
      
      // Calculate tiered spirit cost
      const spiritCost = this.calculateTravelCost(distance);
      
      // Check if player can afford
      if (!SpiritSystem.consumeSpirit(player, spiritCost)) {
        player.sendMessage(`§cNot enough spirit to use this door! Need ${spiritCost}`);
        return;
      }
      
      // Teleport player
      player.sendMessage(`§5§oTraveling to §e${destination.name}§5...`);
      player.playSound('block.portal.trigger', { pitch: 1.0, volume: 1.0 });
      
      const travelTime = Math.min(60, Math.floor(distance / 20));
      
      system.runTimeout(() => {
        try {
          const destDimension = world.getDimension(destination.dimension);
          
          player.teleport(destination.location, {
            dimension: destDimension,
            rotation: player.getRotation()
          });
          
          player.playSound('mob.endermen.portal', { pitch: 0.8, volume: 1.0 });
          player.sendMessage(`§a§lArrived at §e${destination.name}`);
          
          // Arrival particles
          for (let i = 0; i < 20; i++) {
            system.runTimeout(() => {
              const angle = (i / 20) * Math.PI * 2;
              destDimension.spawnParticle('minecraft:portal_directional', {
                x: destination.location.x + Math.cos(angle) * 2,
                y: destination.location.y + 1,
                z: destination.location.z + Math.sin(angle) * 2
              });
            }, i * 2);
          }
          
        } catch (e) {
          player.sendMessage('§cTravel failed!');
          SpiritSystem.restoreSpirit(player, spiritCost);
        }
      }, travelTime);
      
    } else {
      // Show destination menu (original behavior)
      player.sendMessage('§5§l=== Select Destination ===');
      doorData.destinations.forEach((dest, index) => {
        const distance = Math.sqrt(
          Math.pow(dest.location.x - player.location.x, 2) +
          Math.pow(dest.location.y - player.location.y, 2) +
          Math.pow(dest.location.z - player.location.z, 2)
        );
        const spiritCost = this.calculateTravelCost(distance);
        
        player.sendMessage(`§e${index}. §f${dest.name} §7(${Math.floor(distance)}m, ${spiritCost} spirit)`);
      });
      player.sendMessage('§7Use /trigger travel set <index> to select');
      player.sendMessage('§8Tip: Set a default destination in Traveler\'s Log!');
    }
  }
  
  /**
   * Use Invisible Hand
   */
  static useInvisibleHand(player, activate = true) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    if (activate) {
      // Activate invisible hand
      const active = this.invisibleHandActive.get(player.name);
      
      if (active) {
        player.sendMessage('§7Invisible Hand already active');
        return false;
      }
      
      if (!SpiritSystem.consumeSpirit(player, this.INVISIBLE_HAND_SPIRIT_COST)) {
        player.sendMessage(`§cNot enough spirit! Need ${this.INVISIBLE_HAND_SPIRIT_COST}`);
        return false;
      }
      
      this.invisibleHandActive.set(player.name, {
        ticksRemaining: this.INVISIBLE_HAND_DURATION,
        lastPickup: 0
      });
      
      player.sendMessage('§5§oInvisible Hand activated!');
      player.playSound('mob.shulker.ambient', { pitch: 1.5, volume: 0.8 });
      
    } else {
      // Deactivate
      this.invisibleHandActive.delete(player.name);
      player.sendMessage('§7Invisible Hand deactivated');
    }
    
    return true;
  }
  
  /**
   * Process invisible hand
   */
  static processInvisibleHand(player) {
    const handData = this.invisibleHandActive.get(player.name);
    if (!handData) return;
    
    handData.ticksRemaining--;
    handData.lastPickup++;
    
    // Check if can pick up
    if (handData.lastPickup >= this.INVISIBLE_HAND_PICKUP_COOLDOWN) {
      this.attemptInvisibleHandPickup(player, handData);
    }
    
    // Show hand particles
    if (handData.ticksRemaining % 5 === 0) {
      const viewDirection = player.getViewDirection();
      const handLoc = {
        x: player.location.x + viewDirection.x * 3,
        y: player.location.y + 1 + viewDirection.y * 3,
        z: player.location.z + viewDirection.z * 3
      };
      
      player.dimension.spawnParticle('minecraft:soul_particle', handLoc);
    }
    
    // End if duration expired
    if (handData.ticksRemaining <= 0) {
      this.invisibleHandActive.delete(player.name);
      player.sendMessage('§7Invisible Hand faded');
    }
  }
  
  /**
   * Attempt to pick up with invisible hand
   */
  static attemptInvisibleHandPickup(player, handData) {
    const viewDirection = player.getViewDirection();
    const handLoc = {
      x: player.location.x + viewDirection.x * 3,
      y: player.location.y + 1,
      z: player.location.z + viewDirection.z * 3
    };
    
    // Check for items
    const items = player.dimension.getEntities({
      type: 'minecraft:item',
      location: handLoc,
      maxDistance: 2
    });
    
    for (const item of items) {
      try {
        // Pull item to player
        const dx = player.location.x - item.location.x;
        const dy = player.location.y - item.location.y;
        const dz = player.location.z - item.location.z;
        
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (distance > 0) {
          const pullStrength = 0.3;
          item.applyKnockback(dx / distance, dz / distance, pullStrength, dy / distance * pullStrength);
        }
        
        handData.lastPickup = 0;
        player.playSound('random.pop', { pitch: 1.2, volume: 0.5 });
        return;
      } catch (e) {
        // Failed to pull item
      }
    }
    
    // Check for entities (mobs/players)
    const entities = player.dimension.getEntities({
      location: handLoc,
      maxDistance: 2,
      excludeTypes: ['minecraft:item'],
      excludeNames: [player.name]
    });
    
    for (const entity of entities) {
      try {
        // Can only grab similar or lower level entities
        const targetSequence = PathwayManager.getSequence(entity);
        const playerSequence = PathwayManager.getSequence(player);
        
        if (targetSequence !== -1 && targetSequence < playerSequence) {
          continue; // Can't grab higher sequence
        }
        
        // Pull entity
        const dx = player.location.x - entity.location.x;
        const dy = player.location.y - entity.location.y;
        const dz = player.location.z - entity.location.z;
        
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (distance > 0) {
          const pullStrength = 0.4;
          entity.applyKnockback(dx / distance, dz / distance, pullStrength, dy / distance * pullStrength);
        }
        
        handData.lastPickup = 0;
        player.playSound('mob.shulker.shoot', { pitch: 1.0, volume: 0.8 });
        
        // Visual effect
        for (let i = 0; i < 5; i++) {
          system.runTimeout(() => {
            player.dimension.spawnParticle('minecraft:soul_particle', entity.location);
          }, i * 2);
        }
        
        return;
      } catch (e) {
        // Failed to grab entity
      }
    }
  }
  
  /**
   * Handle ability usage
   */
  static handleAbilityUse(player, abilityId, param) {
    switch (abilityId) {
      case this.ABILITIES.BLINK:
        return this.useBlink(player);
      case this.ABILITIES.TRAVEL:
        return this.travelToLocation(player, param);
      case this.ABILITIES.SAVE_LOCATION:
        return this.saveLocation(player, param);
      case this.ABILITIES.VIEW_LOCATIONS:
        this.viewLocations(player);
        return true;
      case this.ABILITIES.PLACE_DOOR:
        return this.placeDoor(player);
      case this.ABILITIES.INVISIBLE_HAND:
        return this.useInvisibleHand(player, param);
      default:
        // Inherit Scribe abilities
        return ScribeSequence.handleAbilityUse(player, abilityId, param);
    }
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.BLINK]: 
        `§7Cost: ${this.BLINK_SPIRIT_COST} Spirit\n§7Quick teleport ${this.BLINK_RANGE}m forward\n§7Trigger: Sneak (without shield)`,
      [this.ABILITIES.TRAVEL]: 
        `§7Tiered Cost: 20/30/50 Spirit\n§7Teleport to any saved location\n§7No distance limit!`,
      [this.ABILITIES.SAVE_LOCATION]: 
        '§7Save current location (max 10)',
      [this.ABILITIES.VIEW_LOCATIONS]: 
        '§7View all saved locations',
      [this.ABILITIES.PLACE_DOOR]: 
        '§7Cost: 30 Spirit\n§7Place portal door (60s duration)\n§7Max 3 active doors\n§7Requires selected destination',
      [this.ABILITIES.INVISIBLE_HAND]: 
        `§7Cost: ${this.INVISIBLE_HAND_SPIRIT_COST} Spirit\n§7Grab items and entities from distance`
    };
    return descriptions[abilityId] || 'Unknown ability';
  }
  
  /**
   * Clean up effects
   */
  static removeEffects(player) {
    ScribeSequence.removeEffects(player);
    this.blinkCooldowns.delete(player.name);
    this.travelCooldowns.delete(player.name);
    this.savedLocations.delete(player.name);
    this.selectedLocation.delete(player.name); // NEW
    this.invisibleHandActive.delete(player.name);
    
    // Remove player's doors
    const toRemove = [];
    for (const [doorId, doorData] of this.activeDoors) {
      if (doorData.creator === player.name) {
        toRemove.push(doorId);
      }
    }
    
    for (const doorId of toRemove) {
      this.activeDoors.delete(doorId);
    }
  }
}
