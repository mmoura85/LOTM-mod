// ============================================
// RANGED WEAPON BUFFS FOR PATHWAYS
// ============================================
// Darkness Pathway: Stealth and precision bonuses
// Twilight Giant Pathway: Strength and power bonuses

import { world, system } from '@minecraft/server';

export class RangedWeaponBuffs {
  
  /**
   * Check if item is a ranged weapon
   */
  static isRangedWeapon(itemId) {
    return itemId === 'minecraft:bow' || 
           itemId === 'minecraft:crossbow' ||
           itemId === 'lotm:revolver';
  }
  
  /**
   * Apply Darkness pathway ranged buffs
   */
  static applyDarknessBuffs(player, sequence) {
    // Darkness pathway gets stealth and precision bonuses
    
    if (sequence <= 9 && sequence >= 8) {
      // Sequence 9-8: Assassin/Hunter - Basic precision
      // +10% damage with ranged weapons
      // Night vision while holding ranged weapon
      this.applyNightVision(player);
    }
    
    if (sequence <= 7) {
      // Sequence 7: Pyromaniac - Better aim
      // +15% damage
      // Night vision
      // Speed I while holding ranged weapon
      this.applyNightVision(player);
      try {
        player.addEffect('speed', 20, {
          amplifier: 0,
          showParticles: false
        });
      } catch (e) {
        // Effect failed
      }
    }
    
    if (sequence <= 6) {
      // Sequence 6: Conspirator - Enhanced stealth shooting
      // +20% damage
      // Night vision
      // Speed I
      // Invisibility for 2 seconds after shooting
      this.applyNightVision(player);
      try {
        player.addEffect('speed', 20, {
          amplifier: 0,
          showParticles: false
        });
      } catch (e) {
        // Effect failed
      }
    }
    
    if (sequence <= 5) {
      // Sequence 5: Reaper - Death from shadows
      // +25% damage
      // Night vision
      // Speed II
      // Weakness to targets hit
      this.applyNightVision(player);
      try {
        player.addEffect('speed', 20, {
          amplifier: 1,
          showParticles: false
        });
      } catch (e) {
        // Effect failed
      }
    }
    
    if (sequence <= 4) {
      // Sequence 4: Iron-blooded Knight - Perfect accuracy
      // +30% damage
      // Night vision
      // Speed II
      // No projectile drop (handled in projectile code)
      this.applyNightVision(player);
      try {
        player.addEffect('speed', 20, {
          amplifier: 1,
          showParticles: false
        });
      } catch (e) {
        // Effect failed
      }
    }
  }
  
  /**
   * Apply Twilight Giant ranged buffs
   */
  static applyTwilightGiantBuffs(player, sequence) {
    // Twilight Giant gets raw power and knockback bonuses
    // Starting from Sequence 7: Weapon Master
    
    if (sequence <= 7) {
      // Sequence 7: Weapon Master - Master of all weapons
      // +20% damage with ranged weapons
      // Strength I
      try {
        player.addEffect('strength', 20, {
          amplifier: 0,
          showParticles: false
        });
      } catch (e) {
        // Effect failed
      }
    }
    
    if (sequence <= 6) {
      // Sequence 6: Dawn Paladin - Holy warrior
      // +25% damage
      // Strength II
      // Regeneration I
      try {
        player.addEffect('strength', 20, {
          amplifier: 1,
          showParticles: false
        });
        player.addEffect('regeneration', 20, {
          amplifier: 0,
          showParticles: false
        });
      } catch (e) {
        // Effect failed
      }
    }
    
    if (sequence <= 5) {
      // Sequence 5: Guardian - Protector with overwhelming power
      // +30% damage
      // Strength II
      // Regeneration I
      // Resistance I
      // Extra knockback on hits
      try {
        player.addEffect('strength', 20, {
          amplifier: 1,
          showParticles: false
        });
        player.addEffect('regeneration', 20, {
          amplifier: 0,
          showParticles: false
        });
        player.addEffect('resistance', 20, {
          amplifier: 0,
          showParticles: false
        });
      } catch (e) {
        // Effect failed
      }
    }
    
    if (sequence <= 4) {
      // Sequence 4: Demon Hunter - Giant's devastating power
      // +35% damage
      // Strength III
      // Regeneration II
      // Resistance I
      // Massive knockback
      try {
        player.addEffect('strength', 20, {
          amplifier: 2,
          showParticles: false
        });
        player.addEffect('regeneration', 20, {
          amplifier: 1,
          showParticles: false
        });
        player.addEffect('resistance', 20, {
          amplifier: 0,
          showParticles: false
        });
      } catch (e) {
        // Effect failed
      }
    }
    
    if (sequence <= 3) {
      // Sequence 3+: Higher sequences - Unstoppable giant
      // +40% damage
      // Strength III
      // Regeneration II
      // Resistance II
      // Piercing shots (handled in projectile code)
      try {
        player.addEffect('strength', 20, {
          amplifier: 2,
          showParticles: false
        });
        player.addEffect('regeneration', 20, {
          amplifier: 1,
          showParticles: false
        });
        player.addEffect('resistance', 20, {
          amplifier: 1,
          showParticles: false
        });
      } catch (e) {
        // Effect failed
      }
    }
  }
  
