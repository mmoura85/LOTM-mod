// ============================================
// TWILIGHT GIANT PATHWAY MENUS
// Pattern: Sneak + right-click → open menu to SET default
//          Right-click → ACTIVATE the selected default ability
// (Same as Bard Songs / Nightmare Powers)
// ============================================

import { ActionFormData } from '@minecraft/server-ui';
import { SpiritSystem } from '../core/spiritSystem.js';
import { PathwayManager } from '../core/pathwayManager.js';

export class TwilightGiantMenus {

  // =============================================
  // DAWN PALADIN (Sequence 6)
  // =============================================
  static async showDawnPaladinMenu(player, DawnPaladinSequence) {
    const spirit       = SpiritSystem.getSpirit(player);
    const maxSpirit    = SpiritSystem.getMaxSpirit(player);
    const selectedId   = DawnPaladinSequence.getSelectedAbility(player);
    const selectedName = this._getAbilityDisplayName(selectedId);

    const form = new ActionFormData()
      .title('§6✦ Dawn Paladin — Abilities')
      .body(
        `§7Spirit: §e${Math.floor(spirit)}§7/§e${maxSpirit}\n` +
        `§7Select an ability to set as default.\n` +
        `§7Right-click to activate the default.\n\n` +
        `§7Current: §e${selectedName}`
      );

    const abilities = DawnPaladinSequence.getAllAbilities(player);

    for (const ability of abilities) {
      const isSelected = ability.id === selectedId;
      const marker     = isSelected ? '§a✓ ' : '';
      const cd         = this._getDawnCooldown(DawnPaladinSequence, player, ability.id);
      const cdText     = cd > 0 ? ` §c(${cd}s)` : ' §a(Ready)';
      form.button(`${marker}${ability.name}${cdText}\n§7[${ability.cost} §bSpirit§7]`);
    }

    form.button('§6Activate Now\n§7Use selected ability');
    form.button('§7Cancel');

    const response = await form.show(player);
    if (response.canceled || response.selection === undefined) return;

    const idx = response.selection;

    if (idx < abilities.length) {
      // Set as default and reopen menu (same as Bard pattern)
      const chosen = abilities[idx];
      DawnPaladinSequence.setSelectedAbility(player, chosen.id);
      player.sendMessage(`§aDefault ability set to: ${chosen.name}`);
      player.playSound('random.orb', { pitch: 1.2, volume: 0.5 });
      this.showDawnPaladinMenu(player, DawnPaladinSequence);

    } else if (idx === abilities.length) {
      // Activate Now button
      DawnPaladinSequence.useSelectedAbility(player);
    }
    // idx === abilities.length + 1 → Cancel, do nothing
  }

  // =============================================
  // GUARDIAN (Sequence 5) — adds Protection
  // =============================================
  static async showGuardianMenu(player, GuardianSequence, DawnPaladinSequence) {
    const spirit       = SpiritSystem.getSpirit(player);
    const maxSpirit    = SpiritSystem.getMaxSpirit(player);
    const selectedId   = DawnPaladinSequence.getSelectedAbility(player);
    const selectedName = this._getAbilityDisplayName(selectedId);

    const form = new ActionFormData()
      .title('§b⚔ Guardian — Abilities')
      .body(
        `§7Spirit: §e${Math.floor(spirit)}§7/§e${maxSpirit}\n` +
        `§7Select an ability to set as default.\n` +
        `§7Right-click to activate the default.\n\n` +
        `§7Current: §e${selectedName}`
      );

    const abilities = GuardianSequence.getAllAbilities(player);

    for (const ability of abilities) {
      const isSelected = ability.id === selectedId;
      const marker     = isSelected ? '§a✓ ' : '';
      const cd         = this._getGuardianCooldown(GuardianSequence, DawnPaladinSequence, player, ability.id);
      const cdText     = cd > 0 ? ` §c(${cd}s)` : ' §a(Ready)';
      form.button(`${marker}${ability.name}${cdText}\n§7[${ability.cost} §bSpirit§7]`);
    }

    form.button('§6Activate Now\n§7Use selected ability');
    form.button('§7Cancel');

    const response = await form.show(player);
    if (response.canceled || response.selection === undefined) return;

    const idx = response.selection;

    if (idx < abilities.length) {
      // Set as default
      const chosen = abilities[idx];
      DawnPaladinSequence.setSelectedAbility(player, chosen.id);
      player.sendMessage(`§aDefault ability set to: ${chosen.name}`);
      player.playSound('random.orb', { pitch: 1.2, volume: 0.5 });
      this.showGuardianMenu(player, GuardianSequence, DawnPaladinSequence);

    } else if (idx === abilities.length) {
      // Activate Now — route through GuardianSequence so it gets enhanced versions
      GuardianSequence.handleAbilityUse(player, DawnPaladinSequence.getSelectedAbility(player));
    }
  }

