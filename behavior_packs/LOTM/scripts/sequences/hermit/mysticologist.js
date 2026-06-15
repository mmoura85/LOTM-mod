// ============================================
// MYSTICOLOGIST - SEQUENCE 4 HERMIT PATHWAY
// ============================================
// Control scheme:
//   mystic_staff:    right=fire current attack | sneak+right=cycle attack
//   defense_tome:    right=fire current defense | sneak+right=cycle defense
//   buff_tome:       right=activate current buff | sneak+right=cycle buff
//   mystic_compass:  right=open selection menu | sneak+right=cast selected
// ============================================

import { world, system } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { ConstellationsMasterSequence } from './constellations_master.js';

export class MysticologistSequence {
  static SEQUENCE_NUMBER = 4;
  static PATHWAY = 'hermit';
  static EFFECT_DURATION = 999999;

  static ATTACK_SPELLS  = ['beam','spear','fire_bolt','earth_spike','fireball','star_pillar'];
  static DEFENSE_SPELLS = ['heal','stone_wall','force_field','undead_knockback','purify','raise_earth'];
  static BUFF_SPELLS    = ['water_breathing','slow_fall','arcane_armour'];
  static UTILITY_SPELLS = ['blink','bridge','tunnel','hand_of_force','ore_sense'];

  static SPELL_NAMES = {
    beam:'§9⚡ Arcane Beam', spear:'§b✦ Spear of Longinus',
    fire_bolt:'§c🔥 Fire Bolt', earth_spike:'§2⬆ Earth Spike',
    fireball:'§6🔥 Fireball', star_pillar:'§e✦ Star Pillar',
    heal:'§a♥ Heal', stone_wall:'§7■ Earth Wall',
    force_field:'§b◎ Force Field', undead_knockback:'§f☩ Exorcism',
    purify:'§e✦ Purification', raise_earth:'§6⬆ Raise Earth',
    water_breathing:'§3≈ Sea Wave', slow_fall:'§f↓ Slow Fall',
    arcane_armour:'§6🛡 Arcane Armour',
    blink:'§9✦ Night Blink', bridge:'§b✦ Star Bridge',
    tunnel:'§8⬛ Tunnel', hand_of_force:'§5✋ Hand of Force',
    ore_sense:'§e⛏ Ore Sense',
  };

  static COSTS = {
    beam:8, spear:20, fire_bolt:15, earth_spike:18, fireball:25, star_pillar:60,
    heal:40, stone_wall:35, force_field:50, undead_knockback:30, purify:25, raise_earth:35,
    water_breathing:20, slow_fall:15, arcane_armour:40,
    blink:20, bridge:30, tunnel:30, hand_of_force:20, ore_sense:15,
  };

  // CD values /4 since passives run every 4 ticks
  static CD = {
    beam:1, spear:8, fire_bolt:6, earth_spike:8, fireball:10, star_pillar:50,
    heal:25, stone_wall:20, force_field:30, undead_knockback:15, purify:20, raise_earth:20,
    water_breathing:50, slow_fall:50, arcane_armour:50,
    blink:15, bridge:50, tunnel:8, hand_of_force:10, ore_sense:15,
  };

  static ORE_LABELS = {
    'minecraft:coal_ore':               { label: '§8Coal',           precious: false },
    'minecraft:deepslate_coal_ore':     { label: '§8Coal §7(ds)',    precious: false },
    'minecraft:iron_ore':               { label: '§7Iron',           precious: false },
    'minecraft:deepslate_iron_ore':     { label: '§7Iron §7(ds)',    precious: false },
    'minecraft:copper_ore':             { label: '§6Copper',         precious: false },
    'minecraft:deepslate_copper_ore':   { label: '§6Copper §7(ds)', precious: false },
    'minecraft:gold_ore':               { label: '§eGold',           precious: true  },
    'minecraft:deepslate_gold_ore':     { label: '§eGold §7(ds)',    precious: true  },
    'minecraft:redstone_ore':           { label: '§cRedstone',       precious: false },
    'minecraft:deepslate_redstone_ore': { label: '§cRedstone §7(ds)',precious: false },
    'minecraft:lapis_ore':              { label: '§9Lapis',          precious: true  },
    'minecraft:deepslate_lapis_ore':    { label: '§9Lapis §7(ds)',   precious: true  },
    'minecraft:diamond_ore':            { label: '§bDiamond',        precious: true  },
    'minecraft:deepslate_diamond_ore':  { label: '§bDiamond §7(ds)', precious: true  },
    'minecraft:emerald_ore':            { label: '§aEmerald',        precious: true  },
    'minecraft:deepslate_emerald_ore':  { label: '§aEmerald §7(ds)', precious: true  },
    'minecraft:ancient_debris':         { label: '§4Ancient Debris', precious: true  },
  };
 
  static ORE_DISPLAY_ORDER = [
    '§4Ancient Debris',
    '§bDiamond','§bDiamond §7(ds)',
    '§aEmerald','§aEmerald §7(ds)',
    '§9Lapis','§9Lapis §7(ds)',
    '§eGold','§eGold §7(ds)',
    '§cRedstone','§cRedstone §7(ds)',
    '§6Copper','§6Copper §7(ds)',
    '§7Iron','§7Iron §7(ds)',
    '§8Coal','§8Coal §7(ds)',
  ];

  static attackIndex  = new Map();
  static defenseIndex = new Map();
  static buffIndex    = new Map();
  static utilityIndex = new Map();
  static cooldowns    = new Map();
  static handOfForceActive = new Map();
  static forceFields       = new Map();
  static armourBuffs       = new Map();
  static raisedEarths      = new Map();
  static activeBridges     = new Map();

  // =============================================
  // PASSIVE ABILITIES
  // =============================================
  static applyPassiveAbilities(player) {
    ConstellationsMasterSequence.applyPassiveAbilities(player);
    const hb = player.getEffect('health_boost');
    if (!hb || hb.amplifier < 3 || hb.duration < 200)
      player.addEffect('health_boost', this.EFFECT_DURATION, { amplifier: 3, showParticles: false });
    this._tickCooldowns(player);
    this._tickForceField(player);
    this._tickArmourBuff(player);
    this._tickBridge(player);
    this._processHandOfForce(player);
  }

  static onAwaken(player) {
    const cur = SpiritSystem.getMaxSpirit(player);
    SpiritSystem.setMaxSpirit(player, cur + 600);
    player.sendMessage('§9§l✦ MYSTICOLOGIST ✦');
    player.sendMessage(`§9Max Spirit: §f${cur} §7→ §f${cur+600}`);
    player.sendMessage(`§7Items: §9Mystic Staff§7, §bDefense Tome§7, §aBuffTome§7, §6Mystic Compass`);
    player.playSound('beacon.activate', { pitch: 0.7, volume: 1.0 });
    const loc = player.location;
    for (let i = 0; i < 30; i++) {
      const a = (i/30)*Math.PI*2;
      try { player.dimension.spawnParticle('minecraft:endrod',
        {x:loc.x+Math.cos(a)*1.5,y:loc.y+1,z:loc.z+Math.sin(a)*1.5}); } catch(_) {}
    }
  }

