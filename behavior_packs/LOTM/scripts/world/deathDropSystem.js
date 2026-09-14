// ============================================================================
// DEATH DROP SYSTEM — gives Beyonder death real stakes even with keepInventory on
// ============================================================================
// On any death, a player with a pathway drops either a fresh copy of their
// current sequence's own characteristic, or a lotm:beyonder_soul (50/50) —
// spawned directly via script, so it happens regardless of the keepInventory
// gamerule. Non-Beyonder players (no pathway) are untouched.
// ============================================================================
import { ItemStack } from '@minecraft/server';
import { PathwayManager } from '../core/pathwayManager.js';

const SOUL_ID = 'lotm:beyonder_soul';
const SOUL_CHANCE = 0.5;

export class DeathDropSystem {
  static onPlayerDeath(player) {
    if (!PathwayManager.hasPathway(player)) return;

    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    if (sequence === -1) return;

    let dim = null, loc = null;
    try { dim = player.dimension; loc = player.location; } catch (_) { return; }
    if (!dim || !loc) return;

    const dropSoul = Math.random() < SOUL_CHANCE;
    const characteristicId = `lotm:${pathway}_characteristic_seq${sequence}`;
    const primaryId = dropSoul ? SOUL_ID : characteristicId;

    try {
      dim.spawnItem(new ItemStack(primaryId, 1), loc);
    } catch (_) {
      // Some pathway/sequence combos don't have a characteristic item defined
      // (gaps deeper in a few chains) — fall back to a soul instead of nothing.
      if (!dropSoul) {
        try { dim.spawnItem(new ItemStack(SOUL_ID, 1), loc); } catch (_) {}
      }
    }
  }
}
