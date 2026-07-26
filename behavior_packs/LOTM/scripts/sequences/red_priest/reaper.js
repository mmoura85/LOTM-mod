import { system, EntityDamageCause } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';

const EFFECT_DURATION = 999999;
const BASE_SPIRIT     = 200;
const DANGER_RADIUS   = 30;
const TRAP_RADIUS     = 10;
const SCAN_INTERVAL_MS      = 2000;
const TRAP_SCAN_INTERVAL_MS = 1000;

// Same damage as Conspirer but significantly reduced spirit costs
// Flame Transform: cd dropped to 1s, cost halved, range doubled
const SPELLS = {
    fire_bolt:        { cost: 5,  cooldownMs: 1600,  label: '§cFire Bolt §7(5 sp)',          damage: 35  },
    fireball:         { cost: 12, cooldownMs: 3000,  label: '§6Fireball §7(12 sp)',           damage: 62, aoe: 6 },
    fire_wall:        { cost: 13, cooldownMs: 4500,  label: '§eFire Wall §7(13 sp)',          damage: 5   },
    blazing_spear:    { cost: 9,  cooldownMs: 3000,  label: '§cBlazing Spear §7(9 sp)',       damage: 50  },
    ring_of_fire:     { cost: 16, cooldownMs: 6000,  label: '§4Ring of Fire §7(16 sp)',       damage: 40  },
    flaming_barrage:  { cost: 14, cooldownMs: 8000,  label: '§6Flaming Barrage §7(14 sp)',    damage: 20  },
    burning_dash:     { cost: 12, cooldownMs: 5000,  label: '§4Burning Dash §7(12 sp)',       damage: 20  },
    fire_arrow_blaze: { cost: 13, cooldownMs: 6000,  label: '§6Fire Arrow Storm §7(13 sp)',   damage: 55  },
    flame_transform:  { cost: 8,  cooldownMs: 1000,  label: '§6Flame Transform §7(8 sp)'     }, // 1s cd
    incitement:       { cost: 16, cooldownMs: 5000,  label: '§cIncitement §7(16 sp)'         },
    conspiracy:       { cost: 14, cooldownMs: 10000, label: '§5Conspiracy §7(14 sp)'         },
    conjure_blade:    { cost: 18, cooldownMs: 60000, label: '§4Conjure Flame Blade §7(18 sp)'},
    cull:             { cost: 30, cooldownMs: 15000, label: '§4§lCull §7(30 sp)'             },
};
const SPELL_KEYS = Object.keys(SPELLS);

const spellCooldowns    = new Map();
const selectedSpell     = new Map();
const lastDangerScan    = new Map();
const lastTrapScan      = new Map();
const activeRings       = [];
const activeIncitements = new Map();
const cullActiveUntil   = new Map(); // playerId → expiry timestamp
const cullHitCounts     = new Map(); // "playerId:entityId" → hit count

const TRAP_BLOCK_IDS = [
    'lotm:spike_trap', 'lotm:wooden_spike_trap',
    'lotm:bear_trap', 'lotm:fake_grass',
    'lotm:fire_trap', 'lotm:fire_trap_large'
];

export class ReaperSequence {
    static SEQUENCE_NUMBER = 5;
    static PATHWAY         = 'red_priest';
    static BASE_SPIRIT     = BASE_SPIRIT;

    static applyPassiveAbilities(player) {
        _applyEffect(player, 'fire_resistance', 0);
        _applyEffect(player, 'night_vision', 0);
        _applyEffect(player, 'strength', 3);      // Strength IV
        _applyEffect(player, 'speed', 2);          // Speed III
        _applyEffect(player, 'jump_boost', 2);     // Jump Boost III
        _applyEffect(player, 'regeneration', 0);
        _applyEffect(player, 'health_boost', 5);   // +6 hearts
        _applyEffect(player, 'resistance', 1);     // Resistance II — endurance upgrade

        const now = Date.now();
        if (now - (lastDangerScan.get(player.id) || 0) > SCAN_INTERVAL_MS) {
            lastDangerScan.set(player.id, now);
            _scanDangerColored(player);
        }
        if (now - (lastTrapScan.get(player.id) || 0) > TRAP_SCAN_INTERVAL_MS) {
            lastTrapScan.set(player.id, now);
            _scanTraps(player);
        }

        // Show Cull status on action bar if active
        const cullUntil = cullActiveUntil.get(player.id) || 0;
        if (now < cullUntil) {
            const remaining = Math.ceil((cullUntil - now) / 1000);
            try {
                player.onScreenDisplay.setActionBar(`§4§l⚔ CULL ACTIVE §r§7(${remaining}s)`);
            } catch (_) {}
        }
    }

    static removeEffects(player) {
        for (const eff of ['fire_resistance', 'night_vision', 'strength', 'speed',
                           'jump_boost', 'regeneration', 'health_boost', 'resistance']) {
            try { player.removeEffect(eff); } catch (_) {}
        }
        const id = activeIncitements.get(player.id);
        if (id !== undefined) { system.clearRun(id); activeIncitements.delete(player.id); }
        cullActiveUntil.delete(player.id);
    }

