// ============================================
// WARLOCK SPELL MENU (v2)
// ============================================
// Changes from v1:
//   - Menu ONLY selects the spell, does NOT cast it
//   - Player must sneak+right-click wand to cast after selecting
//   - Right-click wand (no sneak) = open menu
//   - Sneak+right-click wand = cast selected spell
// ============================================

import { ActionFormData } from '@minecraft/server-ui';
import { WarlockSequence } from '../sequences/hermit/warlock.js';

export class WarlockMenus {

  /**
   * Show spell selection menu.
   * Selecting a spell ONLY sets it as active — does NOT cast it.
   * To cast: close menu, then sneak+right-click the wand.
   */
  static showSpellMenu(player) {
    const spells   = WarlockSequence.getAllSpells();
    const selected = WarlockSequence.getSelectedSpell(player);

    const form = new ActionFormData()
      .title("§5Warlock's Wand")
      .body(
        '§7Select a spell to ready.\n' +
        '§8Right-click wand to cast.\n\n' +
        `§7Currently selected: §5${spells.find(s => s.id === selected)?.name ?? 'None'}`
      );

    for (const spell of spells) {
      const isSelected = spell.id === selected;
      const status     = WarlockSequence.getSpellStatus(player, spell.id);
      const powderName = spell.powderItem.replace('lotm:', '').replace(/_/g, ' ');
      const prefix     = isSelected ? '§a▶ ' : '§7   ';

      // Check powder availability for display
      const have  = WarlockSequence._countPowderAvailable(player, spell.powderItem);
      const haveColor = have >= spell.powderCount ? '§a' : '§c';

      form.button(
        `${prefix}${spell.name} ${status}\n` +
        `§8${spell.spiritCost} spirit | ${spell.powderCount}x ${powderName} ${haveColor}(have ${have})`
      );
    }

    form.button('§8✖ Close');

    form.show(player).then(result => {
      if (result.canceled || result.selection === spells.length) return;
      const chosen = spells[result.selection];
      if (!chosen) return;

      // ONLY set selected — do NOT cast
      WarlockSequence.setSelectedSpell(player, chosen.id);
      player.sendMessage(`§5Spell readied: ${chosen.name}`);
      player.sendMessage('§8Right-click wand to cast.');
      player.playSound('note.pling', { pitch: 1.2, volume: 0.6 });
    }).catch(_ => {});
  }
}
