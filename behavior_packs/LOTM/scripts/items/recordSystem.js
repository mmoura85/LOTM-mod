// ============================================================================
// RECORD SYSTEM — shared "record an ability from a characteristic" engine
// ============================================================================
// Not pathway-gated — both consuming items are mysticism-crafted sealed
// artifacts. Reuses grazeRegistry.js's existing catalog/dispatch machinery
// (GRAZE_REGISTRY, dispatchGrazedAbility) rather than inventing a second
// ability list — see [[lotm_mystic_items_wishlist]] for the original design
// note asking for exactly this reuse.
//
// Mechanic: hold a characteristic item (any pathway/tier already present in
// GRAZE_REGISTRY) + sneak+use the record item -> pick which of that
// characteristic's ACTIVE abilities to record (isPassive abilities excluded
// — they have no discrete "use" to spend down; menuRef-only abilities like
// Traveler's Log are excluded too, since they're multi-step, not a single
// dispatchable call). Recording consumes 1 of the characteristic and grants
// a fixed number of uses before that recording is forgotten. Distinct from
// graze's continuous access — this is deliberately a spend-down resource.
//
// State lives on the PLAYER as dynamic properties (recordings array +
// selected index, per item type), matching this codebase's established
// convention (travelerBraceletSystem.js's ANCHOR_PROP/CHARGES_PROP) rather
// than on the item instance.
//
// Staff of the Stars ALSO gets a "Travel" button (config.travel flag) that
// opens the real Traveler's Log — not a separate travel system, just the
// exact same graze_traveler_log menuRef entry (GRAZE_REGISTRY under
// lotm:door_characteristic_seq5) that Creeping Hunger/Shepherd already use
// for grazed access, dispatched here via dispatchGrazedMenu. No new state:
// it reads/writes the same TravelerSequence.savedLocations storage a real
// Traveler or any other grazer would, via showGrazedTravelerMenu's shim
// (door_pathway_menus.js).
//
// MAIN.JS WIRING:
//   import { RecordSystem } from './items/recordSystem.js';
//   itemUse: lotm:leymano_travels / lotm:staff_of_the_stars ->
//     RecordSystem.useItem(player, itemId, event.source.isSneaking);
//   tick loop (BEFORE the pathway-gate continue, same as ShieldSystem/
//     FistsOfRageSystem — this item works for non-Beyonder holders too):
//     RecordSystem.tick(player);
//   playerLeave: RecordSystem.cleanup(player);
// ============================================================================
import { ActionFormData } from '@minecraft/server-ui';
import { GRAZE_REGISTRY, dispatchGrazedAbility, dispatchGrazedMenu } from '../core/grazeRegistry.js';

export class RecordSystem {

  static ITEM_CONFIG = {
    'lotm:leymano_travels': {
      displayName: "Leymano's Travels",
      maxSlots: 16,
      usesPerRecording: 5,
      recordingsProp: 'lotm:leymano_recordings',
      selectedProp: 'lotm:leymano_selected'
    },
    'lotm:staff_of_the_stars': {
      displayName: 'Staff of the Stars',
      maxSlots: 2,
      usesPerRecording: 5,
      recordingsProp: 'lotm:staff_recordings',
      selectedProp: 'lotm:staff_selected',
      travel: true // adds a Travel button to this item's menu — opens the real Traveler's Log via the same graze_traveler_log menuRef Creeping Hunger/Shepherd use
    },
    // Reuses the existing Scribe item/recipe — slot cap matches
    // ScribeSequence.MAX_RECORDED_ABILITIES (scribe.js), its old witness-based
    // record mechanic. Still Door/Scribe-pathway-gated in main.js, unlike the
    // two ungated sealed artifacts above.
    'lotm:recording_tome': {
      displayName: 'Recording Tome',
      maxSlots: 8,
      usesPerRecording: 5,
      recordingsProp: 'lotm:recording_tome_recordings',
      selectedProp: 'lotm:recording_tome_selected'
    }
  };

