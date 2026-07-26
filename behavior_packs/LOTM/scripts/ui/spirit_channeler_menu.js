// ============================================================================
// SPIRIT CHANNELER MENU — sneak+use lotm:spirit_channeler
// ============================================================================
// Lists bonded spirits and lets the player direct non-combat actions
// (currently: Earth Spirit -> Dig). Combat is handled separately via
// lotm:spirit_vanguard_charm, not through this menu.
// ============================================================================
import { ActionFormData, ModalFormData, MessageFormData } from '@minecraft/server-ui';
import { WispSystem } from '../entity/wispSystem.js';
import { EarthSpiritSystem } from '../entity/earthSpiritSystem.js';

export class SpiritChannelerMenu {

  static async open(player) {
    const bondedWisps = WispSystem._getBondedWisps(player);
    const hasEarthSpirit = EarthSpiritSystem.hasBond(player);

    if (bondedWisps.length === 0 && !hasEarthSpirit) {
      await new MessageFormData()
        .title('§bSpirit Channeler')
        .body('§7You have no bonded spirits yet.')
        .button1('OK')
        .show(player);
      return;
    }

    const form = new ActionFormData().title('§bBonded Spirits');
    const entries = [];
    if (bondedWisps.length > 0) { form.button('§fWisp'); entries.push('wisp'); }
    if (hasEarthSpirit) { form.button('§6Earth Spirit'); entries.push('earth'); }

    const response = await form.show(player);
    if (response.canceled || response.selection === undefined) return;

    const choice = entries[response.selection];
    if (choice === 'wisp') return this._showWispStatus(player, bondedWisps);
    if (choice === 'earth') return this._showEarthSpiritMenu(player);
  }

  static async _showWispStatus(player, bondedWisps) {
    const roleNames = { proximity: 'Proximity Sense', detection: 'Ore Detection', beyonder: 'Threat Sense' };
    const lines = bondedWisps.map(b => `§7- ${roleNames[b.role] ?? b.role}`).join('\n');
    await new MessageFormData()
      .title('§fWisp')
      .body(`§8Your wisp watches over you.\n${lines}`)
      .button1('OK')
      .show(player);
  }

  static async _showEarthSpiritMenu(player) {
    const response = await new ActionFormData()
      .title('§6Earth Spirit')
      .body('§8What should it do?')
      .button('§2Dig')
      .button('§8Cancel')
      .show(player);

    if (response.canceled || response.selection === undefined) return;
    if (response.selection === 0) return this._showDigMenu(player);
  }

  static async _showDigMenu(player) {
    const response = await new ActionFormData()
      .title('§2Dig')
      .body('§8Choose a shape:')
      .button('§7Tunnel 1×2×10')
      .button('§7Tunnel 3×3×10')
      .button('§7Custom...')
      .button('§8Cancel')
      .show(player);

    if (response.canceled || response.selection === undefined) return;

    if (response.selection === 0) { EarthSpiritSystem.startDig(player, { width: 1, height: 2, length: 10 }); return; }
    if (response.selection === 1) { EarthSpiritSystem.startDig(player, { width: 3, height: 3, length: 10 }); return; }
    if (response.selection === 2) return this._showCustomDigMenu(player);
  }

  static async _showCustomDigMenu(player) {
    const form = new ModalFormData()
      .title('§2Custom Dig')
      .slider('§7Width', 1, 10, 1, 3)
      .slider('§7Height', 1, 10, 1, 3)
      .slider('§7Length', 1, 10, 1, 10);

    const response = await form.show(player);
    if (response.canceled) return;

    const [width, height, length] = response.formValues;
    EarthSpiritSystem.startDig(player, { width, height, length });
  }
}
