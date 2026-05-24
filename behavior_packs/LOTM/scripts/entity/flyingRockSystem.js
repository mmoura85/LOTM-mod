import { system, world } from '@minecraft/server';
import { SpiritSystem } from '../core/spiritSystem.js';

export class FlyingRockSystem {
  // ── Config ────────────────────────────────────────────────────────────
  static HORIZONTAL_SPEED    = 1.4;
  static VERTICAL_SPEED      = 1.0;
  static BOOST_SPEED         = 1.8;
  static HOVER_BOB_AMPLITUDE = 0.03;
  static SPIRIT_DRAIN_COST   = 2;
  static SPIRIT_DRAIN_TICK   = 40;
  static SUMMON_SPIRIT_COST  = 30;

  // ── State ─────────────────────────────────────────────────────────────
  static activeRocks = new Map(); // playerName → { entity, drainTick }
  static bobTick     = 0;

  // ═════════════════════════════════════════════════════════════════════
  // MAIN TICK — call once per runInterval from main.js
  // ═════════════════════════════════════════════════════════════════════

  static tick() {
    this.bobTick++;

    for (const [playerName, rockData] of this.activeRocks.entries()) {
      const { entity } = rockData;

      // Safe entity validity — try accessing location, delete entry if it throws
      let entityAlive = false;
      try { void entity.location; entityAlive = true; } catch(e) {}

      if (!entityAlive) {
        this.activeRocks.delete(playerName);
        continue;
      }

      // Rider detection — getRiders() doesn't exist in Bedrock scripting 1.8
      // Instead: find the named player and check if they are close to the rock
      let rider = null;
      try {
        for (const p of world.getPlayers()) {
          if (p.name !== playerName) continue;
          const pLoc = p.location;
          const eLoc = entity.location;
          const dist = Math.sqrt(
            (pLoc.x - eLoc.x) ** 2 +
            (pLoc.y - eLoc.y) ** 2 +
            (pLoc.z - eLoc.z) ** 2
          );
          if (dist < 2.0) rider = p;
          break;
        }
      } catch(e) {}

      if (rider) {
        this._handleRiddenMovement(rider, entity, rockData);
      } else {
        this._handleIdleHover(entity);
      }

      if (this.bobTick % 10 === 0) {
        this._spawnAmbientParticles(entity);
      }
    }
  }

  // ── Ridden movement ───────────────────────────────────────────────────

  static _handleRiddenMovement(player, rock, rockData) {
    // Spirit drain
    rockData.drainTick = (rockData.drainTick || 0) + 1;
    if (rockData.drainTick >= this.SPIRIT_DRAIN_TICK) {
      rockData.drainTick = 0;
      if (!SpiritSystem.consumeSpirit(player, this.SPIRIT_DRAIN_COST)) {
        try {
          player.sendMessage('§cNot enough spirit to sustain the Flying Rock!');
          player.runCommand('ride @s stop_riding');
        } catch(e) {}
        return;
      }
    }

    const view     = player.getViewDirection();
    const rot      = player.getRotation();  // { x: pitch degrees, y: yaw degrees }
    const isSprint = player.isSprinting;
    const hSpeed   = isSprint
      ? this.HORIZONTAL_SPEED * this.BOOST_SPEED
      : this.HORIZONTAL_SPEED;

    // ── Horizontal movement — use yaw angle directly for clean cardinal movement
    // Convert yaw (degrees, 0=south, 90=west, -90=east, 180=north) to XZ vector
    const yawRad = (rot.y * Math.PI) / 180;
    const moveX  = -Math.sin(yawRad) * hSpeed;
    const moveZ  =  Math.cos(yawRad) * hSpeed;

    // ── Vertical movement — pitch based
    // rot.x in Bedrock: negative = looking up, positive = looking down
    // Use a 20 degree dead zone so level flight is stable
    // Multiply aggressively so even moderate tilt gives strong lift
    const pitchDeg = Math.max(-90, Math.min(90, rot.x));
    const pitchAbs = Math.abs(pitchDeg);
    let vSpeed = 0;
    if (pitchAbs > 15) {
      // Scale 20-90 degree range to 0-1, then apply vertical speed
      const pitchNorm = (pitchAbs - 15) / 70;
      vSpeed = -(Math.sign(pitchDeg)) * pitchNorm * this.VERTICAL_SPEED;
    }

    // Teleport rock — with auto-step for ground riding
    try {
      const loc = rock.location;
      const dim = rock.dimension;
      let newX  = loc.x + moveX;
      let newY  = loc.y + vSpeed;
      let newZ  = loc.z + moveZ;

      // Auto-step when moving horizontally with no intentional vertical input
      if (Math.abs(vSpeed) < 0.1 && (Math.abs(moveX) > 0.01 || Math.abs(moveZ) > 0.01)) {
        try {
          const aheadFeet = dim.getBlock({ x: Math.floor(newX), y: Math.floor(newY),     z: Math.floor(newZ) });
          const aheadHead = dim.getBlock({ x: Math.floor(newX), y: Math.floor(newY) + 1, z: Math.floor(newZ) });
          if (aheadFeet && !aheadFeet.isAir && !aheadFeet.isLiquid) {
            if (!aheadHead || aheadHead.isAir || aheadHead.isLiquid) {
              newY += 1; // step up
            }
          }
          const below      = dim.getBlock({ x: Math.floor(newX), y: Math.floor(newY) - 1, z: Math.floor(newZ) });
          const belowBelow = dim.getBlock({ x: Math.floor(newX), y: Math.floor(newY) - 2, z: Math.floor(newZ) });
          if (below && below.isAir && belowBelow && !belowBelow.isAir) {
            newY -= 1; // step down
          }
        } catch(e) {}
      }

      rock.teleport(
        { x: newX, y: newY, z: newZ },
        { dimension: rock.dimension }
      );
    } catch(e) {}

    // Rotate rock yaw to match player facing
    try {
      rock.setRotation({ x: 0, y: rot.y });
    } catch(e) {}
  }

