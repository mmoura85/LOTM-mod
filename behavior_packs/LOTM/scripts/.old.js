import { world, system } from '@minecraft/server';
import { SpiritSystem } from './core/spiritSystem.js';
import { PathwayManager } from './core/pathwayManager.js';
import { SleeplessSequence } from './sequences/darkness/sleepless.js';
import { MidnightPoetSequence } from './sequences/darkness/midnight_poet.js';
import { NightmareSequence } from './sequences/darkness/nightmare.js';
import { CorpseCollectorSequence } from './sequences/death/corpse_collector.js';
import { ApprenticeSequence } from './sequences/door/apprentice.js';
import { TrickmasterSequence } from './sequences/door/trickmaster.js';
import { AstrologerSequence } from './sequences/door/astrologer.js';
import { ScribeSequence } from './sequences/door/scribe.js';
import { TravelerSequence } from './sequences/door/traveler.js';
import { WarriorSequence } from './sequences/twilight_giant/warrior.js';
import { PugilistSequence } from './sequences/twilight_giant/pugilist.js';
import { WeaponMasterSequence } from './sequences/twilight_giant/weapon_master.js';
import { DawnPaladinSequence } from './sequences/twilight_giant/dawn_paladin.js';

import { DarknessPathwayMenus } from './ui/darkness_pathway_menus.js';
import { DoorPathwayMenus } from './ui/door_pathway_menus.js';

// Track selected abilities for players (player name -> ability ID)
const selectedAbilities = new Map();

// Initialize the mod
function initialize() {
  world.sendMessage('§aLord of the Mysteries mod loaded!');
  
  // Register tick system
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      // Initialize new players
      if (!PathwayManager.hasPathway(player)) {
        // Don't auto-initialize, let them drink a potion first
        continue;
      }
      
      // Spirit regeneration
      SpiritSystem.tickRegeneration(player);
      
      // Display spirit in actionbar
      SpiritSystem.displaySpirit(player);
      
      // Apply sequence passive abilities
      const pathway = PathwayManager.getPathway(player);
      const sequence = PathwayManager.getSequence(player);
      
      if (pathway === PathwayManager.PATHWAYS.DARKNESS) {
        if (sequence === 9) {
          SleeplessSequence.applyPassiveAbilities(player);
        } else if (sequence === 8) {
          MidnightPoetSequence.applyPassiveAbilities(player);
        } else if (sequence === 7) {
          NightmareSequence.applyPassiveAbilities(player); // NEW
        }
      } else if (pathway === PathwayManager.PATHWAYS.DEATH) {
        if (sequence === 9) {
          CorpseCollectorSequence.applyPassiveAbilities(player);
        }
      } else if (pathway === PathwayManager.PATHWAYS.DOOR) {
       if (sequence === 9) {
          ApprenticeSequence.applyPassiveAbilities(player);
        } else if (sequence === 8) {
          TrickmasterSequence.applyPassiveAbilities(player);
        } else if (sequence === 7) {
          AstrologerSequence.applyPassiveAbilities(player);
        } else if (sequence === 6) {
          ScribeSequence.applyPassiveAbilities(player);
        } else if (sequence === 5) {
          TravelerSequence.applyPassiveAbilities(player);

          // Check for Blink trigger (sneak + sprint)
          if (sequence === 5 && pathway === PathwayManager.PATHWAYS.DOOR) {
            if (player.isSneaking && player.isSprinting) {
              TravelerSequence.useBlink(player);
            }
          }
        }
      } else if (pathway === PathwayManager.PATHWAYS.TWILIGHT_GIANT) {
        if (sequence === 9) {
          WarriorSequence.applyPassiveAbilities(player);
        } else if (sequence === 8) {
          PugilistSequence.applyPassiveAbilities(player);
        } else if (sequence === 7) {
          WeaponMasterSequence.applyPassiveAbilities(player);
        } else if (sequence === 6) {
          DawnPaladinSequence.applyPassiveAbilities(player);
        }
      }
    }
  }, 1); // Every tick
}

