import { world, system } from '@minecraft/server';
import { SpiritSystem } from './core/spiritSystem.js';
import { PathwayManager } from './core/pathwayManager.js';
import { SleeplessSequence } from './sequences/darkness/sleepless.js';
import { MidnightPoetSequence } from './sequences/darkness/midnight_poet.js';
import { NightmareSequence } from './sequences/darkness/nightmare.js';
import { SoulAssurerSequence } from './sequences/darkness/soul_assurer.js';
import { CorpseCollectorSequence } from './sequences/death/corpse_collector.js';
import { ApprenticeSequence } from './sequences/door/apprentice.js';
import { TrickmasterSequence } from './sequences/door/trickmaster.js';
import { AstrologerSequence } from './sequences/door/astrologer.js';
import { ScribeSequence } from './sequences/door/scribe.js';
import { TravelerSequence } from './sequences/door/traveler.js';
import { SecretsSorcererSequence } from './sequences/door/secrets_sorcerer.js';
import { WarriorSequence } from './sequences/twilight_giant/warrior.js';
import { PugilistSequence } from './sequences/twilight_giant/pugilist.js';
import { WeaponMasterSequence } from './sequences/twilight_giant/weapon_master.js';
import { DawnPaladinSequence } from './sequences/twilight_giant/dawn_paladin.js';
import { GuardianSequence } from './sequences/twilight_giant/guardian.js'
import { DemonHunterSequence } from './sequences/twilight_giant/demon_hunter.js';

// Sun Pathway
import { BardSequence } from './sequences/sun/bard.js';
import { LightSuppliantSequence } from './sequences/sun/light_suppliant.js';

import { SunPathwayMenus } from './ui/sun_pathway_menus.js';
import { DarknessPathwayMenus } from './ui/darkness_pathway_menus.js';
import { DoorPathwayMenus } from './ui/door_pathway_menus.js';

//weapons
import { RevolverSystem } from './weapons/revolverSystem.js';
import { RangedWeaponBuffs } from './weapons/rangedWeaponBuffs.js';



// Track selected nightmare abilities (player name -> ability ID)
const selectedNightmareAbilities = new Map();

