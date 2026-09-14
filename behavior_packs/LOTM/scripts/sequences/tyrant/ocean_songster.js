// ============================================================================
// TYRANT PATHWAY — SEQUENCE 5: OCEAN SONGSTER
// ocean_songster.js → behavior_packs/LOTM/scripts/sequences/tyrant/ocean_songster.js
//
// Physical Enhancement amplifiers continue the established per-tier step
// (STR/RES/SWIM_SPEED/DOLPHINS_GRACE each +1, HEALTH +1) — no real source
// numbers exist below Seq8 for these, this addon's own pacing call.
// ============================================================================
import { EntityDamageCause, EnchantmentType } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

function isHostileEntity(entity) {
  try {
    if (entity.matches({ families: ['monster'] })) return true;
    if (entity.matches({ families: ['undead'] }))  return true;
    if (entity.matches({ families: ['rampager'] })) return true;
  } catch (_) {}
  if (entity.typeId === 'lotm:dire_wolf' || entity.typeId === 'lotm:dire_bear') return true;
  return false;
}

export class OceanSongsterSequence {
  static SEQUENCE_NUMBER = 5;
  static PATHWAY = 'tyrant';

  static EFFECT_DURATION = 999999;
  static STRENGTH_AMPLIFIER = 3;   // Strength IV (was III)
  static RESISTANCE_AMPLIFIER = 4; // Resistance V (was IV)
  static SPEED_AMPLIFIER = 1;      // Speed II (out of water) — unchanged
  static SWIM_SPEED_AMPLIFIER = 4; // Speed V in water (was IV)
  static JUMP_AMPLIFIER = 1;       // Jump Boost II — unchanged
  static HEALTH_BONUS = 8;         // +8 hearts (was 7)
  static DOLPHINS_GRACE_AMPLIFIER = 2; // Dolphin's Grace III (was II)

  // Same shape as Wind Blessed's Spirit Vision — duplicated locally rather
  // than cross-imported, matching this codebase's existing per-file
  // self-containment convention.
  static SPIRIT_VISION_INTERVAL_MS = 2000;
  static SPIRIT_VISION_RADIUS = 16;
  static _lastVisionScan = new Map(); // player.id -> ms timestamp

  // Lightning Arrow — passive, no cost/cooldown, layers on top of Folk of
  // Rage's Projectile Control bonus (that one's gate is sequence<=8, so it
  // still applies here too).
  static LIGHTNING_ARROW_BONUS = 4;

  static MODES = ['lightning_target', 'acidic_rain', 'water_sphere', 'siren_song'];
  static MODE_LABELS = {
    lightning_target: '§e[Lightning Target]',
    acidic_rain:      '§2[Acidic Rain]',
    water_sphere:      '§b[Water Sphere]',
    siren_song:        '§d[Siren Song]',
  };

  static LIGHTNING_TARGET_COST = 25;    static LIGHTNING_TARGET_COOLDOWN = 100; static LIGHTNING_TARGET_RANGE = 20; static LIGHTNING_TARGET_DAMAGE = 6;
  static ACIDIC_RAIN_COST = 30;         static ACIDIC_RAIN_COOLDOWN = 200; static ACIDIC_RAIN_RANGE = 16;
  static ACIDIC_RAIN_DURATION = 100;    static ACIDIC_RAIN_TICK_INTERVAL = 20; static ACIDIC_RAIN_RADIUS = 4; static ACIDIC_RAIN_DAMAGE = 2;
  static WATER_SPHERE_COST = 20;        static WATER_SPHERE_COOLDOWN = 140; static WATER_SPHERE_DURATION = 200; // 10s Absorption
  static WATER_SPHERE_ABSORPTION_AMPLIFIER = 1; // Absorption II
  static WATER_SPHERE_PULSE_RADIUS = 3;
  static SIREN_SONG_COST = 28;          static SIREN_SONG_COOLDOWN = 200; static SIREN_SONG_RANGE = 16;
  static SIREN_SONG_DURATION = 100;     static SIREN_SONG_TICK_INTERVAL = 20; static SIREN_SONG_RADIUS = 6;

  static activeAcidicRains = new Map(); // player name -> { center: {x,y,z}, dimension, ticksRemaining }
  static activeSirenSongs  = new Map(); // player name -> { ticksRemaining }

