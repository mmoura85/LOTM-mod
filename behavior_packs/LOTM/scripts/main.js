import { world, system } from '@minecraft/server';
import { SpiritSystem } from './core/spiritSystem.js';
import { PathwayManager } from './core/pathwayManager.js';
import { SleeplessSequence } from './sequences/darkness/sleepless.js';
import { MidnightPoetSequence } from './sequences/darkness/midnight_poet.js';
import { NightmareSequence } from './sequences/darkness/nightmare.js';
import { SoulAssurerSequence } from './sequences/darkness/soul_assurer.js';
import { CorpseCollectorSequence } from './sequences/death/corpse_collector.js';
import { GravediggerSequence } from './sequences/death/gravedigger.js';
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
import { GuardianSequence } from './sequences/twilight_giant/guardian.js';
import { DemonHunterSequence } from './sequences/twilight_giant/demon_hunter.js';
import { SeerSequence, ClownSequence, MagicianSequence } from './sequences/seer/seer_pathway.js';

// Justiciar
import { ArbiterSequence } from './sequences/justiciar/arbiter.js';
import { SheriffSequence } from './sequences/justiciar/sheriff.js';
import { InterrogatorSequence } from './sequences/justiciar/interrogator.js';
import { JudgeSequence } from './sequences/justiciar/judge.js';
import { DisciplinaryPaladinSequence } from './sequences/justiciar/disciplinary_paladin.js';
import { ImperativeMageSequence } from './sequences/justiciar/imperative_mage.js';

// Sun Pathway
import { BardSequence } from './sequences/sun/bard.js';
import { LightSuppliantSequence } from './sequences/sun/light_suppliant.js';

// Hanged Man
import { SecretsSuppliantSequence } from './sequences/hanged_man/secrets_suppliant.js';
import { ListenerSequence } from './sequences/hanged_man/listener.js';
import { ShadowAsceticSequence } from './sequences/hanged_man/shadow_ascetic.js';
import { RoseBishopSequence }  from './sequences/hanged_man/rose_bishop.js';
import { ShepherdSequence } from './sequences/hanged_man/shepherd.js';

// Hermit
import { MysteryPryerSequence } from './sequences/hermit/mystery_pryer.js';
import { MeleeScholarSequence }  from './sequences/hermit/melee_scholar.js';
import { WarlockSequence } from './sequences/hermit/warlock.js';
import { ScrollProfessorSequence } from './sequences/hermit/scroll_professor.js';

// UI
import { SunPathwayMenus } from './ui/sun_pathway_menus.js';
import { DarknessPathwayMenus } from './ui/darkness_pathway_menus.js';
import { DoorPathwayMenus } from './ui/door_pathway_menus.js';
import { TwilightGiantMenus } from './ui/twilight_giant_menus.js';
import { HangedManMenus }      from './ui/hanged_man_menus.js';
import { HermitPathwayMenus }    from './ui/hermit_pathway_menus.js';
import { WarlockMenus }    from './ui/warlock_menus.js';
import { ScrollProfessorMenus }    from './ui/scroll_professor_menus.js';

// Weapons
import { RevolverSystem } from './weapons/revolverSystem.js';
import { RangedWeaponBuffs } from './weapons/rangedWeaponBuffs.js';
// Plants
import { registerPlantGrowth } from './world/plant_growth.js';

//RAMPAGER
import { RampagerSystem } from './world/rampagerSystem.js';


// ── Block component registration — MUST be in startup, before world loads ──
// This is the only place system.beforeEvents.startup should be called.
// Importing plant_growth.js and calling it here guarantees the component
// is registered before Bedrock tries to load any plant blocks.
// system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
//   registerPlantGrowth(blockComponentRegistry);
// });

// ── Ability selection maps ─────────────────────────────────────────────────
const selectedNightmareAbilities  = new Map();
const selectedSoulAssurerAbilities = new Map();
const selectedDemonHunterAbilities = new Map();
const selectedSecretsSorcererAbilities = new Map();