  // ── Idle hover ────────────────────────────────────────────────────────

  static _handleIdleHover(rock) {
    // Only bob every 3 ticks to reduce teleport spam when idle
    if (this.bobTick % 3 !== 0) return;
    const bob = Math.sin(this.bobTick * 0.04) * this.HOVER_BOB_AMPLITUDE;
    try {
      const loc = rock.location;
      rock.teleport(
        { x: loc.x, y: loc.y + bob, z: loc.z },
        { dimension: rock.dimension }
      );
    } catch(e) {}
  }

  // ── Ambient particles ─────────────────────────────────────────────────

  static _spawnAmbientParticles(rock) {
    try {
      const loc = rock.location;
      const dim = rock.dimension;
      for (let i = 0; i < 3; i++) {
        const angle = ((i / 3) * Math.PI * 2) + (this.bobTick * 0.05);
        const p = {
          x: loc.x + Math.cos(angle) * 1.2,
          y: loc.y - 0.2,
          z: loc.z + Math.sin(angle) * 1.2,
        };
        try { dim.spawnParticle('minecraft:end_rod',        p); } catch(e) {}
        try { dim.spawnParticle('minecraft:totem_particle', p); } catch(e) {}
      }
    } catch(e) {}
  }

  // ═════════════════════════════════════════════════════════════════════
  // SUMMON / DISMISS
  // ═════════════════════════════════════════════════════════════════════

  static summonRock(player) {
    const existing = this.activeRocks.get(player.name);

    let existingAlive = false;
    if (existing) {
      try { void existing.entity.location; existingAlive = true; } catch(e) {}
    }

    if (existingAlive) {
      try { existing.entity.kill(); } catch(e) {}
      this.activeRocks.delete(player.name);
      player.sendMessage('§7Flying Rock dismissed.');
      return;
    }

    if (!SpiritSystem.consumeSpirit(player, this.SUMMON_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.SUMMON_SPIRIT_COST}`);
      return;
    }

    const fwd    = player.getViewDirection();
    const horizL = Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z);
    const fwdNX  = horizL > 0 ? fwd.x / horizL : 0;
    const fwdNZ  = horizL > 0 ? fwd.z / horizL : 0;
    const spawnLoc = {
      x: player.location.x + fwdNX * 2,
      y: player.location.y,
      z: player.location.z + fwdNZ * 2,
    };

    let rock = null;
    try {
      rock = player.dimension.spawnEntity('lotm:flying_rock', spawnLoc);
    } catch(e) {
      player.sendMessage('§cFailed to summon Flying Rock!');
      SpiritSystem.restoreSpirit(player, this.SUMMON_SPIRIT_COST);
      return;
    }

    try { rock.addTag(`owner:${player.name}`); } catch(e) {}
    this.activeRocks.set(player.name, { entity: rock, drainTick: 0 });

    const dim = player.dimension;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const p = {
        x: spawnLoc.x + Math.cos(a) * 1.5,
        y: spawnLoc.y + 0.5,
        z: spawnLoc.z + Math.sin(a) * 1.5,
      };
      try { dim.spawnParticle('minecraft:end_rod',        p); } catch(e) {}
      try { dim.spawnParticle('minecraft:totem_particle', p); } catch(e) {}
    }

    player.sendMessage('§b✦ Flying Rock summoned! §7Right-click it to mount.');
    player.playSound('block.stone.place', { pitch: 0.4, volume: 1.5 });
  }

  // ═════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═════════════════════════════════════════════════════════════════════

  static despawnRock(playerName) {
    const data = this.activeRocks.get(playerName);
    if (data) {
      try { data.entity.kill(); } catch(e) {}
      this.activeRocks.delete(playerName);
    }
  }
}
