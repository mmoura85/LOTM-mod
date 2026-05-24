// ============================================
// RAMPAGER SYSTEM
// Handles enrage threshold and fireball variant
// The sonic boom is handled natively by the behavior
// ============================================

import { world, system } from '@minecraft/server';

export class RampagerSystem {
  static enragedEntities = new Set();
  static fireballCooldowns = new Map();  // entity id -> ticks remaining
  static FIREBALL_COOLDOWN = 140;        // 7 seconds
  static FIREBALL_DAMAGE = 12;
  static ENRAGE_THRESHOLD = 75;          // 50% of 150 HP

  static voidwatcherCooldowns = new Map(); // entityId -> ticks remaining


  /**
   * Call from main.js tick loop
   */
  static tick(rampager) {
    const id = rampager.id;

    // Tick down fireball cooldown
    const fbCd = this.fireballCooldowns.get(id) || 0;
    if (fbCd > 0) this.fireballCooldowns.set(id, fbCd - 1);

    // Check enrage
    try {
      const health = rampager.getComponent('minecraft:health');
      if (health && health.currentValue <= this.ENRAGE_THRESHOLD && !this.enragedEntities.has(id)) {
        this.enragedEntities.add(id);
        rampager.triggerEvent('lotm:become_enraged');
        this.spawnEnrageParticles(rampager);
      }
    } catch (e) {}

    // Fireball variant only - variant 1
    // Variant 0 (shockwave) uses native minecraft:behavior.sonic_boom, no script needed
    let variant = 0;
    try {
      variant = rampager.getComponent('minecraft:variant')?.value ?? 0;
    } catch (e) { return; }

    if (variant !== 1) return;

    // Find nearest player
    const target = this.findNearestPlayer(rampager);
    if (!target) return;

    const dist = this.getDistance(rampager.location, target.location);

    // Fire at range - don't fire at melee range, let melee handle that
    if (dist > 5 && dist <= 20 && (this.fireballCooldowns.get(id) || 0) === 0) {
      this.fireCorruptedBlast(rampager, target);
    }
  }

  /**
   * Corrupted spirit blast - slow dark projectile
   */
  static fireCorruptedBlast(rampager, target) {
    this.fireballCooldowns.set(rampager.id, this.FIREBALL_COOLDOWN);

    const startLoc = {
      x: rampager.location.x,
      y: rampager.location.y + 1.8,
      z: rampager.location.z
    };

    const targetLoc = {
      x: target.location.x,
      y: target.location.y + 1.0,
      z: target.location.z
    };

    const dx = targetLoc.x - startLoc.x;
    const dy = targetLoc.y - startLoc.y;
    const dz = targetLoc.z - startLoc.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len === 0) return;

    const nx = dx / len;
    const ny = dy / len;
    const nz = dz / len;
    const speed = 0.4;

    let hasHit = false;
    const dim = rampager.dimension;
    const rampagerId = rampager.id;

    // Charge sound
    try {
      dim.playSound('mob.ghast.warn', { location: startLoc, volume: 0.6, pitch: 0.4 });
    } catch (e) {}

