// ============================================
// WARLOCK - SEQUENCE 7 HERMIT PATHWAY (v2)
// ============================================
// Changes from v1:
//   - All spell cooldowns reduced to 1s (20 ticks)
//   - Hand of Force release via sneak+right-click
//   - Powder check looks in Spell Pouch first, then raw inventory
//   - castSpell() no longer called from menu — menu only selects
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { MeleeScholarSequence } from './melee_scholar.js';

export class WarlockSequence {
  static SEQUENCE_NUMBER = 7;
  static PATHWAY = PathwayManager.PATHWAYS.HERMIT;

  static EFFECT_DURATION = 999999;

  // ---- Enhanced spirituality ----
  static AURA_DETECT_RANGE  = 60;
  static AURA_SCAN_INTERVAL = 40;

  // Tiered mob detection
  static DETECT_TIER1_RANGE = 5;
  static DETECT_TIER2_RANGE = 20;
  static DETECT_TIER3_RANGE = 40;

  // ---- Physical (same as Melee Scholar) ----
  static STRENGTH_AMPLIFIER = 1;
  static SPEED_AMPLIFIER    = 1;
  static JUMP_AMPLIFIER     = 1;

  // ---- Health bonus (+3 hearts) ----
  static HEALTH_BONUS = 6;

  // ---- Global cast cooldown: 1 second ----
  static CAST_COOLDOWN = 20;

  // ---- All powder types ----
  static POWDER_TYPES = [
    'lotm:iron_dust',
    'lotm:bone_ash',
    'lotm:ember_powder',
    'lotm:sunflower_dust',
    'lotm:storm_dust',
    'lotm:tide_powder',
    'lotm:stone_dust',
    'lotm:gravel_dust',
  ];

  static POUCH_MAX_PER_TYPE = 64;

  // ---- Spell definitions ----
  // All cooldowns 1 second (20 ticks) — spam limited by powder supply
  static SPELLS = {
    HAND_OF_FORCE: {
      id: 'hand_of_force',
      name: '§5Hand of Force',
      spiritCost: 20,
      powderItem: 'lotm:iron_dust',
      powderCount: 1,
      cooldown: 1,
      description: 'Grab & move entities (sneak+cast to release)'
    },
    EXORCISM: {
      id: 'exorcism',
      name: '§fExorcism',
      spiritCost: 18,
      powderItem: 'lotm:bone_ash',
      powderCount: 1,
      cooldown: 1,
      description: 'Cause undead to flee in terror'
    },
    FLAMES: {
      id: 'flames',
      name: '§cFlames',
      spiritCost: 15,
      powderItem: 'lotm:ember_powder',
      powderCount: 1,
      cooldown: 1,
      description: 'Fire bolt that ignites targets'
    },
    PURIFICATION: {
      id: 'purification',
      name: '§aPurification',
      spiritCost: 25,
      powderItem: 'lotm:sunflower_dust',
      powderCount: 2,
      cooldown: 1,
      description: 'AOE remove debuffs + minor heal'
    },
    LIGHTNING: {
      id: 'lightning',
      name: '§eLightning',
      spiritCost: 20,
      powderItem: 'lotm:storm_dust',
      powderCount: 1,
      cooldown: 1,
      description: 'Strike target with lightning bolt'
    },
    SEA_WAVE: {
      id: 'sea_wave',
      name: '§bSea Wave',
      spiritCost: 18,
      powderItem: 'lotm:tide_powder',
      powderCount: 1,
      cooldown: 1,
      description: 'Water breathing + swift swimming (30s)'
    },
    EARTH_WALL: {
      id: 'earth_wall',
      name: '§6Earth Wall',
      spiritCost: 22,
      powderItem: 'lotm:stone_dust',
      powderCount: 3,
      cooldown: 1,
      description: 'Raise a 3x3 cobblestone wall ahead'
    },
    ORE_SENSE: {
      id: 'ore_sense',
      name: '§7Ore Sense',
      spiritCost: 20,
      powderItem: 'lotm:gravel_dust',
      powderCount: 1,
      cooldown: 1,
      description: 'Detect ores within 16 blocks'
    },
    TUNNEL: {
      id: 'tunnel',
      name: '§8Tunnel',
      spiritCost: 25,
      powderItem: 'lotm:stone_dust',
      powderCount: 4,
      cooldown: 1,
      description: 'Instantly clear 3x3x2 ahead, blocks dropped'
    }
  };

  // ---- Passive ore scan ----
  static ORE_SCAN_INTERVAL = 300; // 15 seconds (300 ticks)

  // ---- State maps ----
  static selectedSpells    = new Map();
  static spellCooldowns    = new Map(); // "playerName_spellId" -> ticks
  static castCooldowns     = new Map(); // playerName -> ticks
  static handOfForceActive = new Map(); // playerName -> { target, originalLocation }
  static auraTickCounters  = new Map();
  static oreScanCounters   = new Map(); // playerName -> tick counter

  // Pouch chest session tracking
  // playerName -> { chestLocation, pouchSlot }
  static activePouchSessions = new Map();

  static SELECTED_SPELL_PROP = 'lotm:warlock_selected_spell';

  // =============================================
  // SEQUENCE CHECK
  // =============================================
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // =============================================
  // PASSIVE ABILITIES (called every tick from main.js)
  // =============================================
  static applyPassiveAbilities(player) {
    const nv = player.getEffect('night_vision');
    if (!nv || nv.duration < 200)
      player.addEffect('night_vision', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });

    this._applyPhysicalEnhancements(player);
    this._applyHealthBonus(player, this.HEALTH_BONUS);
    this._tickAuraScan(player);
    this._processHandOfForce(player);
    this._tickCooldowns(player);
    this._checkPouchChestClosed(player);
    this._tickPassiveOreScan(player);

