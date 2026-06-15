import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { ScrollProfessorSequence } from './scroll_professor.js';
import { WarlockSequence } from './warlock.js';

export class ConstellationsMasterSequence {
  static SEQUENCE_NUMBER = 5;
  static PATHWAY = 'hermit';

  // ── Spirit ───────────────────────────────────────────────────────────
  static SPIRIT_BONUS      = 240;
  static SPIRIT_REGEN_RATE = 10;        // per regen tick
  static SPIRIT_REGEN_TICK = 20;       // every 60 ticks (3s)
  static EFFECT_DURATION   = 999999;

  // ── Cooldowns (ticks) ────────────────────────────────────────────────
  static CD_STARLIGHT_CAGE    = 40;   // 20s
  static CD_STAR_CONCEALMENT  = 90;   // 45s
  static CD_STAR_ILLUMINATION = 50;   // 15s
  static CD_STAR_BRIDGE       = 200;   // 20s
  static CD_STAR_PILLAR       = 300;  // 60s
  static CD_NIGHT_BLINK       = 60;   // 30s

  // ── Spirit costs ─────────────────────────────────────────────────────
  static SPIRIT_STARLIGHT_CAGE    = 35;
  static SPIRIT_STAR_CONCEALMENT  = 30;
  static SPIRIT_STAR_ILLUMINATION = 20;
  static SPIRIT_STAR_BRIDGE       = 30;
  static SPIRIT_STAR_PILLAR       = 30;
  static SPIRIT_NIGHT_BLINK       = 30;
  static SPIRIT_STELLAR_PULL      = 35;
  static CD_STELLAR_PULL          = 40;   // 20s
  static SPIRIT_SPEAR_OF_LONGINUS = 20;
  static CD_SPEAR_OF_LONGINUS     = 60;   // 30s
  // Warlock spells cast powder-free at seq 5: base cost + 10 extra
  static SPIRIT_POWDER_FREE_BONUS = 10;

  // ── Ability IDs ──────────────────────────────────────────────────────
  static ABILITIES = {
    STARLIGHT_CAGE:    'starlight_cage',
    STAR_CONCEALMENT:  'star_concealment',
    STAR_ILLUMINATION: 'star_illumination',
    STAR_BRIDGE:       'star_bridge',
    STAR_PILLAR:       'star_pillar',
    NIGHT_BLINK:       'night_blink',
    STELLAR_PULL:      'stellar_pull',
    SPEAR_OF_LONGINUS: 'spear_of_longinus',
  };

  // ── Cooldown maps ─────────────────────────────────────────────────────
  static cageCooldowns        = new Map();
  static concealCooldowns     = new Map();
  static illuminCooldowns     = new Map();
  static bridgeCooldowns      = new Map();
  static pillarCooldowns      = new Map();
  static blinkCooldowns        = new Map();
  static pullCooldowns         = new Map();
  static spearCooldowns        = new Map();

  // ── Active state ─────────────────────────────────────────────────────
  // Star Bridge: track placed blocks per player so we can remove them
  static activeBridges        = new Map(); // playerName -> [{x,y,z,dim}]
  // Star Illumination: track placed lanterns
  static activeLanterns       = new Map(); // playerName -> {x,y,z,dim,ticksLeft}
  // Cage: track caged entities
  static cagedEntities        = new Map(); // playerName -> [{entity,origin,ticksLeft}]
  // Spirit regen tick counter
  static regenTicks           = new Map();

  // ═════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═════════════════════════════════════════════════════════════════════

  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  static _cd(map, player) {
    return (map.get(player.name) || 0) > 0;
  }

  static _setCd(map, player, ticks) {
    map.set(player.name, ticks);
  }

  static _cdMsg(map, player, name) {
    const rem = Math.ceil((map.get(player.name) || 0) / 20);
    player.sendMessage(`§c${name} on cooldown: §e${rem}s`);
  }

  static _spiritCheck(player, cost) {
    if (!SpiritSystem.consumeSpirit(player, cost)) {
      player.sendMessage(`§cNot enough spirit! Need §e${cost}`);
      return false;
    }
    return true;
  }

