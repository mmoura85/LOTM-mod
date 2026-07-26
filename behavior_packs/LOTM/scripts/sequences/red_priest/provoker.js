import { EntityDamageCause } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

const lastScanTime  = new Map();
const lastTrapScan  = new Map();
const provokeCooldown = new Map();
const SCAN_INTERVAL_MS    = 2000;
const TRAP_SCAN_INTERVAL_MS = 1000;
const SCAN_RADIUS     = 16;
const TRAP_SCAN_RADIUS = 5;
const PROVOCATION_RANGE   = 20;
const PROVOCATION_COST    = 20;
const PROVOCATION_COOLDOWN_MS = 12000;

const TRAP_BLOCK_IDS = [
    'lotm:spike_trap', 'lotm:wooden_spike_trap',
    'lotm:bear_trap', 'lotm:fake_grass',
    'lotm:fire_trap', 'lotm:fire_trap_large'
];

function isHostileEntity(entity) {
    try {
        if (entity.matches({ families: ['monster'] })) return true;
        if (entity.matches({ families: ['undead'] }))  return true;
        if (entity.matches({ families: ['rampager'] })) return true;
    } catch (_) {}
    if (entity.typeId === 'lotm:dire_wolf' || entity.typeId === 'lotm:dire_bear') return true;
    return false;
}

export class ProvokerSequence {
    static SEQUENCE_NUMBER = 8;
    static PATHWAY = 'red_priest';
    static BASE_SPIRIT = 80;

    static EFFECT_DURATION  = 999999;
    static STRENGTH_AMP     = 1;
    static SPEED_AMP        = 1;
    static JUMP_AMP         = 1;

    static hasSequence(player) {
        return PathwayManager.getPathway(player) === this.PATHWAY &&
               PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
    }

    static applyPassiveAbilities(player) {
        this._applyEffect(player, 'strength',     this.STRENGTH_AMP);
        this._applyEffect(player, 'speed',        this.SPEED_AMP);
        this._applyEffect(player, 'jump_boost',   this.JUMP_AMP);
        this._applyEffect(player, 'regeneration', 0);
        this._applyEffect(player, 'night_vision', 0);
        this._applyEffect(player, 'health_boost', 2);
        this._applyDangerIntuition(player);
        this._applyTrapVisibility(player);
    }

    static useProvocation(player) {
        const spirit = SpiritSystem.getSpirit(player);
        if (spirit < PROVOCATION_COST) {
            player.sendMessage(`§cNot enough spirit! Need §f${PROVOCATION_COST}§c, have §f${Math.floor(spirit)}`);
            return;
        }

        const now = Date.now();
        const lastUse = provokeCooldown.get(player.id) || 0;
        const remaining = Math.ceil((PROVOCATION_COOLDOWN_MS - (now - lastUse)) / 1000);
        if (remaining > 0) {
            player.sendMessage(`§cProvocation on cooldown: §f${remaining}s`);
            return;
        }

        const targets = player.dimension.getEntities({
            location: player.location,
            maxDistance: PROVOCATION_RANGE
        }).filter(e => e.typeId !== 'minecraft:player' && e.isValid() && isHostileEntity(e));

        if (targets.length < 2) {
            player.sendMessage('§7Not enough nearby creatures to provoke.');
            return;
        }

        SpiritSystem.consumeSpirit(player, PROVOCATION_COST);
        provokeCooldown.set(player.id, now);

        // Make each mob aggro on a random other mob
        for (const mob of targets) {
            const others = targets.filter(t => t.id !== mob.id);
            if (others.length === 0) continue;
            const victim = others[Math.floor(Math.random() * others.length)];
            try {
                // Apply 1 damage sourced from another mob — triggers their hurt-retaliation AI
                victim.applyDamage(1, {
                    cause: EntityDamageCause.entityAttack,
                    damagingEntity: mob
                });
            } catch (_) {}
            // Brief strength burst makes the chaos more lethal
            try {
                mob.addEffect('strength', 200, { amplifier: 1, showParticles: false });
            } catch (_) {}
            try {
                player.dimension.spawnParticle('minecraft:villager_angry', {
                    x: mob.location.x,
                    y: mob.location.y + 1.5,
                    z: mob.location.z
                });
            } catch (_) {}
        }

        player.sendMessage(`§c§lProvocation! §r§7${targets.length} creatures incited.`);
        try {
            player.dimension.spawnParticle('minecraft:critical_hit_emitter', player.location);
        } catch (_) {}
    }

    static _applyEffect(player, id, amplifier) {
        const eff = player.getEffect(id);
        if (!eff || eff.amplifier !== amplifier || eff.duration < 200) {
            player.addEffect(id, this.EFFECT_DURATION, { amplifier, showParticles: false });
        }
    }

    static _applyDangerIntuition(player) {
        const now = Date.now();
        if (now - (lastScanTime.get(player.id) || 0) < SCAN_INTERVAL_MS) return;
        lastScanTime.set(player.id, now);
        try {
            const nearby = player.dimension.getEntities({ location: player.location, maxDistance: SCAN_RADIUS });
            for (const e of nearby) {
                if (e === player || e.typeId === 'minecraft:player') continue;
                const particle = isHostileEntity(e) ? 'minecraft:villager_angry' : 'minecraft:villager_happy';
                try {
                    player.dimension.spawnParticle(particle, {
                        x: e.location.x, y: e.location.y + 2.5, z: e.location.z
                    });
                } catch (_) {}
            }
        } catch (_) {}
    }

    static _applyTrapVisibility(player) {
        const now = Date.now();
        if (now - (lastTrapScan.get(player.id) || 0) < TRAP_SCAN_INTERVAL_MS) return;
        lastTrapScan.set(player.id, now);
        const { x: cx, y: cy, z: cz } = player.location;
        const fcx = Math.floor(cx), fcy = Math.floor(cy), fcz = Math.floor(cz);
        for (let dx = -TRAP_SCAN_RADIUS; dx <= TRAP_SCAN_RADIUS; dx += 2) {
            for (let dz = -TRAP_SCAN_RADIUS; dz <= TRAP_SCAN_RADIUS; dz += 2) {
                for (let dy = -2; dy <= 2; dy++) {
                    try {
                        const block = player.dimension.getBlock({ x: fcx+dx, y: fcy+dy, z: fcz+dz });
                        if (block && TRAP_BLOCK_IDS.includes(block.typeId)) {
                            player.dimension.spawnParticle('minecraft:wax_on', {
                                x: fcx+dx+0.5, y: fcy+dy+1.1, z: fcz+dz+0.5
                            });
                        }
                    } catch (_) {}
                }
            }
        }
    }
}
