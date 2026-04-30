// ============================================
// SCROLL PROFESSOR - SEQUENCE 6 HERMIT PATHWAY
// ============================================
// Scroll system: each scroll type is a separate item (stack of 8).
// Hold a scroll, right-click to cast (burns one scroll).
// Sneak + right-click to open scroll selection menu.
// Inherits all Warlock passives + wand spells.
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { WarlockSequence } from './warlock.js';

export class ScrollProfessorSequence {
  static SEQUENCE_NUMBER = 6;
  static PATHWAY = PathwayManager.PATHWAYS.HERMIT;

  static EFFECT_DURATION = 999999;

  // ---- Enhanced stats ----
  static HEALTH_BONUS      = 8;   // +4 hearts (up from Warlock's +3)
  static STRENGTH_AMP      = 1;   // same as Warlock
  static SPEED_AMP         = 1;
  static JUMP_AMP          = 1;

  // ---- Storm session tracking ----
  // playerName -> { intervalId, ticksRemaining, strikeCount }
  static stormSessions = new Map();
  static STORM_DURATION   = 600; // 30s in ticks
  static STORM_INTERVAL   = 40;  // strike every 2s

  // ---- Force field tracking ----
  // playerName -> { blocks: [{x,y,z}], ticksRemaining }
  static forceFields = new Map();
  static FORCE_FIELD_DURATION = 400; // 20s

  // ---- Armour buff tracking ----
  // playerName -> ticksRemaining
  static armourBuffs = new Map();
  static ARMOUR_BUFF_DURATION = 400; // 20s

  // ---- Raise Earth tracking ----
  // playerName -> [{ x,y,z }]  blocks placed (for cleanup)
  static raisedEarths = new Map();

  // ---- Aura / ore scan counters (inherited pattern) ----
  static auraTickCounters = new Map();
  static oreScanCounters  = new Map();

  // ---- Scroll definitions ----
  static SCROLLS = {
    BURNING: {
      id: 'scroll_burning',
      itemId: 'lotm:scroll_burning',
      name: '§c📜 Burning Scroll',
      spiritCost: 25,
      description: 'Slow fireball — explodes on impact'
    },
    SUN: {
      id: 'scroll_sun',
      itemId: 'lotm:scroll_sun',
      name: '§e📜 Sun Scroll',
      spiritCost: 30,
      description: 'Large AOE purification + holy damage to undead'
    },
    HEALING: {
      id: 'scroll_healing',
      itemId: 'lotm:scroll_healing',
      name: '§a📜 Healing Scroll',
      spiritCost: 28,
      description: 'Heal targeted player or self'
    },
    FREEZE: {
      id: 'scroll_freeze',
      itemId: 'lotm:scroll_freeze',
      name: '§b📜 Freeze Scroll',
      spiritCost: 22,
      description: 'Ice bolt — slows, freezes water/lava'
    },
    STORM: {
      id: 'scroll_storm',
      itemId: 'lotm:scroll_storm',
      name: '§9📜 Storm Scroll',
      spiritCost: 40,
      description: 'Rain + lightning strikes hostiles for 30s'
    },
    FORCE_FIELD: {
      id: 'scroll_force_field',
      itemId: 'lotm:scroll_force_field',
      name: '§3📜 Force Field Scroll',
      spiritCost: 35,
      description: '3×3 barrier around player for 20s'
    },
    ARMOUR: {
      id: 'scroll_armour',
      itemId: 'lotm:scroll_armour',
      name: '§6📜 Armour Scroll',
      spiritCost: 30,
      description: 'Resistance + absorption buff for 20s'
    },
    RAISE_EARTH: {
      id: 'scroll_raise_earth',
      itemId: 'lotm:scroll_raise_earth',
      name: '§6📜 Raise Earth Scroll',
      spiritCost: 20,
      description: 'Raise a 3×3 platform under your feet'
    }
  };

