// ============================================================================
// SLUMBER CHARM — AoE fake-sleep utility item
// ============================================================================
// Not pathway-gated — a mysticism-crafted item, not a Focus-item ability.
// "Sleep" isn't a real Bedrock status, so it's faked the same way Wind
// Blessed's Binding fakes rooting (wind_blessed.js's useBinding): Slowness +
// Mining Fatigue, here with Blindness layered on for the "eyes closed" read.
//
// MAIN.JS WIRING:
//   import { SlumberCharmSystem } from './items/slumberCharmSystem.js';
//   itemUse: lotm:slumber_charm -> SlumberCharmSystem.useSlumberCharm(player);
// ============================================================================

export class SlumberCharmSystem {

  static COOLDOWN_MS = 60000; // 60s
  static RANGE  = 16;
  static RADIUS = 6;
  static DURATION_TICKS = 120; // 6s

  static cooldown = new Map(); // playerId -> timestamp

  static useSlumberCharm(player) {
    const now = Date.now();
    const cdRemain = this.COOLDOWN_MS - (now - (this.cooldown.get(player.id) || 0));
    if (cdRemain > 0) {
      player.sendMessage(`§8The charm still hums, spent (${(cdRemain / 1000).toFixed(0)}s)`);
      return false;
    }

    const hit = this._performRaycast(player, this.RANGE);
    const center = hit ? hit.location : this._groundAheadLocation(player, this.RANGE);
    if (!center) {
      player.sendMessage('§8The charm found nothing to lull to sleep.');
      return false;
    }

    this.cooldown.set(player.id, now);

    let targets = [];
    try {
      targets = player.dimension.getEntities({
        location: center, maxDistance: this.RADIUS, families: ['monster']
      });
    } catch (_) {}

    for (const target of targets) {
      try {
        target.addEffect('slowness', this.DURATION_TICKS, { amplifier: 6, showParticles: false });
        target.addEffect('mining_fatigue', this.DURATION_TICKS, { amplifier: 2, showParticles: false });
        target.addEffect('blindness', this.DURATION_TICKS, { amplifier: 0, showParticles: false });
      } catch (_) {}
    }

    try { player.playSound('mob.wither.ambient', { pitch: 0.5, volume: 0.6 }); } catch (_) {}
    player.sendMessage(`§8A drowsy haze settles over the area... (${targets.length} lulled to sleep)`);

    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      try { player.dimension.spawnParticle('minecraft:mycelium_dust_particle', {
        x: center.x + Math.cos(a) * this.RADIUS * 0.5, y: center.y + 0.3, z: center.z + Math.sin(a) * this.RADIUS * 0.5
      }); } catch (_) {}
    }

    return true;
  }

  // ── Raycast helpers — same shape as ocean_songster.js's Acidic Rain ──────
  static _performRaycast(player, range) {
    try {
      const eyePos = { x: player.location.x, y: player.location.y + 1.6, z: player.location.z };
      const dir    = player.getViewDirection();
      const result = player.dimension.getEntitiesFromRay(eyePos, dir, {
        maxDistance: range,
        excludeTypes: ['minecraft:player'],
      });
      return result?.[0]?.entity ?? null;
    } catch (_) { return null; }
  }

  static _groundAheadLocation(player, range) {
    try {
      const eyePos = { x: player.location.x, y: player.location.y + 1.6, z: player.location.z };
      const dir    = player.getViewDirection();
      return { x: eyePos.x + dir.x * range, y: eyePos.y + dir.y * range, z: eyePos.z + dir.z * range };
    } catch (_) { return null; }
  }

  static cleanup(player) {
    this.cooldown.delete(player.id);
  }
}