// ============================================================================
// INITIALIZE
// ============================================================================
function initialize() {
  world.sendMessage('§aLord of the Mysteries mod loaded!');

  ShepherdSequence.registerSequenceClasses({
    // Darkness
    'MidnightPoetSequence':   MidnightPoetSequence,
    'NightmareSequence':      NightmareSequence,
    'SoulAssurerSequence':    SoulAssurerSequence,
    // Twilight Giant
    'DawnPaladinSequence':    DawnPaladinSequence,
    'GuardianSequence':       GuardianSequence,
    // Door
    'ApprenticeSequence':     ApprenticeSequence,
    'TrickmasterSequence':    TrickmasterSequence,
    'AstrologerSequence':     AstrologerSequence,
    'ScribeSequence':         ScribeSequence,
    'TravelerSequence':       TravelerSequence,
    // Death
    'CorpseCollectorSequence': CorpseCollectorSequence,
    // Sun
    'BardSequence':           BardSequence,
    'LightSuppliantSequence': LightSuppliantSequence,
    // Seer
    'SeerSequence':           SeerSequence,
    'ClownSequence':          ClownSequence,
    'MagicianSequence':       MagicianSequence,
    // Justiciar
    'ArbiterSequence':        ArbiterSequence,
    'SheriffSequence':        SheriffSequence,
  });

  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      const pathway  = PathwayManager.getPathway(player);
      const sequence = PathwayManager.getSequence(player);
      if (!pathway || sequence === undefined) continue;

      SpiritSystem.tickRegeneration(player, sequence);
      SpiritSystem.displaySpirit(player);

      // ── Held-item actionbar overrides ─────────────────────────────────────
      try {
        const inventory = player.getComponent('minecraft:inventory');
        if (inventory && inventory.container) {
          const heldItem = inventory.container.getItem(player.selectedSlotIndex);

          if (heldItem) {
            const hid = heldItem.typeId;
            if (hid === 'lotm:revolver') {
              player.onScreenDisplay.setActionBar(`§7Ammo: §f${RevolverSystem.getAmmoCount(player)} §7bullets`);
            } else if (hid === 'lotm:sheriffs_badge') {
              player.onScreenDisplay.setActionBar(SheriffSequence.getStatusText(player));
            } else if (hid === 'lotm:interrogators_brand') {
              player.onScreenDisplay.setActionBar(InterrogatorSequence.getStatusText(player));
            } else if (hid === 'lotm:judges_gavel') {
              player.onScreenDisplay.setActionBar(JudgeSequence.getStatusText(player));
            } else if (hid === 'lotm:paladins_seal') {
              player.onScreenDisplay.setActionBar(DisciplinaryPaladinSequence.getStatusText(player));
            } else if (hid === 'lotm:mages_codex') {
              player.onScreenDisplay.setActionBar(ImperativeMageSequence.getStatusText(player));
            } else if (hid === 'lotm:paper_figurine_item') {
              const cd       = MagicianSequence.figurineCooldowns.get(player.name) || 0;
              const hasSpirit = SpiritSystem.getSpirit(player) >= MagicianSequence.FIGURINE_SPIRIT_COST;
              player.onScreenDisplay.setActionBar(
                cd > 0 ? `§f📄 Figurine cooldown: §c${Math.ceil(cd/20)}s`
                       : hasSpirit ? '§f📄 Paper Figurine §a✔ Ready'
                                   : '§f📄 Paper Figurine §c✘ Low spirit'
              );
            }

            if (RangedWeaponBuffs.isRangedWeapon(hid)) {
              if (pathway === 'darkness')       RangedWeaponBuffs.applyDarknessBuffs(player, sequence);
              else if (pathway === 'twilight_giant') RangedWeaponBuffs.applyTwilightGiantBuffs(player, sequence);
            }
          }
        }
      } catch (_) {}

      // ── Pathway passive abilities ──────────────────────────────────────────
      if (pathway === PathwayManager.PATHWAYS.DARKNESS) {
        if      (sequence === 9) SleeplessSequence.applyPassiveAbilities(player);
        else if (sequence === 8) MidnightPoetSequence.applyPassiveAbilities(player);
        else if (sequence === 7) NightmareSequence.applyPassiveAbilities(player);
        else if (sequence === 6) SoulAssurerSequence.applyPassiveAbilities(player);
      } else if (pathway === PathwayManager.PATHWAYS.DEATH) {
        if (sequence === 9) {
          CorpseCollectorSequence.applyPassiveAbilities(player);
        } else if (sequence === 8) {
          GravediggerSequence.applyPassiveAbilities(player);
        }
      } else if (pathway === PathwayManager.PATHWAYS.DOOR) {
        if      (sequence === 9) ApprenticeSequence.applyPassiveAbilities(player);
        else if (sequence === 8) TrickmasterSequence.applyPassiveAbilities(player);
        else if (sequence === 7) AstrologerSequence.applyPassiveAbilities(player);
        else if (sequence === 6) ScribeSequence.applyPassiveAbilities(player);
        else if (sequence === 5) TravelerSequence.applyPassiveAbilities(player);
        else if (sequence === 4) SecretsSorcererSequence.applyPassiveAbilities(player);
      } else if (pathway === PathwayManager.PATHWAYS.TWILIGHT_GIANT) {
        if      (sequence === 9) WarriorSequence.applyPassiveAbilities(player);
        else if (sequence === 8) PugilistSequence.applyPassiveAbilities(player);
        else if (sequence === 7) WeaponMasterSequence.applyPassiveAbilities(player);
        else if (sequence === 6) DawnPaladinSequence.applyPassiveAbilities(player);
        else if (sequence === 5) GuardianSequence.applyPassiveAbilities(player);
        else if (sequence === 4) DemonHunterSequence.applyPassiveAbilities(player);
      } else if (pathway === PathwayManager.PATHWAYS.SUN) {
        if      (sequence === 9) BardSequence.applyPassiveAbilities(player);
        else if (sequence === 8) LightSuppliantSequence.applyPassiveAbilities(player);
      } else if (pathway === PathwayManager.PATHWAYS.SEER) {
        if      (sequence === 9) SeerSequence.applyPassiveAbilities(player);
        else if (sequence === 8) ClownSequence.applyPassiveAbilities(player);
        else if (sequence === 7) MagicianSequence.applyPassiveAbilities(player);
      } else if (pathway === PathwayManager.PATHWAYS.JUSTICIAR) {
        if      (sequence === 9) ArbiterSequence.applyPassiveAbilities(player);
        else if (sequence === 8) SheriffSequence.applyPassiveAbilities(player);
        else if (sequence === 7) InterrogatorSequence.applyPassiveAbilities(player);
        else if (sequence === 6) JudgeSequence.applyPassiveAbilities(player);
        else if (sequence === 5) DisciplinaryPaladinSequence.applyPassiveAbilities(player);
        else if (sequence === 4) ImperativeMageSequence.applyPassiveAbilities(player);
      } else if (pathway === PathwayManager.PATHWAYS.HANGED_MAN) {
        if      (sequence === 9) SecretsSuppliantSequence.applyPassiveAbilities(player);
        else if (sequence === 8) ListenerSequence.applyPassiveAbilities(player);
        else if (sequence === 7) ShadowAsceticSequence.applyPassiveAbilities(player);
        else if (sequence === 6) RoseBishopSequence.applyPassiveAbilities(player);
        else if (sequence === 5) ShepherdSequence.applyPassiveAbilities(player);
      } else if (pathway === PathwayManager.PATHWAYS.HERMIT) {
      if      (sequence === 9) MysteryPryerSequence.applyPassiveAbilities(player);
        else if (sequence === 8) MeleeScholarSequence.applyPassiveAbilities(player);
        else if (sequence === 7) WarlockSequence.applyPassiveAbilities(player);
        else if (sequence === 6) ScrollProfessorSequence.applyPassiveAbilities(player);
      }
    }

     // Tick all rampagers
    for (const dimName of ['overworld', 'nether', 'the_end']) {
      try {
        const dim = world.getDimension(dimName);
        const rampagers = dim.getEntities({ type: 'lotm:rampager' });
        for (const rampager of rampagers) {
          RampagerSystem.tick(rampager);
        }
      } catch (e) {}
    }

  }, 4);
}

