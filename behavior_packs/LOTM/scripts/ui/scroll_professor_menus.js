// ============================================
// SCROLL PROFESSOR MENU
// ============================================
// Sneak + right-click any scroll = open this menu
// Right-click a scroll = cast it directly
// ============================================

import { ActionFormData } from '@minecraft/server-ui';
import { ScrollProfessorSequence } from '../sequences/hermit/scroll_professor.js';

export class ScrollProfessorMenus {

  /**
   * Show scroll selection menu.
   * Tapping a scroll in the menu casts it immediately (consumes one scroll).
   */
  static showScrollMenu(player) {
    const scrolls = ScrollProfessorSequence.getAllScrolls();

    const form = new ActionFormData()
      .title("§5Scroll Professor")
      .body('§7Select a scroll to cast:\n§8Each cast burns one scroll from inventory.\n');

    for (const scroll of scrolls) {
      const count     = ScrollProfessorSequence.getScrollCount(player, scroll.itemId);
      const countCol  = count > 0 ? '§a' : '§c';
      form.button(
        `${scroll.name}\n§8${scroll.spiritCost} spirit | ${countCol}${count} in inventory — ${scroll.description}`
      );
    }

    form.button('§8✖ Close');

    form.show(player).then(result => {
      if (result.canceled || result.selection === scrolls.length) return;
      const chosen = scrolls[result.selection];
      if (!chosen) return;
      ScrollProfessorSequence.castScroll(player, chosen.id);
    }).catch(_ => {});
  }
}
