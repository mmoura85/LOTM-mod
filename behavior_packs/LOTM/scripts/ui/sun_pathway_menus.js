import { ActionFormData, MessageFormData } from '@minecraft/server-ui';
import { BardSequence } from '../sequences/sun/bard.js';
import { LightSuppliantSequence } from '../sequences/sun/light_suppliant.js';
import { PathwayManager } from '../core/pathwayManager.js';

export class SunPathwayMenus {
  /**
   * Show Bard/Light Suppliant song selection menu
   */
  static async showBardSongMenu(player) {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    // Allow both Bard (Seq 9) and Light Suppliant (Seq 8)
    if (pathway !== 'sun' || (sequence !== 9 && sequence !== 8)) {
      player.sendMessage('§cYou must be a Bard or Light Suppliant to use this!');
      return;
    }
    
    // Get available songs based on sequence
    let songs;
    let selectedSong;
    
    if (sequence === 8) {
      // Light Suppliant has all songs including cleansing
      songs = LightSuppliantSequence.getAllSongs();
      selectedSong = BardSequence.getSelectedSong(player);
    } else {
      // Bard has basic songs
      songs = BardSequence.getAllSongs();
      selectedSong = BardSequence.getSelectedSong(player);
    }
    
    const form = new ActionFormData()
      .title('§6Bard\'s Songs')
      .body('§7Select a song to set as default.\n§7Left-click to sing the default song.\n§7Right-click to open this menu.\n\n§7Current: §e' + this.getSongName(selectedSong));
    
    for (const song of songs) {
      const isSelected = song.id === selectedSong;
      const marker = isSelected ? '§a✓ ' : '';
      
      form.button(
        `${marker}${song.name}\n§7${song.description} §8| §e${song.cost} Spirit`,
        'textures/items/book_writable'
      );
    }
    
    form.button('§6Sing Now\n§7Perform selected song', 'textures/ui/sound_glyph_color_2x');
    form.button('§7Cancel', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    if (response.selection < songs.length) {
      // Selected a song to set as default
      const song = songs[response.selection];
      BardSequence.setSelectedSong(player, song.id);
      player.sendMessage(`§aSet default song to: ${song.name}`);
      player.playSound('random.orb', { pitch: 1.2, volume: 0.5 });
      
      // Reopen menu
      this.showBardSongMenu(player);
    } else if (response.selection === songs.length) {
      // Sing Now button
      if (sequence === 8) {
        LightSuppliantSequence.handleAbilityUse(player, selectedSong);
      } else {
        BardSequence.useSelectedSong(player);
      }
    }
  }
  
  /**
   * Show Solar Orb ability menu (for Light Suppliant)
   */
  static async showSolarOrbMenu(player) {
    const pathway = PathwayManager.getPathway(player);
    const sequence = PathwayManager.getSequence(player);
    
    if (pathway !== 'sun' || sequence !== 8) {
      player.sendMessage('§cYou must be a Light Suppliant to use this!');
      return;
    }
    
    const form = new ActionFormData()
      .title('§eSolar Orb')
      .body('§7Channel the power of the sun:\n\n§7Select an ability to use:')
      .button('§e☀ Sunshine\n§7Create scorching sun (10s)', 'textures/items/solar_orb')
      .button('§6✦ Blessing\n§7Protect allies from evil', 'textures/items/solar_orb')
      .button('§e☼ Daytime\n§7Create spreading light (15s)', 'textures/items/solar_orb')
      .button('§7Cancel', 'textures/ui/cancel');
    
    const response = await form.show(player);
    
    if (response.canceled) return;
    
    switch (response.selection) {
      case 0: // Sunshine
        LightSuppliantSequence.useSunshine(player);
        break;
      case 1: // Blessing
        LightSuppliantSequence.useBlessing(player);
        break;
      case 2: // Daytime
        LightSuppliantSequence.useDaytime(player);
        break;
      case 3: // Cancel
        break;
    }
  }
  
  /**
   * Get display name for song ID
   */
  static getSongName(songId) {
    const songs = {
      'song_of_courage': 'Song of Courage',
      'song_of_strength': 'Song of Strength',
      'song_of_recovery': 'Song of Recovery',
      'song_of_cleansing': 'Song of Cleansing'
    };
    return songs[songId] || 'Unknown';
  }
}