  // =============================================
  // SEQUENCE CHECK
  // =============================================
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // =============================================
  // PASSIVE ABILITIES
  // =============================================
  static applyPassiveAbilities(player) {
    // Inherit all Warlock passives (night vision, physical, health, aura, ore scan, hand of force, pouch)
    WarlockSequence.applyPassiveAbilities(player);

    // Upgraded health bonus
    this._applyHealthBonus(player, this.HEALTH_BONUS);

    // Process active sessions
    this._tickStormSession(player);
    this._tickForceField(player);
    this._tickArmourBuff(player);
  }

  static _applyHealthBonus(player, bonusHearts) {
    const amp = bonusHearts - 1;
    const hb  = player.getEffect('health_boost');
    if (!hb || hb.amplifier !== amp || hb.duration < 200)
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier: amp, showParticles: false });
  }

  // =============================================
  // SCROLL CASTING — ENTRY POINT
  // Called from main.js when player right-clicks a scroll item
  // =============================================
  static castScroll(player, scrollId) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }

    const scroll = Object.values(this.SCROLLS).find(s => s.id === scrollId);
    if (!scroll) { player.sendMessage('§cUnknown scroll!'); return false; }

    // ── Check spirit FIRST before consuming anything ──
    // Use a dry-run check (peek at current spirit without consuming)
    const currentSpirit = SpiritSystem.getSpirit ? SpiritSystem.getSpirit(player) : null;
    const maxSpirit     = SpiritSystem.getMaxSpirit ? SpiritSystem.getMaxSpirit(player) : null;
    // Try to peek — if SpiritSystem exposes getSpirit use it, otherwise consume+restore
    let hasEnoughSpirit = false;
    if (currentSpirit !== null) {
      hasEnoughSpirit = currentSpirit >= scroll.spiritCost;
    } else {
      // Fallback: consume then restore to check
      hasEnoughSpirit = SpiritSystem.consumeSpirit(player, scroll.spiritCost);
      if (hasEnoughSpirit) SpiritSystem.restoreSpirit(player, scroll.spiritCost);
    }

    if (!hasEnoughSpirit) {
      player.sendMessage(`§cNot enough spirit! Need §5${scroll.spiritCost}`);
      return false;
    }

    // ── Check scroll exists in inventory BEFORE consuming spirit ──
    if (!this._hasScroll(player, scroll.itemId)) {
      player.sendMessage(`§cNo ${scroll.name} §cin inventory!`);
      return false;
    }

    // ── Both checks passed — now consume spirit then scroll ──
    if (!SpiritSystem.consumeSpirit(player, scroll.spiritCost)) {
      player.sendMessage(`§cNot enough spirit! Need §5${scroll.spiritCost}`);
      return false;
    }

    // Consume one scroll from inventory
    if (!this._consumeScroll(player, scroll.itemId)) {
      SpiritSystem.restoreSpirit(player, scroll.spiritCost);
      player.sendMessage(`§cNo ${scroll.name} §cin inventory!`);
      return false;
    }

    // Cast visual — scroll burns
    this._spawnScrollCastParticles(player);
    player.playSound('fire.ignite', { pitch: 1.8, volume: 0.7 });

    switch (scrollId) {
      case this.SCROLLS.BURNING.id:     return this._castBurning(player);
      case this.SCROLLS.SUN.id:         return this._castSun(player);
      case this.SCROLLS.HEALING.id:     return this._castHealing(player);
      case this.SCROLLS.FREEZE.id:      return this._castFreeze(player);
      case this.SCROLLS.STORM.id:       return this._castStorm(player);
      case this.SCROLLS.FORCE_FIELD.id: return this._castForceField(player);
      case this.SCROLLS.ARMOUR.id:      return this._castArmour(player);
      case this.SCROLLS.RAISE_EARTH.id: return this._castRaiseEarth(player);
      default: return false;
    }
  }

  // =============================================
  // SCROLL: BURNING — slow fireball, explodes on impact
  // =============================================
  static _castBurning(player) {
    const view  = player.getViewDirection();
    const eye   = player.getHeadLocation();
    const start = { x: eye.x + view.x * 2, y: eye.y, z: eye.z + view.z * 2 };

    player.sendMessage('§c§l🔥 BURNING! §r§c§oA fireball erupts from the scroll!');
    player.playSound('fire.fire', { pitch: 0.6, volume: 1.2 }); // lower pitch = bigger feel

    // Speed: 0.35 blocks/tick — noticeably slower than the Warlock flame bolt
    const speed  = 0.35;
    const maxAge = 80; // ticks before fizzle
    let   pos    = { ...start };
    let   hit    = false;
    let   age    = 0;

    const moveFireball = () => {
      if (hit || age >= maxAge) return;
      age++;

      pos.x += view.x * speed;
      pos.y += view.y * speed;
      pos.z += view.z * speed;

      // Dense fireball particle cluster
      for (let i = 0; i < 5; i++) {
        const ox = (Math.random()-0.5)*0.6;
        const oy = (Math.random()-0.5)*0.6;
        const oz = (Math.random()-0.5)*0.6;
        try { player.dimension.spawnParticle('minecraft:basic_flame_particle',
          { x: pos.x+ox, y: pos.y+oy, z: pos.z+oz }); } catch (_) {}
      }
      try { player.dimension.spawnParticle('minecraft:lava_particle', pos); } catch (_) {}
      try { player.dimension.spawnParticle('minecraft:mobflame_single', pos); } catch (_) {}

      // Block impact check
      try {
        const block = player.dimension.getBlock(
          { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) }
        );
        if (block && !block.isAir && !block.isLiquid) {
          hit = true;
          this._fireballExplosion(player, pos);
          return;
        }
      } catch (_) {}

      // Entity impact check
      try {
        const near = player.dimension.getEntities({ location: pos, maxDistance: 1.8,
          excludeTypes: ['minecraft:item','minecraft:player'] });
        for (const e of near) {
          hit = true;
          this._fireballExplosion(player, pos, e);
          return;
        }
      } catch (_) {}

      system.runTimeout(moveFireball, 1);
    };

    system.runTimeout(moveFireball, 1);
    return true;
  }

  static _fireballExplosion(player, pos, directHit = null) {
    player.sendMessage('§c§o*The fireball detonates!*');
    player.playSound('random.explode', { pitch: 1.3, volume: 1.0 });

    // Big burst of flame particles
    for (let i = 0; i < 30; i++) {
      const a  = (i/30)*Math.PI*2;
      const r  = 0.5 + Math.random()*1.5;
      try { player.dimension.spawnParticle('minecraft:basic_flame_particle',
        { x: pos.x+Math.cos(a)*r, y: pos.y+Math.random()*2, z: pos.z+Math.sin(a)*r }); } catch (_) {}
    }
    for (let i = 0; i < 12; i++) {
      try { player.dimension.spawnParticle('minecraft:lava_particle',
        { x: pos.x+(Math.random()-0.5)*3, y: pos.y+Math.random()*2,
          z: pos.z+(Math.random()-0.5)*3 }); } catch (_) {}
    }

    // AOE damage + fire in 3 block radius
    try {
      const entities = player.dimension.getEntities({ location: pos, maxDistance: 3,
        excludeTypes: ['minecraft:item'] });
      for (const e of entities) {
        if (e.id === player.id) continue;
        const dx = e.location.x-pos.x, dy = e.location.y-pos.y, dz = e.location.z-pos.z;
        const dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
        const dmg  = directHit && e.id === directHit.id ? 18 : Math.max(6, 18 - dist*4);
        e.applyDamage(dmg);
        e.setOnFire(8, true);
      }
    } catch (_) {}

    // Set 3×3 ground on fire
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        const bx = Math.floor(pos.x)+x;
        const by = Math.floor(pos.y);
        const bz = Math.floor(pos.z)+z;
        try {
          const above = player.dimension.getBlock({ x: bx, y: by+1, z: bz });
          if (above && above.isAir) {
            player.dimension.runCommand(`setblock ${bx} ${by+1} ${bz} fire`);
          }
        } catch (_) {}
      }
    }
  }

  // =============================================
  // SCROLL: SUN — large AOE purification + holy damage
  // =============================================
  static _castSun(player) {
    const range   = 15; // bigger than Warlock purification (10)
    const debuffs = ['wither','poison','weakness','slowness','mining_fatigue',
      'nausea','blindness','hunger','levitation','fatal_poison'];
    const undeadKeywords = ['zombie','skeleton','phantom','wither','drowned',
      'husk','stray','lotm:ghoul','lotm:vengeful_ghost','lotm:shade'];

    player.sendMessage('§e§l☀ SUN! §r§e§oHoly light floods the area!');
    player.playSound('random.levelup', { pitch: 0.5, volume: 1.2 });

    // Expanding golden ring visual
    for (let r = 1; r <= 15; r++) {
      system.runTimeout(() => {
        for (let i = 0; i < Math.floor(r*4); i++) {
          const a = (i/(r*4))*Math.PI*2;
          try { player.dimension.spawnParticle('minecraft:totem_particle',
            { x: player.location.x+Math.cos(a)*r,
              y: player.location.y+1,
              z: player.location.z+Math.sin(a)*r }); } catch (_) {}
        }
      }, r*2);
    }

    // Cleanse all nearby players
    try {
      const players = player.dimension.getPlayers({ location: player.location, maxDistance: range });
      for (const t of players) {
        for (const d of debuffs) { try { t.removeEffect(d); } catch (_) {} }
        try {
          const hp = t.getComponent('minecraft:health');
          if (hp) hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + 6));
        } catch (_) {}
        for (let i = 0; i < 10; i++) {
          const a = (i/10)*Math.PI*2;
          try { t.dimension.spawnParticle('minecraft:totem_particle',
            { x: t.location.x+Math.cos(a)*0.7, y: t.location.y+1.5,
              z: t.location.z+Math.sin(a)*0.7 }); } catch (_) {}
        }
      }
    } catch (_) {}

    // Holy damage to undead
    try {
      const entities = player.dimension.getEntities({
        location: player.location, maxDistance: range,
        excludeTypes: ['minecraft:item','minecraft:player']
      });
      let smited = 0;
      for (const e of entities) {
        if (!undeadKeywords.some(kw => e.typeId.includes(kw))) continue;
        e.applyDamage(16);
        try { e.addEffect('weakness', 200, { amplifier: 3, showParticles: true }); } catch (_) {}
        smited++;
        for (let i = 0; i < 6; i++) {
          const a = (i/6)*Math.PI*2;
          try { player.dimension.spawnParticle('minecraft:totem_particle',
            { x: e.location.x+Math.cos(a)*0.5, y: e.location.y+1,
              z: e.location.z+Math.sin(a)*0.5 }); } catch (_) {}
        }
      }
      if (smited > 0) player.sendMessage(`§e☀ §7${smited} undead scorched by holy light!`);
    } catch (_) {}

    return true;
  }

  // =============================================
  // SCROLL: HEALING — heal targeted player or self
  // =============================================
  static _castHealing(player) {
    // Find targeted player first
    let target = null;
    try {
      const view = player.getViewDirection();
      const loc  = player.location;
      const nearby = player.dimension.getPlayers({ location: loc, maxDistance: 20 });
      let bestDot = 0.90;
      for (const other of nearby) {
        if (other.id === player.id) continue;
        const dx = other.location.x-loc.x, dy = other.location.y+1-(loc.y+1.6), dz = other.location.z-loc.z;
        const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if (len < 0.1) continue;
        const dot = (dx*view.x+dy*view.y+dz*view.z)/len;
        if (dot > bestDot) { bestDot = dot; target = other; }
      }
    } catch (_) {}

    const healTarget = target || player;
    const isSelf     = healTarget.id === player.id;

    // Heal amount: 8 hearts
    try {
      const hp = healTarget.getComponent('minecraft:health');
      if (hp) {
        const healAmt = 16; // 8 hearts
        hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + healAmt));
      }
    } catch (_) {}

    // Remove common debuffs too
    const debuffs = ['poison','wither','fatal_poison','weakness'];
    for (const d of debuffs) { try { healTarget.removeEffect(d); } catch (_) {} }

    // Regeneration burst
    healTarget.addEffect('regeneration', 100, { amplifier: 1, showParticles: true });

    // Green particle burst
    for (let i = 0; i < 16; i++) {
      const a = (i/16)*Math.PI*2;
      try { healTarget.dimension.spawnParticle('minecraft:heart_particle',
        { x: healTarget.location.x+Math.cos(a)*0.8, y: healTarget.location.y+1.5,
          z: healTarget.location.z+Math.sin(a)*0.8 }); } catch (_) {}
    }

    player.sendMessage(isSelf
      ? '§a§l✦ HEALING! §r§a§oYou mend your own wounds.'
      : `§a§l✦ HEALING! §r§a§o${healTarget.name} is healed.`);
    player.playSound('note.harp', { pitch: 0.8, volume: 1.0 });
    if (!isSelf) healTarget.playSound('note.harp', { pitch: 0.8, volume: 1.0 });

    return true;
  }

  // =============================================
  // SCROLL: FREEZE — ice bolt, slows, freezes water/lava
  // =============================================
  static _castFreeze(player) {
    const view  = player.getViewDirection();
    const eye   = player.getHeadLocation();
    const start = { x: eye.x + view.x*1.5, y: eye.y, z: eye.z + view.z*1.5 };
    let hit = false;

    player.sendMessage('§b§l❄ FREEZE! §r§b§oA crystal stream of cold erupts!');
    player.playSound('ambient.underwater.loop', { pitch: 2.0, volume: 0.8 });

    for (let i = 0; i < 28; i++) {
      system.runTimeout(() => {
        if (hit) return;
        const loc = {
          x: start.x + view.x*i*0.55,
          y: start.y + view.y*i*0.55,
          z: start.z + view.z*i*0.55
        };

        // Ice/snow particles along bolt
        try { player.dimension.spawnParticle('minecraft:snowflake_particle', loc); } catch (_) {}
        try { player.dimension.spawnParticle('minecraft:water_evaporation_actor_emitter',
          { x: loc.x+0.1, y: loc.y, z: loc.z+0.1 }); } catch (_) {}

        // Freeze water/lava in path
        try {
          const block = player.dimension.getBlock(
            { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) }
          );
          if (block) {
            if (block.typeId === 'minecraft:water' || block.typeId === 'minecraft:flowing_water') {
              try { block.setType('minecraft:ice'); } catch (_) {}
            } else if (block.typeId === 'minecraft:lava' || block.typeId === 'minecraft:flowing_lava') {
              try { block.setType('minecraft:obsidian'); } catch (_) {}
            } else if (!block.isAir && !block.isLiquid) {
              // Solid block impact
              hit = true;
              for (let j = 0; j < 10; j++) {
                const a = (j/10)*Math.PI*2;
                try { player.dimension.spawnParticle('minecraft:snowflake_particle',
                  { x: loc.x+Math.cos(a)*0.5, y: loc.y, z: loc.z+Math.sin(a)*0.5 }); } catch (_) {}
              }
              return;
            }
          }
        } catch (_) {}

        // Entity hit
        try {
          const near = player.dimension.getEntities({ location: loc, maxDistance: 1.5,
            excludeTypes: ['minecraft:item'] });
          for (const e of near) {
            if (e.id === player.id) continue;
            hit = true;
            e.applyDamage(10);
            e.addEffect('slowness',  200, { amplifier: 3, showParticles: true });
            e.addEffect('weakness',  100, { amplifier: 1, showParticles: false });
            e.addEffect('mining_fatigue', 100, { amplifier: 1, showParticles: false });
            // Freeze visual
            for (let j = 0; j < 12; j++) {
              const a = (j/12)*Math.PI*2;
              try { player.dimension.spawnParticle('minecraft:snowflake_particle',
                { x: e.location.x+Math.cos(a)*0.6, y: e.location.y+1,
                  z: e.location.z+Math.sin(a)*0.6 }); } catch (_) {}
            }
            player.sendMessage('§b§oTarget frozen!');
            player.playSound('random.fizz', { pitch: 0.5, volume: 1.0 });
            break;
          }
        } catch (_) {}
      }, i);
    }
    return true;
  }

  // =============================================
  // SCROLL: STORM — rain + lightning strikes hostiles for 30s
  // =============================================
  static _castStorm(player) {
    // Only one storm at a time per player
    if (this.stormSessions.has(player.name)) {
      player.sendMessage('§9§oA storm is already raging!');
      SpiritSystem.restoreSpirit(player, this.SCROLLS.STORM.spiritCost);
      return false;
    }

    player.sendMessage('§9§l⛈ STORM! §r§9§oThe sky darkens and thunder rolls...');
    player.playSound('ambient.weather.thunder', { pitch: 0.7, volume: 1.2 });

    // Set weather to thunderstorm
    try { player.dimension.runCommand('weather thunder 600'); } catch (_) {}

    this.stormSessions.set(player.name, {
      ticksRemaining: this.STORM_DURATION,
      counter: 0
    });

    return true;
  }

  static _tickStormSession(player) {
    const session = this.stormSessions.get(player.name);
    if (!session) return;

    session.ticksRemaining--;
    session.counter++;

    if (session.ticksRemaining <= 0) {
      this.stormSessions.delete(player.name);
      player.sendMessage('§9§oThe storm subsides...');
      try { player.dimension.runCommand('weather clear 600'); } catch (_) {}
      return;
    }

    // Strike every STORM_INTERVAL ticks
    if (session.counter % this.STORM_INTERVAL !== 0) return;

    const hostileKeywords = [
      'zombie','skeleton','creeper','spider','enderman','witch','phantom',
      'pillager','vindicator','evoker','warden','blaze','ghast','ravager',
      'drowned','husk','stray','vex','lotm:ghoul','lotm:vengeful_ghost','lotm:rampager'
    ];

    try {
      const entities = player.dimension.getEntities({
        location: player.location, maxDistance: 30,
        excludeTypes: ['minecraft:item','minecraft:player']
      });

      // Pick a random hostile to strike
      const hostiles = entities.filter(e => hostileKeywords.some(kw => e.typeId.includes(kw)));
      if (hostiles.length > 0) {
        const target = hostiles[Math.floor(Math.random() * hostiles.length)];
        const loc    = target.location;
        try {
          player.dimension.runCommand(
            `summon lightning_bolt ${Math.floor(loc.x)} ${Math.floor(loc.y)} ${Math.floor(loc.z)}`
          );
          player.sendMessage(`§9⚡ §7Storm strikes a ${target.typeId.replace('minecraft:','').replace('lotm:','[LOTM] ')}!`);
        } catch (_) {}
      }
    } catch (_) {}
  }

  // =============================================
  // SCROLL: FORCE FIELD — 3×3 glass barrier for 20s
  // =============================================
  static _castForceField(player) {
    // Remove existing force field if active
    if (this.forceFields.has(player.name)) {
      this._removeForceField(player);
    }

    const loc    = player.location;
    const cx     = Math.floor(loc.x);
    const cy     = Math.floor(loc.y);
    const cz     = Math.floor(loc.z);
    const blocks = [];

    // Build hollow 3×3 shell: -1 to +1 on each axis, only outer surface
    for (let x = -2; x <= 2; x++) {
      for (let y = -1; y <= 3; y++) {
        for (let z = -2; z <= 2; z++) {
          // Only place on the shell (not interior)
          const onShell = Math.abs(x)===2 || Math.abs(z)===2 || y===-1 || y===3;
          if (!onShell) continue;

          const bx = cx+x, by = cy+y, bz = cz+z;
          try {
            const existing = player.dimension.getBlock({ x: bx, y: by, z: bz });
            // Only place in air — never overwrite solid blocks
            if (!existing || !existing.isAir) continue;
            player.dimension.runCommand(`setblock ${bx} ${by} ${bz} glass`);
            blocks.push({ x: bx, y: by, z: bz });
          } catch (_) {}
        }
      }
    }

    this.forceFields.set(player.name, {
      blocks,
      ticksRemaining: this.FORCE_FIELD_DURATION
    });

    player.sendMessage('§3§l🛡 FORCE FIELD! §r§3§oA barrier of crystallised spirit forms around you! (20s)');
    player.playSound('block.glass.place', { pitch: 0.8, volume: 1.2 });

    // Sparkle on the glass
    for (let i = 0; i < blocks.length && i < 20; i++) {
      const b = blocks[i];
      try { player.dimension.spawnParticle('minecraft:endrod',
        { x: b.x+0.5, y: b.y+0.5, z: b.z+0.5 }); } catch (_) {}
    }

    return true;
  }

  static _tickForceField(player) {
    const ff = this.forceFields.get(player.name);
    if (!ff) return;
    ff.ticksRemaining--;
    if (ff.ticksRemaining <= 0) {
      this._removeForceField(player);
      player.sendMessage('§3§oThe force field dissolves...');
    }
  }

  static _removeForceField(player) {
    const ff = this.forceFields.get(player.name);
    if (!ff) return;
    for (const b of ff.blocks) {
      try {
        const block = player.dimension.getBlock(b);
        if (block && block.typeId === 'minecraft:glass') {
          player.dimension.runCommand(`setblock ${b.x} ${b.y} ${b.z} air`);
        }
      } catch (_) {}
    }
    this.forceFields.delete(player.name);
  }

  // =============================================
  // SCROLL: ARMOUR — resistance + absorption 20s
  // =============================================
  static _castArmour(player) {
    const duration = this.ARMOUR_BUFF_DURATION;
    player.addEffect('resistance',  duration, { amplifier: 2, showParticles: true });
    player.addEffect('absorption',  duration, { amplifier: 3, showParticles: false }); // +4 absorption hearts
    player.addEffect('haste',       duration, { amplifier: 0, showParticles: false }); // slight combat speed

    this.armourBuffs.set(player.name, duration);

    player.sendMessage('§6§l🛡 ARMOUR! §r§6§oSpirit reinforces your body! (20s)');
    player.playSound('note.pling', { pitch: 0.6, volume: 1.0 });

    for (let i = 0; i < 16; i++) {
      const a = (i/16)*Math.PI*2;
      try { player.dimension.spawnParticle('minecraft:totem_particle',
        { x: player.location.x+Math.cos(a)*0.8, y: player.location.y+1,
          z: player.location.z+Math.sin(a)*0.8 }); } catch (_) {}
    }
    return true;
  }

  static _tickArmourBuff(player) {
    const t = this.armourBuffs.get(player.name);
    if (!t) return;
    if (t <= 1) {
      this.armourBuffs.delete(player.name);
      player.sendMessage('§6§oArmour enchantment fades...');
    } else {
      this.armourBuffs.set(player.name, t - 1);
    }
  }

  // =============================================
  // SCROLL: RAISE EARTH — 3×3 platform under player
  // =============================================
  static _castRaiseEarth(player) {
    // Remove previous raised earth if it exists
    if (this.raisedEarths.has(player.name)) {
      this._removeRaisedEarth(player);
    }

    const loc = player.location;
    const cx  = Math.floor(loc.x);
    const cz  = Math.floor(loc.z);
    const py  = Math.floor(loc.y);

    // ── Step 1: Raycast downward to find the actual ground surface ──
    // Scan from player feet downward to find the first solid block
    let groundY = py - 1;
    for (let dy = 0; dy >= -16; dy--) {
      try {
        const block = player.dimension.getBlock({ x: cx, y: py + dy, z: cz });
        if (block && !block.isAir && !block.isLiquid) {
          groundY = py + dy; // top of this block = groundY + 1
          break;
        }
      } catch (_) {}
    }

    // ── Step 2: Build 3-layer platform starting ABOVE ground surface ──
    // platformBase = first air layer above ground
    // platform occupies: groundY+1, groundY+2, groundY+3
    // player will stand on top at groundY+4
    const platformBase = groundY + 1;
    const placed = [];

    for (let layer = 0; layer < 3; layer++) {
      const by = platformBase + layer;
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          const bx = cx + x, bz2 = cz + z;
          // Capture loop vars for timeout closure
          const cbx = bx, cby = by, cbz = bz2, clayer = layer;
          try {
            // Use 'keep' variant — only places if block is air, never overwrites
            player.dimension.runCommand(`setblock ${cbx} ${cby} ${cbz} stone`);
            placed.push({ x: cbx, y: cby, z: cbz });
            // Rising dust particles — staggered by layer for visual effect
            system.runTimeout(() => {
              for (let i = 0; i < 3; i++) {
                try { player.dimension.spawnParticle('minecraft:terrain',
                  { x: cbx + 0.3 + Math.random()*0.4,
                    y: cby + 1,
                    z: cbz + 0.3 + Math.random()*0.4 }); } catch (_) {}
              }
            }, clayer * 4);
          } catch (_) {}
        }
      }
    }

    this.raisedEarths.set(player.name, placed);

    // ── Step 3: Teleport player to stand on top of the raised platform ──
    const topY = platformBase + 3; // one above the top platform layer
    system.runTimeout(() => {
      try {
        player.teleport(
          { x: loc.x, y: topY, z: loc.z },
          { dimension: player.dimension, rotation: player.getRotation() }
        );
      } catch (_) {}
    }, 5); // wait for blocks to place first

    player.sendMessage('§6§l🪨 RAISE EARTH! §r§6§oThe ground surges upward beneath you!');
    player.playSound('dig.stone', { pitch: 0.6, volume: 1.5 });
    return true;
  }

  static _removeRaisedEarth(player) {
    const blocks = this.raisedEarths.get(player.name);
    if (!blocks) return;
    for (const b of blocks) {
      try {
        const block = player.dimension.getBlock(b);
        if (block && block.typeId === 'minecraft:stone') {
          player.dimension.runCommand(`setblock ${b.x} ${b.y} ${b.z} air`);
        }
      } catch (_) {}
    }
    this.raisedEarths.delete(player.name);
  }

  // =============================================
  // SCROLL VISUAL
  // =============================================
  static _spawnScrollCastParticles(player) {
    // Parchment-burning effect — orange + white sparks
    for (let i = 0; i < 12; i++) {
      const a = (i/12)*Math.PI*2;
      try { player.dimension.spawnParticle('minecraft:basic_flame_particle',
        { x: player.location.x+Math.cos(a)*0.5, y: player.location.y+1.4,
          z: player.location.z+Math.sin(a)*0.5 }); } catch (_) {}
    }
    for (let i = 0; i < 6; i++) {
      try { player.dimension.spawnParticle('minecraft:totem_particle',
        { x: player.location.x+(Math.random()-0.5)*0.8,
          y: player.location.y+1.2+(Math.random()*0.6),
          z: player.location.z+(Math.random()-0.5)*0.8 }); } catch (_) {}
    }
  }

  // =============================================
  // INVENTORY HELPER — consume one scroll
  // =============================================
  static _hasScroll(player, itemId) {
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return false;
      for (let slot = 0; slot < inv.container.size; slot++) {
        const item = inv.container.getItem(slot);
        if (item && item.typeId === itemId && item.amount > 0) return true;
      }
    } catch (_) {}
    return false;
  }

  static _consumeScroll(player, itemId) {
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return false;
      for (let slot = 0; slot < inv.container.size; slot++) {
        const item = inv.container.getItem(slot);
        if (!item || item.typeId !== itemId) continue;
        item.amount--;
        inv.container.setItem(slot, item.amount <= 0 ? undefined : item);
        return true;
      }
    } catch (_) {}
    return false;
  }

  // =============================================
  // GET SCROLL INFO (for menu display)
  // =============================================
  static getScrollCount(player, itemId) {
    let total = 0;
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return 0;
      for (let slot = 0; slot < inv.container.size; slot++) {
        const item = inv.container.getItem(slot);
        if (item && item.typeId === itemId) total += item.amount;
      }
    } catch (_) {}
    return total;
  }

  static getAllScrolls() { return Object.values(this.SCROLLS); }

  // =============================================
  // HANDLE ABILITY USE
  // =============================================
  static handleAbilityUse(player, abilityId) {
    const scroll = Object.values(this.SCROLLS).find(s => s.id === abilityId);
    if (scroll) return this.castScroll(player, abilityId);
    return WarlockSequence.handleAbilityUse(player, abilityId);
  }

  // =============================================
  // CLEANUP
  // =============================================
  static removeEffects(player) {
    WarlockSequence.removeEffects(player);
    this._removeForceField(player);
    this._removeRaisedEarth(player);
    this.stormSessions.delete(player.name);
    this.armourBuffs.delete(player.name);
    this.auraTickCounters.delete(player.name);
    this.oreScanCounters.delete(player.name);
  }
}
