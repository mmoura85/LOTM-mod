// ============================================================================
// JUSTICIAR PATHWAY — SEQUENCE 7: INTERROGATOR
// interrogator.js → behavior_packs/LOTM/scripts/sequences/justiciar/interrogator.js
//
// LORE:
//   Physical Enhancement: Body improves to a certain extent.
//   Illusory Torture Devices: Summon branding irons in hand — damage Spirit
//     Bodies on contact. Requires physical contact, cannot be used at range.
//   Psychic Lashing: Coat weapons in illusory lightning — makes cold weapons
//     affect Spirit Body-type creatures.
//   Psychic Piercing: Bolts of lightning shoot from the eyes at 5m range.
//     Ignores physical body, pierces Soul, attacks Spirit Body directly.
//     Causes unbearable pain. NOT a mind-affecting ability — targets the Soul.
//   Whip of Pain: Attacks the mind directly — electric current through the brain,
//     barbed whip lashing the Soul. Target trembles, knees go weak, must confess,
//     dares not lie.
//   Demolition Proficiency: Explosion/demolition expert.
//   Weapon Proficiency: Proficient in a variety of weapons (strengthened).
//
// IMPLEMENTATION:
//
//   PASSIVES:
//     - Strength I + Speed I + Resistance I (carried from Sheriff)
//     - +6 hearts total (+12 HP) — physical constitution improved further
//     - Psychic Aura (passive): nearby hostile mobs occasionally get
//       Mining Fatigue (spirit suppression) + Weakness
//     - Weapon Proficiency: +3 bonus melee damage (strengthened from +2)
//
//   ACTIVE — Interrogator's Brand (item, 4 modes, sneak+use to cycle):
//     Mode 1 — Psychic Piercing (14 spirit, 3s CD):
//       Hitscan ray 5 blocks forward. On hit: target takes 10 damage
//       + Nausea 4s + Slowness II 3s. Particles: lightning bolt from eyes.
//       The "unbearable pain" from Soul attack — ignores armor conceptually
//       (we use applyDamage with no source, bypasses armor calculation).
//     Mode 2 — Whip of Pain (18 spirit, 10s CD):
//       Target nearest entity within 6 blocks. Weakness II 8s + Slowness III 6s
//       + Nausea 5s + Mining Fatigue 5s. Sends message "your mind fractures".
//       The confession/trembling effect.
//     Mode 3 — Illusory Brand (10 spirit, 2s CD):
//       Melee range (3 blocks). Target takes 8 spirit-type damage + Weakness I 5s.
//       Represents the branding iron damaging the Spirit Body on contact.
//     Mode 4 — Psychic Lashing (8 spirit, 20s CD, toggle):
//       Toggles a buff that makes next 3 melee swings deal +6 bonus damage
//       and apply Nausea 2s (representing the lightning coating).
//       Visual: brief lightning particle on player when toggled on.
//
// ============================================================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

export class InterrogatorSequence {
  static SEQUENCE_NUMBER = 7;
  static PATHWAY         = 'justiciar';

  // ── Passive config ─────────────────────────────────────────────────────────
  static EFFECT_DURATION = 999999;

  // ── Ability costs & cooldowns ──────────────────────────────────────────────
  static PSYCHIC_PIERCING_COST  = 14;
  static PSYCHIC_PIERCING_CD    = 60;   // 3s
  static PSYCHIC_PIERCING_RANGE = 5;    // blocks — lore says 5m
  static PSYCHIC_PIERCING_DMG   = 10;

  static WHIP_COST   = 18;
  static WHIP_CD     = 200;  // 10s
  static WHIP_RANGE  = 6;    // blocks — must be close enough to "feel it"

  static BRAND_COST  = 10;
  static BRAND_CD    = 40;   // 2s — melee pace
  static BRAND_RANGE = 3;    // blocks — must be physical contact range
  static BRAND_DMG   = 8;

  static LASHING_COST    = 8;
  static LASHING_CD      = 400; // 20s
  static LASHING_CHARGES = 3;   // swings before expiry

  // ── Internal state ─────────────────────────────────────────────────────────
  static brandModes      = new Map(); // player name → mode index (0-3)
  static cooldowns       = new Map(); // player name → { piercing, whip, brand, lashing }
  static lashingActive   = new Map(); // player name → charges remaining
  static _passiveTick    = new Map(); // player name → tick counter

