// ============================================
// LISTENER - SEQUENCE 8 HANGED MAN PATHWAY
// ============================================
// The Listen ability is always-on passive.
// Whispers, music fragments, and distorted sounds
// bleed into the Listener's perception at random.
// Over time this drives them toward madness.
// Madness has 5 stages, each with escalating effects.
// Sanity recovers slowly near other players.
// ============================================

import { world, system } from '@minecraft/server';
import { SpiritSystem } from '../../core/spiritSystem.js';
import { PathwayManager } from '../../core/pathwayManager.js';
import { SecretsSuppliantSequence } from './secrets_suppliant.js';

export class ListenerSequence {
  static SEQUENCE_NUMBER = 8;
  static PATHWAY = PathwayManager.PATHWAYS.HANGED_MAN;

  // ── Madness System ──────────────────────────────────────────────────────
  // Stored as a dynamic property: 0 (sane) → 100 (fully mad)
  static MADNESS_PROPERTY    = 'lotm:listener_madness';
  static MAX_MADNESS         = 100;

  // How fast madness accumulates per tick (called every 4 ticks from main loop)
  // At base rate, 0→100 takes about 10 in-game minutes of play
  static MADNESS_RATE_BASE   = 0.04; // per 4-tick call = ~0.01/tick
  // Being near other players slows accumulation and allows recovery
  static MADNESS_RECOVERY_NEAR_PLAYER = -0.08; // net = -0.04/tick when near player
  // Full madness recovery only happens when the player sleeps (not implemented yet)
  // or uses a Spirit Restoration Potion (handled in main.js)
  static MADNESS_POTION_REDUCTION = 20; // reduced when drinking spirit restoration

  // ── Madness Stages ──────────────────────────────────────────────────────
  // Stage 0:  0–19  — Faint whispers, rare sounds. Functional.
  // Stage 1: 20–39  — Frequent sounds, occasional nausea pulses.
  // Stage 2: 40–59  — Music shards, darkness flickers, mild weakness.
  // Stage 3: 60–79  — Constant noise, blindness pulses, hallucination particles.
  // Stage 4: 80–99  — Near-constant madness. Extreme effects.
  // Stage 5: 100    — Full madness. Strength surge but severe debuffs. Danger zone.
  static MADNESS_STAGE_THRESHOLDS = [0, 20, 40, 60, 80, 100];

  // ── Sound Pools ─────────────────────────────────────────────────────────
  // Minecraft sound event strings (Bedrock format)
  static SOUNDS_WHISPER = [
    'mob.endermen.idle',
    'mob.endermen.stare',
    'ambient.cave',
    'mob.ghast.moan',
    'mob.wither.idle',
    'block.bell.hit',
    'note.harp',
    'note.pling',
    'note.bass',
    'mob.bat.idle',
    'mob.bat.death',
  ];

  static SOUNDS_MUSIC_SHARDS = [
    // Music disc fragments — use note instruments at random pitch to simulate
    'note.harp',
    'note.bell',
    'note.chime',
    'note.guitar',
    'note.xylophone',
    'note.iron_xylophone',
    'note.cow_bell',
    'note.didgeridoo',
    'note.bit',
    'note.banjo',
    'note.pling',
  ];

  static SOUNDS_AMBIENT_WRONG = [
    // Sounds that are wrong in context (animals underground, etc.)
    'mob.cow.idle',
    'mob.pig.idle',
    'mob.sheep.idle',
    'mob.cat.meow',
    'mob.wolf.idle',
    'mob.chicken.idle',
    'mob.horse.idle',
    'mob.villager.idle',
    'mob.villager.trading',
    'random.splash',
    'random.swim',
    'fire.fire',
    'mob.zombie.idle',
    'mob.skeleton.idle',
    'mob.spider.idle',
    'mob.creeper.say',
    'mob.phantom.idle',
    'mob.drowned.idle',
  ];

  static SOUNDS_DISTORTED = [
    // Deep, distorted, wrong
    'mob.elder_guardian.curse',
    'mob.warden.idle',
    'mob.warden.listening',
    'mob.warden.sniff',
    'mob.warden.heartbeat',
    'mob.ghast.scream',
    'mob.wither.shoot',
    'mob.endermen.portal',
    'ambient.nether_wastes.loop',
    'ambient.soul_sand_valley.loop',
    'ambient.warped_forest.loop',
    'ambient.crimson_forest.loop',
  ];

