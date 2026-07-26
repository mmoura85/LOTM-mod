// ============================================
// SECRETS SUPPLIANT - SEQUENCE 9 HANGED MAN PATHWAY
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

export class SecretsSuppliantSequence {
  static SEQUENCE_NUMBER = 9;
  static PATHWAY = PathwayManager.PATHWAYS.HANGED_MAN;

  static BASE_SPIRIT = 140;
  static EFFECT_DURATION = 999999;

  // Spirit Perception — passive detection
  static PERCEPTION_RANGE = 24;
  static PERCEPTION_SCAN_INTERVAL = 60;

  // Divination
  static DIVINATION_SPIRIT_COST = 35;
  static DIVINATION_COOLDOWN = 200;
  static DIVINATION_RANGE = 64;

  // Enchantment Inscription
  static INSCRIPTION_SPIRIT_COST = 50;
  static INSCRIPTION_COOLDOWN = 100;

  // Aura Reading
  static AURA_READ_SPIRIT_COST = 20;
  static AURA_READ_RANGE = 16;
  static AURA_READ_COOLDOWN = 60;

  static ABILITIES = {
    DIVINATION:              'divination',
    ENCHANTMENT_INSCRIPTION: 'enchantment_inscription',
    AURA_READING:            'aura_reading',
    SPIRIT_PERCEPTION:       'spirit_perception',
  };

