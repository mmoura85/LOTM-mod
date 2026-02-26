import { ActionFormData, ModalFormData, MessageFormData } from '@minecraft/server-ui';
import { world } from '@minecraft/server';

/**
 * Menu System for Door Pathway Abilities
 * Provides UI forms for Recording and Teleportation
 */
export class DoorPathwayMenus {
  
  /**
   * Show Recording Tome main menu (Scribe Seq 6+)
   */
  static async showRecordingMenu(player, ScribeSequence) {
    const recordings = ScribeSequence.recordedAbilities.get(player.name) || [];
    
    const form = new ActionFormData()
      .title('§5Recording Tome')
      .body(`§7Recorded Abilities: §e${recordings.length}§7/§e${ScribeSequence.MAX_RECORDED_ABILITIES}\n\n§7Select an option:`)
      .button('§aRecord New Ability\n§7Look at a Beyonder', 'textures/items/recording_tome')
      .button('§bView Recordings\n§7See what you\'ve recorded', 'textures/ui/book_writable')
      .button('§cUse Recording\n§7Activate a recorded ability', 'textures/ui/automation_glyph')
      .button('§7Cancel', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    switch (response.selection) {
      case 0: // Record New
        this.showRecordTargetMenu(player, ScribeSequence);
        break;
      case 1: // View Recordings
        this.showViewRecordingsMenu(player, ScribeSequence);
        break;
      case 2: // Use Recording
        this.showUseRecordingMenu(player, ScribeSequence);
        break;
      case 3: // Cancel
        break;
    }
  }
  
  /**
   * Show menu to select a player to record from
   */
  static async showRecordTargetMenu(player, ScribeSequence) {
    const nearbyPlayers = [];
    const maxDistance = 32;
    
    for (const otherPlayer of world.getAllPlayers()) {
      if (otherPlayer.name === player.name) continue;
      
      const distance = Math.sqrt(
        Math.pow(player.location.x - otherPlayer.location.x, 2) +
        Math.pow(player.location.y - otherPlayer.location.y, 2) +
        Math.pow(player.location.z - otherPlayer.location.z, 2)
      );
      
      if (distance <= maxDistance) {
        nearbyPlayers.push({
          player: otherPlayer,
          distance: Math.floor(distance)
        });
      }
    }
    
    if (nearbyPlayers.length === 0) {
      const errorForm = new MessageFormData()
        .title('§cNo Targets')
        .body('§7No Beyonders found within 32 blocks.')
        .button1('§7OK')
        .button2('§7Cancel');
      
      await errorForm.show(player);
      return;
    }
    
    const form = new ActionFormData()
      .title('§5Select Target')
      .body('§7Choose a Beyonder to record from:');
    
    for (const target of nearbyPlayers) {
      const pathway = target.player.getDynamicProperty('lotm:pathway') || 'Unknown';
      const sequence = target.player.getDynamicProperty('lotm:sequence') || '?';
      form.button(
        `§e${target.player.name}\n§7${pathway} Seq ${sequence} §8(${target.distance}m)`,
        'textures/ui/Friend1'
      );
    }
    form.button('§7Back', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    if (response.selection === nearbyPlayers.length) {
      // Back button
      this.showRecordingMenu(player, ScribeSequence);
      return;
    }
    
    const target = nearbyPlayers[response.selection];
    this.showRecordAbilityMenu(player, target.player, ScribeSequence);
  }
  
  /**
   * Show menu to select which ability to record
   */
  static async showRecordAbilityMenu(player, targetPlayer, ScribeSequence) {
    const targetPathway = targetPlayer.getDynamicProperty('lotm:pathway');
    const targetSequence = targetPlayer.getDynamicProperty('lotm:sequence');
    
    // Get available abilities for target
    const abilities = this.getTargetAbilities(targetPathway, targetSequence);
    
    if (abilities.length === 0) {
      const errorForm = new MessageFormData()
        .title('§cNo Abilities')
        .body(`§7${targetPlayer.name} has no recordable abilities.`)
        .button1('§7OK')
        .button2('§7Back');
      
      const response = await errorForm.show(player);
      
      if (response.selection === 1) {
        this.showRecordTargetMenu(player, ScribeSequence);
      }
      return;
    }
    
    const form = new ActionFormData()
      .title(`§5Record from ${targetPlayer.name}`)
      .body(`§7Select an ability to attempt recording:\n§8Success rate varies by sequence`);
    
    for (const ability of abilities) {
      const successRate = this.calculateSuccessRate(targetSequence);
      form.button(
        `${ability.name}\n§7${Math.floor(successRate * 100)}% success rate`,
        'textures/ui/absorption_effect'
      );
    }
    form.button('§7Back', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    if (response.selection === abilities.length) {
      // Back button
      this.showRecordTargetMenu(player, ScribeSequence);
      return;
    }
    
    // Attempt recording
    ScribeSequence.useRecord(player, targetPlayer.name, response.selection);
    
    // Show result after 1 second
    world.system.runTimeout(() => {
      const recordings = ScribeSequence.recordedAbilities.get(player.name) || [];
      const lastRecording = recordings[recordings.length - 1];
      
      if (lastRecording && lastRecording.name === abilities[response.selection].name) {
        this.showRecordSuccessMenu(player, lastRecording, ScribeSequence);
      } else {
        this.showRecordFailureMenu(player, ScribeSequence);
      }
    }, 20);
  }
  
  /**
   * Show success message after recording
   */
  static async showRecordSuccessMenu(player, recording, ScribeSequence) {
    const strengthPercent = Math.floor(recording.strength * 100);
    
    const form = new MessageFormData()
      .title('§a§lRecording Successful!')
      .body(
        `§a§l§oI came, I saw, I recorded\n\n` +
        `§7Recorded: §e${recording.name}\n` +
        `§7Type: §${recording.type === 'passive' ? 'a' : 'c'}${recording.type}\n` +
        `§7Strength: §e${strengthPercent}%\n\n` +
        `§7Capacity: §e${ScribeSequence.recordedAbilities.get(player.name).length}§7/§e${ScribeSequence.MAX_RECORDED_ABILITIES}`
      )
      .button1('§aView All')
      .button2('§7Close');
    
    const response = await form.show(player);
    
    if (response.selection === 0) {
      this.showViewRecordingsMenu(player, ScribeSequence);
    }
  }
  
  /**
   * Show failure message after recording
   */
  static async showRecordFailureMenu(player, ScribeSequence) {
    const form = new MessageFormData()
      .title('§c§lRecording Failed')
      .body(
        `§c§oThe recording attempt failed...\n\n` +
        `§7Half of the spirit cost was refunded.\n` +
        `§7Try again or choose a different ability.`
      )
      .button1('§eTry Again')
      .button2('§7Close');
    
    const response = await form.show(player);
    
    if (response.selection === 0) {
      this.showRecordingMenu(player, ScribeSequence);
    }
  }
  
  /**
   * Show list of recorded abilities
   */
  static async showViewRecordingsMenu(player, ScribeSequence) {
    const recordings = ScribeSequence.recordedAbilities.get(player.name) || [];
    
    if (recordings.length === 0) {
      const form = new MessageFormData()
        .title('§5Recording Tome')
        .body('§7You have no recorded abilities.\n\n§7Use the Recording Tome on a Beyonder to record their abilities.')
        .button1('§7OK')
        .button2('§7Close');
      
      await form.show(player);
      return;
    }
    
    const form = new ActionFormData()
      .title('§5Recorded Abilities')
      .body(`§7Capacity: §e${recordings.length}§7/§e${ScribeSequence.MAX_RECORDED_ABILITIES}\n\n§7Your recorded abilities:`);
    
    for (let i = 0; i < recordings.length; i++) {
      const rec = recordings[i];
      const strengthPercent = Math.floor(rec.strength * 100);
      const typeColor = rec.type === 'passive' ? '§a' : '§c';
      const typeSymbol = rec.type === 'passive' ? '[P]' : '[A]';
      
      form.button(
        `${typeColor}${typeSymbol} §f${rec.name}\n§7${strengthPercent}% strength §8| §7${rec.pathway} Seq ${rec.sequence}`,
        rec.type === 'passive' ? 'textures/ui/resistance_effect' : 'textures/ui/strength_effect'
      );
    }
    form.button('§7Back', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    if (response.selection === recordings.length) {
      // Back button
      this.showRecordingMenu(player, ScribeSequence);
      return;
    }
    
    // Show details for selected recording
    this.showRecordingDetailsMenu(player, response.selection, ScribeSequence);
  }
  
  /**
   * Show details for a specific recording
   */
  static async showRecordingDetailsMenu(player, index, ScribeSequence) {
    const recordings = ScribeSequence.recordedAbilities.get(player.name) || [];
    const recording = recordings[index];
    
    if (!recording) return;
    
    const strengthPercent = Math.floor(recording.strength * 100);
    const typeIcon = recording.type === 'passive' ? '🛡' : '⚔';
    
    let bodyText = `${typeIcon} §e${recording.name}\n\n` +
                   `§7Type: §${recording.type === 'passive' ? 'a' : 'c'}${recording.type}\n` +
                   `§7Source: §f${recording.pathway} §7Sequence §f${recording.sequence}\n` +
                   `§7Strength: §e${strengthPercent}%\n\n`;
    
    if (recording.type === 'passive') {
      bodyText += `§aThis ability is automatically applied.\n§7No action needed.`;
    } else {
      const estimatedCost = Math.floor(30 * (1 / recording.strength));
      bodyText += `§7Estimated Spirit Cost: §b${estimatedCost}\n` +
                  `§cSingle Use - Will be consumed!`;
    }
    
    const form = new MessageFormData()
      .title('§5Recording Details')
      .body(bodyText)
      .button1(recording.type === 'active' ? '§cUse Ability' : '§7Close')
      .button2('§7Back');
    
    const response = await form.show(player);
    
    if (response.selection === 0 && recording.type === 'active') {
      // Confirm use
      this.showUseRecordingConfirmMenu(player, index, recording, ScribeSequence);
    } else if (response.selection === 1) {
      this.showViewRecordingsMenu(player, ScribeSequence);
    }
  }
  
  /**
   * Show use recording menu with ability selection
   */
  static async showUseRecordingMenu(player, ScribeSequence) {
    const recordings = ScribeSequence.recordedAbilities.get(player.name) || [];
    const activeRecordings = recordings.filter(r => r.type === 'active');
    
    if (activeRecordings.length === 0) {
      const form = new MessageFormData()
        .title('§5Use Recording')
        .body('§7You have no active abilities recorded.\n\n§7Passive abilities are applied automatically.')
        .button1('§7OK')
        .button2('§7Back');
      
      const response = await form.show(player);
      
      if (response.selection === 1) {
        this.showRecordingMenu(player, ScribeSequence);
      }
      return;
    }
    
    const form = new ActionFormData()
      .title('§5Use Recording')
      .body('§cWarning: Using a recording will consume it!\n\n§7Select ability to use:');
    
    for (let i = 0; i < recordings.length; i++) {
      const rec = recordings[i];
      if (rec.type === 'active') {
        const strengthPercent = Math.floor(rec.strength * 100);
        const estimatedCost = Math.floor(30 * (1 / rec.strength));
        
        form.button(
          `§c[A] §f${rec.name}\n§7${strengthPercent}% §8| §b~${estimatedCost} Spirit`,
          'textures/ui/strength_effect'
        );
      }
    }
    form.button('§7Back', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    // Find the actual index in recordings array
    let actualIndex = -1;
    let activeCount = 0;
    for (let i = 0; i < recordings.length; i++) {
      if (recordings[i].type === 'active') {
        if (activeCount === response.selection) {
          actualIndex = i;
          break;
        }
        activeCount++;
      }
    }
    
    if (actualIndex === -1 || actualIndex >= recordings.length) {
      // Back button
      this.showRecordingMenu(player, ScribeSequence);
      return;
    }
    
    this.showUseRecordingConfirmMenu(player, actualIndex, recordings[actualIndex], ScribeSequence);
  }
  
  /**
   * Confirm before using a recording
   */
  static async showUseRecordingConfirmMenu(player, index, recording, ScribeSequence) {
    const estimatedCost = Math.floor(30 * (1 / recording.strength));
    const currentSpirit = Math.floor(player.getDynamicProperty('lotm:spirit') || 0);
    
    const canAfford = currentSpirit >= estimatedCost;
    
    const form = new MessageFormData()
      .title('§cConfirm Use')
      .body(
        `§7Use §e${recording.name}§7?\n\n` +
        `§7Spirit Cost: §b${estimatedCost}\n` +
        `§7Current Spirit: §b${currentSpirit}\n\n` +
        (canAfford ? '§cThis will consume the recording!' : '§c§lNot enough spirit!')
      )
      .button1(canAfford ? '§c§lUse Now' : '§7Cancel')
      .button2('§7Cancel');
    
    const response = await form.show(player);
    
    if (response.selection === 0 && canAfford) {
      // Use the recording
      const success = ScribeSequence.useRecording(player, index);
      
      if (success) {
        player.sendMessage('§a§lRecording activated!');
      }
    }
  }
  
  // ============================================
  // TRAVELER TELEPORTATION MENUS
  // ============================================
  
  /**
   * Show Traveler's Log main menu (Traveler Seq 5)
   */
  static async showTravelerMenu(player, TravelerSequence) {
    const locations = TravelerSequence.savedLocations.get(player.name) || [];
    const selectedIndex = TravelerSequence.selectedLocation.get(player.name);
    const activeDoors = TravelerSequence.getPlayerDoors(player.name);
    
    let selectedLocationText = '';
    if (selectedIndex !== undefined && selectedIndex >= 0 && selectedIndex < locations.length) {
      selectedLocationText = `\n§7Default Door Destination: §e${locations[selectedIndex].name}`;
    }
    
    const form = new ActionFormData()
      .title('§5Traveler\'s Log')
      .body(`§7Saved Locations: §e${locations.length}§7/§e10\n§7Active Portals: §e${activeDoors.length}§7/§e3${selectedLocationText}\n\n§7What would you like to do?`)
      .button('§aTeleport\n§7Travel to a saved location', 'textures/items/ender_pearl')
      .button('§bSave Location\n§7Bookmark this spot', 'textures/items/compass_item')
      .button('§6Manage Locations\n§7View and configure', 'textures/ui/book_writable')
      .button('§5Place Door\n§7Create a portal', 'textures/blocks/portal')
      .button('§cManage Portals\n§7Remove active portals', 'textures/ui/trash_default')
      .button('§7Cancel', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    switch (response.selection) {
      case 0: // Teleport
        this.showTeleportMenu(player, TravelerSequence);
        break;
      case 1: // Save Location
        this.showSaveLocationMenu(player, TravelerSequence);
        break;
      case 2: // Manage
        this.showManageLocationsMenu(player, TravelerSequence);
        break;
      case 3: // Place Door
        TravelerSequence.placeDoor(player);
        break;
      case 4: // Manage Portals
        this.showManagePortalsMenu(player, TravelerSequence);
        break;
      case 5: // Cancel
        break;
    }
  }
  
  /**
   * Show teleport destination menu
   */
  static async showTeleportMenu(player, TravelerSequence) {
    const locations = TravelerSequence.savedLocations.get(player.name) || [];
    
    if (locations.length === 0) {
      const form = new MessageFormData()
        .title('§5Traveler\'s Log')
        .body('§7You have no saved locations.\n\n§7Save your current location first!')
        .button1('§aSave Now')
        .button2('§7Cancel');
      
      const response = await form.show(player);
      
      if (response.selection === 0) {
        this.showSaveLocationMenu(player, TravelerSequence);
      }
      return;
    }
    
    const form = new ActionFormData()
      .title('§5Select Destination')
      .body('§7Choose where to travel:');
    
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      const distance = Math.floor(Math.sqrt(
        Math.pow(loc.location.x - player.location.x, 2) +
        Math.pow(loc.location.y - player.location.y, 2) +
        Math.pow(loc.location.z - player.location.z, 2)
      ));
      
      const spiritCost = TravelerSequence.calculateTravelCost(distance);
      
      const dimensionName = loc.dimension.includes('nether') ? '§cNether' : 
                           loc.dimension.includes('end') ? '§dThe End' : '§aOverworld';
      
      form.button(
        `§e${loc.name}\n§7${distance}m §8| §b${spiritCost} Spirit §8| ${dimensionName}`,
        'textures/items/ender_pearl'
      );
    }
    form.button('§7Back', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    if (response.selection === locations.length) {
      // Back button
      this.showTravelerMenu(player, TravelerSequence);
      return;
    }
    
    // Show confirmation
    this.showTeleportConfirmMenu(player, response.selection, locations[response.selection], TravelerSequence);
  }
  
  /**
   * Confirm teleportation
   */
  static async showTeleportConfirmMenu(player, index, location, TravelerSequence) {
    const distance = Math.floor(Math.sqrt(
      Math.pow(location.location.x - player.location.x, 2) +
      Math.pow(location.location.y - player.location.y, 2) +
      Math.pow(location.location.z - player.location.z, 2)
    ));
    
    const spiritCost = TravelerSequence.calculateTravelCost(distance);
    
    const currentSpirit = Math.floor(player.getDynamicProperty('lotm:spirit') || 0);
    const canAfford = currentSpirit >= spiritCost;
    
    const cooldown = TravelerSequence.travelCooldowns.get(player.name) || 0;
    const onCooldown = cooldown > 0;
    
    // Determine cost tier message
    let costTier = '';
    if (distance <= 50) {
      costTier = '§a(Very Close - Cheap!)';
    } else if (distance <= 100) {
      costTier = '§e(Nearby)';
    } else {
      costTier = '§c(Far - Flat Rate)';
    }
    
    let bodyText = `§7Destination: §e${location.name}\n` +
                   `§7Distance: §f${distance}m ${costTier}\n` +
                   `§7Spirit Cost: §b${spiritCost}\n` +
                   `§7Current Spirit: §b${currentSpirit}\n\n`;
    
    if (onCooldown) {
      const remaining = Math.ceil(cooldown / 20);
      bodyText += `§c§lOn Cooldown: ${remaining}s remaining`;
    } else if (!canAfford) {
      bodyText += `§c§lNot enough spirit!`;
    } else {
      const travelTime = Math.min(3, Math.floor(distance / 20 / 20));
      bodyText += `§7Travel time: §e~${travelTime}s\n§aReady to travel!`;
    }
    
    const canTravel = !onCooldown && canAfford;
    
    const form = new MessageFormData()
      .title('§5Confirm Travel')
      .body(bodyText)
      .button1(canTravel ? '§a§lTravel Now' : '§7Cancel')
      .button2('§7Cancel');
    
    const response = await form.show(player);
    
    if (response.selection === 0 && canTravel) {
      TravelerSequence.travelToLocation(player, index);
    }
  }
  
  /**
   * Show save location form
   */
  static async showSaveLocationMenu(player, TravelerSequence) {
    const locations = TravelerSequence.savedLocations.get(player.name) || [];
    
    if (locations.length >= 10) {
      const form = new MessageFormData()
        .title('§cCapacity Full')
        .body('§7You have reached the maximum of 10 saved locations.\n\n§7Delete a location to save a new one.')
        .button1('§cManage Locations')
        .button2('§7Cancel');
      
      const response = await form.show(player);
      
      if (response.selection === 0) {
        this.showManageLocationsMenu(player, TravelerSequence);
      }
      return;
    }
    
    const form = new ModalFormData()
      .title('§5Save Location')
      .textField(
        '§7Location Name\n§8Enter a name for this location',
        'e.g. My Base, Diamond Mine, Village',
        ''
      );
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    const locationName = response.formValues[0].toString().trim();
    
    if (!locationName) {
      player.sendMessage('§cLocation name cannot be empty!');
      return;
    }
    
    // Check for duplicate names
    const duplicate = locations.find(loc => loc.name === locationName);
    if (duplicate) {
      player.sendMessage('§cA location with that name already exists!');
      return;
    }
    
    TravelerSequence.saveLocation(player, locationName);
    // saveLocation already calls saveLocations internally
  }
  
  /**
   * Show manage locations menu
   */
  static async showManageLocationsMenu(player, TravelerSequence) {
    const locations = TravelerSequence.savedLocations.get(player.name) || [];
    
    if (locations.length === 0) {
      const form = new MessageFormData()
        .title('§5Manage Locations')
        .body('§7You have no saved locations.')
        .button1('§7OK')
        .button2('§7Back');
      
      const response = await form.show(player);
      
      if (response.selection === 1) {
        this.showTravelerMenu(player, TravelerSequence);
      }
      return;
    }
    
    const selectedIndex = TravelerSequence.selectedLocation.get(player.name);
    
    const form = new ActionFormData()
      .title('§5Manage Locations')
      .body('§7Select a location to view details:\n§8★ = Default door destination');
    
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      const distance = Math.floor(Math.sqrt(
        Math.pow(loc.location.x - player.location.x, 2) +
        Math.pow(loc.location.y - player.location.y, 2) +
        Math.pow(loc.location.z - player.location.z, 2)
      ));
      
      const isSelected = selectedIndex === i;
      const prefix = isSelected ? '§a★ ' : '';
      
      form.button(
        `${prefix}§e${loc.name}\n§7${distance}m away`,
        'textures/items/compass_item'
      );
    }
    form.button('§7Back', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    if (response.selection === locations.length) {
      this.showTravelerMenu(player, TravelerSequence);
      return;
    }
    
    this.showLocationDetailsMenu(player, response.selection, TravelerSequence);
  }
  
  /**
   * Show details for a specific location
   */
  static async showLocationDetailsMenu(player, index, TravelerSequence) {
    const locations = TravelerSequence.savedLocations.get(player.name) || [];
    const location = locations[index];
    
    if (!location) return;
    
    const distance = Math.floor(Math.sqrt(
      Math.pow(location.location.x - player.location.x, 2) +
      Math.pow(location.location.y - player.location.y, 2) +
      Math.pow(location.location.z - player.location.z, 2)
    ));
    
    const dimensionName = location.dimension.includes('nether') ? '§cNether' : 
                         location.dimension.includes('end') ? '§dThe End' : '§aOverworld';
    
    const coords = `§7X: §f${Math.floor(location.location.x)} §7Y: §f${Math.floor(location.location.y)} §7Z: §f${Math.floor(location.location.z)}`;
    
    const selectedIndex = TravelerSequence.selectedLocation.get(player.name);
    const isSelected = selectedIndex === index;
    
    const form = new ActionFormData()
      .title(`§5${location.name}`)
      .body(
        `§7Dimension: ${dimensionName}\n` +
        `${coords}\n` +
        `§7Distance: §f${distance}m\n` +
        (isSelected ? `\n§a★ Default Door Destination ★\n` : '') +
        `\n§7What would you like to do?`
      )
      .button('§aTeleport Now', 'textures/items/ender_pearl')
      .button(isSelected ? '§7✓ Is Default' : '§6Set as Default', 'textures/blocks/portal')
      .button('§cDelete', 'textures/ui/trash_default')
      .button('§7Back', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    switch (response.selection) {
      case 0: // Teleport
        this.showTeleportConfirmMenu(player, index, location, TravelerSequence);
        break;
      case 1: // Set as Default
        if (!isSelected) {
          TravelerSequence.selectedLocation.set(player.name, index);
          TravelerSequence.saveLocations(player); // PERSIST
          player.sendMessage(`§a§l${location.name} §r§aset as default door destination!`);
          player.playSound('random.levelup', { pitch: 1.5, volume: 0.8 });
        }
        this.showLocationDetailsMenu(player, index, TravelerSequence);
        break;
      case 2: // Delete
        this.showDeleteLocationConfirmMenu(player, index, location, TravelerSequence);
        break;
      case 3: // Back
        this.showManageLocationsMenu(player, TravelerSequence);
        break;
    }
  }
  
  /**
   * Confirm location deletion
   */
  static async showDeleteLocationConfirmMenu(player, index, location, TravelerSequence) {
    const form = new MessageFormData()
      .title('§cDelete Location')
      .body(`§7Delete §e${location.name}§7?\n\n§cThis cannot be undone!`)
      .button1('§c§lDelete')
      .button2('§7Cancel');
    
    const response = await form.show(player);
    
    if (response.selection === 0) {
      // Delete
      const locations = TravelerSequence.savedLocations.get(player.name) || [];
      locations.splice(index, 1);
      TravelerSequence.savedLocations.set(player.name, locations);
      
      // Update selected location if needed
      const selectedIndex = TravelerSequence.selectedLocation.get(player.name);
      if (selectedIndex === index) {
        // Deleted the default location - clear selection
        TravelerSequence.selectedLocation.delete(player.name);
        player.sendMessage('§7Default door destination cleared');
      } else if (selectedIndex !== undefined && selectedIndex > index) {
        // Adjust index since we removed an earlier item
        TravelerSequence.selectedLocation.set(player.name, selectedIndex - 1);
      }
      
      // PERSIST CHANGES
      TravelerSequence.saveLocations(player);
      
      player.sendMessage(`§cDeleted location: §e${location.name}`);
      
      // Back to manage menu
      this.showManageLocationsMenu(player, TravelerSequence);
    }
  }
  
  // ============================================
  // HELPER FUNCTIONS
  // ============================================
  
  /**
   * Get recordable abilities from target
   */
  static getTargetAbilities(pathway, sequence) {
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
        6: [
          { type: 'active', ability: 'light_of_dawn', name: 'Light of Dawn' }
        ]
      }
    };
    
    const pathwayAbilities = abilities[pathway];
    if (!pathwayAbilities) return [];
    
    const sequenceAbilities = pathwayAbilities[sequence];
    if (!sequenceAbilities) return [];
    
    return sequenceAbilities;
  }
  
  /**
   * Calculate recording success rate
   */
  static calculateSuccessRate(targetSequence) {
    const baseRate = 0.8;
    
    if (targetSequence < 6) {
      // Higher sequences are harder
      return Math.max(0.1, baseRate - (6 - targetSequence) * 0.15);
    }
    
    return baseRate;
  }
  
  /**
   * Show portal management menu
   */
  static async showManagePortalsMenu(player, TravelerSequence) {
    const doors = TravelerSequence.getPlayerDoors(player.name);
    
    if (doors.length === 0) {
      const form = new MessageFormData()
        .title('§5Manage Portals')
        .body('§7You have no active portals.')
        .button1('§aOK');
      
      await form.show(player);
      return;
    }
    
    const form = new ActionFormData()
      .title('§5Manage Active Portals')
      .body(`§7Select a portal to remove:\n§7Active: §e${doors.length}§7/§e3`);
    
    for (const door of doors) {
      const coords = `§7(${Math.floor(door.location.x)}, ${Math.floor(door.location.y)}, ${Math.floor(door.location.z)})`;
      const timeLeft = `§e${door.timeLeft}s`;
      form.button(
        `§e${door.destination}\n${coords} §8| ${timeLeft}`,
        'textures/blocks/portal'
      );
    }
    
    form.button('§7Back', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    if (response.selection < doors.length) {
      // Selected a portal to delete
      const door = doors[response.selection];
      this.showDeletePortalConfirm(player, door, TravelerSequence);
    } else {
      // Back button
      this.showTravelerMenu(player, TravelerSequence);
    }
  }
  
  /**
   * Confirm portal deletion
   */
  static async showDeletePortalConfirm(player, door, TravelerSequence) {
    const coords = `(${Math.floor(door.location.x)}, ${Math.floor(door.location.y)}, ${Math.floor(door.location.z)})`;
    
    const form = new MessageFormData()
      .title('§5Delete Portal')
      .body(
        `§7Portal Details:\n\n` +
        `§7Destination: §e${door.destination}\n` +
        `§7Location: §f${coords}\n` +
        `§7Dimension: §f${door.dimension}\n` +
        `§7Time Remaining: §e${door.timeLeft}s\n\n` +
        `§cDelete this portal?`
      )
      .button1('§cDelete')
      .button2('§7Cancel');
    
    const response = await form.show(player);
    
    if (response.selection === 0) {
      // Delete the portal
      if (TravelerSequence.removeDoor(door.id)) {
        player.sendMessage('§aPortal removed!');
        player.playSound('random.break', { pitch: 1.0, volume: 1.0 });
      } else {
        player.sendMessage('§cFailed to remove portal!');
      }
    }
    
    // Return to portal management menu
    this.showManagePortalsMenu(player, TravelerSequence);
  }

  // ADD THIS TO door_pathway_menus.js

  // ============================================
  // SECRETS SORCERER MENUS (SEQUENCE 4)
  // ============================================
  
  /**
   * Show Secrets Sorcerer Powers main menu
   */
  static async showSecretsSorcererMenu(player, SecretsSorcererSequence) {
    const pockets = SecretsSorcererSequence.personalPockets.get(player.name) || [];
    const portals = this.getPlayerPortals(player.name, SecretsSorcererSequence);
    
    const form = new ActionFormData()
      .title('§5Secrets Sorcerer Powers')
      .body(
        `§7Personal Pockets: §e${pockets.length}§7/§e3\n` +
        `§7Active Portals: §e${portals.length}§7/§e5\n\n` +
        `§7Manage your concealed spaces:`
      )
      .button('§5Pocket Dimensions\n§7Create and enter', 'textures/blocks/portal')
      .button('§dSpawn Portal\n§7Transfiguration trap', 'textures/blocks/end_portal')
      .button('§7Cancel', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    switch (response.selection) {
      case 0: // Pocket Dimensions
        this.showPocketDimensionMenu(player, SecretsSorcererSequence);
        break;
      case 1: // Spawn Portal
        const success = SecretsSorcererSequence.spawnTransfigurationPortal(player);
        if (success) {
          player.sendMessage('§dPortal spawned! Touch to randomly teleport enemies!');
        }
        break;
      case 2: // Cancel
        break;
    }
  }
  
  /**
   * Show pocket dimension management menu
   */
  static async showPocketDimensionMenu(player, SecretsSorcererSequence) {
    const pockets = SecretsSorcererSequence.personalPockets.get(player.name) || [];
    
    const form = new ActionFormData()
      .title('§5Pocket Dimensions')
      .body(`§7Your Concealed Spaces: §e${pockets.length}§7/§e3\n\n§7What would you like to do?`);
    
    if (pockets.length < 3) {
      form.button('§aCreate New Pocket\n§7100 Spirit', 'textures/blocks/portal');
    }
    
    if (pockets.length > 0) {
      form.button('§5Enter Pocket\n§720 Spirit per entry', 'textures/items/ender_pearl');
      form.button('§7Exit Pocket\n§7Return to world', 'textures/ui/cancel');
    }
    
    form.button('§7Back', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    let selection = response.selection;
    
    // Handle dynamic button layout
    if (pockets.length < 3) {
      if (selection === 0) {
        // Create new pocket
        const success = SecretsSorcererSequence.createPocket(player);
        if (success) {
          this.showPocketDimensionMenu(player, SecretsSorcererSequence);
        }
        return;
      }
      selection--; // Adjust for next buttons
    }
    
    if (pockets.length > 0) {
      if (selection === 0) {
        // Enter pocket
        this.showSelectPocketMenu(player, SecretsSorcererSequence);
        return;
      } else if (selection === 1) {
        // Exit pocket
        SecretsSorcererSequence.exitPocket(player);
        return;
      }
      selection -= 2; // Adjust for back button
    }
    
    if (selection === 0) {
      // Back button
      this.showSecretsSorcererMenu(player, SecretsSorcererSequence);
    }
  }
  
  /**
   * Show pocket selection menu
   */
  static async showSelectPocketMenu(player, SecretsSorcererSequence) {
    const pockets = SecretsSorcererSequence.personalPockets.get(player.name) || [];
    
    if (pockets.length === 0) {
      player.sendMessage('§cYou have no pockets!');
      return;
    }
    
    const form = new ActionFormData()
      .title('§5Select Pocket')
      .body('§7Choose which pocket to enter:\n§7Cost: §b20 Spirit');
    
    for (let i = 0; i < pockets.length; i++) {
      const pocket = pockets[i];
      const coords = `§7(${Math.floor(pocket.entryLocation.x)}, ${Math.floor(pocket.entryLocation.y)}, ${Math.floor(pocket.entryLocation.z)})`;
      form.button(
        `§5Pocket ${i + 1}\n${coords}`,
        'textures/blocks/portal'
      );
    }
    
    form.button('§7Back', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    if (response.selection < pockets.length) {
      // Enter selected pocket
      SecretsSorcererSequence.enterPocket(player, response.selection);
    } else {
      // Back button
      this.showPocketDimensionMenu(player, SecretsSorcererSequence);
    }
  }
  
  /**
   * Show imprison target menu
   */
  static async showImprisonMenu(player, SecretsSorcererSequence) {
    // Find nearby entities
    const nearbyEntities = [];
    const maxDistance = 10;
    
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: maxDistance,
        excludeNames: [player.name],
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow']
      });
      
      for (const entity of entities) {
        const distance = Math.floor(Math.sqrt(
          Math.pow(player.location.x - entity.location.x, 2) +
          Math.pow(player.location.y - entity.location.y, 2) +
          Math.pow(player.location.z - entity.location.z, 2)
        ));
        
        nearbyEntities.push({
          entity: entity,
          distance: distance
        });
      }
    } catch (e) {}
    
    if (nearbyEntities.length === 0) {
      const errorForm = new MessageFormData()
        .title('§cNo Targets')
        .body('§7No entities found within 10 blocks.')
        .button1('§7OK')
        .button2('§7Back');
      
      const response = await errorForm.show(player);
      
      if (response.selection === 1) {
        this.showSecretsSorcererMenu(player, SecretsSorcererSequence);
      }
      return;
    }
    
    const form = new ActionFormData()
      .title('§cImprison Target')
      .body('§7Select a target to imprison for 20 seconds:\n§7Cost: §b80 Spirit');
    
    for (const target of nearbyEntities) {
      const entityName = target.entity.nameTag || target.entity.typeId.replace('minecraft:', '');
      form.button(
        `§e${entityName}\n§7${target.distance}m away`,
        'textures/items/iron_bars'
      );
    }
    
    form.button('§7Back', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    if (response.selection < nearbyEntities.length) {
      // Imprison selected target
      const target = nearbyEntities[response.selection];
      SecretsSorcererSequence.imprisonEntity(player, target.entity);
    } else {
      // Back button
      this.showSecretsSorcererMenu(player, SecretsSorcererSequence);
    }
  }
  
  /**
   * Get player's active portals
   */
  static getPlayerPortals(playerName, SecretsSorcererSequence) {
    const portals = [];
    
    for (const [portalId, portalData] of SecretsSorcererSequence.transfigurationPortals) {
      if (portalData.creator === playerName) {
        portals.push({
          id: portalId,
          location: portalData.location,
          timeLeft: Math.ceil(portalData.ticksRemaining / 20)
        });
      }
    }
    
    return portals;
  }
}
