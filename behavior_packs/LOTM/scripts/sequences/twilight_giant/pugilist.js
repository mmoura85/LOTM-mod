import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { WarriorSequence } from './warrior.js';

export class PugilistSequence {
  static SEQUENCE_NUMBER = 8;
  static PATHWAY = 'twilight_giant';
  
  // Enhanced passive abilities
  static EFFECT_DURATION = 400;
  static STRENGTH_AMPLIFIER = 2; // Strength III
  static SPEED_AMPLIFIER = 1; // Speed II
  static JUMP_AMPLIFIER = 1; // Jump Boost II
  
  /**
   * Check if player has this sequence
   */
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) === this.SEQUENCE_NUMBER;
  }
  
  /**
   * Apply passive abilities
   */
  static applyPassiveAbilities(player) {
    if (!this.hasSequence(player)) return;
    
    // Enhanced physical abilities
    this.applyPhysicalEnhancements(player);
    
    // Health bonus (+2 hearts)
    this.applyHealthBonus(player, 4);
    
    // Apply weapon enchantments
    this.applyWeaponEnchantments(player);
  }
  
  /**
   * Apply enhanced physical abilities
   */
  static applyPhysicalEnhancements(player) {
    // Strength III
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, {
        amplifier: this.STRENGTH_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Speed II
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, {
        amplifier: this.SPEED_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Jump Boost II
    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, {
        amplifier: this.JUMP_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Absorption III
    const absorption = player.getEffect('absorption');
    if (!absorption || absorption.amplifier !== 2 || absorption.duration < 200) {
      player.addEffect('absorption', this.EFFECT_DURATION, {
        amplifier: 2,
        showParticles: false
      });
    }
    
    // Resistance II
    const resistance = player.getEffect('resistance');
    if (!resistance || resistance.amplifier !== 1 || resistance.duration < 200) {
      player.addEffect('resistance', this.EFFECT_DURATION, {
        amplifier: 1,
        showParticles: false
      });
    }
    
    // Haste II
    const haste = player.getEffect('haste');
    if (!haste || haste.amplifier !== 1 || haste.duration < 200) {
      player.addEffect('haste', this.EFFECT_DURATION, {
        amplifier: 1,
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
   * Apply weapon enchantments
   */
  static applyWeaponEnchantments(player) {
    const inventory = player.getComponent('minecraft:inventory');
    if (!inventory || !inventory.container) return;
    
    const heldSlot = player.selectedSlotIndex;
    const heldItem = inventory.container.getItem(heldSlot);
    
    if (!heldItem) return;
    
    const weaponTypes = [
      'minecraft:wooden_sword', 'minecraft:stone_sword', 'minecraft:iron_sword',
      'minecraft:golden_sword', 'minecraft:diamond_sword', 'minecraft:netherite_sword',
      'minecraft:wooden_axe', 'minecraft:stone_axe', 'minecraft:iron_axe',
      'minecraft:golden_axe', 'minecraft:diamond_axe', 'minecraft:netherite_axe',
      'minecraft:trident'
    ];
    
    if (weaponTypes.includes(heldItem.typeId)) {
      try {
        const enchantments = heldItem.getComponent('minecraft:enchantable');
        if (enchantments) {
          // Sharpness II
          const currentSharpness = enchantments.getEnchantment('sharpness');
          if (!currentSharpness || currentSharpness.level < 2) {
            enchantments.addEnchantment({ type: 'sharpness', level: 2 });
            inventory.container.setItem(heldSlot, heldItem);
          }
        }
      } catch (e) {
        // Enchantment failed
      }
    }
  }
  
  /**
   * Clean up effects
   */
  static removeEffects(player) {
    WarriorSequence.removeEffects(player);
    player.removeEffect('resistance');
    player.removeEffect('haste');
  }
}