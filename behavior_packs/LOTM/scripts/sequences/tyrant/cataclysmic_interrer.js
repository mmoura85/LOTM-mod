// ============================================================================
// TYRANT PATHWAY — SEQUENCE 4: CATACLYSMIC INTERRER
// cataclysmic_interrer.js → behavior_packs/LOTM/scripts/sequences/tyrant/cataclysmic_interrer.js
//
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

export class CataclysmicInterrerSequence {
  static SEQUENCE_NUMBER = 4;
  static PATHWAY = 'tyrant';

  static EFFECT_DURATION = 999999;
  static STRENGTH_AMPLIFIER = 4;   // Strength V (was IV)
  static RESISTANCE_AMPLIFIER = 5; // Resistance VI (was V)
  static SPEED_AMPLIFIER = 2;      // Speed III (out of water) — first land-speed bump since Seq9
  static SWIM_SPEED_AMPLIFIER = 5; // Speed VI in water (was V)
  static JUMP_AMPLIFIER = 2;       // Jump Boost III (was II)
  static HEALTH_BONUS = 10;        // +10 hearts (was 8)
  static DOLPHINS_GRACE_AMPLIFIER = 3; // Dolphin's Grace IV (was III)

  static SPIRIT_VISION_INTERVAL_MS = 2000;
  static SPIRIT_VISION_RADIUS = 16;
  static _lastVisionScan = new Map(); // player.id -> ms timestamp

  // Lightning Branching — passive melee proc, no cost/cooldown
  static LIGHTNING_BRANCH_CHANCE = 0.2;
  static LIGHTNING_BRANCH_OFFSET = 2.5;

  static MODES = ['tsunami', 'hurricane', 'earthquake', 'roar'];
  static MODE_LABELS = {
    tsunami:   '§3[Tsunami]',
    hurricane: '§b[Hurricane]',
    earthquake:'§6[Earthquake]',
    roar:      '§4[Roar]',
  };

  static TSUNAMI_COST = 35;    static TSUNAMI_COOLDOWN = 240; static TSUNAMI_RANGE = 14; static TSUNAMI_DAMAGE = 7;
  static TSUNAMI_CONE_DOT = 0.6; // ~53 degree half-angle — wide wave in front of the caster

  static HURRICANE_COST = 35;  static HURRICANE_COOLDOWN = 260; static HURRICANE_DURATION = 100; // 5s
  static HURRICANE_TICK_INTERVAL = 20; static HURRICANE_RADIUS = 8; static HURRICANE_DAMAGE = 3;

  static EARTHQUAKE_COST = 32; static EARTHQUAKE_COOLDOWN = 220; static EARTHQUAKE_RADIUS = 8; static EARTHQUAKE_DAMAGE = 8;
  static EARTHQUAKE_STUN_DURATION = 60; // 3s Slowness + Mining Fatigue

  static ROAR_COST = 25;       static ROAR_COOLDOWN = 180; static ROAR_RANGE = 10; static ROAR_DAMAGE = 7;
  static ROAR_CONE_DOT = 0.7;  // ~45 degree half-angle
  static ROAR_WEAKNESS_DURATION = 100; // 5s

  static activeHurricanes = new Map(); // player name -> { ticksRemaining }
  static modes = new Map();            // player name -> mode index
  static cooldowns = new Map();        // player name -> { tsunami, hurricane, earthquake, roar }

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

  // ── Lightning Branching — called from main.js's entityHitEntity handler ──
  static onMeleeHit(player, victim) {
    if (!this.hasSequence(player)) return;
    if (Math.random() >= this.LIGHTNING_BRANCH_CHANCE) return;
    try {
      const offset = {
        x: victim.location.x + (Math.random() - 0.5) * this.LIGHTNING_BRANCH_OFFSET,
        y: victim.location.y,
        z: victim.location.z + (Math.random() - 0.5) * this.LIGHTNING_BRANCH_OFFSET,
      };
      victim.dimension.spawnEntity('minecraft:lightning_bolt', offset);
    } catch (_) {}
  }

  // ── Ability-state ticking ─────────────────────────────────────────────────
  static tickAbilityState(player) {
    const cds = this.cooldowns.get(player.name);
    if (cds) for (const k of Object.keys(cds)) { if (cds[k] > 0) cds[k]--; }
    this._processHurricane(player);
  }

