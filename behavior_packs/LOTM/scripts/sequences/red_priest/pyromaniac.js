import { system } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

const EFFECT_DURATION   = 999999;
const BASE_SPIRIT       = 120;
const DANGER_RADIUS     = 22; // enhanced over Provoker's 16

const SPELLS = {
    fire_bolt:           { cost: 5,  cooldownMs: 2000,  label: '§cFire Bolt §7(5 spirit)' },
    fireball:            { cost: 12, cooldownMs: 4000,  label: '§6Fireball §7(12 spirit)' },
    fire_wall:           { cost: 15, cooldownMs: 6000,  label: '§eFire Wall §7(15 spirit)' },
    blazing_spear:       { cost: 10, cooldownMs: 4000,  label: '§cBlazing Spear §7(10 spirit)' },
    ring_of_fire:        { cost: 20, cooldownMs: 8000,  label: '§4Ring of Fire §7(20 spirit)' },
    flaming_barrage:     { cost: 18, cooldownMs: 10000, label: '§6Flaming Barrage §7(18 spirit)' },
    burning_dash:        { cost: 14, cooldownMs: 7000,  label: '§4Burning Dash §7(14 spirit)' },
    fire_arrow_blaze:    { cost: 16, cooldownMs: 8000,  label: '§6Fire Arrow + Blaze §7(16 spirit)' }
};
const SPELL_KEYS = Object.keys(SPELLS);

const spellCooldowns = new Map(); // "playerId:spell" → timestamp
const selectedSpell  = new Map(); // playerId → spellKey
const lastDangerScan = new Map();

// Timed effects
const activeRings = []; // { center, dimension, player, startTime, lastRadius, hitEntities }

export class PyromancerSequence {
    static SEQUENCE_NUMBER = 7;
    static PATHWAY         = 'red_priest';
    static BASE_SPIRIT     = BASE_SPIRIT;

    static applyPassiveAbilities(player) {
        // Fire resistance — permanent
        _applyEffect(player, 'fire_resistance', 0);
        // Night vision — carried from lower sequences
        _applyEffect(player, 'night_vision', 0);
        // Strength, Speed, Jump, Regen from Provoker tier
        _applyEffect(player, 'strength', 1);
        _applyEffect(player, 'speed', 1);
        _applyEffect(player, 'jump_boost', 1);
        _applyEffect(player, 'regeneration', 0);
        _applyEffect(player, 'health_boost', 2);

        // Enhanced danger intuition
        const now = Date.now();
        if (now - (lastDangerScan.get(player.id) || 0) > 1200) {
            lastDangerScan.set(player.id, now);
            _scanDanger(player);
        }
    }

    static removeEffects(player) {
        for (const eff of ['fire_resistance', 'night_vision', 'strength', 'speed',
                           'jump_boost', 'regeneration', 'health_boost']) {
            try { player.removeEffect(eff); } catch (_) {}
        }
    }

    // Called from entityHitEntity — fire aspect on melee hits
    static onMeleeHit(player, victim) {
        try { victim.setOnFire(5, true); } catch (_) {}
    }

    static async openSpellMenu(player) {
        const form = new ActionFormData()
            .title('§6§lPyromaniac Spells')
            .body('Select a spell to attune:');
        for (const key of SPELL_KEYS) form.button(SPELLS[key].label);

        try {
            const result = await form.show(player);
            if (result.canceled || result.selection === undefined) return;
            const key = SPELL_KEYS[result.selection];
            selectedSpell.set(player.id, key);
            player.sendMessage(`§6Spell attuned: §e${SPELLS[key].label}`);
        } catch (_) {}
    }

