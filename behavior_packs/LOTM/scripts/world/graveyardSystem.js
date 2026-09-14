import { world } from '@minecraft/server';

// ancient_debris never spawns at surface depth in overworld — unique marker
const MARKER_BLOCK   = 'minecraft:ancient_debris';
const STRUCTURE_NAME = 'lotm:big_graveyrd';

// Tuning knobs
const SCAN_RADIUS   = 48;   // 24 blocks each way in X/Z
const SCAN_STEP     = 4;    // check every 4 blocks in X/Z — reliable while keeping work low
const SCAN_INTERVAL = 20;   // × 4-tick outer interval = 80 game ticks ≈ 4 s
// Scan in absolute Y rather than relative to player so elytra flight doesn't miss markers
const SURFACE_Y_MIN = 50;
const SURFACE_Y_MAX = 115;  // covers plains (~64) up to mesa plateaus (~100)

// Real structure footprint is 23×6×40 (X/Y/Z) — padded to a symmetric 46-block span so the
// readiness check covers the whole thing regardless of which corner it loads from.
const FOOTPRINT_HALF = 23;
// Small local search for dry ground if the marker itself lands in/under water.
const RELOCATE_OFFSETS = [
    [0, 0],
    [8, 0], [-8, 0], [0, 8], [0, -8],
    [8, 8], [8, -8], [-8, 8], [-8, -8],
    [16, 0], [-16, 0], [0, 16], [0, -16]
];

const LIQUID_IDS = new Set([
    'minecraft:water', 'minecraft:flowing_water',
    'minecraft:lava',  'minecraft:flowing_lava'
]);

const loadedKeys = new Set();
let tick = 0;

export class GraveyardSystem {
    static tick() {
        tick++;
        if (tick % SCAN_INTERVAL !== 0) return;
        for (const player of world.getAllPlayers()) {
            try { _scanNear(player); } catch (_) {}
        }
    }
}

// Returns false if there is any liquid in the 10 blocks above (bx,by,bz) (underwater spawn).
function _isOnLand(dim, bx, by, bz) {
    for (let checkY = by + 1; checkY <= by + 10; checkY++) {
        try {
            const b = dim.getBlock({ x: bx, y: checkY, z: bz });
            if (b && LIQUID_IDS.has(b.typeId)) return false;
        } catch (_) {}
    }
    return true;
}

// Topmost non-air block in a column — a cheap stand-in for a heightmap query.
function _findGroundY(dim, x, z) {
    for (let y = SURFACE_Y_MAX; y >= SURFACE_Y_MIN; y--) {
        try {
            const b = dim.getBlock({ x, y, z });
            if (b && b.typeId !== 'minecraft:air') return y;
        } catch (_) {}
    }
    return null;
}

// True only if every sample point across the padded footprint returns a real block —
// i.e. the chunks are actually loaded/ticking, not just the marker's own column.
function _isFootprintLoaded(dim, bx, by, bz) {
    const offsets = [
        [0, 0],
        [FOOTPRINT_HALF, 0], [-FOOTPRINT_HALF, 0], [0, FOOTPRINT_HALF], [0, -FOOTPRINT_HALF],
        [FOOTPRINT_HALF, FOOTPRINT_HALF], [FOOTPRINT_HALF, -FOOTPRINT_HALF],
        [-FOOTPRINT_HALF, FOOTPRINT_HALF], [-FOOTPRINT_HALF, -FOOTPRINT_HALF]
    ];
    for (const [dx, dz] of offsets) {
        try {
            const b = dim.getBlock({ x: bx + dx, y: by, z: bz + dz });
            if (!b) return false;
        } catch (_) {
            return false;
        }
    }
    return true;
}

// Searches a small ring of nearby columns for solid, dry ground when the marker's own
// spot is in/under water. Returns {x, y, z} of a usable spot, or null if none found.
function _findDryNearby(dim, bx, bz) {
    for (const [dx, dz] of RELOCATE_OFFSETS) {
        const gx = bx + dx, gz = bz + dz;
        const groundY = _findGroundY(dim, gx, gz);
        if (groundY === null) continue;
        if (_isOnLand(dim, gx, groundY, gz)) return { x: gx, y: groundY, z: gz };
    }
    return null;
}

function _scanNear(player) {
    if (player.dimension.id !== 'minecraft:overworld') return;

    const { x, z } = player.location;
    const fx   = Math.floor(x);
    const fz   = Math.floor(z);
    const dim  = player.dimension;
    const half = Math.floor(SCAN_RADIUS / 2);

    for (let dx = -half; dx <= half; dx += SCAN_STEP) {
        for (let dz = -half; dz <= half; dz += SCAN_STEP) {
            const bx = fx + dx;
            const bz = fz + dz;

            // Scan absolute Y top-down — works whether player is on foot or flying
            for (let by = SURFACE_Y_MAX; by >= SURFACE_Y_MIN; by--) {
                try {
                    const block = dim.getBlock({ x: bx, y: by, z: bz });
                    if (!block || block.typeId !== MARKER_BLOCK) continue;

                    const key = `${bx},${by},${bz}`;
                    if (loadedKeys.has(key)) continue;

                    // Don't commit until the whole footprint's chunks are actually loaded —
                    // firing early is what truncated the structure before. Leave the marker
                    // in place and retry on a later scan pass instead.
                    if (!_isFootprintLoaded(dim, bx, by, bz)) return;

                    loadedKeys.add(key);
                    // Always remove the marker now that we're committed to acting on it
                    dim.runCommandAsync(`setblock ${bx} ${by} ${bz} air`).catch(() => {});

                    let targetX = bx, targetY = by, targetZ = bz;
                    if (!_isOnLand(dim, bx, by, bz)) {
                        const dry = _findDryNearby(dim, bx, bz);
                        if (!dry) {
                            world.sendMessage('§6[LOTM] §7Graveyard marker was in water — skipped.');
                            return;
                        }
                        targetX = dry.x; targetY = dry.y; targetZ = dry.z;
                    }

                    world.sendMessage(`§6[LOTM] §fLoading graveyard at ${targetX} ${targetY + 2} ${targetZ}...`);
                    dim.runCommandAsync(`structure load "${STRUCTURE_NAME}" ${targetX} ${targetY + 2} ${targetZ}`).catch(() => {});
                    return;
                } catch (_) {}
            }
        }
    }
}