  // =============================================
  // ITEM HANDLERS
  // =============================================
  static handleStaffUse(player) {
    if (!this._hasAccess(player)) return false;
    return player.isSneaking ? this._cycle('attack',player) : this._cast('attack',player);
  }
  static handleDefenseTomeUse(player) {
    if (!this._hasAccess(player)) return false;
    return player.isSneaking ? this._cycle('defense',player) : this._cast('defense',player);
  }
  static handleBuffTomeUse(player) {
    if (!this._hasAccess(player)) return false;
    return player.isSneaking ? this._cycle('buff',player) : this._cast('buff',player);
  }

  static handleCompassUse(player) {
    if (!this._hasAccess(player)) return false;
    if (player.isSneaking) {
      // Sneak+right = open menu to change selection
      this.openUtilityMenu(player);
      return true;
    } else {
      // Right-click = cast selected utility
      const idx   = this.utilityIndex.get(player.name) || 0;
      const spell = this.UTILITY_SPELLS[idx];
      const cost  = this.COSTS[spell];
      const cd    = this._cdRemaining(player, spell);
      if (cd > 0) { player.sendMessage(`§c${this.SPELL_NAMES[spell]} on cooldown: §e${cd}s`); return false; }
      if (!SpiritSystem.consumeSpirit(player, cost)) {
        player.sendMessage(`§cNot enough spirit! Need §e${cost}`); return false;
      }
      this._setCooldown(player, spell, this.CD[spell]);
      return this._castUtility(spell, player);
    }
  }

  static async openUtilityMenu(player) {
    if (!this._hasAccess(player)) return;
    const spirit = Math.floor(SpiritSystem.getSpirit(player));
    const max    = SpiritSystem.getMaxSpirit(player);
    const cur    = this.utilityIndex.get(player.name)||0;
    const form = new ActionFormData()
      .title('§6✦ Mystic Compass')
      .body(`§7Spirit: §b${spirit}§7/§b${max}\n§8Sneak+right to cast selected.`);
    for (let i = 0; i < this.UTILITY_SPELLS.length; i++) {
      const spell = this.UTILITY_SPELLS[i];
      const cd    = this._cdRemaining(player, spell);
      form.button(`${i===cur?'§a✓ ':'§7'}${this.SPELL_NAMES[spell]}\n§b${this.COSTS[spell]} spirit${cd>0?` §c(${cd}s)`:''}`)
    }
    form.button('§7Cancel');
    const response = await form.show(player);
    if (response.canceled || response.selection >= this.UTILITY_SPELLS.length) return;
    this.utilityIndex.set(player.name, response.selection);
    player.sendMessage(`§6Selected: §e${this.SPELL_NAMES[this.UTILITY_SPELLS[response.selection]]}`);
    player.playSound('random.orb', { pitch: 1.3, volume: 0.5 });
  }

  static _cycle(type, player) {
    const [map, spells] = this._typeData(type);
    const next = ((map.get(player.name)||0)+1) % spells.length;
    map.set(player.name, next);
    const spell = spells[next], cd = this._cdRemaining(player, spell);
    player.sendMessage(`§7${type==='attack'?'⚔':type==='defense'?'🛡':'✦'} ${this.SPELL_NAMES[spell]}\n§8${this.COSTS[spell]} spirit${cd>0?` §c| ${cd}s CD`:' §a| Ready'}`);
    player.playSound('random.orb', { pitch: 1.4, volume: 0.5 });
    return true;
  }

  static _cast(type, player) {
    const [map, spells] = this._typeData(type);
    const spell = spells[map.get(player.name)||0];
    const cd = this._cdRemaining(player, spell);
    if (cd > 0) { player.sendMessage(`§c${this.SPELL_NAMES[spell]} CD: §e${cd}s`); return false; }
    if (!SpiritSystem.consumeSpirit(player, this.COSTS[spell])) {
      player.sendMessage(`§cNeed §e${this.COSTS[spell]} §cspirit`); return false;
    }
    this._setCooldown(player, spell, this.CD[spell]);
    if (type==='attack')  return this._castAttack(spell, player);
    if (type==='defense') return this._castDefense(spell, player);
    return this._castBuff(spell, player);
  }

  static _typeData(type) {
    if (type==='attack')  return [this.attackIndex,  this.ATTACK_SPELLS];
    if (type==='defense') return [this.defenseIndex, this.DEFENSE_SPELLS];
    return [this.buffIndex, this.BUFF_SPELLS];
  }

  // =============================================
  // ATTACK SPELLS
  // =============================================
  static _castAttack(spell, player) {
    switch(spell) {
      case 'beam':        return this._castBeam(player);
      case 'spear':       return this._castSpear(player);
      case 'fire_bolt':   return this._castFireBolt(player);
      case 'earth_spike': return this._castEarthSpike(player);
      case 'fireball':    return this._castFireball(player);
      case 'star_pillar': return this._castStarPillar(player);
    }
    return false;
  }

  static _castBeam(player) {
    const eye=player.getHeadLocation(), view=player.getViewDirection(), dim=player.dimension;
    player.playSound('conduit.activate',{pitch:1.2,volume:0.8});
    let step=0;
    const tick=()=>{
      if(step++>=20) return;
      const pos={x:eye.x+view.x*step*0.6,y:eye.y+view.y*step*0.6,z:eye.z+view.z*step*0.6};
      try{dim.spawnParticle('lotm:arcane_beam',pos);}catch(_){}
      try{dim.spawnParticle('minecraft:endrod',pos);}catch(_){}
      try{
        const block=dim.getBlock({x:Math.floor(pos.x),y:Math.floor(pos.y),z:Math.floor(pos.z)});
        if(block&&!block.isAir&&!block.isLiquid){try{dim.spawnParticle('minecraft:electric_spark_particle',pos);}catch(_){}return;}
      }catch(_){}
      try{
        const near=dim.getEntities({location:pos,maxDistance:1.2,excludeTypes:['minecraft:item','minecraft:xp_orb','minecraft:player','lotm:wisp']});
        for(const e of near){
          if(e.id===player.id) continue;
          try{e.applyDamage(3,{cause:'magic',damagingEntity:player});}catch(_){try{e.applyDamage(3);}catch(_){}}
          try{dim.spawnParticle('minecraft:electric_spark_particle',e.location);}catch(_){}
          player.playSound('conduit.attack.damage',{pitch:1.5,volume:0.6});
          return;
        }
      }catch(_){}
      system.runTimeout(tick,1);
    };
    system.runTimeout(tick,1);
    return true;
  }

