// ============================================================================
// SPIRIT MESSENGER SYSTEM — cross-player item courier (Silver Ritualistic Knife)
// ============================================================================
// The messenger entity is purely cosmetic — cargo is carried by a plain item
// (lotm:spirit_messenger_pouch) whose contents live in a real chest, spawned
// at the player's feet on use and torn down (contents serialized back onto
// the pouch's own dynamic properties) once they walk away — the exact same
// pattern as the Hermit Warlock's Spell Pouch (scripts/sequences/hermit/
// warlock.js), except with no item-type whitelist (Spell Pouch only accepts
// specific powders; this accepts anything except itself, to avoid nesting).
// This replaced an earlier attempt using vanilla Bundle-style item components
// (minecraft:storage_item/bundle_interaction) which turned out to require
// format_version >= 1.21.40 (this pack's items are on 1.21.0) and never
// actually opened in testing — see memory for the full trail. The messenger
// entity's own minecraft:inventory + rideable approach was tried even earlier
// and also proved unreliable (see memory / plan file).
//
// Flow (all via the Silver Knife's menu — scripts/ui/silver_knife_menu.js):
//   Summon      -> spawns the cosmetic messenger near the sender
//   Add Pouch   -> gives the sender a spirit_messenger_pouch if they don't have one
//   (use item)  -> plain-use on the pouch opens/closes the chest (see openPouch/
//                  _checkPouchClosed below) — mirrors Spell Pouch's plain-use trigger
//   Send        -> picks an online target, removes the (filled) pouch from the
//                  sender's inventory, messenger vanishes ~12s, reappears near
//                  the target; interacting with it there gives them the pouch
//                  and dismisses the messenger — single interaction, no
//                  sneak/plain distinction needed anymore.
//
// MAIN.JS WIRING:
//   import { SpiritMessengerSystem } from './entity/spiritMessengerSystem.js';
//   itemUse 'lotm:spirit_messenger_pouch' -> SpiritMessengerSystem.openPouch(player);
//   world.beforeEvents.playerInteractWithEntity -> SpiritMessengerSystem.onInteractBefore(event);
//   world.afterEvents.playerInteractWithEntity -> SpiritMessengerSystem.onInteract(player, target);
//   per-player tick loop -> SpiritMessengerSystem.tick(player); (also drives pouch-close checks)
// (summon/givePouch/send are called from scripts/ui/silver_knife_menu.js)
// ============================================================================
import { world, system, ItemStack } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';
import { PathwayManager } from '../core/pathwayManager.js';
import { SpiritSystem } from '../core/spiritSystem.js';
import { SpiritShardSystem } from '../core/spiritShardSystem.js';

const SUMMON_COST = 50; // live spirit, Beyonders
const SUMMON_SHARD_COST = 2; // lotm:spirit_shard, non-Beyonders
const SUMMON_COOLDOWN_MS = 22000;
const TRANSIT_TICKS = 240; // ~12s
const POUCH_ID = 'lotm:spirit_messenger_pouch';

const POUCH_CONTENTS_PROP = 'lotm:pouch_items';
const POUCH_UID_PROP = 'lotm:pouch_uid';

export class SpiritMessengerSystem {

  // entityId -> { phase: 'ready'|'in_transit'|'delivered', senderName, targetName, pouchItem }
  static messengers = new Map();
  static summonCooldown = new Map(); // playerId -> timestamp

  // playerName -> { chestLoc, pouchSlot } — mirrors WarlockSequence's spell pouch pattern
  static activePouchSessions = new Map();