// ============================================================================
// ITEM COMPLETE USE (potions)
// ============================================================================
world.afterEvents.itemCompleteUse.subscribe((event) => {
  const { source: player, itemStack } = event;
  if (!itemStack) return;
  const itemId = itemStack.typeId;

  // ── DARKNESS ──────────────────────────────────────────────────────────────
  if (itemId === 'lotm:darkness_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.DARKNESS);
    player.sendMessage('§aYou have become a §eSleepless§a!');
  }
  if (itemId === 'lotm:darkness_potion_seq8') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.DARKNESS, itemId)) return;
    if (!_requireSequence(player, sequence, 9, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §5Midnight Poet§a!');
    player.sendMessage('§7Craft Poet Songs to use your abilities');
  }
  if (itemId === 'lotm:darkness_potion_seq7') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.DARKNESS, itemId)) return;
    if (!_requireSequence(player, sequence, 8, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §5Nightmare§a!');
    player.sendMessage('§7Craft Nightmare Powers to use your abilities');
  }
  if (itemId === 'lotm:darkness_potion_seq6') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.DARKNESS, itemId)) return;
    if (!_requireSequence(player, sequence, 7, itemId)) return;
    PathwayManager.advanceSequence(player);
    const currentMax = SpiritSystem.getMaxSpirit(player);
    SpiritSystem.setMaxSpirit(player, currentMax + 50);
    player.sendMessage('§aYou have become a §bSoul Assurer§a!');
    player.sendMessage('§7Your spirituality has increased! (+50 max spirit)');
    player.sendMessage('§7Craft Soul Assurer Powers to use your abilities');
  }

  // ── DEATH ─────────────────────────────────────────────────────────────────
  if (itemId === 'lotm:death_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.DEATH);
    player.sendMessage('§aYou have become a §8Corpse Collector§a!');
  }
  if (itemId === 'lotm:death_potion_seq8') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.DEATH, itemId)) return;
    if (!_requireSequence(player, sequence, 9, itemId)) return;
    PathwayManager.advanceSequence(player);
    const currentMax = SpiritSystem.getMaxSpirit(player);
    SpiritSystem.setMaxSpirit(player, currentMax + 20);
    player.sendMessage('§8You have become a §7Gravedigger§8!');
    player.sendMessage('§7Craft a §8Spirit Whistle§7 to command the spirits');
  }

  // ── DOOR ──────────────────────────────────────────────────────────────────
  if (itemId === 'lotm:door_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.DOOR);
    player.sendMessage('§aYou have become an §5Apprentice§a!');
    player.sendMessage('§7Craft the Spirit World Key to use your abilities');
  }
  if (itemId === 'lotm:door_potion_seq8') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.DOOR, itemId)) return;
    if (!_requireSequence(player, sequence, 9, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §6Trickmaster§a!');
    player.sendMessage('§7Craft your trick items to use abilities');
  }
  if (itemId === 'lotm:door_potion_seq7') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.DOOR, itemId)) return;
    if (!_requireSequence(player, sequence, 8, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become an §5Astrologer§a!');
    player.sendMessage('§7Craft the Crystal Ball to scry for structures');
  }
  if (itemId === 'lotm:door_potion_seq6') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.DOOR, itemId)) return;
    if (!_requireSequence(player, sequence, 7, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §5Scribe§a!');
    player.sendMessage('§7Craft the Recording Tome to record abilities');
  }
  if (itemId === 'lotm:door_potion_seq5') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.DOOR, itemId)) return;
    if (!_requireSequence(player, sequence, 6, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §5Traveler§a!');
    player.sendMessage('§7You have mastered the art of traveling through the Spirit World');
  }
  if (itemId === 'lotm:door_potion_seq4') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.DOOR, itemId)) return;
    if (!_requireSequence(player, sequence, 5, itemId)) return;
    PathwayManager.advanceSequence(player);
    const currentMax = SpiritSystem.getMaxSpirit(player);
    SpiritSystem.setMaxSpirit(player, currentMax + 150);
    player.sendMessage('§aYou have become a §5Secrets Sorcerer§a!');
    player.sendMessage('§7Your spirituality surges! (+150 max spirit)');
    player.sendMessage('§7Master of hidden spaces and pocket dimensions');
  }

  // ── TWILIGHT GIANT ────────────────────────────────────────────────────────
  if (itemId === 'lotm:twilight_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.TWILIGHT_GIANT);
    player.sendMessage('§aYou have become a §cWarrior§a!');
  }
  if (itemId === 'lotm:twilight_potion_seq8') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.TWILIGHT_GIANT, itemId)) return;
    if (!_requireSequence(player, sequence, 9, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §cPugilist§a!');
  }
  if (itemId === 'lotm:twilight_potion_seq7') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.TWILIGHT_GIANT, itemId)) return;
    if (!_requireSequence(player, sequence, 8, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §cWeapon Master§a!');
  }
  if (itemId === 'lotm:twilight_potion_seq6') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.TWILIGHT_GIANT, itemId)) return;
    if (!_requireSequence(player, sequence, 7, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §6Dawn Paladin§a!');
  }
  if (itemId === 'lotm:twilight_potion_seq5') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.TWILIGHT_GIANT, itemId)) return;
    if (!_requireSequence(player, sequence, 6, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §6Guardian§a!');
    player.sendMessage('§7The strength of giants flows through you!');
  }
  if (itemId === 'lotm:twilight_potion_seq4') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.TWILIGHT_GIANT, itemId)) return;
    if (!_requireSequence(player, sequence, 5, itemId)) return;
    PathwayManager.advanceSequence(player);
    const currentMax = SpiritSystem.getMaxSpirit(player);
    SpiritSystem.setMaxSpirit(player, currentMax + 100);
    player.sendMessage('§aYou have become a §2Demon Hunter (Witcher)§a!');
    player.sendMessage('§7Your spirituality surges! (+100 max spirit)');
    player.sendMessage('§7You possess godlike strength!');
  }

  // ── SUN ───────────────────────────────────────────────────────────────────
  if (itemId === 'lotm:sun_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.SUN);
    player.sendMessage('§aYou have become a §6Bard§a!');
    player.sendMessage('§7Craft Bard Songs to use your abilities');
  }
  if (itemId === 'lotm:sun_potion_seq8') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.SUN, itemId)) return;
    if (!_requireSequence(player, sequence, 9, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§aYou have become a §eLight Suppliant§a!');
    player.sendMessage('§7Craft the Solar Orb to use your sun abilities');
  }

  // ── SEER ──────────────────────────────────────────────────────────────────
  if (itemId === 'lotm:seer_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.SEER);
    SpiritSystem.initializePlayer(player, 200);
    player.sendMessage('§5§lYou have become a Seer!');
    player.sendMessage('§7Craft a §dSpirit Vision Orb§7 to activate Spirit Vision');
    player.playSound('mob.elder_guardian.curse', { pitch: 1.5, volume: 1.0 });
  }
  if (itemId === 'lotm:seer_potion_seq8') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.SEER, itemId)) return;
    if (!_requireSequence(player, sequence, 9, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§c§lYou have become a Clown!');
    player.sendMessage('§7Craft a §cClown Mask§7 to use Feint Strike and Disguise');
    player.playSound('mob.witch.laugh', { pitch: 1.0, volume: 1.0 });
  }
  if (itemId === 'lotm:seer_potion_seq7') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.SEER, itemId)) return;
    if (!_requireSequence(player, sequence, 8, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§9§lYou have become a Magician!');
    player.sendMessage("§7Craft a §9Magician's Wand§7 for Flaming Jump, Damage Transfer & Spell Volley");
    player.playSound('random.levelup', { pitch: 0.8, volume: 1.0 });
  }

  // ── JUSTICIAR ─────────────────────────────────────────────────────────────
  if (itemId === 'lotm:justiciar_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.JUSTICIAR);
    player.sendMessage('§6You have become an §eArbiter§6!');
    player.sendMessage('§7Your presence carries the weight of Order itself');
  }
  if (itemId === 'lotm:justiciar_potion_seq8') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.JUSTICIAR, itemId)) return;
    if (!_requireSequence(player, sequence, 9, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§6You have become a §eSheriff§6!');
    player.sendMessage("§7Craft the §eSheriff's Badge §7to use your abilities");
  }
  if (itemId === 'lotm:justiciar_potion_seq7') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.JUSTICIAR, itemId)) return;
    if (!_requireSequence(player, sequence, 8, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§6You have become an §eInterrogator§6!');
    player.sendMessage("§7Craft the §eInterrogator's Brand");
  }
  if (itemId === 'lotm:justiciar_potion_seq6') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.JUSTICIAR, itemId)) return;
    if (!_requireSequence(player, sequence, 7, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§5You have become a §dJudge§5!');
    player.sendMessage("§7Craft the §dJudge's Gavel");
  }
  if (itemId === 'lotm:justiciar_potion_seq5') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.JUSTICIAR, itemId)) return;
    if (!_requireSequence(player, sequence, 6, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§6You have become a §eDisiplinary Paladin§6!');
    player.sendMessage("§7Craft the §ePaladin's Seal");
  }
  if (itemId === 'lotm:justiciar_potion_seq4') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.JUSTICIAR, itemId)) return;
    if (!_requireSequence(player, sequence, 5, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§6You have become an §eImperative Mage§6!');
    player.sendMessage("§7Craft the §eMage's Codex");
  }

  // ── Hanged Man ─────────────────────────────────────────────────────────────────
  if (itemId === 'lotm:hanged_man_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.HANGED_MAN);
    SpiritSystem.initializePlayer(player, SecretsSuppliantSequence.BASE_SPIRIT);
    player.sendMessage('§5§lYou have become a Secrets Suppliant!');
    player.sendMessage('§7The veil between worlds grows thin before you...');
    player.sendMessage('§7Craft Secrets Suppliant Powers to use your abilities');
    player.playSound('block.beacon.activate', { pitch: 1.4, volume: 1.0 });
  }

  if (itemId === 'lotm:hanged_man_potion_seq8') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.HANGED_MAN, itemId)) return;
    if (!_requireSequence(player, sequence, 9, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§5§lYou have become a Listener!');
    player.sendMessage('§7The whispers between worlds have found you...');
    player.sendMessage('§4Warning: the voices will slowly consume your mind.');
    player.sendMessage('§7Use Secrets Suppliant Powers or a new item to access abilities');
    player.playSound('mob.endermen.stare', { pitch: 0.3, volume: 1.0 });
  }

  if (itemId === 'lotm:hanged_man_potion_seq7') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.HANGED_MAN, itemId)) return;
    if (!_requireSequence(player, sequence, 8, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§8§lYou have become a Shadow Ascetic!');
    player.sendMessage('§8The shadows bend to your will...');
    player.sendMessage('§7You can now toggle the voices on and off.');
    player.sendMessage('§7Craft Secrets Suppliant Powers to use your abilities');
    player.playSound('mob.endermen.portal', { pitch: 0.3, volume: 1.0 });
  }

  if (itemId === 'lotm:hanged_man_potion_seq6') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.HANGED_MAN, itemId)) return;
    if (!_requireSequence(player, sequence, 7, itemId)) return;
    PathwayManager.advanceSequence(player);
    // Boost spirit pool
    const currentMax = SpiritSystem.getMaxSpirit(player);
    SpiritSystem.setMaxSpirit(player, currentMax + 40);
    player.sendMessage('§c§lYou have become a Rose Bishop!');
    player.sendMessage('§cFlesh and Blood bend to your will...');
    player.sendMessage('§4Warning: your body craves flesh to sustain its power.');
    player.sendMessage('§7Craft Secrets Suppliant Powers to use your abilities');
    // Initialise flesh hunger to neutral
    RoseBishopSequence.setFleshHunger(player, 50);
    player.playSound('mob.player.hurt', { pitch: 0.4, volume: 1.0 });
  }

  if (itemId === 'lotm:hanged_man_potion_seq5') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.HANGED_MAN, itemId)) return;
    if (!_requireSequence(player, sequence, 6, itemId)) return;
    PathwayManager.advanceSequence(player);
    const currentMax = SpiritSystem.getMaxSpirit(player);
    SpiritSystem.setMaxSpirit(player, currentMax + 60);
    player.sendMessage('§5§lYou have become a Shepherd!');
    player.sendMessage('§5The souls of beyonders are yours to consume...');
    player.sendMessage('§7Use lotm:beyonder_soul to graze abilities from characteristics.');
    player.sendMessage('§7(+60 max spirit)');
    player.playSound('mob.endermen.portal', { pitch: 0.3, volume: 1.0 });
  }

  // Rose Bishop flesh consumption passive bonus
  const fleshFoods = [
    'minecraft:rotten_flesh', 'minecraft:raw_beef', 'minecraft:raw_porkchop',
    'minecraft:raw_mutton', 'minecraft:raw_chicken', 'minecraft:raw_rabbit',
    'minecraft:raw_cod', 'minecraft:raw_salmon'
  ];
  if (fleshFoods.includes(itemId)) {
    RoseBishopSequence.onFleshItemEaten(player, itemId);
  }
  // LOTM flesh items also trigger on itemCompleteUse (they have food components):
  if (itemId === 'lotm:ghoul_flesh' || itemId === 'lotm:spirit_blood') {
    RoseBishopSequence.onFleshItemEaten(player, itemId);
  }


  // ── HERMIT ──────────────────────────────────────────────────────────────
  if (itemId === 'lotm:hermit_potion_seq9') {
    PathwayManager.assignPathway(player, PathwayManager.PATHWAYS.HERMIT);
    SpiritSystem.initializePlayer(player, 220); // High spirituality base
    player.sendMessage('§5You have become a §dMystery Pryer§5!');
    player.sendMessage('§7Your spiritual perception has awakened...');
    player.sendMessage('§7Craft the Mystery Pryer\'s Eye to use your abilities');
    player.playSound('mob.elder_guardian.curse', { pitch: 1.5, volume: 1.0 });
  }
  if (itemId === 'lotm:hermit_potion_seq8') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.HERMIT, itemId)) return;
    if (!_requireSequence(player, sequence, 9, itemId)) return;
    PathwayManager.advanceSequence(player);
    const currentMax = SpiritSystem.getMaxSpirit(player);
    SpiritSystem.setMaxSpirit(player, currentMax + 25);
    player.sendMessage('§5You have become a §dMelee Scholar§5!');
    player.sendMessage('§7Combat knowledge flows through your spirit! (+25 max spirit)');
    player.sendMessage('§7Craft the Scholar\'s Martial Tome to use your abilities');
  }

  if (itemId === 'lotm:hermit_potion_seq7') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.HERMIT, itemId)) return;
    if (!_requireSequence(player, sequence, 8, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§5You have become a §dWarlock§5!');
    player.sendMessage('§7The mysteries of spellcasting open before you...');
    player.sendMessage('§7Craft the §5Warlock\'s Wand §7to cast spells.');
    player.sendMessage('§7Craft §5powder ingredients §7to fuel your spells.');
    player.playSound('mob.elder_guardian.curse', { pitch: 1.0, volume: 1.0 });
  }

  if (itemId === 'lotm:hermit_potion_seq6') {
    const { pathway, sequence } = _getPS(player);
    if (!_requirePathway(player, pathway, PathwayManager.PATHWAYS.HERMIT, itemId)) return;
    if (!_requireSequence(player, sequence, 7, itemId)) return;
    PathwayManager.advanceSequence(player);
    player.sendMessage('§5You have become a §dScroll Professor§5!');
    player.sendMessage('§7The art of scroll-making flows into your mind...');
    player.sendMessage('§7Craft scrolls and right-click them to cast powerful spells.');
    player.playSound('mob.elder_guardian.curse', { pitch: 0.8, volume: 1.0 });
  }


  // ── SPIRIT RESTORATION ────────────────────────────────────────────────────
  if (itemId === 'lotm:spirit_restoration_potion') {
    SpiritSystem.restoreSpirit(player, 50);
    player.sendMessage('§bRestored 50 Spirit!');
    ListenerSequence.onSpiritPotionDrank(player);  // existing
    // Rose Bishop: also restore flesh hunger slightly
    const { pathway: rp, sequence: rs } = _getPS(player);
    if (rp === PathwayManager.PATHWAYS.HANGED_MAN && rs <= 6) {
      const prev = RoseBishopSequence.getFleshHunger(player);
      RoseBishopSequence.setFleshHunger(player, prev + 10);
      player.sendMessage('§cThe potion sustains your flesh slightly. (+10 flesh hunger)');
    }
  }
});
// ============================================================================
// ITEM USE (right-click)
// ============================================================================
world.afterEvents.itemUse.subscribe((event) => {
  const { source: player, itemStack } = event;
  if (!itemStack) return;
  const itemId = itemStack.typeId;

  // ── DARKNESS ──────────────────────────────────────────────────────────────
  if (itemId === 'lotm:poet_songs') {
    player.isSneaking ? DarknessPathwayMenus.showPoetSongMenu(player)
                      : MidnightPoetSequence.useSelectedSong(player);
    return;
  }
  if (itemId === 'lotm:nightmare_powers') {
    player.isSneaking ? cycleNightmareAbility(player) : useNightmareAbility(player);
    return;
  }
  if (itemId === 'lotm:soul_assurer_powers') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DARKNESS && sequence === 6) {
      if (player.isSneaking) {
        // Open full menu showing ALL available abilities
        DarknessPathwayMenus.showSoulAssurerMenu(player);
      } else {
        // Use currently selected ability
        useSoulAssurerAbility(player);
      }
    } else {
      player.sendMessage('§cYou must be a Soul Assurer (Sequence 6) to use this!');
    }
    return;
  }

  
  // ── DEATH ──────────────────────────────────────────────────────────────
  if (itemId === 'lotm:spirit_whistle') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DEATH && sequence <= 8) {
      GravediggerSequence.handleWhistle(player, player.isSneaking);
    } else {
      player.sendMessage('§cYou must be a Gravedigger (Sequence 8) to use this!');
    }
    return;
  }

  // ── DOOR ──────────────────────────────────────────────────────────────────
  if (itemId === 'lotm:spirit_world_key') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DOOR) {
      if (sequence === 9 || sequence === 8) ApprenticeSequence.useDoorOpening(player);
      else if (sequence <= 7) AstrologerSequence.useDoorOpening(player, player.isSneaking);
    }
    return;
  }
  if (itemId === 'lotm:flashbang') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 8) TrickmasterSequence.useFlashbang(player);
    return;
  }
  if (itemId === 'lotm:flame_fingers') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 8) TrickmasterSequence.useBurning(player);
    return;
  }
  if (itemId === 'lotm:spark_crystal') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 8) TrickmasterSequence.useLightning(player);
    return;
  }
  if (itemId === 'lotm:frost_stone') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 8) {
      player.isSneaking ? TrickmasterSequence.toggleFreezeMode(player)
                        : TrickmasterSequence.useFreeze(player);
    }
    return;
  }
  if (itemId === 'lotm:recording_tome') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 6)
      DoorPathwayMenus.showRecordingMenu(player, ScribeSequence);
    else player.sendMessage('§cYou must be a Scribe (Sequence 6) or higher to use this!');
    return;
  }
  if (itemId === 'lotm:travelers_log') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 5)
      DoorPathwayMenus.showTravelerMenu(player, TravelerSequence);
    else player.sendMessage('§cYou must be a Traveler (Sequence 5) to use this!');
    return;
  }
  if (itemId === 'lotm:crystal_ball') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 7)
      DoorPathwayMenus.showCrystalBallMenu(player, AstrologerSequence);
    return;
  }
  if (itemId === 'lotm:spirit_fog_catalyst') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 5) TravelerSequence.useSpiritFog(player);
    return;
  }
  if (itemId === 'lotm:invisible_hand') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 5) {
      if (player.isSneaking) {
        TravelerSequence.useInvisibleHand(player, false);
      } else {
        const grabbed = TravelerSequence.grabbedTargets.get(player.name);
        TravelerSequence.useInvisibleHand(player, !grabbed);
      }
    }
    return;
  }
  if (itemId === 'lotm:secrets_sorcerer_powers') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence === 4)
      DoorPathwayMenus.showSecretsSorcererMenu(player, SecretsSorcererSequence);
    else player.sendMessage('§cYou must be a Secrets Sorcerer (Sequence 4) to use this!');
    return;
  }
  if (itemId === 'lotm:transfiguration_portal') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 4)
      SecretsSorcererSequence.spawnTransfigurationPortal(player);
    else player.sendMessage('§cYou must be a Secrets Sorcerer (Sequence 4) to use this!');
    return;
  }
  if (itemId === 'lotm:prison_pocket') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.DOOR && sequence <= 4) {
      const target = SecretsSorcererSequence.findNearestEntity(player, 10);
      if (target) SecretsSorcererSequence.imprisonEntity(player, target);
      else player.sendMessage('§cNo target found! Look at an entity within 10m.');
    } else {
      player.sendMessage('§cYou must be a Secrets Sorcerer (Sequence 4) to use this!');
    }
    return;
  }

  // ── SEER ──────────────────────────────────────────────────────────────────
  if (itemId === 'lotm:spirit_vision_orb') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.SEER && sequence <= 9)
      SeerSequence.handleAbilityUse(player, 'spirit_vision');
    else player.sendMessage('§cOnly Seer Pathway beyonders can use this!');
    return;
  }
  if (itemId === 'lotm:clown_mask') {
    const { pathway, sequence } = _getPS(player);
    if (pathway !== PathwayManager.PATHWAYS.SEER) { player.sendMessage('§cOnly Seer Pathway beyonders can use this!'); return; }
    if (sequence === 8) {
      const clownModes = ['feint_strike', 'paper_daggers', 'disguise'];
      const selected   = player.getDynamicProperty('lotm:seer_clown_mode') || 'feint_strike';
      if (player.isSneaking) {
        const next = clownModes[(clownModes.indexOf(selected) + 1) % clownModes.length];
        player.setDynamicProperty('lotm:seer_clown_mode', next);
        const labels = { feint_strike: '§e🃏 Feint Strike', paper_daggers: '§f📄 Paper Daggers', disguise: '§8✦ Disguise' };
        player.sendMessage(`§7Mode: ${labels[next]}`);
      } else {
        ClownSequence.handleAbilityUse(player, selected);
      }
    } else if (sequence <= 7) {
      ClownSequence.handleAbilityUse(player, 'paper_daggers');
    }
    return;
  }
  if (itemId === 'lotm:magician_wand') {
    const { pathway, sequence } = _getPS(player);
    if (pathway !== PathwayManager.PATHWAYS.SEER) { player.sendMessage('§cOnly Seer Pathway beyonders can use this!'); return; }
    if (sequence <= 7) {
      const modes   = ['air_bullet','spell_volley','flaming_jump','damage_transfer','water_breathing'];
      const current = player.getDynamicProperty('lotm:seer_wand_mode') || 'spell_volley';
      if (player.isSneaking) {
        const next = modes[(modes.indexOf(current) + 1) % modes.length];
        player.setDynamicProperty('lotm:seer_wand_mode', next);
        const labels = { air_bullet:'§f💨 Air Bullet', spell_volley:'§d✦ Spell Volley', flaming_jump:'§6🔥 Flaming Jump', damage_transfer:'§c⚡ Damage Transfer', water_breathing:'§b🌊 Water Breathing' };
        player.sendMessage(`§7Wand mode: ${labels[next]}`);
      } else {
        MagicianSequence.handleAbilityUse(player, current);
      }
    }
    return;
  }
  if (itemId === 'lotm:paper_knife') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.SEER && sequence <= 8) ClownSequence.usePaperDaggers(player);
    else player.sendMessage('§cOnly Clowns and above can harden paper knives!');
    return;
  }
  if (itemId === 'lotm:paper_weapon_item') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.SEER && sequence <= 7) MagicianSequence.useDrawingPaperWeapon(player);
    else player.sendMessage('§cOnly Magicians can wield paper weapons!');
    return;
  }

  // ── TWILIGHT GIANT ────────────────────────────────────────────────────────
  if (itemId === 'lotm:dawn_item') {
    const { pathway, sequence } = _getPS(player);
    if (pathway !== PathwayManager.PATHWAYS.TWILIGHT_GIANT || sequence > 6) {
      player.sendMessage('§cYou must be a Dawn Paladin (Sequence 6) or lower to use this!');
      return;
    }
    if (player.isSneaking) {
      sequence <= 5 ? TwilightGiantMenus.showGuardianMenu(player, GuardianSequence, DawnPaladinSequence)
                    : TwilightGiantMenus.showDawnPaladinMenu(player, DawnPaladinSequence);
    } else {
      sequence <= 5 ? GuardianSequence.handleAbilityUse(player, DawnPaladinSequence.getSelectedAbility(player))
                    : DawnPaladinSequence.useSelectedAbility(player);
    }
    return;
  }
  if (itemId === 'lotm:demon_hunter_powers') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.TWILIGHT_GIANT && sequence === 4) {
      player.isSneaking ? TwilightGiantMenus.showDemonHunterMenu(player, DemonHunterSequence)
                        : DemonHunterSequence.useSelectedAbility(player);
    } else {
      player.sendMessage('§cYou must be a Demon Hunter (Sequence 4) to use this!');
    }
    return;
  }

  // ── JUSTICIAR ─────────────────────────────────────────────────────────────
  if (itemId === 'lotm:arbiters_seal') {
    if (!_requirePathwayMsg(player, PathwayManager.PATHWAYS.JUSTICIAR)) return;
    ArbiterSequence.useAbility(player, ArbiterSequence.ABILITIES.AUTHORITY_COMMAND);
    return;
  }
  if (itemId === 'lotm:sheriffs_badge') {
    if (!_requirePathwayMsg(player, PathwayManager.PATHWAYS.JUSTICIAR)) return;
    SheriffSequence.useBadge(player, player.isSneaking);
    return;
  }
  if (itemId === 'lotm:interrogators_brand') {
    if (!_requirePathwayMsg(player, PathwayManager.PATHWAYS.JUSTICIAR)) return;
    InterrogatorSequence.useBrand(player, player.isSneaking);
    return;
  }
  if (itemId === 'lotm:judges_gavel') {
    if (!_requirePathwayMsg(player, PathwayManager.PATHWAYS.JUSTICIAR)) return;
    JudgeSequence.useGavel(player, player.isSneaking);
    return;
  }
  if (itemId === 'lotm:paladins_seal') {
    if (!_requirePathwayMsg(player, PathwayManager.PATHWAYS.JUSTICIAR)) return;
    DisciplinaryPaladinSequence.useSeal(player, player.isSneaking);
    return;
  }
  if (itemId === 'lotm:mages_codex') {
    if (!_requirePathwayMsg(player, PathwayManager.PATHWAYS.JUSTICIAR)) return;
    ImperativeMageSequence.useCodex(player, player.isSneaking);
    return;
  }

  // ── SUN ───────────────────────────────────────────────────────────────────
  if (itemId === 'lotm:bard_songs') {
    const { sequence } = _getPS(player);
    if (player.isSneaking) {
      SunPathwayMenus.showBardSongMenu(player);
    } else if (sequence === 8) {
      LightSuppliantSequence.handleAbilityUse(player, BardSequence.getSelectedSong(player));
    } else {
      BardSequence.useSelectedSong(player);
    }
    return;
  }
  if (itemId === 'lotm:solar_orb') {
    const { pathway, sequence } = _getPS(player);
    if (pathway === PathwayManager.PATHWAYS.SUN && sequence === 8) {
      player.isSneaking ? SunPathwayMenus.showSolarOrbMenu(player)
                        : LightSuppliantSequence.useSunshine(player);
    }
    return;
  }

  // ── HANGED MAN ──────────────────────────────────────────────────────────────
  if (itemId === 'lotm:secrets_suppliant_powers') {
    const { pathway, sequence } = _getPS(player);
    if (pathway !== PathwayManager.PATHWAYS.HANGED_MAN) {
      player.sendMessage('§cYou must be on the Hanged Man pathway!');
      return;
    }
    if (sequence > 9 || sequence < 5) {
      player.sendMessage('§cThis item requires Sequence 6–9 of the Hanged Man pathway!');
      return;
    }

    if (player.isSneaking) {
      // Sneak = open full ability menu
      HangedManMenus.showAbilityMenu(player).catch(() => {});
    } else {
      // Normal use = use currently selected ability
      const cls = HangedManMenus._getSequenceClass(sequence);
      if (cls) cls.useSelectedAbility(player);
    }
    return;
  }

  if (itemId === 'lotm:beyonder_soul') {
    const { pathway, sequence } = _getPS(player);
    if (pathway !== PathwayManager.PATHWAYS.HANGED_MAN || sequence > 5) {
      player.sendMessage('§cOnly Shepherds (Sequence 5) can graze Beyonder Souls!');
      player.sendMessage('§7You can trade or hold it for a Shepherd.');
      return;
    }
    if (player.isSneaking) {
      HangedManMenus.showGrazeMenu(player).catch(function() {});
    } else {
      // Non-sneak: show quick info about what's in inventory
      const charFound = ShepherdSequence._findCharacteristicInInventory(player);
      if (charFound) {
        player.sendMessage(`§5Found characteristic: §f${charFound.typeId.replace('lotm:', '').replace(/_/g, ' ')}`);
        player.sendMessage('§7Sneak + use the soul to begin grazing.');
      } else {
        player.sendMessage('§7Beyonder Soul ready. Add a Beyonder Characteristic to your inventory.');
        player.sendMessage('§7Then sneak + use this soul to graze an ability.');
      }
    }
    return;
  }

 // ── HERMIT ──────────────────────────────────────────────────────────────
  if (itemId === 'lotm:mystery_pryer_powers') {
    const { pathway, sequence } = _getPS(player);
    if (pathway !== PathwayManager.PATHWAYS.HERMIT) {
      player.sendMessage('§cOnly Hermit Pathway beyonders can use this!');
      return;
    }
    if (player.isSneaking) {
      HermitPathwayMenus.showMysteryPryerMenu(player);
    } else {
      // Cycle abilities on non-sneak use
      const abilities = MysteryPryerSequence.getAllAbilities();
      const current   = player.getDynamicProperty('lotm:hermit_pryer_mode') || abilities[0].id;
      const idx       = abilities.findIndex(a => a.id === current);
      if (!player.isSneaking) {
        MysteryPryerSequence.handleAbilityUse(player, current);
      }
    }
    return;
  }

  if (itemId === 'lotm:melee_scholar_powers') {
    const { pathway, sequence } = _getPS(player);
    if (pathway !== PathwayManager.PATHWAYS.HERMIT) {
      player.sendMessage('§cOnly Hermit Pathway beyonders can use this!');
      return;
    }
    if (player.isSneaking) {
      HermitPathwayMenus.showMeleeScholarMenu(player);
    } else {
      const current = player.getDynamicProperty('lotm:hermit_scholar_mode') || 'combat_insight';
      MeleeScholarSequence.handleAbilityUse(player, current);
    }
    return;
  }

  if (itemId === 'lotm:warlocks_wand') {
    const { pathway, sequence } = _getPS(player);
    if (pathway !== PathwayManager.PATHWAYS.HERMIT || sequence > 7) {
      player.sendMessage('§cOnly Warlocks and above can use this!');
      return;
    }

    if (player.isSneaking) {
      // Sneak + right-click: open menu to select spell
      WarlockMenus.showSpellMenu(player);
    } else {
      // Right-click: cast currently selected spell
      WarlockSequence.castSelectedSpell(player);
    }
    return;
  }

  if (itemId === 'lotm:spell_pouch') {
    const { pathway } = _getPS(player);
    if (pathway !== PathwayManager.PATHWAYS.HERMIT) {
      player.sendMessage('§cOnly Hermit Pathway beyonders can use the Spell Pouch!');
      return;
    }
    WarlockSequence.openSpellPouch(player);
    return;
  }

  const scrollIds = [
    'lotm:scroll_burning', 'lotm:scroll_sun', 'lotm:scroll_healing',
    'lotm:scroll_freeze', 'lotm:scroll_storm', 'lotm:scroll_force_field',
    'lotm:scroll_armour', 'lotm:scroll_raise_earth'
  ];
  if (scrollIds.includes(itemId)) {
    const { pathway, sequence } = _getPS(player);
    if (pathway !== PathwayManager.PATHWAYS.HERMIT || sequence > 6) {
      player.sendMessage('§cOnly Scroll Professors and above can use this!');
      return;
    }
    if (player.isSneaking) {
      ScrollProfessorMenus.showScrollMenu(player);
    } else {
      // Map item ID to scroll ID
      const scrollId = itemId.replace('lotm:', '');
      ScrollProfessorSequence.castScroll(player, scrollId);
    }
    return;
  }


  // ── WEAPONS ───────────────────────────────────────────────────────────────
  if (itemId === 'lotm:revolver') {
    RevolverSystem.fireRevolver(player);
    return;
  }
});