  // All pools merged with weights — whispers drawn from all, weighted by madness stage
  // Format: [soundId, pitchMin, pitchMax, volumeMin, volumeMax]
  // Pitch <1 = lower/slower, >1 = higher/faster
  static SOUND_ENTRIES = [
    // Whispers (low madness)
    { sound: 'mob.endermen.idle',        pitchMin: 0.3, pitchMax: 0.7, volMin: 0.2, volMax: 0.5, minStage: 0 },
    { sound: 'ambient.cave',             pitchMin: 0.6, pitchMax: 1.2, volMin: 0.1, volMax: 0.4, minStage: 0 },
    { sound: 'mob.bat.idle',             pitchMin: 0.5, pitchMax: 0.9, volMin: 0.1, volMax: 0.3, minStage: 0 },
    { sound: 'note.harp',                pitchMin: 0.4, pitchMax: 0.8, volMin: 0.2, volMax: 0.5, minStage: 0 },
    { sound: 'mob.ghast.moan',           pitchMin: 0.3, pitchMax: 0.6, volMin: 0.2, volMax: 0.5, minStage: 0 },
    { sound: 'block.bell.hit',           pitchMin: 0.5, pitchMax: 1.0, volMin: 0.1, volMax: 0.4, minStage: 0 },
    // Wrong ambient (low-mid madness)
    { sound: 'mob.cow.idle',             pitchMin: 0.6, pitchMax: 1.1, volMin: 0.2, volMax: 0.5, minStage: 1 },
    { sound: 'mob.zombie.idle',          pitchMin: 0.4, pitchMax: 0.8, volMin: 0.2, volMax: 0.6, minStage: 1 },
    { sound: 'mob.skeleton.idle',        pitchMin: 0.5, pitchMax: 0.9, volMin: 0.2, volMax: 0.5, minStage: 1 },
    { sound: 'mob.cat.meow',             pitchMin: 0.7, pitchMax: 1.3, volMin: 0.2, volMax: 0.5, minStage: 1 },
    { sound: 'mob.villager.idle',        pitchMin: 0.4, pitchMax: 0.9, volMin: 0.1, volMax: 0.4, minStage: 1 },
    { sound: 'note.pling',               pitchMin: 0.3, pitchMax: 0.7, volMin: 0.2, volMax: 0.5, minStage: 1 },
    { sound: 'note.bell',                pitchMin: 0.2, pitchMax: 0.6, volMin: 0.2, volMax: 0.6, minStage: 1 },
    // Music fragments (mid madness)
    { sound: 'note.guitar',              pitchMin: 0.3, pitchMax: 0.7, volMin: 0.3, volMax: 0.7, minStage: 2 },
    { sound: 'note.chime',               pitchMin: 0.2, pitchMax: 0.5, volMin: 0.3, volMax: 0.7, minStage: 2 },
    { sound: 'note.xylophone',           pitchMin: 0.4, pitchMax: 0.8, volMin: 0.3, volMax: 0.6, minStage: 2 },
    { sound: 'note.banjo',               pitchMin: 0.3, pitchMax: 0.7, volMin: 0.3, volMax: 0.7, minStage: 2 },
    { sound: 'mob.wither.idle',          pitchMin: 0.2, pitchMax: 0.5, volMin: 0.4, volMax: 0.8, minStage: 2 },
    { sound: 'mob.phantom.idle',         pitchMin: 0.4, pitchMax: 0.8, volMin: 0.3, volMax: 0.7, minStage: 2 },
    { sound: 'mob.endermen.stare',       pitchMin: 0.2, pitchMax: 0.6, volMin: 0.4, volMax: 0.8, minStage: 2 },
    // Distorted (high madness)
    { sound: 'mob.elder_guardian.curse', pitchMin: 0.2, pitchMax: 0.5, volMin: 0.5, volMax: 1.0, minStage: 3 },
    { sound: 'mob.warden.idle',          pitchMin: 0.3, pitchMax: 0.6, volMin: 0.5, volMax: 1.0, minStage: 3 },
    { sound: 'mob.warden.heartbeat',     pitchMin: 0.4, pitchMax: 0.8, volMin: 0.6, volMax: 1.0, minStage: 3 },
    { sound: 'mob.ghast.scream',         pitchMin: 0.2, pitchMax: 0.5, volMin: 0.4, volMax: 0.9, minStage: 3 },
    { sound: 'mob.wither.shoot',         pitchMin: 0.3, pitchMax: 0.6, volMin: 0.5, volMax: 1.0, minStage: 3 },
    { sound: 'mob.endermen.portal',      pitchMin: 0.3, pitchMax: 0.7, volMin: 0.5, volMax: 1.0, minStage: 3 },
    // Peak madness
    { sound: 'mob.warden.sniff',         pitchMin: 0.1, pitchMax: 0.4, volMin: 0.7, volMax: 1.0, minStage: 4 },
    { sound: 'ambient.soul_sand_valley.loop', pitchMin: 0.5, pitchMax: 1.0, volMin: 0.6, volMax: 1.0, minStage: 4 },
    { sound: 'ambient.nether_wastes.loop', pitchMin: 0.4, pitchMax: 0.9, volMin: 0.5, volMax: 1.0, minStage: 4 },
    { sound: 'mob.warden.listening',     pitchMin: 0.2, pitchMax: 0.5, volMin: 0.7, volMax: 1.0, minStage: 4 },
  ];