  static MODES = ['psychic_piercing', 'whip_of_pain', 'illusory_brand', 'psychic_lashing'];
  static MODE_LABELS = {
    psychic_piercing: '§b[Psychic Piercing]',
    whip_of_pain:     '§5[Whip of Pain]',
    illusory_brand:   '§c[Illusory Brand]',
    psychic_lashing:  '§e[Psychic Lashing]',
  };

  // ── Sequence check ─────────────────────────────────────────────────────────
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // ── Apply passives ─────────────────────────────────────────────────────────
  static applyPassiveAbilities(player) {
    if (!this.hasSequence(player)) return;

    // ── Physical: Strength I + Speed I + Resistance I ────────────────────────
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

    // ── Jump Boost I — athletic pursuit and rapid positioning ───────────────
    const jmp = player.getEffect('jump_boost');
    if (!jmp || jmp.amplifier !== 0 || jmp.duration < 100) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: 0, showParticles: true });
    }

    // ── +6 hearts (+12 HP) ───────────────────────────────────────────────────
    this._applyHealthBonus(player, 12);

    // ── Cooldown ticks ────────────────────────────────────────────────────────
    this._tickCooldowns(player);

    // ── Psychic Aura: every ~8s, suppress nearby hostiles ───────────────────
    const tick = (this._passiveTick.get(player.name) ?? 0) + 1;
    this._passiveTick.set(player.name, tick);
    if (tick % 40 === 0) {
      try {
        const entities = player.dimension.getEntities({
          location: player.location,
          maxDistance: 8,
          excludeTypes: ['minecraft:player'],
        });
        for (const e of entities) {
          if (!e.isValid() || !this._isHostile(e)) continue;
          if (Math.random() < 0.3) {
            e.addEffect('mining_fatigue', 40, { amplifier: 0, showParticles: false });
            e.addEffect('weakness', 40, { amplifier: 0, showParticles: false });
          }
        }
      } catch (_) {}
    }
  }

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

  // ── Cooldown helpers ───────────────────────────────────────────────────────
  static _tickCooldowns(player) {
    const cds = this.cooldowns.get(player.name);
    if (!cds) return;
    for (const k of Object.keys(cds)) {
      if (cds[k] > 0) cds[k]--;
    }
  }

  static _getCD(player, key) {
    return this.cooldowns.get(player.name)?.[key] ?? 0;
  }

  static _setCD(player, key, value) {
    if (!this.cooldowns.has(player.name)) {
      this.cooldowns.set(player.name, { piercing: 0, whip: 0, brand: 0, lashing: 0 });
    }
    this.cooldowns.get(player.name)[key] = value;
  }

  // ── Brand mode cycle (sneak+use) ──────────────────────────────────────────
  static cycleMode(player) {
    const cur  = this.brandModes.get(player.name) ?? 0;
    const next = (cur + 1) % this.MODES.length;
    this.brandModes.set(player.name, next);
    const charges = this.lashingActive.get(player.name) ?? 0;
    const lashSuffix = this.MODES[next] === 'psychic_lashing' && charges > 0
      ? ` §e(${charges} charges active)` : '';
    player.sendMessage(`§6Interrogator's Brand — Mode: ${this.MODE_LABELS[this.MODES[next]]}${lashSuffix}`);
  }

  // ── Active 1: Psychic Piercing ─────────────────────────────────────────────
  static usePsychicPiercing(player) {
    const cd = this._getCD(player, 'piercing');
    if (cd > 0) {
      player.sendMessage(`§cPsychic Piercing on cooldown — §e${Math.ceil(cd/20)}s`);
      return false;
    }
    if (!SpiritSystem.consumeSpirit(player, this.PSYCHIC_PIERCING_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.PSYCHIC_PIERCING_COST}`);
      return false;
    }

    // Hitscan ray: 5 blocks forward from eye position
    const hit = this._performRaycast(player, this.PSYCHIC_PIERCING_RANGE);

    // Lightning trail from player eyes
    try {
      const eyePos = { x: player.location.x, y: player.location.y + 1.6, z: player.location.z };
      const dir    = player.getViewDirection();
      for (let i = 1; i <= 5; i++) {
        player.dimension.spawnParticle('minecraft:lightning_field', {
          x: eyePos.x + dir.x * i,
          y: eyePos.y + dir.y * i,
          z: eyePos.z + dir.z * i,
        });
      }
    } catch (_) {}

    if (!hit) {
      player.sendMessage('§b✦ §7Psychic Piercing — nothing in range');
      this._setCD(player, 'piercing', this.PSYCHIC_PIERCING_CD);
      return true;
    }

    // Damage bypasses armor (applyDamage with no cause — spirit-body attack)
    try { hit.applyDamage(this.PSYCHIC_PIERCING_DMG); } catch (_) {}
    // Unbearable pain effects
    try {
      hit.addEffect('nausea',    80,  { amplifier: 0, showParticles: true });
      hit.addEffect('slowness',  60,  { amplifier: 1, showParticles: false });
      hit.addEffect('weakness',  60,  { amplifier: 0, showParticles: false });
    } catch (_) {}

    player.sendMessage(`§b⚡ §7Psychic Piercing — §bSoul pierced! §710 damage`);
    this._setCD(player, 'piercing', this.PSYCHIC_PIERCING_CD);
    return true;
  }

  // ── Active 2: Whip of Pain ────────────────────────────────────────────────
  static useWhipOfPain(player) {
    const cd = this._getCD(player, 'whip');
    if (cd > 0) {
      player.sendMessage(`§cWhip of Pain on cooldown — §e${Math.ceil(cd/20)}s`);
      return false;
    }
    if (!SpiritSystem.consumeSpirit(player, this.WHIP_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.WHIP_COST}`);
      return false;
    }

    const entities = player.dimension.getEntities({
      location: player.location,
      maxDistance: this.WHIP_RANGE,
      excludeTypes: ['minecraft:player'],
    });

    let target = null, closest = Infinity;
    for (const e of entities) {
      if (!e.isValid()) continue;
      const dx = e.location.x - player.location.x;
      const dy = e.location.y - player.location.y;
      const dz = e.location.z - player.location.z;
      const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (d < closest) { closest = d; target = e; }
    }

    if (!target) {
      SpiritSystem.addSpirit(player, this.WHIP_COST);
      player.sendMessage('§7No target close enough for Whip of Pain');
      return false;
    }

    // The barbed whip lashing the Soul — paralyzing effects
    try {
      target.addEffect('weakness',      160, { amplifier: 1, showParticles: true });
      target.addEffect('slowness',      120, { amplifier: 2, showParticles: true });
      target.addEffect('nausea',        100, { amplifier: 0, showParticles: true });
      target.addEffect('mining_fatigue', 100, { amplifier: 1, showParticles: false });
    } catch (_) {}

    // Crack-of-whip particle
    try {
      for (let i = 0; i < 5; i++) {
        target.dimension.spawnParticle('minecraft:critical_hit_emitter', {
          x: target.location.x + (Math.random()-0.5),
          y: target.location.y + 1 + (Math.random()),
          z: target.location.z + (Math.random()-0.5),
        });
      }
    } catch (_) {}

    player.sendMessage(`§5⚡ §7Whip of Pain — §5mind fractures§7, target trembles and cannot resist`);
    this._setCD(player, 'whip', this.WHIP_CD);
    return true;
  }

  // ── Active 3: Illusory Brand ──────────────────────────────────────────────
  static useIllusoryBrand(player) {
    const cd = this._getCD(player, 'brand');
    if (cd > 0) {
      player.sendMessage(`§cIllusory Brand on cooldown — §e${Math.ceil(cd/20)}s`);
      return false;
    }
    if (!SpiritSystem.consumeSpirit(player, this.BRAND_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.BRAND_COST}`);
      return false;
    }

    const hit = this._performRaycast(player, this.BRAND_RANGE);
    if (!hit) {
      SpiritSystem.addSpirit(player, this.BRAND_COST);
      player.sendMessage('§7Illusory Brand requires a target within reach — physical contact only');
      return false;
    }

    try { hit.applyDamage(this.BRAND_DMG); } catch (_) {}
    try {
      hit.addEffect('weakness', 100, { amplifier: 0, showParticles: true });
      hit.addEffect('slowness',  60, { amplifier: 0, showParticles: false });
    } catch (_) {}

    // Branding iron particle — fire
    try {
      for (let i = 0; i < 4; i++) {
        hit.dimension.spawnParticle('minecraft:basic_flame_particle', {
          x: hit.location.x + (Math.random()-0.5)*0.5,
          y: hit.location.y + 1,
          z: hit.location.z + (Math.random()-0.5)*0.5,
        });
      }
    } catch (_) {}

    player.sendMessage(`§c🔥 §7Illusory Brand — §cSpirit body seared!`);
    this._setCD(player, 'brand', this.BRAND_CD);
    return true;
  }

  // ── Active 4: Psychic Lashing (toggle) ────────────────────────────────────
  static usePsychicLashing(player) {
    const cd = this._getCD(player, 'lashing');
    const active = this.lashingActive.get(player.name) ?? 0;

    if (active > 0) {
      // Already active — deactivate
      this.lashingActive.set(player.name, 0);
      player.sendMessage('§7Psychic Lashing deactivated');
      return true;
    }
    if (cd > 0) {
      player.sendMessage(`§cPsychic Lashing on cooldown — §e${Math.ceil(cd/20)}s`);
      return false;
    }
    if (!SpiritSystem.consumeSpirit(player, this.LASHING_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.LASHING_COST}`);
      return false;
    }

    this.lashingActive.set(player.name, this.LASHING_CHARGES);

    // Lightning visual on player
    try {
      for (let i = 0; i < 4; i++) {
        player.dimension.spawnParticle('minecraft:lightning_field', {
          x: player.location.x + (Math.random()-0.5),
          y: player.location.y + (Math.random()*2),
          z: player.location.z + (Math.random()-0.5),
        });
      }
    } catch (_) {}

    player.sendMessage(`§e⚡ §7Psychic Lashing active — §enext ${this.LASHING_CHARGES} melee swings§7 deal spirit damage`);
    this._setCD(player, 'lashing', this.LASHING_CD);
    return true;
  }

  // ── Called from main.js entityHitEntity — consume Lashing charge ──────────
  // Returns bonus damage if Psychic Lashing is active, 0 otherwise.
  static onMeleeHit(player, victim) {
    const charges = this.lashingActive.get(player.name) ?? 0;
    if (charges <= 0) return 0;

    // Consume one charge
    const remaining = charges - 1;
    this.lashingActive.set(player.name, remaining);

    // Apply lightning effects to victim
    try {
      victim.addEffect('nausea',   40, { amplifier: 0, showParticles: true });
      victim.addEffect('weakness', 40, { amplifier: 0, showParticles: false });
    } catch (_) {}

    // Lightning particle on victim
    try {
      victim.dimension.spawnParticle('minecraft:lightning_field', {
        x: victim.location.x,
        y: victim.location.y + 1,
        z: victim.location.z,
      });
    } catch (_) {}

    if (remaining === 0) {
      player.sendMessage('§7Psychic Lashing expended');
    }

    return 6; // +6 spirit damage per lashing swing
  }

  // ── Weapon proficiency bonus (strengthened from Sheriff's +2 → +3) ────────
  static getMeleeProficiencyBonus(player, weaponTypeId) {
    if (!this.hasSequence(player)) return 0;
    const meleeTypes = [
      'minecraft:iron_sword', 'minecraft:diamond_sword', 'minecraft:netherite_sword',
      'minecraft:golden_sword', 'minecraft:stone_sword', 'minecraft:wooden_sword',
      'lotm:short_sword', 'lotm:knife',
    ];
    return meleeTypes.includes(weaponTypeId) ? 3 : 0;
  }

  // ── Item use dispatcher ───────────────────────────────────────────────────
  static useBrand(player, isSneaking) {
    if (isSneaking) { this.cycleMode(player); return true; }
    const mode = this.MODES[this.brandModes.get(player.name) ?? 0];
    if (mode === 'psychic_piercing') return this.usePsychicPiercing(player);
    if (mode === 'whip_of_pain')     return this.useWhipOfPain(player);
    if (mode === 'illusory_brand')   return this.useIllusoryBrand(player);
    if (mode === 'psychic_lashing')  return this.usePsychicLashing(player);
    return false;
  }

  // ── Hitscan raycast helper ────────────────────────────────────────────────
  static _performRaycast(player, range) {
    try {
      const eyePos = { x: player.location.x, y: player.location.y + 1.6, z: player.location.z };
      const dir    = player.getViewDirection();
      const result = player.dimension.getEntitiesFromRay(eyePos, dir, {
        maxDistance: range,
        excludeTypes: ['minecraft:player'],
      });
      return result?.[0]?.entity ?? null;
    } catch (_) { return null; }
  }

  // ── Status display ────────────────────────────────────────────────────────
  static getStatusText(player) {
    const modeIdx = this.brandModes.get(player.name) ?? 0;
    const label   = this.MODE_LABELS[this.MODES[modeIdx]];
    const charges = this.lashingActive.get(player.name) ?? 0;
    const lash    = charges > 0 ? ` §e⚡${charges}` : '';
    return `§6Interrogator's Brand §7| ${label}${lash}`;
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
