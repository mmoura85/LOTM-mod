// ============================================
// DAWN PALADIN - SEQUENCE 6 TWILIGHT GIANT PATHWAY
// Fixed: abilities now work correctly
// Fixed: consolidated all items into single dawn_item menu
// Fixed: performance (no runTimeout cascade, batched particles)
// Improved: better visual effects
// ============================================

import { world, system, ItemStack } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { WeaponMasterSequence } from './weapon_master.js';

export class DawnPaladinSequence {
  static SEQUENCE_NUMBER = 6;
  static PATHWAY = 'twilight_giant';

  // Effect duration
  static EFFECT_DURATION = 999999;

  // Passive stat amplifiers
  static STRENGTH_AMPLIFIER = 4;   // Strength V
  static SPEED_AMPLIFIER    = 3;   // Speed IV (sprinting)
  static SPEED_NORMAL       = 2;   // Speed III (walking)
  static JUMP_AMPLIFIER     = 2;   // Jump Boost III

  // ---- Light of Dawn ----
  static LIGHT_OF_DAWN_RANGE         = 20;   // radius in blocks (was 45 — too huge, caused lag)
  static LIGHT_OF_DAWN_DURATION      = 300;  // 15 seconds (ticks, at 4-tick interval = 75 calls)
  static LIGHT_OF_DAWN_SPIRIT_COST   = 60;
  static LIGHT_OF_DAWN_COOLDOWN      = 600;  // 30 seconds
  static LIGHT_OF_DAWN_DAMAGE        = 5;    // initial hit damage
  static LIGHT_OF_DAWN_DAMAGE_ONGOING= 3;    // damage per 2 seconds

  // ---- Hurricane of Light ----
  // Uses timed-wave approach with NO runTimeout cascade
  static HURRICANE_SPIRIT_COST    = 70;
  static HURRICANE_RANGE          = 18;   // radius
  static HURRICANE_DURATION       = 100;  // 5 seconds (ticks)
  static HURRICANE_COOLDOWN       = 2400; // 2 minutes
  static HURRICANE_SWORDS_PER_WAVE= 8;    // swords per wave (reduced for perf)
  static HURRICANE_SWORD_DAMAGE   = 8;
  static HURRICANE_SWORD_DAMAGE_UNDEAD = 15;
  static HURRICANE_WAVE_INTERVAL  = 25;   // ticks between waves (was 5 — too frequent)

  // ---- Sword of Light (active buff) ----
  static SWORD_OF_LIGHT_SPIRIT_COST = 30;
  static SWORD_OF_LIGHT_DURATION    = 600;  // 30 seconds
  static SWORD_OF_LIGHT_COOLDOWN    = 300;  // 15 seconds

  // ---- Shield of Light ----
  static SHIELD_OF_LIGHT_SPIRIT_COST = 40;
  static SHIELD_OF_LIGHT_DURATION    = 200;  // 10 seconds
  static SHIELD_OF_LIGHT_COOLDOWN    = 400;  // 20 seconds

  // ---- Selected Ability (persisted) ----
  static selectedAbilities = new Map(); // playerName -> abilityId
  static SELECTED_ABILITY_PROPERTY = 'lotm:dawn_selected_ability';

  static getSelectedAbility(player) {
    if (!this.selectedAbilities.has(player.name)) {
      // Try loading from dynamic property
      try {
        const saved = player.getDynamicProperty(this.SELECTED_ABILITY_PROPERTY);
        if (saved) this.selectedAbilities.set(player.name, saved);
      } catch (e) {}
    }
    return this.selectedAbilities.get(player.name) || this.ABILITIES.LIGHT_OF_DAWN;
  }

  static setSelectedAbility(player, abilityId) {
    this.selectedAbilities.set(player.name, abilityId);
    try { player.setDynamicProperty(this.SELECTED_ABILITY_PROPERTY, abilityId); } catch (e) {}
  }

  static useSelectedAbility(player) {
    return this.handleAbilityUse(player, this.getSelectedAbility(player));
  }

