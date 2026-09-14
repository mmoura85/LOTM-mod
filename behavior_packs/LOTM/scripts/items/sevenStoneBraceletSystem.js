// ============================================================================
// SEVEN-STONE BRACELET — grants the Apprentice's Door Opening ability
// ============================================================================
// Not pathway-gated — a mysticism-crafted item, not a Focus-item ability.
// Reuses ApprenticeSequence.performDoorOpening (door/apprentice.js), the
// ungated core of the real Door pathway ability, rather than a bespoke
// no-clip wall-phase mechanic (no precedent in this codebase, much riskier).
// Downside: random unsettling sounds while actively held.
//
// MAIN.JS WIRING:
//   import { SevenStoneBraceletSystem } from './items/sevenStoneBraceletSystem.js';
//   per-player tick loop: SevenStoneBraceletSystem.tick(player);
//   itemUse: lotm:seven_stone_bracelet -> SevenStoneBraceletSystem.useBracelet(player);
//   playerLeave: SevenStoneBraceletSystem.cleanup(player);
// ============================================================================
import { ApprenticeSequence } from '../sequences/door/apprentice.js';

const SOUND_CHECK_INTERVAL_TICKS = 100; // 5s
const SOUND_CHANCE = 0.15;
const SOUNDS = ['ambient.cave', 'mob.enderman.stare', 'mob.wither.ambient'];

export class SevenStoneBraceletSystem {

  static tickCounters = new Map(); // playerName -> tick

  static useBracelet(player) {
    return ApprenticeSequence.performDoorOpening(player);
  }

  static tick(player) {
    let held = null;
    try {
      const inv = player.getComponent('minecraft:inventory');
      held = inv?.container?.getItem(player.selectedSlotIndex) ?? null;
    } catch (_) {}

    if (held?.typeId !== 'lotm:seven_stone_bracelet') {
      this.tickCounters.delete(player.name);
      return;
    }

    const t = (this.tickCounters.get(player.name) || 0) + 1;
    this.tickCounters.set(player.name, t);
    if (t % SOUND_CHECK_INTERVAL_TICKS !== 0) return;

    if (Math.random() < SOUND_CHANCE) {
      const sound = SOUNDS[Math.floor(Math.random() * SOUNDS.length)];
      try { player.playSound(sound, { pitch: 0.6 + Math.random() * 0.4, volume: 0.4 }); } catch (_) {}
    }
  }

  static cleanup(player) {
    this.tickCounters.delete(player.name);
  }
}
