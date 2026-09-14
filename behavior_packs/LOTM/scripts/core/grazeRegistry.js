// ============================================================================
// GRAZE REGISTRY — shared ability catalog + sequence-class dispatch
// ============================================================================
// Extracted from shepherd.js so more than one "graze"-style consumer (Hanged
// Man's Shepherd, Creeping Hunger) can draw from the same catalog instead of
// duplicating it. This is static config data describing which abilities exist
// to graze from which characteristic items — not player state. Widening this
// catalog (more pathways/tiers) is a separate, standalone task.
//
// `tickRefs` was the original mechanism for abilities whose real effect
// isn't fully synchronous inside their `abilityRef` call (state set up in a
// Map that a separate method reads over time). As of 2026-08-18 every
// pathway has been migrated off it — every sequence class now has its own
// `tickAbilityState`, called unconditionally for every player from main.js,
// so grazers get the same ongoing ticking as real members automatically.
// Red Priest never needed it at all (its spells apply synchronously on
// cast — see `resetCooldownCall` below). No registry entry below sets
// `tickRefs` anymore; `tickGrazedAbility`'s handling of it was removed in
// the same pass. Not documenting the field shape here anymore since nothing
// uses it — if a future ability genuinely needs mid-flight state a grazer
// can't reach via `tickAbilityState`, design it fresh rather than reviving
// this pattern.
//
// `resetCooldownRefs` (optional, array of {class, mapProperty}): abilities
// whose target method has its OWN internal cooldown Map (e.g.
// LightSuppliantSequence.sunshineCooldowns), set to that class's own — usually
// much longer — cooldown duration on every real use. Grazers are meant to be
// gated by the grazer's own short flat cooldown instead (spirit pool size is
// the intended differentiator, not cooldown length — see the Creeping Hunger
// design). Cleared immediately after a successful dispatch so only the
// grazer's own cooldown applies.
// ============================================================================
import { PathwayManager } from './pathwayManager.js';
import { SpiritSystem } from './spiritSystem.js';

// Grazed/borrowed abilities cost this fraction of what a real pathway member
// pays — spirit pool SIZE (grown via Spirit Vial etc.) is still the primary
// differentiator, this is a secondary discount on top. Applies uniformly to
// both Shepherd and Creeping Hunger (user's explicit choice, 2026-08-06).
// Shepherd previously had a dead GRAZED_ABILITY_SPIRIT_MULTIPLIER = 0.6
// constant that was never actually wired up — this replaces/fulfills it in
// one shared place instead of two separate half-implementations.
const GRAZED_SPIRIT_COST_MULTIPLIER = 0.6;

