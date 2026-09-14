// ============================================================================
// KNIFE RESERVE SYSTEM — Silver Ritualistic Knife spirit storage ability
// ============================================================================
// Player-bound reserve (not stored on the ItemStack — see spiritSystem.js's
// consumeSpirit()/canAfford() for how the reserve is drawn down as a fallback).
// ============================================================================
import { SpiritSystem } from './spiritSystem.js';

export class KnifeReserveSystem {
  // Matches spiritSystem.js's RESERVE_PROPERTY — duplicated (not imported) to avoid
  // a circular import between the two modules.
  static RESERVE_PROP = 'lotm:knife_spirit_reserve';
  static CAP = 100;
  static STORE_AMOUNT = 50;

  static getReserve(player) {
    const r = player.getDynamicProperty(this.RESERVE_PROP);
    return typeof r === 'number' ? r : 0;
  }

  static hasKnife(player) {
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return false;
      for (let i = 0; i < inv.container.size; i++) {
        const item = inv.container.getItem(i);
        if (item && item.typeId === 'lotm:silver_ritualistic_knife') return true;
      }
    } catch (_) {}
    return false;
  }

  // ── Called from main.js on sneak+use of the knife ─────────────────────────
  static store(player) {
    if (!this.hasKnife(player)) {
      player.sendMessage('§8You need a Silver Ritualistic Knife to store spirit.');
      return false;
    }

    const reserve = this.getReserve(player);
    if (reserve >= this.CAP) {
      player.sendMessage(`§8Your knife's reserve is already full (${this.CAP}/${this.CAP}).`);
      return false;
    }

    const spirit = SpiritSystem.getSpirit(player);
    if (spirit < this.STORE_AMOUNT) {
      player.sendMessage(`§cNot enough spirit to store (need ${this.STORE_AMOUNT}, have ${Math.floor(spirit)})`);
      return false;
    }

    SpiritSystem.consumeSpirit(player, this.STORE_AMOUNT);
    const newReserve = Math.min(this.CAP, reserve + this.STORE_AMOUNT);
    player.setDynamicProperty(this.RESERVE_PROP, newReserve);

    player.sendMessage('§d§l✦ SPIRIT STORED ✦');
    player.sendMessage(`§7Knife reserve: §f${newReserve}§7/§f${this.CAP}`);
    player.playSound('random.levelup', { pitch: 1.3, volume: 0.8 });

    const loc = player.location;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      try { player.dimension.spawnParticle('minecraft:endrod', {
        x: loc.x + Math.cos(a) * 0.5, y: loc.y + 1.0, z: loc.z + Math.sin(a) * 0.5
      }); } catch (_) {}
    }

    return true;
  }
}