  // ── Timing ───────────────────────────────────────────────────────────────
  // Sound fires on random chance each passive tick.
  // Chance scales with madness stage.
  // applyPassiveAbilities is called every 4 main-loop ticks.
  static SOUND_CHANCE_BY_STAGE = [
    0.01,  // Stage 0 — ~1% per call, ~once every 400 ticks (20s)
    0.025, // Stage 1 — ~once every ~160 ticks (8s)
    0.05,  // Stage 2 — ~once every ~80 ticks (4s)
    0.10,  // Stage 3 — ~once every ~40 ticks (2s)
    0.20,  // Stage 4 — ~once every ~20 ticks (1s)
    0.40,  // Stage 5 — very frequent (~every 0.5s)
  ];

  // ── State ────────────────────────────────────────────────────────────────
  static lastSoundTick  = new Map(); // playerName -> last tick a sound was played
  static perceptionTicks = new Map(); // for inherited passive scan

  // Selected ability (inherits Secrets Suppliant abilities + new ones)
  static selectedAbilities = new Map();
  static SELECTED_ABILITY_PROPERTY = 'lotm:listener_selected_ability';

  // ── Ability identifiers ───────────────────────────────────────────────
  static ABILITIES = {
    // Inherited
    DIVINATION:              SecretsSuppliantSequence.ABILITIES.DIVINATION,
    ENCHANTMENT_INSCRIPTION: SecretsSuppliantSequence.ABILITIES.ENCHANTMENT_INSCRIPTION,
    AURA_READING:            SecretsSuppliantSequence.ABILITIES.AURA_READING,
    // New
    FOCUSED_LISTEN:          'focused_listen',   // Active: amplify Listen for 10s, gather info
    SUPPRESS_VOICES:         'suppress_voices',  // Active: temporarily reduce madness rate
  };

  // ── Focused Listen state ──────────────────────────────────────────────
  static focusedListenActive    = new Map(); // playerName -> ticksRemaining
  static focusedListenCooldowns = new Map();
  static FOCUSED_LISTEN_SPIRIT_COST = 40;
  static FOCUSED_LISTEN_DURATION    = 200; // 10 seconds
  static FOCUSED_LISTEN_COOLDOWN    = 200; // 10 seconds (reduced from 20)
  static FOCUSED_LISTEN_RANGE       = 80;

  // ── Suppress Voices state ────────────────────────────────────────────
  static suppressActive    = new Map();
  static suppressCooldowns = new Map();
  static SUPPRESS_SPIRIT_COST = 30;
  static SUPPRESS_DURATION    = 300; // 15 seconds
  static SUPPRESS_COOLDOWN    = 300; // 15 seconds (reduced from 30)

  // =============================================
  // SEQUENCE CHECK
  // =============================================
  static hasSequence(player) {
    return PathwayManager.getPathway(player) === this.PATHWAY &&
           PathwayManager.getSequence(player) <= this.SEQUENCE_NUMBER;
  }

  // =============================================
  // MADNESS HELPERS
  // =============================================
  static getMadness(player) {
    try {
      const val = player.getDynamicProperty(this.MADNESS_PROPERTY);
      return typeof val === 'number' ? val : 0;
    } catch (e) { return 0; }
  }

  static setMadness(player, value) {
    const clamped = Math.max(0, Math.min(this.MAX_MADNESS, value));
    try { player.setDynamicProperty(this.MADNESS_PROPERTY, clamped); } catch (e) {}
    return clamped;
  }

  static getMadnessStage(player) {
    const m = this.getMadness(player);
    if (m >= 100) return 5;
    if (m >= 80)  return 4;
    if (m >= 60)  return 3;
    if (m >= 40)  return 2;
    if (m >= 20)  return 1;
    return 0;
  }

