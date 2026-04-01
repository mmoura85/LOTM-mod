// ============================================================================
// JUSTICIAR PATHWAY — SEQUENCE 6: JUDGE
// judge.js → behavior_packs/LOTM/scripts/sequences/justiciar/judge.js
//
// LORE:
//   Authority: Qualitative change — indescribable aura, can influence environment.
//     Uses Ancient Hermes to establish Rules and Verdicts within an area.
//     Everything in the area must abide or be bound.
//   Verdicts:
//     Prohibition: "X is Prohibited here" — forbid specific actions/abilities.
//       e.g. Prohibit: movement, damage, use of abilities. Applies Slowness,
//       Mining Fatigue, Weakness to all within range.
//     Imprison: Layers of transparent walls — freezes target in place.
//       Root in place: Slowness V + Mining Fatigue III on single target.
//     Exile: Immense invisible force — launches targets away at speed.
//       Knockback + brief levitation to simulate being hurled.
//     Death: Body merges with force, crashes into enemy at unavoidable speed.
//       Charge forward and deliver a devastating blow — high damage + stun.
//     Flog: Invisible soft whip — tears clothes, lacerates flesh.
//       AoE whip crack around the Judge, damage + bleed (poison).
//     Jurisdiction: City-sized. 500 block radius. Stronger buffs inside.
//
//   PASSIVES:
//     - Strength II + Speed I + Resistance II (stronger constitution)
//     - +8 hearts (+16 HP)
//     - Authority Aura: mobs within 10 blocks get Weakness I passively, always.
//     - Judgment Gaze: enemies that attack the Judge briefly get Blindness 2s
//       (the indescribable aura — people subconsciously avoid their gaze)
//
//   ACTIVE — Judge's Gavel (item, 5 Verdicts, sneak+use to cycle):
//     Prohibition   (25 spirit, 20s CD): 12-block radius, all entities get
//       Slowness III + Weakness II + Mining Fatigue II for 8s.
//       Represents forbidding actions in an area.
//     Imprison      (22 spirit, 15s CD): Single target within 8 blocks.
//       Slowness V + Mining Fatigue III + Levitation 0 (nails feet) 6s.
//     Exile         (20 spirit, 10s CD): All entities within 10 blocks
//       hurled away — strong knockback + brief levitation.
//     Death         (30 spirit, 25s CD): Judge charges forward 4 blocks at
//       high speed (multiple teleport steps) and strikes the first entity
//       for 20 damage + Nausea 3s + Slowness II 5s.
//     Flog          (16 spirit, 8s CD): AoE 6 blocks, 8 damage + Poison I 4s.
//
//   Jurisdiction is now 500 blocks (up from Sheriff's 100).
//   Inside Jurisdiction: Strength II→III, Haste I→II, +regeneration effect.
//
// ============================================================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

export class JudgeSequence {
  static SEQUENCE_NUMBER = 6;
  static PATHWAY         = 'justiciar';

  // ── Passive config ─────────────────────────────────────────────────────────
  static EFFECT_DURATION     = 999999;
  static AURA_RANGE          = 10;
  static JURISDICTION_RADIUS = 500; // city-sized (up from 100)

  // ── Ability costs & cooldowns ──────────────────────────────────────────────
  static PROHIBITION_COST    = 25; static PROHIBITION_CD    = 400; // 20s
  static PROHIBITION_RANGE   = 12; static PROHIBITION_DUR   = 160; // 8s

  static IMPRISON_COST       = 22; static IMPRISON_CD       = 300; // 15s
  static IMPRISON_RANGE      = 8;  static IMPRISON_DUR      = 120; // 6s

  static EXILE_COST          = 20; static EXILE_CD          = 200; // 10s
  static EXILE_RANGE         = 10;

  static DEATH_COST          = 30; static DEATH_CD          = 500; // 25s
  static DEATH_DMG           = 20; static DEATH_RANGE       = 4;   // charge distance

  static FLOG_COST           = 16; static FLOG_CD           = 160; // 8s
  static FLOG_RANGE          = 6;  static FLOG_DMG          = 8;