  static _castSpear(player) {
    const eye=player.getHeadLocation(), dir=player.getViewDirection(), dim=player.dimension;
    const hitIds=new Set();
    player.playSound('item.trident.throw',{pitch:0.7,volume:1.5});
    player.sendMessage('§b✦ §fSpear of Longinus!');
    const sx=eye.x+dir.x*1.5, sy=eye.y+dir.y*1.5, sz=eye.z+dir.z*1.5;
    let spear=null, stopped=false;
    try{spear=dim.spawnEntity('lotm:spear_projectile',{x:sx,y:sy,z:sz});}catch(_){}
    for(let t=0;t<25;t++){
      system.runTimeout(()=>{
        if(stopped) return;
        const px=sx+dir.x*t*2, py=sy+dir.y*t*2, pz=sz+dir.z*t*2;
        const loc={x:px,y:py,z:pz};
        if(spear){try{spear.teleport(loc,{dimension:dim});}catch(_){spear=null;}}
        try{
          const block=dim.getBlock({x:Math.floor(px),y:Math.floor(py),z:Math.floor(pz)});
          if(block&&!block.isAir&&!block.isLiquid){
            stopped=true;
            if(spear){try{spear.kill();}catch(_){}spear=null;}
            this._impactBurst(dim,loc); return;
          }
        }catch(_){}
        for(let s=0;s<2;s++){
          const sl={x:px-dir.x*s,y:py-dir.y*s,z:pz-dir.z*s};
          try{dim.spawnParticle('minecraft:endrod',sl);}catch(_){}
          try{dim.spawnParticle('minecraft:totem_particle',sl);}catch(_){}
          try{dim.spawnParticle('minecraft:critical_hit_emitter',sl);}catch(_){}
        }
        try{
          const near=dim.getEntities({location:loc,maxDistance:1.5,excludeTypes:['minecraft:item','minecraft:xp_orb','lotm:wisp']});
          for(const e of near){
            if(e.id===player.id||hitIds.has(e.id)) continue;
            hitIds.add(e.id);
            try{e.applyDamage(34,{cause:'magic',damagingEntity:player});}catch(_){try{e.applyDamage(28);}catch(_){}}
            try{e.addEffect('wither',60,{amplifier:1,showParticles:true});}catch(_){}
            try{e.applyKnockback(dir.x*1.5,dir.z*1.5,1.5,0.2);}catch(_){}
            this._impactBurst(dim,e.location);
          }
        }catch(_){}
        if(t===24){if(spear){try{spear.kill();}catch(_){}}this._impactBurst(dim,loc);}
      },t);
    }
    return true;
  }

  static _impactBurst(dim, loc) {
    for(let i=0;i<16;i++){
      const a=(i/16)*Math.PI*2, r=Math.random()*0.8;
      const p={x:loc.x+Math.cos(a)*r,y:loc.y+Math.sin(a)*r*0.5,z:loc.z+Math.sin(a)*r};
      try{dim.spawnParticle('minecraft:endrod',p);}catch(_){}
      try{dim.spawnParticle('minecraft:totem_particle',p);}catch(_){}
      try{dim.spawnParticle('minecraft:critical_hit_emitter',p);}catch(_){}
    }
  }

  static _castFireBolt(player) {
    const view=player.getViewDirection(), eye=player.getHeadLocation();
    const start={x:eye.x+view.x*1.5,y:eye.y,z:eye.z+view.z*1.5};
    let hit=false;
    player.playSound('fire.fire',{pitch:1.2,volume:1.0});
    player.sendMessage('§c§o Fire Bolt!');
    for(let i=0;i<24;i++){
      system.runTimeout(()=>{
        if(hit) return;
        const loc={x:start.x+view.x*i*0.5,y:start.y+view.y*i*0.5,z:start.z+view.z*i*0.5};
        try{
          const block=player.dimension.getBlock({x:Math.floor(loc.x),y:Math.floor(loc.y),z:Math.floor(loc.z)});
          if(block&&!block.isAir&&!block.isLiquid){
            hit=true;
            for(let j=0;j<10;j++){const a=(j/10)*Math.PI*2;try{player.dimension.spawnParticle('minecraft:basic_flame_particle',{x:loc.x+Math.cos(a)*0.4,y:loc.y,z:loc.z+Math.sin(a)*0.4});}catch(_){}}
            try{player.dimension.spawnParticle('minecraft:large_explosion',loc);}catch(_){}
            return;
          }
        }catch(_){}
        try{player.dimension.spawnParticle('minecraft:basic_flame_particle',loc);}catch(_){}
        try{player.dimension.spawnParticle('minecraft:mobflame_single',loc);}catch(_){}
        try{
          const near=player.dimension.getEntities({location:loc,maxDistance:1.5,excludeTypes:['minecraft:item','lotm:wisp']});
          for(const e of near){
            if(e.id===player.id) continue;
            hit=true;
            try{e.applyDamage(14,{cause:'magic',damagingEntity:player});}catch(_){try{e.applyDamage(14);}catch(_){}}
            try{e.setOnFire(5,true);}catch(_){}
            for(let j=0;j<10;j++){const a=(j/10)*Math.PI*2;try{player.dimension.spawnParticle('minecraft:basic_flame_particle',{x:e.location.x+Math.cos(a)*0.4,y:e.location.y+0.5,z:e.location.z+Math.sin(a)*0.4});}catch(_){}}
            break;
          }
        }catch(_){}
      },i);
    }
    return true;
  }

  static _castEarthSpike(player) {
    const origin=player.getHeadLocation(), view=player.getViewDirection(), dim=player.dimension;
    const SPIKES=3,SPACING=0.9,STEPS=28,STEP_SZ=0.75,DAMAGE=22;
    player.sendMessage('§2§l⬆ EARTH SPIKE!');
    player.playSound('dig.stone',{pitch:0.5,volume:1.2});
    const rx=view.z,rz=-view.x,rLen=Math.sqrt(rx*rx+rz*rz)||1;
    const normRx=rx/rLen,normRz=rz/rLen;
    for(let s=0;s<SPIKES;s++){
      const off=(s-1)*SPACING, sx=origin.x+normRx*off, sy=origin.y, sz=origin.z+normRz*off;
      system.runTimeout(()=>this._runSpike(player,dim,sx,sy,sz,view,STEPS,STEP_SZ,DAMAGE),s*2);
    }
    return true;
  }

  static _runSpike(player,dim,sx,sy,sz,view,steps,stepSz,damage){
    let prevBx=null,prevBy=null,prevBz=null;
    const hs={hit:false};
    const step=(i)=>{
      system.runTimeout(()=>{
        if(hs.hit) return;
        const dist=i*stepSz,tx=sx+view.x*dist,ty=sy+view.y*dist,tz=sz+view.z*dist;
        const bx=Math.floor(tx),by=Math.floor(ty),bz=Math.floor(tz);
        if(prevBx!==null&&(prevBx!==bx||prevBy!==by||prevBz!==bz)){try{dim.runCommand(`setblock ${prevBx} ${prevBy} ${prevBz} air`);}catch(_){}}
        try{
          const nearby=dim.getEntities({location:{x:tx,y:ty,z:tz},maxDistance:2.0});
          for(const e of nearby){
            if((e.typeId==='minecraft:player'&&e.id===player.id)||e.typeId==='minecraft:item'||e.typeId==='minecraft:xp_orb'||e.typeId==='lotm:wisp') continue;
            hs.hit=true;
            try{e.applyDamage(damage,{cause:'projectile',damagingEntity:player});}catch(_){try{e.applyDamage(damage);}catch(_){}}
            if(prevBx!==null){try{dim.runCommand(`setblock ${prevBx} ${prevBy} ${prevBz} air`);}catch(_){}}
            for(let p=0;p<10;p++){const a=(p/10)*Math.PI*2;try{dim.spawnParticle('minecraft:endrod',{x:e.location.x+Math.cos(a)*0.6,y:e.location.y+1,z:e.location.z+Math.sin(a)*0.6});}catch(_){}}
            try{dim.spawnParticle('minecraft:large_explosion',{x:tx,y:ty,z:tz});}catch(_){}
            return;
          }
        }catch(_){}
        try{
          const block=dim.getBlock({x:bx,y:by,z:bz});
          if(block&&!block.isAir&&!block.isLiquid&&block.typeId!=='minecraft:cobblestone'){
            hs.hit=true;
            if(prevBx!==null){try{dim.runCommand(`setblock ${prevBx} ${prevBy} ${prevBz} air`);}catch(_){}}
            return;
          }
        }catch(_){}
        if(prevBx===null||(bx!==prevBx||by!==prevBy||bz!==prevBz)){try{dim.runCommand(`setblock ${bx} ${by} ${bz} cobblestone`);}catch(_){}}
        try{dim.spawnParticle('minecraft:endrod',{x:tx,y:ty,z:tz});}catch(_){}
        prevBx=bx;prevBy=by;prevBz=bz;
        if(i+1<steps) step(i+1);
        else if(prevBx!==null){try{dim.runCommand(`setblock ${prevBx} ${prevBy} ${prevBz} air`);}catch(_){}}
      },1);
    };
    step(0);
  }

