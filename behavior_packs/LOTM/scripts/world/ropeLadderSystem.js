import { world, system, BlockPermutation } from '@minecraft/server';

const ROPE_LADDER = 'lotm:rope_ladder';
const LADDER      = 'minecraft:ladder';

// Maps minecraft:cardinal_direction (set by placement_direction trait from player facing)
// to vanilla ladder facing_direction integer.
// Cardinal = direction player was facing = direction of the wall from the ladder's position.
const CARDINAL_TO_FACING = {
  north: 2,
  south: 3,
  east:  5,
  west:  4
};

// Offset from the ladder block to the supporting wall block.
const DIR_TO_WALL = {
  north: { x:  0, z: -1 },
  south: { x:  0, z:  1 },
  east:  { x:  1, z:  0 },
  west:  { x: -1, z:  0 }
};

export class RopeLadderSystem {

  static registerEvents() {
    world.afterEvents.playerPlaceBlock.subscribe((event) => {
      if (event.block.typeId !== ROPE_LADDER) return;

      const dir        = event.block.permutation.getState('minecraft:cardinal_direction');
      const facingDir  = CARDINAL_TO_FACING[dir];
      const wallOffset = DIR_TO_WALL[dir];
      if (facingDir === undefined || !wallOffset) return;

      const dim        = event.block.dimension;
      const loc        = event.block.location;
      const ladderPerm = BlockPermutation.resolve(LADDER, { 'facing_direction': facingDir });

      system.run(() => {
        dim.setBlockPermutation(loc, ladderPerm);
        RopeLadderSystem._extendDown(dim, loc, ladderPerm, wallOffset);
      });
    });

    world.afterEvents.playerBreakBlock.subscribe((event) => {
      if (event.brokenBlockPermutation?.type?.id !== LADDER) return;
      const dim = event.block.dimension;
      const loc = event.block.location;
      system.run(() => RopeLadderSystem._cascadeBreak(dim, loc));
    });
  }

  static _extendDown(dimension, location, permutation, wallOffset) {
    const { x, z } = location;
    let y = location.y - 1;
    while (y >= -64) {
      try {
        const block = dimension.getBlock({ x, y, z });
        if (!block || block.typeId !== 'minecraft:air') break;

        const wall = dimension.getBlock({ x: x + wallOffset.x, y, z: z + wallOffset.z });
        if (!wall || wall.typeId === 'minecraft:air') break;

        dimension.setBlockPermutation({ x, y, z }, permutation);
        y--;
      } catch (_) { break; }
    }
  }

  static _cascadeBreak(dimension, location) {
    const { x, z } = location;
    let y = location.y - 1;
    const air = BlockPermutation.resolve('minecraft:air');
    while (y >= -64) {
      try {
        const block = dimension.getBlock({ x, y, z });
        if (!block || block.typeId !== LADDER) break;
        dimension.setBlockPermutation({ x, y, z }, air);
        y--;
      } catch (_) { break; }
    }
  }
}
