// ============================================================================
// TYRANT PATHWAY — SEQUENCE 9: SAILOR
// sailor.js → behavior_packs/LOTM/scripts/sequences/tyrant/sailor.js
//

// PhysicalEnhancementsTyrantAbility.java Seq9 row (STR+1/RES+1/SPD+1, no
// health/regen/oxygen bonus yet — those start at Seq8). Water Breathing +
// the in-water speed boost are this addon's own signature touch for the
// pathway's water theme from the very first sequence 
// ============================================================================
import { EnchantmentType } from '@minecraft/server';
import { PathwayManager } from '../../core/pathwayManager.js';

export class SailorSequence {
  static SEQUENCE_NUMBER = 9;
  static PATHWAY = 'tyrant';

  static EFFECT_DURATION = 999999;
  // Strength/Resistance bumped one amplifier tier above the decompiled
  // Seq9 row (originally STR/RES/SPD I) per user feedback after testing —
  // felt weaker than Red Priest's Hunter (II/II/II) at the same entry tier.
  // Speed reverted back to I on a second balance pass (Jump Boost added
  // instead) — swim bonus reverted alongside it to keep the same +2 gap
  // over baseline it had originally.
  static STRENGTH_AMPLIFIER = 1;   // Strength II
  static RESISTANCE_AMPLIFIER = 1; // Resistance II
  static SPEED_AMPLIFIER = 0;      // Speed I (out of water)
  static SWIM_SPEED_AMPLIFIER = 2; // Speed III while actually in water
  static JUMP_AMPLIFIER = 1;       // Jump Boost II

  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  static applyPassiveAbilities(player) {
    this.applyPhysicalEnhancements(player);
    this.applyWaterAffinity(player);
    this.applyDepthStrider(player);
  }

  static applyPhysicalEnhancements(player) {
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
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

  // Speed + Water Breathing live together here since which Speed amplifier
  // applies depends on whether the player is currently in water — keeping
  // both in one method means there's only ever one place writing to the
  // 'speed' effect slot, not two passives fighting over it.
  static applyWaterAffinity(player) {
    const wb = player.getEffect('water_breathing');
    if (!wb || wb.duration < 200) {
      player.addEffect('water_breathing', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    const targetAmplifier = player.isInWater ? this.SWIM_SPEED_AMPLIFIER : this.SPEED_AMPLIFIER;
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== targetAmplifier || speed.duration < 40) {
      // Minecraft's own effect-stacking rules silently ignore a WEAKER
      // application of an effect that's already active with time left on
      // it — so going III (swimming) -> I (on land) never actually took,
      // it just silently no-op'd and stayed at III forever. Removing first
      // guarantees the downgrade lands, not just the upgrade.
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

  static removeEffects(player) {
    player.removeEffect('strength');
    player.removeEffect('resistance');
    player.removeEffect('jump_boost');
    player.removeEffect('speed');
    player.removeEffect('water_breathing');
  }
}