    // Called from entityHitEntity in main.js
    static onMeleeHit(player, victim) {
        // Base melee: 10s burn + heavy bonus damage
        try { victim.setOnFire(10, true); } catch (_) {}
        try { victim.applyDamage(6, { damagingEntity: player }); } catch (_) {}

        const now = Date.now();
        const cullUntil = cullActiveUntil.get(player.id) || 0;
        if (now > cullUntil) return;

        const key = `${player.id}:${victim.id}`;
        const count = (cullHitCounts.get(key) || 0) + 1;
        cullHitCounts.set(key, count);

        // Escalating damage — each consecutive Cull hit on the same target hits harder
        const bonusDmg = count === 1 ? 20 : count === 2 ? 35 : 60;
        const witherAmp = Math.min(count - 1, 2); // 0, 1, 2
        try { victim.applyDamage(bonusDmg, { damagingEntity: player }); } catch (_) {}
        try { victim.addEffect('wither', 80, { amplifier: witherAmp, showParticles: true }); } catch (_) {}
        try { victim.addEffect('weakness', 60, { amplifier: 1, showParticles: false }); } catch (_) {}

        // Cull life harvest — slight heal
        try {
            const health = player.getComponent('minecraft:health');
            if (health) health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + 3));
        } catch (_) {}

        // Third hit = vital strike
        if (count >= 3) {
            try { victim.applyKnockback(0, 0, 0, 3.0); } catch (_) {}
            try { player.dimension.spawnParticle('minecraft:large_explosion', victim.location); } catch (_) {}
            try { player.playSound('mob.elder_guardian.curse', { pitch: 1.4, volume: 1.0 }); } catch (_) {}
            player.sendMessage('§4§l⚔ VITAL STRIKE! §r§7Their weakness is fully exposed!');
            cullHitCounts.delete(key);
        } else {
            player.sendMessage(`§4⚔ Cull hit §c${count}/3`);
        }

        // Crimson flash on the victim
        try {
            const pos = victim.location;
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                player.dimension.spawnParticle('minecraft:basic_flame_particle', {
                    x: pos.x + Math.cos(a) * 0.4, y: pos.y + 1, z: pos.z + Math.sin(a) * 0.4
                });
            }
        } catch (_) {}
    }

    static async openSpellMenu(player) {
        const form = new ActionFormData()
            .title('§4§lReaper Abilities')
            .body('Select ability to attune:');
        for (const key of SPELL_KEYS) form.button(SPELLS[key].label);
        try {
            const result = await form.show(player);
            if (result.canceled || result.selection === undefined) return;
            const key = SPELL_KEYS[result.selection];
            selectedSpell.set(player.id, key);
            player.sendMessage(`§6Attuned: §e${SPELLS[key].label}`);
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
            case 'fire_bolt':        _castFireBolt(player);            break;
            case 'fireball':         _castFireball(player);            break;
            case 'fire_wall':        _castFireWall(player);            break;
            case 'blazing_spear':    _castBlazingSpear(player);        break;
            case 'ring_of_fire':     _castRingOfFire(player);          break;
            case 'flaming_barrage':  ok = _castFlamingBarrage(player); break;
            case 'burning_dash':     _castBurningDash(player);         break;
            case 'fire_arrow_blaze': _castFireArrowBlazeStorm(player); break;
            case 'flame_transform':  _castFlameTransform(player);      break;
            case 'incitement':       ok = _castIncitement(player);     break;
            case 'conspiracy':       ok = _castConspiracy(player);     break;
            case 'conjure_blade':    _conjureFlameBlade(player);       break;
            case 'cull':             _activateCull(player);            break;
        }

        if (!ok) {
            spellCooldowns.delete(cdKey);
            SpiritSystem.restoreSpirit(player, config.cost);
        }
    }

    static tickEffects() {
        const now = Date.now();
        // Clean expired Cull sessions and their hit tracking
        for (const [pid, until] of cullActiveUntil) {
            if (now > until) {
                cullActiveUntil.delete(pid);
                for (const key of cullHitCounts.keys()) {
                    if (key.startsWith(pid + ':')) cullHitCounts.delete(key);
                }
            }
        }
        // Tick expanding rings
        for (let i = activeRings.length - 1; i >= 0; i--) {
            const ring = activeRings[i];
            const radius = (now - ring.startTime) / 1000 * 6;
            if (radius > 14) { activeRings.splice(i, 1); continue; }
            try { _tickRing(ring, radius); } catch (_) {}
        }
    }
}

// ─── Passive helpers ──────────────────────────────────────────────────────────

function _applyEffect(player, effect, amplifier) {
    try {
        const e = player.getEffect(effect);
        if (!e || e.amplifier < amplifier || e.duration < 200) {
            player.addEffect(effect, EFFECT_DURATION, { amplifier, showParticles: false });
        }
    } catch (_) {}
}

function _scanDangerColored(player) {
    try {
        const entities = player.dimension.getEntities({ location: player.location, maxDistance: DANGER_RADIUS });
        for (const e of entities) {
            if (!e.isValid() || e === player || e.typeId === 'minecraft:player') continue;
            const tier = _classifyEntity(e);
            if (!tier) continue;
            const pos = { x: e.location.x, y: e.location.y + 2.2, z: e.location.z };
            try {
                switch (tier) {
                    case 'animal':    player.dimension.spawnParticle('minecraft:villager_happy',      pos); break;
                    case 'hostile':   player.dimension.spawnParticle('minecraft:wax_on',              pos); break;
                    case 'dangerous': player.dimension.spawnParticle('minecraft:villager_angry',      pos); break;
                    case 'beyonder':  player.dimension.spawnParticle('minecraft:totem_particle',      pos); break;
                    case 'rampager':  player.dimension.spawnParticle('minecraft:basic_flame_particle',pos); break;
                }
            } catch (_) {}
        }
    } catch (_) {}
}

