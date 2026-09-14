export class ShieldSystem {
    static registerEvents() {}

    // Also covers the Inscribed Steel Sword's passive "Warding" defense —
    // both are held-item checks feeding into one Resistance amplifier
    // rather than two independent blocks, since Bedrock won't apply a
    // weaker instance of an effect while a stronger one is still active
    // (see LOTM_COMPREHENSIVE_SUMMARY's Key Lessons) — computing a single
    // wantedAmplifier here sidesteps that trap for free.
    static tick(player) {
        const equip = player.getComponent('minecraft:equippable');
        const mainHand = equip?.getEquipment('Mainhand');
        const offHand  = equip?.getEquipment('Offhand');
        const hasShield = mainHand?.typeId === 'lotm:slayers_kite_shield'
                       || offHand?.typeId  === 'lotm:slayers_kite_shield';
        const hasInscribedSword = mainHand?.typeId === 'lotm:inscribed_steel_sword'
                               || offHand?.typeId  === 'lotm:inscribed_steel_sword';

        if (!hasShield && !hasInscribedSword) return;

        const wantedAmplifier = hasShield ? 3 : 1; // Shield: Resistance IV, Sword alone: Resistance II

        // Also re-apply if another system set a lower amplifier that's blocking us.
        const res = player.getEffect('resistance');
        if (!res || res.amplifier < wantedAmplifier || res.duration < 200) {
            player.addEffect('resistance', 600, { amplifier: wantedAmplifier, showParticles: false });
        }
    }
}
