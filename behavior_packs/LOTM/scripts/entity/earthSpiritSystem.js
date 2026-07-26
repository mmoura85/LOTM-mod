// ============================================================================
// EARTH SPIRIT SYSTEM — Spirit Medium bonded utility/combat spirit
// ============================================================================
// Bonding (lotm:spirit_channeler) just records ownership — the earth spirit
// is NOT a persistent always-following companion. It is summon-only:
//   - lotm:spirit_vanguard_charm  -> temporary combat manifestation
//   - Spirit Channeler menu (sneak+use) -> Dig submenu -> temporary dig manifestation
//
// MAIN.JS WIRING:
//   import { EarthSpiritSystem } from './entity/earthSpiritSystem.js';
//   per-player tick loop: EarthSpiritSystem.tick(player);
//   playerInteractWithEntity: if (target.typeId === 'lotm:earth_spirit') EarthSpiritSystem.onInteract(player, target);
//   itemUse: lotm:spirit_vanguard_charm -> EarthSpiritSystem.summonCombat(player);
//   entityDie: lotm:earth_spirit_combat -> EarthSpiritSystem.onCombatDefeated(event.deadEntity.id);
// ============================================================================
import { system, BlockPermutation, ItemStack } from '@minecraft/server';
import { PathwayManager } from '../core/pathwayManager.js';
import { WispSystem } from './wispSystem.js';

const EFFECT_DURATION_TICKS = 20 * 30; // matches COMBAT_DURATION_MS below

export class EarthSpiritSystem {

  static MAX_EARTH_SPIRITS = 1;
  static BONDED_PROP = 'lotm:bonded_spirits';

  static COMBAT_DURATION_MS  = 30000; // 30s manifestation
  static COMBAT_COOLDOWN_MS  = 90000; // 90s cooldown after manifestation ends

  static DIG_WHITELIST = [
    ...WispSystem.ORE_TYPES,
    'minecraft:stone', 'minecraft:deepslate', 'minecraft:cobblestone', 'minecraft:cobbled_deepslate',
    'minecraft:dirt', 'minecraft:grass_block', 'minecraft:gravel', 'minecraft:sand', 'minecraft:red_sand',
    'minecraft:andesite', 'minecraft:diorite', 'minecraft:granite', 'minecraft:tuff', 'minecraft:sandstone',
    'minecraft:clay', 'minecraft:coal_ore', 'minecraft:deepslate_coal_ore'
  ];

  static DROP_TABLE = {
    'minecraft:stone': 'minecraft:cobblestone',
    'minecraft:deepslate': 'minecraft:cobbled_deepslate',
    'minecraft:coal_ore': 'minecraft:coal',
    'minecraft:deepslate_coal_ore': 'minecraft:coal',
    'minecraft:iron_ore': 'minecraft:raw_iron',
    'minecraft:deepslate_iron_ore': 'minecraft:raw_iron',
    'minecraft:gold_ore': 'minecraft:raw_gold',
    'minecraft:deepslate_gold_ore': 'minecraft:raw_gold',
    'minecraft:diamond_ore': 'minecraft:diamond',
    'minecraft:deepslate_diamond_ore': 'minecraft:diamond',
    'minecraft:emerald_ore': 'minecraft:emerald',
    'minecraft:deepslate_emerald_ore': 'minecraft:emerald',
    'minecraft:ancient_debris': 'minecraft:ancient_debris'
  };

  // In-memory state (reset on reload — same convention as spirit_medium.js's wolf cooldown)
  static combatCooldown    = new Map(); // playerId -> timestamp cooldown started
  static combatManifest    = new Map(); // playerId -> { entityId, startTime }
  static digJobActive      = new Map(); // playerId -> boolean
  static tickCounters      = new Map(); // playerName -> tick

  // ── Called from main.js playerInteractWithEntity ─────────────────────────
  static onInteract(player, wildEntity) {
    let heldItem = null;
    try {
      const inv = player.getComponent('minecraft:inventory');
      heldItem = inv?.container?.getItem(player.selectedSlotIndex);
    } catch (_) {}

    if (!heldItem || heldItem.typeId !== 'lotm:spirit_channeler') {
      player.sendMessage('§8The earth spirit watches you warily... (hold §7Spirit Channeler§8 to bond)');
      return;
    }

    this.onBond(player, wildEntity);
  }