  static _castFireball(player) {
    const view=player.getViewDirection(),eye=player.getHeadLocation();
    const SPEED=0.7,STEPS=50,DAMAGE=42;
    const start={x:eye.x+view.x*2,y:eye.y,z:eye.z+view.z*2};
    player.sendMessage('§c§l🔥 FIREBALL!');
    player.playSound('mob.ghast.fireball',{pitch:1.0,volume:1.0});
    let pos={...start},step=0;
    const tick=()=>{
      if(step++>=STEPS) return;
      pos.x+=view.x*SPEED;pos.y+=view.y*SPEED;pos.z+=view.z*SPEED;
      try{player.dimension.spawnParticle('minecraft:basic_flame_particle',{...pos});}catch(_){}
      try{player.dimension.spawnParticle('minecraft:mobflame_single',{...pos});}catch(_){}
      for(let f=0;f<3;f++){
        const a=(f/3)*Math.PI*2;
        try{player.dimension.spawnParticle('minecraft:basic_flame_particle',
          {x:pos.x+Math.cos(a)*0.3,y:pos.y,z:pos.z+Math.sin(a)*0.3});}catch(_){}
      }
      // Keep the explosion particle for the boom feel
      try{player.dimension.spawnParticle('minecraft:large_explosion',{...pos});}catch(_){}
      let hit=false;
      try{const block=player.dimension.getBlock({x:Math.floor(pos.x),y:Math.floor(pos.y),z:Math.floor(pos.z)});if(block&&!block.isAir&&!block.isLiquid) hit=true;}catch(_){}
      try{
        const near=player.dimension.getEntities({location:{...pos},maxDistance:2.0,excludeTypes:['minecraft:item','minecraft:xp_orb','minecraft:player','lotm:wisp']});
        for(const e of near){if(e.id!==player.id){hit=true;break;}}
      }catch(_){}
      if(hit){
        try{player.dimension.spawnParticle('minecraft:huge_explosion_emitter',{...pos});}catch(_){}
        player.playSound('random.explode',{pitch:0.9,volume:1.5});
        try{
          const splash=player.dimension.getEntities({location:{...pos},maxDistance:5,excludeTypes:['minecraft:item','minecraft:xp_orb','minecraft:player','lotm:wisp']});
          for(const e of splash){
            if(e.id===player.id) continue;
            try{e.applyDamage(DAMAGE,{cause:'magic',damagingEntity:player});}catch(_){try{e.applyDamage(DAMAGE);}catch(_){}}
            try{e.setOnFire(5,true);}catch(_){}
          }
        }catch(_){}
        return;
      }
      system.runTimeout(tick,1);
    };
    system.runTimeout(tick,1);
    return true;
  }

  static _castStarPillar(player) {
    const hit=this._raycastBlock(player,40);
    const tl=hit?hit:{...player.location};
    const dim=player.dimension;
    player.sendMessage('§e§l✦ STAR PILLAR ✦');
    player.playSound('item.trident.thunder',{pitch:0.6,volume:1.5});
    for(let x=-8;x<=8;x+=3) for(let z=-8;z<=8;z+=3) try{dim.spawnParticle('lotm:star-fall',{x:tl.x+x,y:tl.y+8,z:tl.z+z});}catch(_){}
    for(let i=0;i<30;i++){const a=(i/30)*Math.PI*2;try{dim.spawnParticle('minecraft:totem_particle',{x:tl.x+Math.cos(a)*8,y:tl.y+12,z:tl.z+Math.sin(a)*8});}catch(_){}}
    for(let wave=0;wave<3;wave++){
      system.runTimeout(()=>{
        try{
          const entities=dim.getEntities({location:tl,maxDistance:10,excludeTypes:['minecraft:item','minecraft:xp_orb','minecraft:player','lotm:wisp']});
          for(const e of entities){
            try{e.applyDamage(22,{cause:'magic',damagingEntity:player});}catch(_){try{e.applyDamage(42);}catch(_){}}
            try{e.addEffect('slowness',60,{amplifier:1,showParticles:false});}catch(_){}
            try{dim.spawnParticle('lotm:star-fall',{x:e.location.x,y:e.location.y+4,z:e.location.z});}catch(_){}
          }
        }catch(_){}
        player.playSound('item.trident.hit',{pitch:0.8+wave*0.2,volume:1.0});
      },wave*40);
    }
    return true;
  }

  // =============================================
  // DEFENSE SPELLS
  // =============================================
  static _castDefense(spell, player) {
    switch(spell){
      case 'heal':             return this._castHeal(player);
      case 'stone_wall':       return this._castEarthWall(player);
      case 'force_field':      return this._castForceField(player);
      case 'undead_knockback': return this._castExorcism(player);
      case 'purify':           return this._castPurification(player);
      case 'raise_earth':      return this._castRaiseEarth(player);
    }
    return false;
  }