  // ── Internal state ─────────────────────────────────────────────────────────
  static gavelModes          = new Map(); // player → mode index
  static cooldowns           = new Map(); // player → { prohibition, imprison, exile, death, flog }
  static _jurisdictionCentre = new Map(); // player → {x,y,z,dimensionId}
  static _jurisdictionActive = new Map(); // player → boolean
  static _passiveTick        = new Map(); // player → counter
  static _lastAttackedBy     = new Map(); // player → entity id (for gaze retaliation)

  static MODES = ['prohibition', 'imprison', 'exile', 'death', 'flog'];
  static MODE_LABELS = {
    prohibition: '§c[Prohibition]',
    imprison:    '§9[Imprison]',
    exile:       '§6[Exile]',
    death:       '§4[Death]',
    flog:        '§5[Flog]',
  };

  // ── Sequence check ─────────────────────────────────────────────────────────
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // ── Apply passives ─────────────────────────────────────────────────────────
  static applyPassiveAbilities(player) {
    if (!this.hasSequence(player)) return;

    // ── Physical: Strength II + Speed I + Resistance II ──────────────────────
    const inJuris = this._jurisdictionActive.get(player.name);

    const strAmp = inJuris ? 2 : 1; // Strength II base, III inside jurisdiction
    const str = player.getEffect('strength');
    if (!str || str.amplifier !== strAmp || str.duration < 100) {
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: strAmp, showParticles: true });
    }
    const spd = player.getEffect('speed');
    if (!spd || spd.amplifier !== 0 || spd.duration < 100) {
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: 0, showParticles: true });
    }
    const res = player.getEffect('resistance');
    if (!res || res.amplifier !== 1 || res.duration < 100) {
      player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: 1, showParticles: true });
    }
    const jmp = player.getEffect('jump_boost');
    if (!jmp || jmp.amplifier !== 0 || jmp.duration < 100) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: 0, showParticles: true });
    }

    // ── +8 hearts (+16 HP) ────────────────────────────────────────────────────
    this._applyHealthBonus(player, 16);

    // ── Jurisdiction tick ─────────────────────────────────────────────────────
    this._tickJurisdiction(player);

    // ── Cooldown ticks ────────────────────────────────────────────────────────
    this._tickCooldowns(player);

    // ── Authority Aura — persistent weakness on nearby mobs ──────────────────
    const tick = (this._passiveTick.get(player.name) ?? 0) + 1;
    this._passiveTick.set(player.name, tick);

    if (tick % 20 === 0) { // every ~4s
      try {
        const entities = player.dimension.getEntities({
          location: player.location,
          maxDistance: this.AURA_RANGE,
          excludeTypes: ['minecraft:player'],
        });
        for (const e of entities) {
          if (!e.isValid() || !this._isHostile(e)) continue;
          e.addEffect('weakness', 60, { amplifier: 0, showParticles: false });
        }
      } catch (_) {}
    }
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

  // ── Judgment Gaze — call from main.js entityHurt ──────────────────────────
  // When the Judge takes damage, briefly blind the attacker (they met their gaze)
  static onHurt(player, attacker) {
    if (!this.hasSequence(player) || !attacker?.isValid()) return;
    try {
      attacker.addEffect('blindness', 40, { amplifier: 0, showParticles: true });
      attacker.addEffect('weakness',  40, { amplifier: 0, showParticles: false });
    } catch (_) {}
  }

  // ── Jurisdiction ──────────────────────────────────────────────────────────
  static _tickJurisdiction(player) {
    const centre = this._jurisdictionCentre.get(player.name);
    if (!centre || centre.dimensionId !== player.dimension.id) {
      if (this._jurisdictionActive.get(player.name)) {
        this._jurisdictionActive.set(player.name, false);
        this._removeJurisdictionBuffs(player);
      }
      return;
    }
    const dx = player.location.x - centre.x;
    const dz = player.location.z - centre.z;
    const inside = Math.sqrt(dx*dx + dz*dz) <= this.JURISDICTION_RADIUS;
    const was    = this._jurisdictionActive.get(player.name) ?? false;

    if (inside && !was) {
      this._jurisdictionActive.set(player.name, true);
      player.sendMessage('§a⚖ §7Your Jurisdiction — authority greatly amplified');
    } else if (!inside && was) {
      this._jurisdictionActive.set(player.name, false);
      this._removeJurisdictionBuffs(player);
      player.sendMessage('§7You have left your Jurisdiction');
    }

    if (inside) {
      // Haste II inside jurisdiction
      const haste = player.getEffect('haste');
      if (!haste || haste.amplifier < 1 || haste.duration < 100) {
        player.addEffect('haste', this.EFFECT_DURATION, { amplifier: 1, showParticles: false });
      }
      // Regeneration I inside jurisdiction
      const regen = player.getEffect('regeneration');
      if (!regen || regen.duration < 100) {
        player.addEffect('regeneration', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
      }
    }
  }

  static _removeJurisdictionBuffs(player) {
    try {
      player.removeEffect('haste');
      player.removeEffect('regeneration');
    } catch (_) {}
  }

  // ── Cooldowns ─────────────────────────────────────────────────────────────
  static _tickCooldowns(player) {
    const cds = this.cooldowns.get(player.name);
    if (!cds) return;
    for (const k of Object.keys(cds)) { if (cds[k] > 0) cds[k]--; }
  }
  static _getCD(player, k)     { return this.cooldowns.get(player.name)?.[k] ?? 0; }
  static _setCD(player, k, v)  {
    if (!this.cooldowns.has(player.name)) {
      this.cooldowns.set(player.name, { prohibition:0, imprison:0, exile:0, death:0, flog:0 });
    }
    this.cooldowns.get(player.name)[k] = v;
  }

  // ── Mode cycle ────────────────────────────────────────────────────────────
  static cycleMode(player) {
    const next = ((this.gavelModes.get(player.name) ?? 0) + 1) % this.MODES.length;
    this.gavelModes.set(player.name, next);
    player.sendMessage(`§6Judge's Gavel — Verdict: ${this.MODE_LABELS[this.MODES[next]]}`);
  }

  // ── Verdict 1: Prohibition ─────────────────────────────────────────────────
  static useProhibition(player) {
    const cd = this._getCD(player, 'prohibition');
    if (cd > 0) { player.sendMessage(`§cProhibition on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.PROHIBITION_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.PROHIBITION_COST}`); return false;
    }

    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.PROHIBITION_RANGE,
        excludeTypes: ['minecraft:player'],
      });
      let count = 0;
      for (const e of entities) {
        if (!e.isValid()) continue;
        e.addEffect('slowness',      this.PROHIBITION_DUR, { amplifier: 2, showParticles: true });
        e.addEffect('weakness',      this.PROHIBITION_DUR, { amplifier: 1, showParticles: false });
        e.addEffect('mining_fatigue',this.PROHIBITION_DUR, { amplifier: 1, showParticles: false });
        count++;
      }
      // Visual: wave of particles outward
      const d = player.dimension;
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        for (let r = 2; r <= this.PROHIBITION_RANGE; r += 3) {
          try {
            d.spawnParticle('minecraft:basic_flame_particle', {
              x: player.location.x + Math.cos(angle) * r,
              y: player.location.y + 1,
              z: player.location.z + Math.sin(angle) * r,
            });
          } catch (_) {}
        }
      }
      player.sendMessage(`§c⚖ §e"This action is Prohibited here!" §7— §e${count} §7entities bound for §e8s`);
    } catch (_) {}
    this._setCD(player, 'prohibition', this.PROHIBITION_CD);
    return true;
  }

  // ── Verdict 2: Imprison ────────────────────────────────────────────────────
  static useImprison(player) {
    const cd = this._getCD(player, 'imprison');
    if (cd > 0) { player.sendMessage(`§cImprison on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.IMPRISON_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.IMPRISON_COST}`); return false;
    }

    const entities = player.dimension.getEntities({
      location: player.location, maxDistance: this.IMPRISON_RANGE,
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
      SpiritSystem.addSpirit(player, this.IMPRISON_COST);
      player.sendMessage('§7No target in range to Imprison');
      return false;
    }

    try {
      // Extreme slowness + fatigue = total immobilisation
      target.addEffect('slowness',      this.IMPRISON_DUR, { amplifier: 4, showParticles: true });
      target.addEffect('mining_fatigue',this.IMPRISON_DUR, { amplifier: 2, showParticles: false });
      target.addEffect('weakness',      this.IMPRISON_DUR, { amplifier: 1, showParticles: false });
      // Particle cage
      for (let y = 0; y < 3; y++) {
        for (let i = 0; i < 8; i++) {
          const a = (i/8)*Math.PI*2;
          try {
            target.dimension.spawnParticle('minecraft:basic_smoke_particle', {
              x: target.location.x + Math.cos(a)*1.2,
              y: target.location.y + y,
              z: target.location.z + Math.sin(a)*1.2,
            });
          } catch (_) {}
        }
      }
    } catch (_) {}
    player.sendMessage(`§9⚖ §e"Imprison!" §7— target frozen for §e6s`);
    this._setCD(player, 'imprison', this.IMPRISON_CD);
    return true;
  }

  // ── Verdict 3: Exile ───────────────────────────────────────────────────────
  static useExile(player) {
    const cd = this._getCD(player, 'exile');
    if (cd > 0) { player.sendMessage(`§cExile on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.EXILE_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.EXILE_COST}`); return false;
    }

    try {
      const entities = player.dimension.getEntities({
        location: player.location, maxDistance: this.EXILE_RANGE,
        excludeTypes: ['minecraft:player'],
      });
      let count = 0;
      for (const e of entities) {
        if (!e.isValid()) continue;
        const dx = e.location.x - player.location.x;
        const dz = e.location.z - player.location.z;
        const len = Math.sqrt(dx*dx + dz*dz) || 1;
        try {
          // Strong outward knockback
          e.applyKnockback(dx/len, dz/len, 3.0, 0.8);
          // Brief levitation to sell the "hurled away" feel
          e.addEffect('levitation', 10, { amplifier: 1, showParticles: false });
        } catch (_) {}
        count++;
      }
      player.sendMessage(`§6⚖ §e"Exile!" §7— §e${count} §7entities hurled away`);
    } catch (_) {}
    this._setCD(player, 'exile', this.EXILE_CD);
    return true;
  }

  // ── Verdict 4: Death ──────────────────────────────────────────────────────
  // Judge charges forward, striking the first entity for massive damage.
  static useDeath(player) {
    const cd = this._getCD(player, 'death');
    if (cd > 0) { player.sendMessage(`§cDeath on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.DEATH_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.DEATH_COST}`); return false;
    }

    const dir   = player.getViewDirection();
    const start = { x: player.location.x, y: player.location.y, z: player.location.z };
    let   hit   = null;

    // Teleport forward in steps, check for entity each step
    // Spread over several timeouts to create the "charging" feel
    player.sendMessage('§4⚖ §e"Death!" §7— charging...');

    let step = 0;
    const doStep = () => {
      if (step >= this.DEATH_RANGE * 2) { // 0.5-block steps
        if (!hit) player.sendMessage('§7No target struck');
        return;
      }
      step++;
      const dist = step * 0.5;
      const newPos = {
        x: start.x + dir.x * dist,
        y: start.y,
        z: start.z + dir.z * dist,
      };

      // Check for entities near this step position
      if (!hit) {
        try {
          const nearby = player.dimension.getEntities({
            location: newPos, maxDistance: 1.5,
            excludeTypes: ['minecraft:player'],
          });
          for (const e of nearby) {
            if (e.isValid()) { hit = e; break; }
          }
        } catch (_) {}
      }

      // Particle trail
      try {
        player.dimension.spawnParticle('minecraft:basic_crit_particle', newPos);
      } catch (_) {}

      // Teleport player to step position
      try { player.teleport(newPos); } catch (_) {}

      if (hit) {
        // Deliver the blow
        try {
          hit.applyDamage(this.DEATH_DMG);
          hit.addEffect('nausea',    60,  { amplifier: 0, showParticles: true });
          hit.addEffect('slowness', 100,  { amplifier: 1, showParticles: false });
          hit.addEffect('weakness',  80,  { amplifier: 1, showParticles: false });
        } catch (_) {}
        player.sendMessage(`§4💀 §eTarget struck — ${this.DEATH_DMG} devastating damage!`);
        return; // stop stepping
      }

      system.runTimeout(doStep, 1);
    };

    system.runTimeout(doStep, 1);
    this._setCD(player, 'death', this.DEATH_CD);
    return true;
  }

  // ── Verdict 5: Flog ───────────────────────────────────────────────────────
  static useFlog(player) {
    const cd = this._getCD(player, 'flog');
    if (cd > 0) { player.sendMessage(`§cFlog on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.FLOG_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.FLOG_COST}`); return false;
    }

    try {
      const entities = player.dimension.getEntities({
        location: player.location, maxDistance: this.FLOG_RANGE,
        excludeTypes: ['minecraft:player'],
      });
      let count = 0;
      for (const e of entities) {
        if (!e.isValid()) continue;
        try {
          e.applyDamage(this.FLOG_DMG);
          e.addEffect('poison', 80, { amplifier: 0, showParticles: true }); // laceration bleed
          e.addEffect('slowness', 40, { amplifier: 0, showParticles: false });
        } catch (_) {}
        // Crack particles
        try {
          e.dimension.spawnParticle('minecraft:critical_hit_emitter', {
            x: e.location.x, y: e.location.y + 1, z: e.location.z
          });
        } catch (_) {}
        count++;
      }
      player.sendMessage(`§5⚖ §e"Flog!" §7— §e${count} §7targets lashed and bleeding`);
    } catch (_) {}
    this._setCD(player, 'flog', this.FLOG_CD);
    return true;
  }

  // ── Jurisdiction Mark — overrides Sheriff's, larger radius ───────────────
  static useJurisdictionMark(player) {
    // Using same pattern as Sheriff but with Judge's larger radius
    this._jurisdictionCentre.set(player.name, {
      x: player.location.x, y: player.location.y, z: player.location.z,
      dimensionId: player.dimension.id,
    });
    this._jurisdictionActive.set(player.name, true);
    try {
      for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2;
        player.dimension.spawnParticle('minecraft:basic_flame_particle', {
          x: player.location.x + Math.cos(a)*2,
          y: player.location.y,
          z: player.location.z + Math.sin(a)*2,
        });
      }
    } catch (_) {}
    player.sendMessage(`§a⚖ §eJurisdiction established! §7Radius: §e${this.JURISDICTION_RADIUS} blocks §7(city-scale)`);
    player.sendMessage(`§7Inside: §eStrength III §7+ §eHaste II §7+ §eRegeneration I`);
  }

  // ── Item use dispatcher ───────────────────────────────────────────────────
  static useGavel(player, isSneaking) {
    if (isSneaking) { this.cycleMode(player); return true; }
    const mode = this.MODES[this.gavelModes.get(player.name) ?? 0];
    if (mode === 'prohibition') return this.useProhibition(player);
    if (mode === 'imprison')    return this.useImprison(player);
    if (mode === 'exile')       return this.useExile(player);
    if (mode === 'death')       return this.useDeath(player);
    if (mode === 'flog')        return this.useFlog(player);
    return false;
  }

  // ── Status display ────────────────────────────────────────────────────────
  static getStatusText(player) {
    const modeIdx = this.gavelModes.get(player.name) ?? 0;
    const label   = this.MODE_LABELS[this.MODES[modeIdx]];
    const inJ     = this._jurisdictionActive.get(player.name) ? '§aIn Jurisdiction' : '§7No Jurisdiction';
    return `§6Judge's Gavel §7| ${label} | ${inJ}`;
  }

  static _isHostile(entity) {
    const h = [
      'minecraft:zombie','minecraft:skeleton','minecraft:creeper','minecraft:spider',
      'minecraft:cave_spider','minecraft:enderman','minecraft:witch','minecraft:pillager',
      'minecraft:vindicator','minecraft:evoker','minecraft:ravager','minecraft:blaze',
      'minecraft:ghast','minecraft:wither_skeleton','minecraft:piglin_brute',
      'minecraft:hoglin','minecraft:zoglin','minecraft:drowned','minecraft:husk',
      'minecraft:stray','minecraft:phantom','minecraft:guardian','minecraft:elder_guardian',
      'minecraft:shulker','minecraft:silverfish','minecraft:endermite','minecraft:slime',
      'minecraft:magma_cube','minecraft:warden',
    ];
    return h.includes(entity.typeId);
  }
}
