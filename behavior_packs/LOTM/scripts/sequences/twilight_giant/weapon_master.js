import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { PugilistSequence } from './pugilist.js';

export class WeaponMasterSequence {
  static SEQUENCE_NUMBER = 7;
  static PATHWAY = 'twilight_giant';
  
  // Enhanced passive abilities
  static EFFECT_DURATION = 999999;
  static STRENGTH_AMPLIFIER = 3; // Strength IV
  static SPEED_AMPLIFIER = 2; // Speed III (when sprinting)
  static SPEED_NORMAL = 1; // Speed II (when not sprinting)
  static JUMP_AMPLIFIER = 2; // Jump Boost III
  
  /**
   * Check if player has this sequence
   */
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }
  
  /**
   * Apply passive abilities
   */
  static applyPassiveAbilities(player) {
    // if (!this.hasSequence(player)) return;
    
    // Enhanced physical abilities with sprint detection
    this.applyPhysicalEnhancements(player);
    
    // Health bonus (+3 hearts)
    this.applyHealthBonus(player, 6);
    
    // Apply weapon enchantments
    this.applyWeaponEnchantments(player);
    
    // Apply armor enchantments
    this.applyArmorEnchantments(player);
  }
  
  /**
   * Apply enhanced physical abilities
   */
  static applyPhysicalEnhancements(player) {
    // Strength IV
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, {
        amplifier: this.STRENGTH_AMPLIFIER,
        showParticles: false
      });
    }
    
    // Speed - III when sprinting, II when not
    const isSprinting = player.isSprinting;
    const speedLevel = isSprinting ? this.SPEED_AMPLIFIER : this.SPEED_NORMAL;
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== speedLevel || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, {
        amplifier: speedLevel,
        showParticles: false
      });
    }
    
    // Jump Boost III
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
    
    // Resistance III
    const resistance = player.getEffect('resistance');
    if (!resistance || resistance.amplifier !== 2 || resistance.duration < 200) {
      player.addEffect('resistance', this.EFFECT_DURATION, {
        amplifier: 2,
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
    
    // Fire Resistance
    const fireRes = player.getEffect('fire_resistance');
    if (!fireRes || fireRes.duration < 200) {
      player.addEffect('fire_resistance', this.EFFECT_DURATION, {
        amplifier: 0,
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
          // Sharpness III
          const currentSharpness = enchantments.getEnchantment('sharpness');
          if (!currentSharpness || currentSharpness.level < 3) {
            enchantments.addEnchantment({ type: 'sharpness', level: 3 });
          }
          
          // Knockback I
          const currentKnockback = enchantments.getEnchantment('knockback');
          if (!currentKnockback || currentKnockback.level < 1) {
            enchantments.addEnchantment({ type: 'knockback', level: 1 });
          }
          
          inventory.container.setItem(heldSlot, heldItem);
        }
      } catch (e) {
        // Enchantment failed
      }
    }
  }
  
  /**
   * Apply armor enchantments
   */
  static applyArmorEnchantments(player) {
    const inventory = player.getComponent('minecraft:inventory');
    if (!inventory || !inventory.container) return;
    
    // Apply to equipped armor
    const equipment = player.getComponent('minecraft:equippable');
    if (!equipment) return;
    
    const armorSlots = ['Head', 'Chest', 'Legs', 'Feet'];
    
    for (const slot of armorSlots) {
      try {
        const armorItem = equipment.getEquipment(slot);
        if (!armorItem) continue;
        
        const enchantments = armorItem.getComponent('minecraft:enchantable');
        if (enchantments) {
          // Protection II
          const currentProtection = enchantments.getEnchantment('protection');
          if (!currentProtection || currentProtection.level < 2) {
            enchantments.addEnchantment({ type: 'protection', level: 2 });
          }
          
          // Fire Protection II
          const currentFireProt = enchantments.getEnchantment('fire_protection');
          if (!currentFireProt || currentFireProt.level < 2) {
            enchantments.addEnchantment({ type: 'fire_protection', level: 2 });
          }
          
          // Blast Protection II
          const currentBlastProt = enchantments.getEnchantment('blast_protection');
          if (!currentBlastProt || currentBlastProt.level < 2) {
            enchantments.addEnchantment({ type: 'blast_protection', level: 2 });
          }
          
          // Projectile Protection II
          const currentProjProt = enchantments.getEnchantment('projectile_protection');
          if (!currentProjProt || currentProjProt.level < 2) {
            enchantments.addEnchantment({ type: 'projectile_protection', level: 2 });
          }
          
          equipment.setEquipment(slot, armorItem);
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
    PugilistSequence.removeEffects(player);
    player.removeEffect('fire_resistance');
  }
}