export const GRAZE_REGISTRY = {

  // ── DARKNESS pathway ──────────────────────────────────────────────────
  'lotm:darkness_characteristic_seq9': [
    {
      id: 'graze_sleepless_nightvision',
      name: '§5Night Vision',
      description: 'Permanent night vision',
      pathway: 'darkness', sequenceNumber: 9, isPassive: true,
      passiveEffects: [{ effect: 'night_vision', amplifier: 0 }]
    },
    {
      id: 'graze_sleepless_speed',
      name: '§5Enhanced Speed',
      description: 'Speed I permanent',
      pathway: 'darkness', sequenceNumber: 9, isPassive: true,
      passiveEffects: [{ effect: 'speed', amplifier: 0 }]
    }
  ],
  'lotm:darkness_characteristic_seq8': [
    {
      id: 'graze_poet_song_fear',
      name: '§5Song of Fear',
      description: 'Make enemies flee',
      pathway: 'darkness', sequenceNumber: 8, isPassive: false,
      // MidnightPoetSequence.tickAbilityState now runs unconditionally for
      // every player from main.js — no tickRefs needed here anymore.
      abilityRef: { class: 'MidnightPoetSequence', method: 'useSongOfFear' }
    },
    {
      id: 'graze_poet_song_pacify',
      name: '§5Song of Pacification',
      description: 'Calm hostile mobs',
      pathway: 'darkness', sequenceNumber: 8, isPassive: false,
      abilityRef: { class: 'MidnightPoetSequence', method: 'useSongOfPacification' }
    },
    {
      id: 'graze_poet_song_cleansing',
      name: '§aSong of Cleansing',
      description: 'Remove debuffs from nearby allies',
      pathway: 'darkness', sequenceNumber: 8, isPassive: false,
      abilityRef: { class: 'MidnightPoetSequence', method: 'useSongOfCleansing' }
    }
  ],
  'lotm:darkness_characteristic_seq7': [
    {
      id: 'graze_nightmare_state',
      name: '§5Nightmare State',
      description: 'Become incorporeal (20s)',
      pathway: 'darkness', sequenceNumber: 7, isPassive: false,
      // NightmareSequence.tickAbilityState now runs unconditionally for
      // every player from main.js — no tickRefs needed here anymore.
      abilityRef: { class: 'NightmareSequence', method: 'useNightmareState' },
      // nightmareCooldowns only gets set once the 20s active duration ends
      // (inside processNightmareState), not at cast time — resetCooldownRefs
      // is re-applied every tick (not just once after dispatch) specifically
      // to catch delayed cooldown-setting like this.
      resetCooldownRefs: [{ class: 'NightmareSequence', mapProperty: 'nightmareCooldowns' }]
    },
    {
      id: 'graze_nightmare_limbs',
      name: '§5Nightmare Limbs',
      description: 'Dark tentacles attack nearby',
      pathway: 'darkness', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'NightmareSequence', method: 'useNightmareLimbs' },
      resetCooldownRefs: [{ class: 'NightmareSequence', mapProperty: 'nightmareLimbsCooldowns' }]
    },
    {
      id: 'graze_dream_invasion',
      name: '§5Dream Invasion',
      description: 'Put targets to sleep',
      pathway: 'darkness', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'NightmareSequence', method: 'useDreamInvasion' },
      resetCooldownRefs: [{ class: 'NightmareSequence', mapProperty: 'dreamInvasionCooldowns' }]
    }
  ],
  'lotm:darkness_characteristic_seq6': [
    {
      id: 'graze_soul_assurer_requiem',
      name: '§b Requiem',
      description: 'Suppress spirit bodies of targets',
      pathway: 'darkness', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'SoulAssurerSequence', method: 'useRequiem' },
      // SoulAssurerSequence.tickAbilityState now runs unconditionally for
      // every player from main.js — no tickRefs needed here anymore.
      // requiemCooldowns is only set once the active duration ends (inside
      // processRequiem), same delayed-cooldown shape as Nightmare State.
      resetCooldownRefs: [{ class: 'SoulAssurerSequence', mapProperty: 'requiemCooldowns' }]
    },
    {
      id: 'graze_soul_assurer_agitate',
      name: '§b Agitate',
      description: 'Heighten enemy aggression',
      pathway: 'darkness', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'SoulAssurerSequence', method: 'useAgitate' },
      resetCooldownRefs: [{ class: 'SoulAssurerSequence', mapProperty: 'agitateCooldowns' }]
    },
    {
      id: 'graze_soul_assurer_dream_invasion',
      name: '§5Dream Invasion §7(Enhanced)',
      description: 'Put targets to sleep — 150m range, 12 targets',
      pathway: 'darkness', sequenceNumber: 6, isPassive: false,
      // Soul Assurer's own override of Dream Invasion (more range/targets,
      // less spirit cost) — reuses NightmareSequence's own tracking Maps
      // directly (see soul_assurer.js), so NightmareSequence.tickAbilityState
      // (already unconditional) covers ticking this too, no tickRefs needed.
      abilityRef: { class: 'SoulAssurerSequence', method: 'useDreamInvasion' },
      resetCooldownRefs: [{ class: 'NightmareSequence', mapProperty: 'dreamInvasionCooldowns' }]
    }
  ],

  // ── TWILIGHT GIANT pathway ────────────────────────────────────────────
  'lotm:twilight_giant_characteristic_seq9': [
    {
      id: 'graze_warrior_strength',
      name: '§cWarrior Strength',
      description: 'Strength II permanent',
      pathway: 'twilight_giant', sequenceNumber: 9, isPassive: true,
      passiveEffects: [{ effect: 'strength', amplifier: 1 }]
    }
  ],
  'lotm:twilight_giant_characteristic_seq8': [
    {
      id: 'graze_pugilist_resist',
      name: '§cPugilist Resistance',
      description: 'Resistance I + Absorption I permanent',
      pathway: 'twilight_giant', sequenceNumber: 8, isPassive: true,
      passiveEffects: [
        { effect: 'resistance', amplifier: 0 },
        { effect: 'absorption', amplifier: 0 }
      ]
    }
  ],
  'lotm:twilight_giant_characteristic_seq7': [
    {
      id: 'graze_weapon_master_haste',
      name: '§cWeapon Master Haste',
      description: 'Haste I permanent',
      pathway: 'twilight_giant', sequenceNumber: 7, isPassive: true,
      passiveEffects: [{ effect: 'haste', amplifier: 0 }]
    }
  ],
  'lotm:twilight_giant_characteristic_seq6': [
    {
      id: 'graze_dawn_light',
      name: '§6Light of Dawn',
      description: 'Consecrate holy ground',
      pathway: 'twilight_giant', sequenceNumber: 6, isPassive: false,
      // DawnPaladinSequence.tickAbilityState now runs unconditionally for
      // every player from main.js — no tickRefs needed here anymore.
      abilityRef: { class: 'DawnPaladinSequence', method: 'useLightOfDawn' },
      // lightCooldowns is set synchronously at cast time (unlike most of
      // this pathway's other cooldowns) — reset works fine either way now
      // that it's reapplied every tick.
      resetCooldownRefs: [{ class: 'DawnPaladinSequence', mapProperty: 'lightCooldowns' }]
    },
    {
      id: 'graze_dawn_sword_of_light',
      name: '§6Sword of Light',
      description: 'Channel divine power into weapon',
      pathway: 'twilight_giant', sequenceNumber: 6, isPassive: false,
      // Was 'useSwordOfLight' — that method doesn't exist on DawnPaladinSequence.
      // CORRECTION (2026-08-06, confirmed by user testing): grants the real
      // lotm:dawn_sword item, and handleDawnSwordUse itself (main.js
      // right-click handler) has no gate — but the two abilities it cycles
      // between, Hurricane of Light and Air Slash, are invoked DIRECTLY from
      // that handler, bypassing dispatchGrazedAbility's hasSequence/
      // PathwayManager spoof entirely. Hurricane of Light has its own
      // internal hasSequence(player) check, which genuinely fails for a
      // grazer using the item this way — Air Slash has no such check so it
      // works. User explicitly chose to leave this as-is for now rather
      // than redesign the dispatch path for it.
      abilityRef: { class: 'DawnPaladinSequence', method: 'useDawnSword' },
      // dawnSwordCooldowns is only set once the 60s active duration ends
      // (inside _processDawnSword) — resetCooldownRefs re-applies every
      // tick (not just once after dispatch) specifically to catch that.
      resetCooldownRefs: [{ class: 'DawnPaladinSequence', mapProperty: 'dawnSwordCooldowns' }]
    },
    {
      id: 'graze_dawn_armour',
      name: '§6Dawn Armour',
      description: 'Summon a full set of blessed armour',
      pathway: 'twilight_giant', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'DawnPaladinSequence', method: 'useDawnArmour' },
      resetCooldownRefs: [{ class: 'DawnPaladinSequence', mapProperty: 'dawnArmourCooldowns' }]
    }
  ],
  'lotm:twilight_giant_characteristic_seq5': [
    {
      id: 'graze_guardian_protection',
      name: '§6Guardian Protection',
      description: 'Dome of divine protection',
      pathway: 'twilight_giant', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'GuardianSequence', method: 'useProtection' },
      // protectionCooldowns is only set once the active duration ends
      // (inside processProtection), same delayed-cooldown shape as
      // Nightmare State back in Darkness.
      resetCooldownRefs: [{ class: 'GuardianSequence', mapProperty: 'protectionCooldowns' }]
    },
    {
      id: 'graze_guardian_light_of_dawn',
      name: '§6Light of Dawn §7(Enhanced)',
      description: 'Consecrate holy ground — 22m range, higher damage',
      pathway: 'twilight_giant', sequenceNumber: 5, isPassive: false,
      // Guardian's own override — separate tracking Maps from Dawn
      // Paladin's version of the same-named ability (not shared, unlike
      // Dream Invasion in Darkness).
      abilityRef: { class: 'GuardianSequence', method: 'useLightOfDawn' },
      resetCooldownRefs: [{ class: 'GuardianSequence', mapProperty: 'lightCooldowns' }]
    },
    {
      id: 'graze_guardian_dawn_sword',
      name: '§6Sword of Light',
      description: 'Channel divine power into weapon',
      pathway: 'twilight_giant', sequenceNumber: 5, isPassive: false,
      // Guardian inherits Dawn Paladin's real sword item/ability directly —
      // matches Guardian's own getAllAbilities() including it.
      abilityRef: { class: 'DawnPaladinSequence', method: 'useDawnSword' },
      resetCooldownRefs: [{ class: 'DawnPaladinSequence', mapProperty: 'dawnSwordCooldowns' }]
    },
    {
      id: 'graze_guardian_dawn_armour',
      name: '§6Dawn Armour',
      description: 'Summon a full set of blessed armour',
      pathway: 'twilight_giant', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'DawnPaladinSequence', method: 'useDawnArmour' },
      resetCooldownRefs: [{ class: 'DawnPaladinSequence', mapProperty: 'dawnArmourCooldowns' }]
    }
  ],
  'lotm:twilight_giant_characteristic_seq4': [
    {
      id: 'graze_demon_hunter_eye',
      name: '§2Eye of Demon Hunting',
      description: 'Analyse and reveal nearby targets',
      pathway: 'twilight_giant', sequenceNumber: 4, isPassive: false,
      abilityRef: { class: 'DemonHunterSequence', method: 'useEyeOfDemonHunting' },
      resetCooldownRefs: [{ class: 'DemonHunterSequence', mapProperty: 'eyeCooldowns' }]
    },
    {
      id: 'graze_demon_hunter_protection',
      name: '§6Anchored Protection',
      description: 'Solid anchored shield of divine protection',
      pathway: 'twilight_giant', sequenceNumber: 4, isPassive: false,
      abilityRef: { class: 'DemonHunterSequence', method: 'useAnchoredProtection' },
      resetCooldownRefs: [{ class: 'DemonHunterSequence', mapProperty: 'protectionCooldowns' }]
    }
    // Ointments (6 variants) deliberately not registered — a weapon-buff
    // consumable sub-system, not clearly meant as individual top-level
    // graze picks; revisit if asked.
  ],

  // ── DOOR pathway ──────────────────────────────────────────────────────
  // Excluded on purpose (2026-08-08, updated same day per user correction):
  //  - Trickmaster's Flashbang specifically — Burning/Lightning/Freeze are
  //    confirmed working real abilities (each has its own item) and are
  //    graze-exposed below; Flashbang stays real-pathway-only.
  //  - Scribe's Record/View Recordings/Use Recording — targets another
  //    PLAYER directly and never touches GRAZE_REGISTRY/characteristic
  //    items at all, so it doesn't fit the graze model any other ability
  //    here uses. No seq6 entry below for this reason (same convention as
  //    other pathways' tiers with nothing to offer).
  //  - Astrologer's Peek Door — untested/unconfirmed working, pulled until
  //    verified.
  'lotm:door_characteristic_seq9': [
    {
      id: 'graze_apprentice_door',
      name: '§5Door Opening',
      description: 'Phase through a wall into the cavity beyond',
      pathway: 'door', sequenceNumber: 9, isPassive: false,
      // ApprenticeSequence.tickAbilityState now runs unconditionally for
      // every player from main.js — ticks teleportCooldowns. Re-enabled
      // 2026-08-08 (was previously a commented-out no-op check).
      abilityRef: { class: 'ApprenticeSequence', method: 'useDoorOpening' },
      resetCooldownRefs: [{ class: 'ApprenticeSequence', mapProperty: 'teleportCooldowns' }]
    }
  ],
  'lotm:door_characteristic_seq8': [
    {
      id: 'graze_trickmaster_burning',
      name: '§6Burning',
      description: 'Launch a bolt of fire that ignites the target',
      pathway: 'door', sequenceNumber: 8, isPassive: false,
      // No cooldown map exists for this ability — spirit cost is its only
      // gate, same as Electric Shock/Freeze below.
      abilityRef: { class: 'TrickmasterSequence', method: 'useBurning' }
    },
    {
      id: 'graze_trickmaster_electric_shock',
      name: '§eElectric Shock',
      // 2026-09-02: replaced the old ranged "Lightning Strike" (which never
      // matched either source mod) with the real ability — a free toggle;
      // while on, the grazer's own melee hits shock+stun via onMeleeHit,
      // same as a real Trickmaster (see main.js entityHitEntity).
      description: 'Toggle melee shock — attacks stun and cost spirit while active',
      pathway: 'door', sequenceNumber: 8, isPassive: false,
      abilityRef: { class: 'TrickmasterSequence', method: 'useElectricShock' }
    },
    {
      id: 'graze_trickmaster_freeze',
      name: '§bFreeze',
      description: 'Ice ray or frost aura (toggle mode via Trickmaster\'s own menu)',
      pathway: 'door', sequenceNumber: 8, isPassive: false,
      // useFreeze reads freezeMode (defaults to 'ray' if a grazer never
      // set it) — self-contained, no args needed.
      abilityRef: { class: 'TrickmasterSequence', method: 'useFreeze' }
    },
    {
      id: 'graze_trickmaster_wind_push',
      name: '§aWind: Push',
      description: 'Blast nearby enemies away in a cone in front of you',
      pathway: 'door', sequenceNumber: 8, isPassive: false,
      abilityRef: { class: 'TrickmasterSequence', method: 'useWindPush' }
    },
    {
      id: 'graze_trickmaster_wind_pull',
      name: '§aWind: Pull',
      description: 'Pull nearby enemies toward you in a cone in front of you',
      pathway: 'door', sequenceNumber: 8, isPassive: false,
      abilityRef: { class: 'TrickmasterSequence', method: 'useWindPull' }
    },
    {
      id: 'graze_trickmaster_tumble',
      name: '§dTumble',
      // 2026-09-02: the real "Trick: Tumble" — an AoE trip debuff on nearby
      // enemies, not the sprint-triggered self-dash (that's Quick Step,
      // an ambient passive perk, never graze-exposed).
      description: 'Trip and root every nearby enemy',
      pathway: 'door', sequenceNumber: 8, isPassive: false,
      abilityRef: { class: 'TrickmasterSequence', method: 'useTumble' }
    }
  ],
  'lotm:door_characteristic_seq7': [
    // Crystal Ball Scrying shares ONE cooldown regardless of target type
    // (matches real gameplay — picking a different structure doesn't grant
    // a separate cooldown), so every variant below resets the same map.
    // A curated subset of the 11 real SCRYABLE_TARGETS, not all of them —
    // the graze system has no per-invocation parameter picker the way the
    // real Crystal Ball menu does, so each target needs its own entry;
    // registering all 11 felt like more UI clutter than value for a
    // scrying ability specifically.
    {
      id: 'graze_astrologer_scry_village',
      name: '§5Crystal Ball: Village',
      description: 'Scry for the nearest village',
      pathway: 'door', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'AstrologerSequence', method: 'useCrystalBallScrying', args: ['village'] },
      resetCooldownRefs: [{ class: 'AstrologerSequence', mapProperty: 'crystalBallCooldowns' }]
    },
    {
      id: 'graze_astrologer_scry_stronghold',
      name: '§5Crystal Ball: Stronghold',
      description: 'Scry for the nearest stronghold',
      pathway: 'door', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'AstrologerSequence', method: 'useCrystalBallScrying', args: ['stronghold'] },
      resetCooldownRefs: [{ class: 'AstrologerSequence', mapProperty: 'crystalBallCooldowns' }]
    },
    {
      id: 'graze_astrologer_scry_monument',
      name: '§5Crystal Ball: Monument',
      description: 'Scry for the nearest ocean monument',
      pathway: 'door', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'AstrologerSequence', method: 'useCrystalBallScrying', args: ['monument'] },
      resetCooldownRefs: [{ class: 'AstrologerSequence', mapProperty: 'crystalBallCooldowns' }]
    },
    {
      id: 'graze_astrologer_scry_fortress',
      name: '§5Crystal Ball: Fortress',
      description: 'Scry for the nearest nether fortress',
      pathway: 'door', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'AstrologerSequence', method: 'useCrystalBallScrying', args: ['fortress'] },
      resetCooldownRefs: [{ class: 'AstrologerSequence', mapProperty: 'crystalBallCooldowns' }]
    },
    {
      id: 'graze_astrologer_scry_ruined_portal',
      name: '§5Crystal Ball: Ruined Portal',
      description: 'Scry for the nearest ruined portal',
      pathway: 'door', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'AstrologerSequence', method: 'useCrystalBallScrying', args: ['ruinedportal'] },
      resetCooldownRefs: [{ class: 'AstrologerSequence', mapProperty: 'crystalBallCooldowns' }]
    },
    {
      id: 'graze_astrologer_door',
      name: '§5Enhanced Door Opening',
      description: 'Phase through thicker walls (up to 10 blocks)',
      pathway: 'door', sequenceNumber: 7, isPassive: false,
      // false = self only, not the double-cost "bring others" variant.
      // No cooldown map exists for this version in the real ability either.
      abilityRef: { class: 'AstrologerSequence', method: 'useDoorOpening', args: [false] }
    }
  ],
  'lotm:door_characteristic_seq5': [
    {
      id: 'graze_traveler_log',
      name: '§5Traveler\'s Log',
      description: 'Save a location and teleport back to it later (full menu)',
      pathway: 'door', sequenceNumber: 5, isPassive: false,
      // Opens an interactive menu instead of firing a single effect — see
      // showGrazedTravelerMenu in door_pathway_menus.js, which reuses the
      // real Traveler's Log sub-menus via a shim (dataClass below resolves
      // to TravelerSequence, passed as that shim's data source). Place
      // Door / Manage Portals are deliberately not offered in this version.
      menuRef: { class: 'DoorPathwayMenus', method: 'showGrazedTravelerMenu', dataClass: 'TravelerSequence' }
    },
    {
      id: 'graze_traveler_blink',
      name: '§bBlink',
      description: 'Short-range teleport forward',
      pathway: 'door', sequenceNumber: 5, isPassive: false,
      // TravelerSequence.tickAbilityState now runs unconditionally for
      // every player from main.js — ticks blinkCooldowns.
      abilityRef: { class: 'TravelerSequence', method: 'useBlink' },
      resetCooldownRefs: [{ class: 'TravelerSequence', mapProperty: 'blinkCooldowns' }]
    },
    {
      id: 'graze_traveler_invisible_hand',
      name: '§dInvisible Hand',
      description: 'Grab and move a target at range (toggle)',
      pathway: 'door', sequenceNumber: 5, isPassive: false,
      // Real useInvisibleHand(player, activate) takes an explicit boolean
      // set by the menu's grab/release buttons — a grazer has no way to
      // supply that, so this points at the self-toggling wrapper instead
      // (see useInvisibleHandToggle in traveler.js). No cooldown map exists
      // for this ability.
      abilityRef: { class: 'TravelerSequence', method: 'useInvisibleHandToggle' }
    },
    {
      id: 'graze_traveler_spirit_fog',
      name: '§5Spirit World Fog',
      description: 'Summon mystical fog that slows and weakens enemies',
      pathway: 'door', sequenceNumber: 5, isPassive: false,
      // Renamed from graze_traveler_portal (was misleadingly named after
      // this ability's real ID/method, useSpiritFog, not an actual portal)
      // and dropped the old tickRefs — Spirit Fog's ongoing processing now
      // ticks unconditionally via TravelerSequence.tickAbilityState.
      abilityRef: { class: 'TravelerSequence', method: 'useSpiritFog' },
      resetCooldownRefs: [{ class: 'TravelerSequence', mapProperty: 'fogCooldowns' }]
    }
  ],
  'lotm:door_characteristic_seq4': [
    // graze_sorcerer_create_pocket/enter_pocket/exit_pocket removed
    // 2026-08-08 — user tested and found Pocket Dimension feels broken
    // without its real menu (showSecretsSorcererMenu gives context/
    // feedback a bare abilityRef call doesn't). Could revisit with a
    // menuRef-based version later, same pattern as graze_traveler_log.
    //
    // graze_sorcerer_imprison removed 2026-08-08 — user imprisoned a mob
    // via graze and it never returned. Root cause found and fixed:
    // processActivePrisonPockets's mob-release branch searched a hardcoded
    // debug coordinate {x:-484,y:115,z:-38} instead of the target's actual
    // prison cell location, so release could never find it (see
    // imprisonEntity/processActivePrisonPockets — prisonData.prisonLocation
    // is now stored and used correctly). Pulled from grazing anyway for now
    // per user request; re-add once retested.
    {
      id: 'graze_sorcerer_transfiguration_portal',
      name: '§dTransfiguration Portal',
      description: 'Place a portal that randomly teleports anyone who touches it',
      pathway: 'door', sequenceNumber: 4, isPassive: false,
      abilityRef: { class: 'SecretsSorcererSequence', method: 'spawnTransfigurationPortal' },
      resetCooldownRefs: [{ class: 'SecretsSorcererSequence', mapProperty: 'portalCooldowns' }]
    }
  ],

  // ── DEATH pathway ─────────────────────────────────────────────────────
  'lotm:death_characteristic_seq9': [
    // graze_corpse_spirit_vision removed 2026-08-05: pointed at
    // CorpseCollectorSequence.useSpiritVision, which doesn't exist anywhere in
    // that file — the ability was never actually built. Re-add once it is.
    {
      id: 'graze_corpse_undead_passive',
      name: '§8Undead Passive',
      description: 'Undead ignore you passively',
      pathway: 'death', sequenceNumber: 9, isPassive: true,
      passiveEffects: [] // handled by special case in applyPassiveGraze
    }
  ],
  'lotm:death_characteristic_seq8': [
    {
      id: 'graze_gravedigger_summon_shade',
      name: '§8Summon Shade',
      description: 'Summon a spirit shade to fight beside you',
      pathway: 'death', sequenceNumber: 8, isPassive: false,
      // GravediggerSequence.tickAbilityState now runs unconditionally for
      // every player from main.js — ticks summonCooldowns.
      abilityRef: { class: 'GravediggerSequence', method: 'summonShade' },
      // summonCooldowns is set synchronously at cast time.
      resetCooldownRefs: [{ class: 'GravediggerSequence', mapProperty: 'summonCooldowns' }]
    }
  ],
  'lotm:death_characteristic_seq7': [
    {
      id: 'graze_spirit_medium_wolves',
      name: '§8Summon Spirit Wolves',
      description: 'Summon 2 spirit wolves to fight beside you',
      pathway: 'death', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'SpiritMediumSequence', method: 'handleAbilityUse', args: ['summon_spirit_wolves'] }
      // No resetCooldownRefs — this ability's cooldown (wolfCooldown) is a
      // module-level Map keyed by player.id and Date.now() timestamps, not
      // the tick-count-Map-keyed-by-player.name shape every other
      // resetCooldownRefs target uses — _resetSourceCooldowns wouldn't
      // actually clear it correctly. Left as the real 2-minute wall-clock
      // cooldown for grazers too; the ability also has its own separate
      // population cap (max 2 wolves) that already prevents spam regardless.
    }
  ],

  // ── SUN pathway ───────────────────────────────────────────────────────
  'lotm:sun_characteristic_seq9': [
    // Split into the 3 real songs 2026-08-05 (was a single entry routed
    // through useSelectedSong/getSelectedSong, which relies on a "selected
    // song" a grazer never had a chance to set via the real Bard's own
    // item+menu flow). Each song's own use* method also checks
    // PathwayManager.getPathway/getSequence DIRECTLY rather than via
    // this.hasSequence — dispatchGrazedAbility's PathwayManager patch (below)
    // covers that, not just the hasSequence patch.
    {
      id: 'graze_bard_song_of_courage',
      name: '§6Song of Courage',
      description: 'Removes fear, grants resistance',
      pathway: 'sun', sequenceNumber: 9, isPassive: false,
      abilityRef: { class: 'BardSequence', method: 'useSongOfCourage' }
    },
    {
      id: 'graze_bard_song_of_strength',
      name: '§6Song of Strength',
      description: 'Buff nearby allies with strength',
      pathway: 'sun', sequenceNumber: 9, isPassive: false,
      abilityRef: { class: 'BardSequence', method: 'useSongOfStrength' }
    },
    {
      id: 'graze_bard_song_of_recovery',
      name: '§6Song of Recovery',
      description: 'Heal and regenerate nearby allies',
      pathway: 'sun', sequenceNumber: 9, isPassive: false,
      abilityRef: { class: 'BardSequence', method: 'useSongOfRecovery' }
    }
  ],
  'lotm:sun_characteristic_seq8': [
    {
      id: 'graze_light_suppliant_sunshine',
      name: '§eSunshine',
      description: 'Summon a beam of sunlight',
      pathway: 'sun', sequenceNumber: 8, isPassive: false,
      // LightSuppliantSequence.tickAbilityState now runs unconditionally for
      // every player from main.js — no tickRefs needed here anymore.
      abilityRef: { class: 'LightSuppliantSequence', method: 'useSunshine' },
      // useSunshine sets sunshineCooldowns to LightSuppliantSequence's own
      // 15s cooldown on every real use — reset it after a grazed use so only
      // the grazer's own short flat cooldown gates reuse.
      resetCooldownRefs: [{ class: 'LightSuppliantSequence', mapProperty: 'sunshineCooldowns' }]
    },
    {
      id: 'graze_light_suppliant_blessing',
      name: '§bBlessing',
      description: 'Protect nearby allies from evil',
      pathway: 'sun', sequenceNumber: 8, isPassive: false,
      // Fully synchronous (no cooldown Map, no ongoing tick state) — safe
      // as-is, no tickRefs/resetCooldownRefs needed.
      abilityRef: { class: 'LightSuppliantSequence', method: 'useBlessing' }
    },
    {
      id: 'graze_light_suppliant_daytime',
      name: '§eDaytime',
      description: 'Create a spreading zone of daylight',
      pathway: 'sun', sequenceNumber: 8, isPassive: false,
      abilityRef: { class: 'LightSuppliantSequence', method: 'useDaytime' },
      // Same shape as Sunshine — useDaytime sets its own 20s daytimeCooldowns
      // on every real use, reset it so only the grazer's own cooldown gates.
      resetCooldownRefs: [{ class: 'LightSuppliantSequence', mapProperty: 'daytimeCooldowns' }]
    },
    {
      id: 'graze_light_suppliant_song_of_cleansing',
      name: '§aSong of Cleansing',
      description: 'Remove debuffs from nearby allies',
      pathway: 'sun', sequenceNumber: 8, isPassive: false,
      // Delivered via BardSequence.activeSongs/processSongs, already ticked
      // unconditionally for every player by BardSequence.tickAbilityState —
      // no extra tickRefs needed, same as the 3 Bard song entries above.
      abilityRef: { class: 'LightSuppliantSequence', method: 'useSongOfCleansing' }
    }
  ],

  // ── SEER pathway ──────────────────────────────────────────────────────
  'lotm:seer_characteristic_seq9': [
    {
      id: 'graze_seer_spirit_vision',
      name: '§5Seer Spirit Vision',
      description: 'Toggle seer spirit sight',
      pathway: 'seer', sequenceNumber: 9, isPassive: false,
      // SeerSequence.tickAbilityState now runs unconditionally for every
      // player from main.js — no tickRefs needed here anymore.
      abilityRef: { class: 'SeerSequence', method: 'handleAbilityUse', args: ['spirit_vision'] },
      // spiritVisionCooldown is set synchronously at cast time.
      resetCooldownRefs: [{ class: 'SeerSequence', mapProperty: 'spiritVisionCooldown' }]
    }
    // Danger Intuition is pure-passive (no use* method, no handleAbilityUse
    // case) — nothing to register as an active graze pick.
  ],
  'lotm:seer_characteristic_seq8': [
    {
      id: 'graze_clown_feint',
      name: '§cFeint Strike',
      description: 'Strike from unexpected angle',
      pathway: 'seer', sequenceNumber: 8, isPassive: false,
      abilityRef: { class: 'ClownSequence', method: 'handleAbilityUse', args: ['feint_strike'] },
      resetCooldownRefs: [{ class: 'ClownSequence', mapProperty: 'feintCooldowns' }]
    },
    {
      id: 'graze_clown_disguise',
      name: '§8Disguise',
      description: 'Turn invisible briefly',
      pathway: 'seer', sequenceNumber: 8, isPassive: false,
      abilityRef: { class: 'ClownSequence', method: 'handleAbilityUse', args: ['disguise'] },
      resetCooldownRefs: [{ class: 'ClownSequence', mapProperty: 'disguiseCooldowns' }]
    },
    {
      id: 'graze_clown_paper_daggers',
      name: '§fPaper Daggers',
      description: 'Throw a spread of hardened paper daggers',
      pathway: 'seer', sequenceNumber: 8, isPassive: false,
      // No resetCooldownRefs — paperDaggersCooldown is set on use but never
      // actually read/gated anywhere in the real ability either (confirmed
      // via code read), so there's nothing to reset against.
      abilityRef: { class: 'ClownSequence', method: 'handleAbilityUse', args: ['paper_daggers'] }
    }
  ],
  'lotm:seer_characteristic_seq7': [
    {
      id: 'graze_magician_air_bullet',
      name: '§9Air Bullet',
      description: 'Fire a compressed air projectile',
      pathway: 'seer', sequenceNumber: 7, isPassive: false,
      // MagicianSequence.tickAbilityState now runs unconditionally for every
      // player from main.js — the old _tickGrazedAirBulletCooldown special
      // case (and its tickRefs entry here) was removed as redundant.
      abilityRef: { class: 'MagicianSequence', method: 'handleAbilityUse', args: ['air_bullet'] },
      resetCooldownRefs: [{ class: 'MagicianSequence', mapProperty: 'airBulletCooldowns' }]
    },
    {
      id: 'graze_magician_flaming_jump',
      name: '§9Flaming Jump',
      description: 'Explosive jump launch',
      pathway: 'seer', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'MagicianSequence', method: 'handleAbilityUse', args: ['flaming_jump'] },
      resetCooldownRefs: [{ class: 'MagicianSequence', mapProperty: 'flamingJumpCooldowns' }]
    },
    {
      id: 'graze_magician_damage_transfer',
      name: '§cDamage Transfer',
      description: 'Prime your next heavy hit to be reduced',
      pathway: 'seer', sequenceNumber: 7, isPassive: false,
      // handleIncomingDamage (the actual trigger, called from main.js's
      // entityHurt event) only checks the transferReady flag this sets, no
      // hasSequence gate — works for a grazer automatically once primed.
      abilityRef: { class: 'MagicianSequence', method: 'handleAbilityUse', args: ['damage_transfer'] },
      resetCooldownRefs: [{ class: 'MagicianSequence', mapProperty: 'transferCooldowns' }]
    },
    {
      id: 'graze_magician_spell_volley',
      name: '§dSpell Volley',
      description: 'Fire 3 magic bolts at nearest enemies',
      pathway: 'seer', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'MagicianSequence', method: 'handleAbilityUse', args: ['spell_volley'] },
      resetCooldownRefs: [{ class: 'MagicianSequence', mapProperty: 'spellCooldowns' }]
    },
    {
      id: 'graze_magician_water_breathing',
      name: '§bWater Breathing',
      description: 'Conjure an invisible air pipe',
      pathway: 'seer', sequenceNumber: 7, isPassive: false,
      // No cooldown map for this one — toggle + duration only. Ongoing
      // per-tick spirit drain (processWaterBreathing) is NOT discounted by
      // the grazed-ability spirit multiplier, only the initial cast is —
      // same limitation as every other duration-based ability in this pack.
      abilityRef: { class: 'MagicianSequence', method: 'handleAbilityUse', args: ['water_breathing'] }
    },
    {
      id: 'graze_magician_paper_weapon',
      name: '§fPaper Weapon',
      description: 'Harden paper into a melee weapon for an AoE strike',
      pathway: 'seer', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'MagicianSequence', method: 'handleAbilityUse', args: ['drawing_paper_weapon'] },
      resetCooldownRefs: [{ class: 'MagicianSequence', mapProperty: 'paperWeaponCooldowns' }]
    }
    // Paper Figurine deliberately not registered — passive item-possession
    // check (checkFigurinePrimed/handleFigurineTrigger), not a real
    // triggerable ability; usePaperFigurine never existed (fixed the crash
    // in handleAbilityUse's switch case, see seer_pathway.js).
  ],

  // ── JUSTICIAR pathway ─────────────────────────────────────────────────
  'lotm:justiciar_characteristic_seq9': [
    {
      id: 'graze_arbiter_command',
      name: '§eAuthority Command',
      description: 'Command nearby entities',
      pathway: 'justiciar', sequenceNumber: 9, isPassive: false,
      abilityRef: { class: 'ArbiterSequence', method: 'useAbility', args: ['authority_command'] }
    }
  ],
  // NOTE for the whole rest of this pathway: cooldowns here are stored as
  // `cooldowns: Map<playerName, {key1:0, key2:0, ...}>` (one object holding
  // ALL of a class's ability cooldowns per player), not the flat
  // `Map<playerName, number>` shape every other pathway uses.
  // `_resetSourceCooldowns`'s `map.delete(player.name)` still works — it
  // just clears the WHOLE per-player cooldown object for that class at
  // once, not just the one ability being reset. Slightly blunter than
  // other pathways (a grazer with 2 abilities from the same class active
  // gets both reset when only one was used) but harmless — never leaves a
  // stale block, just occasionally generous. None of these active methods
  // have an internal hasSequence check either (confirmed by reading each —
  // only applyPassiveAbilities/getMeleeProficiencyBonus do), so the usual
  // access-spoof isn't even load-bearing for this pathway's abilities.
  'lotm:justiciar_characteristic_seq8': [
    {
      id: 'graze_sheriff_recognition',
      name: '§bRecognition',
      description: 'Mark and glow the nearest target',
      pathway: 'justiciar', sequenceNumber: 8, isPassive: false,
      abilityRef: { class: 'SheriffSequence', method: 'useRecognition' },
      resetCooldownRefs: [{ class: 'SheriffSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_sheriff_jurisdiction',
      name: '§aJurisdiction Mark',
      description: 'Mark this area as your jurisdiction — Haste + Strength inside',
      pathway: 'justiciar', sequenceNumber: 8, isPassive: false,
      abilityRef: { class: 'SheriffSequence', method: 'useJurisdictionMark' },
      resetCooldownRefs: [{ class: 'SheriffSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_sheriff_sense_disorder',
      name: '§cSense Disorder',
      description: 'Pulse an area, marking hostile presences',
      pathway: 'justiciar', sequenceNumber: 8, isPassive: false,
      abilityRef: { class: 'SheriffSequence', method: 'useSenseDisorder' },
      resetCooldownRefs: [{ class: 'SheriffSequence', mapProperty: 'cooldowns' }]
    }
  ],
  'lotm:justiciar_characteristic_seq7': [
    {
      id: 'graze_interrogator_piercing',
      name: '§bPsychic Piercing',
      description: 'Lightning bolt from the eyes — pierces the Soul',
      pathway: 'justiciar', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'InterrogatorSequence', method: 'usePsychicPiercing' },
      resetCooldownRefs: [{ class: 'InterrogatorSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_interrogator_whip',
      name: '§5Whip of Pain',
      description: 'Lash the mind of the nearest target',
      pathway: 'justiciar', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'InterrogatorSequence', method: 'useWhipOfPain' },
      resetCooldownRefs: [{ class: 'InterrogatorSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_interrogator_brand',
      name: '§cIllusory Brand',
      description: 'Sear the Spirit Body of a target in melee range',
      pathway: 'justiciar', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'InterrogatorSequence', method: 'useIllusoryBrand' },
      resetCooldownRefs: [{ class: 'InterrogatorSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_interrogator_lashing',
      name: '§ePsychic Lashing',
      description: 'Coat your next melee swings in illusory lightning',
      pathway: 'justiciar', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'InterrogatorSequence', method: 'usePsychicLashing' },
      resetCooldownRefs: [{ class: 'InterrogatorSequence', mapProperty: 'cooldowns' }]
    }
  ],
  'lotm:justiciar_characteristic_seq6': [
    {
      id: 'graze_judge_prohibition',
      name: '§cProhibition',
      description: 'Bind all nearby entities in an area',
      pathway: 'justiciar', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'JudgeSequence', method: 'useProhibition' },
      resetCooldownRefs: [{ class: 'JudgeSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_judge_imprison',
      name: '§9Imprison',
      description: 'Freeze a single target in place',
      pathway: 'justiciar', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'JudgeSequence', method: 'useImprison' },
      resetCooldownRefs: [{ class: 'JudgeSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_judge_exile',
      name: '§6Exile',
      description: 'Hurl nearby entities away with unavoidable force',
      pathway: 'justiciar', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'JudgeSequence', method: 'useExile' },
      resetCooldownRefs: [{ class: 'JudgeSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_judge_death',
      name: '§4Death',
      description: 'Charge forward and deliver a devastating blow',
      pathway: 'justiciar', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'JudgeSequence', method: 'useDeath' },
      resetCooldownRefs: [{ class: 'JudgeSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_judge_flog',
      name: '§5Flog',
      description: 'Lash all nearby entities with an invisible whip',
      pathway: 'justiciar', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'JudgeSequence', method: 'useFlog' },
      resetCooldownRefs: [{ class: 'JudgeSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_judge_jurisdiction',
      name: '§aJurisdiction Mark',
      description: 'Mark a city-sized jurisdiction — Strength/Haste/Regen inside',
      pathway: 'justiciar', sequenceNumber: 6, isPassive: false,
      // No cooldown check at all inside useJurisdictionMark (confirmed via
      // code read) — no resetCooldownRefs needed.
      abilityRef: { class: 'JudgeSequence', method: 'useJurisdictionMark' }
    }
  ],
  'lotm:justiciar_characteristic_seq5': [
    {
      id: 'graze_paladin_punishment',
      name: '§ePunishment',
      description: 'Mark a target — Strength bonus against them, shackles them',
      pathway: 'justiciar', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'DisciplinaryPaladinSequence', method: 'usePunishment' },
      resetCooldownRefs: [{ class: 'DisciplinaryPaladinSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_paladin_prohibition_stack',
      name: '§cProhibition Stack',
      description: 'Stack restrictive effects on a single target',
      pathway: 'justiciar', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'DisciplinaryPaladinSequence', method: 'useProhibitionStack' },
      resetCooldownRefs: [{ class: 'DisciplinaryPaladinSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_paladin_death_targeted',
      name: '§4Death (Targeted)',
      description: 'Wither the flesh at a targeted wound from afar',
      pathway: 'justiciar', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'DisciplinaryPaladinSequence', method: 'useDeathTargeted' },
      resetCooldownRefs: [{ class: 'DisciplinaryPaladinSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_paladin_authority',
      name: '§5Authority Command',
      description: 'Horror aura — slows and weakens nearby entities',
      pathway: 'justiciar', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'DisciplinaryPaladinSequence', method: 'useAuthorityCommand' },
      resetCooldownRefs: [{ class: 'DisciplinaryPaladinSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_paladin_jurisdiction',
      name: '§aJurisdiction Mark',
      description: 'Mark a city-sized jurisdiction',
      pathway: 'justiciar', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'DisciplinaryPaladinSequence', method: 'useJurisdictionMark' },
      resetCooldownRefs: [{ class: 'DisciplinaryPaladinSequence', mapProperty: 'cooldowns' }]
    }
  ],
  'lotm:justiciar_characteristic_seq4': [
    {
      id: 'graze_mage_weaken_mysticism',
      name: '§cLaw: Weaken Mysticism',
      description: 'Suppress all nearby Beyonder powers, empower yourself',
      pathway: 'justiciar', sequenceNumber: 4, isPassive: false,
      abilityRef: { class: 'ImperativeMageSequence', method: 'useLawWeakenMysticism' },
      resetCooldownRefs: [{ class: 'ImperativeMageSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_mage_weaken_reality',
      name: '§bLaw: Weaken Reality',
      description: 'Amplify Beyonder powers massively for yourself',
      pathway: 'justiciar', sequenceNumber: 4, isPassive: false,
      abilityRef: { class: 'ImperativeMageSequence', method: 'useLawWeakenReality' },
      resetCooldownRefs: [{ class: 'ImperativeMageSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_mage_deprivation',
      name: '§5Deprivation',
      description: "Strip a target's Beyonder power temporarily",
      pathway: 'justiciar', sequenceNumber: 4, isPassive: false,
      abilityRef: { class: 'ImperativeMageSequence', method: 'useDeprivation' },
      resetCooldownRefs: [{ class: 'ImperativeMageSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_mage_execution',
      name: '§4Execution',
      description: 'Devastating hitscan strike from afar',
      pathway: 'justiciar', sequenceNumber: 4, isPassive: false,
      abilityRef: { class: 'ImperativeMageSequence', method: 'useExecution' },
      resetCooldownRefs: [{ class: 'ImperativeMageSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_mage_intimidation',
      name: '§9Intimidation',
      description: 'Root all nearby entities to the spot',
      pathway: 'justiciar', sequenceNumber: 4, isPassive: false,
      abilityRef: { class: 'ImperativeMageSequence', method: 'useIntimidation' },
      resetCooldownRefs: [{ class: 'ImperativeMageSequence', mapProperty: 'cooldowns' }]
    },
    {
      id: 'graze_mage_mythical_form',
      name: '§6Mythical Form',
      description: 'Transform into the Incomplete Brass Pillar — massive buffs',
      pathway: 'justiciar', sequenceNumber: 4, isPassive: false,
      abilityRef: { class: 'ImperativeMageSequence', method: 'useMythicalForm' },
      resetCooldownRefs: [{ class: 'ImperativeMageSequence', mapProperty: 'cooldowns' }]
    }
  ],
  // ── RED PRIEST pathway ────────────────────────────────────────────────
  'lotm:red_priest_characteristic_seq9': [
    {
      id: 'graze_hunter_strength',
      name: '§cHunter Strength',
      description: 'Strength II permanent',
      pathway: 'red_priest', sequenceNumber: 9, isPassive: true,
      passiveEffects: [{ effect: 'strength', amplifier: 1 }]
    }
    // Danger Intuition/Trap Visibility are passive particle scans, not
    // effect grants — nothing meaningful to register for those.
  ],
  'lotm:red_priest_characteristic_seq8': [
    {
      id: 'graze_provoker_provocation',
      name: '§cProvocation',
      description: 'Incite nearby hostiles to attack each other',
      pathway: 'red_priest', sequenceNumber: 8, isPassive: false,
      // provokeCooldown is Date.now()-based and keyed by player.id, not the
      // tick-count/player.name shape resetCooldownRefs targets — uses
      // resetCooldownCall (a dedicated reset method) instead.
      abilityRef: { class: 'ProvokerSequence', method: 'useProvocation' },
      resetCooldownCall: [{ class: 'ProvokerSequence', method: 'resetProvocationCooldown' }]
    }
  ],
  'lotm:red_priest_characteristic_seq7': [
    {
      id: 'graze_pyro_fire_bolt',
      name: '§cFire Bolt',
      description: 'Launch a homing bolt of fire',
      pathway: 'red_priest', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'PyromancerSequence', method: 'castSpecificSpell', args: ['fire_bolt'] },
      resetCooldownCall: [{ class: 'PyromancerSequence', method: 'resetSpellCooldown', args: ['fire_bolt'] }]
    },
    {
      id: 'graze_pyro_fireball',
      name: '§6Fireball',
      description: 'Explosive fireball with AoE splash damage',
      pathway: 'red_priest', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'PyromancerSequence', method: 'castSpecificSpell', args: ['fireball'] },
      resetCooldownCall: [{ class: 'PyromancerSequence', method: 'resetSpellCooldown', args: ['fireball'] }]
    },
    {
      id: 'graze_pyro_fire_wall',
      name: '§eFire Wall',
      description: 'Conjure a wall of flame that burns anything crossing it',
      pathway: 'red_priest', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'PyromancerSequence', method: 'castSpecificSpell', args: ['fire_wall'] },
      resetCooldownCall: [{ class: 'PyromancerSequence', method: 'resetSpellCooldown', args: ['fire_wall'] }]
    },
    {
      id: 'graze_pyro_blazing_spear',
      name: '§cBlazing Spear',
      description: 'Hurl a piercing spear of flame',
      pathway: 'red_priest', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'PyromancerSequence', method: 'castSpecificSpell', args: ['blazing_spear'] },
      resetCooldownCall: [{ class: 'PyromancerSequence', method: 'resetSpellCooldown', args: ['blazing_spear'] }]
    },
    {
      id: 'graze_pyro_ring_of_fire',
      name: '§4Ring of Fire',
      description: 'Expanding rings of fire burn everything they touch',
      pathway: 'red_priest', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'PyromancerSequence', method: 'castSpecificSpell', args: ['ring_of_fire'] },
      resetCooldownCall: [{ class: 'PyromancerSequence', method: 'resetSpellCooldown', args: ['ring_of_fire'] }]
    },
    {
      id: 'graze_pyro_flaming_barrage',
      name: '§6Flaming Barrage',
      description: 'Launch a volley of homing fireballs',
      pathway: 'red_priest', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'PyromancerSequence', method: 'castSpecificSpell', args: ['flaming_barrage'] },
      resetCooldownCall: [{ class: 'PyromancerSequence', method: 'resetSpellCooldown', args: ['flaming_barrage'] }]
    },
    {
      id: 'graze_pyro_burning_dash',
      name: '§4Burning Dash',
      description: 'Dash forward leaving a trail of fire',
      pathway: 'red_priest', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'PyromancerSequence', method: 'castSpecificSpell', args: ['burning_dash'] },
      resetCooldownCall: [{ class: 'PyromancerSequence', method: 'resetSpellCooldown', args: ['burning_dash'] }]
    },
    {
      id: 'graze_pyro_fire_arrow_blaze',
      name: '§6Fire Arrow + Blaze Storm',
      description: 'Fire an arrow followed by a spread of blaze bolts',
      pathway: 'red_priest', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'PyromancerSequence', method: 'castSpecificSpell', args: ['fire_arrow_blaze'] },
      resetCooldownCall: [{ class: 'PyromancerSequence', method: 'resetSpellCooldown', args: ['fire_arrow_blaze'] }]
    }
    // All spell cooldowns here are Date.now()-based, keyed by
    // `${player.id}:${spell}` — not the flat tick-count Map shape
    // resetCooldownRefs targets. Each entry above uses resetCooldownCall
    // (resetSpellCooldown) instead, same reasoning as Provoker above.
  ],
  'lotm:red_priest_characteristic_seq6': [
    {
      id: 'graze_conspirer_fire_bolt',
      name: '§cFire Bolt',
      description: 'Launch a homing bolt of fire',
      pathway: 'red_priest', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ConspirierSequence', method: 'castSpecificSpell', args: ['fire_bolt'] },
      resetCooldownCall: [{ class: 'ConspirierSequence', method: 'resetSpellCooldown', args: ['fire_bolt'] }]
    },
    {
      id: 'graze_conspirer_fireball',
      name: '§6Fireball',
      description: 'Explosive fireball with AoE splash damage',
      pathway: 'red_priest', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ConspirierSequence', method: 'castSpecificSpell', args: ['fireball'] },
      resetCooldownCall: [{ class: 'ConspirierSequence', method: 'resetSpellCooldown', args: ['fireball'] }]
    },
    {
      id: 'graze_conspirer_fire_wall',
      name: '§eFire Wall',
      description: 'Conjure a wall of flame that burns anything crossing it',
      pathway: 'red_priest', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ConspirierSequence', method: 'castSpecificSpell', args: ['fire_wall'] },
      resetCooldownCall: [{ class: 'ConspirierSequence', method: 'resetSpellCooldown', args: ['fire_wall'] }]
    },
    {
      id: 'graze_conspirer_blazing_spear',
      name: '§cBlazing Spear',
      description: 'Hurl a piercing spear of flame',
      pathway: 'red_priest', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ConspirierSequence', method: 'castSpecificSpell', args: ['blazing_spear'] },
      resetCooldownCall: [{ class: 'ConspirierSequence', method: 'resetSpellCooldown', args: ['blazing_spear'] }]
    },
    {
      id: 'graze_conspirer_ring_of_fire',
      name: '§4Ring of Fire',
      description: 'Expanding rings of fire burn everything they touch',
      pathway: 'red_priest', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ConspirierSequence', method: 'castSpecificSpell', args: ['ring_of_fire'] },
      resetCooldownCall: [{ class: 'ConspirierSequence', method: 'resetSpellCooldown', args: ['ring_of_fire'] }]
    },
    {
      id: 'graze_conspirer_flaming_barrage',
      name: '§6Flaming Barrage',
      description: 'Launch a volley of homing fireballs',
      pathway: 'red_priest', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ConspirierSequence', method: 'castSpecificSpell', args: ['flaming_barrage'] },
      resetCooldownCall: [{ class: 'ConspirierSequence', method: 'resetSpellCooldown', args: ['flaming_barrage'] }]
    },
    {
      id: 'graze_conspirer_burning_dash',
      name: '§4Burning Dash',
      description: 'Dash forward leaving a trail of fire',
      pathway: 'red_priest', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ConspirierSequence', method: 'castSpecificSpell', args: ['burning_dash'] },
      resetCooldownCall: [{ class: 'ConspirierSequence', method: 'resetSpellCooldown', args: ['burning_dash'] }]
    },
    {
      id: 'graze_conspirer_fire_arrow_blaze',
      name: '§6Fire Arrow + Blaze Storm',
      description: 'Fire an arrow followed by a spread of blaze bolts',
      pathway: 'red_priest', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ConspirierSequence', method: 'castSpecificSpell', args: ['fire_arrow_blaze'] },
      resetCooldownCall: [{ class: 'ConspirierSequence', method: 'resetSpellCooldown', args: ['fire_arrow_blaze'] }]
    },
    {
      id: 'graze_conspirer_flame_transform',
      name: '§6Flame Transform',
      description: 'Blink to a struck target or surface in a blast of flame',
      pathway: 'red_priest', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ConspirierSequence', method: 'castSpecificSpell', args: ['flame_transform'] },
      resetCooldownCall: [{ class: 'ConspirierSequence', method: 'resetSpellCooldown', args: ['flame_transform'] }]
    },
    {
      id: 'graze_conspirer_incitement',
      name: '§cIncitement',
      description: 'Incite nearby hostiles to fight each other',
      pathway: 'red_priest', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ConspirierSequence', method: 'castSpecificSpell', args: ['incitement'] },
      resetCooldownCall: [{ class: 'ConspirierSequence', method: 'resetSpellCooldown', args: ['incitement'] }]
    },
    {
      id: 'graze_conspirer_conspiracy',
      name: '§5Conspiracy',
      description: 'Vanish from perception and blind nearby foes',
      pathway: 'red_priest', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ConspirierSequence', method: 'castSpecificSpell', args: ['conspiracy'] },
      resetCooldownCall: [{ class: 'ConspirierSequence', method: 'resetSpellCooldown', args: ['conspiracy'] }]
    },
    {
      id: 'graze_conspirer_conjure_blade',
      name: '§4Conjure Flame Blade',
      description: 'Conjure a blade of living flame',
      pathway: 'red_priest', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ConspirierSequence', method: 'castSpecificSpell', args: ['conjure_blade'] },
      resetCooldownCall: [{ class: 'ConspirierSequence', method: 'resetSpellCooldown', args: ['conjure_blade'] }]
    }
    // All spell cooldowns here are Date.now()-based, keyed by
    // `${player.id}:${spell}` — not the flat tick-count Map shape
    // resetCooldownRefs targets. Each entry above uses resetCooldownCall
    // (resetSpellCooldown) instead, same reasoning as Provoker above.
  ],
  'lotm:red_priest_characteristic_seq5': [
    {
      id: 'graze_reaper_fire_bolt',
      name: '§cFire Bolt',
      description: 'Launch a homing bolt of fire',
      pathway: 'red_priest', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ReaperSequence', method: 'castSpecificSpell', args: ['fire_bolt'] },
      resetCooldownCall: [{ class: 'ReaperSequence', method: 'resetSpellCooldown', args: ['fire_bolt'] }]
    },
    {
      id: 'graze_reaper_fireball',
      name: '§6Fireball',
      description: 'Explosive fireball with AoE splash damage',
      pathway: 'red_priest', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ReaperSequence', method: 'castSpecificSpell', args: ['fireball'] },
      resetCooldownCall: [{ class: 'ReaperSequence', method: 'resetSpellCooldown', args: ['fireball'] }]
    },
    {
      id: 'graze_reaper_fire_wall',
      name: '§eFire Wall',
      description: 'Conjure a wall of flame that burns anything crossing it',
      pathway: 'red_priest', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ReaperSequence', method: 'castSpecificSpell', args: ['fire_wall'] },
      resetCooldownCall: [{ class: 'ReaperSequence', method: 'resetSpellCooldown', args: ['fire_wall'] }]
    },
    {
      id: 'graze_reaper_blazing_spear',
      name: '§cBlazing Spear',
      description: 'Hurl a piercing spear of flame',
      pathway: 'red_priest', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ReaperSequence', method: 'castSpecificSpell', args: ['blazing_spear'] },
      resetCooldownCall: [{ class: 'ReaperSequence', method: 'resetSpellCooldown', args: ['blazing_spear'] }]
    },
    {
      id: 'graze_reaper_ring_of_fire',
      name: '§4Ring of Fire',
      description: 'Expanding rings of fire burn everything they touch',
      pathway: 'red_priest', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ReaperSequence', method: 'castSpecificSpell', args: ['ring_of_fire'] },
      resetCooldownCall: [{ class: 'ReaperSequence', method: 'resetSpellCooldown', args: ['ring_of_fire'] }]
    },
    {
      id: 'graze_reaper_flaming_barrage',
      name: '§6Flaming Barrage',
      description: 'Launch a volley of homing fireballs',
      pathway: 'red_priest', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ReaperSequence', method: 'castSpecificSpell', args: ['flaming_barrage'] },
      resetCooldownCall: [{ class: 'ReaperSequence', method: 'resetSpellCooldown', args: ['flaming_barrage'] }]
    },
    {
      id: 'graze_reaper_burning_dash',
      name: '§4Burning Dash',
      description: 'Dash forward leaving a trail of fire',
      pathway: 'red_priest', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ReaperSequence', method: 'castSpecificSpell', args: ['burning_dash'] },
      resetCooldownCall: [{ class: 'ReaperSequence', method: 'resetSpellCooldown', args: ['burning_dash'] }]
    },
    {
      id: 'graze_reaper_fire_arrow_blaze',
      name: '§6Fire Arrow + Blaze Storm',
      description: 'Fire an arrow followed by a spread of blaze bolts',
      pathway: 'red_priest', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ReaperSequence', method: 'castSpecificSpell', args: ['fire_arrow_blaze'] },
      resetCooldownCall: [{ class: 'ReaperSequence', method: 'resetSpellCooldown', args: ['fire_arrow_blaze'] }]
    },
    {
      id: 'graze_reaper_flame_transform',
      name: '§6Flame Transform',
      description: 'Blink to a struck target or surface in a blast of flame',
      pathway: 'red_priest', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ReaperSequence', method: 'castSpecificSpell', args: ['flame_transform'] },
      resetCooldownCall: [{ class: 'ReaperSequence', method: 'resetSpellCooldown', args: ['flame_transform'] }]
    },
    {
      id: 'graze_reaper_incitement',
      name: '§cIncitement',
      description: 'Incite nearby hostiles to fight each other',
      pathway: 'red_priest', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ReaperSequence', method: 'castSpecificSpell', args: ['incitement'] },
      resetCooldownCall: [{ class: 'ReaperSequence', method: 'resetSpellCooldown', args: ['incitement'] }]
    },
    {
      id: 'graze_reaper_conspiracy',
      name: '§5Conspiracy',
      description: 'Vanish from perception and blind nearby foes',
      pathway: 'red_priest', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ReaperSequence', method: 'castSpecificSpell', args: ['conspiracy'] },
      resetCooldownCall: [{ class: 'ReaperSequence', method: 'resetSpellCooldown', args: ['conspiracy'] }]
    },
    {
      id: 'graze_reaper_conjure_blade',
      name: '§4Conjure Flame Blade',
      description: 'Conjure a blade of living flame',
      pathway: 'red_priest', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ReaperSequence', method: 'castSpecificSpell', args: ['conjure_blade'] },
      resetCooldownCall: [{ class: 'ReaperSequence', method: 'resetSpellCooldown', args: ['conjure_blade'] }]
    },
    {
      id: 'graze_reaper_cull',
      name: '§4§lCull',
      description: 'Mark yourself for escalating melee damage against one target',
      pathway: 'red_priest', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ReaperSequence', method: 'castSpecificSpell', args: ['cull'] },
      resetCooldownCall: [{ class: 'ReaperSequence', method: 'resetSpellCooldown', args: ['cull'] }]
    }
    // All spell cooldowns here are Date.now()-based, keyed by
    // `${player.id}:${spell}` — not the flat tick-count Map shape
    // resetCooldownRefs targets. Each entry above uses resetCooldownCall
    // (resetSpellCooldown) instead, same reasoning as Provoker above.
  ],

  // ── HANGED MAN pathway ────────────────────────────────────────────────
  // Madness/Listen-ambient/Flesh-Hunger are background systems tied to real
  // pathway membership (see main.js's tickAbilityState comment) — not
  // exposed here since they aren't opt-in "abilities" a grazer picks.
  // Shepherd's own GRAZE/USE_GRAZED/MANAGE_GRAZED are skipped too — those
  // are a UI flow around Shepherd's own soul-consumption system, not
  // castable spells, and "graze the ability to use your grazed ability"
  // doesn't make sense for a non-Shepherd borrower.
  'lotm:hanged_man_characteristic_seq9': [
    {
      id: 'graze_suppliant_divination',
      name: '§5Divination',
      description: 'Scan the area for beyonders, powerful mobs, and nearby structures',
      pathway: 'hanged_man', sequenceNumber: 9, isPassive: false,
      // SecretsSuppliantSequence.tickAbilityState now runs unconditionally
      // for every player from main.js — ticks divinationCooldowns.
      abilityRef: { class: 'SecretsSuppliantSequence', method: 'useDivination' },
      resetCooldownRefs: [{ class: 'SecretsSuppliantSequence', mapProperty: 'divinationCooldowns' }]
    },
    {
      id: 'graze_suppliant_enchantment_inscription',
      name: '§dEnchantment Inscription',
      description: 'Inscribe mystical knowledge onto an enchanted book',
      pathway: 'hanged_man', sequenceNumber: 9, isPassive: false,
      abilityRef: { class: 'SecretsSuppliantSequence', method: 'useEnchantmentInscription' },
      resetCooldownRefs: [{ class: 'SecretsSuppliantSequence', mapProperty: 'inscriptionCooldowns' }]
    },
    {
      id: 'graze_suppliant_aura_reading',
      name: '§bAura Reading',
      description: 'Read the aura of nearby players and mobs',
      pathway: 'hanged_man', sequenceNumber: 9, isPassive: false,
      abilityRef: { class: 'SecretsSuppliantSequence', method: 'useAuraReading' },
      resetCooldownRefs: [{ class: 'SecretsSuppliantSequence', mapProperty: 'auraReadCooldowns' }]
    },
    {
      id: 'graze_suppliant_spirit_perception',
      name: '§7Spirit Perception',
      description: 'An immediate readout of powerful presences nearby',
      pathway: 'hanged_man', sequenceNumber: 9, isPassive: false,
      // No internal cooldown to reset — this ability has none, only the
      // graze dispatch layer's own external cooldown applies.
      abilityRef: { class: 'SecretsSuppliantSequence', method: 'useSpiritPerception' }
    }
  ],
  // seq8 (Listener) intentionally has no graze entries — user tested
  // 2026-08-08 and both didn't apply well to a non-Hanged-Man grazer.
  // Suppress Voices' whole payload is countering Madness accumulation,
  // which only real Hanged Man players (seq8 and below) actually have —
  // for anyone else it just clears debuffs that were never applied and
  // does nothing perceptible. Focused Listen pulled alongside it for the
  // same reason (tied to the same Madness-bound kit).
  'lotm:hanged_man_characteristic_seq7': [
    {
      id: 'graze_shadow_summon',
      name: '§8Shadow Summon',
      description: 'Summon 3 shades to fight beside you (small chance one turns on you)',
      pathway: 'hanged_man', sequenceNumber: 7, isPassive: false,
      // ShadowAsceticSequence.tickAbilityState now runs unconditionally for
      // every player from main.js — ticks summonCooldowns.
      abilityRef: { class: 'ShadowAsceticSequence', method: 'useShadowSummon' },
      resetCooldownRefs: [{ class: 'ShadowAsceticSequence', mapProperty: 'summonCooldowns' }]
    },
    {
      id: 'graze_shadow_curse',
      name: '§8Shadow Curse',
      description: 'Consume a flesh medium to curse the nearest target with wither and slowness',
      pathway: 'hanged_man', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'ShadowAsceticSequence', method: 'useShadowCurse' },
      resetCooldownRefs: [{ class: 'ShadowAsceticSequence', mapProperty: 'curseCooldowns' }]
    },
    {
      id: 'graze_shadow_manipulation',
      name: '§8Shadow Manipulation',
      description: 'Envelop the nearest target in a shadow chrysalis of slowness, weakness and blindness',
      pathway: 'hanged_man', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'ShadowAsceticSequence', method: 'useShadowManipulation' },
      resetCooldownRefs: [{ class: 'ShadowAsceticSequence', mapProperty: 'manipCooldowns' }]
    },
    {
      id: 'graze_shadow_lurking',
      name: '§8Shadow Lurking',
      description: 'Melt into the shadows — near-invisibility at night, dawn, or dusk (toggle)',
      pathway: 'hanged_man', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'ShadowAsceticSequence', method: 'useShadowLurking' },
      resetCooldownRefs: [{ class: 'ShadowAsceticSequence', mapProperty: 'lurkCooldowns' }]
    },
    {
      id: 'graze_shadow_shaping',
      name: '§8Shadow Shaping',
      description: 'Condense darkness into a blade that chills and weakens on hit',
      pathway: 'hanged_man', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'ShadowAsceticSequence', method: 'useShadowShaping' },
      resetCooldownRefs: [{ class: 'ShadowAsceticSequence', mapProperty: 'shapeCooldowns' }]
    }
  ],
  'lotm:hanged_man_characteristic_seq6': [
    {
      id: 'graze_rose_flesh_bomb',
      name: '§4Flesh Bomb',
      description: 'Consume a Flesh Bomb item and throw it — corrosive explosive damage',
      pathway: 'hanged_man', sequenceNumber: 6, isPassive: false,
      // RoseBishopSequence.tickAbilityState now runs unconditionally for
      // every player from main.js. bombLastUsed stores the world tick the
      // bomb was thrown rather than a countdown, but deleting the entry
      // still resets the check to "expired" — same reasoning as
      // death:summon_shade above.
      abilityRef: { class: 'RoseBishopSequence', method: 'useFleshBomb' },
      resetCooldownRefs: [{ class: 'RoseBishopSequence', mapProperty: 'bombLastUsed' }]
    },
    {
      id: 'graze_rose_flesh_curse',
      name: '§4Flesh & Blood Curse',
      description: 'Consume a flesh medium to curse the nearest target with wither, poison and slowness',
      pathway: 'hanged_man', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'RoseBishopSequence', method: 'useFleshCurse' },
      resetCooldownRefs: [{ class: 'RoseBishopSequence', mapProperty: 'curseCooldowns' }]
    },
    {
      id: 'graze_rose_consume_flesh',
      name: '§cConsume Flesh',
      description: 'Eat a flesh item from your inventory for healing and regeneration',
      pathway: 'hanged_man', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'RoseBishopSequence', method: 'useConsumeFlesh' },
      resetCooldownRefs: [{ class: 'RoseBishopSequence', mapProperty: 'regenCooldowns' }]
    }
  ],

  'lotm:hermit_characteristic_seq9': [
    {
      id: 'graze_mystery_pryer_divination',
      name: '§5Divination',
      description: 'Locate nearby structures',
      pathway: 'hermit', sequenceNumber: 9, isPassive: false,
      // MysteryPryerSequence.tickAbilityState now runs unconditionally for
      // every player from main.js — ticks divinationCooldowns.
      abilityRef: { class: 'MysteryPryerSequence', method: 'useDivination' },
      resetCooldownRefs: [{ class: 'MysteryPryerSequence', mapProperty: 'divinationCooldowns' }]
    },
    {
      id: 'graze_mystery_pryer_divine_insight',
      name: '§5Divine Insight',
      description: 'Analyse your targeted entity',
      pathway: 'hermit', sequenceNumber: 9, isPassive: false,
      abilityRef: { class: 'MysteryPryerSequence', method: 'useDivineInsight' },
      resetCooldownRefs: [{ class: 'MysteryPryerSequence', mapProperty: 'insightCooldowns' }]
    },
    {
      id: 'graze_mystery_pryer_detect',
      name: '§5Detect Hostiles',
      description: 'Reveal and glow hostile mobs nearby',
      pathway: 'hermit', sequenceNumber: 9, isPassive: false,
      abilityRef: { class: 'MysteryPryerSequence', method: 'useDetectHostiles' },
      resetCooldownRefs: [{ class: 'MysteryPryerSequence', mapProperty: 'detectCooldowns' }]
    },
    // graze_mystery_pryer_ore_sense removed 2026-08-08 — claimed to be
    // "handled via mystery_pryer passive ore scan" but MysteryPryerSequence
    // has no ore-sense passive at all (its aura scan detects beyonders/
    // hostiles, not ores). Was a dead, non-functional entry.
  ],

  'lotm:hermit_characteristic_seq8': [
    {
      id: 'graze_melee_scholar_insight',
      name: '§bCombat Insight',
      description: 'Analyse weapon and apply combat buffs (20s)',
      pathway: 'hermit', sequenceNumber: 8, isPassive: false,
      // MeleeScholarSequence.tickAbilityState now runs unconditionally for
      // every player from main.js — ticks insightCooldowns.
      abilityRef: { class: 'MeleeScholarSequence', method: 'useCombatInsight' },
      resetCooldownRefs: [{ class: 'MeleeScholarSequence', mapProperty: 'insightCooldowns' }]
    },
    {
      id: 'graze_melee_scholar_martial_study',
      name: '§cMartial Study',
      description: 'All-arts combat surge (5s)',
      pathway: 'hermit', sequenceNumber: 8, isPassive: false,
      abilityRef: { class: 'MeleeScholarSequence', method: 'useMartialStudy' },
      resetCooldownRefs: [{ class: 'MeleeScholarSequence', mapProperty: 'studyCooldowns' }]
    },
    {
      id: 'graze_melee_scholar_strength',
      name: '§cScholar Strength',
      description: 'Strength I permanent',
      pathway: 'hermit', sequenceNumber: 8, isPassive: true,
      passiveEffects: [{ effect: 'strength', amplifier: 0 }]
    },
  ],

  'lotm:hermit_characteristic_seq7': [
    // All 9 entries route through castSpellNoPowder (2026-08-09) instead of
    // calling the private _castX methods directly — the old entries called
    // those methods directly, which skip SpiritSystem.consumeSpirit
    // entirely (that only happens in castSpell/castSpellNoPowder, before
    // dispatching to them), so grazing was completely free. The design
    // intent (confirmed by user) is that grazed/high-sequence casting
    // skips the powder requirement, same as
    // ConstellationsMasterSequence.castWarlockSpellFree, but should still
    // cost spirit like every other grazed ability. castCooldowns is
    // Warlock's shared global 1s cast GCD (flat, player.name-keyed);
    // spellCooldowns is per-spell but composite-keyed
    // `${player.name}_${spellId}`, so it needs resetCooldownCall
    // (resetSpellCooldown) rather than the generic resetCooldownRefs.
    {
      id: 'graze_warlock_hand_of_force',
      name: '§5Hand of Force',
      description: 'Grab & move entities (cast again to release)',
      pathway: 'hermit', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'WarlockSequence', method: 'castSpellNoPowder', args: ['hand_of_force'] },
      resetCooldownRefs: [{ class: 'WarlockSequence', mapProperty: 'castCooldowns' }],
      resetCooldownCall: [{ class: 'WarlockSequence', method: 'resetSpellCooldown', args: ['hand_of_force'] }]
    },
    {
      id: 'graze_warlock_exorcism',
      name: '§fExorcism',
      description: 'Cause undead to flee in terror',
      pathway: 'hermit', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'WarlockSequence', method: 'castSpellNoPowder', args: ['exorcism'] },
      resetCooldownRefs: [{ class: 'WarlockSequence', mapProperty: 'castCooldowns' }],
      resetCooldownCall: [{ class: 'WarlockSequence', method: 'resetSpellCooldown', args: ['exorcism'] }]
    },
    {
      id: 'graze_warlock_flames',
      name: '§cFlames',
      description: 'Fire bolt that ignites targets',
      pathway: 'hermit', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'WarlockSequence', method: 'castSpellNoPowder', args: ['flames'] },
      resetCooldownRefs: [{ class: 'WarlockSequence', mapProperty: 'castCooldowns' }],
      resetCooldownCall: [{ class: 'WarlockSequence', method: 'resetSpellCooldown', args: ['flames'] }]
    },
    {
      id: 'graze_warlock_purification',
      name: '§aPurification',
      description: 'AOE remove debuffs + minor heal',
      pathway: 'hermit', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'WarlockSequence', method: 'castSpellNoPowder', args: ['purification'] },
      resetCooldownRefs: [{ class: 'WarlockSequence', mapProperty: 'castCooldowns' }],
      resetCooldownCall: [{ class: 'WarlockSequence', method: 'resetSpellCooldown', args: ['purification'] }]
    },
    {
      id: 'graze_warlock_lightning',
      name: '§eLightning',
      description: 'Strike target with lightning bolt',
      pathway: 'hermit', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'WarlockSequence', method: 'castSpellNoPowder', args: ['lightning'] },
      resetCooldownRefs: [{ class: 'WarlockSequence', mapProperty: 'castCooldowns' }],
      resetCooldownCall: [{ class: 'WarlockSequence', method: 'resetSpellCooldown', args: ['lightning'] }]
    },
    {
      id: 'graze_warlock_sea_wave',
      name: '§bSea Wave',
      description: 'Water breathing + swift swimming (30s)',
      pathway: 'hermit', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'WarlockSequence', method: 'castSpellNoPowder', args: ['sea_wave'] },
      resetCooldownRefs: [{ class: 'WarlockSequence', mapProperty: 'castCooldowns' }],
      resetCooldownCall: [{ class: 'WarlockSequence', method: 'resetSpellCooldown', args: ['sea_wave'] }]
    },
    {
      id: 'graze_warlock_earth_wall',
      name: '§6Earth Wall',
      description: 'Raise a 3x3 cobblestone wall ahead',
      pathway: 'hermit', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'WarlockSequence', method: 'castSpellNoPowder', args: ['earth_wall'] },
      resetCooldownRefs: [{ class: 'WarlockSequence', mapProperty: 'castCooldowns' }],
      resetCooldownCall: [{ class: 'WarlockSequence', method: 'resetSpellCooldown', args: ['earth_wall'] }]
    },
    {
      id: 'graze_warlock_ore_sense',
      name: '§7Ore Sense',
      description: 'Detect ores within 16 blocks, with directions',
      pathway: 'hermit', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'WarlockSequence', method: 'castSpellNoPowder', args: ['ore_sense'] },
      resetCooldownRefs: [{ class: 'WarlockSequence', mapProperty: 'castCooldowns' }],
      resetCooldownCall: [{ class: 'WarlockSequence', method: 'resetSpellCooldown', args: ['ore_sense'] }]
    },
    {
      id: 'graze_warlock_tunnel',
      name: '§8Tunnel',
      description: 'Instantly clear 3x3x2 ahead, blocks dropped',
      pathway: 'hermit', sequenceNumber: 7, isPassive: false,
      abilityRef: { class: 'WarlockSequence', method: 'castSpellNoPowder', args: ['tunnel'] },
      resetCooldownRefs: [{ class: 'WarlockSequence', mapProperty: 'castCooldowns' }],
      resetCooldownCall: [{ class: 'WarlockSequence', method: 'resetSpellCooldown', args: ['tunnel'] }]
    },
  ],

  'lotm:hermit_characteristic_seq6': [
    // All 10 entries route through castScrollNoItem (2026-08-09) instead
    // of castScroll — a grazer shouldn't need to stockpile Scroll-
    // Professor-specific consumable scroll items for an ability they're
    // borrowing, but it still costs spirit (discounted like every other
    // grazed ability), same reasoning as Warlock's castSpellNoPowder
    // above. No cooldown Maps exist for scrolls at all (only real item
    // consumption gated the originals) so there's nothing to reset. The
    // old tickRefs entries (Storm/Force Field) are dropped — their ongoing
    // processing now ticks unconditionally via
    // ScrollProfessorSequence.tickAbilityState.
    {
      id: 'graze_scroll_professor_burning',
      name: '§cBurning',
      description: 'Slow fireball — explodes on impact',
      pathway: 'hermit', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ScrollProfessorSequence', method: 'castScrollNoItem', args: ['scroll_burning'] }
    },
    {
      id: 'graze_scroll_professor_sun',
      name: '§eSun',
      description: 'Large AOE purification + holy damage to undead',
      pathway: 'hermit', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ScrollProfessorSequence', method: 'castScrollNoItem', args: ['scroll_sun'] }
    },
    {
      id: 'graze_scroll_professor_healing',
      name: '§aHealing',
      description: 'Heal yourself and nearby allies',
      pathway: 'hermit', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ScrollProfessorSequence', method: 'castScrollNoItem', args: ['scroll_healing'] }
    },
    {
      id: 'graze_scroll_professor_freeze',
      name: '§bFreeze',
      description: 'Ice bolt — slows, freezes water/lava',
      pathway: 'hermit', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ScrollProfessorSequence', method: 'castScrollNoItem', args: ['scroll_freeze'] }
    },
    {
      id: 'graze_scroll_professor_storm',
      name: '§9Storm',
      description: 'Rain + lightning strikes hostiles for 30s',
      pathway: 'hermit', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ScrollProfessorSequence', method: 'castScrollNoItem', args: ['scroll_storm'] }
    },
    {
      id: 'graze_scroll_professor_force_field',
      name: '§bForce Field',
      description: '3x3 barrier around you for 20s',
      pathway: 'hermit', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ScrollProfessorSequence', method: 'castScrollNoItem', args: ['scroll_force_field'] }
    },
    {
      id: 'graze_scroll_professor_armour',
      name: '§6Armour',
      description: 'Resistance + absorption buff for 20s',
      pathway: 'hermit', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ScrollProfessorSequence', method: 'castScrollNoItem', args: ['scroll_armour'] }
    },
    {
      id: 'graze_scroll_professor_raise_earth',
      name: '§6Raise Earth',
      description: 'Raise a 3x3 platform under your feet',
      pathway: 'hermit', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ScrollProfessorSequence', method: 'castScrollNoItem', args: ['scroll_raise_earth'] }
    },
    {
      id: 'graze_scroll_professor_slow_fall',
      name: '§bSlow Fall',
      description: 'Apply Slow Falling to self or targeted entity (15s)',
      pathway: 'hermit', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ScrollProfessorSequence', method: 'castScrollNoItem', args: ['scroll_slow_fall'] }
    },
    {
      id: 'graze_scroll_professor_earth_spike',
      name: '§6Earth Spike',
      description: 'Launch 3 dripstone spikes at your target',
      pathway: 'hermit', sequenceNumber: 6, isPassive: false,
      abilityRef: { class: 'ScrollProfessorSequence', method: 'castScrollNoItem', args: ['scroll_earth_spike'] }
    },
  ],

  // seq4 (Mysticologist) intentionally has no graze entries — no mob in
  // the game actually drops that characteristic, so grazing it isn't
  // reachable in practice (2026-08-09 user confirmation).
  'lotm:hermit_characteristic_seq5': [
    {
      id: 'graze_constellations_starlight_cage',
      name: '§bStarlight Cage',
      description: 'Bind your target in stellar amber (8s)',
      pathway: 'hermit', sequenceNumber: 5, isPassive: false,
      // ConstellationsMasterSequence.tickAbilityState now runs
      // unconditionally for every player from main.js — ticks all 8
      // cooldown Maps + cage/bridge/lantern ongoing processing.
      abilityRef: { class: 'ConstellationsMasterSequence', method: 'useStarlightCage' },
      resetCooldownRefs: [{ class: 'ConstellationsMasterSequence', mapProperty: 'cageCooldowns' }]
    },
    {
      id: 'graze_constellations_star_concealment',
      name: '§bStar Concealment',
      description: 'Invisibility for 15s',
      pathway: 'hermit', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ConstellationsMasterSequence', method: 'useStarConcealment' },
      resetCooldownRefs: [{ class: 'ConstellationsMasterSequence', mapProperty: 'concealCooldowns' }]
    },
    {
      id: 'graze_constellations_star_illumination',
      name: '§bStar Illumination',
      description: 'Light the targeted area (30s)',
      pathway: 'hermit', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ConstellationsMasterSequence', method: 'useStarIllumination' },
      resetCooldownRefs: [{ class: 'ConstellationsMasterSequence', mapProperty: 'illuminCooldowns' }]
    },
    {
      id: 'graze_constellations_star_bridge',
      name: '§bStar Bridge',
      description: 'Bridge forward up to 20 blocks (30s)',
      pathway: 'hermit', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ConstellationsMasterSequence', method: 'useStarBridge' },
      resetCooldownRefs: [{ class: 'ConstellationsMasterSequence', mapProperty: 'bridgeCooldowns' }]
    },
    {
      id: 'graze_constellations_star_pillar',
      name: '§bStar Pillar',
      description: 'Stellar nuke at your target — 40dmg + Wither II',
      pathway: 'hermit', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ConstellationsMasterSequence', method: 'useStarPillar' },
      resetCooldownRefs: [{ class: 'ConstellationsMasterSequence', mapProperty: 'pillarCooldowns' }]
    },
    {
      id: 'graze_constellations_night_blink',
      name: '§bNight Blink',
      description: 'Teleport up to 40 blocks forward',
      pathway: 'hermit', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ConstellationsMasterSequence', method: 'useNightBlink' },
      resetCooldownRefs: [{ class: 'ConstellationsMasterSequence', mapProperty: 'blinkCooldowns' }]
    },
    {
      id: 'graze_constellations_stellar_pull',
      name: '§bStellar Pull',
      description: 'Yank your target to you and stun it briefly',
      pathway: 'hermit', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ConstellationsMasterSequence', method: 'useStellarPull' },
      resetCooldownRefs: [{ class: 'ConstellationsMasterSequence', mapProperty: 'pullCooldowns' }]
    },
    {
      id: 'graze_constellations_spear_of_longinus',
      name: '§bSpear of Longinus',
      description: 'Piercing stellar lance — 30dmg + Wither, hits everything in its path',
      pathway: 'hermit', sequenceNumber: 5, isPassive: false,
      abilityRef: { class: 'ConstellationsMasterSequence', method: 'useSpearOfLonginus' },
      resetCooldownRefs: [{ class: 'ConstellationsMasterSequence', mapProperty: 'spearCooldowns' }]
    },
  ],
};

