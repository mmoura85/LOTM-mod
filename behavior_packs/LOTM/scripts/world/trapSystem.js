import { world, ItemStack, system } from '@minecraft/server';

const TRAP_BLOCKS = new Set([
    'lotm:spike_trap', 'lotm:wooden_spike_trap',
    'lotm:bear_trap', 'lotm:fake_grass'
]);
const DISGUISE_BLOCKS = new Set([
    'minecraft:snow_layer', 'minecraft:leaves', 'minecraft:leaves2',
    'minecraft:azalea_leaves', 'minecraft:azalea_leaves_flowered',
    'minecraft:mangrove_leaves', 'minecraft:cherry_leaves'
]);
const FIRE_TRAP_BLOCKS = new Set(['lotm:fire_trap']);

const spikeCooldowns    = new Map();
const triggeredBearTraps = new Set();
const fireCooldowns     = new Map();
let tick = 0;
const SPIKE_INTERVAL     = 5;
const FIRE_TRAP_COOLDOWN = 5;

export class TrapSystem {
    static tick() {
        tick++;
        if (tick % 250 === 0) triggeredBearTraps.clear();

        const checked = new Set();
        for (const player of world.getAllPlayers()) {
            try {
                _checkEntity(player);
                const nearby = player.dimension.getEntities({
                    location: player.location,
                    maxDistance: 32
                });
                for (const entity of nearby) {
                    if (!entity.isValid()) continue;
                    if (checked.has(entity.id)) continue;
                    checked.add(entity.id);
                    _checkEntity(entity);
                }
            } catch (_) {}

            if (tick % 5 === 0) {
                try { _checkFireTrapsRedstone(player); } catch (_) {}
            }
        }
    }

    static registerEvents() {
        world.beforeEvents.itemUseOn.subscribe(event => {
            if (!event.isFirstEvent) return;
            const block = event.block;
            if (!FIRE_TRAP_BLOCKS.has(block.typeId)) return;

            const item = event.itemStack;
            if (!item) return;

            const tid = item.typeId;
            let addFuel = 0;
            if (tid.includes('leaves')) addFuel = 3;
            else if (tid === 'minecraft:coal' || tid === 'minecraft:charcoal') addFuel = 8;
            if (addFuel === 0) return;

            event.cancel = true;

            const sourceId = event.source?.id;
            system.run(() => {
                const player = world.getAllPlayers().find(p => p.id === sourceId);
                if (!player) return;

                const currentFuel = block.permutation.getState('lotm:fuel') ?? 0;
                if (currentFuel >= 8) {
                    player.sendMessage('§6Fire trap already fully fueled! (8/8)');
                    return;
                }

                const newFuel = Math.min(8, currentFuel + addFuel);
                try {
                    block.setPermutation(block.permutation.withState('lotm:fuel', newFuel));
                } catch (_) { return; }

                try {
                    const inv = player.getComponent('minecraft:inventory');
                    if (inv?.container) {
                        const slot = player.selectedSlotIndex;
                        const held = inv.container.getItem(slot);
                        if (held?.typeId === tid) {
                            inv.container.setItem(slot, held.amount <= 1 ? undefined : new ItemStack(tid, held.amount - 1));
                        }
                    }
                } catch (_) {}

                const fuelLabel = addFuel === 3 ? '§aLeaves' : '§eCoal';
                player.sendMessage(`§6${fuelLabel} added. Fire trap: §f${newFuel}/8 uses`);
            });
        });
    }
}

world.beforeEvents.worldInitialize.subscribe(e => {
    try {
        e.blockComponentRegistry.registerCustomComponent('lotm:fire_trap', {
            onPlayerInteract({ block, player }) {}
        });
    } catch (_) {}
});

function _checkFireTrapsRedstone(player) {
    const { x, y, z } = player.location;
    const bx0 = Math.floor(x), bz0 = Math.floor(z);
    for (let dx = -8; dx <= 8; dx++) {
        for (let dz = -8; dz <= 8; dz++) {
            for (let dy = -3; dy <= 6; dy++) {
                const by = Math.floor(y) + dy;
                try {
                    const block = player.dimension.getBlock({ x: bx0+dx, y: by, z: bz0+dz });
                    if (!block || !FIRE_TRAP_BLOCKS.has(block.typeId)) continue;
                    const fuel = block.permutation.getState('lotm:fuel') ?? 0;
                    if (fuel <= 0) continue;

                    // Check the trap's own received power, then all 6 adjacent blocks
                    let powered = (block.getRedstonePower?.() ?? 0) > 0;
                    if (!powered) {
                        const adjacent = [
                            { x: bx0+dx,   y: by + 1, z: bz0+dz   },
                            { x: bx0+dx,   y: by - 1, z: bz0+dz   },
                            { x: bx0+dx+1, y: by,     z: bz0+dz   },
                            { x: bx0+dx-1, y: by,     z: bz0+dz   },
                            { x: bx0+dx,   y: by,     z: bz0+dz+1 },
                            { x: bx0+dx,   y: by,     z: bz0+dz-1 }
                        ];
                        for (const pos of adjacent) {
                            const nb = player.dimension.getBlock(pos);
                            if ((nb?.getRedstonePower?.() ?? 0) > 0) { powered = true; break; }
                        }
                    }

                    if (powered) {
                        _fireTrap(block, 3, 5);
                    }
                } catch (_) {}
            }
        }
    }
}