  static onBond(player, wildEntity) {
    const pathway = PathwayManager.getPathway(player);
    if (!pathway) {
      player.sendMessage('§8You must be a Beyonder to bond with an earth spirit.');
      return;
    }

    const sequence = PathwayManager.getSequence(player);
    if (pathway !== PathwayManager.PATHWAYS.DEATH || sequence === -1 || sequence > 7) {
      player.sendMessage('§8This spirit will not answer to you — only a Death pathway Spirit Medium (Sequence 7 and beyond) can bond it.');
      return;
    }

    const bonded = this._getBondedSpirits(player);
    if (bonded.some(b => b.type === 'earth')) {
      player.sendMessage('§8You already have a bonded earth spirit.');
      return;
    }
    if (bonded.length >= this.MAX_EARTH_SPIRITS) {
      player.sendMessage('§8You cannot bond any more spirits.');
      return;
    }

    bonded.push({ type: 'earth', bondedAt: Date.now() });
    this._saveBondedSpirits(player, bonded);

    player.sendMessage('§b✦ EARTH SPIRIT BONDED ✦');
    player.sendMessage('§8It sinks back into the stone, awaiting your call.');
    player.sendMessage('§8Use a §7Spirit Vanguard\'s Charm§8 to summon it for battle, or sneak+use your §7Spirit Channeler§8 to direct it to dig.');
    player.playSound('mob.bat.hurt', { pitch: 0.6, volume: 0.6 });

    const loc = wildEntity.location;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      try { player.dimension.spawnParticle('minecraft:totem_particle', {
        x: loc.x + Math.cos(a) * 0.5, y: loc.y + 0.2, z: loc.z + Math.sin(a) * 0.5
      }); } catch (_) {}
    }

