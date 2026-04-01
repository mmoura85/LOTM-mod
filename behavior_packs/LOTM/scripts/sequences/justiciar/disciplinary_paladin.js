// ============================================================================
// JUSTICIAR PATHWAY — SEQUENCE 5: DISCIPLINARY PALADIN
// disciplinary_paladin.js → scripts/sequences/justiciar/disciplinary_paladin.js
//
// LORE:
//   Physical: Sufficiently strong AND sufficiently robust — notable step up.
//   Enhanced Mental: Mystical self-restraint — expert at resisting interrogation.
//     (Implemented as passive Resistance to status effects / shorter duration)
//   Punishment: Select a target — emit dawn-like glow, enhanced power vs that target.
//     Can punish those who: attack you, violate laws, shouldn't affect reality, etc.
//     Punishment can restrict targets with invisible shackles.
//   Authority (strengthened): Surrounding beings feel inexplicable horror.
//     Targets slow unconsciously, want to prostrate and obey.
//   Prohibition (strengthened from Judge): Stackable — each stack adds more restriction.
//     If target violates the rule, Paladin gets guaranteed-hit enhancement.
//   Death (strengthened): Can target specific body location — withers flesh at wound.
//
// STAT PROGRESSION:
//   Strength III, Speed II, Resistance II, Jump Boost II, +10 hearts (+20 HP)
//   (Twilight Giant Seq 9 Warrior has Strength I — Paladin at Seq 5 has III,
//    but Twilight reaches Strength III at Seq 8 Pugilist and stacks beyond that.
//    Justiciar is authority/law — physical is secondary but still formidable.)
//
// ACTIVE — Paladin's Seal (item, 5 modes, sneak+use to cycle):
//   Mode 1 — Punishment (20 spirit, 8s CD):
//     Mark nearest entity in 10 blocks as Punishment target.
//     While marked (30s): player gets Strength I bonus vs this target (stacks),
//     target gets Glowing + periodic Slowness I (shackles).
//     Emits golden particles — "dawn-like glow".
//   Mode 2 — Prohibition Stack (18 spirit, 6s CD):
//     Enhanced Prohibition — applies to single target in 10 blocks.
//     Stacks up to 3: each stack adds Slowness I, Weakness I.
//     If target is a punished target: guaranteed-hit enhancement (Fire Aspect).
//   Mode 3 — Death (Targeted) (28 spirit, 20s CD):
//     Like Judge's Death but aims at a specific "wound" — applies Wither II
//     at impact point (flesh withers). 18 damage + Wither II 4s + Slowness III 6s.
//   Mode 4 — Authority Command (15 spirit, 5s CD):
//     Horror aura — all entities in 12 blocks get Slowness II + Weakness II 6s
//     + Mining Fatigue I. Particle pulse outward.
//   Mode 5 — Jurisdiction Mark (25 spirit, 60s CD):
//     Sets Jurisdiction (500 blocks, city-scale, inherited from Judge).
//
// ============================================================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

export class DisciplinaryPaladinSequence {
  static SEQUENCE_NUMBER = 5;
  static PATHWAY         = 'justiciar';
  static EFFECT_DURATION = 999999;

  // ── Punishment config ──────────────────────────────────────────────────────
  static PUNISHMENT_COST     = 20;
  static PUNISHMENT_CD       = 160;  // 8s
  static PUNISHMENT_RANGE    = 10;
  static PUNISHMENT_DURATION = 600;  // 30s in ticks

  // ── Ability costs ──────────────────────────────────────────────────────────
  static PROHIBITION_COST    = 18;  static PROHIBITION_CD    = 120; // 6s
  static DEATH_COST          = 28;  static DEATH_CD          = 400; // 20s
  static DEATH_DMG           = 18;
  static AUTHORITY_COST      = 15;  static AUTHORITY_CD      = 100; // 5s
  static AUTHORITY_RANGE     = 12;  static AUTHORITY_DUR     = 120; // 6s
  static JURISDICTION_COST   = 25;  static JURISDICTION_CD   = 1200; // 60s
  static JURISDICTION_RADIUS = 500;

