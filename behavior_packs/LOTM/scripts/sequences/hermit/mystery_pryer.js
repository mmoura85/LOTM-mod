// ============================================
// MYSTERY PRYER - SEQUENCE 9 HERMIT PATHWAY
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

export class MysteryPryerSequence {
  static SEQUENCE_NUMBER = 9;
  static PATHWAY = PathwayManager.PATHWAYS.HERMIT;

  // ---- Passive constants ----
  static EFFECT_DURATION = 999999;

  // High Spirituality — slightly above Seer (200), below Secrets Sorcerer bonus
  static BASE_SPIRIT = 220;

  // ---- Spirit Vision (passive — always-on night vision + aura detection) ----
  static AURA_SCAN_INTERVAL = 60; // ticks between scans (3s)
  static AURA_DETECT_RANGE  = 40; // blocks — strong spiritual perception

  // ---- Divination: Locate Structure ----
  static DIVINATION_SPIRIT_COST = 30;
  static DIVINATION_COOLDOWN    = 400; // 20s

  // ---- Divine Insight: Analyse Entity ----
  static INSIGHT_SPIRIT_COST = 20;
  static INSIGHT_COOLDOWN    = 200; // 10s
  static INSIGHT_RANGE       = 20;  // max distance to target

  // ---- Detect Hostiles ----
  static DETECT_SPIRIT_COST = 25;
  static DETECT_RANGE       = 30;
  static DETECT_COOLDOWN    = 300; // 15s
  static DETECT_DURATION    = 200; // 10s — how long glowing lasts on mobs

  // ---- State maps ----
  static divinationCooldowns = new Map(); // playerName -> ticksRemaining
  static insightCooldowns    = new Map();
  static detectCooldowns     = new Map();
  static auraTickCounters    = new Map(); // playerName -> tick counter

  // Ability identifiers
  static ABILITIES = {
    DIVINATION:     'divination',
    DIVINE_INSIGHT: 'divine_insight',
    DETECT_HOSTILES:'detect_hostiles'
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
    // Night Vision — spiritual perception grants sight in darkness
    const nv = player.getEffect('night_vision');
    if (!nv || nv.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    // Minor health bonus (+1 heart — spirituality bolsters constitution slightly)
    const hb = player.getEffect('health_boost');
    if (!hb || hb.amplifier !== 0 || hb.duration < 200) {
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    // Passive aura detection — scan for nearby Beyonders / dangerous mobs
    this._tickAuraScan(player);

    // Tick cooldowns
    this._tickCooldowns(player);
  }

  // =============================================
  // PASSIVE: AURA SCAN
  // Detects nearby beyonder players and dangerous mobs passively
  // =============================================
  static _tickAuraScan(player) {
    const t = (this.auraTickCounters.get(player.name) || 0) + 1;
    this.auraTickCounters.set(player.name, t);
    if (t % this.AURA_SCAN_INTERVAL !== 0) return;

    try {
      // Check nearby players for beyonder aura
      const nearbyPlayers = player.dimension.getPlayers({ location: player.location, maxDistance: this.AURA_DETECT_RANGE });
      for (const other of nearbyPlayers) {
        if (other.name === player.name) continue;
        const pathway  = PathwayManager.getPathway(other);
        const sequence = PathwayManager.getSequence(other);
        if (pathway && sequence !== -1 && sequence <= 7) {
          // Powerful beyonder nearby — alert with sound and message
          player.sendMessage(`§5[Spiritual Perception] §7A powerful presence stirs nearby...`);
          player.playSound('note.pling', { pitch: 0.6, volume: 0.5 });
          break;
        }
      }

      // Check nearby hostile mobs — apply a very brief glowing so player notices them
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.AURA_DETECT_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow', 'minecraft:player']
      });

      const hostileKeywords = [
        'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch',
        'phantom', 'pillager', 'vindicator', 'evoker', 'warden', 'blaze',
        'ghast', 'slime', 'magma_cube', 'hoglin', 'zoglin', 'ravager',
        'lotm:ghoul', 'lotm:vengeful_ghost', 'lotm:rampager'
      ];

      let hostileCount = 0;
      for (const entity of entities) {
        const isHostile = hostileKeywords.some(kw => entity.typeId.includes(kw));
        if (isHostile) {
          hostileCount++;
          // Brief glowing so the player can passively "sense" them
          try { entity.addEffect('glowing', 40, { amplifier: 0, showParticles: false }); } catch (e) {}
        }
      }

      if (hostileCount > 0) {
        player.sendMessage(`§5[Spiritual Perception] §7${hostileCount} hostile presence(s) within ${this.AURA_DETECT_RANGE} blocks.`);
      }
    } catch (e) {}
  }

