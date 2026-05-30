// ============================================
// SPIRIT MEDIUM - SEQUENCE 7 DEATH PATHWAY
// ============================================
// Initial version — enhanced passives + spirit increase on advancement.
// Abilities will be added once the spirit mobs are built.
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { GravediggerSequence }    from './gravedigger.js';
import { CorpseCollectorSequence } from './corpse_collector.js';

export class SpiritMediumSequence {
  static SEQUENCE_NUMBER = 7;
  static PATHWAY = 'death';

  static EFFECT_DURATION = 999999;

  // ── Enhanced stats over Gravedigger ──────────────────────────────────────
  static SPEED_AMPLIFIER    = 2;  // Speed III
  static STRENGTH_AMPLIFIER = 2;  // Strength III
  static JUMP_AMPLIFIER     = 1;  // Jump Boost II
  static HEALTH_BONUS_HP    = 4;  // +2 hearts (health_boost amp 0)

  // ── Spirit increase on awakening ─────────────────────────────────────────
  // Called once from main.js when the seq7 potion is consumed
  static SPIRIT_INCREASE = 100;

  // ── Cooldown maps (placeholder for future abilities) ─────────────────────
  static abilityCooldowns = new Map(); // playerName -> ticks

  // ── SEQUENCE CHECK ────────────────────────────────────────────────────────
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // ── PASSIVE ABILITIES ─────────────────────────────────────────────────────
  static applyPassiveAbilities(player) {
    // Speed III
    const speed = player.getEffect('speed');
    if (!speed || speed.amplifier !== this.SPEED_AMPLIFIER || speed.duration < 200)
      player.addEffect('speed', this.EFFECT_DURATION, { amplifier: this.SPEED_AMPLIFIER, showParticles: false });

    // Strength III
    const strength = player.getEffect('strength');
    if (!strength || strength.amplifier !== this.STRENGTH_AMPLIFIER || strength.duration < 200)
      player.addEffect('strength', this.EFFECT_DURATION, { amplifier: this.STRENGTH_AMPLIFIER, showParticles: false });

    // Jump Boost II
    const jump = player.getEffect('jump_boost');
    if (!jump || jump.amplifier !== this.JUMP_AMPLIFIER || jump.duration < 200)
      player.addEffect('jump_boost', this.EFFECT_DURATION, { amplifier: this.JUMP_AMPLIFIER, showParticles: false });

    // Night Vision
    const nv = player.getEffect('night_vision');
    if (!nv || nv.duration < 200)
      player.addEffect('night_vision', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });

    // Saturation — no hunger
    const sat = player.getEffect('saturation');
    if (!sat || sat.duration < 200)
      player.addEffect('saturation', 400, { amplifier: 0, showParticles: false });

    // Fire Resistance — decay/cold immunity
    const fire = player.getEffect('fire_resistance');
    if (!fire || fire.duration < 200)
      player.addEffect('fire_resistance', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });

    // Resistance I
    const res = player.getEffect('resistance');
    if (!res || res.amplifier !== 0 || res.duration < 200)
      player.addEffect('resistance', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });

    // Health Boost — +2 hearts
    const hb = player.getEffect('health_boost');
    if (!hb || hb.amplifier !== 0 || hb.duration < 200)
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });

    // Undead passive — inherited from Corpse Collector via Gravedigger
    try { CorpseCollectorSequence.makeUndeadPassive(player); } catch (_) {}

    // Tick cooldowns
    this._tickCooldowns(player);

    // Display
    const spirit    = Math.floor(SpiritSystem.getSpirit(player));
    const maxSpirit = SpiritSystem.getMaxSpirit(player);
    player.onScreenDisplay.setActionBar(
      `§8Spirit: §f${spirit}§7/§f${maxSpirit}  §7│  §8Spirit Medium`
    );
  }

  // ── CALLED ONCE when seq7 potion consumed ─────────────────────────────────
  // Add this call in main.js itemCompleteUse where death_potion_seq7 is handled
  static onAwaken(player) {
    const currentMax = SpiritSystem.getMaxSpirit(player);
    SpiritSystem.setMaxSpirit(player, currentMax + this.SPIRIT_INCREASE);
    player.sendMessage('§8§l☽ SPIRIT MEDIUM ☽');
    player.sendMessage(`§7Your connection to the spirit world deepens...`);
    player.sendMessage(`§8Max Spirit increased by §f${this.SPIRIT_INCREASE}§8 (now §f${currentMax + this.SPIRIT_INCREASE}§8)`);
    player.playSound('mob.wither.spawn', { pitch: 1.5, volume: 0.8 });

    // Awakening particle burst — grey/white soul particles
    const loc = player.location;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = 0.8 + Math.random() * 0.6;
      try { player.dimension.spawnParticle('minecraft:soul_particle', {
        x: loc.x + Math.cos(a) * r,
        y: loc.y + 0.5 + Math.random() * 1.5,
        z: loc.z + Math.sin(a) * r
      }); } catch (_) {}
    }
  }

  // ── COOLDOWN TICK ─────────────────────────────────────────────────────────
  static _tickCooldowns(player) {
    const cd = this.abilityCooldowns.get(player.name) || 0;
    if (cd > 0) this.abilityCooldowns.set(player.name, cd - 1);
  }

  // ── ABILITY HANDLER (placeholder — abilities added when mobs are built) ───
  static handleAbilityUse(player, abilityId) {
    player.sendMessage('§8Abilities unlocked as your bond with the spirit world grows...');
    return false;
  }

  static getAllAbilities() {
    return []; // populated when abilities are added
  }

  // ── CLEANUP ───────────────────────────────────────────────────────────────
  static removeEffects(player) {
    GravediggerSequence.removeEffects(player);
    this.abilityCooldowns.delete(player.name);
  }
}
