import { world, system } from '@minecraft/server';

export class SpiritSystem {
  static SPIRIT_PROPERTY = 'lotm:spirit';
  static MAX_SPIRIT_PROPERTY = 'lotm:max_spirit';
  static REGEN_TICK_PROPERTY = 'lotm:spirit_regen_tick';
  
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
   * Consume spirit for ability use
   */
  static consumeSpirit(player, amount) {
    const current = this.getSpirit(player);
    if (current >= amount) {
      player.setDynamicProperty(this.SPIRIT_PROPERTY, current - amount);
      return true;
    }
    return false;
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
      const max = this.getMaxSpirit(player);

      // Sequence 7 and higher: +50% regen (0.075 per tick = 1.5/sec)
      if (sequence !== undefined && sequence <= 7) {
        this.REGEN_AMOUNT = 6;
      }
      
      // Sequence 4 and higher: +100% regen (0.1 per tick = 2/sec)
      if (sequence !== undefined && sequence <= 4) {
        this.REGEN_AMOUNT = 16;
      }
      
      if (current < max) {
        this.restoreSpirit(player, this.REGEN_AMOUNT);
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