  // =============================================
  // COOLDOWN HELPERS
  // =============================================
  static _getDawnCooldown(DawnPaladinSequence, player, abilityId) {
    const maps = {
      'light_of_dawn':      DawnPaladinSequence.lightCooldowns,
      'hurricane_of_light': DawnPaladinSequence.hurricaneCooldowns,
      'sword_of_light':     DawnPaladinSequence.swordCooldowns,
      'shield_of_light':    DawnPaladinSequence.shieldCooldowns
    };
    const map = maps[abilityId];
    if (!map) return 0;
    return Math.ceil((map.get(player.name) || 0) / 20);
  }

  static _getGuardianCooldown(GuardianSequence, DawnPaladinSequence, player, abilityId) {
    switch (abilityId) {
      case 'light_of_dawn':      return Math.ceil((GuardianSequence.lightCooldowns.get(player.name) || 0) / 20);
      case 'hurricane_of_light': return Math.ceil((GuardianSequence.hurricaneCooldowns.get(player.name) || 0) / 20);
      case 'protection':         return Math.ceil((GuardianSequence.protectionCooldowns.get(player.name) || 0) / 20);
      default:                   return this._getDawnCooldown(DawnPaladinSequence, player, abilityId);
    }
  }

  // =============================================
  // DISPLAY NAME HELPER
  // =============================================
  static _getAbilityDisplayName(abilityId) {
    const names = {
      'light_of_dawn':      '✦ Light of Dawn',
      'hurricane_of_light': '☀ Hurricane of Light',
      'sword_of_light':     '⚔ Sword of Light',
      'shield_of_light':    '🛡 Shield of Light',
      'protection':         '⚔ Guardian Protection'
    };
    return names[abilityId] || 'Unknown';
  }

  // =============================================
  // DEMON HUNTER (Sequence 4)
  // =============================================
  static async showDemonHunterMenu(player, DemonHunterSequence) {
    const spirit       = SpiritSystem.getSpirit(player);
    const maxSpirit    = SpiritSystem.getMaxSpirit(player);
    const selectedId   = DemonHunterSequence.getSelectedAbility(player);

    // Build display name for current selection
    const allAbilities = DemonHunterSequence.getAllAbilities();
    const selectedAbility = allAbilities.find(a => a.id === selectedId);
    const selectedName = selectedAbility ? selectedAbility.name : 'None';

    // Get active ointment info for body text
    const activeOintment = DemonHunterSequence.activeOintments.get(player.name);
    const ointmentText = activeOintment
      ? `\n§7Active Ointment: §e${activeOintment.type} §7(${Math.ceil(activeOintment.ticksRemaining / 20)}s)`
      : '';

    const form = new ActionFormData()
      .title('§2⚔ Demon Hunter — Abilities')
      .body(
        `§7Spirit: §e${Math.floor(spirit)}§7/§e${maxSpirit}\n` +
        `§7Select an ability to set as default.\n` +
        `§7Right-click to activate the default.\n\n` +
        `§7Current: ${selectedName}${ointmentText}`
      );

    for (const ability of allAbilities) {
      const isSelected = ability.id === selectedId;
      const marker     = isSelected ? '§a✓ ' : '';
      const cd         = this._getDemonHunterCooldown(DemonHunterSequence, player, ability.id);
      const cdText     = cd > 0 ? ` §c(${cd}s)` : ' §a(Ready)';
      form.button(`${marker}${ability.name}${cdText}\n§7[${ability.cost} §bSpirit§7]`);
    }

    form.button('§2Activate Now\n§7Use selected ability');
    form.button('§7Cancel');

    const response = await form.show(player);
    if (response.canceled || response.selection === undefined) return;

    const idx = response.selection;

    if (idx < allAbilities.length) {
      // Set as default and reopen
      const chosen = allAbilities[idx];
      DemonHunterSequence.setSelectedAbility(player, chosen.id);
      player.sendMessage(`§aDefault ability set to: ${chosen.name}`);
      player.playSound('random.orb', { pitch: 1.2, volume: 0.5 });
      this.showDemonHunterMenu(player, DemonHunterSequence);

    } else if (idx === allAbilities.length) {
      // Activate Now
      DemonHunterSequence.useSelectedAbility(player);
    }
  }

  // =============================================
  // DEMON HUNTER COOLDOWN HELPER
  // =============================================
  static _getDemonHunterCooldown(DemonHunterSequence, player, abilityId) {
    switch (abilityId) {
      case DemonHunterSequence.ABILITIES.EYE_OF_DEMON_HUNTING:
        return Math.ceil((DemonHunterSequence.eyeCooldowns.get(player.name) || 0) / 20);
      case DemonHunterSequence.ABILITIES.ANCHORED_PROTECTION:
        return Math.ceil((DemonHunterSequence.protectionCooldowns.get(player.name) || 0) / 20);
      default:
        // Ointments share one cooldown map
        return Math.ceil((DemonHunterSequence.ointmentCooldowns.get(player.name) || 0) / 20);
    }
  }
}
