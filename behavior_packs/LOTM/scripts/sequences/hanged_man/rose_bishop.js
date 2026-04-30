// ============================================
// ROSE BISHOP - SEQUENCE 6 HANGED MAN PATHWAY
// ============================================
// Flesh & Blood Magic specialist.
// New: Flesh Hunger meter, Flesh Cloak (passive),
// Flesh Softening (passive), Flesh Bomb (item),
// Flesh & Blood Curse, Regeneration from flesh.
// Inherited: all Shadow Ascetic + Listener + Secrets Suppliant.
// Listen is still toggleable.
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { ShadowAsceticSequence } from './shadow_ascetic.js';
import { ListenerSequence } from './listener.js';
import { SecretsSuppliantSequence } from './secrets_suppliant.js';

export class RoseBishopSequence {
  static SEQUENCE_NUMBER = 6;
  static PATHWAY = PathwayManager.PATHWAYS.HANGED_MAN;

  static EFFECT_DURATION = 999999;

  // ── Flesh Hunger Meter ───────────────────────────────────────────────────
  // 0 = starved (weakened), 50 = normal, 100 = sated (bonus damage)
  // Stored as a dynamic property.
  static FLESH_HUNGER_PROPERTY     = 'lotm:rose_flesh_hunger';
  static MAX_FLESH_HUNGER          = 100;
  // Decay rate per passive tick (slowly drains — must keep feeding)
  static HUNGER_DECAY_RATE         = 0.06; // ~full drain in ~11 min of play
  // Flesh items and how much hunger they restore
  static FLESH_ITEMS = {
    'minecraft:rotten_flesh':     12,
    'minecraft:raw_beef':         20,
    'minecraft:raw_porkchop':     20,
    'minecraft:raw_mutton':       18,
    'minecraft:raw_chicken':      16,
    'minecraft:raw_rabbit':       14,
    'minecraft:raw_cod':          12,
    'minecraft:raw_salmon':       12,
    'lotm:ghoul_flesh':           30,
    'lotm:spirit_blood':          25,
    'lotm:raw_characteristic':    40,  // ritual consumption
  };
  // Bonus damage when sated (hunger >= 80)
  static SATED_BONUS_DAMAGE        = 4;
  // Weakness when starved (hunger < 20)
  static STARVED_WEAKNESS          = true;

  // ── Flesh Cloak (passive) ────────────────────────────────────────────────
  // Always-on when player has sequence. Scaling resistance based on hunger.
  // High hunger = better cloak. Starved = no cloak.
  // Represented as Resistance + Absorption

  // ── Flesh Softening (passive) ────────────────────────────────────────────
  // Knockback resistance + base Resistance I always active
  static SOFTENING_RESISTANCE      = 1; // amplifier (Resistance II)

  // ── Flesh Bomb ───────────────────────────────────────────────────────────
  // Thrown item (lotm:flesh_bomb). Explosion on hit.
  // Crafted: ghoul_flesh + spirit_blood — ingredients ARE the cost,
  // so spirit cost is minimal (just the activation energy).
  static BOMB_SPIRIT_COST           = 1;    // Near-free — crafting IS the cost
  // Cooldown tracked by system tick timestamp (like revolver) — NOT by runInterval
  static BOMB_COOLDOWN_TICKS        = 40;   // 2 seconds between throws (was 5s)
  static BOMB_RANGE                 = 5;    // explosion radius
  static BOMB_DAMAGE                = 12;   // direct hit damage
  static BOMB_CORROSIVE_DAMAGE      = 6;    // splash/corrosive effect
  static BOMB_CORROSIVE_DURATION    = 160;  // ticks of wither/poison
  // Timestamp-based cooldown (avoids tick-counting overhead)
  static bombLastUsed               = new Map(); // playerName -> game tick

  // ── Flesh & Blood Curse ──────────────────────────────────────────────────
  // Enhanced from Shadow Ascetic. Requires flesh medium.
  // Causes: wither, poison, slowness, mining fatigue
  static CURSE_SPIRIT_COST          = 45;
  static CURSE_COOLDOWN             = 200;  // 10 seconds (reduced from 25)
  static CURSE_RANGE                = 14;
  static CURSE_DURATION             = 600;  // 30 seconds
  static CURSE_WITHER_AMP           = 1;    // Wither II

  // ── Regeneration from flesh ──────────────────────────────────────────────
  static REGEN_SPIRIT_COST          = 0;   // free — just needs flesh items
  static REGEN_HEAL_PER_ITEM        = 4;   // hearts restored per flesh item consumed (2 hearts)
  static REGEN_COOLDOWN             = 30;  // 1.5 seconds between heals

