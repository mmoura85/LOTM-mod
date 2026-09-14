// ============================================================================
// TYRANT PATHWAY — SEQUENCE 7: SEAFARER
// seafarer.js → behavior_packs/LOTM/scripts/sequences/tyrant/seafarer.js
//
// Physical Enhancement amplifiers taken from the decompiled Seq7 row
// (STRENGTH/RESISTANCE/SPEED unchanged from Seq8 — the source table itself
// doesn't grow those two steps in a row, it just adds new stat types this
// tier: +1 more heart, Regeneration I, Dolphin's Grace I). "Oxygen Bonus I"
// from the same row is skipped — Bedrock has no vanilla status effect for
// it, and it's moot anyway since Sailor's permanent Water Breathing already
// means air never runs out.
// ============================================================================
import { system, EntityDamageCause, EnchantmentType } from '@minecraft/server';
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

export class SeafarerSequence {
  static SEQUENCE_NUMBER = 7;
  static PATHWAY = 'tyrant';

  static EFFECT_DURATION = 999999;
  static STRENGTH_AMPLIFIER = 2;   // Strength III — unchanged from Seq8
  static RESISTANCE_AMPLIFIER = 2; // Resistance III — unchanged from Seq8
  static SPEED_AMPLIFIER = 1;      // Speed II (out of water) — unchanged from Seq8
  static SWIM_SPEED_AMPLIFIER = 3; // Speed IV in water — unchanged from Seq8
  static JUMP_AMPLIFIER = 1;       // Jump Boost II — unchanged from Seq9
  static HEALTH_BONUS = 6;         // +6 hearts (was 5) — matches decompiled Seq7 row

  static MODES = ['lightning_ward', 'aqueous_pull', 'aqueous_push', 'aqueous_drown'];
  static MODE_LABELS = {
    lightning_ward: '§e[Lightning Ward]',
    aqueous_pull:   '§b[Aqueous Pull]',
    aqueous_push:   '§b[Aqueous Push]',
    aqueous_drown:  '§3[Aqueous Drown]',
  };

  // Lightning Ward — toggle, drains spirit once per second while active,
  // periodic chance to strike a nearby hostile. Auto-deactivates if the
  // player can't afford the drain (mirrors the real ToggleAbility pattern
  // from the decompiled source — ongoing cost, not a one-off activation fee).
  static LIGHTNING_WARD_DRAIN = 1;         // spirit per second while active
  static LIGHTNING_WARD_STRIKE_CHANCE = 0.15;
  static LIGHTNING_WARD_RANGE = 10;

  static AQUEOUS_PULL_COST = 12;  static AQUEOUS_PULL_COOLDOWN = 60;  static AQUEOUS_PULL_RANGE = 15;
  static AQUEOUS_PUSH_COST = 12;  static AQUEOUS_PUSH_COOLDOWN = 60;  static AQUEOUS_PUSH_RANGE = 15;
  // Knockback strength (horizontal, vertical) — bumped up from 1.2/0.3 and
  // 1.6/0.4 per user feedback after testing, felt too weak.
  static AQUEOUS_PULL_STRENGTH = [2.0, 0.4];
  static AQUEOUS_PUSH_STRENGTH = [2.6, 0.5];
  static AQUEOUS_DROWN_COST = 18; static AQUEOUS_DROWN_COOLDOWN = 100; static AQUEOUS_DROWN_RANGE = 12;
  static AQUEOUS_DROWN_DURATION = 100; // 5s total
  static AQUEOUS_DROWN_TICK_INTERVAL = 20; // 1s between damage pulses
  static AQUEOUS_DROWN_DAMAGE = 2;