  static _getCD(player, key) { return this.cooldowns.get(player.name)?.[key] ?? 0; }
  static _setCD(player, key, value) {
    if (!this.cooldowns.has(player.name)) this.cooldowns.set(player.name, { tsunami: 0, hurricane: 0, earthquake: 0, roar: 0 });
    this.cooldowns.get(player.name)[key] = value;
  }

  static cycleMode(player) {
    const next = ((this.modes.get(player.name) ?? 0) + 1) % this.MODES.length;
    this.modes.set(player.name, next);
    player.sendMessage(`§6Cataclysmic Interrer's Wrath — Mode: ${this.MODE_LABELS[this.MODES[next]]}`);
  }

  // ── Tsunami — cone-shaped wave in front of the caster ─────────────────────
  static useTsunami(player) {
    const cd = this._getCD(player, 'tsunami');
    if (cd > 0) { player.sendMessage(`§cTsunami on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.TSUNAMI_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.TSUNAMI_COST}`); return false;
    }

    try {
      const dir = player.getViewDirection();
      const dirLen = Math.sqrt(dir.x * dir.x + dir.z * dir.z) || 1;
      const dirX = dir.x / dirLen, dirZ = dir.z / dirLen;

      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.TSUNAMI_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      for (const entity of entities) {
        const dx = entity.location.x - player.location.x;
        const dz = entity.location.z - player.location.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        const dot = (dx / len) * dirX + (dz / len) * dirZ;
        if (dot < this.TSUNAMI_CONE_DOT) continue;
        try { entity.applyDamage(this.TSUNAMI_DAMAGE, { cause: EntityDamageCause.entityAttack, damagingEntity: player }); } catch (_) {}
        try { entity.applyKnockback(dx / len, dz / len, 1.8, 0.5); } catch (_) {}
        try { entity.dimension.spawnParticle('minecraft:bubble_column_up_particle', entity.location); } catch (_) {}
      }

      for (let i = 1; i <= this.TSUNAMI_RANGE; i += 2) {
        player.dimension.spawnParticle('minecraft:water_splash_particle_manual', {
          x: player.location.x + dirX * i, y: player.location.y + 0.5, z: player.location.z + dirZ * i
        });
      }
    } catch (_) {}

    player.sendMessage('§3§oA wave crashes forward!');
    this._setCD(player, 'tsunami', this.TSUNAMI_COOLDOWN);
    return true;
  }

  // ── Hurricane — pulls nearby enemies toward the caster over its duration ─
  static useHurricane(player) {
    const cd = this._getCD(player, 'hurricane');
    if (cd > 0) { player.sendMessage(`§cHurricane on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.HURRICANE_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.HURRICANE_COST}`); return false;
    }

    this.activeHurricanes.set(player.name, { ticksRemaining: this.HURRICANE_DURATION });
    player.sendMessage('§b§oA hurricane rises around you!');
    try { player.playSound('weather.rain', { pitch: 0.6, volume: 1.2 }); } catch (_) {}
    this._setCD(player, 'hurricane', this.HURRICANE_COOLDOWN);
    return true;
  }