  // ── Called from silver_knife_menu.js: Summon ───────────────────────────────
  // Beyonders pay with live spirit (reserve-fallback via the knife applies as
  // usual); non-Beyonders can still summon by paying with Spirit Shards
  // instead — the courier function itself has nothing Beyonder-specific
  // about it, only the "spend spirit" cost did.
  static summon(player) {
    const isBeyonder = PathwayManager.hasPathway(player);

    const now = Date.now();
    const cdRemain = SUMMON_COOLDOWN_MS - (now - (this.summonCooldown.get(player.id) || 0));
    if (cdRemain > 0) {
      player.sendMessage(`§8The spirit world is still settling (${(cdRemain / 1000).toFixed(0)}s)`);
      return false;
    }

    for (const state of this.messengers.values()) {
      if (state.senderName === player.name && state.phase !== 'delivered') {
        player.sendMessage('§8You already have a spirit messenger active.');
        return false;
      }
    }

    if (isBeyonder) {
      if (!SpiritSystem.canAfford(player, SUMMON_COST)) {
        player.sendMessage(`§cNot enough spirit (need ${SUMMON_COST})`);
        return false;
      }
    } else {
      if (SpiritShardSystem.countShards(player) < SUMMON_SHARD_COST) {
        player.sendMessage(`§cNot enough Spirit Shards (need ${SUMMON_SHARD_COST})`);
        return false;
      }
    }

    let entity = null;
    try { entity = player.dimension.spawnEntity('lotm:spirit_messenger', {
      x: player.location.x, y: player.location.y + 1, z: player.location.z
    }); } catch (_) {}
    if (!entity) return false;

    if (isBeyonder) SpiritSystem.consumeSpirit(player, SUMMON_COST);
    else SpiritShardSystem.consumeShards(player, SUMMON_SHARD_COST);
    this.summonCooldown.set(player.id, now);

    this.messengers.set(entity.id, {
      phase: 'ready',
      senderName: player.name,
      targetName: null,
      pouchItem: null
    });

    player.sendMessage('§d✦ A spirit messenger answers your call ✦');
    player.sendMessage('§7Add a pouch to your inventory, fill it, then Send from the knife menu.');
    player.playSound('mob.bat.hurt', { pitch: 1.6, volume: 0.6 });

    return true;
  }

  // ── Called from silver_knife_menu.js: Add Pouch to Inventory ──────────────
  static givePouch(player) {
    if (this._findPouchSlot(player) !== -1) {
      player.sendMessage('§8You already have a Spirit Messenger Pouch.');
      return false;
    }

    let inv = null;
    try { inv = player.getComponent('minecraft:inventory'); } catch (_) {}
    if (!inv?.container) return false;

    const item = new ItemStack(POUCH_ID, 1);
    item.setDynamicProperty(POUCH_UID_PROP, this._genUid());
    try { inv.container.addItem(item); } catch (_) { return false; }

    player.sendMessage('§dA Spirit Messenger Pouch appears in your inventory.');
    player.sendMessage('§7Hold it and use it to open the pouch and load items in.');
    player.playSound('random.pop', { pitch: 1.2, volume: 0.7 });
    return true;
  }

  // ── Pouch contents, serialized onto the pouch ItemStack's own dynamic
  // properties (travels with the item across inventories/the messenger send
  // automatically — no extra plumbing needed for that). ─────────────────────
  static getPouchContents(pouchItem) {
    try {
      const raw = pouchItem.getDynamicProperty(POUCH_CONTENTS_PROP);
      if (typeof raw === 'string' && raw.length > 0) return JSON.parse(raw);
    } catch (_) {}
    return [];
  }

  static setPouchContents(pouchItem, contents) {
    try { pouchItem.setDynamicProperty(POUCH_CONTENTS_PROP, JSON.stringify(contents)); } catch (_) {}
  }

