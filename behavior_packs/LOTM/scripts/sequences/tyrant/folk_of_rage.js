// ============================================================================
// TYRANT PATHWAY — SEQUENCE 8: FOLK OF RAGE
// folk_of_rage.js → behavior_packs/LOTM/scripts/sequences/tyrant/folk_of_rage.js
//
// Physical Enhancement amplifiers scaled up from Seq9's user-rebalanced
// baseline (not the raw decompiled Seq9->Seq8 deltas), preserving the same
// relative step the source table used (STR/RES/SPD each +1 tier, Jump
// unchanged, first Health Boost appears here) — see sailor.js for Seq9's
// numbers and rebalance history.
// ============================================================================
import { EntityDamageCause, EnchantmentType } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

export class FolkOfRageSequence {
  static SEQUENCE_NUMBER = 8;
  static PATHWAY = 'tyrant';
  static BASE_SPIRIT = 90; // Tyrant's first spirit-using tier — Sailor (Seq9) was spirit-free

  static EFFECT_DURATION = 999999;
  static STRENGTH_AMPLIFIER = 2;   // Strength III
  static RESISTANCE_AMPLIFIER = 2; // Resistance III
  static SPEED_AMPLIFIER = 1;      // Speed II (out of water)
  static SWIM_SPEED_AMPLIFIER = 3; // Speed IV while actually in water
  static JUMP_AMPLIFIER = 1;       // Jump Boost II — unchanged from Seq9
  static HEALTH_BONUS = 5;         // +5 hearts — first health bonus, matches decompiled Seq8 row

  // Anger — brief rage spike whenever hit, layered on top of the permanent
  // baseline. A natural-duration buff that just expires back down to
  // baseline on its own — safe from the "won't downgrade" effect-stacking
  // issue Seq9's swim speed hit, since nothing has to explicitly remove it.
  static ANGER_AMPLIFIER = 3; // Strength IV, above the III baseline
  static ANGER_DURATION = 100; // 5s

  // Projectile Control — flat passive, not a toggle (user call, 2026-08-19)
  static PROJECTILE_DAMAGE_BONUS = 3;      // bonus flat damage on the player's own projectile hits
  static PROJECTILE_DAMAGE_REDUCTION = 0.35; // fraction given back on projectile damage taken

  static RAGING_BLOWS_COST = 14;
  static RAGING_BLOWS_COOLDOWN = 24;      // 1.2s
  static RAGING_BLOWS_DURATION = 54;      // ~2.7s burst window
  static RAGING_BLOWS_TICK_INTERVAL = 6;  // "melee explosion every 6 ticks"
  static RAGING_BLOWS_DAMAGE = 2;         // per pulse — own balance call, source gave no per-pulse number
  // 3 was too tight in testing — a 3D distance check meant even mild terrain
  // unevenness could push a mob standing right next to the player outside
  // range, on top of just being a small radius for a "hit everyone nearby"
  // effect. Bumped to 5.
  static RAGING_BLOWS_RADIUS = 5;

  static ragingBlowsCooldowns = new Map(); // player name -> ticks remaining
  static activeRagingBlows = new Map();    // player name -> { ticksRemaining }

  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  static applyPassiveAbilities(player) {
    this.applyPhysicalEnhancements(player);
    this.applyWaterAffinity(player);
    this.applyDepthStrider(player);
    this.applyHealthBonus(player);
  }

