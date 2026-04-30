// ============================================
// SHEPHERD - SEQUENCE 5 HANGED MAN PATHWAY
// ============================================
// Grazing: consume a Beyonder Soul + Characteristic
// to permanently absorb one ability from that pathway.
// Max 10 active grazed abilities at once.
// Low-sequence grazes (seq 7+) grant permanent passive
// buffs that don't count toward the 10-ability cap.
// One grazed ability active at a time; switch via menu.
// All Rose Bishop / Shadow Ascetic / Listener /
// Secrets Suppliant abilities are inherited.
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { RoseBishopSequence } from './rose_bishop.js';
import { ShadowAsceticSequence } from './shadow_ascetic.js';
import { ListenerSequence } from './listener.js';
import { SecretsSuppliantSequence } from './secrets_suppliant.js';

export class ShepherdSequence {
  static SEQUENCE_NUMBER = 5;
  static PATHWAY = PathwayManager.PATHWAYS.HANGED_MAN;

  static EFFECT_DURATION = 999999;

  // ── Grazing system ────────────────────────────────────────────────────────
  static MAX_GRAZED_ABILITIES  = 10;
  // Dynamic property key — stores JSON array of grazed ability objects
  static GRAZED_ABILITIES_PROP = 'lotm:shepherd_grazed';
  // Dynamic property for the currently active grazed ability id
  static ACTIVE_GRAZED_PROP    = 'lotm:shepherd_active_grazed';
  // Dynamic property for permanent passive grazes (seq 7+ characteristics)
  static PASSIVE_GRAZES_PROP   = 'lotm:shepherd_passives';

  // Spirit cost to activate a grazed ability (half the original cost)
  // The soul does some of the work
  static GRAZED_ABILITY_SPIRIT_MULTIPLIER = 0.6;

  // Grazing costs spirit (the act of absorbing a soul is taxing)
  static GRAZE_SPIRIT_COST = 60;