  static _genUid() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  // Returns { item, slot } for the FIRST pouch found — ambiguous when a player
  // has more than one (e.g. accumulated several via the messenger). Only safe
  // for "do you have any pouch at all" checks; never use to resolve which
  // pouch a specific open/save session belongs to — see findPouchByUid below.
  static findPouch(player) {
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return null;
      for (let slot = 0; slot < inv.container.size; slot++) {
        const item = inv.container.getItem(slot);
        if (item && item.typeId === POUCH_ID) return { item, slot };
      }
    } catch (_) {}
    return null;
  }

  // Finds the exact pouch instance matching a uid — used to re-locate a
  // specific pouch that may have moved slots while its chest was open.
  static findPouchByUid(player, uid) {
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return null;
      for (let slot = 0; slot < inv.container.size; slot++) {
        const item = inv.container.getItem(slot);
        if (item && item.typeId === POUCH_ID && item.getDynamicProperty(POUCH_UID_PROP) === uid) {
          return { item, slot };
        }
      }
    } catch (_) {}
    return null;
  }

  // ── Opens the pouch — spawns a chest at the player's feet and fills it
  // with whatever's currently saved on the pouch. Any item type is allowed
  // (unlike the Warlock's powder-only Spell Pouch this is modeled on).
  // Always opens whichever pouch the player is actually holding/using
  // (player.selectedSlotIndex) — not just "a" pouch — so having multiple
  // pouches in inventory (from several deliveries) can't cross-contaminate. ─
  static openPouch(player) {
    if (this.activePouchSessions.has(player.name)) {
      player.sendMessage('§eSpirit Messenger Pouch is already open nearby!');
      return;
    }

    let inv = null;
    try { inv = player.getComponent('minecraft:inventory'); } catch (_) {}
    const slot = player.selectedSlotIndex;
    const heldItem = inv?.container?.getItem(slot);
    if (!heldItem || heldItem.typeId !== POUCH_ID) {
      player.sendMessage('§cNo Spirit Messenger Pouch found in inventory!');
      return;
    }

    let uid = heldItem.getDynamicProperty(POUCH_UID_PROP);
    if (typeof uid !== 'string') {
      // Legacy pouch predating uid tagging — tag it now.
      uid = this._genUid();
      heldItem.setDynamicProperty(POUCH_UID_PROP, uid);
      inv.container.setItem(slot, heldItem);
    }
    const pouch = { item: heldItem, slot };

    const view = player.getViewDirection();
    const cx = Math.floor(player.location.x + view.x * 2);
    const cy = Math.floor(player.location.y);
    const cz = Math.floor(player.location.z + view.z * 2);
    const chestLoc = { x: cx, y: cy, z: cz };

    try {
      player.dimension.runCommand(`setblock ${cx} ${cy} ${cz} chest`);
    } catch (_) {
      player.sendMessage('§cCould not place pouch chest here!');
      return;
    }

    system.runTimeout(() => {
      try {
        const freshPouch = this.findPouchByUid(player, uid);
        if (!freshPouch) return;
        const block = player.dimension.getBlock(chestLoc);
        const container = block?.getComponent('inventory')?.container ?? null;
        if (!container) return;
        const contents = this.getPouchContents(freshPouch.item);
        let fillSlot = 0;
        for (const entry of contents) {
          if (fillSlot >= container.size) break;
          try { container.setItem(fillSlot, new ItemStack(entry.typeId, entry.amount)); } catch (_) {}
          fillSlot++;
        }
      } catch (_) {}
    }, 2);

    this.activePouchSessions.set(player.name, { chestLoc, pouchSlot: pouch.slot, pouchUid: uid });

    player.sendMessage('§d✦ Spirit Messenger Pouch opened!');
    player.sendMessage('§7Add or remove items from the chest, then §emove away §7to save and close.');
    player.playSound('block.chest.open', { pitch: 1.2, volume: 1.0 });
  }

  // ── Called every player tick (see tick() below) — closes+saves the pouch
  // once the player walks away from the chest. ──────────────────────────────
  static _checkPouchClosed(player) {
    const session = this.activePouchSessions.get(player.name);
    if (!session) return;

    const { chestLoc } = session;
    const dx = player.location.x - chestLoc.x;
    const dy = player.location.y - chestLoc.y;
    const dz = player.location.z - chestLoc.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 4) {
      this._savePouchAndRemoveChest(player, session);
    }
  }

  static _savePouchAndRemoveChest(player, session) {
    const { chestLoc, pouchSlot, pouchUid } = session;
    this.activePouchSessions.delete(player.name);

    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return;

      const contents = [];
      const block = player.dimension.getBlock(chestLoc);
      const container = block?.getComponent('inventory')?.container ?? null;

      if (container) {
        for (let slot = 0; slot < container.size; slot++) {
          try {
            const item = container.getItem(slot);
            if (!item) continue;
            if (item.typeId === POUCH_ID) {
              // Don't allow a pouch inside itself — hand it back instead.
              try { inv.container.addItem(item); } catch (_) { player.dimension.spawnItem(item, player.location); }
              continue;
            }
            contents.push({ typeId: item.typeId, amount: item.amount });
          } catch (_) {}
        }
      }

      // Resolve the EXACT pouch this session belongs to — first try its
      // original slot (the common case), fall back to a uid search in case
      // the player reshuffled their inventory while the chest was open.
      // Never fall back to "any pouch" — that's what caused pouches to
      // clobber each other's contents when a player had more than one.
      let pouchItem = inv.container.getItem(pouchSlot);
      let targetSlot = pouchSlot;
      if (!pouchItem || pouchItem.typeId !== POUCH_ID || pouchItem.getDynamicProperty(POUCH_UID_PROP) !== pouchUid) {
        const found = this.findPouchByUid(player, pouchUid);
        pouchItem = found?.item ?? null;
        targetSlot = found?.slot ?? -1;
      }

      if (pouchItem && targetSlot !== -1) {
        this.setPouchContents(pouchItem, contents);
        inv.container.setItem(targetSlot, pouchItem);
      } else if (contents.length > 0) {
        player.sendMessage('§cSpirit Messenger Pouch not found — contents dropped!');
      }

      player.dimension.runCommand(`setblock ${chestLoc.x} ${chestLoc.y} ${chestLoc.z} air`);
      player.sendMessage(`§dSpirit Messenger Pouch saved and closed. §7(${contents.length} item stack${contents.length === 1 ? '' : 's'})`);
      player.playSound('block.chest.close', { pitch: 1.2, volume: 1.0 });
    } catch (_) {
      this.activePouchSessions.delete(player.name);
      try { player.dimension.runCommand(`setblock ${chestLoc.x} ${chestLoc.y} ${chestLoc.z} air destroy`); } catch (_) {}
    }
  }

  // ── Called from silver_knife_menu.js: Send ─────────────────────────────────
  static async send(player) {
    let entry = null;
    for (const [entityId, state] of this.messengers) {
      if (state.senderName === player.name && state.phase === 'ready') { entry = [entityId, state]; break; }
    }
    if (!entry) {
      player.sendMessage('§8You have no spirit messenger ready to send. Summon one first.');
      return false;
    }
    const [entityId, state] = entry;

    const pouchSlot = this._findPouchSlot(player);
    if (pouchSlot === -1) {
      player.sendMessage('§8You need a Spirit Messenger Pouch to send. Add one from the menu.');
      return false;
    }

    const others = world.getAllPlayers().filter(p => p.name !== player.name);
    if (others.length === 0) {
      player.sendMessage('§8No other Beyonders are online right now.');
      return false;
    }

    const form = new ActionFormData()
      .title('§dSend Spirit Messenger')
      .body('§7Choose who to send it to:');
    for (const p of others) form.button(`§f${p.name}`);
    form.button('§7Cancel');

    const response = await form.show(player);
    if (response.canceled || response.selection === undefined || response.selection === others.length) return false;

    let entity = null;
    try {
      entity = player.dimension.getEntities({
        location: player.location, maxDistance: 64, type: 'lotm:spirit_messenger'
      }).find(e => e.id === entityId) ?? null;
    } catch (_) {}
    if (!entity || !entity.isValid()) { this.messengers.delete(entityId); return false; }

    let inv = null;
    try { inv = player.getComponent('minecraft:inventory'); } catch (_) {}
    const pouch = inv?.container?.getItem(pouchSlot);
    if (!pouch || pouch.typeId !== POUCH_ID) {
      player.sendMessage('§cSomething went wrong — pouch not found.');
      return false;
    }
    inv.container.setItem(pouchSlot, undefined);

    const target = others[response.selection];
    state.targetName = target.name;
    state.phase = 'in_transit';
    state.pouchItem = pouch;

    player.sendMessage(`§d✦ The messenger vanishes, bound for §f${target.name}§d ✦`);
    player.playSound('mob.wither.ambient', { pitch: 1.8, volume: 0.7 });

    try { entity.addEffect('invisibility', TRANSIT_TICKS + 20, { showParticles: false }); } catch (_) {}
    try { entity.teleport({ x: entity.location.x, y: 320, z: entity.location.z }); } catch (_) {}

    system.runTimeout(() => this._tryDeliver(entityId), TRANSIT_TICKS);
    return true;
  }

  // ── Called from main.js's per-player tick loop ─────────────────────────────
  // Keeps a not-yet-sent messenger hovering near its summoner — it has no
  // wander/follow AI of its own, this is fully scripted. Also checks whether
  // the player has walked away from an open pouch chest.
  static tick(player) {
    this._checkPouchClosed(player);

    for (const [entityId, state] of this.messengers) {
      if (state.phase !== 'ready' || state.senderName !== player.name) continue;

      let entity = null;
      try {
        entity = player.dimension.getEntities({
          location: player.location, maxDistance: 64, type: 'lotm:spirit_messenger'
        }).find(e => e.id === entityId) ?? null;
      } catch (_) {}
      if (!entity || !entity.isValid()) continue;

      const view = player.getViewDirection();
      const hLen = Math.sqrt(view.x * view.x + view.z * view.z) || 1;
      const fx = view.x / hLen, fz = view.z / hLen;
      const hoverSpot = {
        x: player.location.x + fx * 1.5,
        y: player.location.y + 1.3,
        z: player.location.z + fz * 1.5
      };

      const dx = entity.location.x - hoverSpot.x;
      const dy = entity.location.y - hoverSpot.y;
      const dz = entity.location.z - hoverSpot.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 2.5) {
        try { entity.teleport(hoverSpot); } catch (_) {}
      }
    }
  }

  // ── Called from main.js world.beforeEvents.playerInteractWithEntity ───────
  // Only the delivered-to player may interact, and only once it has arrived.
  static onInteractBefore(event) {
    const { player, target } = event;
    if (target.typeId !== 'lotm:spirit_messenger') return;

    const state = this.messengers.get(target.id);
    if (!state || state.phase !== 'delivered') { event.cancel = true; return; }
    if (player.name !== state.targetName) {
      event.cancel = true;
      player.sendMessage('§8This messenger is not here for you.');
    }
  }

  // ── Called from main.js world.afterEvents.playerInteractWithEntity ────────
  // Single interaction: hand over the pouch and dismiss the messenger.
  static onInteract(player, target) {
    if (target.typeId !== 'lotm:spirit_messenger') return;

    const state = this.messengers.get(target.id);
    if (!state || state.phase !== 'delivered') return;

    let inv = null;
    try { inv = player.getComponent('minecraft:inventory'); } catch (_) {}
    if (inv?.container && state.pouchItem) {
      try { inv.container.addItem(state.pouchItem); } catch (_) {}
    }

    player.sendMessage('§d✦ You take the Spirit Messenger Pouch ✦');
    player.playSound('random.pop', { pitch: 1.2, volume: 0.7 });

    this._dismiss(target);
  }

  // ── Attempt delivery; retries indefinitely if the target is offline ───────
  static _tryDeliver(entityId) {
    let entity = null;
    try {
      entity = world.getDimension('overworld').getEntities({ type: 'lotm:spirit_messenger' })
        .find(e => e.id === entityId) ?? null;
      if (!entity) {
        for (const dimId of ['nether', 'the_end']) {
          entity = world.getDimension(dimId).getEntities({ type: 'lotm:spirit_messenger' }).find(e => e.id === entityId) ?? null;
          if (entity) break;
        }
      }
    } catch (_) {}

    if (!entity || !entity.isValid()) { this.messengers.delete(entityId); return; }

    const state = this.messengers.get(entityId);
    if (!state || state.phase !== 'in_transit') return;

    const target = world.getAllPlayers().find(p => p.name === state.targetName);
    if (!target) {
      // Target offline — keep waiting, retry shortly. The pouch is never lost.
      system.runTimeout(() => this._tryDeliver(entityId), TRANSIT_TICKS);
      return;
    }

    try { entity.teleport({ x: target.location.x, y: target.location.y + 1, z: target.location.z }, { dimension: target.dimension }); } catch (_) {}
    try { entity.removeEffect('invisibility'); } catch (_) {}

    state.phase = 'delivered';

    target.sendMessage('§d✦ A spirit messenger has arrived for you ✦');
    target.sendMessage('§7Interact with it to take the pouch it carries.');
    try { target.playSound('mob.bat.hurt', { pitch: 1.6, volume: 0.6 }); } catch (_) {}
  }

  static _findPouchSlot(player) {
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return -1;
      for (let i = 0; i < inv.container.size; i++) {
        const item = inv.container.getItem(i);
        if (item && item.typeId === POUCH_ID) return i;
      }
    } catch (_) {}
    return -1;
  }

  static _dismiss(entity) {
    this.messengers.delete(entity.id);
    try { entity.triggerEvent('lotm:despawn'); } catch (_) {}
  }
}
