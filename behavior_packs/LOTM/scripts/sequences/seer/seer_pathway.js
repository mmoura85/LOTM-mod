// ============================================
// SEER PATHWAY — SEQUENCES 9, 8, 7
// Seq 9: Seer       — Spirit Vision, Danger Intuition, Enhanced Memory
// Seq 8: Clown      — Acrobatics, Disguise, Feint Strike, inherited Seer
// Seq 7: Magician   — Spell repertoire, Flaming Jump, Damage Transfer, all prior
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

// ============================================
// SEQUENCE 9 — SEER
// ============================================
export class SeerSequence {
  static SEQUENCE_NUMBER = 9;
  static PATHWAY = 'seer';
  static EFFECT_DURATION = 999999;

  // Spirit Vision
  static SPIRIT_VISION_SPIRIT_COST = 6;
  static SPIRIT_VISION_DURATION    = 600; // 30 seconds
  static SPIRIT_VISION_COOLDOWN    = 60; // 3 seconds

  // Danger Intuition — passive scan interval
  static DANGER_SCAN_INTERVAL = 40; // every 2s

  // Tracking
  static spiritVisionActive   = new Map(); // player name -> ticks remaining
  static spiritVisionCooldown = new Map(); // player name -> ticks remaining
  static dangerIntuitionTick  = new Map(); // player name -> ticks since last scan

  static ABILITIES = {
    SPIRIT_VISION:    'spirit_vision',
    DANGER_INTUITION: 'danger_intuition',
  };

  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // ── Passive ─────────────────────────────────────────────────────────
  static applyPassiveAbilities(player) {
    // Seq 9 Seer — pure mental pathway, no physical bonus

    // Process Spirit Vision duration
    this.processSpiritVision(player);

    // Passive Danger Intuition scan
    this.processDangerIntuition(player);

    // Tick cooldowns
    if (this.spiritVisionCooldown.has(player.name)) {
      const cd = this.spiritVisionCooldown.get(player.name) - 1;
      if (cd <= 0) this.spiritVisionCooldown.delete(player.name);
      else         this.spiritVisionCooldown.set(player.name, cd);
    }
  }