// Handle item usage
world.afterEvents.itemCompleteUse.subscribe((event) => {
  const { source: player, itemStack } = event;
  
  if (!itemStack) return;
  
  const itemId = itemStack.typeId;
  
  // Handle pathway potions
  if (itemId === 'lotm:darkness_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.DARKNESS);
    player.sendMessage('§aYou have become a §eSleepless§a!');
  }
  
  if (itemId === 'lotm:death_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.DEATH);
    player.sendMessage('§aYou have become a §8Corpse Collector§a!');
  }
  
  if (itemId === 'lotm:door_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.DOOR);
    player.sendMessage('§aYou have become an §5Apprentice§a!');
    player.sendMessage('§7Craft the Spirit World Key to use your abilities');
  }
  
  if (itemId === 'lotm:door_potion_seq8') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway !== PathwayManager.PATHWAYS.DOOR) {
      player.sendMessage('§cYou must be on the Door pathway to drink this!');
      player.runCommand('give @s lotm:door_potion_seq8 1');
      return;
    }
    
    if (sequence !== 9) {
      player.sendMessage('§cYou must be Sequence 9 (Apprentice) to advance to Sequence 8!');
      player.runCommand('give @s lotm:door_potion_seq8 1');
      return;
    }
    
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §6Trickmaster§a!');
    player.sendMessage('§7Craft your trick items to use abilities');
  }

  if (itemId === 'lotm:door_potion_seq7') {
  const pathway = PathwayManager.getPathway(player);
  const sequence = PathwayManager.getSequence(player);
  
  if (pathway !== PathwayManager.PATHWAYS.DOOR) {
    player.sendMessage('§cYou must be on the Door pathway to drink this!');
    player.runCommand('give @s lotm:door_potion_seq7 1');
    return;
  }
  
  if (sequence !== 8) {
    player.sendMessage('§cYou must be Sequence 8 (Trickmaster) to advance to Sequence 7!');
    player.runCommand('give @s lotm:door_potion_seq7 1');
    return;
  }
  
  PathwayManager.advanceSequence(player);
  player.sendMessage('§aYou have become an §5Astrologer§a!');
  player.sendMessage('§7Craft the Crystal Ball to scry for structures');
}

// Scribe Sequence 6
if (itemId === 'lotm:door_potion_seq6') {
  const pathway = PathwayManager.getPathway(player);
  const sequence = PathwayManager.getSequence(player);
  
  if (pathway !== PathwayManager.PATHWAYS.DOOR) {
    player.sendMessage('§cYou must be on the Door pathway to drink this!');
    player.runCommand('give @s lotm:door_potion_seq6 1');
    return;
  }
  
  if (sequence !== 7) {
    player.sendMessage('§cYou must be Sequence 7 (Astrologer) to advance to Sequence 6!');
    player.runCommand('give @s lotm:door_potion_seq6 1');
    return;
  }
  
  PathwayManager.advanceSequence(player);
  player.sendMessage('§aYou have become a §5Scribe§a!');
  player.sendMessage('§7Craft the Recording Tome to record abilities');
}

// Traveler Sequence 5
if (itemId === 'lotm:door_potion_seq5') {
  const pathway = PathwayManager.getPathway(player);
  const sequence = PathwayManager.getSequence(player);
  
  if (pathway !== PathwayManager.PATHWAYS.DOOR) {
    player.sendMessage('§cYou must be on the Door pathway to drink this!');
    player.runCommand('give @s lotm:door_potion_seq5 1');
    return;
  }
  
  if (sequence !== 6) {
    player.sendMessage('§cYou must be Sequence 6 (Scribe) to advance to Sequence 5!');
    player.runCommand('give @s lotm:door_potion_seq5 1');
    return;
  }
  
  PathwayManager.advanceSequence(player);
  player.sendMessage('§aYou have become a §5Traveler§a!');
  player.sendMessage('§7You have mastered the art of traveling through the Spirit World');
}
  
  // Handle Twilight Giant pathway potions
  if (itemId === 'lotm:twilight_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.TWILIGHT_GIANT);
    player.sendMessage('§aYou have become a §cWarrior§a!');
  }
  
  if (itemId === 'lotm:twilight_potion_seq8') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway !== PathwayManager.PATHWAYS.TWILIGHT_GIANT) {
      player.sendMessage('§cYou must be on the Twilight Giant pathway to drink this!');
      player.runCommand('give @s lotm:twilight_potion_seq8 1');
      return;
    }
    
    if (sequence !== 9) {
      player.sendMessage('§cYou must be Sequence 9 (Warrior) to advance to Sequence 8!');
      player.runCommand('give @s lotm:twilight_potion_seq8 1');
      return;
    }
    
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §cPugilist§a!');
  }
  
  if (itemId === 'lotm:twilight_potion_seq7') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway !== PathwayManager.PATHWAYS.TWILIGHT_GIANT) {
      player.sendMessage('§cYou must be on the Twilight Giant pathway to drink this!');
      player.runCommand('give @s lotm:twilight_potion_seq7 1');
      return;
    }
    
    if (sequence !== 8) {
      player.sendMessage('§cYou must be Sequence 8 (Pugilist) to advance to Sequence 7!');
      player.runCommand('give @s lotm:twilight_potion_seq7 1');
      return;
    }
    
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §cWeapon Master§a!');
  }
  
  if (itemId === 'lotm:twilight_potion_seq6') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway !== PathwayManager.PATHWAYS.TWILIGHT_GIANT) {
      player.sendMessage('§cYou must be on the Twilight Giant pathway to drink this!');
      player.runCommand('give @s lotm:twilight_potion_seq6 1');
      return;
    }
    
    if (sequence !== 7) {
      player.sendMessage('§cYou must be Sequence 7 (Weapon Master) to advance to Sequence 6!');
      player.runCommand('give @s lotm:twilight_potion_seq6 1');
      return;
    }
    
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §6Dawn Paladin§a!');
  }
  
  // Nightmare Potion (Seq 7)
  if (itemId === 'lotm:darkness_potion_seq7') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway !== PathwayManager.PATHWAYS.DARKNESS) {
      player.sendMessage('§cYou must be on the Darkness pathway!');
      player.runCommand('give @s lotm:darkness_potion_seq7 1');
      return;
    }
    
    if (sequence !== 8) {
      player.sendMessage('§cYou must be Sequence 8 (Midnight Poet) to advance!');
      player.runCommand('give @s lotm:darkness_potion_seq7 1');
      return;
    }
    
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §5Nightmare§a!');
    player.sendMessage('§7Craft Nightmare Powers to use your abilities');
  }
  
  // Handle spirit restoration potions
  if (itemId === 'lotm:spirit_restoration_potion') {
    SpiritSystem.restoreSpirit(player, 50);
    player.sendMessage('§bRestored 50 Spirit!');
  }