// ============================================================================
// ENTITY HURT
// ============================================================================
world.afterEvents.entityHurt.subscribe((event) => {
  const player = event.hurtEntity;
  if (!player || player.typeId !== 'minecraft:player') return;

  const pathway  = PathwayManager.getPathway(player);
  const sequence = PathwayManager.getSequence(player);
  const attacker = event.damageSource?.damagingEntity;

  // Seer / Magician — Damage Transfer
  if (pathway === PathwayManager.PATHWAYS.SEER && sequence <= 7) {
    if (MagicianSequence.transferReady.get(player.name)) {
      const originalDamage = event.damage;
      const reducedPortion = Math.floor(originalDamage * MagicianSequence.TRANSFER_DAMAGE_REDUCTION);
      if (reducedPortion > 0) {
        try {
          const health = player.getComponent('minecraft:health');
          if (health) health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + reducedPortion));
        } catch (_) {}
        MagicianSequence.handleIncomingDamage(player, originalDamage);
      }
    }
  }

  // Justiciar / Judge — Judgment Gaze
  if (pathway === PathwayManager.PATHWAYS.JUSTICIAR && sequence <= 6 && attacker) {
    JudgeSequence.onHurt(player, attacker);
  }
});


// ============================================================================
// ENTITY die
// ============================================================================
world.afterEvents.entityDie.subscribe((event) => {
  if (event.deadEntity?.typeId === 'lotm:rampager') {
    RampagerSystem.cleanup(event.deadEntity.id);
  }
});