  static _castHeal(player) {
    player.sendMessage('§a§l♥ HEAL!');
    player.playSound('random.orb', { pitch: 0.8, volume: 1.0 });

    // Always heal the caster first
    try {
      const h = player.getComponent('minecraft:health');
      if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + 10));
    } catch(_) {}
    try { player.addEffect('regeneration', 100, { amplifier: 1, showParticles: true }); } catch(_) {}
    SpiritSystem.restoreSpirit(player, 15);

    // Also heal any nearby allies (other players) within 8 blocks
    try {
      const nearby = player.dimension.getPlayers({ location: player.location, maxDistance: 8 });
      for (const p of nearby) {
        if (p.id === player.id) continue;
        try { const h = p.getComponent('minecraft:health'); if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + 6)); } catch(_) {}
        try { p.addEffect('regeneration', 60, { amplifier: 0, showParticles: true }); } catch(_) {}
        try { p.sendMessage('§a♥ Healed by Mysticologist!'); } catch(_) {}
      }
    } catch(_) {}

    // Particle burst on caster
    const loc = player.location;
    for (let i = 0; i < 16; i++) {
      const a = (i/16)*Math.PI*2;
      try { player.dimension.spawnParticle('minecraft:totem_particle',
        { x: loc.x+Math.cos(a)*0.8, y: loc.y+1, z: loc.z+Math.sin(a)*0.8 }); } catch(_) {}
    }
    return true;
  }

  static _castEarthWall(player) {
    const view=player.getViewDirection(),facingNS=Math.abs(view.z)>Math.abs(view.x);
    const cx=Math.floor(player.location.x+view.x*3),cy=Math.floor(player.location.y),cz=Math.floor(player.location.z+view.z*3);
    player.sendMessage('§7§l■ EARTH WALL!');
    player.playSound('dig.stone',{pitch:0.7,volume:1.0});
    for(let wide=-1;wide<=1;wide++) for(let tall=0;tall<=2;tall++){
      const bx=facingNS?cx+wide:cx,by=cy+tall,bz=facingNS?cz:cz+wide;
      try{const block=player.dimension.getBlock({x:bx,y:by,z:bz});if(block&&!block.isAir){try{player.dimension.runCommand(`setblock ${bx} ${by} ${bz} air destroy`);}catch(_){}}player.dimension.runCommand(`setblock ${bx} ${by} ${bz} cobblestone`);}catch(_){}
    }
    system.runTimeout(()=>{
      for(let wide=-1;wide<=1;wide++) for(let tall=0;tall<=2;tall++){
        const bx=facingNS?cx+wide:cx,bz2=facingNS?cz:cz+wide;
        try{player.dimension.runCommand(`setblock ${bx} ${cy+tall} ${bz2} air replace`);}catch(_){}
      }
    },300);
    return true;
  }

  static _castForceField(player) {
    const loc=player.location,cx=Math.floor(loc.x),cy=Math.floor(loc.y),cz=Math.floor(loc.z);
    const dim=player.dimension,placed=[];
    player.sendMessage('§b§l◎ FORCE FIELD!');
    player.playSound('conduit.activate',{pitch:0.9,volume:1.0});
    for(let x=-2;x<=2;x++) for(let y=-1;y<=2;y++) for(let z=-2;z<=2;z++){
      if(Math.abs(x)!==2&&Math.abs(z)!==2) continue;
      const bx=cx+x,by=cy+y,bz=cz+z;
      try{const block=dim.getBlock({x:bx,y:by,z:bz});if(block&&block.isAir){dim.runCommand(`setblock ${bx} ${by} ${bz} minecraft:glass`);placed.push({x:bx,y:by,z:bz});}}catch(_){}
    }
    this.forceFields.set(player.name,{blocks:placed,ticksLeft:100});
    return true;
  }

  static _tickForceField(player) {
    const ff=this.forceFields.get(player.name);
    if(!ff) return;
    ff.ticksLeft--;
    if(ff.ticksLeft<=0){
      for(const b of ff.blocks){try{const block=player.dimension.getBlock(b);if(block&&block.typeId==='minecraft:glass')player.dimension.runCommand(`setblock ${b.x} ${b.y} ${b.z} air`);}catch(_){}}
      this.forceFields.delete(player.name);
      player.sendMessage('§7Force field dissipates...');
    }
  }

  static _castExorcism(player) {
    const uKeywords=['zombie','skeleton','phantom','wither','drowned','husk','stray','vex','lotm:ghoul','lotm:vengeful_ghost','lotm:shade'];
    player.sendMessage('§f§l☩ EXORCISM!');
    player.playSound('random.levelup',{pitch:0.7,volume:1.0});
    let count=0;
    try{
      const entities=player.dimension.getEntities({location:player.location,maxDistance:20,excludeTypes:['minecraft:item','minecraft:player']});
      for(const e of entities){
        if(!uKeywords.some(t=>e.typeId.includes(t))) continue;
        count++;
        try{e.addEffect('weakness',200,{amplifier:4,showParticles:true});}catch(_){}
        try{e.applyDamage(10);}catch(_){}
        const dx=e.location.x-player.location.x,dz=e.location.z-player.location.z,len=Math.sqrt(dx*dx+dz*dz)||1;
        try{e.applyKnockback(dx/len,dz/len,3.0,0.8);}catch(_){}
        for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2;try{player.dimension.spawnParticle('minecraft:totem_particle',{x:e.location.x+Math.cos(a)*0.5,y:e.location.y+1,z:e.location.z+Math.sin(a)*0.5});}catch(_){}}
      }
    }catch(_){}
    player.sendMessage(count>0?`§f${count} undead repelled!`:'§7No undead in range.');
    return true;
  }

  static _castPurification(player) {
    const debuffs=['wither','poison','weakness','slowness','mining_fatigue','nausea','blindness','hunger','levitation','fatal_poison'];
    player.sendMessage('§e§l✦ PURIFICATION!');
    player.playSound('note.harp',{pitch:1.5,volume:1.0});
    try{
      const players=player.dimension.getPlayers({location:player.location,maxDistance:10});
      for(const t of players){
        for(const d of debuffs){try{t.removeEffect(d);}catch(_){}}
        try{const h=t.getComponent('minecraft:health');if(h)h.setCurrentValue(Math.min(h.effectiveMax,h.currentValue+4));}catch(_){}
        try{t.addEffect('regeneration',100,{amplifier:1,showParticles:true});}catch(_){}
        for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2;try{t.dimension.spawnParticle('minecraft:heart_particle',{x:t.location.x+Math.cos(a)*0.6,y:t.location.y+1.5,z:t.location.z+Math.sin(a)*0.6});}catch(_){}}
      }
    }catch(_){}
    for(let i=0;i<20;i++){const a=(i/20)*Math.PI*2;try{player.dimension.spawnParticle('minecraft:totem_particle',{x:player.location.x+Math.cos(a)*5,y:player.location.y+0.5,z:player.location.z+Math.sin(a)*5});}catch(_){}}
    return true;
  }

  static _castRaiseEarth(player) {
    if(this.raisedEarths.has(player.name)) this._removeRaisedEarth(player);
    const loc=player.location,cx=Math.floor(loc.x),cz=Math.floor(loc.z),py=Math.floor(loc.y);
    let groundY=py-1;
    for(let dy=0;dy>=-16;dy--){
      try{const block=player.dimension.getBlock({x:cx,y:py+dy,z:cz});if(block&&!block.isAir&&!block.isLiquid){groundY=py+dy;break;}}catch(_){}
    }
    const platformBase=groundY+1,placed=[];
    for(let layer=0;layer<3;layer++){
      const by=platformBase+layer;
      for(let x=-1;x<=1;x++) for(let z=-1;z<=1;z++){
        const bx=cx+x,bz2=cz+z,cbx=bx,cby=by,cbz=bz2,clayer=layer;
        try{player.dimension.runCommand(`setblock ${cbx} ${cby} ${cbz} stone keep`);placed.push({x:cbx,y:cby,z:cbz});
          system.runTimeout(()=>{for(let p=0;p<3;p++){try{player.dimension.spawnParticle('minecraft:terrain',{x:cbx+0.3+Math.random()*0.4,y:cby+1,z:cbz+0.3+Math.random()*0.4});}catch(_){};}},clayer*4);
        }catch(_){}
      }
    }
    this.raisedEarths.set(player.name,placed);
    system.runTimeout(()=>{try{player.teleport({x:loc.x,y:platformBase+3,z:loc.z},{dimension:player.dimension,rotation:player.getRotation()});}catch(_){}},5);
    player.sendMessage('§6§l🪨 RAISE EARTH!');
    player.playSound('dig.stone',{pitch:0.6,volume:1.5});
    return true;
  }

  static _removeRaisedEarth(player) {
    const blocks=this.raisedEarths.get(player.name);
    if(!blocks) return;
    for(const b of blocks){try{const block=player.dimension.getBlock(b);if(block&&block.typeId==='minecraft:stone')player.dimension.runCommand(`setblock ${b.x} ${b.y} ${b.z} air`);}catch(_){}}
    this.raisedEarths.delete(player.name);
  }

  // =============================================
  // BUFF SPELLS
  // =============================================
  static _castBuff(spell, player) {
    switch(spell){
      case 'water_breathing': return this._castSeaWave(player);
      case 'slow_fall':       return this._castSlowFall(player);
      case 'arcane_armour':   return this._castArcaneArmour(player);
    }
    return false;
  }

  static _castSeaWave(player) {
    player.addEffect('water_breathing',1200,{amplifier:0,showParticles:false});
    player.addEffect('dolphins_grace',1200,{amplifier:0,showParticles:false});
    player.addEffect('speed',1200,{amplifier:3,showParticles:false});
    player.sendMessage('§b§l🌊 SEA WAVE!');
    player.playSound('ambient.underwater.loop',{pitch:1.5,volume:0.8});
    for(let r=1;r<=6;r++){system.runTimeout(()=>{for(let i=0;i<12;i++){const a=(i/12)*Math.PI*2;try{player.dimension.spawnParticle('minecraft:water_evaporation_actor_emitter',{x:player.location.x+Math.cos(a)*r,y:player.location.y+0.2,z:player.location.z+Math.sin(a)*r});}catch(_){};}},r*3);}
    return true;
  }

   static _castSlowFall(player) {
    player.sendMessage('§f§l↓ SLOW FALL!');
    player.playSound('mob.bat.hurt', { pitch: 0.5, volume: 0.8 });

    // Always apply to caster
    try { player.addEffect('slow_falling', 600, { amplifier: 0, showParticles: true }); } catch(_) {}

    // Also apply to nearby allies
    try {
      const nearby = player.dimension.getPlayers({ location: player.location, maxDistance: 8 });
      for (const p of nearby) {
        if (p.id === player.id) continue;
        try { p.addEffect('slow_falling', 600, { amplifier: 0, showParticles: true }); } catch(_) {}
      }
    } catch(_) {}

    const loc = player.location;
    for (let i = 0; i < 16; i++) {
      const a = (i/16)*Math.PI*2;
      try { player.dimension.spawnParticle('minecraft:endrod',
        { x: loc.x+Math.cos(a)*0.8, y: loc.y+1.0+i*0.04, z: loc.z+Math.sin(a)*0.8 }); } catch(_) {}
    }
    return true;
  }

  static _castArcaneArmour(player) {
    player.sendMessage('§6§l🛡 ARCANE ARMOUR!');
    player.playSound('armor.equip_diamond',{pitch:0.8,volume:1.2});
    player.addEffect('resistance',600,{amplifier:3,showParticles:false});
    player.addEffect('fire_resistance',600,{amplifier:0,showParticles:false});
    player.addEffect('absorption',600,{amplifier:3,showParticles:false});
    this.armourBuffs.set(player.name,150);
    for(let i=0;i<16;i++){const a=(i/16)*Math.PI*2;try{player.dimension.spawnParticle('minecraft:totem_particle',{x:player.location.x+Math.cos(a)*0.6,y:player.location.y+1,z:player.location.z+Math.sin(a)*0.6});}catch(_){}}
    return true;
  }

  static _tickArmourBuff(player) {
    const t=this.armourBuffs.get(player.name);
    if(!t) return;
    if(t<=1){this.armourBuffs.delete(player.name);player.sendMessage('§6§oArmour fades...');}
    else this.armourBuffs.set(player.name,t-1);
  }

  // =============================================
  // UTILITY SPELLS
  // =============================================
  static _castUtility(spell, player) {
    switch(spell){
      case 'blink':         return this._castBlink(player);
      case 'bridge':        return this._castBridge(player);
      case 'tunnel':        return this._castTunnel(player);
      case 'hand_of_force': return this._castHandOfForce(player);
      case 'ore_sense':     return this._castOreSense(player);
    }
    return false;
  }

  static _castBlink(player) {
    const dir=player.getViewDirection(),origin=player.location;
    const hLen=Math.sqrt(dir.x*dir.x+dir.z*dir.z);
    const nx=hLen>0?dir.x/hLen:0,nz=hLen>0?dir.z/hLen:0;
    let dest=null;
    for(let i=40;i>=2;i--){
      const tx=origin.x+nx*i,tz=origin.z+nz*i,ty=origin.y;
      try{
        const feet=player.dimension.getBlock({x:Math.floor(tx),y:Math.floor(ty),z:Math.floor(tz)});
        const head=player.dimension.getBlock({x:Math.floor(tx),y:Math.floor(ty)+1,z:Math.floor(tz)});
        if((!feet||feet.isAir||feet.isLiquid)&&(!head||head.isAir||head.isLiquid)){dest={x:tx,y:ty,z:tz};break;}
      }catch(_){}
    }
    if(!dest){player.sendMessage('§cNo clear path!');SpiritSystem.restoreSpirit(player,this.COSTS.blink);return false;}
    this._starRing(player.dimension,origin,12,0.8);
    player.playSound('mob.endermen.portal',{pitch:1.3,volume:1.0});
    try{player.teleport(dest,{dimension:player.dimension});}catch(_){}
    this._starRing(player.dimension,dest,12,0.8);
    player.playSound('mob.endermen.portal',{pitch:1.6,volume:0.8});
    player.sendMessage('§9§o Night Blink!');
    return true;
  }

  static _starRing(dim,loc,count,radius){
    for(let i=0;i<count;i++){const a=(i/count)*Math.PI*2;try{dim.spawnParticle('minecraft:endrod',{x:loc.x+Math.cos(a)*radius,y:loc.y+0.5,z:loc.z+Math.sin(a)*radius});}catch(_){}}
  }

  static _castBridge(player) {
    const pos=player.location,dir=player.getViewDirection();
    const hLen=Math.sqrt(dir.x*dir.x+dir.z*dir.z);
    const nx=hLen>0?dir.x/hLen:1,nz=hLen>0?dir.z/hLen:0;
    const dim=player.dimension,placed=[],by=Math.floor(pos.y)-1;
    for(let i=1;i<=20;i++){
      const bx=Math.floor(pos.x+nx*i),bz=Math.floor(pos.z+nz*i);
      try{const block=dim.getBlock({x:bx,y:by,z:bz});if(block&&!block.isAir) break;dim.runCommand(`setblock ${bx} ${by} ${bz} minecraft:blue_stained_glass`);placed.push({x:bx,y:by,z:bz});}catch(_){}
    }
    this.activeBridges.set(player.name,{blocks:placed,ticksLeft:150});
    player.sendMessage(`§b✦ Star Bridge! §7(${placed.length} blocks, fades in 30s)`);
    player.playSound('block.amethyst_block.place',{pitch:0.9,volume:1.0});
    return true;
  }

  static _tickBridge(player) {
    const b=this.activeBridges.get(player.name);
    if(!b) return;
    b.ticksLeft--;
    if(b.ticksLeft<=0){
      for(const block of b.blocks){try{const bl=player.dimension.getBlock(block);if(bl&&bl.typeId==='minecraft:blue_stained_glass')player.dimension.runCommand(`setblock ${block.x} ${block.y} ${block.z} air`);}catch(_){}}
      this.activeBridges.delete(player.name);
      player.sendMessage('§7The Star Bridge fades...');
    }
  }

  // ============================================================================
