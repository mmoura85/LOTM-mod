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

// Track selected nightmare abilities (player name -> ability ID)
const selectedNightmareAbilities = new Map();

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
          NightmareSequence.applyPassiveAbilities(player);
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

// Handle item consumption (drinking potions)
world.afterEvents.itemCompleteUse.subscribe((event) => {
  const { source: player, itemStack } = event;
  
  if (!itemStack) return;
  
  const itemId = itemStack.typeId;
  
  // ========================================
  // DARKNESS PATHWAY POTIONS
  // ========================================
  
  if (itemId === 'lotm:darkness_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.DARKNESS);
    player.sendMessage('§aYou have become a §eSleepless§a!');
  }
  
  if (itemId === 'lotm:darkness_potion_seq8') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway !== PathwayManager.PATHWAYS.DARKNESS) {
      player.sendMessage('§cYou must be on the Darkness pathway!');
      player.runCommand('give @s lotm:darkness_potion_seq8 1');
      return;
    }
    
    if (sequence !== 9) {
      player.sendMessage('§cYou must be Sequence 9 (Sleepless) to advance!');
      player.runCommand('give @s lotm:darkness_potion_seq8 1');
      return;
    }
    
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §5Midnight Poet§a!');
    player.sendMessage('§7Craft Poet Songs to use your abilities');
  }
  
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
  
  // ========================================
  // DEATH PATHWAY POTIONS
  // ========================================
  
  if (itemId === 'lotm:death_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.DEATH);
    player.sendMessage('§aYou have become a §8Corpse Collector§a!');
  }
  
  // ========================================
  // DOOR PATHWAY POTIONS
  // ========================================
  
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
  
  // ========================================
  // TWILIGHT GIANT PATHWAY POTIONS
  // ========================================
  
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
  
  // ========================================
  // SPIRIT RESTORATION
  // ========================================
  
  if (itemId === 'lotm:spirit_restoration_potion') {
    SpiritSystem.restoreSpirit(player, 50);
    player.sendMessage('§bRestored 50 Spirit!');
  }
});

// Handle item usage (right-click with items)
world.afterEvents.itemUse.subscribe((event) => {
  const { source: player, itemStack } = event;
  
  if (!itemStack) return;
  
  const itemId = itemStack.typeId;
  
  // ========================================
  // DARKNESS PATHWAY ITEMS
  // ========================================
  
  // Poet Songs
  if (itemId === 'lotm:poet_songs') {
    if (player.isSneaking) {
      // Sneak + Right-click: Open menu
      DarknessPathwayMenus.showPoetSongMenu(player);
    } else {
      // Right-click: Sing selected song
      MidnightPoetSequence.useSelectedSong(player);
    }
    return;
  }
  
  // Nightmare Powers
  if (itemId === 'lotm:nightmare_powers') {
    if (player.isSneaking) {
      // Cycle ability
      cycleNightmareAbility(player);
    } else {
      // Use current ability
      useNightmareAbility(player);
    }
    return;
  }
  
  // ========================================
  // DOOR PATHWAY ITEMS
  // ========================================

  // Spirit World Key
  if (itemId === 'lotm:spirit_world_key') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR) {
      if (sequence === 9 || sequence === 8) {
        // Original version for lower sequences
        ApprenticeSequence.useDoorOpening(player);
      } else if (sequence <= 7) {
        // Enhanced version for Astrologer and above
        if (player.isSneaking) {
          AstrologerSequence.useDoorOpening(player, true); // Bring nearby players
        } else {
          AstrologerSequence.useDoorOpening(player, false); // Solo
        }
      }
    }
    return;
  }

  // Flashbang
  if (itemId === 'lotm:flashbang') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 8) {
      TrickmasterSequence.useFlashbang(player);
    }
    return;
  }

  // Flame Fingers
  if (itemId === 'lotm:flame_fingers') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 8) {
      TrickmasterSequence.useBurning(player);
    }
    return;
  }

  // Spark Crystal
  if (itemId === 'lotm:spark_crystal') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 8) {
      TrickmasterSequence.useLightning(player);
    }
    return;
  }

  // Frost Stone
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
    return;
  }

  // Recording Tome
  if (itemId === 'lotm:recording_tome') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 6) {
      DoorPathwayMenus.showRecordingMenu(player, ScribeSequence);
    } else {
      player.sendMessage('§cYou must be a Scribe (Sequence 6) or higher to use this!');
    }
    return;
  }

  // Traveler's Log
  if (itemId === 'lotm:travelers_log') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence === 5) {
      DoorPathwayMenus.showTravelerMenu(player, TravelerSequence);
    } else {
      player.sendMessage('§cYou must be a Traveler (Sequence 5) to use this!');
    }
    return;
  }

  // Crystal Ball
  if (itemId === 'lotm:crystal_ball') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 7) {
      DoorPathwayMenus.showCrystalBallMenu(player, AstrologerSequence);
    }
    return;
  }
  
  // ========================================
  // TWILIGHT GIANT PATHWAY ITEMS
  // ========================================
  
  // Dawn Light
  if (itemId === 'lotm:dawn_light') {
    DawnPaladinSequence.useLightOfDawn(player);
    return;
  }
});

// Handle entity hits (for weapon debuffs)
world.afterEvents.entityHitEntity.subscribe((event) => {
  const { damagingEntity, hitEntity } = event;
  
  if (!damagingEntity || damagingEntity.typeId !== 'minecraft:player') return;
  
  const player = damagingEntity;
  const pathway = PathwayManager.getPathway(player);
  const sequence = PathwayManager.getSequence(player);
  
  // Twilight Giant - Pugilist and higher apply weakness debuff
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

// ========================================
// NIGHTMARE ABILITY HELPERS
// ========================================

function cycleNightmareAbility(player) {
  const abilities = [
    NightmareSequence.ABILITIES.NIGHTMARE_STATE,
    NightmareSequence.ABILITIES.DREAM_INVASION,
    NightmareSequence.ABILITIES.NIGHTMARE_LIMBS
  ];
  
  const current = selectedNightmareAbilities.get(player.name) || abilities[0];
  const currentIndex = abilities.indexOf(current);
  const newIndex = (currentIndex + 1) % abilities.length;
  const newAbility = abilities[newIndex];
  
  selectedNightmareAbilities.set(player.name, newAbility);
  
  const names = {
    'nightmare_state': '§5Nightmare State',
    'dream_invasion': '§bDream Invasion',
    'nightmare_limbs': '§cNightmare Limbs'
  };
  
  player.sendMessage(`§aSelected: ${names[newAbility]}`);
  player.sendMessage(NightmareSequence.getAbilityDescription(newAbility));
}

function useNightmareAbility(player) {
  const ability = selectedNightmareAbilities.get(player.name) || 
                  NightmareSequence.ABILITIES.NIGHTMARE_STATE;
  
  NightmareSequence.handleAbilityUse(player, ability);
}

// Start the mod
initialize();