  static _processHurricane(player) {
    const state = this.activeHurricanes.get(player.name);
    if (!state) return;

    state.ticksRemaining--;
    if (state.ticksRemaining <= 0) {
      this.activeHurricanes.delete(player.name);
      return;
    }

    if (state.ticksRemaining % this.HURRICANE_TICK_INTERVAL !== 0) return;
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.HURRICANE_RADIUS,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      for (const entity of entities) {
        try { entity.applyDamage(this.HURRICANE_DAMAGE, { cause: EntityDamageCause.entityAttack, damagingEntity: player }); } catch (_) {}
        try {
          const dx = player.location.x - entity.location.x;
          const dz = player.location.z - entity.location.z;
          const len = Math.sqrt(dx * dx + dz * dz) || 1;
          entity.applyKnockback(dx / len, dz / len, 0.8, 0.15);
        } catch (_) {}
      }
      player.dimension.spawnParticle('minecraft:large_explosion', player.location);
    } catch (_) {}
  }

  // ── Earthquake — single burst AoE around the caster ────────────────────────
  static useEarthquake(player) {
    const cd = this._getCD(player, 'earthquake');
    if (cd > 0) { player.sendMessage(`§cEarthquake on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.EARTHQUAKE_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.EARTHQUAKE_COST}`); return false;
    }

    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.EARTHQUAKE_RADIUS,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      for (const entity of entities) {
        try { entity.applyDamage(this.EARTHQUAKE_DAMAGE, { cause: EntityDamageCause.entityAttack, damagingEntity: player }); } catch (_) {}
        try {
          const dx = entity.location.x - player.location.x;
          const dz = entity.location.z - player.location.z;
          const len = Math.sqrt(dx * dx + dz * dz) || 1;
          entity.applyKnockback(dx / len, dz / len, 1.4, 0.6);
        } catch (_) {}
        try {
          entity.addEffect('slowness', this.EARTHQUAKE_STUN_DURATION, { amplifier: 3, showParticles: true });
          entity.addEffect('mining_fatigue', this.EARTHQUAKE_STUN_DURATION, { amplifier: 2, showParticles: false });
        } catch (_) {}
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        player.dimension.spawnParticle('minecraft:huge_explosion_emitter', {
          x: player.location.x + Math.cos(a) * this.EARTHQUAKE_RADIUS * 0.5,
          y: player.location.y,
          z: player.location.z + Math.sin(a) * this.EARTHQUAKE_RADIUS * 0.5,
        });
      }
    } catch (_) {}

    player.sendMessage('§6§oThe ground shatters beneath your feet!');
    try { player.playSound('random.explode', { pitch: 0.6, volume: 1.0 }); } catch (_) {}
    this._setCD(player, 'earthquake', this.EARTHQUAKE_COOLDOWN);
    return true;
  }

  // ── Roar — cone-shaped fear/damage burst ──────────────────────────────────
  static useRoar(player) {
    const cd = this._getCD(player, 'roar');
    if (cd > 0) { player.sendMessage(`§cRoar on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.ROAR_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.ROAR_COST}`); return false;
    }

    try {
      const dir = player.getViewDirection();
      const dirLen = Math.sqrt(dir.x * dir.x + dir.z * dir.z) || 1;
      const dirX = dir.x / dirLen, dirZ = dir.z / dirLen;

      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.ROAR_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      for (const entity of entities) {
        const dx = entity.location.x - player.location.x;
        const dz = entity.location.z - player.location.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        const dot = (dx / len) * dirX + (dz / len) * dirZ;
        if (dot < this.ROAR_CONE_DOT) continue;
        try { entity.applyDamage(this.ROAR_DAMAGE, { cause: EntityDamageCause.entityAttack, damagingEntity: player }); } catch (_) {}
        try { entity.applyKnockback(dx / len, dz / len, 1.6, 0.3); } catch (_) {}
        try { entity.addEffect('weakness', this.ROAR_WEAKNESS_DURATION, { amplifier: 1, showParticles: true }); } catch (_) {}
      }
      player.dimension.spawnParticle('minecraft:large_explosion', { x: player.location.x + dirX * 2, y: player.location.y + 1, z: player.location.z + dirZ * 2 });
    } catch (_) {}

    player.sendMessage('§4§lROAR!');
    try { player.playSound('mob.ravager.roar', { pitch: 0.5, volume: 1.2 }); } catch (_) {}
    this._setCD(player, 'roar', this.ROAR_COOLDOWN);
    return true;
  }

  // ── Item use dispatcher ───────────────────────────────────────────────────
  static useFocus(player, isSneaking) {
    // Same sequence-gating fix as every earlier Tyrant Focus item's useFocus.
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    if (isSneaking) { this.cycleMode(player); return true; }
    const mode = this.MODES[this.modes.get(player.name) ?? 0];
    if (mode === 'tsunami')    return this.useTsunami(player);
    if (mode === 'hurricane')  return this.useHurricane(player);
    if (mode === 'earthquake') return this.useEarthquake(player);
    if (mode === 'roar')       return this.useRoar(player);
    return false;
  }

  static getStatusText(player) {
    const modeIdx = this.modes.get(player.name) ?? 0;
    return `§6Cataclysmic Interrer's Wrath §7| ${this.MODE_LABELS[this.MODES[modeIdx]]}`;
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
    this.activeHurricanes.delete(player.name);
  }
}