    static castSpell(player) {
        const spell  = selectedSpell.get(player.id) || 'fire_bolt';
        const config = SPELLS[spell];
        const cdKey  = `${player.id}:${spell}`;
        const now    = Date.now();

        const remaining = config.cooldownMs - (now - (spellCooldowns.get(cdKey) || 0));
        if (remaining > 0) {
            player.sendMessage(`§c${spell.replace(/_/g,' ')} on cooldown (${(remaining/1000).toFixed(1)}s)`);
            return;
        }
        const spirit = SpiritSystem.getSpirit(player);
        if (spirit < config.cost) {
            player.sendMessage(`§cNot enough spirit (need ${config.cost}, have ${spirit})`);
            return;
        }

        spellCooldowns.set(cdKey, now);
        SpiritSystem.consumeSpirit(player, config.cost);

        let ok = true;
        switch (spell) {
            case 'fire_bolt':        _castFireBolt(player);          break;
            case 'fireball':         _castFireball(player);          break;
            case 'fire_wall':        _castFireWall(player);          break;
            case 'blazing_spear':    _castBlazingSpear(player);      break;
            case 'ring_of_fire':       _castRingOfFire(player);          break;
            case 'flaming_barrage':    ok = _castFlamingBarrage(player);  break;
            case 'burning_dash':       _castBurningDash(player);          break;
            case 'fire_arrow_blaze':   _castFireArrowBlazeStorm(player);  break;
        }

        if (!ok) {
            spellCooldowns.delete(cdKey);
            SpiritSystem.restoreSpirit(player, config.cost);
        }
    }

    // Called every tick from main.js for timed effects
    static tickEffects() {
        const now = Date.now();

        // Tick expanding rings
        for (let i = activeRings.length - 1; i >= 0; i--) {
            const ring = activeRings[i];
            const radius = (now - ring.startTime) / 1000 * 4; // 4 blocks/sec
            if (radius > 10) { activeRings.splice(i, 1); continue; }
            try { _tickRing(ring, radius); } catch (_) {}
        }
    }
}

// ─── Passive helpers ──────────────────────────────────────────────────────────

function _applyEffect(player, effect, amplifier) {
    try {
        const e = player.getEffect(effect);
        if (!e || e.duration < 200) {
            player.addEffect(effect, EFFECT_DURATION, { amplifier, showParticles: false });
        }
    } catch (_) {}
}

function _scanDanger(player) {
    try {
        const entities = player.dimension.getEntities({ location: player.location, maxDistance: DANGER_RADIUS });
        for (const e of entities) {
            if (!e.isValid() || e === player) continue;
            if (!_isHostile(e)) continue;
            try {
                player.dimension.spawnParticle('minecraft:critical_hit_emitter', {
                    x: e.location.x, y: e.location.y + 1, z: e.location.z
                });
            } catch (_) {}
        }
    } catch (_) {}
}

function _isHostile(entity) {
    try {
        if (entity.matches({ families: ['monster'] })) return true;
        if (entity.matches({ families: ['undead'] }))  return true;
    } catch (_) {}
    return ['lotm:dire_wolf', 'lotm:dire_bear', 'lotm:rampager'].includes(entity.typeId);
}

// ─── Spell implementations ────────────────────────────────────────────────────

