// ============================================================================
// WISP SYSTEM — Spirit Medium companion wisps
// ============================================================================
// Three wisp types once bonded:
//   Wisp 1 — Proximity warning (blue/yellow/red particle colour)
//   Wisp 2 — Ore/resource detection (flies toward nearest ore)
//   Wisp 3 — Player/beyonder/rampager detection
//
// MAIN.JS ADDITIONS:
//   import { WispSystem } from './world/wispSystem.js';
//
//   In world.afterEvents.playerInteractWithEntity.subscribe:
//     if (entity.typeId === 'lotm:wisp') {
//       WispSystem.onInteract(player, entity);
//       return;
//     }
//
//   In runInterval tick loop:
//     WispSystem.tick(player);
// ============================================================================
import { world, system } from '@minecraft/server';
export class WispSystem {

  static MAX_WISPS = 60;

  // Wisp role assigned by bond order
  static WISP_ROLES = {
    0: 'proximity',  // First bonded — danger proximity
    1: 'detection',  // Second bonded — ore detection
    2: 'beyonder',   // Third bonded — player/beyonder/rampager detection
  };

  // Dynamic property keys
  static BONDED_WISPS_PROP = 'lotm:bonded_wisps'; // JSON array of entity IDs

  // Ore types for detection wisp
  static ORE_TYPES = [
    'minecraft:diamond_ore', 'minecraft:deepslate_diamond_ore',
    'minecraft:emerald_ore', 'minecraft:deepslate_emerald_ore',
    'minecraft:gold_ore',    'minecraft:deepslate_gold_ore',
    'minecraft:iron_ore',    'minecraft:deepslate_iron_ore',
    'minecraft:ancient_debris',
  ];

  // Tick counters
  static tickCounters = new Map(); // playerName -> tick

  // ── Player interacts with wild wisp ───────────────────────────────────────
  static onBond(player, wispEntity) {
    let pathway;
    try { pathway = player.getDynamicProperty('lotm:pathway'); } catch (_) {}
 
    if (!pathway) {
      player.sendMessage('§8You must be a Beyonder to bond with a wisp.');
      // Undo the tame — kill and respawn wild (or just warn for now)
      return;
    }
 
    // Check max wisps
    const bonded = this._getBondedWisps(player);
    if (bonded.length >= this.MAX_WISPS) {
      player.sendMessage(`§8You already have ${this.MAX_WISPS} bonded wisps.`);
      // Could kill the wisp here to prevent over-bonding
      return;
    }
 
    // Assign role and save
    const bondIndex = bonded.length;
    const role = this.WISP_ROLES[bondIndex];
 
    try { wispEntity.setDynamicProperty('lotm:wisp_owner', player.name); } catch (_) {}
    try { wispEntity.setDynamicProperty('lotm:wisp_role',  role); } catch (_) {}
    try { wispEntity.addTag(`owner:${player.name}`); } catch (_) {}
    system.runTimeout(() => {
      try { wispEntity.nameTag = `§b${player.name}'s Wisp`; } catch (_) {}
    }, 5);
 
    bonded.push({ id: wispEntity.id, role });
    this._saveBondedWisps(player, bonded);
 
    const roleNames = {
      proximity: '§7Proximity Sense',
      detection: '§7Ore Detection',
      beyonder:  '§7Beyonder Sense'
    };
 
    player.sendMessage(`§b✦ WISP BONDED ✦`);
    player.sendMessage(`§8Role: ${roleNames[role] ?? role}`);
    player.sendMessage(`§8(${bonded.length}/${this.MAX_WISPS} wisps bonded)`);
    player.playSound('mob.bat.hurt', { pitch: 1.8, volume: 0.6 });
 
    const loc = wispEntity.location;
    for (let i = 0; i < 12; i++) {
      const a = (i/12)*Math.PI*2;
      try { player.dimension.spawnParticle('minecraft:endrod', {
        x: loc.x+Math.cos(a)*0.5, y: loc.y+0.2, z: loc.z+Math.sin(a)*0.5
      }); } catch (_) {}
    }
  }

