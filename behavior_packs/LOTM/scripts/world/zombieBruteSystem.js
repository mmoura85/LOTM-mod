// ============================================================================
// ZOMBIE BRUTE SYSTEM
// ============================================================================
// A rare, mini-boss-tier zombie variant (stats scaled down a bit from
// lotm:ogre) that spawns wherever normal zombies do (see
// spawn_rules/zombie_brute.json, low weight vs vanilla zombie's own rules).
// Meant to read as commanding zombie "troops" — see the roar below.
// Targeting the offending attacker is already free via
// minecraft:behavior.hurt_by_target on the entity itself — this script only
// adds the two things that behavior can't: bonus knockback on its own melee
// hits, and the roar reaction on being hurt (overwhelms nearby players with
// a debuff + alerts nearby regular zombies to join the fight — deliberately
// NOT other zombie_brutes, so it stays "boss calls troops" rather than a
// brute horde ganging up).
//
// "Summon others" is done without any direct mob-targeting API (none exists
// in @minecraft/server for arbitrary mobs) — instead each alerted zombie is
// dealt a trivial 1 damage sourced from the ORIGINAL attacker
// (damagingEntity), which makes that zombie's own hurt_by_target naturally
// pick the real offender as its target. One-hop only — regular zombies
// don't run this system, so there's no roar-chain cascade, just the initial
// alert radius.
//
// MAIN.JS WIRING:
//   import { ZombieBruteSystem } from './world/zombieBruteSystem.js';
//   entityHurt (before the player-only guard): lotm:zombie_brute -> onHurt
//   entityHitEntity (before the player-only guard): attacker lotm:zombie_brute -> onMeleeHit
//   tick loop (dim.getEntities({ type: 'lotm:zombie_brute' })): tick(brute)
//   entityDie: lotm:zombie_brute -> cleanup(id)
// ============================================================================
import { system } from '@minecraft/server';

export class ZombieBruteSystem {
  static ROAR_COOLDOWN_TICKS = 160; // 8s — also the alert-chain's natural rate limiter
  static ROAR_POSE_TICKS = 20;      // 1s roar pose before reverting to normal animation
  static DEBUFF_RADIUS = 10;
  static ALERT_RADIUS = 16;
  static MAX_ALERTED = 6;

  static MELEE_KB_HORIZONTAL = 0.9;
  static MELEE_KB_VERTICAL = 0.25;

  static roarCooldowns = new Map(); // entityId -> ticks remaining

  static tick(brute) {
    const id = brute.id;
    const cd = this.roarCooldowns.get(id) || 0;
    if (cd > 0) this.roarCooldowns.set(id, cd - 1);
  }

  // ── Melee — bonus knockback on top of the base minecraft:attack damage ───
  static onMeleeHit(brute, victim) {
    try {
      const dx = victim.location.x - brute.location.x;
      const dz = victim.location.z - brute.location.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      victim.applyKnockback(dx / len, dz / len, this.MELEE_KB_HORIZONTAL, this.MELEE_KB_VERTICAL);
    } catch (_) {}
  }

  // ── Reaction to being hurt — roar: debuff nearby players + alert allies ──
  static onHurt(brute, attacker) {
    if (!attacker) return;
    const cd = this.roarCooldowns.get(brute.id) || 0;
    if (cd > 0) return;
    this.roarCooldowns.set(brute.id, this.ROAR_COOLDOWN_TICKS);
    this._roar(brute, attacker);
  }

  static _roar(brute, attacker) {
    try { brute.triggerEvent('lotm:start_roar'); } catch (_) {}
    system.runTimeout(() => { try { brute.triggerEvent('lotm:end_roar'); } catch (_) {} }, this.ROAR_POSE_TICKS);

    try { brute.dimension.playSound('mob.ravager.roar', { location: brute.location, volume: 1.0, pitch: 0.8 }); } catch (_) {
      try { brute.dimension.playSound('mob.zombie.ambient', { location: brute.location, volume: 1.2, pitch: 0.5 }); } catch (_2) {}
    }

    // Overwhelm nearby players
    let players = [];
    try { players = brute.dimension.getPlayers({ location: brute.location, maxDistance: this.DEBUFF_RADIUS }); } catch (_) {}
    for (const p of players) {
      try {
        p.addEffect('slowness', 60, { amplifier: 1, showParticles: true });
        p.addEffect('weakness', 60, { amplifier: 0, showParticles: false });
        p.addEffect('nausea', 40, { amplifier: 0, showParticles: false });
      } catch (_) {}
    }

    // Roar shockwave particle ring
    const loc = brute.location;
    for (let ring = 1; ring <= 2; ring++) {
      const radius = ring * 1.5;
      system.runTimeout(() => {
        const count = Math.floor(radius * 6);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          try {
            brute.dimension.spawnParticle('minecraft:huge_explosion_emitter', {
              x: loc.x + Math.cos(a) * radius, y: loc.y + 1.0, z: loc.z + Math.sin(a) * radius
            });
          } catch (_) {}
        }
      }, ring * 2);
    }

    // Alert nearby regular zombies onto the real offender — deliberately
    // 'minecraft:zombie' only, NOT other zombie_brutes: the brute is meant
    // to read as a mini-boss commanding zombie "troops", not a horde of
    // its own kind ganging up.
    let troops = [];
    try { troops = brute.dimension.getEntities({ location: brute.location, maxDistance: this.ALERT_RADIUS, type: 'minecraft:zombie' }); } catch (_) {}
    let alerted = 0;
    for (const zombie of troops) {
      if (alerted >= this.MAX_ALERTED) break;
      try {
        zombie.applyDamage(1, { cause: 'entity_attack', damagingEntity: attacker });
        alerted++;
      } catch (_) {}
    }
  }

  static cleanup(entityId) {
    this.roarCooldowns.delete(entityId);
  }
}