function _castFireBolt(player) {
    const view = player.getViewDirection(), eye = player.getHeadLocation();
    const dim  = player.dimension;
    const SPEED = 0.75, STEPS = 40, DAMAGE = 14;

    const start = { x: eye.x + view.x * 1.5, y: eye.y, z: eye.z + view.z * 1.5 };

    // Helix perpendicular axes (FireboltProjectile.trailParticles style)
    const hLen = Math.sqrt(view.x * view.x + view.z * view.z) || 1;
    const right = { x: -view.z / hLen, y: 0, z: view.x / hLen };
    const up2 = {
        x: right.y * view.z - right.z * view.y,
        y: right.z * view.x - right.x * view.z,
        z: right.x * view.y - right.y * view.x
    };

    let bolt;
    try { bolt = dim.spawnEntity('lotm:firebolt', start); } catch (_) { return; }
    if (!bolt) return;

    player.playSound('fire.fire', { pitch: 1.2, volume: 1.0 });

    const pos = { ...start };
    let step = 0;

    const tick = () => {
        if (!bolt.isValid() || step >= STEPS) {
            try { if (bolt.isValid()) bolt.kill(); } catch (_) {}
            return;
        }

        pos.x += view.x * SPEED;
        pos.y += view.y * SPEED;
        pos.z += view.z * SPEED;
        step++;
        try { bolt.teleport(pos); } catch (_) {}

        // Block check
        try {
            const block = dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) });
            if (block && !block.isAir && !block.isLiquid) {
                try { bolt.kill(); } catch (_) {}
                _fireImpact(dim, pos);
                return;
            }
        } catch (_) {}

        // Helix trail — 4 particles rotating around bolt axis per step
        const radius = 0.22;
        for (let j = 0; j < 4; j++) {
            const rad = ((step + j / 4) / 6.0) * Math.PI * 2;
            const cos = Math.cos(rad) * radius, sin = Math.sin(rad) * radius;
            try { dim.spawnParticle('minecraft:basic_flame_particle', {
                x: pos.x + right.x * cos + up2.x * sin,
                y: pos.y + right.y * cos + up2.y * sin,
                z: pos.z + right.z * cos + up2.z * sin
            }); } catch (_) {}
        }

        // Entity hit
        try {
            const near = dim.getEntities({ location: { x: pos.x, y: pos.y - 0.8, z: pos.z }, maxDistance: 1.5,
                excludeTypes: ['minecraft:item', 'lotm:wisp', 'lotm:firebolt'] });
            for (const e of near) {
                if (!e.isValid() || e.id === player.id) continue;
                try { bolt.kill(); } catch (_) {}
                try { e.applyDamage(DAMAGE, { cause: 'magic', damagingEntity: player }); } catch (_) { try { e.applyDamage(DAMAGE); } catch (_) {} }
                try { e.setOnFire(5, true); } catch (_) {}
                _fireImpact(dim, pos);
                return;
            }
        } catch (_) {}

        system.runTimeout(tick, 1);
    };
    system.runTimeout(tick, 1);
}

function _fireImpact(dim, pos) {
    try { dim.spawnParticle('minecraft:large_explosion', pos); } catch (_) {}
    for (let j = 0; j < 10; j++) {
        const a = (j / 10) * Math.PI * 2;
        try { dim.spawnParticle('minecraft:basic_flame_particle', { x: pos.x + Math.cos(a) * 0.4, y: pos.y, z: pos.z + Math.sin(a) * 0.4 }); } catch (_) {}
    }
}

function _castFireball(player) {
    const view  = player.getViewDirection();
    const eye   = player.getHeadLocation();
    const dim   = player.dimension;
    const SPEED = 0.55, STEPS = 55, DAMAGE = 25, AOE = 5;

    const spawnPos = { x: eye.x + view.x * 2, y: eye.y, z: eye.z + view.z * 2 };
    let fb;
    try { fb = dim.spawnEntity('lotm:firebolt', spawnPos); } catch (_) { return; }
    if (!fb) return;

    const pos = { ...spawnPos };
    let step = 0;
    let vy = view.y + 0.15; // slight upward arc at launch

    player.playSound('mob.ghast.fireball', { pitch: 1.0, volume: 1.0 });

    const tick = () => {
        if (!fb.isValid() || step++ >= STEPS) {
            try { if (fb.isValid()) fb.kill(); } catch (_) {}
            return;
        }

        pos.x += view.x * SPEED;
        pos.y += vy * SPEED;
        pos.z += view.z * SPEED;
        vy -= 0.022; // gravity

        try { fb.teleport(pos); } catch (_) {}

        // Block hit
        let blockHit = false;
        try {
            const block = dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) });
            if (block && !block.isAir && !block.isLiquid) blockHit = true;
        } catch (_) {}

        // Entity hit
        let entityHit = false;
        if (!blockHit) {
            try {
                const near = dim.getEntities({ location: pos, maxDistance: 1.2, excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'lotm:wisp', 'lotm:firebolt'] });
                for (const e of near) {
                    if (e.id === player.id || e.id === fb.id) continue;
                    entityHit = true; break;
                }
            } catch (_) {}
        }

        if (blockHit || entityHit) {
            try { fb.kill(); } catch (_) {}
            try { dim.spawnParticle('minecraft:huge_explosion_emitter', pos); } catch (_) {}
            for (let j = 0; j < 16; j++) {
                const a = (j / 16) * Math.PI * 2;
                try { dim.spawnParticle('minecraft:basic_flame_particle', { x: pos.x + Math.cos(a) * 1.5, y: pos.y, z: pos.z + Math.sin(a) * 1.5 }); } catch (_) {}
            }
            player.playSound('random.explode', { pitch: 0.9, volume: 1.5 });
            try {
                const splash = dim.getEntities({ location: pos, maxDistance: AOE, excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'lotm:wisp', 'lotm:firebolt'] });
                for (const e of splash) {
                    if (e.id === player.id) continue;
                    const dx = e.location.x - pos.x, dy = e.location.y - pos.y, dz = e.location.z - pos.z;
                    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    const dmg = Math.round(DAMAGE * Math.max(0, 1 - dist / AOE));
                    if (dmg <= 0) continue;
                    try { e.applyDamage(dmg, { damagingEntity: player }); } catch (_) {}
                    try { e.setOnFire(4, true); } catch (_) {}
                }
            } catch (_) {}
            return;
        }

        system.runTimeout(tick, 1);
    };
    system.runTimeout(tick, 1);
}