    system.runTimeout(() => {
      try { wildEntity.triggerEvent('lotm:despawn'); } catch (_) {}
    }, 10);
  }

  static hasBond(player) {
    return this._getBondedSpirits(player).some(b => b.type === 'earth');
  }

  // ── Combat manifestation ──────────────────────────────────────────────────
  static summonCombat(player) {
    const pathway  = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    if (pathway !== PathwayManager.PATHWAYS.DEATH || sequence === -1 || sequence > 7) {
      player.sendMessage('§8Only a Death pathway Spirit Medium (Sequence 7 and beyond) can wield this charm.');
      return false;
    }
    if (!this.hasBond(player)) {
      player.sendMessage('§8You have no bonded earth spirit to summon.');
      return false;
    }

    const now = Date.now();
    const cdRemain = this.COMBAT_COOLDOWN_MS - (now - (this.combatCooldown.get(player.id) || 0));
    if (cdRemain > 0) {
      player.sendMessage(`§8Your earth spirit is still weakened (${(cdRemain / 1000).toFixed(0)}s)`);
      return false;
    }

    if (this.combatManifest.has(player.id)) {
      player.sendMessage('§8Your earth spirit is already manifested.');
      return false;
    }

    let existing = 0;
    try {
      existing = player.dimension.getEntities({
        location: player.location, maxDistance: 60, type: 'lotm:earth_spirit_combat'
      }).length;
    } catch (_) {}
    if (existing > 0) {
      player.sendMessage('§8Your earth spirit already walks beside you.');
      return false;
    }

    const view = player.getViewDirection();
    const loc  = player.location;
    const hLen = Math.sqrt(view.x * view.x + view.z * view.z) || 1;
    const rx = -view.z / hLen, rz = view.x / hLen;
    const spawnPos = { x: loc.x + rx * 2.0, y: loc.y, z: loc.z + rz * 2.0 };

    let combatEntity = null;
    try { combatEntity = player.dimension.spawnEntity('lotm:earth_spirit_combat', spawnPos); } catch (_) {}
    if (!combatEntity) return false;

    this.combatManifest.set(player.id, { entityId: combatEntity.id, startTime: now });

    try { player.addEffect('haste', EFFECT_DURATION_TICKS, { amplifier: 0, showParticles: false }); } catch (_) {}
    try { player.addEffect('resistance', EFFECT_DURATION_TICKS, { amplifier: 0, showParticles: false }); } catch (_) {}

    player.sendMessage('§8The earth spirit rises to fight at your side!');
    player.playSound('mob.wither.ambient', { pitch: 0.6, volume: 0.9 });

    for (let j = 0; j < 14; j++) {
      const a = (j / 14) * Math.PI * 2;
      try { player.dimension.spawnParticle('minecraft:totem_particle', {
        x: spawnPos.x + Math.cos(a) * 0.7, y: spawnPos.y + 0.5, z: spawnPos.z + Math.sin(a) * 0.7
      }); } catch (_) {}
    }

    return true;
  }

  static onCombatDefeated(entityId) {
    for (const [playerId, state] of this.combatManifest) {
      if (state.entityId === entityId) {
        this.combatManifest.delete(playerId);
        this.combatCooldown.set(playerId, Date.now());
        return;
      }
    }
  }

  // ── Main tick — called each interval for each player ─────────────────────
  static tick(player) {
    const t = (this.tickCounters.get(player.name) || 0) + 1;
    this.tickCounters.set(player.name, t);
    if (t % 20 !== 0) return; // once per second

    const state = this.combatManifest.get(player.id);
    if (!state) return;

    let combatEntity = null;
    try {
      combatEntity = player.dimension.getEntities({
        location: player.location, maxDistance: 64, type: 'lotm:earth_spirit_combat'
      }).find(e => e.id === state.entityId) ?? null;
    } catch (_) {}

    const expired = Date.now() - state.startTime >= this.COMBAT_DURATION_MS;
    if (!combatEntity || expired) {
      if (combatEntity) {
        try { combatEntity.triggerEvent('lotm:despawn'); } catch (_) {}
      }
      this.combatManifest.delete(player.id);
      this.combatCooldown.set(player.id, Date.now());
    }
  }

  // ── Dig manifestation ──────────────────────────────────────────────────────
  static startDig(player, { width = 1, height = 2, length = 10 } = {}) {
    const pathway  = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    if (pathway !== PathwayManager.PATHWAYS.DEATH || sequence === -1 || sequence > 7) {
      player.sendMessage('§8Only a Death pathway Spirit Medium (Sequence 7 and beyond) can direct this spirit.');
      return false;
    }
    if (!this.hasBond(player)) {
      player.sendMessage('§8You have no bonded earth spirit to direct.');
      return false;
    }
    if (this.digJobActive.get(player.id)) {
      player.sendMessage('§8Your earth spirit is already digging.');
      return false;
    }

    width  = Math.max(1, Math.min(10, Math.round(width)));
    height = Math.max(1, Math.min(10, Math.round(height)));
    length = Math.max(1, Math.min(10, Math.round(length)));

    const dimension = player.dimension;
    const loc = player.location;

    let digEntity = null;
    try { digEntity = dimension.spawnEntity('lotm:earth_spirit_dig', loc); } catch (_) {}
    if (!digEntity) return false;

    const view = player.getViewDirection();
    const hLen = Math.sqrt(view.x * view.x + view.z * view.z) || 1;
    const fx = view.x / hLen, fz = view.z / hLen;   // forward (facing)
    const rx = -fz, rz = fx;                        // perpendicular (width axis)

    const originX = Math.floor(loc.x), originY = Math.floor(loc.y), originZ = Math.floor(loc.z);

    const queue = [];
    for (let l = 1; l <= length; l++) {
      for (let h = 0; h < height; h++) {
        for (let w = -Math.floor((width - 1) / 2); w <= Math.ceil((width - 1) / 2); w++) {
          const x = Math.round(originX + fx * l + rx * w);
          const z = Math.round(originZ + fz * l + rz * w);
          const y = originY + h;
          queue.push({ x, y, z });
        }
      }
    }

    this.digJobActive.set(player.id, true);
    player.sendMessage(`§8The earth spirit begins to dig (${width}×${height}×${length})...`);

    system.runJob(this._digJobGenerator(player, digEntity, dimension, queue));
    return true;
  }

  static *_digJobGenerator(player, digEntity, dimension, queue) {
    const air = BlockPermutation.resolve('minecraft:air');
    try {
      for (const pos of queue) {
        if (!player.isValid()) return;

        let block = null;
        try { block = dimension.getBlock(pos); } catch (_) {}
        if (!block || !this.DIG_WHITELIST.includes(block.typeId)) { yield; continue; }

        const dropId = this.DROP_TABLE[block.typeId] ?? block.typeId;
        try { dimension.setBlockPermutation(pos, air); } catch (_) {}
        try { dimension.spawnItem(new ItemStack(dropId, 1), pos); } catch (_) {}

        if (digEntity.isValid()) {
          try { digEntity.teleport({ x: pos.x + 0.5, y: pos.y, z: pos.z + 0.5 }); } catch (_) {}
        }

        yield;
      }
      try { player.sendMessage('§8The earth spirit finishes its work and sinks back into the stone.'); } catch (_) {}
    } finally {
      try { if (digEntity.isValid()) digEntity.triggerEvent('lotm:despawn'); } catch (_) {}
      this.digJobActive.delete(player.id);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  static _getBondedSpirits(player) {
    try {
      const raw = player.getDynamicProperty(this.BONDED_PROP);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (_) { return []; }
  }

  static _saveBondedSpirits(player, bonded) {
    try { player.setDynamicProperty(this.BONDED_PROP, JSON.stringify(bonded)); } catch (_) {}
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  static cleanup(player) {
    this.tickCounters.delete(player.name);
    this.combatCooldown.delete(player.id);
    this.combatManifest.delete(player.id);
    this.digJobActive.delete(player.id);
  }
}
