// ============================================================================
// CHAIR SYSTEM — rewritten using FlyingRock's proven ride pattern
// ============================================================================

import { world, system } from '@minecraft/server';

export class ChairSystem {

  static seated    = new Map(); // playerName -> { seatEntity, blockLocation }
  static pendingSit = new Map(); // playerName -> { blockLocation, attempts }

  // ── Player right-clicks a chair ───────────────────────────────────────────
  static onChairInteract(player, block) {
    // Already seated — ignore
    if (ChairSystem.seated.has(player.name)) return;
    // Already pending — ignore
    if (ChairSystem.pendingSit.has(player.name)) return;

    // Check nobody already sitting in this chair
    const blockLoc = block.location;
    for (const [, data] of ChairSystem.seated) {
      if (data.blockLocation.x === blockLoc.x &&
          data.blockLocation.y === blockLoc.y &&
          data.blockLocation.z === blockLoc.z) {
        player.sendMessage('§7This seat is already occupied.');
        return;
      }
    }

    // Spawn the seat entity at the seat surface (y + 0.5)
    const dim  = block.dimension;
    const sx   = blockLoc.x + 0.5;
    const sy   = blockLoc.y + 0.5;
    const sz   = blockLoc.z + 0.5;

    let seatEntity = null;
    try {
      seatEntity = dim.spawnEntity('lotm:chair_seat', { x: sx, y: sy, z: sz });
    } catch (e) {
      player.sendMessage('§cCould not place seat.');
      return;
    }

    if (!seatEntity) return;

    // Store pending sit — tick() will poll and mount when entity is ready
    ChairSystem.pendingSit.set(player.name, {
      seatEntity,
      blockLocation: blockLoc,
      attempts: 0
    });
  }

  // ── Main tick ─────────────────────────────────────────────────────────────
  static tick() {

    // ── Process pending mounts ──────────────────────────────────────────────
    for (const [playerName, pending] of ChairSystem.pendingSit) {
      pending.attempts++;

      // Give up after 40 attempts (~2s at 20tps)
      if (pending.attempts > 40) {
        try { pending.seatEntity.kill(); } catch (_) {}
        ChairSystem.pendingSit.delete(playerName);
        continue;
      }

      // Find the player
      let player = null;
      try { player = world.getPlayers({ name: playerName })[0] ?? null; } catch (_) {}
      if (!player) {
        try { pending.seatEntity.kill(); } catch (_) {}
        ChairSystem.pendingSit.delete(playerName);
        continue;
      }

      // Verify entity is alive
      let entityAlive = false;
      try { void pending.seatEntity.location; entityAlive = true; } catch (_) {}
      if (!entityAlive) {
        ChairSystem.pendingSit.delete(playerName);
        continue;
      }

      // Try mounting — same pattern as FlyingRock
      let mounted = false;
      try {
        player.runCommand('ride @s start_riding @e[type=lotm:chair_seat,r=2] teleport_rider nearest_surface');
        mounted = true;
      } catch (_) {}

      if (mounted) {
        ChairSystem.seated.set(playerName, {
          seatEntity: pending.seatEntity,
          blockLocation: pending.blockLocation
        });
        ChairSystem.pendingSit.delete(playerName);
        player.sendMessage('§7§o*You sit down. Sneak or jump to stand up.*');
      }
      // If not mounted yet, keep trying next tick
    }

    // ── Check seated players for stand-up conditions ────────────────────────
    for (const [playerName, data] of ChairSystem.seated) {

      // Entity still alive?
      let entityAlive = false;
      try { void data.seatEntity.location; entityAlive = true; } catch (_) {}
      if (!entityAlive) {
        ChairSystem.seated.delete(playerName);
        continue;
      }

      // Find player
      let player = null;
      try { player = world.getPlayers({ name: playerName })[0] ?? null; } catch (_) {}
      if (!player) {
        ChairSystem._removeSeat(playerName, data);
        continue;
      }

      // Chair block still exists?
      let chairExists = false;
      try {
        const block = player.dimension.getBlock(data.blockLocation);
        chairExists = block && block.typeId === 'lotm:wooden_chair';
      } catch (_) {}

      // Stand up conditions
      const shouldStand = player.isSneaking || player.isJumping || !chairExists;

      if (shouldStand) {
        ChairSystem._standUp(player, playerName, data);
      }
    }
  }

  static _standUp(player, playerName, data) {
    try { player.runCommand('ride @s stop_riding'); } catch (_) {}
    try {
      player.teleport({
        x: data.blockLocation.x + 0.5,
        y: data.blockLocation.y + 1.1,
        z: data.blockLocation.z + 0.5
      }, { dimension: player.dimension });
    } catch (_) {}
    ChairSystem._removeSeat(playerName, data);
    try { player.sendMessage('§7§o*You stand up.*'); } catch (_) {}
  }

  static _removeSeat(playerName, data) {
    try { data.seatEntity.kill(); } catch (_) {}
    ChairSystem.seated.delete(playerName);
  }

  static onChairBroken(blockLocation) {
    for (const [playerName, data] of ChairSystem.seated) {
      if (data.blockLocation.x === blockLocation.x &&
          data.blockLocation.y === blockLocation.y &&
          data.blockLocation.z === blockLocation.z) {
        let player = null;
        try { player = world.getPlayers({ name: playerName })[0]; } catch (_) {}
        if (player) ChairSystem._standUp(player, playerName, data);
        else         ChairSystem._removeSeat(playerName, data);
      }
    }
  }
}