function _castFireWall(player) {
    const dir = player.getViewDirection();
    const dim = player.dimension;

    const center = {
        x: player.location.x + dir.x * 4,
        y: player.location.y,
        z: player.location.z + dir.z * 4
    };

    const len = Math.sqrt(dir.x * dir.x + dir.z * dir.z) || 1;
    const px = -dir.z / len, pz = dir.x / len;

    // Self-contained tick loop — 100 ticks = 5 s at 20 TPS, renders every 2 ticks
    // Avoids Date.now() timing drift; wall stops the instant the last timeout fires.
    for (let t = 0; t < 100; t += 2) {
        system.runTimeout(() => {
            for (const w of [-1.5, -0.5, 0.5, 1.5]) {
                for (let h = 0; h <= 2; h++) {
                    const pos = { x: center.x + px*w, y: center.y + h, z: center.z + pz*w };
                    try { dim.spawnParticle('minecraft:basic_flame_particle', pos); } catch (_) {}
                    try { dim.spawnParticle('minecraft:mobflame_single', { x: pos.x, y: pos.y + 0.2, z: pos.z }); } catch (_) {}
                    for (const e of dim.getEntities({ location: pos, maxDistance: 0.9 })) {
                        if (!e.isValid() || e.id === player.id) continue;
                        try { e.applyDamage(2, { damagingEntity: player }); } catch (_) {}
                        try { e.setOnFire(3, true); } catch (_) {}
                    }
                }
            }
        }, t);
    }
}