  static perceptionTicks     = new Map();
  static divinationCooldowns = new Map();
  static inscriptionCooldowns = new Map();
  static auraReadCooldowns   = new Map();
  static selectedAbilities   = new Map();
  static SELECTED_ABILITY_PROPERTY = 'lotm:hangedman_selected_ability';

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
    return this.selectedAbilities.get(player.name) || this.ABILITIES.DIVINATION;
  }

  static setSelectedAbility(player, abilityId) {
    this.selectedAbilities.set(player.name, abilityId);
    try { player.setDynamicProperty(this.SELECTED_ABILITY_PROPERTY, abilityId); } catch (e) {}
  }

  static useSelectedAbility(player) {
    return this.handleAbilityUse(player, this.getSelectedAbility(player));
  }

  // =============================================
  // PASSIVE ABILITIES
  // =============================================
  static applyPassiveAbilities(player) {
    this.applyPhysicalEnhancements(player);

    const nv = player.getEffect('night_vision');
    if (!nv || nv.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    this.applyHealthBonus(player, 2);
    this.runSpiritPerceptionPassive(player);
    this.tickCooldowns(player);
  }

  static applyPhysicalEnhancements(player) {
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== 0 || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }
    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== 0 || jump.duration < 200) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }
  }

  static applyHealthBonus(player, bonusHearts) {
    const amplifier = bonusHearts - 2;
    const hb = player.getEffect('health_boost');
    if (!hb || hb.amplifier !== amplifier || hb.duration < 200) {
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier, showParticles: false });
    }
  }

  // =============================================
  // PASSIVE: SPIRIT PERCEPTION
  // =============================================
  static runSpiritPerceptionPassive(player) {
    const t = (this.perceptionTicks.get(player.name) || 0) + 1;
    this.perceptionTicks.set(player.name, t);
    if (t % this.PERCEPTION_SCAN_INTERVAL !== 0) return;

    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.PERCEPTION_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow',
                       'minecraft:fireball', 'minecraft:snowball'],
      });

      let detectedCount = 0;

      for (const entity of entities) {
        if (entity.id === player.id) continue;

        if (this._isPowerfulEntity(entity)) {
          detectedCount++;
          try { entity.addEffect('glowing', 80, { amplifier: 0, showParticles: false }); } catch (e) {}
          try {
            for (let i = 0; i < 6; i++) {
              const angle = (i / 6) * Math.PI * 2;
              player.dimension.spawnParticle('minecraft:villager_happy', {
                x: entity.location.x + Math.cos(angle) * 0.8,
                y: entity.location.y + 1.2,
                z: entity.location.z + Math.sin(angle) * 0.8,
              });
            }
          } catch (e) {}
        }

        if (entity.typeId === 'minecraft:player') {
          const targetPathway = PathwayManager.getPathway(entity);
          if (targetPathway && entity.name !== player.name) {
            detectedCount++;
            try { entity.addEffect('glowing', 80, { amplifier: 0, showParticles: false }); } catch (e) {}
          }
        }
      }

      if (detectedCount > 0) {
        player.onScreenDisplay.setActionBar(
          `§5👁 Spirit Perception: §d${detectedCount} §5powerful presence(s) nearby`
        );
      }
    } catch (e) {}
  }

  static _isPowerfulEntity(entity) {
    const alwaysPowerful = [
      'minecraft:wither', 'minecraft:ender_dragon', 'minecraft:elder_guardian',
      'minecraft:warden', 'minecraft:ravager', 'minecraft:evoker',
      'minecraft:vindicator', 'minecraft:witch',
      'lotm:rampager', 'lotm:vengeful_ghost',
    ];
    if (alwaysPowerful.includes(entity.typeId)) return true;
    try {
      const healthComp = entity.getComponent('minecraft:health');
      if (healthComp && healthComp.effectiveMax >= 40) return true;
    } catch (e) {}
    return false;
  }

  // =============================================
  // ABILITY: SPIRIT PERCEPTION (ACTIVE)
  // Right-click triggered readout — chat-based since the action bar fades
  // too fast to actually read a list of detected presences.
  // =============================================
  static useSpiritPerception(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    player.sendMessage('§5§l👁 SPIRIT PERCEPTION');
    player.sendMessage('§dYour spiritual perception sweeps the area...');
    player.playSound('block.beacon.ambient', { pitch: 1.5, volume: 0.8 });

    const results = [];
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.PERCEPTION_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow',
                       'minecraft:fireball', 'minecraft:snowball'],
      });

      for (const entity of entities) {
        if (entity.id === player.id) continue;

        if (entity.typeId === 'minecraft:player') {
          const targetPathway = PathwayManager.getPathway(entity);
          if (targetPathway && entity.name !== player.name) {
            const dist = Math.floor(this._dist(player.location, entity.location));
            results.push(`§d${entity.name}§7 — ${targetPathway} (${dist}m)`);
            try { entity.addEffect('glowing', 80, { amplifier: 0, showParticles: false }); } catch (e) {}
          }
          continue;
        }

        if (this._isPowerfulEntity(entity)) {
          const dist = Math.floor(this._dist(player.location, entity.location));
          results.push(`§c${entity.typeId.replace('minecraft:', '').replace('lotm:', '[LOTM] ')} §7(${dist}m)`);
          try { entity.addEffect('glowing', 80, { amplifier: 0, showParticles: false }); } catch (e) {}
        }
      }
    } catch (e) {}

    if (results.length > 0) {
      player.sendMessage('§5── Presences Detected ──');
      for (const r of results.slice(0, 8)) player.sendMessage(`  §7• ${r}`);
      if (results.length > 8) player.sendMessage(`  §7...and ${results.length - 8} more.`);
    } else {
      player.sendMessage('§7No powerful presences detected nearby.');
    }

    return true;
  }

  // =============================================
  // COOLDOWN HELPERS
  // =============================================
  static tickCooldowns(player) {
    const n    = player.name;
    const tick = v => (v > 0 ? v - 1 : 0);
    const dc = this.divinationCooldowns.get(n);  if (dc)  this.divinationCooldowns.set(n, tick(dc));
    const ic = this.inscriptionCooldowns.get(n); if (ic)  this.inscriptionCooldowns.set(n, tick(ic));
    const ac = this.auraReadCooldowns.get(n);    if (ac)  this.auraReadCooldowns.set(n, tick(ac));
  }

  static _cdRemaining(map, player) {
    const v = map.get(player.name) || 0;
    return v > 0 ? Math.ceil(v / 20) : 0;
  }

  // =============================================
  // ABILITY: DIVINATION
  // =============================================
  static useDivination(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    const cd = this._cdRemaining(this.divinationCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cDivination on cooldown: §d${cd}s`);
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.DIVINATION_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §d${this.DIVINATION_SPIRIT_COST}`);
      return false;
    }

    this.divinationCooldowns.set(player.name, this.DIVINATION_COOLDOWN);

    player.sendMessage('§5§l👁 DIVINATION');
    player.sendMessage('§dYou extend your spiritual perception outward...');
    player.playSound('block.beacon.ambient', { pitch: 1.8, volume: 1.0 });
    this._spawnDivinationPulse(player);

    let found = false;
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.DIVINATION_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow'],
      });

      const results = [];

      for (const entity of entities) {
        if (entity.id === player.id) continue;

        if (entity.typeId === 'minecraft:player') {
          const targetPathway  = PathwayManager.getPathway(entity);
          const targetSequence = PathwayManager.getSequence(entity);
          if (targetPathway) {
            const dist = Math.floor(this._dist(player.location, entity.location));
            results.push(`§d${entity.name}§7 — ${targetPathway} Seq.${targetSequence} (${dist}m)`);
            try { entity.addEffect('glowing', 120, { amplifier: 0, showParticles: false }); } catch (e) {}
          }
          continue;
        }

        if (this._isPowerfulEntity(entity)) {
          const dist = Math.floor(this._dist(player.location, entity.location));
          let healthStr = '';
          try {
            const hc = entity.getComponent('minecraft:health');
            if (hc) healthStr = ` §c${Math.floor(hc.currentValue)}/${Math.floor(hc.effectiveMax)}HP`;
          } catch (e) {}
          results.push(`§c${entity.typeId.replace('minecraft:', '').replace('lotm:', '[LOTM] ')}${healthStr} §7(${dist}m)`);
          try { entity.addEffect('glowing', 120, { amplifier: 0, showParticles: false }); } catch (e) {}
        }
      }

      if (results.length > 0) {
        found = true;
        player.sendMessage('§5── Divination Results ──');
        for (const r of results.slice(0, 8)) player.sendMessage(`  §7• ${r}`);
        if (results.length > 8) player.sendMessage(`  §7...and ${results.length - 8} more.`);
        player.sendMessage('§5────────────────────');
      }
    } catch (e) {}

    this._divinationStructureScan(player);

    if (!found) {
      player.sendMessage('§7Your perception reaches outward... nothing of note nearby.');
    }

    return true;
  }

  static _divinationStructureScan(player) {
    // Bedrock's /locate structure takes bare ids (no "minecraft:" namespace),
    // and its success text is "... at [<x> ~ <z>] (<dist> blocks away)" — no commas.
    const structures = [
      { id: 'village',          label: '🏘 Village'       },
      { id: 'stronghold',       label: '🏰 Stronghold'    },
      { id: 'monument',         label: '🌊 Monument'      },
      { id: 'mansion',          label: '🏚 Mansion'       },
      { id: 'fortress',         label: '🔥 Fortress'      },
      { id: 'ruined_portal',    label: '🌀 Ruined Portal'  },
      { id: 'pillager_outpost', label: '🗼 Outpost'       },
    ];

    const foundStructures = [];

    for (const struct of structures) {
      try {
        const result = player.dimension.runCommand(`locate structure ${struct.id}`);
        if (!result || result.successCount === 0) continue;
        const msg = result.statusMessage || '';
        if (!msg) continue;

        const coordMatch = msg.match(/\[\s*(-?\d+)\s*~\s*(-?\d+)\s*\]/);
        if (!coordMatch) continue;

        const sx   = parseInt(coordMatch[1]);
        const sz   = parseInt(coordMatch[2]);
        const dx   = sx - Math.floor(player.location.x);
        const dz   = sz - Math.floor(player.location.z);
        const dist = Math.floor(Math.sqrt(dx * dx + dz * dz));
        const angle = Math.atan2(dz, dx) * 180 / Math.PI;
        const dir   = this._angleToCardinal(angle);

        foundStructures.push(`§e${struct.label} §7— ${dist}m §f${dir} §7(${sx}, ${sz})`);
      } catch (e) {}
    }

    if (foundStructures.length > 0) {
      player.sendMessage('§5── Nearby Structures ──');
      for (const s of foundStructures) player.sendMessage(`  §7• ${s}`);
    } else {
      player.sendMessage('§7No structures detected within range.');
    }
  }

  // =============================================
  // ABILITY: ENCHANTMENT INSCRIPTION
  // =============================================
  static useEnchantmentInscription(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    const cd = this._cdRemaining(this.inscriptionCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cEnchantment Inscription on cooldown: §d${cd}s`);
      return false;
    }

    const currentSpirit = SpiritSystem.getSpirit(player);
    if (currentSpirit < this.INSCRIPTION_SPIRIT_COST) {
      player.sendMessage(`§cNot enough spirit! Need §d${this.INSCRIPTION_SPIRIT_COST}`);
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.INSCRIPTION_SPIRIT_COST)) return false;

    this.inscriptionCooldowns.set(player.name, this.INSCRIPTION_COOLDOWN);

    const maxSpirit   = SpiritSystem.getMaxSpirit(player);
    const spiritRatio = currentSpirit / maxSpirit;
    const enchantment = this._pickEnchantment(spiritRatio);

    // The scripting API's enchantable component does not reliably bake stored
    // enchantments onto enchanted_book items (confirmed broken even after a
    // container round-trip). Use the native loot system instead — this is the
    // same "specific_enchants" function vanilla uses to generate pre-enchanted
    // books in chest loot, so it's guaranteed to actually work.
    let success = false;
    try {
      player.runCommand(`loot give @s loot "enchant_books/${enchantment.id}_${enchantment.level}"`);
      success = true;
    } catch (e) {
      try {
        player.runCommand('give @s minecraft:enchanted_book 1');
        success = true;
        player.sendMessage('§7(Enchantment may not have applied — check the book.)');
      } catch (_) {}
    }

    if (success) {
      player.sendMessage('§5§l📖 ENCHANTMENT INSCRIPTION');
      player.sendMessage('§dYou inscribe mystical knowledge onto parchment...');
      player.sendMessage(`§eReceived: §f${enchantment.name} ${this._toRoman(enchantment.level)}`);
      player.playSound('random.levelup', { pitch: 0.9, volume: 1.0 });
      this._spawnInscriptionEffect(player);
    }

    return true;
  }

  static _pickEnchantment(spiritRatio) {
    const tier1 = [
      { id: 'sharpness',       name: 'Sharpness',       level: 3 },
      { id: 'protection',      name: 'Protection',      level: 3 },
      { id: 'efficiency',      name: 'Efficiency',      level: 3 },
      { id: 'unbreaking',      name: 'Unbreaking',      level: 2 },
      { id: 'fire_aspect',     name: 'Fire Aspect',     level: 1 },
      { id: 'knockback',       name: 'Knockback',       level: 2 },
      { id: 'feather_falling', name: 'Feather Falling', level: 3 },
      { id: 'aqua_affinity',   name: 'Aqua Affinity',   level: 1 },
      { id: 'respiration',     name: 'Respiration',     level: 2 },
    ];

    const tier2 = [
      { id: 'sharpness',        name: 'Sharpness',        level: 5 },
      { id: 'protection',       name: 'Protection',       level: 4 },
      { id: 'efficiency',       name: 'Efficiency',       level: 5 },
      { id: 'unbreaking',       name: 'Unbreaking',       level: 3 },
      { id: 'fortune',          name: 'Fortune',          level: 3 },
      { id: 'looting',          name: 'Looting',          level: 3 },
      { id: 'power',            name: 'Power',            level: 4 },
      { id: 'silk_touch',       name: 'Silk Touch',       level: 1 },
      { id: 'smite',            name: 'Smite',            level: 4 },
      { id: 'blast_protection', name: 'Blast Protection', level: 4 },
      { id: 'depth_strider',    name: 'Depth Strider',    level: 3 },
      { id: 'frost_walker',     name: 'Frost Walker',     level: 2 },
      { id: 'feather_falling',  name: 'Feather Falling',  level: 4 },
    ];

    const tier3 = [
      { id: 'mending',       name: 'Mending',       level: 1 },
      { id: 'infinity',      name: 'Infinity',      level: 1 },
      { id: 'sharpness',     name: 'Sharpness',     level: 5 },
      { id: 'protection',    name: 'Protection',    level: 4 },
      { id: 'channeling',    name: 'Channeling',    level: 1 },
      { id: 'riptide',       name: 'Riptide',       level: 3 },
      { id: 'loyalty',       name: 'Loyalty',       level: 3 },
      { id: 'multishot',     name: 'Multishot',     level: 1 },
      { id: 'piercing',      name: 'Piercing',      level: 4 },
      { id: 'quick_charge',  name: 'Quick Charge',  level: 3 },
      { id: 'soul_speed',    name: 'Soul Speed',    level: 3 },
      { id: 'swift_sneak',   name: 'Swift Sneak',   level: 3 },
      { id: 'thorns',        name: 'Thorns',        level: 3 },
    ];

    let pool;
    if (spiritRatio >= 0.75)     pool = tier3;
    else if (spiritRatio >= 0.4) pool = tier2;
    else                         pool = tier1;

    return pool[Math.floor(Math.random() * pool.length)];
  }

  static _toRoman(n) {
    const map = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
    return map[n] || String(n);
  }

  static _spawnInscriptionEffect(player) {
    const loc = player.location;
    const dim = player.dimension;
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      system.runTimeout(() => {
        try {
          dim.spawnParticle('minecraft:totem_particle', {
            x: loc.x + Math.cos(angle) * 0.5,
            y: loc.y + 1.8,
            z: loc.z + Math.sin(angle) * 0.5,
          });
          dim.spawnParticle('minecraft:end_rod', {
            x: loc.x + Math.cos(angle) * 1.0,
            y: loc.y + 1.0,
            z: loc.z + Math.sin(angle) * 1.0,
          });
        } catch (e) {}
      }, i * 2);
    }
  }

  // =============================================
  // ABILITY: AURA READING
  // =============================================
  static useAuraReading(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    const cd = this._cdRemaining(this.auraReadCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cAura Reading on cooldown: §d${cd}s`);
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.AURA_READ_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §d${this.AURA_READ_SPIRIT_COST}`);
      return false;
    }

    this.auraReadCooldowns.set(player.name, this.AURA_READ_COOLDOWN);

    player.sendMessage('§5§l✧ AURA READING ✧');
    player.playSound('block.enchantment_table.use', { pitch: 1.2, volume: 1.0 });

    let anyFound = false;

    try {
      const nearbyPlayers = player.dimension.getPlayers({
        location: player.location,
        maxDistance: this.AURA_READ_RANGE,
      });

      for (const target of nearbyPlayers) {
        if (target.name === player.name) continue;
        anyFound = true;

        const targetPathway   = PathwayManager.getPathway(target);
        const targetSequence  = PathwayManager.getSequence(target);
        const targetSpirit    = SpiritSystem.getSpirit(target);
        const targetMaxSpirit = SpiritSystem.getMaxSpirit(target);

        if (targetPathway) {
          player.sendMessage(
            `§d${target.name}: §5${targetPathway} §7Seq.${targetSequence} — Spirit §b${Math.floor(targetSpirit)}§7/§b${targetMaxSpirit}`
          );
        } else {
          player.sendMessage(`§d${target.name}: §7No beyonder pathway detected.`);
        }

        try { target.sendMessage('§5You feel a mysterious gaze upon you...'); } catch (e) {}
      }
    } catch (e) {}

    try {
      const nearbyMobs = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.AURA_READ_RANGE,
        excludeTypes: ['minecraft:player', 'minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow'],
      });

      let mobCount = 0;
      for (const mob of nearbyMobs) {
        if (mobCount >= 5) break;
        const auraDesc = this._getMobAuraDescription(mob);
        if (auraDesc) {
          anyFound = true;
          mobCount++;
          player.sendMessage(`§c${mob.typeId.replace('minecraft:', '').replace('lotm:', '[LOTM]')}: §7${auraDesc}`);
        }
      }
    } catch (e) {}

    if (!anyFound) player.sendMessage('§7No significant auras detected nearby.');

    this._spawnAuraReadEffect(player);
    return true;
  }

  static _getMobAuraDescription(entity) {
    const typeId = entity.typeId;
    if (typeId === 'lotm:rampager')       return '§cDark, raging aura — a Beyonder beast';
    if (typeId === 'lotm:vengeful_ghost')  return '§5Undead spiritual remnant — strong resentment';
    if (typeId === 'lotm:ghost')           return '§7Faint spiritual presence — lingering spirit';
    if (typeId === 'lotm:ghoul')           return '§8Corrupted life force — fallen creature';
    if (typeId === 'lotm:shade')           return '§0Void-like aura — spiritual shadow';
    if (typeId === 'minecraft:warden')         return '§0Ancient and wrathful — extremely dangerous';
    if (typeId === 'minecraft:ender_dragon')   return '§5Cosmic power — primordial entity';
    if (typeId === 'minecraft:wither')         return '§8Death and decay — undead abomination';
    if (typeId === 'minecraft:elder_guardian') return '§3Ancient guardian — cursed watcher';
    if (typeId === 'minecraft:evoker')         return '§dFaint mystical signature — minor Beyonder';
    if (typeId === 'minecraft:witch')          return '§2Herbal ritual magic — skilled practitioner';
    if (typeId === 'minecraft:phantom')        return '§8Undead — spiritual fragment of sleeplessness';
    try {
      const hc = entity.getComponent('minecraft:health');
      if (hc && hc.effectiveMax >= 80) return '§eUnusually strong life force';
      if (hc && hc.effectiveMax >= 40) return '§7Notable spiritual presence';
    } catch (e) {}
    return null;
  }

  static _spawnAuraReadEffect(player) {
    const loc = player.location;
    const dim = player.dimension;
    for (let i = 0; i < 24; i++) {
      const delay = i * 2;
      const angle = (i / 24) * Math.PI * 4;
      const h     = i * 0.12;
      system.runTimeout(() => {
        try {
          dim.spawnParticle('minecraft:end_rod', {
            x: loc.x + Math.cos(angle) * 1.2,
            y: loc.y + h,
            z: loc.z + Math.sin(angle) * 1.2,
          });
        } catch (e) {}
      }, delay);
    }
  }

  // =============================================
  // UTILITY
  // =============================================
  static _angleToCardinal(angle) {
    const normalised = ((angle % 360) + 360) % 360;
    if (normalised < 22.5 || normalised >= 337.5) return '→ East';
    if (normalised < 67.5)  return '↘ SE';
    if (normalised < 112.5) return '↓ South';
    if (normalised < 157.5) return '↙ SW';
    if (normalised < 202.5) return '← West';
    if (normalised < 247.5) return '↖ NW';
    if (normalised < 292.5) return '↑ North';
    return '↗ NE';
  }

  static _dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  static _spawnDivinationPulse(player) {
    const loc = player.location;
    const dim = player.dimension;
    for (let step = 1; step <= 6; step++) {
      const r     = step * 3;
      const delay = step * 4;
      system.runTimeout(() => {
        const count = Math.floor(r * 5);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          try {
            dim.spawnParticle('minecraft:end_rod', {
              x: loc.x + Math.cos(a) * r,
              y: loc.y + 1,
              z: loc.z + Math.sin(a) * r,
            });
          } catch (e) {}
        }
      }, delay);
    }
    for (let h = 0; h < 6; h++) {
      system.runTimeout(() => {
        try {
          dim.spawnParticle('minecraft:villager_happy', {
            x: loc.x, y: loc.y + h * 0.6, z: loc.z,
          });
        } catch (e) {}
      }, h * 3);
    }
  }

  // =============================================
  // ABILITY HANDLER
  // =============================================
  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
      case this.ABILITIES.DIVINATION:
        return this.useDivination(player);
      case this.ABILITIES.ENCHANTMENT_INSCRIPTION:
        return this.useEnchantmentInscription(player);
      case this.ABILITIES.AURA_READING:
        return this.useAuraReading(player);
      case this.ABILITIES.SPIRIT_PERCEPTION:
        return this.useSpiritPerception(player);
      default:
        player.sendMessage('§cUnknown ability!');
        return false;
    }
  }

  // =============================================
  // ABILITY DESCRIPTIONS
  // =============================================
  static getAbilityDescription(abilityId) {
    const descs = {
      [this.ABILITIES.DIVINATION]:
        `§dCost: ${this.DIVINATION_SPIRIT_COST} Spirit | CD: 10s\n§7Scan 64m for beyonders, powerful mobs & structures`,
      [this.ABILITIES.ENCHANTMENT_INSCRIPTION]:
        `§dCost: ${this.INSCRIPTION_SPIRIT_COST} Spirit | CD: 5s\n§7Inscribe mystical knowledge into an enchanted book`,
      [this.ABILITIES.AURA_READING]:
        `§dCost: ${this.AURA_READ_SPIRIT_COST} Spirit | CD: 3s\n§7Read the aura of nearby entities and players`,
      [this.ABILITIES.SPIRIT_PERCEPTION]:
        `§7Passive: Always active\n§7Tap to trigger an immediate scan`,
    };
    return descs[abilityId] || '§7Unknown ability';
  }

  static getAllAbilities() {
    return [
      { id: this.ABILITIES.DIVINATION,              name: '§5👁 Divination',              cost: this.DIVINATION_SPIRIT_COST },
      { id: this.ABILITIES.ENCHANTMENT_INSCRIPTION, name: '§d📖 Enchantment Inscription', cost: this.INSCRIPTION_SPIRIT_COST },
      { id: this.ABILITIES.AURA_READING,            name: '§b✧ Aura Reading',             cost: this.AURA_READ_SPIRIT_COST },
      { id: this.ABILITIES.SPIRIT_PERCEPTION,       name: '§7◉ Spirit Perception',        cost: 0 },
    ];
  }

  // =============================================
  // CLEAN UP
  // =============================================
  static removeEffects(player) {
    player.removeEffect('night_vision');
    player.removeEffect('speed');
    player.removeEffect('jump_boost');
    player.removeEffect('health_boost');

    this.perceptionTicks.delete(player.name);
    this.divinationCooldowns.delete(player.name);
    this.inscriptionCooldowns.delete(player.name);
    this.auraReadCooldowns.delete(player.name);
    this.selectedAbilities.delete(player.name);
  }
}
