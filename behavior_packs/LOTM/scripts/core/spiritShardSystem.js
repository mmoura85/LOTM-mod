// ============================================================================
// SPIRIT SHARD SYSTEM — a portable, tradeable spirit-derived currency
// ============================================================================
// Beyonders can condense their own live spirit into lotm:spirit_shard (via the
// Silver Knife menu), and it also drops from LOTM's hostile mobs. Lets non-
// Beyonders pay for spirit-flavored features (e.g. summoning a Spirit
// Messenger) without needing a spirit pool of their own, and gives Beyonders
// a way to "gift" that access. Intended as a general-purpose spirit currency
// for future rituals too, not just the messenger.
// ============================================================================
import { ItemStack } from '@minecraft/server';
import { SpiritSystem } from './spiritSystem.js';
import { PathwayManager } from './pathwayManager.js';

const SHARD_ID = 'lotm:spirit_shard';
const CONVERT_COST = 25; // live spirit spent
const CONVERT_YIELD = 1; // shards received

export class SpiritShardSystem {
  static SHARD_ID = SHARD_ID;
  static CONVERT_COST = CONVERT_COST;

  static countShards(player) {
    let total = 0;
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (inv?.container) {
        for (let slot = 0; slot < inv.container.size; slot++) {
          const item = inv.container.getItem(slot);
          if (item && item.typeId === SHARD_ID) total += item.amount;
        }
      }
    } catch (_) {}
    return total;
  }

  static consumeShards(player, count) {
    if (this.countShards(player) < count) return false;
    let remaining = count;
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return false;
      for (let slot = 0; slot < inv.container.size && remaining > 0; slot++) {
        const item = inv.container.getItem(slot);
        if (!item || item.typeId !== SHARD_ID) continue;
        const take = Math.min(item.amount, remaining);
        if (item.amount > take) { item.amount -= take; inv.container.setItem(slot, item); }
        else { inv.container.setItem(slot, undefined); }
        remaining -= take;
      }
    } catch (_) { return false; }
    return remaining === 0;
  }

  // ── Called from silver_knife_menu.js: Condense Spirit Shard ────────────────
  static convert(player) {
    if (!PathwayManager.hasPathway(player)) {
      player.sendMessage('§8Only Beyonders can condense their spirit into shards.');
      return false;
    }
    if (!SpiritSystem.canAfford(player, CONVERT_COST)) {
      player.sendMessage(`§cNot enough spirit (need ${CONVERT_COST})`);
      return false;
    }

    SpiritSystem.consumeSpirit(player, CONVERT_COST);

    let inv = null;
    try { inv = player.getComponent('minecraft:inventory'); } catch (_) {}
    try { inv?.container?.addItem(new ItemStack(SHARD_ID, CONVERT_YIELD)); } catch (_) {}

    player.sendMessage(`§d✦ You condense ${CONVERT_COST} spirit into a Spirit Shard ✦`);
    player.playSound('random.orb', { pitch: 1.3, volume: 0.6 });
    return true;
  }
}
