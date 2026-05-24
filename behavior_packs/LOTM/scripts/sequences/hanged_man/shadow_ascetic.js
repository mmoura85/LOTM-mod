// ============================================
// SHADOW ASCETIC - SEQUENCE 7 HANGED MAN PATHWAY
// ============================================
// New abilities: Shadow Summon, Shadow Curse,
// Shadow Manipulation, Shadow Lurking,
// Shadow Shaping (shadow sword item)
// Strengthened: Listen can now be toggled off
// ============================================

import { world, system, ItemStack } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { ListenerSequence } from './listener.js';
import { SecretsSuppliantSequence } from './secrets_suppliant.js';

export class ShadowAsceticSequence {
  static SEQUENCE_NUMBER = 7;
  static PATHWAY = PathwayManager.PATHWAYS.HANGED_MAN;

  static EFFECT_DURATION = 999999;

  // ── Listen toggle ────────────────────────────────────────────────────────
  // At Seq 7, Listen is no longer always-on. Stored as a dynamic property.
  static LISTEN_ACTIVE_PROPERTY = 'lotm:shadow_listen_active';

  // ── Shadow Summon ────────────────────────────────────────────────────────
  static SUMMON_SPIRIT_COST = 45;
  static SUMMON_COOLDOWN    = 120;  // 6 seconds (reduced from 15)
  static SUMMON_COUNT       = 3;
  static SUMMON_RISK_CHANCE = 0.15;

  // ── Shadow Curse ─────────────────────────────────────────────────────────
  static CURSE_SPIRIT_COST  = 50;
  static CURSE_COOLDOWN     = 200;  // 10 seconds (reduced from 30)
  static CURSE_RANGE        = 12;
  static CURSE_DURATION     = 400;

  // ── Shadow Manipulation ──────────────────────────────────────────────────
  static MANIP_SPIRIT_COST  = 35;
  static MANIP_COOLDOWN     = 100;  // 5 seconds (reduced from 10)
  static MANIP_RANGE        = 16;
  static MANIP_DURATION     = 200;

  // ── Shadow Lurking ───────────────────────────────────────────────────────
  static LURK_SPIRIT_COST     = 30;
  static LURK_DRAIN_PER_CALL  = 0.5;
  static LURK_COOLDOWN        = 60;   // 3 seconds (reduced from 5)

  // ── Shadow Shaping ───────────────────────────────────────────────────────
  static SHAPE_SPIRIT_COST = 40;
  static SHAPE_COOLDOWN    = 100;  // 5 seconds (reduced from 10)
  // Gives the player a shadow sword item (lotm:shadow_sword)
  // which applies cold/degenerate effects on hit (handled via entityHitEntity)
  static SHADOW_SWORD_DURATION = 600; // ticks the sword lasts before vanishing

  // ── Ability identifiers ──────────────────────────────────────────────────
  static ABILITIES = {
    // Inherited
    DIVINATION:              SecretsSuppliantSequence.ABILITIES.DIVINATION,
    ENCHANTMENT_INSCRIPTION: SecretsSuppliantSequence.ABILITIES.ENCHANTMENT_INSCRIPTION,
    AURA_READING:            SecretsSuppliantSequence.ABILITIES.AURA_READING,
    FOCUSED_LISTEN:          ListenerSequence.ABILITIES.FOCUSED_LISTEN,
    SUPPRESS_VOICES:         ListenerSequence.ABILITIES.SUPPRESS_VOICES,
    // New
    SHADOW_SUMMON:           'shadow_summon',
    SHADOW_CURSE:            'shadow_curse',
    SHADOW_MANIPULATION:     'shadow_manipulation',
    SHADOW_LURKING:          'shadow_lurking',
    SHADOW_SHAPING:          'shadow_shaping',
    TOGGLE_LISTEN:           'toggle_listen',
  };

  // ── State maps ───────────────────────────────────────────────────────────
  static summonCooldowns  = new Map();
  static curseCooldowns   = new Map();
  static manipCooldowns   = new Map();
  static lurkCooldowns    = new Map();
  static shapeCooldowns   = new Map();

  // Active tracking
  static lurkActive          = new Map(); // playerName -> true
  static activeCurses        = new Map(); // playerName -> [{entityId, ticksRemaining}]
  static activeManipulations = new Map(); // playerName -> [{entityId, ticksRemaining}]
  static shadowSwordTicks    = new Map(); // playerName -> ticksRemaining

