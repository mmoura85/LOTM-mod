import { world, system } from '@minecraft/server';

export class SpiritSystem {
  static SPIRIT_PROPERTY = 'lotm:spirit';
  static MAX_SPIRIT_PROPERTY = 'lotm:max_spirit';
  static REGEN_TICK_PROPERTY = 'lotm:spirit_regen_tick';
  // Matches knifeReserveSystem.js's RESERVE_PROP — duplicated here (not imported) to avoid a
  // circular import between the two modules, same pattern spiritVialSystem.js already uses.
  static RESERVE_PROPERTY = 'lotm:knife_spirit_reserve';
  
  // Spirit regeneration constants
  static REGEN_INTERVAL = 40; // Ticks between regen (2 seconds)
  static REGEN_AMOUNT = 2; // Spirit restored per interval
  
  /**
   * Initialize spirit system for a player
   */
  static initializePlayer(player, baseSpirit = 100) {
    player.setDynamicProperty(this.SPIRIT_PROPERTY, baseSpirit);
    player.setDynamicProperty(this.MAX_SPIRIT_PROPERTY, baseSpirit);
    player.setDynamicProperty(this.REGEN_TICK_PROPERTY, 0);
  }
  
  /**
   * Get current spirit
   */
  static getSpirit(player) {
    const spirit = player.getDynamicProperty(this.SPIRIT_PROPERTY);
    return spirit !== undefined ? spirit : 0;
  }
  
  /**
   * Get max spirit
   */
  static getMaxSpirit(player) {
    const maxSpirit = player.getDynamicProperty(this.MAX_SPIRIT_PROPERTY);
    return maxSpirit !== undefined ? maxSpirit : 100;
  }
  
  /**
   * Set max spirit (used when advancing sequences)
   */
  static setMaxSpirit(player, amount) {
    player.setDynamicProperty(this.MAX_SPIRIT_PROPERTY, amount);
    // Restore to full when max increases
    player.setDynamicProperty(this.SPIRIT_PROPERTY, amount);
  }
  
  /**
   * Consume spirit for ability use. Falls back to the Silver Ritualistic Knife's
   * stored reserve (if the player has one) when live spirit falls short.
   */
  static consumeSpirit(player, amount) {
    const current = this.getSpirit(player);
    if (current >= amount) {
      player.setDynamicProperty(this.SPIRIT_PROPERTY, current - amount);
      return true;
    }

    if (this._hasKnife(player)) {
      const reserve = this._getReserve(player);
      const shortfall = amount - current;
      if (reserve >= shortfall) {
        player.setDynamicProperty(this.SPIRIT_PROPERTY, 0);
        player.setDynamicProperty(this.RESERVE_PROPERTY, reserve - shortfall);
        try { player.sendMessage(`§7(Used §d${shortfall}§7 stored spirit from your knife)`); } catch (_) {}
        return true;
      }
    }

    return false;
  }

  /**
   * Pure check (no deduction) — does the player's live spirit + knife reserve cover this cost?
   * Use for UI "can afford" previews instead of reading the raw spirit property directly.
   */
  static canAfford(player, amount) {
    const current = this.getSpirit(player);
    if (current >= amount) return true;
    if (!this._hasKnife(player)) return false;
    return current + this._getReserve(player) >= amount;
  }

  static _hasKnife(player) {
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

  static _getReserve(player) {
    const r = player.getDynamicProperty(this.RESERVE_PROPERTY);
    return typeof r === 'number' ? r : 0;
  }
  
  /**
   * Restore spirit (used by potions)
   */
  static restoreSpirit(player, amount) {
    const current = this.getSpirit(player);
    const max = this.getMaxSpirit(player);
    const newSpirit = Math.min(current + amount, max);
    player.setDynamicProperty(this.SPIRIT_PROPERTY, newSpirit);
  }
  
  /**
   * Regenerate spirit over time
   */
  static tickRegeneration(player, sequence) {
    const currentTick = player.getDynamicProperty(this.REGEN_TICK_PROPERTY) || 0;
    
    if (currentTick >= this.REGEN_INTERVAL) {
      const current = this.getSpirit(player);
      const max     = this.getMaxSpirit(player);

      // Use a LOCAL variable — never mutate the shared static property
      let regenAmount = this.REGEN_AMOUNT; // base: 2

      if (sequence !== undefined && sequence <= 7) {
        regenAmount = 6;
      }
      if (sequence !== undefined && sequence <= 4) {
        regenAmount = 16;
      }
      
      if (current < max) {
        this.restoreSpirit(player, regenAmount);
      }
      
      player.setDynamicProperty(this.REGEN_TICK_PROPERTY, 0);
    } else {
      player.setDynamicProperty(this.REGEN_TICK_PROPERTY, currentTick + 1);
    }
  }
  
  /**
   * Display spirit in actionbar
   */
  static displaySpirit(player) {
    const current = Math.floor(this.getSpirit(player));
    const max = this.getMaxSpirit(player);
    player.onScreenDisplay.setActionBar(`§bSpirit: §f${current}§7/§f${max}`);
  }
}