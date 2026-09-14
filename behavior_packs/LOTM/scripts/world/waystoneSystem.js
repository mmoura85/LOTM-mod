// ============================================================================
// WAYSTONE SYSTEM — global, shared fast-travel network
// ============================================================================
// Craftable/placeable block (lotm:waystone). Placing one prompts for a name
// (blank -> coordinate-based fallback so every entry has a usable label) and
// registers it; mining one unregisters it (the only way to "rename" is to
// mine + replace). Right-clicking a waystone opens a menu of every OTHER
// registered waystone and warps you there — global/shared (any player can
// use any waystone), waystone-to-waystone only (no portable warp item, that's
// the Traveler Bracelet's own niche — see items/travelerBraceletSystem.js).
//
// Registry is a single JSON array stored on a WORLD dynamic property (not a
// player one) since it must be listable from anywhere, not just scanned by
// proximity — this is the one part of this system without a same-shape
// precedent elsewhere in this pack, though world.setDynamicProperty is
// standard, well-documented @minecraft/server API, not experimental.
//
// MAIN.JS WIRING:
//   import { WaystoneSystem } from './world/waystoneSystem.js';
//   in initialize(): WaystoneSystem.registerEvents();
// ============================================================================
import { world, system } from '@minecraft/server';
import { ActionFormData, ModalFormData } from '@minecraft/server-ui';

const BLOCK_ID = 'lotm:waystone';
const REGISTRY_PROP = 'lotm:waystone_registry';

export class WaystoneSystem {

  // Per-player interact debounce — same shape as chairSystem.js's own
  // _cooldowns Set. Needed because landing a player on/right next to the
  // destination waystone right after a warp can otherwise immediately
  // re-trigger this same interact handler if the use button is still held
  // from picking the menu option, forcing the warp menu straight back open.
  static _interactCooldowns = new Set();