  static getMadnessLabel(stage) {
    const labels = ['§aClear', '§eUnsettled', '§6Disturbed', '§cFractured', '§4Unraveling', '§0UNHINGED'];
    return labels[stage] || '§7Unknown';
  }

  // =============================================
  // SELECTED ABILITY HELPERS
  // =============================================
  static getSelectedAbility(player) {
    if (!this.selectedAbilities.has(player.name)) {
      try {
        const saved = player.getDynamicProperty(this.SELECTED_ABILITY_PROPERTY);
        if (saved) this.selectedAbilities.set(player.name, saved);
      } catch (e) {}
    }
    return this.selectedAbilities.get(player.name) || this.ABILITIES.FOCUSED_LISTEN;
  }

  static setSelectedAbility(player, abilityId) {
    this.selectedAbilities.set(player.name, abilityId);
    try { player.setDynamicProperty(this.SELECTED_ABILITY_PROPERTY, abilityId); } catch (e) {}
  }

  static useSelectedAbility(player) {
    return this.handleAbilityUse(player, this.getSelectedAbility(player));
  }

  // =============================================
  // PASSIVE ABILITIES (called every 4 ticks)
  // =============================================
  static applyPassiveAbilities(player) {
    // Inherit Seq 9 passives
    SecretsSuppliantSequence.applyPassiveAbilities(player);

    // Override: enhanced spirituality — Speed I still, but now also Resistance I
    const res = player.getEffect('resistance');
    if (!res || res.amplifier !== 0 || res.duration < 200) {
      player.addEffect('resistance', SecretsSuppliantSequence.EFFECT_DURATION, {
        amplifier: 0, showParticles: false
      });
    }

    // Madness tick
    this._tickMadness(player);

    // Listen passive — random sounds
    this._tickListen(player);

    // Apply madness stage effects
    this._applyMadnessEffects(player);

    // Process active abilities
    this._processFocusedListen(player);
    this._processSuppressVoices(player);

    // Tick cooldowns
    this._tickCooldowns(player);

    // Action bar — show madness level alongside spirit
    const stage      = this.getMadnessStage(player);
    const madness    = Math.floor(this.getMadness(player));
    const stageLabel = this.getMadnessLabel(stage);
    const spirit     = Math.floor(SpiritSystem.getSpirit(player));
    const maxSpirit  = SpiritSystem.getMaxSpirit(player);
    player.onScreenDisplay.setActionBar(
      `§bSpirit: §f${spirit}§7/§f${maxSpirit}  §7│  Mind: ${stageLabel} §7(${madness}/100)`
    );
  }

  // =============================================
  // MADNESS TICK
  // =============================================
  static _tickMadness(player) {
    let delta = this.MADNESS_RATE_BASE;

    // Suppress Voices halves madness accumulation
    if (this.suppressActive.has(player.name)) {
      delta *= 0.5;
    }

    // Being near other players provides grounding — reduces accumulation
    try {
      const nearbyPlayers = player.dimension.getPlayers({
        location: player.location,
        maxDistance: 8
      });
      const otherPlayers = nearbyPlayers.filter(p => p.name !== player.name);
      if (otherPlayers.length > 0) {
        delta += this.MADNESS_RECOVERY_NEAR_PLAYER; // net negative — recovery
      }
    } catch (e) {}

    this.setMadness(player, this.getMadness(player) + delta);
  }

  // =============================================
  // LISTEN TICK — play random sounds
  // =============================================
  static _tickListen(player) {
    const stage = this.getMadnessStage(player);
    const chance = this.SOUND_CHANCE_BY_STAGE[stage] || 0.01;

    if (Math.random() > chance) return;

    // Pick a sound entry valid for this stage or below
    const validEntries = this.SOUND_ENTRIES.filter(e => e.minStage <= stage);
    if (validEntries.length === 0) return;

    const entry = validEntries[Math.floor(Math.random() * validEntries.length)];
    const pitch  = entry.pitchMin + Math.random() * (entry.pitchMax - entry.pitchMin);
    const volume = entry.volMin + Math.random() * (entry.volMax - entry.volMin);

    try {
      player.playSound(entry.sound, { pitch, volume });
    } catch (e) {
      // Sound may not exist in this Bedrock version — silently skip
    }

    // At stage 2+ occasionally play a distorted sequence of 2-3 notes
    if (stage >= 2 && Math.random() < 0.3) {
      this._playMusicFragment(player, stage);
    }
  }