// ── Sequence class registry ──────────────────────────────────────────────
// Populated from main.js via registerSequenceClasses(). Avoids circular imports
// between this module and the many sequence class files it references above.
const _sequenceClassRegistry = {};

export function registerSequenceClasses(classMap) {
  for (const key of Object.keys(classMap)) {
    _sequenceClassRegistry[key] = classMap[key];
  }
}

// Temporarily makes the target ability's owning class + PathwayManager itself
// report the ability's real pathway/sequence, and discounts any spirit spent/
// refunded via SpiritSystem, for the duration of `fn`.
// Two different access-control styles exist across this codebase: some
// abilities gate via `this.hasSequence(player)` (patchable by overriding just
// that method), others check `PathwayManager.getPathway(player)` /
// `getSequence(player)` DIRECTLY inline (e.g. BardSequence's song methods) —
// patching only hasSequence does nothing for those. Patching PathwayManager
// itself covers both styles in one place, since hasSequence's own real
// implementation reads from PathwayManager anyway.
// consumeSpirit/restoreSpirit are patched together (not just consumeSpirit)
// so a failure-path refund (many use* methods call
// SpiritSystem.restoreSpirit(player, this.FULL_COST) using the ORIGINAL
// undiscounted constant when e.g. no targets are in range) matches what was
// actually taken — patching only consumeSpirit would let a grazer net-gain
// spirit every time that refund path fires.
function _withSpoofedAccess(cls, ability, fn) {
  const originalHasSequence = cls.hasSequence;
  const originalGetPathway = PathwayManager.getPathway;
  const originalGetSequence = PathwayManager.getSequence;
  const originalConsumeSpirit = SpiritSystem.consumeSpirit;
  const originalRestoreSpirit = SpiritSystem.restoreSpirit;

  cls.hasSequence = () => true;
  PathwayManager.getPathway = () => ability.pathway;
  PathwayManager.getSequence = () => ability.sequenceNumber;
  SpiritSystem.consumeSpirit = (player, amount) =>
    originalConsumeSpirit.call(SpiritSystem, player, Math.max(1, Math.round(amount * GRAZED_SPIRIT_COST_MULTIPLIER)));
  SpiritSystem.restoreSpirit = (player, amount) =>
    originalRestoreSpirit.call(SpiritSystem, player, Math.max(1, Math.round(amount * GRAZED_SPIRIT_COST_MULTIPLIER)));

  try {
    return fn();
  } finally {
    // Always restore — even if fn throws
    cls.hasSequence = originalHasSequence;
    PathwayManager.getPathway = originalGetPathway;
    PathwayManager.getSequence = originalGetSequence;
    SpiritSystem.consumeSpirit = originalConsumeSpirit;
    SpiritSystem.restoreSpirit = originalRestoreSpirit;
  }
}