  // ── Spirit Vision ────────────────────────────────────────────────────
  // Active: right-click Spirit Vision Orb item
  // Effect: night vision + glowing on all nearby entities (see spirits/auras)
  static useSpiritVision(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cNo access to Spirit Vision!'); return false;
    }
    if (this.spiritVisionCooldown.has(player.name)) {
      const cd = Math.ceil(this.spiritVisionCooldown.get(player.name) / 20);
      player.sendMessage(`§cSpirit Vision on cooldown: §e${cd}s`); return false;
    }
    if (this.spiritVisionActive.has(player.name)) {
      // Toggle off early
      this.spiritVisionActive.delete(player.name);
      player.removeEffect('night_vision');
      player.sendMessage('§7Spirit Vision fades...');
      return true;
    }
    if (!SpiritSystem.consumeSpirit(player, this.SPIRIT_VISION_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.SPIRIT_VISION_SPIRIT_COST}`); return false;
    }

    this.spiritVisionActive.set(player.name, this.SPIRIT_VISION_DURATION);
    this.spiritVisionCooldown.set(player.name, this.SPIRIT_VISION_COOLDOWN);

    player.sendMessage('§d§lSpirit Vision activated!');
    player.sendMessage('§7You peer through the veil of the physical world...');
    player.playSound('mob.elder_guardian.curse', { pitch: 1.5, volume: 0.6 });

    // Initial glowing sweep — tag all nearby entities
    this._applySpiritVisionGlow(player);
    return true;
  }

  static processSpiritVision(player) {
    const ticks = this.spiritVisionActive.get(player.name);
    if (!ticks) return;

    this.spiritVisionActive.set(player.name, ticks - 1);

    // Night vision to represent enhanced perception
    player.addEffect('night_vision', 40, { amplifier: 0, showParticles: false });

    // Re-apply glowing to nearby entities every 20 ticks
    if (ticks % 20 === 0) {
      this._applySpiritVisionGlow(player);
    }

    // Subtle particle shimmer around the player every 15 ticks
    if (ticks % 15 === 0) {
      try {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          player.dimension.spawnParticle('minecraft:villager_happy', {
            x: player.location.x + Math.cos(a) * 1.2,
            y: player.location.y + 1.5,
            z: player.location.z + Math.sin(a) * 1.2
          });
        }
      } catch (e) {}
    }

    if (ticks <= 1) {
      this.spiritVisionActive.delete(player.name);
      player.removeEffect('night_vision');
      player.sendMessage('§7Spirit Vision fades...');
    }
  }

  static _applySpiritVisionGlow(player) {
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: 20,
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow']
      });
      for (const entity of entities) {
        if (entity.id === player.id) continue;
        try {
          entity.addEffect('glowing', 30, { amplifier: 0, showParticles: false });
        } catch (e) {}
      }
    } catch (e) {}
  }

  // ── Danger Intuition ─────────────────────────────────────────────────
  // Passive: warns player when hostile mobs are nearby
  static processDangerIntuition(player) {
    const tick = (this.dangerIntuitionTick.get(player.name) || 0) + 1;
    this.dangerIntuitionTick.set(player.name, tick);
    if (tick % this.DANGER_SCAN_INTERVAL !== 0) return;

    try {
      const nearbyHostile = player.dimension.getEntities({
        location: player.location,
        maxDistance: 12,
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb',
                       'minecraft:arrow', 'minecraft:player', 'minecraft:armor_stand']
      });

      // Only warn for actually hostile mobs (not passive ones)
      const hostile = nearbyHostile.filter(e => {
        const id = e.typeId;
        return id.includes('zombie') || id.includes('skeleton') ||
               id.includes('creeper') || id.includes('witch') ||
               id.includes('spider') || id.includes('phantom') ||
               id.includes('drowned') || id.includes('pillager') ||
               id.includes('vindicator') || id.includes('evoker') ||
               id.includes('warden') || id.includes('blaze') ||
               id.includes('ghast') || id.includes('enderman');
      });

      if (hostile.length > 0) {
        // Show a brief red warning flash (angry particle near player's eyes)
        try {
          for (let i = 0; i < 3; i++) {
            player.dimension.spawnParticle('minecraft:villager_angry', {
              x: player.location.x + (Math.random()-0.5)*0.5,
              y: player.location.y + 1.8,
              z: player.location.z + (Math.random()-0.5)*0.5
            });
          }
        } catch (e) {}

        // Warn once per full second if multiple enemies
        if (hostile.length >= 3) {
          player.sendMessage(`§c⚠ Danger Intuition: ${hostile.length} threats detected nearby!`);
        }
      }
    } catch (e) {}
  }

  static handleAbilityUse(player, abilityId) {
    if (abilityId === this.ABILITIES.SPIRIT_VISION) return this.useSpiritVision(player);
    return false;
  }

  static getAbilityDescription(abilityId) {
    const descs = {
      [this.ABILITIES.SPIRIT_VISION]:    `§7Cost: ${this.SPIRIT_VISION_SPIRIT_COST} Spirit\n§7See spirits, auras & entities through walls\n§7Duration: 30s`,
      [this.ABILITIES.DANGER_INTUITION]: '§7Passive: warns when hostile mobs approach within 12 blocks',
    };
    return descs[abilityId] || 'Unknown ability';
  }

  static getAllAbilities() {
    return [
      { id: this.ABILITIES.SPIRIT_VISION,    name: '§d👁 Spirit Vision',    cost: this.SPIRIT_VISION_SPIRIT_COST },
      { id: this.ABILITIES.DANGER_INTUITION, name: '§e⚡ Danger Intuition', cost: 0 },
    ];
  }
}

// ============================================
// SEQUENCE 8 — CLOWN
// ============================================
export class ClownSequence {
  static SEQUENCE_NUMBER = 8;
  static PATHWAY = 'seer';
  static EFFECT_DURATION = 999999;

  // Acrobatics passive
  static ACRO_SPEED      = 0; // Speed I
  static ACRO_JUMP       = 0; // Jump Boost I

  // Feint Strike — active, confuses target briefly
  static FEINT_SPIRIT_COST = 10;
  static FEINT_COOLDOWN    = 80; // 4s
  static FEINT_RANGE       = 8;

  // Disguise — active, turns player invisible briefly
  static DISGUISE_SPIRIT_COST = 18;
  static DISGUISE_DURATION    = 200; // 10s
  static DISGUISE_COOLDOWN    = 300; // 15s

  // Paper Daggers — throw hardened paper as steel daggers
  static PAPER_DAGGERS_SPIRIT_COST = 6;
  static PAPER_DAGGERS_COOLDOWN    = 20; // 1s — semi-spammable
  static PAPER_DAGGERS_COUNT       = 3;   // daggers per throw
  static PAPER_DAGGERS_DAMAGE      = 10; // each dagger (x3 = 30 total burst)
  static PAPER_DAGGERS_RANGE       = 16;

  static feintCooldowns       = new Map();
  static disguiseCooldowns    = new Map();
  static disguiseActive       = new Map(); // player name -> ticks remaining
  static paperDaggersCooldown = new Map();

  static ABILITIES = {
    ...SeerSequence.ABILITIES, // inherit Seer abilities
    FEINT_STRIKE:  'feint_strike',
    DISGUISE:      'disguise',
    PAPER_DAGGERS: 'paper_daggers',
  };

  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  static applyPassiveAbilities(player) {
    // Acrobatic body — nimble but not superhuman
    // Speed I only (not Speed II), slight jump, no haste
    player.addEffect('speed',      60, { amplifier: 0, showParticles: false }); // Speed I
    player.addEffect('jump_boost', 60, { amplifier: 0, showParticles: false }); // Jump Boost I

    // Inherited Seer passives
    SeerSequence.processDangerIntuition(player);
    SeerSequence.processSpiritVision(player);

    // Process disguise
    this.processDisguise(player);

    // Tick cooldowns
    for (const map of [this.feintCooldowns, this.disguiseCooldowns]) {
      if (map.has(player.name)) {
        const cd = map.get(player.name) - 1;
        if (cd <= 0) map.delete(player.name);
        else         map.set(player.name, cd);
      }
    }
  }

  // ── Feint Strike ─────────────────────────────────────────────────────
  // Confuses the nearest enemy — applies nausea + blindness briefly
  // and forces them to turn away (teleports slightly)
  static useFeintStrike(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }
    const cd = this.feintCooldowns.get(player.name) || 0;
    if (cd > 0) { player.sendMessage(`§cFeint Strike on cooldown: §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.FEINT_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.FEINT_SPIRIT_COST}`); return false;
    }

    // Find nearest entity
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.FEINT_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:player', 'minecraft:armor_stand']
      });
      if (entities.length === 0) {
        player.sendMessage('§cNo target in range!');
        SpiritSystem.restoreSpirit(player, this.FEINT_SPIRIT_COST);
        return false;
      }

      // Pick closest
      let target = entities[0];
      let minDist = Infinity;
      for (const e of entities) {
        const dx = e.location.x - player.location.x;
        const dz = e.location.z - player.location.z;
        const d  = Math.sqrt(dx*dx + dz*dz);
        if (d < minDist) { minDist = d; target = e; }
      }

      // Apply confusion
      try { target.addEffect('nausea',    40, { amplifier: 1, showParticles: true  }); } catch (e) {}
      try { target.addEffect('blindness', 30, { amplifier: 0, showParticles: false }); } catch (e) {}
      try { target.addEffect('weakness',  40, { amplifier: 1, showParticles: false }); } catch (e) {}

      // Visual — burst of jester colours at target
      for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2;
        try {
          player.dimension.spawnParticle('minecraft:villager_happy', {
            x: target.location.x + Math.cos(a)*0.5,
            y: target.location.y + 1.2,
            z: target.location.z + Math.sin(a)*0.5
          });
          player.dimension.spawnParticle('minecraft:villager_angry', {
            x: target.location.x + Math.cos(a+0.4)*0.5,
            y: target.location.y + 1.5,
            z: target.location.z + Math.sin(a+0.4)*0.5
          });
        } catch (e) {}
      }

      player.playSound('mob.witch.laugh', { pitch: 1.3, volume: 0.8 });
      player.sendMessage('§e§lFeint Strike! §7Your deception confuses them!');
      this.feintCooldowns.set(player.name, this.FEINT_COOLDOWN);
      return true;
    } catch (e) {
      player.sendMessage('§cFeint Strike failed!'); return false;
    }
  }

  // ── Disguise ─────────────────────────────────────────────────────────
  // Turns player invisible for 10s — mobs won't retarget unless attacked
  static useDisguise(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }
    const cd = this.disguiseCooldowns.get(player.name) || 0;
    if (cd > 0) { player.sendMessage(`§cDisguise on cooldown: §e${Math.ceil(cd/20)}s`); return false; }
    if (this.disguiseActive.has(player.name)) {
      player.sendMessage('§cAlready in disguise!'); return false;
    }
    if (!SpiritSystem.consumeSpirit(player, this.DISGUISE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.DISGUISE_SPIRIT_COST}`); return false;
    }

    this.disguiseActive.set(player.name, this.DISGUISE_DURATION);
    this.disguiseCooldowns.set(player.name, this.DISGUISE_COOLDOWN);

    player.sendMessage('§8§l✦ DISGUISE! §7You blend into the surroundings...');
    player.playSound('mob.endermen.portal', { pitch: 1.6, volume: 0.6 });

    // Smoke poof on activation
    for (let i = 0; i < 12; i++) {
      const a = (i/12)*Math.PI*2;
      try {
        player.dimension.spawnParticle('minecraft:large_explosion', {
          x: player.location.x + Math.cos(a)*0.8,
          y: player.location.y + 0.5,
          z: player.location.z + Math.sin(a)*0.8
        });
      } catch (e) {}
    }
    return true;
  }

  static processDisguise(player) {
    const ticks = this.disguiseActive.get(player.name);
    if (!ticks) return;

    this.disguiseActive.set(player.name, ticks - 1);

    // Keep player invisible
    player.addEffect('invisibility', 25, { amplifier: 0, showParticles: false });

    if (ticks <= 1) {
      this.disguiseActive.delete(player.name);
      player.removeEffect('invisibility');
      player.sendMessage('§7Your disguise fades...');
      player.playSound('mob.endermen.portal', { pitch: 0.8, volume: 0.4 });
    }
  }

  // ── Paper Daggers ────────────────────────────────────────────────────
  // Throw 3 steel-hard paper daggers in a spread. Each sticks to stone
  // and pierces enemies. Requires paper in inventory (consumed on use).

  // ── Shared hitscan raycast — matches revolverSystem.js hit detection ──────
  // Two-pass: first pre-scans all entities in range by dot-product alignment,
  // then falls back to block scanning. This matches the revolver exactly.
  static performRaycast(player, range, overrideView = null) {
    try {
      const view = overrideView || player.getViewDirection();
      const eye  = player.getHeadLocation();

      let closestEntity   = null;
      let closestDistance = range + 1;
      let closestLocation = null;

      // PASS 1 — pre-scan all entities within range, pick best alignment
      try {
        const candidates = player.dimension.getEntities({
          location: eye,
          maxDistance: range,
          excludeTypes: ['minecraft:item','minecraft:xp_orb','minecraft:arrow',
                         'minecraft:painting','minecraft:armor_stand'],
          excludeNames: [player.name]
        });

        for (const entity of candidates) {
          const eLoc = entity.location;
          const toE  = {
            x: eLoc.x - eye.x,
            y: eLoc.y - eye.y + 1, // aim at body centre
            z: eLoc.z - eye.z
          };
          const dist = Math.sqrt(toE.x*toE.x + toE.y*toE.y + toE.z*toE.z);
          if (dist === 0 || dist > range) continue;
          const dot = (view.x*(toE.x/dist) + view.y*(toE.y/dist) + view.z*(toE.z/dist));
          // dot > 0.95 ≈ within ~18° of crosshair — same as revolver
          if (dot > 0.95 && dist < closestDistance) {
            closestEntity   = entity;
            closestDistance = dist;
            closestLocation = { x: eLoc.x, y: eLoc.y + 1, z: eLoc.z };
          }
        }
      } catch (e) {}

      if (closestEntity) {
        return { hit: true, entity: closestEntity,
                 location: closestLocation, distance: closestDistance };
      }

      // PASS 2 — step through ray for block hits (0.5-block steps)
      for (let i = 1; i <= range; i += 0.5) {
        const loc = { x: eye.x + view.x*i, y: eye.y + view.y*i, z: eye.z + view.z*i };
        try {
          const block = player.dimension.getBlock({
            x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z)
          });
          if (block && !block.isAir && !block.isLiquid) {
            return { hit: true, entity: null, location: loc, distance: i };
          }
        } catch (e) {}
      }

      return {
        hit: false, entity: null,
        location: {
          x: eye.x + view.x * range,
          y: eye.y + view.y * range,
          z: eye.z + view.z * range
        },
        distance: range
      };
    } catch (e) {
      return { hit: false, entity: null, location: player.location, distance: 0 };
    }
  }

  // ── Animated projectile: visible knife flying through the air ─────────────
  // Uses a staggered particle trail timed to arrive at the target location,
  // giving the illusion of a thrown knife. Actual damage is applied immediately
  // (hitscan), visual is cosmetic only.
  static animateKnifeTrail(player, startLoc, endLoc, onImpact) {
    const dx = endLoc.x - startLoc.x;
    const dy = endLoc.y - startLoc.y;
    const dz = endLoc.z - startLoc.z;
    const totalDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (totalDist === 0) { if (onImpact) onImpact(); return; }

    // ~20 blocks/sec so a 10-block throw takes ~10 ticks
    const travelTicks = Math.max(3, Math.ceil((totalDist / 20) * 20));
    const particleCount = Math.ceil(travelTicks / 2);

    for (let i = 0; i < particleCount; i++) {
      const frac = i / particleCount;
      const px = startLoc.x + dx * frac;
      const py = startLoc.y + dy * frac;
      const pz = startLoc.z + dz * frac;
      const delay = Math.max(1, i * 2);
      system.runTimeout(() => {
        try {
          player.dimension.spawnParticle('minecraft:basic_crit_particle',
            { x: px, y: py, z: pz });
        } catch (e) {}
      }, delay);
    }

    if (onImpact) {
      system.runTimeout(onImpact, travelTicks + 1);
    }
  }

  // Called from main.js itemUse when player right-clicks a lotm:paper_knife
  // Uses the same two-pass dot-product raycast as the revolver for reliable hits.
  // Visible knife animation flies to target; damage is applied on "arrival".
  static usePaperDaggers(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cOnly Clowns can harden paper!'); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.PAPER_DAGGERS_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.PAPER_DAGGERS_SPIRIT_COST}`); return false;
    }

    const view = player.getViewDirection();
    const eye  = player.getHeadLocation();

    player.playSound('random.break', { pitch: 2.0, volume: 0.8 });
    this.paperDaggersCooldown.set(player.name, this.PAPER_DAGGERS_COOLDOWN);

    // Throw PAPER_DAGGERS_COUNT knives in a slight horizontal spread
    for (let d = 0; d < this.PAPER_DAGGERS_COUNT; d++) {
      const spreadAngle = (d - 1) * 0.12;
      const spreadView = {
        x: view.x * Math.cos(spreadAngle) - view.z * Math.sin(spreadAngle),
        y: view.y,
        z: view.x * Math.sin(spreadAngle) + view.z * Math.cos(spreadAngle)
      };

      const result = this.performRaycast(player, this.PAPER_DAGGERS_RANGE, spreadView);
      const impactLoc = result.location;

      // ── Damage applied immediately on this tick — entity refs go stale ──
      if (result.entity) {
        try { result.entity.applyDamage(this.PAPER_DAGGERS_DAMAGE); } catch(e) {}
        try { result.entity.addEffect('slowness', 40, { amplifier: 1, showParticles: false }); } catch(e) {}
        try { player.dimension.playSound('random.hurt', { location: impactLoc, pitch: 1.5, volume: 0.6 }); } catch(e) {}
      }

      // ── Visual animation is cosmetic only — plays after damage ────────
      const launchDelay = d * 4;
      const px = impactLoc.x, py = impactLoc.y, pz = impactLoc.z;
      system.runTimeout(() => {
        this.animateKnifeTrail(player, eye, { x: px, y: py, z: pz }, () => {
          try {
            player.dimension.spawnParticle('minecraft:basic_crit_particle', { x: px, y: py, z: pz });
            player.dimension.spawnParticle('minecraft:basic_crit_particle', { x: px, y: py + 0.3, z: pz });
          } catch(e) {}
        });
      }, launchDelay);
    }

    return true;
  }

  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
      case this.ABILITIES.SPIRIT_VISION: return SeerSequence.useSpiritVision(player);
      case this.ABILITIES.FEINT_STRIKE:  return this.useFeintStrike(player);
      case this.ABILITIES.DISGUISE:      return this.useDisguise(player);
      case this.ABILITIES.PAPER_DAGGERS: return this.usePaperDaggers(player);
      default: return false;
    }
  }

  static getAbilityDescription(abilityId) {
    const descs = {
      [this.ABILITIES.FEINT_STRIKE]:  `§7Cost: ${this.FEINT_SPIRIT_COST} Spirit\n§7Confuse nearest enemy (nausea + blind)\n§78 block range, 10s cooldown`,
      [this.ABILITIES.DISGUISE]:      `§7Cost: ${this.DISGUISE_SPIRIT_COST} Spirit\n§7Turn invisible for 10s\n§7Mobs lose track of you`,
      [this.ABILITIES.PAPER_DAGGERS]: `§7Cost: ${this.PAPER_DAGGERS_SPIRIT_COST} Spirit + 1 Paper\n§7Throw 3 steel-hard daggers in a spread\n§716 block range, ${this.PAPER_DAGGERS_DAMAGE} dmg each, slows target`,
    };
    return descs[abilityId] || SeerSequence.getAbilityDescription(abilityId);
  }

  static getAllAbilities() {
    return [
      ...SeerSequence.getAllAbilities(),
      { id: this.ABILITIES.FEINT_STRIKE,  name: '§e🃏 Feint Strike',   cost: this.FEINT_SPIRIT_COST },
      { id: this.ABILITIES.DISGUISE,      name: '§8✦ Disguise',        cost: this.DISGUISE_SPIRIT_COST },
      { id: this.ABILITIES.PAPER_DAGGERS, name: '§f📄 Paper Daggers',   cost: this.PAPER_DAGGERS_SPIRIT_COST },
    ];
  }
}

