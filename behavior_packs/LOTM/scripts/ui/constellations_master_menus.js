import { world } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';
import { ConstellationsMasterSequence } from '../sequences/hermit/constellations_master.js';

export class ConstellationsMasterMenus {
  /**
   * Show the main ability selection menu.
   * Called when player Sneak+RC the constellations_tome item.
   */
  static showAbilityMenu(player) {
    const form = new ActionFormData()
      .title('§b✦ Constellations Master')
      .body('§7The stars bend to your will.\n§7Select an ability to cast:');

    const abilities = ConstellationsMasterSequence.getAllAbilities();
    for (const ability of abilities) {
      form.button(`§b${ability.name}\n§7${ability.desc}`);
    }
    form.button('§7Cancel');

    form.show(player).then(result => {
      if (result.canceled || result.selection === abilities.length) return;
      const selected = abilities[result.selection];
      // Store selected ability for RC casting
      player.setDynamicProperty('lotm:constellations_selected', selected.id);
      player.sendMessage(`§bSelected: §f${selected.name}`);
    }).catch(e => {});
  }

  /**
   * Show the Warlock spell sub-menu (re-used from warlock menus style).
   * Allows switching the selected warlock spell — now cast without powder.
   */
  static showWarlockSpellMenu(player) {
    const spells = [
      { id: 'hand_of_force',  name: '§5Hand of Force',  desc: 'Telekinesis grab' },
      { id: 'exorcism',       name: '§5Exorcism',        desc: 'Undead flee + weakness' },
      { id: 'flames',         name: '§cFlames',          desc: 'Fire bolt (8dmg)' },
      { id: 'purification',   name: '§ePurification',    desc: 'AOE cleanse + heal' },
      { id: 'lightning',      name: '§eLightning',       desc: 'Raycast lightning' },
      { id: 'sea_wave',       name: '§9Sea Wave',        desc: 'Water breathing + speed' },
      { id: 'earth_wall',     name: '§aEarth Wall',      desc: '3×3 cobblestone wall' },
      { id: 'ore_sense',      name: '§6Ore Sense',       desc: 'Locate all ore types' },
      { id: 'tunnel',         name: '§8Tunnel',          desc: '3×3×3 block removal' }
      // { id: 'slow_fall',      name: '§6Slow Fall',       desc: 'fall slowly' },
      // { id: 'earth_spike',         name: '§8Earth Spikes',          desc: 'Earth Spikes' },
    ];

    const form = new ActionFormData()
      .title('§5✦ Warlock Spells (No Powder)')
      .body('§7At Sequence 5, you cast spells through gesture alone.\n§7Select a spell — no powder needed, extra spirit cost:');

    for (const spell of spells) {
      form.button(`${spell.name}\n§7${spell.desc}`);
    }
    form.button('§7Cancel');

    form.show(player).then(result => {
      if (result.canceled || result.selection === spells.length) return;
      const selected = spells[result.selection];
      player.setDynamicProperty('lotm:warlock_selected_spell', selected.id);
      player.sendMessage(`§5Selected spell: §f${selected.name}`);
    }).catch(e => {});
  }
}