  // ---- State Maps ----
  static activeLightZones   = new Map(); // playerName -> {location, dimensionId, ticksRemaining, blocks[]}
  static lightCooldowns     = new Map();
  static hurricaneCooldowns = new Map();
  static activeHurricanes   = new Map(); // playerName -> {location, dimensionId, ticksRemaining, waveCount}
  static swordOfLightActive = new Map(); // playerName -> ticksRemaining
  static swordCooldowns     = new Map();
  static shieldOfLightActive= new Map(); // playerName -> ticksRemaining
  static shieldCooldowns    = new Map();

  // Ability identifiers (used by menu)
  static ABILITIES = {
    LIGHT_OF_DAWN:    'light_of_dawn',
    HURRICANE_OF_LIGHT: 'hurricane_of_light',
    SWORD_OF_LIGHT:   'sword_of_light',
    SHIELD_OF_LIGHT:  'shield_of_light'
  };

  // =============================================
  // SEQUENCE CHECK
  // =============================================
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // =============================================
  // PASSIVE ABILITIES (called each main loop tick)
  // =============================================
  static applyPassiveAbilities(player) {
    this.applyPhysicalEnhancements(player);
    this.applyHealthBonus(player, 8);      // +4 hearts
    this.applyGiantSize(player);

    // Process active abilities
    this.processLightOfDawn(player);
    this.processHurricaneOfLight(player);
    this.processSwordOfLight(player);
    this.processShieldOfLight(player);

    // Tick cooldowns
    this.tickCooldowns(player);

    // Weapon / armor enchantments
    this.applyWeaponEnchantments(player);
    this.applyArmorEnchantments(player);
  }

