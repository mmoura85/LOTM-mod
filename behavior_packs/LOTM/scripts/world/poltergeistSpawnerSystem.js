import { world } from '@minecraft/server';

const SPAWNER_BLOCK = 'lotm:cursed_grave';
const POLTERGEIST   = 'lotm:poltergeist';
const PLAYER_RADIUS = 24;
const MOB_RADIUS    = 20;
const CHECK_TICKS   = 600;   // 30 s between spawn waves
const NIGHT_START   = 13000;
const NIGHT_END     = 23000;

const spawners = new Map();  // "x,y,z,dimId" → { location, dimId, cap }
const scanned  = new Set();  // player IDs scanned this session
let tick = 0;

export class PoltergeistSpawnerSystem {
    static registerEvents() {
        world.afterEvents.playerPlaceBlock.subscribe(({ block, player }) => {
            if (block.typeId !== SPAWNER_BLOCK) return;
            const loc = _floor(block.location);
            const key = _key(loc, player.dimension.id);
            spawners.set(key, { location: loc, dimId: player.dimension.id, cap: _randCap() });
        });

        world.afterEvents.playerBreakBlock.subscribe(({ block, dimension }) => {
            spawners.delete(_key(_floor(block.location), dimension.id));
        });
    }

    static tick() {
        tick++;

        // Discover cursed graves near each player (on login + every 30 s)
        for (const player of world.getAllPlayers()) {
            if (!scanned.has(player.id) || tick % 600 === 0) {
                scanned.add(player.id);
                _discoverNear(player);
            }
        }

        if (tick % CHECK_TICKS !== 0) return;

        const time = world.getTimeOfDay();
        const isNight = time >= NIGHT_START && time <= NIGHT_END;
        if (!isNight) return;

        const playersByDim = {};
        for (const player of world.getAllPlayers()) {
            const id = player.dimension.id;
            if (!playersByDim[id]) playersByDim[id] = [];
            playersByDim[id].push(player.location);
        }

        const dimCache = {};
        for (const [key, { location, dimId, cap }] of spawners) {
            try {
                if (!dimCache[dimId]) dimCache[dimId] = world.getDimension(dimId);
                const dim = dimCache[dimId];

                const block = dim.getBlock(location);
                if (!block) continue;
                if (block.typeId !== SPAWNER_BLOCK) { spawners.delete(key); continue; }

                const r2 = PLAYER_RADIUS * PLAYER_RADIUS;
                const nearby = (playersByDim[dimId] || []).some(p => {
                    const dx = p.x - location.x, dy = p.y - location.y, dz = p.z - location.z;
                    return dx*dx + dy*dy + dz*dz <= r2;
                });
                if (!nearby) continue;

                const existing = dim.getEntities({ type: POLTERGEIST, location, maxDistance: MOB_RADIUS }).length;
                const needed = cap - existing;
                if (needed <= 0) continue;

                _spawn(location, dim, needed);
            } catch (_) {}
        }
    }
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
                        const key = _key(loc, dimId);
                        if (!spawners.has(key)) {
                            spawners.set(key, { location: loc, dimId, cap: _randCap() });
                        }
                    }
                } catch (_) {}
            }
        }
    }
}

function _spawn(loc, dim, count) {
    for (let i = 0; i < count; i++) {
        try {
            const angle = (i / count) * Math.PI * 2;
            dim.spawnEntity(POLTERGEIST, {
                x: loc.x + Math.cos(angle) * 2,
                y: loc.y + 1,
                z: loc.z + Math.sin(angle) * 2
            });
        } catch (_) {}
    }
}

function _floor(loc) {
    return { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) };
}

function _key(loc, dimId) {
    return `${loc.x},${loc.y},${loc.z},${dimId}`;
}

function _randCap() {
    return 2 + Math.floor(Math.random() * 3); // 2, 3, or 4
}