function _classifyEntity(entity) {
    const id = entity.typeId;
    if (id === 'lotm:rampager' || id === 'lotm:voidwatcher') return 'rampager';
    if (id === 'lotm:soldier' || id === 'lotm:clown' || id === 'lotm:ghost' || id === 'lotm:vengeful_ghost') return 'beyonder';
    if (id === 'lotm:ghoul' || id === 'lotm:shade' || id === 'lotm:rimewraith' || id === 'lotm:poltergeist' ||
        id === 'lotm:dire_wolf' || id === 'lotm:dire_bear' || id === 'lotm:ogre') return 'dangerous';
    try {
        if (entity.matches({ families: ['monster'] })) return 'hostile';
        if (entity.matches({ families: ['undead'] }))  return 'hostile';
    } catch (_) {}
    try {
        if (entity.matches({ families: ['animal'] }))  return 'animal';
        if (entity.matches({ families: ['passive'] })) return 'animal';
    } catch (_) {}
    return null;
}

function _scanTraps(player) {
    const { x: cx, y: cy, z: cz } = player.location;
    const fcx = Math.floor(cx), fcy = Math.floor(cy), fcz = Math.floor(cz);
    for (let dx = -TRAP_RADIUS; dx <= TRAP_RADIUS; dx += 2) {
        for (let dz = -TRAP_RADIUS; dz <= TRAP_RADIUS; dz += 2) {
            for (let dy = -2; dy <= 2; dy++) {
                try {
                    const block = player.dimension.getBlock({ x: fcx+dx, y: fcy+dy, z: fcz+dz });
                    if (block && TRAP_BLOCK_IDS.includes(block.typeId)) {
                        player.dimension.spawnParticle('minecraft:wax_off', {
                            x: fcx+dx+0.5, y: fcy+dy+1.1, z: fcz+dz+0.5
                        });
                    }
                } catch (_) {}
            }
        }
    }
}

// ─── Cull ─────────────────────────────────────────────────────────────────────

function _activateCull(player) {
    cullActiveUntil.set(player.id, Date.now() + 10000);
    // Clear any old hit counters for this player
    for (const key of cullHitCounts.keys()) {
        if (key.startsWith(player.id + ':')) cullHitCounts.delete(key);
    }
    player.sendMessage('§4§l⚔ CULL ACTIVATED! §r§7Strike vital points — 3 hits to break them.');
    try { player.playSound('mob.elder_guardian.curse', { pitch: 1.0, volume: 1.2 }); } catch (_) {}
    // Dark crimson aura
    try {
        const pos = player.location;
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            player.dimension.spawnParticle('minecraft:basic_flame_particle', {
                x: pos.x + Math.cos(a) * 0.8, y: pos.y + 1.2, z: pos.z + Math.sin(a) * 0.8
            });
        }
    } catch (_) {}
}

// ─── Incitement (inherited from Conspirer) ────────────────────────────────────

function _castIncitement(player) {
    const existing = activeIncitements.get(player.id);
    if (existing !== undefined) { system.clearRun(existing); activeIncitements.delete(player.id); }
    const RANGE = 28, DURATION_TICKS = 300;
    let ticksLeft = DURATION_TICKS;
    _doIncite(player, RANGE);
    player.sendMessage('§c§lIncitement! §r§7Mobs fight for 15 seconds.');
    player.playSound('mob.ghast.scream', { pitch: 1.2, volume: 0.8 });
    const id = system.runInterval(() => {
        if (!player.isValid() || ticksLeft <= 0) {
            system.clearRun(id); activeIncitements.delete(player.id);
            if (ticksLeft <= 0) try { player.sendMessage('§7Incitement fades...'); } catch(_) {}
            return;
        }
        ticksLeft -= 60;
        _doIncite(player, RANGE);
    }, 60);
    activeIncitements.set(player.id, id);
    return true;
}

function _doIncite(player, range) {
    try {
        const targets = player.dimension.getEntities({ location: player.location, maxDistance: range })
            .filter(e => e.typeId !== 'minecraft:player' && e.isValid() && _isHostile(e));
        if (targets.length < 2) return;
        for (const mob of targets) {
            const others = targets.filter(t => t.id !== mob.id);
            if (others.length === 0) continue;
            const victim = others[Math.floor(Math.random() * others.length)];
            try { victim.applyDamage(2, { cause: EntityDamageCause.entityAttack, damagingEntity: mob }); } catch (_) {}
            try { mob.addEffect('strength', 120, { amplifier: 2, showParticles: false }); } catch (_) {}
            try { player.dimension.spawnParticle('minecraft:villager_angry', { x: mob.location.x, y: mob.location.y + 1.5, z: mob.location.z }); } catch (_) {}
        }
    } catch (_) {}
}

function _isHostile(entity) {
    try {
        if (entity.matches({ families: ['monster'] })) return true;
        if (entity.matches({ families: ['undead'] }))  return true;
    } catch (_) {}
    return ['lotm:dire_wolf','lotm:dire_bear','lotm:rampager','lotm:voidwatcher','lotm:ghoul','lotm:shade','lotm:rimewraith','lotm:ogre'].includes(entity.typeId);
}

// ─── Conspiracy ───────────────────────────────────────────────────────────────

