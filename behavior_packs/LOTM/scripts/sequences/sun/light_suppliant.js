import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { BardSequence } from './bard.js';

export class LightSuppliantSequence {
  static SEQUENCE_NUMBER = 8;
  static PATHWAY = 'sun';
  
  // Passive ability constants - ENHANCED from Bard
  static EFFECT_DURATION = 999999;
  static SPEED_AMPLIFIER = 2; // Speed III
  static STRENGTH_AMPLIFIER = 2; // Strength III
  static JUMP_AMPLIFIER = 2; // Jump Boost III
  
  // Sunshine ability
  static SUNSHINE_SPIRIT_COST = 35;
  static SUNSHINE_DURATION = 200; // 10 seconds
  static SUNSHINE_RANGE = 20; // blocks
  static SUNSHINE_DAMAGE = 6; // vs undead
  static SUNSHINE_COOLDOWN = 300; // 15 seconds
  static SUNSHINE_LIGHT_LEVEL = 15; // max — reads as the brightest light source in the pack
  
  // Daytime ability
  static DAYTIME_SPIRIT_COST = 40;
  static DAYTIME_DURATION = 300; // 15 seconds
  static DAYTIME_RANGE = 10; // initial 10m, spreads further
  static DAYTIME_SPREAD_RANGE = 30; // total spread
  static DAYTIME_COOLDOWN = 400; // 20 seconds
  static DAYTIME_LIGHT_LEVEL = 15; // same brightness as Sunshine
  static DAYTIME_GRID_SPACING = 12; // blocks between light points — covers the disc without excessive block churn
  static DAYTIME_GRID_RECOMPUTE_TICKS = 40; // 2s — matches the existing damage-tick cadence
  
  // Blessing ability
  static BLESSING_SPIRIT_COST = 30;
  static BLESSING_DURATION = 240; // 12 seconds
  static BLESSING_RANGE = 16; // blocks
  
  // Cleansing Song (new)
  static CLEANSING_SPIRIT_COST = 35;
  static CLEANSING_SONG_DURATION = 200; // 10 seconds
  static CLEANSING_RANGE = 20; // blocks
  
  // Tracking
  static sunshineCooldowns = new Map();
  static daytimeCooldowns = new Map();
  static activeSunshines = new Map(); // player name -> {location, dimension, ticksRemaining, lightPos}
  static activeDaytimes = new Map(); // player name -> {location, dimension, ticksRemaining, lightPositions}
  static selectedOrbAbility = new Map(); // player name -> ability id (Solar Orb quick-cast)

  // Ability identifiers
  static ABILITIES = {
    SUNSHINE: 'sunshine',
    BLESSING: 'blessing',
    DAYTIME: 'daytime',
    SONG_OF_CLEANSING: 'song_of_cleansing' // New song
  };

  // Dynamic property for persistence — same pattern as BardSequence's
  // SELECTED_SONG_PROPERTY
  static SELECTED_ORB_PROPERTY = 'lotm:light_suppliant_selected_orb';

  /**
   * Load selected Solar Orb ability from player dynamic properties
   */
  static loadSelectedOrbAbility(player) {
    try {
      const selected = player.getDynamicProperty(this.SELECTED_ORB_PROPERTY);
      if (selected) {
        this.selectedOrbAbility.set(player.name, selected);
      }
    } catch (e) {
      // Failed
    }
  }

  /**
   * Save selected Solar Orb ability to player dynamic properties
   */
  static saveSelectedOrbAbility(player) {
    try {
      const selected = this.selectedOrbAbility.get(player.name);
      if (selected) {
        player.setDynamicProperty(this.SELECTED_ORB_PROPERTY, selected);
      }
    } catch (e) {
      // Failed
    }
  }

  /**
   * Get selected Solar Orb ability
   */
  static getSelectedOrbAbility(player) {
    return this.selectedOrbAbility.get(player.name) || this.ABILITIES.SUNSHINE;
  }

  /**
   * Set selected Solar Orb ability
   */
  static setSelectedOrbAbility(player, abilityId) {
    this.selectedOrbAbility.set(player.name, abilityId);
    this.saveSelectedOrbAbility(player);
    return true;
  }

