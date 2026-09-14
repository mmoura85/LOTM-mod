// ============================================================================
// TRAVELER BRACELET — save a spot, teleport back to it
// ============================================================================
// Not pathway-gated — a mysticism-crafted item, not a Focus-item ability.
// State lives on the PLAYER as dynamic properties (anchor location + charge
// count), matching this codebase's established convention (bansheeSystem.js's
// lotm:bonded_spirits, dawn_paladin.js's SELECTED_ABILITY_PROP) rather than
// on the item instance — no precedent in this codebase for scripted
// durability manipulation, so charges aren't tracked via minecraft:durability.
//
// Rechargeable via lotm:door_characteristic_seq5 ("Traveler Characteristic",
// the Door pathway's own Seq5 material — reused rather than inventing a new
// item, since this pack already has a canonical "Traveler" characteristic)
// + spirituality (or Spirit Shards as a fallback) — 1 characteristic fully
// refills the bracelet. Sneak+use on the bracelet opens a menu (Set Location
// / Recharge) rather than requiring the player to separately right-click the
// characteristic item directly — the characteristic's own itemUse is left
// wired too as a quick shortcut for players who already know it, but the
// menu is the documented/discoverable path.
//
// MAIN.JS WIRING:
//   import { TravelerBraceletSystem } from './items/travelerBraceletSystem.js';
//   itemUse: lotm:traveler_bracelet -> TravelerBraceletSystem.useBracelet(player, event.source.isSneaking);
//   itemUse: lotm:door_characteristic_seq5 -> TravelerBraceletSystem.useCharacteristic(player);
//   playerLeave: TravelerBraceletSystem.cleanup(player);
// ============================================================================
import { ActionFormData } from '@minecraft/server-ui';
import { SpiritSystem } from '../core/spiritSystem.js';
import { SpiritShardSystem } from '../core/spiritShardSystem.js';

export class TravelerBraceletSystem {

  static RECHARGE_ITEM_ID = 'lotm:door_characteristic_seq5';
  static MAX_CHARGES = 3;
  static RECHARGE_SPIRIT_COST = 90; // full recharge in one go — was 30/charge x3 to fill from empty
  static RECHARGE_SHARD_COST  = 4;  // fallback for physical pathways with little/no spirit yet — roughly matches the 25-spirit-per-shard conversion rate (spiritShardSystem.js) plus a small convenience premium
  static TELEPORT_COOLDOWN_MS = 3000; // 3s, prevents spam-teleporting

  static ANCHOR_PROP  = 'lotm:traveler_anchor';
  static CHARGES_PROP = 'lotm:traveler_charges';

  static teleportCooldown = new Map(); // playerId -> timestamp

  static useBracelet(player, isSneaking) {
    if (isSneaking) { this._openMenu(player); return true; }
    return this._teleportToAnchor(player);
  }

  static async _openMenu(player) {
    const response = await new ActionFormData()
      .title('§bTraveler Bracelet')
      .button('§bSet Location')
      .button('§dRecharge')
      .show(player);

    if (response.canceled || response.selection === undefined) return;
    if (response.selection === 0) { this._setAnchor(player); return; }
    if (response.selection === 1) { this.useCharacteristic(player); return; }
  }

  static _setAnchor(player) {
    const loc = player.location;
    const anchor = { x: loc.x, y: loc.y, z: loc.z, dimensionId: player.dimension.id };
    try { player.setDynamicProperty(this.ANCHOR_PROP, JSON.stringify(anchor)); } catch (_) {}

    player.sendMessage('§b✦ Anchor point set ✦');
    try { player.playSound('random.orb', { pitch: 1.2, volume: 0.6 }); } catch (_) {}
    return true;
  }