function _castBlazingSpear(player) {
    const view  = player.getViewDirection();
    const eye   = player.getHeadLocation();
    const dim   = player.dimension;
    const SPEED = 0.55, STEPS = 38, DAMAGE = 20;

    const start = { x: eye.x + view.x * 1.5, y: eye.y, z: eye.z + view.z * 1.5 };

    const hLen = Math.sqrt(view.x * view.x + view.z * view.z) || 1;
    const pAx = -view.z / hLen, pAz = view.x / hLen;

    // Thick cross-section particle offsets (ThrownSpear visual weight)
    const offsets = [
        [0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.3],
        [0.28, 0.28], [-0.28, 0.28], [0.28, -0.2], [-0.28, -0.2]
    ];

    let spear;
    try { spear = dim.spawnEntity('lotm:flame_spear', start); } catch (_) { return; }
    if (!spear) return;

    player.playSound('item.trident.throw', { pitch: 0.6, volume: 1.2 });

    const yaw   = Math.atan2(-view.x, view.z) * (180 / Math.PI);
    const hSpd  = Math.sqrt(view.x * view.x + view.z * view.z) * SPEED;
    const pitch = -Math.atan2(view.y * SPEED, hSpd) * (180 / Math.PI);

    const pos = { ...start };
    let step = 0;
    const hit = new Set();

    const tick = () => {
        if (!spear.isValid() || step >= STEPS) {
            try { if (spear.isValid()) spear.kill(); } catch (_) {}
            return;
        }

        pos.x += view.x * SPEED;
        pos.y += view.y * SPEED;
        pos.z += view.z * SPEED;
        step++;
        try { spear.teleport(pos, { rotation: { x: pitch, y: yaw } }); } catch (_) {}

        // Block collision
        try {
            const block = dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) });
            if (block && !block.isAir && !block.isLiquid) {
                try { spear.kill(); } catch (_) {}
                try { dim.spawnParticle('minecraft:huge_explosion_lab_particle', pos); } catch (_) {}
                return;
            }
        } catch (_) {}

        // Thick flame beam cross-section
        for (const [right, up] of offsets) {
            const p = { x: pos.x + pAx * right, y: pos.y + up, z: pos.z + pAz * right };
            try { dim.spawnParticle('minecraft:basic_flame_particle', p); } catch (_) {}
        }

        // Entity hit — probe at torso level
        try {
            const near = dim.getEntities({ location: { x: pos.x, y: pos.y - 0.8, z: pos.z }, maxDistance: 1.4,
                excludeTypes: ['minecraft:item', 'lotm:wisp', 'lotm:flame_spear'] });
            for (const e of near) {
                if (!e.isValid() || e.id === player.id || hit.has(e.id)) continue;
                hit.add(e.id);
                try { e.applyDamage(DAMAGE, { damagingEntity: player }); } catch (_) {}
                try { e.setOnFire(5, true); } catch (_) {}
                try { e.applyKnockback(view.x, view.z, 0.8, 0.2); } catch (_) {}
                try { dim.spawnParticle('minecraft:large_explosion', e.location); } catch (_) {}
            }
        } catch (_) {}

        system.runTimeout(tick, 1);
    };
    system.runTimeout(tick, 1);
}

function _castRingOfFire(player) {
    const center = { ...player.location };
    const dim    = player.dimension;

    player.playSound('mob.ghast.fireball', { pitch: 0.6, volume: 1.2 });

    // 3 concentric rings, each launched 600ms apart — expanding wave effect
    for (let wave = 0; wave < 3; wave++) {
        activeRings.push({
            center:      { ...center },
            dimension:   dim,
            player,
            startTime:   Date.now() + wave * 600,
            lastRadius:  -1,
            hitEntities: new Set()
        });
    }
}

function _castFlamingBarrage(player) {
    const dim = player.dimension;
    const RANGE = 20, DAMAGE = 8, COUNT = 5;

    // Sort nearby hostiles by distance, take closest COUNT
    let targets;
    try {
        targets = dim.getEntities({
            location: player.location,
            maxDistance: RANGE,
            excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'lotm:wisp', 'lotm:firebolt']
        }).filter(e => e.id !== player.id && _isHostile(e));
    } catch (_) { targets = []; }

    if (targets.length === 0) {
        player.sendMessage('§cNo targets in range.');
        return false;
    }

    targets.sort((a, b) => {
        const pl = player.location;
        const da = (a.location.x-pl.x)**2 + (a.location.z-pl.z)**2;
        const db = (b.location.x-pl.x)**2 + (b.location.z-pl.z)**2;
        return da - db;
    });

    player.playSound('mob.ghast.fireball', { pitch: 1.4, volume: 1.0 });

    for (let i = 0; i < COUNT; i++) {
        const target = targets[i % targets.length];
        system.runTimeout(() => {
            if (!target.isValid()) return;
            _launchHomingFireball(player, target, DAMAGE);
        }, i * 4);
    }
    return true;
}

