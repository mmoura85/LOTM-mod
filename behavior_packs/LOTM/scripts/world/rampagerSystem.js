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
    try {
      const variant = rampager.getComponent('minecraft:variant')?.value ?? 0;
      if (variant !== 1) return;
    } catch (e) { return; }

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
}
