// ============================================================================
// FISTS OF RAGE — lower-tier sealed item, iron/Folk-of-Rage-characteristic
// gloves with a kill-charged dash punch.
// ============================================================================
// Not pathway-gated — a mysticism-crafted item like Traveler Bracelet/Seven-
// Stone Bracelet, not a Focus-item ability. Charge state lives on the PLAYER
// as a dynamic property (same convention as travelerBraceletSystem.js's
// CHARGES_PROP), not the item instance.
//
// Every kill landed while lotm:fists_of_rage is the mainhand item banks 1
// charge (cap 3). The special ability, Raging Charge, is a dash-punch modeled
// directly on Judge's Death (justiciar/judge.js useDeath — same stepped-
// teleport charge + "first entity struck" detection): usable at any charge
// level, consuming 1 banked charge for full damage, or usable at 0 charge
// for reduced damage (per user's explicit "possible to use it earlier but at
// reduced damage" spec).
//
// MAIN.JS WIRING:
//   import { FistsOfRageSystem } from './items/fistsOfRageSystem.js';
//   itemUse: lotm:fists_of_rage -> FistsOfRageSystem.useRagingCharge(player);
//   entityDie: killer holding lotm:fists_of_rage -> FistsOfRageSystem.onKill(killer);
//   per-player tick loop -> FistsOfRageSystem.tick(player);
//   playerLeave -> FistsOfRageSystem.cleanup(player);
// ============================================================================
import { system } from '@minecraft/server';

const ITEM_ID = 'lotm:fists_of_rage';

export class FistsOfRageSystem {
  static ITEM_ID = ITEM_ID;

  static MAX_CHARGE = 3;
  static CHARGE_PROP = 'lotm:fists_of_rage_charge';

  static DASH_COOLDOWN_TICKS = 200; // 10s
  static DASH_RANGE = 3;            // blocks charged — shorter than Judge's Death's 4
  static DASH_DAMAGE_BASE = 8;      // used early, at 0 banked charge
  static DASH_DAMAGE_CHARGED = 16;  // used consuming 1 banked kill charge

  static cooldowns = new Map(); // player.name -> ticks remaining

  // ── Kill charge ────────────────────────────────────────────────────────
  static getCharge(player) {
    try {
      const v = player.getDynamicProperty(this.CHARGE_PROP);
      return typeof v === 'number' ? v : 0;
    } catch (_) { return 0; }
  }

  static setCharge(player, value) {
    const clamped = Math.max(0, Math.min(this.MAX_CHARGE, value));
    try { player.setDynamicProperty(this.CHARGE_PROP, clamped); } catch (_) {}
    return clamped;
  }

  // Called from main.js's entityDie handler once per confirmed kill made
  // while holding this weapon.
  static onKill(player) {
    const charge = this.getCharge(player);
    if (charge >= this.MAX_CHARGE) return;
    this.setCharge(player, charge + 1);
    player.sendMessage(`§6Fists of Rage §7— charge gained (${charge + 1}/${this.MAX_CHARGE})`);
    try { player.playSound('random.orb', { pitch: 1.4, volume: 0.5 }); } catch (_) {}
  }

  static _isHolding(player) {
    try {
      const inv = player.getComponent('minecraft:inventory');
      const held = inv?.container?.getItem(player.selectedSlotIndex);
      return held?.typeId === ITEM_ID;
    } catch (_) { return false; }
  }

  // ── Special ability: Raging Charge ────────────────────────────────────
  static useRagingCharge(player) {
    const cd = this.cooldowns.get(player.name) || 0;
    if (cd > 0) {
      player.sendMessage(`§cRaging Charge on cooldown — §e${Math.ceil(cd / 20)}s`);
      return false;
    }

    const charge = this.getCharge(player);
    const charged = charge > 0;
    const damage = charged ? this.DASH_DAMAGE_CHARGED : this.DASH_DAMAGE_BASE;
    if (charged) this.setCharge(player, charge - 1);

    const dir   = player.getViewDirection();
    const start = { x: player.location.x, y: player.location.y, z: player.location.z };
    let   hit   = null;

    player.sendMessage(charged
      ? '§6Fists of Rage §7— §cRAGING CHARGE!'
      : '§6Fists of Rage §7— §7charging (reduced, no banked kill)...');

    let step = 0;
    const doStep = () => {
      if (step >= this.DASH_RANGE * 2) { // 0.5-block steps
        if (!hit) player.sendMessage('§7No target struck');
        return;
      }
      step++;
      const dist = step * 0.5;
      const newPos = {
        x: start.x + dir.x * dist,
        y: start.y,
        z: start.z + dir.z * dist,
      };

      if (!hit) {
        try {
          const nearby = player.dimension.getEntities({
            location: newPos, maxDistance: 1.5,
            excludeTypes: ['minecraft:player'],
          });
          for (const e of nearby) {
            if (e.isValid()) { hit = e; break; }
          }
        } catch (_) {}
      }

      try { player.dimension.spawnParticle('minecraft:critical_hit_emitter', newPos); } catch (_) {}
      try { player.teleport(newPos); } catch (_) {}

      if (hit) {
        try {
          hit.applyDamage(damage, { damagingEntity: player });
          hit.addEffect('slowness', 60, { amplifier: 1, showParticles: false });
          if (charged) hit.addEffect('nausea', 40, { amplifier: 0, showParticles: true });
        } catch (_) {}
        player.sendMessage(`§6👊 §eTarget struck — ${damage} damage!`);
        return;
      }

      system.runTimeout(doStep, 1);
    };

    system.runTimeout(doStep, 1);
    this.cooldowns.set(player.name, this.DASH_COOLDOWN_TICKS);
    return true;
  }

  // ── Per-player tick (cooldowns + action bar) ──────────────────────────
  static tick(player) {
    const cd = this.cooldowns.get(player.name) || 0;
    if (cd > 0) this.cooldowns.set(player.name, cd - 1);

    if (this._isHolding(player)) this._updateActionBar(player);
  }

  static _updateActionBar(player) {
    const charge = this.getCharge(player);
    const pips = '§6' + '★'.repeat(charge) + '§8' + '☆'.repeat(this.MAX_CHARGE - charge);
    const cd = this.cooldowns.get(player.name) || 0;
    const status = cd > 0 ? `§7cooling: ${Math.ceil(cd / 20)}s` : '§aREADY';
    try {
      player.onScreenDisplay.setActionBar(`§6Fists of Rage §7— ${pips} §7| ${status}`);
    } catch (_) {}
  }

  static cleanup(player) {
    this.cooldowns.delete(player.name);
  }
}