function _checkEntity(entity) {
    if (!entity.isValid()) return;
    const { x, y, z } = entity.location;
    const by0 = Math.floor(y);

    const xs = [...new Set([Math.floor(x - 0.3), Math.floor(x + 0.29)])];
    const zs = [...new Set([Math.floor(z - 0.3), Math.floor(z + 0.29)])];

    for (const bx of xs) {
        for (const bz of zs) {
            for (const dy of [1, 0, -1]) {
                const by = by0 + dy;
                try {
                    const block = entity.dimension.getBlock({ x: bx, y: by, z: bz });
                    if (!block) continue;
                    const tid = block.typeId;

                    if (TRAP_BLOCKS.has(tid)) { _handleTrap(entity, block, tid); continue; }

                    if (DISGUISE_BLOCKS.has(tid)) {
                        const below = entity.dimension.getBlock({ x: bx, y: by - 1, z: bz });
                        if (below && TRAP_BLOCKS.has(below.typeId)) {
                            _handleTrap(entity, below, below.typeId);
                        }
                    }
                } catch (_) {}
            }
        }
    }
}

function _handleTrap(entity, block, typeId) {
    if (typeId === 'lotm:spike_trap')            _spike(entity, 2);
    else if (typeId === 'lotm:wooden_spike_trap') _spike(entity, 1);
    else if (typeId === 'lotm:bear_trap')         _bear(entity, block);
    else if (typeId === 'lotm:fake_grass')        _fakeGrass(block);
}

function _spike(entity, damage) {
    const last = spikeCooldowns.get(entity.id) || 0;
    if (tick - last < SPIKE_INTERVAL) return;
    spikeCooldowns.set(entity.id, tick);
    try { entity.applyDamage(damage); } catch (_) {}
    try {
        entity.dimension.spawnParticle('minecraft:critical_hit_emitter', {
            x: entity.location.x, y: entity.location.y + 0.5, z: entity.location.z
        });
    } catch (_) {}
}

function _bear(entity, block) {
    const loc = block.location;
    const key = `${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}`;
    if (triggeredBearTraps.has(key)) return;
    triggeredBearTraps.add(key);

    try { entity.applyDamage(2); } catch (_) {}
    try { entity.addEffect('slowness', 100, { amplifier: 2, showParticles: true }); } catch (_) {}

    try {
        entity.dimension.runCommand(
            `setblock ${Math.floor(loc.x)} ${Math.floor(loc.y)} ${Math.floor(loc.z)} air destroy`
        );
    } catch (_) {}
    try {
        entity.dimension.spawnParticle('minecraft:critical_hit_emitter', {
            x: loc.x + 0.5, y: loc.y + 1.0, z: loc.z + 0.5
        });
    } catch (_) {}
}

function _fakeGrass(block) {
    const loc = block.location;
    try {
        block.dimension.runCommand(
            `setblock ${Math.floor(loc.x)} ${Math.floor(loc.y)} ${Math.floor(loc.z)} air destroy`
        );
    } catch (_) {}
}

function _getFireDir(block) {
    const face = block.permutation.getState('minecraft:block_face') || 'up';
    // Ceiling: fire downward
    if (face === 'down') return { x: 0, y: -1, z: 0 };
    // Wall-mounted: fire in the same direction as the clicked face (toward the player)
    if (face === 'north') return { x: 0, y: 0, z: -1 };
    if (face === 'south') return { x: 0, y: 0, z:  1 };
    if (face === 'east')  return { x:  1, y: 0, z:  0 };
    if (face === 'west')  return { x: -1, y: 0, z:  0 };
    // Floor (block_face == 'up'): fire opposite to cardinal (player faced away → fire back toward them)
    const card = block.permutation.getState('minecraft:cardinal_direction') || 'north';
    if (card === 'north') return { x: 0, y: 0, z:  1 };
    if (card === 'south') return { x: 0, y: 0, z: -1 };
    if (card === 'east')  return { x: -1, y: 0, z:  0 };
    return { x: 1, y: 0, z: 0 }; // west → fire east
}

function _fireTrap(block, range, burnSecs) {
    const loc = block.location;
    const key = `ft:${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}`;
    const last = fireCooldowns.get(key) || 0;
    if (tick - last < FIRE_TRAP_COOLDOWN) return;
    fireCooldowns.set(key, tick);

    const currentFuel = block.permutation.getState('lotm:fuel') ?? 0;
    if (currentFuel <= 0) return;
    try {
        block.setPermutation(block.permutation.withState('lotm:fuel', currentFuel - 1));
    } catch (_) { return; }

    const dir = _getFireDir(block);
    const isVertical = dir.y !== 0;
    const bx = Math.floor(loc.x);
    const by = Math.floor(loc.y);
    const bz = Math.floor(loc.z);

    for (let i = 1; i <= range; i++) {
        const fx = bx + dir.x * i;
        const fy = by + dir.y * i;
        const fz = bz + dir.z * i;

        try { block.dimension.runCommand(`setblock ${fx} ${fy} ${fz} fire`); } catch (_) {}
        if (!isVertical) {
            try { block.dimension.runCommand(`setblock ${fx} ${fy + 1} ${fz} fire`); } catch (_) {}
        }

        try {
            const targets = block.dimension.getEntities({
                location: { x: fx + 0.5, y: fy + (isVertical ? 0.5 : 1), z: fz + 0.5 },
                maxDistance: 1.5
            });
            for (const t of targets) {
                if (!t.isValid()) continue;
                try { t.setOnFire(burnSecs, true); } catch (_) {}
                try { t.applyDamage(2); } catch (_) {}
            }
        } catch (_) {}
    }
}
