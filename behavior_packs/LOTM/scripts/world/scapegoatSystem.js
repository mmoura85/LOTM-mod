import { world, system, ItemStack } from '@minecraft/server';

const DURATION   = 300; // ticks (~15 seconds)
const SPEED      = 0.18; // blocks/tick
const TAUNT_INTERVAL = 10; // ticks between damage pulses
const TAUNT_DAMAGE   = 1;
const TAUNT_RANGE    = 24;
const EXCLUDE = ['minecraft:item', 'minecraft:xp_orb', 'lotm:decoy', 'lotm:wisp'];

export class ScapegoatSystem {
    static activate(player) {
        const dim = player.dimension;
        const eye = player.getHeadLocation();
        const view = player.getViewDirection();

        // Escape direction: same as player facing
        const hLen    = Math.sqrt(view.x * view.x + view.z * view.z) || 1;
        const escapeX = view.x / hLen;
        const escapeZ = view.z / hLen;

        // Spawn slightly in front of the player
        const spawn = { x: eye.x + escapeX * 1.5, y: player.location.y, z: eye.z + escapeZ * 1.5 };
        let decoy;
        try { decoy = dim.spawnEntity('lotm:decoy', spawn); } catch (_) { return; }
        if (!decoy) return;

        // Consume one decoy item from inventory
        try {
            const inv = player.getComponent('minecraft:inventory');
            if (inv?.container) {
                const slot = player.selectedSlotIndex;
                const held = inv.container.getItem(slot);
                if (held?.typeId === 'lotm:decoy_item') {
                    inv.container.setItem(slot, held.amount <= 1 ? undefined : new ItemStack('lotm:decoy_item', held.amount - 1));
                }
            }
        } catch (_) {}

        player.playSound('mob.goat.ambient', { pitch: 1.4, volume: 1.2 });
        player.sendMessage('§6Your decoy scapegoat dashes away, drawing enemies!');

        const pos   = { ...spawn };
        let   step  = 0;
        const yaw   = Math.atan2(-escapeX, escapeZ) * (180 / Math.PI);

        const id = system.runInterval(() => {
            if (step++ >= DURATION || !decoy.isValid()) {
                if (decoy.isValid()) try { decoy.kill(); } catch (_) {}
                system.clearRun(id);
                return;
            }

            // Move decoy in escape direction
            pos.x += escapeX * SPEED;
            pos.z += escapeZ * SPEED;

            // Basic ground-following: adjust Y to stay near terrain
            try {
                const atPos = dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) });
                if (atPos && !atPos.isAir && !atPos.isLiquid) {
                    pos.y += 1; // step up over obstacle
                }
                const below = dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y) - 1, z: Math.floor(pos.z) });
                if (below?.isAir || below?.isLiquid) {
                    pos.y -= 0.25; // drop toward ground
                }
            } catch (_) {}

            try { decoy.teleport(pos, { rotation: { x: 0, y: yaw } }); } catch (_) {}

            // Flame aura particles every 5 ticks
            if (step % 5 === 0) {
                for (let i = 0; i < 3; i++) {
                    const a = (i / 3) * Math.PI * 2;
                    try {
                        dim.spawnParticle('minecraft:basic_flame_particle', {
                            x: pos.x + Math.cos(a) * 0.5, y: pos.y + 0.8, z: pos.z + Math.sin(a) * 0.5
                        });
                    } catch (_) {}
                }
            }

            // Damage taunt pulse — force mobs to retaliate against the decoy via entity_attack
            if (step % TAUNT_INTERVAL === 0) {
                try {
                    // Run as decoy so @s = decoy; entity_attack cause triggers hurt_by_target retaliation
                    decoy.runCommand(`damage @e[r=${TAUNT_RANGE},type=!minecraft:player,type=!lotm:decoy,type=!minecraft:item,type=!minecraft:xp_orb] ${TAUNT_DAMAGE} entity_attack entity @s`);
                } catch (_) {}

                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2;
                    try { dim.spawnParticle('minecraft:basic_flame_particle', { x: pos.x + Math.cos(a) * 0.6, y: pos.y + 1.0, z: pos.z + Math.sin(a) * 0.6 }); } catch (_) {}
                }
            }
        }, 1);
    }
}
