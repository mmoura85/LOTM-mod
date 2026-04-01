// ============================================================================
// JUSTICIAR PATHWAY — SEQUENCE 9: ARBITER
// arbiter.js → behavior_packs/LOTM/scripts/sequences/justiciar/arbiter.js
//
// LORE:
//   Order Trait: Arbiters subconsciously maintain Order, unwilling to disrupt it.
//   Physical Enhancement: Outstanding combat skills for dealing with the unexpected.
//   Authority: A convincing charm and considerable Authority — people are more
//     likely to believe and obey. Enemies feel less confident and want to give up.
//
// STATS vs other Seq 9s:
//   Warrior (Twilight):  Strength I, no spirit bonus
//   Sleepless (Dark):    No physical stats, spirit focus
//   Arbiter (Justiciar): No Strength, but Resistance I (combat durability) +
//                        Speed I (outstanding combat skill) + 2 extra hearts.
//                        More robust than Sleepless, less raw power than Warrior.
//   Spirit: 150 base (between Twilight's 50 and Door's 150, law-enforcement focus)
//
// ABILITIES:
//   Passive — Order's Presence: nearby hostile mobs occasionally get Weakness I
//     (represents enemies feeling less confident / wanting to give up)
//   Active — Authority Command: targeted entity within 8 blocks gets
//     Slowness II + Weakness I for 5s. Costs 12 spirit. CD 8s.
//     Flavour: the Arbiter's commanding voice strips an enemy's will to fight.
//
// ITEM: arbiter_seal (right-click to use Authority Command)
//   Craft: Gold Ingot + Iron Ingot + Paper → 1 Arbiter's Seal
// ============================================================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

export class ArbiterSequence {
  static SEQUENCE_NUMBER = 9;
  static PATHWAY         = 'justiciar';

  // ── Passive config ─────────────────────────────────────────────────────────
  static EFFECT_DURATION      = 999999; // "permanent" passive effects
  static PRESENCE_RANGE       = 10;     // blocks — radius for Order's Presence
  static PRESENCE_TICK_RATE   = 60;     // check every 3s (on the 4-tick interval * 60 = 240 ticks ≈ 12s)
                                        // Note: applyPassiveAbilities is called every 4 ticks,
                                        // so we throttle internally
  static PRESENCE_CHANCE      = 0.25;   // 25% chance per eligible mob per check

  // ── Authority Command config ────────────────────────────────────────────────
  static AUTHORITY_SPIRIT_COST = 12;
  static AUTHORITY_RANGE       = 8;     // blocks
  static AUTHORITY_DURATION    = 100;   // 5 seconds (20 ticks/s)
  static AUTHORITY_COOLDOWN    = 160;   // 8 seconds

  // ── Internal state ─────────────────────────────────────────────────────────
  static _presenceTick    = new Map(); // player name → tick counter
  static authorityCooldowns = new Map(); // player name → ticks remaining

  // ── Ability IDs ────────────────────────────────────────────────────────────
  static ABILITIES = {
    AUTHORITY_COMMAND: 'authority_command',
  };

  // ── Sequence check ─────────────────────────────────────────────────────────
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // ── Apply passive abilities — called every 4 ticks from main.js ───────────
  static applyPassiveAbilities(player) {
    if (!this.hasSequence(player)) return;

    // ── Physical enhancement: Resistance I + Speed I ────────────────────────
    // Resistance I: reflects "outstanding combat durability to deal with unexpected"
    // Speed I: combat readiness and reaction speed
    const res = player.getEffect('resistance');
    if (!res || res.amplifier !== 0 || res.duration < 100) {
      player.addEffect('resistance', this.EFFECT_DURATION, {
        amplifier: 0,
        showParticles: true  // HUD icon visible — it's a law enforcement passive
      });
    }

    const spd = player.getEffect('speed');
    if (!spd || spd.amplifier !== 0 || spd.duration < 100) {
      player.addEffect('speed', this.EFFECT_DURATION, {
        amplifier: 0,
        showParticles: true
      });
    }

    // ── +2 hearts (4 HP) ────────────────────────────────────────────────────
    this._applyHealthBonus(player, 4);

    // ── Order's Presence — passive aura weakens nearby hostiles ────────────
    this._tickPresence(player);

    // ── Cooldown tick for Authority Command ─────────────────────────────────
    if (this.authorityCooldowns.has(player.name)) {
      const remaining = this.authorityCooldowns.get(player.name) - 1;
      if (remaining <= 0) {
        this.authorityCooldowns.delete(player.name);
      } else {
        this.authorityCooldowns.set(player.name, remaining);
      }
    }
  }

  // ── Health bonus helper (matches twilight pattern) ─────────────────────────
  static _applyHealthBonus(player, amount) {
    try {
      const healthComp = player.getComponent('minecraft:health');
      if (!healthComp) return;
      const targetMax = 20 + amount;
      if (Math.abs(healthComp.effectiveMax - targetMax) > 0.1) {
        player.getComponent('minecraft:attribute.health')?.setCurrentValue?.(targetMax);
      }
    } catch (_) {}
  }

