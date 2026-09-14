import { world, system, EffectTypes } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { ApprenticeSequence } from './apprentice.js';

export class TrickmasterSequence {
  static SEQUENCE_NUMBER = 8;
  static PATHWAY = 'door';
  
  // Passive ability constants - ENHANCED from Apprentice
  // Rebalanced 2026-09-08: Speed/Jump dropped III→II, added Strength I,
  // Regeneration dropped II→I (was buffed hard, no Strength at all).
  static EFFECT_DURATION = 999999;
  static STRENGTH_AMPLIFIER = 0; // Strength I (new)
  static SPEED_AMPLIFIER = 1; // Speed II (was III)
  static JUMP_AMPLIFIER = 1; // Jump Boost II (was III)
  static REGEN_AMPLIFIER = 0; // Regeneration I (was II)
  
  // Quick Step ability — sprint-triggered forward charge (renamed 2026-09-02
  // from "Tumble": decompiling LOTMC showed the real "Trick: Tumble" is a
  // completely different ability — an AoE trip debuff on nearby enemies,
  // see TUMBLE_TRIP_* below and useTumble. This self-dash never had a real
  // source-material equivalent — closest is "Trick: Escape Trick" (a
  // reactive auto-dodge-on-hit, not a sprint dash either) — so it's just
  // named for what it actually does now instead of borrowing a name that
  // means something else.
  //
  // Was originally a stepped-teleport (same technique as Judge's Death
  // charge, judge.js useDeath) but that felt like stuttering to the player
  // controlling the camera — repeated player.teleport() calls are instant
  // position snaps with no client-side interpolation, so 10 of them a
  // second reads as rapid micro-jumps rather than smooth motion. Death
  // gets away with this because it's a short scripted charge the player
  // watches happen; Quick Step is the player's own first-person view being
  // flung around every tick, which is much more perceptible. Switched to a
  // single real velocity impulse (player.applyImpulse) instead — the
  // client's own movement prediction renders that smoothly, same as
  // sprinting or jumping normally would.
  static QUICK_STEP_SPIRIT_COST = 10;
  static QUICK_STEP_IMPULSE_STRENGTH = 1.6; // horizontal impulse magnitude
  static QUICK_STEP_IMPULSE_LIFT = 0.15; // small upward component so ground friction doesn't immediately kill it
  static QUICK_STEP_COOLDOWN = 200; // 10 seconds

  // Tumble ability — the REAL LOTMC "Trick: Tumble": an AoE trip/debuff on
  // every non-ally within radius. Amplifying each target's own existing
  // velocity ("trip forward") isn't portable — Bedrock's stable Script API
  // has no entity velocity getter — so this fakes the same "stumble then
  // can't move" feel with an outward knockback burst + a heavy Slowness/
  // Mining Fatigue lock, matching how other pathways in this pack already
  // fake "root"/"stun" (e.g. Justiciar's Imprison/Requiem).
  static TUMBLE_TRIP_SPIRIT_COST = 35;
  static TUMBLE_TRIP_COOLDOWN = 240; // 12 seconds
  static TUMBLE_TRIP_RADIUS = 12;
  static TUMBLE_TRIP_DURATION = 60; // 3 seconds
  
  // Flashbang ability
  static FLASHBANG_SPIRIT_COST = 20;
  static FLASHBANG_RANGE = 10;
  static FLASHBANG_BLIND_DURATION = 100; // 5 seconds
  
  // Burning ability
  static BURNING_SPIRIT_COST = 15;
  static BURNING_RANGE = 20;
  
  // Electric Shock ability — rebuilt 2026-09-02 to match LOTMC's real
  // "Trick: Electric Shock" (decompiled from net.swimmingtuna.lotm): a
  // TOGGLE, not a ranged bolt-strike. While active, every melee hit procs
  // a brief stun + spark burst on the target for a per-hit spirit cost;
  // the toggle itself is free but has a short cooldown so it can't be
  // spammed. See onMeleeHit below (hooked from main.js's entityHitEntity).
  static ELECTRIC_SHOCK_TOGGLE_COOLDOWN = 20; // 1s between toggles
  static ELECTRIC_SHOCK_BASE_COST = 20; // per-hit cost: 20 - sequence*2
  static ELECTRIC_SHOCK_STUN_TICKS = 15; // ~0.75s "very brief" stun

  // Wind ability — added 2026-09-02, matching LOTMC's "Trick: Wind": a
  // 70°-cone AoE in front of the caster, push (away) or pull (toward).
  // Split into two Bag of Tricks modes instead of a sneak-branch (sneak
  // is already reserved for cycling modes on this item).
  static WIND_SPIRIT_COST = 40;
  static WIND_RADIUS = 8;
  static WIND_FOV_DEGREES = 70;

  // Freeze ability
  static FREEZE_SPIRIT_COST = 20;
  static FREEZE_RAY_RANGE = 20;
  static FREEZE_AOE_RANGE = 18;
  static FREEZE_DURATION = 100; // 5 seconds

