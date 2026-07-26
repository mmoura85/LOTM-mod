// ============================================
// DAWN PALADIN - SEQUENCE 6 TWILIGHT GIANT PATHWAY
// v3 - Dawn Sword + Air Slash + Enhanced Hurricane + Dawn Armour
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { WeaponMasterSequence } from './weapon_master.js';

export class DawnPaladinSequence {
  static SEQUENCE_NUMBER = 6;
  static PATHWAY = 'twilight_giant';

  static EFFECT_DURATION = 999999;

  static STRENGTH_AMPLIFIER = 4;
  static SPEED_AMPLIFIER    = 3;
  static SPEED_NORMAL       = 2;
  static JUMP_AMPLIFIER     = 2;

  // ── Light of Dawn ──────────────────────────────────────────────────────────
  static LIGHT_OF_DAWN_RANGE          = 20;
  static LIGHT_OF_DAWN_DURATION       = 300;
  static LIGHT_OF_DAWN_SPIRIT_COST    = 60;
  static LIGHT_OF_DAWN_COOLDOWN       = 600;
  static LIGHT_OF_DAWN_DAMAGE         = 5;
  static LIGHT_OF_DAWN_DAMAGE_ONGOING = 3;

  // ── Hurricane of Light ─────────────────────────────────────────────────────
  static HURRICANE_SPIRIT_COST     = 70;
  static HURRICANE_RANGE           = 20;
  static HURRICANE_DURATION        = 120;
  static HURRICANE_COOLDOWN        = 2400;
  static HURRICANE_SWORDS_PER_WAVE = 12;
  static HURRICANE_SWORD_DAMAGE    = 14;
  static HURRICANE_UNDEAD_DAMAGE   = 22;
  static HURRICANE_WAVE_INTERVAL   = 20;

  // ── Dawn Sword ─────────────────────────────────────────────────────────────
  static DAWN_SWORD_SPIRIT_COST = 50;
  static DAWN_SWORD_DURATION    = 1200; // 60 seconds
  static DAWN_SWORD_COOLDOWN    = 600;  // 30s

  // ── Air Slash ──────────────────────────────────────────────────────────────
  static AIR_SLASH_SPIRIT_COST = 15;
  static AIR_SLASH_DAMAGE      = 12;
  static AIR_SLASH_COOLDOWN    = 40;

  // ── Dawn Armour ────────────────────────────────────────────────────────────
  static DAWN_ARMOUR_SPIRIT_COST = 80;
  static DAWN_ARMOUR_DURATION    = 1200; // 60 seconds
  static DAWN_ARMOUR_COOLDOWN    = 1200; // 60s

  // State maps
  static activeLightZones    = new Map();
  static lightCooldowns      = new Map();
  static hurricaneCooldowns  = new Map();
  static activeHurricanes    = new Map();
  static dawnSwordTicks      = new Map();
  static dawnSwordCooldowns  = new Map();
  static airSlashCooldowns   = new Map();
  static dawnArmourTicks     = new Map();
  static dawnArmourCooldowns = new Map();
  static storedArmour        = new Map();

  static ABILITIES = {
    LIGHT_OF_DAWN:      'light_of_dawn',
    HURRICANE_OF_LIGHT: 'hurricane_of_light',
    DAWN_SWORD:         'dawn_sword',
    DAWN_ARMOUR:        'dawn_armour',
  };

  static dawnSwordAbilityIndex = new Map(); // playerName -> 0 (Hurricane) or 1 (Air Slash)

  static selectedAbilities    = new Map();
  static SELECTED_ABILITY_PROP = 'lotm:dawn_selected_ability';


  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // =============================================
  // PASSIVE ABILITIES
  // =============================================
  static applyPassiveAbilities(player) {
    this.applyPhysicalEnhancements(player);
    this.applyHealthBonus(player, 8);
    this.applyGiantSize(player);
    this.processLightOfDawn(player);
    this.processHurricaneOfLight(player);
    this._processDawnSword(player);
    this._processDawnArmour(player);
    this.tickCooldowns(player);
    this.applyWeaponEnchantments(player);

    const spirit    = Math.floor(SpiritSystem.getSpirit(player));
    const maxSpirit = SpiritSystem.getMaxSpirit(player);
    const swordTag  = this.dawnSwordTicks.has(player.name)
      ? `§6⚔§7(${Math.ceil(this.dawnSwordTicks.get(player.name)/20)}s) ` : '';
    const armourTag = this.dawnArmourTicks.has(player.name)
      ? `§6🛡§7(${Math.ceil(this.dawnArmourTicks.get(player.name)/20)}s) ` : '';
    player.onScreenDisplay.setActionBar(
      `§bSpirit: §f${spirit}§7/§f${maxSpirit}  ${swordTag}${armourTag}`
    );
  }