  // =============================================
  // MENU HANDLER  (called from main.js on dawn_item use)
  // =============================================
  /**
   * Open the Dawn Paladin ability menu.
   * Import ActionFormData from '@minecraft/server-ui' in main.js and pass it here,
   * OR call showMenu from door_pathway_menus pattern.
   * This method handles a pre-chosen abilityId to avoid needing UI import here.
   */
  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
      case this.ABILITIES.LIGHT_OF_DAWN:      return this.useLightOfDawn(player);
      case this.ABILITIES.HURRICANE_OF_LIGHT: return this.useHurricaneOfLight(player);
      case this.ABILITIES.SWORD_OF_LIGHT:     return this.useSwordOfLight(player);
      case this.ABILITIES.SHIELD_OF_LIGHT:    return this.useShieldOfLight(player);
      default:
        player.sendMessage('§cUnknown ability!');
        return false;
    }
  }

  // =============================================
  // COOLDOWN HELPERS
  // =============================================
  static tickCooldowns(player) {
    const n = player.name;
    const tick = v => (v > 0 ? v - 1 : 0);

    const lc = this.lightCooldowns.get(n);     if (lc)  this.lightCooldowns.set(n, tick(lc));
    const hc = this.hurricaneCooldowns.get(n); if (hc)  this.hurricaneCooldowns.set(n, tick(hc));
    const sc = this.swordCooldowns.get(n);     if (sc)  this.swordCooldowns.set(n, tick(sc));
    const shc= this.shieldCooldowns.get(n);    if (shc) this.shieldCooldowns.set(n, tick(shc));
  }

  static _cdRemaining(map, player) {
    const v = map.get(player.name) || 0;
    return v > 0 ? Math.ceil(v / 20) : 0;
  }

  // =============================================
  // PASSIVE STAT METHODS
  // =============================================
  static applyPhysicalEnhancements(player) {
    const isSprinting = player.isSprinting;
    const speedLevel  = isSprinting ? this.SPEED_AMPLIFIER : this.SPEED_NORMAL;

    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: this.STRENGTH_AMPLIFIER, showParticles: false });
    }

    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== speedLevel || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: speedLevel, showParticles: false });
    }

    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: this.JUMP_AMPLIFIER, showParticles: false });
    }

    const nv = player.getEffect('night_vision');
    if (!nv || nv.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    const abs = player.getEffect('absorption');
    if (!abs || abs.amplifier !== 3 || abs.duration < 200) {
      player.addEffect('absorption', this.EFFECT_DURATION, { amplifier: 3, showParticles: false });
    }

    const res = player.getEffect('resistance');
    if (!res || res.amplifier !== 3 || res.duration < 200) {
      player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: 3, showParticles: false });
    }

    const haste = player.getEffect('haste');
    if (!haste || haste.amplifier !== 2 || haste.duration < 200) {
      player.addEffect('haste', this.EFFECT_DURATION, { amplifier: 2, showParticles: false });
    }

    const fire = player.getEffect('fire_resistance');
    if (!fire || fire.duration < 200) {
      player.addEffect('fire_resistance', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }
  }

  static applyHealthBonus(player, bonusHearts) {
    const amplifier = bonusHearts - 1;
    const hb = player.getEffect('health_boost');
    if (!hb || hb.amplifier !== amplifier || hb.duration < 200) {
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier, showParticles: false });
    }
  }

  static applyGiantSize(player) {
    try { player.runCommand('attribute @s minecraft:generic.scale base set 1.5'); } catch (e) {}
  }

  // =============================================
  // ABILITY: LIGHT OF DAWN
  // =============================================
  static useLightOfDawn(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to Light of Dawn!');
      return false;
    }

    const cd = this._cdRemaining(this.lightCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cLight of Dawn on cooldown: §e${cd}s`);
      return false;
    }

    if (this.activeLightZones.has(player.name)) {
      player.sendMessage('§cLight of Dawn is already active!');
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.LIGHT_OF_DAWN_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.LIGHT_OF_DAWN_SPIRIT_COST}`);
      return false;
    }

    const location = {
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y),
      z: Math.floor(player.location.z)
    };

    // Build a small holy ground ring — only replace surface blocks, max 40 blocks
    const replacedBlocks = [];
    const radius = 6; // small radius, visually impactful, not laggy
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

    // Store zone — use dimensionId string, NOT dimension object (avoids stale refs)
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
        location: location,
        pitch: 1.8,
        volume: 0.6
      });
    } catch (e) {}
    player.sendMessage('§6§l✦ LIGHT OF DAWN ✦');
    player.sendMessage('§eHoly ground consecrated — undead beware!');

    // Descending ray of light from sky
    this._spawnLightRay(player.dimension, location, 30);

    // Apply initial hit to all undead in range
    this._applyLightDamage(player.dimension, location, this.LIGHT_OF_DAWN_RANGE, this.LIGHT_OF_DAWN_DAMAGE);

    return true;
  }

  static processLightOfDawn(player) {
    const zone = this.activeLightZones.get(player.name);
    if (!zone) return;

    zone.ticksRemaining--;

    // Resolve dimension safely each tick
    let dim;
    try { dim = world.getDimension(zone.dimensionId); } catch (e) { return; }

    // Refresh ray of light every 40 ticks (2s)
    if (zone.ticksRemaining % 40 === 0) {
      this._spawnLightRay(dim, zone.location, 20);
    }

    // Ground sparkle particles every 10 ticks
    if (zone.ticksRemaining % 10 === 0) {
      this._spawnLightZoneParticles(dim, zone.location, 6);
    }

    // Damage undead every 2 seconds (40 ticks)
    if (zone.ticksRemaining % 40 === 0) {
      this._applyLightDamage(dim, zone.location, this.LIGHT_OF_DAWN_RANGE, this.LIGHT_OF_DAWN_DAMAGE_ONGOING);
    }

    // Zone expired — restore ground
    if (zone.ticksRemaining <= 0) {
      this._restoreBlocks(dim, zone.blocks);
      this.activeLightZones.delete(player.name);
      player.sendMessage('§7Light of Dawn fades...');
      player.playSound('beacon.deactivate', { pitch: 0.9, volume: 0.8 });
    }
  }

  // =============================================
  // ABILITY: HURRICANE OF LIGHT
  // =============================================
  static useHurricaneOfLight(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to Hurricane of Light!');
      return false;
    }

    const cd = this._cdRemaining(this.hurricaneCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cHurricane of Light on cooldown: §e${cd}s`);
      return false;
    }

    if (this.activeHurricanes.has(player.name)) {
      player.sendMessage('§cHurricane already active!');
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.HURRICANE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.HURRICANE_SPIRIT_COST}`);
      return false;
    }

    const location = { ...player.location };

    this.activeHurricanes.set(player.name, {
      location,
      dimensionId: player.dimension.id,  // Store ID not object
      ticksRemaining: this.HURRICANE_DURATION,
      waveCount: 0
    });

    this.hurricaneCooldowns.set(player.name, this.HURRICANE_COOLDOWN);

    player.playSound('item.trident.thunder', { pitch: 0.8, volume: 1.5 });
    player.sendMessage('§6§l☀ HURRICANE OF LIGHT ☀');
    player.sendMessage('§eSwords of dawn rain from above!');

    // Opening sky flash — single burst ring up high
    this._spawnBurstRing(player.dimension, { x: location.x, y: location.y + 12, z: location.z }, this.HURRICANE_RANGE * 0.5, 1);

    return true;
  }

  static processHurricaneOfLight(player) {
    const hurricane = this.activeHurricanes.get(player.name);
    if (!hurricane) return;

    hurricane.ticksRemaining--;

    let dim;
    try { dim = world.getDimension(hurricane.dimensionId); } catch (e) { return; }

    // Spawn ONE wave at interval — not every tick
    if (hurricane.ticksRemaining % this.HURRICANE_WAVE_INTERVAL === 0) {
      hurricane.waveCount++;
      this._spawnSwordWave(player, dim, hurricane.location);
    }

    // Ambient swirl particles (cheap — just 4 per tick at low frequency)
    if (hurricane.ticksRemaining % 8 === 0) {
      const angle = (hurricane.ticksRemaining / this.HURRICANE_DURATION) * Math.PI * 8;
      const r = this.HURRICANE_RANGE * 0.4;
      for (let i = 0; i < 4; i++) {
        const a = angle + (i / 4) * Math.PI * 2;
        try {
          dim.spawnParticle('minecraft:totem_particle', {
            x: hurricane.location.x + Math.cos(a) * r,
            y: hurricane.location.y + 8,
            z: hurricane.location.z + Math.sin(a) * r
          });
        } catch (e) {}
      }
    }

    if (hurricane.ticksRemaining <= 0) {
      this.activeHurricanes.delete(player.name);
      player.sendMessage('§7The hurricane of light subsides...');
      player.playSound('item.trident.return', { pitch: 1.0, volume: 1.0 });
    }
  }

  /**
   * Spawn one wave of "falling swords" — pure particle approach, NO falling_block entities
   * (falling_block entities accumulate and cause lag; particle trails look better anyway)
   */
  static _spawnSwordWave(player, dimension, centerLocation) {
    for (let i = 0; i < this.HURRICANE_SWORDS_PER_WAVE; i++) {
      const angle    = Math.random() * Math.PI * 2;
      const distance = Math.random() * this.HURRICANE_RANGE;
      const sx       = centerLocation.x + Math.cos(angle) * distance;
      const sz       = centerLocation.z + Math.sin(angle) * distance;
      const spawnY   = centerLocation.y + 20;
      const groundY  = centerLocation.y + 0.5;
      const delay    = i * 4;

      system.runTimeout(() => {
        // ── Falling sword particle — custom sprite, moves downward ────
        // Spawned at top, parametric motion carries it to ground over ~1.2s
        try {
          dimension.spawnParticle('lotm:dawn_sword', { x: sx, y: spawnY, z: sz });
        } catch (e) {
          // Fallback: vanilla particle column if custom particle not loaded
          const steps = 14;
          for (let t = 0; t < steps; t++) {
            const trailY = spawnY - t * 1.5;
            const tDelay = t;
            system.runTimeout(() => {
              try { dimension.spawnParticle('minecraft:totem_particle', { x: sx, y: trailY,       z: sz }); } catch (e2) {}
              try { dimension.spawnParticle('minecraft:end_rod',        { x: sx, y: trailY + 0.5, z: sz }); } catch (e2) {}
            }, tDelay);
          }
        }

        // ── Golden trail behind the falling sword ─────────────────────
        const steps = 14;
        for (let t = 2; t < steps; t++) {
          const trailY = spawnY - t * 1.5;
          const tDelay = t;
          system.runTimeout(() => {
            try { dimension.spawnParticle('minecraft:totem_particle', { x: sx, y: trailY, z: sz }); } catch (e) {}
          }, tDelay);
        }

        // ── Impact burst ──────────────────────────────────────────────
        system.runTimeout(() => {
          const impactLoc = { x: sx, y: groundY, z: sz };
          for (let k = 0; k < 12; k++) {
            const ka = (k / 12) * Math.PI * 2;
            try { dimension.spawnParticle('minecraft:critical_hit_emitter', { x: impactLoc.x + Math.cos(ka) * 0.8, y: impactLoc.y,       z: impactLoc.z + Math.sin(ka) * 0.8 }); } catch (e) {}
            try { dimension.spawnParticle('minecraft:totem_particle',       { x: impactLoc.x + Math.cos(ka) * 0.5, y: impactLoc.y + 0.4, z: impactLoc.z + Math.sin(ka) * 0.5 }); } catch (e) {}
          }
          try { dimension.playSound('item.trident.hit', { location: impactLoc, pitch: 1.4, volume: 0.8 }); } catch (e) {}

          // Damage at impact
          try {
            const hits = dimension.getEntities({
              location: impactLoc,
              maxDistance: 2.5,
              excludeTypes: ['minecraft:item', 'minecraft:player']
            });
            for (const entity of hits) {
              const dmg = this.isUndeadOrEvil(entity) ? this.HURRICANE_SWORD_DAMAGE_UNDEAD : this.HURRICANE_SWORD_DAMAGE;
              try { entity.applyDamage(dmg); } catch (e) {}
            }
          } catch (e) {}
        }, steps + 4);

      }, delay);
    }
  }

  // =============================================
  // ABILITY: SWORD OF LIGHT (active buff)
  // =============================================
  static useSwordOfLight(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to Sword of Light!');
      return false;
    }

    const cd = this._cdRemaining(this.swordCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cSword of Light on cooldown: §e${cd}s`);
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.SWORD_OF_LIGHT_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.SWORD_OF_LIGHT_SPIRIT_COST}`);
      return false;
    }

    this.swordOfLightActive.set(player.name, this.SWORD_OF_LIGHT_DURATION);
    this.swordCooldowns.set(player.name, this.SWORD_OF_LIGHT_COOLDOWN);

    // Apply combat buffs
    player.addEffect('strength', this.SWORD_OF_LIGHT_DURATION, { amplifier: this.STRENGTH_AMPLIFIER + 2, showParticles: true });

    player.playSound('random.orb', { pitch: 1.5, volume: 1.0 });
    player.sendMessage('§e§l⚔ SWORD OF LIGHT activated!');
    player.sendMessage('§eStrength surges through your weapon!');

    // Halo particle effect
    this._spawnHaloEffect(player.dimension, player.location);

    return true;
  }

  static processSwordOfLight(player) {
    const ticks = this.swordOfLightActive.get(player.name);
    if (!ticks || ticks <= 0) { this.swordOfLightActive.delete(player.name); return; }

    this.swordOfLightActive.set(player.name, ticks - 1);

    // Small persistent glow around player every 10 ticks
    if (ticks % 10 === 0) {
      try {
        player.dimension.spawnParticle('minecraft:totem_particle', {
          x: player.location.x,
          y: player.location.y + 1,
          z: player.location.z
        });
      } catch (e) {}
    }

    if (ticks <= 1) {
      player.sendMessage('§7Sword of Light fades...');
    }
  }

  // =============================================
  // ABILITY: SHIELD OF LIGHT
  // =============================================
  static useShieldOfLight(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to Shield of Light!');
      return false;
    }

    const cd = this._cdRemaining(this.shieldCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cShield of Light on cooldown: §e${cd}s`);
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.SHIELD_OF_LIGHT_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.SHIELD_OF_LIGHT_SPIRIT_COST}`);
      return false;
    }

    this.shieldOfLightActive.set(player.name, this.SHIELD_OF_LIGHT_DURATION);
    this.shieldCooldowns.set(player.name, this.SHIELD_OF_LIGHT_COOLDOWN);

    // Strong defensive buffs
    player.addEffect('resistance', this.SHIELD_OF_LIGHT_DURATION, { amplifier: 4, showParticles: true });
    player.addEffect('absorption', this.SHIELD_OF_LIGHT_DURATION, { amplifier: 9, showParticles: false }); // +5 absorb hearts
    player.addEffect('regeneration', this.SHIELD_OF_LIGHT_DURATION, { amplifier: 1, showParticles: false });

    player.playSound('mob.guardian.elder.curse', { pitch: 1.5, volume: 1.0 });
    player.sendMessage('§f§l🛡 SHIELD OF LIGHT raised!');
    player.sendMessage('§fDivine light shields your body!');

    // Shield pulse visual
    this._spawnShieldPulse(player.dimension, player.location);

    return true;
  }

  static processShieldOfLight(player) {
    const ticks = this.shieldOfLightActive.get(player.name);
    if (!ticks || ticks <= 0) { this.shieldOfLightActive.delete(player.name); return; }

    this.shieldOfLightActive.set(player.name, ticks - 1);

    // Pulsing shield ring every 15 ticks
    if (ticks % 15 === 0) {
      try {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          player.dimension.spawnParticle('minecraft:end_rod', {
            x: player.location.x + Math.cos(a) * 0.8,
            y: player.location.y + 1,
            z: player.location.z + Math.sin(a) * 0.8
          });
        }
      } catch (e) {}
    }

    if (ticks <= 1) {
      player.sendMessage('§7Shield of Light fades...');
    }
  }

  // =============================================
  // VISUAL HELPERS (performance-conscious)
  // =============================================

  /**
   * Descending ray of light from the sky down to the target location.
   * Uses staggered timeouts to give a genuine top-to-bottom "falling beam" feel.
   * Also emits custom particles if the resource pack files are present.
   */
  static _spawnLightRay(dimension, location, height = 24) {
    const { x, y, z } = location;

    // Custom particle emitters (resource pack)
    try { dimension.spawnParticle('lotm:dawn_light_ray', { x, y: y + height, z }); } catch (e) {}
    try { dimension.spawnParticle('lotm:dawn_ground_glow', { x, y: y + 0.1, z }); } catch (e) {}

    // Vanilla fallback — stacked column, top to bottom
    // Note: delay values are pre-calculated to avoid closure-over-loop-variable bug
    const steps    = Math.min(40, Math.floor(height / 0.6));
    const stepSize = height / steps;
    for (let i = 0; i < steps; i++) {
      const py    = y + height - i * stepSize; // capture value now, not reference
      const delay = Math.floor(i * 1.2);
      system.runTimeout(() => {
        try { dimension.spawnParticle('minecraft:totem_particle', { x, y: py, z }); } catch (e) {}
        try {
          dimension.spawnParticle('minecraft:end_rod', { x: x + 0.15, y: py, z: z + 0.15 });
          dimension.spawnParticle('minecraft:end_rod', { x: x - 0.15, y: py, z: z - 0.15 });
        } catch (e) {}
      }, delay);
    }

    // Impact burst when beam hits ground
    const impactDelay = Math.floor(steps * 1.2) + 2;
    system.runTimeout(() => {
      for (let j = 0; j < 16; j++) {
        const angle  = (j / 16) * Math.PI * 2;
        const spread = 0.8 + Math.random() * 1.2;
        try { dimension.spawnParticle('minecraft:totem_particle', { x: x + Math.cos(angle) * spread, y: y + 0.2, z: z + Math.sin(angle) * spread }); } catch (e) {}
        try { dimension.spawnParticle('minecraft:villager_happy', { x: x + Math.cos(angle) * spread * 0.6, y: y + 0.3, z: z + Math.sin(angle) * spread * 0.6 }); } catch (e) {}
      }
    }, impactDelay);
  }

  /**
   * Ring of particles radiating outward — single frame snapshot, no loops or timeouts
   */
  static _spawnBurstRing(dimension, location, radius, y_offset = 1) {
    const count = Math.min(24, Math.floor(radius * 4));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      try {
        dimension.spawnParticle('minecraft:totem_particle', {
          x: location.x + Math.cos(a) * radius,
          y: location.y + y_offset,
          z: location.z + Math.sin(a) * radius
        });
        dimension.spawnParticle('minecraft:end_rod', {
          x: location.x + Math.cos(a) * radius * 0.6,
          y: location.y + y_offset + 0.5,
          z: location.z + Math.sin(a) * radius * 0.6
        });
      } catch (e) {}
    }
  }

  /**
   * Ongoing light zone ring — cheap 8-point ring
   */
  static _spawnLightZoneParticles(dimension, location, radius) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      try {
        dimension.spawnParticle('minecraft:villager_happy', {
          x: location.x + Math.cos(a) * radius,
          y: location.y + 1,
          z: location.z + Math.sin(a) * radius
        });
        dimension.spawnParticle('minecraft:totem_particle', {
          x: location.x + Math.cos(a) * radius * 0.5,
          y: location.y + 1.5,
          z: location.z + Math.sin(a) * radius * 0.5
        });
      } catch (e) {}
    }
    // Rising center pillar (2 particles)
    try {
      dimension.spawnParticle('minecraft:end_rod', { x: location.x, y: location.y + 2, z: location.z });
      dimension.spawnParticle('minecraft:totem_particle', { x: location.x, y: location.y + 3, z: location.z });
    } catch (e) {}
  }

  /**
   * Halo ring above player head for Sword of Light activation
   */
  static _spawnHaloEffect(dimension, location) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      try {
        dimension.spawnParticle('minecraft:totem_particle', {
          x: location.x + Math.cos(a) * 0.6,
          y: location.y + 2.2,
          z: location.z + Math.sin(a) * 0.6
        });
        dimension.spawnParticle('minecraft:end_rod', {
          x: location.x + Math.cos(a) * 1.0,
          y: location.y + 1.0,
          z: location.z + Math.sin(a) * 1.0
        });
      } catch (e) {}
    }
  }

  /**
   * Shield pulse — expanding ring
   */
  static _spawnShieldPulse(dimension, location) {
    for (let r = 1; r <= 3; r++) {
      system.runTimeout(() => {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          try {
            dimension.spawnParticle('minecraft:end_rod', {
              x: location.x + Math.cos(a) * r,
              y: location.y + 1,
              z: location.z + Math.sin(a) * r
            });
          } catch (e) {}
        }
      }, r * 4);
    }
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
        if (this.isUndeadOrEvil(entity)) {
          try { entity.applyDamage(damage); } catch (e) {}
          try {
            entity.addEffect('weakness', 100, { amplifier: 2, showParticles: false });
            entity.addEffect('slowness', 100, { amplifier: 2, showParticles: false });
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  static _restoreBlocks(dimension, blocks) {
    for (const bd of blocks) {
      try {
        dimension.runCommand(`setblock ${bd.location.x} ${bd.location.y} ${bd.location.z} ${bd.originalType}`);
      } catch (e) {}
    }
  }

  // =============================================
  // UNDEAD / EVIL CHECK
  // =============================================
  static isUndeadOrEvil(entity) {
    const undeadTypes = [
      'minecraft:zombie', 'minecraft:zombie_villager', 'minecraft:husk',
      'minecraft:drowned', 'minecraft:skeleton', 'minecraft:stray',
      'minecraft:wither_skeleton', 'minecraft:zombie_pigman',
      'minecraft:zombified_piglin', 'minecraft:phantom', 'minecraft:wither',
      'minecraft:zoglin', 'minecraft:skeleton_horse', 'minecraft:zombie_horse',
      'minecraft:witch', 'minecraft:vex', 'minecraft:evoker',
      'minecraft:vindicator', 'minecraft:pillager', 'minecraft:ravager',
      'minecraft:enderman', 'minecraft:endermite', 'minecraft:shulker'
    ];
    return undeadTypes.includes(entity.typeId);
  }

  // =============================================
  // WEAPON / ARMOR ENCHANTMENTS
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
      const enchants = heldItem.getComponent('minecraft:enchantable');
      if (!enchants) return;
      if (!enchants.hasEnchantment('sharpness'))    enchants.addEnchantment({ type: 'sharpness',   level: 5 });
      if (!enchants.hasEnchantment('smite'))         enchants.addEnchantment({ type: 'smite',       level: 5 });
      if (!enchants.hasEnchantment('fire_aspect'))   enchants.addEnchantment({ type: 'fire_aspect', level: 2 });
      if (!enchants.hasEnchantment('knockback'))     enchants.addEnchantment({ type: 'knockback',   level: 2 });
      inventory.container.setItem(player.selectedSlotIndex, heldItem);
    } catch (e) {}
  }

  static applyArmorEnchantments(player) {
    const inventory = player.getComponent('minecraft:inventory');
    if (!inventory?.container) return;
    const armorSlots = [36, 37, 38, 39];
    for (const slot of armorSlots) {
      const item = inventory.container.getItem(slot);
      if (!item) continue;
      if (!item.typeId.includes('_chestplate') && !item.typeId.includes('_leggings') &&
          !item.typeId.includes('_helmet') && !item.typeId.includes('_boots')) continue;
      try {
        const enchants = item.getComponent('minecraft:enchantable');
        if (!enchants) continue;
        if (!enchants.hasEnchantment('protection'))      enchants.addEnchantment({ type: 'protection',      level: 4 });
        if (!enchants.hasEnchantment('blast_protection'))enchants.addEnchantment({ type: 'blast_protection',level: 4 });
        if (!enchants.hasEnchantment('unbreaking'))      enchants.addEnchantment({ type: 'unbreaking',      level: 3 });
        inventory.container.setItem(slot, item);
      } catch (e) {}
    }
  }

  // =============================================
  // ABILITY DESCRIPTIONS (for menu display)
  // =============================================
  static getAbilityDescription(abilityId) {
    const descs = {
      [this.ABILITIES.LIGHT_OF_DAWN]:
        `§eCost: ${this.LIGHT_OF_DAWN_SPIRIT_COST} Spirit | CD: 30s\n§7Consecrate holy ground, damage & weaken undead`,
      [this.ABILITIES.HURRICANE_OF_LIGHT]:
        `§eCost: ${this.HURRICANE_SPIRIT_COST} Spirit | CD: 2min\n§7Rain down swords of dawn on all enemies`,
      [this.ABILITIES.SWORD_OF_LIGHT]:
        `§eCost: ${this.SWORD_OF_LIGHT_SPIRIT_COST} Spirit | CD: 15s\n§7Channel divine power through your weapon`,
      [this.ABILITIES.SHIELD_OF_LIGHT]:
        `§eCost: ${this.SHIELD_OF_LIGHT_SPIRIT_COST} Spirit | CD: 20s\n§7Raise a divine barrier, massive defense boost`
    };
    return descs[abilityId] || '§7Unknown ability';
  }

  static getAllAbilities(player) {
    // Sequence 6 (Dawn Paladin) gets: Light of Dawn + Hurricane of Light
    // Sequence 5 and below (Guardian+) also get: Sword of Light + Shield of Light
    const sequence = player ? PathwayManager.getSequence(player) : 6;
    const abilities = [
      { id: this.ABILITIES.LIGHT_OF_DAWN,      name: '§6✦ Light of Dawn',      cost: this.LIGHT_OF_DAWN_SPIRIT_COST },
      { id: this.ABILITIES.HURRICANE_OF_LIGHT, name: '§6☀ Hurricane of Light', cost: this.HURRICANE_SPIRIT_COST },
    ];
    if (sequence <= 5) {
      abilities.push(
        { id: this.ABILITIES.SWORD_OF_LIGHT,  name: '§e⚔ Sword of Light',  cost: this.SWORD_OF_LIGHT_SPIRIT_COST },
        { id: this.ABILITIES.SHIELD_OF_LIGHT, name: '§f🛡 Shield of Light', cost: this.SHIELD_OF_LIGHT_SPIRIT_COST }
      );
    }
    return abilities;
  }
}