  // ── Raycast to find first solid block the player is looking at ────────
  static _raycastBlock(player, maxDist = 30) {
    const eye = player.getHeadLocation();
    const dir = player.getViewDirection();
    for (let i = 1; i <= maxDist * 2; i++) {
      const t = i * 0.5;
      const loc = { x: eye.x + dir.x * t, y: eye.y + dir.y * t, z: eye.z + dir.z * t };
      try {
        const block = player.dimension.getBlock({
          x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z),
        });
        if (block && !block.isAir && !block.isLiquid) return { block, loc };
      } catch(e) {}
    }
    return null;
  }

  // ── Raycast to find first entity the player is looking at ─────────────
  static _raycastEntity(player, maxDist = 30) {
    const eye = player.getHeadLocation();
    const dir = player.getViewDirection();
    for (let i = 2; i <= maxDist * 2; i++) {
      const t = i * 0.5;
      const loc = { x: eye.x + dir.x * t, y: eye.y + dir.y * t, z: eye.z + dir.z * t };
      try {
        const ents = player.dimension.getEntities({
          location: loc, maxDistance: 1.5,
          excludeTypes: ['minecraft:item', 'minecraft:xp_orb'],
        });
        for (const e of ents) {
          if (e.id === player.id) continue;
          return e;
        }
        // Stop ray at solid block
        const block = player.dimension.getBlock({
          x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z),
        });
        if (block && !block.isAir && !block.isLiquid) return null;
      } catch(e) {}
    }
    return null;
  }

  static _starParticleRing(dim, loc, count = 20, radius = 1.2) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const p = { x: loc.x + Math.cos(a) * radius, y: loc.y + 0.8, z: loc.z + Math.sin(a) * radius };
      try { dim.spawnParticle('minecraft:end_rod',        p); } catch(e) {}
      try { dim.spawnParticle('minecraft:totem_particle', p); } catch(e) {}
    }
  }

  static isNight(player) {
    try {
      const t = player.dimension.getTimeOfDay();
      return t >= 13000 && t <= 23000;
    } catch(e) {
      // fallback: check time via command output isn't easy; assume day
      return false;
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // PASSIVE TICK
  // ═════════════════════════════════════════════════════════════════════

  static applyPassiveAbilities(player) {
    // Inherit all Scroll Professor passives
    ScrollProfessorSequence.applyPassiveAbilities(player);

    // Health regen I (constant)
    const regen = player.getEffect('regeneration');
    if (!regen || regen.amplifier !== 0 || regen.duration < 200) {
      player.addEffect('regeneration', this.EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }

    // Passive spirit regen
    this._tickSpiritRegen(player);

    // Tick all cooldowns
    this._tickAllCooldowns(player);

    // Process active states
    this._processCages(player);
    this._processBridge(player);
    this._processLantern(player);

//     const spirit    = Math.floor(SpiritSystem.getSpirit(player));
// const maxSpirit = SpiritSystem.getMaxSpirit(player);
//     player.onScreenDisplay.setActionBar(
//   `§bSpirit: §f${spirit}§7/§f${maxSpirit}  §7│  §eConstellations Master`
// );
  }

  static _tickSpiritRegen(player) {
    const t = (this.regenTicks.get(player.name) || 0) + 1;
    if (t >= this.SPIRIT_REGEN_TICK) {
      SpiritSystem.restoreSpirit(player, this.SPIRIT_REGEN_RATE);
      this.regenTicks.set(player.name, 0);
    } else {
      this.regenTicks.set(player.name, t);
    }
  }

  static _tickAllCooldowns(player) {
    for (const map of [
      this.cageCooldowns, this.concealCooldowns, this.illuminCooldowns,
      this.bridgeCooldowns, this.pillarCooldowns, this.blinkCooldowns,
      this.pullCooldowns, this.spearCooldowns,
    ]) {
      const v = map.get(player.name);
      if (v && v > 0) map.set(player.name, v - 1);
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // WARLOCK SPELL UPGRADE — powder-free casting at Seq 5
  // Call this from main.js INSTEAD of WarlockSequence.castSelectedSpell
  // when the player is Seq 5.
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Cast the currently selected Warlock spell without consuming powder.
   * Costs the normal spirit + SPIRIT_POWDER_FREE_BONUS instead.
   */
  static castWarlockSpellFree(player) {
    const selectedSpell = player.getDynamicProperty('lotm:warlock_selected_spell') || 'flames';

    // Spirit costs per spell (mirrored from warlock.js + bonus)
    const spellSpiritCosts = {
      hand_of_force:  20 + this.SPIRIT_POWDER_FREE_BONUS,
      exorcism:       18 + this.SPIRIT_POWDER_FREE_BONUS,
      flames:         15 + this.SPIRIT_POWDER_FREE_BONUS,
      purification:   25 + this.SPIRIT_POWDER_FREE_BONUS,
      lightning:      20 + this.SPIRIT_POWDER_FREE_BONUS,
      sea_wave:       18 + this.SPIRIT_POWDER_FREE_BONUS,
      earth_wall:     22 + this.SPIRIT_POWDER_FREE_BONUS,
      ore_sense:      20 + this.SPIRIT_POWDER_FREE_BONUS,
      tunnel:         25 + this.SPIRIT_POWDER_FREE_BONUS,
    };

    const cost = spellSpiritCosts[selectedSpell] ?? (20 + this.SPIRIT_POWDER_FREE_BONUS);

    if (!this._spiritCheck(player, cost)) return false;

    // Delegate to WarlockSequence._executeSpell (bypasses powder check)
    // WarlockSequence exposes a static method for direct spell execution
    return WarlockSequence.executeSpellDirect(player, selectedSpell);
  }

  // ═════════════════════════════════════════════════════════════════════
  // ABILITY: STARLIGHT CAGE
  // Target entity is levitated + slowed + glowing, locked 8s
  // ═════════════════════════════════════════════════════════════════════

  static useStarlightCage(player) {
    if (this._cd(this.cageCooldowns, player)) {
      this._cdMsg(this.cageCooldowns, player, 'Starlight Cage'); return false;
    }
    const target = this._raycastEntity(player, 25);
    if (!target) { player.sendMessage('§cNo target found within 25 blocks!'); return false; }
    if (!this._spiritCheck(player, this.SPIRIT_STARLIGHT_CAGE)) return false;

    this._setCd(this.cageCooldowns, player, this.CD_STARLIGHT_CAGE); // set after spirit check passed

    const origin = { ...target.location };
    const cages = this.cagedEntities.get(player.name) || [];
    cages.push({ entity: target, origin, ticksLeft: 160 }); // 8s
    this.cagedEntities.set(player.name, cages);

    // Apply confinement effects
    target.addEffect('levitation',  160, { amplifier: 0, showParticles: false });
    target.addEffect('slowness',    160, { amplifier: 10, showParticles: false });
    target.addEffect('glowing',     160, { amplifier: 0, showParticles: false });
    target.addEffect('mining_fatigue', 160, { amplifier: 10, showParticles: false });

    // Summon visual cage — spiral of star particles
    this._starParticleRing(player.dimension, target.location, 24, 1.5);

    player.sendMessage('§b✦ Starlight Cage! Target bound in stellar amber!');
    player.playSound('block.amethyst_cluster.break', { pitch: 0.8, volume: 1.2 });
    return true;
  }

  static _processCages(player) {
    const cages = this.cagedEntities.get(player.name);
    if (!cages || cages.length === 0) return;

    const remaining = [];
    for (const cage of cages) {
      cage.ticksLeft--;

      // Keep entity roughly in place by re-teleporting if it drifts (every 10 ticks)
      if (cage.ticksLeft % 10 === 0) {
        try {
          const cur = cage.entity.location;
          const drift = Math.sqrt(
            (cur.x - cage.origin.x) ** 2 +
            (cur.z - cage.origin.z) ** 2
          );
          if (drift > 1.5) {
            cage.entity.teleport(cage.origin, { dimension: cage.entity.dimension });
          }
          // Particle pulse every 20 ticks
          if (cage.ticksLeft % 20 === 0) {
            this._starParticleRing(player.dimension, cage.origin, 16, 1.2);
          }
        } catch(e) {}
      }

      if (cage.ticksLeft > 0) {
        remaining.push(cage);
      } else {
        // Release
        try {
          cage.entity.removeEffect('levitation');
          cage.entity.removeEffect('slowness');
          cage.entity.removeEffect('mining_fatigue');
        } catch(e) {}
      }
    }
    this.cagedEntities.set(player.name, remaining);
  }

  // ═════════════════════════════════════════════════════════════════════
  // ABILITY: STAR CONCEALMENT  — invisibility 15s
  // ═════════════════════════════════════════════════════════════════════

  static useStarConcealment(player) {
    if (this._cd(this.concealCooldowns, player)) {
      this._cdMsg(this.concealCooldowns, player, 'Star Concealment'); return false;
    }
    if (!this._spiritCheck(player, this.SPIRIT_STAR_CONCEALMENT)) return false;

    this._setCd(this.concealCooldowns, player, this.CD_STAR_CONCEALMENT); // set after spirit check passed

    player.addEffect('invisibility', 300, { amplifier: 0, showParticles: false });
    // Night vision so concealed player can still see
    player.addEffect('night_vision', 300, { amplifier: 0, showParticles: false });

    // Fade-out particle burst
    this._starParticleRing(player.dimension, player.location, 20, 0.8);

    player.sendMessage('§b✦ Star Concealment! You fade among the stars...');
    player.playSound('mob.endermen.portal', { pitch: 1.5, volume: 0.8 });
    return true;
  }

  // ═════════════════════════════════════════════════════════════════════
  // ABILITY: STAR ILLUMINATION  — 1 sea lantern at head height at target
  // ═════════════════════════════════════════════════════════════════════

  static useStarIllumination(player) {
    if (this._cd(this.illuminCooldowns, player)) {
      this._cdMsg(this.illuminCooldowns, player, 'Star Illumination'); return false;
    }
    if (!this._spiritCheck(player, this.SPIRIT_STAR_ILLUMINATION)) return false;

    this._setCd(this.illuminCooldowns, player, this.CD_STAR_ILLUMINATION);

    // Find targeted location (use raycast, fallback to player head)
    const hit = this._raycastBlock(player, 20);
    let placeLoc;
    if (hit) {
      // Place lantern at hit block position + 2 (head height above ground)
      placeLoc = {
        x: Math.floor(hit.block.location.x),
        y: hit.block.location.y + 2,
        z: Math.floor(hit.block.location.z),
      };
    } else {
      placeLoc = {
        x: Math.floor(player.location.x),
        y: Math.floor(player.location.y) + 2,
        z: Math.floor(player.location.z),
      };
    }

    // Remove previous lantern for this player if still active
    const prev = this.activeLanterns.get(player.name);
    if (prev) {
      try {
        const old = player.dimension.getBlock(prev);
        if (old && old.typeId === 'minecraft:sea_lantern') {
          old.setType('minecraft:air');
        }
      } catch(e) {}
    }

    // Place sea lantern
    try {
      const block = player.dimension.getBlock(placeLoc);
      if (block && block.isAir) {
        block.setType('minecraft:sea_lantern');
        this.activeLanterns.set(player.name, { ...placeLoc, ticksLeft: 600 }); // 30s
        // Star sparkle at placement
        this._starParticleRing(player.dimension, { x: placeLoc.x, y: placeLoc.y, z: placeLoc.z }, 12, 1.0);
        player.sendMessage('§b✦ Star Illumination! A star descends to light the way.');
        player.playSound('block.amethyst_cluster.place', { pitch: 1.2, volume: 1.0 });
      } else {
        player.sendMessage('§cCannot place lantern here — block occupied.');
        SpiritSystem.restoreSpirit(player, this.SPIRIT_STAR_ILLUMINATION);
      }
    } catch(e) {
      player.sendMessage('§cFailed to place lantern.');
      SpiritSystem.restoreSpirit(player, this.SPIRIT_STAR_ILLUMINATION);
    }
    return true;
  }

  static _processLantern(player) {
    const l = this.activeLanterns.get(player.name);
    if (!l) return;
    l.ticksLeft--;
    if (l.ticksLeft <= 0) {
      try {
        const block = player.dimension.getBlock(l);
        if (block && block.typeId === 'minecraft:sea_lantern') {
          block.setType('minecraft:air');
        }
      } catch(e) {}
      this.activeLanterns.delete(player.name);
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // ABILITY: STAR BRIDGE
  // Builds a bridge of lotm:star_bridge_block forward at player Y level
  // up to 20 blocks or first solid block. Auto-removes after 30s.
  // ═════════════════════════════════════════════════════════════════════

  static useStarBridge(player) {
    if (this._cd(this.bridgeCooldowns, player)) {
      this._cdMsg(this.bridgeCooldowns, player, 'Star Bridge'); return false;
    }
    if (!this._spiritCheck(player, this.SPIRIT_STAR_BRIDGE)) return false;

    const pos      = player.location;
    const dir      = player.getViewDirection();
    const horizLen = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
    const normX    = horizLen > 0 ? dir.x / horizLen : 1;
    const normZ    = horizLen > 0 ? dir.z / horizLen : 0;
    const dim      = player.dimension;
    const placed   = [];

    // pos.y is the player's feet position (bottom of their hitbox).
    // The ground they stand on is the block at Math.floor(pos.y) - 1.
    // So we place bridge blocks at Math.floor(pos.y) - 1, and the player
    // walks on top of the block surface (top face = pos.y level).
    const by = Math.floor(pos.y) - 1;

    // Starting block: one full step forward from the player's foot position.
    // We use the player's foot XZ (not block-snapped) as the origin so the
    // step increments land squarely in front of them regardless of facing.
    // Perpendicular direction for 3-wide bridge
    // Rotate the horizontal direction 90 degrees to get the side offset
    const sideX = -normZ;
    const sideZ =  normX;

    for (let i = 1; i <= 20; i++) {
      // Use Math.round for clean diagonal stepping — no lightning zigzag
      const cx = Math.round(pos.x + normX * i);
      const cz = Math.round(pos.z + normZ * i);

      // Place 3 blocks wide: centre, left, right
      const positions = [
        { x: cx,                        z: cz },
        { x: Math.round(cx + sideX),    z: Math.round(cz + sideZ) },
        { x: Math.round(cx - sideX),    z: Math.round(cz - sideZ) },
      ];

      for (const bp of positions) {
        const bx = bp.x;
        const bz = bp.z;

        // Read what's at this position
        let blockType = 'minecraft:air';
        try {
          const existing = dim.getBlock({ x: bx, y: by, z: bz });
          blockType = existing ? existing.typeId : 'minecraft:air';
        } catch(e) {}

        const canPlace = blockType === 'minecraft:air'
          || blockType === 'minecraft:water'
          || blockType === 'minecraft:lava'
          || blockType === 'lotm:star_bridge_block'
          || blockType === 'minecraft:blue_stained_glass';

        if (!canPlace) continue;

        // Try custom block first, fall back to blue stained glass
        let didPlace = false;
        try {
          const r = player.runCommand(`setblock ${bx} ${by} ${bz} lotm:star_bridge_block`);
          if (r.successCount > 0) didPlace = true;
        } catch(e) {}

        if (!didPlace) {
          try {
            const r = player.runCommand(`setblock ${bx} ${by} ${bz} minecraft:blue_stained_glass`);
            if (r.successCount > 0) didPlace = true;
          } catch(e) {}
        }

        if (didPlace) {
          placed.push({ x: bx, y: by, z: bz });
          try {
            dim.spawnParticle('minecraft:end_rod',        { x: bx + 0.5, y: by + 1.1, z: bz + 0.5 });
            dim.spawnParticle('minecraft:totem_particle', { x: bx + 0.5, y: by + 1.1, z: bz + 0.5 });
          } catch(e) {}
        }
      }
    }

    if (placed.length === 0) {
      SpiritSystem.restoreSpirit(player, this.SPIRIT_STAR_BRIDGE);
      player.sendMessage('§cStar Bridge: no open positions found in that direction!');
      return false;
    }

    this._setCd(this.bridgeCooldowns, player, this.CD_STAR_BRIDGE);

    const existing = this.activeBridges.get(player.name);
    if (existing) this._clearBridge(player, existing, dim);
    this.activeBridges.set(player.name, { blocks: placed, ticksLeft: 600 });

    player.sendMessage(`§b✦ Star Bridge! §7(${placed.length} blocks, fades in 30s)`);
    player.playSound('block.amethyst_block.place', { pitch: 0.9, volume: 1.0 });
    return true;
  }

  static _clearBridge(player, bridgeData, dim) {
    if (!bridgeData || !bridgeData.blocks) return;
    for (const b of bridgeData.blocks) {
      try {
        // Try removing custom block
        player.runCommand(`setblock ${b.x} ${b.y} ${b.z} air replace lotm:star_bridge_block`);
      } catch(e) {}
      try {
        // Also try removing fallback glass block
        player.runCommand(`setblock ${b.x} ${b.y} ${b.z} air replace minecraft:blue_stained_glass`);
      } catch(e) {}
    }
  }

  static _processBridge(player) {
    const b = this.activeBridges.get(player.name);
    if (!b) return;
    b.ticksLeft--;
    if (b.ticksLeft <= 0) {
      this._clearBridge(player, b, player.dimension); // dim arg kept for compat
      this.activeBridges.delete(player.name);
      player.sendMessage('§7The Star Bridge fades...');
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // ABILITY: STAR PILLAR
  // Powerful AOE nuke at targeted location — 1s delay then 25dmg + Wither II
  // ═════════════════════════════════════════════════════════════════════

  static useStarPillar(player) {
    if (this._cd(this.pillarCooldowns, player)) {
      this._cdMsg(this.pillarCooldowns, player, 'Star Pillar'); return false;
    }
    if (!this._spiritCheck(player, this.SPIRIT_STAR_PILLAR)) return false;

    this._setCd(this.pillarCooldowns, player, this.CD_STAR_PILLAR);

    // Find target location
    const hit = this._raycastBlock(player, 40);
    const targetLoc = hit
      ? { x: hit.block.location.x + 0.5, y: hit.block.location.y + 1, z: hit.block.location.z + 0.5 }
      : { x: player.location.x + player.getViewDirection().x * 20,
          y: player.location.y,
          z: player.location.z + player.getViewDirection().z * 20 };

    const dim = player.dimension;

    player.sendMessage('§b✦ Star Pillar converging...');
    player.playSound('block.beacon.power_select', { pitch: 1.2, volume: 1.5 });

    // Descending beam effect (top → target over 20 ticks)
    for (let tick = 0; tick < 20; tick++) {
      system.runTimeout(() => {
        const progress = tick / 20;
        const beamY = targetLoc.y + 30 - (progress * 30);
        try {
          dim.spawnParticle('minecraft:end_rod',        { x: targetLoc.x, y: beamY, z: targetLoc.z });
          dim.spawnParticle('minecraft:totem_particle', { x: targetLoc.x, y: beamY, z: targetLoc.z });
          dim.spawnParticle('minecraft:end_rod',        { x: targetLoc.x + 0.3, y: beamY + 1, z: targetLoc.z });
          dim.spawnParticle('minecraft:end_rod',        { x: targetLoc.x - 0.3, y: beamY + 1, z: targetLoc.z });
        } catch(e) {}
      }, tick * 1);
    }

    // Impact after 1s (20 ticks)
    system.runTimeout(() => {
      // Impact burst
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const r = Math.random() * 3;
        try {
          dim.spawnParticle('minecraft:critical_hit_emitter', {
            x: targetLoc.x + Math.cos(a) * r, y: targetLoc.y + Math.random() * 3, z: targetLoc.z + Math.sin(a) * r,
          });
          dim.spawnParticle('minecraft:totem_particle', {
            x: targetLoc.x + Math.cos(a) * r * 0.5, y: targetLoc.y + 1, z: targetLoc.z + Math.sin(a) * r * 0.5,
          });
        } catch(e) {}
      }

      // Damage + Wither II all entities in 4-block radius
      try {
        const targets = dim.getEntities({
          location: targetLoc, maxDistance: 4,
          excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:player'],
        });
        for (const t of targets) {
          t.applyDamage(40);
          t.addEffect('wither', 100, { amplifier: 1, showParticles: true });
        }
        player.sendMessage(`§b✦ Star Pillar struck! §7(${targets.length} target${targets.length !== 1 ? 's' : ''} hit)`);
      } catch(e) {}

      try {
        dim.playSound('item.trident.thunder', targetLoc, { pitch: 0.7, volume: 2.0 });
      } catch(e) {}
    }, 20);

    return true;
  }

  // ═════════════════════════════════════════════════════════════════════
  // ABILITY: NIGHT BLINK
  // Night-only 40-block directional teleport (like Traveler blink)
  // ═════════════════════════════════════════════════════════════════════

  static useNightBlink(player) {
    if (this._cd(this.blinkCooldowns, player)) {
      this._cdMsg(this.blinkCooldowns, player, 'Night Blink'); return false;
    }
    if (!this._spiritCheck(player, this.SPIRIT_NIGHT_BLINK)) return false;

    const dir      = player.getViewDirection();
    const origin   = player.location;
    const horizLen = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
    const normX    = horizLen > 0 ? dir.x / horizLen : 0;
    const normZ    = horizLen > 0 ? dir.z / horizLen : 0;
    const RANGE    = 40;
    let dest       = null;

    // Scan from max range back toward player to find farthest safe landing
    for (let i = RANGE; i >= 2; i--) {
      const tx = origin.x + normX * i;
      const tz = origin.z + normZ * i;
      const ty = origin.y;
      try {
        const feet = player.dimension.getBlock({ x: Math.floor(tx), y: Math.floor(ty),     z: Math.floor(tz) });
        const head = player.dimension.getBlock({ x: Math.floor(tx), y: Math.floor(ty) + 1, z: Math.floor(tz) });
        if ((!feet || feet.isAir || feet.isLiquid) && (!head || head.isAir || head.isLiquid)) {
          dest = { x: tx, y: ty, z: tz };
          break;
        }
      } catch(e) {}
    }

    if (!dest) {
      // No good location — refund spirit, no cooldown
      SpiritSystem.restoreSpirit(player, this.SPIRIT_NIGHT_BLINK);
      player.sendMessage('§cNo clear path ahead for Night Blink!');
      return false;
    }

    // Only set CD after confirmed success
    this._setCd(this.blinkCooldowns, player, this.CD_NIGHT_BLINK);

    this._starParticleRing(player.dimension, origin, 16, 0.8);
    player.playSound('mob.endermen.portal', { pitch: 1.3, volume: 1.0 });
    player.teleport(dest, { dimension: player.dimension });
    this._starParticleRing(player.dimension, dest, 16, 0.8);
    player.playSound('mob.endermen.portal', { pitch: 1.6, volume: 0.8 });
    player.sendMessage('§b✦ Night Blink!');
    return true;
  }

  // ═════════════════════════════════════════════════════════════════════
  // ABILITY: STELLAR PULL
  // Pull a targeted entity to a position directly in front of the player
  // ═════════════════════════════════════════════════════════════════════

  static useStellarPull(player) {
    if (this._cd(this.pullCooldowns, player)) {
      this._cdMsg(this.pullCooldowns, player, 'Stellar Pull'); return false;
    }

    const target = this._raycastEntity(player, 40);
    if (!target) {
      player.sendMessage('§cNo target found within 40 blocks!');
      return false;
    }
    if (!this._spiritCheck(player, this.SPIRIT_STELLAR_PULL)) return false;

    // Calculate landing spot — 2 blocks directly in front of player
    const dir      = player.getViewDirection();
    const horizLen = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
    const normX    = horizLen > 0 ? dir.x / horizLen : 0;
    const normZ    = horizLen > 0 ? dir.z / horizLen : 0;
    const dest     = {
      x: player.location.x + normX * 2,
      y: player.location.y,
      z: player.location.z + normZ * 2,
    };

    // Pull particles — stream from target toward player
    const targetLoc = target.location;
    const dim       = player.dimension;
    for (let i = 0; i <= 10; i++) {
      system.runTimeout(() => {
        const t = i / 10;
        const px = targetLoc.x + (dest.x - targetLoc.x) * t;
        const py = targetLoc.y + 1 + (dest.y - targetLoc.y) * t;
        const pz = targetLoc.z + (dest.z - targetLoc.z) * t;
        try {
          dim.spawnParticle('minecraft:end_rod',        { x: px, y: py, z: pz });
          dim.spawnParticle('minecraft:totem_particle', { x: px, y: py, z: pz });
        } catch(e) {}
      }, i * 1);
    }

    // Teleport after trail completes
    system.runTimeout(() => {
      try {
        target.teleport(dest, { dimension: player.dimension });
        // Brief stun — slow + weakness
        target.addEffect('slowness',  60, { amplifier: 3, showParticles: false });
        target.addEffect('weakness',  60, { amplifier: 1, showParticles: false });
      } catch(e) {}
      // Impact burst at landing
      this._starParticleRing(dim, dest, 16, 1.0);
      try {
        player.playSound('item.trident.hit', { pitch: 1.4, volume: 1.0 });
      } catch(e) {}
    }, 12);

    this._setCd(this.pullCooldowns, player, this.CD_STELLAR_PULL);
    player.sendMessage('§b✦ Stellar Pull!');
    return true;
  }


  // ═════════════════════════════════════════════════════════════════════
  // ABILITY: SPEAR OF LONGINUS
  // Piercing stellar lance — travels 50 blocks, hits all entities in path
  // ═════════════════════════════════════════════════════════════════════

  static useSpearOfLonginus(player) {
    if (this._cd(this.spearCooldowns, player)) {
      this._cdMsg(this.spearCooldowns, player, 'Spear of Longinus'); return false;
    }
    if (!this._spiritCheck(player, this.SPIRIT_SPEAR_OF_LONGINUS)) return false;
    this._setCd(this.spearCooldowns, player, this.CD_SPEAR_OF_LONGINUS);

    const eye    = player.getHeadLocation();
    const dir    = player.getViewDirection();
    const dim    = player.dimension;
    const hitIds = new Set();

    player.playSound('item.trident.throw', { pitch: 0.7, volume: 1.5 });
    player.sendMessage('\u00a7b\u2666 \u00a7fSpear of Longinus!');

    // Spawn the visible spear projectile entity and teleport it forward each tick
    const startX = eye.x + dir.x * 1.5;
    const startY = eye.y + dir.y * 1.5;
    const startZ = eye.z + dir.z * 1.5;

    let spearEntity = null;
    try {
      spearEntity = dim.spawnEntity('lotm:spear_projectile', { x: startX, y: startY, z: startZ });
    } catch(e) {}

    // 2 blocks per tick = fast visible travel, 25 ticks = 50 block range
    const BLOCKS_PER_TICK = 2;
    const TOTAL_TICKS     = 25;
    let stopped = false;

    for (let tick = 0; tick < TOTAL_TICKS; tick++) {
      system.runTimeout(() => {
        if (stopped) return;

        const t    = tick * BLOCKS_PER_TICK;
        const posX = startX + dir.x * t;
        const posY = startY + dir.y * t;
        const posZ = startZ + dir.z * t;
        const loc  = { x: posX, y: posY, z: posZ };

        // Move spear entity
        if (spearEntity) {
          try { spearEntity.teleport(loc, { dimension: dim }); }
          catch(e) { spearEntity = null; }
        }

        // Block collision — stop
        try {
          const block = dim.getBlock({ x: Math.floor(posX), y: Math.floor(posY), z: Math.floor(posZ) });
          if (block && !block.isAir && !block.isLiquid) {
            stopped = true;
            if (spearEntity) { try { spearEntity.kill(); } catch(e) {} spearEntity = null; }
            this._spawnSpearImpact(dim, loc);
            try { dim.playSound('item.trident.hit_ground', loc, { pitch: 0.9, volume: 1.2 }); } catch(e) {}
            return;
          }
        } catch(e) {}

        // ── Particle trail ──────────────────────────────────────────────
        // Fill sub-steps between ticks so trail looks continuous
        for (let sub = 0; sub < BLOCKS_PER_TICK; sub++) {
          const frac = sub / BLOCKS_PER_TICK;
          const sLoc = { x: posX - dir.x * frac, y: posY - dir.y * frac, z: posZ - dir.z * frac };
          try { dim.spawnParticle('minecraft:end_rod', sLoc); } catch(e) {}
        }
        // Width — totem perpendicular to direction
        const perpX = -dir.z;
        const perpZ =  dir.x;
        for (const side of [-0.2, 0.2]) {
          try { dim.spawnParticle('minecraft:totem_particle', {
            x: posX + perpX * side, y: posY, z: posZ + perpZ * side,
          }); } catch(e) {}
        }
        // Leading tip — bright flash
        const tipLoc = { x: posX + dir.x * 0.6, y: posY + dir.y * 0.6, z: posZ + dir.z * 0.6 };
        try { dim.spawnParticle('minecraft:critical_hit_emitter', tipLoc); } catch(e) {}
        try { dim.spawnParticle('minecraft:end_rod',              tipLoc); } catch(e) {}
        // Golden tail sparkles
        for (let tail = 1; tail <= 3; tail++) {
          try { dim.spawnParticle('minecraft:totem_particle', {
            x: posX - dir.x * tail * 0.5,
            y: posY - dir.y * tail * 0.5,
            z: posZ - dir.z * tail * 0.5,
          }); } catch(e) {}
        }

        // ── Piercing hit detection ──────────────────────────────────────
        for (let sub = 0; sub < BLOCKS_PER_TICK * 4; sub++) {
          const frac = sub / (BLOCKS_PER_TICK * 4);
          const cLoc = {
            x: posX - dir.x * (1 - frac) * BLOCKS_PER_TICK,
            y: posY - dir.y * (1 - frac) * BLOCKS_PER_TICK,
            z: posZ - dir.z * (1 - frac) * BLOCKS_PER_TICK,
          };
          try {
            const entities = dim.getEntities({
              location: cLoc, maxDistance: 1.0,
              excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow'],
            });
            for (const target of entities) {
              if (target.id === player.id) continue;
              if (spearEntity && target.id === spearEntity.id) continue;
              if (hitIds.has(target.id)) continue;
              hitIds.add(target.id);
              target.applyDamage(30);
              try { target.addEffect('wither', 40, { amplifier: 0, showParticles: true }); } catch(e) {}
              try { target.applyKnockback(dir.x * 1.5, dir.z * 1.5, 1.5, 0.2); } catch(e) {}
              this._spawnSpearHit(dim, target.location);
              try { dim.playSound('item.trident.hit', cLoc, { pitch: 1.0 + Math.random() * 0.3, volume: 1.0 }); } catch(e) {}
            }
          } catch(e) {}
        }

        // End of travel
        if (tick === TOTAL_TICKS - 1) {
          if (spearEntity) { try { spearEntity.kill(); } catch(e) {} }
          this._spawnSpearImpact(dim, loc);
        }
      }, tick * 1);
    }
    return true;
  }


  static _spawnSpearImpact(dim, loc) {
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = Math.random() * 0.8;
      const p = { x: loc.x + Math.cos(a) * r, y: loc.y + Math.sin(a) * r * 0.5, z: loc.z + Math.sin(a) * r };
      try { dim.spawnParticle('minecraft:end_rod',              p); } catch(e) {}
      try { dim.spawnParticle('minecraft:totem_particle',       p); } catch(e) {}
      try { dim.spawnParticle('minecraft:critical_hit_emitter', p); } catch(e) {}
    }
  }

  static _spawnSpearHit(dim, loc) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const p = { x: loc.x + Math.cos(a) * 0.4, y: loc.y + 1.0, z: loc.z + Math.sin(a) * 0.4 };
      try { dim.spawnParticle('minecraft:end_rod',              p); } catch(e) {}
      try { dim.spawnParticle('minecraft:critical_hit_emitter', p); } catch(e) {}
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // UNIFIED ABILITY HANDLER (called from menus / direct key)
  // ═════════════════════════════════════════════════════════════════════

  static handleAbilityUse(player, abilityId) {
    switch(abilityId) {
      case this.ABILITIES.STARLIGHT_CAGE:    return this.useStarlightCage(player);
      case this.ABILITIES.STAR_CONCEALMENT:  return this.useStarConcealment(player);
      case this.ABILITIES.STAR_ILLUMINATION: return this.useStarIllumination(player);
      case this.ABILITIES.STAR_BRIDGE:       return this.useStarBridge(player);
      case this.ABILITIES.STAR_PILLAR:       return this.useStarPillar(player);
      case this.ABILITIES.NIGHT_BLINK:       return this.useNightBlink(player);
      case this.ABILITIES.STELLAR_PULL:      return this.useStellarPull(player);
      case this.ABILITIES.SPEAR_OF_LONGINUS: return this.useSpearOfLonginus(player);
      default:
        player.sendMessage(`§cUnknown ability: ${abilityId}`);
        return false;
    }
  }

  static getAllAbilities() {
    return [
      { id: this.ABILITIES.STARLIGHT_CAGE,    name: '✦ Starlight Cage',    desc: `${this.SPIRIT_STARLIGHT_CAGE} spirit | 20s CD | Bind target in stellar amber` },
      { id: this.ABILITIES.STAR_CONCEALMENT,  name: '✦ Star Concealment',  desc: `${this.SPIRIT_STAR_CONCEALMENT} spirit | 45s CD | Invisibility 15s` },
      { id: this.ABILITIES.STAR_ILLUMINATION, name: '✦ Star Illumination',  desc: `${this.SPIRIT_STAR_ILLUMINATION} spirit | 15s CD | Light the targeted area` },
      { id: this.ABILITIES.STAR_BRIDGE,       name: '✦ Star Bridge',        desc: `${this.SPIRIT_STAR_BRIDGE} spirit | 20s CD | Bridge forward 20 blocks, 30s` },
      { id: this.ABILITIES.STAR_PILLAR,       name: '✦ Star Pillar',        desc: `${this.SPIRIT_STAR_PILLAR} spirit | 60s CD | Stellar nuke at target, 25dmg+Wither` },
      { id: this.ABILITIES.NIGHT_BLINK,       name: '✦ Night Blink',        desc: `${this.SPIRIT_NIGHT_BLINK} spirit | 30s CD | Teleport 40 blocks forward` },
      { id: this.ABILITIES.STELLAR_PULL,     name: '✦ Stellar Pull',       desc: `${this.SPIRIT_STELLAR_PULL} spirit | 20s CD | Yank target to you` },
      { id: this.ABILITIES.SPEAR_OF_LONGINUS, name: '✦ Spear of Longinus',  desc: `${this.SPIRIT_SPEAR_OF_LONGINUS} spirit | 30s CD | Piercing stellar lance, 22dmg + Wither` },
    ];
  }
}