// ============================================
// SEQUENCE 7 — MAGICIAN
// ============================================
export class MagicianSequence {
  static SEQUENCE_NUMBER = 7;
  static PATHWAY = 'seer';
  static EFFECT_DURATION = 999999;

  // Magicians have 9 high-speed spells — we implement key ones
  // Flaming Jump
  static FLAMING_JUMP_SPIRIT_COST = 15;
  static FLAMING_JUMP_COOLDOWN    = 60; // 3s
  static FLAMING_JUMP_RANGE       = 20;

  // Damage Transfer — redirect damage to limb (reduces lethal damage once)
  static TRANSFER_SPIRIT_COST      = 25;
  static TRANSFER_COOLDOWN         = 600; // 30s
  static TRANSFER_DAMAGE_REDUCTION = 0.6;  // 60% of incoming damage negated

  // Spell Volley — rapid multi-target magic bolts
  static SPELL_SPIRIT_COST = 20;
  static SPELL_COOLDOWN    = 120; // 6s
  static SPELL_DAMAGE      = 10;
  static SPELL_TARGETS     = 3;
  static SPELL_RANGE       = 20;

  // Air Bullet — hitscan compressed-air projectile, revolver-comparable damage
  static AIR_BULLET_SPIRIT_COST = 4;
  static AIR_BULLET_COOLDOWN    = 8;  // 0.4s — semi-spammable, slower than revolver
  static AIR_BULLET_DAMAGE      = 14; // slightly more than standard bullet — spirit-powered
  static AIR_BULLET_RANGE       = 48;