// ============================================================================
// ENTITY HIT ENTITY
// ============================================================================
world.afterEvents.entityHitEntity.subscribe((event) => {
  // Declare ALL variables at the top — no duplicate declarations below
  const attacker = event.damagingEntity;
  const victim   = event.hitEntity;

  if (!attacker || attacker.typeId !== 'minecraft:player') return;

  const pathway  = PathwayManager.getPathway(attacker);
  const sequence = PathwayManager.getSequence(attacker);

  // Get held item once
  let held = null;
  try {
    const inv = attacker.getComponent('minecraft:inventory');
    held = inv?.container?.getItem(attacker.selectedSlotIndex) ?? null;
  } catch (_) {}

  // ── Twilight Giant — Pugilist+ weakness debuff ────────────────────────────
  if (pathway === PathwayManager.PATHWAYS.TWILIGHT_GIANT && sequence <= 8) {
    const weaknessLevel = sequence === 8 ? 0 : sequence === 7 ? 1 : sequence <= 6 ? 2 : 0;
    try { victim.addEffect('weakness', 100, { amplifier: weaknessLevel, showParticles: true }); } catch (_) {}
  }

  // ── Twilight Giant — Demon Hunter ointment ────────────────────────────────
  if (pathway === PathwayManager.PATHWAYS.TWILIGHT_GIANT && sequence === 4) {
    const ointment = DemonHunterSequence.activeOintments.get(attacker.name);
    if (ointment) {
      try {
        switch (ointment.type) {
          case DemonHunterSequence.OINTMENT_TYPES.LIGHTNING:
            attacker.dimension.spawnEntity('minecraft:lightning_bolt', victim.location); break;
          case DemonHunterSequence.OINTMENT_TYPES.FREEZING:
            victim.addEffect('slowness', 100, { amplifier: 5 });
            victim.addEffect('mining_fatigue', 100, { amplifier: 3 }); break;
          case DemonHunterSequence.OINTMENT_TYPES.PURIFICATION:
            victim.addEffect('weakness', 100, { amplifier: 2 });
            attacker.addEffect('regeneration', 60, { amplifier: 1 }); break;
          case DemonHunterSequence.OINTMENT_TYPES.BURNING:
            victim.setOnFire(10, true); break;
          case DemonHunterSequence.OINTMENT_TYPES.DECAY:
            victim.addEffect('wither', 100, { amplifier: 2 });
            victim.addEffect('poison', 100, { amplifier: 1 }); break;
          case DemonHunterSequence.OINTMENT_TYPES.EXORCISM:
            if (victim.typeId.includes('zombie') || victim.typeId.includes('skeleton') || victim.typeId.includes('wither'))
              victim.applyDamage(20); break;
        }
      } catch (_) {}
    }
  }

  // ── Justiciar — melee proficiency bonuses ─────────────────────────────────
  if (pathway === PathwayManager.PATHWAYS.JUSTICIAR && sequence <= 8 && held) {
    try {
      const sheriffBonus = SheriffSequence.getMeleeProficiencyBonus(attacker, held.typeId);
      if (sheriffBonus > 0) victim.applyDamage(sheriffBonus);
    } catch (_) {}

    if (sequence <= 7) {
      try {
        const lashBonus = InterrogatorSequence.onMeleeHit(attacker, victim);
        if (lashBonus > 0) victim.applyDamage(lashBonus);
        const interrBonus = InterrogatorSequence.getMeleeProficiencyBonus(attacker, held.typeId);
        if (interrBonus > 0) victim.applyDamage(interrBonus);
      } catch (_) {}
    }
  }

   // ── Death — bonus vs undead ────────────────────────────

   if (pathway === PathwayManager.PATHWAYS.DEATH) {
    if (sequence === 9) {
      CorpseCollectorSequence.applySmiteBonus?.(attacker, victim) ??
        // inline fallback for seq 9 which doesn't have the method yet:
        (CorpseCollectorSequence.isUndeadCreature(victim) &&
          (() => { try { victim.applyDamage(4); } catch(e) {} })());
    } else if (sequence <= 8) {
      GravediggerSequence.applySmiteBonus(attacker, victim);
    }
  }

  // ── Knife hit effects ─────────────────────────────────────────────────────
  if (held?.typeId === 'lotm:knife') {
    try { victim.addEffect('slowness', 10, { amplifier: 0, showParticles: false }); } catch (_) {}
    try { victim.dimension.spawnParticle('minecraft:critical_hit_emitter', { x: victim.location.x, y: victim.location.y + 1, z: victim.location.z }); } catch (_) {}
  }

  // ── Short sword hit effects ───────────────────────────────────────────────
  if (held?.typeId === 'lotm:short_sword') {
    try {
      const dir = attacker.getViewDirection();
      victim.applyKnockback(dir.x, dir.z, 0.6, 0.3);
    } catch (_) {}
  }

    // ── Shadow sword Hanged Man ───────────────────────────────────────────────
  if (held?.typeId === 'lotm:shadow_sword') {
    const pathway = PathwayManager.getPathway(attacker);
    const sequence = PathwayManager.getSequence(attacker);
    if (pathway === PathwayManager.PATHWAYS.HANGED_MAN && sequence <= 7) {
      ShadowAsceticSequence.onShadowSwordHit(attacker, victim);
    }
  }

  // Rose Bishop sated damage bonus — add after existing ointment checks:
  if (held) {
    const { pathway: rp, sequence: rs } = _getPS(attacker);
    if (rp === PathwayManager.PATHWAYS.HANGED_MAN && rs <= 6) {
      const hunger = RoseBishopSequence.getFleshHunger(attacker);
      if (hunger >= 80) {
        // Sated bonus — extra corrosive damage
        try { victim.applyDamage(RoseBishopSequence.SATED_BONUS_DAMAGE); } catch (e) {}
        // Occasional flesh tear visual
        if (Math.random() < 0.2) {
          try {
            victim.dimension.spawnParticle('minecraft:critical_hit_emitter', {
              x: victim.location.x, y: victim.location.y + 1, z: victim.location.z
            });
          } catch (e) {}
        }
      }
    }
  }
});

