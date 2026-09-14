// ============================================================================
// TYRANT PATHWAY — SEQUENCE 6: WIND BLESSED
// wind_blessed.js → behavior_packs/LOTM/scripts/sequences/tyrant/wind_blessed.js
//
// Physical Enhancement amplifiers from the decompiled Seq6 row: Resistance
// bumps up a tier (unchanged since Seq8 until now), Strength/Speed stay
// flat again (matches the source table's own pacing), first Night Vision,
// Dolphin's Grace bumps up a tier. Oxygen Bonus still skipped — see
// seafarer.js for why.
//
// Glide (4th Focus mode) went through six design passes before landing on
// an invisible rideable mount entity (lotm:wind_glide_mount) — see the
// design note above GLIDE_COST for the full history and why it works.
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

export class WindBlessedSequence {
  static SEQUENCE_NUMBER = 6;
  static PATHWAY = 'tyrant';

  static EFFECT_DURATION = 999999;
  static STRENGTH_AMPLIFIER = 2;   // Strength III — unchanged from Seq7
  static RESISTANCE_AMPLIFIER = 3; // Resistance IV (was III)
  static SPEED_AMPLIFIER = 1;      // Speed II (out of water) — unchanged
  static SWIM_SPEED_AMPLIFIER = 3; // Speed IV in water — unchanged
  static JUMP_AMPLIFIER = 1;       // Jump Boost II — unchanged from Seq9
  static HEALTH_BONUS = 7;         // +7 hearts (was 6)
  static DOLPHINS_GRACE_AMPLIFIER = 1; // Dolphin's Grace II (was I)

  // Spirit Vision — same shape as Hunter/Provoker's Danger Intuition
  static SPIRIT_VISION_INTERVAL_MS = 2000;
  static SPIRIT_VISION_RADIUS = 16;
  static _lastVisionScan = new Map(); // player.id -> ms timestamp

  static MODES = ['wind_blade', 'binding', 'air_cushion', 'glide'];
  static MODE_LABELS = {
    wind_blade:  '§f[Wind Blade]',
    binding:     '§7[Binding]',
    air_cushion: '§b[Air Cushion]',
    glide:       '§f[Glide]',
  };

  static WIND_BLADE_COST = 15;  static WIND_BLADE_COOLDOWN = 30; static WIND_BLADE_RANGE = 20; static WIND_BLADE_DAMAGE = 8;
  static BINDING_COST = 20;     static BINDING_COOLDOWN = 60;    static BINDING_RANGE = 15;    static BINDING_DURATION = 60; // 3s
  static AIR_CUSHION_COST = 25; static AIR_CUSHION_COOLDOWN = 160; static AIR_CUSHION_DURATION = 160; // 8s, matches source
  // Glide — redesigned from a plain Slow Falling buff (source's own version)
  // into an actual hover per user request ("levitate a block off the
  // ground"). Slow Falling stays as a safety net for the moment it ends
  // (falls back to normal gravity), so it's not an abrupt drop.
  //
  // Sixth design pass. Passes 1-3 (threshold-teleport, extreme Levitation,
  // unconditional per-tick teleport) all fought the client's own movement
  // prediction — teleporting the PLAYER every tick reads as sluggish no
  // matter how it's gated. Pass 5 (a real minecraft:barrier platform under
  // the player, Frost-Walker style) fixed the prediction fight but
  // couldn't be rebuilt fast enough to outrun the player's own passive
  // Speed buffs, causing edge-clipping ("crawling") when moving.
  //
  // This pass is the user's own suggestion: spawn an invisible rideable
  // mount (lotm:wind_glide_mount, same proven rideable recipe as
  // flying_rock — see entity/flyingRockSystem.js) and mount the player on
  // it via the /ride command. Horizontal movement is NOT scripted at all —
  // minecraft:input_ground_controlled on the mount is the same native
  // component horses/camels/striders use to translate rider WASD directly
  // into entity movement, so it's handled entirely by the engine. The only
  // thing script corrects is the mount's own Y each tick, stepped gradually
  // toward (ground-or-water-surface + GLIDE_HOVER_HEIGHT) — because that
  // correction lands on a non-player entity, it doesn't fight client-side
  // prediction the way a direct player teleport did; the rider's camera
  // just follows the seat like riding a boat down a waterfall.
  static GLIDE_COST = 20;       static GLIDE_COOLDOWN = 160;       static GLIDE_DURATION = 160; // 8s
  // Feet position above the surface — normal standing height is surface+1,
  // so 2.0 gives a full block of visible daylight underneath.
  static GLIDE_HOVER_HEIGHT = 2.0;
  // Asymmetric on purpose — descending stays capped for a smooth glide down
  // slopes/ledges, but rising is fast/near-instant. With has_collision:
  // false on the mount (see below), nothing physically stops the mount
  // from drifting into a bump like a mushroom or a 1-block step before a
  // slow correction finishes rising to clear it, which reads as clipping
  // through it. A fast rise means it's already above the obstacle by the
  // time the player's camera gets there instead.
  static GLIDE_VERTICAL_STEP = 0.4;      // max downward Y change per tick
  static GLIDE_VERTICAL_RISE_STEP = 3.0; // max upward Y change per tick
  static GLIDE_END_SLOW_FALLING = 70;    // 3.5s graceful landing buffer on natural expiry
  // Must match wind_glide_mount.json's seat position Y — the rider sits
  // this far above the mount's own Y, so the mount is targeted that much
  // *lower* than GLIDE_HOVER_HEIGHT to keep the player's actual feet
  // height correct (was raised off 0.1, which sat inside the mount's own
  // 0.3-tall collision box and forced an awkward non-standing pose).
  static GLIDE_SEAT_HEIGHT = 0.4;
  static activeGlides = new Map(); // player name -> { entity, ticksRemaining, dimensionId }

