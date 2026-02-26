// ============================================
// REVOLVER WEAPON SYSTEM
// ============================================
// Victorian-era revolver with bullet ammo system
// Higher damage than bow, hitscan projectile

import { world, system } from '@minecraft/server';

export class RevolverSystem {
  // Weapon stats
  static DAMAGE = 12; // 6 hearts (bow does ~9, crossbow does ~11)
  static RANGE = 50; // blocks
  static FIRE_RATE = 10; // ticks between shots (0.5 seconds)
  static DURABILITY_COST = 1; // durability per shot
  
  // Ammo tracking
  static lastShotTime = new Map(); // player name -> tick
  static reloadingPlayers = new Map(); // player name -> ticks remaining
  
  /**
   * Check if player has bullets in inventory
   */
  static hasBullets(player) {
    const inventory = player.getComponent('minecraft:inventory');
    if (!inventory || !inventory.container) return false;
    
    for (let i = 0; i < inventory.container.size; i++) {
      const item = inventory.container.getItem(i);
      if (item && item.typeId === 'lotm:bullet' && item.amount > 0) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Consume one bullet from inventory
   */
  static consumeBullet(player) {
    const inventory = player.getComponent('minecraft:inventory');
    if (!inventory || !inventory.container) return false;
    
    for (let i = 0; i < inventory.container.size; i++) {
      const item = inventory.container.getItem(i);
      if (item && item.typeId === 'lotm:bullet' && item.amount > 0) {
        if (item.amount === 1) {
          inventory.container.setItem(i, undefined);
        } else {
          item.amount--;
          inventory.container.setItem(i, item);
        }
        return true;
      }
    }
    return false;
  }
  
  /**
   * Check if player can shoot (cooldown check)
   */
  static canShoot(player) {
    const lastShot = this.lastShotTime.get(player.name) || 0;
    const currentTick = system.getCurrentTick();
    return (currentTick - lastShot) >= this.FIRE_RATE;
  }
  
  /**
   * Fire the revolver
   */
  static fireRevolver(player) {
    // Check cooldown
    if (!this.canShoot(player)) {
      return false;
    }
    
    // Check for bullets
    if (!this.hasBullets(player)) {
      player.sendMessage('§cOut of ammo! Craft bullets: Iron Nugget + Gunpowder');
      player.playSound('block.barrel.close', { pitch: 1.0, volume: 0.5 });
      return false;
    }
    
    // Consume bullet
    if (!this.consumeBullet(player)) {
      player.sendMessage('§cFailed to load bullet!');
      return false;
    }
    
    // Perform raycast to find hit target
    const hitResult = this.performRaycast(player);
    
    // Visual and audio effects
    this.spawnMuzzleFlash(player);
    player.playSound('random.explode', { pitch: 2.0, volume: 0.8 });
    
    // Apply damage if hit something
    if (hitResult.hit) {
      if (hitResult.entity) {
        this.damageEntity(player, hitResult.entity, hitResult.location);
      }
      
      // Bullet impact effects
      this.spawnImpactEffects(player.dimension, hitResult.location);
    }
    
    // Damage revolver durability
    this.damageRevolver(player);
    
    // Set cooldown
    this.lastShotTime.set(player.name, system.getCurrentTick());
    
    // Show bullet tracer
    this.spawnBulletTracer(player, hitResult.location);
    
    return true;
  }
  
  /**
   * Perform hitscan raycast
   */
  static performRaycast(player) {
    const viewDirection = player.getViewDirection();
    const eyeLoc = player.getHeadLocation();
    
    // Check along ray for entities
    for (let i = 1; i <= this.RANGE; i++) {
      const checkLoc = {
        x: eyeLoc.x + viewDirection.x * i,
        y: eyeLoc.y + viewDirection.y * i,
        z: eyeLoc.z + viewDirection.z * i
      };
      
      // Check for entities
      try {
        const entities = player.dimension.getEntities({
          location: checkLoc,
          maxDistance: 1.5,
          excludeNames: [player.name]
        });
        
        for (const entity of entities) {
          // Skip non-damageable entities
          if (entity.typeId === 'minecraft:item' || 
              entity.typeId === 'minecraft:xp_orb') {
            continue;
          }
          
          return {
            hit: true,
            entity: entity,
            location: checkLoc,
            distance: i
          };
        }
      } catch (e) {
        // getEntities failed
      }
      
      // Check for blocks
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
  }
  
  /**
   * Damage the hit entity
   */
  static damageEntity(shooter, target, hitLocation) {
    try {
      // Calculate damage with slight randomness
      const baseDamage = this.DAMAGE;
      const variance = Math.random() * 2 - 1; // -1 to +1
      const finalDamage = Math.max(1, baseDamage + variance);
      
      // Apply damage
      target.applyDamage(finalDamage, {
        cause: 'projectile',
        damagingEntity: shooter
      });
      
      // Hit sound
      target.dimension.playSound('random.hurt', {
        location: hitLocation,
        pitch: 1.0,
        volume: 0.8
      });
      
      // Blood particle
      target.dimension.spawnParticle('minecraft:critical_hit_emitter', hitLocation);
      
    } catch (e) {
      // Damage failed - entity might be invulnerable
    }
  }
  
  /**
   * Spawn muzzle flash at gun barrel
   */
  static spawnMuzzleFlash(player) {
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
      
      player.dimension.spawnParticle('minecraft:basic_flame_particle', {
        x: barrelLoc.x + Math.cos(angle) * radius,
        y: barrelLoc.y,
        z: barrelLoc.z + Math.sin(angle) * radius
      });
    }
    
    // Smoke puff
    for (let i = 0; i < 5; i++) {
      player.dimension.spawnParticle('minecraft:large_smoke', barrelLoc);
    }
  }
  
  /**
   * Spawn bullet impact effects
   */
  static spawnImpactEffects(dimension, location) {
    // Impact spark particles
    for (let i = 0; i < 10; i++) {
      dimension.spawnParticle('minecraft:lava_particle', location);
    }
    
    // Dust cloud
    for (let i = 0; i < 5; i++) {
      dimension.spawnParticle('minecraft:large_smoke', location);
    }
    
    // Impact sound
    dimension.playSound('dig.stone', {
      location: location,
      pitch: 1.5,
      volume: 0.6
    });
  }
  
  /**
   * Spawn bullet tracer (visual line from gun to hit)
   */
  static spawnBulletTracer(player, endLocation) {
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
    const steps = Math.min(Math.floor(distance), 30); // Max 30 particles
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const particleLoc = {
        x: startLoc.x + dx * t,
        y: startLoc.y + dy * t,
        z: startLoc.z + dz * t
      };
      
      // Delayed spawn for tracer effect
      system.runTimeout(() => {
        player.dimension.spawnParticle('minecraft:critical_hit_emitter', particleLoc);
      }, i);
    }
  }
  
  /**
   * Damage the revolver
   */
  static damageRevolver(player) {
    const inventory = player.getComponent('minecraft:inventory');
    if (!inventory || !inventory.container) return;
    
    const heldSlot = player.selectedSlotIndex;
    const revolver = inventory.container.getItem(heldSlot);
    
    if (!revolver || revolver.typeId !== 'lotm:revolver') return;
    
    try {
      const durability = revolver.getComponent('minecraft:durability');
      if (durability) {
        durability.damage += this.DURABILITY_COST;
        
        // Check if broken
        if (durability.damage >= durability.maxDurability) {
          // Break the revolver
          inventory.container.setItem(heldSlot, undefined);
          player.playSound('random.break', { pitch: 1.0, volume: 1.0 });
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
  }
}

// ============================================
// INTEGRATION WITH MAIN.JS
// ============================================

/*
Add to main.js in the itemUse event:

if (itemId === 'lotm:revolver') {
  RevolverSystem.fireRevolver(player);
  return;
}

Add to the tick system to show ammo count:

// Show ammo count for revolver holders
const inventory = player.getComponent('minecraft:inventory');
if (inventory && inventory.container) {
  const heldItem = inventory.container.getItem(player.selectedSlotIndex);
  if (heldItem && heldItem.typeId === 'lotm:revolver') {
    const ammo = RevolverSystem.getAmmoCount(player);
    player.onScreenDisplay.setActionBar(`§7Ammo: §f${ammo} §7bullets`);
  }
}
*/