  // ── Main tick — called each interval for each player ─────────────────────
  static tick(player) {
    const t = (this.tickCounters.get(player.name) || 0) + 1;
    this.tickCounters.set(player.name, t);

    // Run wisp logic every 20 ticks (1 second)
    if (t % 20 !== 0) return;

    const bonded = this._getBondedWisps(player);
    if (bonded.length === 0) return;

    for (const bond of bonded) {
      const wisp = this._findWispById(player, bond.id);
      if (!wisp) continue;

      switch (bond.role) {
        case 'proximity': this._tickProximityWisp(player, wisp); break;
        case 'detection': this._tickDetectionWisp(player, wisp); break;
        case 'beyonder':  this._tickBeyonderWisp(player, wisp);  break;
      }
    }
  }

  // ── WISP 1: Proximity sense ───────────────────────────────────────────────
  static _tickProximityWisp(player, wisp) {
    const TIER1 = 6, TIER2 = 16, TIER3 = 32;
    let nearestDist = Infinity;

    try {
      const hostiles = player.dimension.getEntities({
        location: player.location, maxDistance: TIER3,
        excludeTypes: ['minecraft:item','minecraft:xp_orb','minecraft:player',
                       'lotm:wisp','lotm:ghost','lotm:chair_seat']
      });
      for (const e of hostiles) {
        if (!this._isHostile(e)) continue;
        const dx = e.location.x-player.location.x;
        const dy = e.location.y-player.location.y;
        const dz = e.location.z-player.location.z;
        const d  = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if (d < nearestDist) nearestDist = d;
      }
    } catch (_) {}

    // Colour: blue=safe, yellow=nearby, red=danger
    if (nearestDist <= TIER1) {
      // Red — danger close
      try { player.dimension.spawnParticle('minecraft:basic_flame_particle',
        { x: wisp.location.x, y: wisp.location.y+0.1, z: wisp.location.z }); } catch (_) {}
      if (nearestDist <= 4)
        player.sendMessage('§c☉ WISP: Danger close!');
    } else if (nearestDist <= TIER2) {
      // Yellow — hostile nearby
      try { player.dimension.spawnParticle('minecraft:totem_particle',
        { x: wisp.location.x, y: wisp.location.y+0.1, z: wisp.location.z }); } catch (_) {}
    } else if (nearestDist <= TIER3) {
      // Blue — distant hostile
      try { player.dimension.spawnParticle('minecraft:endrod',
        { x: wisp.location.x, y: wisp.location.y+0.1, z: wisp.location.z }); } catch (_) {}
    }
    // No particle = safe (wisp is dim/invisible)
  }

  // ── WISP 2: Ore detection ─────────────────────────────────────────────────
  static _tickDetectionWisp(player, wisp) {
    const RANGE = 20;
    const ploc  = player.location;
    const bx    = Math.floor(ploc.x), by = Math.floor(ploc.y), bz = Math.floor(ploc.z);

    let nearest = null, nearestDist = Infinity;

    // Scan a 20-block cube for ores
    for (let x = -RANGE; x <= RANGE; x += 2) {
      for (let y = -RANGE; y <= RANGE; y += 2) {
        for (let z = -RANGE; z <= RANGE; z += 2) {
          try {
            const block = player.dimension.getBlock({ x: bx+x, y: by+y, z: bz+z });
            if (!block) continue;
            if (!this.ORE_TYPES.includes(block.typeId)) continue;
            const d = Math.sqrt(x*x+y*y+z*z);
            if (d < nearestDist) {
              nearestDist = d;
              nearest = { x: bx+x, y: by+y, z: bz+z, type: block.typeId };
            }
          } catch (_) {}
        }
      }
    }

    if (!nearest) {
      // No ore nearby — calm blue pulse
      try { player.dimension.spawnParticle('minecraft:endrod',
        { x: wisp.location.x, y: wisp.location.y+0.1, z: wisp.location.z }); } catch (_) {}
      return;
    }

    // Ore found — gold/orange pulse + fly toward it
    try { player.dimension.spawnParticle('minecraft:totem_particle',
      { x: wisp.location.x, y: wisp.location.y+0.1, z: wisp.location.z }); } catch (_) {}
    try { player.dimension.spawnParticle('minecraft:critical_hit_emitter',
      { x: wisp.location.x, y: wisp.location.y, z: wisp.location.z }); } catch (_) {}

    // Nudge wisp toward the ore
    // try {
    //   wisp.teleport({
    //     x: wisp.location.x + (nearest.x - wisp.location.x) * 0.15,
    //     y: wisp.location.y + (nearest.y - wisp.location.y) * 0.15,
    //     z: wisp.location.z + (nearest.z - wisp.location.z) * 0.15
    //   }, { dimension: player.dimension });
    // } catch (_) {}

    // Notify every 5 seconds
    if ((this.tickCounters.get(player.name) || 0) % 100 === 0) {
      const oreName = nearest.type.replace('minecraft:', '').replace(/_/g, ' ');
      player.sendMessage(`§6☉ WISP: ${oreName} nearby (~${Math.round(nearestDist)}m)`);
    }
  }