// Nightmare Powers ability cycling/use
  if (itemId === 'lotm:nightmare_powers') {
    if (player.isSneaking) {
      // Cycle ability
      cycleNightmareAbility(player);
    } else {
      // Use current ability
      useNightmareAbility(player);
    }
  }
});

// Handle player commands (using afterEvents since beforeEvents.chatSend may not be available)
// world.afterEvents.chatSend.subscribe((event) => {
//   const { sender: player, message } = event;
  
//   if (!message.startsWith('!lotm')) return;
  
//   // Note: We can't cancel the message in afterEvents, so it will appear in chat
//   // This is a limitation of using stable APIs
  
//   const args = message.split(' ');
//   const command = args[1];
  
//   switch (command) {
//     case 'status':
//       showStatus(player);
//       break;
      
//     case 'advance':
//       // Debug command to advance sequence
//       PathwayManager.advanceSequence(player);
//       break;
      
//     case 'reset':
//       PathwayManager.clearPathway(player);
//       player.sendMessage('§cPathway progress reset!');
//       break;
      
//     case 'spirit':
//       const amount = parseInt(args[2]) || 50;
//       SpiritSystem.restoreSpirit(player, amount);
//       player.sendMessage(`§bRestored ${amount} Spirit!`);
//       break;
      
//     case 'give':
//       // Debug command to give items
//       const item = args[2];
//       if (item === 'songs') {
//         player.runCommand('give @s lotm:poet_songs');
//         player.sendMessage('§aGiven Poet Songs item!');
//       } else if (item === 'seq8') {
//         player.runCommand('give @s lotm:darkness_potion_seq8');
//         player.sendMessage('§aGiven Midnight Poet potion!');
//       } else {
//         player.sendMessage('§cUnknown item. Try: songs, seq8');
//       }
//       break;
      
//     case 'help':
//       showHelp(player);
//       break;
      
//     default:
//       player.sendMessage('§cUnknown command. Use !lotm help');
//   }
// });