    if (!this.selectedSpells.has(player.name)) {
      try {
        const saved = player.getDynamicProperty(this.SELECTED_SPELL_PROP);
        this.selectedSpells.set(player.name, saved || this.SPELLS.FLAMES.id);
      } catch (e) {
        this.selectedSpells.set(player.name, this.SPELLS.FLAMES.id);
      }
    }
  }

  static _applyPhysicalEnhancements(player) {
    const str = player.getEffect('strength');
    if (!str || str.amplifier !== this.STRENGTH_AMPLIFIER || str.duration < 200)
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: this.STRENGTH_AMPLIFIER, showParticles: false });
    const spd = player.getEffect('speed');
    if (!spd || spd.amplifier !== this.SPEED_AMPLIFIER || spd.duration < 200)
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: this.SPEED_AMPLIFIER, showParticles: false });
    const jmp = player.getEffect('jump_boost');
    if (!jmp || jmp.amplifier !== this.JUMP_AMPLIFIER || jmp.duration < 200)
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: this.JUMP_AMPLIFIER, showParticles: false });
  }

  static _applyHealthBonus(player, bonusHearts) {
    const amp = bonusHearts - 1;
    const hb  = player.getEffect('health_boost');
    if (!hb || hb.amplifier !== amp || hb.duration < 200)
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier: amp, showParticles: false });
  }

  // =============================================
  // TIERED AURA SCAN
  // =============================================
  static _tickAuraScan(player) {
    const t = (this.auraTickCounters.get(player.name) || 0) + 1;
    this.auraTickCounters.set(player.name, t);
    if (t % this.AURA_SCAN_INTERVAL !== 0) return;

    try {
      const nearbyPlayers = player.dimension.getPlayers({
        location: player.location, maxDistance: this.AURA_DETECT_RANGE
      });
      for (const other of nearbyPlayers) {
        if (other.name === player.name) continue;
        const seq = PathwayManager.getSequence(other);
        if (seq !== -1 && seq <= 4) {
          player.sendMessage(`§5[Eyes of Mystery] §7An extraordinary presence — Sequence §e${seq}§7 detected!`);
          player.playSound('note.pling', { pitch: 0.4, volume: 0.6 });
          break;
        } else if (seq !== -1 && seq <= 7) {
          player.sendMessage(`§5[Eyes of Mystery] §7A beyonder presence stirs nearby...`);
          player.playSound('note.pling', { pitch: 0.6, volume: 0.4 });
          break;
        }
      }

      const hostileKeywords = [
        'zombie','skeleton','creeper','spider','enderman','witch','phantom',
        'pillager','vindicator','evoker','warden','blaze','ghast','slime',
        'magma_cube','hoglin','zoglin','ravager','drowned','husk','stray',
        'piglin','vex','silverfish','shulker','guardian','elder_guardian',
        'lotm:ghoul','lotm:vengeful_ghost','lotm:rampager','lotm:shade'
      ];

      const all = player.dimension.getEntities({
        location: player.location, maxDistance: this.DETECT_TIER3_RANGE,
        excludeTypes: ['minecraft:item','minecraft:xp_orb','minecraft:arrow','minecraft:player']
      });

      let t1 = 0, t2 = 0, t3 = 0;
      for (const e of all) {
        if (!hostileKeywords.some(kw => e.typeId.includes(kw))) continue;
        const dx = e.location.x - player.location.x;
        const dy = e.location.y - player.location.y;
        const dz = e.location.z - player.location.z;
        const d  = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if (d <= this.DETECT_TIER1_RANGE) {
          t1++;
          try { e.addEffect('glowing', 50, { amplifier: 0, showParticles: false }); } catch (_) {}
        } else if (d <= this.DETECT_TIER2_RANGE && t2 < 10) {
          t2++;
          try { e.addEffect('glowing', 50, { amplifier: 0, showParticles: false }); } catch (_) {}
        } else if (d <= this.DETECT_TIER3_RANGE && t3 < 5) {
          t3++;
        }
      }

      if (t1 > 0) player.sendMessage(`§c[Premonition] §7${t1} hostile(s) within §c5 §7blocks!`);
      if (t2 > 0) player.sendMessage(`§e[Premonition] §7${t2} hostile(s) within §e20 §7blocks.`);
      if (t3 > 0) player.sendMessage(`§7[Premonition] ${t3} distant hostile(s) within 40 blocks.`);
    } catch (_) {}
  }

  // =============================================
  // SPELL POUCH — CHEST SYSTEM
  // =============================================

  /**
   * Read powder counts stored in pouch item dynamic properties.
   * Each powder type stored as "lotm:pouch_iron_dust" etc.
   */
  static getPouchContents(pouchItem) {
    const contents = {};
    for (const powder of this.POWDER_TYPES) {
      const key = `lotm:pouch_${powder.replace('lotm:', '')}`;
      try {
        const val = pouchItem.getDynamicProperty(key);
        contents[powder] = typeof val === 'number' ? val : 0;
      } catch (_) {
        contents[powder] = 0;
      }
    }
    return contents;
  }

  /**
   * Write powder counts back to pouch item dynamic properties.
   */
  static setPouchContents(pouchItem, contents) {
    for (const powder of this.POWDER_TYPES) {
      const key = `lotm:pouch_${powder.replace('lotm:', '')}`;
      try {
        pouchItem.setDynamicProperty(key, contents[powder] || 0);
      } catch (_) {}
    }
  }

  /**
   * Find spell pouch in player inventory. Returns { item, slot } or null.
   */
  static findPouch(player) {
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return null;
      for (let slot = 0; slot < inv.container.size; slot++) {
        const item = inv.container.getItem(slot);
        if (item && item.typeId === 'lotm:spell_pouch') return { item, slot };
      }
    } catch (_) {}
    return null;
  }

  /**
   * Open the spell pouch — spawns a chest at player feet,
   * fills it with current pouch contents.
   */
  static openSpellPouch(player) {
    // If session already active, just remind
    if (this.activePouchSessions.has(player.name)) {
      player.sendMessage('§eSpell Pouch chest is already open nearby!');
      return;
    }

    const pouch = this.findPouch(player);
    if (!pouch) {
      player.sendMessage('§cNo Spell Pouch found in inventory!');
      return;
    }

    // Find a safe spot at player feet (1 block in front)
    const view = player.getViewDirection();
    const cx   = Math.floor(player.location.x + view.x * 2);
    const cy   = Math.floor(player.location.y);
    const cz   = Math.floor(player.location.z + view.z * 2);
    const chestLoc = { x: cx, y: cy, z: cz };

    try {
      // Place chest
      player.dimension.runCommand(`setblock ${cx} ${cy} ${cz} chest`);
    } catch (e) {
      player.sendMessage('§cCould not place pouch chest here!');
      return;
    }

    // Wait a tick for chunk to register, then fill chest with powder items
    // Each powder type goes in its own numbered slot so they don't overwrite each other
    system.runTimeout(() => {
      try {
        // Re-fetch pouch fresh at fill time in case inventory shifted
        const freshPouch = this.findPouch(player);
        if (!freshPouch) return;
        const inv2 = player.getComponent('minecraft:inventory');
        const pouchFresh = inv2?.container?.getItem(freshPouch.slot);
        if (!pouchFresh) return;
        const contents = this.getPouchContents(pouchFresh);
        let chestSlot = 0;
        for (const powder of this.POWDER_TYPES) {
          const count = contents[powder] || 0;
          if (count > 0) {
            try {
              player.dimension.runCommand(
                `replaceitem block ${cx} ${cy} ${cz} slot.container ${chestSlot} ${powder} ${count}`
              );
              chestSlot++;
            } catch (_) {}
          }
        }
      } catch (_) {}
    }, 2);

    // Store session
    this.activePouchSessions.set(player.name, {
      chestLoc,
      pouchSlot: pouch.slot
    });

    player.sendMessage('§5§l✦ Spell Pouch opened!');
    player.sendMessage('§7Add/remove powders from the chest, then §emove away §7to save and close.');
    player.sendMessage(`§7Max §e${this.POUCH_MAX_PER_TYPE}§7 per powder type.`);
    player.playSound('block.chest.open', { pitch: 1.2, volume: 1.0 });
  }

  /**
   * Check if player has moved away from pouch chest — if so, save and remove.
   * Called every passive tick.
   */
  static _checkPouchChestClosed(player) {
    const session = this.activePouchSessions.get(player.name);
    if (!session) return;

    const { chestLoc, pouchSlot } = session;
    const dx = player.location.x - chestLoc.x;
    const dy = player.location.y - chestLoc.y;
    const dz = player.location.z - chestLoc.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

    // Close when player moves >4 blocks away
    if (dist > 4) {
      this._savePouchAndRemoveChest(player, session);
    }
  }

  static _savePouchAndRemoveChest(player, session) {
    const { chestLoc, pouchSlot } = session;
    this.activePouchSessions.delete(player.name);

    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return;

      const pouchItem = inv.container.getItem(pouchSlot);
      if (!pouchItem || pouchItem.typeId !== 'lotm:spell_pouch') {
        // Pouch moved — try to find it
        const found = this.findPouch(player);
        if (!found) {
          // Drop chest contents and remove chest
          player.dimension.runCommand(
            `setblock ${chestLoc.x} ${chestLoc.y} ${chestLoc.z} air destroy`
          );
          player.sendMessage('§cSpell Pouch not found — chest contents dropped!');
          return;
        }
      }

      // Read chest contents
      const newContents = {};
      for (const powder of this.POWDER_TYPES) {
        newContents[powder] = 0;
      }

      // Read chest container ONCE outside the loop — re-reading getBlock each
      // slot iteration was breaking on slot > 0 and only saving the first item
      const chestBlock = player.dimension.getBlock(chestLoc);
      const chestContainer = chestBlock?.getComponent('inventory')?.container ?? null;

      if (chestContainer) {
        for (let slot = 0; slot < 27; slot++) {
          try {
            const item = chestContainer.getItem(slot);
            if (!item) continue;
            if (this.POWDER_TYPES.includes(item.typeId)) {
              const capped = Math.min(item.amount, this.POUCH_MAX_PER_TYPE);
              newContents[item.typeId] = Math.min(
                (newContents[item.typeId] || 0) + capped,
                this.POUCH_MAX_PER_TYPE
              );
            } else {
              // Non-powder item — give back to player
              try {
                inv.container.addItem(item);
              } catch (_) {
                player.dimension.spawnItem(item, player.location);
              }
            }
          } catch (_) {}
        }
      }

      // Save to pouch item — find it fresh, write contents, write item back
      const foundPouch = this.findPouch(player);
      if (foundPouch) {
        const freshPouch = inv.container.getItem(foundPouch.slot);
        if (freshPouch && freshPouch.typeId === 'lotm:spell_pouch') {
          this.setPouchContents(freshPouch, newContents);
          inv.container.setItem(foundPouch.slot, freshPouch);
        }
      }

      // Remove the chest
      player.dimension.runCommand(
        `setblock ${chestLoc.x} ${chestLoc.y} ${chestLoc.z} air`
      );

      player.sendMessage('§5Spell Pouch saved and closed.');
      player.playSound('block.chest.close', { pitch: 1.2, volume: 1.0 });

      // Show summary
      const lines = [];
      for (const powder of this.POWDER_TYPES) {
        const count = newContents[powder] || 0;
        if (count > 0) {
          const label = powder.replace('lotm:', '').replace(/_/g, ' ');
          lines.push(`§7  ${label}: §f${count}`);
        }
      }
      if (lines.length > 0) {
        player.sendMessage('§5Pouch contents:');
        for (const line of lines) player.sendMessage(line);
      } else {
        player.sendMessage('§7Pouch is empty.');
      }

    } catch (e) {
      this.activePouchSessions.delete(player.name);
      try {
        player.dimension.runCommand(
          `setblock ${chestLoc.x} ${chestLoc.y} ${chestLoc.z} air destroy`
        );
      } catch (_) {}
    }
  }

  // =============================================
  // POWDER HELPERS — checks Pouch first, then inventory
  // =============================================
  static _countPowderAvailable(player, itemId) {
    let total = 0;

    // Check pouch — always read fresh from slot
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (inv?.container) {
        for (let slot = 0; slot < inv.container.size; slot++) {
          const item = inv.container.getItem(slot);
          if (!item || item.typeId !== 'lotm:spell_pouch') continue;
          // Fresh read from slot for accurate dynamic property values
          const freshPouch = inv.container.getItem(slot);
          if (freshPouch) {
            const contents = this.getPouchContents(freshPouch);
            total += contents[itemId] || 0;
          }
          break; // only one pouch
        }
      }
    } catch (_) {}

    // Check raw inventory
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (inv?.container) {
        for (let slot = 0; slot < inv.container.size; slot++) {
          const item = inv.container.getItem(slot);
          if (item && item.typeId === itemId) total += item.amount;
        }
      }
    } catch (_) {}

    return total;
  }

  static _consumePowder(player, itemId, count) {
    let remaining = count;

    // Take from pouch first — always re-fetch item fresh from slot,
    // modify it, and write it back in one operation so dynamic properties persist
    const pouchResult = this.findPouch(player);
    if (pouchResult && remaining > 0) {
      try {
        const inv = player.getComponent('minecraft:inventory');
        if (inv?.container) {
          // Fresh read from slot — never use cached item reference
          const freshPouch = inv.container.getItem(pouchResult.slot);
          if (freshPouch && freshPouch.typeId === 'lotm:spell_pouch') {
            const contents = this.getPouchContents(freshPouch);
            const have     = contents[itemId] || 0;
            if (have > 0) {
              const take = Math.min(have, remaining);
              contents[itemId] = have - take;
              remaining -= take;
              // Write modified contents back to the fresh item
              this.setPouchContents(freshPouch, contents);
              // Write the item back to the slot — this is what persists it
              inv.container.setItem(pouchResult.slot, freshPouch);
            }
          }
        }
      } catch (_) {}
    }

    if (remaining <= 0) return true;

    // Take from raw inventory
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return false;
      for (let slot = 0; slot < inv.container.size && remaining > 0; slot++) {
        const item = inv.container.getItem(slot);
        if (!item || item.typeId !== itemId) continue;
        if (item.amount >= remaining) {
          item.amount -= remaining;
          remaining = 0;
          inv.container.setItem(slot, item.amount <= 0 ? undefined : item);
        } else {
          remaining -= item.amount;
          inv.container.setItem(slot, undefined);
        }
      }
    } catch (_) {}

    return remaining <= 0;
  }

  // =============================================
  // SPELL CASTING
  // =============================================
  static getSelectedSpell(player) {
    return this.selectedSpells.get(player.name) || this.SPELLS.FLAMES.id;
  }

  static setSelectedSpell(player, spellId) {
    this.selectedSpells.set(player.name, spellId);
    try { player.setDynamicProperty(this.SELECTED_SPELL_PROP, spellId); } catch (_) {}
  }

  /**
   * Cast the currently selected spell (called from wand sneak+right-click)
   */
  static castSelectedSpell(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }
    const gcd = this.castCooldowns.get(player.name) || 0;
    if (gcd > 0) return false; // silent — too fast
    return this.castSpell(player, this.getSelectedSpell(player));
  }

  /**
   * Cast a specific spell
   */
  static castSpell(player, spellId) {
    const spell = Object.values(this.SPELLS).find(s => s.id === spellId);
    if (!spell) { player.sendMessage('§cUnknown spell!'); return false; }

    const cdKey = `${player.name}_${spellId}`;
    const cd    = this.spellCooldowns.get(cdKey) || 0;
    if (cd > 0) {
      player.sendMessage(`§c${spell.name} §8(${Math.ceil(cd/20)}s)`);
      return false;
    }

    // Spirit check
    if (!SpiritSystem.consumeSpirit(player, spell.spiritCost)) {
      player.sendMessage(`§cNot enough spirit! Need §5${spell.spiritCost}`);
      return false;
    }

    // Powder check
    const have = this._countPowderAvailable(player, spell.powderItem);
    if (have < spell.powderCount) {
      SpiritSystem.restoreSpirit(player, spell.spiritCost);
      const pName = spell.powderItem.replace('lotm:', '').replace(/_/g, ' ');
      player.sendMessage(`§cNeed §e${spell.powderCount}x §f${pName}§c! Have §e${have}§c.`);
      return false;
    }

    this._consumePowder(player, spell.powderItem, spell.powderCount);
    this.spellCooldowns.set(cdKey, spell.cooldown * 20);
    this.castCooldowns.set(player.name, this.CAST_COOLDOWN);
    this._spawnCastParticles(player);

    switch (spellId) {
      case this.SPELLS.HAND_OF_FORCE.id: return this._castHandOfForce(player);
      case this.SPELLS.EXORCISM.id:      return this._castExorcism(player);
      case this.SPELLS.FLAMES.id:        return this._castFlames(player);
      case this.SPELLS.PURIFICATION.id:  return this._castPurification(player);
      case this.SPELLS.LIGHTNING.id:     return this._castLightning(player);
      case this.SPELLS.SEA_WAVE.id:      return this._castSeaWave(player);
      case this.SPELLS.EARTH_WALL.id:    return this._castEarthWall(player);
      case this.SPELLS.ORE_SENSE.id:     return this._castOreSense(player);
      case this.SPELLS.TUNNEL.id:        return this._castTunnel(player);
      default: return false;
    }
  }

  // =============================================
  // SPELL: HAND OF FORCE
  // Sneak+cast to release. Right-click (wand) to grab.
  // =============================================
  static _castHandOfForce(player) {
    const grabbed = this.handOfForceActive.get(player.name);

    // Sneak+cast = release
    if (grabbed && player.isSneaking) {
      this.handOfForceActive.delete(player.name);
      try {
        grabbed.target.teleport(grabbed.originalLocation, { dimension: player.dimension });
        try { grabbed.target.removeEffect('glowing'); } catch (_) {}
        player.sendMessage('§5Target returned.');
      } catch (_) {}
      return true;
    }

    // Already holding — non-sneak cast = release without returning
    if (grabbed) {
      this.handOfForceActive.delete(player.name);
      try { grabbed.target.removeEffect('glowing'); } catch (_) {}
      player.sendMessage('§5Target released.');
      return true;
    }

    // Grab new target
    const target = this._findTargetedEntity(player, 16);
    if (!target) {
      SpiritSystem.restoreSpirit(player, this.SPELLS.HAND_OF_FORCE.spiritCost);
      this._consumePowder(player, this.SPELLS.HAND_OF_FORCE.powderItem, -this.SPELLS.HAND_OF_FORCE.powderCount); // refund
      player.sendMessage('§cNo target found! Look at an entity within 16 blocks.');
      return false;
    }

    this.handOfForceActive.set(player.name, {
      target,
      originalLocation: { ...target.location }
    });

    try { target.addEffect('glowing', 999999, { amplifier: 0, showParticles: false }); } catch (_) {}
    player.sendMessage('§5§l⚡ Hand of Force! §7Right-click again to release. §8Sneak+right-click to return.');
    player.playSound('mob.shulker.shoot', { pitch: 1.5, volume: 1.0 });
    return true;
  }

  static _processHandOfForce(player) {
    const grabbed = this.handOfForceActive.get(player.name);
    if (!grabbed) return;

    try {
      if (typeof grabbed.target.isValid === 'function' && !grabbed.target.isValid()) {
        this.handOfForceActive.delete(player.name);
        player.sendMessage('§7Target was destroyed.');
        return;
      }
    } catch (_) {}

    try {
      const view      = player.getViewDirection();
      const eye       = player.getHeadLocation();
      const targetPos = {
        x: eye.x + view.x * 5,
        y: eye.y + view.y * 5,
        z: eye.z + view.z * 5
      };

      const dx = targetPos.x - grabbed.target.location.x;
      const dy = targetPos.y - grabbed.target.location.y;
      const dz = targetPos.z - grabbed.target.location.z;
      if (Math.sqrt(dx*dx+dy*dy+dz*dz) > 0.5) {
        grabbed.target.teleport(targetPos, { dimension: player.dimension });
      }

      const curTick = system.currentTick || 0;
      if (curTick % 5 === 0) {
        for (let i = 0; i <= 5; i++) {
          const f = i / 5;
          try {
            player.dimension.spawnParticle('minecraft:soul_particle', {
              x: eye.x + (targetPos.x-eye.x)*f,
              y: eye.y + (targetPos.y-eye.y)*f,
              z: eye.z + (targetPos.z-eye.z)*f
            });
          } catch (_) {}
        }
      }
    } catch (_) {
      this.handOfForceActive.delete(player.name);
      player.sendMessage('§cLost grip on target!');
    }
  }

  // =============================================
  // SPELL: EXORCISM
  // =============================================
  static _castExorcism(player) {
    const undeadKeywords = [
      'zombie','skeleton','phantom','wither','drowned','husk',
      'stray','vex','lotm:ghoul','lotm:vengeful_ghost','lotm:shade'
    ];
    try {
      const entities = player.dimension.getEntities({
        location: player.location, maxDistance: 20,
        excludeTypes: ['minecraft:item','minecraft:player']
      });
      let count = 0;
      for (const e of entities) {
        if (!undeadKeywords.some(t => e.typeId.includes(t))) continue;
        count++;
        e.addEffect('weakness', 200, { amplifier: 4, showParticles: true });
        try { e.addEffect('glowing', 200, { amplifier: 0, showParticles: false }); } catch (_) {}
        const dx = e.location.x - player.location.x;
        const dz = e.location.z - player.location.z;
        const len = Math.sqrt(dx*dx+dz*dz);
        if (len > 0) { try { e.applyKnockback(dx/len, dz/len, 2.5, 0.6); } catch (_) {} }
        for (let i = 0; i < 8; i++) {
          const a = (i/8)*Math.PI*2;
          try { player.dimension.spawnParticle('minecraft:totem_particle', {
            x: e.location.x+Math.cos(a)*0.5, y: e.location.y+1, z: e.location.z+Math.sin(a)*0.5
          }); } catch (_) {}
        }
      }
      if (count > 0) {
        player.sendMessage(`§f§l✦ EXORCISM! §7${count} undead flee!`);
        player.playSound('random.levelup', { pitch: 0.7, volume: 1.0 });
      } else {
        player.sendMessage('§7No undead in range.');
      }
    } catch (_) {}
    return true;
  }

  // =============================================
  // SPELL: FLAMES
  // =============================================
  static _castFlames(player) {
    // Slimmer than Trickmaster's Burning — single tight stream, less damage
    const view  = player.getViewDirection();
    const eye   = player.getHeadLocation();
    const start = {
      x: eye.x + view.x * 1.5,
      y: eye.y,
      z: eye.z + view.z * 1.5
    };
    let hit = false;

    player.playSound('fire.fire', { pitch: 1.2, volume: 1.0 });
    player.sendMessage('§c§oFlames!');

    for (let i = 0; i < 20; i++) {
      system.runTimeout(() => {
        if (hit) return;
        const loc = {
          x: start.x + view.x * i * 0.5,
          y: start.y + view.y * i * 0.5,
          z: start.z + view.z * i * 0.5
        };

        // Block impact
        try {
          const block = player.dimension.getBlock({
            x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z)
          });
          if (block && !block.isAir && !block.isLiquid) {
            hit = true;
            // Smaller impact burst than Trickmaster (8 particles vs 15)
            for (let j = 0; j < 8; j++) {
              const a = (j/8)*Math.PI*2;
              try { player.dimension.spawnParticle('minecraft:basic_flame_particle',
                { x: loc.x+Math.cos(a)*0.4, y: loc.y, z: loc.z+Math.sin(a)*0.4 }); } catch (_) {}
            }
            try { player.dimension.spawnParticle('minecraft:lava_particle', loc); } catch (_) {}
            player.playSound('fire.ignite', { pitch: 1.0, volume: 1.0 });
            return;
          }
        } catch (_) {}

        // Single tight stream — just 2 particles (vs Trickmaster's 7)
        try { player.dimension.spawnParticle('minecraft:basic_flame_particle', loc); } catch (_) {}
        try { player.dimension.spawnParticle('minecraft:mobflame_single', loc); } catch (_) {}

        // Entity hit
        try {
          const near = player.dimension.getEntities({
            location: loc, maxDistance: 1.5, excludeTypes: ['minecraft:item']
          });
          for (const e of near) {
            if (e.id === player.id) continue;
            hit = true;
            e.applyDamage(8);           // less than Trickmaster's 12
            e.setOnFire(4, true);       // shorter burn than Trickmaster's 8s
            player.sendMessage('§c§oTarget ignited!');
            for (let j = 0; j < 8; j++) {
              const a = (j/8)*Math.PI*2;
              try { player.dimension.spawnParticle('minecraft:basic_flame_particle', {
                x: e.location.x+Math.cos(a)*0.4,
                y: e.location.y+0.5,
                z: e.location.z+Math.sin(a)*0.4
              }); } catch (_) {}
            }
            break;
          }
        } catch (_) {}
      }, i);
    }
    return true;
  }

  // =============================================
  // SPELL: PURIFICATION
  // =============================================
  static _castPurification(player) {
    const debuffs = ['wither','poison','weakness','slowness','mining_fatigue',
      'nausea','blindness','hunger','levitation','fatal_poison'];
    try {
      const players = player.dimension.getPlayers({ location: player.location, maxDistance: 10 });
      let cleansed = 0;
      for (const t of players) {
        let any = false;
        for (const d of debuffs) { if (t.getEffect(d)) { t.removeEffect(d); any = true; } }
        try {
          const hp = t.getComponent('minecraft:health');
          if (hp) hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + 4));
        } catch (_) {}
        if (any) cleansed++;
        for (let i = 0; i < 8; i++) {
          const a = (i/8)*Math.PI*2;
          try { t.dimension.spawnParticle('minecraft:heart_particle',
            { x: t.location.x+Math.cos(a)*0.6, y: t.location.y+1.5, z: t.location.z+Math.sin(a)*0.6 }); } catch (_) {}
        }
      }
      player.sendMessage('§a§l✦ PURIFICATION! §7Area cleansed.');
      if (cleansed > 0) player.sendMessage(`§7${cleansed} player(s) purified.`);
      player.playSound('note.harp', { pitch: 1.5, volume: 1.0 });
      for (let i = 0; i < 20; i++) {
        const a = (i/20)*Math.PI*2;
        try { player.dimension.spawnParticle('minecraft:totem_particle',
          { x: player.location.x+Math.cos(a)*5, y: player.location.y+0.5, z: player.location.z+Math.sin(a)*5 }); } catch (_) {}
      }
    } catch (_) {}
    return true;
  }

  // =============================================
  // SPELL: LIGHTNING
  // =============================================
  static _castLightning(player) {
    const view   = player.getViewDirection();
    const eye    = player.getHeadLocation();
    for (let i = 1; i <= 60; i++) {
      const loc = { x: Math.floor(eye.x+view.x*i), y: Math.floor(eye.y+view.y*i), z: Math.floor(eye.z+view.z*i) };
      try {
        const block = player.dimension.getBlock(loc);
        if (block && !block.isAir && !block.isLiquid) {
          player.dimension.runCommand(`summon lightning_bolt ${loc.x} ${loc.y} ${loc.z}`);
          player.sendMessage('§e§l⚡ LIGHTNING!');
          player.playSound('ambient.weather.thunder', { pitch: 1.5, volume: 1.0 });
          return true;
        }
      } catch (_) {}
      try {
        const near = player.dimension.getEntities({
          location: { x: eye.x+view.x*i, y: eye.y+view.y*i, z: eye.z+view.z*i },
          maxDistance: 1.5, excludeTypes: ['minecraft:item']
        });
        for (const e of near) {
          if (e.id === player.id) continue;
          player.dimension.runCommand(`summon lightning_bolt ${Math.floor(e.location.x)} ${Math.floor(e.location.y)} ${Math.floor(e.location.z)}`);
          player.sendMessage('§e§l⚡ LIGHTNING!');
          player.playSound('ambient.weather.thunder', { pitch: 1.5, volume: 1.0 });
          return true;
        }
      } catch (_) {}
    }
    player.sendMessage('§cNo valid target in range!');
    SpiritSystem.restoreSpirit(player, this.SPELLS.LIGHTNING.spiritCost);
    this._consumePowder(player, this.SPELLS.LIGHTNING.powderItem, -this.SPELLS.LIGHTNING.powderCount);
    return false;
  }

  // =============================================
  // SPELL: SEA WAVE
  // =============================================
  static _castSeaWave(player) {
    player.addEffect('water_breathing', 600, { amplifier: 0, showParticles: true });
    player.addEffect('dolphins_grace',  600, { amplifier: 0, showParticles: false });
    player.addEffect('speed',           600, { amplifier: 3, showParticles: false });
    player.sendMessage('§b§l🌊 SEA WAVE! §7Water breathing + swift swimming (30s).');
    player.playSound('ambient.underwater.loop', { pitch: 1.5, volume: 0.8 });
    for (let r = 1; r <= 6; r++) {
      system.runTimeout(() => {
        for (let i = 0; i < 12; i++) {
          const a = (i/12)*Math.PI*2;
          try { player.dimension.spawnParticle('minecraft:water_evaporation_actor_emitter',
            { x: player.location.x+Math.cos(a)*r, y: player.location.y+0.2, z: player.location.z+Math.sin(a)*r }); } catch (_) {}
        }
      }, r*3);
    }
    return true;
  }

  // =============================================
  // SPELL: EARTH WALL
  // =============================================
  static _castEarthWall(player) {
    const view     = player.getViewDirection();
    const facingNS = Math.abs(view.z) > Math.abs(view.x);
    const cx       = Math.floor(player.location.x + view.x * 3);
    const cy       = Math.floor(player.location.y);
    const cz       = Math.floor(player.location.z + view.z * 3);

    for (let wide = -1; wide <= 1; wide++) {
      for (let tall = 0; tall <= 2; tall++) {
        const bx = facingNS ? cx + wide : cx;
        const by = cy + tall;
        const bz = facingNS ? cz : cz + wide;
        try {
          const block = player.dimension.getBlock({ x: bx, y: by, z: bz });
          if (block && !block.isAir) {
            try { player.dimension.runCommand(`setblock ${bx} ${by} ${bz} air destroy`); } catch (_) {
              try { player.dimension.runCommand(`setblock ${bx} ${by} ${bz} air`); } catch (_2) {}
            }
          }
          player.dimension.runCommand(`setblock ${bx} ${by} ${bz} cobblestone`);
        } catch (_) {}
      }
    }
    player.sendMessage('§6§l🪨 EARTH WALL raised!');
    player.playSound('dig.stone', { pitch: 0.8, volume: 1.5 });
    for (let i = 0; i < 15; i++) {
      system.runTimeout(() => {
        try { player.dimension.spawnParticle('minecraft:terrain',
          { x: cx+(Math.random()-0.5)*3, y: cy+Math.random()*3, z: cz+(Math.random()-0.5)*3 }); } catch (_) {}
      }, i*2);
    }
    return true;
  }

  // =============================================
  // SPELL: ORE SENSE
  // =============================================
  // =============================================
  // ORE DATA — shared by passive scan and cast
  // =============================================
  static ORE_LABELS = {
    'minecraft:coal_ore':               { label: '§8Coal',         precious: false },
    'minecraft:deepslate_coal_ore':     { label: '§8Coal §7(ds)',  precious: false },
    'minecraft:iron_ore':               { label: '§7Iron',         precious: false },
    'minecraft:deepslate_iron_ore':     { label: '§7Iron §7(ds)',  precious: false },
    'minecraft:copper_ore':             { label: '§6Copper',       precious: false },
    'minecraft:deepslate_copper_ore':   { label: '§6Copper §7(ds)',precious: false },
    'minecraft:gold_ore':               { label: '§eGold',         precious: true  },
    'minecraft:deepslate_gold_ore':     { label: '§eGold §7(ds)',  precious: true  },
    'minecraft:redstone_ore':           { label: '§cRedstone',     precious: false },
    'minecraft:deepslate_redstone_ore': { label: '§cRedstone §7(ds)',precious:false },
    'minecraft:lapis_ore':              { label: '§9Lapis',        precious: true  },
    'minecraft:deepslate_lapis_ore':    { label: '§9Lapis §7(ds)', precious: true  },
    'minecraft:diamond_ore':            { label: '§bDiamond',      precious: true  },
    'minecraft:deepslate_diamond_ore':  { label: '§bDiamond §7(ds)',precious: true },
    'minecraft:emerald_ore':            { label: '§aEmerald',      precious: true  },
    'minecraft:deepslate_emerald_ore':  { label: '§aEmerald §7(ds)',precious:true  },
    'minecraft:ancient_debris':         { label: '§4Ancient Debris',precious:true  }
  };

  static ORE_DISPLAY_ORDER = [
    '§4Ancient Debris','§bDiamond','§bDiamond §7(ds)',
    '§aEmerald','§aEmerald §7(ds)',
    '§9Lapis','§9Lapis §7(ds)',
    '§eGold','§eGold §7(ds)',
    '§cRedstone','§cRedstone §7(ds)',
    '§6Copper','§6Copper §7(ds)',
    '§7Iron','§7Iron §7(ds)',
    '§8Coal','§8Coal §7(ds)'
  ];

  /**
   * Scan all ores in range. Returns:
   *   counts:   { label -> count }
   *   nearest:  { label -> { x, y, z, dist } }  — nearest block per label
   */
  static _scanOres(player, range) {
    const loc  = player.location;
    const bx   = Math.floor(loc.x);
    const by   = Math.floor(loc.y);
    const bz   = Math.floor(loc.z);
    const counts  = {};
    const nearest = {};

    for (let x = -range; x <= range; x++) {
      for (let y = -range; y <= range; y++) {
        for (let z = -range; z <= range; z++) {
          if (x*x + y*y + z*z > range*range) continue;
          try {
            const block = player.dimension.getBlock({ x: bx+x, y: by+y, z: bz+z });
            if (!block) continue;
            const entry = this.ORE_LABELS[block.typeId];
            if (!entry) continue;
            const label = entry.label;
            counts[label] = (counts[label] || 0) + 1;
            const dist = Math.sqrt(x*x + y*y + z*z);
            if (!nearest[label] || dist < nearest[label].dist) {
              nearest[label] = { x: bx+x, y: by+y, z: bz+z, dist };
            }
          } catch (_) {}
        }
      }
    }
    return { counts, nearest };
  }

  /**
   * Convert dx,dy,dz offset into compass direction + elevation hint
   * e.g. "NE, 3 below" or "SW, same level"
   */
  /**
   * Get compass direction + elevation + turn instruction.
   * Uses player's current yaw to compute how many degrees to turn and which way.
   * e.g. "NE, 8 below (turn ~45° left)"
   */
  static _getDirection(dx, dy, dz, player) {
    // Absolute bearing to ore (0=N, 90=E, 180=S, 270=W)
    const targetAngle = ((Math.atan2(dx, dz) * (180 / Math.PI)) % 360 + 360) % 360;

    // 8-point compass label for the ore
    const compassLabels = ['N','NE','E','SE','S','SW','W','NW'];
    const compassIdx    = Math.round(targetAngle / 45) % 8;
    const compass       = compassLabels[compassIdx];

    // Player's current facing yaw (Bedrock: -180 to 180, 0=S, -90=E, 90=W, ±180=N)
    let facingYaw = 0;
    try {
      const rot = player.getRotation();
      // Convert Bedrock yaw to 0-360 bearing (0=N)
      // Bedrock yaw: 0=S, so subtract 180 and normalise
      facingYaw = ((rot.y + 180) % 360 + 360) % 360; // now 0=N, 90=E, 180=S, 270=W
    } catch (_) {}

    // Delta angle: how far to turn (signed: negative=left, positive=right)
    let delta = targetAngle - facingYaw;
    if (delta > 180)  delta -= 360;
    if (delta < -180) delta += 360;

    // Build turn hint
    let turnHint;
    const absDelta = Math.abs(delta);
    if (absDelta < 20) {
      turnHint = '§a(ahead of you)';
    } else if (absDelta > 160) {
      turnHint = '§c(behind you)';
    } else {
      const degrees = Math.round(absDelta / 45) * 45; // snap to 45° increments
      const side    = delta > 0 ? 'right' : 'left';
      turnHint      = `§7(turn ~§e${degrees}°§7 ${side})`;
    }

    // Elevation
    let elevation;
    if      (dy < -3)  elevation = `§c${Math.abs(dy)} below`;
    else if (dy > 3)   elevation = `§a${dy} above`;
    else               elevation = '§7~same level';

    return `§e${compass}§7, ${elevation} ${turnHint}`;
  }

  // =============================================
  // PASSIVE ORE SCAN (every 15s, counts only)
  // =============================================
  static _tickPassiveOreScan(player) {
    const t = (this.oreScanCounters.get(player.name) || 0) + 1;
    this.oreScanCounters.set(player.name, t);
    if (t % this.ORE_SCAN_INTERVAL !== 0) return;

    try {
      const { counts } = this._scanOres(player, 16);
      const messages = [];

      for (const [typeId, entry] of Object.entries(this.ORE_LABELS)) {
        if (!entry.precious) continue; // passive only reports valuable ores
        const count = counts[entry.label] || 0;
        if (count > 0) messages.push(`${count}x ${entry.label}`);
      }

      if (messages.length > 0) {
        player.sendMessage('§5[Ore Sense] §7' + messages.join('§7, ') + '§7 nearby.');
        player.playSound('note.pling', { pitch: 0.8, volume: 0.4 });
      }
    } catch (_) {}
  }

  // =============================================
  // SPELL: ORE SENSE (manual cast — full detail with directions)
  // =============================================
  static _castOreSense(player) {
    const range = 16;
    const loc   = player.location;

    player.sendMessage('§7§o*Your eyes pierce the stone...*');
    player.playSound('mob.elder_guardian.curse', { pitch: 2.0, volume: 0.6 });

    const { counts, nearest } = this._scanOres(player, range);

    player.sendMessage('§5§l✦ ORE SENSE §7— Within §e16 §7blocks:');

    let any = false;
    for (const label of this.ORE_DISPLAY_ORDER) {
      const count = counts[label];
      if (!count) continue;
      any = true;

      const n = nearest[label];
      if (n) {
        const dx   = n.x - Math.floor(loc.x);
        const dy   = n.y - Math.floor(loc.y);
        const dz   = n.z - Math.floor(loc.z);
        const dist = Math.round(n.dist);
        const dir  = this._getDirection(dx, dy, dz, player);
        player.sendMessage(`  ${label}§7: §f${count}x §8| nearest: ${dir}§8, §7~§f${dist}m`);

        // Endrod particle at nearest ore
        try {
          player.dimension.spawnParticle('minecraft:endrod',
            { x: n.x + 0.5, y: n.y + 0.5, z: n.z + 0.5 });
        } catch (_) {}
      } else {
        player.sendMessage(`  ${label}§7: §f${count}x`);
      }
    }

    if (!any) player.sendMessage('§7  None found.');
    return true;
  }

  // =============================================
  // SPELL: TUNNEL
  // =============================================
  static _castTunnel(player) {
    const view   = player.getViewDirection();
    const eyeLoc = player.getHeadLocation();

    // ── Step 1: Raycast to find the target block (works in ANY direction
    //   including up, down, diagonal — fixes ceiling/floor issue)
    let targetLoc = null;
    for (let i = 1; i <= 12; i++) {
      const checkLoc = {
        x: Math.floor(eyeLoc.x + view.x * i),
        y: Math.floor(eyeLoc.y + view.y * i),
        z: Math.floor(eyeLoc.z + view.z * i)
      };
      try {
        const block = player.dimension.getBlock(checkLoc);
        if (block &&
            block.typeId !== 'minecraft:air' &&
            block.typeId !== 'minecraft:bedrock' &&
            block.typeId !== 'minecraft:barrier') {
          targetLoc = checkLoc;
          break;
        }
      } catch (_) {}
    }

    if (!targetLoc) {
      player.sendMessage('§cNo valid blocks in range!');
      // Refund spirit + powder (caller already consumed them)
      SpiritSystem.restoreSpirit(player, this.SPELLS.TUNNEL.spiritCost);
      this._consumePowder(player, this.SPELLS.TUNNEL.powderItem, -this.SPELLS.TUNNEL.powderCount);
      return false;
    }

    player.sendMessage('§8§l⛏ TUNNEL!');
    player.playSound('dig.stone', { pitch: 1.2, volume: 1.5 });

    // ── Step 2: Mine 3×3×3 cube centred on target block
    //   Drops items (destroy) and skips bedrock/barrier
    let removed = 0;
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const bx = targetLoc.x + x;
          const by = targetLoc.y + y;
          const bz = targetLoc.z + z;
          try {
            const block = player.dimension.getBlock({ x: bx, y: by, z: bz });
            if (!block ||
                block.typeId === 'minecraft:air' ||
                block.typeId === 'minecraft:bedrock' ||
                block.typeId === 'minecraft:barrier') continue;

            // Block destruct particle (looks great, matches old mod style)
            try {
              player.dimension.spawnParticle('minecraft:block_destruct',
                { x: bx+0.5, y: by+0.5, z: bz+0.5 });
            } catch (_) {}

            // destroy = drops items
            try {
              player.dimension.runCommand(`setblock ${bx} ${by} ${bz} air destroy`);
            } catch (_) {
              // Fallback: silent remove (no drops) if destroy fails
              try { block.setType('minecraft:air'); } catch (_2) {}
            }
            removed++;
          } catch (_) {}
        }
      }
    }

    if (removed > 0) {
      player.sendMessage(`§7§o*Excavated ${removed} blocks — items dropped nearby*`);
    } else {
      player.sendMessage('§7Nothing to mine there.');
    }
    return true;
  }


  static executeSpellDirect(player, spellId) {
    this.spellCooldowns.set(`${player.name}_${spellId}`, (this.SPELLS[spellId.toUpperCase()]?.cooldown ?? 1) * 20);
    this.castCooldowns.set(player.name, this.CAST_COOLDOWN);
    this._spawnCastParticles(player);

    switch (spellId) {
      case this.SPELLS.HAND_OF_FORCE.id: return this._castHandOfForce(player);
      case this.SPELLS.EXORCISM.id:      return this._castExorcism(player);
      case this.SPELLS.FLAMES.id:        return this._castFlames(player);
      case this.SPELLS.PURIFICATION.id:  return this._castPurification(player);
      case this.SPELLS.LIGHTNING.id:     return this._castLightning(player);
      case this.SPELLS.SEA_WAVE.id:      return this._castSeaWave(player);
      case this.SPELLS.EARTH_WALL.id:    return this._castEarthWall(player);
      case this.SPELLS.ORE_SENSE.id:     return this._castOreSense(player);
      case this.SPELLS.TUNNEL.id:        return this._castTunnel(player);
      default: return false;
    }
  }

  static _castSpell(player, spellId) {
    switch(spellId) {
      case 'hand_of_force': return this._castHandOfForce(player);
      case 'exorcism':      return this._castExorcism(player);
      case 'flames':        return this._castFlames(player);
      case 'purification':  return this._castPurification(player);
      case 'lightning':     return this._castLightning(player);
      case 'sea_wave':      return this._castSeaWave(player);
      case 'earth_wall':    return this._castEarthWall(player);
      case 'ore_sense':     return this._castOreSense(player);
      case 'tunnel':        return this._castTunnel(player);
      default: return false;
    }
  }

  // =============================================
  // CAST VISUAL
  // =============================================
  static _spawnCastParticles(player) {
    for (let i = 0; i < 8; i++) {
      const a = (i/8)*Math.PI*2;
      try { player.dimension.spawnParticle('minecraft:soul_particle', {
        x: player.location.x+Math.cos(a)*0.4,
        y: player.location.y+1.3,
        z: player.location.z+Math.sin(a)*0.4
      }); } catch (_) {}
    }
  }

  // =============================================
  // COOLDOWNS
  // =============================================
  static _tickCooldowns(player) {
    const gcd = this.castCooldowns.get(player.name) || 0;
    if (gcd > 0) this.castCooldowns.set(player.name, gcd - 1);
    for (const spell of Object.values(this.SPELLS)) {
      const key = `${player.name}_${spell.id}`;
      const cd  = this.spellCooldowns.get(key) || 0;
      if (cd > 0) this.spellCooldowns.set(key, cd - 1);
    }
  }

  static getSpellStatus(player, spellId) {
    const cd = this.spellCooldowns.get(`${player.name}_${spellId}`) || 0;
    return cd > 0 ? `§c${Math.ceil(cd/20)}s` : '§aReady';
  }

  static getAllSpells() { return Object.values(this.SPELLS); }

  // =============================================
  // ENTITY TARGETING
  // =============================================
  static _findTargetedEntity(player, maxRange) {
    try {
      const view = player.getViewDirection();
      const loc  = player.location;
      const entities = player.dimension.getEntities({
        location: loc, maxDistance: maxRange,
        excludeTypes: ['minecraft:item','minecraft:xp_orb','minecraft:arrow']
      });
      let closest = null, bestDot = 0.85;
      for (const e of entities) {
        if (e.id === player.id) continue;
        const dx = e.location.x-loc.x, dy = e.location.y+1-(loc.y+1.6), dz = e.location.z-loc.z;
        const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if (len < 0.1) continue;
        const dot = (dx*view.x+dy*view.y+dz*view.z)/len;
        if (dot > bestDot) { bestDot = dot; closest = e; }
      }
      return closest;
    } catch (_) { return null; }
  }

  // =============================================
  // HANDLE ABILITY USE
  // =============================================
  static handleAbilityUse(player, abilityId) {
    const spell = Object.values(this.SPELLS).find(s => s.id === abilityId);
    if (spell) return this.castSpell(player, abilityId);
    return MeleeScholarSequence.handleAbilityUse(player, abilityId);
  }

  // =============================================
  // CLEANUP
  // =============================================
  static removeEffects(player) {
    MeleeScholarSequence.removeEffects(player);
    // If pouch session active, clean up chest
    const session = this.activePouchSessions.get(player.name);
    if (session) {
      try {
        player.dimension.runCommand(
          `setblock ${session.chestLoc.x} ${session.chestLoc.y} ${session.chestLoc.z} air`
        );
      } catch (_) {}
    }
    this.selectedSpells.delete(player.name);
    this.castCooldowns.delete(player.name);
    this.handOfForceActive.delete(player.name);
    this.auraTickCounters.delete(player.name);
    this.oreScanCounters.delete(player.name);
    this.activePouchSessions.delete(player.name);
    for (const key of [...this.spellCooldowns.keys()]) {
      if (key.startsWith(player.name + '_')) this.spellCooldowns.delete(key);
    }
  }
}