  // ── Order's Presence tick ─────────────────────────────────────────────────
  // Every ~12 seconds, applies Weakness I briefly to nearby hostiles.
  // Represents the psychological weight of an Arbiter's presence.
  static _tickPresence(player) {
    const tick = (this._presenceTick.get(player.name) ?? 0) + 1;
    this._presenceTick.set(player.name, tick);

    // Only fire every 60 calls (~12 seconds on 4-tick loop) to avoid spam
    if (tick % 60 !== 0) return;

    try {
      const nearby = player.dimension.getEntities({
        location:  player.location,
        maxDistance: this.PRESENCE_RANGE,
        excludeTypes: ['minecraft:player'],
      });

      for (const entity of nearby) {
        // Only affect hostile mobs
        if (!entity.isValid()) continue;
        if (!this._isHostile(entity)) continue;
        if (Math.random() > this.PRESENCE_CHANCE) continue;

        // Brief Weakness I — represents loss of confidence
        entity.addEffect('weakness', 60, { amplifier: 0, showParticles: false });
        // Slowness 0 briefly — they hesitate
        entity.addEffect('slowness', 40, { amplifier: 0, showParticles: false });
      }
    } catch (_) {}
  }

  // ── Authority Command (active ability) ────────────────────────────────────
  // Finds the nearest hostile within range and strips their will to fight.
  static useAuthorityCommand(player) {
    // Cooldown check
    if (this.authorityCooldowns.has(player.name)) {
      const remaining = Math.ceil(this.authorityCooldowns.get(player.name) / 20);
      player.sendMessage(`§cAuthority Command on cooldown! §e${remaining}s remaining`);
      return false;
    }

    // Spirit check
    if (!SpiritSystem.consumeSpirit(player, this.AUTHORITY_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.AUTHORITY_SPIRIT_COST}`);
      return false;
    }

    try {
      // Find nearest hostile in range
      const entities = player.dimension.getEntities({
        location:    player.location,
        maxDistance: this.AUTHORITY_RANGE,
        excludeTypes: ['minecraft:player'],
      });

      // Filter to hostiles only, pick closest
      let target = null;
      let closestDist = Infinity;
      for (const e of entities) {
        if (!e.isValid() || !this._isHostile(e)) continue;
        const dx = e.location.x - player.location.x;
        const dy = e.location.y - player.location.y;
        const dz = e.location.z - player.location.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist < closestDist) {
          closestDist = dist;
          target = e;
        }
      }

      if (!target) {
        player.sendMessage('§7No target within range — Authority Command requires a visible enemy');
        // Refund spirit since we didn't actually do anything
        SpiritSystem.addSpirit(player, this.AUTHORITY_SPIRIT_COST);
        return false;
      }

      // Apply Authority: Slowness II + Weakness I — enemy loses will to fight
      target.addEffect('slowness',  this.AUTHORITY_DURATION, { amplifier: 1, showParticles: true });
      target.addEffect('weakness',  this.AUTHORITY_DURATION, { amplifier: 0, showParticles: true });

      // Particle burst at target — golden flash (law/order aesthetic)
      try {
        for (let i = 0; i < 3; i++) {
          target.dimension.spawnParticle('minecraft:basic_flame_particle', {
            x: target.location.x,
            y: target.location.y + 1,
            z: target.location.z,
          });
        }
      } catch (_) {}

      player.sendMessage(`§6⚖ §eAuthority Command! §7Enemy's resolve crumbles — §e5s`);
      this.authorityCooldowns.set(player.name, this.AUTHORITY_COOLDOWN);
      return true;

    } catch (_) {
      return false;
    }
  }

  // ── Item ability dispatcher ───────────────────────────────────────────────
  static useAbility(player, abilityId) {
    if (abilityId === this.ABILITIES.AUTHORITY_COMMAND) {
      return this.useAuthorityCommand(player);
    }
    return false;
  }

  // ── Ability info (for UI/help) ────────────────────────────────────────────
  static getAbilityInfo(abilityId) {
    if (abilityId === this.ABILITIES.AUTHORITY_COMMAND) {
      return `§7Cost: §e${this.AUTHORITY_SPIRIT_COST} Spirit\n` +
             `§7Nearest enemy within §e${this.AUTHORITY_RANGE}§7 blocks:\n` +
             `§7  Slowness II + Weakness I for §e5s\n` +
             `§7Cooldown: §e8s`;
    }
    return '';
  }

  // ── Hostile mob detection ─────────────────────────────────────────────────
  static _isHostile(entity) {
    const hostileTypes = [
      'minecraft:zombie', 'minecraft:skeleton', 'minecraft:creeper',
      'minecraft:spider', 'minecraft:cave_spider', 'minecraft:enderman',
      'minecraft:witch', 'minecraft:pillager', 'minecraft:vindicator',
      'minecraft:evoker', 'minecraft:ravager', 'minecraft:blaze',
      'minecraft:ghast', 'minecraft:wither_skeleton', 'minecraft:piglin_brute',
      'minecraft:hoglin', 'minecraft:zoglin', 'minecraft:drowned',
      'minecraft:husk', 'minecraft:stray', 'minecraft:phantom',
      'minecraft:guardian', 'minecraft:elder_guardian', 'minecraft:shulker',
      'minecraft:silverfish', 'minecraft:endermite', 'minecraft:slime',
      'minecraft:magma_cube', 'minecraft:warden',
    ];
    return hostileTypes.includes(entity.typeId);
  }
}