function _castConspiracy(player) {
    const dim = player.dimension;
    try { player.addEffect('invisibility', 140, { amplifier: 0, showParticles: false }); } catch (_) {}
    try { player.addEffect('speed', 100, { amplifier: 3, showParticles: false }); } catch (_) {}
    const origPos = { ...player.location };
    try {
        const mobs = dim.getEntities({ location: origPos, maxDistance: 22 })
            .filter(e => e.typeId !== 'minecraft:player' && e.isValid() && _isHostile(e));
        for (const mob of mobs.slice(0, 10)) {
            try { mob.addEffect('blindness', 100, { amplifier: 0, showParticles: true }); } catch (_) {}
            try { mob.addEffect('slowness', 50, { amplifier: 1, showParticles: false }); } catch (_) {}
        }
    } catch (_) {}
    for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        try { dim.spawnParticle('minecraft:dragon_breath_trail', {
            x: origPos.x + Math.cos(a) * 0.7, y: origPos.y + 1, z: origPos.z + Math.sin(a) * 0.7
        }); } catch (_) {}
    }
    player.sendMessage('§5§lConspiracy! §7You vanish from their perception...');
    player.playSound('mob.endermen.portal', { pitch: 1.2, volume: 0.8 });
    return true;
}

// ─── Flame Transform (Seq 5 — near-instant, 30 block range) ──────────────────

function _castFlameTransform(player) {
    const view  = player.getViewDirection();
    const eye   = player.getHeadLocation();
    const dim   = player.dimension;
    const SPEED = 0.7, MAX_DIST = 30;

    const pos = { x: eye.x + view.x * 1.5, y: eye.y, z: eye.z + view.z * 1.5 };
    let dist  = 0;
    let bolt;
    try { bolt = dim.spawnEntity('lotm:firebolt', pos); } catch (_) { return; }
    if (!bolt) return;

    player.playSound('mob.blaze.shoot', { pitch: 0.7, volume: 1.0 });

    const tick = () => {
        if (!bolt.isValid() || dist >= MAX_DIST) {
            try { if (bolt.isValid()) bolt.kill(); } catch (_) {}
            return;
        }
        pos.x += view.x * SPEED; pos.y += view.y * SPEED; pos.z += view.z * SPEED;
        dist  += SPEED;
        try { bolt.teleport(pos); } catch (_) {}
        try { dim.spawnParticle('minecraft:mobflame_single', pos); } catch (_) {}
        try { dim.spawnParticle('minecraft:basic_flame_particle', pos); } catch (_) {}

        let hitPos = null;
        try {
            const block = dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) });
            if (block && !block.isAir && !block.isLiquid) {
                hitPos = { x: pos.x, y: Math.floor(pos.y) + 1, z: pos.z };
            }
        } catch (_) {}
        if (!hitPos) {
            try {
                const near = dim.getEntities({ location: pos, maxDistance: 1.2,
                    excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'lotm:firebolt', 'lotm:wisp'] });
                for (const e of near) {
                    if (!e.isValid() || e.id === player.id || e.id === bolt.id) continue;
                    try { e.setOnFire(10, true); } catch (_) {}
                    try { e.applyDamage(20, { damagingEntity: player }); } catch (_) {}
                    hitPos = { x: pos.x, y: pos.y, z: pos.z };
                    break;
                }
            } catch (_) {}
        }

        if (hitPos) {
            try { bolt.kill(); } catch (_) {}
            try { player.teleport(hitPos); } catch (_) {}
            for (let i = 0; i < 14; i++) {
                const a = (i / 14) * Math.PI * 2;
                try { dim.spawnParticle('minecraft:mobflame_single', {
                    x: hitPos.x + Math.cos(a), y: hitPos.y + 0.5, z: hitPos.z + Math.sin(a)
                }); } catch (_) {}
            }
            try { dim.spawnParticle('minecraft:huge_explosion_emitter', hitPos); } catch (_) {}
            player.playSound('mob.ghast.fireball', { pitch: 1.5, volume: 0.8 });
            return;
        }

        system.runTimeout(tick, 1);
    };
    system.runTimeout(tick, 1);
}

// ─── Conjure Blade ────────────────────────────────────────────────────────────

function _conjureFlameBlade(player) {
    try {
        player.runCommand('give @s lotm:flame_sword 1');
        player.sendMessage('§4§lFlame Blade conjured!');
        player.playSound('fire.fire', { pitch: 0.5, volume: 1.2 });
        const pos = player.location;
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            try { player.dimension.spawnParticle('minecraft:basic_flame_particle', {
                x: pos.x + Math.cos(a) * 0.7, y: pos.y + 1.2, z: pos.z + Math.sin(a) * 0.7
            }); } catch (_) {}
        }
    } catch (_) {}
}

// ─── Spell implementations (same as Conspirer, using reduced costs above) ─────

