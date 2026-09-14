// ============================================================================
// SILVER KNIFE MENU — sneak+use lotm:silver_ritualistic_knife
// ============================================================================
import { ActionFormData } from '@minecraft/server-ui';
import { KnifeReserveSystem } from '../core/knifeReserveSystem.js';
import { SpiritShardSystem } from '../core/spiritShardSystem.js';
import { SpiritMessengerSystem } from '../entity/spiritMessengerSystem.js';

export class SilverKnifeMenu {

  static async open(player) {
    const response = await new ActionFormData()
      .title('§7Silver Ritualistic Knife')
      .button('§dStore Spirit')
      .button('§5Spirit Messenger')
      .button(`§9Condense Spirit Shard §7(${SpiritShardSystem.CONVERT_COST}sp)`)
      .show(player);

    if (response.canceled || response.selection === undefined) return;
    if (response.selection === 0) { KnifeReserveSystem.store(player); return; }
    if (response.selection === 1) { this._showMessengerMenu(player); return; }
    if (response.selection === 2) { SpiritShardSystem.convert(player); return; }
  }

  static async _showMessengerMenu(player) {
    const response = await new ActionFormData()
      .title('§5Spirit Messenger')
      .button('§dSummon')
      .button('§bAdd Pouch to Inventory')
      .button('§aSend')
      .button('§7Cancel')
      .show(player);

    if (response.canceled || response.selection === undefined || response.selection === 3) return;
    if (response.selection === 0) { SpiritMessengerSystem.summon(player); return; }
    if (response.selection === 1) { SpiritMessengerSystem.givePouch(player); return; }
    if (response.selection === 2) { SpiritMessengerSystem.send(player); return; }
  }
}
