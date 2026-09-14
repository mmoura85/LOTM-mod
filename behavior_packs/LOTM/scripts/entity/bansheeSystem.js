// ============================================================================
// BANSHEE SYSTEM — Spirit Medium bonded swarm companions
// ============================================================================
// Bonding (lotm:spirit_channeler) records ownership, up to MAX_BANSHEES at
// once. Unlike the earth spirit (single manifestation), bonded banshees are
// summoned together as a swarm via lotm:banshee_charm — they hover around
// the player for a duration and fight autonomously via real vanilla AI
// (nearest_attackable_target + melee_attack, added via the lotm:enter_swarm
// event/lotm:swarm_combat component group — same recipe as lotm:spirit_wolf
// in scripts/sequences/death/spirit_medium.js), then despawn together.
//
// MAIN.JS WIRING:
//   import { BansheeSystem } from './entity/bansheeSystem.js';
//   per-player tick loop: BansheeSystem.tick(player);
//   playerInteractWithEntity: if (target.typeId === 'lotm:banshee') BansheeSystem.onInteract(player, target);
//   itemUse: lotm:banshee_charm -> BansheeSystem.summonChoir(player);
//   entityHitEntity: if (attacker?.typeId === 'lotm:banshee') BansheeSystem.onSwarmHit(attacker, victim);
//   playerLeave: BansheeSystem.cleanup(player);
// ============================================================================
import { system, EntityDamageCause } from '@minecraft/server';
import { PathwayManager } from '../core/pathwayManager.js';

export class BansheeSystem {

  static MAX_BANSHEES = 4;
  static BONDED_PROP = 'lotm:bonded_spirits';

  static SUMMON_DURATION_MS = 60000; // 60s manifestation
  static SUMMON_COOLDOWN_MS = 90000; // 90s cooldown after manifestation ends
  static SUMMON_RADIUS      = 2.5;

  static ATTACK_RANGE   = 10; // wild retaliation search range only — the swarm's own combat range is set on the BP behavior (within_radius 24)
  static ATTACK_DAMAGE  = 4;  // wild retaliation only — the swarm deals damage natively via minecraft:attack + melee_attack
  static RECENTER_INTERVAL_TICKS = 40; // 2s, throttles the swarm recenter check

  static RECENTER_DISTANCE = 28; // comfortably past the BP's own 24-block target-acquisition radius, so recenter doesn't yank a banshee back off a legitimate chase

  // Wild-banshee retaliation ("passive unless attacked") — mirrors
  // ClownBeyonderSystem's aggroMap/cooldownMap pattern (clownBeyonderSystem.js)
  static WILD_ATTACK_COOLDOWN_TICKS = 40; // ~2s between sonic retaliations

  // In-memory state (reset on reload — same convention as earthSpiritSystem.js)
  static activeChoirs   = new Map(); // playerId -> { entityIds: [...], startTime }
  static summonCooldown = new Map(); // playerId -> timestamp cooldown started
  static tickCounters   = new Map(); // playerName -> tick
  static wildAggro       = new Map(); // entityId -> true
  static wildCooldownMap = new Map(); // entityId -> ticks remaining

  // ── Called from main.js playerInteractWithEntity ─────────────────────────
  static onInteract(player, wildEntity) {
    let heldItem = null;
    try {
      const inv = player.getComponent('minecraft:inventory');
      heldItem = inv?.container?.getItem(player.selectedSlotIndex);
    } catch (_) {}

    if (!heldItem || heldItem.typeId !== 'lotm:spirit_channeler') {
      player.sendMessage('§8The banshee wails softly, watching you warily... (hold §7Spirit Channeler§8 to bond)');
      return;
    }

    this.onBond(player, wildEntity);
  }

  static onBond(player, wildEntity) {
    const pathway = PathwayManager.getPathway(player);
    if (!pathway) {
      player.sendMessage('§8You must be a Beyonder to bond with a banshee.');
      return;
    }

    const sequence = PathwayManager.getSequence(player);
    if (pathway !== PathwayManager.PATHWAYS.DEATH || sequence === -1 || sequence > 7) {
      player.sendMessage('§8This spirit will not answer to you — only a Death pathway Spirit Medium (Sequence 7 and beyond) can bond it.');
      return;
    }

    const bonded = this._getBondedSpirits(player);
    const bansheeCount = bonded.filter(b => b.type === 'banshee').length;
    if (bansheeCount >= this.MAX_BANSHEES) {
      player.sendMessage(`§8You already have the maximum of ${this.MAX_BANSHEES} bonded banshees.`);
      return;
    }

    bonded.push({ type: 'banshee', bondedAt: Date.now() });
    this._saveBondedSpirits(player, bonded);

    player.sendMessage(`§d✦ BANSHEE BONDED (${bansheeCount + 1}/${this.MAX_BANSHEES}) ✦`);
    player.sendMessage('§8It fades from sight, awaiting your call.');
    player.sendMessage('§8Use a §7Banshee Charm§8 to summon your bonded banshees to your side.');
    player.playSound('mob.bat.hurt', { pitch: 0.5, volume: 0.6 });

    const loc = wildEntity.location;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      try { player.dimension.spawnParticle('minecraft:totem_particle', {
        x: loc.x + Math.cos(a) * 0.5, y: loc.y + 0.2, z: loc.z + Math.sin(a) * 0.5
      }); } catch (_) {}
    }

