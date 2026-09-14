// ============================================================================
// CREEPING HUNGER MENU — sneak+use lotm:creeping_hunger
// ============================================================================
// Same plain-ActionFormData shape as every other pathway item's menu in this
// pack (e.g. hanged_man_menus.js's Graze menus, which this mirrors at a
// smaller scale — see scripts/core/creepingHungerSystem.js for the logic).
// ============================================================================

import { ActionFormData } from '@minecraft/server-ui';
import { CreepingHungerSystem } from '../core/creepingHungerSystem.js';

const FEEDABLE_ROTTEN_FLESH = 'minecraft:rotten_flesh';
const CHARACTERISTIC_PATTERN = /^lotm:.*_characteristic_seq\d+$/;

export class CreepingHungerMenu {

  static async open(player) {
    const hunger = Math.floor(CreepingHungerSystem.getHunger(player));
    const grazed = CreepingHungerSystem.getGrazed(player);
    const activeId = CreepingHungerSystem.getActiveGrazedId(player);
    const active = activeId ? grazed.find(function(g) { return g.id === activeId; }) : null;

    const form = new ActionFormData();
    form.title('§5Creeping Hunger');
    form.body(
      `§7Hunger: §f${hunger}§7/§f${CreepingHungerSystem.MAX_HUNGER}\n` +
      `§7Grazed: §f${grazed.length}§7/§f${CreepingHungerSystem.MAX_GRAZED_ABILITIES}\n` +
      (active ? `§7Active ability: §d${active.name}` : '§7Active ability: §8None')
    );
    form.button('§dGraze New Ability');
    form.button('§5Manage Grazed Abilities');
    form.button('§6Feed');
    form.button('§7Close');

    let response;
    try { response = await form.show(player); } catch (e) { return; }
    if (!response || response.canceled || response.selection === undefined) return;

    if (response.selection === 0) { await this.showGrazeMenu(player); return; }
    if (response.selection === 1) { await this.showManagementMenu(player); return; }
    if (response.selection === 2) { await this.showFeedMenu(player); return; }
  }

  static async showGrazeMenu(player) {
    const info = CreepingHungerSystem.initiateGraze(player);
    if (!info) return; // messages already sent by initiateGraze

    const { characteristicTypeId, characteristicSlot, available, grazedCount, maxGrazed } = info;

    const form = new ActionFormData();
    form.title('§5Graze Ability');
    form.body(
      `§bCharacteristic: §f${characteristicTypeId.replace('lotm:', '').replace(/_/g, ' ')}\n` +
      `§7Grazed: §f${grazedCount}§7/§f${maxGrazed}\n` +
      `§7Spirit cost: §b${CreepingHungerSystem.GRAZE_SPIRIT_COST}\n\n` +
      `§7Select an ability to graze:`
    );

    for (let i = 0; i < available.length; i++) {
      const ability = available[i];
      form.button(`§e${ability.name}\n§7${ability.description}`);
    }
    form.button('§7Cancel');

    let response;
    try { response = await form.show(player); } catch (e) { return; }
    if (!response || response.canceled || response.selection === undefined) return;
    if (response.selection === available.length) return; // Cancel

    const chosen = available[response.selection];

    const confirm = new ActionFormData();
    confirm.title('§5Confirm Graze');
    confirm.body(
      `§eAbility: §f${chosen.name}\n` +
      `§7Description: §f${chosen.description}\n` +
      `§7Spirit cost: §b${CreepingHungerSystem.GRAZE_SPIRIT_COST}\n\n` +
      `§4This will consume 1 Beyonder Soul and the Characteristic.`
    );
    confirm.button('§aConfirm Graze');
    confirm.button('§7Cancel');

    let confirmResp;
    try { confirmResp = await confirm.show(player); } catch (e) { return; }
    if (!confirmResp || confirmResp.canceled || confirmResp.selection !== 0) return;

    CreepingHungerSystem.confirmGraze(player, characteristicSlot, chosen);
  }