// Clears any of the target ability's own internal cooldown Maps immediately
// after a successful grazed use, so only the grazer's own (short, flat)
// cooldown gates reuse instead of the source class's own — usually much
// longer — cooldown.
function _resetSourceCooldowns(player, ability) {
  if (ability?.resetCooldownRefs) {
    for (const ref of ability.resetCooldownRefs) {
      const cls = _sequenceClassRegistry[ref.class];
      const map = cls && cls[ref.mapProperty];
      if (map instanceof Map) map.delete(player.name);
    }
  }
  // resetCooldownCall: for cooldown state that isn't a static class Map
  // keyed by player.name (e.g. Red Priest's module-private Maps keyed by
  // player.id or `${player.id}:${spell}`) — calls a dedicated reset method
  // on the class instead of reaching into its storage directly.
  if (ability?.resetCooldownCall) {
    for (const ref of ability.resetCooldownCall) {
      const cls = _sequenceClassRegistry[ref.class];
      const method = cls && cls[ref.method];
      if (typeof method !== 'function') continue;
      try {
        if (ref.args && ref.args.length > 0) method.call(cls, player, ...ref.args);
        else method.call(cls, player);
      } catch (_) {
        // swallow — silent cooldown-reset helper, not a user-facing action
      }
    }
  }
}

