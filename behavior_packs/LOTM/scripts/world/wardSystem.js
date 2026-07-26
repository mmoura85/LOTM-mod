import { world } from '@minecraft/server';

const WARD_BLOCK  = 'lotm:beast_ward';
const WARD_RADIUS = 10;
const COOLDOWN_MS = 1200;

const BEAST_TYPES = new Set(['lotm:dire_wolf', 'lotm:dire_bear']);

// "x,y,z,dimId" → { location, dimId }
const wards      = new Map();
const repelledAt = new Map();
const scanned    = new Set(); // player IDs that have had initial area scan

let wardTick = 0;

export class WardSystem {
    static registerEvents() {
        // Track wards as they are placed
        world.afterEvents.playerPlaceBlock.subscribe(({ block, player }) => {
            if (block.typeId !== WARD_BLOCK) return;
            const loc = _floorLoc(block.location);
            wards.set(_key(loc, player.dimension.id), { location: loc, dimId: player.dimension.id });
            try {
                player.dimension.spawnParticle('minecraft:wax_on', {
                    x: loc.x + 0.5, y: loc.y + 1.5, z: loc.z + 0.5
                });
            } catch (_) {}
        });

        // Remove wards when broken
        world.afterEvents.playerBreakBlock.subscribe(({ block, dimension }) => {
            wards.delete(_key(_floorLoc(block.location), dimension.id));
        });
    }

    static tick() {
        wardTick++;

        // Discover pre-existing wards near each player (once per login, then every 30s)
        for (const player of world.getAllPlayers()) {
            if (!scanned.has(player.id) || wardTick % 400 === 0) {
                scanned.add(player.id);
                _discoverNear(player);
            }
        }

        // Repel every 4 ticks (~0.2 seconds) for responsive detection
        if (wardTick % 4 !== 0) return;

        const dimCache = {};
        for (const [key, { location, dimId }] of wards) {
            try {
                if (!dimCache[dimId]) dimCache[dimId] = world.getDimension(dimId);
                const dim = dimCache[dimId];
                const block = dim.getBlock(location);
                if (!block || block.typeId !== WARD_BLOCK) { wards.delete(key); continue; }
                _repelNear(location, dim);
            } catch (_) {}
        }

        // Clean up stale cooldown entries
        if (wardTick % 600 === 0) {
            const cutoff = Date.now() - 10000;
            for (const [id, t] of repelledAt) if (t < cutoff) repelledAt.delete(id);
        }
    }
}

function _floorLoc(loc) {
    return { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) };
}

function _key(loc, dimId) {
    return `${loc.x},${loc.y},${loc.z},${dimId}`;
}

// Step-2 scan covers every other block — good enough since wards are coarsely placed.
// New wards are always caught by the place event; this covers wards from prior sessions.
function _discoverNear(player) {
    const { x, y, z } = player.location;
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    const dim = player.dimension;
    const dimId = dim.id;
    for (let dx = -20; dx <= 20; dx += 2) {
        for (let dz = -20; dz <= 20; dz += 2) {
            for (let dy = -4; dy <= 4; dy++) {
                try {
                    const loc = { x: fx+dx, y: fy+dy, z: fz+dz };
                    if (dim.getBlock(loc)?.typeId === WARD_BLOCK) {
                        wards.set(_key(loc, dimId), { location: loc, dimId });
                    }
                } catch (_) {}
            }
        }
    }
}

function _repelNear(wardPos, dimension) {
    const now = Date.now();

    // Facing direction unit vector — mobs must be in this half-space to be repelled
    let fdx = 0, fdz = -1; // default north
    try {
        const facing = dimension.getBlock(wardPos)?.permutation.getState('minecraft:cardinal_direction');
        if      (facing === 'south') { fdx =  0; fdz =  1; }
        else if (facing === 'east')  { fdx =  1; fdz =  0; }
        else if (facing === 'west')  { fdx = -1; fdz =  0; }
    } catch (_) {}

    const entities = dimension.getEntities({ location: wardPos, maxDistance: WARD_RADIUS });
    for (const entity of entities) {
        if (!entity.isValid() || !BEAST_TYPES.has(entity.typeId)) continue;
        if (now - (repelledAt.get(entity.id) || 0) < COOLDOWN_MS) continue;

        // Only repel mobs in the forward half-space
        const ex = entity.location.x - wardPos.x;
        const ez = entity.location.z - wardPos.z;
        if (fdx * ex + fdz * ez <= 0) continue;

        repelledAt.set(entity.id, now);

        const dx = ex;
        const dz = ez;
        const len = Math.sqrt(dx*dx + dz*dz) || 1;

        try { entity.applyKnockback(dx/len, dz/len, 4.0, 0.5); } catch (_) {}
        // Slowness IV for 10 seconds — slows re-approach significantly
        try { entity.addEffect('slowness', 200, { amplifier: 3, showParticles: false }); } catch (_) {}
        try { entity.addEffect('weakness', 100, { amplifier: 1, showParticles: false }); } catch (_) {}

        try {
            dimension.spawnParticle('minecraft:wither_boss_invulnerable', {
                x: entity.location.x, y: entity.location.y + 1, z: entity.location.z
            });
        } catch (_) {}
    }

    try {
        dimension.spawnParticle('minecraft:wax_on', {
            x: wardPos.x + 0.5, y: wardPos.y + 1.8, z: wardPos.z + 0.5
        });
    } catch (_) {}
}
