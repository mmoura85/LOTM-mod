// ============================================
// GUARDIAN - SEQUENCE 5 TWILIGHT GIANT PATHWAY
// Fixed: no falling_block entities, no runTimeout cascade
// Fixed: dimension stored as ID string not object
// Fixed: uses dawn_item menu (inherits from DawnPaladinSequence)
// ============================================

import { world, system, ItemStack } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { DawnPaladinSequence } from './dawn_paladin.js';

export class GuardianSequence {
  static SEQUENCE_NUMBER = 5;
  static PATHWAY = 'twilight_giant';

  static EFFECT_DURATION = 999999;

  // Physical stats — stronger than Dawn Paladin
  static STRENGTH_AMPLIFIER = 6;   // Strength VII
  static SPEED_AMPLIFIER    = 4;   // Speed V (sprinting)
  static SPEED_NORMAL       = 3;   // Speed IV (walking)
  static JUMP_AMPLIFIER     = 3;   // Jump Boost IV

  // Enhanced Light of Dawn
  static LIGHT_OF_DAWN_RANGE          = 22;
  static LIGHT_OF_DAWN_DURATION       = 300;
  static LIGHT_OF_DAWN_SPIRIT_COST    = 60;
  static LIGHT_OF_DAWN_COOLDOWN       = 600;
  static LIGHT_OF_DAWN_DAMAGE         = 8;
  static LIGHT_OF_DAWN_DAMAGE_ONGOING = 5;

  // Enhanced Hurricane
  static HURRICANE_SPIRIT_COST       = 70;
  static HURRICANE_RANGE             = 25;
  static HURRICANE_DURATION          = 100;
  static HURRICANE_COOLDOWN          = 2400;
  static HURRICANE_SWORDS_PER_WAVE   = 10;   // slightly more than Dawn Paladin
  static HURRICANE_SWORD_DAMAGE      = 12;
  static HURRICANE_UNDEAD_DAMAGE     = 20;
  static HURRICANE_WAVE_INTERVAL     = 25;

  // Guardian's Protection stance
  static PROTECTION_SPIRIT_COST = 40;
  static PROTECTION_DURATION    = 200;
  static PROTECTION_COOLDOWN    = 400;
  static PROTECTION_RANGE       = 10;

  // State maps
  static activeLightZones   = new Map();
  static lightCooldowns     = new Map();
  static hurricaneCooldowns = new Map();
  static activeHurricanes   = new Map();
  static protectionActive   = new Map();
  static protectionCooldowns= new Map();
  // Inherit sword/shield from DawnPaladinSequence maps (same player name keys)

  static ABILITIES = {
    LIGHT_OF_DAWN:      'light_of_dawn',
    HURRICANE_OF_LIGHT: 'hurricane_of_light',
    SWORD_OF_LIGHT:     'sword_of_light',
    SHIELD_OF_LIGHT:    'shield_of_light',
    PROTECTION:         'protection'
  };

  // =============================================
  // SEQUENCE CHECK
  // =============================================
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // =============================================
  // PASSIVE ABILITIES
  // =============================================
  static applyPassiveAbilities(player) {
    this.applyPhysicalEnhancements(player);
    this.applyHealthBonus(player, 20);    // +10 hearts
    this.applyGiantSize(player);
    this.applyIllusionImmunity(player);

    this.processLightOfDawn(player);
    this.processHurricaneOfLight(player);
    this.processProtection(player);
    // Sword/Shield processing inherited from DawnPaladinSequence
    DawnPaladinSequence.processSwordOfLight(player);
    DawnPaladinSequence.processShieldOfLight(player);

    this.tickCooldowns(player);
    DawnPaladinSequence.tickCooldowns(player); // Also tick sword/shield cooldowns

    this.applyWeaponEnchantments(player);
    this.applyArmorEnchantments(player);
  }