// Dispatch to the appropriate sequence class method for a grazed ability.
// Takes the FULL ability object (not just abilityRef) — needed for the
// PathwayManager spoof and resetCooldownRefs.
export function dispatchGrazedAbility(player, ability) {
  const ref = ability.abilityRef;
  const cls = _sequenceClassRegistry[ref.class];
  if (!cls) {
    player.sendMessage(`§cGrazed ability class §7${ref.class}§c not registered.`);
    return false;
  }

  const method = cls[ref.method];
  if (typeof method !== 'function') {
    player.sendMessage(`§cGrazed ability method §7${ref.method}§c not found.`);
    return false;
  }

  let result;
  try {
    result = _withSpoofedAccess(cls, ability, () => {
      if (ref.args && ref.args.length > 0) {
        return method.call(cls, player, ...ref.args);
      }
      return method.call(cls, player);
    });
  } catch (e) {
    player.sendMessage(`§cError invoking grazed ability: §7${e.message || e}`);
    return false;
  }

  if (result !== false) _resetSourceCooldowns(player, ability);
  return result;
}

// Opens a menu-based grazed ability instead of firing a single effect — for
// abilities like Traveler's Log that need multiple interactive steps (pick a
// location, confirm, name a new one) a single abilityRef call can't
// represent. The target method is responsible for calling
// dispatchGrazedAbility itself for each real action inside the menu, so
// each one still gets the same spirit discount / pathway bypass /
// resetCooldownRefs treatment as any other grazed ability — this function
// just opens the door.
// ref.dataClass optionally names the underlying sequence class the menu
// operates on (e.g. TravelerSequence for Traveler's Log), resolved here and
// passed as a third argument — menu files receive their sequence class as
// an explicit parameter rather than importing it directly (avoids circular
// imports), so this keeps that same convention for the grazed variant.
export function dispatchGrazedMenu(player, ability) {
  const ref = ability.menuRef;
  const cls = _sequenceClassRegistry[ref.class];
  if (!cls) {
    player.sendMessage(`§cGrazed menu class §7${ref.class}§c not registered.`);
    return false;
  }

  const method = cls[ref.method];
  if (typeof method !== 'function') {
    player.sendMessage(`§cGrazed menu method §7${ref.method}§c not found.`);
    return false;
  }

  const dataClass = ref.dataClass ? _sequenceClassRegistry[ref.dataClass] : undefined;

  try {
    method.call(cls, player, ability, dataClass);
  } catch (e) {
    player.sendMessage(`§cError opening grazed menu: §7${e.message || e}`);
    return false;
  }
  return true;
}

// Called every tick for a currently-active grazed ability. Used to also
// drive per-ability `tickRefs` before every pathway was migrated to the
// `tickAbilityState` pattern (see the file header) — that handling was
// removed once the migration finished, since no registry entry sets
// `tickRefs` anymore and ongoing effects now tick on their own via each
// class's unconditional `tickAbilityState` call in main.js. What's left
// here is just the recurring cooldown-reset sweep below.
export function tickGrazedAbility(player, ability) {
  if (!ability) return;

  // Re-clear every tick, not just once right after dispatch — some source
  // abilities (e.g. Nightmare State/Dream Invasion/Nightmare Limbs, Requiem,
  // Agitate) only set their own cooldown Map entry when their ACTIVE
  // duration ends (inside their process* method), long after the initial
  // dispatch-time reset already ran. Clearing it every tick catches that
  // regardless of when the source sets it, so only the grazer's own short
  // flat cooldown ever gates reuse.
  _resetSourceCooldowns(player, ability);
}