  static registerEvents() {
    world.afterEvents.playerPlaceBlock.subscribe((event) => {
      const { block, player } = event;
      if (block.typeId !== BLOCK_ID) return;
      system.run(() => this._promptName(player, block));
    });

    world.afterEvents.playerBreakBlock.subscribe((event) => {
      const { block, dimension } = event;
      if (block.typeId !== BLOCK_ID) return;
      const loc = block.location;
      this._remove(loc.x, loc.y, loc.z, dimension.id);
    });

    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
      if (event.block.typeId !== BLOCK_ID) return;
      event.cancel = true;

      const player = event.player;
      const block = event.block;

      const playerId = player.id;
      if (this._interactCooldowns.has(playerId)) return;
      this._interactCooldowns.add(playerId);
      system.runTimeout(() => this._interactCooldowns.delete(playerId), 20);

      system.run(() => this._openWarpMenu(player, block));
    });
  }

  static async _promptName(player, block) {
    const loc = block.location;
    let nameInput = '';
    try {
      const form = new ModalFormData()
        .title('§bName this Waystone')
        .textField('§7Enter a name (leave blank to use its coordinates)', 'e.g. Home Base', '');
      const response = await form.show(player);
      if (!response.canceled) nameInput = response.formValues?.[0] ?? '';
    } catch (_) {}

    const name = (typeof nameInput === 'string' && nameInput.trim().length > 0)
      ? nameInput.trim()
      : `Waystone (${loc.x}, ${loc.y}, ${loc.z})`;

    this._add({ name, x: loc.x, y: loc.y, z: loc.z, dimensionId: player.dimension.id });

    player.sendMessage(`§b✦ Waystone registered: §f${name} ✦`);
    try { player.playSound('random.orb', { pitch: 1.0, volume: 0.6 }); } catch (_) {}
  }

  static async _openWarpMenu(player, block) {
    const loc = block.location;
    const dimensionId = player.dimension.id;
    const others = this._all().filter(w =>
      !(w.x === loc.x && w.y === loc.y && w.z === loc.z && w.dimensionId === dimensionId)
    );

    if (others.length === 0) {
      player.sendMessage('§8No other waystones have been registered yet.');
      return;
    }

    let response = null;
    try {
      const form = new ActionFormData().title('§bWaystone Network');
      for (const w of others) form.button(w.name);
      response = await form.show(player);
    } catch (_) { return; }

    if (!response || response.canceled || response.selection === undefined) return;
    this._warpTo(player, others[response.selection]);
  }

  static _warpTo(player, target) {
    let dim;
    try { dim = world.getDimension(target.dimensionId); } catch (_) {
      player.sendMessage('§cWarp failed — that waystone may no longer be reachable.');
      return;
    }

    const dest = this._findLandingSpot(dim, target);

    try {
      player.teleport(dest, { dimension: dim });
      player.playSound('mob.endermen.portal', { pitch: 1.0, volume: 1.0 });
    } catch (_) {
      player.sendMessage('§cWarp failed — that waystone may no longer be reachable.');
      return;
    }

    player.sendMessage(`§b✦ You arrive at §f${target.name} ✦`);

    // Cosmetic arrival flourish
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      try { dim.spawnParticle('minecraft:portal_directional', {
        x: dest.x + Math.cos(a) * 0.6, y: dest.y + 0.1, z: dest.z + Math.sin(a) * 0.6
      }); } catch (_) {}
      try { dim.spawnParticle('minecraft:endrod', {
        x: dest.x + Math.cos(a) * 0.4, y: dest.y + 1.0, z: dest.z + Math.sin(a) * 0.4
      }); } catch (_) {}
    }
  }

  // Prefer landing beside the waystone (one of its 4 cardinal neighbors) if
  // there's solid ground and headroom there; falls back to standing on top
  // of the waystone itself (always solid, guaranteed safe) if none of the
  // sides check out — e.g. the waystone sits at a cliff edge or is boxed in.
  //
  // Scans a small vertical range per side rather than requiring the exact
  // same Y as the waystone to be solid — real terrain is rarely flat enough
  // for that to ever match, which made this fall back to "on top" every
  // time in practice.
  static _findLandingSpot(dim, target) {
    const offsets = [{ dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 }];
    for (const { dx, dz } of offsets) {
      const fx = target.x + dx, fz = target.z + dz;
      // Check from 2 above the waystone down to 2 below it, preferring the
      // highest valid stance (closest to the waystone's own level first).
      for (let fy = target.y + 2; fy >= target.y - 2; fy--) {
        try {
          const ground = dim.getBlock({ x: fx, y: fy, z: fz });
          const feet   = dim.getBlock({ x: fx, y: fy + 1, z: fz });
          const head   = dim.getBlock({ x: fx, y: fy + 2, z: fz });
          if (ground && !ground.isAir && !ground.isLiquid &&
              feet && (feet.isAir || feet.isLiquid) &&
              head && (head.isAir || head.isLiquid)) {
            return { x: fx + 0.5, y: fy + 1, z: fz + 0.5 };
          }
        } catch (_) {}
      }
    }
    return { x: target.x + 0.5, y: target.y + 1, z: target.z + 0.5 };
  }

  // ── Registry — world-scoped dynamic property, JSON array ──────────────────
  static _load() {
    try {
      const raw = world.getDynamicProperty(REGISTRY_PROP);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  static _save(entries) {
    try { world.setDynamicProperty(REGISTRY_PROP, JSON.stringify(entries)); } catch (_) {}
  }

  static _all() {
    return this._load();
  }

  static _add(entry) {
    const entries = this._load();
    entries.push(entry);
    this._save(entries);
  }

  static _remove(x, y, z, dimensionId) {
    const entries = this._load();
    const filtered = entries.filter(w => !(w.x === x && w.y === y && w.z === z && w.dimensionId === dimensionId));
    this._save(filtered);
  }
}