  // Track active effects and cooldowns
  static quickStepCooldowns = new Map(); // player name -> ticks remaining
  static quickStepWasSprinting = new Map(); // player name -> was sprinting last tick (rising-edge trigger)
  static tumbleTripCooldowns = new Map(); // player name -> ticks remaining
  static electricShockActive = new Map(); // player name -> boolean
  static electricShockCooldowns = new Map(); // player name -> ticks remaining (toggle spam guard)
  static freezeMode = new Map(); // player name -> 'ray' or 'aoe' — kept for
  // the graze system (grazeRegistry.js calls useFreeze directly, which
  // reads this), NOT used by the Bag of Tricks below — that item cycles
  // freeze_ray/freeze_aoe as two of its own top-level modes instead.

  // Ability identifiers
  static ABILITIES = {
    TUMBLE: 'tumble',
    FLASHBANG: 'flashbang',
    BURNING: 'burning',
    ELECTRIC_SHOCK: 'electric_shock',
    FREEZE_RAY: 'freeze_ray',
    FREEZE_AOE: 'freeze_aoe',
    WIND_PUSH: 'wind_push',
    WIND_PULL: 'wind_pull'
  };

  // ── Bag of Tricks — consolidated item (2026-09-01) ─────────────────────────
  // Replaces the 4 separate items (Flashbang/Flame Fingers/Spark Crystal/
  // Frost Stone) with one item that cycles modes, matching the pattern
  // already used everywhere else in this pack (Sheriff's Badge, Judge's
  // Gavel, etc: sneak+use cycles, plain use fires). The underlying
  // useFlashbang/useBurning/useFreezeRay/useFreezeAOE methods are unchanged
  // and still directly callable (Astrologer's dead-code handleAbilityUse
  // fallback and the graze system both reference them by name), this just
  // adds a new front door onto the same abilities. useLightning was fully
  // replaced by useElectricShock (2026-09-02, see below) to match LOTMC's
  // real ability; useWindPush/useWindPull are new additions.
  static MODES = ['flashbang', 'burning', 'electric_shock', 'freeze_ray', 'freeze_aoe', 'wind_push', 'wind_pull', 'tumble'];
  static MODE_LABELS = {
    flashbang:      '§f[Flashbang]',
    burning:        '§c[Burning]',
    electric_shock: '§e[Electric Shock]',
    freeze_ray:     '§b[Freeze Ray]',
    freeze_aoe:     '§3[Frost Aura]',
    wind_push:      '§a[Wind: Push]',
    wind_pull:      '§a[Wind: Pull]',
    tumble:         '§d[Tumble]',
  };
  static bagModes = new Map(); // player name -> mode index
  