  // =============================================
  // ABILITY: DIVINATION (locate nearest structure)
  // =============================================
  static useDivination(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }

    const cd = this._cdRemaining(this.divinationCooldowns, player);
    if (cd > 0) { player.sendMessage(`§cDivination on cooldown: §e${cd}s`); return false; }

    if (!SpiritSystem.consumeSpirit(player, this.DIVINATION_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §5${this.DIVINATION_SPIRIT_COST}`); return false;
    }

    this.divinationCooldowns.set(player.name, this.DIVINATION_COOLDOWN);

    player.sendMessage('§5§l✦ DIVINATION ✦');
    player.sendMessage('§7You cast your spiritual sight outward...');
    player.playSound('block.bell.hit', { pitch: 0.5, volume: 1.0 });

    // Particle pulse radiating outward to show the divination "wave"
    this._spawnDivinationPulse(player.dimension, player.location);

    // Locate structures using commands
    const structures = [
      'stronghold', 'village', 'mansion', 'monument',
      'fortress', 'end_city', 'ruined_portal', 'pillager_outpost'
    ];

    let found = false;
    for (const structure of structures) {
      try {
        const result = player.dimension.runCommand(
          `locate structure minecraft:${structure}`
        );
        if (result && result.statusMessage && !result.statusMessage.includes('Unable')) {
          player.sendMessage(`§5✦ §7${structure.replace('_', ' ')}: §e${result.statusMessage}`);
          found = true;
          break; // report nearest one
        }
      } catch (e) {}
    }

    if (!found) {
      // Try without minecraft: prefix (older syntax)
      try {
        const result = player.dimension.runCommand('locate stronghold');
        if (result && result.statusMessage) {
          player.sendMessage(`§5✦ §7Stronghold: §e${result.statusMessage}`);
          found = true;
        }
      } catch (e) {}
    }

    if (!found) {
      player.sendMessage('§7Your vision reaches far... but finds nothing remarkable nearby.');
    }

    return true;
  }

  // =============================================
  // ABILITY: DIVINE INSIGHT (analyse targeted entity)
  // =============================================
  static useDivineInsight(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }

    const cd = this._cdRemaining(this.insightCooldowns, player);
    if (cd > 0) { player.sendMessage(`§cDivine Insight on cooldown: §e${cd}s`); return false; }

    if (!SpiritSystem.consumeSpirit(player, this.INSIGHT_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §5${this.INSIGHT_SPIRIT_COST}`); return false;
    }

    // Find nearest entity in view
    const target = this._findTargetedEntity(player, this.INSIGHT_RANGE);

    if (!target) {
      SpiritSystem.restoreSpirit(player, this.INSIGHT_SPIRIT_COST);
      player.sendMessage('§cNo target found! Look at an entity within range.'); return false;
    }

    this.insightCooldowns.set(player.name, this.INSIGHT_COOLDOWN);

    // Make target glow
    try { target.addEffect('glowing', 100, { amplifier: 0, showParticles: false }); } catch (e) {}

    // --- Analyse ---
    player.sendMessage('§5§l✦ DIVINE INSIGHT ✦');
    player.playSound('block.bell.hit', { pitch: 1.2, volume: 0.8 });

    // Health
    try {
      const health = target.getComponent('minecraft:health');
      if (health) {
        const cur = Math.floor(health.currentValue);
        const max = Math.floor(health.effectiveMax);
        const pct = Math.floor((cur / max) * 100);
        const bar = this._buildHealthBar(pct);
        player.sendMessage(`§7Entity: §f${target.typeId.replace('minecraft:', '').replace('lotm:', '[LOTM] ')}`);
        player.sendMessage(`§7Health: §c${cur}§7/§c${max} §f${bar} §7(${pct}%)`);
      }
    } catch (e) {}

    // If it's a player — check beyonder status
    if (target.typeId === 'minecraft:player') {
      const pathway  = PathwayManager.getPathway(target);
      const sequence = PathwayManager.getSequence(target);
      if (pathway && sequence !== -1) {
        const dangerLevel = this._getDangerLevel(sequence);
        player.sendMessage(`§7Pathway: §5${pathway} §7| Sequence: §e${sequence}`);
        player.sendMessage(`§7Danger: ${dangerLevel}`);
      } else {
        player.sendMessage('§7No beyonder aura detected — ordinary human.');
      }
      return true;
    }

    // Mob danger assessment
    const dangerTier = this._assessMobDanger(target.typeId);
    player.sendMessage(`§7Danger Tier: ${dangerTier}`);