  static applyPhysicalEnhancements(player) {
    const spd = player.isSprinting ? this.SPEED_AMPLIFIER : this.SPEED_NORMAL;
    const s   = player.getEffect('strength');
    if (!s || s.amplifier !== this.STRENGTH_AMPLIFIER || s.duration < 200)
      player.addEffect('strength',    this.EFFECT_DURATION, { amplifier: this.STRENGTH_AMPLIFIER, showParticles: false });
    const sp  = player.getEffect('speed');
    if (!sp || sp.amplifier !== spd || sp.duration < 200)
      player.addEffect('speed',       this.EFFECT_DURATION, { amplifier: spd, showParticles: false });
    const j   = player.getEffect('jump_boost');
    if (!j || j.amplifier !== this.JUMP_AMPLIFIER || j.duration < 200)
      player.addEffect('jump_boost',  this.EFFECT_DURATION, { amplifier: this.JUMP_AMPLIFIER, showParticles: false });
  }

  static applyHealthBonus(player, hp) {
    const amp = Math.floor(hp / 4) - 1;
    const hb  = player.getEffect('health_boost');
    if (!hb || hb.amplifier !== amp || hb.duration < 200)
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier: amp, showParticles: false });
  }

  static applyGiantSize(player) {
    // try { player.addEffect('slow_falling', 40, { amplifier: 0, showParticles: false }); } catch (_) {}
  }

  static applyWeaponEnchantments(player) {
    try {
      const inv = player.getComponent('minecraft:inventory');
      if (!inv?.container) return;
      const held = inv.container.getItem(player.selectedSlotIndex);
      if (!held || (!held.typeId.includes('sword') && !held.typeId.includes('axe') && held.typeId !== 'lotm:dawn_sword')) return;
      const enc = held.getComponent('minecraft:enchantable');
      if (!enc) return;
      if (!enc.hasEnchantment('sharpness'))  enc.addEnchantment({ type: 'sharpness',  level: 5 });
      if (!enc.hasEnchantment('fire_aspect')) enc.addEnchantment({ type: 'fire_aspect', level: 2 });
      if (!enc.hasEnchantment('unbreaking')) enc.addEnchantment({ type: 'unbreaking', level: 3 });
      inv.container.setItem(player.selectedSlotIndex, held);
    } catch (_) {}
  }

  // =============================================
  // COOLDOWN HELPERS
  // =============================================
  static tickCooldowns(player) {
    const n    = player.name;
    const tick = v => Math.max(0, v - 1);
    const maps = [this.lightCooldowns, this.hurricaneCooldowns, this.dawnSwordCooldowns,
                  this.airSlashCooldowns, this.dawnArmourCooldowns];
    for (const m of maps) { const v = m.get(n); if (v) m.set(n, tick(v)); }
  }

  static _cdRemaining(map, player) {
    const v = map.get(player.name) || 0;
    return v > 0 ? Math.ceil(v / 20) : 0;
  }


  static getSelectedAbility(player) {
    if (!this.selectedAbilities.has(player.name)) {
      try {
        const saved = player.getDynamicProperty(this.SELECTED_ABILITY_PROP);
        if (saved) this.selectedAbilities.set(player.name, saved);
      } catch (_) {}
    }
    return this.selectedAbilities.get(player.name) || this.ABILITIES.LIGHT_OF_DAWN;
  }

  static setSelectedAbility(player, abilityId) {
    this.selectedAbilities.set(player.name, abilityId);
    try { player.setDynamicProperty(this.SELECTED_ABILITY_PROP, abilityId); } catch (_) {}
  }

  static useSelectedAbility(player) {
    return this.handleAbilityUse(player, this.getSelectedAbility(player));
  }

  // =============================================
  // ABILITY: LIGHT OF DAWN
  // =============================================
  static useLightOfDawn(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }
    const cd = this._cdRemaining(this.lightCooldowns, player);
    if (cd > 0) { player.sendMessage(`§cLight of Dawn on cooldown: §e${cd}s`); return false; }
    if (this.activeLightZones.has(player.name)) { player.sendMessage('§cZone already active!'); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.LIGHT_OF_DAWN_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.LIGHT_OF_DAWN_SPIRIT_COST}`); return false;
    }
    const location = { ...player.location };
    this.activeLightZones.set(player.name, {
      location, dimensionId: player.dimension.id,
      ticksRemaining: this.LIGHT_OF_DAWN_DURATION, blocks: []
    });
    this.lightCooldowns.set(player.name, this.LIGHT_OF_DAWN_COOLDOWN);
    player.sendMessage('§6§l✦ LIGHT OF DAWN ✦');
    player.playSound('beacon.activate', { pitch: 0.9, volume: 1.0 });
    this._spawnLightRay(player.dimension, location, 30);
    this._applyLightDamage(player.dimension, location, this.LIGHT_OF_DAWN_RANGE, this.LIGHT_OF_DAWN_DAMAGE);
    return true;
  }

  static processLightOfDawn(player) {
    const zone = this.activeLightZones.get(player.name);
    if (!zone) return;
    zone.ticksRemaining--;
    let dim;
    try { dim = world.getDimension(zone.dimensionId); } catch (_) { return; }
    if (zone.ticksRemaining % 40 === 0) this._spawnLightRay(dim, zone.location, 20);
    if (zone.ticksRemaining % 10 === 0) this._spawnLightZoneParticles(dim, zone.location, 6);
    if (zone.ticksRemaining % 40 === 0) this._applyLightDamage(dim, zone.location, this.LIGHT_OF_DAWN_RANGE, this.LIGHT_OF_DAWN_DAMAGE_ONGOING);
    if (zone.ticksRemaining <= 0) {
      this.activeLightZones.delete(player.name);
      player.sendMessage('§7Light of Dawn fades...');
    }
  }

  static _spawnLightRay(dim, loc, height) {
    for (let h = 0; h < height; h++) {
      try { dim.spawnParticle('minecraft:totem_particle', { x: loc.x, y: loc.y + h, z: loc.z }); } catch (_) {}
    }
  }

  static _spawnLightZoneParticles(dim, loc, count) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      try { dim.spawnParticle('minecraft:endrod', {
        x: loc.x + Math.cos(a) * 8, y: loc.y + 0.5, z: loc.z + Math.sin(a) * 8
      }); } catch (_) {}
    }
  }

  static _applyLightDamage(dim, loc, range, damage) {
    try {
      const entities = dim.getEntities({ location: loc, maxDistance: range,
        excludeTypes: ['minecraft:item', 'minecraft:player', 'minecraft:xp_orb'] });
      for (const e of entities) {
        const isUndead = ['zombie','skeleton','phantom','wither','drowned','husk','stray',
          'lotm:ghoul','lotm:vengeful_ghost'].some(t => e.typeId.includes(t));
        try { e.applyDamage(isUndead ? damage * 2 : damage); } catch (_) {}
        if (isUndead) { try { e.addEffect('weakness', 100, { amplifier: 2, showParticles: true }); } catch (_) {} }
      }
    } catch (_) {}
  }

  // =============================================
  // ABILITY: HURRICANE OF LIGHT (enhanced)
  // =============================================
  static useHurricaneOfLight(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }
    const cd = this._cdRemaining(this.hurricaneCooldowns, player);
    if (cd > 0) { player.sendMessage(`§cHurricane of Light on cooldown: §e${cd}s`); return false; }
    if (this.activeHurricanes.has(player.name)) { player.sendMessage('§cHurricane already active!'); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.HURRICANE_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.HURRICANE_SPIRIT_COST}`); return false;
    }
    const location = { ...player.location };
    this.activeHurricanes.set(player.name, {
      location, dimensionId: player.dimension.id,
      ticksRemaining: this.HURRICANE_DURATION, waveCount: 0
    });
    this.hurricaneCooldowns.set(player.name, this.HURRICANE_COOLDOWN);
    player.sendMessage('§6§l☀ HURRICANE OF LIGHT ☀');
    player.sendMessage('§eSwords of dawn rain from the heavens!');
    player.playSound('item.trident.thunder', { pitch: 0.8, volume: 1.5 });
    for (let i = 0; i < 40; i++) {
      const a = (i/40)*Math.PI*2;
      try { player.dimension.spawnParticle('minecraft:totem_particle', {
        x: location.x+Math.cos(a)*this.HURRICANE_RANGE*0.5,
        y: location.y+12,
        z: location.z+Math.sin(a)*this.HURRICANE_RANGE*0.5
      }); } catch (_) {}
    }
    return true;
  }

  static processHurricaneOfLight(player) {
    const h = this.activeHurricanes.get(player.name);
    if (!h) return;
    h.ticksRemaining--;
    let dim;
    try { dim = world.getDimension(h.dimensionId); } catch (_) { return; }
    if (h.ticksRemaining % this.HURRICANE_WAVE_INTERVAL === 0) {
      this._spawnSwordWave(dim, player, h);
      h.waveCount++;
    }
    if (h.ticksRemaining % 10 === 0) this._applyHurricaneDamage(dim, h);
    if (h.ticksRemaining <= 0) {
      this.activeHurricanes.delete(player.name);
      player.sendMessage('§7The hurricane subsides...');
      player.playSound('item.trident.return', { pitch: 1.0, volume: 1.0 });
    }
  }

  static _spawnSwordWave(dim, player, h) {
    const loc = h.location;
    for (let i = 0; i < this.HURRICANE_SWORDS_PER_WAVE; i++) {
      const angle  = (i / this.HURRICANE_SWORDS_PER_WAVE) * Math.PI * 2 + h.waveCount * 0.4;
      const radius = 2 + Math.random() * this.HURRICANE_RANGE;
      const sx = loc.x + Math.cos(angle) * radius;
      const sz = loc.z + Math.sin(angle) * radius;
      const sy = loc.y + 14 + Math.random() * 6;

      // Gold/white falling sword particles
      for (let drop = 0; drop < 8; drop++) {
        try { dim.spawnParticle('minecraft:totem_particle', {
          x: sx+(Math.random()-0.5)*0.3, y: sy-drop*1.2, z: sz+(Math.random()-0.5)*0.3
        }); } catch (_) {}
        try { dim.spawnParticle('minecraft:endrod', { x: sx, y: sy-drop*1.4, z: sz }); } catch (_) {}
      }
      // Impact flash
      try { dim.spawnParticle('minecraft:totem_particle', { x: sx, y: loc.y+0.5, z: sz }); } catch (_) {}
      try { dim.spawnParticle('minecraft:large_explosion',{ x: sx, y: loc.y+0.5, z: sz }); } catch (_) {}

      // Damage at impact
      try {
        const near = dim.getEntities({ location: { x: sx, y: loc.y, z: sz }, maxDistance: 2,
          excludeTypes: ['minecraft:item','minecraft:xp_orb','minecraft:player'] });
        for (const e of near) {
          const isUndead = ['zombie','skeleton','phantom','wither','drowned','husk','stray',
            'lotm:ghoul','lotm:vengeful_ghost'].some(t => e.typeId.includes(t));
          try { e.applyDamage(isUndead ? this.HURRICANE_UNDEAD_DAMAGE : this.HURRICANE_SWORD_DAMAGE); } catch (_) {}
          try { e.setOnFire(2, true); } catch (_) {}
        }
      } catch (_) {}
    }
  }

  static _applyHurricaneDamage(dim, h) {
    try {
      const entities = dim.getEntities({ location: h.location, maxDistance: this.HURRICANE_RANGE,
        excludeTypes: ['minecraft:item','minecraft:xp_orb','minecraft:player'] });
      for (const e of entities) {
        try { e.addEffect('slowness', 40, { amplifier: 1, showParticles: false }); } catch (_) {}
      }
    } catch (_) {}
  }

  // =============================================
  // ABILITY: DAWN SWORD
  // =============================================
  static useDawnSword(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }
    if (this.dawnSwordTicks.has(player.name)) { player.sendMessage('§cDawn Sword already active!'); return false; }
    const cd = this._cdRemaining(this.dawnSwordCooldowns, player);
    if (cd > 0) { player.sendMessage(`§cDawn Sword on cooldown: §e${cd}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.DAWN_SWORD_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.DAWN_SWORD_SPIRIT_COST}`); return false;
    }
    try { player.runCommand('give @s lotm:dawn_sword 1'); } catch (_) {}
    this.dawnSwordTicks.set(player.name, this.DAWN_SWORD_DURATION);
    player.sendMessage('§6§l⚔ DAWN SWORD ⚔');
    player.sendMessage('§7A blade of pure dawn light! (60s)');
    player.sendMessage('§e Sneak+use: Air Slash  |  Use: Hurricane of Light');
    player.playSound('item.trident.throw', { pitch: 0.7, volume: 1.0 });
    const loc = player.location;
    for (let i = 0; i < 20; i++) {
      const a = (i/20)*Math.PI*2;
      try { player.dimension.spawnParticle('minecraft:totem_particle', {
        x: loc.x+Math.cos(a)*0.8, y: loc.y+1.2, z: loc.z+Math.sin(a)*0.8
      }); } catch (_) {}
    }
    return true;
  }

  static _processDawnSword(player) {
    const ticks = this.dawnSwordTicks.get(player.name);
    if (!ticks) return;
    this.dawnSwordTicks.set(player.name, ticks - 1);
    if (ticks === 100) player.sendMessage('§6Dawn Sword fading in 5 seconds...');
    if (ticks <= 1) {
      this.dawnSwordTicks.delete(player.name);
      this.dawnSwordCooldowns.set(player.name, this.DAWN_SWORD_COOLDOWN);
      this.dawnSwordAbilityIndex.delete(player.name);
      
      player.sendMessage('§7The dawn blade dissolves into light.');
      try { player.runCommand('clear @s lotm:dawn_sword 0 1'); } catch (_) {}
    }
  }

  // Called from main.js itemUse when player right-clicks with dawn_sword
  static handleDawnSwordUse(player) {
    if (!this.dawnSwordTicks.has(player.name)) return false;

    if (player.isSneaking) {
      // Sneak + right-click = cycle between Hurricane and Air Slash
      const current = this.dawnSwordAbilityIndex.get(player.name) || 0;
      const next    = current === 0 ? 1 : 0;
      this.dawnSwordAbilityIndex.set(player.name, next);
      const names = ['§6☀ Hurricane of Light', '§6🌬 Air Slash'];
      player.sendMessage(`§6Dawn Sword: §e${names[next]}`);
      player.playSound('random.orb', { pitch: 1.3, volume: 0.5 });
      return true;
    }

    // Right-click = fire current selected sword ability
    const idx = this.dawnSwordAbilityIndex.get(player.name) || 0;
    if (idx === 0) return this.useHurricaneOfLight(player);
    return this.useAirSlash(player);
  }

  // =============================================
  // ABILITY: AIR SLASH
  // =============================================
  static useAirSlash(player) {
    const cd = this._cdRemaining(this.airSlashCooldowns, player);
    if (cd > 0) { player.sendMessage(`§cAir Slash on cooldown: §e${cd}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.AIR_SLASH_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.AIR_SLASH_SPIRIT_COST}`); return false;
    }
    this.airSlashCooldowns.set(player.name, this.AIR_SLASH_COOLDOWN);
    player.sendMessage('§6§o Air Slash!');
    player.playSound('item.trident.throw', { pitch: 1.5, volume: 0.8 });

    const eye  = player.getHeadLocation();
    const view = player.getViewDirection();
    const dim  = player.dimension;
    const start = { x: eye.x+view.x*1.5, y: eye.y, z: eye.z+view.z*1.5 };
    const SPEED = 0.6, STEPS = 28, DAMAGE = this.AIR_SLASH_DAMAGE;
    let pos = { ...start }, hit = false, age = 0;

    const step = () => {
      if (hit || age >= STEPS) return;
      age++;
      pos.x += view.x*SPEED; pos.y += view.y*SPEED; pos.z += view.z*SPEED;

      // Sweep attack particle — horizontal slash visual
      try { dim.spawnParticle('minecraft:endrod',              pos); } catch (_) {}
      try { dim.spawnParticle('minecraft:critical_hit_emitter', pos); } catch (_) {}


      try {
        const block = dim.getBlock({ x:Math.floor(pos.x), y:Math.floor(pos.y), z:Math.floor(pos.z) });
        if (block && !block.isAir && !block.isLiquid) {
          hit = true;
           for (let i = 0; i < 5; i++) {
            const a = (i/5)*Math.PI*2;
            try { dim.spawnParticle('minecraft:endrod', {
              x:pos.x+Math.cos(a)*0.4, y:pos.y, z:pos.z+Math.sin(a)*0.4
            }); } catch(_){}
            try { dim.spawnParticle('minecraft:critical_hit_emitter', {
              x:pos.x+Math.cos(a)*0.4, y:pos.y, z:pos.z+Math.sin(a)*0.4
            }); } catch(_){}
          }
          try { dim.spawnParticle('minecraft:large_explosion', pos); } catch (_) {}
          return;
        }
      } catch (_) {}

      try {
        const near = dim.getEntities({ location:pos, maxDistance:2.0,
          excludeTypes:['minecraft:item','minecraft:xp_orb','minecraft:arrow'] });
        for (const e of near) {
          if (e.id === player.id) continue;
          hit = true;
          try { e.applyDamage(DAMAGE, { cause:'projectile', damagingEntity:player }); } catch(_){
            try { e.applyDamage(DAMAGE); } catch(_2){}
          }
          // Big sweep burst on entity hit
          for (let i = 0; i < 8; i++) {
            const a = (i/8)*Math.PI*2;
            try { dim.spawnParticle('minecraft:endrod', {
              x:e.location.x+Math.cos(a)*0.6, y:e.location.y+1, z:e.location.z+Math.sin(a)*0.6
            }); } catch(_){}
            try { dim.spawnParticle('minecraft:critical_hit_emitter', {
              x:e.location.x+Math.cos(a)*0.6, y:e.location.y+1, z:e.location.z+Math.sin(a)*0.6
            }); } catch(_){}
          }
          try { dim.spawnParticle('minecraft:large_explosion', { x:pos.x, y:pos.y, z:pos.z }); } catch(_){}
          return;
        }
      } catch (_) {}

      system.runTimeout(step, 1);
    };
    system.runTimeout(step, 1);
    return true;
  }

  // =============================================
  // ABILITY: DAWN ARMOUR
  // =============================================
  static useDawnArmour(player) {
    if (!this.hasSequence(player)) { player.sendMessage('§cNo access!'); return false; }
    if (this.dawnArmourTicks.has(player.name)) { player.sendMessage('§cDawn Armour already active!'); return false; }
    const cd = this._cdRemaining(this.dawnArmourCooldowns, player);
    if (cd > 0) { player.sendMessage(`§cDawn Armour on cooldown: §e${cd}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.DAWN_ARMOUR_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §e${this.DAWN_ARMOUR_SPIRIT_COST}`); return false;
    }

    const inv = player.getComponent('minecraft:inventory');
    if (!inv?.container) return false;

    // Equip dawn armour — named enchanted diamond set
    const cmds = [
      `replaceitem entity @s slot.armor.head  0 minecraft:diamond_helmet{"display":{"Name":"§6Dawn Helm"},"ench":[{"id":"protection","lvl":4},{"id":"unbreaking","lvl":3}]}`,
      `replaceitem entity @s slot.armor.chest 0 minecraft:diamond_chestplate{"display":{"Name":"§6Dawn Plate"},"ench":[{"id":"protection","lvl":4},{"id":"unbreaking","lvl":3}]}`,
      `replaceitem entity @s slot.armor.legs  0 minecraft:diamond_leggings{"display":{"Name":"§6Dawn Greaves"},"ench":[{"id":"protection","lvl":4},{"id":"unbreaking","lvl":3}]}`,
      `replaceitem entity @s slot.armor.feet  0 minecraft:diamond_boots{"display":{"Name":"§6Dawn Boots"},"ench":[{"id":"protection","lvl":4},{"id":"feather_falling","lvl":4},{"id":"unbreaking","lvl":3}]}`,
    ];
    for (const cmd of cmds) { try { player.runCommand(cmd); } catch (_) {} }

    this.dawnArmourTicks.set(player.name, this.DAWN_ARMOUR_DURATION);
    player.sendMessage('§6§l🛡 DAWN ARMOUR 🛡');
    player.sendMessage('§7Armour of pure dawn light forms around you! (60s)');
    player.playSound('armor.equip_diamond', { pitch: 0.8, volume: 1.2 });
    const loc = player.location;
    for (let i = 0; i < 24; i++) {
      const a = (i/24)*Math.PI*2;
      try { player.dimension.spawnParticle('minecraft:totem_particle', {
        x:loc.x+Math.cos(a)*0.6, y:loc.y+1, z:loc.z+Math.sin(a)*0.6
      }); } catch (_) {}
    }
    return true;
  }

  static _processDawnArmour(player) {
    const ticks = this.dawnArmourTicks.get(player.name);
    if (!ticks) return;
    this.dawnArmourTicks.set(player.name, ticks - 1);
    if (ticks === 100) player.sendMessage('§6Dawn Armour fading in 5 seconds...');
    if (ticks <= 1) {
      this.dawnArmourTicks.delete(player.name);
      this.dawnArmourCooldowns.set(player.name, this.DAWN_ARMOUR_COOLDOWN);
      // Remove dawn armour pieces by name — clear only named items
      for (const cmd of [
        'clear @s minecraft:diamond_helmet    0 1',
        'clear @s minecraft:diamond_chestplate 0 1',
        'clear @s minecraft:diamond_leggings  0 1',
        'clear @s minecraft:diamond_boots     0 1',
      ]) { try { player.runCommand(cmd); } catch (_) {} }
      player.sendMessage('§7The dawn armour dissolves.');
    }
  }

  // =============================================
  // ABILITY HANDLER
  // =============================================
  static handleAbilityUse(player, abilityId) {
    switch (abilityId) {
      case this.ABILITIES.LIGHT_OF_DAWN:      return this.useLightOfDawn(player);
      case this.ABILITIES.HURRICANE_OF_LIGHT: return this.useHurricaneOfLight(player);
      case this.ABILITIES.DAWN_SWORD:         return this.useDawnSword(player);
      case this.ABILITIES.DAWN_ARMOUR:        return this.useDawnArmour(player);
      default: player.sendMessage('§cUnknown ability!'); return false;
    }
  }

  static getAllAbilities(player) {
    return [
      { id: this.ABILITIES.LIGHT_OF_DAWN, name: '§6✦ Light of Dawn',  cost: this.LIGHT_OF_DAWN_SPIRIT_COST },
      { id: this.ABILITIES.DAWN_SWORD,    name: '§6⚔ Dawn Sword',      cost: this.DAWN_SWORD_SPIRIT_COST },
      { id: this.ABILITIES.DAWN_ARMOUR,   name: '§6🛡 Dawn Armour',     cost: this.DAWN_ARMOUR_SPIRIT_COST },
    ];
  }

  static getAbilityDescription(abilityId) {
    const descs = {
      [this.ABILITIES.LIGHT_OF_DAWN]:
        `§eCost: ${this.LIGHT_OF_DAWN_SPIRIT_COST} Spirit | CD: 30s\n§7Consecrate holy ground, damage & weaken undead`,
      [this.ABILITIES.HURRICANE_OF_LIGHT]:
        `§eCost: ${this.HURRICANE_SPIRIT_COST} Spirit | CD: 2min\n§7Rain swords of dawn on all enemies (enhanced)`,
      [this.ABILITIES.DAWN_SWORD]:
        `§eCost: ${this.DAWN_SWORD_SPIRIT_COST} Spirit | CD: 30s\n§7Summon dawn blade (60s)\n§7Sneak+use: Air Slash | Use: Hurricane of Light`,
      [this.ABILITIES.DAWN_ARMOUR]:
        `§eCost: ${this.DAWN_ARMOUR_SPIRIT_COST} Spirit | CD: 60s\n§7Summon full dawn armour set (60s)`,
    };
    return descs[abilityId] || '§7Unknown ability';
  }

  static removeEffects(player) {
    this.activeLightZones.delete(player.name);
    this.lightCooldowns.delete(player.name);
    this.hurricaneCooldowns.delete(player.name);
    this.activeHurricanes.delete(player.name);
    this.dawnSwordTicks.delete(player.name);
    this.dawnSwordCooldowns.delete(player.name);
    this.airSlashCooldowns.delete(player.name);
    this.dawnArmourTicks.delete(player.name);
    this.dawnArmourCooldowns.delete(player.name);
    this.storedArmour.delete(player.name);
    this.selectedAbilities.delete(player.name);
    this.dawnSwordAbilityIndex.delete(player.name);

    try { player.runCommand('clear @s lotm:dawn_sword 0 1'); } catch (_) {}
  }
}