// mysticologist.js — replace _castTunnel with exact warlock original
// ============================================================================
  static _castTunnel(player) {
    const view   = player.getViewDirection();
    const eyeLoc = player.getHeadLocation();

    // ── Step 1: Raycast to find the target block (works in ANY direction
    //   including up, down, diagonal — fixes ceiling/floor issue)
    let targetLoc = null;
    for (let i = 1; i <= 12; i++) {
      const checkLoc = {
        x: Math.floor(eyeLoc.x + view.x * i),
        y: Math.floor(eyeLoc.y + view.y * i),
        z: Math.floor(eyeLoc.z + view.z * i)
      };
      try {
        const block = player.dimension.getBlock(checkLoc);
        if (block &&
            block.typeId !== 'minecraft:air' &&
            block.typeId !== 'minecraft:bedrock' &&
            block.typeId !== 'minecraft:barrier') {
          targetLoc = checkLoc;
          break;
        }
      } catch (_) {}
    }

    if (!targetLoc) {
      player.sendMessage('§cNo valid blocks in range!');
      // Refund spirit + powder (caller already consumed them)
      SpiritSystem.restoreSpirit(player, this.SPELLS.TUNNEL.spiritCost);
      this._consumePowder(player, this.SPELLS.TUNNEL.powderItem, -this.SPELLS.TUNNEL.powderCount);
      return false;
    }

    player.sendMessage('§8§l⛏ TUNNEL!');
    player.playSound('dig.stone', { pitch: 1.2, volume: 1.5 });

    // ── Step 2: Mine 3×3×3 cube centred on target block
    //   Drops items (destroy) and skips bedrock/barrier
    let removed = 0;
   const facingX = Math.abs(view.x) >= Math.abs(view.z);

    for (let wide = -1; wide <= 1; wide++) {
      for (let tall = -1; tall <= 1; tall++) {
        for (let deep = 0; deep <= 3; deep++) {
          const bx = targetLoc.x + (facingX ? deep * Math.sign(view.x) : wide);
          const by = targetLoc.y + tall;
          const bz = targetLoc.z + (facingX ? wide : deep * Math.sign(view.z));
          try {
            const block = player.dimension.getBlock({ x: bx, y: by, z: bz });
            if (!block ||
                block.typeId === 'minecraft:air' ||
                block.typeId === 'minecraft:bedrock' ||
                block.typeId === 'minecraft:barrier') continue;

            // Block destruct particle (looks great, matches old mod style)
            try {
              player.dimension.spawnParticle('minecraft:block_destruct',
                { x: bx+0.5, y: by+0.5, z: bz+0.5 });
            } catch (_) {}

            // destroy = drops items
            try {
              player.dimension.runCommand(`setblock ${bx} ${by} ${bz} air destroy`);
            } catch (_) {
              // Fallback: silent remove (no drops) if destroy fails
              try { block.setType('minecraft:air'); } catch (_2) {}
            }
            removed++;
          } catch (_) {}
        }
      }
    }

    if (removed > 0) {
      player.sendMessage(`§7§o*Excavated ${removed} blocks — items dropped nearby*`);
    } else {
      player.sendMessage('§7Nothing to mine there.');
    }
    return true;
  }

  static _castHandOfForce(player) {
    const grabbed = this.handOfForceActive.get(player.name);

    // Sneak+cast = return to original position
    if (grabbed && player.isSneaking) {
      this.handOfForceActive.delete(player.name);
      try {
        grabbed.target.teleport(grabbed.originalLocation, { dimension: player.dimension });
        try { grabbed.target.removeEffect('glowing'); } catch(_) {}
        player.sendMessage('§5Target returned.');
      } catch(_) {}
      return true;
    }

    // Already holding, not sneaking = release where it is
    if (grabbed) {
      this.handOfForceActive.delete(player.name);
      try { grabbed.target.removeEffect('glowing'); } catch(_) {}
      player.sendMessage('§5Target released.');
      return true;
    }

    // Grab new target
    const target = this._findTargetedEntity(player, 16);
    if (!target) {
      player.sendMessage('§cNo target found! Look at an entity within 16 blocks.');
      SpiritSystem.restoreSpirit(player, this.COSTS.hand_of_force);
      return false;
    }

    this.handOfForceActive.set(player.name, {
      target,
      originalLocation: { ...target.location }
    });

    try { target.addEffect('glowing', 999999, { amplifier: 0, showParticles: false }); } catch(_) {}
    player.sendMessage('§5§l✋ Hand of Force! §7Cast again to release. §8Sneak+cast to return.');
    player.playSound('mob.shulker.shoot', { pitch: 1.5, volume: 1.0 });
    return true;
  }

  static _castOreSense(player) {
    const RANGE = 32;
    player.sendMessage('§e⛏ §lORE SENSE§r§e scanning...');
    player.playSound('random.orb', { pitch: 1.6, volume: 0.8 });
 
    const { counts, nearest } = this._scanOres(player, RANGE);
 
    if (Object.keys(counts).length === 0) {
      player.sendMessage('§7No ores detected within §e32§7 blocks.');
      return true;
    }
 
    // Display precious ores first, then common — filtered to those found
    const lines = [];
    for (const label of this.ORE_DISPLAY_ORDER) {
      if (!counts[label]) continue;
      const n = nearest[label];
      const dx = n.x - Math.floor(player.location.x);
      const dy = n.y - Math.floor(player.location.y);
      const dz = n.z - Math.floor(player.location.z);
      const dir = this._getDirection(dx, dy, dz, player);
      lines.push(`${label}§8: §f${counts[label]}x §8— nearest: §f~${Math.round(n.dist)}m §7${dir}`);
    }
 
    player.sendMessage(`§e§l⛏ Ores in ${RANGE}m radius:`);
    for (const line of lines) player.sendMessage(`  ${line}`);
 
    // Particle trail toward nearest precious ore
    const preciousLabels = this.ORE_DISPLAY_ORDER.filter(l => this.ORE_LABELS[
      Object.keys(this.ORE_LABELS).find(k => this.ORE_LABELS[k].label === l)
    ]?.precious && counts[l]);
 
    if (preciousLabels.length > 0) {
      const n = nearest[preciousLabels[0]];
      const ploc = player.location;
      const dx = n.x - ploc.x, dy = n.y - ploc.y, dz = n.z - ploc.z;
      const dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
      if (dist > 0) {
        const steps = Math.min(20, Math.floor(dist));
        for (let t = 0; t <= steps; t++) {
          const f = t / steps;
          try { player.dimension.spawnParticle('minecraft:endrod', {
            x: ploc.x + dx*f, y: ploc.y + 1 + dy*f, z: ploc.z + dz*f
          }); } catch(_) {}
        }
      }
    }
 
    return true;
  }
 
  // ── ADD _scanOres helper ──────────────────────────────────────────────────
 
  static _scanOres(player, range) {
    const loc = player.location;
    const bx = Math.floor(loc.x), by = Math.floor(loc.y), bz = Math.floor(loc.z);
    const counts = {}, nearest = {};
 
    for (let x = -range; x <= range; x++) {
      for (let y = -range; y <= range; y++) {
        for (let z = -range; z <= range; z++) {
          if (x*x + y*y + z*z > range*range) continue;
          try {
            const block = player.dimension.getBlock({ x: bx+x, y: by+y, z: bz+z });
            if (!block) continue;
            const entry = this.ORE_LABELS[block.typeId];
            if (!entry) continue;
            const label = entry.label;
            counts[label] = (counts[label] || 0) + 1;
            const dist = Math.sqrt(x*x + y*y + z*z);
            if (!nearest[label] || dist < nearest[label].dist) {
              nearest[label] = { x: bx+x, y: by+y, z: bz+z, dist };
            }
          } catch(_) {}
        }
      }
    }
    return { counts, nearest };
  }
 
  // ── ADD _getDirection helper ──────────────────────────────────────────────
 
  static _getDirection(dx, dy, dz, player) {
    const targetAngle = ((Math.atan2(dx, dz) * (180/Math.PI)) % 360 + 360) % 360;
    const compassLabels = ['N','NE','E','SE','S','SW','W','NW'];
    const compass = compassLabels[Math.round(targetAngle/45) % 8];
 
    let facingYaw = 0;
    try {
      const rot = player.getRotation();
      facingYaw = ((rot.y + 180) % 360 + 360) % 360;
    } catch(_) {}
 
    let delta = targetAngle - facingYaw;
    if (delta > 180)  delta -= 360;
    if (delta < -180) delta += 360;
 
    const absDelta = Math.abs(delta);
    let turnHint;
    if (absDelta < 20)       turnHint = '§a(ahead)';
    else if (absDelta > 160) turnHint = '§c(behind)';
    else {
      const degrees = Math.round(absDelta/45)*45;
      turnHint = `§7(~§e${degrees}°§7 ${delta>0?'right':'left'})`;
    }
 
    let elevation;
    if (dy < -3)      elevation = `§c${Math.abs(dy)} below`;
    else if (dy > 3)  elevation = `§a${dy} above`;
    else              elevation = '§7~same level';
 
    return `§e${compass}§7, ${elevation} ${turnHint}`;
  }

  // =============================================
  // COOLDOWN HELPERS
  // =============================================
  static _tickCooldowns(player) {
    const cds=this.cooldowns.get(player.name)||{};
    for(const spell of Object.keys(cds)){if(cds[spell]>0)cds[spell]--;}
    this.cooldowns.set(player.name,cds);
  }
  static _setCooldown(player,spell,ticks){
    const cds=this.cooldowns.get(player.name)||{};
    cds[spell]=ticks;
    this.cooldowns.set(player.name,cds);
  }
  static _cdRemaining(player,spell){
    const v=(this.cooldowns.get(player.name)||{})[spell]||0;
    return v>0?Math.ceil((v*4)/20):0;
  }

  // =============================================
  // RAYCAST HELPERS
  // =============================================
  static _raycastBlock(player,maxDist){
    const eye=player.getHeadLocation(),view=player.getViewDirection();
    for(let i=1;i<=maxDist*2;i++){
      const pos={x:eye.x+view.x*i*0.5,y:eye.y+view.y*i*0.5,z:eye.z+view.z*i*0.5};
      try{const block=player.dimension.getBlock({x:Math.floor(pos.x),y:Math.floor(pos.y),z:Math.floor(pos.z)});if(block&&!block.isAir&&!block.isLiquid) return pos;}catch(_){}
    }
    return null;
  }
  static _raycastEntity(player,maxDist){
    const eye=player.getHeadLocation(),view=player.getViewDirection();
    let best=null,bestDot=-1;
    try{
      const entities=player.dimension.getEntities({location:player.location,maxDistance:maxDist,excludeTypes:['minecraft:item','minecraft:xp_orb','lotm:wisp']});
      for(const e of entities){
        if(e.id===player.id) continue;
        const dx=e.location.x-eye.x,dy=e.location.y-eye.y,dz=e.location.z-eye.z;
        const len=Math.sqrt(dx*dx+dy*dy+dz*dz);
        if(len===0) continue;
        const dot=(dx*view.x+dy*view.y+dz*view.z)/len;
        if(dot>bestDot){bestDot=dot;best=e;}
      }
    }catch(_){}
    return best;
  }

   static _findTargetedEntity(player, maxDist) {
    const eye  = player.getHeadLocation();
    const view = player.getViewDirection();

    for (let i = 1; i <= maxDist * 2; i++) {
      const checkLoc = {
        x: eye.x + view.x * i * 0.5,
        y: eye.y + view.y * i * 0.5,
        z: eye.z + view.z * i * 0.5
      };

      // Stop at solid blocks
      try {
        const block = player.dimension.getBlock({
          x: Math.floor(checkLoc.x),
          y: Math.floor(checkLoc.y),
          z: Math.floor(checkLoc.z)
        });
        if (block && !block.isAir && !block.isLiquid) return null;
      } catch(_) {}

      // Check for entities at this point
      try {
        const near = player.dimension.getEntities({
          location: checkLoc, maxDistance: 1.5,
          excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow', 'lotm:wisp']
        });
        for (const e of near) {
          if (e.id === player.id) continue;
          return e; // Return first non-player entity hit
        }
      } catch(_) {}
    }
    return null;
  }

  static _processHandOfForce(player) {
    const grabbed = this.handOfForceActive.get(player.name);
    if (!grabbed) return;

    // Check target still valid
    try {
      if (typeof grabbed.target.isValid === 'function' && !grabbed.target.isValid()) {
        this.handOfForceActive.delete(player.name);
        player.sendMessage('§7Target was destroyed.');
        return;
      }
    } catch(_) {}

    try {
      const view = player.getViewDirection();
      const eye  = player.getHeadLocation();
      const targetPos = {
        x: eye.x + view.x * 5,
        y: eye.y + view.y * 5,
        z: eye.z + view.z * 5
      };

      const dx = targetPos.x - grabbed.target.location.x;
      const dy = targetPos.y - grabbed.target.location.y;
      const dz = targetPos.z - grabbed.target.location.z;
      if (Math.sqrt(dx*dx+dy*dy+dz*dz) > 0.5) {
        grabbed.target.teleport(targetPos, { dimension: player.dimension });
      }

      // Soul particle trail every 5 ticks
      const curTick = system.currentTick || 0;
      if (curTick % 5 === 0) {
        for (let i = 0; i <= 5; i++) {
          const f = i / 5;
          try { player.dimension.spawnParticle('minecraft:soul_particle', {
            x: eye.x + (targetPos.x-eye.x)*f,
            y: eye.y + (targetPos.y-eye.y)*f,
            z: eye.z + (targetPos.z-eye.z)*f
          }); } catch(_) {}
        }
      }
    } catch(_) {
      this.handOfForceActive.delete(player.name);
      player.sendMessage('§cLost grip on target!');
    }
  }

  static _hasAccess(player){
    return PathwayManager.getPathway(player)===this.PATHWAY&&PathwayManager.getSequence(player)<=this.SEQUENCE_NUMBER;
  }

  static removeEffects(player){
    this.attackIndex.delete(player.name);this.defenseIndex.delete(player.name);
    this.buffIndex.delete(player.name);this.utilityIndex.delete(player.name);
    this.cooldowns.delete(player.name);this.handOfForceActive.delete(player.name);
    this.forceFields.delete(player.name);this.armourBuffs.delete(player.name);
    this.raisedEarths.delete(player.name);this.activeBridges.delete(player.name);
  }
}
