// ============================================
// REVOLVER WEAPON SYSTEM - IMPROVED HIT DETECTION
// ============================================
// Victorian-era revolver with bullet ammo system
// Higher damage than bow, hitscan projectile

import { world, system } from '@minecraft/server';

export class RevolverSystem {
  // Weapon stats
  static DAMAGE = 14; // 6 hearts (bow does ~9, crossbow does ~11)
  static RANGE = 50; // blocks
  static FIRE_RATE = 10; // ticks between shots (0.5 seconds)
  static DURABILITY_COST = 1; // durability per shot
  
  // Ammo tracking
  static lastShotTime = new Map(); // player name -> tick
  static currentTick = 0; // Manual tick counter
  static COPPER_DAMAGE = 10; // §6Copper Bullet§r — cheaper, lower damage
  
  /**
   * Initialize the tick counter (call this from main.js on load)
   */
  static initialize() {
    system.runInterval(() => {
      this.currentTick++;
    }, 1);
  }
  
  /**
   * Check if player has bullets in inventory
   */
  static hasBullets(player) {
    try {
      const inventory = player.getComponent('minecraft:inventory');
      if (!inventory || !inventory.container) return false;

      for (let i = 0; i < inventory.container.size; i++) {
        const item = inventory.container.getItem(i);
        if (!item || item.amount <= 0) continue;
        if (item.typeId === 'lotm:bullet' || item.typeId === 'lotm:copper_bullet') {
          return true;
        }
      }
    } catch (e) {}
    return false;
  }
  
  /**
   * Consume one bullet from inventory
   */
  // Returns the typeId of the bullet consumed, or null on failure.
// Standard bullets are always preferred over copper.

  static consumeBullet(player) {
    try {
      const inventory = player.getComponent('minecraft:inventory');
      if (!inventory || !inventory.container) return null;

      // First pass — prefer standard bullets
      for (let i = 0; i < inventory.container.size; i++) {
        const item = inventory.container.getItem(i);
        if (item && item.typeId === 'lotm:bullet' && item.amount > 0) {
          const consumed = item.typeId;
          if (item.amount === 1) {
            inventory.container.setItem(i, undefined);
          } else {
            item.amount--;
            inventory.container.setItem(i, item);
          }
          return consumed;
        }
      }

      // Second pass — fall back to copper bullets
      for (let i = 0; i < inventory.container.size; i++) {
        const item = inventory.container.getItem(i);
        if (item && item.typeId === 'lotm:copper_bullet' && item.amount > 0) {
          const consumed = item.typeId;
          if (item.amount === 1) {
            inventory.container.setItem(i, undefined);
          } else {
            item.amount--;
            inventory.container.setItem(i, item);
          }
          return consumed;
        }
      }
    } catch (e) {}
    return null;
  }
  
  /**
   * Check if player can shoot (cooldown check)
   */
  static canShoot(player) {
    const lastShot = this.lastShotTime.get(player.name) || 0;
    return (this.currentTick - lastShot) >= this.FIRE_RATE;
  }
  
  /**
   * Fire the revolver
   */
  static fireRevolver(player) {
    try {
      if (!this.canShoot(player)) return false;

      if (!this.hasBullets(player)) {
        player.sendMessage('§cOut of ammo! Craft §7Bullets§c (Iron Nugget + Gunpowder) or §6Copper Bullets§c (Copper Ingot + Gunpowder)');
        try { player.playSound('block.barrel.close', { pitch: 1.0, volume: 0.5 }); } catch (e) {}
        return false;
      }

      // Consume bullet and record which type was loaded
      const bulletType = this.consumeBullet(player);
      if (!bulletType) {
        player.sendMessage('§cFailed to load bullet!');
        return false;
      }

      // Damage is determined by bullet type
      const isCopperBullet = bulletType === 'lotm:copper_bullet';
      const bulletDamage   = isCopperBullet ? this.COPPER_DAMAGE : this.DAMAGE;

      // Perform raycast
      const hitResult = this.performRaycast(player);

      // Muzzle flash + sound
      this.spawnMuzzleFlash(player);
      try {
        // Copper bullets sound slightly different — a drier, lighter crack
        player.playSound('random.explode', {
          pitch: isCopperBullet ? 2.3 : 2.0,
          volume: isCopperBullet ? 0.65 : 0.8
        });
      } catch (e) {}

      // Apply damage if hit
      if (hitResult.hit) {
        if (hitResult.entity) {
          this.damageEntity(player, hitResult.entity, hitResult.location, bulletDamage);
        }
        this.spawnImpactEffects(player.dimension, hitResult.location);
      }

      this.damageRevolver(player);
      this.lastShotTime.set(player.name, this.currentTick);
      this.spawnBulletTracer(player, hitResult.location);

      return true;
    } catch (e) {
      player.sendMessage('§cRevolver error: ' + e);
      return false;
    }
  }
  