function _launchHomingFireball(player, target, damage) {
    const eye  = player.getHeadLocation();
    const dim  = player.dimension;
    const SPEED = 0.5;
    const HOMING = 0.15; // how sharply it curves per tick

    // Initial direction toward target with slight inaccuracy scaled by distance
    const tLoc = target.location;
    const dx0 = tLoc.x - eye.x, dy0 = (tLoc.y + 1) - eye.y, dz0 = tLoc.z - eye.z;
    const dist = Math.sqrt(dx0*dx0 + dy0*dy0 + dz0*dz0) || 1;
    const inaccuracy = Math.min(0.25, dist / 64); // more spread at range
    const len0 = dist;
    let velX = (dx0/len0 + (Math.random()-0.5)*inaccuracy) * SPEED;
    let velY = (dy0/len0 + (Math.random()-0.5)*inaccuracy) * SPEED;
    let velZ = (dz0/len0 + (Math.random()-0.5)*inaccuracy) * SPEED;

    const spawnPos = { x: eye.x + dx0/len0 * 1.5, y: eye.y, z: eye.z + dz0/len0 * 1.5 };
    let fb;
    try { fb = dim.spawnEntity('lotm:firebolt', spawnPos); } catch (_) { return; }
    if (!fb) return;

    const pos = { ...spawnPos };
    let step = 0;

    player.playSound('mob.blaze.shoot', { pitch: 1.1 + Math.random() * 0.3, volume: 0.9 });

    const tick = () => {
        if (!fb.isValid() || step++ >= 60) {
            try { if (fb.isValid()) fb.kill(); } catch (_) {}
            return;
        }

        // Gently curve velocity toward target each tick (homing)
        if (target.isValid()) {
            const tPos = target.location;
            const tdx = tPos.x - pos.x, tdy = (tPos.y + 1) - pos.y, tdz = tPos.z - pos.z;
            const tLen = Math.sqrt(tdx*tdx + tdy*tdy + tdz*tdz) || 1;
            const tx = tdx/tLen * SPEED, ty = tdy/tLen * SPEED, tz = tdz/tLen * SPEED;
            velX = velX*(1-HOMING) + tx*HOMING;
            velY = velY*(1-HOMING) + ty*HOMING;
            velZ = velZ*(1-HOMING) + tz*HOMING;
            // Re-normalise to keep constant speed
            const vLen = Math.sqrt(velX*velX + velY*velY + velZ*velZ) || 1;
            velX = velX/vLen * SPEED;
            velY = velY/vLen * SPEED;
            velZ = velZ/vLen * SPEED;
        }

        pos.x += velX; pos.y += velY; pos.z += velZ;
        try { fb.teleport(pos); } catch (_) {}

        // Block hit
        let hit = false;
        try {
            const block = dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) });
            if (block && !block.isAir && !block.isLiquid) hit = true;
        } catch (_) {}

        // Entity hit
        let hitEntity = null;
        if (!hit) {
            try {
                const near = dim.getEntities({ location: pos, maxDistance: 1.0, excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'lotm:wisp', 'lotm:firebolt'] });
                for (const e of near) {
                    if (e.id === player.id || e.id === fb.id) continue;
                    hit = true; hitEntity = e; break;
                }
            } catch (_) {}
        }

        if (hit) {
            try { fb.kill(); } catch (_) {}
            try { dim.spawnParticle('minecraft:large_explosion', pos); } catch (_) {}
            for (let j = 0; j < 8; j++) {
                const a = (j / 8) * Math.PI * 2;
                try { dim.spawnParticle('minecraft:basic_flame_particle', { x: pos.x + Math.cos(a)*0.5, y: pos.y, z: pos.z + Math.sin(a)*0.5 }); } catch (_) {}
            }
            if (hitEntity) {
                try { hitEntity.applyDamage(damage, { damagingEntity: player }); } catch (_) {}
                try { hitEntity.setOnFire(3, true); } catch (_) {}
            }
            return;
        }

        system.runTimeout(tick, 1);
    };
    system.runTimeout(tick, 1);
}

// ─── Timed effect tickers ─────────────────────────────────────────────────────

function _tickRing(ring, radius) {
    if (radius - ring.lastRadius < 0.35) return;
    ring.lastRadius = radius;

    const { center, dimension, player, hitEntities } = ring;
    const steps = Math.max(20, Math.floor(radius * 12));

    for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const rx = Math.cos(angle) * radius, rz = Math.sin(angle) * radius;
        const pos = { x: center.x + rx, y: center.y + 0.3, z: center.z + rz };

        try { dimension.spawnParticle('minecraft:basic_flame_particle', pos); } catch (_) {}
        try { dimension.spawnParticle('minecraft:mobflame_single', { ...pos, y: pos.y + 0.8 }); } catch (_) {}

        // Entity check at ground level — entity positions are at feet, ring is horizontal
        for (const e of dimension.getEntities({ location: { x: pos.x, y: center.y, z: pos.z }, maxDistance: 1.2 })) {
            if (!e.isValid() || e.id === player.id || hitEntities.has(e.id)) continue;
            hitEntities.add(e.id);
            try { e.applyDamage(16, { damagingEntity: player }); } catch (_) {}
            try { e.setOnFire(4, true); } catch (_) {}
        }
    }
}

