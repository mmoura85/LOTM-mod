// ============================================================================
// YESTERDAY ONCE MORE CHARM — borrow your past self's power
// ============================================================================
// Not pathway-gated — a mysticism-crafted item, not a Focus-item ability.
// Restores spirit (same SpiritSystem.restoreSpirit call the Spirit
// Restoration Potion uses, spiritSystem.js) plus a light Regeneration I,
// themed as briefly reliving a healthier, more spiritually full past self.
//
// MAIN.JS WIRING:
//   import { YesterdayOnceMoreSystem } from './items/yesterdayOnceMoreSystem.js';
//   itemUse: lotm:yesterday_once_more_charm -> YesterdayOnceMoreSystem.useCharm(player);
// ============================================================================
import { SpiritSystem } from '../core/spiritSystem.js';

export class YesterdayOnceMoreSystem {

  static COOLDOWN_MS = 100000; // 100s — longer than Spirit Restoration Potion's 60s, restores more
  static SPIRIT_AMOUNT = 80;
  static REGEN_DURATION_TICKS = 100; // 5s of Regeneration I

  static cooldown = new Map(); // playerId -> timestamp

  static useCharm(player) {
    const now = Date.now();
    const cdRemain = this.COOLDOWN_MS - (now - (this.cooldown.get(player.id) || 0));
    if (cdRemain > 0) {
      player.sendMessage(`§8The memory hasn't faded enough to relive again (${(cdRemain / 1000).toFixed(0)}s)`);
      return false;
    }

    this.cooldown.set(player.id, now);

    SpiritSystem.restoreSpirit(player, this.SPIRIT_AMOUNT);
    try { player.addEffect('regeneration', this.REGEN_DURATION_TICKS, { amplifier: 0, showParticles: false }); } catch (_) {}

    player.sendMessage(`§e✦ You borrow your past self's power... §7(+${this.SPIRIT_AMOUNT} Spirit)`);
    try { player.playSound('random.orb', { pitch: 0.7, volume: 0.8 }); } catch (_) {}

    const loc = player.location;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = 0.6 + Math.random() * 0.6;
      try { player.dimension.spawnParticle('minecraft:soul_particle', {
        x: loc.x + Math.cos(a) * r, y: loc.y + 0.5 + Math.random() * 1.4, z: loc.z + Math.sin(a) * r
      }); } catch (_) {}
    }

    return true;
  }

  static cleanup(player) {
    this.cooldown.delete(player.id);
  }
}