  /**
   * Quick-cast whichever Solar Orb ability was last selected in the menu —
   * used by the item's plain (non-sneak) use.
   */
  static useSelectedOrbAbility(player) {
    return this.handleAbilityUse(player, this.getSelectedOrbAbility(player));
  }

  /**
   * Check if player has this sequence
   */
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) === this.SEQUENCE_NUMBER;
  }
  
  /**
   * Apply passive abilities
   */
  static applyPassiveAbilities(player) {
    // if (!this.hasSequence(player)) return;

    // NOTE: deliberately NOT calling BardSequence.processSongs here —
    // main.js already calls BardSequence.tickAbilityState unconditionally
    // for every player, so this would double-tick song duration for a real
    // Light Suppliant specifically.

    // Load Bard's selected song
    if (!BardSequence.selectedSongs.has(player.name)) {
      BardSequence.loadSelectedSong(player);
    }

    // Load own selected Solar Orb ability
    if (!this.selectedOrbAbility.has(player.name)) {
      this.loadSelectedOrbAbility(player);
    }

    // Enhanced physical abilities
    this.applyPhysicalEnhancements(player);
    
    // Health bonus (2 extra hearts for Sequence 8)
    this.applyHealthBonus(player, 4);
    
    // Night Vision (permanent)
    const nightVision = player.getEffect('night_vision');
    if (!nightVision || nightVision.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }
    
    // Evil Detection - apply glowing to undead in range
    this.applyEvilDetection(player);

    // Deliberately NOT calling tickAbilityState here — main.js already calls
    // it unconditionally for every player (real Light Suppliant or grazer
    // alike), so calling it again here would double-tick Sunshine/Daytime
    // duration and cooldowns for a real Light Suppliant specifically.
  }

  // Ongoing ability state — safe to call for ANY player, each method here
  // self-gates via its own Map.get(player.name) check. Called ONLY
  // unconditionally from main.js for every player (not from
  // applyPassiveAbilities above — see note there) so a grazed/
  // Creeping-Hunger-borrowed Sunshine/Daytime is processed identically for
  // real members and grazers alike, with no double-ticking.
  // NOTE: deliberately does NOT include BardSequence.processSongs — that's
  // handled separately by BardSequence.tickAbilityState; bundling it here
  // would give Sunshine grazers Bard's song processing for free.
  static tickAbilityState(player) {
    this.processSunshine(player);
    this.processDaytime(player);
    this.tickCooldowns(player);
  }
  
  /**
   * Apply enhanced physical abilities
   */
  static applyPhysicalEnhancements(player) {
    // Speed III
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, {
        amplifier: this.SPEED_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Strength III
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, {
        amplifier: this.STRENGTH_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Jump Boost III
    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, {
        amplifier: this.JUMP_AMPLIFIER,
        showParticles: false
      });
    }
  }
  
  /**
   * Apply health bonus
   */
  static applyHealthBonus(player, bonusHearts) {
    const healthBoost = player.getEffect('health_boost');
    const amplifier = bonusHearts - 1;
    
    if (!healthBoost || healthBoost.amplifier !== amplifier || healthBoost.duration < 200) {
      player.addEffect('health_boost', this.EFFECT_DURATION, {
        amplifier: amplifier,
        showParticles: false
      });
    }
  }
  
  /**
   * Evil Detection - sense undead/evil nearby
   */
  static applyEvilDetection(player) {
    // Every 2 seconds, check for undead
    if (world.getAbsoluteTime() % 40 !== 0) return;
    
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: 32,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      
      for (const entity of entities) {
        if (this.isUndeadOrEvil(entity)) {
          // Apply glowing for detection
          entity.addEffect('glowing', 100, { 
            amplifier: 0, 
            showParticles: false 
          });
        }
      }
    } catch (e) {
      // Failed
    }
  }
  
  /**
   * Check if entity is undead or evil
   */
  static isUndeadOrEvil(entity) {
    const evilTypes = [
      'minecraft:zombie', 'minecraft:zombie_villager', 'minecraft:husk',
      'minecraft:drowned', 'minecraft:skeleton', 'minecraft:stray',
      'minecraft:wither_skeleton', 'minecraft:zombie_pigman',
      'minecraft:zombified_piglin', 'minecraft:phantom', 'minecraft:wither',
      'minecraft:zoglin', 'minecraft:witch', 'minecraft:vex', 
      'minecraft:evoker', 'minecraft:vindicator', 'minecraft:pillager',
      'minecraft:enderman', 'minecraft:endermite', 'minecraft:shulker',
      'lotm:vengeful_ghost', 'lotm:ghoul', 'lotm:poltergeist'
    ];

    return evilTypes.includes(entity.typeId);
  }
  
  /**
   * Tick down cooldowns
   */
  static tickCooldowns(player) {
    const sunshineCd = this.sunshineCooldowns.get(player.name);
    if (sunshineCd && sunshineCd > 0) {
      this.sunshineCooldowns.set(player.name, sunshineCd - 1);
    }
    
    const daytimeCd = this.daytimeCooldowns.get(player.name);
    if (daytimeCd && daytimeCd > 0) {
      this.daytimeCooldowns.set(player.name, daytimeCd - 1);
    }
  }
  
  /**
   * Use Sunshine - create scorching sun that damages undead
   */
  static useSunshine(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.sunshineCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cSunshine on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.SUNSHINE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.SUNSHINE_SPIRIT_COST}`);
      return false;
    }
    
    // Real light source — placed at the same height as the sun particles
    // below (y+5), matching the vanilla-light_block technique proven by
    // FireMoteSystem. Unlike the mote, Sunshine never moves once cast, so
    // this is just place-on-cast/clear-on-expiry — none of the mote's
    // move-threshold trail-avoidance logic is needed. Uses the visible
    // lotm:sunshine_orb block (not the invisible vanilla light_block Daytime
    // uses) — the orb itself IS the "mini sun" visual, replacing the old
    // particle sphere entirely.
    const lightPos = {
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y) + 5,
      z: Math.floor(player.location.z)
    };
    const lightPlaced = this._placeSunOrb(player.dimension, lightPos);

    // Create sunshine
    this.activeSunshines.set(player.name, {
      location: player.location,
      dimension: player.dimension,
      ticksRemaining: this.SUNSHINE_DURATION,
      lightPos: lightPlaced ? lightPos : null
    });
    
    player.sendMessage('§e§l☀ SUNSHINE! ☀');
    player.playSound('beacon.activate', { pitch: 1.5, volume: 1.0 });
    
    // Set cooldown
    this.sunshineCooldowns.set(player.name, this.SUNSHINE_COOLDOWN);
    
    return true;
  }
  
  /**
   * Process Sunshine each tick
   */
  static processSunshine(player) {
    const sunshine = this.activeSunshines.get(player.name);
    if (!sunshine) return;
    
    sunshine.ticksRemaining--;

    // Orbiting motes around the sun orb — no particle sphere anymore, the
    // placed lotm:sunshine_orb block IS the main visual, this is just a
    // continuous accent circling it. Advances a tracked angle each cycle
    // (rather than picking random points) so it reads as one mote actually
    // flying in a circle, not a flicker.
    if (sunshine.lightPos) {
      sunshine.orbitAngle = (sunshine.orbitAngle || 0) + 0.2;
      const orbitRadius = 1.2;
      // 2 motes opposite each other on the same orbit, every tick — denser
      // trail than the original single-mote/every-2-ticks version.
      for (let i = 0; i < 2; i++) {
        const angle = sunshine.orbitAngle + i * Math.PI;
        try {
          sunshine.dimension.spawnParticle('lotm:sunlight_mote', {
            x: sunshine.lightPos.x + 0.5 + Math.cos(angle) * orbitRadius,
            y: sunshine.lightPos.y + 0.5,
            z: sunshine.lightPos.z + 0.5 + Math.sin(angle) * orbitRadius
          });
        } catch (_) {}
      }
    }

    // Damage undead every second
    if (sunshine.ticksRemaining % 20 === 0) {
      this.applySunshineDamage(sunshine.dimension, sunshine.location, sunshine.lightPos);
    }
    
    // Blind nearby entities every 2 seconds
    if (sunshine.ticksRemaining % 40 === 0) {
      this.applySunshineBlind(sunshine.dimension, sunshine.location);
    }
    
    // End sunshine
    if (sunshine.ticksRemaining <= 0) {
      if (sunshine.lightPos) this._clearSunOrb(sunshine.dimension, sunshine.lightPos);
      this.activeSunshines.delete(player.name);
      player.sendMessage('§7The sunshine fades...');
    }
  }

  // Places/clears the visible lotm:sunshine_orb block — same safe
  // never-overwrite-real-blocks pattern as _placeLight/_clearLight below,
  // just a real custom block (with its own minecraft:light_emission) instead
  // of the vanilla light_block state hack, so no state-bracket syntax needed.
  static _placeSunOrb(dimension, pos) {
    try {
      const block = dimension.getBlock(pos);
      if (!block || !block.isAir) return false;
      dimension.runCommand(`setblock ${pos.x} ${pos.y} ${pos.z} lotm:sunshine_orb`);
      return true;
    } catch (_) { return false; }
  }

  static _clearSunOrb(dimension, pos) {
    try {
      const block = dimension.getBlock(pos);
      if (!block || block.isAir) return;
      dimension.runCommand(`setblock ${pos.x} ${pos.y} ${pos.z} air`);
    } catch (_) {}
  }

  // Same safe place/clear pattern as FireMoteSystem (world/fireMoteSystem.js)
  // — duplicated locally rather than imported, matching this codebase's
  // convention of not cross-importing between unrelated systems for a
  // couple of shared lines (see spiritSystem.js/knifeReserveSystem.js).
  // Used by Daytime's invisible-light grid (SUNSHINE_LIGHT_LEVEL/
  // DAYTIME_LIGHT_LEVEL) — Sunshine itself now uses the visible orb above.
  static _placeLight(dimension, pos, level) {
    try {
      const block = dimension.getBlock(pos);
      if (!block || !block.isAir) return false; // never overwrite real blocks
      dimension.runCommand(`setblock ${pos.x} ${pos.y} ${pos.z} minecraft:light_block["block_light_level"=${level}]`);
      return true;
    } catch (_) { return false; }
  }

  // Ground-height scan for Daytime's grid points — same feet/head-air,
  // ground-solid shape as TravelerSequence.findSafeTeleportLocation, just
  // returning a bare Y instead of a full teleport-safe location object.
  // Skips the grid point entirely (see _updateDaytimeLights) if terrain
  // near baseY doesn't offer a clean spot — acceptable for a decorative
  // light grid, unlike a teleport destination which must always resolve.
  static _findGroundY(dimension, x, baseY, z) {
    for (let dy = 4; dy >= -6; dy--) {
      const y = baseY + dy;
      try {
        const feet = dimension.getBlock({ x, y, z });
        const head = dimension.getBlock({ x, y: y + 1, z });
        const ground = dimension.getBlock({ x, y: y - 1, z });
        if (feet && head && ground &&
            (feet.isAir || feet.isLiquid) && (head.isAir || head.isLiquid) &&
            !ground.isAir && !ground.isLiquid) {
          return y;
        }
      } catch (_) {}
    }
    return null;
  }

  // Sparse grid of {x,z} points covering a disc of the given radius around
  // center, spaced DAYTIME_GRID_SPACING apart — deliberately not a dense
  // fill (would mean dozens of /setblock calls every recompute at the full
  // 30-block spread range).
  static _computeDaytimeGrid(center, radius) {
    const points = [];
    for (let dx = -radius; dx <= radius; dx += this.DAYTIME_GRID_SPACING) {
      for (let dz = -radius; dz <= radius; dz += this.DAYTIME_GRID_SPACING) {
        if (dx * dx + dz * dz <= radius * radius) {
          points.push({ x: Math.floor(center.x + dx), z: Math.floor(center.z + dz) });
        }
      }
    }
    return points;
  }

  // Rebuilds Daytime's light grid to match the current spread progress —
  // clears the previous (smaller) grid first, then places a fresh one at
  // the new radius. Called on cast and every DAYTIME_GRID_RECOMPUTE_TICKS
  // from processDaytime, not every tick — block placement is heavier than
  // particles, matching FireMoteSystem's distance-gated (not tick-gated)
  // placement reasoning.
  static _updateDaytimeLights(daytime) {
    for (const pos of daytime.lightPositions) this._clearLight(daytime.dimension, pos);
    daytime.lightPositions = [];

    const progress = 1 - (daytime.ticksRemaining / this.DAYTIME_DURATION);
    const currentRange = this.DAYTIME_RANGE + (this.DAYTIME_SPREAD_RANGE - this.DAYTIME_RANGE) * progress;
    const baseY = Math.floor(daytime.location.y);

    for (const p of this._computeDaytimeGrid(daytime.location, currentRange)) {
      const y = this._findGroundY(daytime.dimension, p.x, baseY, p.z);
      if (y === null) continue;
      const pos = { x: p.x, y, z: p.z };
      if (this._placeLight(daytime.dimension, pos, this.DAYTIME_LIGHT_LEVEL)) {
        daytime.lightPositions.push(pos);
      }
    }
  }

  static _clearLight(dimension, pos) {
    try {
      const block = dimension.getBlock(pos);
      // See FireMoteSystem._clearLight — a placed light_block can report
      // back under a different internal typeId, so an exact match is
      // unreliable. Anything non-air at our own tracked position is safe
      // to clear, since we only ever write to positions we recorded.
      if (!block || block.isAir) return;
      dimension.runCommand(`setblock ${pos.x} ${pos.y} ${pos.z} air`);
    } catch (_) {}
  }

  /**
   * Apply sunshine damage to undead
   */
  static applySunshineDamage(dimension, location, orbPos) {
    try {
      const entities = dimension.getEntities({
        location: location,
        maxDistance: this.SUNSHINE_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });

      for (const entity of entities) {
        if (this.isUndeadOrEvil(entity)) {
          entity.applyDamage(this.SUNSHINE_DAMAGE);
          entity.setOnFire(2, true);
          if (orbPos) this._spawnSunBeam(dimension, orbPos, entity.location);
        }
      }
    } catch (e) {
      // Failed
    }
  }

  // Short mote trail from the sun orb to a damaged target — visualizes the
  // sun "attacking" that specific mob, rather than just a generic area tick.
  static _spawnSunBeam(dimension, from, to) {
    try {
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        dimension.spawnParticle('lotm:sunlight_mote', {
          x: from.x + 0.5 + (to.x - from.x) * t,
          y: from.y + 0.5 + (to.y - from.y) * t,
          z: from.z + 0.5 + (to.z - from.z) * t
        });
      }
    } catch (_) {}
  }
  
  /**
   * Apply sunshine blindness effect
   */
  static applySunshineBlind(dimension, location) {
    try {
      const entities = dimension.getEntities({
        location: location,
        maxDistance: this.SUNSHINE_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      
      for (const entity of entities) {
        entity.addEffect('blindness', 40, {
          amplifier: 0,
          showParticles: true
        });
      }
    } catch (e) {
      // Failed
    }
  }
  
  /**
   * Use Blessing - protect allies from fear, cold, darkness, death
   */
  static useBlessing(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.BLESSING_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.BLESSING_SPIRIT_COST}`);
      return false;
    }
    
    // Apply blessing to nearby players
    const players = player.dimension.getPlayers({
      location: player.location,
      maxDistance: this.BLESSING_RANGE
    });
    
    for (const targetPlayer of players) {
      // Remove negative effects
      targetPlayer.removeEffect('wither');
      targetPlayer.removeEffect('poison');
      targetPlayer.removeEffect('weakness');
      targetPlayer.removeEffect('slowness');
      targetPlayer.removeEffect('blindness');
      
      // Grant protective buffs
      targetPlayer.addEffect('resistance', this.BLESSING_DURATION, {
        amplifier: 2,
        showParticles: true
      });
      
      targetPlayer.addEffect('fire_resistance', this.BLESSING_DURATION, {
        amplifier: 0,
        showParticles: false
      });
      
      // Extra damage vs undead (Strength II)
      targetPlayer.addEffect('strength', this.BLESSING_DURATION, {
        amplifier: 1,
        showParticles: true
      });
      
      // Visual effect
      targetPlayer.dimension.spawnParticle('minecraft:totem_particle', {
        x: targetPlayer.location.x,
        y: targetPlayer.location.y + 1,
        z: targetPlayer.location.z
      });
      
      if (targetPlayer.id !== player.id) {
        targetPlayer.sendMessage('§e§oYou feel blessed by holy light!');
      }
    }
    
    player.sendMessage('§e§lBlessing granted!');
    player.playSound('random.levelup', { pitch: 1.2, volume: 1.0 });
    
    return true;
  }
  
  /**
   * Use Daytime - create spreading light zone
   */
  static useDaytime(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check cooldown
    const cooldown = this.daytimeCooldowns.get(player.name) || 0;
    if (cooldown > 0) {
      player.sendMessage(`§cDaytime on cooldown: ${Math.ceil(cooldown / 20)}s`);
      return false;
    }
    
    // Consume spirit
    if (!SpiritSystem.consumeSpirit(player, this.DAYTIME_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.DAYTIME_SPIRIT_COST}`);
      return false;
    }
    
    // Create daytime zone
    const daytimeState = {
      location: player.location,
      dimension: player.dimension,
      ticksRemaining: this.DAYTIME_DURATION,
      lightPositions: []
    };
    this.activeDaytimes.set(player.name, daytimeState);
    this._updateDaytimeLights(daytimeState); // light the initial (smallest) radius immediately

    player.sendMessage('§e§lLet there be light!');
    player.playSound('beacon.activate', { pitch: 1.0, volume: 1.0 });
    
    // Set cooldown
    this.daytimeCooldowns.set(player.name, this.DAYTIME_COOLDOWN);
    
    return true;
  }
  
  /**
   * Process Daytime each tick
   */
  static processDaytime(player) {
    const daytime = this.activeDaytimes.get(player.name);
    if (!daytime) return;
    
    daytime.ticksRemaining--;

    // Subtle boundary marker — the area itself is now genuinely lit via the
    // light grid below, so this is just a faint edge indicator, not the
    // primary "it's lit" signal. Two motes on opposite sides of the circle,
    // both advancing a shared tracked angle each cycle — reads as actually
    // flying around the boundary rather than a static ring popping in/out.
    if (daytime.ticksRemaining % 2 === 0) {
      daytime.boundaryAngle = (daytime.boundaryAngle || 0) + 0.25;
      const progress = 1 - (daytime.ticksRemaining / this.DAYTIME_DURATION);
      const currentRange = this.DAYTIME_RANGE + (this.DAYTIME_SPREAD_RANGE - this.DAYTIME_RANGE) * progress;

      for (let i = 0; i < 3; i++) {
        const angle = daytime.boundaryAngle + i * (Math.PI * 2 / 3);
        try {
          daytime.dimension.spawnParticle('lotm:sunlight_mote', {
            x: daytime.location.x + Math.cos(angle) * currentRange,
            y: daytime.location.y + 1,
            z: daytime.location.z + Math.sin(angle) * currentRange
          });
        } catch (_) {}
      }
    }

    // Apply light effects + rebuild the light grid to match the current
    // spread radius (every 2 seconds — see DAYTIME_GRID_RECOMPUTE_TICKS)
    if (daytime.ticksRemaining % this.DAYTIME_GRID_RECOMPUTE_TICKS === 0) {
      this.applyDaytimeEffects(daytime.dimension, daytime.location);
      this._updateDaytimeLights(daytime);
    }

    // End daytime
    if (daytime.ticksRemaining <= 0) {
      for (const pos of daytime.lightPositions) this._clearLight(daytime.dimension, pos);
      this.activeDaytimes.delete(player.name);
      player.sendMessage('§7The light fades...');
    }
  }
  
  /**
   * Apply daytime light effects
   */
  static applyDaytimeEffects(dimension, location) {
    try {
      const entities = dimension.getEntities({
        location: location,
        maxDistance: this.DAYTIME_SPREAD_RANGE,
        excludeTypes: ['minecraft:item']
      });
      
      for (const entity of entities) {
        if (this.isUndeadOrEvil(entity)) {
          // Damage undead in the light
          entity.applyDamage(3);
          entity.addEffect('weakness', 40, {
            amplifier: 1,
            showParticles: true
          });
        } else if (entity.typeId === 'minecraft:player') {
          // Buff players in the light
          entity.addEffect('regeneration', 40, {
            amplifier: 0,
            showParticles: false
          });
        }
      }
    } catch (e) {
      // Failed
    }
  }
  
  /**
   * Use Song of Cleansing (NEW) - removes debuffs from allies
   */
  static useSongOfCleansing(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    // Check if already singing
    if (BardSequence.activeSongs.has(player.name)) {
      player.sendMessage('§cYou are already performing a song!');
      return false;
    }
    
    // Consume spirit (cheaper than Bard's songs due to ritualistic knowledge)
    if (!SpiritSystem.consumeSpirit(player, this.CLEANSING_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.CLEANSING_SPIRIT_COST}`);
      return false;
    }
    
    // Start the song using Bard's system
    BardSequence.activeSongs.set(player.name, {
      type: this.ABILITIES.SONG_OF_CLEANSING,
      ticksRemaining: this.CLEANSING_SONG_DURATION,
      playerLocation: player.location
    });
    
    player.sendMessage('§a♪ You begin singing a song of cleansing... ♪');
    player.playSound('note.harp', { pitch: 1.4, volume: 1.0 });
    
    return true;
  }
  
  /**
   * Handle ability usage
   */
  static handleAbilityUse(player, abilityId) {
    // Check for Light Suppliant abilities first
    switch (abilityId) {
      case this.ABILITIES.SUNSHINE:
        return this.useSunshine(player);
      case this.ABILITIES.BLESSING:
        return this.useBlessing(player);
      case this.ABILITIES.DAYTIME:
        return this.useDaytime(player);
      case this.ABILITIES.SONG_OF_CLEANSING:
        return this.useSongOfCleansing(player);
      default:
        // Fall back to Bard songs - use the song directly
        return BardSequence.useSong(player, abilityId);
    }
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.SUNSHINE]: 
        `§7Cost: ${this.SUNSHINE_SPIRIT_COST} Spirit\n§7Create scorching sun (10s)\n§7Damages and blinds enemies`,
      [this.ABILITIES.BLESSING]:
        `§7Cost: ${this.BLESSING_SPIRIT_COST} Spirit\n§7Protect allies from evil\n§7Remove debuffs, grant buffs`,
      [this.ABILITIES.DAYTIME]:
        `§7Cost: ${this.DAYTIME_SPIRIT_COST} Spirit\n§7Create spreading light (15s)\n§7Damages undead, heals allies`,
      [this.ABILITIES.SONG_OF_CLEANSING]:
        `§7Cost: ${this.CLEANSING_SPIRIT_COST} Spirit\n§7Remove all debuffs from allies\n§7Enhanced by ritualistic knowledge`
    };
    return descriptions[abilityId] || BardSequence.getAbilityDescription(abilityId);
  }
  
  /**
   * Get all available songs (includes Bard + new cleansing)
   */
  static getAllSongs() {
    const bardSongs = BardSequence.getAllSongs();
    return [
      ...bardSongs,
      {
        id: this.ABILITIES.SONG_OF_CLEANSING,
        name: '§aSong of Cleansing',
        description: 'Removes all debuffs from allies',
        cost: this.CLEANSING_SPIRIT_COST
      }
    ];
  }
  
  /**
   * Clean up effects
   */
  static removeEffects(player) {
    BardSequence.removeEffects(player);
    player.removeEffect('night_vision');
    const sunshine = this.activeSunshines.get(player.name);
    if (sunshine?.lightPos) this._clearSunOrb(sunshine.dimension, sunshine.lightPos);
    this.activeSunshines.delete(player.name);
    const daytime = this.activeDaytimes.get(player.name);
    if (daytime?.lightPositions) {
      for (const pos of daytime.lightPositions) this._clearLight(daytime.dimension, pos);
    }
    this.activeDaytimes.delete(player.name);
    this.sunshineCooldowns.delete(player.name);
    this.daytimeCooldowns.delete(player.name);
  }

  // Disconnect mid-Sunshine/Daytime — no live Player object at this point
  // (mirrors FireMoteSystem.cleanup), so this can't go through
  // removeEffects, which needs one. Called from main.js's
  // world.afterEvents.playerLeave.
  static cleanupSunshineLight(playerName) {
    const sunshine = this.activeSunshines.get(playerName);
    if (sunshine?.lightPos) {
      try { this._clearSunOrb(sunshine.dimension, sunshine.lightPos); } catch (_) {}
    }
    this.activeSunshines.delete(playerName);

    const daytime = this.activeDaytimes.get(playerName);
    if (daytime?.lightPositions) {
      for (const pos of daytime.lightPositions) {
        try { this._clearLight(daytime.dimension, pos); } catch (_) {}
      }
    }
    this.activeDaytimes.delete(playerName);
  }
}
