// ============================================
// HANGED MAN PATHWAY MENUS
// ============================================
// Provides a paginated ability selection menu
// for all Hanged Man pathway sequences.
// Called from main.js when player sneaks + uses
// the secrets_suppliant_powers item.
// ============================================

import { ActionFormData } from '@minecraft/server-ui';
import { PathwayManager } from '../core/pathwayManager.js';
import { SpiritSystem } from '../core/spiritSystem.js';
import { SecretsSuppliantSequence } from '../sequences/hanged_man/secrets_suppliant.js';
import { ListenerSequence } from '../sequences/hanged_man/listener.js';
import { ShadowAsceticSequence } from '../sequences/hanged_man/shadow_ascetic.js';
import { RoseBishopSequence } from '../sequences/hanged_man/rose_bishop.js';
import { ShepherdSequence } from '../sequences/hanged_man/shepherd.js';

export class HangedManMenus {

  /**
   * Get the correct sequence class for the player's current sequence.
   */
  static _getSequenceClass(sequence) {
    if (sequence === 9) return SecretsSuppliantSequence;
    if (sequence === 8) return ListenerSequence;
    if (sequence === 7) return ShadowAsceticSequence;
    if (sequence === 6) return RoseBishopSequence;
    if (sequence === 5) return ShepherdSequence;
    return null;
  }

  /**
   * Main ability selection menu.
   * Groups abilities by category for readability.
   * Called on sneak + use of powers item.
   */
  static async showAbilityMenu(player) {
    const sequence = PathwayManager.getSequence(player);
    const cls      = this._getSequenceClass(sequence);
    if (!cls) {
      player.sendMessage('§cNo ability menu available for this sequence.');
      return;
    }

    const spirit    = Math.floor(SpiritSystem.getSpirit(player));
    const maxSpirit = SpiritSystem.getMaxSpirit(player);
    const abilities = cls.getAllAbilities();
    const selected  = cls.getSelectedAbility(player);

    // Build category groups
    const categories = {};
    for (const ability of abilities) {
      const cat = ability.category || 'General';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(ability);
    }

    // ── Page 1: Category picker ──────────────────────────────────────────
    const catForm = new ActionFormData();
    catForm.title('§5Hanged Man — Abilities');
    // Build body text avoiding optional chaining for compatibility
    let bodyText = `§bSpirit: §f${spirit}§7/§f${maxSpirit}\n`;
    if (sequence <= 8) {
      bodyText += `§7Mind: ${ListenerSequence.getMadnessLabel(ListenerSequence.getMadnessStage(player))} ` +
                  `§7(${Math.floor(ListenerSequence.getMadness(player))}/100)\n`;
    }
    if (sequence <= 6) {
      bodyText += `§cFlesh: §f${Math.floor(RoseBishopSequence.getFleshHunger(player))}§7/§f100\n`;
    }
    const selectedAbilityObj = abilities.find(function(a) { return a.id === selected; });
    bodyText += `\n§eCurrent: §f${selectedAbilityObj ? selectedAbilityObj.name : 'None'}\n§7Choose a category:`;
    catForm.body(bodyText);

    const catNames = Object.keys(categories);
    for (const cat of catNames) {
      const catAbilities = categories[cat];
      const availCount   = catAbilities.filter(function(a) { return a.cost === 0 || spirit >= a.cost; }).length;
      catForm.button(`§e${cat} §7(${availCount}/${catAbilities.length})`);
    }
    catForm.button('§a✔ Use Selected Now');
    catForm.button('§7Cancel');

    let catResponse;
    try { catResponse = await catForm.show(player); } catch (e) { return; }
    if (!catResponse || catResponse.canceled || catResponse.selection === undefined) return;

    // catNames buttons: 0 .. catNames.length-1
    // "Use Selected Now" button: catNames.length
    // "Cancel" button: catNames.length + 1
    const useIdx    = catNames.length;
    const cancelIdx = catNames.length + 1;

    if (catResponse.selection === cancelIdx) return;

    if (catResponse.selection === useIdx) {
      cls.useSelectedAbility(player);
      return;
    }

    // ── Page 2: Ability picker within chosen category ────────────────────
    const chosenCat    = catNames[catResponse.selection];
    const catAbilities = categories[chosenCat];

    const abilForm = new ActionFormData();
    abilForm.title(`§5${chosenCat}`);
    abilForm.body(`§bSpirit: §f${spirit}§7/§f${maxSpirit}\n§7Tap to select:`);

    for (let i = 0; i < catAbilities.length; i++) {
      const ability    = catAbilities[i];
      const canAfford  = ability.cost === 0 || spirit >= ability.cost;
      const isSelected = ability.id === selected;
      const costStr    = ability.cost > 0 ? ` [${ability.cost}\u2736]` : ' [free]';
      const selMark    = isSelected ? '§a◉ ' : '§7○ ';
      const dimColor   = canAfford ? '' : '§8';
      abilForm.button(`${selMark}${dimColor}${ability.name}§7${costStr}`);
    }
    abilForm.button('§7← Back');

    let abilResponse;
    try { abilResponse = await abilForm.show(player); } catch (e) { return; }
    if (!abilResponse || abilResponse.canceled || abilResponse.selection === undefined) return;

    // Back button
    if (abilResponse.selection === catAbilities.length) {
      await this.showAbilityMenu(player);
      return;
    }

    const chosenAbility = catAbilities[abilResponse.selection];
    cls.setSelectedAbility(player, chosenAbility.id);
    player.sendMessage(`§aSelected: ${chosenAbility.name}`);
    player.playSound('random.click', { pitch: 1.2, volume: 0.6 });


    if (chosenAbility.id === 'manage_grazed') {
  await this.showGrazeManagementMenu(player);
  return;
}
if (chosenAbility.id === 'graze') {
  await this.showGrazeMenu(player);
  return;
}

    // ── Page 3: Use now? ─────────────────────────────────────────────────
    const costLabel = chosenAbility.cost > 0 ? chosenAbility.cost + ' spirit' : 'free';
    const useNowForm = new ActionFormData();
    useNowForm.title('§5Activate?');
    useNowForm.body(`§eSelected: §f${chosenAbility.name}\n§7Cost: §b${costLabel}\n\n§7Activate this ability now?`);
    useNowForm.button('§aActivate');
    useNowForm.button('§7Just Select (close)');

    let useResponse;
    try { useResponse = await useNowForm.show(player); } catch (e) { return; }
    if (!useResponse || useResponse.canceled || useResponse.selection === undefined) return;

    if (useResponse.selection === 0) {
      cls.handleAbilityUse(player, chosenAbility.id);
    }
  }