  // Selected ability
  static selectedAbilities = new Map();
  static SELECTED_ABILITY_PROPERTY = 'lotm:shadow_selected_ability';

  // =============================================
  // SEQUENCE CHECK
  // =============================================
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // =============================================
  // SELECTED ABILITY HELPERS
  // =============================================
  static getSelectedAbility(player) {
    if (!this.selectedAbilities.has(player.name)) {
      try {
        const saved = player.getDynamicProperty(this.SELECTED_ABILITY_PROPERTY);
        if (saved) this.selectedAbilities.set(player.name, saved);
      } catch (e) {}
    }
    return this.selectedAbilities.get(player.name) || this.ABILITIES.SHADOW_SUMMON;
  }

  static setSelectedAbility(player, abilityId) {
    this.selectedAbilities.set(player.name, abilityId);
    try { player.setDynamicProperty(this.SELECTED_ABILITY_PROPERTY, abilityId); } catch (e) {}
  }

  static useSelectedAbility(player) {
    return this.handleAbilityUse(player, this.getSelectedAbility(player));
  }

  // =============================================
  // LISTEN TOGGLE HELPERS
  // =============================================
  static isListenActive(player) {
    try {
      const val = player.getDynamicProperty(this.LISTEN_ACTIVE_PROPERTY);
      // Default to true (on) if never set
      return val === undefined || val === true;
    } catch (e) { return true; }
  }

  static setListenActive(player, active) {
    try { player.setDynamicProperty(this.LISTEN_ACTIVE_PROPERTY, active); } catch (e) {}
  }

  static toggleListen(player) {
    const current = this.isListenActive(player);
    const next    = !current;
    this.setListenActive(player, next);
    if (next) {
      player.sendMessage('§5👂 The voices return... you open your mind to the shadows.');
      player.playSound('mob.endermen.stare', { pitch: 0.4, volume: 0.8 });
    } else {
      player.sendMessage('§7🔇 You shut out the voices. Silence.');
      player.playSound('block.beacon.deactivate', { pitch: 1.4, volume: 0.6 });
    }
    return true;
  }

