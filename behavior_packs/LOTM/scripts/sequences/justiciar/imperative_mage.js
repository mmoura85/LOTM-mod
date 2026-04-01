// ============================================================================
// JUSTICIAR PATHWAY — SEQUENCE 4: IMPERATIVE MAGE
// imperative_mage.js → scripts/sequences/justiciar/imperative_mage.js
//
// LORE:
//   Physical: Further enhanced physical fitness.
//   Law (core ability): Sets broad restrictions for 30s–15min.
//     "Weaken Mysticism, Enhance Reality" — weakens all Beyonders in area,
//       strengthens Reality's influence. Military tool vs Beyonders.
//     "Weaken Reality, Enhance Mysticism" — opposite, enhances Beyonder effects.
//     Other Laws: Levitation, slow projectiles, etc.
//   Contracts: Bind physical and Spirit Bodies with Rule-based Order contracts.
//   Supernatural Intuition: Distinguish ordinary vs Beyonders, determine level.
//     Perceive intertwining Beyonder powers in colors.
//   Authority (massively amplified): Can root targets to spot by intimidation.
//     Verdicts enhanced:
//     Prohibition: More actions prohibited, can seal areas from outside interaction.
//     Deprivation: Strip a specific Beyonder power from target for a duration.
//     Exile: Send target into a void — deals massive damage, long knockback.
//     Execution: Right hand swing down — Execute target from afar. High damage.
//     Confinement: Left hand clench — confine target in an area.
//     Intimidation: Root targets to spot.
//   Mythical Creature Form: Incomplete Brass Pillar — giant form. Massive buffs.
//
// STATS:
//   Strength III, Speed II, Resistance III, Jump Boost II, +12 hearts (+24 HP)
//   Jurisdiction: 500 blocks.
//   Mythical Form (temporary): Strength V + Resistance IV + Size increase
//     simulated with slow Levitation + additional damage bonus.
//
// ACTIVE — Mage's Codex (item, 6 modes):
//   Mode 1 — Law: Weaken Mysticism (35 spirit, 30s CD):
//     All entities in 20 blocks: Weakness III + Mining Fatigue III + Slowness II
//     for 15s. Represents Beyonders being suppressed. Player gets Strength bonus.
//   Mode 2 — Law: Weaken Reality (35 spirit, 30s CD):
//     Player gets massive buffs for 15s: Strength III extra + Speed II extra.
//     Nearby mobs get Glowing (enhanced Beyonder perception).
//   Mode 3 — Deprivation (25 spirit, 15s CD):
//     Target in 8 blocks — Mining Fatigue V + Weakness III for 10s.
//     Represents stripping their Beyonder power temporarily.
//   Mode 4 — Execution (40 spirit, 30s CD):
//     Right-hand swing from afar — 30 damage hitscan, 15 blocks.
//     If target is below 50% health, deals double damage.
//   Mode 5 — Intimidation + Confinement (28 spirit, 12s CD):
//     All entities in 10 blocks — Slowness V + Mining Fatigue II + Weakness II 8s.
//     Rooted to the spot.
//   Mode 6 — Mythical Form (60 spirit, 120s CD):
//     30s transformation — Strength V + Resistance IV + Jump Boost III + Speed II.
//     Golden particles and size effects. "Incomplete Brass Pillar".
//
// ============================================================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

export class ImperativeMageSequence {
  static SEQUENCE_NUMBER = 4;
  static PATHWAY         = 'justiciar';
  static EFFECT_DURATION = 999999;

  // ── Ability costs & cooldowns ──────────────────────────────────────────────
  static WEAKEN_MYS_COST   = 35; static WEAKEN_MYS_CD   = 600;  // 30s
  static WEAKEN_REAL_COST  = 35; static WEAKEN_REAL_CD  = 600;  // 30s
  static WEAKEN_DUR        = 300; // 15s

  static DEPRIVATION_COST  = 25; static DEPRIVATION_CD  = 300;  // 15s
  static DEPRIVATION_RANGE = 8;  static DEPRIVATION_DUR = 200;  // 10s

  static EXECUTION_COST    = 40; static EXECUTION_CD    = 600;  // 30s
  static EXECUTION_RANGE   = 15; static EXECUTION_DMG   = 30;

  static INTIMIDATION_COST = 28; static INTIMIDATION_CD = 240;  // 12s
  static INTIMIDATION_RANGE= 10; static INTIMIDATION_DUR= 160;  // 8s