  /**
   * Quick-cycle: shift through abilities without opening full menu.
   * Called on non-sneak use when player wants to just scroll forward.
   */
  static cycleAbility(player) {
    const sequence = PathwayManager.getSequence(player);
    const cls      = this._getSequenceClass(sequence);
    if (!cls) return;

    const abilities = cls.getAllAbilities();
    const current   = cls.getSelectedAbility(player);
    let   idx       = -1;
    for (let i = 0; i < abilities.length; i++) {
      if (abilities[i].id === current) { idx = i; break; }
    }
    const nextIdx = (idx + 1) % abilities.length;
    const next    = abilities[nextIdx];

    cls.setSelectedAbility(player, next.id);

    const spirit    = SpiritSystem.getSpirit(player);
    const canAfford = next.cost === 0 || spirit >= next.cost;
    player.sendMessage(
      `§7[${nextIdx + 1}/${abilities.length}] §eSelected: ${next.name} ` +
      `§7(${next.cost > 0 ? next.cost + '\u2736' : 'free'}) ` +
      `${canAfford ? '§a\u2714' : '§c\u2718 low spirit'}`
    );
    player.playSound('random.click', { pitch: 1.5, volume: 0.5 });
  }

  // Called when a Shepherd uses lotm:beyonder_soul (sneak = open menu)
  static async showGrazeMenu(player) {
    const info = ShepherdSequence.initiateGraze(player);
    if (!info) return; // messages already sent by initiateGraze

    const { characteristicTypeId, characteristicSlot,
            availableActive, availablePassive,
            activeCount, maxActive } = info;

    // Build combined list: passives first, then actives
    const allAvailable = availablePassive.concat(availableActive);

    const form = new ActionFormData();
    form.title('§5Graze Soul');
    form.body(
      `§bCharacteristic: §f${characteristicTypeId.replace('lotm:', '').replace(/_/g, ' ')}\n` +
      `§7Active grazed: §f${activeCount}§7/§f${maxActive}\n` +
      `§7Spirit cost: §b${ShepherdSequence.GRAZE_SPIRIT_COST}\n\n` +
      `§7Select an ability to graze:`
    );

    for (let i = 0; i < allAvailable.length; i++) {
      const ability   = allAvailable[i];
      const typeLabel = ability.isPassive ? '§a[PASSIVE] ' : '§e[ACTIVE] ';
      form.button(`${typeLabel}${ability.name}\n§7${ability.description}`);
    }
    form.button('§7Cancel');

    let response;
    try { response = await form.show(player); } catch (e) { return; }
    if (!response || response.canceled || response.selection === undefined) return;
    if (response.selection === allAvailable.length) return; // Cancel

    const chosen = allAvailable[response.selection];

    // Confirm form
    const confirm = new ActionFormData();
    confirm.title('§5Confirm Graze');
    confirm.body(
      `§eAbility: §f${chosen.name}\n` +
      `§7Type: ${chosen.isPassive ? '§aPermanent Passive §7(no slot used)' : '§eActive §7(uses 1 of ' + maxActive + ' slots)'}\n` +
      `§7Description: §f${chosen.description}\n` +
      `§7Spirit cost: §b${ShepherdSequence.GRAZE_SPIRIT_COST}\n\n` +
      `§4This will consume 1 Beyonder Soul and the Characteristic.`
    );
    confirm.button('§aConfirm Graze');
    confirm.button('§7Cancel');

    let confirmResp;
    try { confirmResp = await confirm.show(player); } catch (e) { return; }
    if (!confirmResp || confirmResp.canceled || confirmResp.selection !== 0) return;

    ShepherdSequence.confirmGraze(player, characteristicSlot, chosen);
  }

