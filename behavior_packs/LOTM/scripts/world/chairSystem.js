import { world, system } from '@minecraft/server';

export class ChairSystem {

  static CHAIR_TYPES = {
    'lotm:wooden_chair': 'lotm:chair_seat',
    'lotm:stone_bench':  'lotm:bench_seat',
  };

  static _cooldowns  = new Set();  // per-player click debounce
  static _activeSits = new Map();  // playerId → { seat, intervalId }

  static registerEvents() {
    // Clean up any orphaned seat entities left over from a previous server session
    system.run(() => {
      for (const dimId of ['overworld', 'nether', 'the_end']) {
        try {
          const dim = world.getDimension(dimId);
          for (const type of ['lotm:chair_seat', 'lotm:bench_seat']) {
            try {
              for (const e of dim.getEntities({ type })) {
                try { e.remove(); } catch (_) {}
              }
            } catch (_) {}
          }
        } catch (_) {}
      }
    });

    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
      const blockId = event.block.typeId;
      const seatType = ChairSystem.CHAIR_TYPES[blockId];
      if (!seatType) return;
      if (event.player.isSneaking) return;

      event.cancel = true;

      const playerId = event.player.id;
      if (ChairSystem._cooldowns.has(playerId)) return;
      ChairSystem._cooldowns.add(playerId);
      system.runTimeout(() => ChairSystem._cooldowns.delete(playerId), 20);

      const player = event.player;
      const block  = event.block;
      system.run(() => ChairSystem._sit(player, block, seatType));
    });
  }

  static _sit(player, block, seatType) {
    if (player.isSneaking) return;
    if (ChairSystem._activeSits.has(player.id)) return;

    const loc = block.location;
    const dim  = block.dimension;
    const cx   = loc.x + 0.5;
    const cy   = loc.y;
    const cz   = loc.z + 0.5;

    const dir = block.permutation.getState('minecraft:cardinal_direction') ?? 'south';
    // Yaw values match the chair front direction after the permutation fix:
    // south→face south (0°), west→face west (90°), north→face north (180°), east→face east (-90°)
    const yawMap = { south: 0, west: 90, north: 180, east: -90 };
    const targetYaw = yawMap[dir] ?? 0;

    try {
      const existing = dim.getEntities({
        type: seatType,
        location: { x: cx, y: cy, z: cz },
        maxDistance: 1.0,
      });
      if (existing.length > 0) return;
    } catch (_) {}

    system.run(() => {
      let seat;
      try {
        seat = dim.spawnEntity(seatType, { x: cx, y: cy, z: cz });
      } catch (_) {
        return;
      }

      system.run(() => {
        // Rotate the player BEFORE mounting so the engine preserves the facing direction.
        // post-mount player.setRotation() is a no-op and /tp while riding causes dismount.
        try { player.teleport(player.location, { rotation: { x: 0, y: targetYaw } }); } catch (_) {}
        try { seat.setRotation({ x: 0, y: targetYaw }); } catch (_) {}

        let result;
        try {
          result = seat.runCommand('ride @p start_riding @s teleport_rider if_group_fits');
        } catch (_) {
          try { seat.remove(); } catch (_) {}
          return;
        }

        if (result.successCount === 0) {
          try { seat.remove(); } catch (_) {}
          return;
        }

        // Poll every 10 ticks — when the player moves away they have dismounted
        const playerId = player.id;
        const seatRef  = seat;
        const intervalId = system.runInterval(() => {
          if (!seatRef.isValid()) {
            system.clearRun(intervalId);
            ChairSystem._activeSits.delete(playerId);
            return;
          }
          try {
            const pp = player.location;
            const sp = seatRef.location;
            const dx = pp.x - sp.x;
            const dz = pp.z - sp.z;
            if (Math.sqrt(dx * dx + dz * dz) > 1.5) {
              try { seatRef.remove(); } catch (_) {}
              system.clearRun(intervalId);
              ChairSystem._activeSits.delete(playerId);
            }
          } catch (_) {
            try { seatRef.remove(); } catch (_) {}
            system.clearRun(intervalId);
            ChairSystem._activeSits.delete(playerId);
          }
        }, 10);

        ChairSystem._activeSits.set(playerId, { seat, intervalId });
      });
    });
  }

  static onFurnitureBroken(block) {
    const loc = block.location;
    const dim  = block.dimension;
    const cx   = loc.x + 0.5;
    const cy   = loc.y + 0.5;
    const cz   = loc.z + 0.5;

    system.run(() => {
      for (const seatType of ['lotm:chair_seat', 'lotm:bench_seat']) {
        try {
          const seats = dim.getEntities({
            type: seatType,
            location: { x: cx, y: cy, z: cz },
            maxDistance: 1.5,
          });
          for (const seat of seats) {
            try { seat.runCommand('ride @a[r=2] stop_riding'); } catch (_) {}
            try { seat.remove(); } catch (_) {}
          }
        } catch (_) {}
      }
    });
  }

  static onChairPlaced(_block) {}
  static onChairBroken(blockOrLoc) {
    if (blockOrLoc && typeof blockOrLoc.dimension !== 'undefined') {
      this.onFurnitureBroken(blockOrLoc);
    }
  }
  static tick() {}
  static register(_registry) {}
}