  /**
   * Play a short sequence of 2-4 notes to simulate a music disc fragment
   */
  static _playMusicFragment(player, stage) {
    const noteInstruments = [
      'note.harp', 'note.bell', 'note.chime', 'note.guitar',
      'note.xylophone', 'note.banjo', 'note.pling', 'note.bit'
    ];
    const noteCount = 2 + Math.floor(Math.random() * 3); // 2-4 notes
    const basePitch = 0.3 + Math.random() * 0.8;

    for (let i = 0; i < noteCount; i++) {
      const delay = i * (8 + Math.floor(Math.random() * 12)); // staggered
      system.runTimeout(() => {
        try {
          const inst = noteInstruments[Math.floor(Math.random() * noteInstruments.length)];
          // Each note drifts slightly in pitch — feels like a warped melody
          const driftPitch = basePitch + (Math.random() * 0.3 - 0.15);
          player.playSound(inst, { pitch: driftPitch, volume: 0.3 + Math.random() * 0.4 });
        } catch (e) {}
      }, delay);
    }
  }

  // =============================================
  // MADNESS STAGE EFFECTS
  // =============================================
  static _applyMadnessEffects(player) {
    const stage = this.getMadnessStage(player);

    switch (stage) {
      case 0:
        // Fully lucid — no debuffs. Slight night vision already applied.
        break;

      case 1:
        // Unsettled — occasional nausea pulses (1% chance per call)
        if (Math.random() < 0.01) {
          player.addEffect('nausea', 60, { amplifier: 0, showParticles: true });
        }
        break;

      case 2:
        // Disturbed — nausea more frequent, mild weakness
        if (Math.random() < 0.025) {
          player.addEffect('nausea', 80, { amplifier: 0, showParticles: true });
        }
        if (Math.random() < 0.005) {
          player.addEffect('blindness', 20, { amplifier: 0, showParticles: false });
        }
        break;

      case 3:
        // Fractured — blindness flashes, weakness, hallucination particles
        if (Math.random() < 0.04) {
          player.addEffect('blindness', 30, { amplifier: 0, showParticles: false });
        }
        player.addEffect('weakness', 40, { amplifier: 0, showParticles: false });
        // Hallucination particles — floating near the player's head
        if (Math.random() < 0.05) {
          this._spawnHallucinationParticles(player);
        }
        break;

      case 4:
        // Unraveling — near constant effects
        if (Math.random() < 0.08) {
          player.addEffect('blindness', 40, { amplifier: 0, showParticles: false });
        }
        player.addEffect('weakness', 40, { amplifier: 1, showParticles: false });
        player.addEffect('nausea',    40, { amplifier: 0, showParticles: true });
        if (Math.random() < 0.08) {
          this._spawnHallucinationParticles(player);
        }
        // Random uncontrolled ability activation
        if (Math.random() < 0.01) {
          player.sendMessage('§4The voices force themselves through you...');
          this._triggerUncontrolledEffect(player);
        }
        break;

      case 5:
        // UNHINGED — full madness.
        // Strength surge (the voices grant power) but severe debuffs.
        player.addEffect('strength', 40, { amplifier: 3, showParticles: true });
        player.addEffect('weakness', 40, { amplifier: 0, showParticles: false }); // Paradox: replaced by strength above net=+3
        player.addEffect('nausea',   40, { amplifier: 1, showParticles: true });
        if (Math.random() < 0.15) {
          player.addEffect('blindness', 60, { amplifier: 0, showParticles: false });
        }
        this._spawnHallucinationParticles(player);
        // Constant whisper spam
        if (Math.random() < 0.3) {
          this._playMusicFragment(player, 5);
        }
        // Danger: apply periodic wither (5% per call)
        if (Math.random() < 0.05) {
          player.addEffect('wither', 40, { amplifier: 0, showParticles: true });
          player.sendMessage('§4§oThe True Creator speaks...');
        }
        break;
    }
  }

  static _spawnHallucinationParticles(player) {
    const loc = player.location;
    const dim = player.dimension;

    // Random offset in a small radius — like shapes seen in darkness
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = 1 + Math.random() * 2;
      const height= 0.5 + Math.random() * 2;
      try {
        dim.spawnParticle('minecraft:soul_particle', {
          x: loc.x + Math.cos(angle) * dist,
          y: loc.y + height,
          z: loc.z + Math.sin(angle) * dist
        });
      } catch (e) {}
    }

