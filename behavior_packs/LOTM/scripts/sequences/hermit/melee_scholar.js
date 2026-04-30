// ============================================
// MELEE SCHOLAR - SEQUENCE 8 HERMIT PATHWAY
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { MysteryPryerSequence } from './mystery_pryer.js';

export class MeleeScholarSequence {
  static SEQUENCE_NUMBER = 8;
  static PATHWAY = PathwayManager.PATHWAYS.HERMIT;

  // ---- Effect duration ----
  static EFFECT_DURATION = 999999;

  // ---- Physical stats — solid but below Twilight Giant ----
  // Twilight Giant Warrior (Seq 9): Speed II, Strength II, Jump II
  // Melee Scholar gets Speed I, Strength I, Jump I — meaningful but not dominant
  static STRENGTH_AMPLIFIER = 1; // Strength II
  static SPEED_AMPLIFIER    = 1; // Speed II
  static JUMP_AMPLIFIER     = 1; // Jump Boost II

  // ---- Spirituality bump (inherited + new) ----
  // Mystery Pryer: 220 base spirit. Scholar adds 25 more on advancement.
  static SPIRIT_BONUS = 25;

  // ---- Combat Insight: analyse own weapon / combat style ----
  static INSIGHT_SPIRIT_COST = 20;
  static INSIGHT_COOLDOWN    = 300; // 15s
  static INSIGHT_DURATION    = 400; // 20s buff duration

  // ---- Martial Study: temporary combat surge ----
  static STUDY_SPIRIT_COST = 35;
  static STUDY_COOLDOWN    = 600; // 30s
  static STUDY_DURATION    = 100; // 5s intense burst

  // ---- State maps ----
  static insightCooldowns = new Map();
  static studyCooldowns   = new Map();
  static studyActive      = new Map(); // playerName -> ticksRemaining
  static insightActive    = new Map(); // playerName -> ticksRemaining

  // Ability identifiers
  static ABILITIES = {
    COMBAT_INSIGHT:  'combat_insight',
    MARTIAL_STUDY:   'martial_study',
    // Inherited
    DIVINATION:      MysteryPryerSequence.ABILITIES.DIVINATION,
    DIVINE_INSIGHT:  MysteryPryerSequence.ABILITIES.DIVINE_INSIGHT,
    DETECT_HOSTILES: MysteryPryerSequence.ABILITIES.DETECT_HOSTILES
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
    // Inherit Mystery Pryer passives (night vision, health boost, aura scan)
    MysteryPryerSequence.applyPassiveAbilities(player);

    // Physical enhancements — first and only time Hermit gets physical buffs
    this._applyPhysicalEnhancements(player);

    // Extra health: +2 hearts (scholar's conditioning)
    this._applyHealthBonus(player, 4);

    // Process active abilities
    this._processCombatInsight(player);
    this._processMartialStudy(player);

    // Tick inherited cooldowns
    MysteryPryerSequence._tickCooldowns(player);

    // Tick own cooldowns
    this._tickCooldowns(player);

    // Weapon enchantments via martial knowledge
    this._applyWeaponEnchantments(player);
  }