  // ── Ability identifiers ──────────────────────────────────────────────────
  static ABILITIES = {
    // Inherited chain
    SHADOW_SUMMON:       ShadowAsceticSequence.ABILITIES.SHADOW_SUMMON,
    SHADOW_CURSE:        ShadowAsceticSequence.ABILITIES.SHADOW_CURSE,
    SHADOW_MANIPULATION: ShadowAsceticSequence.ABILITIES.SHADOW_MANIPULATION,
    SHADOW_LURKING:      ShadowAsceticSequence.ABILITIES.SHADOW_LURKING,
    SHADOW_SHAPING:      ShadowAsceticSequence.ABILITIES.SHADOW_SHAPING,
    TOGGLE_LISTEN:       ShadowAsceticSequence.ABILITIES.TOGGLE_LISTEN,
    FOCUSED_LISTEN:      ShadowAsceticSequence.ABILITIES.FOCUSED_LISTEN,
    SUPPRESS_VOICES:     ShadowAsceticSequence.ABILITIES.SUPPRESS_VOICES,
    DIVINATION:          SecretsSuppliantSequence.ABILITIES.DIVINATION,
    ENCHANTMENT_INSCRIPTION: SecretsSuppliantSequence.ABILITIES.ENCHANTMENT_INSCRIPTION,
    AURA_READING:        SecretsSuppliantSequence.ABILITIES.AURA_READING,
    // New
    FLESH_BOMB:          'flesh_bomb',
    FLESH_CURSE:         'flesh_curse',
    CONSUME_FLESH:       'consume_flesh',
  };

  // ── State maps ───────────────────────────────────────────────────────────
  static curseCooldowns    = new Map();
  static regenCooldowns    = new Map();
  static activeCurses      = new Map(); // playerName -> [{entityId, ticksRemaining}]

  // Selected ability
  static selectedAbilities  = new Map();
  static SELECTED_ABILITY_PROPERTY = 'lotm:rose_selected_ability';

  // =============================================
  // SEQUENCE CHECK
  // =============================================
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // =============================================
  // SELECTED ABILITY HELPERS
  // =============================================
  static getSelectedAbility(player) {
    if (!this.selectedAbilities.has(player.name)) {
      try {
        const saved = player.getDynamicProperty(this.SELECTED_ABILITY_PROPERTY);
        if (saved) this.selectedAbilities.set(player.name, saved);
      } catch (e) {}
    }
    return this.selectedAbilities.get(player.name) || this.ABILITIES.FLESH_BOMB;
  }

  static setSelectedAbility(player, abilityId) {
    this.selectedAbilities.set(player.name, abilityId);
    try { player.setDynamicProperty(this.SELECTED_ABILITY_PROPERTY, abilityId); } catch (e) {}
  }

  static useSelectedAbility(player) {
    return this.handleAbilityUse(player, this.getSelectedAbility(player));
  }

  // =============================================
  // FLESH HUNGER HELPERS
  // =============================================
  static getFleshHunger(player) {
    try {
      const v = player.getDynamicProperty(this.FLESH_HUNGER_PROPERTY);
      return typeof v === 'number' ? v : 50; // default 50 (neutral)
    } catch (e) { return 50; }
  }

  static setFleshHunger(player, value) {
    const clamped = Math.max(0, Math.min(this.MAX_FLESH_HUNGER, value));
    try { player.setDynamicProperty(this.FLESH_HUNGER_PROPERTY, clamped); } catch (e) {}
    return clamped;
  }

  static getHungerStage(hunger) {
    if (hunger >= 80) return 'sated';
    if (hunger >= 40) return 'neutral';
    if (hunger >= 20) return 'hungry';
    return 'starved';
  }

  static getHungerLabel(hunger) {
    const stage = this.getHungerStage(hunger);
    const map = {
      sated:   '§cSated §7(+dmg)',
      neutral: '§7Neutral',
      hungry:  '§6Hungry',
      starved: '§4Starved §7(weakened)'
    };
    return map[stage];
  }