function _castFireBolt(player) {
    const view=player.getViewDirection(), eye=player.getHeadLocation(), dim=player.dimension;
    const SPEED=0.8, STEPS=48, DAMAGE=SPELLS.fire_bolt.damage;
    const start={ x:eye.x+view.x*1.5, y:eye.y, z:eye.z+view.z*1.5 };
    const hLen=Math.sqrt(view.x*view.x+view.z*view.z)||1;
    const right={ x:-view.z/hLen, y:0, z:view.x/hLen };
    const up2={ x:right.y*view.z-right.z*view.y, y:right.z*view.x-right.x*view.z, z:right.x*view.y-right.y*view.x };
    let bolt; try { bolt=dim.spawnEntity('lotm:firebolt',start); } catch(_) { return; }
    if (!bolt) return;
    player.playSound('fire.fire', { pitch:1.4, volume:1.0 });
    const pos={ ...start }; let step=0;
    const tick=()=> {
        if (!bolt.isValid()||step>=STEPS) { try { if(bolt.isValid())bolt.kill(); } catch(_) {} return; }
        pos.x+=view.x*SPEED; pos.y+=view.y*SPEED; pos.z+=view.z*SPEED; step++;
        try { bolt.teleport(pos); } catch(_) {}
        try { const block=dim.getBlock({ x:Math.floor(pos.x), y:Math.floor(pos.y), z:Math.floor(pos.z) }); if(block&&!block.isAir&&!block.isLiquid){ try{bolt.kill();}catch(_){} _fireImpact(dim,pos); return; } } catch(_) {}
        const radius=0.25;
        for (let j=0;j<4;j++) { const rad=((step+j/4)/6.0)*Math.PI*2; const cos=Math.cos(rad)*radius,sin=Math.sin(rad)*radius; try { dim.spawnParticle('minecraft:mobflame_single',{ x:pos.x+right.x*cos+up2.x*sin, y:pos.y+right.y*cos+up2.y*sin, z:pos.z+right.z*cos+up2.z*sin }); } catch(_) {} }
        try { const near=dim.getEntities({ location:{ x:pos.x, y:pos.y-0.8, z:pos.z }, maxDistance:1.5, excludeTypes:['minecraft:item','lotm:wisp','lotm:firebolt'] }); for(const e of near){ if(!e.isValid()||e.id===player.id)continue; try{bolt.kill();}catch(_){} try{e.applyDamage(DAMAGE,{cause:'magic',damagingEntity:player});}catch(_){try{e.applyDamage(DAMAGE);}catch(_){}} try{e.setOnFire(10,true);}catch(_){} _fireImpact(dim,pos); return; } } catch(_) {}
        system.runTimeout(tick,1);
    };
    system.runTimeout(tick,1);
}

function _castFireball(player) {
    const view=player.getViewDirection(), eye=player.getHeadLocation(), dim=player.dimension;
    const SPEED=0.65, STEPS=65, DAMAGE=SPELLS.fireball.damage, AOE=6;
    const spawnPos={ x:eye.x+view.x*2, y:eye.y, z:eye.z+view.z*2 };
    let fb; try { fb=dim.spawnEntity('lotm:firebolt',spawnPos); } catch(_) { return; }
    if (!fb) return;
    const pos={ ...spawnPos }; let step=0, vy=view.y+0.1;
    player.playSound('mob.ghast.fireball', { pitch:0.85, volume:1.3 });
    const tick=()=> {
        if (!fb.isValid()||step++>=STEPS) { try { if(fb.isValid())fb.kill(); } catch(_) {} return; }
        pos.x+=view.x*SPEED; pos.y+=vy*SPEED; pos.z+=view.z*SPEED; vy-=0.018;
        try { fb.teleport(pos); } catch(_) {}
        let blockHit=false, entityHit=false;
        try { const block=dim.getBlock({ x:Math.floor(pos.x), y:Math.floor(pos.y), z:Math.floor(pos.z) }); if(block&&!block.isAir&&!block.isLiquid)blockHit=true; } catch(_) {}
        if (!blockHit) { try { const near=dim.getEntities({ location:pos, maxDistance:1.3, excludeTypes:['minecraft:item','minecraft:xp_orb','lotm:wisp','lotm:firebolt'] }); for(const e of near){ if(e.id===player.id||e.id===fb.id)continue; entityHit=true; break; } } catch(_) {} }
        if (blockHit||entityHit) {
            try { fb.kill(); } catch(_) {}
            try { dim.spawnParticle('minecraft:huge_explosion_emitter', pos); } catch(_) {}
            player.playSound('random.explode', { pitch:0.75, volume:2.0 });
            try { const splash=dim.getEntities({ location:pos, maxDistance:AOE, excludeTypes:['minecraft:item','minecraft:xp_orb','lotm:wisp','lotm:firebolt'] }); for(const e of splash){ if(e.id===player.id)continue; const dx=e.location.x-pos.x, dy=e.location.y-pos.y, dz=e.location.z-pos.z; const dist=Math.sqrt(dx*dx+dy*dy+dz*dz); const dmg=Math.round(DAMAGE*Math.max(0,1-dist/AOE)); if(dmg<=0)continue; try{e.applyDamage(dmg,{damagingEntity:player});}catch(_){} try{e.setOnFire(10,true);}catch(_){} } } catch(_) {}
            return;
        }
        system.runTimeout(tick,1);
    };
    system.runTimeout(tick,1);
}

function _castFireWall(player) {
    const dir=player.getViewDirection(), dim=player.dimension;
    const center={ x:player.location.x+dir.x*6, y:player.location.y, z:player.location.z+dir.z*6 };
    const len=Math.sqrt(dir.x*dir.x+dir.z*dir.z)||1;
    const px=-dir.z/len, pz=dir.x/len;
    const DAMAGE=SPELLS.fire_wall.damage;
    for (let t=0;t<140;t+=2) {
        system.runTimeout(()=> {
            for (const w of [-2,-1,0,1,2]) { for (let h=0;h<=3;h++) {
                const pos={ x:center.x+px*w, y:center.y+h, z:center.z+pz*w };
                try { dim.spawnParticle('minecraft:mobflame_single',pos); } catch(_) {}
                try { dim.spawnParticle('minecraft:basic_flame_particle',{ x:pos.x, y:pos.y+0.3, z:pos.z }); } catch(_) {}
                for (const e of dim.getEntities({ location:pos, maxDistance:0.9 })) { if(!e.isValid()||e.id===player.id)continue; try{e.applyDamage(DAMAGE,{damagingEntity:player});}catch(_){} try{e.setOnFire(5,true);}catch(_){} }
            } }
        }, t);
    }
}