  // =============================================
  // PHYSICAL ENHANCEMENTS
  // =============================================
  static _applyPhysicalEnhancements(player) {
    // Strength II — scholar-trained muscles
    const str = player.getEffect('strength');
    if (!str || str.amplifier !== this.STRENGTH_AMPLIFIER || str.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: this.STRENGTH_AMPLIFIER, showParticles: false });
    }

    // Speed II — footwork from martial study
    const spd = player.getEffect('speed');
    if (!spd || spd.amplifier !== this.SPEED_AMPLIFIER || spd.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: this.SPEED_AMPLIFIER, showParticles: false });
    }

    // Jump Boost I — light footedness
    const jmp = player.getEffect('jump_boost');
    if (!jmp || jmp.amplifier !== this.JUMP_AMPLIFIER || jmp.duration < 200) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: this.JUMP_AMPLIFIER, showParticles: false });
    }
  }

  static _applyHealthBonus(player, bonusHearts) {
    const amplifier = bonusHearts - 1;
    const hb = player.getEffect('health_boost');
    if (!hb || hb.amplifier !== amplifier || hb.duration < 200) {
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier, showParticles: false });
    }
  }

  // =============================================
  // WEAPON ENCHANTMENTS (passive martial knowledge)
  // Modest — Sharpness I as baseline from scholarly technique
  // =============================================
  static _applyWeaponEnchantments(player) {
    const inventory = player.getComponent('minecraft:inventory');
    if (!inventory?.container) return;
    const heldItem = inventory.container.getItem(player.selectedSlotIndex);
    if (!heldItem) return;

    const melee = [
      'minecraft:wooden_sword', 'minecraft:stone_sword', 'minecraft:iron_sword',
      'minecraft:golden_sword', 'minecraft:diamond_sword', 'minecraft:netherite_sword',
      'minecraft:wooden_axe', 'minecraft:stone_axe', 'minecraft:iron_axe',
      'minecraft:golden_axe', 'minecraft:diamond_axe', 'minecraft:netherite_axe',
      'minecraft:trident', 'lotm:dawnsword', 'lotm:short_sword', 'lotm:knife'
    ];

    if (!melee.includes(heldItem.typeId)) return;

    try {
      const enc = heldItem.getComponent('minecraft:enchantable');
      if (!enc) return;
      // Sharpness I from technique (modest)
      const sharp = enc.getEnchantment('sharpness');
      if (!sharp || sharp.level < 1) {
        enc.addEnchantment({ type: 'sharpness', level: 1 });
        inventory.container.setItem(player.selectedSlotIndex, heldItem);
      }
    } catch (e) {}
  }

  // =============================================
  // ABILITY: COMBAT INSIGHT
  // Briefly analyse own fighting style — grants a combat buff
  // based on held weapon type
  // =============================================
  static useCombatInsight(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }

    const cd = this._cdRemaining(this.insightCooldowns, player);
    if (cd > 0) { player.sendMessage(`§cCombat Insight on cooldown: §e${cd}s`); return false; }

    if (!SpiritSystem.consumeSpirit(player, this.INSIGHT_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §5${this.INSIGHT_SPIRIT_COST}`); return false;
    }

    this.insightCooldowns.set(player.name, this.INSIGHT_COOLDOWN);
    this.insightActive.set(player.name, this.INSIGHT_DURATION);

    // Determine held weapon type and apply appropriate insight buff
    let weaponStyle = 'unarmed';
    try {
      const inv  = player.getComponent('minecraft:inventory');
      const held = inv?.container?.getItem(player.selectedSlotIndex);
      if (held) {
        if (held.typeId.includes('sword') || held.typeId.includes('lotm:dawnsword') || held.typeId.includes('lotm:short_sword'))
          weaponStyle = 'sword';
        else if (held.typeId.includes('axe'))
          weaponStyle = 'axe';
        else if (held.typeId.includes('trident'))
          weaponStyle = 'trident';
        else if (held.typeId.includes('knife'))
          weaponStyle = 'knife';
        else if (held.typeId.includes('bow') || held.typeId.includes('crossbow'))
          weaponStyle = 'ranged';
      }
    } catch (e) {}

    player.sendMessage(`§5§l✦ COMBAT INSIGHT ✦`);
    player.playSound('note.pling', { pitch: 1.5, volume: 1.0 });

    switch (weaponStyle) {
      case 'sword':
        player.addEffect('strength', this.INSIGHT_DURATION, { amplifier: 3, showParticles: true });
        player.sendMessage('§7§o"Sword arts flow through you..." §r§5+Strength IV (20s)');
        break;
      case 'axe':
        player.addEffect('strength', this.INSIGHT_DURATION, { amplifier: 2, showParticles: true });
        player.addEffect('haste',    this.INSIGHT_DURATION, { amplifier: 1, showParticles: false });
        player.sendMessage('§7§o"Axe momentum courses through you..." §r§5+Strength III, Haste II (20s)');
        break;
      case 'trident':
        player.addEffect('strength', this.INSIGHT_DURATION, { amplifier: 2, showParticles: true });
        player.addEffect('speed',    this.INSIGHT_DURATION, { amplifier: 2, showParticles: false });
        player.sendMessage('§7§o"Spear techniques sharpen your reflexes..." §r§5+Strength III, Speed III (20s)');
        break;
      case 'knife':
        player.addEffect('speed',    this.INSIGHT_DURATION, { amplifier: 3, showParticles: true });
        player.addEffect('haste',    this.INSIGHT_DURATION, { amplifier: 2, showParticles: false });
        player.sendMessage('§7§o"Knife fighting: speed is life..." §r§5+Speed IV, Haste III (20s)');
        break;
      case 'ranged':
        player.addEffect('speed',    this.INSIGHT_DURATION, { amplifier: 2, showParticles: true });
        player.sendMessage('§7§o"Distance control mastery..." §r§5+Speed III (20s)');
        break;
      default: // unarmed
        player.addEffect('strength', this.INSIGHT_DURATION, { amplifier: 2, showParticles: true });
        player.addEffect('speed',    this.INSIGHT_DURATION, { amplifier: 2, showParticles: false });
        player.sendMessage('§7§o"Bare-handed arts — deceptively powerful..." §r§5+Strength III, Speed III (20s)');
        break;
    }

    // Sparkle effect
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      try {
        player.dimension.spawnParticle('minecraft:soul_particle', {
          x: player.location.x + Math.cos(a) * 0.7,
          y: player.location.y + 1.2,
          z: player.location.z + Math.sin(a) * 0.7
        });
      } catch (e) {}
    }

    return true;
  }

  static _processCombatInsight(player) {
    const ticks = this.insightActive.get(player.name);
    if (!ticks || ticks <= 0) { this.insightActive.delete(player.name); return; }
    this.insightActive.set(player.name, ticks - 1);
    if (ticks <= 1) player.sendMessage('§7Combat Insight fades...');
  }

  // =============================================
  // ABILITY: MARTIAL STUDY
  // Short intense combat surge — all martial arts at once
  // =============================================
  static useMartialStudy(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }

    const cd = this._cdRemaining(this.studyCooldowns, player);
    if (cd > 0) { player.sendMessage(`§cMartial Study on cooldown: §e${cd}s`); return false; }
    if (this.studyActive.has(player.name)) { player.sendMessage('§cMartial Study already active!'); return false; }

    if (!SpiritSystem.consumeSpirit(player, this.STUDY_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §5${this.STUDY_SPIRIT_COST}`); return false;
    }

    this.studyCooldowns.set(player.name, this.STUDY_COOLDOWN);
    this.studyActive.set(player.name, this.STUDY_DURATION);

    // Short but powerful burst — comparable to a Warrior for 5 seconds
    player.addEffect('strength',   this.STUDY_DURATION, { amplifier: 3, showParticles: true });
    player.addEffect('speed',      this.STUDY_DURATION, { amplifier: 3, showParticles: true });
    player.addEffect('haste',      this.STUDY_DURATION, { amplifier: 2, showParticles: false });
    player.addEffect('resistance', this.STUDY_DURATION, { amplifier: 2, showParticles: false });
    player.addEffect('jump_boost', this.STUDY_DURATION, { amplifier: 2, showParticles: false });

    player.sendMessage('§5§l✦ MARTIAL STUDY ✦');
    player.sendMessage('§7§o"Every martial art flows through you as one..." §r§5(5s surge!)');
    player.playSound('item.trident.thunder', { pitch: 1.8, volume: 0.6 });

    // Dramatic burst
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      try {
        player.dimension.spawnParticle('minecraft:critical_hit_emitter', {
          x: player.location.x + Math.cos(a) * 1.0,
          y: player.location.y + 1.0,
          z: player.location.z + Math.sin(a) * 1.0
        });
        player.dimension.spawnParticle('minecraft:soul_particle', {
          x: player.location.x + Math.cos(a) * 0.5,
          y: player.location.y + 1.5,
          z: player.location.z + Math.sin(a) * 0.5
        });
      } catch (e) {}
    }

    return true;
  }

  static _processMartialStudy(player) {
    const ticks = this.studyActive.get(player.name);
    if (!ticks || ticks <= 0) { this.studyActive.delete(player.name); return; }
    this.studyActive.set(player.name, ticks - 1);

    // Trailing particles during surge
    if (ticks % 5 === 0) {
      try {
        player.dimension.spawnParticle('minecraft:soul_particle', {
          x: player.location.x,
          y: player.location.y + 0.5,
          z: player.location.z
        });
      } catch (e) {}
    }

    if (ticks <= 1) {
      player.sendMessage('§7Martial Study surge ends...');
    }
  }

  // =============================================
  // HANDLE ABILITY USE
  // =============================================
  static handleAbilityUse(player, abilityId) {
    if (abilityId === this.ABILITIES.COMBAT_INSIGHT)  return this.useCombatInsight(player);
    if (abilityId === this.ABILITIES.MARTIAL_STUDY)   return this.useMartialStudy(player);

    // Inherited Mystery Pryer abilities
    return MysteryPryerSequence.handleAbilityUse(player, abilityId);
  }

  static getAllAbilities() {
    return [
      { id: this.ABILITIES.COMBAT_INSIGHT,  name: '§5📖 Combat Insight', description: 'Weapon-adaptive buff (20s)', cost: this.INSIGHT_SPIRIT_COST },
      { id: this.ABILITIES.MARTIAL_STUDY,   name: '§c⚡ Martial Study',  description: 'All-arts surge (5s)',       cost: this.STUDY_SPIRIT_COST },
      ...MysteryPryerSequence.getAllAbilities()
    ];
  }

  // =============================================
  // COOLDOWN HELPERS
  // =============================================
  static _tickCooldowns(player) {
    const tick = (map, name) => { const v = map.get(name) || 0; if (v > 0) map.set(name, v - 1); };
    tick(this.insightCooldowns, player.name);
    tick(this.studyCooldowns,   player.name);
  }

  static _cdRemaining(map, player) {
    const v = map.get(player.name) || 0;
    return v > 0 ? Math.ceil(v / 20) : 0;
  }

  // =============================================
  // CLEANUP
  // =============================================
  static removeEffects(player) {
    MysteryPryerSequence.removeEffects(player);
    player.removeEffect('strength');
    player.removeEffect('speed');
    player.removeEffect('jump_boost');
    player.removeEffect('haste');
    this.insightCooldowns.delete(player.name);
    this.studyCooldowns.delete(player.name);
    this.studyActive.delete(player.name);
    this.insightActive.delete(player.name);
  }
}