  // =============================================
  // MENU HANDLER — all abilities go through dawn_item
  // =============================================
  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
      case this.ABILITIES.LIGHT_OF_DAWN:      return this.useLightOfDawn(player);
      case this.ABILITIES.HURRICANE_OF_LIGHT: return this.useHurricaneOfLight(player);
      case this.ABILITIES.SWORD_OF_LIGHT:     return DawnPaladinSequence.useSwordOfLight(player);
      case this.ABILITIES.SHIELD_OF_LIGHT:    return DawnPaladinSequence.useShieldOfLight(player);
      case this.ABILITIES.PROTECTION:         return this.useProtection(player);
      default:
        player.sendMessage('§cUnknown ability!');
        return false;
    }
  }

  static getAllAbilities(player) {
    // Guardian (Seq 5) gets all Dawn Paladin abilities + Protection
    const abilities = DawnPaladinSequence.getAllAbilities(player);
    abilities.push({ id: this.ABILITIES.PROTECTION, name: '§b⚔ Guardian Protection', cost: this.PROTECTION_SPIRIT_COST });
    return abilities;
  }

  // =============================================
  // COOLDOWN HELPERS
  // =============================================
  static tickCooldowns(player) {
    const n = player.name;
    const tick = v => (v > 0 ? v - 1 : 0);
    const lc  = this.lightCooldowns.get(n);      if (lc)  this.lightCooldowns.set(n, tick(lc));
    const hc  = this.hurricaneCooldowns.get(n);  if (hc)  this.hurricaneCooldowns.set(n, tick(hc));
    const pc  = this.protectionCooldowns.get(n); if (pc)  this.protectionCooldowns.set(n, tick(pc));
  }

  static _cdRemaining(map, player) {
    const v = map.get(player.name) || 0;
    return v > 0 ? Math.ceil(v / 20) : 0;
  }

  // =============================================
  // PASSIVE STATS
  // =============================================
  static applyPhysicalEnhancements(player) {
    const speedLevel = player.isSprinting ? this.SPEED_AMPLIFIER : this.SPEED_NORMAL;

    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200)
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: this.STRENGTH_AMPLIFIER, showParticles: false });

    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== speedLevel || speed.duration < 200)
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: speedLevel, showParticles: false });

    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200)
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: this.JUMP_AMPLIFIER, showParticles: false });

    const nv = player.getEffect('night_vision');
    if (!nv || nv.duration < 200)
      player.addEffect('night_vision', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });

    const abs = player.getEffect('absorption');
    if (!abs || abs.amplifier !== 4 || abs.duration < 200)
      player.addEffect('absorption', this.EFFECT_DURATION, { amplifier: 4, showParticles: false });

    const res = player.getEffect('resistance');
    if (!res || res.amplifier !== 4 || res.duration < 200)
      player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: 4, showParticles: false });

    const haste = player.getEffect('haste');
    if (!haste || haste.amplifier !== 3 || haste.duration < 200)
      player.addEffect('haste', this.EFFECT_DURATION, { amplifier: 3, showParticles: false });

    const fire = player.getEffect('fire_resistance');
    if (!fire || fire.duration < 200)
      player.addEffect('fire_resistance', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });

    const regen = player.getEffect('regeneration');
    if (!regen || regen.amplifier !== 2 || regen.duration < 200)
      player.addEffect('regeneration', this.EFFECT_DURATION, { amplifier: 2, showParticles: false });
  }

  static applyHealthBonus(player, bonusHearts) {
    const amplifier = bonusHearts - 1;
    const hb = player.getEffect('health_boost');
    if (!hb || hb.amplifier !== amplifier || hb.duration < 200)
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier, showParticles: false });
  }

  static applyGiantSize(player) {
    try { player.runCommand('attribute @s minecraft:generic.scale base set 1.8'); } catch (e) {}
  }

  static applyIllusionImmunity(player) {
    for (const effect of ['blindness', 'nausea', 'darkness']) {
      if (player.getEffect(effect)) { try { player.removeEffect(effect); } catch (e) {} }
    }
  }

  // =============================================
  // ABILITY: LIGHT OF DAWN (enhanced)
  // =============================================
  static useLightOfDawn(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }

    const cd = this._cdRemaining(this.lightCooldowns, player);
    if (cd > 0) { player.sendMessage(`§cLight of Dawn on cooldown: §e${cd}s`); return false; }
    if (this.activeLightZones.has(player.name)) { player.sendMessage('§cAlready active!'); return false; }

    if (!SpiritSystem.consumeSpirit(player, this.LIGHT_OF_DAWN_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.LIGHT_OF_DAWN_SPIRIT_COST}`); return false;
    }

    const location = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) };
    const radius = 8;
    const replacedBlocks = [];

    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        if (Math.sqrt(x*x + z*z) > radius) continue;
        const blockLoc = { x: location.x + x, y: location.y - 1, z: location.z + z };
        try {
          const block = player.dimension.getBlock(blockLoc);
          if (block && !block.isAir && !block.isLiquid) {
            replacedBlocks.push({ location: blockLoc, originalType: block.typeId });
            player.dimension.runCommand(`setblock ${blockLoc.x} ${blockLoc.y} ${blockLoc.z} sea_lantern`);
          }
        } catch (e) {}
      }
    }

    this.activeLightZones.set(player.name, {
      location,
      dimensionId: player.dimension.id,
      ticksRemaining: this.LIGHT_OF_DAWN_DURATION,
      blocks: replacedBlocks
    });
    this.lightCooldowns.set(player.name, this.LIGHT_OF_DAWN_COOLDOWN);

    player.playSound('beacon.activate', { pitch: 0.9, volume: 1.5 });
    try {
      player.dimension.playSound('ambient.weather.lightning.impact', {
        location: location, pitch: 1.8, volume: 0.6
      });
    } catch (e) {}
    player.sendMessage('§6§l✦ ENHANCED LIGHT OF DAWN ✦');

    DawnPaladinSequence._spawnLightRay(player.dimension, location, 30);
    this._applyLightDamage(player.dimension, location, this.LIGHT_OF_DAWN_RANGE, this.LIGHT_OF_DAWN_DAMAGE);
    return true;
  }

  static processLightOfDawn(player) {
    const zone = this.activeLightZones.get(player.name);
    if (!zone) return;

    zone.ticksRemaining--;
    let dim;
    try { dim = world.getDimension(zone.dimensionId); } catch (e) { return; }

    if (zone.ticksRemaining % 40 === 0)
      DawnPaladinSequence._spawnLightRay(dim, zone.location, 20);

    if (zone.ticksRemaining % 10 === 0)
      DawnPaladinSequence._spawnLightZoneParticles(dim, zone.location, 8);

    if (zone.ticksRemaining % 40 === 0)
      this._applyLightDamage(dim, zone.location, this.LIGHT_OF_DAWN_RANGE, this.LIGHT_OF_DAWN_DAMAGE_ONGOING);

    if (zone.ticksRemaining <= 0) {
      DawnPaladinSequence._restoreBlocks(dim, zone.blocks);
      this.activeLightZones.delete(player.name);
      player.sendMessage('§7Light of Dawn fades...');
      player.playSound('beacon.deactivate', { pitch: 0.9, volume: 0.8 });
    }
  }

  // =============================================
  // ABILITY: HURRICANE OF LIGHT (enhanced, no timeout cascade)
  // =============================================
  static useHurricaneOfLight(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }

    const cd = this._cdRemaining(this.hurricaneCooldowns, player);
    if (cd > 0) { player.sendMessage(`§cHurricane on cooldown: §e${cd}s`); return false; }
    if (this.activeHurricanes.has(player.name)) { player.sendMessage('§cAlready active!'); return false; }

    if (!SpiritSystem.consumeSpirit(player, this.HURRICANE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.HURRICANE_SPIRIT_COST}`); return false;
    }

    const location = { ...player.location };
    this.activeHurricanes.set(player.name, {
      location,
      dimensionId: player.dimension.id,
      ticksRemaining: this.HURRICANE_DURATION,
      waveCount: 0
    });
    this.hurricaneCooldowns.set(player.name, this.HURRICANE_COOLDOWN);

    player.playSound('item.trident.thunder', { pitch: 0.8, volume: 1.5 });
    player.sendMessage('§6§l☀ ENHANCED HURRICANE OF LIGHT ☀');

    DawnPaladinSequence._spawnBurstRing(player.dimension, { x: location.x, y: location.y + 14, z: location.z }, this.HURRICANE_RANGE * 0.5, 1);
    return true;
  }

  static processHurricaneOfLight(player) {
    const hurricane = this.activeHurricanes.get(player.name);
    if (!hurricane) return;

    hurricane.ticksRemaining--;
    let dim;
    try { dim = world.getDimension(hurricane.dimensionId); } catch (e) { return; }

    if (hurricane.ticksRemaining % this.HURRICANE_WAVE_INTERVAL === 0) {
      hurricane.waveCount++;
      this._spawnSwordWave(player, dim, hurricane.location);
    }

    // Ambient swirl
    if (hurricane.ticksRemaining % 6 === 0) {
      const angle = (hurricane.ticksRemaining / this.HURRICANE_DURATION) * Math.PI * 10;
      const r = this.HURRICANE_RANGE * 0.45;
      for (let i = 0; i < 4; i++) {
        const a = angle + (i / 4) * Math.PI * 2;
        try {
          dim.spawnParticle('minecraft:totem_particle', {
            x: hurricane.location.x + Math.cos(a) * r,
            y: hurricane.location.y + 10,
            z: hurricane.location.z + Math.sin(a) * r
          });
        } catch (e) {}
      }
    }

    if (hurricane.ticksRemaining <= 0) {
      this.activeHurricanes.delete(player.name);
      player.sendMessage('§7The hurricane subsides...');
      player.playSound('item.trident.return', { pitch: 1.0, volume: 1.0 });
    }
  }

  /**
   * Sword wave — particle-only, NO falling_block entities, NO timeout cascade
   */
  static _spawnSwordWave(player, dimension, centerLocation) {
    for (let i = 0; i < this.HURRICANE_SWORDS_PER_WAVE; i++) {
      const angle    = Math.random() * Math.PI * 2;
      const distance = Math.random() * this.HURRICANE_RANGE;
      const sx       = centerLocation.x + Math.cos(angle) * distance;
      const sz       = centerLocation.z + Math.sin(angle) * distance;
      const spawnY   = centerLocation.y + 24;
      const groundY  = centerLocation.y + 0.5;
      const delay    = i * 4;

      system.runTimeout(() => {
        // ── Falling sword particle ────────────────────────────────────
        try {
          dimension.spawnParticle('lotm:dawn_sword', { x: sx, y: spawnY, z: sz });
        } catch (e) {
          const steps = 16;
          for (let t = 0; t < steps; t++) {
            const trailY = spawnY - t * 1.6;
            const tDelay = t;
            system.runTimeout(() => {
              try { dimension.spawnParticle('minecraft:totem_particle', { x: sx, y: trailY,       z: sz }); } catch (e2) {}
              try { dimension.spawnParticle('minecraft:end_rod',        { x: sx, y: trailY + 0.5, z: sz }); } catch (e2) {}
            }, tDelay);
          }
        }

        // ── Golden trail ──────────────────────────────────────────────
        const steps = 16;
        for (let t = 2; t < steps; t++) {
          const trailY = spawnY - t * 1.6;
          const tDelay = t;
          system.runTimeout(() => {
            try { dimension.spawnParticle('minecraft:totem_particle', { x: sx, y: trailY, z: sz }); } catch (e) {}
          }, tDelay);
        }

        // ── Impact burst (larger — Guardian) ──────────────────────────
        system.runTimeout(() => {
          const impactLoc = { x: sx, y: groundY, z: sz };
          for (let k = 0; k < 16; k++) {
            const ka = (k / 16) * Math.PI * 2;
            try { dimension.spawnParticle('minecraft:critical_hit_emitter', { x: impactLoc.x + Math.cos(ka) * 1.0, y: impactLoc.y,       z: impactLoc.z + Math.sin(ka) * 1.0 }); } catch (e) {}
            try { dimension.spawnParticle('minecraft:totem_particle',       { x: impactLoc.x + Math.cos(ka) * 0.6, y: impactLoc.y + 0.4, z: impactLoc.z + Math.sin(ka) * 0.6 }); } catch (e) {}
          }
          try { dimension.spawnParticle('minecraft:huge_explosion_emitter', impactLoc); } catch (e) {}
          try { dimension.playSound('item.trident.hit', { location: impactLoc, pitch: 1.2, volume: 1.0 }); } catch (e) {}

          try {
            const hits = dimension.getEntities({
              location: impactLoc,
              maxDistance: 3,
              excludeTypes: ['minecraft:item', 'minecraft:player']
            });
            for (const entity of hits) {
              const dmg = DawnPaladinSequence.isUndeadOrEvil(entity) ? this.HURRICANE_UNDEAD_DAMAGE : this.HURRICANE_SWORD_DAMAGE;
              try { entity.applyDamage(dmg); } catch (e) {}
            }
          } catch (e) {}
        }, steps + 4);

      }, delay);
    }
  }

  // =============================================
  // ABILITY: GUARDIAN PROTECTION
  // =============================================
  static useProtection(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }

    const cd = this._cdRemaining(this.protectionCooldowns, player);
    if (cd > 0) { player.sendMessage(`§cProtection on cooldown: §e${cd}s`); return false; }
    if (this.protectionActive.has(player.name)) { player.sendMessage('§cProtection already active!'); return false; }

    if (!SpiritSystem.consumeSpirit(player, this.PROTECTION_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.PROTECTION_SPIRIT_COST}`); return false;
    }

    this.protectionActive.set(player.name, {
      ticksRemaining: this.PROTECTION_DURATION,
      dimensionId: player.dimension.id
    });

    player.sendMessage('§b§l🛡 GUARDIAN PROTECTION!');
    player.sendMessage('§bYou kneel and protect all nearby allies!');
    player.playSound('mob.guardian.elder.curse', { pitch: 0.8, volume: 1.0 });

    this._spawnProtectionBurst(player.dimension, player.location);
    return true;
  }

  static processProtection(player) {
    const stance = this.protectionActive.get(player.name);
    if (!stance) return;

    stance.ticksRemaining--;

    // Slow down guardian (kneeling)
    // player.addEffect('slowness', 25, { amplifier: 255, showParticles: false });
    // Massive defense
    player.addEffect('resistance', 25, { amplifier: 9, showParticles: false }); // dome visual handles the effect

    // Protect nearby allies every 20 ticks (not every tick)
    if (stance.ticksRemaining % 20 === 0) {
      try {
        const nearbyPlayers = player.dimension.getPlayers({
          location: player.location,
          maxDistance: this.PROTECTION_RANGE
        });
        for (const ally of nearbyPlayers) {
          if (ally.name === player.name) continue;
          ally.addEffect('resistance', 25, { amplifier: 6, showParticles: true });
          ally.addEffect('absorption', 25, { amplifier: 2, showParticles: false });
        }
      } catch (e) {}
    }

    // Mark nearby enemies with red particles every 10 ticks
    // Uses villager_angry (the red version of villager_happy) above each enemy
    if (stance.ticksRemaining % 10 === 0) {
      try {
        const enemies = player.dimension.getEntities({
          location: player.location,
          maxDistance: this.PROTECTION_RANGE,
          excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow',
                         'minecraft:player', 'minecraft:armor_stand']
        });
        for (const enemy of enemies) {
          const eloc = enemy.location;
          // Spray a small burst of red angry-villager particles above the entity
          for (let i = 0; i < 4; i++) {
            const angle  = (i / 4) * Math.PI * 2;
            const spread = 0.3;
            try {
              player.dimension.spawnParticle('minecraft:villager_angry', {
                x: eloc.x + Math.cos(angle) * spread,
                y: eloc.y + 2.2,   // float above head
                z: eloc.z + Math.sin(angle) * spread
              });
            } catch (e) {}
          }
          // Apply weakness to enemies inside the dome (Guardian aura suppresses them)
          try {
            enemy.addEffect('weakness', 30, { amplifier: 1, showParticles: false });
          } catch (e) {}
        }
      } catch (e) {}
    }

    // Pulse: rotating ring around player + dome edge shimmer every 15 ticks
    if (stance.ticksRemaining % 15 === 0) {
      const loc   = player.location;
      const r     = this.PROTECTION_RANGE;
      const spin  = (stance.ticksRemaining / 15) * 0.5; // slowly rotates each pulse
      try {
        // Inner glow ring close to player
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + spin;
          player.dimension.spawnParticle('minecraft:end_rod', {
            x: loc.x + Math.cos(a) * 1.5,
            y: loc.y + 1.2,
            z: loc.z + Math.sin(a) * 1.5
          });
        }
        // Outer dome edge — 4 random shimmer points
        for (let i = 0; i < 4; i++) {
          const a    = Math.random() * Math.PI * 2;
          const elev = Math.random() * (Math.PI / 2);
          player.dimension.spawnParticle('minecraft:totem_particle', {
            x: loc.x + Math.cos(a) * Math.cos(elev) * r,
            y: loc.y + Math.sin(elev) * r,
            z: loc.z + Math.sin(a) * Math.cos(elev) * r
          });
        }
      } catch (e) {}
    }

    // Ground cross under player every 30 ticks (holy ground feel)
    if (stance.ticksRemaining % 30 === 0) {
      const loc = player.location;
      try {
        for (let d = 0; d < 4; d++) {
          const dx = d === 0 ? 1 : d === 1 ? -1 : 0;
          const dz = d === 2 ? 1 : d === 3 ? -1 : 0;
          for (let s = 1; s <= 4; s++) {
            player.dimension.spawnParticle('minecraft:totem_particle', {
              x: loc.x + dx * s,
              y: loc.y + 0.1,
              z: loc.z + dz * s
            });
          }
        }
      } catch (e) {}
    }

    if (stance.ticksRemaining <= 0) {
      this.protectionActive.delete(player.name);
      this.protectionCooldowns.set(player.name, this.PROTECTION_COOLDOWN);
      player.sendMessage('§7You rise from your protective stance...');
      player.playSound('beacon.deactivate', { pitch: 0.8, volume: 1.0 });
    }
  }

  // =============================================
  // VISUAL HELPERS
  // =============================================
  static _spawnProtectionBurst(dimension, location) {
    const r = this.PROTECTION_RANGE;

    // ── Wave 1: ground ring expands outward ──────────────────────────
    for (let step = 1; step <= r; step++) {
      const stepR   = step;
      const stepDly = step * 1;
      system.runTimeout(() => {
        const count = Math.floor(stepR * 5);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          try { dimension.spawnParticle('minecraft:end_rod', {
            x: location.x + Math.cos(a) * stepR,
            y: location.y + 0.1,
            z: location.z + Math.sin(a) * stepR
          }); } catch (e) {}
          try { dimension.spawnParticle('minecraft:totem_particle', {
            x: location.x + Math.cos(a) * stepR,
            y: location.y + 0.2,
            z: location.z + Math.sin(a) * stepR
          }); } catch (e) {}
        }
      }, stepDly);
    }

    // ── Wave 2: pillars of light rise at the radius ──────────────────
    const pillarCount = 8;
    for (let p = 0; p < pillarCount; p++) {
      const a      = (p / pillarCount) * Math.PI * 2;
      const px_    = location.x + Math.cos(a) * r;
      const pz_    = location.z + Math.sin(a) * r;
      const pDelay = r + p * 2;
      system.runTimeout(() => {
        for (let h = 0; h < 10; h++) {
          const hDelay = h;
          const hY     = location.y + h * 0.8;
          system.runTimeout(() => {
            try { dimension.spawnParticle('minecraft:end_rod',        { x: px_, y: hY,       z: pz_ }); } catch (e) {}
            try { dimension.spawnParticle('minecraft:totem_particle', { x: px_, y: hY + 0.2, z: pz_ }); } catch (e) {}
          }, hDelay);
        }
      }, pDelay);
    }

    // ── Wave 3: dome arc — particles curve up and over ───────────────
    const arcSteps = 20;
    for (let i = 0; i < arcSteps; i++) {
      const azimuth  = (i / arcSteps) * Math.PI * 2;
      const arcDelay = r + 20 + i;
      system.runTimeout(() => {
        // Draw arc from ground level to apex (quarter circle in elevation)
        const elevSteps = 8;
        for (let e = 0; e <= elevSteps; e++) {
          const elev   = (e / elevSteps) * (Math.PI / 2); // 0 → 90°
          const arcR   = Math.cos(elev) * r;
          const arcY   = location.y + Math.sin(elev) * r;
          const eDelay = e;
          system.runTimeout(() => {
            try { dimension.spawnParticle('minecraft:end_rod', {
              x: location.x + Math.cos(azimuth) * arcR,
              y: arcY,
              z: location.z + Math.sin(azimuth) * arcR
            }); } catch (e2) {}
          }, eDelay);
        }
      }, arcDelay);
    }

    // ── Wave 4: apex flash at top of dome ────────────────────────────
    system.runTimeout(() => {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        try { dimension.spawnParticle('minecraft:totem_particle', {
          x: location.x + Math.cos(a) * 1.5,
          y: location.y + r,
          z: location.z + Math.sin(a) * 1.5
        }); } catch (e) {}
      }
      try { dimension.spawnParticle('minecraft:huge_explosion_emitter', {
        x: location.x, y: location.y + r, z: location.z
      }); } catch (e) {}
    }, r + 40);
  }

  // =============================================
  // DAMAGE HELPERS
  // =============================================
  static _applyLightDamage(dimension, location, range, damage) {
    try {
      const entities = dimension.getEntities({
        location,
        maxDistance: range,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      for (const entity of entities) {
        if (DawnPaladinSequence.isUndeadOrEvil(entity)) {
          try { entity.applyDamage(damage); } catch (e) {}
          try {
            entity.addEffect('weakness', 100, { amplifier: 3, showParticles: false });
            entity.addEffect('slowness', 100, { amplifier: 3, showParticles: false });
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  // =============================================
  // WEAPON / ARMOR ENCHANTMENTS (enhanced)
  // =============================================
  static applyWeaponEnchantments(player) {
    const inventory = player.getComponent('minecraft:inventory');
    if (!inventory?.container) return;
    const heldItem = inventory.container.getItem(player.selectedSlotIndex);
    if (!heldItem) return;
    const weaponTypes = [
      'minecraft:wooden_sword', 'minecraft:stone_sword', 'minecraft:iron_sword',
      'minecraft:golden_sword', 'minecraft:diamond_sword', 'minecraft:netherite_sword',
      'lotm:dawnsword'
    ];
    if (!weaponTypes.includes(heldItem.typeId)) return;
    try {
      const e = heldItem.getComponent('minecraft:enchantable');
      if (!e) return;
      if (!e.hasEnchantment('sharpness'))   e.addEnchantment({ type: 'sharpness',   level: 5 });
      if (!e.hasEnchantment('smite'))        e.addEnchantment({ type: 'smite',       level: 5 });
      if (!e.hasEnchantment('fire_aspect'))  e.addEnchantment({ type: 'fire_aspect', level: 2 });
      if (!e.hasEnchantment('knockback'))    e.addEnchantment({ type: 'knockback',   level: 3 });
      inventory.container.setItem(player.selectedSlotIndex, heldItem);
    } catch (e) {}
  }

  static applyArmorEnchantments(player) {
    const inventory = player.getComponent('minecraft:inventory');
    if (!inventory?.container) return;
    for (const slot of [36, 37, 38, 39]) {
      const item = inventory.container.getItem(slot);
      if (!item) continue;
      if (!item.typeId.includes('_chestplate') && !item.typeId.includes('_leggings') &&
          !item.typeId.includes('_helmet') && !item.typeId.includes('_boots')) continue;
      try {
        const e = item.getComponent('minecraft:enchantable');
        if (!e) continue;
        if (!e.hasEnchantment('protection'))       e.addEnchantment({ type: 'protection',       level: 4 });
        if (!e.hasEnchantment('blast_protection')) e.addEnchantment({ type: 'blast_protection', level: 4 });
        if (!e.hasEnchantment('unbreaking'))       e.addEnchantment({ type: 'unbreaking',       level: 3 });
        inventory.container.setItem(slot, item);
      } catch (e) {}
    }
  }
}