  // Paper Figurine Substitute — swap places with a decoy, block one fatal hit
  static FIGURINE_SPIRIT_COST  = 30;
  static FIGURINE_COOLDOWN     = 800; // 40s
  static FIGURINE_SWAP_RANGE   = 10;   // how far the re-appearance offset can be

  // Underwater Breathing — invisible air pipe
  static WATER_BREATH_SPIRIT_COST = 3;  // per 2s tick while active
  static WATER_BREATH_DURATION    = 400; // 20s per activation

  // Drawing Paper as Weapons — paper becomes bat/brick/cane etc. (melee + aoe)
  static PAPER_WEAPON_SPIRIT_COST = 8;
  static PAPER_WEAPON_COOLDOWN    = 40; // 2s — replaces revolver in melee
  static PAPER_WEAPON_DAMAGE      = 14;
  static PAPER_WEAPON_RANGE       = 5;

  static flamingJumpCooldowns = new Map();
  static transferCooldowns    = new Map();
  static transferReady        = new Map(); // player name -> bool (primed for next hit)
  static spellCooldowns       = new Map();
  static airBulletCooldowns   = new Map();
  static figurineCooldowns    = new Map();
  static figurineReady        = new Map(); // player name -> bool (decoy primed)
  static waterBreathActive    = new Map(); // player name -> ticks remaining
  static paperWeaponCooldowns = new Map();