function _castBlazingSpear(player) {
    const view=player.getViewDirection(), eye=player.getHeadLocation(), dim=player.dimension;
    const SPEED=0.65, STEPS=45, DAMAGE=SPELLS.blazing_spear.damage;
    const start={ x:eye.x+view.x*1.5, y:eye.y, z:eye.z+view.z*1.5 };
    const hLen=Math.sqrt(view.x*view.x+view.z*view.z)||1;
    const pAx=-view.z/hLen, pAz=view.x/hLen;
    const offsets=[[0,0],[0.4,0],[-0.4,0],[0,0.4],[0,-0.3],[0.28,0.28],[-0.28,0.28],[0.28,-0.2],[-0.28,-0.2]];
    let spear; try { spear=dim.spawnEntity('lotm:flame_spear',start); } catch(_) { return; }
    if (!spear) return;
    player.playSound('item.trident.throw', { pitch:0.5, volume:1.4 });
    const yaw=Math.atan2(-view.x,view.z)*(180/Math.PI);
    const hSpd=Math.sqrt(view.x*view.x+view.z*view.z)*SPEED;
    const pitch=-Math.atan2(view.y*SPEED,hSpd)*(180/Math.PI);
    const pos={ ...start }; let step=0; const hit=new Set();
    const tick=()=> {
        if (!spear.isValid()||step>=STEPS) { try { if(spear.isValid())spear.kill(); } catch(_) {} return; }
        pos.x+=view.x*SPEED; pos.y+=view.y*SPEED; pos.z+=view.z*SPEED; step++;
        try { spear.teleport(pos,{ rotation:{ x:pitch, y:yaw } }); } catch(_) {}
        try { const block=dim.getBlock({ x:Math.floor(pos.x), y:Math.floor(pos.y), z:Math.floor(pos.z) }); if(block&&!block.isAir&&!block.isLiquid){ try{spear.kill();}catch(_){} try{dim.spawnParticle('minecraft:huge_explosion_lab_particle',pos);}catch(_){} return; } } catch(_) {}
        for (const [right,up] of offsets) { try { dim.spawnParticle('minecraft:mobflame_single',{ x:pos.x+pAx*right, y:pos.y+up, z:pos.z+pAz*right }); } catch(_) {} }
        try { const near=dim.getEntities({ location:{ x:pos.x, y:pos.y-0.8, z:pos.z }, maxDistance:1.5, excludeTypes:['minecraft:item','lotm:wisp','lotm:flame_spear'] }); for(const e of near){ if(!e.isValid()||e.id===player.id||hit.has(e.id))continue; hit.add(e.id); try{e.applyDamage(DAMAGE,{damagingEntity:player});}catch(_){} try{e.setOnFire(10,true);}catch(_){} try{e.applyKnockback(view.x,view.z,1.2,0.4);}catch(_){} try{dim.spawnParticle('minecraft:large_explosion',e.location);}catch(_){} } } catch(_) {}
        system.runTimeout(tick,1);
    };
    system.runTimeout(tick,1);
}

function _castRingOfFire(player) {
    const center={ ...player.location }, dim=player.dimension;
    player.playSound('mob.ghast.fireball', { pitch:0.45, volume:1.5 });
    for (let wave=0;wave<4;wave++) {
        activeRings.push({ center:{ ...center }, dimension:dim, player, startTime:Date.now()+wave*400, lastRadius:-1, hitEntities:new Set() });
    }
}

function _castFlamingBarrage(player) {
    const dim=player.dimension, RANGE=26, DAMAGE=SPELLS.flaming_barrage.damage, COUNT=8;
    let targets; try { targets=dim.getEntities({ location:player.location, maxDistance:RANGE, excludeTypes:['minecraft:item','minecraft:xp_orb','lotm:wisp','lotm:firebolt'] }).filter(e=>e.id!==player.id&&_isHostile(e)); } catch(_) { targets=[]; }
    if (targets.length===0) { player.sendMessage('§cNo targets in range.'); return false; }
    targets.sort((a,b)=>{ const pl=player.location; return (a.location.x-pl.x)**2+(a.location.z-pl.z)**2-((b.location.x-pl.x)**2+(b.location.z-pl.z)**2); });
    player.playSound('mob.ghast.fireball', { pitch:1.2, volume:1.3 });
    for (let i=0;i<COUNT;i++) { const target=targets[i%targets.length]; system.runTimeout(()=>{ if(!target.isValid())return; _launchHomingFireball(player,target,DAMAGE); },i*3); }
    return true;
}