// ─── Burning Dash ────────────────────────────────────────────────────────────

function _castBurningDash(player) {
    const dim   = player.dimension;
    const STEPS = 25; // 25 game-ticks ≈ 1.25 seconds
    const DAMAGE = 8;

    try { player.addEffect('speed', 30, { amplifier: 3, showParticles: false }); } catch (_) {}
    player.playSound('mob.blaze.burn', { pitch: 1.5, volume: 1.0 });

    let step = 0;
    const hit = new Set();

    const id = system.runInterval(() => {
        if (step++ >= STEPS || !player.isValid()) {
            system.clearRun(id);
            return;
        }

        const pos = player.location;

        // Fire trail on block below
        try {
            dim.runCommand(`setblock ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} fire`);
        } catch (_) {}

        // Flame burst particles
        for (let i = 0; i < 4; i++) {
            const ox = (Math.random() - 0.5) * 0.7;
            const oz = (Math.random() - 0.5) * 0.7;
            try { dim.spawnParticle('minecraft:basic_flame_particle', { x: pos.x + ox, y: pos.y + Math.random() * 1.6, z: pos.z + oz }); } catch (_) {}
        }

        // Damage entities in dash path
        try {
            const near = dim.getEntities({
                location: pos, maxDistance: 1.5,
                excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'lotm:wisp', 'lotm:firebolt', 'lotm:flame_spear', 'lotm:fire_arrow']
            });
            for (const e of near) {
                if (!e.isValid() || e.id === player.id || hit.has(e.id)) continue;
                hit.add(e.id);
                try { e.applyDamage(DAMAGE, { damagingEntity: player }); } catch (_) {}
                try { e.setOnFire(4, true); } catch (_) {}
                try { dim.spawnParticle('minecraft:large_explosion_lab_particle', e.location); } catch (_) {}
            }
        } catch (_) {}
    }, 1);
}

// ─── Fire Arrow + Blaze Storm ─────────────────────────────────────────────────

function _castFireArrowBlazeStorm(player) {
    const view = player.getViewDirection();
    const eye  = player.getHeadLocation();

    // Main fire arrow — accurate, fast, slight arc
    _launchFireArrow(player, view, eye);

    // 4 blaze bolts fanning out behind it
    player.playSound('mob.blaze.shoot', { pitch: 1.15, volume: 1.0 });
    const hLen = Math.sqrt(view.x * view.x + view.z * view.z) || 1;
    const rightX = -view.z / hLen, rightZ = view.x / hLen;

    for (let i = 0; i < 4; i++) {
        system.runTimeout(() => {
            const spreadH = (Math.random() - 0.5) * 0.55;
            const spreadV = (Math.random() - 0.5) * 0.35;
            const dir = {
                x: view.x + rightX * spreadH,
                y: view.y + spreadV,
                z: view.z + rightZ * spreadH
            };
            const dLen = Math.sqrt(dir.x*dir.x + dir.y*dir.y + dir.z*dir.z) || 1;
            _launchBlazeBolt(player, { x: dir.x/dLen, y: dir.y/dLen, z: dir.z/dLen }, eye, 8);
        }, 5 + i * 2);
    }
}