    // Check active effects on target
    try {
      const effects = [];
      const effectNames = [
        'strength', 'speed', 'regeneration', 'resistance',
        'poison', 'wither', 'weakness', 'blindness', 'slowness'
      ];
      for (const eff of effectNames) {
        const e = target.getEffect(eff);
        if (e) effects.push(`${eff}(${e.amplifier + 1})`);
      }
      if (effects.length > 0) {
        player.sendMessage(`§7Active Effects: §a${effects.join(', ')}`);
      }
    } catch (e) {}

    return true;
  }

  // =============================================
  // ABILITY: DETECT HOSTILES
  // Marks all hostile mobs in range with angry-villager diamond particles
  // =============================================
  static useDetectHostiles(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }

    const cd = this._cdRemaining(this.detectCooldowns, player);
    if (cd > 0) { player.sendMessage(`§cDetect Hostiles on cooldown: §e${cd}s`); return false; }

    if (!SpiritSystem.consumeSpirit(player, this.DETECT_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §5${this.DETECT_SPIRIT_COST}`); return false;
    }

    this.detectCooldowns.set(player.name, this.DETECT_COOLDOWN);

    const hostileKeywords = [
      'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch',
      'phantom', 'pillager', 'vindicator', 'evoker', 'warden', 'blaze',
      'ghast', 'slime', 'magma_cube', 'hoglin', 'zoglin', 'ravager',
      'drowned', 'husk', 'stray', 'piglin', 'vex', 'silverfish',
      'shulker', 'guardian', 'elder_guardian',
      'lotm:ghoul', 'lotm:vengeful_ghost', 'lotm:rampager', 'lotm:shade'
    ];

    player.sendMessage('§5§l✦ DETECT HOSTILES ✦');
    player.playSound('mob.elder_guardian.curse', { pitch: 1.5, volume: 0.8 });

    // Expanding pulse visual
    this._spawnDetectPulse(player.dimension, player.location, this.DETECT_RANGE);

    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.DETECT_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow', 'minecraft:player']
      });

      let detected = 0;
      for (const entity of entities) {
        const isHostile = hostileKeywords.some(kw => entity.typeId.includes(kw));
        if (!isHostile) continue;

        detected++;

        // Apply glowing so they show through walls
        try { entity.addEffect('glowing', this.DETECT_DURATION, { amplifier: 0, showParticles: false }); } catch (e) {}

        // Burst of angry-villager (red diamond) particles above each detected mob
        const loc = entity.location;
        for (let i = 0; i < 6; i++) {
          const angle  = (i / 6) * Math.PI * 2;
          const spread = 0.4;
          try {
            player.dimension.spawnParticle('minecraft:villager_angry', {
              x: loc.x + Math.cos(angle) * spread,
              y: loc.y + 2.3,
              z: loc.z + Math.sin(angle) * spread
            });
          } catch (e) {}
        }

        // Sustained red diamond burst over duration (every 20 ticks for 10 seconds)
        for (let tick = 20; tick <= this.DETECT_DURATION; tick += 20) {
          system.runTimeout(() => {
            try {
              if (!entity || entity.isValid === false) return;
              const el = entity.location;
              for (let j = 0; j < 4; j++) {
                const a = (j / 4) * Math.PI * 2;
                player.dimension.spawnParticle('minecraft:villager_angry', {
                  x: el.x + Math.cos(a) * 0.3,
                  y: el.y + 2.1,
                  z: el.z + Math.sin(a) * 0.3
                });
              }
            } catch (e) {}
          }, tick);
        }
      }

      if (detected === 0) {
        player.sendMessage('§7No hostile presences detected in range.');
      } else {
        player.sendMessage(`§5Detected §f${detected} §5hostile presence(s) within §f${this.DETECT_RANGE} §5blocks!`);
        player.sendMessage('§7Their auras burn red — you can see them through obstacles.');
      }
    } catch (e) {
      player.sendMessage('§cDetection failed.');
    }

    return true;
  }

  // =============================================
  // HANDLE ABILITY USE
  // =============================================
  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
      case this.ABILITIES.DIVINATION:      return this.useDivination(player);
      case this.ABILITIES.DIVINE_INSIGHT:  return this.useDivineInsight(player);
      case this.ABILITIES.DETECT_HOSTILES: return this.useDetectHostiles(player);
      default: return false;
    }
  }

  static getAllAbilities() {
    return [
      { id: this.ABILITIES.DIVINATION,      name: '§5✦ Divination',      description: 'Locate nearest structure', cost: this.DIVINATION_SPIRIT_COST },
      { id: this.ABILITIES.DIVINE_INSIGHT,  name: '§5👁 Divine Insight',  description: 'Analyse targeted entity',  cost: this.INSIGHT_SPIRIT_COST },
      { id: this.ABILITIES.DETECT_HOSTILES, name: '§c⚠ Detect Hostiles', description: 'Mark all hostiles in range',cost: this.DETECT_SPIRIT_COST }
    ];
  }

  // =============================================
  // COOLDOWN HELPERS
  // =============================================
  static _tickCooldowns(player) {
    const tick = (map, name) => { const v = map.get(name) || 0; if (v > 0) map.set(name, v - 1); };
    tick(this.divinationCooldowns, player.name);
    tick(this.insightCooldowns,    player.name);
    tick(this.detectCooldowns,     player.name);
  }

  static _cdRemaining(map, player) {
    const v = map.get(player.name) || 0;
    return v > 0 ? Math.ceil(v / 20) : 0;
  }

  // =============================================
  // VISUAL HELPERS
  // =============================================
  static _spawnDivinationPulse(dimension, location) {
    for (let r = 2; r <= 14; r += 2) {
      const rCopy = r;
      system.runTimeout(() => {
        const count = Math.floor(rCopy * 4);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          try {
            dimension.spawnParticle('minecraft:endrod', {
              x: location.x + Math.cos(a) * rCopy,
              y: location.y + 1,
              z: location.z + Math.sin(a) * rCopy
            });
            dimension.spawnParticle('minecraft:soul_particle', {
              x: location.x + Math.cos(a) * rCopy * 0.6,
              y: location.y + 1.5,
              z: location.z + Math.sin(a) * rCopy * 0.6
            });
          } catch (e) {}
        }
      }, r * 2);
    }
  }

  static _spawnDetectPulse(dimension, location, maxRadius) {
    for (let r = 3; r <= maxRadius; r += 5) {
      const rCopy = r;
      system.runTimeout(() => {
        const count = Math.floor(rCopy * 3);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          try {
            dimension.spawnParticle('minecraft:villager_angry', {
              x: location.x + Math.cos(a) * rCopy,
              y: location.y + 1,
              z: location.z + Math.sin(a) * rCopy
            });
          } catch (e) {}
        }
      }, r * 2);
    }
  }

  // =============================================
  // ANALYSIS HELPERS
  // =============================================
  static _findTargetedEntity(player, maxRange) {
    try {
      const viewDir = player.getViewDirection();
      const loc     = player.location;
      // Cast ray in view direction, check entities near the ray
      const entities = player.dimension.getEntities({
        location: loc,
        maxDistance: maxRange,
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow']
      });

      let closest = null;
      let closestDot = 0.85; // cos(~32°) — generous cone

      for (const entity of entities) {
        if (entity.id === player.id) continue;
        const dx = entity.location.x - loc.x;
        const dy = entity.location.y + 1 - (loc.y + 1.6); // eye level
        const dz = entity.location.z - loc.z;
        const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (len < 0.1) continue;
        const dot = (dx * viewDir.x + dy * viewDir.y + dz * viewDir.z) / len;
        if (dot > closestDot) {
          closestDot = dot;
          closest = entity;
        }
      }
      return closest;
    } catch (e) { return null; }
  }

  static _getDangerLevel(sequence) {
    if (sequence >= 8) return '§a● Low  §7(Seq 8–9, awakening beyonder)';
    if (sequence >= 6) return '§e●● Moderate §7(Seq 6–7, capable fighter)';
    if (sequence >= 4) return '§c●●● High §7(Seq 4–5, extraordinary power)';
    return '§4●●●● Extreme §7(Seq 0–3, demigod territory)';
  }

  static _assessMobDanger(typeId) {
    if (typeId.includes('warden') || typeId.includes('ender_dragon') || typeId.includes('wither'))
      return '§4●●●● Extreme — Ancient threat';
    if (typeId.includes('lotm:rampager') || typeId.includes('elder_guardian') || typeId.includes('ravager'))
      return '§c●●● High — Beyond ordinary threat';
    if (typeId.includes('lotm:vengeful_ghost') || typeId.includes('lotm:ghoul') || typeId.includes('witch') || typeId.includes('evoker'))
      return '§e●● Moderate — Dangerous anomaly';
    return '§a● Low — Common hostile';
  }

  static _buildHealthBar(pct) {
    const filled = Math.floor(pct / 10);
    return '§c' + '█'.repeat(filled) + '§8' + '░'.repeat(10 - filled);
  }

  // =============================================
  // CLEANUP
  // =============================================
  static removeEffects(player) {
    player.removeEffect('night_vision');
    player.removeEffect('health_boost');
    this.divinationCooldowns.delete(player.name);
    this.insightCooldowns.delete(player.name);
    this.detectCooldowns.delete(player.name);
    this.auraTickCounters.delete(player.name);
  }
}
