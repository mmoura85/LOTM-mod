// ============================================
// SPIRIT MEDIUM - SEQUENCE 7 DEATH PATHWAY
// ============================================

import { system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { GravediggerSequence }    from './gravedigger.js';
import { CorpseCollectorSequence } from './corpse_collector.js';

const EFFECT_DURATION = 999999;

const WOLF_COST        = 30;
const WOLF_COOLDOWN_MS = 120000; // 2 minutes

const wolfCooldown  = new Map(); // playerId → timestamp
const lastWolfTick  = new Map(); // playerId → timestamp (throttle follow-check to 1/s)

export class SpiritMediumSequence {
  static SEQUENCE_NUMBER = 7;
  static PATHWAY = 'death';

  static SPEED_AMPLIFIER    = 2;
  static STRENGTH_AMPLIFIER = 2;
  static JUMP_AMPLIFIER     = 1;
  static SPIRIT_INCREASE    = 100;

  // ── SEQUENCE CHECK ────────────────────────────────────────────────────────
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // ── PASSIVE ABILITIES ─────────────────────────────────────────────────────
  static applyPassiveAbilities(player) {
    _applyEffect(player, 'speed',            this.SPEED_AMPLIFIER);
    _applyEffect(player, 'strength',         this.STRENGTH_AMPLIFIER);
    _applyEffect(player, 'jump_boost',       this.JUMP_AMPLIFIER);
    _applyEffect(player, 'night_vision',     0);
    _applyEffect(player, 'saturation',       0, 400);
    _applyEffect(player, 'fire_resistance',  0);
    _applyEffect(player, 'resistance',       0);
    _applyEffect(player, 'health_boost',     0);

    try { CorpseCollectorSequence.makeUndeadPassive(player); } catch (_) {}

    // Keep spirit wolves close — teleport any that wander >18 blocks back beside player
    const now = Date.now();
    if (now - (lastWolfTick.get(player.id) || 0) > 1000) {
      lastWolfTick.set(player.id, now);
      _tickSpiritWolves(player);
    }

    const spirit    = Math.floor(SpiritSystem.getSpirit(player));
    const maxSpirit = SpiritSystem.getMaxSpirit(player);
    const cdRemain  = Math.max(0, WOLF_COOLDOWN_MS - (now - (wolfCooldown.get(player.id) || 0)));
    const cdStr     = cdRemain > 0 ? `  §8(wolf ${(cdRemain/1000).toFixed(0)}s)` : '';
    player.onScreenDisplay.setActionBar(
      `§8Spirit: §f${spirit}§7/§f${maxSpirit}  §7│  §8Spirit Medium${cdStr}`
    );
  }

  // ── AWAKEN ────────────────────────────────────────────────────────────────
  static onAwaken(player) {
    const currentMax = SpiritSystem.getMaxSpirit(player);
    SpiritSystem.setMaxSpirit(player, currentMax + this.SPIRIT_INCREASE);
    player.sendMessage('§8§l☽ SPIRIT MEDIUM ☽');
    player.sendMessage(`§7Your connection to the spirit world deepens...`);
    player.sendMessage(`§8Max Spirit increased by §f${this.SPIRIT_INCREASE}§8 (now §f${currentMax + this.SPIRIT_INCREASE}§8)`);
    player.playSound('mob.wither.spawn', { pitch: 1.5, volume: 0.8 });

    const loc = player.location;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = 0.8 + Math.random() * 0.6;
      try { player.dimension.spawnParticle('minecraft:soul_particle', {
        x: loc.x + Math.cos(a) * r, y: loc.y + 0.5 + Math.random() * 1.5, z: loc.z + Math.sin(a) * r
      }); } catch (_) {}
    }
  }

  // ── ABILITY HANDLER ───────────────────────────────────────────────────────
  static handleAbilityUse(player, abilityId) {
    if (abilityId === 'summon_spirit_wolves') {
      return _summonSpiritWolves(player);
    }
    return false;
  }

  static getAllAbilities() {
    return ['summon_spirit_wolves'];
  }

  // ── CLEANUP ───────────────────────────────────────────────────────────────
  static removeEffects(player) {
    GravediggerSequence.removeEffects(player);
    wolfCooldown.delete(player.id);
    lastWolfTick.delete(player.id);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _applyEffect(player, effect, amplifier, duration = EFFECT_DURATION) {
  try {
    const e = player.getEffect(effect);
    if (!e || e.amplifier !== amplifier || e.duration < 200)
      player.addEffect(effect, duration, { amplifier, showParticles: false });
  } catch (_) {}
}

function _summonSpiritWolves(player) {
  const now = Date.now();
  const cdRemain = WOLF_COOLDOWN_MS - (now - (wolfCooldown.get(player.id) || 0));
  if (cdRemain > 0) {
    player.sendMessage(`§8Spirit wolves rest (${(cdRemain/1000).toFixed(0)}s)`);
    return false;
  }

  // Count currently active spirit wolves near this player
  let existing = 0;
  try {
    const found = player.dimension.getEntities({
      location: player.location, maxDistance: 60, type: 'lotm:spirit_wolf'
    });
    existing = found.length;
  } catch (_) {}

  if (existing >= 2) {
    player.sendMessage('§8Your spirit wolves already walk beside you.');
    return false;
  }

  const spirit = SpiritSystem.getSpirit(player);
  if (spirit < WOLF_COST) {
    player.sendMessage(`§cNot enough spirit (need ${WOLF_COST}, have ${Math.floor(spirit)})`);
    return false;
  }

  SpiritSystem.consumeSpirit(player, WOLF_COST);
  wolfCooldown.set(player.id, now);

  const view = player.getViewDirection();
  const loc  = player.location;
  const hLen = Math.sqrt(view.x * view.x + view.z * view.z) || 1;
  // Perpendicular left/right of player facing
  const rx = -view.z / hLen, rz = view.x / hLen;

  const toSpawn = 2 - existing;
  const offsets = [2.0, -2.0];

  for (let i = 0; i < toSpawn; i++) {
    const side = offsets[i] ?? offsets[0];
    const spawnPos = { x: loc.x + rx * side, y: loc.y, z: loc.z + rz * side };
    try {
      player.dimension.spawnEntity('lotm:spirit_wolf', spawnPos);
      // Soul particle burst at spawn
      for (let j = 0; j < 14; j++) {
        const a = (j / 14) * Math.PI * 2;
        try { player.dimension.spawnParticle('minecraft:soul_particle', {
          x: spawnPos.x + Math.cos(a) * 0.7,
          y: spawnPos.y + 0.5 + Math.random() * 1.2,
          z: spawnPos.z + Math.sin(a) * 0.7
        }); } catch (_) {}
      }
    } catch (_) {}
  }

  player.playSound('mob.wither.ambient', { pitch: 1.5, volume: 0.9 });
  player.sendMessage('§8Spirit wolves heed your call...');
  return true;
}

function _tickSpiritWolves(player) {
  try {
    const wolves = player.dimension.getEntities({
      location: player.location, maxDistance: 60, type: 'lotm:spirit_wolf'
    });
    if (wolves.length === 0) return;

    const loc = player.location;
    for (const wolf of wolves) {
      if (!wolf.isValid()) continue;
      const wl = wolf.location;
      const dx = wl.x - loc.x, dz = wl.z - loc.z;
      if (Math.sqrt(dx * dx + dz * dz) > 18) {
        // Teleport back beside player
        const angle = Math.random() * Math.PI * 2;
        try { wolf.teleport({
          x: loc.x + Math.cos(angle) * 2.2,
          y: loc.y,
          z: loc.z + Math.sin(angle) * 2.2
        }); } catch (_) {}
      }
    }
  } catch (_) {}
}