  static ABILITIES = {
    ...ClownSequence.ABILITIES,
    FLAMING_JUMP:         'flaming_jump',
    DAMAGE_TRANSFER:      'damage_transfer',
    SPELL_VOLLEY:         'spell_volley',
    AIR_BULLET:           'air_bullet',
    PAPER_FIGURINE:       'paper_figurine',
    WATER_BREATHING:      'water_breathing',
    DRAWING_PAPER_WEAPON: 'drawing_paper_weapon',
  };

  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  static applyPassiveAbilities(player) {
    // Enhanced physique — still a caster, modest physical improvement
    player.addEffect('speed',      60, { amplifier: 1, showParticles: false }); // Speed II
    // +4 hearts health boost (Seq 7 caster — well below physical pathways)
    player.addEffect('health_boost', 999999, { amplifier: 3, showParticles: false }); // amp 3 = +4 hearts

    // Inherited passives
    SeerSequence.processDangerIntuition(player);
    SeerSequence.processSpiritVision(player);
    ClownSequence.processDisguise(player);

    // Tick cooldowns
    for (const map of [this.flamingJumpCooldowns, this.transferCooldowns, this.spellCooldowns,
                       this.airBulletCooldowns, this.figurineCooldowns, this.paperWeaponCooldowns]) {
      if (map.has(player.name)) {
        const cd = map.get(player.name) - 1;
        if (cd <= 0) map.delete(player.name);
        else         map.set(player.name, cd);
      }
    }
    for (const map of [ClownSequence.feintCooldowns, ClownSequence.disguiseCooldowns,
                       ClownSequence.paperDaggersCooldown]) {
      if (map.has(player.name)) {
        const cd = map.get(player.name) - 1;
        if (cd <= 0) map.delete(player.name);
        else         map.set(player.name, cd);
      }
    }

    // Process water breathing if active
    this.processWaterBreathing(player);
  }

  // ── Flaming Jump ──────────────────────────────────────────────────────
  // Teleport through fire/flame within range. No fire = standard leap forward.
  static useFlamingJump(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }
    const cd = this.flamingJumpCooldowns.get(player.name) || 0;
    if (cd > 0) { player.sendMessage(`§cFlaming Jump on cooldown: §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.FLAMING_JUMP_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.FLAMING_JUMP_SPIRIT_COST}`); return false;
    }

    const view = player.getViewDirection();
    const loc  = player.location;

    // Find a fire block within range to jump through
    let targetLoc = null;
    for (let i = 2; i <= this.FLAMING_JUMP_RANGE; i++) {
      const check = {
        x: Math.floor(loc.x + view.x * i),
        y: Math.floor(loc.y + view.y * i),
        z: Math.floor(loc.z + view.z * i)
      };
      try {
        const block = player.dimension.getBlock(check);
        if (block && (block.typeId === 'minecraft:fire' || block.typeId === 'minecraft:soul_fire' ||
                      block.typeId === 'minecraft:lava')) {
          targetLoc = { x: check.x + 0.5, y: check.y + 1, z: check.z + 0.5 };
          break;
        }
      } catch (e) {}
    }

    if (!targetLoc) {
      // No fire found — do a powerful leap in view direction instead
      targetLoc = {
        x: loc.x + view.x * 8,
        y: loc.y + 2,
        z: loc.z + view.z * 8
      };
    }

    // Fire trail on departure
    for (let i = 0; i < 8; i++) {
      const t = i; const pl = loc;
      system.runTimeout(() => {
        try {
          player.dimension.spawnParticle('minecraft:large_explosion', {
            x: pl.x + (Math.random()-0.5)*0.5,
            y: pl.y + 0.5 + Math.random(),
            z: pl.z + (Math.random()-0.5)*0.5
          });
        } catch (e) {}
      }, t);
    }

    // Teleport — immune to fire on arrival
    try { player.teleport(targetLoc); } catch (e) {}
    player.addEffect('fire_resistance', 100, { amplifier: 0, showParticles: false });

    // Arrival fire burst
    for (let i = 0; i < 10; i++) {
      const a = (i/10)*Math.PI*2;
      try {
        player.dimension.spawnParticle('minecraft:large_explosion', {
          x: targetLoc.x + Math.cos(a)*0.8,
          y: targetLoc.y + 0.3,
          z: targetLoc.z + Math.sin(a)*0.8
        });
      } catch (e) {}
    }