  // ── Grazeable ability registry ────────────────────────────────────────────
  // Maps characteristic item id → array of ability definitions
  // Each ability: { id, name, description, sequenceNumber, isPassive, passiveEffects? }
  // isPassive: true = low-sequence buff (doesn't count toward cap)
  // passiveEffects: array of effect descriptors applied every tick
  static GRAZE_REGISTRY = {

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
        abilityRef: { class: 'MidnightPoetSequence', method: 'useSongOfFear' }
      },
      {
        id: 'graze_poet_song_pacify',
        name: '§5Song of Pacification',
        description: 'Calm hostile mobs',
        pathway: 'darkness', sequenceNumber: 8, isPassive: false,
        abilityRef: { class: 'MidnightPoetSequence', method: 'useSongOfPacification' }
      }
    ],
    'lotm:darkness_characteristic_seq7': [
      {
        id: 'graze_nightmare_state',
        name: '§5Nightmare State',
        description: 'Become incorporeal (20s)',
        pathway: 'darkness', sequenceNumber: 7, isPassive: false,
        abilityRef: { class: 'NightmareSequence', method: 'useNightmareState' }
      },
      {
        id: 'graze_nightmare_limbs',
        name: '§5Nightmare Limbs',
        description: 'Dark tentacles attack nearby',
        pathway: 'darkness', sequenceNumber: 7, isPassive: false,
        abilityRef: { class: 'NightmareSequence', method: 'useNightmareLimbs' }
      },
      {
        id: 'graze_dream_invasion',
        name: '§5Dream Invasion',
        description: 'Put targets to sleep',
        pathway: 'darkness', sequenceNumber: 7, isPassive: false,
        abilityRef: { class: 'NightmareSequence', method: 'useDreamInvasion' }
      }
    ],
    'lotm:darkness_characteristic_seq6': [
      {
        id: 'graze_soul_assurer_requiem',
        name: '§b Requiem',
        description: 'Suppress spirit bodies of targets',
        pathway: 'darkness', sequenceNumber: 6, isPassive: false,
        abilityRef: { class: 'SoulAssurerSequence', method: 'useRequiem' }
      },
      {
        id: 'graze_soul_assurer_agitate',
        name: '§b Agitate',
        description: 'Heighten enemy aggression',
        pathway: 'darkness', sequenceNumber: 6, isPassive: false,
        abilityRef: { class: 'SoulAssurerSequence', method: 'useAgitate' }
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
        abilityRef: { class: 'DawnPaladinSequence', method: 'useLightOfDawn' }
      },
      {
        id: 'graze_dawn_sword_of_light',
        name: '§6Sword of Light',
        description: 'Channel divine power into weapon',
        pathway: 'twilight_giant', sequenceNumber: 6, isPassive: false,
        abilityRef: { class: 'DawnPaladinSequence', method: 'useSwordOfLight' }
      }
    ],
    'lotm:twilight_giant_characteristic_seq5': [
      {
        id: 'graze_guardian_protection',
        name: '§6Guardian Protection',
        description: 'Dome of divine protection',
        pathway: 'twilight_giant', sequenceNumber: 5, isPassive: false,
        abilityRef: { class: 'GuardianSequence', method: 'useProtection' }
      }
    ],

    // ── DOOR pathway ──────────────────────────────────────────────────────
    'lotm:door_characteristic_seq9': [
      {
        id: 'graze_apprentice_door',
        name: '§5Door Opening',
        description: 'Open a spirit world door',
        pathway: 'door', sequenceNumber: 9, isPassive: false,
        abilityRef: { class: 'ApprenticeSequence', method: 'useDoorOpening' }
      }
    ],
    'lotm:door_characteristic_seq8': [
      {
        id: 'graze_trickmaster_flashbang',
        name: '§6Flashbang',
        description: 'Blind nearby targets',
        pathway: 'door', sequenceNumber: 8, isPassive: false,
        abilityRef: { class: 'TrickmasterSequence', method: 'useFlashbang' }
      },
      {
        id: 'graze_trickmaster_lightning',
        name: '§6Lightning Strike',
        description: 'Call down lightning',
        pathway: 'door', sequenceNumber: 8, isPassive: false,
        abilityRef: { class: 'TrickmasterSequence', method: 'useLightning' }
      },
      {
        id: 'graze_trickmaster_freeze',
        name: '§6Freeze',
        description: 'Freeze a target in place',
        pathway: 'door', sequenceNumber: 8, isPassive: false,
        abilityRef: { class: 'TrickmasterSequence', method: 'useFreeze' }
      }
    ],
    'lotm:door_characteristic_seq7': [
      {
        id: 'graze_astrologer_crystal_ball',
        name: '§5Crystal Ball Scry',
        description: 'Locate nearby structures',
        pathway: 'door', sequenceNumber: 7, isPassive: false,
        abilityRef: { class: 'AstrologerSequence', method: 'useCrystalBall' }
      }
    ],
    'lotm:door_characteristic_seq6': [
      {
        id: 'graze_scribe_record',
        name: '§5Scribe Record',
        description: 'Record an ability to tome',
        pathway: 'door', sequenceNumber: 6, isPassive: false,
        abilityRef: { class: 'ScribeSequence', method: 'useRecording' }
      }
    ],
    'lotm:door_characteristic_seq5': [
      {
        id: 'graze_traveler_portal',
        name: '§5Traveler Portal',
        description: 'Create a spirit world portal',
        pathway: 'door', sequenceNumber: 5, isPassive: false,
        abilityRef: { class: 'TravelerSequence', method: 'useSpiritFog' }
      }
    ],

    // ── DEATH pathway ─────────────────────────────────────────────────────
    'lotm:death_characteristic_seq9': [
      {
        id: 'graze_corpse_spirit_vision',
        name: '§8Spirit Vision',
        description: 'See and reveal nearby spirits',
        pathway: 'death', sequenceNumber: 9, isPassive: false,
        abilityRef: { class: 'CorpseCollectorSequence', method: 'useSpiritVision' }
      },
      {
        id: 'graze_corpse_undead_passive',
        name: '§8Undead Passive',
        description: 'Undead ignore you passively',
        pathway: 'death', sequenceNumber: 9, isPassive: true,
        passiveEffects: [] // handled by special case in applyPassiveGraze
      }
    ],

    // ── SUN pathway ───────────────────────────────────────────────────────
    'lotm:sun_characteristic_seq9': [
      {
        id: 'graze_bard_song_comfort',
        name: '§6Bard Song',
        description: 'Sing to buff nearby allies',
        pathway: 'sun', sequenceNumber: 9, isPassive: false,
        abilityRef: { class: 'BardSequence', method: 'useSelectedSong' }
      }
    ],
    'lotm:sun_characteristic_seq8': [
      {
        id: 'graze_light_suppliant_sunshine',
        name: '§eSunshine',
        description: 'Summon a beam of sunlight',
        pathway: 'sun', sequenceNumber: 8, isPassive: false,
        abilityRef: { class: 'LightSuppliantSequence', method: 'useSunshine' }
      }
    ],

    // ── SEER pathway ──────────────────────────────────────────────────────
    'lotm:seer_characteristic_seq9': [
      {
        id: 'graze_seer_spirit_vision',
        name: '§5Seer Spirit Vision',
        description: 'Toggle seer spirit sight',
        pathway: 'seer', sequenceNumber: 9, isPassive: false,
        abilityRef: { class: 'SeerSequence', method: 'handleAbilityUse', args: ['spirit_vision'] }
      }
    ],
    'lotm:seer_characteristic_seq8': [
      {
        id: 'graze_clown_feint',
        name: '§cFeint Strike',
        description: 'Strike from unexpected angle',
        pathway: 'seer', sequenceNumber: 8, isPassive: false,
        abilityRef: { class: 'ClownSequence', method: 'handleAbilityUse', args: ['feint_strike'] }
      }
    ],
    'lotm:seer_characteristic_seq7': [
      {
        id: 'graze_magician_air_bullet',
        name: '§9Air Bullet',
        description: 'Fire a compressed air projectile',
        pathway: 'seer', sequenceNumber: 7, isPassive: false,
        abilityRef: { class: 'MagicianSequence', method: 'handleAbilityUse', args: ['air_bullet'] }
      },
      {
        id: 'graze_magician_flaming_jump',
        name: '§9Flaming Jump',
        description: 'Explosive jump launch',
        pathway: 'seer', sequenceNumber: 7, isPassive: false,
        abilityRef: { class: 'MagicianSequence', method: 'handleAbilityUse', args: ['flaming_jump'] }
      }
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
    'lotm:justiciar_characteristic_seq8': [
      {
        id: 'graze_sheriff_badge',
        name: '§eSheriff Presence',
        description: 'Exert lawful authority',
        pathway: 'justiciar', sequenceNumber: 8, isPassive: false,
        abilityRef: { class: 'SheriffSequence', method: 'useBadge', args: [false] }
      }
    ],
  };

  // ── Ability identifiers ──────────────────────────────────────────────────
  static ABILITIES = {
    // Inherited chain (all Rose Bishop abilities)
    CONSUME_FLESH:       RoseBishopSequence.ABILITIES.CONSUME_FLESH,
    FLESH_BOMB:          RoseBishopSequence.ABILITIES.FLESH_BOMB,
    FLESH_CURSE:         RoseBishopSequence.ABILITIES.FLESH_CURSE,
    SHADOW_SUMMON:       ShadowAsceticSequence.ABILITIES.SHADOW_SUMMON,
    SHADOW_CURSE:        ShadowAsceticSequence.ABILITIES.SHADOW_CURSE,
    SHADOW_MANIPULATION: ShadowAsceticSequence.ABILITIES.SHADOW_MANIPULATION,
    SHADOW_LURKING:      ShadowAsceticSequence.ABILITIES.SHADOW_LURKING,
    SHADOW_SHAPING:      ShadowAsceticSequence.ABILITIES.SHADOW_SHAPING,
    TOGGLE_LISTEN:       ShadowAsceticSequence.ABILITIES.TOGGLE_LISTEN,
    FOCUSED_LISTEN:      ListenerSequence.ABILITIES.FOCUSED_LISTEN,
    SUPPRESS_VOICES:     ListenerSequence.ABILITIES.SUPPRESS_VOICES,
    DIVINATION:          SecretsSuppliantSequence.ABILITIES.DIVINATION,
    ENCHANTMENT_INSCRIPTION: SecretsSuppliantSequence.ABILITIES.ENCHANTMENT_INSCRIPTION,
    AURA_READING:        SecretsSuppliantSequence.ABILITIES.AURA_READING,
    // New
    GRAZE:               'graze',           // Open the grazing menu
    USE_GRAZED:          'use_grazed',      // Use current active grazed ability
    MANAGE_GRAZED:       'manage_grazed',   // Open grazing management menu
  };

  // ── State maps ───────────────────────────────────────────────────────────
  static selectedAbilities = new Map();
  static SELECTED_ABILITY_PROPERTY = 'lotm:shepherd_selected_ability';

  // Per-grazed-ability cooldowns: key = `${playerName}_${abilityId}`
  static grazedCooldowns = new Map();

  // =============================================
  // SEQUENCE CHECK
  // =============================================
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // =============================================
  // SELECTED ABILITY (own item)
  // =============================================
  static getSelectedAbility(player) {
    if (!this.selectedAbilities.has(player.name)) {
      try {
        const saved = player.getDynamicProperty(this.SELECTED_ABILITY_PROPERTY);
        if (saved) this.selectedAbilities.set(player.name, saved);
      } catch (e) {}
    }
    return this.selectedAbilities.get(player.name) || this.ABILITIES.GRAZE;
  }

  static setSelectedAbility(player, abilityId) {
    this.selectedAbilities.set(player.name, abilityId);
    try { player.setDynamicProperty(this.SELECTED_ABILITY_PROPERTY, abilityId); } catch (e) {}
  }

  static useSelectedAbility(player) {
    return this.handleAbilityUse(player, this.getSelectedAbility(player));
  }

  // =============================================
  // GRAZED ABILITIES STORAGE
  // Stored as JSON in a dynamic property.
  // Format: [{id, name, pathway, sequenceNumber, isPassive}]
  // =============================================
  static getGrazedAbilities(player) {
    try {
      const raw = player.getDynamicProperty(this.GRAZED_ABILITIES_PROP);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  static saveGrazedAbilities(player, abilities) {
    try {
      player.setDynamicProperty(this.GRAZED_ABILITIES_PROP, JSON.stringify(abilities));
    } catch (e) {
      player.sendMessage('§cFailed to save grazed abilities — dynamic property error.');
    }
  }

  static getActiveGrazedId(player) {
    try {
      return player.getDynamicProperty(this.ACTIVE_GRAZED_PROP) || null;
    } catch (e) { return null; }
  }

  static setActiveGrazedId(player, abilityId) {
    try { player.setDynamicProperty(this.ACTIVE_GRAZED_PROP, abilityId || ''); } catch (e) {}
  }

  static getPassiveGrazes(player) {
    try {
      const raw = player.getDynamicProperty(this.PASSIVE_GRAZES_PROP);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  static savePassiveGrazes(player, passives) {
    try {
      player.setDynamicProperty(this.PASSIVE_GRAZES_PROP, JSON.stringify(passives));
    } catch (e) {}
  }

  // =============================================
  // PASSIVE ABILITIES
  // =============================================
  static applyPassiveAbilities(player) {
    // ── Base stats (Seq 5 — further improved) ────────────────────────────
    const nv = player.getEffect('night_vision');
    if (!nv || nv.duration < 200)
      player.addEffect('night_vision', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });

    // Speed II, Strength II, Jump II, Resistance II
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== 1 || speed.duration < 200)
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: 1, showParticles: false });

    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== 1 || strength.duration < 200)
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: 1, showParticles: false });

    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== 1 || jump.duration < 200)
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: 1, showParticles: false });

    const res = player.getEffect('resistance');
    if (!res || res.amplifier !== 1 || res.duration < 200)
      player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: 1, showParticles: false });

    // Health bonus — 4 extra hearts (8 hp)
    const hb = player.getEffect('health_boost');
    if (!hb || hb.amplifier !== 2 || hb.duration < 200)
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier: 2, showParticles: false });

    // ── Apply permanent passive grazes ────────────────────────────────────
    this._applyPassiveGrazes(player);

    // ── Inherited RoseBishop logic (madness, flesh hunger, etc.) ─────────
    RoseBishopSequence.applyPassiveAbilities(player);

    // ── Tick grazed ability cooldowns ─────────────────────────────────────
    this._tickGrazedCooldowns(player);

    // ── Action bar (override Rose Bishop's to include grazed info) ────────
    const hunger     = RoseBishopSequence.getFleshHunger(player);
    const madness    = Math.floor(ListenerSequence.getMadness(player));
    const mStage     = ListenerSequence.getMadnessStage(player);
    const mLabel     = ListenerSequence.getMadnessLabel(mStage);
    const spirit     = Math.floor(SpiritSystem.getSpirit(player));
    const maxSpirit  = SpiritSystem.getMaxSpirit(player);
    const listenStr  = ShadowAsceticSequence.isListenActive(player) ? '§5👂' : '§7🔇';

    const grazedList  = this.getGrazedAbilities(player);
    const activeId    = this.getActiveGrazedId(player);
    const activeGrazed = activeId ? grazedList.find(function(g) { return g.id === activeId; }) : null;
    const grazedStr   = activeGrazed
      ? `§7Grazed: §d${activeGrazed.name} §7(${grazedList.length}/${this.MAX_GRAZED_ABILITIES})`
      : `§7Grazed: §8None (${grazedList.length}/${this.MAX_GRAZED_ABILITIES})`;

    player.onScreenDisplay.setActionBar(
      `§bSpirit: §f${spirit}§7/§f${maxSpirit}  ${listenStr}  §cFlesh: §f${Math.floor(hunger)}§7/100` +
      `\n§7Mind: ${mLabel} (${madness}/100)  ${grazedStr}`
    );
  }

  // =============================================
  // APPLY PERMANENT PASSIVE GRAZES
  // Called each passive tick.
  // =============================================
  static _applyPassiveGrazes(player) {
    const passives = this.getPassiveGrazes(player);
    for (let i = 0; i < passives.length; i++) {
      const passive = passives[i];

      // Special case: undead ignore passive
      if (passive.id === 'graze_corpse_undead_passive') {
        // Kill phantoms, weaken nearby undead (same as CorpseCollectorSequence)
        try {
          const phantoms = player.dimension.getEntities({
            type: 'minecraft:phantom',
            location: player.location,
            maxDistance: 32
          });
          for (const p of phantoms) { try { p.kill(); } catch (e) {} }
        } catch (e) {}
        continue;
      }

      // Apply effect buffs
      if (!passive.passiveEffects) continue;
      for (let j = 0; j < passive.passiveEffects.length; j++) {
        const eff = passive.passiveEffects[j];
        try {
          const existing = player.getEffect(eff.effect);
          if (!existing || existing.amplifier < eff.amplifier || existing.duration < 200) {
            player.addEffect(eff.effect, this.EFFECT_DURATION, {
              amplifier: eff.amplifier,
              showParticles: false
            });
          }
        } catch (e) {}
      }
    }
  }

  // =============================================
  // GRAZING SYSTEM
  // =============================================

  /**
   * Called from main.js when player uses lotm:beyonder_soul item.
   * Checks inventory for a characteristic to pair with.
   * Opens a selection menu (via ShepherdMenus in menus file).
   * Returns the list of available abilities for the characteristic found.
   */
  static initiateGraze(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou must be a Shepherd to graze souls!');
      return null;
    }

    // Find a characteristic in inventory
    const charFound = this._findCharacteristicInInventory(player);
    if (!charFound) {
      player.sendMessage('§cYou need a Beyonder Characteristic in your inventory to graze!');
      player.sendMessage('§7Characteristics drop from monsters and beyonder players.');
      return null;
    }

    const availableAbilities = this.GRAZE_REGISTRY[charFound.typeId];
    if (!availableAbilities || availableAbilities.length === 0) {
      player.sendMessage(`§cNo graze abilities defined for: §7${charFound.typeId}`);
      return null;
    }

    // Check spirit cost
    if (SpiritSystem.getSpirit(player) < this.GRAZE_SPIRIT_COST) {
      player.sendMessage(`§cNot enough spirit! Grazing requires §b${this.GRAZE_SPIRIT_COST} spirit.`);
      return null;
    }

    // Check active ability cap (passives don't count)
    const currentGrazed  = this.getGrazedAbilities(player);
    const activeCount    = currentGrazed.filter(function(g) { return !g.isPassive; }).length;
    const passiveAbilities = availableAbilities.filter(function(a) { return a.isPassive; });
    const activeAbilities  = availableAbilities.filter(function(a) { return !a.isPassive; });

    // Filter out already grazed abilities
    const allGrazed     = this.getGrazedAbilities(player).concat(this.getPassiveGrazes(player));
    const alreadyGrazed = allGrazed.map(function(g) { return g.id; });

    const availableActive  = activeAbilities.filter(function(a) { return alreadyGrazed.indexOf(a.id) === -1; });
    const availablePassive = passiveAbilities.filter(function(a) { return alreadyGrazed.indexOf(a.id) === -1; });

    if (availableActive.length === 0 && availablePassive.length === 0) {
      player.sendMessage('§cYou have already grazed all available abilities from this characteristic!');
      return null;
    }

    if (activeCount >= this.MAX_GRAZED_ABILITIES && availablePassive.length === 0) {
      player.sendMessage(`§cYou have reached the maximum of ${this.MAX_GRAZED_ABILITIES} grazed abilities!`);
      player.sendMessage('§7Remove an ability first using the Graze Management menu.');
      return null;
    }

    return {
      characteristicTypeId: charFound.typeId,
      characteristicSlot:   charFound.slot,
      availableActive,
      availablePassive,
      activeCount,
      maxActive: this.MAX_GRAZED_ABILITIES
    };
  }

  /**
   * Called after player selects an ability from the graze menu.
   * Consumes the soul + characteristic and registers the ability.
   */
  static confirmGraze(player, characteristicSlot, chosenAbility) {
    if (!this.hasSequence(player)) return false;

    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.GRAZE_SPIRIT_COST)) {
      player.sendMessage('§cNot enough spirit!');
      return false;
    }

    // Consume the beyonder soul from inventory
    if (!this._consumeItem(player, 'lotm:beyonder_soul')) {
      player.sendMessage('§cBeyonder Soul missing from inventory!');
      SpiritSystem.restoreSpirit(player, this.GRAZE_SPIRIT_COST);
      return false;
    }

    // Consume the characteristic
    const inv = player.getComponent('minecraft:inventory');
    if (inv && inv.container) {
      const item = inv.container.getItem(characteristicSlot);
      if (item) {
        if (item.amount > 1) {
          item.amount -= 1;
          inv.container.setItem(characteristicSlot, item);
        } else {
          inv.container.setItem(characteristicSlot, undefined);
        }
      }
    }

    // Register the ability
    if (chosenAbility.isPassive) {
      const passives = this.getPassiveGrazes(player);
      passives.push({
        id:             chosenAbility.id,
        name:           chosenAbility.name,
        description:    chosenAbility.description,
        pathway:        chosenAbility.pathway,
        sequenceNumber: chosenAbility.sequenceNumber,
        isPassive:      true,
        passiveEffects: chosenAbility.passiveEffects || []
      });
      this.savePassiveGrazes(player, passives);
      player.sendMessage(`§a§lGRAZED: ${chosenAbility.name}`);
      player.sendMessage(`§7This passive buff is now permanently active.`);
    } else {
      const grazed = this.getGrazedAbilities(player);
      grazed.push({
        id:             chosenAbility.id,
        name:           chosenAbility.name,
        description:    chosenAbility.description,
        pathway:        chosenAbility.pathway,
        sequenceNumber: chosenAbility.sequenceNumber,
        isPassive:      false,
        abilityRef:     chosenAbility.abilityRef
      });
      this.saveGrazedAbilities(player, grazed);

      // Auto-set as active if none currently active
      if (!this.getActiveGrazedId(player)) {
        this.setActiveGrazedId(player, chosenAbility.id);
      }

      player.sendMessage(`§a§lGRAZED: ${chosenAbility.name}`);
      player.sendMessage(`§7Ability stored. Use §eGraze Management §7to activate it.`);
    }

    player.playSound('random.levelup', { pitch: 0.7, volume: 1.0 });
    this._spawnGrazeEffect(player);

    // Increase madness slightly (absorbing a soul has costs)
    ListenerSequence.setMadness(player,
      ListenerSequence.getMadness(player) + 6
    );

    return true;
  }

  /**
   * Remove a grazed ability by id.
   */
  static removeGrazedAbility(player, abilityId) {
    const grazed = this.getGrazedAbilities(player);
    const idx    = grazed.findIndex(function(g) { return g.id === abilityId; });
    if (idx === -1) {
      // Check passives
      const passives = this.getPassiveGrazes(player);
      const pidx = passives.findIndex(function(g) { return g.id === abilityId; });
      if (pidx !== -1) {
        passives.splice(pidx, 1);
        this.savePassiveGrazes(player, passives);
        player.sendMessage('§7Passive graze removed.');
        return true;
      }
      player.sendMessage('§cAbility not found in grazed list.');
      return false;
    }

    const removed = grazed[idx];
    grazed.splice(idx, 1);
    this.saveGrazedAbilities(player, grazed);

    // If this was the active one, clear it
    if (this.getActiveGrazedId(player) === abilityId) {
      const nextActive = grazed.length > 0 ? grazed[0].id : '';
      this.setActiveGrazedId(player, nextActive);
    }

    player.sendMessage(`§7Removed grazed ability: ${removed.name}`);
    return true;
  }

  /**
   * Use the currently active grazed ability.
   */
  static useActiveGrazedAbility(player) {
    const activeId = this.getActiveGrazedId(player);
    if (!activeId) {
      player.sendMessage('§cNo active grazed ability selected!');
      player.sendMessage('§7Use the Graze Management menu to select one.');
      return false;
    }

    const grazed = this.getGrazedAbilities(player);
    const ability = grazed.find(function(g) { return g.id === activeId; });
    if (!ability) {
      player.sendMessage('§cActive grazed ability not found. It may have been removed.');
      this.setActiveGrazedId(player, '');
      return false;
    }

    return this._invokeGrazedAbility(player, ability);
  }

  /**
   * Invoke a grazed ability by dispatching to the correct sequence class.
   * The abilityRef contains {class, method, args?} as strings.
   * We resolve the class from the global sequence registry.
   */
  static _invokeGrazedAbility(player, ability) {
    if (!ability.abilityRef) {
      player.sendMessage(`§cAbility ${ability.name} has no invocation reference.`);
      return false;
    }

    const ref = ability.abilityRef;

    // Cooldown check (use a per-ability cooldown)
    const cdKey = player.name + '_' + ability.id;
    const cdVal = this.grazedCooldowns.get(cdKey) || 0;
    if (cdVal > 0) {
      player.sendMessage(`§c${ability.name} on cooldown: §d${Math.ceil(cdVal / 20)}s`);
      return false;
    }

    // Reduced spirit cost (60% of original)
    // For grazed abilities we just check spirit — the actual consumption
    // is handled by each sequence's method
    const spiritAvail = SpiritSystem.getSpirit(player);
    if (spiritAvail < 10) {
      player.sendMessage('§cNot enough spirit!');
      return false;
    }

    // Dispatch to the right sequence class
    const result = this._dispatchToSequenceClass(player, ref);

    if (result !== false) {
      // Set a cooldown (10 seconds base for grazed abilities)
      this.grazedCooldowns.set(cdKey, 200);
      player.sendMessage(`§d[Grazed] §7${ability.name} activated`);
    }

    return result;
  }

  /**
   * Dispatch to the appropriate sequence class method.
   * Uses a string-based registry to avoid circular imports.
   */
  static _dispatchToSequenceClass(player, ref) {
    // We can't dynamically import here, so we dispatch via a known map
    // of class name → imported module. This map is populated by
    // ShepherdSequence.registerSequenceClasses() called from main.js.
    const cls = ShepherdSequence._sequenceClassRegistry[ref.class];
    if (!cls) {
      player.sendMessage(`§cGrazed ability class §7${ref.class}§c not registered.`);
      return false;
    }

    const method = cls[ref.method];
    if (typeof method !== 'function') {
      player.sendMessage(`§cGrazed ability method §7${ref.method}§c not found.`);
      return false;
    }

    try {
      if (ref.args && ref.args.length > 0) {
        return method.call(cls, player, ...ref.args);
      }
      return method.call(cls, player);
    } catch (e) {
      player.sendMessage(`§cError invoking grazed ability: §7${e.message || e}`);
      return false;
    }
  }

  // =============================================
  // SEQUENCE CLASS REGISTRY
  // Populated from main.js via registerSequenceClasses().
  // Avoids circular import issues.
  // =============================================
  static _sequenceClassRegistry = {};

  static registerSequenceClasses(classMap) {
    for (const key of Object.keys(classMap)) {
      ShepherdSequence._sequenceClassRegistry[key] = classMap[key];
    }
  }

  // =============================================
  // COOLDOWN TICK
  // =============================================
  static _tickGrazedCooldowns(player) {
    const prefix = player.name + '_';
    for (const [key, val] of this.grazedCooldowns) {
      if (key.startsWith(prefix) && val > 0) {
        this.grazedCooldowns.set(key, val - 1);
      }
    }
  }

  // =============================================
  // HELPER: find first characteristic in inventory
  // =============================================
  static _findCharacteristicInInventory(player) {
    const inv = player.getComponent('minecraft:inventory');
    if (!inv || !inv.container) return null;

    const knownChars = Object.keys(this.GRAZE_REGISTRY);
    for (let slot = 0; slot < 36; slot++) {
      const item = inv.container.getItem(slot);
      if (!item) continue;
      if (knownChars.indexOf(item.typeId) !== -1) {
        return { typeId: item.typeId, slot };
      }
    }
    return null;
  }

  static _consumeItem(player, typeId) {
    const inv = player.getComponent('minecraft:inventory');
    if (!inv || !inv.container) return false;
    for (let slot = 0; slot < 36; slot++) {
      const item = inv.container.getItem(slot);
      if (!item || item.typeId !== typeId) continue;
      if (item.amount > 1) { item.amount -= 1; inv.container.setItem(slot, item); }
      else { inv.container.setItem(slot, undefined); }
      return true;
    }
    return false;
  }

  // =============================================
  // VISUAL EFFECT — Grazing
  // =============================================
  static _spawnGrazeEffect(player) {
    const loc = player.location;
    const dim = player.dimension;
    for (let i = 0; i < 24; i++) {
      const delay = i * 2;
      const angle = (i / 24) * Math.PI * 4;
      const r     = 1.5;
      const h     = (i / 24) * 3;
      system.runTimeout(function() {
        try {
          dim.spawnParticle('minecraft:soul_particle', {
            x: loc.x + Math.cos(angle) * r,
            y: loc.y + h,
            z: loc.z + Math.sin(angle) * r
          });
          dim.spawnParticle('minecraft:portal', {
            x: loc.x + Math.cos(angle + 0.3) * r * 0.6,
            y: loc.y + h * 0.5,
            z: loc.z + Math.sin(angle + 0.3) * r * 0.6
          });
        } catch (e) {}
      }, delay);
    }
    try {
      player.playSound('mob.endermen.portal', { pitch: 0.4, volume: 1.0 });
    } catch (e) {}
  }

  // =============================================
  // ABILITY HANDLER
  // =============================================
  static handleAbilityUse(player, abilityId) {
    // Rose Bishop chain
    const roseAbilities = [
      RoseBishopSequence.ABILITIES.CONSUME_FLESH,
      RoseBishopSequence.ABILITIES.FLESH_BOMB,
      RoseBishopSequence.ABILITIES.FLESH_CURSE
    ];
    if (roseAbilities.indexOf(abilityId) !== -1)
      return RoseBishopSequence.handleAbilityUse(player, abilityId);

    // Shadow Ascetic chain
    const shadowAbilities = [
      ShadowAsceticSequence.ABILITIES.SHADOW_SUMMON,
      ShadowAsceticSequence.ABILITIES.SHADOW_CURSE,
      ShadowAsceticSequence.ABILITIES.SHADOW_MANIPULATION,
      ShadowAsceticSequence.ABILITIES.SHADOW_LURKING,
      ShadowAsceticSequence.ABILITIES.SHADOW_SHAPING,
      ShadowAsceticSequence.ABILITIES.TOGGLE_LISTEN
    ];
    if (shadowAbilities.indexOf(abilityId) !== -1)
      return ShadowAsceticSequence.handleAbilityUse(player, abilityId);

    // Listener chain
    if (abilityId === ListenerSequence.ABILITIES.FOCUSED_LISTEN ||
        abilityId === ListenerSequence.ABILITIES.SUPPRESS_VOICES)
      return ListenerSequence.handleAbilityUse(player, abilityId);

    // Secrets Suppliant chain
    if (abilityId === SecretsSuppliantSequence.ABILITIES.DIVINATION ||
        abilityId === SecretsSuppliantSequence.ABILITIES.ENCHANTMENT_INSCRIPTION ||
        abilityId === SecretsSuppliantSequence.ABILITIES.AURA_READING)
      return SecretsSuppliantSequence.handleAbilityUse(player, abilityId);

    // Shepherd own abilities
    switch (abilityId) {
      case this.ABILITIES.USE_GRAZED:
        return this.useActiveGrazedAbility(player);
      case this.ABILITIES.GRAZE:
        // This triggers the menu — handled in main.js via HangedManMenus
        player.sendMessage('§dSneak + use the Soul item to open the Grazing menu.');
        return true;
      case this.ABILITIES.MANAGE_GRAZED:
        // Handled via HangedManMenus
        player.sendMessage('§dSneak + use the powers item to manage grazed abilities.');
        return true;
      default:
        player.sendMessage('§cUnknown ability!');
        return false;
    }
  }

  // =============================================
  // ALL ABILITIES (for menu)
  // =============================================
  static getAllAbilities(player) {
    const grazed      = player ? this.getGrazedAbilities(player) : [];
    const activeId    = player ? this.getActiveGrazedId(player) : null;
    const passives    = player ? this.getPassiveGrazes(player) : [];

    const base = [
      // Shepherd
      { id: this.ABILITIES.USE_GRAZED,   name: '§dUse Grazed Ability',   cost: 0, category: 'Shepherd' },
      { id: this.ABILITIES.MANAGE_GRAZED,name: '§dManage Grazed',        cost: 0, category: 'Shepherd' },
      // Rose Bishop
      { id: RoseBishopSequence.ABILITIES.CONSUME_FLESH,   name: '§c🍖 Consume Flesh',      cost: 0,    category: 'Rose Bishop' },
      { id: RoseBishopSequence.ABILITIES.FLESH_BOMB,      name: '§4💣 Flesh Bomb',          cost: RoseBishopSequence.BOMB_SPIRIT_COST,  category: 'Rose Bishop' },
      { id: RoseBishopSequence.ABILITIES.FLESH_CURSE,     name: '§4🩸 Flesh Curse',         cost: RoseBishopSequence.CURSE_SPIRIT_COST, category: 'Rose Bishop' },
      // Shadow Ascetic
      { id: ShadowAsceticSequence.ABILITIES.SHADOW_SUMMON,       name: '§8🌑 Shadow Summon',       cost: ShadowAsceticSequence.SUMMON_SPIRIT_COST,  category: 'Shadow Ascetic' },
      { id: ShadowAsceticSequence.ABILITIES.SHADOW_CURSE,        name: '§8🩸 Shadow Curse',        cost: ShadowAsceticSequence.CURSE_SPIRIT_COST,   category: 'Shadow Ascetic' },
      { id: ShadowAsceticSequence.ABILITIES.SHADOW_MANIPULATION, name: '§8🌑 Shadow Manipulation', cost: ShadowAsceticSequence.MANIP_SPIRIT_COST,   category: 'Shadow Ascetic' },
      { id: ShadowAsceticSequence.ABILITIES.SHADOW_LURKING,      name: '§8👻 Shadow Lurking',      cost: ShadowAsceticSequence.LURK_SPIRIT_COST,    category: 'Shadow Ascetic' },
      { id: ShadowAsceticSequence.ABILITIES.SHADOW_SHAPING,      name: '§8⚔ Shadow Shaping',      cost: ShadowAsceticSequence.SHAPE_SPIRIT_COST,   category: 'Shadow Ascetic' },
      { id: ShadowAsceticSequence.ABILITIES.TOGGLE_LISTEN,       name: '§7🔇 Toggle Listen',       cost: 0,                                         category: 'Listener' },
      { id: ListenerSequence.ABILITIES.FOCUSED_LISTEN,           name: '§5👂 Focused Listen',      cost: ListenerSequence.FOCUSED_LISTEN_SPIRIT_COST, category: 'Listener' },
      { id: ListenerSequence.ABILITIES.SUPPRESS_VOICES,          name: '§b🌀 Suppress Voices',     cost: ListenerSequence.SUPPRESS_SPIRIT_COST,     category: 'Listener' },
      { id: SecretsSuppliantSequence.ABILITIES.DIVINATION,       name: '§5👁 Divination',          cost: SecretsSuppliantSequence.DIVINATION_SPIRIT_COST,          category: 'Secrets Suppliant' },
      { id: SecretsSuppliantSequence.ABILITIES.ENCHANTMENT_INSCRIPTION, name: '§d📖 Inscription', cost: SecretsSuppliantSequence.INSCRIPTION_SPIRIT_COST,          category: 'Secrets Suppliant' },
      { id: SecretsSuppliantSequence.ABILITIES.AURA_READING,     name: '§b✧ Aura Reading',         cost: SecretsSuppliantSequence.AURA_READ_SPIRIT_COST,            category: 'Secrets Suppliant' },
    ];

    // Append grazed abilities as their own category
    for (let i = 0; i < grazed.length; i++) {
      const g = grazed[i];
      base.push({
        id:       g.id,
        name:     (g.id === activeId ? '§a◉ ' : '§7○ ') + g.name,
        cost:     0,
        category: 'Grazed Souls'
      });
    }

    return base;
  }

  // =============================================
  // CLEAN UP
  // =============================================
  static removeEffects(player) {
    RoseBishopSequence.removeEffects(player);
    this.selectedAbilities.delete(player.name);
    // Clear grazed ability cooldowns for this player
    const prefix = player.name + '_';
    for (const key of this.grazedCooldowns.keys()) {
      if (key.startsWith(prefix)) this.grazedCooldowns.delete(key);
    }
  }
}