  // Flat debounce only (matches shepherd.js's GRAZED_ABILITY_COOLDOWN_TICKS
  // convention) — not a balance lever, just prevents a single click double-
  // firing and burning two charges at once.
  static CAST_COOLDOWN_TICKS = 8;
  static castCooldowns = new Map(); // `${player.name}_${itemId}` -> ticks remaining

  static _abilityIndex = null;

  // ability.id -> {ability, characteristicId}, built once from every
  // non-passive, single-call (abilityRef) entry across the whole registry.
  static _buildAbilityIndex() {
    if (this._abilityIndex) return this._abilityIndex;
    const index = {};
    for (const [characteristicId, abilities] of Object.entries(GRAZE_REGISTRY)) {
      for (const ability of abilities) {
        if (ability.isPassive) continue;
        if (!ability.abilityRef) continue;
        index[ability.id] = { ability, characteristicId };
      }
    }
    this._abilityIndex = index;
    return index;
  }

  // The Traveler's Log menuRef entry itself — excluded from _buildAbilityIndex
  // (no abilityRef, multi-step) but this is exactly what Staff of the Stars'
  // Travel button opens, via the same dispatchGrazedMenu path Creeping
  // Hunger/Shepherd already use for grazed access to it.
  static _travelerLogAbility = null;
  static _getTravelerLogAbility() {
    if (this._travelerLogAbility) return this._travelerLogAbility;
    this._travelerLogAbility = (GRAZE_REGISTRY['lotm:door_characteristic_seq5'] || [])
      .find(a => a.id === 'graze_traveler_log') || null;
    return this._travelerLogAbility;
  }

  // ── main entry point ──────────────────────────────────────────────────
  static useItem(player, itemId, isSneaking) {
    const config = this.ITEM_CONFIG[itemId];
    if (!config) return false;
    if (isSneaking) { this._openMainMenu(player, itemId, config); return true; }
    return this._castSelected(player, itemId, config);
  }

  static tick(player) {
    for (const itemId of Object.keys(this.ITEM_CONFIG)) {
      const key = `${player.name}_${itemId}`;
      const cd = this.castCooldowns.get(key);
      if (cd && cd > 0) this.castCooldowns.set(key, cd - 1);
    }
  }

  static cleanup(player) {
    for (const itemId of Object.keys(this.ITEM_CONFIG)) {
      this.castCooldowns.delete(`${player.name}_${itemId}`);
    }
  }

  // ── casting ──────────────────────────────────────────────────────────
  static _castSelected(player, itemId, config) {
    const key = `${player.name}_${itemId}`;
    if ((this.castCooldowns.get(key) || 0) > 0) return false;

    const recordings = this._getRecordings(player, config);
    if (recordings.length === 0) {
      player.sendMessage(`§7No ability recorded on your ${config.displayName} — sneak+use to record one.`);
      return false;
    }

    let selectedIndex = this._getSelected(player, config);
    if (selectedIndex < 0 || selectedIndex >= recordings.length) selectedIndex = 0;

    const entry = recordings[selectedIndex];
    const index = this._buildAbilityIndex();
    const found = index[entry.abilityId];

    if (!found) {
      player.sendMessage('§cThat recorded ability no longer exists — forgetting it.');
      recordings.splice(selectedIndex, 1);
      this._setRecordings(player, config, recordings);
      return false;
    }

    const result = dispatchGrazedAbility(player, found.ability);
    if (result === false) return false;

    this.castCooldowns.set(key, this.CAST_COOLDOWN_TICKS);

    entry.usesRemaining -= 1;
    player.sendMessage(`§d[Recorded] §7${found.ability.name} §8(${entry.usesRemaining} use${entry.usesRemaining === 1 ? '' : 's'} left)`);

    if (entry.usesRemaining <= 0) {
      recordings.splice(selectedIndex, 1);
      player.sendMessage(`§8The memory of §7${found.ability.name}§8 fades from the ${config.displayName}...`);
      try { player.playSound('random.orb', { pitch: 0.6, volume: 0.5 }); } catch (_) {}
      this._setSelected(player, config, Math.min(selectedIndex, recordings.length - 1));
    }

    this._setRecordings(player, config, recordings);
    return true;
  }

