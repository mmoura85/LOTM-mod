// ============================================================================
// CREEPING HUNGER SYSTEM — item-bound Graze + Hunger for lotm:creeping_hunger
// ============================================================================
// A weaker, general-access version of Hanged Man Shepherd's Graze system
// (scripts/sequences/hanged_man/shepherd.js) — same ability catalog
// (scripts/core/grazeRegistry.js), lower cap, shorter cooldown, no pathway
// requirement to use. Unlike Shepherd, only active abilities are grazeable
// here (no passive tier) — a deliberate v1 simplification.
//
// Also tracks a decaying "hunger" resource, modeled on Rose Bishop's Flesh
// Hunger (scripts/sequences/hanged_man/rose_bishop.js) but possession-gated
// (decays only while the player actually has the item, not a permanent
// character trait) and with an escalating warning -> XP -> hearts consequence
// chain instead of a passive buff/debuff swing.
//
// Wired from main.js: itemUse -> openMenu/useActiveGrazedAbility, per-player
// tick loop -> tick(player).
// ============================================================================
import { SpiritSystem } from './spiritSystem.js';
import { GRAZE_REGISTRY, dispatchGrazedAbility, dispatchGrazedMenu, tickGrazedAbility } from './grazeRegistry.js';

const ITEM_ID = 'lotm:creeping_hunger';
const CHARACTERISTIC_PATTERN = /^lotm:.*_characteristic_seq\d+$/;

export class CreepingHungerSystem {
  static ITEM_ID = ITEM_ID;

  // ── Graze ──────────────────────────────────────────────────────────────
  static MAX_GRAZED_ABILITIES = 5; // half of Shepherd's 10
  static GRAZE_SPIRIT_COST = 40;   // vs Shepherd's 60
  static GRAZED_ABILITY_COOLDOWN_TICKS = 8; // 0.4s, vs Shepherd's 0.2s (both shortened 2026-08-09, was 1.5s/10s)

  static GRAZED_PROP = 'lotm:creeping_grazed';
  static ACTIVE_GRAZED_PROP = 'lotm:creeping_active_grazed';

  // ── Hunger ─────────────────────────────────────────────────────────────
  static HUNGER_PROPERTY = 'lotm:creeping_hunger_level';
  static MAX_HUNGER = 100;
  // Full drain in ~20 minutes (24000 ticks) of possessing the item —
  // faster than Rose Bishop's ~33 min, this downside is meant to be more present.
  static HUNGER_DECAY_RATE = 100 / 24000;

  static CHARACTERISTIC_FEED_GAIN = 40;
  static ROTTEN_FLESH_FEED_GAIN = 10;

  static STARVE_CHECK_INTERVAL_TICKS = 40; // ~2s between consequence rolls once at 0
  static STARVE_XP_LEVELS_PER_HIT = 1;
  static STARVE_HEARTS_DAMAGE = 1;

  // ── State maps ─────────────────────────────────────────────────────────
  static grazedCooldowns = new Map();      // `${playerName}_${abilityId}` -> ticks remaining
  static starveWarned = new Set();         // playerName, cleared once hunger rises above 0 again
  static starveCheckCooldowns = new Map(); // playerName -> ticks remaining before next consequence roll

  // =============================================
  // POSSESSION
  // =============================================
  static hasItem(player) {
    return this._findItemSlot(player) !== -1;
  }

