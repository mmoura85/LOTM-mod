// ============================================================================
// LOTM PLANT GROWTH COMPONENT — v4 final
// plant_growth.js → behavior_packs/LOTM/scripts/world/plant_growth.js
//
// WHY THIS CHANGED FROM v4:
//   system.beforeEvents.startup fires once when the script engine starts.
//   If this file is IMPORTED from main.js, that event has already fired
//   by the time the import executes — so self-registration silently fails
//   and Bedrock crashes when it finds an unregistered custom component
//   on any plant block in the world.
//
//   SOLUTION: Export a registerPlantGrowth(registry) function and call it
//   from INSIDE main.js's own system.beforeEvents.startup handler, which
//   is guaranteed to run at the right time.
//
// HOW TO USE IN MAIN.JS:
//
//   import { registerPlantGrowth } from './world/plant_growth.js';
//
//   system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
//     registerPlantGrowth(blockComponentRegistry);
//   });
//
// ============================================================================

import { EquipmentSlot, GameMode } from '@minecraft/server';

/**
 * Call this inside system.beforeEvents.startup.subscribe in main.js.
 * @param {import('@minecraft/server').BlockComponentRegistry} registry
 */
export function registerPlantGrowth(registry) {
  registry.registerCustomComponent('lotm:plant_growth', {

    /**
     * Random tick — advance growth stage.
     * NOTE: params is the SECOND argument, not part of the first.
     */
    onRandomTick({ block }, { params }) {
      try {
        const growthState = params?.growth_state   ?? 'lotm:growth_stage';
        const maxGrowth   = params?.max_growth      ?? 2;
        const minLight    = params?.min_light_level ?? 8;

        if (block.getLightLevel() < minLight) return;

        const perm  = block.permutation;
        const stage = perm.getState(growthState) ?? 0;

        if (stage >= maxGrowth) return;

        // ~1/5 chance per random tick
        if (Math.random() > 0.2) return;

        block.setPermutation(perm.withState(growthState, stage + 1));
      } catch (_) {}
    },

    /**
     * Bone meal / rapid fertilizer.
     * NOTE: params is the SECOND argument.
     */
    onPlayerInteract({ block, dimension, player }, { params }) {
      try {
        if (!player) return;

        const equippable = player.getComponent('minecraft:equippable');
        if (!equippable) return;

        const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
        if (!mainhand?.hasItem()) return;

        const hasBoneMeal        = mainhand.typeId === 'minecraft:bone_meal';
        const hasRapidFertilizer = mainhand.typeId === 'minecraft:rapid_fertilizer';
        if (!hasBoneMeal && !hasRapidFertilizer) return;

        const isCreative  = player.getGameMode() === GameMode.Creative;
        const growthState = params?.growth_state       ?? 'lotm:growth_stage';
        const maxGrowth   = params?.max_growth          ?? 2;
        const growthRange = params?.growth_on_fertilize ?? [1, 2];

        const perm  = block.permutation;
        const stage = perm.getState(growthState) ?? 0;

        if (stage >= maxGrowth) return;

        let newStage;
        if (hasRapidFertilizer || isCreative) {
          newStage = maxGrowth;
        } else {
          const add = growthRange[0] + Math.floor(Math.random() * (growthRange[1] - growthRange[0] + 1));
          newStage  = Math.min(stage + add, maxGrowth);
        }

        block.setPermutation(perm.withState(growthState, newStage));

        if (!isCreative && hasBoneMeal) {
          if (mainhand.amount > 1) mainhand.amount--;
          else mainhand.setItem(undefined);
        }

        const centre = block.center();
        dimension.playSound('item.bone_meal.use', centre);
        dimension.spawnParticle('minecraft:crop_growth_emitter', centre);
      } catch (_) {}
    }
  });
}