  static _teleportToAnchor(player) {
    const now = Date.now();
    const cdRemain = this.TELEPORT_COOLDOWN_MS - (now - (this.teleportCooldown.get(player.id) || 0));
    if (cdRemain > 0) {
      player.sendMessage(`§8The bracelet is still settling (${(cdRemain / 1000).toFixed(1)}s)`);
      return false;
    }

    const anchor = this._getAnchor(player);
    if (!anchor) {
      player.sendMessage('§8No anchor point set — sneak+use to save one first.');
      return false;
    }

    const charges = this._getCharges(player);
    if (charges <= 0) {
      player.sendMessage('§8The bracelet has no charges left — use a §7Traveler Characteristic§8 to recharge it.');
      return false;
    }

    if (anchor.dimensionId !== player.dimension.id) {
      player.sendMessage('§8The anchor point is in a different dimension.');
      return false;
    }

    this.teleportCooldown.set(player.id, now);
    this._setCharges(player, charges - 1);

    try {
      player.teleport({ x: anchor.x, y: anchor.y, z: anchor.z }, { dimension: player.dimension });
      player.playSound('mob.endermen.portal', { pitch: 1.0, volume: 1.0 });
    } catch (_) {}

    player.sendMessage(`§b✦ You return to your anchor point ✦ §7(${charges - 1}/${this.MAX_CHARGES} charges)`);

    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      try { player.dimension.spawnParticle('minecraft:portal_directional', {
        x: anchor.x + Math.cos(a) * 0.6, y: anchor.y + 1, z: anchor.z + Math.sin(a) * 0.6
      }); } catch (_) {}
    }

    return true;
  }

  static useCharacteristic(player) {
    if (!this._hasBracelet(player)) {
      player.sendMessage('§8You need a §7Traveler Bracelet§8 to use this on.');
      return false;
    }

    const charges = this._getCharges(player);
    if (charges >= this.MAX_CHARGES) {
      player.sendMessage(`§8Your bracelet is already fully charged (${this.MAX_CHARGES}/${this.MAX_CHARGES}).`);
      return false;
    }

    let inv = null;
    try { inv = player.getComponent('minecraft:inventory'); } catch (_) {}
    const slot = this._findItemSlot(inv, this.RECHARGE_ITEM_ID);
    if (slot === -1) {
      player.sendMessage('§8You need a §7Traveler Characteristic§8 in your inventory to recharge this.');
      return false;
    }

    // Pay with live spirit if the player has it — otherwise fall back to
    // Spirit Shards, same idiom spiritMessengerSystem.js uses for non-Beyonders.
    // Framed here as "can't afford yet" rather than "not a Beyonder", since
    // physical pathways (Twilight Giant etc.) are Beyonders who just don't
    // have a meaningful spirit pool for a while.
    let paidWith = null;
    if (SpiritSystem.canAfford(player, this.RECHARGE_SPIRIT_COST)) {
      paidWith = 'spirit';
    } else if (SpiritShardSystem.countShards(player) >= this.RECHARGE_SHARD_COST) {
      paidWith = 'shards';
    } else {
      player.sendMessage(`§cNot enough spirit (need ${this.RECHARGE_SPIRIT_COST}) or Spirit Shards (need ${this.RECHARGE_SHARD_COST})`);
      return false;
    }

    if (paidWith === 'spirit') SpiritSystem.consumeSpirit(player, this.RECHARGE_SPIRIT_COST);
    else SpiritShardSystem.consumeShards(player, this.RECHARGE_SHARD_COST);

    const item = inv.container.getItem(slot);
    if (item.amount > 1) {
      item.amount -= 1;
      inv.container.setItem(slot, item);
    } else {
      inv.container.setItem(slot, undefined);
    }

    this._setCharges(player, this.MAX_CHARGES);
    player.sendMessage(`§b✦ Bracelet fully recharged ✦ §7(${this.MAX_CHARGES}/${this.MAX_CHARGES} charges)`);
    try { player.playSound('random.levelup', { pitch: 1.3, volume: 0.6 }); } catch (_) {}
    return true;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  static _getAnchor(player) {
    try {
      const raw = player.getDynamicProperty(this.ANCHOR_PROP);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  static _getCharges(player) {
    try {
      const v = player.getDynamicProperty(this.CHARGES_PROP);
      return typeof v === 'number' ? v : this.MAX_CHARGES;
    } catch (_) { return this.MAX_CHARGES; }
  }

  static _setCharges(player, value) {
    const clamped = Math.max(0, Math.min(this.MAX_CHARGES, value));
    try { player.setDynamicProperty(this.CHARGES_PROP, clamped); } catch (_) {}
  }

  static _hasBracelet(player) {
    let inv = null;
    try { inv = player.getComponent('minecraft:inventory'); } catch (_) {}
    return this._findItemSlot(inv, 'lotm:traveler_bracelet') !== -1;
  }

  static _findItemSlot(inv, typeId) {
    if (!inv?.container) return -1;
    for (let i = 0; i < inv.container.size; i++) {
      const it = inv.container.getItem(i);
      if (it?.typeId === typeId) return i;
    }
    return -1;
  }

  static cleanup(player) {
    this.teleportCooldown.delete(player.id);
  }
}