  // ── menus ────────────────────────────────────────────────────────────
  static async _openMainMenu(player, itemId, config) {
    const recordings = this._getRecordings(player, config);
    const form = new ActionFormData()
      .title(`§5${config.displayName}`)
      .body(`§7Recorded: ${recordings.length}/${config.maxSlots}`);

    const buttons = [];
    if (recordings.length < config.maxSlots) buttons.push('record');
    if (recordings.length > 0) { buttons.push('select'); buttons.push('forget'); }

    if (config.travel && this._getTravelerLogAbility()) buttons.push('travel');

    if (buttons.includes('record')) form.button('§aRecord New Ability');
    if (buttons.includes('select')) form.button('§bChoose Active Recording');
    if (buttons.includes('forget')) form.button('§cForget an Ability');
    if (buttons.includes('travel')) form.button("§bTravel\n§7Open the Traveler's Log");

    const response = await form.show(player);
    if (response.canceled || response.selection === undefined) return;

    const action = buttons[response.selection];
    if (action === 'record') { this._openRecordMenu(player, itemId, config); return; }
    if (action === 'select') { this._openSelectMenu(player, itemId, config); return; }
    if (action === 'forget') { this._openForgetMenu(player, itemId, config); return; }
    if (action === 'travel') { dispatchGrazedMenu(player, this._getTravelerLogAbility()); return; }
  }

  static async _openRecordMenu(player, itemId, config) {
    let inv = null;
    try { inv = player.getComponent('minecraft:inventory'); } catch (_) {}
    if (!inv?.container) return;

    // Scan inventory for characteristic items that have at least one
    // recordable (active, single-call) ability — unique typeIds only.
    const found = new Map(); // characteristicId -> amount
    for (let i = 0; i < inv.container.size; i++) {
      const item = inv.container.getItem(i);
      if (!item) continue;
      const abilities = GRAZE_REGISTRY[item.typeId];
      if (!abilities) continue;
      const hasRecordable = abilities.some(a => !a.isPassive && a.abilityRef);
      if (!hasRecordable) continue;
      found.set(item.typeId, (found.get(item.typeId) || 0) + item.amount);
    }

    if (found.size === 0) {
      player.sendMessage('§7You need a characteristic item in your inventory to record an ability from.');
      return;
    }

    const characteristicIds = [...found.keys()];
    const form = new ActionFormData().title('§5Record New Ability').body('§7Choose a characteristic to record from:');
    for (const charId of characteristicIds) {
      form.button(`§f${this._prettyCharacteristicName(charId)}\n§8x${found.get(charId)}`);
    }

    const response = await form.show(player);
    if (response.canceled || response.selection === undefined) return;

    const chosenCharId = characteristicIds[response.selection];
    const abilities = GRAZE_REGISTRY[chosenCharId].filter(a => !a.isPassive && a.abilityRef);

    const abilityForm = new ActionFormData().title('§5Choose Ability').body('§7Pick the ability to record:');
    for (const ability of abilities) {
      abilityForm.button(`${ability.name}\n§7${ability.description}`);
    }

    const abilityResponse = await abilityForm.show(player);
    if (abilityResponse.canceled || abilityResponse.selection === undefined) return;

    const chosenAbility = abilities[abilityResponse.selection];

    // Re-fetch inventory — time has passed across two form.show() awaits.
    let invNow = null;
    try { invNow = player.getComponent('minecraft:inventory'); } catch (_) {}
    const slot = this._findItemSlot(invNow, chosenCharId);
    if (slot === -1) {
      player.sendMessage('§cThat characteristic is no longer in your inventory.');
      return;
    }

    const recordings = this._getRecordings(player, config);
    if (recordings.length >= config.maxSlots) {
      player.sendMessage(`§cNo free slots left on your ${config.displayName} — forget one first.`);
      return;
    }

    const item = invNow.container.getItem(slot);
    if (item.amount > 1) { item.amount -= 1; invNow.container.setItem(slot, item); }
    else invNow.container.setItem(slot, undefined);

    recordings.push({ abilityId: chosenAbility.id, usesRemaining: config.usesPerRecording });
    this._setRecordings(player, config, recordings);
    this._setSelected(player, config, recordings.length - 1);

    player.sendMessage(`§d✦ ${chosenAbility.name} recorded §8(${config.usesPerRecording} uses) ✦`);
    try { player.playSound('random.levelup', { pitch: 1.4, volume: 0.6 }); } catch (_) {}
  }

