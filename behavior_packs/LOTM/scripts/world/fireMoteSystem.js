// ============================================================================
// FIRE MOTE SYSTEM — Fire Mote Charm companion light
// ============================================================================
// Plain-use toggles a floating fire mote that follows the player near
// shoulder height. Purely visual (flame particle) plus a real light source:
// a vanilla minecraft:light_block is placed under the mote and moved along
// as the player crosses into a new block cell (never every tick — that would
// be constant block churn for no visual benefit, since the light already
// covers a radius). Only ever placed into air, never overwrites real blocks.
//
// MAIN.JS ADDITIONS:
//   import { FireMoteSystem } from './world/fireMoteSystem.js';
//
//   In world.afterEvents.itemUse.subscribe:
//     if (itemId === 'lotm:fire_mote_charm') { FireMoteSystem.toggle(player); return; }
//
//   In runInterval tick loop:
//     FireMoteSystem.tick(player);
//
//   In world.afterEvents.playerLeave.subscribe:
//     FireMoteSystem.cleanup(event.playerName);
// ============================================================================
import { world, system } from '@minecraft/server';

const LIGHT_BLOCK = 'minecraft:light_block';
const LIGHT_LEVEL = 14;
// Behind-and-to-the-side of the player's facing, roughly head height — keeps
// the mote out of the first-person camera's direct line of sight while still
// reading as a companion hovering near the shoulder in third person.
const OFFSET_BACK  = 0.7;
const OFFSET_RIGHT = 0.6;
const OFFSET_UP    = 1.5;
// Light-block placement is gated by DISTANCE moved, not a tick timer. Bedrock's
// lighting engine relights an area asynchronously after a light block is
// removed/placed — if we churn the block every time the player crosses one
// block cell (which happens multiple times a second while sprinting), the
// engine can't keep up and stale brightness gets left behind as a visible
// trail. Waiting for real distance between placements gives it time to catch
// up between moves, while the light's own ~14-block radius still keeps the
// path continuously lit.
const LIGHT_MOVE_THRESHOLD = 6; // blocks

export class FireMoteSystem {

  // playerName -> { lastLight: {x,y,z,dimensionId} | null }
  static active = new Map();

  static toggle(player) {
    if (this.active.has(player.name)) {
      this.deactivate(player);
    } else {
      this.activate(player);
    }
  }

  static activate(player) {
    this.active.set(player.name, { lastLight: null });
    player.sendMessage('§6✦ The fire mote flickers to life, hovering nearby...');
    try { player.playSound('fire.ignite', { pitch: 1.3, volume: 0.5 }); } catch (_) {}
  }

  static deactivate(player) {
    const state = this.active.get(player.name);
    this.active.delete(player.name);
    if (state?.lastLight) this._clearLight(player.dimension, state.lastLight);
    player.sendMessage('§8The fire mote fades away.');
  }

  static _moteLocation(player) {
    const yawRad = (player.getRotation().y * Math.PI) / 180;
    const fwdX = -Math.sin(yawRad), fwdZ = Math.cos(yawRad);
    const rightX = fwdZ, rightZ = -fwdX;
    const loc = player.location;
    return {
      x: loc.x - fwdX * OFFSET_BACK + rightX * OFFSET_RIGHT,
      y: loc.y + OFFSET_UP,
      z: loc.z - fwdZ * OFFSET_BACK + rightZ * OFFSET_RIGHT
    };
  }

  // ── Main tick — called each interval for each player ─────────────────────
  static tick(player) {
    const state = this.active.get(player.name);
    if (!state) return;

    const moteLoc = this._moteLocation(player);
    try { player.dimension.spawnParticle('minecraft:basic_flame_particle', moteLoc); } catch (_) {}

    const bx = Math.floor(moteLoc.x), by = Math.floor(moteLoc.y), bz = Math.floor(moteLoc.z);
    const dimId = player.dimension.id;
    const prev = state.lastLight;

    // Dimension changes always warrant an immediate move — no valid distance
    // comparison across dimensions.
    if (prev && prev.dimensionId === dimId) {
      const dx = bx - prev.x, dy = by - prev.y, dz = bz - prev.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < LIGHT_MOVE_THRESHOLD * LIGHT_MOVE_THRESHOLD) return;
    }

    const placed = this._placeLight(player.dimension, { x: bx, y: by, z: bz });
    if (placed) {
      if (prev) this._clearLight(player.dimension, prev);
      state.lastLight = { x: bx, y: by, z: bz, dimensionId: dimId };
    }
  }

  // Uses /setblock via runCommand rather than the script API's
  // setBlockPermutation — the script API's direct permutation setter has
  // been observed to skip the full block-update cascade that a real
  // in-game block change triggers, which includes light recalculation.
  // Commands go through the same path a player's own edit would, and
  // reliably force a proper relight.
  static _placeLight(dimension, pos) {
    try {
      const block = dimension.getBlock(pos);
      if (!block || !block.isAir) return false; // never overwrite real blocks
      dimension.runCommand(`setblock ${pos.x} ${pos.y} ${pos.z} ${LIGHT_BLOCK}["block_light_level"=${LIGHT_LEVEL}]`);
      return true;
    } catch (_) { return false; }
  }

  static _clearLight(dimension, pos) {
    try {
      const block = dimension.getBlock(pos);
      // Bedrock can report a placed light_block back under a different
      // internal/legacy typeId than the one used to place it, so an exact
      // typeId match here is unreliable and was silently skipping every
      // clear. Anything other than air at our own tracked position is safe
      // to clear back to air — we only ever write to positions we recorded
      // ourselves.
      if (!block || block.isAir) return;
      dimension.runCommand(`setblock ${pos.x} ${pos.y} ${pos.z} air`);
    } catch (_) {}
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  static cleanup(playerName) {
    const state = this.active.get(playerName);
    this.active.delete(playerName);
    if (!state?.lastLight) return;
    try {
      const dim = world.getDimension(state.lastLight.dimensionId);
      this._clearLight(dim, state.lastLight);
    } catch (_) {}
  }
}