  // =============================================
  // PASSIVE ABILITIES
  // =============================================
  static applyPassiveAbilities(player) {
    // ── Base stats (Seq 6 — further improved over Seq 7) ─────────────────
    // Speed I, Strength II, Jump I, Resistance II, Night Vision
    const nv = player.getEffect('night_vision');
    if (!nv || nv.duration < 200)
      player.addEffect('night_vision', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });

    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== 0 || speed.duration < 200)
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });

    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== 1 || strength.duration < 200)
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: 1, showParticles: false });

    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== 0 || jump.duration < 200)
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });

    // Health bonus — 3 extra hearts (6 hp) base
    const hb = player.getEffect('health_boost');
    if (!hb || hb.amplifier !== 1 || hb.duration < 200)
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier: 1, showParticles: false });

    // ── Flesh Hunger decay ────────────────────────────────────────────────
    const hunger = this.setFleshHunger(player, this.getFleshHunger(player) - this.HUNGER_DECAY_RATE);

    // ── Flesh Cloak (passive, scales with hunger) ─────────────────────────
    this._applyFleshCloak(player, hunger);

    // ── Flesh Softening (passive) ─────────────────────────────────────────
    this._applyFleshSoftening(player, hunger);

    // ── Hunger-based effects ──────────────────────────────────────────────
    this._applyHungerEffects(player, hunger);

    // ── Madness (inherited, conditional on Listen toggle) ─────────────────
    ListenerSequence._tickMadness(player);
    if (ShadowAsceticSequence.isListenActive(player)) {
      ListenerSequence._tickListen(player);
      ListenerSequence._applyMadnessEffects(player);
    }

    // ── Spirit Perception passive ─────────────────────────────────────────
    SecretsSuppliantSequence.runSpiritPerceptionPassive(player);

    // ── Shadow Lurking ────────────────────────────────────────────────────
    if (ShadowAsceticSequence.lurkActive.has(player.name)) {
      ShadowAsceticSequence._processLurking(player);
    }

    // ── Curse processing ──────────────────────────────────────────────────
    this._processActiveCurses(player);
    ShadowAsceticSequence._processActiveManipulations(player);

    // ── Inherited active ability processing ───────────────────────────────
    ListenerSequence._processFocusedListen(player);
    ListenerSequence._processSuppressVoices(player);
    ShadowAsceticSequence._processShadowSword(player);

    // ── Cooldown ticks ────────────────────────────────────────────────────
    this._tickCooldowns(player);

    // ── Action bar ────────────────────────────────────────────────────────
    const madness    = Math.floor(ListenerSequence.getMadness(player));
    const mStage     = ListenerSequence.getMadnessStage(player);
    const mLabel     = ListenerSequence.getMadnessLabel(mStage);
    const spirit     = Math.floor(SpiritSystem.getSpirit(player));
    const maxSpirit  = SpiritSystem.getMaxSpirit(player);
    const listenStr  = ShadowAsceticSequence.isListenActive(player) ? '§5👂' : '§7🔇';
    const lurkStr    = ShadowAsceticSequence.lurkActive.has(player.name) ? ' §8[LURK]' : '';
    const hungerStr  = this.getHungerLabel(hunger);
    const selectedId = this.getSelectedAbility(player);
    const selectedName = this.getAllAbilities().find(a => a.id === selectedId)?.name || '§7?';

    player.onScreenDisplay.setActionBar(
      `§bSpirit: §f${spirit}§7/§f${maxSpirit}  ${listenStr}  §cFlesh: §f${Math.floor(hunger)}§7/§f100 ${hungerStr}` +
      `\n§7Mind: ${mLabel} §7(${madness}/100)${lurkStr}  §eSelected: ${selectedName}`
    );
  }

  // =============================================
  // FLESH CLOAK (passive)
  // Reduces magic/spell damage. Scales with hunger.
  // Sated: Resistance II + Absorption II
  // Neutral: Resistance I + Absorption I
  // Hungry: Resistance I only
  // Starved: no cloak
  // =============================================
  static _applyFleshCloak(player, hunger) {
    const stage = this.getHungerStage(hunger);

    let resAmp  = -1; // off
    let absAmp  = -1; // off

    if (stage === 'sated')   { resAmp = 2; absAmp = 2; }
    else if (stage === 'neutral') { resAmp = 1; absAmp = 1; }
    else if (stage === 'hungry')  { resAmp = 1; absAmp = -1; }
    // starved: nothing

    if (resAmp >= 0) {
      const res = player.getEffect('resistance');
      if (!res || res.amplifier !== resAmp || res.duration < 200)
        player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: resAmp, showParticles: false });
    } else {
      try { player.removeEffect('resistance'); } catch (e) {}
    }

    if (absAmp >= 0) {
      const abs = player.getEffect('absorption');
      if (!abs || abs.amplifier !== absAmp || abs.duration < 200)
        player.addEffect('absorption', this.EFFECT_DURATION, { amplifier: absAmp, showParticles: false });
    } else {
      try { player.removeEffect('absorption'); } catch (e) {}
    }
  }

  // =============================================
  // FLESH SOFTENING (passive)
  // Always-on physical resistance bonus.
  // Represented as knockback resistance (Bedrock doesn't expose
  // knockback_resistance as an effect, so we use Resistance + Slow Falling
  // to simulate the "boneless blob" that absorbs hits).
  // =============================================
  static _applyFleshSoftening(player, hunger) {
    // Slow falling at low amounts reduces fall damage (softened body)
    // Only apply if not already handled by other sequences
    if (hunger >= 40) {
      const sf = player.getEffect('slow_falling');
      if (!sf || sf.duration < 200)
        player.addEffect('slow_falling', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }
    // Regeneration I — flesh heals itself constantly
    if (hunger >= 60) {
      const regen = player.getEffect('regeneration');
      if (!regen || regen.amplifier !== 0 || regen.duration < 200)
        player.addEffect('regeneration', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }
    // Regen II when sated
    if (hunger >= 80) {
      const regen = player.getEffect('regeneration');
      if (!regen || regen.amplifier !== 1 || regen.duration < 200)
        player.addEffect('regeneration', this.EFFECT_DURATION, { amplifier: 1, showParticles: false });
    }
  }

  // =============================================
  // HUNGER-BASED EFFECTS
  // =============================================
  static _applyHungerEffects(player, hunger) {
    const stage = this.getHungerStage(hunger);

    if (stage === 'sated') {
      // Bonus strength stacks (Strength III total)
      const str = player.getEffect('strength');
      if (!str || str.amplifier !== 2 || str.duration < 200)
        player.addEffect('strength', this.EFFECT_DURATION, { amplifier: 2, showParticles: false });
    }

    if (stage === 'starved') {
      // Weakness I when starved — can't exert Flesh & Blood properly
      const wk = player.getEffect('weakness');
      if (!wk || wk.amplifier !== 0 || wk.duration < 200)
        player.addEffect('weakness', 60, { amplifier: 0, showParticles: false });
      // Hunger visual — nausea pulse occasionally
      if (Math.random() < 0.02)
        player.addEffect('nausea', 40, { amplifier: 0, showParticles: true });
    } else {
      // Remove starved debuffs when not starved
      try {
        const wk = player.getEffect('weakness');
        if (wk && wk.duration < 80) player.removeEffect('weakness');
      } catch (e) {}
    }
  }

  // =============================================
  // CONSUME FLESH (active)
  // Scans hotbar/inventory for flesh items and
  // consumes one, healing HP and filling hunger.
  // =============================================
  static useConsumeFlesh(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    const cd = this._cdRemaining(this.regenCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cFlesh consumption on cooldown: §c${cd}s`);
      return false;
    }

    const inventory = player.getComponent('minecraft:inventory');
    if (!inventory?.container) {
      player.sendMessage('§cCannot access inventory!');
      return false;
    }

    // Find first flesh item in inventory
    let foundSlot   = -1;
    let foundItem   = null;
    let hungerGain  = 0;

    for (let slot = 0; slot < 36; slot++) {
      const item = inventory.container.getItem(slot);
      if (!item) continue;
      if (this.FLESH_ITEMS[item.typeId] !== undefined) {
        foundSlot  = slot;
        foundItem  = item;
        hungerGain = this.FLESH_ITEMS[item.typeId];
        break;
      }
    }

    if (foundSlot === -1) {
      player.sendMessage('§cNo flesh or blood items in inventory!');
      player.sendMessage('§7Need: raw meat, rotten flesh, ghoul flesh, or spirit blood');
      return false;
    }

    // Consume item
    if (foundItem.amount > 1) {
      foundItem.amount -= 1;
      inventory.container.setItem(foundSlot, foundItem);
    } else {
      inventory.container.setItem(foundSlot, undefined);
    }

    // Restore hunger
    const prev   = this.getFleshHunger(player);
    const newHun = this.setFleshHunger(player, prev + hungerGain);

    // Heal HP (Regeneration II burst)
    try {
      player.addEffect('regeneration', 60, { amplifier: 2, showParticles: true });
    } catch (e) {}

    // Direct HP restoration
    try {
      const health = player.getComponent('minecraft:health');
      if (health) {
        const healed = Math.min(health.effectiveMax, health.currentValue + this.REGEN_HEAL_PER_ITEM);
        health.setCurrentValue(healed);
      }
    } catch (e) {}

    this.regenCooldowns.set(player.name, this.REGEN_COOLDOWN);

    const itemName = foundItem.typeId.replace('minecraft:', '').replace('lotm:', '').replace('_', ' ');
    player.sendMessage(`§cYou consume the §4${itemName}§c...`);
    player.sendMessage(`§cFlesh hunger: §4${Math.floor(prev)} §7→ §4${Math.floor(newHun)} §7(+${hungerGain})`);
    player.playSound('mob.player.hurt', { pitch: 0.6, volume: 0.5 });

    // Consumption particles — bloody red wisps
    this._spawnConsumeEffect(player);

    return true;
  }

  static _spawnConsumeEffect(player) {
    const loc = player.location;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      system.runTimeout(() => {
        try {
          player.dimension.spawnParticle('minecraft:critical_hit_emitter', {
            x: loc.x + Math.cos(angle) * 0.6,
            y: loc.y + 1.5,
            z: loc.z + Math.sin(angle) * 0.6
          });
        } catch (e) {}
      }, i * 2);
    }
    // Soul particle burst (body absorbing)
    try {
      player.dimension.spawnParticle('minecraft:soul_particle', {
        x: loc.x, y: loc.y + 1, z: loc.z
      });
    } catch (e) {}
  }

  // =============================================
  // FLESH BOMB (active)
  // Throws a flesh bomb entity that explodes on
  // contact. Requires lotm:flesh_bomb in inventory.
  // Explosion causes: damage + corrosive wither/poison.
  // =============================================
  static useFleshBomb(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    // Timestamp-based cooldown check (same pattern as revolver)
    const currentTick = world.currentTick || 0;
    const lastUsed    = this.bombLastUsed.get(player.name) || 0;
    const ticksLeft   = this.BOMB_COOLDOWN_TICKS - (currentTick - lastUsed);
    if (ticksLeft > 0) {
      player.sendMessage(`§cFlesh Bomb on cooldown: §c${Math.ceil(ticksLeft / 20)}s`);
      return false;
    }

    // Check for flesh bomb item in inventory
    if (!this._consumeItem(player, 'lotm:flesh_bomb')) {
      player.sendMessage('§cYou need a §4Flesh Bomb §cin your inventory!');
      player.sendMessage('§7Craft: Ghoul Flesh + Spirit Blood at crafting table');
      return false;
    }

    // Minimal spirit cost — the ingredients were the real cost
    if (!SpiritSystem.consumeSpirit(player, this.BOMB_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit!`);
      try { player.runCommand('give @s lotm:flesh_bomb 1'); } catch (e) {}
      return false;
    }

    this.bombLastUsed.set(player.name, currentTick);

    this._launchFleshBomb(player);

    player.sendMessage('§4§l💣 FLESH BOMB thrown!');
    player.playSound('mob.slime.attack', { pitch: 0.5, volume: 1.0 });

    return true;
  }

  static _launchFleshBomb(player) {
    const dir     = player.getViewDirection();
    const origin  = {
      x: player.location.x + dir.x * 1.5,
      y: player.location.y + 1.5 + dir.y * 1.5,
      z: player.location.z + dir.z * 1.5
    };

    // We simulate a projectile by checking positions over time
    // Store the bomb as a tracked flying object using runInterval
    const speed    = 1.2; // blocks per tick step
    const gravity  = 0.04;
    let   vx       = dir.x * speed;
    let   vy       = dir.y * speed;
    let   vz       = dir.z * speed;
    let   cx       = origin.x;
    let   cy       = origin.y;
    let   cz       = origin.z;
    let   ticks    = 0;
    const maxTicks = 60; // 3 seconds max flight
    let   exploded = false;

    const intervalId = system.runInterval(() => {
      if (exploded || ticks >= maxTicks) {
        system.clearRun(intervalId);
        if (!exploded) this._detonateFleshBomb(player, { x: cx, y: cy, z: cz });
        return;
      }

      // Apply gravity
      vy -= gravity;
      cx += vx;
      cy += vy;
      cz += vz;
      ticks++;

      // Spawn trail particles
      try {
        player.dimension.spawnParticle('minecraft:critical_hit_emitter', { x: cx, y: cy, z: cz });
        if (ticks % 3 === 0) {
          player.dimension.spawnParticle('minecraft:soul_particle', { x: cx, y: cy, z: cz });
        }
      } catch (e) {}

      // Check collision with nearby entities
      try {
        const nearby = player.dimension.getEntities({
          location: { x: cx, y: cy, z: cz },
          maxDistance: 1.5,
          excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow']
        });
        for (const e of nearby) {
          if (e.id === player.id) continue;
          exploded = true;
          system.clearRun(intervalId);
          this._detonateFleshBomb(player, { x: cx, y: cy, z: cz });
          return;
        }
      } catch (e) {}

      // Check block collision (simple: check if y is below terrain)
      try {
        const block = player.dimension.getBlock({ x: Math.floor(cx), y: Math.floor(cy), z: Math.floor(cz) });
        if (block && !block.isAir && !block.isLiquid) {
          exploded = true;
          system.clearRun(intervalId);
          this._detonateFleshBomb(player, { x: cx, y: cy, z: cz });
          return;
        }
      } catch (e) {}
    }, 1);
  }

  static _detonateFleshBomb(player, location) {
    // Visual — flesh explosion burst
    for (let i = 0; i < 20; i++) {
      const angle  = (i / 20) * Math.PI * 2;
      const height = Math.random() * 2;
      const radius = Math.random() * this.BOMB_RANGE * 0.5;
      try {
        player.dimension.spawnParticle('minecraft:critical_hit_emitter', {
          x: location.x + Math.cos(angle) * radius,
          y: location.y + height,
          z: location.z + Math.sin(angle) * radius
        });
        player.dimension.spawnParticle('minecraft:soul_particle', {
          x: location.x + Math.cos(angle + 0.3) * radius * 0.7,
          y: location.y + height * 0.5,
          z: location.z + Math.sin(angle + 0.3) * radius * 0.7
        });
      } catch (e) {}
    }

    // Sound
    try {
      player.dimension.playSound('random.explode', {
        location: location,
        pitch: 0.5,
        volume: 1.0
      });
    } catch (e) {
      player.playSound('random.explode', { pitch: 0.5, volume: 1.0 });
    }

    // Damage and corrosive effects
    try {
      const entities = player.dimension.getEntities({
        location: location,
        maxDistance: this.BOMB_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow']
      });

      for (const entity of entities) {
        if (entity.id === player.id) continue;

        // Distance-based damage falloff
        const dx   = entity.location.x - location.x;
        const dy   = entity.location.y - location.y;
        const dz   = entity.location.z - location.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const dmgFalloff = Math.max(0, 1 - (dist / this.BOMB_RANGE));
        const dmg  = Math.floor(this.BOMB_DAMAGE * dmgFalloff + this.BOMB_CORROSIVE_DAMAGE);

        try { entity.applyDamage(dmg); } catch (e) {}

        // Corrosive blood splash effects
        try {
          entity.addEffect('wither',  this.BOMB_CORROSIVE_DURATION, { amplifier: 1, showParticles: true });
          entity.addEffect('poison',  this.BOMB_CORROSIVE_DURATION, { amplifier: 0, showParticles: true });
          entity.addEffect('slowness', 100,                          { amplifier: 1, showParticles: false });
        } catch (e) {}
      }
    } catch (e) {}

    // Replenish some flesh hunger (the bomb came from your own body)
    const newHunger = this.setFleshHunger(player, this.getFleshHunger(player) - 8);
    if (newHunger < 20) {
      player.sendMessage('§4Your body aches from the sacrifice... replenish your flesh.');
    }
  }

  // =============================================
  // FLESH & BLOOD CURSE (enhanced version)
  // Requires flesh medium. Stronger than Shadow Ascetic's.
  // =============================================
  static useFleshCurse(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    const cd = this._cdRemaining(this.curseCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cFlesh & Blood Curse on cooldown: §c${cd}s`);
      return false;
    }

    // Consume flesh medium
    const medium = this._consumeFleshMedium(player);
    if (!medium) {
      player.sendMessage('§cNeeds flesh medium: §4Rotten Flesh, Spirit Blood, §cor §4Ghoul Flesh');
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.CURSE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §c${this.CURSE_SPIRIT_COST}`);
      this._giveItem(player, medium);
      return false;
    }

    // Find nearest target
    const target = this._findNearestTarget(player, this.CURSE_RANGE);
    if (!target) {
      player.sendMessage('§cNo target in range!');
      SpiritSystem.restoreSpirit(player, this.CURSE_SPIRIT_COST);
      this._giveItem(player, medium);
      return false;
    }

    this.curseCooldowns.set(player.name, this.CURSE_COOLDOWN);

    // Register curse
    const curseList = this.activeCurses.get(player.name) || [];
    curseList.push({ entityId: target.id, ticksRemaining: this.CURSE_DURATION });
    this.activeCurses.set(player.name, curseList);

    player.sendMessage('§4§l🩸 FLESH & BLOOD CURSE');
    player.sendMessage('§4Their own flesh turns against them...');
    player.playSound('mob.wither.shoot', { pitch: 0.3, volume: 1.0 });

    // Initial burst — strong immediate effects
    try {
      target.addEffect('wither',       100, { amplifier: this.CURSE_WITHER_AMP, showParticles: true });
      target.addEffect('poison',       100, { amplifier: 1, showParticles: true });
      target.addEffect('slowness',     100, { amplifier: 2, showParticles: false });
      target.addEffect('mining_fatigue',100, { amplifier: 2, showParticles: false });
    } catch (e) {}

    // Visual
    this._spawnCurseEffect(player.dimension, target.location);

    return true;
  }

  static _processActiveCurses(player) {
    const curses = this.activeCurses.get(player.name);
    if (!curses || curses.length === 0) return;

    const remaining = [];
    for (const curse of curses) {
      curse.ticksRemaining--;
      if (curse.ticksRemaining <= 0) continue;

      let target = null;
      try {
        const entities = player.dimension.getEntities({
          location: player.location,
          maxDistance: 200
        });
        target = entities.find(e => e.id === curse.entityId) || null;
      } catch (e) {}

      if (!target) continue;

      // Refresh every 40 ticks
      if (curse.ticksRemaining % 40 === 0) {
        try {
          target.addEffect('wither',       60, { amplifier: this.CURSE_WITHER_AMP, showParticles: true });
          target.addEffect('poison',       60, { amplifier: 0,                     showParticles: true });
          target.addEffect('slowness',     60, { amplifier: 2,                     showParticles: false });
          target.addEffect('mining_fatigue',60, { amplifier: 1,                    showParticles: false });
        } catch (e) {}
      }

      // Flesh tear particles every 20 ticks
      if (curse.ticksRemaining % 20 === 0) {
        try {
          player.dimension.spawnParticle('minecraft:critical_hit_emitter', {
            x: target.location.x,
            y: target.location.y + 1,
            z: target.location.z
          });
        } catch (e) {}
      }

      remaining.push(curse);
    }
    this.activeCurses.set(player.name, remaining);
  }

  static _spawnCurseEffect(dimension, location) {
    for (let ring = 0; ring < 3; ring++) {
      system.runTimeout(() => {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const r = 0.8 + ring * 0.3;
          try {
            dimension.spawnParticle('minecraft:critical_hit_emitter', {
              x: location.x + Math.cos(a) * r,
              y: location.y + ring * 0.5,
              z: location.z + Math.sin(a) * r
            });
            dimension.spawnParticle('minecraft:soul_particle', {
              x: location.x + Math.cos(a + 0.2) * r * 0.6,
              y: location.y + ring * 0.5 + 0.2,
              z: location.z + Math.sin(a + 0.2) * r * 0.6
            });
          } catch (e) {}
        }
      }, ring * 8);
    }
  }

  // =============================================
  // SHARED HELPERS
  // =============================================
  static _consumeItem(player, typeId) {
    const inv = player.getComponent('minecraft:inventory');
    if (!inv?.container) return false;
    for (let slot = 0; slot < 36; slot++) {
      const item = inv.container.getItem(slot);
      if (!item || item.typeId !== typeId) continue;
      if (item.amount > 1) { item.amount -= 1; inv.container.setItem(slot, item); }
      else { inv.container.setItem(slot, undefined); }
      return true;
    }
    return false;
  }

  static _consumeFleshMedium(player) {
    const mediums = ['lotm:ghoul_flesh', 'lotm:spirit_blood', 'minecraft:rotten_flesh'];
    const inv     = player.getComponent('minecraft:inventory');
    if (!inv?.container) return null;
    for (const typeId of mediums) {
      for (let slot = 0; slot < 36; slot++) {
        const item = inv.container.getItem(slot);
        if (!item || item.typeId !== typeId) continue;
        if (item.amount > 1) { item.amount -= 1; inv.container.setItem(slot, item); }
        else { inv.container.setItem(slot, undefined); }
        return typeId;
      }
    }
    return null;
  }

  static _giveItem(player, typeId) {
    try { player.runCommand(`give @s ${typeId} 1`); } catch (e) {}
  }

  static _findNearestTarget(player, range) {
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: range,
        excludeTypes: ['minecraft:item','minecraft:xp_orb','minecraft:arrow','minecraft:player','minecraft:fireball']
      });
      let nearest = null, nearestDist = Infinity;
      for (const e of entities) {
        const dx = e.location.x - player.location.x;
        const dy = e.location.y - player.location.y;
        const dz = e.location.z - player.location.z;
        const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (d < nearestDist) { nearestDist = d; nearest = e; }
      }
      return nearest;
    } catch (e) { return null; }
  }

  // =============================================
  // CALLED FROM main.js — flesh item eaten via
  // itemCompleteUse (food items that are also flesh)
  // =============================================
  static onFleshItemEaten(player, itemTypeId) {
    const pathway  = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    if (pathway !== this.PATHWAY || sequence > this.SEQUENCE_NUMBER) return;

    const gain = this.FLESH_ITEMS[itemTypeId];
    if (gain === undefined) return;

    const prev = this.getFleshHunger(player);
    const next = this.setFleshHunger(player, prev + gain);
    player.sendMessage(`§cFlesh hunger: §4${Math.floor(prev)} §7→ §4${Math.floor(next)}`);

    // Heal bonus — flesh items restore HP when eaten by Rose Bishop
    try {
      const health = player.getComponent('minecraft:health');
      if (health) {
        const healed = Math.min(health.effectiveMax, health.currentValue + 3);
        health.setCurrentValue(healed);
      }
    } catch (e) {}
  }

  // =============================================
  // COOLDOWN HELPERS
  // =============================================
  static _tickCooldowns(player) {
    const n    = player.name;
    const tick = v => (v > 0 ? v - 1 : 0);
    const cc   = this.curseCooldowns.get(n); if (cc)  this.curseCooldowns.set(n, tick(cc));
    const rc   = this.regenCooldowns.get(n); if (rc)  this.regenCooldowns.set(n, tick(rc));
    // Inherited
    ShadowAsceticSequence._tickCooldowns(player);
  }

  static _cdRemaining(map, player) {
    const v = map.get(player.name) || 0;
    return v > 0 ? Math.ceil(v / 20) : 0;
  }

  // =============================================
  // ABILITY HANDLER
  // =============================================
  static handleAbilityUse(player, abilityId) {
    // Delegate down the inheritance chain
    const shadowAbilities = [
      ShadowAsceticSequence.ABILITIES.SHADOW_SUMMON,
      ShadowAsceticSequence.ABILITIES.SHADOW_CURSE,
      ShadowAsceticSequence.ABILITIES.SHADOW_MANIPULATION,
      ShadowAsceticSequence.ABILITIES.SHADOW_LURKING,
      ShadowAsceticSequence.ABILITIES.SHADOW_SHAPING,
      ShadowAsceticSequence.ABILITIES.TOGGLE_LISTEN,
    ];
    const listenerAbilities = [
      ListenerSequence.ABILITIES.FOCUSED_LISTEN,
      ListenerSequence.ABILITIES.SUPPRESS_VOICES,
    ];
    const suppliantAbilities = [
      SecretsSuppliantSequence.ABILITIES.DIVINATION,
      SecretsSuppliantSequence.ABILITIES.ENCHANTMENT_INSCRIPTION,
      SecretsSuppliantSequence.ABILITIES.AURA_READING,
    ];

    if (shadowAbilities.includes(abilityId))
      return ShadowAsceticSequence.handleAbilityUse(player, abilityId);
    if (listenerAbilities.includes(abilityId))
      return ListenerSequence.handleAbilityUse(player, abilityId);
    if (suppliantAbilities.includes(abilityId))
      return SecretsSuppliantSequence.handleAbilityUse(player, abilityId);

    switch (abilityId) {
      case this.ABILITIES.FLESH_BOMB:    return this.useFleshBomb(player);
      case this.ABILITIES.FLESH_CURSE:   return this.useFleshCurse(player);
      case this.ABILITIES.CONSUME_FLESH: return this.useConsumeFlesh(player);
      default:
        player.sendMessage('§cUnknown ability!');
        return false;
    }
  }

  // =============================================
  // ALL ABILITIES (for menu)
  // =============================================
  static getAllAbilities() {
    return [
      // Rose Bishop new
      { id: this.ABILITIES.CONSUME_FLESH,   name: '§c🍖 Consume Flesh',        cost: 0,                        category: 'Rose Bishop' },
      { id: this.ABILITIES.FLESH_BOMB,      name: '§4💣 Flesh Bomb',            cost: this.BOMB_SPIRIT_COST,    category: 'Rose Bishop' },
      { id: this.ABILITIES.FLESH_CURSE,     name: '§4🩸 Flesh & Blood Curse',   cost: this.CURSE_SPIRIT_COST,   category: 'Rose Bishop' },
      // Shadow Ascetic
      { id: ShadowAsceticSequence.ABILITIES.SHADOW_SUMMON,       name: '§8🌑 Shadow Summon',       cost: ShadowAsceticSequence.SUMMON_SPIRIT_COST,  category: 'Shadow Ascetic' },
      { id: ShadowAsceticSequence.ABILITIES.SHADOW_CURSE,        name: '§8🩸 Shadow Curse',        cost: ShadowAsceticSequence.CURSE_SPIRIT_COST,   category: 'Shadow Ascetic' },
      { id: ShadowAsceticSequence.ABILITIES.SHADOW_MANIPULATION, name: '§8🌑 Shadow Manipulation', cost: ShadowAsceticSequence.MANIP_SPIRIT_COST,   category: 'Shadow Ascetic' },
      { id: ShadowAsceticSequence.ABILITIES.SHADOW_LURKING,      name: '§8👻 Shadow Lurking',      cost: ShadowAsceticSequence.LURK_SPIRIT_COST,    category: 'Shadow Ascetic' },
      { id: ShadowAsceticSequence.ABILITIES.SHADOW_SHAPING,      name: '§8⚔ Shadow Shaping',      cost: ShadowAsceticSequence.SHAPE_SPIRIT_COST,   category: 'Shadow Ascetic' },
      // Listener
      { id: ShadowAsceticSequence.ABILITIES.TOGGLE_LISTEN,       name: '§7🔇 Toggle Listen',       cost: 0,                                         category: 'Listener' },
      { id: ListenerSequence.ABILITIES.FOCUSED_LISTEN,           name: '§5👂 Focused Listen',      cost: ListenerSequence.FOCUSED_LISTEN_SPIRIT_COST, category: 'Listener' },
      { id: ListenerSequence.ABILITIES.SUPPRESS_VOICES,          name: '§b🌀 Suppress Voices',     cost: ListenerSequence.SUPPRESS_SPIRIT_COST,     category: 'Listener' },
      // Secrets Suppliant
      { id: SecretsSuppliantSequence.ABILITIES.DIVINATION,       name: '§5👁 Divination',          cost: SecretsSuppliantSequence.DIVINATION_SPIRIT_COST,              category: 'Secrets Suppliant' },
      { id: SecretsSuppliantSequence.ABILITIES.ENCHANTMENT_INSCRIPTION, name: '§d📖 Inscription', cost: SecretsSuppliantSequence.INSCRIPTION_SPIRIT_COST,             category: 'Secrets Suppliant' },
      { id: SecretsSuppliantSequence.ABILITIES.AURA_READING,     name: '§b✧ Aura Reading',         cost: SecretsSuppliantSequence.AURA_READ_SPIRIT_COST,               category: 'Secrets Suppliant' },
    ];
  }

  // =============================================
  // CLEAN UP
  // =============================================
  static removeEffects(player) {
    ShadowAsceticSequence.removeEffects(player);
    this.bombLastUsed.delete(player.name);
    this.curseCooldowns.delete(player.name);
    this.regenCooldowns.delete(player.name);
    this.activeCurses.delete(player.name);
    this.selectedAbilities.delete(player.name);
    try {
      player.removeEffect('slow_falling');
      player.removeEffect('regeneration');
      player.removeEffect('absorption');
    } catch (e) {}
  }
}
