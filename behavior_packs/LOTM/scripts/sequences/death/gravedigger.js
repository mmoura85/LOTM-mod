// ============================================
// GRAVEDIGGER - SEQUENCE 8 DEATH PATHWAY
// Simplified: shades use wolf-style owner AI
// Whistle: sneak=cycle stay/follow, click=summon/dismiss
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { CorpseCollectorSequence } from './corpse_collector.js';

export class GravediggerSequence {
  static SEQUENCE_NUMBER = 8;
  static PATHWAY = 'death';

  static EFFECT_DURATION = 999999;
  static SPEED_AMPLIFIER    = 1;
  static STRENGTH_AMPLIFIER = 2;
  static JUMP_AMPLIFIER     = 1;

  static MAX_SHADES         = 3;
  static SUMMON_SPIRIT_COST = 30;
  static SUMMON_COOLDOWN    = 400; // 20s between summons

  // Runtime
  static activeShades    = new Map(); // playerName -> [entityId, ...]
  static summonCooldowns = new Map(); // playerName -> ticks remaining
  static shadeStaying    = new Map(); // playerName -> boolean

  // ── SEQUENCE CHECK ──────────────────────────────────────────────────────
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // ── PASSIVE ABILITIES ───────────────────────────────────────────────────
  static applyPassiveAbilities(player) {
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200)
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: this.SPEED_AMPLIFIER, showParticles: false });

    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200)
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: this.STRENGTH_AMPLIFIER, showParticles: false });

    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200)
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: this.JUMP_AMPLIFIER, showParticles: false });

    const nv = player.getEffect('night_vision');
    if (!nv || nv.duration < 200)
      player.addEffect('night_vision', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });

    const sat = player.getEffect('saturation');
    if (!sat || sat.duration < 200)
      player.addEffect('saturation', 400, { amplifier: 0, showParticles: false });

    const fire = player.getEffect('fire_resistance');
    if (!fire || fire.duration < 200)
      player.addEffect('fire_resistance', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });

    const res = player.getEffect('resistance');
    if (!res || res.amplifier !== 0 || res.duration < 200)
      player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });

    const hb = player.getEffect('health_boost');
    if (!hb || hb.amplifier !== 3 || hb.duration < 200)
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier: 3, showParticles: false });

    // Tick summon cooldown
    const cd = this.summonCooldowns.get(player.name) || 0;
    if (cd > 0) this.summonCooldowns.set(player.name, cd - 1);

    CorpseCollectorSequence.applyNightVision(player);
  }

  // ── WHISTLE HANDLER ─────────────────────────────────────────────────────
  static handleWhistle(player, isSneaking) {
    if (isSneaking) {
      // Sneak + click: toggle stay / follow for all active shades
      this.toggleStayFollow(player);
    } else {
      // Click: summon a new shade (or show status if at max)
      this.summonShade(player);
    }
  }

  // ── STAY / FOLLOW TOGGLE ────────────────────────────────────────────────
  static toggleStayFollow(player) {
    const shades = this.getAliveShades(player);
    if (shades.length === 0) {
      player.sendMessage('§7No active shades to command.');
      return;
    }

    const currentlyStaying = this.shadeStaying.get(player.name) || false;
    const newStay = !currentlyStaying;
    this.shadeStaying.set(player.name, newStay);

    for (const shade of shades) {
      try {
        shade.triggerEvent(newStay ? 'lotm:set_stay' : 'lotm:set_follow');
      } catch(e) {}
    }

    if (newStay) {
      player.sendMessage(`§8${shades.length} shade(s) told to §7stay§8.`);
    } else {
      player.sendMessage(`§8${shades.length} shade(s) now §7following§8.`);
    }
    player.playSound('random.click', { pitch: newStay ? 0.8 : 1.2, volume: 0.6 });
  }

  // ── SUMMON ──────────────────────────────────────────────────────────────
  static summonShade(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }

    const alive = this.getAliveShades(player);

    if (alive.length >= this.MAX_SHADES) {
      player.sendMessage(
        `§8You have §e${alive.length}§8/§e${this.MAX_SHADES}§8 shades active.\n` +
        `§7Sneak + click to toggle §8Stay§7/§8Follow§7.`
      );
      return false;
    }

    const cd = this.summonCooldowns.get(player.name) || 0;
    if (cd > 0) {
      player.sendMessage(`§cSummon on cooldown: §e${Math.ceil(cd / 20)}s`);
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.SUMMON_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.SUMMON_SPIRIT_COST}`);
      return false;
    }

    const dir = player.getViewDirection();
    const spawnLoc = {
      x: player.location.x + dir.x * 2,
      y: player.location.y + 1,
      z: player.location.z + dir.z * 2
    };

    try {
      const shade = player.dimension.spawnEntity('lotm:shade', spawnLoc);

      // Set owner via tag so owner_hurt behaviours fire correctly
      // Bedrock doesn't have a script API to set owner directly,
      // but spawning with summon and the owner behaviors in entity JSON
      // means the shade will treat whoever it was summoned near as owner.
      // We tag it so we can find it later.
      shade.addTag(`owner_${player.name}`);

      // Make it tamed to the player using runCommand
      try {
        shade.runCommand(`event entity @s lotm:on_tamed`);
      } catch(e) {}

      // Start in follow mode
      shade.triggerEvent('lotm:set_follow');

      // Track by ID
      const ids = this.getShadeIds(player);
      ids.push(shade.id);
      this.activeShades.set(player.name, ids);
      this.summonCooldowns.set(player.name, this.SUMMON_COOLDOWN);

      // Spawn particles
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        try {
          player.dimension.spawnParticle('minecraft:soul_particle', {
            x: spawnLoc.x + Math.cos(a),
            y: spawnLoc.y + 0.5,
            z: spawnLoc.z + Math.sin(a)
          });
        } catch(pe) {}
      }

      const newCount = alive.length + 1;
      player.sendMessage(
        `§8Shade summoned! §7(${newCount}/${this.MAX_SHADES})\n` +
        `§7It will follow you and attack anything that harms you.\n` +
        `§7Sneak + whistle to toggle §8Stay§7/§8Follow§7.`
      );
      player.playSound('mob.wither.spawn', { pitch: 1.6, volume: 0.4 });
      return true;

    } catch (e) {
      SpiritSystem.restoreSpirit(player, this.SUMMON_SPIRIT_COST);
      player.sendMessage('§cFailed to summon shade!');
      return false;
    }
  }

  // ── DISMISS ALL ─────────────────────────────────────────────────────────
  // Called from a separate dismiss item or sneak+long-hold if you want one
  static dismissAllShades(player) {
    const shades = this.getAliveShades(player);
    if (shades.length === 0) {
      player.sendMessage('§7No active shades.');
      return false;
    }

    let dismissed = 0;
    for (const shade of shades) {
      try {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          try {
            player.dimension.spawnParticle('minecraft:soul_particle', {
              x: shade.location.x + Math.cos(a),
              y: shade.location.y + 0.5,
              z: shade.location.z + Math.sin(a)
            });
          } catch(pe) {}
        }
        shade.kill();
        dismissed++;
      } catch(e) {}
    }

    this.activeShades.set(player.name, []);
    this.shadeStaying.set(player.name, false);
    player.sendMessage(`§8${dismissed} shade(s) dismissed.`);
    player.playSound('ambient.cave', { pitch: 0.8, volume: 0.6 });
    return true;
  }

  // ── HELPERS ─────────────────────────────────────────────────────────────

  static getShadeIds(player) {
    return [...(this.activeShades.get(player.name) || [])];
  }

  static getAliveShades(player) {
    const ids = this.getShadeIds(player);
    if (ids.length === 0) return [];

    let candidates = [];
    try {
      candidates = player.dimension.getEntities({
        type: 'lotm:shade',
        location: player.location,
        maxDistance: 128
      });
    } catch(e) { return []; }

    const alive    = [];
    const aliveIds = [];
    for (const id of ids) {
      const shade = candidates.find(e => e.id === id);
      if (shade && shade.isValid()) {
        alive.push(shade);
        aliveIds.push(id);
      }
    }
    // Prune dead ids
    this.activeShades.set(player.name, aliveIds);
    return alive;
  }

  static removeEffects(player) {
    CorpseCollectorSequence.removeEffects(player);
    this.activeShades.delete(player.name);
    this.summonCooldowns.delete(player.name);
    this.shadeStaying.delete(player.name);
  }
}