function _launchHomingFireball(player, target, damage) {
    const eye=player.getHeadLocation(), dim=player.dimension, SPEED=0.6, HOMING=0.2;
    const tLoc=target.location;
    const dx0=tLoc.x-eye.x, dy0=(tLoc.y+1)-eye.y, dz0=tLoc.z-eye.z;
    const len0=Math.sqrt(dx0*dx0+dy0*dy0+dz0*dz0)||1;
    const inaccuracy=Math.min(0.15,len0/90);
    let velX=(dx0/len0+(Math.random()-0.5)*inaccuracy)*SPEED, velY=(dy0/len0+(Math.random()-0.5)*inaccuracy)*SPEED, velZ=(dz0/len0+(Math.random()-0.5)*inaccuracy)*SPEED;
    const spawnPos={ x:eye.x+dx0/len0*1.5, y:eye.y, z:eye.z+dz0/len0*1.5 };
    let fb; try { fb=dim.spawnEntity('lotm:firebolt',spawnPos); } catch(_) { return; }
    if (!fb) return;
    const pos={ ...spawnPos }; let step=0;
    const tick=()=> {
        if (!fb.isValid()||step++>=75) { try { if(fb.isValid())fb.kill(); } catch(_) {} return; }
        if (target.isValid()) { const tp=target.location; const tdx=tp.x-pos.x, tdy=(tp.y+1)-pos.y, tdz=tp.z-pos.z; const tLen=Math.sqrt(tdx*tdx+tdy*tdy+tdz*tdz)||1; const tx=tdx/tLen*SPEED, ty=tdy/tLen*SPEED, tz=tdz/tLen*SPEED; velX=velX*(1-HOMING)+tx*HOMING; velY=velY*(1-HOMING)+ty*HOMING; velZ=velZ*(1-HOMING)+tz*HOMING; const vLen=Math.sqrt(velX*velX+velY*velY+velZ*velZ)||1; velX=velX/vLen*SPEED; velY=velY/vLen*SPEED; velZ=velZ/vLen*SPEED; }
        pos.x+=velX; pos.y+=velY; pos.z+=velZ;
        try { fb.teleport(pos); } catch(_) {}
        try { dim.spawnParticle('minecraft:mobflame_single',pos); } catch(_) {}
        let hit=false, hitEntity=null;
        try { const block=dim.getBlock({ x:Math.floor(pos.x), y:Math.floor(pos.y), z:Math.floor(pos.z) }); if(block&&!block.isAir&&!block.isLiquid)hit=true; } catch(_) {}
        if (!hit) { try { const near=dim.getEntities({ location:pos, maxDistance:1.1, excludeTypes:['minecraft:item','minecraft:xp_orb','lotm:wisp','lotm:firebolt'] }); for(const e of near){ if(e.id===player.id||e.id===fb.id)continue; hit=true; hitEntity=e; break; } } catch(_) {} }
        if (hit) { try{fb.kill();}catch(_){} try{dim.spawnParticle('minecraft:large_explosion',pos);}catch(_){} if(hitEntity){ try{hitEntity.applyDamage(damage,{damagingEntity:player});}catch(_){} try{hitEntity.setOnFire(10,true);}catch(_){} } return; }
        system.runTimeout(tick,1);
    };
    system.runTimeout(tick,1);
}

function _castBurningDash(player) {
    const dim=player.dimension, STEPS=32, DAMAGE=SPELLS.burning_dash.damage;
    try { player.addEffect('speed',45,{ amplifier:5, showParticles:false }); } catch(_) {}
    player.playSound('mob.blaze.burn', { pitch:1.3, volume:1.3 });
    let step=0; const hit=new Set();
    const id=system.runInterval(()=> {
        if (step++>=STEPS||!player.isValid()) { system.clearRun(id); return; }
        const pos=player.location;
        try { dim.runCommand(`setblock ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} fire`); } catch(_) {}
        for (let i=0;i<8;i++) { const ox=(Math.random()-0.5)*1.0, oz=(Math.random()-0.5)*1.0; try { dim.spawnParticle('minecraft:mobflame_single',{ x:pos.x+ox, y:pos.y+Math.random()*2, z:pos.z+oz }); } catch(_) {} }
        try { const near=dim.getEntities({ location:pos, maxDistance:2.0, excludeTypes:['minecraft:item','minecraft:xp_orb','lotm:wisp','lotm:firebolt','lotm:flame_spear','lotm:fire_arrow'] }); for(const e of near){ if(!e.isValid()||e.id===player.id||hit.has(e.id))continue; hit.add(e.id); try{e.applyDamage(DAMAGE,{damagingEntity:player});}catch(_){} try{e.setOnFire(8,true);}catch(_){} try{dim.spawnParticle('minecraft:large_explosion_lab_particle',e.location);}catch(_){} } } catch(_) {}
    }, 1);
}

function _castFireArrowBlazeStorm(player) {
    const view=player.getViewDirection(), eye=player.getHeadLocation();
    _launchFireArrow(player,view,eye);
    player.playSound('mob.blaze.shoot', { pitch:1.0, volume:1.3 });
    const hLen=Math.sqrt(view.x*view.x+view.z*view.z)||1;
    const rightX=-view.z/hLen, rightZ=view.x/hLen;
    for (let i=0;i<8;i++) { system.runTimeout(()=>{ const sH=(Math.random()-0.5)*0.65, sV=(Math.random()-0.5)*0.45; const dir={ x:view.x+rightX*sH, y:view.y+sV, z:view.z+rightZ*sH }; const dLen=Math.sqrt(dir.x*dir.x+dir.y*dir.y+dir.z*dir.z)||1; _launchBlazeBolt(player,{ x:dir.x/dLen, y:dir.y/dLen, z:dir.z/dLen },eye,SPELLS.fire_arrow_blaze.damage*0.3); },4+i*2); }
}