    player.playSound('mob.blaze.shoot', { pitch: 1.4, volume: 0.8 });
    player.sendMessage('§6§l✦ FLAMING JUMP!');
    this.flamingJumpCooldowns.set(player.name, this.FLAMING_JUMP_COOLDOWN);
    return true;
  }

  // ── Damage Transfer ───────────────────────────────────────────────────
  // Prime: the next lethal/heavy hit is reduced by 60%
  static useDamageTransfer(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }
    const cd = this.transferCooldowns.get(player.name) || 0;
    if (cd > 0) { player.sendMessage(`§cDamage Transfer on cooldown: §e${Math.ceil(cd/20)}s`); return false; }
    if (this.transferReady.get(player.name)) { player.sendMessage('§cDamage Transfer already primed!'); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.TRANSFER_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.TRANSFER_SPIRIT_COST}`); return false;
    }

    this.transferReady.set(player.name, true);
    this.transferCooldowns.set(player.name, this.TRANSFER_COOLDOWN);

    // Glowing red hand effect
    for (let i = 0; i < 12; i++) {
      const a = (i/12)*Math.PI*2;
      try {
        player.dimension.spawnParticle('minecraft:villager_angry', {
          x: player.location.x + Math.cos(a)*0.6,
          y: player.location.y + 1,
          z: player.location.z + Math.sin(a)*0.6
        });
      } catch (e) {}
    }
    player.addEffect('absorption', 600, { amplifier: 1, showParticles: true });
    player.playSound('random.levelup', { pitch: 0.8, volume: 0.8 });
    player.sendMessage('§c§l⚡ DAMAGE TRANSFER primed! §7Next heavy hit redirected to limb.');
    return true;
  }

  // Call this from the entityHurt event in main.js
  static handleIncomingDamage(player, damage) {
    if (!this.transferReady.get(player.name)) return damage;
    this.transferReady.delete(player.name);

    const reduced = Math.floor(damage * (1 - this.TRANSFER_DAMAGE_REDUCTION));
    player.sendMessage(`§c⚡ Damage Transfer! §7${damage} → ${reduced} (redirected to limb!)`);
    player.playSound('random.hurt', { pitch: 0.6, volume: 1.0 });

    // Visual — red sparks
    try {
      for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2;
        player.dimension.spawnParticle('minecraft:villager_angry', {
          x: player.location.x + Math.cos(a)*0.7,
          y: player.location.y + 1,
          z: player.location.z + Math.sin(a)*0.7
        });
      }
    } catch (e) {}
    return reduced;
  }

  // ── Spell Volley ──────────────────────────────────────────────────────
  // Fires 3 rapid magic bolts at the 3 nearest enemies (hitscan, staggered)
  static useSpellVolley(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }
    const cd = this.spellCooldowns.get(player.name) || 0;
    if (cd > 0) { player.sendMessage(`§cSpell Volley on cooldown: §e${Math.ceil(cd/20)}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.SPELL_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.SPELL_SPIRIT_COST}`); return false;
    }

    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.SPELL_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:player',
                       'minecraft:armor_stand', 'minecraft:arrow']
      });
      if (entities.length === 0) {
        player.sendMessage('§cNo targets in range!');
        SpiritSystem.restoreSpirit(player, this.SPELL_SPIRIT_COST);
        return false;
      }

      // Sort by distance, take up to SPELL_TARGETS
      const sorted = entities.sort((a, b) => {
        const da = Math.hypot(a.location.x-player.location.x, a.location.z-player.location.z);
        const db = Math.hypot(b.location.x-player.location.x, b.location.z-player.location.z);
        return da - db;
      }).slice(0, this.SPELL_TARGETS);

      player.sendMessage(`§d§l✦ SPELL VOLLEY! §7${sorted.length} bolt(s) fired!`);
      player.playSound('mob.elder_guardian.curse', { pitch: 2.0, volume: 1.0 });
      this.spellCooldowns.set(player.name, this.SPELL_COOLDOWN);

      // Fire each bolt with a small stagger
      sorted.forEach((target, i) => {
        system.runTimeout(() => {
          try {
            // Magic bolt trail
            const tLoc  = target.location;
            const pLoc  = player.location;
            const steps = 8;
            for (let s = 0; s < steps; s++) {
              const t = s; const frac = s/steps;
              system.runTimeout(() => {
                try {
                  player.dimension.spawnParticle('minecraft:villager_happy', {
                    x: pLoc.x + (tLoc.x-pLoc.x)*frac,
                    y: pLoc.y + 1 + (tLoc.y-pLoc.y)*frac,
                    z: pLoc.z + (tLoc.z-pLoc.z)*frac
                  });
                } catch (e) {}
              }, t);
            }
            // Impact + damage
            system.runTimeout(() => {
              try {
                target.applyDamage(this.SPELL_DAMAGE);
                player.dimension.spawnParticle('minecraft:large_explosion', {
                  x: tLoc.x, y: tLoc.y+1, z: tLoc.z
                });
                player.dimension.playSound('mob.elder_guardian.curse', {
                  location: tLoc, pitch: 1.8, volume: 0.5
                });
              } catch (e) {}
            }, steps);
          } catch (e) {}
        }, i * 6); // stagger bolts by 6 ticks each
      });

      return true;
    } catch (e) {
      player.sendMessage('§cSpell Volley failed!'); return false;
    }
  }

  // ── Air Bullet ────────────────────────────────────────────────────────
  // Snap fingers / mimic gun — fires a compressed air bolt at revolver speed
  static useAirBullet(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }
    const cd = this.airBulletCooldowns.get(player.name) || 0;
    if (cd > 0) return false;
    if (!SpiritSystem.consumeSpirit(player, this.AIR_BULLET_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.AIR_BULLET_SPIRIT_COST}`); return false;
    }

    const eye = player.getHeadLocation();

    // Finger-snap sound
    player.playSound('random.click', { pitch: 1.8, volume: 0.9 });
    this.airBulletCooldowns.set(player.name, this.AIR_BULLET_COOLDOWN);

    // Two-pass raycast — same as revolver, reliable hit detection
    const result = ClownSequence.performRaycast(player, this.AIR_BULLET_RANGE);

    // Faint smoke trail — sparse puffs along bullet path, each on its own tick
    const view = player.getViewDirection();
    const dist = result.distance;
    const trailSteps = Math.min(6, Math.ceil(dist / 6));
    for (let i = 1; i <= trailSteps; i++) {
      const frac = i / trailSteps;
      const px = eye.x + view.x * frac * dist;
      const py = eye.y + view.y * frac * dist;
      const pz = eye.z + view.z * frac * dist;
      system.runTimeout(() => {
        try {
          player.dimension.spawnParticle('minecraft:basic_smoke_particle',
            { x: px, y: py, z: pz });
        } catch (e) {}
      }, i); // delay 1,2,3... always >= 1
    }

    // Apply damage + knockback immediately — don't defer, entity refs go stale
    if (result.hit && result.entity) {
      try { result.entity.applyDamage(this.AIR_BULLET_DAMAGE); } catch(e) {}
      try {
        const dx = result.location.x - eye.x;
        const dz = result.location.z - eye.z;
        const len = Math.sqrt(dx*dx + dz*dz) || 1;
        result.entity.applyKnockback(dx/len, dz/len, 0.8, 0.2);
      } catch(e) {}
    }

    // Impact effects at hit location
    try {
      player.dimension.spawnParticle('minecraft:large_explosion',
        { x: result.location.x, y: result.location.y + 1, z: result.location.z });
      player.dimension.playSound('random.explode',
        { location: result.location, pitch: 2.2, volume: 0.5 });
    } catch (e) {}

    return true;
  }

  // ── Paper Figurine — passive item check ─────────────────────────────────
  // If the player has a lotm:paper_figurine_item in their inventory AND has
  // enough spirit, the figurine is considered "primed" automatically.
  // No action needed — just carry it. It triggers on near-fatal damage.
  // The item is consumed when it triggers.
  static checkFigurinePrimed(player) {
    if (!this.hasSequence(player)) return false;
    if (this.figurineCooldowns.get(player.name) || 0) return false;
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return false;
      for (let i = 0; i < inv.container.size; i++) {
        const item = inv.container.getItem(i);
        if (item && item.typeId === 'lotm:paper_figurine_item' && item.amount > 0) {
          return SpiritSystem.getSpirit(player) >= this.FIGURINE_SPIRIT_COST;
        }
      }
    } catch (e) {}
    return false;
  }

  // Consume the figurine item from inventory
  static consumeFigurineItem(player) {
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return;
      for (let i = 0; i < inv.container.size; i++) {
        const item = inv.container.getItem(i);
        if (item && item.typeId === 'lotm:paper_figurine_item' && item.amount > 0) {
          if (item.amount === 1) inv.container.setItem(i, undefined);
          else { item.amount--; inv.container.setItem(i, item); }
          return;
        }
      }
    } catch (e) {}
  }

  // Called from entityHurt event in main.js
  // Triggers if: player has figurine item + enough spirit + damage is serious
  static handleFigurineTrigger(player, damage) {
    if (!this.checkFigurinePrimed(player)) return false;
    const health = player.getComponent('minecraft:health');
    if (!health) return false;
    // Trigger threshold: damage would drop player below 30% HP, OR is outright lethal
    const wouldDrop = (health.currentValue - damage) / health.effectiveMax;
    if (wouldDrop > 0.30) return false; // not serious enough

    SpiritSystem.consumeSpirit(player, this.FIGURINE_SPIRIT_COST);
    this.figurineCooldowns.set(player.name, this.FIGURINE_COOLDOWN);
    this.consumeFigurineItem(player);

    // Swap — teleport to a random nearby safe spot
    const loc = player.location;
    const angle = Math.random() * Math.PI * 2;
    const dist  = 3 + Math.random() * 4; // 3-7 blocks away
    const newLoc = {
      x: loc.x + Math.cos(angle) * dist,
      y: loc.y,
      z: loc.z + Math.sin(angle) * dist
    };

    // Paper explosion at original position
    try {
      for (let i = 0; i < 16; i++) {
        const a = (i/16)*Math.PI*2;
        player.dimension.spawnParticle('minecraft:critical_hit_emitter', {
          x: loc.x + Math.cos(a)*0.8,
          y: loc.y + 1,
          z: loc.z + Math.sin(a)*0.8
        });
      }
      player.dimension.playSound('random.break', { location: loc, pitch: 0.8, volume: 1.0 });
    } catch (e) {}

    try { player.teleport(newLoc); } catch (e) {}

    // Heal back most of the damage (decoy absorbed it)
    try {
      const healAmount = damage * 0.8;
      health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + healAmount));
    } catch (e) {}

    player.removeEffect('absorption');
    player.sendMessage('§f§l✦ PAPER FIGURINE! §7Your decoy took the blow — you reappear safely!');
    player.playSound('mob.endermen.portal', { pitch: 0.7, volume: 1.0 });
    return true;
  }

  // ── Underwater Breathing ──────────────────────────────────────────────
  // Activates an invisible air pipe — grants water breathing while active
  static useWaterBreathing(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }
    if (this.waterBreathActive.has(player.name)) {
      // Toggle off
      this.waterBreathActive.delete(player.name);
      player.removeEffect('water_breathing');
      player.sendMessage('§7Air pipe dissipates...');
      return true;
    }
    if (!SpiritSystem.consumeSpirit(player, this.WATER_BREATH_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.WATER_BREATH_SPIRIT_COST}`); return false;
    }

    this.waterBreathActive.set(player.name, this.WATER_BREATH_DURATION);
    player.sendMessage('§b✦ Air Pipe conjured! §7You breathe freely underwater.');
    player.playSound('mob.guardian.attack', { pitch: 1.8, volume: 0.6 });
    return true;
  }

  static processWaterBreathing(player) {
    const ticks = this.waterBreathActive.get(player.name);
    if (!ticks) return;

    // Drain spirit while active
    if (ticks % 40 === 0) { // every 2s
      if (!SpiritSystem.consumeSpirit(player, this.WATER_BREATH_SPIRIT_COST)) {
        // Out of spirit — pipe collapses
        this.waterBreathActive.delete(player.name);
        player.removeEffect('water_breathing');
        player.sendMessage('§cAir pipe collapses — not enough spirit!');
        return;
      }
    }

    this.waterBreathActive.set(player.name, ticks - 1);
    player.addEffect('water_breathing', 60, { amplifier: 0, showParticles: false });
    player.addEffect('dolphins_grace',  60, { amplifier: 0, showParticles: false }); // swim speed

    if (ticks <= 1) {
      this.waterBreathActive.delete(player.name);
      player.removeEffect('water_breathing');
      player.sendMessage('§7Air pipe dissipates...');
    }
  }

  // ── Drawing Paper as Weapons ──────────────────────────────────────────
  // Consume paper → transform into a melee weapon form (bat/brick/cane)
  // Deals high damage + knockback in a short AoE around the player
  // Called from main.js when player right-clicks lotm:paper_weapon_item
  // Item is durability-1 so Bedrock auto-consumes it on use
  static useDrawingPaperWeapon(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cOnly Magicians can draw paper weapons!'); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.PAPER_WEAPON_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.PAPER_WEAPON_SPIRIT_COST}`); return false;
    }

    // Pick a random weapon form for flavour
    const forms = ['bat', 'brick', 'cane', 'blade'];
    const form  = forms[Math.floor(Math.random() * forms.length)];
    player.sendMessage(`§f§l📄 Paper ${form.toUpperCase()}! §7Paper hardens to steel!`);
    player.playSound('random.break', { pitch: 0.6, volume: 1.0 });
    this.paperWeaponCooldowns.set(player.name, this.PAPER_WEAPON_COOLDOWN);

    // AoE strike — hit all enemies in melee range
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.PAPER_WEAPON_RANGE,
        excludeTypes: ['minecraft:item','minecraft:xp_orb','minecraft:player',
                       'minecraft:armor_stand','minecraft:arrow']
      });

      let hitCount = 0;
      for (const entity of entities) {
        try {
          entity.applyDamage(this.PAPER_WEAPON_DAMAGE);
          // Strong knockback — like being hit with a bat/brick
          const dx = entity.location.x - player.location.x;
          const dz = entity.location.z - player.location.z;
          const len = Math.sqrt(dx*dx+dz*dz) || 1;
          entity.applyKnockback(dx/len, dz/len, 1.2, 0.5);
          entity.addEffect('slowness', 60, { amplifier: 1, showParticles: false });
          hitCount++;
        } catch (e) {}
      }

      // Swing effect — paper shards burst outward
      const loc = player.location;
      for (let i = 0; i < 16; i++) {
        const a = (i/16)*Math.PI*2;
        try {
          player.dimension.spawnParticle('minecraft:critical_hit_emitter', {
            x: loc.x + Math.cos(a) * 2,
            y: loc.y + 1,
            z: loc.z + Math.sin(a) * 2
          });
        } catch (e) {}
      }
      if (hitCount > 0) {
        player.playSound('random.anvil_land', { pitch: 1.6, volume: 0.7 });
        player.sendMessage(`§7Hit ${hitCount} target(s)!`);
      }
    } catch (e) {}

    return true;
  }

  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
      case this.ABILITIES.SPIRIT_VISION:      return SeerSequence.useSpiritVision(player);
      case this.ABILITIES.FEINT_STRIKE:       return ClownSequence.useFeintStrike(player);
      case this.ABILITIES.DISGUISE:           return ClownSequence.useDisguise(player);
      case this.ABILITIES.PAPER_DAGGERS:      return ClownSequence.usePaperDaggers(player);
      case this.ABILITIES.FLAMING_JUMP:       return this.useFlamingJump(player);
      case this.ABILITIES.DAMAGE_TRANSFER:    return this.useDamageTransfer(player);
      case this.ABILITIES.SPELL_VOLLEY:       return this.useSpellVolley(player);
      case this.ABILITIES.AIR_BULLET:         return this.useAirBullet(player);
      case this.ABILITIES.PAPER_FIGURINE:     return this.usePaperFigurine(player);
      case this.ABILITIES.WATER_BREATHING:    return this.useWaterBreathing(player);
      case this.ABILITIES.DRAWING_PAPER_WEAPON: return this.useDrawingPaperWeapon(player);
      default: return false;
    }
  }

  static getAbilityDescription(abilityId) {
    const descs = {
      [this.ABILITIES.FLAMING_JUMP]:          `§7Cost: ${this.FLAMING_JUMP_SPIRIT_COST} Spirit\n§7Teleport through fire within 20 blocks\n§7No fire? Leap 8 blocks forward`,
      [this.ABILITIES.DAMAGE_TRANSFER]:       `§7Cost: ${this.TRANSFER_SPIRIT_COST} Spirit\n§7Prime: next heavy hit reduced by 60%\n§760s cooldown`,
      [this.ABILITIES.SPELL_VOLLEY]:          `§7Cost: ${this.SPELL_SPIRIT_COST} Spirit\n§7Fire 3 magic bolts at nearest enemies\n§720 block range, ${this.SPELL_DAMAGE} dmg each`,
      [this.ABILITIES.AIR_BULLET]:            `§7Cost: ${this.AIR_BULLET_SPIRIT_COST} Spirit\n§7Snap-fire compressed air bullet\n§7${this.AIR_BULLET_DAMAGE} dmg, ${this.AIR_BULLET_RANGE} block range, 0.75s cooldown`,
      [this.ABILITIES.PAPER_FIGURINE]:        `§7Passive item: carry a §fPaper Figurine§7 in inventory\n§7Auto-triggers when you drop below 30% HP\n§7Costs ${this.FIGURINE_SPIRIT_COST} spirit + consumes figurine, 40s cooldown`,
      [this.ABILITIES.WATER_BREATHING]:       `§7Cost: ${this.WATER_BREATH_SPIRIT_COST} Spirit/2s\n§7Conjure invisible air pipe — breathe underwater\n§7Drains spirit continuously; toggle off to cancel`,
      [this.ABILITIES.DRAWING_PAPER_WEAPON]:  `§7Cost: ${this.PAPER_WEAPON_SPIRIT_COST} Spirit + 1 Paper\n§7Harden paper into bat/brick/cane — AoE melee strike\n§7${this.PAPER_WEAPON_DAMAGE} dmg + knockback, ${this.PAPER_WEAPON_RANGE} block range`,
    };
    return descs[abilityId] || ClownSequence.getAbilityDescription(abilityId);
  }

  static getAllAbilities() {
    return [
      ...ClownSequence.getAllAbilities(),
      { id: this.ABILITIES.FLAMING_JUMP,          name: '§6🔥 Flaming Jump',        cost: this.FLAMING_JUMP_SPIRIT_COST },
      { id: this.ABILITIES.DAMAGE_TRANSFER,        name: '§c⚡ Damage Transfer',      cost: this.TRANSFER_SPIRIT_COST },
      { id: this.ABILITIES.SPELL_VOLLEY,           name: '§d✦ Spell Volley',          cost: this.SPELL_SPIRIT_COST },
      { id: this.ABILITIES.AIR_BULLET,             name: '§f💨 Air Bullet',            cost: this.AIR_BULLET_SPIRIT_COST },
      { id: this.ABILITIES.PAPER_FIGURINE,         name: '§f📄 Paper Figurine',        cost: this.FIGURINE_SPIRIT_COST },
      { id: this.ABILITIES.WATER_BREATHING,        name: '§b🌊 Water Breathing',       cost: this.WATER_BREATH_SPIRIT_COST },
      { id: this.ABILITIES.DRAWING_PAPER_WEAPON,   name: '§f📄 Paper Weapon',          cost: this.PAPER_WEAPON_SPIRIT_COST },
    ];
  }
}
