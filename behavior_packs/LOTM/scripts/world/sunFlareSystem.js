// ============================================================================
// SUN FLARE CHARM — pathway-agnostic "pillar of light from the sky" trinket
// ============================================================================
// Plain-use calls down a smaller version of Light Suppliant's sun orb
// (lotm:sun_flare_orb — same texture as lotm:sunshine_orb, scaled down via
// minecraft:transformation) a few blocks above the player, damaging/
// blinding nearby undead for a short duration, then clearing. No pathway or
// spirit required — stackable (8) and consumed one-per-use instead, no
// cooldown at all (mirrors ScapegoatSystem's decoy_item consumption).
// Reuses lotm:sunlight_mote for orbiting motes, same as Sunshine, for visual
// consistency between the two.
//
// MAIN.JS ADDITIONS:
//   import { SunFlareSystem } from './world/sunFlareSystem.js';
//
//   In world.afterEvents.itemUse.subscribe:
//     if (itemId === 'lotm:sun_flare_charm') { SunFlareSystem.use(player); return; }
//
//   In runInterval tick loop:
//     SunFlareSystem.tick(player);
//
//   In world.afterEvents.playerLeave.subscribe:
//     SunFlareSystem.cleanup(event.playerName);
// ============================================================================
import { ItemStack } from '@minecraft/server';

const ORB_BLOCK = 'lotm:sun_flare_orb';
const ITEM_ID = 'lotm:sun_flare_charm';

const FLARE_DURATION = 120;  // 6s
const FLARE_RANGE = 10;      // blocks
const FLARE_DAMAGE = 4;      // per tick application, vs undead/evil only
const FLARE_Y_OFFSET = 3;    // lower than Sunshine's y+5 — a smaller pillar

// Kept in sync with LightSuppliantSequence.isUndeadOrEvil's evilTypes list
// (light_suppliant.js) — duplicated locally rather than imported, matching
// this codebase's established convention for a few shared lines.
const EVIL_TYPES = [
  'minecraft:zombie', 'minecraft:zombie_villager', 'minecraft:husk',
  'minecraft:drowned', 'minecraft:skeleton', 'minecraft:stray',
  'minecraft:wither_skeleton', 'minecraft:zombie_pigman',
  'minecraft:zombified_piglin', 'minecraft:phantom', 'minecraft:wither',
  'minecraft:zoglin', 'minecraft:witch', 'minecraft:vex',
  'minecraft:evoker', 'minecraft:vindicator', 'minecraft:pillager',
  'minecraft:enderman', 'minecraft:endermite', 'minecraft:shulker',
  'lotm:vengeful_ghost', 'lotm:ghoul', 'lotm:poltergeist'
];

export class SunFlareSystem {

  // playerName -> {location, dimension, ticksRemaining, orbPos, orbitAngle}
  static active = new Map();

  static use(player) {
    const orbPos = {
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y) + FLARE_Y_OFFSET,
      z: Math.floor(player.location.z)
    };
    const orbPlaced = this._placeOrb(player.dimension, orbPos);

    this.active.set(player.name, {
      location: player.location,
      dimension: player.dimension,
      ticksRemaining: FLARE_DURATION,
      orbPos: orbPlaced ? orbPos : null,
      orbitAngle: 0
    });

    player.sendMessage('§6✦ The Sun Flare Charm blazes to life!');
    try { player.playSound('beacon.activate', { pitch: 1.7, volume: 0.9 }); } catch (_) {}

    this._consumeCharm(player);
    return true;
  }

  // Consumed on use, no cooldown — mirrors ScapegoatSystem's decoy_item
  // consumption exactly (same held-slot amount-1/undefined pattern).
  static _consumeCharm(player) {
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return;
      const slot = player.selectedSlotIndex;
      const held = inv.container.getItem(slot);
      if (held?.typeId === ITEM_ID) {
        inv.container.setItem(slot, held.amount <= 1 ? undefined : new ItemStack(ITEM_ID, held.amount - 1));
      }
    } catch (_) {}
  }

  // ── Main tick — called each interval for each player ─────────────────────
  static tick(player) {
    const flare = this.active.get(player.name);
    if (!flare) return;

    flare.ticksRemaining--;

    // Orbiting motes around the flare orb — same technique as Sunshine.
    if (flare.orbPos) {
      flare.orbitAngle += 0.2;
      const orbitRadius = 0.8; // smaller than Sunshine's 1.2, matching the smaller orb
      for (let i = 0; i < 2; i++) {
        const angle = flare.orbitAngle + i * Math.PI;
        try {
          flare.dimension.spawnParticle('lotm:sunlight_mote', {
            x: flare.orbPos.x + 0.5 + Math.cos(angle) * orbitRadius,
            y: flare.orbPos.y + 0.5,
            z: flare.orbPos.z + 0.5 + Math.sin(angle) * orbitRadius
          });
        } catch (_) {}
      }
    }

    // Damage undead every second
    if (flare.ticksRemaining % 20 === 0) {
      this._applyDamage(flare.dimension, flare.location, flare.orbPos);
    }

    // Blind nearby entities every 2 seconds
    if (flare.ticksRemaining % 40 === 0) {
      this._applyBlind(flare.dimension, flare.location);
    }

    // End flare
    if (flare.ticksRemaining <= 0) {
      if (flare.orbPos) this._clearOrb(flare.dimension, flare.orbPos);
      this.active.delete(player.name);
      player.sendMessage('§7The sun flare fades...');
    }
  }

  static _applyDamage(dimension, location, orbPos) {
    try {
      const entities = dimension.getEntities({
        location, maxDistance: FLARE_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      for (const entity of entities) {
        if (!EVIL_TYPES.includes(entity.typeId)) continue;
        entity.applyDamage(FLARE_DAMAGE);
        entity.setOnFire(2, true);
        if (orbPos) this._spawnBeam(dimension, orbPos, entity.location);
      }
    } catch (_) {}
  }

  static _applyBlind(dimension, location) {
    try {
      const entities = dimension.getEntities({
        location, maxDistance: FLARE_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      for (const entity of entities) {
        entity.addEffect('blindness', 40, { amplifier: 0, showParticles: true });
      }
    } catch (_) {}
  }

  // Short mote trail from the flare orb to a damaged target — same
  // technique as Sunshine's _spawnSunBeam.
  static _spawnBeam(dimension, from, to) {
    try {
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        dimension.spawnParticle('lotm:sunlight_mote', {
          x: from.x + 0.5 + (to.x - from.x) * t,
          y: from.y + 0.5 + (to.y - from.y) * t,
          z: from.z + 0.5 + (to.z - from.z) * t
        });
      }
    } catch (_) {}
  }

  // Same safe never-overwrite-real-blocks place/clear pattern used
  // everywhere else in this pack (FireMoteSystem, LightSuppliantSequence).
  static _placeOrb(dimension, pos) {
    try {
      const block = dimension.getBlock(pos);
      if (!block || !block.isAir) return false;
      dimension.runCommand(`setblock ${pos.x} ${pos.y} ${pos.z} ${ORB_BLOCK}`);
      return true;
    } catch (_) { return false; }
  }

  static _clearOrb(dimension, pos) {
    try {
      const block = dimension.getBlock(pos);
      if (!block || block.isAir) return;
      dimension.runCommand(`setblock ${pos.x} ${pos.y} ${pos.z} air`);
    } catch (_) {}
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  static cleanup(playerName) {
    const flare = this.active.get(playerName);
    this.active.delete(playerName);
    if (!flare?.orbPos) return;
    try { this._clearOrb(flare.dimension, flare.orbPos); } catch (_) {}
  }
}