  static modes = new Map();     // player name -> mode index
  static cooldowns = new Map(); // player name -> { blade, binding, cushion, glide }

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

    // See seafarer.js for why this is isolated in its own try/catch.
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
    // Air Cushion (below) can temporarily push Resistance above this
    // baseline — same "only touch it going up or when stale, let a higher
    // temporary spike expire on its own" shape as Folk of Rage's Anger.
    if (!resistance || (resistance.amplifier === this.RESISTANCE_AMPLIFIER && resistance.duration < 200) || resistance.amplifier < this.RESISTANCE_AMPLIFIER) {
      player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: this.RESISTANCE_AMPLIFIER, showParticles: false });
    }

    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: this.JUMP_AMPLIFIER, showParticles: false });
    }
  }

  // Same shape as Sailor/Folk of Rage/Seafarer — see sailor.js for why
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

  // ── Ability-state ticking ─────────────────────────────────────────────────
  static tickAbilityState(player) {
    const cds = this.cooldowns.get(player.name);
    if (cds) for (const k of Object.keys(cds)) { if (cds[k] > 0) cds[k]--; }
    this._processGlide(player);
  }

  // Surface scan for Glide's hover lock — unlike the old ground-only scan,
  // this stops at the first non-air block going down, solid OR liquid, so
  // hovering over water locks to the water's surface rather than diving to
  // the seabed ("including water" per the user's ask).
  static _findHoverSurfaceY(dimension, x, baseY, z) {
    for (let dy = 3; dy >= -10; dy--) {
      const y = baseY + dy;
      try {
        const block = dimension.getBlock({ x, y, z });
        if (block && !block.isAir) return y;
      } catch (_) {}
    }
    return null;
  }

  static _processGlide(player) {
    const state = this.activeGlides.get(player.name);
    if (!state) return;

    let alive = false;
    try { void state.entity.location; alive = true; } catch (_) {}
    if (!alive) { this.activeGlides.delete(player.name); return; }

    state.ticksRemaining--;
    if (state.ticksRemaining <= 0) {
      this._endGlide(player, state);
      return;
    }

    this._guardAgainstEjection(player, state);
    this._updateGlideHeight(state);
    if (state.ticksRemaining % 5 === 0) {
      try {
        const loc = player.location;
        player.dimension.spawnParticle('minecraft:basic_smoke_particle', { x: loc.x, y: loc.y - 0.3, z: loc.z });
      } catch (_) {}
    }
  }

  // Bedrock's default rideable behavior treats Jump as "dismount" for any
  // rideable entity that doesn't own a real jump component (same as
  // minecarts) — flying_rock never hit this because it's only ever
  // manually right-click-mounted, but Glide auto-mounts and is meant to
  // hold the player in place, so a stray jump press shouldn't eject them.
  // There's no reliable isRiding()/getRiders() API in this scripting
  // version (see flyingRockSystem.js's own comment on the same gap) — so,
  // same workaround, proximity: if the player has drifted away from their
  // mount, they were ejected; put them straight back on.
  static _guardAgainstEjection(player, state) {
    try {
      const pLoc = player.location, mLoc = state.entity.location;
      const dist = Math.sqrt((pLoc.x - mLoc.x) ** 2 + (pLoc.y - mLoc.y) ** 2 + (pLoc.z - mLoc.z) ** 2);
      if (dist > 1.5) {
        player.runCommand(`ride @s start_riding @e[type=lotm:wind_glide_mount,tag=owner:${player.name},c=1] teleport_rider`);
      }
    } catch (_) {}
  }

  // Steps the MOUNT's Y toward the hover target each tick — capped per-tick
  // delta so terrain transitions (slopes, ledges) are smoothed rather than
  // snapped. This corrects a non-player entity, so it doesn't fight the
  // rider's own client-side movement prediction the way a direct player
  // teleport did in earlier passes.
  static _updateGlideHeight(state) {
    const mount = state.entity;
    let loc, dim;
    try { loc = mount.location; dim = mount.dimension; } catch (_) { return; }

    const cx = Math.floor(loc.x), cz = Math.floor(loc.z);
    const surfaceY = this._findHoverSurfaceY(dim, cx, Math.floor(loc.y), cz);
    if (surfaceY === null) return; // over a cliff/void — hold current height

    const targetY = surfaceY + this.GLIDE_HOVER_HEIGHT - this.GLIDE_SEAT_HEIGHT;
    const diff = targetY - loc.y;
    if (Math.abs(diff) < 0.05) return;

    const step = diff >= 0
      ? Math.min(this.GLIDE_VERTICAL_RISE_STEP, diff)
      : Math.max(-this.GLIDE_VERTICAL_STEP, diff);
    try { mount.teleport({ x: loc.x, y: loc.y + step, z: loc.z }, { dimension: dim }); } catch (_) {}
  }

  static _endGlide(player, state) {
    try { player.runCommand('ride @s stop_riding'); } catch (_) {}
    try { state.entity.kill(); } catch (_) {}
    this.activeGlides.delete(player.name);
    try { player.addEffect('slow_falling', this.GLIDE_END_SLOW_FALLING, { amplifier: 1, showParticles: false }); } catch (_) {}
    try { player.sendMessage('§7The wind settles — Glide ends.'); } catch (_) {}
  }

  static _getCD(player, key) { return this.cooldowns.get(player.name)?.[key] ?? 0; }
  static _setCD(player, key, value) {
    if (!this.cooldowns.has(player.name)) this.cooldowns.set(player.name, { blade: 0, binding: 0, cushion: 0, glide: 0 });
    this.cooldowns.get(player.name)[key] = value;
  }

  static cycleMode(player) {
    const next = ((this.modes.get(player.name) ?? 0) + 1) % this.MODES.length;
    this.modes.set(player.name, next);
    player.sendMessage(`§6Wind Blessed's Gale — Mode: ${this.MODE_LABELS[this.MODES[next]]}`);
  }

  // ── Wind Blade ─────────────────────────────────────────────────────────────
  static useWindBlade(player) {
    const cd = this._getCD(player, 'blade');
    if (cd > 0) { player.sendMessage(`§cWind Blade on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.WIND_BLADE_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.WIND_BLADE_COST}`); return false;
    }

    const hit = this._performRaycast(player, this.WIND_BLADE_RANGE);
    try {
      const eyePos = { x: player.location.x, y: player.location.y + 1.6, z: player.location.z };
      const dir = player.getViewDirection();
      for (let i = 1; i <= 6; i++) {
        player.dimension.spawnParticle('minecraft:crop_growth_area', {
          x: eyePos.x + dir.x * i, y: eyePos.y + dir.y * i, z: eyePos.z + dir.z * i
        });
      }
    } catch (_) {}

    if (hit) {
      try { hit.applyDamage(this.WIND_BLADE_DAMAGE, { cause: EntityDamageCause.entityAttack, damagingEntity: player }); } catch (_) {}
    }

    player.playSound('mob.breeze.shoot', { pitch: 1.2, volume: 0.8 });
    this._setCD(player, 'blade', this.WIND_BLADE_COOLDOWN);
    return true;
  }

  // ── Binding — pins the target in place. Tried Levitation twice (amplifier
  // 0 per the research's "nails feet" note, then amplifier 255 on a
  // "freezes movement" community claim) — BOTH were wrong, confirmed by
  // live testing: any Levitation amplifier just launches the target
  // upward, there's no "freeze" amplitude. Dropped Levitation entirely,
  // mirrors JudgeSequence.useImprison's already-proven approach instead
  // (justiciar/judge.js) — pure Slowness + Mining Fatigue, no exotic
  // effect tricks.
  static useBinding(player) {
    const cd = this._getCD(player, 'binding');
    if (cd > 0) { player.sendMessage(`§cBinding on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.BINDING_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.BINDING_COST}`); return false;
    }

    const hit = this._performRaycast(player, this.BINDING_RANGE);
    if (!hit) {
      SpiritSystem.addSpirit(player, this.BINDING_COST);
      player.sendMessage('§7Binding found nothing to grip');
      return false;
    }

    try {
      hit.addEffect('slowness', this.BINDING_DURATION, { amplifier: 6, showParticles: true });
      hit.addEffect('mining_fatigue', this.BINDING_DURATION, { amplifier: 2, showParticles: false });
      hit.dimension.spawnParticle('minecraft:huge_explosion_emitter', hit.location);
    } catch (_) {}

    player.sendMessage('§7§oThe wind pins them in place...');
    this._setCD(player, 'binding', this.BINDING_COOLDOWN);
    return true;
  }

  // ── Air Cushion — self-buff, Resistance spike layered over the permanent
  // baseline (same safe pattern as Folk of Rage's Anger — natural-duration,
  // no explicit removeEffect needed since it only ever upgrades) ───────────
  static useAirCushion(player) {
    const cd = this._getCD(player, 'cushion');
    if (cd > 0) { player.sendMessage(`§cAir Cushion on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.AIR_CUSHION_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.AIR_CUSHION_COST}`); return false;
    }

    try {
      player.addEffect('resistance', this.AIR_CUSHION_DURATION, { amplifier: this.RESISTANCE_AMPLIFIER + 1, showParticles: true });
      player.resetFallDistance?.();
    } catch (_) {}

    player.sendMessage('§b§oA cushion of wind surrounds you');
    this._setCD(player, 'cushion', this.AIR_CUSHION_COOLDOWN);
    return true;
  }

  // ── Glide — spawns an invisible wind_glide_mount, rides the player on it
  // via /ride, then holds its height near the ground/water surface each
  // tick (_updateGlideHeight). Horizontal movement is native
  // input_ground_controlled, not scripted — see the design note above
  // GLIDE_COST. ────────────────────────────────────────────────────────────
  static useGlide(player) {
    const cd = this._getCD(player, 'glide');
    if (cd > 0) { player.sendMessage(`§cGlide on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.GLIDE_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.GLIDE_COST}`); return false;
    }

    const dim = player.dimension;
    let mount = null;
    try {
      mount = dim.spawnEntity('lotm:wind_glide_mount', player.location);
    } catch (_) {}
    if (!mount) {
      player.sendMessage('§cThe wind fails to gather!');
      SpiritSystem.addSpirit(player, this.GLIDE_COST);
      return false;
    }

    try { mount.addEffect('invisibility', this.GLIDE_DURATION + 20, { amplifier: 0, showParticles: false }); } catch (_) {}
    try { mount.addTag(`owner:${player.name}`); } catch (_) {}

    this.activeGlides.set(player.name, { entity: mount, ticksRemaining: this.GLIDE_DURATION, dimensionId: dim.id });

    try {
      player.runCommand(`ride @s start_riding @e[type=lotm:wind_glide_mount,tag=owner:${player.name},c=1] teleport_rider`);
    } catch (_) {}

    player.sendMessage('§f§oThe wind lifts you off the ground...');
    this._setCD(player, 'glide', this.GLIDE_COOLDOWN);
    return true;
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

  // ── Item use dispatcher ───────────────────────────────────────────────────
  static useFocus(player, isSneaking) {
    // Gated here once for all 4 modes, rather than repeating it in each
    // ability method — _requirePathwayMsg in main.js only checks the
    // player is on the Tyrant pathway at all, not their current sequence,
    // so without this a Sailor/Folk of Rage/Seafarer player holding this
    // item (however they got it) could use Wind Blessed-tier abilities
    // early. Same bug/fix as seafarer.js's useFocus.
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    if (isSneaking) { this.cycleMode(player); return true; }
    const mode = this.MODES[this.modes.get(player.name) ?? 0];
    if (mode === 'wind_blade')  return this.useWindBlade(player);
    if (mode === 'binding')     return this.useBinding(player);
    if (mode === 'air_cushion') return this.useAirCushion(player);
    if (mode === 'glide')       return this.useGlide(player);
    return false;
  }

  static getStatusText(player) {
    const modeIdx = this.modes.get(player.name) ?? 0;
    return `§6Wind Blessed's Gale §7| ${this.MODE_LABELS[this.MODES[modeIdx]]}`;
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
    this.cooldowns.delete(player.name);
    const state = this.activeGlides.get(player.name);
    if (state) {
      try { player.runCommand('ride @s stop_riding'); } catch (_) {}
      try { state.entity.kill(); } catch (_) {}
    }
    this.activeGlides.delete(player.name);
  }

  // Disconnect mid-Glide — no live Player object at this point (mirrors
  // FireMoteSystem.cleanup). Killing the mount is enough; leaving the
  // world dismounts the rider automatically, so there's no stop_riding
  // command to run. dimensionId is kept on state for parity with the
  // old cleanup shape but isn't needed for a kill-by-entity-reference.
  // Called from main.js's world.afterEvents.playerLeave.
  static cleanupGlide(playerName) {
    const state = this.activeGlides.get(playerName);
    if (state) {
      try { state.entity.kill(); } catch (_) {}
    }
    this.activeGlides.delete(playerName);
  }
}