    // Stage 4+ adds enderman-like portal tear particles
    if (this.getMadnessStage(player) >= 4) {
      for (let i = 0; i < 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        try {
          dim.spawnParticle('minecraft:portal', {
            x: loc.x + Math.cos(angle) * (2 + Math.random() * 2),
            y: loc.y + Math.random() * 3,
            z: loc.z + Math.sin(angle) * (2 + Math.random() * 2)
          });
        } catch (e) {}
      }
    }
  }

  /**
   * An uncontrolled effect when madness forces itself through the player.
   * Random from a pool of "voice effects".
   */
  static _triggerUncontrolledEffect(player) {
    const roll = Math.random();
    try {
      if (roll < 0.33) {
        // Flash of "strength" followed by extreme nausea
        player.addEffect('strength', 60, { amplifier: 4, showParticles: true });
        player.addEffect('nausea',   100, { amplifier: 1, showParticles: true });
      } else if (roll < 0.66) {
        // Involuntary teleport (small random leap)
        const angle = Math.random() * Math.PI * 2;
        const dist  = 2 + Math.random() * 4;
        player.teleport({
          x: player.location.x + Math.cos(angle) * dist,
          y: player.location.y,
          z: player.location.z + Math.sin(angle) * dist
        }, { dimension: player.dimension });
        player.sendMessage('§4Your body moves without your will...');
      } else {
        // Sound burst — several distorted sounds in quick succession
        for (let i = 0; i < 4; i++) {
          system.runTimeout(() => {
            const entry = this.SOUND_ENTRIES.filter(e => e.minStage >= 3);
            if (entry.length > 0) {
              const e = entry[Math.floor(Math.random() * entry.length)];
              try { player.playSound(e.sound, { pitch: 0.2 + Math.random() * 0.4, volume: 1.0 }); } catch (err) {}
            }
          }, i * 6);
        }
      }
    } catch (e) {}
  }

  // =============================================
  // ABILITY: FOCUSED LISTEN
  // Actively channels the voices for 10s.
  // Greatly extends detection range and reveals
  // hidden/invisible entities within range.
  // Madness accumulates FASTER during this time.
  // =============================================
  static useFocusedListen(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    const cd = this._cdRemaining(this.focusedListenCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cFocused Listen on cooldown: §d${cd}s`);
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.FOCUSED_LISTEN_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §d${this.FOCUSED_LISTEN_SPIRIT_COST}`);
      return false;
    }

    this.focusedListenActive.set(player.name, this.FOCUSED_LISTEN_DURATION);
    this.focusedListenCooldowns.set(player.name, this.FOCUSED_LISTEN_COOLDOWN);

    player.sendMessage('§5§l👂 FOCUSED LISTEN');
    player.sendMessage('§dYou open your mind to the whispers between worlds...');
    player.playSound('mob.endermen.stare', { pitch: 0.3, volume: 1.0 });

    // Immediate pulse — reveal everything in range
    this._focusedListenScan(player);

    // Madness cost: accelerate during focused listen
    this.setMadness(player, this.getMadness(player) + 10);

    return true;
  }

  static _processFocusedListen(player) {
    const ticks = this.focusedListenActive.get(player.name);
    if (!ticks || ticks <= 0) { this.focusedListenActive.delete(player.name); return; }

    this.focusedListenActive.set(player.name, ticks - 1);

    // While active, madness accumulates faster (extra +0.1 per call)
    this.setMadness(player, this.getMadness(player) + 0.1);

    // Periodic scans every 40 ticks + ambient sounds
    if (ticks % 40 === 0) {
      this._focusedListenScan(player);
    }

    // Constant low whisper during focus
    if (ticks % 20 === 0) {
      const whispers = this.SOUND_ENTRIES.filter(e => e.minStage === 0);
      if (whispers.length > 0) {
        const e = whispers[Math.floor(Math.random() * whispers.length)];
        try { player.playSound(e.sound, { pitch: 0.3 + Math.random() * 0.3, volume: 0.6 }); } catch (err) {}
      }
    }

    if (ticks <= 1) {
      player.sendMessage('§7The voices recede... for now.');
      player.playSound('mob.endermen.idle', { pitch: 0.5, volume: 0.8 });
    }
  }

  static _focusedListenScan(player) {
    try {
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: this.FOCUSED_LISTEN_RANGE,
        excludeTypes: ['minecraft:item', 'minecraft:xp_orb', 'minecraft:arrow']
      });

      let detectedCount = 0;

      for (const entity of entities) {
        if (entity.id === player.id) continue;

        // Apply glowing — reveals invisible/hidden entities
        try { entity.addEffect('glowing', 120, { amplifier: 0, showParticles: false }); } catch (e) {}

        // Check for beyonder players — report their aura signature
        if (entity.typeId === 'minecraft:player') {
          const targetPathway = PathwayManager.getPathway(entity);
          if (targetPathway) {
            const seq  = PathwayManager.getSequence(entity);
            const dist = Math.floor(SecretsSuppliantSequence.prototype
              ? Math.sqrt(
                  Math.pow(player.location.x - entity.location.x, 2) +
                  Math.pow(player.location.y - entity.location.y, 2) +
                  Math.pow(player.location.z - entity.location.z, 2)
                )
              : 0);
            player.sendMessage(`§d[Voices] ${entity.name}: §5${targetPathway} §7Seq.${seq}`);
            detectedCount++;
          }
        }

        // LOTM custom mobs — give special voice messages
        const voiceMsg = this._getVoiceMessage(entity.typeId);
        if (voiceMsg) {
          player.sendMessage(`§4[Voices] §7${voiceMsg}`);
          detectedCount++;
        }
      }

      if (detectedCount === 0) {
        player.sendMessage('§7[Voices] ...silence... but they watch.');
      }
    } catch (e) {}
  }

  static _getVoiceMessage(typeId) {
    const msgs = {
      'lotm:rampager':       'Something rages nearby... power without reason...',
      'lotm:vengeful_ghost': 'Resentment... hatred frozen in time...',
      'lotm:ghost':          'A wandering soul... it does not know it is gone...',
      'lotm:ghoul':          'Corrupted hunger... it remembers being human...',
      'lotm:shade':          'A void wearing the shape of life...',
      'minecraft:warden':    'ANCIENT. WRATHFUL. DO NOT MOVE.',
      'minecraft:wither':    'Death incarnate circles you...',
      'minecraft:elder_guardian': 'Old magic. Old grief. It has waited long.',
      'minecraft:phantom':   'Sleepless. Like you will become.',
      'minecraft:evoker':    'One who speaks to things that should not answer...',
    };
    return msgs[typeId] || null;
  }

  // =============================================
  // ABILITY: SUPPRESS VOICES
  // Temporarily quiets the voices, halving madness
  // accumulation and clearing some stage effects.
  // Costs spirit as a mental exertion of will.
  // =============================================
  static useSuppressVoices(player) {
    if (!this.hasSequence(player)) {
      player.sendMessage('§cYou do not have access to this ability!');
      return false;
    }

    const cd = this._cdRemaining(this.suppressCooldowns, player);
    if (cd > 0) {
      player.sendMessage(`§cSuppress Voices on cooldown: §d${cd}s`);
      return false;
    }

    if (!SpiritSystem.consumeSpirit(player, this.SUPPRESS_SPIRIT_COST)) {
      player.sendMessage(`§cNot enough spirit! Need §d${this.SUPPRESS_SPIRIT_COST}`);
      return false;
    }

    this.suppressActive.set(player.name, this.SUPPRESS_DURATION);
    this.suppressCooldowns.set(player.name, this.SUPPRESS_COOLDOWN);

    // Immediate madness reduction
    const newMadness = this.setMadness(player, this.getMadness(player) - 8);

    // Remove active debuffs immediately
    try {
      player.removeEffect('nausea');
      player.removeEffect('blindness');
      player.removeEffect('weakness');
    } catch (e) {}

    player.sendMessage('§b§l🌀 SUPPRESS VOICES');
    player.sendMessage('§7You force your will against the tide of whispers...');
    player.sendMessage(`§bMadness reduced to §d${Math.floor(newMadness)}`);
    player.playSound('block.beacon.activate', { pitch: 1.6, volume: 0.8 });

    // Calming particle effect
    this._spawnSuppressEffect(player);

    return true;
  }

  static _processSuppressVoices(player) {
    const ticks = this.suppressActive.get(player.name);
    if (!ticks || ticks <= 0) { this.suppressActive.delete(player.name); return; }

    this.suppressActive.set(player.name, ticks - 1);

    // Gentle calming particles every 30 ticks
    if (ticks % 30 === 0) {
      try {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          player.dimension.spawnParticle('minecraft:villager_happy', {
            x: player.location.x + Math.cos(a) * 0.8,
            y: player.location.y + 1.5,
            z: player.location.z + Math.sin(a) * 0.8
          });
        }
      } catch (e) {}
    }

    if (ticks <= 1) {
      player.sendMessage('§7The voices creep back in...');
    }
  }

  static _spawnSuppressEffect(player) {
    const loc = player.location;
    const dim = player.dimension;
    for (let i = 0; i < 20; i++) {
      const delay = i * 3;
      const angle = (i / 20) * Math.PI * 4; // spiral inward
      const r     = 2 - (i / 20) * 1.5;
      system.runTimeout(() => {
        try {
          dim.spawnParticle('minecraft:end_rod', {
            x: loc.x + Math.cos(angle) * r,
            y: loc.y + 1 + (i * 0.05),
            z: loc.z + Math.sin(angle) * r
          });
        } catch (e) {}
      }, delay);
    }
  }

  // =============================================
  // ABILITY HANDLER
  // =============================================
  static handleAbilityUse(player, abilityId) {
    // Inherited Seq 9 abilities
    if (abilityId === this.ABILITIES.DIVINATION ||
        abilityId === this.ABILITIES.ENCHANTMENT_INSCRIPTION ||
        abilityId === this.ABILITIES.AURA_READING) {
      return SecretsSuppliantSequence.handleAbilityUse(player, abilityId);
    }

    switch (abilityId) {
      case this.ABILITIES.FOCUSED_LISTEN:
        return this.useFocusedListen(player);
      case this.ABILITIES.SUPPRESS_VOICES:
        return this.useSuppressVoices(player);
      default:
        player.sendMessage('§cUnknown ability!');
        return false;
    }
  }

  // =============================================
  // COOLDOWN HELPERS
  // =============================================
  static _tickCooldowns(player) {
    const n    = player.name;
    const tick = v => (v > 0 ? v - 1 : 0);
    const fc   = this.focusedListenCooldowns.get(n); if (fc) this.focusedListenCooldowns.set(n, tick(fc));
    const sc   = this.suppressCooldowns.get(n);      if (sc) this.suppressCooldowns.set(n, tick(sc));
    // Also tick inherited cooldowns
    SecretsSuppliantSequence.tickCooldowns(player);
  }

  static _cdRemaining(map, player) {
    const v = map.get(player.name) || 0;
    return v > 0 ? Math.ceil(v / 20) : 0;
  }

  // =============================================
  // ABILITY DESCRIPTIONS
  // =============================================
  static getAbilityDescription(abilityId) {
    const descs = {
      [this.ABILITIES.FOCUSED_LISTEN]:
        `§dCost: ${this.FOCUSED_LISTEN_SPIRIT_COST} Spirit | CD: 20s\n§7Channel the voices for 10s — 80m scan, reveals hidden entities\n§4Warning: increases madness`,
      [this.ABILITIES.SUPPRESS_VOICES]:
        `§dCost: ${this.SUPPRESS_SPIRIT_COST} Spirit | CD: 30s\n§7Suppress the whispers — halves madness rate for 15s\n§bAlso clears active debuffs and reduces madness by 8`,
    };
    return descs[abilityId] || SecretsSuppliantSequence.getAbilityDescription(abilityId);
  }

  static getAllAbilities() {
    return [
      { id: this.ABILITIES.FOCUSED_LISTEN,   name: '§5👂 Focused Listen',    cost: this.FOCUSED_LISTEN_SPIRIT_COST },
      { id: this.ABILITIES.SUPPRESS_VOICES,  name: '§b🌀 Suppress Voices',   cost: this.SUPPRESS_SPIRIT_COST },
      ...SecretsSuppliantSequence.getAllAbilities()
    ];
  }

  // =============================================
  // STATIC: reduce madness from Spirit Restoration Potion
  // Called from main.js in itemCompleteUse
  // =============================================
  static onSpiritPotionDrank(player) {
    const pathway  = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    if (pathway !== this.PATHWAY || sequence > this.SEQUENCE_NUMBER) return;

    const prev     = this.getMadness(player);
    const newVal   = this.setMadness(player, prev - this.MADNESS_POTION_REDUCTION);
    player.sendMessage(
      `§bThe potion calms your mind. Madness: §d${Math.floor(prev)} §7→ §d${Math.floor(newVal)}`
    );
  }

  // =============================================
  // CLEAN UP
  // =============================================
  static removeEffects(player) {
    SecretsSuppliantSequence.removeEffects(player);
    this.focusedListenActive.delete(player.name);
    this.focusedListenCooldowns.delete(player.name);
    this.suppressActive.delete(player.name);
    this.suppressCooldowns.delete(player.name);
    this.selectedAbilities.delete(player.name);
    // Note: madness persists via dynamic property even after removing effects
    // This is intentional — you can't just "recover" by changing pathway
  }
}