// ============================================================================
// HELPERS
// ============================================================================

/** Get pathway and sequence for a player in one call */
function _getPS(player) {
  return { pathway: PathwayManager.getPathway(player), sequence: PathwayManager.getSequence(player) };
}

/** Check pathway match, give item back and return false if wrong */
function _requirePathway(player, pathway, required, itemId) {
  if (pathway === required) return true;
  player.sendMessage(`§cYou must be on the ${required} pathway!`);
  try { player.runCommand(`give @s ${itemId} 1`); } catch (_) {}
  return false;
}

/** Check sequence match, give item back and return false if wrong */
function _requireSequence(player, sequence, required, itemId) {
  if (sequence === required) return true;
  player.sendMessage(`§cYou must be Sequence ${required} to advance!`);
  try { player.runCommand(`give @s ${itemId} 1`); } catch (_) {}
  return false;
}

/** Quick pathway check for item use (no give-back needed) */
function _requirePathwayMsg(player, required) {
  if (PathwayManager.getPathway(player) === required) return true;
  player.sendMessage(`§cOnly a ${required} beyonder can use this!`);
  return false;
}

// ── Nightmare helpers ──────────────────────────────────────────────────────
function cycleNightmareAbility(player) {
  const abilities = Object.values(NightmareSequence.ABILITIES);
  const current   = selectedNightmareAbilities.get(player.name) || abilities[0];
  const next      = abilities[(abilities.indexOf(current) + 1) % abilities.length];
  selectedNightmareAbilities.set(player.name, next);

  // Show NAME and cost, not the full description
  const names = {
    'nightmare_state':  '§5Nightmare State §8| §b50 Spirit',
    'dream_invasion':   '§bDream Invasion §8| §b40 Spirit',
    'nightmare_limbs':  '§cNightmare Limbs §8| §b30 Spirit'
  };
  player.sendMessage(`§7Selected: ${names[next] || next}`);
}

