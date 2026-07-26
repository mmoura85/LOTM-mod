import { world } from '@minecraft/server';

const SPAWNER_BLOCK = 'lotm:soldier_spawner';
const SOLDIER_TYPE  = 'lotm:soldier';
const SQUAD_SIZE    = 6;
const PATROL_RADIUS = 32;
const RESPAWN_TICKS = 3600; // 3 minutes between respawn checks

// "x,y,z,dimId" → { location, dimId }
const spawners   = new Map();
const scanned    = new Set();
let spawnerTick  = 0;

export class SoldierSpawnerSystem {
    static registerEvents() {
        world.afterEvents.playerPlaceBlock.subscribe(({ block, player }) => {
            if (block.typeId !== SPAWNER_BLOCK) return;
            const loc = _floor(block.location);
            const key = _key(loc, player.dimension.id);
            spawners.set(key, { location: loc, dimId: player.dimension.id });
            // Spawn initial squad around the block
            _spawnSoldiers(loc, player.dimension, SQUAD_SIZE);
            try {
                player.dimension.spawnParticle('minecraft:large_explosion', {
                    x: loc.x + 0.5, y: loc.y + 8, z: loc.z + 0.5
                });
            } catch (_) {}
        });

        world.afterEvents.playerBreakBlock.subscribe(({ block, dimension }) => {
            spawners.delete(_key(_floor(block.location), dimension.id));
        });
    }

    static tick() {
        spawnerTick++;

        // Discover spawners near each player on first login and every 30s
        for (const player of world.getAllPlayers()) {
            if (!scanned.has(player.id) || spawnerTick % 600 === 0) {
                scanned.add(player.id);
                _discoverNear(player);
            }
        }

        if (spawnerTick % RESPAWN_TICKS !== 0) return;

        const dimCache = {};
        for (const [key, { location, dimId }] of spawners) {
            try {
                if (!dimCache[dimId]) dimCache[dimId] = world.getDimension(dimId);
                const dim = dimCache[dimId];

                // Verify block still exists — only remove from registry if we
                // get a real block back and it isn't the spawner (handles explosions etc.)
                // If getBlock returns null the chunk is unloaded — skip without deleting
                const block = dim.getBlock(location);
                if (!block) continue;
                if (block.typeId !== SPAWNER_BLOCK) { spawners.delete(key); continue; }

                // Count living soldiers within patrol radius
                const soldiers = dim.getEntities({
                    type: SOLDIER_TYPE,
                    location,
                    maxDistance: PATROL_RADIUS
                });
                const missing = SQUAD_SIZE - soldiers.length;
                if (missing > 0) _spawnSoldiers(location, dim, missing);
            } catch (_) {}
        }
    }
}

function _floor(loc) {
    return { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) };
}

function _key(loc, dimId) {
    return `${loc.x},${loc.y},${loc.z},${dimId}`;
}

function _discoverNear(player) {
    const { x, y, z } = player.location;
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    const dim = player.dimension;
    const dimId = dim.id;
    for (let dx = -24; dx <= 24; dx += 2) {
        for (let dz = -24; dz <= 24; dz += 2) {
            for (let dy = -4; dy <= 4; dy++) {
                try {
                    const loc = { x: fx+dx, y: fy+dy, z: fz+dz };
                    if (dim.getBlock(loc)?.typeId === SPAWNER_BLOCK) {
                        spawners.set(_key(loc, dimId), { location: loc, dimId });
                    }
                } catch (_) {}
            }
        }
    }
}

function _spawnSoldiers(loc, dimension, count) {
    for (let i = 0; i < count; i++) {
        try {
            const angle  = (i / count) * Math.PI * 2;
            const radius = 4 + Math.random() * 3;
            const spawnPos = {
                x: loc.x + Math.cos(angle) * radius,
                y: loc.y + 1,
                z: loc.z + Math.sin(angle) * radius
            };
            dimension.spawnEntity(SOLDIER_TYPE, spawnPos);
        } catch (_) {}
    }
}
