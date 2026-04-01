// ============================================================================
// JUSTICIAR PATHWAY — SEQUENCE 8: SHERIFF
// sheriff.js → behavior_packs/LOTM/scripts/sequences/justiciar/sheriff.js
//
// LORE:
//   Spiritual Perception: Supernatural senses — vaguely grasp a target's
//     location, detect abnormalities and subtle clues, sense Evil/Disorder/
//     Madness when close enough, sharp intuition for monitoring/being monitored.
//   Physical Enhancement: Constitution effectively enhanced.
//   Jurisdiction: Designate an area as Jurisdiction — connected to it always,
//     stronger abilities inside it, ~size of a small town (~100 block radius).
//   Recognition: See a person/mob once → remember them forever. Can detect
//     them again on re-encounter. Memory of traversed routes.
//   Weapon Proficiency: Bonus with melee weapons and firearms.
//
// IMPLEMENTATION:
//
//   PASSIVES (always active):
//     - Speed I + Resistance I + Strength I (enhanced constitution)
//     - +4 hearts (up from +2 at Arbiter)
//     - Order's Presence (inherited, now stronger: 35% chance, 12 block range)
//     - Spiritual Perception: nearby hostiles show Glowing every ~6s
//       (represents sensing their location through supernatural intuition)
//     - Counter-Surveillance: if a player/mob is within 6 blocks looking at
//       you, you get a brief Glowing flash on them (you sense being monitored)
//     - Weapon Proficiency: +damage on melee hits handled via entityHitEntity
//       in main.js (see MAIN_JS_PATCH)
//
//   ACTIVE ABILITIES (via Sheriff's Badge item, cycles modes):
//     Mode 1 — Recognition (8 spirit, 5s CD):
//       Nearest entity within 12 blocks gets Glowing 10s + is added to
//       recognised list. Future encounters auto-trigger Glowing passively.
//     Mode 2 — Jurisdiction Mark (20 spirit, 60s CD):
//       Sets your current position as Jurisdiction centre. While inside
//       (100 blocks), you gain Haste I + Strength II (on top of base Strength I)
//       and your Authority Command range extends to 12 blocks.
//     Mode 3 — Sense Disorder (15 spirit, 12s CD):
//       Pulses a 20-block radius — all hostile mobs within range get Glowing
//       for 8s and a particle marker. Represents sensing Evil/Disorder/Madness.
//
// ============================================================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

export class SheriffSequence {
  static SEQUENCE_NUMBER = 8;
  static PATHWAY         = 'justiciar';

  // ── Passive config ─────────────────────────────────────────────────────────
  static EFFECT_DURATION    = 999999;
  static PRESENCE_RANGE     = 12;     // up from Arbiter's 10
  static PRESENCE_CHANCE    = 0.35;   // up from 0.25
  static PERCEPTION_RANGE   = 16;     // Spiritual Perception glow radius
  static PERCEPTION_TICK    = 30;     // check every ~6s (30 * 4 ticks = 120 ticks)
  static SURVEILLANCE_RANGE = 6;      // range to detect being watched

  // ── Jurisdiction config ────────────────────────────────────────────────────
  static JURISDICTION_RADIUS = 100;   // blocks

  // ── Ability costs ──────────────────────────────────────────────────────────
  static RECOGNITION_COST      = 8;
  static RECOGNITION_CD        = 100;  // 5s
  static JURISDICTION_COST     = 20;
  static JURISDICTION_CD       = 1200; // 60s
  static SENSE_DISORDER_COST   = 15;
  static SENSE_DISORDER_CD     = 240;  // 12s

  // ── Internal state ─────────────────────────────────────────────────────────
  static _passiveTick        = new Map(); // player → tick counter
  static _recognisedEntities = new Map(); // player name → Set of entity IDs
  static _jurisdictionCentre = new Map(); // player name → {x, y, z, dimensionId}
  static _jurisdictionActive = new Map(); // player name → boolean (currently inside?)
  static badgeModes          = new Map(); // player name → mode index
  static cooldowns           = new Map(); // player name → { recognition, jurisdiction, senseDisorder }

  static MODES = ['recognition', 'jurisdiction', 'sense_disorder'];
  static MODE_LABELS = {
    recognition:    '§b[Recognition]',
    jurisdiction:   '§a[Jurisdiction Mark]',
    sense_disorder: '§c[Sense Disorder]',
  };