  // ── WISP 3: Beyonder/player/rampager detection ────────────────────────────
  static _tickBeyonderWisp(player, wisp) {
    const RANGE = 40;
    const beyonderTypes = [
      'lotm:rampager', 'lotm:voidwatcher', 'lotm:clown',
      'lotm:ghoul', 'lotm:vengeful_ghost', 'lotm:brownbear'
    ];

    let nearestBeyonder = null, nearestDist = Infinity;
    let nearestPlayer   = null, nearestPDist = Infinity;

    try {
      // Check for LOTM hostile mobs
      const entities = player.dimension.getEntities({
        location: player.location, maxDistance: RANGE,
        excludeTypes: ['minecraft:item','minecraft:xp_orb']
      });
      for (const e of entities) {
        if (e.id === player.id) continue;
        const dx = e.location.x-player.location.x;
        const dy = e.location.y-player.location.y;
        const dz = e.location.z-player.location.z;
        const d  = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if (beyonderTypes.some(t => e.typeId === t) && d < nearestDist) {
          nearestDist = d; nearestBeyonder = e;
        }
      }

      // Check for other players
      const players = player.dimension.getPlayers({ location: player.location, maxDistance: RANGE });
      for (const p of players) {
        if (p.id === player.id) continue;
        const dx = p.location.x-player.location.x;
        const dy = p.location.y-player.location.y;
        const dz = p.location.z-player.location.z;
        const d  = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if (d < nearestPDist) { nearestPDist = d; nearestPlayer = p; }
      }
    } catch (_) {}

    if (nearestBeyonder && nearestDist < nearestPDist) {
      // Red/purple — beyonder mob nearby
      try { player.dimension.spawnParticle('minecraft:soul_particle',
        { x: wisp.location.x, y: wisp.location.y+0.1, z: wisp.location.z }); } catch (_) {}
      try { player.dimension.spawnParticle('minecraft:basic_flame_particle',
        { x: wisp.location.x, y: wisp.location.y, z: wisp.location.z }); } catch (_) {}
      if ((this.tickCounters.get(player.name)||0) % 60 === 0)
        player.sendMessage(`§5☉ WISP: Beyonder entity ~${Math.round(nearestDist)}m`);
    } else if (nearestPlayer) {
      // White — another player nearby
      try { player.dimension.spawnParticle('minecraft:endrod',
        { x: wisp.location.x, y: wisp.location.y+0.1, z: wisp.location.z }); } catch (_) {}
      try { player.dimension.spawnParticle('minecraft:totem_particle',
        { x: wisp.location.x, y: wisp.location.y, z: wisp.location.z }); } catch (_) {}
      if ((this.tickCounters.get(player.name)||0) % 60 === 0)
        player.sendMessage(`§f☉ WISP: Player nearby ~${Math.round(nearestPDist)}m`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  static _isHostile(entity) {
    const hostileKeywords = ['zombie','skeleton','creeper','spider','enderman',
      'witch','phantom','pillager','vindicator','evoker','warden','blaze','ghast',
      'slime','magma_cube','hoglin','ravager','drowned','husk','stray','piglin',
      'vex','silverfish','shulker','guardian','lotm:ghoul','lotm:vengeful_ghost',
      'lotm:rampager','lotm:voidwatcher','lotm:clown','lotm:brownbear'];
    return hostileKeywords.some(k => entity.typeId.includes(k));
  }

  static _findWispById(player, entityId) {
    try {
      const entities = player.dimension.getEntities({
        location: player.location, maxDistance: 64, type: 'lotm:wisp'
      });
      return entities.find(e => e.id === entityId) ?? null;
    } catch (_) { return null; }
  }

  static _getBondedWisps(player) {
    try {
      const raw = player.getDynamicProperty(this.BONDED_WISPS_PROP);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (_) { return []; }
  }

  static _saveBondedWisps(player, bonded) {
    try { player.setDynamicProperty(this.BONDED_WISPS_PROP, JSON.stringify(bonded)); } catch (_) {}
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  static cleanup(playerName) {
    this.tickCounters.delete(playerName);
  }
}