  // Called from the ability menu when player selects "Manage Grazed"
  static async showGrazeManagementMenu(player) {
    const grazed   = ShepherdSequence.getGrazedAbilities(player);
    const passives = ShepherdSequence.getPassiveGrazes(player);
    const activeId = ShepherdSequence.getActiveGrazedId(player);

    const form = new ActionFormData();
    form.title('§5Grazed Souls');
    form.body(
      `§7Active slots used: §f${grazed.length}§7/§f${ShepherdSequence.MAX_GRAZED_ABILITIES}\n` +
      `§7Permanent passives: §f${passives.length}\n\n` +
      `§7Tap an ability to manage it:`
    );

    // Show active grazed abilities
    for (let i = 0; i < grazed.length; i++) {
      const g        = grazed[i];
      const isActive = g.id === activeId;
      const marker   = isActive ? '§a◉ ' : '§7○ ';
      form.button(`${marker}${g.name}\n§7${g.description || g.pathway + ' Seq.' + g.sequenceNumber}`);
    }

    // Show passives (view only)
    for (let i = 0; i < passives.length; i++) {
      const p = passives[i];
      form.button(`§a★ ${p.name} §7[passive]\n§7${p.description || ''}`);
    }

    if (grazed.length === 0 && passives.length === 0) {
      form.button('§8(no grazed abilities yet)');
      form.button('§7Close');
      try { await form.show(player); } catch (e) {}
      return;
    }

    form.button('§7Close');

    let response;
    try { response = await form.show(player); } catch (e) { return; }
    if (!response || response.canceled || response.selection === undefined) return;

    const closeIdx = grazed.length + passives.length;
    if (response.selection >= closeIdx) return;

    // Is it a passive?
    if (response.selection >= grazed.length) {
      const passive = passives[response.selection - grazed.length];
      // Show passive detail — can only remove
      const detailForm = new ActionFormData();
      detailForm.title(`§5${passive.name}`);
      detailForm.body(
        `§7Type: §aPermanent Passive\n` +
        `§7Pathway: §f${passive.pathway} Seq.${passive.sequenceNumber}\n` +
        `§7Description: §f${passive.description || 'Passive buff'}\n\n` +
        `§cRemoving a passive cannot be undone.`
      );
      detailForm.button('§cRemove Passive');
      detailForm.button('§7Back');

      let detailResp;
      try { detailResp = await detailForm.show(player); } catch (e) { return; }
      if (!detailResp || detailResp.canceled) return;
      if (detailResp.selection === 0) {
        ShepherdSequence.removeGrazedAbility(player, passive.id);
      } else {
        await this.showGrazeManagementMenu(player);
      }
      return;
    }

    // Active ability management
    const chosen   = grazed[response.selection];
    const isActive = chosen.id === activeId;

    const detailForm = new ActionFormData();
    detailForm.title(`§5${chosen.name}`);
    detailForm.body(
      `§7Pathway: §f${chosen.pathway} Seq.${chosen.sequenceNumber}\n` +
      `§7Description: §f${chosen.description || 'Active ability'}\n` +
      `§7Status: ${isActive ? '§aCurrently Active' : '§7Inactive'}\n\n` +
      `§7What would you like to do?`
    );

    if (!isActive) detailForm.button('§aSet as Active');
    detailForm.button('§aActivate Now');
    detailForm.button('§cRemove Graze');
    detailForm.button('§7Back');

    let detailResp;
    try { detailResp = await detailForm.show(player); } catch (e) { return; }
    if (!detailResp || detailResp.canceled || detailResp.selection === undefined) return;

    // Button indices shift based on whether "Set as Active" is shown
    let btnIdx = 0;
    if (!isActive) {
      if (detailResp.selection === btnIdx) {
        ShepherdSequence.setActiveGrazedId(player, chosen.id);
        player.sendMessage(`§a${chosen.name} §7is now your active grazed ability.`);
        await this.showGrazeManagementMenu(player);
        return;
      }
      btnIdx++;
    }
    if (detailResp.selection === btnIdx) {
      // Activate Now
      ShepherdSequence.setActiveGrazedId(player, chosen.id);
      ShepherdSequence.useActiveGrazedAbility(player);
      return;
    }
    btnIdx++;
    if (detailResp.selection === btnIdx) {
      // Remove
      ShepherdSequence.removeGrazedAbility(player, chosen.id);
      await this.showGrazeManagementMenu(player);
      return;
    }
    // Back
    await this.showGrazeManagementMenu(player);
  }
}
