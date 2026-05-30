// ============================================================================
// SPIRIT VIAL SYSTEM — self-contained, no external imports
// Avoids any import chain issues that could prevent the mod from loading.
// ============================================================================

export class SpiritVialSystem {

  static SPIRIT_INCREASE       = 150;
  static CHARACTERISTICS_NEEDED = 5;

  // Dynamic property keys (matching spiritSystem.js)
  static MAX_SPIRIT_PROP = 'lotm:max_spirit';
  static PATHWAY_PROP    = 'lotm:pathway';

  static PATHWAY_CHARACTERISTICS = {
    'darkness':       ['lotm:darkness_characteristic_seq9',      'lotm:darkness_characteristic_seq8',      'lotm:darkness_characteristic_seq7'],
    'death':          ['lotm:death_characteristic_seq9',          'lotm:death_characteristic_seq8',          'lotm:death_characteristic_seq7'],
    'door':           ['lotm:door_characteristic_seq9',           'lotm:door_characteristic_seq8',           'lotm:door_characteristic_seq7'],
    'twilight_giant': ['lotm:twilight_giant_characteristic_seq9', 'lotm:twilight_giant_characteristic_seq8', 'lotm:twilight_giant_characteristic_seq7'],
    'sun':            ['lotm:sun_characteristic_seq9',            'lotm:sun_characteristic_seq8',            'lotm:sun_characteristic_seq7'],
    'hanged_man':     ['lotm:hanged_man_characteristic_seq9',     'lotm:hanged_man_characteristic_seq8',     'lotm:hanged_man_characteristic_seq7'],
    'hermit':         ['lotm:hermit_characteristic_seq9',         'lotm:hermit_characteristic_seq8',         'lotm:hermit_characteristic_seq7'],
    'seer':           ['lotm:seer_characteristic_seq9',           'lotm:seer_characteristic_seq8',           'lotm:seer_characteristic_seq7'],
    'justiciar':      ['lotm:justiciar_characteristic_seq9',      'lotm:justiciar_characteristic_seq8',      'lotm:justiciar_characteristic_seq7'],
  };

  // ── Player uses the empty vial ────────────────────────────────────────────
  static onVialUse(player) {
    let pathway = null;
    try { pathway = player.getDynamicProperty(this.PATHWAY_PROP); } catch (_) {}

    if (!pathway) {
      player.sendMessage('§cYou must be a Beyonder to use a Spirit Vial!');
      try { player.runCommand('give @s lotm:spirit_vial 1'); } catch (_) {}
      return;
    }

    const validChars = this.PATHWAY_CHARACTERISTICS[pathway];
    if (!validChars) {
      player.sendMessage(`§cNo characteristics found for your pathway.`);
      try { player.runCommand('give @s lotm:spirit_vial 1'); } catch (_) {}
      return;
    }

    const inv = player.getComponent('minecraft:inventory');
    if (!inv?.container) return;

    // Find which characteristic they have 5+ of (prefer higher seq)
    let foundCharId = null;
    let foundSlots  = [];

    for (const charId of validChars) {
      let count = 0;
      const slots = [];
      for (let slot = 0; slot < inv.container.size; slot++) {
        const item = inv.container.getItem(slot);
        if (item && item.typeId === charId) {
          count += item.amount;
          slots.push({ slot, amount: item.amount });
        }
      }
      if (count >= this.CHARACTERISTICS_NEEDED) {
        foundCharId = charId;
        foundSlots  = slots;
        break;
      }
    }

    if (!foundCharId) {
      const pathName = this._pathwayName(pathway);
      player.sendMessage(`§cNot enough characteristics!`);
      player.sendMessage(`§7Need §e${this.CHARACTERISTICS_NEEDED}x §7of any ${pathName} characteristic (seq 7, 8, or 9).`);
      try { player.runCommand('give @s lotm:spirit_vial 1'); } catch (_) {}
      return;
    }

    // Consume exactly 5
    let remaining = this.CHARACTERISTICS_NEEDED;
    for (const { slot } of foundSlots) {
      if (remaining <= 0) break;
      const item = inv.container.getItem(slot);
      if (!item) continue;
      const take = Math.min(item.amount, remaining);
      if (item.amount - take <= 0) {
        inv.container.setItem(slot, undefined);
      } else {
        item.amount -= take;
        inv.container.setItem(slot, item);
      }
      remaining -= take;
    }

    // Give filled potion
    try { player.runCommand('give @s lotm:spirit_expansion_potion 1'); } catch (_) {}

    player.sendMessage(`§d§l✦ SPIRIT VIAL INFUSED ✦`);
    player.sendMessage(`§7You channel §e5x §7essence into the vial...`);
    player.sendMessage(`§dDrink the potion to expand your spirit pool!`);
    player.playSound('random.levelup', { pitch: 0.8, volume: 1.0 });

    // Particles
    const loc = player.location;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      try { player.dimension.spawnParticle('minecraft:endrod', {
        x: loc.x + Math.cos(a) * 0.6, y: loc.y + 1.0, z: loc.z + Math.sin(a) * 0.6
      }); } catch (_) {}
    }
  }

  // ── Player drinks the filled potion ───────────────────────────────────────
  static onPotionDrink(player) {
    let currentMax = 100;
    try {
      const v = player.getDynamicProperty(this.MAX_SPIRIT_PROP);
      if (typeof v === 'number') currentMax = v;
    } catch (_) {}

    const newMax = currentMax + this.SPIRIT_INCREASE;
    try { player.setDynamicProperty(this.MAX_SPIRIT_PROP, newMax); } catch (_) {}
    // Also top up current spirit to new max
    try { player.setDynamicProperty('lotm:spirit', newMax); } catch (_) {}

    player.sendMessage(`§d§l✦ SPIRIT EXPANDED ✦`);
    player.sendMessage(`§bMax Spirit: §f${currentMax} §7→ §f${newMax} §7(§d+${this.SPIRIT_INCREASE}§7)`);
    player.sendMessage(`§7§oYour spirit pool deepens...`);
    player.playSound('beacon.activate', { pitch: 1.2, volume: 1.0 });

    // Return glass bottle
    try { player.runCommand('give @s minecraft:glass_bottle 1'); } catch (_) {}

    // Particles
    const loc = player.location;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = 0.5 + Math.random() * 0.8;
      try { player.dimension.spawnParticle('minecraft:endrod', {
        x: loc.x + Math.cos(a) * r, y: loc.y + 0.8 + Math.random() * 1.2, z: loc.z + Math.sin(a) * r
      }); } catch (_) {}
    }

    // Future hook: add permanent damage bonuses etc. here
  }

  static _pathwayName(pathway) {
    const names = {
      'darkness': '§8Darkness', 'death': '§7Death', 'door': '§6Door',
      'twilight_giant': '§cTwilight Giant', 'sun': '§eSun',
      'hanged_man': '§5Hanged Man', 'hermit': '§9Hermit',
      'seer': '§dSeer', 'justiciar': '§bJusticiar',
    };
    return names[pathway] || pathway;
  }
}