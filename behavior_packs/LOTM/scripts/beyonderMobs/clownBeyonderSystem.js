// ============================================================================
// CLOWN BEYONDER AI SYSTEM
// ============================================================================
// Add to main.js:
//   import { ClownBeyonderSystem } from './clownBeyonderSystem.js';
//
// In entityHurt subscriber (after brownbear block):
//   if (hurtEntity.typeId === 'lotm:clown') {
//     ClownBeyonderSystem.onHurt(hurtEntity, attacker);
//     return;
//   }
//
// In runInterval tick loop (same place as voidwatcher):
//   const clowns = dim.getEntities({ type: 'lotm:clown' });
//   for (const c of clowns) ClownBeyonderSystem.tick(c);
// ============================================================================

export class ClownBeyonderSystem {

  static aggroMap    = new Map(); // entityId -> boolean
  static cooldownMap = new Map(); // entityId -> ticks remaining
  static ATTACK_COOLDOWN = 50;   // ~2.5 seconds between dagger volleys

  static onHurt(entity, attacker) {
    if (entity.typeId !== 'lotm:clown') return;
    if (!attacker) return;
    ClownBeyonderSystem.aggroMap.set(entity.id, true);
    try { entity.triggerEvent('lotm:clown_aggro'); } catch (_) {}
  }

  static tick(clown) {
    if (!ClownBeyonderSystem.aggroMap.get(clown.id)) return;

    // Speed I + Jump Boost I while hostile (matches Clown beyonder sequence)
    try { clown.addEffect('speed',      40, { amplifier: 0, showParticles: false }); } catch (_) {}
    try { clown.addEffect('jump_boost', 40, { amplifier: 0, showParticles: false }); } catch (_) {}

    const cd = (ClownBeyonderSystem.cooldownMap.get(clown.id) || 0) - 1;
    ClownBeyonderSystem.cooldownMap.set(clown.id, Math.max(0, cd));
    if (cd > 0) return;

    // Find nearest player within 14 blocks
    let target = null, nearestDist = Infinity;
    try {
      const players = clown.dimension.getPlayers({
        location: clown.location, maxDistance: 14
      });
      for (const p of players) {
        const dx = p.location.x - clown.location.x;
        const dy = p.location.y - clown.location.y;
        const dz = p.location.z - clown.location.z;
        const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (d < nearestDist) { nearestDist = d; target = p; }
      }
    } catch (_) {}

    // Fire paper daggers at range (3–14 blocks)
    if (!target || nearestDist < 3 || nearestDist > 14) return;

    ClownBeyonderSystem.cooldownMap.set(clown.id, ClownBeyonderSystem.ATTACK_COOLDOWN);

    // 3 daggers in a tight spread, staggered 4 ticks apart
    for (let i = 0; i < 3; i++) {
      system.runTimeout(() => ClownBeyonderSystem._fireDagger(clown, target), i * 4);
    }
  }

  static _fireDagger(clown, target) {
    if (!target) return;

    const cx = clown.location.x, cy = clown.location.y + 1.4, cz = clown.location.z;
    const tx = target.location.x, ty = target.location.y + 1.0, tz = target.location.z;

    const dx = tx-cx, dy = ty-cy, dz = tz-cz;
    const len = Math.sqrt(dx*dx+dy*dy+dz*dz) || 1;
    const view = {
      x: dx/len + (Math.random()-0.5)*0.08,
      y: dy/len + (Math.random()-0.5)*0.08,
      z: dz/len + (Math.random()-0.5)*0.08
    };

    let pos = { x: cx + view.x, y: cy, z: cz + view.z };
    let hit = false, age = 0;
    const SPEED = 0.4, STEPS = 30, DAMAGE = 4;

    const step = () => {
      if (hit || age >= STEPS) return;
      age++;
      pos.x += view.x * SPEED;
      pos.y += view.y * SPEED;
      pos.z += view.z * SPEED;

      // White flash particle — paper knife visual
      try { clown.dimension.spawnParticle('minecraft:endrod', pos); } catch (_) {}

      // Block collision
      try {
        const block = clown.dimension.getBlock(
          { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) }
        );
        if (block && !block.isAir && !block.isLiquid) { hit = true; return; }
      } catch (_) {}

      // Entity collision
      try {
        const near = clown.dimension.getEntities({
          location: pos, maxDistance: 1.5,
          excludeTypes: ['minecraft:item','minecraft:xp_orb','minecraft:arrow']
        });
        for (const e of near) {
          if (e.id === clown.id) continue;
          if (e.typeId === 'lotm:clown') continue;
          hit = true;
          try { e.applyDamage(DAMAGE, { cause: 'projectile', damagingEntity: clown }); } catch (_) {
            try { e.applyDamage(DAMAGE); } catch (_2) {}
          }
          for (let p = 0; p < 6; p++) {
            const a = (p/6)*Math.PI*2;
            try { clown.dimension.spawnParticle('minecraft:endrod', {
              x: pos.x+Math.cos(a)*0.3, y: pos.y+0.2, z: pos.z+Math.sin(a)*0.3
            }); } catch (_) {}
          }
          return;
        }
      } catch (_) {}

      system.runTimeout(step, 1);
    };
    system.runTimeout(step, 1);
  }

  static cleanup(entityId) {
    ClownBeyonderSystem.aggroMap.delete(entityId);
    ClownBeyonderSystem.cooldownMap.delete(entityId);
  }
}