function showStatus(player) {
  const pathway = PathwayManager.getPathway(player);
  const sequence = PathwayManager.getSequence(player);
  const spirit = SpiritSystem.getSpirit(player);
  const maxSpirit = SpiritSystem.getMaxSpirit(player);
  
  player.sendMessage('§6=== Your Status ===');
  
  if (pathway) {
    const pathwayName = PathwayManager.getPathwayDisplayName(pathway);
    player.sendMessage(`§ePathway: §f${pathwayName}`);
    player.sendMessage(`§eSequence: §f${sequence}`);
    player.sendMessage(`§bSpirit: §f${Math.floor(spirit)}/${maxSpirit}`);
    
    if (pathway === PathwayManager.PATHWAYS.DARKNESS && sequence === 9) {
      player.sendMessage('§7Abilities: Night Vision, Enhanced Physique');
    } else if (pathway === PathwayManager.PATHWAYS.DARKNESS && sequence === 8) {
      player.sendMessage('§7Abilities: All Seq 9 + Songs (Fear/Pacification)');
      const currentAbility = selectedAbilities.get(player.name);
      if (currentAbility) {
        const abilityName = currentAbility === MidnightPoetSequence.ABILITIES.SONG_OF_FEAR 
          ? 'Song of Fear' 
          : 'Song of Pacification';
        player.sendMessage(`§7Current Song: ${abilityName}`);
      }
    } else if (pathway === PathwayManager.PATHWAYS.DEATH && sequence === 9) {
      player.sendMessage('§7Abilities: Spirit Vision, Physical Enhancement, Undead Affinity');
    } else if (pathway === PathwayManager.PATHWAYS.DOOR && sequence === 9) {
      player.sendMessage('§7Abilities: Door Opening (phase through walls)');
    } else if (pathway === PathwayManager.PATHWAYS.DOOR && sequence === 8) {
      player.sendMessage('§7Abilities: Door Opening, Tumble Dash, Flashbang, Burning, Lightning, Freeze');
    }
  } else {
    player.sendMessage('§7You have not embarked on any pathway yet.');
    player.sendMessage('§7Drink a pathway potion to begin!');
  }
}

function showHelp(player) {
  player.sendMessage('§6=== LotM Commands ===');
  player.sendMessage('§e!lotm status §7- View your status');
  player.sendMessage('§e!lotm advance §7- Advance sequence (debug)');
  player.sendMessage('§e!lotm spirit [amount] §7- Restore spirit (debug)');
  player.sendMessage('§e!lotm give [item] §7- Give items (songs, seq8)');
  player.sendMessage('§e!lotm reset §7- Reset pathway');
  player.sendMessage('§e!lotm help §7- Show this help');
}

// Start the mod
initialize();

// Handle entity hits for Twilight Giant pathway weakness debuff
world.afterEvents.entityHitEntity.subscribe((event) => {
  const { damagingEntity, hitEntity } = event;
  
  if (!damagingEntity || damagingEntity.typeId !== 'minecraft:player') return;
  
  const player = damagingEntity;
  const pathway = PathwayManager.getPathway(player);
  const sequence = PathwayManager.getSequence(player);
  
  // Pugilist (Seq 8) and higher apply weakness
  if (pathway === PathwayManager.PATHWAYS.TWILIGHT_GIANT && sequence <= 8) {
    let weaknessLevel = 0;
    let duration = 100; // 5 seconds
    
    if (sequence === 8) {
      weaknessLevel = 0; // Weakness I
    } else if (sequence === 7) {
      weaknessLevel = 1; // Weakness II
    } else if (sequence === 6) {
      weaknessLevel = 2; // Weakness III
    }
    
    try {
      hitEntity.addEffect('weakness', duration, {
        amplifier: weaknessLevel,
        showParticles: true
      });
    } catch (e) {
      // Failed to apply weakness
    }
  }
});