  static applyPhysicalEnhancements(player) {
    // Anger (below) can temporarily push Strength above this baseline —
    // Minecraft always allows an upgrade to apply cleanly, so that just
    // works on its own. Only reapply the baseline here if it's missing,
    // stale, or (shouldn't normally happen) somehow below baseline — never
    // touch it while Anger's higher spike is active, just let that expire
    // naturally back to nothing, at which point this reapplies baseline III.
    const strength = player.getEffect('strength');
    if (!strength || (strength.amplifier === this.STRENGTH_AMPLIFIER && strength.duration < 200) || strength.amplifier < this.STRENGTH_AMPLIFIER) {
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: this.STRENGTH_AMPLIFIER, showParticles: false });
    }

    const resistance = player.getEffect('resistance');
    if (!resistance || resistance.amplifier !== this.RESISTANCE_AMPLIFIER || resistance.duration < 200) {
      player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: this.RESISTANCE_AMPLIFIER, showParticles: false });
    }

    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: this.JUMP_AMPLIFIER, showParticles: false });
    }
  }

  // Same shape as SailorSequence.applyWaterAffinity — see there for why
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

  // ── Anger — called from main.js's entityHurt handler ──────────────────────
  static onHurt(player) {
    if (!this.hasSequence(player)) return;
    try {
      player.addEffect('strength', this.ANGER_DURATION, { amplifier: this.ANGER_AMPLIFIER, showParticles: true });
    } catch (_) {}
  }

  // ── Projectile Control — called from main.js's entityHurt handler ────────
  // Offense: bonus damage when the player's OWN projectile lands on someone.
  // Deliberately uses entityAttack (not projectile) as the bonus hit's own
  // cause — this is called from main.js's entityHurt handler, which is
  // itself gated on cause === projectile; applying the bonus with that same
  // cause would re-trigger entityHurt and call straight back into this
  // method, looping forever. A different cause breaks that re-entry cleanly.
  static onProjectileDamageDealt(player, victim) {
    if (!this.hasSequence(player)) return;
    try {
      victim.applyDamage(this.PROJECTILE_DAMAGE_BONUS, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
    } catch (_) {}
  }

  // Defense: give back a fraction of projectile damage the player just took
  // — same "heal back a portion after the fact" technique as Seer/Magician's
  // Damage Transfer (this API only exposes damage after it's already
  // applied, no pre-hit interception available).
  static onProjectileDamageTaken(player, damage) {
    if (!this.hasSequence(player)) return;
    const reducedPortion = Math.floor(damage * this.PROJECTILE_DAMAGE_REDUCTION);
    if (reducedPortion <= 0) return;
    try {
      const health = player.getComponent('minecraft:health');
      if (health) health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + reducedPortion));
    } catch (_) {}
  }

  // ── Ability-state ticking (cooldowns + active Raging Blows processing) ───
  // Called unconditionally every tick from main.js so a future grazer keeps
  // working the same as every other pathway's tickAbilityState, and so a
  // real player past this tier still gets it ticked.
  static tickAbilityState(player) {
    const cd = this.ragingBlowsCooldowns.get(player.name);
    if (cd && cd > 0) this.ragingBlowsCooldowns.set(player.name, cd - 1);

    this.processRagingBlows(player);
  }

  static useRagingBlows(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    const cd = this.ragingBlowsCooldowns.get(player.name) || 0;
    if (cd > 0) {
      player.sendMessage(`§cRaging Blows on cooldown: §e${Math.ceil(cd / 20)}s`);
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.RAGING_BLOWS_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.RAGING_BLOWS_COST}`);
      return false;
    }

    this.activeRagingBlows.set(player.name, { ticksRemaining: this.RAGING_BLOWS_DURATION });
    this.ragingBlowsCooldowns.set(player.name, this.RAGING_BLOWS_COOLDOWN);

    player.sendMessage('§c§lRAGING BLOWS!');
    try { player.playSound('mob.ravager.roar', { pitch: 0.8, volume: 1.0 }); } catch (_) {}
    return true;
  }

  static processRagingBlows(player) {
    const state = this.activeRagingBlows.get(player.name);
    if (!state) return;

    state.ticksRemaining--;

    if (state.ticksRemaining % this.RAGING_BLOWS_TICK_INTERVAL === 0) {
      this._ragingBlowsPulse(player);
    }

    if (state.ticksRemaining <= 0) {
      this.activeRagingBlows.delete(player.name);
    }
  }

  static _ragingBlowsPulse(player) {
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.RAGING_BLOWS_RADIUS,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      });
      for (const entity of entities) {
        try { entity.applyDamage(this.RAGING_BLOWS_DAMAGE, { cause: EntityDamageCause.entityAttack, damagingEntity: player }); } catch (_) {}
        try {
          const dx = entity.location.x - player.location.x;
          const dz = entity.location.z - player.location.z;
          const len = Math.sqrt(dx * dx + dz * dz) || 1;
          entity.applyKnockback(dx / len, dz / len, 0.4, 0.2);
        } catch (_) {}
      }
    } catch (_) {}

    try { player.dimension.spawnParticle('minecraft:large_explosion', player.location); } catch (_) {}
    try { player.playSound('random.explode', { pitch: 1.5, volume: 0.6 }); } catch (_) {}
  }

  static removeEffects(player) {
    player.removeEffect('strength');
    player.removeEffect('resistance');
    player.removeEffect('jump_boost');
    player.removeEffect('speed');
    player.removeEffect('water_breathing');
    player.removeEffect('health_boost');
    this.ragingBlowsCooldowns.delete(player.name);
    this.activeRagingBlows.delete(player.name);
  }
}
