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

// Returns false if there is any liquid in the 10 blocks above the marker (underwater spawn).
function _isOnLand(dim, bx, by, bz) {
    for (let checkY = by + 1; checkY <= by + 10; checkY++) {
        try {
            const b = dim.getBlock({ x: bx, y: checkY, z: bz });
            if (b && LIQUID_IDS.has(b.typeId)) return false;
        } catch (_) {}
    }
    return true;
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
                    loadedKeys.add(key);

                    // Always remove the marker
                    dim.runCommandAsync(`setblock ${bx} ${by} ${bz} air`).catch(() => {});

                    if (!_isOnLand(dim, bx, by, bz)) {
                        world.sendMessage('§6[LOTM] §7Graveyard marker was in water — skipped.');
                        return;
                    }

                    world.sendMessage(`§6[LOTM] §fLoading graveyard at ${bx} ${by + 2} ${bz}...`);
                    dim.runCommandAsync(`structure load "${STRUCTURE_NAME}" ${bx} ${by + 2} ${bz}`).catch(() => {});
                    return;
                } catch (_) {}
            }
        }
    }
}