  static async showManagementMenu(player) {
    const grazed = CreepingHungerSystem.getGrazed(player);
    const activeId = CreepingHungerSystem.getActiveGrazedId(player);

    const form = new ActionFormData();
    form.title('§5Grazed Abilities');
    form.body(
      `§7Slots used: §f${grazed.length}§7/§f${CreepingHungerSystem.MAX_GRAZED_ABILITIES}\n\n` +
      `§7Tap an ability to manage it:`
    );

    for (let i = 0; i < grazed.length; i++) {
      const g = grazed[i];
      const isActive = g.id === activeId;
      const marker = isActive ? '§a◉ ' : '§7○ ';
      form.button(`${marker}${g.name}\n§7${g.description || g.pathway + ' Seq.' + g.sequenceNumber}`);
    }

    if (grazed.length === 0) {
      form.button('§8(no grazed abilities yet)');
      form.button('§7Close');
      try { await form.show(player); } catch (e) {}
      return;
    }

    form.button('§7Close');

    let response;
    try { response = await form.show(player); } catch (e) { return; }
    if (!response || response.canceled || response.selection === undefined) return;
    if (response.selection >= grazed.length) return; // Close

    const chosen = grazed[response.selection];
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

    let btnIdx = 0;
    if (!isActive) {
      if (detailResp.selection === btnIdx) {
        CreepingHungerSystem.setActiveGrazedId(player, chosen.id);
        player.sendMessage(`§a${chosen.name} §7is now your active grazed ability.`);
        return;
      }
      btnIdx++;
    }
    if (detailResp.selection === btnIdx) {
      CreepingHungerSystem.setActiveGrazedId(player, chosen.id);
      CreepingHungerSystem.useActiveGrazedAbility(player);
      return;
    }
    btnIdx++;
    if (detailResp.selection === btnIdx) {
      CreepingHungerSystem.removeGrazedAbility(player, chosen.id);
      await this.showManagementMenu(player);
      return;
    }
    await this.showManagementMenu(player);
  }

  static async showFeedMenu(player) {
    const candidates = this._findFeedableItems(player);

    const form = new ActionFormData();
    form.title('§6Feed Creeping Hunger');
    form.body(
      `§7Hunger: §f${Math.floor(CreepingHungerSystem.getHunger(player))}§7/§f${CreepingHungerSystem.MAX_HUNGER}\n\n` +
      `§7Rotten Flesh restores §f${CreepingHungerSystem.ROTTEN_FLESH_FEED_GAIN}§7, a Characteristic restores §f${CreepingHungerSystem.CHARACTERISTIC_FEED_GAIN}§7.`
    );

    if (candidates.length === 0) {
      form.button('§8(nothing feedable in inventory)');
      form.button('§7Close');
      try { await form.show(player); } catch (e) {}
      return;
    }

    for (const c of candidates) {
      form.button(`§f${c.typeId.replace('lotm:', '').replace('minecraft:', '').replace(/_/g, ' ')}`);
    }
    form.button('§7Cancel');

    let response;
    try { response = await form.show(player); } catch (e) { return; }
    if (!response || response.canceled || response.selection === undefined) return;
    if (response.selection >= candidates.length) return;

    CreepingHungerSystem.feed(player, candidates[response.selection].typeId);
  }

  static _findFeedableItems(player) {
    const found = [];
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return found;
      const seen = new Set();
      for (let slot = 0; slot < inv.container.size; slot++) {
        const item = inv.container.getItem(slot);
        if (!item) continue;
        const isFeedable = item.typeId === FEEDABLE_ROTTEN_FLESH || CHARACTERISTIC_PATTERN.test(item.typeId);
        if (isFeedable && !seen.has(item.typeId)) {
          seen.add(item.typeId);
          found.push({ typeId: item.typeId });
        }
      }
    } catch (e) {}
    return found;
  }
}