  // ── Sequence check ─────────────────────────────────────────────────────────
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // ── Apply passives — called every 4 ticks ─────────────────────────────────
  static applyPassiveAbilities(player) {
    if (!this.hasSequence(player)) return;

    // ── Physical enhancement: Strength I + Speed I + Resistance I ───────────
    const str = player.getEffect('strength');
    if (!str || str.amplifier !== 0 || str.duration < 100) {
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: 0, showParticles: true });
    }
    const spd = player.getEffect('speed');
    if (!spd || spd.amplifier !== 0 || spd.duration < 100) {
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: 0, showParticles: true });
    }
    const res = player.getEffect('resistance');
    if (!res || res.amplifier !== 0 || res.duration < 100) {
      player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: 0, showParticles: true });
    }

    // ── +4 hearts ────────────────────────────────────────────────────────────
    this._applyHealthBonus(player, 8); // 8 HP = 4 hearts

    // ── Jurisdiction bonus (if inside) ───────────────────────────────────────
    this._tickJurisdiction(player);

    // ── Spiritual Perception + counter-surveillance ──────────────────────────
    this._tickPerception(player);

    // ── Cooldown ticks ───────────────────────────────────────────────────────
    this._tickCooldowns(player);
  }

  // ── Health bonus ──────────────────────────────────────────────────────────
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

  // ── Jurisdiction tick ─────────────────────────────────────────────────────
  static _tickJurisdiction(player) {
    const centre = this._jurisdictionCentre.get(player.name);
    if (!centre) return;
    if (centre.dimensionId !== player.dimension.id) {
      // Left the dimension — no bonus
      if (this._jurisdictionActive.get(player.name)) {
        this._jurisdictionActive.set(player.name, false);
        this._removeJurisdictionBuffs(player);
      }
      return;
    }

    const dx = player.location.x - centre.x;
    const dz = player.location.z - centre.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    const inside = dist <= this.JURISDICTION_RADIUS;
    const wasInside = this._jurisdictionActive.get(player.name) ?? false;

    if (inside && !wasInside) {
      this._jurisdictionActive.set(player.name, true);
      player.sendMessage('§a⚖ §7Entering your Jurisdiction — your authority is strengthened');
    } else if (!inside && wasInside) {
      this._jurisdictionActive.set(player.name, false);
      this._removeJurisdictionBuffs(player);
      player.sendMessage('§7You have left your Jurisdiction — powers return to normal');
    }

    if (inside) {
      // Haste I while in Jurisdiction
      const haste = player.getEffect('haste');
      if (!haste || haste.duration < 100) {
        player.addEffect('haste', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
      }
      // Strength II (override the base Strength I) while in Jurisdiction
      const str = player.getEffect('strength');
      if (!str || str.amplifier < 1 || str.duration < 100) {
        player.addEffect('strength', this.EFFECT_DURATION, { amplifier: 1, showParticles: false });
      }
    }
  }

  static _removeJurisdictionBuffs(player) {
    try {
      // Remove haste; strength returns to base Strength I via next passive tick
      player.removeEffect('haste');
      // Strength will be reset to amplifier 0 on next applyPassiveAbilities tick
    } catch (_) {}
  }

  // ── Spiritual Perception + counter-surveillance tick ─────────────────────
  static _tickPerception(player) {
    const tick = (this._passiveTick.get(player.name) ?? 0) + 1;
    this._passiveTick.set(player.name, tick);

    // ── Counter-surveillance: check every 4 calls (~16 ticks / ~0.8s) ───────
    // If anything is "looking at" us within close range, flash them with Glowing
    if (tick % 4 === 0) {
      try {
        const nearby = player.dimension.getEntities({
          location: player.location,
          maxDistance: this.SURVEILLANCE_RANGE,
          excludeTypes: ['minecraft:player'],
        });
        for (const e of nearby) {
          if (!e.isValid()) continue;
          // Check if the entity is facing roughly toward the player
          const viewDir = e.getViewDirection?.();
          if (!viewDir) continue;
          const dx = player.location.x - e.location.x;
          const dz = player.location.z - e.location.z;
          const len = Math.sqrt(dx*dx + dz*dz) || 1;
          const dot = (viewDir.x * dx/len) + (viewDir.z * dz/len);
          if (dot > 0.7) {
            // Something is looking at us — flash it briefly
            e.addEffect('glowing', 20, { amplifier: 0, showParticles: false });
          }
        }
      } catch (_) {}
    }

    // ── Spiritual Perception: glow nearby hostiles every ~6s ─────────────────
    if (tick % this.PERCEPTION_TICK !== 0) return;

    try {
      const nearby = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.PERCEPTION_RANGE,
        excludeTypes: ['minecraft:player'],
      });

      for (const e of nearby) {
        if (!e.isValid()) continue;

        // Sense Disorder/Evil: always glow actual hostiles
        if (this._isHostile(e)) {
          e.addEffect('glowing', 60, { amplifier: 0, showParticles: false });
          // Apply Order's Presence weakening (inherited, enhanced)
          if (Math.random() < this.PRESENCE_CHANCE) {
            e.addEffect('weakness', 60, { amplifier: 0, showParticles: false });
            e.addEffect('slowness', 40, { amplifier: 0, showParticles: false });
          }
        }

        // Recognition: if we've seen this entity before, glow it
        const recognised = this._recognisedEntities.get(player.name);
        if (recognised && recognised.has(e.id)) {
          e.addEffect('glowing', 80, { amplifier: 0, showParticles: false });
        }
      }
    } catch (_) {}
  }

  // ── Cooldown ticking ──────────────────────────────────────────────────────
  static _tickCooldowns(player) {
    const cds = this.cooldowns.get(player.name);
    if (!cds) return;
    for (const key of Object.keys(cds)) {
      if (cds[key] > 0) cds[key]--;
    }
  }

  static _getCD(player, key) {
    return this.cooldowns.get(player.name)?.[key] ?? 0;
  }

  static _setCD(player, key, value) {
    if (!this.cooldowns.has(player.name)) {
      this.cooldowns.set(player.name, { recognition: 0, jurisdiction: 0, senseDisorder: 0 });
    }
    this.cooldowns.get(player.name)[key] = value;
  }

  // ── Badge mode cycling ────────────────────────────────────────────────────
  static cycleMode(player) {
    const current = this.badgeModes.get(player.name) ?? 0;
    const next = (current + 1) % this.MODES.length;
    this.badgeModes.set(player.name, next);
    const label = this.MODE_LABELS[this.MODES[next]];
    player.sendMessage(`§6Sheriff's Badge — Mode: ${label}`);
  }

  // ── Active: Recognition ───────────────────────────────────────────────────
  static useRecognition(player) {
    const cd = this._getCD(player, 'recognition');
    if (cd > 0) {
      player.sendMessage(`§cRecognition on cooldown — §e${Math.ceil(cd/20)}s`);
      return false;
    }
    if (!SpiritSystem.consumeSpirit(player, this.RECOGNITION_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.RECOGNITION_COST}`);
      return false;
    }

    try {
      // Find nearest entity within 12 blocks (any type — Recognition works on anyone)
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: 12,
        excludeTypes: ['minecraft:player'],
      });

      let target = null;
      let closest = Infinity;
      for (const e of entities) {
        if (!e.isValid()) continue;
        const dx = e.location.x - player.location.x;
        const dy = e.location.y - player.location.y;
        const dz = e.location.z - player.location.z;
        const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (d < closest) { closest = d; target = e; }
      }

      if (!target) {
        SpiritSystem.addSpirit(player, this.RECOGNITION_COST);
        player.sendMessage('§7No target in range to recognise');
        return false;
      }

      // Register in recognised set
      if (!this._recognisedEntities.has(player.name)) {
        this._recognisedEntities.set(player.name, new Set());
      }
      this._recognisedEntities.get(player.name).add(target.id);

      // Apply Glowing to show them clearly
      target.addEffect('glowing', 200, { amplifier: 0, showParticles: false });

      player.sendMessage(`§b✦ §7Target recognised — §bRecognition §7active for 10s`);
      this._setCD(player, 'recognition', this.RECOGNITION_CD);
      return true;
    } catch (_) { return false; }
  }

  // ── Active: Jurisdiction Mark ─────────────────────────────────────────────
  static useJurisdictionMark(player) {
    const cd = this._getCD(player, 'jurisdiction');
    if (cd > 0) {
      player.sendMessage(`§cJurisdiction Mark on cooldown — §e${Math.ceil(cd/20)}s`);
      return false;
    }
    if (!SpiritSystem.consumeSpirit(player, this.JURISDICTION_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.JURISDICTION_COST}`);
      return false;
    }

    const centre = {
      x: player.location.x,
      y: player.location.y,
      z: player.location.z,
      dimensionId: player.dimension.id,
    };
    this._jurisdictionCentre.set(player.name, centre);
    this._jurisdictionActive.set(player.name, true); // already standing at it

    // Visual marker — gold particles at player feet
    try {
      for (let i = 0; i < 6; i++) {
        player.dimension.spawnParticle('minecraft:basic_flame_particle', {
          x: player.location.x + (Math.random()-0.5)*2,
          y: player.location.y,
          z: player.location.z + (Math.random()-0.5)*2,
        });
      }
    } catch (_) {}

    player.sendMessage(`§a⚖ §eJurisdiction established! §7This area is now under your authority`);
    player.sendMessage(`§7Radius: §e${this.JURISDICTION_RADIUS} blocks §7| Haste I + Strength II while inside`);
    this._setCD(player, 'jurisdiction', this.JURISDICTION_CD);
    return true;
  }

  // ── Active: Sense Disorder ────────────────────────────────────────────────
  static useSenseDisorder(player) {
    const cd = this._getCD(player, 'senseDisorder');
    if (cd > 0) {
      player.sendMessage(`§cSense Disorder on cooldown — §e${Math.ceil(cd/20)}s`);
      return false;
    }
    if (!SpiritSystem.consumeSpirit(player, this.SENSE_DISORDER_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.SENSE_DISORDER_COST}`);
      return false;
    }

    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: 20,
        excludeTypes: ['minecraft:player'],
      });

      let count = 0;
      for (const e of entities) {
        if (!e.isValid() || !this._isHostile(e)) continue;
        e.addEffect('glowing', 160, { amplifier: 0, showParticles: true });
        // Brief weakness pulse
        e.addEffect('weakness', 60, { amplifier: 0, showParticles: false });
        // Particle at their location
        try {
          e.dimension.spawnParticle('minecraft:villager_angry', {
            x: e.location.x, y: e.location.y + 1, z: e.location.z
          });
        } catch (_) {}
        count++;
      }

      player.sendMessage(`§c⚠ §7Sense Disorder — §e${count} §7hostile presence${count !== 1 ? 's' : ''} detected in 20 blocks`);
      this._setCD(player, 'senseDisorder', this.SENSE_DISORDER_CD);
      return true;
    } catch (_) { return false; }
  }

  // ── Item use dispatcher ───────────────────────────────────────────────────
  // Called on sneak+use → cycle mode. Called on use → activate current mode.
  static useBadge(player, isSneaking) {
    if (isSneaking) {
      this.cycleMode(player);
      return true;
    }

    const modeIdx  = this.badgeModes.get(player.name) ?? 0;
    const modeName = this.MODES[modeIdx];

    if (modeName === 'recognition')    return this.useRecognition(player);
    if (modeName === 'jurisdiction')   return this.useJurisdictionMark(player);
    if (modeName === 'sense_disorder') return this.useSenseDisorder(player);
    return false;
  }

  // ── Weapon proficiency (call from main.js entityHitEntity) ───────────────
  // Returns bonus damage to add, or 0 if not applicable.
  static getMeleeProficiencyBonus(player, weaponTypeId) {
    if (!this.hasSequence(player)) return 0;
    // Melee weapons: +2 damage (1 heart)
    const meleeTypes = [
      'minecraft:iron_sword', 'minecraft:diamond_sword', 'minecraft:netherite_sword',
      'minecraft:golden_sword', 'minecraft:stone_sword', 'minecraft:wooden_sword',
      'lotm:short_sword', 'lotm:knife',
    ];
    if (meleeTypes.includes(weaponTypeId)) return 2;
    return 0;
  }

  // ── Hostile detection (shared with Arbiter) ───────────────────────────────
  static _isHostile(entity) {
    const hostileTypes = [
      'minecraft:zombie','minecraft:skeleton','minecraft:creeper',
      'minecraft:spider','minecraft:cave_spider','minecraft:enderman',
      'minecraft:witch','minecraft:pillager','minecraft:vindicator',
      'minecraft:evoker','minecraft:ravager','minecraft:blaze',
      'minecraft:ghast','minecraft:wither_skeleton','minecraft:piglin_brute',
      'minecraft:hoglin','minecraft:zoglin','minecraft:drowned',
      'minecraft:husk','minecraft:stray','minecraft:phantom',
      'minecraft:guardian','minecraft:elder_guardian','minecraft:shulker',
      'minecraft:silverfish','minecraft:endermite','minecraft:slime',
      'minecraft:magma_cube','minecraft:warden',
    ];
    return hostileTypes.includes(entity.typeId);
  }

  // ── Status display ────────────────────────────────────────────────────────
  static getStatusText(player) {
    const modeIdx  = this.badgeModes.get(player.name) ?? 0;
    const label    = this.MODE_LABELS[this.MODES[modeIdx]];
    const inJuris  = this._jurisdictionActive.get(player.name) ? '§aIn Jurisdiction' : '§7No Jurisdiction';
    const recCount = this._recognisedEntities.get(player.name)?.size ?? 0;
    return `§6Sheriff's Badge §7| ${label} | ${inJuris} | §7Recognised: §e${recCount}`;
  }
}