    for (let i = 0; i < 70; i++) {
      system.runTimeout(() => {
        if (hasHit) return;

        const pos = {
          x: startLoc.x + nx * speed * i,
          y: startLoc.y + ny * speed * i,
          z: startLoc.z + nz * speed * i
        };

        // Particles along path
        try {
          dim.spawnParticle('minecraft:soul_particle', pos);
          dim.spawnParticle('minecraft:dragon_breath_trail', pos);
        } catch (e) {}

        // Block collision
        try {
          const block = dim.getBlock({
            x: Math.floor(pos.x),
            y: Math.floor(pos.y),
            z: Math.floor(pos.z)
          });
          if (block && !block.isAir && !block.isLiquid) {
            hasHit = true;
            this.blastImpact(dim, pos);
            return;
          }
        } catch (e) {}

        // Entity collision
        try {
          const nearby = dim.getEntities({ location: pos, maxDistance: 1.5 });
          for (const entity of nearby) {
            if (entity.id === rampagerId) continue;
            if (entity.typeId === 'minecraft:item') continue;
            hasHit = true;
            try { entity.applyDamage(this.FIREBALL_DAMAGE); } catch (e) {}
            this.blastImpact(dim, pos);
            return;
          }
        } catch (e) {}
      }, i * 2);
    }
  }

  /**
   * Impact explosion
   */
  static blastImpact(dimension, location) {
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      try {
        dimension.spawnParticle('minecraft:soul_particle', {
          x: location.x + Math.cos(angle) * 1.5,
          y: location.y + 0.5,
          z: location.z + Math.sin(angle) * 1.5
        });
        dimension.spawnParticle('minecraft:dragon_breath_trail', {
          x: location.x + Math.cos(angle),
          y: location.y,
          z: location.z + Math.sin(angle)
        });
      } catch (e) {}
    }

    // Splash damage
    try {
      const entities = dimension.getEntities({ location: location, maxDistance: 3 });
      for (const entity of entities) {
        if (entity.typeId === 'minecraft:item') continue;
        try { entity.applyDamage(4); } catch (e) {}
      }
    } catch (e) {}

    try {
      dimension.playSound('random.explode', { location: location, volume: 0.8, pitch: 0.6 });
    } catch (e) {}
  }

  /**
   * Enrage visual burst
   */
  static spawnEnrageParticles(rampager) {
    const loc = rampager.location;
    for (let i = 0; i < 30; i++) {
      system.runTimeout(() => {
        const angle = (i / 30) * Math.PI * 2;
        try {
          rampager.dimension.spawnParticle('minecraft:critical_hit_emitter', {
            x: loc.x + Math.cos(angle) * 1.5,
            y: loc.y + 1 + (i / 30) * 2,
            z: loc.z + Math.sin(angle) * 1.5
          });
        } catch (e) {}
      }, i * 3);
    }
    try {
      rampager.dimension.playSound('mob.warden.roar', {
        location: loc, volume: 1.0, pitch: 0.7
      });
    } catch (e) {
      try {
        rampager.dimension.playSound('mob.ghast.scream', {
          location: loc, volume: 1.0, pitch: 0.5
        });
      } catch (e2) {}
    }
  }

  static findNearestPlayer(entity) {
    try {
      const players = entity.dimension.getPlayers({ location: entity.location, maxDistance: 24 });
      if (players.length === 0) return null;
      let nearest = null;
      let nearestDist = Infinity;
      for (const p of players) {
        const d = this.getDistance(entity.location, p.location);
        if (d < nearestDist) { nearest = p; nearestDist = d; }
      }
      return nearest;
    } catch (e) { return null; }
  }

  static getDistance(a, b) {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) +
      Math.pow(a.y - b.y, 2) +
      Math.pow(a.z - b.z, 2)
    );
  }

  static cleanup(entityId) {
    this.fireballCooldowns.delete(entityId);
    this.enragedEntities.delete(entityId);
  }


  static tickVoidwatcher(watcher) {
    // Tick down fireball cooldown
    const cd = (RampagerSystem.voidwatcherCooldowns.get(watcher.id) || 0) - 1;
    RampagerSystem.voidwatcherCooldowns.set(watcher.id, Math.max(0, cd));

    if (cd > 0) return; // Still on cooldown

    // Find nearest player within 20 blocks
    let target = null;
    let nearestDist = Infinity;
    try {
      const players = watcher.dimension.getPlayers({
        location: watcher.location,
        maxDistance: 20
      });
      for (const p of players) {
        const dx = p.location.x - watcher.location.x;
        const dy = p.location.y - watcher.location.y;
        const dz = p.location.z - watcher.location.z;
        const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (d < nearestDist) { nearestDist = d; target = p; }
      }
    } catch (_) {}

    if (!target || nearestDist > 20) return;

    // Fire the fireball — 60 tick cooldown (3 seconds)
    RampagerSystem.voidwatcherCooldowns.set(watcher.id, 60);
    RampagerSystem._fireVoidball(watcher, target);
  }

  // ============================================================================