// ── Soul Assurer helpers ───────────────────────────────────────────────────
function cycleSoulAssurerAbility(player) {
  const abilities = SoulAssurerSequence.getAllAbilities();
  const current   = selectedSoulAssurerAbilities.get(player.name) || abilities[0].id;
  const idx       = abilities.findIndex(a => a.id === current);
  const next      = abilities[(idx + 1) % abilities.length];
  selectedSoulAssurerAbilities.set(player.name, next.id);
  player.sendMessage(`§aSelected: ${next.name}`);
}
function useSoulAssurerAbility(player) {
  SoulAssurerSequence.handleAbilityUse(player, selectedSoulAssurerAbilities.get(player.name) || SoulAssurerSequence.ABILITIES.REQUIEM);
}

// ── Demon Hunter helpers ───────────────────────────────────────────────────
function cycleDemonHunterAbility(player) {
  const abilities = DemonHunterSequence.getAllAbilities();
  const current   = selectedDemonHunterAbilities.get(player.name) || abilities[0].id;
  const idx       = abilities.findIndex(a => a.id === current);
  const next      = abilities[(idx + 1) % abilities.length];
  selectedDemonHunterAbilities.set(player.name, next.id);
  player.sendMessage(`§aSelected: ${next.name}`);
}
function useDemonHunterAbility(player) {
  DemonHunterSequence.handleAbilityUse(player, selectedDemonHunterAbilities.get(player.name) || DemonHunterSequence.ABILITIES.EYE_OF_DEMON_HUNTING);
}

// ── Secrets Sorcerer helpers ───────────────────────────────────────────────
function cycleSecretsSorcererAbility(player) {
  const abilities = SecretsSorcererSequence.getAllAbilities();
  const current   = selectedSecretsSorcererAbilities.get(player.name) || abilities[0].id;
  const idx       = abilities.findIndex(a => a.id === current);
  const next      = abilities[(idx + 1) % abilities.length];
  selectedSecretsSorcererAbilities.set(player.name, next.id);
  player.sendMessage(`§aSelected: ${next.name}`);
}
function useSecretsSorcererAbility(player) {
  SecretsSorcererSequence.handleAbilityUse(player, selectedSecretsSorcererAbilities.get(player.name) || SecretsSorcererSequence.ABILITIES.CREATE_POCKET);
}

// Start the mod
initialize();
