export class ShieldSystem {
    static registerEvents() {}

    static tick(player) {
        const equip = player.getComponent('minecraft:equippable');
        const mainHand = equip?.getEquipment('Mainhand');
        const offHand  = equip?.getEquipment('Offhand');
        const hasShield = mainHand?.typeId === 'lotm:slayers_kite_shield'
                       || offHand?.typeId  === 'lotm:slayers_kite_shield';

        if (!hasShield) return;

        // Apply Resistance IV while shield is equipped.
        // Also re-apply if another system set a lower amplifier that's blocking us.
        const res = player.getEffect('resistance');
        if (!res || res.amplifier < 3 || res.duration < 200) {
            player.addEffect('resistance', 600, { amplifier: 3, showParticles: false });
        }
    }
}