  /**
   * Apply night vision effect
   */
  static applyNightVision(player) {
    try {
      player.addEffect('night_vision', 220, {
        amplifier: 0,
        showParticles: false
      });
    } catch (e) {
      // Effect failed
    }
  }
  
  /**
   * Get damage multiplier for pathway and sequence
   */
  static getDamageMultiplier(pathway, sequence) {
    if (pathway === 'darkness') {
      if (sequence === 9 || sequence === 8) return 1.10; // +10%
      if (sequence === 7) return 1.15; // +15%
      if (sequence === 6) return 1.20; // +20%
      if (sequence === 5) return 1.25; // +25%
      if (sequence <= 4) return 1.30; // +30%
    }
    
    if (pathway === 'twilight_giant') {
      if (sequence === 7) return 1.20; // +20% Weapon Master
      if (sequence === 6) return 1.25; // +25% Priest of Light
      if (sequence === 5) return 1.30; // +30% Solar High Priest
      if (sequence === 4) return 1.35; // +35% Unshadowed
      if (sequence <= 3) return 1.40; // +40% Dawn Knight and beyond
    }
    
    return 1.0; // No multiplier
  }
  
  /**
   * Apply special effects after shooting (call from revolver/bow code)
   */
  static applyAfterShotEffects(player, pathway, sequence, target) {
    try {
      if (pathway === 'darkness') {
        // Sequence 6+: Brief invisibility after shooting
        if (sequence <= 6) {
          player.addEffect('invisibility', 40, {
            amplifier: 0,
            showParticles: false
          });
        }
        
        // Sequence 5+: Apply weakness to target
        if (sequence <= 5 && target) {
          try {
            target.addEffect('weakness', 100, {
              amplifier: 0,
              showParticles: true
            });
          } catch (e) {
            // Target effect failed
          }
        }
      }
      
      if (pathway === 'twilight_giant') {
        // Sequence 5+: Apply extra knockback
        if (sequence <= 5 && target) {
          try {
            const player_loc = player.location;
            const target_loc = target.location;
            
            const dx = target_loc.x - player_loc.x;
            const dz = target_loc.z - player_loc.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance > 0) {
              // Stronger knockback at higher sequences
              let knockbackStrength = 1.5;
              if (sequence <= 4) knockbackStrength = 2.0;
              if (sequence <= 3) knockbackStrength = 2.5;
              
              target.applyKnockback(
                dx / distance,
                dz / distance,
                knockbackStrength,
                0.5
              );
            }
          } catch (e) {
            // Knockback failed
          }
        }
      }
    } catch (e) {
      // Effects failed
    }
  }
  
  /**
   * Check if projectile should pierce (for high sequences)
   */
  static shouldPierce(pathway, sequence) {
    if (pathway === 'twilight_giant' && sequence <= 3) {
      return true; // Twilight Giant Sequence 3+ pierces enemies
    }
    return false;
  }
  
  /**
   * Check if projectile should have no drop (perfect accuracy)
   */
  static shouldHaveNoDrop(pathway, sequence) {
    if (pathway === 'darkness' && sequence <= 4) {
      return true; // Darkness Sequence 4+ perfect aim
    }
    return false;
  }
}

// ============================================
// INTEGRATION WITH MAIN.JS TICK SYSTEM
// ============================================

/*
Add to your main.js tick loop:

// Apply ranged weapon buffs
const heldItem = inventory.container.getItem(player.selectedSlotIndex);
if (heldItem && RangedWeaponBuffs.isRangedWeapon(heldItem.typeId)) {
  const pathway = PathwayManager.getPathway(player);
  const sequence = PathwayManager.getSequence(player);
  
  if (pathway === 'darkness') {
    RangedWeaponBuffs.applyDarknessBuffs(player, sequence);
  } else if (pathway === 'sun') {
    RangedWeaponBuffs.applyTwilightGiantBuffs(player, sequence);
  }
}
*/

// ============================================
// INTEGRATION WITH REVOLVER SYSTEM
// ============================================

/*
In revolverSystem.js, modify the damageEntity function:

static damageEntity(shooter, target, hitLocation) {
  try {
    // Get pathway and sequence
    const pathway = PathwayManager.getPathway(shooter);
    const sequence = PathwayManager.getSequence(shooter);
    
    // Calculate base damage
    const baseDamage = this.DAMAGE;
    const variance = Math.random() * 2 - 1;
    
    // Apply pathway damage multiplier
    const multiplier = RangedWeaponBuffs.getDamageMultiplier(pathway, sequence);
    const finalDamage = Math.max(1, Math.floor((baseDamage + variance) * multiplier));
    
    // Apply damage
    let success = false;
    try {
      success = target.applyDamage(finalDamage, {
        damagingEntity: shooter
      });
    } catch (e) {
      success = target.applyDamage(finalDamage);
    }
    
    // Apply special effects
    RangedWeaponBuffs.applyAfterShotEffects(shooter, pathway, sequence, target);
    
    // ... rest of damage code
  } catch (e) {
    // Error handling
  }
}
*/