  /**
   * Check if player has this sequence
   */
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }
  
  /**
   * Apply passive abilities
   */
  static applyPassiveAbilities(player) {
    // if (!this.hasSequence(player)) return;
    
    // Enhanced mobility
    this.applyMobilityEnhancements(player);
    
    // Health bonus (2 extra hearts for Sequence 8)
    this.applyHealthBonus(player, 4);

    // Handle Quick Step dash — stays real-Trickmaster-gated here (sprint-
    // triggered ambient perk, not a manually cast/graze-relevant ability).
    this.handleQuickStepDash(player);

    // Night Vision (see in darkness like dawn light)
    const nightVision = player.getEffect('night_vision');
    if (!nightVision || nightVision.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, {
        amplifier: 0,
        showParticles: false
      });
    }

    const regen = player.getEffect('regeneration');
    if (!regen || regen.amplifier !== this.REGEN_AMPLIFIER || regen.duration < 200) {
      player.addEffect('regeneration', this.EFFECT_DURATION, {
        amplifier: this.REGEN_AMPLIFIER,
        showParticles: false
      });
    }
  }

  /**
   * Apply enhanced mobility
   */
  static applyMobilityEnhancements(player) {
    // Strength I (always active) — new 2026-09-08, Trickmaster previously
    // had no Strength at all.
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, {
        amplifier: this.STRENGTH_AMPLIFIER,
        showParticles: false
      });
    }

    // Speed II (always active) — Quick Step no longer overrides this with
    // a temporary Speed IV buff, it's a one-shot dash now (see handleQuickStepDash).
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, {
        amplifier: this.SPEED_AMPLIFIER,
        showParticles: false
      });
    }

    // Jump Boost II (always active)
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
   * Tick down cooldowns
   */
  static tickCooldowns(player) {
    const cooldown = this.quickStepCooldowns.get(player.name);
    if (cooldown && cooldown > 0) {
      this.quickStepCooldowns.set(player.name, cooldown - 1);
    }
    const tripCd = this.tumbleTripCooldowns.get(player.name);
    if (tripCd && tripCd > 0) {
      this.tumbleTripCooldowns.set(player.name, tripCd - 1);
    }
    const shockCd = this.electricShockCooldowns.get(player.name);
    if (shockCd && shockCd > 0) {
      this.electricShockCooldowns.set(player.name, shockCd - 1);
    }
  }

  /**
   * Ability-state ticking (Quick Step/Tumble cooldowns). Called
   * unconditionally every tick from main.js so a real higher-tier player
   * (who inherits Trickmaster's kit, e.g. a real Astrologer) still gets it
   * ticked — previously only Trickmaster's own exact-sequence
   * applyPassiveAbilities ticked this. Flashbang/Burning/Electric Shock
   * proc/Freeze/Wind have no cooldown Maps of their own (spirit cost is
   * their only gate), so there's nothing else to tick here.
   */
  static tickAbilityState(player) {
    this.tickCooldowns(player);
  }

  /**
   * Handle Quick Step dash when sprinting — a quick forward charge via
   * repeated small teleport steps (0.5 blocks/tick), same technique as
   * Judge's Death charge (judge.js useDeath). Purely mobility — unlike
   * Death, this never hunts for a target or deals damage, it just moves
   * the player forward fast in whatever direction they're currently
   * facing. Cooldown is set immediately on trigger (matching Death), so
   * there's no need for a separate "dash in progress" flag — the ~0.5s
   * step loop finishes long before the 10s cooldown would allow a
   * re-trigger anyway.
   *
   * Rising-edge trigger only (2026-09-09 fix): this only fires the tick a
   * player TRANSITIONS from not-sprinting to sprinting, not on every tick
   * they merely happen to be sprinting. Without this, holding sprint
   * continuously through a cooldown window would silently re-trigger the
   * dash the instant the cooldown hit 0 — no fresh input from the player,
   * looked like an "auto quick step." Now they have to actually release
   * and re-press sprint to try again once the cooldown clears.
   */
  static handleQuickStepDash(player) {
    const isSprinting = player.isSprinting;
    const wasSprinting = this.quickStepWasSprinting.get(player.name) || false;
    this.quickStepWasSprinting.set(player.name, isSprinting);

    const onCooldown = (this.quickStepCooldowns.get(player.name) || 0) > 0;

    if (!isSprinting || wasSprinting || onCooldown) return;
    if (!SpiritSystem.consumeSpirit(player, this.QUICK_STEP_SPIRIT_COST)) return;

    this.quickStepCooldowns.set(player.name, this.QUICK_STEP_COOLDOWN);
    player.sendMessage('§6Quick Step!');
    player.playSound('mob.shulker.teleport', { pitch: 1.5, volume: 1.0 });

    const dir = player.getViewDirection();
    try {
      player.applyImpulse({
        x: dir.x * this.QUICK_STEP_IMPULSE_STRENGTH,
        y: this.QUICK_STEP_IMPULSE_LIFT,
        z: dir.z * this.QUICK_STEP_IMPULSE_STRENGTH,
      });
    } catch (e) {}

    // Trailing particles for a few ticks — purely cosmetic, no longer tied
    // to the movement itself (that's real physics now, not scripted steps).
    let i = 0;
    const trail = () => {
      if (i >= 6) return;
      i++;
      try { player.dimension.spawnParticle('minecraft:endrod', player.location); } catch (e) {}
      system.runTimeout(trail, 1);
    };
    system.runTimeout(trail, 1);
  }

  /**
   * Use Tumble — the real LOTMC "Trick: Tumble": every non-ally within
   * radius gets tripped. Can't amplify a target's own existing velocity
   * (no Bedrock Script API for reading entity velocity), so this fakes the
   * same "stumble forward, then can't move" feel with an outward knockback
   * burst followed by a heavy Slowness+Mining Fatigue lock.
   */
  static useTumble(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    const onCooldown = (this.tumbleTripCooldowns.get(player.name) || 0) > 0;
    if (onCooldown) {
      player.sendMessage(`§cTumble on cooldown — §e${Math.ceil((this.tumbleTripCooldowns.get(player.name) || 0) / 20)}s`);
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.TUMBLE_TRIP_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.TUMBLE_TRIP_SPIRIT_COST}`);
      return false;
    }

    this.tumbleTripCooldowns.set(player.name, this.TUMBLE_TRIP_COOLDOWN);

    const location = player.location;
    const entities = player.dimension.getEntities({
      location,
      maxDistance: this.TUMBLE_TRIP_RADIUS,
      excludeTypes: ['minecraft:item']
    });

    let count = 0;
    for (const entity of entities) {
      if (entity.id === player.id) continue;

      const dx = entity.location.x - location.x;
      const dz = entity.location.z - location.z;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;

      try { entity.applyKnockback(dx / dist, dz / dist, 0.8, 0.1); } catch (e) {}
      try {
        entity.addEffect('slowness',       this.TUMBLE_TRIP_DURATION, { amplifier: 6, showParticles: true });
        entity.addEffect('mining_fatigue', this.TUMBLE_TRIP_DURATION, { amplifier: 3, showParticles: false });
      } catch (e) {}
      count++;
    }

    try {
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        player.dimension.spawnParticle('minecraft:critical_hit_emitter', {
          x: location.x + Math.cos(a) * this.TUMBLE_TRIP_RADIUS * 0.5,
          y: location.y + 0.2,
          z: location.z + Math.sin(a) * this.TUMBLE_TRIP_RADIUS * 0.5,
        });
      }
      player.playSound('mob.evocation_illager.prepare_summon', { pitch: 1.3, volume: 0.8 });
    } catch (e) {}

    player.sendMessage(`§d§lTumble! §7${count} nearby enemies trip and stumble`);
    return true;
  }
  
  /**
   * Bag of Tricks — cycle mode (sneak+use) / fire current mode (use)
   */
  static cycleMode(player) {
    const next = ((this.bagModes.get(player.name) ?? 0) + 1) % this.MODES.length;
    this.bagModes.set(player.name, next);
    player.sendMessage(`§6Bag of Tricks — Mode: ${this.MODE_LABELS[this.MODES[next]]}`);
  }

  static useBag(player, isSneaking) {
    if (isSneaking) {
      this.cycleMode(player);
      return true;
    }
    const mode = this.MODES[this.bagModes.get(player.name) ?? 0];
    if (mode === 'flashbang')      return this.useFlashbang(player);
    if (mode === 'burning')        return this.useBurning(player);
    if (mode === 'electric_shock') return this.useElectricShock(player);
    if (mode === 'freeze_ray')     return this.useFreezeRay(player);
    if (mode === 'freeze_aoe')     return this.useFreezeAOE(player);
    if (mode === 'wind_push')      return this.useWindPush(player);
    if (mode === 'wind_pull')      return this.useWindPull(player);
    if (mode === 'tumble')         return this.useTumble(player);
    return false;
  }

  static getStatusText(player) {
    const modeIdx = this.bagModes.get(player.name) ?? 0;
    const label   = this.MODE_LABELS[this.MODES[modeIdx]];
    return `§6Bag of Tricks §7| ${label}`;
  }

  // ── Hitscan raycast helper (used to fix Burning/Freeze Ray hit detection
  // below) — real bounding-box-aware entity ray test, same approach as
  // InterrogatorSequence._performRaycast (justiciar/interrogator.js). The
  // old code checked `getEntities({location: <point on the beam>, maxDistance: 1.5})`
  // against each target's `.location`, which in Bedrock is the entity's FEET
  // anchor — so a beam fired at a mob's chest/head sailed harmlessly over
  // that point unless you aimed low enough to land within 1.5 blocks of its
  // feet. This resolves the real target up front instead, independent of
  // where on its body you aimed. ─────────────────────────────────────────
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

  /**
   * Use Flashbang - blinds and deafens nearby entities
   */
  static useFlashbang(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    if (!SpiritSystem.consumeSpirit(player, this.FLASHBANG_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.FLASHBANG_SPIRIT_COST}`);
      return false;
    }
    
    const location = player.location;
    
    // Visual and audio effects
    player.playSound('random.explode', { pitch: 2.0, volume: 1.0 });
    try {
      player.dimension.spawnParticle('minecraft:huge_explosion_emitter', location);
    } catch (e){}
    
    // Affect nearby entities
    const entities = player.dimension.getEntities({
      location: location,
      maxDistance: this.FLASHBANG_RANGE,
      excludeTypes: ['minecraft:item']
    });
    
    for (const entity of entities) {
      if (entity.id === player.id) continue; // Don't affect self
      
      // Apply blindness and slowness
      entity.addEffect('blindness', this.FLASHBANG_BLIND_DURATION, {
        amplifier: 0,
        showParticles: true
      });
      entity.addEffect('slowness', this.FLASHBANG_BLIND_DURATION, {
        amplifier: 2,
        showParticles: false
      });
    }
    
    player.sendMessage('§f§lFLASH!');
    return true;
  }
  
  /**
   * Use Burning - fire bolt that ignites targets
   */
  static useBurning(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    if (!SpiritSystem.consumeSpirit(player, this.BURNING_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.BURNING_SPIRIT_COST}`);
      return false;
    }
    
    const viewDirection = player.getViewDirection();
    const startLoc = {
      x: player.location.x + viewDirection.x * 2,
      y: player.location.y + player.getHeadLocation().y - player.location.y,
      z: player.location.z + viewDirection.z * 2
    };

    let hasHit = false;

    // Resolve a real entity target up front via bounding-box raycast — see
    // _performRaycast for why the old per-step point-radius check missed
    // anything not aimed at the target's feet. stopStep is which visual
    // step the bolt should "arrive" at the target on.
    const rayHit = this._performRaycast(player, this.BURNING_RANGE);
    const maxSteps = this.BURNING_RANGE * 2; // 0.5-block steps
    let stopStep = maxSteps;
    if (rayHit) {
      const dx = rayHit.location.x - startLoc.x;
      const dy = (rayHit.location.y + 1) - startLoc.y;
      const dz = rayHit.location.z - startLoc.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      stopStep = Math.max(1, Math.min(maxSteps, Math.round(dist / 0.5)));
    }

    // Create fire bolt projectile with dense flame stream
    for (let i = 0; i < maxSteps; i++) {
      const particleLoc = {
        x: startLoc.x + viewDirection.x * i * 0.5,
        y: startLoc.y + viewDirection.y * i * 0.5,
        z: startLoc.z + viewDirection.z * i * 0.5
      };

      system.runTimeout(() => {
        if (hasHit) return; // Stop if we already hit something

        // Entity hit — resolved above via raycast, fires once the visual
        // reaches it (guaranteed connect regardless of where on the target
        // you aimed, unlike the old feet-anchored point check).
        if (rayHit && rayHit.isValid() && i >= stopStep) {
          hasHit = true;
          try { rayHit.applyDamage(12); } catch (e) {}
          try { rayHit.setOnFire(8, true); } catch (e) {}
          player.sendMessage('§c§oTarget ignited!');
          for (let j = 0; j < 12; j++) {
            const angle = (j / 12) * Math.PI * 2;
            try {
              player.dimension.spawnParticle('minecraft:basic_flame_particle', {
                x: rayHit.location.x + Math.cos(angle) * 0.5,
                y: rayHit.location.y + 0.5,
                z: rayHit.location.z + Math.sin(angle) * 0.5
              });
            } catch (e){}
          }
          player.playSound('fire.ignite', { pitch: 1.0, volume: 1.0 });
          return;
        }

        // Check for block impact
        const block = player.dimension.getBlock({
          x: Math.floor(particleLoc.x),
          y: Math.floor(particleLoc.y),
          z: Math.floor(particleLoc.z)
        });

        if (block && !block.isAir) {
          hasHit = true;
          
          // Impact effects - burst of flames
          for (let j = 0; j < 15; j++) {
            const angle = (j / 15) * Math.PI * 2;
            try {
              player.dimension.spawnParticle('minecraft:basic_flame_particle', {
                x: particleLoc.x + Math.cos(angle) * 0.5,
                y: particleLoc.y,
                z: particleLoc.z + Math.sin(angle) * 0.5
              });
            } catch (e){}
          }
          try {
            player.dimension.spawnParticle('minecraft:lava_particle', particleLoc);
          } catch (e){}

          // 5% chance to set burnable blocks on fire
          if (Math.random() < 0.05) {
            const blockAbove = player.dimension.getBlock({
              x: Math.floor(particleLoc.x),
              y: Math.floor(particleLoc.y) + 1,
              z: Math.floor(particleLoc.z)
            });
            
            if (blockAbove && blockAbove.isAir) {
              try {
                blockAbove.setType('minecraft:fire');
              } catch (e) {
                // Failed to set fire
              }
            }
          }
          
          player.playSound('fire.ignite', { pitch: 1.0, volume: 1.0 });
          return;
        }
        
        // Spawn dense fire bolt particles (single stream with multiple flames)

        try {
          player.dimension.spawnParticle('minecraft:basic_flame_particle', particleLoc);
        } catch (e){}
        try {
          player.dimension.spawnParticle('minecraft:basic_flame_particle', {
            x: particleLoc.x + 0.2,
            y: particleLoc.y,
            z: particleLoc.z
          });
        } catch (e){}
        try {
          player.dimension.spawnParticle('minecraft:basic_flame_particle', {
            x: particleLoc.x - 0.2,
            y: particleLoc.y,
            z: particleLoc.z
          });
        } catch (e){}
        try {
          player.dimension.spawnParticle('minecraft:basic_flame_particle', {
            x: particleLoc.x,
            y: particleLoc.y + 0.2,
            z: particleLoc.z
          });
        } catch (e){}
        try {
          player.dimension.spawnParticle('minecraft:basic_flame_particle', {
            x: particleLoc.x,
            y: particleLoc.y - 0.2,
            z: particleLoc.z
          });
        } catch (e){}
        try {
          player.dimension.spawnParticle('minecraft:lava_particle', particleLoc);
        } catch (e){}
        try {
          player.dimension.spawnParticle('minecraft:mobflame_single', particleLoc);
        } catch (e){}
        // Melt ice/snow along the path
        if (block) {
          if (block.typeId === 'minecraft:ice' || 
              block.typeId === 'minecraft:packed_ice' || 
              block.typeId === 'minecraft:blue_ice') {
            try {
              block.setType('minecraft:water');
            } catch (e) {}
          } else if (block.typeId === 'minecraft:snow' || 
                     block.typeId === 'minecraft:snow_layer' ||
                     block.typeId === 'minecraft:powder_snow') {
            try {
              block.setType('minecraft:air');
            } catch (e) {}
          }
        }
      }, i * 1);
    }

    player.playSound('fire.fire', { pitch: 1.2, volume: 1.0 });
    player.sendMessage('§c§oFlames!');

    return true;
  }
  
  /**
   * Use Electric Shock — toggles the effect on/off. Free to toggle, short
   * cooldown so it can't be flicked on/off rapidly. The actual shock
   * happens per melee hit while active — see onMeleeHit below, hooked from
   * main.js's world.afterEvents.entityHitEntity.
   */
  static useElectricShock(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    const onCooldown = (this.electricShockCooldowns.get(player.name) || 0) > 0;
    if (onCooldown) return false;

    this.electricShockCooldowns.set(player.name, this.ELECTRIC_SHOCK_TOGGLE_COOLDOWN);

    const active = !(this.electricShockActive.get(player.name) ?? false);
    this.electricShockActive.set(player.name, active);

    try {
      player.playSound('mob.endermen.portal', { pitch: active ? 1.6 : 0.7, volume: 0.6 });
    } catch (e) {}
    player.sendMessage(active
      ? '§e⚡ Electric Shock: §aON §7— melee hits now shock and stun'
      : '§7Electric Shock: §cOFF');

    return true;
  }

  /**
   * Called from main.js's entityHitEntity handler on every melee hit while
   * Electric Shock is toggled on. Cost scales with sequence like LOTMC's
   * original (20 - sequence*2) — stronger (lower-number) Door members pay
   * more per proc. Stun is faked with a brief Slowness+Mining Fatigue
   * burst (Bedrock has no generic stun component).
   */
  static onMeleeHit(player, target) {
    if (!this.hasSequence(player)) return;
    if (!this.electricShockActive.get(player.name)) return;

    const sequence = PathwayManager.getSequence(player);
    const cost = Math.max(1, this.ELECTRIC_SHOCK_BASE_COST - sequence * 2);
    if (!SpiritSystem.consumeSpirit(player, cost)) {
      // Silent failure otherwise — auto-disable and say why, instead of
      // the toggle just quietly doing nothing on every future swing.
      this.electricShockActive.set(player.name, false);
      player.sendMessage('§cElectric Shock fizzles out — not enough spirit!');
      return;
    }

    try {
      target.addEffect('slowness',       this.ELECTRIC_SHOCK_STUN_TICKS, { amplifier: 6, showParticles: false });
      target.addEffect('mining_fatigue', this.ELECTRIC_SHOCK_STUN_TICKS, { amplifier: 6, showParticles: false });
    } catch (e) {}

    // Spark burst — was 'minecraft:lightning_field', which turned out to
    // not be a real Bedrock particle at all (verified against the Bedrock
    // Wiki's vanilla particle list, 2026-09-02) — silently failed every
    // time via the surrounding try/catch. Interrogator's Psychic Lashing
    // had the exact same bug (also fixed, justiciar/interrogator.js).
    try {
      for (let i = 0; i < 10; i++) {
        target.dimension.spawnParticle('minecraft:critical_hit_emitter', {
          x: target.location.x + (Math.random() - 0.5),
          y: target.location.y + Math.random() * 1.5,
          z: target.location.z + (Math.random() - 0.5),
        });
      }
    } catch (e) {}
  }
  
  /**
   * Use Freeze Ray - shoots ice ray at target
   */
  static useFreezeRay(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    if (!SpiritSystem.consumeSpirit(player, this.FREEZE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.FREEZE_SPIRIT_COST}`);
      return false;
    }
    
    const viewDirection = player.getViewDirection();
    const startLoc = {
      x: player.location.x + viewDirection.x * 2,
      y: player.location.y + player.getHeadLocation().y - player.location.y,
      z: player.location.z + viewDirection.z * 2
    };

    let hasHitBlock = false;

    // Resolve a real entity target up front via bounding-box raycast — same
    // fix as useBurning, see _performRaycast for why the old point-radius
    // check only caught mobs aimed at their feet.
    const rayHit = this._performRaycast(player, this.FREEZE_RAY_RANGE);
    const maxSteps = this.FREEZE_RAY_RANGE * 2; // 0.5-block steps
    let stopStep = maxSteps;
    if (rayHit) {
      const dx = rayHit.location.x - startLoc.x;
      const dy = (rayHit.location.y + 1) - startLoc.y;
      const dz = rayHit.location.z - startLoc.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      stopStep = Math.max(1, Math.min(maxSteps, Math.round(dist / 0.5)));
    }

    // Create ice lance projectile
    for (let i = 0; i < maxSteps; i++) {
      const particleLoc = {
        x: startLoc.x + viewDirection.x * i * 0.5,
        y: startLoc.y + viewDirection.y * i * 0.5,
        z: startLoc.z + viewDirection.z * i * 0.5
      };

      system.runTimeout(() => {
        if (hasHitBlock) return; // Stop if we hit something

        // Entity hit — resolved above via raycast.
        if (rayHit && rayHit.isValid() && i >= stopStep) {
          hasHitBlock = true;
          try { rayHit.applyDamage(12); } catch (e) {}
          try { rayHit.addEffect('slowness', 100, { amplifier: 3, showParticles: true }); } catch (e) {}
          for (let j = 0; j < 15; j++) {
            const angle = (j / 15) * Math.PI * 2;
            try {
              player.dimension.spawnParticle('minecraft:blue_flame_particle', {
                x: rayHit.location.x + Math.cos(angle) * 0.5,
                y: rayHit.location.y + 0.5,
                z: rayHit.location.z + Math.sin(angle) * 0.5
              });
            } catch (e){}
          }
          player.sendMessage('§b§oTarget frozen!');
          return;
        }

        // Check for block impact
        const block = player.dimension.getBlock({
          x: Math.floor(particleLoc.x),
          y: Math.floor(particleLoc.y),
          z: Math.floor(particleLoc.z)
        });

        if (block && !block.isAir) {
          hasHitBlock = true;
          
          // Create ice explosion at impact
          try {
            player.dimension.spawnParticle('minecraft:water_evaporation_actor_emitter', particleLoc);
          } catch (e){}
          for (let j = 0; j < 10; j++) {
            try {
            player.dimension.spawnParticle('minecraft:blue_flame_particle', particleLoc);
            } catch (e){}
          }
          
          // Freeze area around impact (2 block radius)
          const freezeRadius = 2;
          for (let x = -freezeRadius; x <= freezeRadius; x++) {
            for (let y = -freezeRadius; y <= freezeRadius; y++) {
              for (let z = -freezeRadius; z <= freezeRadius; z++) {
                const distance = Math.sqrt(x*x + y*y + z*z);
                if (distance <= freezeRadius) {
                  const freezeLoc = {
                    x: Math.floor(particleLoc.x) + x,
                    y: Math.floor(particleLoc.y) + y,
                    z: Math.floor(particleLoc.z) + z
                  };
                  
                  const freezeBlock = player.dimension.getBlock(freezeLoc);
                  
                  if (freezeBlock) {
                    try {
                      if (freezeBlock.typeId === 'minecraft:water' || 
                          freezeBlock.typeId === 'minecraft:flowing_water') {
                        freezeBlock.setType('minecraft:ice');
                      } else if (freezeBlock.typeId === 'minecraft:lava' || 
                                 freezeBlock.typeId === 'minecraft:flowing_lava') {
                        freezeBlock.setType('minecraft:obsidian');
                      } else if (freezeBlock.typeId === 'minecraft:fire') {
                        freezeBlock.setType('minecraft:air');
                      }
                    } catch (e) {
                      // Failed to modify block
                    }
                  }
                }
              }
            }
          }
          
          // Freeze and damage entities in explosion radius
          const explosionEntities = player.dimension.getEntities({
            location: particleLoc,
            maxDistance: freezeRadius,
            excludeTypes: ['minecraft:item']
          });
          
          for (const entity of explosionEntities) {
            if (entity.id !== player.id) {
              entity.applyDamage(8);
              entity.addEffect('slowness', 120, { amplifier: 4, showParticles: true });
            }
          }
          
          player.playSound('random.glass', { pitch: 1.0, volume: 1.0 });
          return;
        }
        
        // Spawn ice ray particles - dense stream
        try {
          player.dimension.spawnParticle('minecraft:blue_flame_particle', particleLoc);
        } catch (e){}
        try {
          player.dimension.spawnParticle('minecraft:blue_flame_particle', {
            x: particleLoc.x + 0.2,
            y: particleLoc.y,
            z: particleLoc.z
          });
        } catch (e){}
        try {
          player.dimension.spawnParticle('minecraft:blue_flame_particle', {
            x: particleLoc.x - 0.2,
            y: particleLoc.y,
            z: particleLoc.z
          });
        } catch (e){}
        try {
          player.dimension.spawnParticle('minecraft:blue_flame_particle', {
            x: particleLoc.x,
            y: particleLoc.y + 0.2,
            z: particleLoc.z
          });
        } catch (e){}
        try {
          player.dimension.spawnParticle('minecraft:blue_flame_particle', {
            x: particleLoc.x,
            y: particleLoc.y - 0.2,
            z: particleLoc.z
          });
        player.dimension.spawnParticle('minecraft:water_evaporation_actor_emitter', particleLoc);
        } catch (e){}
        try {
          player.dimension.spawnParticle('minecraft:water_evaporation_actor_emitter', {
            x: particleLoc.x + 0.15,
            y: particleLoc.y,
            z: particleLoc.z + 0.15
          });
        } catch (e){}
        
        // End of lance or max range
        if (i === maxSteps - 1) {
          try {
            player.dimension.spawnParticle('minecraft:water_evaporation_actor_emitter', particleLoc);
          } catch (e){}
          player.playSound('random.glass', { pitch: 1.2, volume: 0.8 });
        }
      }, i * 1);
    }
    
    player.playSound('random.glass', { pitch: 1.0, volume: 1.0 });
    player.sendMessage('§b§o*Ice lance pierces forward*');
    
    return true;
  }
  
  /**
   * Use Freeze AOE - creates freezing aura around player
   */
  static useFreezeAOE(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    
    if (!SpiritSystem.consumeSpirit(player, this.FREEZE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.FREEZE_SPIRIT_COST}`);
      return false;
    }
    
    const location = player.location;
    
    player.playSound('random.glass', { pitch: 0.8, volume: 1.0 });
    player.sendMessage('§b§oFrost spreads...');
    
    // Create frost particles in area
    for (let i = 0; i < 30; i++) {
      system.runTimeout(() => {
        const angle = (i / 30) * Math.PI * 2;
        const radius = this.FREEZE_AOE_RANGE;
        
        for (let r = 0; r < radius; r += 2) {
          const particleLoc = {
            x: location.x + Math.cos(angle) * r,
            y: location.y + 0.1,
            z: location.z + Math.sin(angle) * r
          };
          try {
            player.dimension.spawnParticle('minecraft:blue_flame_particle', particleLoc);
          } catch (e){}
        }
      }, i * 3);
    }
    
    // Affect entities in range
    const entities = player.dimension.getEntities({
      location: location,
      maxDistance: this.FREEZE_AOE_RANGE,
      excludeTypes: ['minecraft:item']
    });
    
    for (const entity of entities) {
      if (entity.id === player.id) continue;
      
      entity.addEffect('slowness', this.FREEZE_DURATION, {
        amplifier: 2,
        showParticles: true
      });
    }
    
    // Try to freeze water blocks
    for (let x = -this.FREEZE_AOE_RANGE; x <= this.FREEZE_AOE_RANGE; x++) {
      for (let z = -this.FREEZE_AOE_RANGE; z <= this.FREEZE_AOE_RANGE; z++) {
        const dist = Math.sqrt(x * x + z * z);
        if (dist <= this.FREEZE_AOE_RANGE) {
          const blockLoc = {
            x: Math.floor(location.x + x),
            y: Math.floor(location.y),
            z: Math.floor(location.z + z)
          };
          
          const block = player.dimension.getBlock(blockLoc);
          if (block && block.typeId === 'minecraft:water') {
            try {
              player.dimension.runCommand(`setblock ${blockLoc.x} ${blockLoc.y} ${blockLoc.z} ice`);
            } catch (e) {
              // Failed to freeze this block
            }
          }
        }
      }
    }
    
    return true;
  }
  
  /**
   * Wind — 70°-cone AoE in front of the caster, matching LOTMC's "Trick:
   * Wind". Split into two separate Bag of Tricks modes (push/pull) rather
   * than the source's sneak-branch, since sneak+use already cycles modes
   * on this item.
   */
  static useWindPush(player) { return this._useWind(player, false); }
  static useWindPull(player) { return this._useWind(player, true); }

  static _useWind(player, isPull) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.WIND_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.WIND_SPIRIT_COST}`);
      return false;
    }

    const dir = player.getViewDirection();
    const lenXZ = Math.sqrt(dir.x * dir.x + dir.z * dir.z) || 1;
    const facing = { x: dir.x / lenXZ, z: dir.z / lenXZ };
    const cosFov = Math.cos(this.WIND_FOV_DEGREES * Math.PI / 180);

    const entities = player.dimension.getEntities({
      location: player.location,
      maxDistance: this.WIND_RADIUS,
      excludeTypes: ['minecraft:item']
    });

    let count = 0;
    for (const entity of entities) {
      if (entity.id === player.id) continue;

      const dx = entity.location.x - player.location.x;
      const dz = entity.location.z - player.location.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.1) continue;

      const nx = dx / dist, nz = dz / dist;
      const facingDot = nx * facing.x + nz * facing.z;
      if (facingDot < cosFov) continue; // outside the 70° cone

      const pushX = isPull ? -nx : nx;
      const pushZ = isPull ? -nz : nz;
      const strength = isPull ? Math.min(3.0, 0.4 * dist) : 1.4;

      try { entity.applyKnockback(pushX, pushZ, strength, 0.1); } catch (e) {}
      count++;
    }

    try {
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        player.dimension.spawnParticle('minecraft:basic_smoke_particle', {
          x: player.location.x + Math.cos(a) * 2,
          y: player.location.y + 1,
          z: player.location.z + Math.sin(a) * 2,
        });
      }
      player.playSound('mob.phantom.flap', { pitch: isPull ? 0.8 : 1.2, volume: 1.0 });
    } catch (e) {}

    player.sendMessage(isPull
      ? `§a🌀 Wind pulls §e${count}§a target(s) in!`
      : `§a💨 Wind pushes §e${count}§a target(s) back!`);

    return true;
  }

  /**
   * Toggle freeze mode
   */
  static toggleFreezeMode(player) {
    const currentMode = this.freezeMode.get(player.name) || 'ray';
    const newMode = currentMode === 'ray' ? 'aoe' : 'ray';
    this.freezeMode.set(player.name, newMode);
    
    const modeName = newMode === 'ray' ? '§bIce Ray' : '§3Frost Aura';
    player.sendMessage(`§7Freeze mode: ${modeName}`);
    
    return true;
  }
  
  /**
   * Use currently selected freeze ability
   */
  static useFreeze(player) {
    const mode = this.freezeMode.get(player.name) || 'ray';
    
    if (mode === 'ray') {
      return this.useFreezeRay(player);
    } else {
      return this.useFreezeAOE(player);
    }
  }
  
  /**
   * Handle ability usage
   */
  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
      case this.ABILITIES.FLASHBANG:
        return this.useFlashbang(player);
      case this.ABILITIES.BURNING:
        return this.useBurning(player);
      case this.ABILITIES.ELECTRIC_SHOCK:
        return this.useElectricShock(player);
      case this.ABILITIES.FREEZE_RAY:
      case this.ABILITIES.FREEZE_AOE:
        return this.useFreeze(player);
      case this.ABILITIES.WIND_PUSH:
        return this.useWindPush(player);
      case this.ABILITIES.WIND_PULL:
        return this.useWindPull(player);
      case this.ABILITIES.TUMBLE:
        return this.useTumble(player);
      default:
        return false;
    }
  }
  
  /**
   * Get ability descriptions
   */
  static getAbilityDescription(abilityId) {
    const descriptions = {
      [this.ABILITIES.FLASHBANG]: `§7Cost: ${this.FLASHBANG_SPIRIT_COST}\n§7Blinds nearby enemies`,
      [this.ABILITIES.BURNING]: `§7Cost: ${this.BURNING_SPIRIT_COST}\n§7Ignite target at range`,
      [this.ABILITIES.ELECTRIC_SHOCK]: `§7Free to toggle\n§7While on: melee hits shock+stun, costs spirit per hit`,
      [this.ABILITIES.FREEZE_RAY]: `§7Cost: ${this.FREEZE_SPIRIT_COST}\n§7Ray/AOE freeze (toggle mode)`,
      [this.ABILITIES.WIND_PUSH]: `§7Cost: ${this.WIND_SPIRIT_COST}\n§7Blast enemies away in a cone`,
      [this.ABILITIES.WIND_PULL]: `§7Cost: ${this.WIND_SPIRIT_COST}\n§7Pull enemies toward you in a cone`,
      [this.ABILITIES.TUMBLE]: `§7Cost: ${this.TUMBLE_TRIP_SPIRIT_COST}\n§7Trip and root every nearby enemy`
    };
    return descriptions[abilityId] || 'Unknown ability';
  }
  
  /**
   * Clean up effects
   */
  static removeEffects(player) {
    ApprenticeSequence.removeEffects(player);
    this.quickStepCooldowns.delete(player.name);
    this.quickStepWasSprinting.delete(player.name);
    this.tumbleTripCooldowns.delete(player.name);
    this.electricShockActive.delete(player.name);
    this.electricShockCooldowns.delete(player.name);
    this.freezeMode.delete(player.name);
  }
}