// rampagerSystem.js — REPLACE _fireVoidball and _voidballExplosion
// ============================================================================
// Uses the exact same particle logic as useBurning / _castBurning:
//   - 5-cluster dense flame particles per step
//   - lava_particle + mobflame_single trail
//   - impact burst with basic_flame_particle ring + lava_particle
// ============================================================================

  static _fireVoidball(watcher, target) {
    const wx = watcher.location.x;
    const wy = watcher.location.y + 0.4;
    const wz = watcher.location.z;
    const tx = target.location.x;
    const ty = target.location.y + 1.0;
    const tz = target.location.z;

    const dx  = tx - wx, dy = ty - wy, dz = tz - wz;
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
    const view = { x: dx/len, y: dy/len, z: dz/len };

    const start = {
      x: wx + view.x * 1.5,
      y: wy,
      z: wz + view.z * 1.5
    };

    const speed  = 0.35;
    const maxAge = 80;
    let pos = { ...start };
    let hit = false;
    let age = 0;

    const moveBall = () => {
      if (hit || age >= maxAge) return;
      age++;

      pos.x += view.x * speed;
      pos.y += view.y * speed;
      pos.z += view.z * speed;

      // ── Dense flame cluster — exact same as useBurning / _castBurning ──────
      try { watcher.dimension.spawnParticle('minecraft:basic_flame_particle', pos); } catch (_) {}
      try { watcher.dimension.spawnParticle('minecraft:basic_flame_particle', { x: pos.x+0.2, y: pos.y,     z: pos.z     }); } catch (_) {}
      try { watcher.dimension.spawnParticle('minecraft:basic_flame_particle', { x: pos.x-0.2, y: pos.y,     z: pos.z     }); } catch (_) {}
      try { watcher.dimension.spawnParticle('minecraft:basic_flame_particle', { x: pos.x,     y: pos.y+0.2, z: pos.z     }); } catch (_) {}
      try { watcher.dimension.spawnParticle('minecraft:basic_flame_particle', { x: pos.x,     y: pos.y-0.2, z: pos.z     }); } catch (_) {}
      try { watcher.dimension.spawnParticle('minecraft:lava_particle',        pos); } catch (_) {}
      try { watcher.dimension.spawnParticle('minecraft:mobflame_single',      pos); } catch (_) {}

      // Block collision
      try {
        const block = watcher.dimension.getBlock(
          { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) }
        );
        if (block && !block.isAir && !block.isLiquid) {
          hit = true;
          RampagerSystem._voidballExplosion(watcher, pos);
          return;
        }
      } catch (_) {}

      // Entity collision
      try {
        const near = watcher.dimension.getEntities({
          location: pos,
          maxDistance: 1.8,
          excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow']
        });
        for (const e of near) {
          if (e.id === watcher.id) continue;
          if (e.typeId === 'lotm:voidwatcher') continue;
          hit = true;
          RampagerSystem._voidballExplosion(watcher, pos, e);
          return;
        }
      } catch (_) {}

      system.runTimeout(moveBall, 1);
    };

    system.runTimeout(moveBall, 1);
  }

  static _voidballExplosion(watcher, pos, directHit = null) {
    // Damage direct hit entity
    if (directHit) {
      try { directHit.applyDamage(10, { cause: 'projectile', damagingEntity: watcher }); } catch (_) {
        try { directHit.applyDamage(10); } catch (_2) {}
      }
      try { directHit.setOnFire(4, true); } catch (_) {}
    }

    // AOE splash damage
    try {
      const nearby = watcher.dimension.getEntities({
        location: pos,
        maxDistance: 2.5,
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb']
      });
      for (const e of nearby) {
        if (e.id === watcher.id) continue;
        if (e.typeId === 'lotm:voidwatcher') continue;
        if (directHit && e.id === directHit.id) continue;
        try { e.applyDamage(5); } catch (_) {}
        try { e.setOnFire(2, true); } catch (_) {}
      }
    } catch (_) {}

    // ── Impact burst — exact same as useBurning entity hit ───────────────────
    for (let j = 0; j < 15; j++) {
      const a = (j / 15) * Math.PI * 2;
      try { watcher.dimension.spawnParticle('minecraft:basic_flame_particle', {
        x: pos.x + Math.cos(a) * 0.5,
        y: pos.y,
        z: pos.z + Math.sin(a) * 0.5
      }); } catch (_) {}
    }
    try { watcher.dimension.spawnParticle('minecraft:lava_particle', pos); } catch (_) {}

    // Extra outer ring for the bigger explosion feel
    for (let j = 0; j < 20; j++) {
      const a = (j / 20) * Math.PI * 2;
      try { watcher.dimension.spawnParticle('minecraft:basic_flame_particle', {
        x: pos.x + Math.cos(a) * 1.2,
        y: pos.y + 0.4,
        z: pos.z + Math.sin(a) * 1.2
      }); } catch (_) {}
    }
    try { watcher.dimension.spawnParticle('minecraft:lava_particle', { x: pos.x, y: pos.y+0.5, z: pos.z }); } catch (_) {}
    try { watcher.dimension.spawnParticle('minecraft:mobflame_single', pos); } catch (_) {}

    try { watcher.dimension.playSound('fire.ignite', { location: pos, pitch: 0.6, volume: 1.2 }); } catch (_) {}
  }
}