  /**
   * Perform hitscan raycast - IMPROVED VERSION
   */
  static performRaycast(player) {
    try {
      const viewDirection = player.getViewDirection();
      const eyeLoc = player.getHeadLocation();
      
      let closestEntity = null;
      let closestDistance = this.RANGE + 1;
      let closestLocation = null;
      
      // FIRST: Check for entities in the entire path
      // Use larger radius to catch entities better
      try {
        const allEntities = player.dimension.getEntities({
          location: eyeLoc,
          maxDistance: this.RANGE,
          excludeNames: [player.name]
        });
        
        for (const entity of allEntities) {
          // Skip non-damageable entities
          if (entity.typeId === 'minecraft:item' || 
              entity.typeId === 'minecraft:xp_orb' ||
              entity.typeId === 'minecraft:arrow' ||
              entity.typeId === 'minecraft:painting' ||
              entity.typeId === 'minecraft:armor_stand') {
            continue;
          }
          
          // Calculate if entity is in line of fire
          const entityLoc = entity.location;
          const toEntity = {
            x: entityLoc.x - eyeLoc.x,
            y: entityLoc.y - eyeLoc.y + 1, // Aim at center of entity
            z: entityLoc.z - eyeLoc.z
          };
          
          const distance = Math.sqrt(toEntity.x * toEntity.x + toEntity.y * toEntity.y + toEntity.z * toEntity.z);
          
          // Normalize direction to entity
          const dirToEntity = {
            x: toEntity.x / distance,
            y: toEntity.y / distance,
            z: toEntity.z / distance
          };
          
          // Calculate dot product (how aligned is entity with view direction)
          const dot = viewDirection.x * dirToEntity.x + 
                      viewDirection.y * dirToEntity.y + 
                      viewDirection.z * dirToEntity.z;
          
          // If entity is roughly in line of fire (dot > 0.95 means within ~18 degrees)
          if (dot > 0.95 && distance < closestDistance) {
            closestEntity = entity;
            closestDistance = distance;
            closestLocation = entityLoc;
          }
        }
      } catch (e) {
        // Entity search failed
      }
      
      // If we found an entity, return it
      if (closestEntity) {
        return {
          hit: true,
          entity: closestEntity,
          location: closestLocation,
          distance: closestDistance
        };
      }
      
      // SECOND: Check for blocks if no entity hit
      for (let i = 1; i <= this.RANGE; i += 0.5) {
        const checkLoc = {
          x: eyeLoc.x + viewDirection.x * i,
          y: eyeLoc.y + viewDirection.y * i,
          z: eyeLoc.z + viewDirection.z * i
        };
        
        try {
          const block = player.dimension.getBlock({
            x: Math.floor(checkLoc.x),
            y: Math.floor(checkLoc.y),
            z: Math.floor(checkLoc.z)
          });
          
          if (block && !block.isAir && !block.isLiquid) {
            return {
              hit: true,
              entity: null,
              location: checkLoc,
              distance: i
            };
          }
        } catch (e) {
          // getBlock failed
        }
      }
      
      // Missed - bullet travels max range
      return {
        hit: false,
        entity: null,
        location: {
          x: eyeLoc.x + viewDirection.x * this.RANGE,
          y: eyeLoc.y + viewDirection.y * this.RANGE,
          z: eyeLoc.z + viewDirection.z * this.RANGE
        },
        distance: this.RANGE
      };
    } catch (e) {
      // Raycast failed completely
      return {
        hit: false,
        entity: null,
        location: player.location,
        distance: 0
      };
    }
  }
  