  static async _openSelectMenu(player, itemId, config) {
    const recordings = this._getRecordings(player, config);
    const index = this._buildAbilityIndex();
    const selected = this._getSelected(player, config);

    const form = new ActionFormData().title('§5Choose Active Recording');
    recordings.forEach((entry, i) => {
      const found = index[entry.abilityId];
      const name = found ? found.ability.name : '§8Unknown Ability';
      const marker = i === selected ? '§a▶ ' : '';
      form.button(`${marker}${name}\n§8${entry.usesRemaining} use${entry.usesRemaining === 1 ? '' : 's'} left`);
    });

    const response = await form.show(player);
    if (response.canceled || response.selection === undefined) return;

    this._setSelected(player, config, response.selection);
    const chosen = index[recordings[response.selection].abilityId];
    player.sendMessage(`§d✦ ${chosen ? chosen.ability.name : 'Ability'} set as active ✦`);
  }

  static async _openForgetMenu(player, itemId, config) {
    const recordings = this._getRecordings(player, config);
    const index = this._buildAbilityIndex();

    const form = new ActionFormData().title('§cForget an Ability').body('§7This frees a slot but the remaining uses are lost.');
    recordings.forEach((entry) => {
      const found = index[entry.abilityId];
      const name = found ? found.ability.name : '§8Unknown Ability';
      form.button(`${name}\n§8${entry.usesRemaining} use${entry.usesRemaining === 1 ? '' : 's'} left`);
    });

    const response = await form.show(player);
    if (response.canceled || response.selection === undefined) return;

    const removedEntry = recordings[response.selection];
    const removedName = index[removedEntry.abilityId]?.ability.name || 'Ability';
    recordings.splice(response.selection, 1);

    const selected = this._getSelected(player, config);
    if (selected >= recordings.length) this._setSelected(player, config, recordings.length - 1);

    this._setRecordings(player, config, recordings);
    player.sendMessage(`§7${removedName} forgotten.`);
  }

  // ── helpers ──────────────────────────────────────────────────────────
  // "lotm:red_priest_characteristic_seq7" -> "Red Priest Characteristic (Seq 7)"
  static _prettyCharacteristicName(typeId) {
    const raw = typeId.replace('lotm:', '');
    const seqMatch = raw.match(/_seq(\d+)$/);
    const seq = seqMatch ? seqMatch[1] : null;
    const base = seq ? raw.slice(0, -seqMatch[0].length) : raw;
    const words = base.replace(/_characteristic$/, '').split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return seq ? `${words} Characteristic (Seq ${seq})` : `${words} Characteristic`;
  }

  static _findItemSlot(inv, typeId) {
    if (!inv?.container) return -1;
    for (let i = 0; i < inv.container.size; i++) {
      const it = inv.container.getItem(i);
      if (it?.typeId === typeId) return i;
    }
    return -1;
  }

  static _getRecordings(player, config) {
    try {
      const raw = player.getDynamicProperty(config.recordingsProp);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  static _setRecordings(player, config, recordings) {
    try { player.setDynamicProperty(config.recordingsProp, JSON.stringify(recordings)); } catch (_) {}
  }

  static _getSelected(player, config) {
    try {
      const v = player.getDynamicProperty(config.selectedProp);
      return typeof v === 'number' ? v : 0;
    } catch (_) { return 0; }
  }

  static _setSelected(player, config, index) {
    try { player.setDynamicProperty(config.selectedProp, index); } catch (_) {}
  }
}