  static _findItemSlot(player) {
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return -1;
      for (let i = 0; i < inv.container.size; i++) {
        const item = inv.container.getItem(i);
        if (item && item.typeId === ITEM_ID) return i;
      }
    } catch (_) {}
    return -1;
  }

  // Actively wielding it (selected hotbar slot), not just carrying it
  // somewhere in inventory — used to gate the action bar display so it
  // doesn't clutter the screen for a player who just happens to have the
  // item stashed away.
  static _isHoldingItem(player) {
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return false;
      const held = inv.container.getItem(player.selectedSlotIndex);
      return !!held && held.typeId === ITEM_ID;
    } catch (_) { return false; }
  }

  static _consumeItem(player, typeId) {
    const inv = player.getComponent('minecraft:inventory');
    if (!inv?.container) return false;
    for (let slot = 0; slot < inv.container.size; slot++) {
      const item = inv.container.getItem(slot);
      if (!item || item.typeId !== typeId) continue;
      if (item.amount > 1) { item.amount -= 1; inv.container.setItem(slot, item); }
      else { inv.container.setItem(slot, undefined); }
      return true;
    }
    return false;
  }

  static _findCharacteristicInInventory(player) {
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return null;
      for (let slot = 0; slot < inv.container.size; slot++) {
        const item = inv.container.getItem(slot);
        if (item && CHARACTERISTIC_PATTERN.test(item.typeId)) {
          return { typeId: item.typeId, slot };
        }
      }
    } catch (_) {}
    return null;
  }

  // =============================================
  // HUNGER
  // =============================================
  static getHunger(player) {
    try {
      const v = player.getDynamicProperty(this.HUNGER_PROPERTY);
      return typeof v === 'number' ? v : this.MAX_HUNGER;
    } catch (_) { return this.MAX_HUNGER; }
  }

  static setHunger(player, value) {
    const clamped = Math.max(0, Math.min(this.MAX_HUNGER, value));
    try { player.setDynamicProperty(this.HUNGER_PROPERTY, clamped); } catch (_) {}
    return clamped;
  }

  // ── Called from the item's menu: Feed ─────────────────────────────────
  static feed(player, typeId) {
    let gain = 0;
    if (typeId === 'minecraft:rotten_flesh') gain = this.ROTTEN_FLESH_FEED_GAIN;
    else if (CHARACTERISTIC_PATTERN.test(typeId)) gain = this.CHARACTERISTIC_FEED_GAIN;
    if (gain <= 0) return false;

    if (!this._consumeItem(player, typeId)) return false;

    const hunger = this.setHunger(player, this.getHunger(player) + gain);
    this.starveWarned.delete(player.name);
    this.starveCheckCooldowns.delete(player.name);
    player.sendMessage(`§5Creeping Hunger fed. §7(${Math.floor(hunger)}/${this.MAX_HUNGER})`);
    player.playSound('mob.wolf.eat', { pitch: 1.0, volume: 0.8 });
    return true;
  }

  // Staged label, same style as Rose Bishop's Flesh Hunger
  // (getHungerStage/getHungerLabel in rose_bishop.js) — user asked for this
  // alongside the bar, not instead of it.
  static getHungerStage(hunger) {
    if (hunger >= 60) return 'sated';
    if (hunger >= 30) return 'peckish';
    if (hunger >= 1)  return 'hungry';
    return 'starving';
  }

  static getHungerLabel(hunger) {
    const map = {
      sated:   '§aSated',
      peckish: '§ePeckish',
      hungry:  '§6Hungry',
      starving: '§4Starving',
    };
    return map[this.getHungerStage(hunger)];
  }

  // Spirit + text progress bar + staged label + currently-selected grazed
  // ability shown on the action bar every tick the item is actively held
  // (see _isHoldingItem) — added so players can see hunger declining ahead
  // of time instead of only finding out once it hits 0 and starts consuming
  // XP/hearts, and can see spirit + active graze alongside it without
  // needing a separate display. Third line mirrors Rose Bishop/Shepherd's
  // own "Grazed: <name> (count/max)" format (see shepherd.js).
  static _updateHungerActionBar(player, hunger) {
    const pct = hunger / this.MAX_HUNGER;
    const barLength = 20;
    const filled = Math.max(0, Math.min(barLength, Math.round(pct * barLength)));
    const color = pct > 0.5 ? '§a' : pct > 0.2 ? '§e' : '§c';
    const bar = color + '█'.repeat(filled) + '§8' + '█'.repeat(barLength - filled);
    const label = this.getHungerLabel(hunger);
    const spirit = Math.floor(SpiritSystem.getSpirit(player));
    const maxSpirit = SpiritSystem.getMaxSpirit(player);

    const grazed = this.getGrazed(player);
    const activeId = this.getActiveGrazedId(player);
    const activeAbility = activeId ? grazed.find(function(g) { return g.id === activeId; }) : null;
    const grazedStr = activeAbility
      ? `§7Grazed: §d${activeAbility.name} §7(${grazed.length}/${this.MAX_GRAZED_ABILITIES})`
      : `§7Grazed: §8None §7(${grazed.length}/${this.MAX_GRAZED_ABILITIES})`;

    try {
      player.onScreenDisplay.setActionBar(
        `§bSpirit: §f${spirit}§7/§f${maxSpirit}\n§5Hunger: ${bar} §7${Math.floor(hunger)}/${this.MAX_HUNGER} ${label}\n${grazedStr}`
      );
    } catch (_) {}
  }

  // ── Called every player tick from main.js (folded into tick() below) ──
  // Only decays/consequences while the player actually possesses the item.
  static tickHunger(player) {
    if (!this.hasItem(player)) return;

    const hunger = this.setHunger(player, this.getHunger(player) - this.HUNGER_DECAY_RATE);
    if (this._isHoldingItem(player)) this._updateHungerActionBar(player, hunger);

    if (hunger > 0) {
      this.starveWarned.delete(player.name);
      this.starveCheckCooldowns.delete(player.name);
      return;
    }

    // At 0 — warn once, then escalate on a slower cadence so it doesn't spam.
    if (!this.starveWarned.has(player.name)) {
      this.starveWarned.add(player.name);
      player.sendMessage('§5§lCreeping Hunger stirs... §7it grows restless without a soul to feed on.');
      try { player.playSound('mob.wither.ambient', { pitch: 0.6, volume: 0.5 }); } catch (_) {}
      this.starveCheckCooldowns.set(player.name, this.STARVE_CHECK_INTERVAL_TICKS);
      return;
    }

    const cd = (this.starveCheckCooldowns.get(player.name) || 0) - 1;
    if (cd > 0) { this.starveCheckCooldowns.set(player.name, cd); return; }
    this.starveCheckCooldowns.set(player.name, this.STARVE_CHECK_INTERVAL_TICKS);

    if (player.level > 0) {
      try { player.addLevels(-this.STARVE_XP_LEVELS_PER_HIT); } catch (_) {}
      player.sendMessage('§5Creeping Hunger drains your experience...');
    } else {
      try { player.applyDamage(this.STARVE_HEARTS_DAMAGE); } catch (_) {}
      player.sendMessage('§4Creeping Hunger gnaws at your flesh!');
    }
  }

  // =============================================
  // GRAZING — mirrors ShepherdSequence at a weaker scale, no pathway gate.
  // Active abilities only (no passive tier, unlike Shepherd).
  // =============================================
  static getGrazed(player) {
    try {
      const raw = player.getDynamicProperty(this.GRAZED_PROP);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return [];
  }

  static saveGrazed(player, list) {
    try { player.setDynamicProperty(this.GRAZED_PROP, JSON.stringify(list)); } catch (_) {}
  }

  static getActiveGrazedId(player) {
    try { return player.getDynamicProperty(this.ACTIVE_GRAZED_PROP) || null; } catch (_) { return null; }
  }

  static setActiveGrazedId(player, abilityId) {
    try { player.setDynamicProperty(this.ACTIVE_GRAZED_PROP, abilityId || ''); } catch (_) {}
  }

  static initiateGraze(player) {
    if (!this.hasItem(player)) {
      player.sendMessage('§cYou need Creeping Hunger in your inventory to graze!');
      return null;
    }

    const charFound = this._findCharacteristicInInventory(player);
    if (!charFound) {
      player.sendMessage('§cYou need a Beyonder Characteristic in your inventory to graze!');
      player.sendMessage('§7Characteristics drop from monsters and beyonder players.');
      return null;
    }

    const availableAbilities = (GRAZE_REGISTRY[charFound.typeId] || []).filter(function(a) { return !a.isPassive; });
    if (availableAbilities.length === 0) {
      player.sendMessage(`§cNo active graze abilities defined for: §7${charFound.typeId}`);
      return null;
    }

    if (SpiritSystem.getSpirit(player) < this.GRAZE_SPIRIT_COST) {
      player.sendMessage(`§cNot enough spirit! Grazing requires §b${this.GRAZE_SPIRIT_COST} spirit.`);
      return null;
    }

    const grazed = this.getGrazed(player);
    if (grazed.length >= this.MAX_GRAZED_ABILITIES) {
      player.sendMessage(`§cYou have reached the maximum of ${this.MAX_GRAZED_ABILITIES} grazed abilities!`);
      player.sendMessage('§7Remove one first from the Creeping Hunger menu.');
      return null;
    }

    const alreadyGrazed = grazed.map(function(g) { return g.id; });
    const available = availableAbilities.filter(function(a) { return alreadyGrazed.indexOf(a.id) === -1; });
    if (available.length === 0) {
      player.sendMessage('§cYou have already grazed all available abilities from this characteristic!');
      return null;
    }

    return {
      characteristicTypeId: charFound.typeId,
      characteristicSlot: charFound.slot,
      available,
      grazedCount: grazed.length,
      maxGrazed: this.MAX_GRAZED_ABILITIES
    };
  }

  static confirmGraze(player, characteristicSlot, chosenAbility) {
    if (!this.hasItem(player)) return false;

    if (!SpiritSystem.consumeSpirit(player, this.GRAZE_SPIRIT_COST)) {
      player.sendMessage('§cNot enough spirit!');
      return false;
    }

    if (!this._consumeItem(player, 'lotm:beyonder_soul')) {
      player.sendMessage('§cBeyonder Soul missing from inventory!');
      SpiritSystem.restoreSpirit(player, this.GRAZE_SPIRIT_COST);
      return false;
    }

    const inv = player.getComponent('minecraft:inventory');
    if (inv?.container) {
      const item = inv.container.getItem(characteristicSlot);
      if (item) {
        if (item.amount > 1) { item.amount -= 1; inv.container.setItem(characteristicSlot, item); }
        else { inv.container.setItem(characteristicSlot, undefined); }
      }
    }

    const grazed = this.getGrazed(player);
    // Spread (not a named field list) so any future registry field — like
    // tickRefs/resetCooldownRefs before it — survives persistence
    // automatically instead of silently vanishing until someone remembers
    // to add it here too.
    grazed.push({
      ...chosenAbility,
      isPassive: false
    });
    this.saveGrazed(player, grazed);

    if (!this.getActiveGrazedId(player)) this.setActiveGrazedId(player, chosenAbility.id);

    player.sendMessage(`§a§lGRAZED: ${chosenAbility.name}`);
    player.sendMessage('§7Ability stored. Use the Creeping Hunger menu to switch active ability.');
    try { player.playSound('random.levelup', { pitch: 0.9, volume: 1.0 }); } catch (_) {}
    return true;
  }

  static removeGrazedAbility(player, abilityId) {
    const grazed = this.getGrazed(player);
    const idx = grazed.findIndex(function(g) { return g.id === abilityId; });
    if (idx === -1) {
      player.sendMessage('§cAbility not found in grazed list.');
      return false;
    }
    const removed = grazed[idx];
    grazed.splice(idx, 1);
    this.saveGrazed(player, grazed);

    if (this.getActiveGrazedId(player) === abilityId) {
      this.setActiveGrazedId(player, grazed.length > 0 ? grazed[0].id : '');
    }

    player.sendMessage(`§7Removed grazed ability: ${removed.name}`);
    return true;
  }

  // ── Called from itemUse (plain use) ────────────────────────────────────
  static useActiveGrazedAbility(player) {
    const activeId = this.getActiveGrazedId(player);
    if (!activeId) {
      player.sendMessage('§cNo active grazed ability selected!');
      player.sendMessage('§7Sneak + use to open the Creeping Hunger menu.');
      return false;
    }

    const grazed = this.getGrazed(player);
    const ability = grazed.find(function(g) { return g.id === activeId; });
    if (!ability) {
      player.sendMessage('§cActive grazed ability not found. It may have been removed.');
      this.setActiveGrazedId(player, '');
      return false;
    }

    return this._invokeGrazedAbility(player, ability);
  }

  static _invokeGrazedAbility(player, ability) {
    if (!ability.abilityRef && !ability.menuRef) {
      player.sendMessage(`§cAbility ${ability.name} has no invocation reference.`);
      return false;
    }

    const cdKey = player.name + '_' + ability.id;
    const cdVal = this.grazedCooldowns.get(cdKey) || 0;
    if (cdVal > 0) {
      player.sendMessage(`§c${ability.name} on cooldown: §d${(cdVal / 20).toFixed(1)}s`);
      return false;
    }

    // Menu-based grazed abilities (e.g. Traveler's Log) open an interactive
    // form instead of firing a single effect — each real action inside the
    // menu calls dispatchGrazedAbility itself (same discount/bypass as
    // everything else), so this cooldown just throttles re-opening, and
    // there's no "activated" message since the menu gives its own feedback.
    if (ability.menuRef) {
      const opened = dispatchGrazedMenu(player, ability);
      if (opened !== false) {
        this.grazedCooldowns.set(cdKey, this.GRAZED_ABILITY_COOLDOWN_TICKS);
      }
      return opened;
    }

    // dispatchGrazedAbility applies a shared 60% spirit-cost discount (see
    // GRAZED_SPIRIT_COST_MULTIPLIER in grazeRegistry.js) on top of this
    // system's own short flat cooldown — spirit pool size still matters
    // (bigger pool = more uses), the discount is a secondary reduction.
    const result = dispatchGrazedAbility(player, ability);

    if (result !== false) {
      this.grazedCooldowns.set(cdKey, this.GRAZED_ABILITY_COOLDOWN_TICKS);
      player.sendMessage(`§d[Creeping Hunger] §7${ability.name} activated`);
    }

    return result;
  }

  static _tickGrazedCooldowns(player) {
    const prefix = player.name + '_';
    for (const [key, val] of this.grazedCooldowns) {
      if (key.startsWith(prefix) && val > 0) this.grazedCooldowns.set(key, val - 1);
    }
  }

  // =============================================
  // MAIN PER-PLAYER TICK — called from main.js
  // =============================================
  static tick(player) {
    this.tickHunger(player);
    this._tickGrazedCooldowns(player);

    // Drive the active grazed ability's own ongoing processing/cooldowns
    // (tickRefs) — see grazeRegistry.js for why this is needed.
    const activeId = this.getActiveGrazedId(player);
    if (activeId) {
      const grazed = this.getGrazed(player);
      const ability = grazed.find(function(g) { return g.id === activeId; });
      if (ability) tickGrazedAbility(player, ability);
    }
  }
}
