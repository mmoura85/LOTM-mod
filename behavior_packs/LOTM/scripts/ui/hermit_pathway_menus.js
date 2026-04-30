// ============================================
// HERMIT PATHWAY MENUS
// ============================================

import { ActionFormData } from '@minecraft/server-ui';
import { MysteryPryerSequence } from '../sequences/hermit/mystery_pryer.js';
import { MeleeScholarSequence } from '../sequences/hermit/melee_scholar.js';

export class HermitPathwayMenus {

  /**
   * Show the Mystery Pryer ability selection menu
   */
  static showMysteryPryerMenu(player) {
    const form = new ActionFormData()
      .title('§5Mystery Pryer\'s Eye')
      .body('§7Choose your spiritual ability:');

    const abilities = MysteryPryerSequence.getAllAbilities();
    for (const ability of abilities) {
      form.button(`${ability.name}\n§7Cost: §5${ability.cost} Spirit — ${ability.description}`);
    }
    form.button('§8Cancel');

    form.show(player).then(result => {
      if (result.canceled || result.selection === abilities.length) return;
      const chosen = abilities[result.selection];
      if (chosen) MysteryPryerSequence.handleAbilityUse(player, chosen.id);
    }).catch(e => {});
  }

  /**
   * Show the Melee Scholar ability selection menu
   */
  static showMeleeScholarMenu(player) {
    const form = new ActionFormData()
      .title('§5Scholar\'s Martial Tome')
      .body('§7Choose your ability:');

    const abilities = MeleeScholarSequence.getAllAbilities();
    for (const ability of abilities) {
      form.button(`${ability.name}\n§7Cost: §5${ability.cost} Spirit — ${ability.description}`);
    }
    form.button('§8Cancel');

    form.show(player).then(result => {
      if (result.canceled || result.selection === abilities.length) return;
      const chosen = abilities[result.selection];
      if (chosen) MeleeScholarSequence.handleAbilityUse(player, chosen.id);
    }).catch(e => {});
  }
}