// Initialize the mod
function initialize() {
  world.sendMessage('§aLord of the Mysteries mod loaded!');
  
  // Register tick system
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      // Initialize new players
      // if (!PathwayManager.hasPathway(player)) {
      //   // Don't auto-initialize, let them drink a potion first
      //   continue;
      // }

      // Cache these values (read once per interval)
      const pathway = PathwayManager.getPathway(player);
      const sequence = PathwayManager.getSequence(player);

      if (!pathway || sequence === undefined) continue;
      
      // Spirit regeneration
      // Spirit system (pass sequence to avoid re-reading)
      SpiritSystem.tickRegeneration(player, sequence);
      
      // Display spirit in actionbar
      SpiritSystem.displaySpirit(player);

    try {
      const inventory = player.getComponent('minecraft:inventory');
      if (inventory && inventory.container) {
        const heldItem = inventory.container.getItem(player.selectedSlotIndex);
        
        if (heldItem && heldItem.typeId === 'lotm:revolver') {
          const ammo = RevolverSystem.getAmmoCount(player);
          player.onScreenDisplay.setActionBar(`§7Ammo: §f${ammo} §7bullets`);
        }

        if (heldItem && RangedWeaponBuffs.isRangedWeapon(heldItem.typeId)) {
          const pathway = PathwayManager.getPathway(player);
          const sequence = PathwayManager.getSequence(player);
          
          if (pathway === 'darkness') {
            RangedWeaponBuffs.applyDarknessBuffs(player, sequence);
          } else if (pathway === 'twilight_giant') {
            RangedWeaponBuffs.applyTwilightGiantBuffs(player, sequence);
          }
        }
      }
    } catch (e) {

    }
      
      if (pathway === PathwayManager.PATHWAYS.DARKNESS) {
        if (sequence === 9) {
          SleeplessSequence.applyPassiveAbilities(player);
        } else if (sequence === 8) {
          MidnightPoetSequence.applyPassiveAbilities(player);
        } else if (sequence === 7) {
          NightmareSequence.applyPassiveAbilities(player);
        } else if (sequence === 6) {
          SoulAssurerSequence.applyPassiveAbilities(player);  // ADD THIS
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
        } else if (sequence === 4) {
          SecretsSorcererSequence.applyPassiveAbilities(player);  // ADD THIS
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
        } else if (sequence === 5) {
          GuardianSequence.applyPassiveAbilities(player);  // <-- ADD THIS
        } else if (sequence === 4) {
          DemonHunterSequence.applyPassiveAbilities(player);  // ADD THIS
        }
      } else if (pathway === PathwayManager.PATHWAYS.SUN) {
        if (sequence === 9) {
          BardSequence.applyPassiveAbilities(player);
        } else if (sequence === 8) {
          LightSuppliantSequence.applyPassiveAbilities(player);
        }
      }
    }
  }, 4); // Every tick
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

  // Soul Assurer Potion (Seq 6 advancement)
  if (itemId === 'lotm:darkness_potion_seq6') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway !== PathwayManager.PATHWAYS.DARKNESS) {
      player.sendMessage('§cYou must be on the Darkness pathway!');
      player.runCommand('give @s lotm:darkness_potion_seq6 1');
      return;
    }
    
    if (sequence !== 7) {
      player.sendMessage('§cYou must be Sequence 7 (Nightmare) to advance!');
      player.runCommand('give @s lotm:darkness_potion_seq6 1');
      return;
    }
    
    PathwayManager.advanceSequence(player);
    
    // Increase max spirit for Soul Assurer (+50)
    const currentMax = SpiritSystem.getMaxSpirit(player);
    SpiritSystem.setMaxSpirit(player, currentMax + 50);
    
    player.sendMessage('§aYou have become a §bSoul Assurer§a!');
    player.sendMessage('§7Your spirituality has increased! (+50 max spirit)');
    player.sendMessage('§7Craft Soul Assurer Powers to use your abilities');
    return;
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

  // Secrets Sorcerer Potion (Seq 4)
  if (itemId === 'lotm:door_potion_seq4') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway !== PathwayManager.PATHWAYS.DOOR) {
      player.sendMessage('§cYou must be on the Door pathway!');
      player.runCommand('give @s lotm:door_potion_seq4 1');
      return;
    }
    
    if (sequence !== 5) {
      player.sendMessage('§cYou must be Sequence 5 (Traveler) to advance!');
      player.runCommand('give @s lotm:door_potion_seq4 1');
      return;
    }
    
    PathwayManager.advanceSequence(player);
    
    // Increase max spirit (+150)
    const currentMax = SpiritSystem.getMaxSpirit(player);
    SpiritSystem.setMaxSpirit(player, currentMax + 150);
    
    player.sendMessage('§aYou have become a §5Secrets Sorcerer§a!');
    player.sendMessage('§7Your spirituality surges! (+150 max spirit)');
    player.sendMessage('§7Master of hidden spaces and pocket dimensions');
    return;
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

  if (itemId === 'lotm:twilight_potion_seq5') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway !== PathwayManager.PATHWAYS.TWILIGHT_GIANT) {
      player.sendMessage('§cYou must be on the Twilight Giant pathway to drink this!');
      player.runCommand('give @s lotm:twilight_potion_seq5 1');
      return;
    }
    
    if (sequence !== 6) {
      player.sendMessage('§cYou must be Sequence 6 (Dawn Paladin) to advance to Sequence 5!');
      player.runCommand('give @s lotm:twilight_potion_seq5 1');
      return;
    }
    
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §6Guardian§a!');
    player.sendMessage('§7The strength of giants flows through you!');
  }

  // Demon Hunter Potion (Seq 4)
  if (itemId === 'lotm:twilight_potion_seq4') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway !== PathwayManager.PATHWAYS.TWILIGHT_GIANT) {
      player.sendMessage('§cYou must be on the Twilight Giant pathway!');
      player.runCommand('give @s lotm:twilight_potion_seq4 1');
      return;
    }
    
    if (sequence !== 5) {
      player.sendMessage('§cYou must be Sequence 5 (Guardian) to advance!');
      player.runCommand('give @s lotm:twilight_potion_seq4 1');
      return;
    }
    
    PathwayManager.advanceSequence(player);
    
    // Increase max spirit (+100)
    const currentMax = SpiritSystem.getMaxSpirit(player);
    SpiritSystem.setMaxSpirit(player, currentMax + 100);
    
    player.sendMessage('§aYou have become a §2Demon Hunter (Witcher)§a!');
    player.sendMessage('§7Your spirituality surges! (+100 max spirit)');
    player.sendMessage('§7You possess godlike strength!');
    return;
  }

  // ========================================
  // SUN PATHWAY POTIONS
  // ========================================

  if (itemId === 'lotm:sun_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.SUN);
    player.sendMessage('§aYou have become a §6Bard§a!');
    player.sendMessage('§7Craft Bard Songs to use your abilities');
  }

  if (itemId === 'lotm:sun_potion_seq8') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway !== PathwayManager.PATHWAYS.SUN) {
      player.sendMessage('§cYou must be on the Sun pathway to drink this!');
      player.runCommand('give @s lotm:sun_potion_seq8 1');
      return;
    }
    
    if (sequence !== 9) {
      player.sendMessage('§cYou must be Sequence 9 (Bard) to advance to Sequence 8!');
      player.runCommand('give @s lotm:sun_potion_seq8 1');
      return;
    }
    
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §eLight Suppliant§a!');
    player.sendMessage('§7Craft the Solar Orb to use your sun abilities');
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

  // Soul Assurer Powers ability item
  if (itemId === 'lotm:soul_assurer_powers') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DARKNESS && sequence === 6) {
      if (player.isSneaking) {
        // Open ability menu (cycle through abilities)
        cycleSoulAssurerAbility(player);
      } else {
        // Use selected ability
        useSoulAssurerAbility(player);
      }
    } else {
      player.sendMessage('§cYou must be a Soul Assurer (Sequence 6) to use this!');
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
    
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 5) {
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

  // spirit fog
  if (itemId === 'lotm:spirit_fog_catalyst') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 5) {
      TravelerSequence.useSpiritFog(player);
    }
    return;
  }

  // invisible_hand
  if (itemId === 'lotm:invisible_hand') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 5) {
      if (player.isSneaking) {
        // Sneak + Right-click: Release and return to original spot
        TravelerSequence.useInvisibleHand(player, false);
      } else {
        // Check if already holding something
        const grabbed = TravelerSequence.grabbedTargets.get(player.name);
        if (grabbed) {
          // Right-click while holding: Drop at current location
          TravelerSequence.useInvisibleHand(player, false);
        } else {
          // Right-click while not holding: Grab new target
          TravelerSequence.useInvisibleHand(player, true);
        }
      }
    }
    return;
  }

  // Secrets Sorcerer Powers (pocket dimensions)
  if (itemId === 'lotm:secrets_sorcerer_powers') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence === 4) {
      DoorPathwayMenus.showSecretsSorcererMenu(player, SecretsSorcererSequence);
    } else {
      player.sendMessage('§cYou must be a Secrets Sorcerer (Sequence 4) to use this!');
    }
    return;
  }

  // Transfiguration Portal (quick spawn)
  if (itemId === 'lotm:transfiguration_portal') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 4) {
      SecretsSorcererSequence.spawnTransfigurationPortal(player);
    } else {
      player.sendMessage('§cYou must be a Secrets Sorcerer (Sequence 4) to use this!');
    }
    return;
  }

  // Prison Pocket (point & click)
  if (itemId === 'lotm:prison_pocket') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 4) {
      const target = SecretsSorcererSequence.findNearestEntity(player, 10);
      if (target) {
        SecretsSorcererSequence.imprisonEntity(player, target);
      } else {
        player.sendMessage('§cNo target found! Look at an entity within 10m.');
      }
    } else {
      player.sendMessage('§cYou must be a Secrets Sorcerer (Sequence 4) to use this!');
    }
    return;
  }
  
  // ========================================
  // TWILIGHT GIANT PATHWAY ITEMS
  // ========================================
  
  // Dawn Light
  if (itemId === 'lotm:dawn_light') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.TWILIGHT_GIANT && sequence === 6) {
      DawnPaladinSequence.useLightOfDawn(player);
    } else if (pathway === PathwayManager.PATHWAYS.TWILIGHT_GIANT && sequence <= 5) {
      GuardianSequence.useLightOfDawn(player);
    } else {
      player.sendMessage('§cYou must be a Dawn Paladin or lower (Sequence 6) to unleash the Hurricane of Light!');
    }
    return;
  }
  // Dawn Sword - Hurricane of Light
  if (itemId === 'lotm:dawnsword') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.TWILIGHT_GIANT && sequence === 6) {
      DawnPaladinSequence.useHurricaneOfLight(player);
    } else if (pathway === PathwayManager.PATHWAYS.TWILIGHT_GIANT && sequence <= 5) {
      GuardianSequence.useHurricaneOfLight(player);
    } else {
      player.sendMessage('§cYou must be a Dawn Paladin or lower (Sequence 6) to unleash the Hurricane of Light!');
    }
    return;
  }

  // Guardian Shield - Protection stance
  if (itemId === 'lotm:guardian_shield') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.TWILIGHT_GIANT && sequence <= 5) {
      GuardianSequence.useProtection(player);
    } else {
      player.sendMessage('§cYou must be a Guardian (Sequence 5) to use this!');
    }
    return;
  }

  // Demon Hunter Powers
  if (itemId === 'lotm:demon_hunter_powers') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.TWILIGHT_GIANT && sequence === 4) {
      if (player.isSneaking) {
        cycleDemonHunterAbility(player);
      } else {
        useDemonHunterAbility(player);
      }
    } else {
      player.sendMessage('§cYou must be a Demon Hunter (Sequence 4) to use this!');
    }
    return;
  }

  // ========================================
  // SUN PATHWAY ITEMS
  // ========================================

  // Bard Songs
  if (itemId === 'lotm:bard_songs') {
    if (player.isSneaking) {
      // Sneak + Right-click: Open menu 
      SunPathwayMenus.showBardSongMenu(player);
    } else {
      // Right-click: Sing selected song
      const pathway = PathwayManager.getPathway(player);
      const sequence = PathwayManager.getSequence(player);
      
      if (sequence === 8) {
        LightSuppliantSequence.handleAbilityUse(
          player, 
          BardSequence.getSelectedSong(player)
        );
      } else {
        BardSequence.useSelectedSong(player);
      }
    }
    return;
  }

  // Solar Orb (Light Suppliant)
  if (itemId === 'lotm:solar_orb') {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway === PathwayManager.PATHWAYS.SUN && sequence === 8) {
      if (player.isSneaking) {
        // Sneak + Right-click: Open menu
        SunPathwayMenus.showSolarOrbMenu(player);
      } else {
        // Right-click: Use Sunshine (default)
        LightSuppliantSequence.useSunshine(player);
      }
    }
    return;
  }

  // Weapons
  // revolver
  if (itemId === 'lotm:revolver') {
    RevolverSystem.fireRevolver(player);
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
  // Demon Hunter ointment effects
  if (pathway === PathwayManager.PATHWAYS.TWILIGHT_GIANT && sequence === 4) {
    const ointment = DemonHunterSequence.activeOintments.get(player.name);
    
    if (ointment) {
      switch (ointment.type) {
        case DemonHunterSequence.OINTMENT_TYPES.LIGHTNING:
          // Strike with lightning
          try {
            player.dimension.spawnEntity('minecraft:lightning_bolt', hitEntity.location);
          } catch (e) {}
          break;
          
        case DemonHunterSequence.OINTMENT_TYPES.FREEZING:
          hitEntity.addEffect('slowness', 100, { amplifier: 5 });
          hitEntity.addEffect('mining_fatigue', 100, { amplifier: 3 });
          break;
          
        case DemonHunterSequence.OINTMENT_TYPES.PURIFICATION:
          hitEntity.addEffect('weakness', 100, { amplifier: 2 });
          player.addEffect('regeneration', 60, { amplifier: 1 });
          break;
          
        case DemonHunterSequence.OINTMENT_TYPES.BURNING:
          hitEntity.setOnFire(10, true);
          break;
          
        case DemonHunterSequence.OINTMENT_TYPES.DECAY:
          hitEntity.addEffect('wither', 100, { amplifier: 2 });
          hitEntity.addEffect('poison', 100, { amplifier: 1 });
          break;
          
        case DemonHunterSequence.OINTMENT_TYPES.EXORCISM:
          // Extra damage to undead
          if (hitEntity.typeId.includes('zombie') || 
              hitEntity.typeId.includes('skeleton') ||
              hitEntity.typeId.includes('wither')) {
            hitEntity.applyDamage(20); // Massive holy damage
          }
          break;
      }
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

// Track selected Soul Assurer ability
const selectedSoulAssurerAbilities = new Map();

function cycleSoulAssurerAbility(player) {
  const abilities = SoulAssurerSequence.getAllAbilities();
  
  const current = selectedSoulAssurerAbilities.get(player.name) || abilities[0].id;
  const currentIndex = abilities.findIndex(a => a.id === current);
  const newIndex = (currentIndex + 1) % abilities.length;
  const newAbility = abilities[newIndex];
  
  selectedSoulAssurerAbilities.set(player.name, newAbility.id);
  
  player.sendMessage(`§aSelected: ${newAbility.name}`);
  player.sendMessage(SoulAssurerSequence.getAbilityDescription(newAbility.id));
}

function useSoulAssurerAbility(player) {
  const ability = selectedSoulAssurerAbilities.get(player.name) || 
                  SoulAssurerSequence.ABILITIES.REQUIEM;
  
  SoulAssurerSequence.handleAbilityUse(player, ability);
}

// Track selected Demon Hunter ability
const selectedDemonHunterAbilities = new Map();

function cycleDemonHunterAbility(player) {
  const abilities = DemonHunterSequence.getAllAbilities();
  
  const current = selectedDemonHunterAbilities.get(player.name) || abilities[0].id;
  const currentIndex = abilities.findIndex(a => a.id === current);
  const newIndex = (currentIndex + 1) % abilities.length;
  const newAbility = abilities[newIndex];
  
  selectedDemonHunterAbilities.set(player.name, newAbility.id);
  
  player.sendMessage(`§aSelected: ${newAbility.name}`);
  player.sendMessage(DemonHunterSequence.getAbilityDescription(newAbility.id));
}

function useDemonHunterAbility(player) {
  const ability = selectedDemonHunterAbilities.get(player.name) || 
                  DemonHunterSequence.ABILITIES.EYE_OF_DEMON_HUNTING;
  
  DemonHunterSequence.handleAbilityUse(player, ability);
}

// Track selected Secrets Sorcerer ability
const selectedSecretsSorcererAbilities = new Map();

function cycleSecretsSorcererAbility(player) {
  const abilities = SecretsSorcererSequence.getAllAbilities();
  
  const current = selectedSecretsSorcererAbilities.get(player.name) || abilities[0].id;
  const currentIndex = abilities.findIndex(a => a.id === current);
  const newIndex = (currentIndex + 1) % abilities.length;
  const newAbility = abilities[newIndex];
  
  selectedSecretsSorcererAbilities.set(player.name, newAbility.id);
  
  player.sendMessage(`§aSelected: ${newAbility.name}`);
  player.sendMessage(SecretsSorcererSequence.getAbilityDescription(newAbility.id));
}

function useSecretsSorcererAbility(player) {
  const ability = selectedSecretsSorcererAbilities.get(player.name) || 
                  SecretsSorcererSequence.ABILITIES.CREATE_POCKET;
  
  SecretsSorcererSequence.handleAbilityUse(player, ability);
}

// Start the mod
initialize();