  static modes = new Map();     // player name -> mode index
  static cooldowns = new Map(); // player name -> { target, rain, sphere, siren }

  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  static applyPassiveAbilities(player) {
    this.applyPhysicalEnhancements(player);
    this.applyWaterAffinity(player);
    this.applyDepthStrider(player);
    this.applyHealthBonus(player);
    this.applySpiritVision(player);

    try {
      const nv = player.getEffect('night_vision');
      if (!nv || nv.duration < 200) {
        player.addEffect('night_vision', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
      }
    } catch (_) {}

    try {
      const regen = player.getEffect('regeneration');
      if (!regen || regen.duration < 200) {
        player.addEffect('regeneration', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
      }
    } catch (_) {}

    try {
      const fire = player.getEffect('fire_resistance');
      if (!fire || fire.duration < 200) {
        player.addEffect('fire_resistance', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
      }
    } catch (_) {}

    // See seafarer.js/wind_blessed.js for why this is isolated in its own try/catch.
    try {
      const dolphin = player.getEffect('dolphins_grace');
      if (!dolphin || dolphin.amplifier !== this.DOLPHINS_GRACE_AMPLIFIER || dolphin.duration < 200) {
        player.addEffect('dolphins_grace', this.EFFECT_DURATION, { amplifier: this.DOLPHINS_GRACE_AMPLIFIER, showParticles: false });
      }
    } catch (_) {}
  }

  static applyPhysicalEnhancements(player) {
    const strength = player.getEffect('strength');
    if (!strength || (strength.amplifier === this.STRENGTH_AMPLIFIER && strength.duration < 200) || strength.amplifier < this.STRENGTH_AMPLIFIER) {
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: this.STRENGTH_AMPLIFIER, showParticles: false });
    }

    const resistance = player.getEffect('resistance');
    if (!resistance || (resistance.amplifier === this.RESISTANCE_AMPLIFIER && resistance.duration < 200) || resistance.amplifier < this.RESISTANCE_AMPLIFIER) {
      player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: this.RESISTANCE_AMPLIFIER, showParticles: false });
    }

    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: this.JUMP_AMPLIFIER, showParticles: false });
    }
  }

  // Same shape as every earlier Tyrant tier — see sailor.js for why
  // removeEffect-before-addEffect is required for the downgrade direction.
  static applyWaterAffinity(player) {
    const wb = player.getEffect('water_breathing');
    if (!wb || wb.duration < 200) {
      player.addEffect('water_breathing', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    const targetAmplifier = player.isInWater ? this.SWIM_SPEED_AMPLIFIER : this.SPEED_AMPLIFIER;
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== targetAmplifier || speed.duration < 40) {
      if (speed) player.removeEffect('speed');
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: targetAmplifier, showParticles: false });
    }
  }

  // Depth Strider — Tyrant's water theme should cancel the real seafloor
  // movement friction, not just add raw Speed (which doesn't fully
  // substitute for it) — scripted onto whatever boots are currently worn,
  // same enchant-injection pattern Twilight Giant's Weapon Master already
  // uses for its own auto-enchant passives (weapon_master.js).
  static applyDepthStrider(player) {
    try {
      const equip = player.getComponent('minecraft:equippable');
      const boots = equip?.getEquipment('Feet');
      if (!boots) return;
      const enchantments = boots.getComponent('minecraft:enchantable');
      if (!enchantments) return;
      const current = enchantments.getEnchantment('depth_strider');
      if (!current || current.level < 3) {
        enchantments.addEnchantment({ type: new EnchantmentType('depth_strider'), level: 3 });
        equip.setEquipment('Feet', boots);
      }
    } catch (_) {}
  }

  static applyHealthBonus(player) {
    const healthBoost = player.getEffect('health_boost');
    const amplifier = this.HEALTH_BONUS - 1;
    if (!healthBoost || healthBoost.amplifier !== amplifier || healthBoost.duration < 200) {
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier, showParticles: false });
    }
  }

  static applySpiritVision(player) {
    const now = Date.now();
    const last = this._lastVisionScan.get(player.id) || 0;
    if (now - last < this.SPIRIT_VISION_INTERVAL_MS) return;
    this._lastVisionScan.set(player.id, now);

    try {
      const nearby = player.dimension.getEntities({ location: player.location, maxDistance: this.SPIRIT_VISION_RADIUS });
      for (const e of nearby) {
        if (e === player || e.typeId === 'minecraft:player') continue;
        const particle = isHostileEntity(e) ? 'minecraft:villager_angry' : 'minecraft:villager_happy';
        try {
          player.dimension.spawnParticle(particle, { x: e.location.x, y: e.location.y + 2.5, z: e.location.z });
        } catch (_) {}
      }
    } catch (_) {}
  }

  // ── Lightning Arrow — called from main.js's entityHurt projectile-dealt
  // cascade, alongside (not instead of) Folk of Rage's own bonus. Uses
  // entityAttack as the bonus hit's cause for the same re-entry reason
  // documented in folk_of_rage.js's onProjectileDamageDealt. ─────────────────
  static onProjectileDamageDealt(player, victim) {
    if (!this.hasSequence(player)) return;
    try {
      victim.applyDamage(this.LIGHTNING_ARROW_BONUS, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
      victim.dimension.spawnParticle('minecraft:electric_spark_particle', victim.location);
    } catch (_) {}
  }

  // ── Ability-state ticking ─────────────────────────────────────────────────
  static tickAbilityState(player) {
    const cds = this.cooldowns.get(player.name);
    if (cds) for (const k of Object.keys(cds)) { if (cds[k] > 0) cds[k]--; }
    this._processAcidicRain(player);
    this._processSirenSong(player);
  }

  static _getCD(player, key) { return this.cooldowns.get(player.name)?.[key] ?? 0; }
  static _setCD(player, key, value) {
    if (!this.cooldowns.has(player.name)) this.cooldowns.set(player.name, { target: 0, rain: 0, sphere: 0, siren: 0 });
    this.cooldowns.get(player.name)[key] = value;
  }

  static cycleMode(player) {
    const next = ((this.modes.get(player.name) ?? 0) + 1) % this.MODES.length;
    this.modes.set(player.name, next);
    player.sendMessage(`§6Ocean Songster's Chorus — Mode: ${this.MODE_LABELS[this.MODES[next]]}`);
  }

  // ── Lightning Target ───────────────────────────────────────────────────────
  static useLightningTarget(player) {
    const cd = this._getCD(player, 'target');
    if (cd > 0) { player.sendMessage(`§cLightning Target on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.LIGHTNING_TARGET_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.LIGHTNING_TARGET_COST}`); return false;
    }

    const hit = this._performRaycast(player, this.LIGHTNING_TARGET_RANGE);
    if (!hit) {
      SpiritSystem.addSpirit(player, this.LIGHTNING_TARGET_COST);
      player.sendMessage('§7Lightning Target found nothing to strike');
      return false;
    }

    try {
      hit.dimension.spawnEntity('minecraft:lightning_bolt', hit.location);
      hit.applyDamage(this.LIGHTNING_TARGET_DAMAGE, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
    } catch (_) {}

    player.sendMessage('§e§oLightning answers your call!');
    this._setCD(player, 'target', this.LIGHTNING_TARGET_COOLDOWN);
    return true;
  }

  // ── Acidic Rain — periodic AoE poison/slow, anchored to the cast point ────
  static useAcidicRain(player) {
    const cd = this._getCD(player, 'rain');
    if (cd > 0) { player.sendMessage(`§cAcidic Rain on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.ACIDIC_RAIN_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.ACIDIC_RAIN_COST}`); return false;
    }

    const hit = this._performRaycast(player, this.ACIDIC_RAIN_RANGE);
    const center = hit ? hit.location : this._groundAheadLocation(player, this.ACIDIC_RAIN_RANGE);
    if (!center) {
      SpiritSystem.addSpirit(player, this.ACIDIC_RAIN_COST);
      player.sendMessage('§7Acidic Rain found nowhere to fall');
      return false;
    }

    this.activeAcidicRains.set(player.name, { center, dimension: player.dimension, ticksRemaining: this.ACIDIC_RAIN_DURATION });
    player.sendMessage('§2§oA caustic rain begins to fall...');
    this._setCD(player, 'rain', this.ACIDIC_RAIN_COOLDOWN);
    return true;
  }

  static _processAcidicRain(player) {
    const state = this.activeAcidicRains.get(player.name);
    if (!state) return;

    state.ticksRemaining--;
    if (state.ticksRemaining <= 0) {
      this.activeAcidicRains.delete(player.name);
      return;
    }

    try {
      state.dimension.spawnParticle('minecraft:villager_happy', { x: state.center.x, y: state.center.y + 3, z: state.center.z });
    } catch (_) {}

    if (state.ticksRemaining % this.ACIDIC_RAIN_TICK_INTERVAL !== 0) return;
    try {
      const entities = state.dimension.getEntities({
        location: state.center,
        maxDistance: this.ACIDIC_RAIN_RADIUS,
        excludeTypes: ['minecraft:item']
      });
      for (const entity of entities) {
        if (entity === player) continue;
        try { entity.applyDamage(this.ACIDIC_RAIN_DAMAGE, { cause: EntityDamageCause.magic, damagingEntity: player }); } catch (_) {}
        try { entity.addEffect('slowness', this.ACIDIC_RAIN_TICK_INTERVAL + 5, { amplifier: 1, showParticles: true }); } catch (_) {}
      }
    } catch (_) {}
  }

  // ── Water Sphere — defensive self-buff ─────────────────────────────────────
  static useWaterSphere(player) {
    const cd = this._getCD(player, 'sphere');
    if (cd > 0) { player.sendMessage(`§cWater Sphere on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.WATER_SPHERE_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.WATER_SPHERE_COST}`); return false;
    }

    try {
      player.addEffect('absorption', this.WATER_SPHERE_DURATION, { amplifier: this.WATER_SPHERE_ABSORPTION_AMPLIFIER, showParticles: true });
    } catch (_) {}

    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.WATER_SPHERE_PULSE_RADIUS,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      for (const entity of entities) {
        try {
          const dx = entity.location.x - player.location.x;
          const dz = entity.location.z - player.location.z;
          const len = Math.sqrt(dx * dx + dz * dz) || 1;
          entity.applyKnockback(dx / len, dz / len, 1.2, 0.3);
        } catch (_) {}
      }
      player.dimension.spawnParticle('minecraft:bubble_column_up_particle', player.location);
    } catch (_) {}

    player.sendMessage('§b§oA sphere of water surrounds you');
    this._setCD(player, 'sphere', this.WATER_SPHERE_COOLDOWN);
    return true;
  }

  // ── Siren Song (Dazing Song variant) — AoE disorientation pulse ──────────
  static useSirenSong(player) {
    const cd = this._getCD(player, 'siren');
    if (cd > 0) { player.sendMessage(`§cSiren Song on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.SIREN_SONG_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.SIREN_SONG_COST}`); return false;
    }

    this.activeSirenSongs.set(player.name, { ticksRemaining: this.SIREN_SONG_DURATION });
    player.sendMessage('§d§oA dazing melody drifts across the battlefield...');
    try { player.playSound('ambient.cave', { pitch: 0.6, volume: 1.0 }); } catch (_) {}
    this._setCD(player, 'siren', this.SIREN_SONG_COOLDOWN);
    return true;
  }

  static _processSirenSong(player) {
    const state = this.activeSirenSongs.get(player.name);
    if (!state) return;

    state.ticksRemaining--;
    if (state.ticksRemaining <= 0) {
      this.activeSirenSongs.delete(player.name);
      return;
    }

    if (state.ticksRemaining % this.SIREN_SONG_TICK_INTERVAL !== 0) return;
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.SIREN_SONG_RADIUS,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      for (const entity of entities) {
        try { entity.addEffect('nausea', this.SIREN_SONG_TICK_INTERVAL + 20, { amplifier: 1, showParticles: false }); } catch (_) {}
        try { entity.addEffect('weakness', this.SIREN_SONG_TICK_INTERVAL + 20, { amplifier: 1, showParticles: false }); } catch (_) {}
      }
      player.dimension.spawnParticle('minecraft:mob_spell_ambient', player.location);
    } catch (_) {}
  }

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

  // Fallback target point for area spells when the raycast hits no entity —
  // just the player's own view direction projected out to range, at their
  // own eye height (good enough for an AoE anchor, doesn't need real block
  // collision).
  static _groundAheadLocation(player, range) {
    try {
      const eyePos = { x: player.location.x, y: player.location.y + 1.6, z: player.location.z };
      const dir    = player.getViewDirection();
      return { x: eyePos.x + dir.x * range, y: eyePos.y + dir.y * range, z: eyePos.z + dir.z * range };
    } catch (_) { return null; }
  }

  // ── Item use dispatcher ───────────────────────────────────────────────────
  static useFocus(player, isSneaking) {
    // Same sequence-gating fix as seafarer.js/wind_blessed.js's useFocus.
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    if (isSneaking) { this.cycleMode(player); return true; }
    const mode = this.MODES[this.modes.get(player.name) ?? 0];
    if (mode === 'lightning_target') return this.useLightningTarget(player);
    if (mode === 'acidic_rain')      return this.useAcidicRain(player);
    if (mode === 'water_sphere')     return this.useWaterSphere(player);
    if (mode === 'siren_song')       return this.useSirenSong(player);
    return false;
  }

  static getStatusText(player) {
    const modeIdx = this.modes.get(player.name) ?? 0;
    return `§6Ocean Songster's Chorus §7| ${this.MODE_LABELS[this.MODES[modeIdx]]}`;
  }

  static removeEffects(player) {
    player.removeEffect('strength');
    player.removeEffect('resistance');
    player.removeEffect('jump_boost');
    player.removeEffect('speed');
    player.removeEffect('water_breathing');
    player.removeEffect('health_boost');
    player.removeEffect('regeneration');
    player.removeEffect('dolphins_grace');
    player.removeEffect('night_vision');
    player.removeEffect('fire_resistance');
    this.cooldowns.delete(player.name);
    this.activeAcidicRains.delete(player.name);
    this.activeSirenSongs.delete(player.name);
  }
}