  // ── Internal state ─────────────────────────────────────────────────────────
  static sealModes           = new Map(); // player → mode index
  static cooldowns           = new Map(); // player → { punishment, prohibition, death, authority, jurisdiction }
  static punishmentTargets   = new Map(); // player name → { entityId, ticksRemaining, stacks }
  static prohibitionStacks   = new Map(); // entityId → stack count
  static _jurisdictionCentre = new Map();
  static _jurisdictionActive = new Map();
  static _passiveTick        = new Map();

  static MODES = ['punishment', 'prohibition', 'death', 'authority_command', 'jurisdiction'];
  static MODE_LABELS = {
    punishment:        '§e[Punishment]',
    prohibition:       '§c[Prohibition Stack]',
    death:             '§4[Death — Targeted]',
    authority_command: '§5[Authority Command]',
    jurisdiction:      '§a[Jurisdiction Mark]',
  };

  // ── Sequence check ─────────────────────────────────────────────────────────
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // ── Apply passives ─────────────────────────────────────────────────────────
  static applyPassiveAbilities(player) {
    if (!this.hasSequence(player)) return;

    const inJuris = this._jurisdictionActive.get(player.name);

    // ── Strength III (IV inside jurisdiction), Speed II, Resistance II ────────
    const strAmp = inJuris ? 3 : 2;
    const str = player.getEffect('strength');
    if (!str || str.amplifier !== strAmp || str.duration < 100) {
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: strAmp, showParticles: true });
    }
    const spd = player.getEffect('speed');
    if (!spd || spd.amplifier !== 1 || spd.duration < 100) {
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: 1, showParticles: true });
    }
    const res = player.getEffect('resistance');
    if (!res || res.amplifier !== 1 || res.duration < 100) {
      player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: 1, showParticles: true });
    }
    // ── Jump Boost II ─────────────────────────────────────────────────────────
    const jmp = player.getEffect('jump_boost');
    if (!jmp || jmp.amplifier !== 1 || jmp.duration < 100) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: 1, showParticles: true });
    }

    // Night Vision (permanent)
    const nightVision = player.getEffect('night_vision');
    if (!nightVision || nightVision.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }

    // ── Enhanced Mental: resistance to debuffs — clear short Slowness/Weakness ─
    // "Expert at resisting interrogation and prying" — remove low-amplifier debuffs
    try {
      const slow = player.getEffect('slowness');
      if (slow && slow.amplifier <= 1 && slow.duration < 60) player.removeEffect('slowness');
      const weak = player.getEffect('weakness');
      if (weak && weak.amplifier <= 0 && weak.duration < 60) player.removeEffect('weakness');
      const naus = player.getEffect('nausea');
      if (naus && naus.duration < 40) player.removeEffect('nausea');
    } catch (_) {}

    // ── +10 hearts (+20 HP) ───────────────────────────────────────────────────
    this._applyHealthBonus(player, 20);

    // ── Jurisdiction tick ─────────────────────────────────────────────────────
    this._tickJurisdiction(player);

    // ── Punishment tick — maintain shackles on marked target ─────────────────
    this._tickPunishment(player);

    // ── Authority Aura — passive horror on nearby mobs ───────────────────────
    const tick = (this._passiveTick.get(player.name) ?? 0) + 1;
    this._passiveTick.set(player.name, tick);
    if (tick % 15 === 0) { // every ~3s
      try {
        const entities = player.dimension.getEntities({
          location: player.location, maxDistance: 8,
          excludeTypes: ['minecraft:player'],
        });
        for (const e of entities) {
          if (!e.isValid() || !this._isHostile(e)) continue;
          // Horror aura — unconscious desire to prostrate
          e.addEffect('slowness', 30, { amplifier: 0, showParticles: false });
          e.addEffect('weakness', 30, { amplifier: 0, showParticles: false });
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

  // ── Punishment tick ────────────────────────────────────────────────────────
  static _tickPunishment(player) {
    const pt = this.punishmentTargets.get(player.name);
    if (!pt) return;

    pt.ticksRemaining--;
    if (pt.ticksRemaining <= 0) {
      this.punishmentTargets.delete(player.name);
      player.sendMessage('§7Punishment expired');
      return;
    }

    // Every 20 ticks (~4s on 4-tick loop = 80 real ticks) apply shackle effects
    if (pt.ticksRemaining % 20 !== 0) return;

    try {
      const entities = player.dimension.getEntities({
        location: player.location, maxDistance: 50,
        excludeTypes: ['minecraft:player'],
      });
      const target = entities.find(e => e.id === pt.entityId && e.isValid());
      if (!target) return;

      // Shackle — invisible restriction on movement
      target.addEffect('slowness', 60, { amplifier: 0, showParticles: false });
      // Dawn-like glow
      target.addEffect('glowing',  60, { amplifier: 0, showParticles: false });

      // Golden particles around target — dawn glow
      try {
        for (let i = 0; i < 3; i++) {
          target.dimension.spawnParticle('minecraft:basic_flame_particle', {
            x: target.location.x + (Math.random()-0.5)*0.8,
            y: target.location.y + 1 + Math.random(),
            z: target.location.z + (Math.random()-0.5)*0.8,
          });
        }
      } catch (_) {}
    } catch (_) {}
  }

  // ── Active 1: Punishment ──────────────────────────────────────────────────
  static usePunishment(player) {
    const cd = this._getCD(player, 'punishment');
    if (cd > 0) { player.sendMessage(`§cPunishment on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.PUNISHMENT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.PUNISHMENT_COST}`); return false;
    }

    const entities = player.dimension.getEntities({
      location: player.location, maxDistance: this.PUNISHMENT_RANGE,
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
      SpiritSystem.addSpirit(player, this.PUNISHMENT_COST);
      player.sendMessage('§7No target in range to Punish');
      return false;
    }

    this.punishmentTargets.set(player.name, {
      entityId: target.id,
      ticksRemaining: this.PUNISHMENT_DURATION,
      stacks: 1,
    });

    // Immediate golden flash — dawn-like glow begins
    try {
      for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2;
        target.dimension.spawnParticle('minecraft:basic_flame_particle', {
          x: target.location.x + Math.cos(a)*1.5,
          y: target.location.y + 1,
          z: target.location.z + Math.sin(a)*1.5,
        });
      }
    } catch (_) {}

    player.sendMessage(`§e☀ §6Punishment §7declared — target is §e${Math.ceil(this.PUNISHMENT_DURATION/20)}s §7under Judgement`);
    this._setCD(player, 'punishment', this.PUNISHMENT_CD);
    return true;
  }

  // ── Active 2: Prohibition Stack ────────────────────────────────────────────
  static useProhibitionStack(player) {
    const cd = this._getCD(player, 'prohibition');
    if (cd > 0) { player.sendMessage(`§cProhibition on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.PROHIBITION_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.PROHIBITION_COST}`); return false;
    }

    const entities = player.dimension.getEntities({
      location: player.location, maxDistance: 10,
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
      SpiritSystem.addSpirit(player, this.PROHIBITION_COST);
      player.sendMessage('§7No target in range for Prohibition');
      return false;
    }

    const stacks = Math.min(3, (this.prohibitionStacks.get(target.id) ?? 0) + 1);
    this.prohibitionStacks.set(target.id, stacks);

    // Each stack adds more restriction
    const slowAmp = stacks;      // Slowness I/II/III
    const weakAmp = stacks - 1;  // Weakness 0/I/II
    try {
      target.addEffect('slowness',      200, { amplifier: slowAmp, showParticles: true });
      target.addEffect('weakness',      200, { amplifier: weakAmp, showParticles: false });
      target.addEffect('mining_fatigue',200, { amplifier: stacks - 1, showParticles: false });
    } catch (_) {}

    // Guaranteed-hit enhancement if target is also Punished
    const pt = this.punishmentTargets.get(player.name);
    if (pt && pt.entityId === target.id) {
      try {
        // Fire Aspect effect — represents the "guaranteed hit with enhancement"
        target.addEffect('weakness', 200, { amplifier: 2, showParticles: true });
        player.sendMessage(`§e⚡ §6Punishment + Prohibition! §eGuaranteed enhancement active — §cstack ${stacks}/3`);
      } catch (_) {}
    } else {
      player.sendMessage(`§c⚖ §7Prohibition stack §e${stacks}/3 §7applied`);
    }

    this._setCD(player, 'prohibition', this.PROHIBITION_CD);
    return true;
  }

  // ── Active 3: Death (Targeted) ─────────────────────────────────────────────
  static useDeathTargeted(player) {
    const cd = this._getCD(player, 'death');
    if (cd > 0) { player.sendMessage(`§cDeath on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.DEATH_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.DEATH_COST}`); return false;
    }

    // Hitscan — finds target via raycast to target specific "location"
    try {
      const eyePos = { x: player.location.x, y: player.location.y+1.6, z: player.location.z };
      const dir    = player.getViewDirection();
      const result = player.dimension.getEntitiesFromRay(eyePos, dir, {
        maxDistance: 12, excludeTypes: ['minecraft:player'],
      });
      const target = result?.[0]?.entity;

      if (!target?.isValid()) {
        SpiritSystem.addSpirit(player, this.DEATH_COST);
        player.sendMessage('§7No target in sight for Death');
        return false;
      }

      // Flesh withers at targeted wound — Wither II is the "withering flesh" effect
      target.applyDamage(this.DEATH_DMG);
      target.addEffect('wither',  80,  { amplifier: 1, showParticles: true });  // flesh withers
      target.addEffect('slowness',120, { amplifier: 2, showParticles: false }); // wound opens to bone
      target.addEffect('weakness', 80, { amplifier: 1, showParticles: false });

      // Dark particle at impact — flesh withering
      for (let i = 0; i < 6; i++) {
        try {
          target.dimension.spawnParticle('minecraft:basic_smoke_particle', {
            x: target.location.x + (Math.random()-0.5)*0.5,
            y: target.location.y + 1,
            z: target.location.z + (Math.random()-0.5)*0.5,
          });
        } catch (_) {}
      }
      player.sendMessage(`§4💀 §e"Death!" §7— §4flesh withers§7, wound tears open, ${this.DEATH_DMG} damage`);
    } catch (_) {
      SpiritSystem.addSpirit(player, this.DEATH_COST);
      return false;
    }
    this._setCD(player, 'death', this.DEATH_CD);
    return true;
  }

  // ── Active 4: Authority Command (mass horror) ──────────────────────────────
  static useAuthorityCommand(player) {
    const cd = this._getCD(player, 'authority');
    if (cd > 0) { player.sendMessage(`§cAuthority Command on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.AUTHORITY_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.AUTHORITY_COST}`); return false;
    }

    try {
      const entities = player.dimension.getEntities({
        location: player.location, maxDistance: this.AUTHORITY_RANGE,
        excludeTypes: ['minecraft:player'],
      });
      let count = 0;
      for (const e of entities) {
        if (!e.isValid()) continue;
        e.addEffect('slowness',       this.AUTHORITY_DUR, { amplifier: 1, showParticles: true });
        e.addEffect('weakness',       this.AUTHORITY_DUR, { amplifier: 1, showParticles: false });
        e.addEffect('mining_fatigue', this.AUTHORITY_DUR, { amplifier: 0, showParticles: false });
        count++;
      }
      // Outward pulse of authority
      for (let i = 0; i < 16; i++) {
        const a = (i/16)*Math.PI*2;
        try {
          player.dimension.spawnParticle('minecraft:basic_flame_particle', {
            x: player.location.x + Math.cos(a)*this.AUTHORITY_RANGE*0.5,
            y: player.location.y + 1,
            z: player.location.z + Math.sin(a)*this.AUTHORITY_RANGE*0.5,
          });
        } catch (_) {}
      }
      player.sendMessage(`§5⚖ §7Authority — §e${count} §7beings feel inexplicable horror, prostrate and slow`);
    } catch (_) {}
    this._setCD(player, 'authority', this.AUTHORITY_CD);
    return true;
  }

  // ── Active 5: Jurisdiction Mark ────────────────────────────────────────────
  static useJurisdictionMark(player) {
    const cd = this._getCD(player, 'jurisdiction');
    if (cd > 0) { player.sendMessage(`§cJurisdiction on cooldown — §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.JURISDICTION_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.JURISDICTION_COST}`); return false;
    }
    this._jurisdictionCentre.set(player.name, {
      x: player.location.x, y: player.location.y, z: player.location.z,
      dimensionId: player.dimension.id,
    });
    this._jurisdictionActive.set(player.name, true);
    try {
      for (let i = 0; i < 12; i++) {
        const a = (i/12)*Math.PI*2;
        player.dimension.spawnParticle('minecraft:basic_flame_particle', {
          x: player.location.x + Math.cos(a)*2,
          y: player.location.y,
          z: player.location.z + Math.sin(a)*2,
        });
      }
    } catch (_) {}
    player.sendMessage(`§a⚖ §eJurisdiction established! §7${this.JURISDICTION_RADIUS}-block radius`);
    player.sendMessage(`§7Inside: §eStrength IV §7+ §eHaste II §7+ §eRegeneration I`);
    this._setCD(player, 'jurisdiction', this.JURISDICTION_CD);
    return true;
  }

  // ── Jurisdiction buff tick ────────────────────────────────────────────────
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
      player.sendMessage('§a⚖ §7Entering Jurisdiction — Strength IV active');
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

  // ── Cooldown helpers ───────────────────────────────────────────────────────
  static _tickCooldowns(player) {
    const cds = this.cooldowns.get(player.name);
    if (!cds) return;
    for (const k of Object.keys(cds)) { if (cds[k] > 0) cds[k]--; }
  }
  static _getCD(player, k)    { return this.cooldowns.get(player.name)?.[k] ?? 0; }
  static _setCD(player, k, v) {
    if (!this.cooldowns.has(player.name)) {
      this.cooldowns.set(player.name, { punishment:0, prohibition:0, death:0, authority:0, jurisdiction:0 });
    }
    this.cooldowns.get(player.name)[k] = v;
  }

  // ── Item dispatcher ────────────────────────────────────────────────────────
  static useSeal(player, isSneaking) {
    if (isSneaking) {
      const next = ((this.sealModes.get(player.name) ?? 0) + 1) % this.MODES.length;
      this.sealModes.set(player.name, next);
      player.sendMessage(`§6Paladin's Seal — Mode: ${this.MODE_LABELS[this.MODES[next]]}`);
      return true;
    }
    const mode = this.MODES[this.sealModes.get(player.name) ?? 0];
    if (mode === 'punishment')        return this.usePunishment(player);
    if (mode === 'prohibition')       return this.useProhibitionStack(player);
    if (mode === 'death')             return this.useDeathTargeted(player);
    if (mode === 'authority_command') return this.useAuthorityCommand(player);
    if (mode === 'jurisdiction')      return this.useJurisdictionMark(player);
    return false;
  }

  static getStatusText(player) {
    const modeIdx = this.sealModes.get(player.name) ?? 0;
    const label   = this.MODE_LABELS[this.MODES[modeIdx]];
    const pt      = this.punishmentTargets.get(player.name);
    const punish  = pt ? `§e☀ ${Math.ceil(pt.ticksRemaining/20)}s` : '§7No target';
    const inJ     = this._jurisdictionActive.get(player.name) ? '§aIn Jurisdiction' : '';
    return `§6Paladin's Seal §7| ${label} | ${punish}${inJ ? ' | ' + inJ : ''}`;
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
