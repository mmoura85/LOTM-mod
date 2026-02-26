import { ActionFormData, MessageFormData } from '@minecraft/server-ui';
import { MidnightPoetSequence } from '../sequences/darkness/midnight_poet.js';
import { NightmareSequence } from '../sequences/darkness/nightmare.js';
import { PathwayManager } from '../core/pathwayManager.js';

export class DarknessPathwayMenus {
  /**
   * Show Midnight Poet song selection menu
   */
  static async showPoetSongMenu(player) {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    // Allow both Midnight Poet (Seq 8) and Nightmare (Seq 7)
    if (pathway !== 'darkness' || (sequence !== 8 && sequence !== 7)) {
      player.sendMessage('§cYou must be a Midnight Poet or Nightmare to use this!');
      return;
    }
    
    const songs = MidnightPoetSequence.getAllSongs();
    const selectedSong = MidnightPoetSequence.getSelectedSong(player);
    
    const form = new ActionFormData()
      .title('§5Midnight Poet\'s Songs')
      .body('§7Select a song to set as default.\n§7Left-click to sing the default song.\n§7Right-click to open this menu.\n\n§7Current: §e' + this.getSongName(selectedSong));
    
    for (const song of songs) {
      const isSelected = song.id === selectedSong;
      const marker = isSelected ? '§a✓ ' : '';
      
      form.button(
        `${marker}${song.name}\n§7${song.description} §8| §e${song.cost} Spirit`,
        'textures/items/book_writable'
      );
    }
    
    form.button('§cSing Now\n§7Perform selected song', 'textures/ui/sound_glyph_color_2x');
    form.button('§7Cancel', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    if (response.selection < songs.length) {
      // Selected a song to set as default
      const song = songs[response.selection];
      MidnightPoetSequence.setSelectedSong(player, song.id);
      player.sendMessage(`§aSet default song to: ${song.name}`);
      player.playSound('random.orb', { pitch: 1.2, volume: 0.5 });
      
      // Reopen menu
      this.showPoetSongMenu(player);
    } else if (response.selection === songs.length) {
      // Sing Now button
      MidnightPoetSequence.useSelectedSong(player);
    }
  }
  
  /**
   * Show Nightmare Powers ability menu
   */
  static async showNightmarePowersMenu(player) {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway !== 'darkness' || sequence !== 7) {
      player.sendMessage('§cYou must be a Nightmare (Sequence 7) to use this!');
      return;
    }
    
    const abilities = NightmareSequence.getAllAbilities();
    const selectedAbility = NightmareSequence.getSelectedAbility(player);
    
    // Check cooldowns
    const nightmareStateCd = NightmareSequence.nightmareCooldowns.get(player.name) || 0;
    const dreamInvasionCd = NightmareSequence.dreamInvasionCooldowns.get(player.name) || 0;
    const nightmareLimbsCd = NightmareSequence.nightmareLimbsCooldowns.get(player.name) || 0;
    
    const form = new ActionFormData()
      .title('§5Nightmare Powers')
      .body('§7Select an ability to set as default.\n§7Left-click to use the default ability.\n§7Right-click to open this menu.\n\n§7Current: §e' + this.getAbilityName(selectedAbility));
    
    for (const ability of abilities) {
      const isSelected = ability.id === selectedAbility;
      const marker = isSelected ? '§a✓ ' : '';
      
      let cooldownText = '';
      if (ability.id === NightmareSequence.ABILITIES.NIGHTMARE_STATE && nightmareStateCd > 0) {
        cooldownText = ` §c(${Math.ceil(nightmareStateCd / 20)}s)`;
      } else if (ability.id === NightmareSequence.ABILITIES.DREAM_INVASION && dreamInvasionCd > 0) {
        cooldownText = ` §c(${Math.ceil(dreamInvasionCd / 20)}s)`;
      } else if (ability.id === NightmareSequence.ABILITIES.NIGHTMARE_LIMBS && nightmareLimbsCd > 0) {
        cooldownText = ` §c(${Math.ceil(nightmareLimbsCd / 20)}s)`;
      }
      
      form.button(
        `${marker}${ability.name}${cooldownText}\n§7${ability.description} §8| §e${ability.cost} Spirit`,
        ability.icon
      );
    }
    
    form.button('§cUse Now\n§7Activate selected ability', 'textures/ui/automation_glyph');
    form.button('§7Cancel', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    if (response.selection < abilities.length) {
      // Selected an ability to set as default
      const ability = abilities[response.selection];
      NightmareSequence.setSelectedAbility(player, ability.id);
      player.sendMessage(`§aSet default ability to: ${ability.name}`);
      player.playSound('random.orb', { pitch: 1.2, volume: 0.5 });
      
      // Reopen menu
      this.showNightmarePowersMenu(player);
    } else if (response.selection === abilities.length) {
      // Use Now button
      NightmareSequence.useSelectedAbility(player);
    }
  }
  
  /**
   * Get display name for song ID
   */
  static getSongName(songId) {
    const songs = {
      'song_of_fear': 'Song of Fear',
      'song_of_pacification': 'Song of Pacification',
      'song_of_cleansing': 'Song of Cleansing'
    };
    return songs[songId] || 'Unknown';
  }
  
  /**
   * Get display name for ability ID
   */
  static getAbilityName(abilityId) {
    const abilities = {
      'nightmare_state': 'Nightmare State',
      'dream_invasion': 'Dream Invasion',
      'nightmare_limbs': 'Nightmare Limbs'
    };
    return abilities[abilityId] || 'Unknown';
  }
}