// Handle ability activation (right-click with item)
world.afterEvents.itemUse.subscribe((event) => {
  const { source: player, itemStack } = event;
  
  if (!itemStack) return;
  
  const itemId = itemStack.typeId;
  
  // Handle poet songs ability activation
  if (itemId === 'lotm:poet_songs') {
    if (player.isSneaking) {
      // Cycle ability
      cycleAbility(player);
    } else {
      // Use current ability
      useCurrentAbility(player);
    }
  }
  
  // ========================================
  // DOOR PATHWAY ITEM USAGE
  // ========================================

  // Spirit World Key - ALL Door pathway sequences can use
  if (itemId === 'lotm:spirit_world_key') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR) {
      if (sequence === 9 || sequence === 8) {
        // Original version for lower sequences
        ApprenticeSequence.useDoorOpening(player);
      } else if (sequence <= 7) {
        // Enhanced version for Astrologer and above (can bring others)
        if (player.isSneaking) {
          AstrologerSequence.useDoorOpening(player, true); // Bring nearby players
        } else {
          AstrologerSequence.useDoorOpening(player, false); // Solo
        }
      }
    }
  }

  // Flashbang - Sequence 8 and below
  if (itemId === 'lotm:flashbang') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 8) {
      TrickmasterSequence.useFlashbang(player);
    }
  }

  // Flame Fingers - Sequence 8 and below
  if (itemId === 'lotm:flame_fingers') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);;
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 8) {
      TrickmasterSequence.useBurning(player);
    }
  }

  // Spark Crystal - Sequence 8 and below
  if (itemId === 'lotm:spark_crystal') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 8) {
      TrickmasterSequence.useLightning(player);
    }
  }

  // Frost Stone - Sequence 8 and below
  if (itemId === 'lotm:frost_stone') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 8) {
      if (player.isSneaking) {
        TrickmasterSequence.toggleFreezeMode(player);
      } else {
        TrickmasterSequence.useFreeze(player);
      }
    }
  }

  // // Crystal Ball - Sequence 7 and below (NEW)
  // if (itemId === 'lotm:crystal_ball') {
  //   const pathway = PathwayManager.getPathway(player);
  //   const sequence = PathwayManager.getSequence(player);
    
  //   if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 7) {
  //     // For now, show menu (you can implement proper UI later)
  //     player.sendMessage('§5=== Crystal Ball Scrying ===');
  //     player.sendMessage('§7Type the structure name to scry for it:');
  //     player.sendMessage('§evillage, temple, mansion, stronghold');
  //     player.sendMessage('§emineshaft, monument, fortress, bastion');
  //     player.sendMessage('§eendcity, buriedtreasure, ruinedportal');
      
  //     // Store that player is holding crystal ball for next chat message
  //     // This is a workaround - ideally you'd use forms
  //     player.setDynamicProperty('lotm:holding_crystal_ball', true);
  //   }
  // }

  // Recording Tome - Sequence 6 and below (NEW)
  // Recording Tome - Now opens menu
if (itemId === 'lotm:recording_tome') {
  const pathway = PathwayManager.getPathway(player);
  const sequence = PathwayManager.getSequence(player);
  
  if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 6) {
    // Open the Recording menu
    DoorPathwayMenus.showRecordingMenu(player, ScribeSequence);
  } else {
    player.sendMessage('§cYou must be a Scribe (Sequence 6) or higher to use this!');
  }
}

// Traveler's Log - Now opens menu
if (itemId === 'lotm:travelers_log') {
  const pathway = PathwayManager.getPathway(player);
  const sequence = PathwayManager.getSequence(player);
  
  if (pathway === PathwayManager.PATHWAYS.DOOR && sequence === 5) {
    // Open the Traveler menu
    DoorPathwayMenus.showTravelerMenu(player, TravelerSequence);
  } else {
    player.sendMessage('§cYou must be a Traveler (Sequence 5) to use this!');
  }
}

// Crystal Ball - Can also use menu if desired
if (itemId === 'lotm:crystal_ball') {
  const pathway = PathwayManager.getPathway(player);
  const sequence = PathwayManager.getSequence(player);
  
  if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 7) {
    // Option 1: Show simple menu for structure selection
    DoorPathwayMenus.showCrystalBallMenu(player, AstrologerSequence);
    
    // Option 2: Keep chat-based system (from previous implementation)
    // player.sendMessage('§5=== Crystal Ball Scrying ===');
    // ... etc
  }
}
  
  // Handle Dawn Paladin ability
  if (itemId === 'lotm:dawn_light') {
    DawnPaladinSequence.useLightOfDawn(player);
  }
});

/**
 * Cycle through available abilities
 */
function cycleAbility(player) {
  const sequence = PathwayManager.getSequence(player);
  const pathway = PathwayManager.getPathway(player);
  
  if (pathway !== PathwayManager.PATHWAYS.DARKNESS || sequence !== 8) {
    player.sendMessage('§cYou must be a Midnight Poet to use this!');
    return;
  }
  
  const currentAbility = selectedAbilities.get(player.name);
  let newAbility;
  
  if (currentAbility === MidnightPoetSequence.ABILITIES.SONG_OF_FEAR) {
    newAbility = MidnightPoetSequence.ABILITIES.SONG_OF_PACIFICATION;
  } else {
    newAbility = MidnightPoetSequence.ABILITIES.SONG_OF_FEAR;
  }
  
  selectedAbilities.set(player.name, newAbility);
  
  const abilityName = newAbility === MidnightPoetSequence.ABILITIES.SONG_OF_FEAR 
    ? '§cSong of Fear' 
    : '§bSong of Pacification';
  
  player.sendMessage(`§aSelected: ${abilityName}`);
  player.sendMessage(MidnightPoetSequence.getAbilityDescription(newAbility));
}

// Start the mod
initialize();