function _launchFireArrow(player, view, eye) {
    const dim   = player.dimension;
    const SPEED = 0.85, GRAV = 0.018, STEPS = 55, DAMAGE = 22;

    const start = { x: eye.x + view.x * 1.5, y: eye.y, z: eye.z + view.z * 1.5 };
    let arrow;
    try { arrow = dim.spawnEntity('lotm:fire_arrow', start); } catch (_) { return; }
    if (!arrow) return;

    player.playSound('item.trident.throw', { pitch: 1.1, volume: 1.0 });

    const yaw = Math.atan2(-view.x, view.z) * (180 / Math.PI);
    const pos  = { ...start };
    let vy     = view.y;
    let step   = 0;
    const hit  = new Set();

    const tick = () => {
        if (!arrow.isValid() || step >= STEPS) {
            try { if (arrow.isValid()) arrow.kill(); } catch (_) {}
            return;
        }

        pos.x += view.x * SPEED;
        pos.y += vy      * SPEED;
        pos.z += view.z  * SPEED;
        vy    -= GRAV;
        step++;

        const hSpd  = Math.sqrt(view.x*view.x + view.z*view.z) * SPEED;
        const pitch = -Math.atan2(vy * SPEED, hSpd) * (180 / Math.PI);
        try { arrow.teleport(pos, { rotation: { x: pitch, y: yaw } }); } catch (_) {}

        // Trailing flame
        try { dim.spawnParticle('minecraft:basic_flame_particle', pos); } catch (_) {}

        // Block collision
        try {
            const block = dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) });
            if (block && !block.isAir && !block.isLiquid) {
                try { arrow.kill(); } catch (_) {}
                _fireImpact(dim, pos);
                return;
            }
        } catch (_) {}

        // Entity hit
        try {
            const near = dim.getEntities({
                location: { x: pos.x, y: pos.y - 0.5, z: pos.z }, maxDistance: 1.3,
                excludeTypes: ['minecraft:item', 'lotm:wisp', 'lotm:fire_arrow', 'lotm:firebolt']
            });
            for (const e of near) {
                if (!e.isValid() || e.id === player.id || hit.has(e.id)) continue;
                hit.add(e.id);
                try { e.applyDamage(DAMAGE, { damagingEntity: player }); } catch (_) {}
                try { e.setOnFire(5, true); } catch (_) {}
                try { arrow.kill(); } catch (_) {}
                _fireImpact(dim, pos);
                return;
            }
        } catch (_) {}

        system.run(tick);
    };

    system.run(tick);
}

function _launchBlazeBolt(player, dir, eye, damage) {
    const dim   = player.dimension;
    const SPEED = 0.7, STEPS = 35;

    const start = { x: eye.x + dir.x * 1.5, y: eye.y, z: eye.z + dir.z * 1.5 };
    let bolt;
    try { bolt = dim.spawnEntity('lotm:firebolt', start); } catch (_) { return; }
    if (!bolt) return;

    const pos  = { ...start };
    let step   = 0;
    const hit  = new Set();

    const tick = () => {
        if (!bolt.isValid() || step >= STEPS) {
            try { if (bolt.isValid()) bolt.kill(); } catch (_) {}
            return;
        }

        pos.x += dir.x * SPEED;
        pos.y += dir.y * SPEED;
        pos.z += dir.z * SPEED;
        step++;
        try { bolt.teleport(pos); } catch (_) {}

        const a = step * 0.6;
        try { dim.spawnParticle('minecraft:basic_flame_particle', { x: pos.x + Math.cos(a)*0.2, y: pos.y, z: pos.z + Math.sin(a)*0.2 }); } catch (_) {}

        try {
            const block = dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) });
            if (block && !block.isAir && !block.isLiquid) {
                try { bolt.kill(); } catch (_) {}
                return;
            }
        } catch (_) {}

        try {
            const near = dim.getEntities({
                location: pos, maxDistance: 1.0,
                excludeTypes: ['minecraft:item', 'lotm:wisp', 'lotm:firebolt', 'lotm:fire_arrow']
            });
            for (const e of near) {
                if (!e.isValid() || e.id === player.id || hit.has(e.id)) continue;
                hit.add(e.id);
                try { e.applyDamage(damage, { damagingEntity: player }); } catch (_) {}
                try { e.setOnFire(3, true); } catch (_) {}
                try { bolt.kill(); } catch (_) {}
                return;
            }
        } catch (_) {}

        system.run(tick);
    };

    system.run(tick);
}
