// ============================================
// RIMEWRAITH SYSTEM
// Ranged attack is handled natively by behavior.ranged_attack + shooter
// (lotm:flesh_ball). This script only handles the reactive ground-stomp
// "melee defense" — it never chases, it only punishes players who get close.
// ============================================

import { system } from '@minecraft/server';

export class RimewraithSystem {
  static stompCooldowns = new Map(); // entityId -> ticks remaining
  static STOMP_COOLDOWN = 60;        // 3 seconds
  static STOMP_RANGE     = 3.5;
  static STOMP_DAMAGE    = 7;
  static STOMP_KB_HORIZONTAL = 1.4;
  static STOMP_KB_VERTICAL   = 0.45;

  /**
   * Call from main.js tick loop
   */
  static tick(rimewraith) {
    const id = rimewraith.id;
    const cd = (this.stompCooldowns.get(id) || 0) - 1;
    this.stompCooldowns.set(id, Math.max(0, cd));
    if (cd > 0) return;

    let nearby = [];
    try {
      nearby = rimewraith.dimension.getPlayers({
        location: rimewraith.location,
        maxDistance: this.STOMP_RANGE
      });
    } catch (_) { return; }

    if (nearby.length === 0) return;

    this.stompCooldowns.set(id, this.STOMP_COOLDOWN);
    this._groundStomp(rimewraith, nearby);
  }

  static _groundStomp(rimewraith, players) {
    const loc = rimewraith.location;
    const dim = rimewraith.dimension;

    for (const p of players) {
      const dx = p.location.x - loc.x;
      const dz = p.location.z - loc.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      try { p.applyDamage(this.STOMP_DAMAGE, { cause: 'entity_attack', damagingEntity: rimewraith }); } catch (_) {
        try { p.applyDamage(this.STOMP_DAMAGE); } catch (_2) {}
      }
      try {
        p.applyKnockback(dx / len, dz / len, this.STOMP_KB_HORIZONTAL, this.STOMP_KB_VERTICAL);
      } catch (_) {}
    }

    // Mace-style wind burst — center burst + expanding ring
    try { dim.spawnParticle('minecraft:wind_explosion_emitter', { x: loc.x, y: loc.y + 0.1, z: loc.z }); } catch (_) {}
    for (let ring = 1; ring <= 3; ring++) {
      const radius = ring * 1.2;
      const delay  = ring * 2;
      system.runTimeout(() => {
        const count = Math.floor(radius * 6);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          try {
            dim.spawnParticle('minecraft:wind_explosion_emitter', {
              x: loc.x + Math.cos(a) * radius,
              y: loc.y + 0.1,
              z: loc.z + Math.sin(a) * radius
            });
          } catch (_) {}
        }
      }, delay);
    }

    try { dim.playSound('mace.heavy_smash_ground', { location: loc, volume: 1.0, pitch: 0.9 }); } catch (_) {
      try { dim.playSound('mob.ravager.attack', { location: loc, volume: 1.0, pitch: 0.8 }); } catch (_2) {}
    }
  }

  static cleanup(entityId) {
    this.stompCooldowns.delete(entityId);
  }
}
