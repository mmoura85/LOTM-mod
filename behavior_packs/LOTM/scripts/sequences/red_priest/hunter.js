import { PathwayManager } from '../../core/pathwayManager.js';

function isHostileEntity(entity) {
  try {
    // 'monster' covers vanilla hostiles + LOTM rampager/rimewraith/ogre/ghoul
    if (entity.matches({ families: ['monster'] })) return true;
    // 'undead' covers LOTM shade + vanilla undead not already caught by monster
    if (entity.matches({ families: ['undead'] })) return true;
    // 'rampager' family covers voidwatcher (shares family tag with rampager)
    if (entity.matches({ families: ['rampager'] })) return true;
  } catch (_) {}
  // Always-aggressive LOTM animals that don't use monster family
  if (entity.typeId === 'lotm:dire_wolf' || entity.typeId === 'lotm:dire_bear') return true;
  return false;
}

// Per-player scan timers (ms)
const lastScanTime = new Map();
const lastTrapScan  = new Map();
const SCAN_INTERVAL_MS      = 2000;
const TRAP_SCAN_INTERVAL_MS = 1000;
const SCAN_RADIUS = 16;
const TRAP_SCAN_RADIUS = 5;
const TRAP_BLOCK_IDS = ['lotm:spike_trap', 'lotm:wooden_spike_trap', 'lotm:bear_trap', 'lotm:fake_grass'];

export class HunterSequence {
  static SEQUENCE_NUMBER = 9;
  static PATHWAY = 'red_priest';

  static EFFECT_DURATION = 999999;
  static STRENGTH_AMPLIFIER = 1; // Strength II
  static SPEED_AMPLIFIER = 1;    // Speed II
  static JUMP_AMPLIFIER = 1;     // Jump Boost II

  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  static applyPassiveAbilities(player) {
    this.applyPhysicalEnhancements(player);
    this.applyHealthBonus(player, 2);
    this.applyDangerIntuition(player);
    this.applyTrapVisibility(player);
    this.applyNightVision(player);
  }

  static applyPhysicalEnhancements(player) {
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200) {
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: this.STRENGTH_AMPLIFIER, showParticles: false });
    }

    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200) {
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: this.SPEED_AMPLIFIER, showParticles: false });
    }

    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200) {
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: this.JUMP_AMPLIFIER, showParticles: false });
    }
  }

  static applyHealthBonus(player, bonusHearts) {
    const healthBoost = player.getEffect('health_boost');
    const amplifier = bonusHearts - 1;
    if (!healthBoost || healthBoost.amplifier !== amplifier || healthBoost.duration < 200) {
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier, showParticles: false });
    }
  }

  // Danger Intuition: green particle for neutral mobs, angry particle for hostile
  static applyDangerIntuition(player) {
    const now = Date.now();
    const last = lastScanTime.get(player.id) || 0;
    if (now - last < SCAN_INTERVAL_MS) return;
    lastScanTime.set(player.id, now);

    try {
      const nearby = player.dimension.getEntities({
        location: player.location,
        maxDistance: SCAN_RADIUS
      });

      for (const entity of nearby) {
        if (entity === player) continue;
        if (entity.typeId === 'minecraft:player') continue;

        const isHostile = isHostileEntity(entity);
        const particleId = isHostile ? 'minecraft:villager_angry' : 'minecraft:villager_happy';

        try {
          player.dimension.spawnParticle(particleId, {
            x: entity.location.x,
            y: entity.location.y + 2.5,
            z: entity.location.z
          });
        } catch (_) {}
      }
    } catch (_) {}
  }

  // Trap awareness — gold sparkles visible only near the Hunter
  static applyTrapVisibility(player) {
    const now = Date.now();
    const last = lastTrapScan.get(player.id) || 0;
    if (now - last < TRAP_SCAN_INTERVAL_MS) return;
    lastTrapScan.set(player.id, now);

    const { x: cx, y: cy, z: cz } = player.location;
    const fcx = Math.floor(cx), fcy = Math.floor(cy), fcz = Math.floor(cz);
    const r = TRAP_SCAN_RADIUS;

    for (let dx = -r; dx <= r; dx += 2) {
      for (let dz = -r; dz <= r; dz += 2) {
        for (let dy = -2; dy <= 2; dy++) {
          try {
            const block = player.dimension.getBlock({ x: fcx + dx, y: fcy + dy, z: fcz + dz });
            if (block && TRAP_BLOCK_IDS.includes(block.typeId)) {
              player.dimension.spawnParticle('minecraft:wax_on', {
                x: fcx + dx + 0.5,
                y: fcy + dy + 1.1,
                z: fcz + dz + 0.5
              });
            }
          } catch (_) {}
        }
      }
    }
  }

  static applyNightVision(player) {
    const nv = player.getEffect('night_vision');
    if (!nv || nv.duration < 200) {
      player.addEffect('night_vision', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }
  }

  static removeEffects(player) {
    player.removeEffect('strength');
    player.removeEffect('speed');
    player.removeEffect('jump_boost');
    player.removeEffect('health_boost');
    player.removeEffect('night_vision');
  }
}