    system.runTimeout(() => {
      try { wildEntity.triggerEvent('lotm:despawn'); } catch (_) {}
    }, 10);
  }

  static getBondedCount(player) {
    return this._getBondedSpirits(player).filter(b => b.type === 'banshee').length;
  }

  // ── Swarm summon ──────────────────────────────────────────────────────────
  static summonChoir(player) {
    const pathway  = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    if (pathway !== PathwayManager.PATHWAYS.DEATH || sequence === -1 || sequence > 7) {
      player.sendMessage('§8Only a Death pathway Spirit Medium (Sequence 7 and beyond) can wield this charm.');
      return false;
    }

    const bondedCount = this.getBondedCount(player);
    if (bondedCount <= 0) {
      player.sendMessage('§8You have no bonded banshees to summon.');
      return false;
    }

    const now = Date.now();
    const cdRemain = this.SUMMON_COOLDOWN_MS - (now - (this.summonCooldown.get(player.id) || 0));
    if (cdRemain > 0) {
      player.sendMessage(`§8Your banshees are still weakened (${(cdRemain / 1000).toFixed(0)}s)`);
      return false;
    }

    if (this.activeChoirs.has(player.id)) {
      player.sendMessage('§8Your banshees are already manifested.');
      return false;
    }

    const count = Math.min(bondedCount, this.MAX_BANSHEES);
    const loc = player.location;
    const entityIds = [];

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const spawnPos = {
        x: loc.x + Math.cos(a) * this.SUMMON_RADIUS,
        y: loc.y + 1,
        z: loc.z + Math.sin(a) * this.SUMMON_RADIUS
      };
      let banshee = null;
      try { banshee = player.dimension.spawnEntity('lotm:banshee', spawnPos); } catch (_) {}
      if (!banshee) continue;
      try { banshee.nameTag = ''; } catch (_) {}
      try { banshee.addTag(`owner:${player.name}`); } catch (_) {}
      try { banshee.triggerEvent('lotm:enter_swarm'); } catch (_) {}
      entityIds.push(banshee.id);

      for (let j = 0; j < 8; j++) {
        const pa = (j / 8) * Math.PI * 2;
        try { player.dimension.spawnParticle('minecraft:totem_particle', {
          x: spawnPos.x + Math.cos(pa) * 0.4, y: spawnPos.y + 0.4, z: spawnPos.z + Math.sin(pa) * 0.4
        }); } catch (_) {}
      }
    }

    if (entityIds.length === 0) return false;

    this.activeChoirs.set(player.id, { entityIds, startTime: now });

    player.sendMessage('§8The banshees rise, wailing at your call!');
    player.playSound('mob.wither.ambient', { pitch: 1.4, volume: 0.7 });

    return true;
  }

  static _endChoir(player, state) {
    for (const id of state.entityIds) {
      let e = null;
      try { e = player.dimension.getEntities({ location: player.location, maxDistance: 128 }).find(x => x.id === id); } catch (_) {}
      if (e) { try { e.triggerEvent('lotm:despawn'); } catch (_) {} }
    }
    this.activeChoirs.delete(player.id);
    this.summonCooldown.set(player.id, Date.now());
  }

  // ── Main tick — called each interval for each player ─────────────────────
  static tick(player) {
    const t = (this.tickCounters.get(player.name) || 0) + 1;
    this.tickCounters.set(player.name, t);

    const state = this.activeChoirs.get(player.id);
    if (!state) return;

    const expired = Date.now() - state.startTime >= this.SUMMON_DURATION_MS;
    if (expired) {
      this._endChoir(player, state);
      return;
    }

    let banshees = [];
    try {
      banshees = player.dimension.getEntities({ location: player.location, maxDistance: 96, type: 'lotm:banshee' })
        .filter(e => state.entityIds.includes(e.id));
    } catch (_) {}

    if (banshees.length === 0) {
      this._endChoir(player, state);
      return;
    }

    if (t % this.RECENTER_INTERVAL_TICKS !== 0) return;

    // Combat itself is handled by real AI (lotm:swarm_combat, added via
    // lotm:enter_swarm on summon) — this just keeps stragglers from chasing
    // prey too far, same recenter idiom _tickSpiritWolves uses in
    // spirit_medium.js (horizontal distance only, teleport back beside owner).
    const pLoc = player.location;
    for (const banshee of banshees) {
      if (!banshee.isValid()) continue;
      const bLoc = banshee.location;
      const dx = bLoc.x - pLoc.x, dz = bLoc.z - pLoc.z;
      if (Math.sqrt(dx * dx + dz * dz) > this.RECENTER_DISTANCE) {
        const angle = Math.random() * Math.PI * 2;
        try { banshee.teleport({
          x: pLoc.x + Math.cos(angle) * 2.2, y: pLoc.y + 1, z: pLoc.z + Math.sin(angle) * 2.2
        }); } catch (_) {}
      }
    }
  }

  // ── Called from main.js entityHitEntity — flavor only, no damage (vanilla
  // melee_attack + minecraft:attack already dealt it) ───────────────────────
  static onSwarmHit(banshee, victim) {
    if (banshee.typeId !== 'lotm:banshee') return;
    if (!this._isOwned(banshee)) return;
    this._sonicFlavor(banshee, victim);
  }

  // ── Wild-banshee retaliation ("passive unless attacked") ─────────────────
  // Mirrors ClownBeyonderSystem's aggroMap/cooldownMap pattern — ticked
  // globally (not per-player) from main.js's dimension-wide mob-AI loop,
  // since a wild banshee isn't tied to any one player.
  static _isOwned(entity) {
    try { return entity.getTags().some(t => t.startsWith('owner:')); } catch (_) { return false; }
  }

  static onHurt(entity, attacker) {
    if (entity.typeId !== 'lotm:banshee') return;
    if (!attacker) return;
    if (this._isOwned(entity)) return; // summoned/tamed banshees are never "wild" — swarm attack logic covers them instead
    this.wildAggro.set(entity.id, true);
  }

  static tickWild(banshee) {
    if (!this.wildAggro.get(banshee.id)) return;
    if (this._isOwned(banshee)) return; // safety net in case a banshee gets tagged after being flagged wild

    const cd = (this.wildCooldownMap.get(banshee.id) || 0) - 1;
    this.wildCooldownMap.set(banshee.id, Math.max(0, cd));
    if (cd > 0) return;

    let target = null, nearestDist = this.ATTACK_RANGE;
    try {
      const bLoc = banshee.location;
      const players = banshee.dimension.getPlayers({ location: bLoc, maxDistance: this.ATTACK_RANGE });
      for (const p of players) {
        const pLoc = p.location;
        const d = Math.sqrt((pLoc.x - bLoc.x) ** 2 + (pLoc.y - bLoc.y) ** 2 + (pLoc.z - bLoc.z) ** 2);
        if (d < nearestDist) { target = p; nearestDist = d; }
      }
    } catch (_) {}
    if (!target) return;

    this.wildCooldownMap.set(banshee.id, this.WILD_ATTACK_COOLDOWN_TICKS);
    this._sonicStrike(banshee, target);
  }

  static onWildDefeated(entityId) {
    this.wildAggro.delete(entityId);
    this.wildCooldownMap.delete(entityId);
  }

  // ── Wild-retaliation attack: deals damage itself (no melee AI backing it),
  // then the shared particle/sound flavor. Swarm hits use _sonicFlavor alone
  // since vanilla melee_attack + minecraft:attack already dealt the damage.
  static _sonicStrike(banshee, target) {
    try { target.applyDamage(this.ATTACK_DAMAGE, { cause: EntityDamageCause.entityAttack, damagingEntity: banshee }); } catch (_) {}
    this._sonicFlavor(banshee, target);
  }

  static _sonicFlavor(banshee, target) {
    try { banshee.playSound('mob.warden.sonic_boom', { pitch: 1.6, volume: 0.5 }); } catch (_) {}

    const bLoc = banshee.location;
    const tLoc = target.location;
    const steps = 6;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      try { banshee.dimension.spawnParticle('minecraft:sonic_explosion', {
        x: bLoc.x + (tLoc.x - bLoc.x) * f,
        y: bLoc.y + 0.5 + (tLoc.y - bLoc.y) * f,
        z: bLoc.z + (tLoc.z - bLoc.z) * f
      }); } catch (_) {}
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  static _getBondedSpirits(player) {
    try {
      const raw = player.getDynamicProperty(this.BONDED_PROP);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (_) { return []; }
  }

  static _saveBondedSpirits(player, bonded) {
    try { player.setDynamicProperty(this.BONDED_PROP, JSON.stringify(bonded)); } catch (_) {}
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  static cleanup(player) {
    this.tickCounters.delete(player.name);
    this.summonCooldown.delete(player.id);
    this.activeChoirs.delete(player.id);
  }
}