  // =============================================
  // PASSIVE ABILITIES (called every 4 ticks)
  // =============================================
  static applyPassiveAbilities(player) {
    // ── Inherit Seq 9 base stats ──────────────────────────────────────────
    // Night vision
    const nv = player.getEffect('night_vision');
    if (!nv || nv.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    // Seq 7: slight physical upgrades — Speed I, Strength I, Jump I
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== 0 || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== 0 || strength.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }
    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== 0 || jump.duration < 200) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }
    // Resistance I
    const res = player.getEffect('resistance');
    if (!res || res.amplifier !== 0 || res.duration < 200) {
      player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    // Health bonus — 2 extra hearts (improved from Seq 8)
    const hb = player.getEffect('health_boost');
    if (!hb || hb.amplifier !== 0 || hb.duration < 200) {
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    // ── Madness tick (inherited, but Listen may be suppressed) ────────────
    ListenerSequence._tickMadness(player);

    // ── Conditional Listen tick ───────────────────────────────────────────
    if (this.isListenActive(player)) {
      ListenerSequence._tickListen(player);
      ListenerSequence._applyMadnessEffects(player);
    }

    // ── Spirit Perception passive scan (Seq 9 inherited) ─────────────────
    SecretsSuppliantSequence.runSpiritPerceptionPassive(player);

    // ── Shadow Lurking passive tick ───────────────────────────────────────
    if (this.lurkActive.has(player.name)) {
      this._processLurking(player);
    }

    // ── Shadow Curse tick ─────────────────────────────────────────────────
    this._processActiveCurses(player);

    // ── Shadow Manipulation tick ──────────────────────────────────────────
    this._processActiveManipulations(player);

    // ── Shadow Sword countdown ────────────────────────────────────────────
    this._processShadowSword(player);

    // ── Focused Listen / Suppress inherited ticks ─────────────────────────
    ListenerSequence._processFocusedListen(player);
    ListenerSequence._processSuppressVoices(player);

    // ── Cooldown ticks ────────────────────────────────────────────────────
    this._tickCooldowns(player);

    // ── Action bar ────────────────────────────────────────────────────────
    const stage      = ListenerSequence.getMadnessStage(player);
    const madness    = Math.floor(ListenerSequence.getMadness(player));
    const stageLabel = ListenerSequence.getMadnessLabel(stage);
    const spirit     = Math.floor(SpiritSystem.getSpirit(player));
    const maxSpirit  = SpiritSystem.getMaxSpirit(player);
    const listenStr  = this.isListenActive(player) ? '§5👂' : '§7🔇';
    const lurkStr    = this.lurkActive.has(player.name) ? ' §8[LURKING]' : '';
    player.onScreenDisplay.setActionBar(
      `§bSpirit: §f${spirit}§7/§f${maxSpirit}  ${listenStr}  Mind: ${stageLabel} §7(${madness}/100)${lurkStr}`
    );
  }

  // =============================================
  // ABILITY: SHADOW SUMMON
  // Summons lotm:shade entities near the caster.
  // Each shade has a small chance to be hostile to the caster.
  // =============================================
  static useShadowSummon(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    const cd = this._cdRemaining(this.summonCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cShadow Summon on cooldown: §8${cd}s`);
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.SUMMON_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §8${this.SUMMON_SPIRIT_COST}`);
      return false;
    }

    this.summonCooldowns.set(player.name, this.SUMMON_COOLDOWN);

    player.sendMessage('§8§l🌑 SHADOW SUMMON');
    player.playSound('mob.endermen.portal', { pitch: 0.3, volume: 1.0 });

    // Small madness cost — communing with shadow entities is risky
    ListenerSequence.setMadness(player, ListenerSequence.getMadness(player) + 5);

    let summonedCount = 0;
    let turnsOnCaster = false;

    for (let i = 0; i < this.SUMMON_COUNT; i++) {
      const angle   = (i / this.SUMMON_COUNT) * Math.PI * 2 + Math.random() * 0.5;
      const dist    = 2 + Math.random() * 2;
      const spawnLoc = {
        x: player.location.x + Math.cos(angle) * dist,
        y: player.location.y,
        z: player.location.z + Math.sin(angle) * dist
      };

      try {
        const shade = player.dimension.spawnEntity('lotm:shade', spawnLoc);
        summonedCount++;

        // Summon portal effect
        player.dimension.spawnParticle('minecraft:portal', spawnLoc);
        player.dimension.spawnParticle('minecraft:soul_particle', {
          x: spawnLoc.x, y: spawnLoc.y + 1, z: spawnLoc.z
        });

        // Risk check — this shade may be uncontrolled
        if (Math.random() < this.SUMMON_RISK_CHANCE) {
          turnsOnCaster = true;
          // Try to make the shade attack the player
          // We can't directly set target, but applying strength to the shade
          // near the player with no other targets makes it likely to attack
          try {
            shade.addEffect('strength', 200, { amplifier: 2, showParticles: true });
          } catch (e) {}
          system.runTimeout(() => {
            try {
              player.dimension.spawnParticle('minecraft:critical_hit_emitter', {
                x: shade.location.x, y: shade.location.y + 1, z: shade.location.z
              });
            } catch (e) {}
          }, 10);
        } else {
          // Friendly shade — set owner via command so it follows the player
          try {
            shade.runCommand(`mobevent lotm:shade_owned`);
          } catch (e) {
            // fallback: won't follow but will still fight nearby mobs
          }
        }
      } catch (e) {
        // Spawn may fail (e.g. no space)
      }
    }

    if (summonedCount > 0) {
      player.sendMessage(`§8${summonedCount} shadow(s) emerge from the darkness...`);
      if (turnsOnCaster) {
        player.sendMessage('§4One of the shadows refuses to be controlled!');
        player.playSound('mob.wither.idle', { pitch: 0.5, volume: 0.8 });
      }
    } else {
      player.sendMessage('§7The shadows resist your call...');
      SpiritSystem.restoreSpirit(player, this.SUMMON_SPIRIT_COST);
    }

    return true;
  }

  // =============================================
  // ABILITY: SHADOW CURSE
  // Consumes rotten_flesh OR lotm:spirit_blood
  // from the player's inventory as a ritual medium.
  // Curses the nearest entity within range.
  // =============================================
  static useShadowCurse(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    const cd = this._cdRemaining(this.curseCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cShadow Curse on cooldown: §8${cd}s`);
      return false;
    }

    // Check for curse medium in inventory
    const mediumConsumed = this._consumeCurseMedium(player);
    if (!mediumConsumed) {
      player.sendMessage('§cYou need §4Rotten Flesh §cor §4Spirit Blood §cto perform this curse!');
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.CURSE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §8${this.CURSE_SPIRIT_COST}`);
      // Refund medium
      this._giveCurseMedium(player, mediumConsumed);
      return false;
    }

    this.curseCooldowns.set(player.name, this.CURSE_COOLDOWN);

    // Find nearest entity in range (not the player)
    const target = this._findNearestTarget(player, this.CURSE_RANGE);
    if (!target) {
      player.sendMessage('§cNo target in range!');
      SpiritSystem.restoreSpirit(player, this.CURSE_SPIRIT_COST);
      return false;
    }

    // Apply curse
    const curseList = this.activeCurses.get(player.name) || [];
    curseList.push({ entityId: target.id, ticksRemaining: this.CURSE_DURATION });
    this.activeCurses.set(player.name, curseList);

    player.sendMessage(`§8§l🩸 SHADOW CURSE applied!`);
    player.sendMessage(`§8Cursed: §7${target.typeId.replace('minecraft:', '').replace('lotm:', '')}`);
    player.playSound('mob.wither.shoot', { pitch: 0.4, volume: 0.8 });

    // Visual — dark aura on target
    this._spawnCurseEffect(player.dimension, target.location);

    // Madness cost — dark ritual
    ListenerSequence.setMadness(player, ListenerSequence.getMadness(player) + 3);

    return true;
  }

  static _consumeCurseMedium(player) {
    const inventory = player.getComponent('minecraft:inventory');
    if (!inventory?.container) return null;

    const mediums = ['minecraft:rotten_flesh', 'lotm:spirit_blood'];
    for (let slot = 0; slot < 36; slot++) {
      const item = inventory.container.getItem(slot);
      if (!item) continue;
      if (mediums.includes(item.typeId)) {
        // Consume one
        if (item.amount > 1) {
          item.amount -= 1;
          inventory.container.setItem(slot, item);
        } else {
          inventory.container.setItem(slot, undefined);
        }
        return item.typeId;
      }
    }
    return null;
  }

  static _giveCurseMedium(player, typeId) {
    try { player.runCommand(`give @s ${typeId} 1`); } catch (e) {}
  }

  static _processActiveCurses(player) {
    const curses = this.activeCurses.get(player.name);
    if (!curses || curses.length === 0) return;

    const remaining = [];

    for (const curse of curses) {
      curse.ticksRemaining--;
      if (curse.ticksRemaining <= 0) continue;

      // Find the entity
      let target = null;
      try {
        // Search in a large area — entity could have moved
        const entities = player.dimension.getEntities({
          location: player.location,
          maxDistance: 128
        });
        target = entities.find(e => e.id === curse.entityId) || null;
      } catch (e) {}

      if (!target) continue; // Entity gone

      // Apply curse effects every tick the curse is active
      try {
        target.addEffect('wither',   40, { amplifier: 0, showParticles: true });
        target.addEffect('slowness', 40, { amplifier: 2, showParticles: false });
        target.addEffect('weakness', 40, { amplifier: 1, showParticles: false });

        // Occasional blindness
        if (curse.ticksRemaining % 80 === 0) {
          target.addEffect('blindness', 40, { amplifier: 0, showParticles: false });
        }

        // Dark particles on cursed target every 20 ticks
        if (curse.ticksRemaining % 20 === 0) {
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            try {
              player.dimension.spawnParticle('minecraft:soul_particle', {
                x: target.location.x + Math.cos(a) * 0.5,
                y: target.location.y + 1,
                z: target.location.z + Math.sin(a) * 0.5
              });
            } catch (e) {}
          }
        }
      } catch (e) {}

      remaining.push(curse);
    }

    this.activeCurses.set(player.name, remaining);
  }

  static _spawnCurseEffect(dimension, location) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      system.runTimeout(() => {
        try {
          dimension.spawnParticle('minecraft:soul_particle', {
            x: location.x + Math.cos(a) * 1.0,
            y: location.y + 1,
            z: location.z + Math.sin(a) * 1.0
          });
          dimension.spawnParticle('minecraft:portal', {
            x: location.x + Math.cos(a) * 0.5,
            y: location.y + 0.5,
            z: location.z + Math.sin(a) * 0.5
          });
        } catch (e) {}
      }, i * 2);
    }
  }

  // =============================================
  // ABILITY: SHADOW MANIPULATION
  // Envelops the target in shadow — applies
  // a darkness/cold chrysalis effect.
  // Strong slowness + blindness + weakness.
  // =============================================
  static useShadowManipulation(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    const cd = this._cdRemaining(this.manipCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cShadow Manipulation on cooldown: §8${cd}s`);
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.MANIP_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §8${this.MANIP_SPIRIT_COST}`);
      return false;
    }

    const target = this._findNearestTarget(player, this.MANIP_RANGE);
    if (!target) {
      player.sendMessage('§cNo target in range!');
      SpiritSystem.restoreSpirit(player, this.MANIP_SPIRIT_COST);
      return false;
    }

    this.manipCooldowns.set(player.name, this.MANIP_COOLDOWN);

    // Track manipulation
    const manipList = this.activeManipulations.get(player.name) || [];
    manipList.push({ entityId: target.id, ticksRemaining: this.MANIP_DURATION });
    this.activeManipulations.set(player.name, manipList);

    player.sendMessage('§8§l🌑 SHADOW MANIPULATION');
    player.sendMessage(`§8The shadow chrysalis envelops your target!`);
    player.playSound('mob.endermen.portal', { pitch: 0.4, volume: 1.0 });

    // Apply initial strong blast of effects
    try {
      target.addEffect('slowness',  this.MANIP_DURATION, { amplifier: 5,  showParticles: false });
      target.addEffect('weakness',  this.MANIP_DURATION, { amplifier: 3,  showParticles: false });
      target.addEffect('blindness', this.MANIP_DURATION, { amplifier: 0,  showParticles: false });
      target.addEffect('darkness',  this.MANIP_DURATION, { amplifier: 0,  showParticles: true  });
    } catch (e) {}

    // Chrysalis visual — expanding dark shell
    this._spawnChrysalisEffect(player.dimension, target.location);

    return true;
  }

  static _processActiveManipulations(player) {
    const manips = this.activeManipulations.get(player.name);
    if (!manips || manips.length === 0) return;

    const remaining = [];

    for (const manip of manips) {
      manip.ticksRemaining--;
      if (manip.ticksRemaining <= 0) continue;

      let target = null;
      try {
        const entities = player.dimension.getEntities({
          location: player.location,
          maxDistance: 128
        });
        target = entities.find(e => e.id === manip.entityId) || null;
      } catch (e) {}

      if (!target) continue;

      // Refresh effects every 40 ticks
      if (manip.ticksRemaining % 40 === 0) {
        try {
          target.addEffect('slowness',  60, { amplifier: 5, showParticles: false });
          target.addEffect('weakness',  60, { amplifier: 3, showParticles: false });
          target.addEffect('blindness', 60, { amplifier: 0, showParticles: false });
        } catch (e) {}
      }

      // Pulsing chrysalis particles every 15 ticks
      if (manip.ticksRemaining % 15 === 0) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          try {
            player.dimension.spawnParticle('minecraft:soul_particle', {
              x: target.location.x + Math.cos(a) * 0.8,
              y: target.location.y + 1,
              z: target.location.z + Math.sin(a) * 0.8
            });
          } catch (e) {}
        }
      }

      remaining.push(manip);
    }

    this.activeManipulations.set(player.name, remaining);
  }

  static _spawnChrysalisEffect(dimension, location) {
    // Build the chrysalis shell — dense particles wrapping the target
    for (let ring = 0; ring < 5; ring++) {
      const delay  = ring * 5;
      const height = ring * 0.5;
      system.runTimeout(() => {
        const count = 12;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          try {
            dimension.spawnParticle('minecraft:soul_particle', {
              x: location.x + Math.cos(a) * 1.0,
              y: location.y + height,
              z: location.z + Math.sin(a) * 1.0
            });
            dimension.spawnParticle('minecraft:portal', {
              x: location.x + Math.cos(a) * 0.7,
              y: location.y + height + 0.2,
              z: location.z + Math.sin(a) * 0.7
            });
          } catch (e) {}
        }
      }, delay);
    }
    // Top seal
    system.runTimeout(() => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        try {
          dimension.spawnParticle('minecraft:soul_particle', {
            x: location.x + Math.cos(a) * 0.3,
            y: location.y + 2.5,
            z: location.z + Math.sin(a) * 0.3
          });
        } catch (e) {}
      }
    }, 30);
  }

  // =============================================
  // ABILITY: SHADOW LURKING
  // Grants near-full invisibility.
  // ONLY works at night / dawn / dusk
  // (time 13000–23000 = night, 11500–13000 = dusk, 23000–24000 = dawn).
  // Drains spirit passively while active.
  // Player sees grey/dark vignette (blindness pulsed).
  // =============================================
  static useShadowLurking(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    // Already lurking — toggle off
    if (this.lurkActive.has(player.name)) {
      this._deactivateLurking(player);
      return true;
    }

    const cd = this._cdRemaining(this.lurkCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cShadow Lurking on cooldown: §8${cd}s`);
      return false;
    }

    // Time check — only valid during night/dusk/dawn
    if (!this._isDarkTime(player)) {
      player.sendMessage('§cShadow Lurking requires darkness — only usable at night, dawn, or dusk!');
      return false;
    }

    if (SpiritSystem.getSpirit(player) < this.LURK_SPIRIT_COST) {
      player.sendMessage(`§cNot enough spirit! Need §8${this.LURK_SPIRIT_COST} to activate`);
      return false;
    }

    SpiritSystem.consumeSpirit(player, this.LURK_SPIRIT_COST);

    this.lurkActive.set(player.name, true);

    // Apply invisibility
    try {
      player.addEffect('invisibility', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    } catch (e) {}

    player.sendMessage('§8§l🌑 SHADOW LURKING');
    player.sendMessage('§8You melt into the darkness...');
    player.playSound('mob.endermen.portal', { pitch: 0.5, volume: 0.8 });

    // Entry effect — shadow dissipation
    const loc = player.location;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      try {
        player.dimension.spawnParticle('minecraft:soul_particle', {
          x: loc.x + Math.cos(a) * 0.8,
          y: loc.y + 1,
          z: loc.z + Math.sin(a) * 0.8
        });
      } catch (e) {}
    }

    return true;
  }

  static _processLurking(player) {
    // Forced off during daytime (bright light breaks shadow cover)
    if (!this._isDarkTime(player)) {
      this._deactivateLurking(player);
      player.sendMessage('§8The light tears your shadow cover away!');
      return;
    }

    // Drain spirit
    const spirit = SpiritSystem.getSpirit(player);
    if (spirit <= 0) {
      this._deactivateLurking(player);
      player.sendMessage('§cYou run out of spirit — shadow cover breaks!');
      return;
    }

    SpiritSystem.consumeSpirit(player, this.LURK_DRAIN_PER_CALL);

    // Maintain invisibility
    const invis = player.getEffect('invisibility');
    if (!invis || invis.duration < 40) {
      try {
        player.addEffect('invisibility', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
      } catch (e) {}
    }

    // Visual perception effect — brief darkness pulse every 60 ticks
    // Simulates the "greyed-out world" described in lore
    // (We use darkness effect which gives a vignette in Bedrock 1.18+)
    try {
      const darkness = player.getEffect('darkness');
      if (!darkness || darkness.duration < 40) {
        player.addEffect('darkness', 60, { amplifier: 0, showParticles: false });
      }
    } catch (e) {
      // darkness effect may not be available in all builds, skip
    }

    // Madness tick is already handled in main passive — no extra cost here
  }

  static _deactivateLurking(player) {
    this.lurkActive.delete(player.name);
    this.lurkCooldowns.set(player.name, this.LURK_COOLDOWN);
    try {
      player.removeEffect('invisibility');
      player.removeEffect('darkness');
    } catch (e) {}
    player.sendMessage('§7You step out of the shadows.');
    player.playSound('mob.endermen.idle', { pitch: 0.6, volume: 0.5 });
  }

  static _isDarkTime(player) {
    try {
      const result = player.dimension.runCommand('time query daytime');
      const match  = result.statusMessage?.match(/(\d+)/);
      if (match) {
        const t = parseInt(match[1]);
        // Dusk: 11500–13000 | Night: 13000–23000 | Dawn: 23000–24000
        return t >= 11500 && t <= 24000;
      }
    } catch (e) {}
    return false; // Default to disallowed if we can't check
  }

  // =============================================
  // ABILITY: SHADOW SHAPING
  // Creates a shadow sword item that deals cold/
  // degenerate damage on hit.
  // The sword is given as an item and tracked;
  // after SHADOW_SWORD_DURATION it disappears.
  // Hit effects are handled in main.js entityHitEntity.
  // =============================================
  static useShadowShaping(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    const cd = this._cdRemaining(this.shapeCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cShadow Shaping on cooldown: §8${cd}s`);
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.SHAPE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §8${this.SHAPE_SPIRIT_COST}`);
      return false;
    }

    this.shapeCooldowns.set(player.name, this.SHAPE_COOLDOWN);

    // Give the player a shadow sword
    try {
      player.runCommand('give @s lotm:shadow_sword 1');
    } catch (e) {
      // Fallback — if item not yet defined, give a named iron sword
      try {
        player.runCommand(
          'give @s minecraft:iron_sword{"display":{"Name":"§8Shadow Blade"}} 1'
        );
      } catch (e2) {}
    }

    // Track duration
    this.shadowSwordTicks.set(player.name, this.SHADOW_SWORD_DURATION);

    player.sendMessage('§8§l⚔ SHADOW SHAPING');
    player.sendMessage('§8You condense darkness into a blade of cold shadow...');
    player.playSound('mob.wither.idle', { pitch: 1.2, volume: 0.7 });

    // Shaping effect — dark particles condense into hand
    const loc = player.location;
    for (let i = 0; i < 16; i++) {
      const delay = i * 2;
      const angle = (i / 16) * Math.PI * 4;
      const r     = 2 - (i / 16) * 1.8;
      system.runTimeout(() => {
        try {
          player.dimension.spawnParticle('minecraft:soul_particle', {
            x: loc.x + Math.cos(angle) * r,
            y: loc.y + 1,
            z: loc.z + Math.sin(angle) * r
          });
        } catch (e) {}
      }, delay);
    }

    return true;
  }

  static _processShadowSword(player) {
    const ticks = this.shadowSwordTicks.get(player.name);
    if (!ticks || ticks <= 0) { this.shadowSwordTicks.delete(player.name); return; }

    this.shadowSwordTicks.set(player.name, ticks - 1);

    // Warn at 5 seconds remaining
    if (ticks === 100) {
      player.sendMessage('§8Your shadow blade is fading...');
    }

    // When expired, try to remove the shadow sword from inventory
    if (ticks <= 1) {
      player.sendMessage('§7The shadow dissipates. The blade is gone.');
      try {
        player.runCommand('clear @s lotm:shadow_sword 0 1');
      } catch (e) {}
    }
  }

  /**
   * Called from main.js entityHitEntity when the attacker holds a shadow sword.
   * Applies cold/degenerate effects to the victim.
   */
  static onShadowSwordHit(attacker, victim) {
    try {
      // Cold effect — slowness + mining fatigue represents "cold and degenerate"
      victim.addEffect('slowness',      100, { amplifier: 1, showParticles: false });
      victim.addEffect('mining_fatigue', 100, { amplifier: 1, showParticles: false });
      victim.addEffect('weakness',       80, { amplifier: 0, showParticles: false });

      // Chill particles
      victim.dimension.spawnParticle('minecraft:water_evaporation_actor_emitter', {
        x: victim.location.x,
        y: victim.location.y + 1,
        z: victim.location.z
      });

      // Brief wither on undead-adjacent or high-HP enemies
      try {
        const hc = victim.getComponent('minecraft:health');
        if (hc && hc.effectiveMax >= 30) {
          victim.addEffect('wither', 60, { amplifier: 0, showParticles: true });
        }
      } catch (e) {}

      // Sound of cold
      attacker.playSound('block.powder_snow.step', { pitch: 0.5, volume: 1.0 });
    } catch (e) {}
  }

  // =============================================
  // SHARED HELPERS
  // =============================================
  static _findNearestTarget(player, range) {
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: range,
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow',
                       'minecraft:player', 'minecraft:fireball']
      });
      // Pick the closest non-player entity
      let nearest = null;
      let nearestDist = Infinity;
      for (const entity of entities) {
        const dx = entity.location.x - player.location.x;
        const dy = entity.location.y - player.location.y;
        const dz = entity.location.z - player.location.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = entity;
        }
      }
      return nearest;
    } catch (e) { return null; }
  }

  // =============================================
  // COOLDOWN HELPERS
  // =============================================
  static _tickCooldowns(player) {
    const n    = player.name;
    const tick = v => (v > 0 ? v - 1 : 0);
    const sc  = this.summonCooldowns.get(n);  if (sc)  this.summonCooldowns.set(n, tick(sc));
    const cc  = this.curseCooldowns.get(n);   if (cc)  this.curseCooldowns.set(n, tick(cc));
    const mc  = this.manipCooldowns.get(n);   if (mc)  this.manipCooldowns.set(n, tick(mc));
    const lc  = this.lurkCooldowns.get(n);    if (lc)  this.lurkCooldowns.set(n, tick(lc));
    const shc = this.shapeCooldowns.get(n);   if (shc) this.shapeCooldowns.set(n, tick(shc));
    // Inherited
    ListenerSequence._tickCooldowns(player);
  }

  static _cdRemaining(map, player) {
    const v = map.get(player.name) || 0;
    return v > 0 ? Math.ceil(v / 20) : 0;
  }

  // =============================================
  // ABILITY HANDLER
  // =============================================
  static handleAbilityUse(player, abilityId) {
    // Inherited chain
    if (abilityId === this.ABILITIES.DIVINATION ||
        abilityId === this.ABILITIES.ENCHANTMENT_INSCRIPTION ||
        abilityId === this.ABILITIES.AURA_READING) {
      return SecretsSuppliantSequence.handleAbilityUse(player, abilityId);
    }
    if (abilityId === this.ABILITIES.FOCUSED_LISTEN ||
        abilityId === this.ABILITIES.SUPPRESS_VOICES) {
      return ListenerSequence.handleAbilityUse(player, abilityId);
    }

    switch (abilityId) {
      case this.ABILITIES.SHADOW_SUMMON:       return this.useShadowSummon(player);
      case this.ABILITIES.SHADOW_CURSE:        return this.useShadowCurse(player);
      case this.ABILITIES.SHADOW_MANIPULATION: return this.useShadowManipulation(player);
      case this.ABILITIES.SHADOW_LURKING:      return this.useShadowLurking(player);
      case this.ABILITIES.SHADOW_SHAPING:      return this.useShadowShaping(player);
      case this.ABILITIES.TOGGLE_LISTEN:       return this.toggleListen(player);
      default:
        player.sendMessage('§cUnknown ability!');
        return false;
    }
  }

  // =============================================
  // ALL ABILITIES (for menu)
  // =============================================
  static getAllAbilities() {
    const listenLabel = '§7👂 Toggle Listen';
    return [
      { id: this.ABILITIES.SHADOW_SUMMON,       name: '§8🌑 Shadow Summon',       cost: this.SUMMON_SPIRIT_COST },
      { id: this.ABILITIES.SHADOW_CURSE,        name: '§8🩸 Shadow Curse',        cost: this.CURSE_SPIRIT_COST },
      { id: this.ABILITIES.SHADOW_MANIPULATION, name: '§8🌑 Shadow Manipulation', cost: this.MANIP_SPIRIT_COST },
      { id: this.ABILITIES.SHADOW_LURKING,      name: '§8👻 Shadow Lurking',      cost: this.LURK_SPIRIT_COST },
      { id: this.ABILITIES.SHADOW_SHAPING,      name: '§8⚔ Shadow Shaping',      cost: this.SHAPE_SPIRIT_COST },
      { id: this.ABILITIES.TOGGLE_LISTEN,       name: listenLabel,                cost: 0 },
      { id: this.ABILITIES.FOCUSED_LISTEN,      name: '§5👂 Focused Listen',      cost: ListenerSequence.FOCUSED_LISTEN_SPIRIT_COST },
      { id: this.ABILITIES.SUPPRESS_VOICES,     name: '§b🌀 Suppress Voices',     cost: ListenerSequence.SUPPRESS_SPIRIT_COST },
      // { id: this.ABILITIES.DIVINATION,          name: '§5👁 Divination',          cost: SecretsSuppliantSequence.DIVINATION_SPIRIT_COST },
      // { id: this.ABILITIES.ENCHANTMENT_INSCRIPTION, name: '§d📖 Enchantment Inscription', cost: SecretsSuppliantSequence.INSCRIPTION_SPIRIT_COST },
    ];
  }

  // =============================================
  // CLEAN UP
  // =============================================
  static removeEffects(player) {
    ListenerSequence.removeEffects(player);
    this._deactivateLurking(player);
    this.summonCooldowns.delete(player.name);
    this.curseCooldowns.delete(player.name);
    this.manipCooldowns.delete(player.name);
    this.shapeCooldowns.delete(player.name);
    this.activeCurses.delete(player.name);
    this.activeManipulations.delete(player.name);
    this.shadowSwordTicks.delete(player.name);
    this.selectedAbilities.delete(player.name);
    try { player.runCommand('clear @s lotm:shadow_sword 0 64'); } catch (e) {}
  }
}