  static modes = new Map();               // player name -> mode index
  static cooldowns = new Map();            // player name -> { pull, push, drown }
  static lightningWardActive = new Map();  // player name -> bool
  static wardTickCounters = new Map();     // player name -> tick counter (for the 1/sec drain check)

  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  static applyPassiveAbilities(player) {
    this.applyPhysicalEnhancements(player);
    this.applyWaterAffinity(player);
    this.applyDepthStrider(player);
    this.applyHealthBonus(player);

    try {
      const regen = player.getEffect('regeneration');
      if (!regen || regen.duration < 200) {
        player.addEffect('regeneration', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
      }
    } catch (_) {}

    // Wrapped separately from regeneration above — user reported this one
    // specifically not showing up in testing. These were previously
    // unguarded (unlike every other addEffect call in this file), so if
    // 'dolphins_grace' were ever an invalid id, addEffect would throw and
    // silently kill the rest of applyPassiveAbilities for that tick via
    // main.js's outer catch — which would explain "everything else works,
    // just this one doesn't" exactly, since it was the last effect applied.
    // Isolating it in its own try/catch stops it from being able to affect
    // anything else either way.
    try {
      const dolphin = player.getEffect('dolphins_grace');
      if (!dolphin || dolphin.duration < 200) {
        player.addEffect('dolphins_grace', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
      }
    } catch (_) {}
  }

  static applyPhysicalEnhancements(player) {
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

  // Same shape as SailorSequence/FolkOfRageSequence.applyWaterAffinity —
  // see sailor.js for why removeEffect-before-addEffect is required for the
  // downgrade direction.
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

  // ── Ability-state ticking ─────────────────────────────────────────────────
  static tickAbilityState(player) {
    const cds = this.cooldowns.get(player.name);
    if (cds) for (const k of Object.keys(cds)) { if (cds[k] > 0) cds[k]--; }

    this._processLightningWard(player);
  }

  static _getCD(player, key) { return this.cooldowns.get(player.name)?.[key] ?? 0; }
  static _setCD(player, key, value) {
    if (!this.cooldowns.has(player.name)) this.cooldowns.set(player.name, { pull: 0, push: 0, drown: 0 });
    this.cooldowns.get(player.name)[key] = value;
  }

  static cycleMode(player) {
    const next = ((this.modes.get(player.name) ?? 0) + 1) % this.MODES.length;
    this.modes.set(player.name, next);
    player.sendMessage(`§6Seafarer's Tide — Mode: ${this.MODE_LABELS[this.MODES[next]]}`);
  }

  // ── Lightning Ward (toggle) ───────────────────────────────────────────────
  static useLightningWard(player) {
    if (this.lightningWardActive.get(player.name)) {
      this.lightningWardActive.set(player.name, false);
      player.sendMessage('§7Lightning Ward deactivated');
      return true;
    }
    if (!SpiritSystem.canAfford(player, this.LIGHTNING_WARD_DRAIN)) {
      player.sendMessage('§cNot enough spirit to activate!');
      return false;
    }
    this.lightningWardActive.set(player.name, true);
    this.wardTickCounters.set(player.name, 0);
    player.sendMessage('§e⚡ Lightning Ward active — storms answer your call');
    return true;
  }

  static _processLightningWard(player) {
    if (!this.lightningWardActive.get(player.name)) return;
    const tick = (this.wardTickCounters.get(player.name) ?? 0) + 1;
    this.wardTickCounters.set(player.name, tick);
    if (tick % 20 !== 0) return; // once per second

    if (!SpiritSystem.consumeSpirit(player, this.LIGHTNING_WARD_DRAIN)) {
      this.lightningWardActive.set(player.name, false);
      player.sendMessage('§7Lightning Ward fades — out of spirit');
      return;
    }

    if (Math.random() >= this.LIGHTNING_WARD_STRIKE_CHANCE) return;
    try {
      const nearby = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.LIGHTNING_WARD_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:player']
      }).filter(isHostileEntity);
      if (nearby.length === 0) return;
      const target = nearby[Math.floor(Math.random() * nearby.length)];
      player.dimension.spawnEntity('minecraft:lightning_bolt', target.location);
    } catch (_) {}
  }

  // ── Aqueous Pull ───────────────────────────────────────────────────────────
  static useAqueousPull(player) {
    const cd = this._getCD(player, 'pull');
    if (cd > 0) { player.sendMessage(`§cAqueous Pull on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.AQUEOUS_PULL_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.AQUEOUS_PULL_COST}`); return false;
    }

    const hit = this._performRaycast(player, this.AQUEOUS_PULL_RANGE);
    if (!hit) {
      SpiritSystem.addSpirit(player, this.AQUEOUS_PULL_COST);
      player.sendMessage('§7Aqueous Pull found nothing to grab');
      return false;
    }

    try {
      const dx = player.location.x - hit.location.x;
      const dz = player.location.z - hit.location.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      hit.applyKnockback(dx / len, dz / len, this.AQUEOUS_PULL_STRENGTH[0], this.AQUEOUS_PULL_STRENGTH[1]);
      hit.dimension.spawnParticle('minecraft:bubble_column_up_particle', hit.location);
    } catch (_) {}

    player.sendMessage('§b§oThe tide drags them in...');
    this._setCD(player, 'pull', this.AQUEOUS_PULL_COOLDOWN);
    return true;
  }

  // ── Aqueous Push ───────────────────────────────────────────────────────────
  static useAqueousPush(player) {
    const cd = this._getCD(player, 'push');
    if (cd > 0) { player.sendMessage(`§cAqueous Push on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.AQUEOUS_PUSH_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.AQUEOUS_PUSH_COST}`); return false;
    }

    const hit = this._performRaycast(player, this.AQUEOUS_PUSH_RANGE);
    if (!hit) {
      SpiritSystem.addSpirit(player, this.AQUEOUS_PUSH_COST);
      player.sendMessage('§7Aqueous Push found nothing to shove');
      return false;
    }

    try {
      const dx = hit.location.x - player.location.x;
      const dz = hit.location.z - player.location.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      hit.applyKnockback(dx / len, dz / len, this.AQUEOUS_PUSH_STRENGTH[0], this.AQUEOUS_PUSH_STRENGTH[1]);
      hit.dimension.spawnParticle('minecraft:bubble_column_up_particle', hit.location);
    } catch (_) {}

    player.sendMessage('§b§oA wave hurls them back!');
    this._setCD(player, 'push', this.AQUEOUS_PUSH_COOLDOWN);
    return true;
  }

  // ── Aqueous Drown ──────────────────────────────────────────────────────────
  // Self-contained runTimeout chain (same shape as Judge's useDeath) rather
  // than the Map+tickAbilityState pattern used elsewhere this session — the
  // effect lives on the VICTIM, who might not be a Tyrant player (or a
  // player at all), so there's no per-player tick loop to hook it into.
  static useAqueousDrown(player) {
    const cd = this._getCD(player, 'drown');
    if (cd > 0) { player.sendMessage(`§cAqueous Drown on cooldown: §e${Math.ceil(cd / 20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.AQUEOUS_DROWN_COST)) {
      player.sendMessage(`§cNot enough spirit! Need ${this.AQUEOUS_DROWN_COST}`); return false;
    }

    const hit = this._performRaycast(player, this.AQUEOUS_DROWN_RANGE);
    if (!hit) {
      SpiritSystem.addSpirit(player, this.AQUEOUS_DROWN_COST);
      player.sendMessage('§7Aqueous Drown found no target');
      return false;
    }

    player.sendMessage('§3§oWater floods their lungs...');
    let elapsed = 0;
    const doTick = () => {
      if (!hit.isValid() || elapsed >= this.AQUEOUS_DROWN_DURATION) return;
      elapsed += this.AQUEOUS_DROWN_TICK_INTERVAL;
      try { hit.applyDamage(this.AQUEOUS_DROWN_DAMAGE, { cause: EntityDamageCause.drowning, damagingEntity: player }); } catch (_) {}
      try { hit.addEffect('slowness', this.AQUEOUS_DROWN_TICK_INTERVAL + 5, { amplifier: 2, showParticles: true }); } catch (_) {}
      try { hit.dimension.spawnParticle('minecraft:bubble_column_up_particle', { x: hit.location.x, y: hit.location.y + 1, z: hit.location.z }); } catch (_) {}
      system.runTimeout(doTick, this.AQUEOUS_DROWN_TICK_INTERVAL);
    };
    system.runTimeout(doTick, this.AQUEOUS_DROWN_TICK_INTERVAL);

    this._setCD(player, 'drown', this.AQUEOUS_DROWN_COOLDOWN);
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
    // so without this a Sailor/Folk of Rage player holding this item
    // (however they got it) could use Seafarer-tier abilities early.
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }
    if (isSneaking) { this.cycleMode(player); return true; }
    const mode = this.MODES[this.modes.get(player.name) ?? 0];
    if (mode === 'lightning_ward') return this.useLightningWard(player);
    if (mode === 'aqueous_pull')   return this.useAqueousPull(player);
    if (mode === 'aqueous_push')   return this.useAqueousPush(player);
    if (mode === 'aqueous_drown')  return this.useAqueousDrown(player);
    return false;
  }

  static getStatusText(player) {
    const modeIdx = this.modes.get(player.name) ?? 0;
    const label   = this.MODE_LABELS[this.MODES[modeIdx]];
    const ward     = this.lightningWardActive.get(player.name) ? ' §e⚡Active' : '';
    return `§6Seafarer's Tide §7| ${label}${ward}`;
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
    this.cooldowns.delete(player.name);
    this.lightningWardActive.delete(player.name);
    this.wardTickCounters.delete(player.name);
  }
}