  /**
 * Damage the hit entity - WITH PATHWAY BUFFS
 */
  static damageEntity(shooter, target, hitLocation, overrideDamage = null) {
    try {
      let pathway = null;
      let sequence = 10;
      try {
        pathway = PathwayManager.getPathway(shooter);
        sequence = PathwayManager.getSequence(shooter);
      } catch (e) {}

      // Use override (from bullet type) if provided, otherwise class default
      const baseDamage = overrideDamage !== null ? overrideDamage : this.DAMAGE;
      const variance   = Math.random() * 2 - 1;

      let multiplier = 1.0;
      if (pathway === 'darkness' || pathway === 'twilight_giant') {
        multiplier = RangedWeaponBuffs.getDamageMultiplier(pathway, sequence);
      }

      const finalDamage = Math.max(1, Math.floor((baseDamage + variance) * multiplier));

      let success = false;
      try {
        success = target.applyDamage(finalDamage, { damagingEntity: shooter });
      } catch (e) {
        success = target.applyDamage(finalDamage);
      }

      if (pathway === 'darkness' || pathway === 'twilight_giant') {
        RangedWeaponBuffs.applyAfterShotEffects(shooter, pathway, sequence, target);
      }

      try { target.dimension.playSound('random.hurt', { location: hitLocation, pitch: 1.0, volume: 0.8 }); } catch (e) {}
      try { target.dimension.spawnParticle('minecraft:critical_hit_emitter', { x: hitLocation.x, y: hitLocation.y + 1, z: hitLocation.z }); } catch (e) {}

      return success;
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Spawn muzzle flash at gun barrel
   */
  static spawnMuzzleFlash(player) {
    try {
      const viewDirection = player.getViewDirection();
      const eyeLoc = player.getHeadLocation();
      
      // Calculate barrel position (in front of player)
      const barrelLoc = {
        x: eyeLoc.x + viewDirection.x * 1.5,
        y: eyeLoc.y + viewDirection.y * 1.5 - 0.2,
        z: eyeLoc.z + viewDirection.z * 1.5
      };
      
      // Muzzle flash particles
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const radius = 0.3;
        
        try {
          player.dimension.spawnParticle('minecraft:basic_flame_particle', {
            x: barrelLoc.x + Math.cos(angle) * radius,
            y: barrelLoc.y,
            z: barrelLoc.z + Math.sin(angle) * radius
          });
        } catch (e) {
          // Particle failed
        }
      }
      
      // Smoke puff
      for (let i = 0; i < 5; i++) {
        try {
          player.dimension.spawnParticle('minecraft:large_smoke', barrelLoc);
        } catch (e) {
          // Particle failed
        }
      }
    } catch (e) {
      // Muzzle flash failed
    }
  }
  
  /**
   * Spawn bullet impact effects
   */
  static spawnImpactEffects(dimension, location) {
    try {
      // Impact spark particles
      for (let i = 0; i < 10; i++) {
        try {
          dimension.spawnParticle('minecraft:lava_particle', location);
        } catch (e) {
          // Particle failed
        }
      }
      
      // Dust cloud
      for (let i = 0; i < 5; i++) {
        try {
          dimension.spawnParticle('minecraft:large_smoke', location);
        } catch (e) {
          // Particle failed
        }
      }
      
      // Impact sound
      try {
        dimension.playSound('dig.stone', {
          location: location,
          pitch: 1.5,
          volume: 0.6
        });
      } catch (e) {
        // Sound failed
      }
    } catch (e) {
      // Impact effects failed
    }
  }
  
  /**
   * Spawn bullet tracer (visual line from gun to hit)
   */
  static spawnBulletTracer(player, endLocation) {
    try {
      const eyeLoc = player.getHeadLocation();
      const viewDirection = player.getViewDirection();
      const startLoc = {
        x: eyeLoc.x + viewDirection.x * 1.5,
        y: eyeLoc.y + viewDirection.y * 1.5 - 0.2,
        z: eyeLoc.z + viewDirection.z * 1.5
      };
      
      // Calculate distance
      const dx = endLocation.x - startLoc.x;
      const dy = endLocation.y - startLoc.y;
      const dz = endLocation.z - startLoc.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      // Spawn particles along path
      const steps = Math.min(Math.floor(distance * 2), 50); // More particles for better visibility
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const particleLoc = {
          x: startLoc.x + dx * t,
          y: startLoc.y + dy * t,
          z: startLoc.z + dz * t
        };
        
        // Delayed spawn for tracer effect (faster)
        system.runTimeout(() => {
          try {
            player.dimension.spawnParticle('minecraft:critical_hit_emitter', particleLoc);
          } catch (e) {
            // Particle failed
          }
        }, Math.floor(i / 5)); // Spawn in groups
      }
    } catch (e) {
      // Tracer failed
    }
  }
  
  /**
   * Damage the revolver
   */
  static damageRevolver(player) {
    try {
      const inventory = player.getComponent('minecraft:inventory');
      if (!inventory || !inventory.container) return;
      
      const heldSlot = player.selectedSlotIndex;
      const revolver = inventory.container.getItem(heldSlot);
      
      if (!revolver || revolver.typeId !== 'lotm:revolver') return;
      
      const durability = revolver.getComponent('minecraft:durability');
      if (durability) {
        durability.damage += this.DURABILITY_COST;
        
        // Check if broken
        if (durability.damage >= durability.maxDurability) {
          // Break the revolver
          inventory.container.setItem(heldSlot, undefined);
          try {
            player.playSound('random.break', { pitch: 1.0, volume: 1.0 });
          } catch (e) {
            // Sound failed
          }
          player.sendMessage('§cYour revolver broke!');
        } else {
          // Update item
          inventory.container.setItem(heldSlot, revolver);
        }
      }
    } catch (e) {
      // Durability modification failed
    }
  }
  
  /**
   * Get ammo count display
   */
  static getAmmoCount(player) {
    try {
      const inventory = player.getComponent('minecraft:inventory');
      if (!inventory || !inventory.container) return 0;
      
      let count = 0;
      for (let i = 0; i < inventory.container.size; i++) {
        const item = inventory.container.getItem(i);
        if (item && item.typeId === 'lotm:bullet') {
          count += item.amount;
        }
      }
      return count;
    } catch (e) {
      return 0;
    }
  }
}

// Auto-initialize on import
RevolverSystem.initialize();