function _launchFireArrow(player, view, eye) {
    const dim=player.dimension, SPEED=0.95, GRAV=0.014, STEPS=65, DAMAGE=SPELLS.fire_arrow_blaze.damage;
    const start={ x:eye.x+view.x*1.5, y:eye.y, z:eye.z+view.z*1.5 };
    let arrow; try { arrow=dim.spawnEntity('lotm:fire_arrow',start); } catch(_) { return; }
    if (!arrow) return;
    player.playSound('item.trident.throw', { pitch:1.2, volume:1.0 });
    const yaw=Math.atan2(-view.x,view.z)*(180/Math.PI);
    const pos={ ...start }; let vy=view.y, step=0; const hit=new Set();
    const tick=()=> {
        if (!arrow.isValid()||step>=STEPS) { try { if(arrow.isValid())arrow.kill(); } catch(_) {} return; }
        pos.x+=view.x*SPEED; pos.y+=vy*SPEED; pos.z+=view.z*SPEED; vy-=GRAV; step++;
        const hSpd=Math.sqrt(view.x*view.x+view.z*view.z)*SPEED;
        const pitch=-Math.atan2(vy*SPEED,hSpd)*(180/Math.PI);
        try { arrow.teleport(pos,{ rotation:{ x:pitch, y:yaw } }); } catch(_) {}
        try { dim.spawnParticle('minecraft:mobflame_single',pos); } catch(_) {}
        try { const block=dim.getBlock({ x:Math.floor(pos.x), y:Math.floor(pos.y), z:Math.floor(pos.z) }); if(block&&!block.isAir&&!block.isLiquid){ try{arrow.kill();}catch(_){} _fireImpact(dim,pos); return; } } catch(_) {}
        try { const near=dim.getEntities({ location:{ x:pos.x, y:pos.y-0.5, z:pos.z }, maxDistance:1.4, excludeTypes:['minecraft:item','lotm:wisp','lotm:fire_arrow','lotm:firebolt'] }); for(const e of near){ if(!e.isValid()||e.id===player.id||hit.has(e.id))continue; hit.add(e.id); try{e.applyDamage(DAMAGE,{damagingEntity:player});}catch(_){} try{e.setOnFire(10,true);}catch(_){} try{arrow.kill();}catch(_){} _fireImpact(dim,pos); return; } } catch(_) {}
        system.run(tick);
    };
    system.run(tick);
}

function _launchBlazeBolt(player, dir, eye, damage) {
    const dim=player.dimension, SPEED=0.8, STEPS=44;
    const start={ x:eye.x+dir.x*1.5, y:eye.y, z:eye.z+dir.z*1.5 };
    let bolt; try { bolt=dim.spawnEntity('lotm:firebolt',start); } catch(_) { return; }
    if (!bolt) return;
    const pos={ ...start }; let step=0; const hit=new Set();
    const tick=()=> {
        if (!bolt.isValid()||step>=STEPS) { try { if(bolt.isValid())bolt.kill(); } catch(_) {} return; }
        pos.x+=dir.x*SPEED; pos.y+=dir.y*SPEED; pos.z+=dir.z*SPEED; step++;
        try { bolt.teleport(pos); } catch(_) {}
        const a=step*0.6; try { dim.spawnParticle('minecraft:mobflame_single',{ x:pos.x+Math.cos(a)*0.25, y:pos.y, z:pos.z+Math.sin(a)*0.25 }); } catch(_) {}
        try { const block=dim.getBlock({ x:Math.floor(pos.x), y:Math.floor(pos.y), z:Math.floor(pos.z) }); if(block&&!block.isAir&&!block.isLiquid){ try{bolt.kill();}catch(_){} return; } } catch(_) {}
        try { const near=dim.getEntities({ location:pos, maxDistance:1.1, excludeTypes:['minecraft:item','lotm:wisp','lotm:firebolt','lotm:fire_arrow'] }); for(const e of near){ if(!e.isValid()||e.id===player.id||hit.has(e.id))continue; hit.add(e.id); try{e.applyDamage(damage,{damagingEntity:player});}catch(_){} try{e.setOnFire(6,true);}catch(_){} try{bolt.kill();}catch(_){} return; } } catch(_) {}
        system.run(tick);
    };
    system.run(tick);
}

function _fireImpact(dim, pos) {
    try { dim.spawnParticle('minecraft:large_explosion',pos); } catch(_) {}
    for (let j=0;j<14;j++) { const a=(j/14)*Math.PI*2; try { dim.spawnParticle('minecraft:mobflame_single',{ x:pos.x+Math.cos(a)*0.6, y:pos.y, z:pos.z+Math.sin(a)*0.6 }); } catch(_) {} }
}

function _tickRing(ring, radius) {
    if (radius - ring.lastRadius < 0.25) return;
    ring.lastRadius = radius;
    const { center, dimension, player, hitEntities } = ring;
    const steps=Math.max(28,Math.floor(radius*18));
    const DAMAGE=SPELLS.ring_of_fire.damage;
    for (let i=0;i<steps;i++) {
        const angle=(i/steps)*Math.PI*2;
        const rx=Math.cos(angle)*radius, rz=Math.sin(angle)*radius;
        const pos={ x:center.x+rx, y:center.y+0.3, z:center.z+rz };
        try { dimension.spawnParticle('minecraft:mobflame_single',pos); } catch(_) {}
        try { dimension.spawnParticle('minecraft:basic_flame_particle',{ ...pos, y:pos.y+1.0 }); } catch(_) {}
        for (const e of dimension.getEntities({ location:{ x:pos.x, y:center.y, z:pos.z }, maxDistance:1.4 })) {
            if (!e.isValid()||e.id===player.id||hitEntities.has(e.id)) continue;
            hitEntities.add(e.id);
            try { e.applyDamage(DAMAGE,{damagingEntity:player}); } catch(_) {}
            try { e.setOnFire(8,true); } catch(_) {}
        }
    }
}