  static MYTHICAL_COST     = 60; static MYTHICAL_CD     = 2400; // 120s
  static MYTHICAL_DURATION = 600; // 30s

  static JURISDICTION_RADIUS = 500;

  // ── Internal state ─────────────────────────────────────────────────────────
  static codexModes          = new Map();
  static cooldowns           = new Map();
  static mythicalActive      = new Map(); // player → ticks remaining
  static _jurisdictionCentre = new Map();
  static _jurisdictionActive = new Map();
  static _passiveTick        = new Map();

  static MODES = ['weaken_mysticism', 'weaken_reality', 'deprivation', 'execution', 'intimidation', 'mythical_form'];
  static MODE_LABELS = {
    weaken_mysticism: '§c[Law: Weaken Mysticism]',
    weaken_reality:   '§b[Law: Weaken Reality]',
    deprivation:      '§5[Deprivation]',
    execution:        '§4[Execution]',
    intimidation:     '§9[Intimidation + Confinement]',
    mythical_form:    '§6[Mythical Form — Brass Pillar]',
  };

  // ── Sequence check ─────────────────────────────────────────────────────────
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // ── Apply passives ─────────────────────────────────────────────────────────
  static applyPassiveAbilities(player) {
    if (!this.hasSequence(player)) return;

    const inJuris   = this._jurisdictionActive.get(player.name);
    const mythTicks = this.mythicalActive.get(player.name) ?? 0;
    const inMythical = mythTicks > 0;

    // ── Physical: Strength III, Speed II, Resistance III, Jump Boost II ───────
    // During Mythical Form: Strength V, Resistance IV
    const strAmp = inMythical ? 4 : inJuris ? 3 : 2;
    const resAmp = inMythical ? 3 : 2;
    const jmpAmp = inMythical ? 2 : 1;
    const spdAmp = 1;

    const str = player.getEffect('strength');
    if (!str || str.amplifier !== strAmp || str.duration < 100) {
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: strAmp, showParticles: true });
    }
    const spd = player.getEffect('speed');
    if (!spd || spd.amplifier !== spdAmp || spd.duration < 100) {
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: spdAmp, showParticles: true });
    }
    const res = player.getEffect('resistance');
    if (!res || res.amplifier !== resAmp || res.duration < 100) {
      player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: resAmp, showParticles: true });
    }
    const jmp = player.getEffect('jump_boost');
    if (!jmp || jmp.amplifier !== jmpAmp || jmp.duration < 100) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: jmpAmp, showParticles: true });
    }

    // Night Vision (permanent)
    const nightVision = player.getEffect('night_vision');
    if (!nightVision || nightVision.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }

    // ── +12 hearts (+24 HP) ───────────────────────────────────────────────────
    this._applyHealthBonus(player, 24);

    // ── Mental: strip low-level debuffs (strengthened from Paladin) ──────────
    try {
      const slow = player.getEffect('slowness');
      if (slow && slow.amplifier <= 2 && slow.duration < 80) player.removeEffect('slowness');
      const weak = player.getEffect('weakness');
      if (weak && weak.amplifier <= 1 && weak.duration < 80) player.removeEffect('weakness');
      const naus = player.getEffect('nausea');
      if (naus && naus.duration < 60) player.removeEffect('nausea');
      const mf = player.getEffect('mining_fatigue');
      if (mf && mf.amplifier <= 0 && mf.duration < 60) player.removeEffect('mining_fatigue');
    } catch (_) {}

    // ── Jurisdiction tick ─────────────────────────────────────────────────────
    this._tickJurisdiction(player);

    // ── Mythical Form countdown ───────────────────────────────────────────────
    if (inMythical) {
      const remaining = mythTicks - 1;
      this.mythicalActive.set(player.name, remaining);
      if (remaining === 0) {
        player.sendMessage('§7Mythical Form fades — Brass Pillar recedes');
        // Effects naturally expire
      } else if (remaining % 100 === 0) {
        // Periodic brass particle effect
        try {
          for (let i = 0; i < 4; i++) {
            player.dimension.spawnParticle('minecraft:basic_flame_particle', {
              x: player.location.x + (Math.random()-0.5)*2,
              y: player.location.y + (Math.random()*3),
              z: player.location.z + (Math.random()-0.5)*2,
            });
          }
        } catch (_) {}
      }
    }

    // ── Supernatural Intuition: detect Beyonders (players) nearby ─────────────
    // Every ~6s, nearby players get Glowing briefly (you perceive their power)
    const tick = (this._passiveTick.get(player.name) ?? 0) + 1;
    this._passiveTick.set(player.name, tick);
    if (tick % 30 === 0) {
      try {
        const nearby = player.dimension.getPlayers({
          location: player.location, maxDistance: 20,
        });
        for (const p of nearby) {
          if (p.id === player.id) continue;
          const otherPathway = PathwayManager.getPathway(p);
          if (otherPathway) {
            // They are a Beyonder — you perceive them
            p.addEffect('glowing', 40, { amplifier: 0, showParticles: false });
          }
        }
      } catch (_) {}

      // Authority aura on mobs
      try {
        const entities = player.dimension.getEntities({
          location: player.location, maxDistance: 10,
          excludeTypes: ['minecraft:player'],
        });
        for (const e of entities) {
          if (!e.isValid() || !this._isHostile(e)) continue;
          e.addEffect('slowness', 40, { amplifier: 0, showParticles: false });
          e.addEffect('weakness', 40, { amplifier: 0, showParticles: false });
        }
      } catch (_) {}
    }

    // ── Cooldown ticks ────────────────────────────────────────────────────────
    this._tickCooldowns(player);
  }

  static _applyHealthBonus(player, amount) {
    try {
      const h = player.getComponent('minecraft:health');
      if (!h) return;
      const t = 20 + amount;
      if (Math.abs(h.effectiveMax - t) > 0.1) {
        player.getComponent('minecraft:attribute.health')?.setCurrentValue?.(t);
      }
    } catch (_) {}
  }

  // ── Verdict 1: Law — Weaken Mysticism ─────────────────────────────────────
  static useLawWeakenMysticism(player) {
    const cd = this._getCD(player, 'weakenMys');
    if (cd > 0) { player.sendMessage(`§cLaw on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.WEAKEN_MYS_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.WEAKEN_MYS_COST}`); return false;
    }

    try {
      const entities = player.dimension.getEntities({
        location: player.location, maxDistance: 20,
        excludeTypes: ['minecraft:player'],
      });
      let count = 0;
      for (const e of entities) {
        if (!e.isValid()) continue;
        e.addEffect('weakness',       this.WEAKEN_DUR, { amplifier: 2, showParticles: true });
        e.addEffect('mining_fatigue', this.WEAKEN_DUR, { amplifier: 2, showParticles: false });
        e.addEffect('slowness',       this.WEAKEN_DUR, { amplifier: 1, showParticles: false });
        count++;
      }
      // Player gains Reality bonus — stronger physical attacks
      player.addEffect('strength', this.WEAKEN_DUR, { amplifier: 3, showParticles: true });
      player.addEffect('haste',    this.WEAKEN_DUR, { amplifier: 1, showParticles: false });

      // Expanding ring of particles
      for (let r = 4; r <= 20; r += 4) {
        const rr = r;
        system.runTimeout(() => {
          for (let i = 0; i < 12; i++) {
            const a = (i/12)*Math.PI*2;
            try {
              player.dimension.spawnParticle('minecraft:basic_crit_particle', {
                x: player.location.x + Math.cos(a)*rr,
                y: player.location.y + 1,
                z: player.location.z + Math.sin(a)*rr,
              });
            } catch (_) {}
          }
        }, r/2);
      }
      player.sendMessage(`§c⚖ §e"Weaken Mysticism, Enhance Reality!" §7— §e${count} §7Beyonder powers suppressed for §e15s`);
    } catch (_) {}
    this._setCD(player, 'weakenMys', this.WEAKEN_MYS_CD);
    return true;
  }

  // ── Verdict 2: Law — Weaken Reality ───────────────────────────────────────
  static useLawWeakenReality(player) {
    const cd = this._getCD(player, 'weakenReal');
    if (cd > 0) { player.sendMessage(`§cLaw on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.WEAKEN_REAL_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.WEAKEN_REAL_COST}`); return false;
    }

    // Player gains massive Beyonder enhancement — mysticism amplified
    player.addEffect('strength',    this.WEAKEN_DUR, { amplifier: 4, showParticles: true });
    player.addEffect('speed',       this.WEAKEN_DUR, { amplifier: 2, showParticles: true });
    player.addEffect('jump_boost',  this.WEAKEN_DUR, { amplifier: 3, showParticles: false });
    player.addEffect('resistance',  this.WEAKEN_DUR, { amplifier: 3, showParticles: false });

    // Supernatural glow on all nearby players (you perceive their Beyonder nature)
    try {
      const nearbyPlayers = player.dimension.getPlayers({
        location: player.location, maxDistance: 20,
      });
      for (const p of nearbyPlayers) {
        if (p.id !== player.id) {
          p.addEffect('glowing', this.WEAKEN_DUR, { amplifier: 0, showParticles: false });
        }
      }
    } catch (_) {}

    // Mystical particle burst on player
    try {
      for (let i = 0; i < 12; i++) {
        player.dimension.spawnParticle('minecraft:basic_smoke_particle', {
          x: player.location.x + (Math.random()-0.5)*2,
          y: player.location.y + Math.random()*2,
          z: player.location.z + (Math.random()-0.5)*2,
        });
      }
    } catch (_) {}

    player.sendMessage(`§b⚖ §e"Weaken Reality, Enhance Mysticism!" §7— §bBeyonder powers amplified §7for §e15s`);
    this._setCD(player, 'weakenReal', this.WEAKEN_REAL_CD);
    return true;
  }

  // ── Verdict 3: Deprivation ─────────────────────────────────────────────────
  static useDeprivation(player) {
    const cd = this._getCD(player, 'deprivation');
    if (cd > 0) { player.sendMessage(`§cDeprivation on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.DEPRIVATION_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.DEPRIVATION_COST}`); return false;
    }

    const entities = player.dimension.getEntities({
      location: player.location, maxDistance: this.DEPRIVATION_RANGE,
      excludeTypes: ['minecraft:player'],
    });
    let target = null, closest = Infinity;
    for (const e of entities) {
      if (!e.isValid()) continue;
      const dx=e.location.x-player.location.x, dy=e.location.y-player.location.y, dz=e.location.z-player.location.z;
      const d=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if (d < closest) { closest=d; target=e; }
    }
    if (!target) {
      SpiritSystem.addSpirit(player, this.DEPRIVATION_COST);
      player.sendMessage('§7No target in range for Deprivation');
      return false;
    }

    // Strip Beyonder power — Mining Fatigue V + Weakness III represents full ability suppression
    try {
      target.addEffect('mining_fatigue', this.DEPRIVATION_DUR, { amplifier: 4, showParticles: true });
      target.addEffect('weakness',       this.DEPRIVATION_DUR, { amplifier: 2, showParticles: true });
      target.addEffect('slowness',       this.DEPRIVATION_DUR, { amplifier: 1, showParticles: false });
    } catch (_) {}

    // Purple particle strip from target — power being pulled away
    try {
      for (let i = 0; i < 8; i++) {
        target.dimension.spawnParticle('minecraft:basic_smoke_particle', {
          x: target.location.x + (Math.random()-0.5)*1.5,
          y: target.location.y + Math.random()*2,
          z: target.location.z + (Math.random()-0.5)*1.5,
        });
      }
    } catch (_) {}

    player.sendMessage(`§5⚖ §e"Deprivation!" §7— Beyonder power stripped for §e${Math.ceil(this.DEPRIVATION_DUR/20)}s`);
    this._setCD(player, 'deprivation', this.DEPRIVATION_CD);
    return true;
  }

  // ── Verdict 4: Execution ───────────────────────────────────────────────────
  static useExecution(player) {
    const cd = this._getCD(player, 'execution');
    if (cd > 0) { player.sendMessage(`§cExecution on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.EXECUTION_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.EXECUTION_COST}`); return false;
    }

    try {
      const eyePos = { x: player.location.x, y: player.location.y+1.6, z: player.location.z };
      const dir    = player.getViewDirection();
      const result = player.dimension.getEntitiesFromRay(eyePos, dir, {
        maxDistance: this.EXECUTION_RANGE, excludeTypes: ['minecraft:player'],
      });
      const target = result?.[0]?.entity;
      if (!target?.isValid()) {
        SpiritSystem.addSpirit(player, this.EXECUTION_COST);
        player.sendMessage('§7No target in sight for Execution');
        return false;
      }

      // Check if target below 50% HP for double damage
      let damage = this.EXECUTION_DMG;
      try {
        const h = target.getComponent('minecraft:health');
        if (h && h.currentValue <= h.effectiveMax * 0.5) {
          damage *= 2;
          player.sendMessage('§4💀 §eExecution — target below half health, §4DOUBLE DAMAGE');
        }
      } catch (_) {}

      target.applyDamage(damage);
      target.addEffect('weakness',  80, { amplifier: 2, showParticles: false });
      target.addEffect('slowness', 100, { amplifier: 2, showParticles: false });

      // Downward swing particles
      for (let i = 0; i < 6; i++) {
        try {
          player.dimension.spawnParticle('minecraft:basic_crit_particle', {
            x: target.location.x + (Math.random()-0.5)*0.5,
            y: target.location.y + 2 - i*0.3,
            z: target.location.z + (Math.random()-0.5)*0.5,
          });
        } catch (_) {}
      }
      player.sendMessage(`§4⚖ §e"Execution!" §7— §4${damage} §7devastating damage from afar`);
    } catch (_) {
      SpiritSystem.addSpirit(player, this.EXECUTION_COST);
      return false;
    }
    this._setCD(player, 'execution', this.EXECUTION_CD);
    return true;
  }

  // ── Verdict 5: Intimidation + Confinement ──────────────────────────────────
  static useIntimidation(player) {
    const cd = this._getCD(player, 'intimidation');
    if (cd > 0) { player.sendMessage(`§cIntimidation on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.INTIMIDATION_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.INTIMIDATION_COST}`); return false;
    }

    try {
      const entities = player.dimension.getEntities({
        location: player.location, maxDistance: this.INTIMIDATION_RANGE,
        excludeTypes: ['minecraft:player'],
      });
      let count = 0;
      for (const e of entities) {
        if (!e.isValid()) continue;
        // Rooted to the spot — Slowness V = near-total immobilisation
        e.addEffect('slowness',       this.INTIMIDATION_DUR, { amplifier: 4, showParticles: true });
        e.addEffect('mining_fatigue', this.INTIMIDATION_DUR, { amplifier: 1, showParticles: false });
        e.addEffect('weakness',       this.INTIMIDATION_DUR, { amplifier: 1, showParticles: false });
        count++;
      }
      player.sendMessage(`§9⚖ §e"Intimidation + Confinement!" §7— §e${count} §7targets rooted for §e${Math.ceil(this.INTIMIDATION_DUR/20)}s`);
    } catch (_) {}
    this._setCD(player, 'intimidation', this.INTIMIDATION_CD);
    return true;
  }

  // ── Verdict 6: Mythical Form — Brass Pillar ────────────────────────────────
  static useMythicalForm(player) {
    const cd = this._getCD(player, 'mythical');
    if (cd > 0) { player.sendMessage(`§cMythical Form on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.MYTHICAL_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.MYTHICAL_COST}`); return false;
    }

    this.mythicalActive.set(player.name, this.MYTHICAL_DURATION);

    // Massive buff burst — Brass Pillar transformation
    player.addEffect('strength',    this.MYTHICAL_DURATION, { amplifier: 4, showParticles: true });
    player.addEffect('resistance',  this.MYTHICAL_DURATION, { amplifier: 3, showParticles: true });
    player.addEffect('speed',       this.MYTHICAL_DURATION, { amplifier: 2, showParticles: false });
    player.addEffect('jump_boost',  this.MYTHICAL_DURATION, { amplifier: 2, showParticles: false });
    player.addEffect('regeneration',this.MYTHICAL_DURATION, { amplifier: 1, showParticles: false });

    // Transformation particle burst — towering golden pillar
    try {
      for (let y = 0; y < 5; y++) {
        const yy = y;
        system.runTimeout(() => {
          for (let i = 0; i < 16; i++) {
            const a = (i/16)*Math.PI*2;
            try {
              player.dimension.spawnParticle('minecraft:basic_flame_particle', {
                x: player.location.x + Math.cos(a)*2,
                y: player.location.y + yy,
                z: player.location.z + Math.sin(a)*2,
              });
            } catch (_) {}
          }
        }, y*4);
      }
    } catch (_) {}

    player.sendMessage('§6✦ §eMythical Form — §6Incomplete Brass Pillar! §730s duration');
    player.sendMessage('§7Strength V + Resistance IV + Speed II + Jump Boost III + Regen II');
    this._setCD(player, 'mythical', this.MYTHICAL_CD);
    return true;
  }

  // ── Jurisdiction ──────────────────────────────────────────────────────────
  static _tickJurisdiction(player) {
    const centre = this._jurisdictionCentre.get(player.name);
    if (!centre || centre.dimensionId !== player.dimension.id) {
      if (this._jurisdictionActive.get(player.name)) {
        this._jurisdictionActive.set(player.name, false);
        try { player.removeEffect('haste'); player.removeEffect('regeneration'); } catch (_) {}
      }
      return;
    }
    const dx=player.location.x-centre.x, dz=player.location.z-centre.z;
    const inside = Math.sqrt(dx*dx+dz*dz) <= this.JURISDICTION_RADIUS;
    const was    = this._jurisdictionActive.get(player.name) ?? false;
    if (inside && !was) {
      this._jurisdictionActive.set(player.name, true);
      player.sendMessage('§a⚖ §7Entering Jurisdiction — amplified authority');
    } else if (!inside && was) {
      this._jurisdictionActive.set(player.name, false);
      try { player.removeEffect('haste'); player.removeEffect('regeneration'); } catch (_) {}
      player.sendMessage('§7Left Jurisdiction');
    }
    if (inside) {
      const haste = player.getEffect('haste');
      if (!haste || haste.amplifier < 1 || haste.duration < 100) {
        player.addEffect('haste', this.EFFECT_DURATION, { amplifier: 1, showParticles: false });
      }
      const regen = player.getEffect('regeneration');
      if (!regen || regen.duration < 100) {
        player.addEffect('regeneration', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
      }
    }
  }

  // Sets jurisdiction from the Paladin's Seal if carried over, or from Codex
  static setJurisdiction(player) {
    this._jurisdictionCentre.set(player.name, {
      x: player.location.x, y: player.location.y, z: player.location.z,
      dimensionId: player.dimension.id,
    });
    this._jurisdictionActive.set(player.name, true);
    player.sendMessage(`§a⚖ §eJurisdiction established — ${this.JURISDICTION_RADIUS}-block radius`);
  }

  // ── Cooldowns ─────────────────────────────────────────────────────────────
  static _tickCooldowns(player) {
    const cds = this.cooldowns.get(player.name);
    if (!cds) return;
    for (const k of Object.keys(cds)) { if (cds[k] > 0) cds[k]--; }
  }
  static _getCD(player, k)    { return this.cooldowns.get(player.name)?.[k] ?? 0; }
  static _setCD(player, k, v) {
    if (!this.cooldowns.has(player.name)) {
      this.cooldowns.set(player.name, {
        weakenMys:0, weakenReal:0, deprivation:0, execution:0, intimidation:0, mythical:0
      });
    }
    this.cooldowns.get(player.name)[k] = v;
  }

  // ── Item dispatcher ────────────────────────────────────────────────────────
  static useCodex(player, isSneaking) {
    if (isSneaking) {
      const next = ((this.codexModes.get(player.name) ?? 0) + 1) % this.MODES.length;
      this.codexModes.set(player.name, next);
      player.sendMessage(`§6Mage's Codex — Verdict: ${this.MODE_LABELS[this.MODES[next]]}`);
      return true;
    }
    const mode = this.MODES[this.codexModes.get(player.name) ?? 0];
    if (mode === 'weaken_mysticism') return this.useLawWeakenMysticism(player);
    if (mode === 'weaken_reality')   return this.useLawWeakenReality(player);
    if (mode === 'deprivation')      return this.useDeprivation(player);
    if (mode === 'execution')        return this.useExecution(player);
    if (mode === 'intimidation')     return this.useIntimidation(player);
    if (mode === 'mythical_form')    return this.useMythicalForm(player);
    return false;
  }

  static getStatusText(player) {
    const modeIdx   = this.codexModes.get(player.name) ?? 0;
    const label     = this.MODE_LABELS[this.MODES[modeIdx]];
    const mythTicks = this.mythicalActive.get(player.name) ?? 0;
    const myth      = mythTicks > 0 ? ` §6✦${Math.ceil(mythTicks/20)}s` : '';
    const inJ       = this._jurisdictionActive.get(player.name) ? ' §aIn Jurisdiction' : '';
    return `§6Mage's Codex §7| ${label}${myth}${inJ}`;
  }

  static _isHostile(entity) {
    const h = ['minecraft:zombie','minecraft:skeleton','minecraft:creeper','minecraft:spider',
      'minecraft:cave_spider','minecraft:enderman','minecraft:witch','minecraft:pillager',
      'minecraft:vindicator','minecraft:evoker','minecraft:ravager','minecraft:blaze',
      'minecraft:ghast','minecraft:wither_skeleton','minecraft:piglin_brute','minecraft:hoglin',
      'minecraft:zoglin','minecraft:drowned','minecraft:husk','minecraft:stray','minecraft:phantom',
      'minecraft:guardian','minecraft:elder_guardian','minecraft:shulker','minecraft:silverfish',
      'minecraft:endermite','minecraft:slime','minecraft:magma_cube','minecraft:warden'];
    return h.includes(entity.typeId);
  }
}
