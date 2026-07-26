# Lord of the Mysteries — Minecraft Bedrock Addon

A Minecraft Bedrock addon based on the web novel *Lord of the Mysteries* by Cuttlefish That Loves Diving. Adds beyonder pathways, sequences, abilities, custom items, mobs, blocks, and world generation.

---

## Dev Environment

| Path | Purpose |
|---|---|
| `development_behavior_packs/LOTM/` | All gameplay logic — edit here, NOT in LOTM-mod |
| `development_resource_packs/LOTM/` | Textures, models, sounds, animations |
| `C:\workspace\LOTM-mod\` | Git repo (sync from dev packs after changes) |
| `C:\workspace\textures\` | Staging folder — drop new textures here, then copy to dev pack |

**Script API version:** `@minecraft/server` 1.9.0

---

## Beyonder Pathways

Each pathway has Sequences 9 → 4 (lowest = most powerful). Drinking a potion advances you.

| Pathway | Sequences (9 → 4) | Notes |
|---|---|---|
| **Darkness** | Sleepless → Midnight Poet → Nightmare → Soul Assurer | — |
| **Death** | Corpse Collector → Gravedigger → Spirit Medium | — |
| **Door** | Apprentice → Trickmaster → Astrologer → Scribe → Traveler → Secrets Sorcerer | — |
| **Twilight Giant** | Warrior → Pugilist → Weapon Master → Dawn Paladin → Guardian → Demon Hunter | — |
| **Sun** | Bard → Light Suppliant | — |
| **Hanged Man** | Secrets Suppliant → Listener → Shadow Ascetic → Rose Bishop → Shepherd | — |
| **Hermit** | Mystery Pryer → Melee Scholar → Warlock → Scroll Professor → Constellations Master → Mysticologist | — |
| **Seer** | Seer → Clown → Magician | — |
| **Justiciar** | Arbiter → Sheriff → Interrogator → Judge → Disciplinary Paladin → Imperative Mage | — |
| **Red Priest** | TBD | Planned |
| **Moon (Vampire)** | TBD | Seq 7 planned |

---

## Crafting Recipes — Key Rules

- All sequence potion recipes use `minecraft:recipe_shapeless`
- Each recipe **requires the matching characteristic** as an ingredient + unlock trigger
- Previous-tier potion is NOT required as an ingredient (it is consumed when you drink it)
- Characteristics drop from mobs as `lotm:raw_characteristic` and are processed at the Alloy Forge

---

## Custom Blocks

### Rope Ladder (`lotm:rope_ladder`)
- Place against a **wall side face** — will not activate if placed on top of a block
- Automatically extends downward until the wall ends or hits a solid block
- Breaking the top rung cascades-removes all rungs below
- Implemented via Script API: on place, replaces itself with `minecraft:ladder` (bypasses vanilla wall-support placement restrictions)
- Recipe: `S S / I I / S S` (S = string, I = stick) → 2 rope ladders
- **Limitation:** only extends as far as the wall continues — free-hanging in open air will not work (vanilla ladders require wall support to survive)

### Alloy Forge (`lotm:alloy_forge`)
- Custom smelting block for processing ores and materials

### Plants (12 varieties)
World-spawning harvestable plants. Break to collect 1–3 of the harvest item. No farming system.

| Block | Harvest Drop | Biome |
|---|---|---|
| Azurewort | Azurewort Sprig | Forest |
| Crimson Sage | Sage Leaf | Plains |
| Dewdrop Lotus | Lotus Petal | Swamp |
| Emberbud | Emberbud Ash | Nether |
| Ghostweed | Ghost Blossom | Swamp |
| Moonflower | Moonflower Petal | Plains |
| Nightshade Herb | Nightshade Berry | Taiga |
| Silver Fern | Silver Frond | Taiga |
| Stargrass | Stargrass Seed | Plains |
| Verdant Thistle | Thistle Spike | Savanna |
| Voidmoss | Voidmoss Clump | Nether |
| Witchgrass | Witchgrass Tuft | Swamp |

> Plants only generate in **new chunks**. Existing chunks won't update.

### Graveyard Blocks
Decorative grave cross, headstone, slab, and dirt — used in graveyard structure generation.

### Star Bridge Block, Transfiguration Portal Block
Used by specific pathway abilities (Traveler, Secrets Sorcerer).

---

## Custom Mobs

| Mob | Notes |
|---|---|
| **Ogre** | Iron golem base, 100 HP, 14 dmg, drops iron ingots or raw characteristic. Spawns at night. Item-in-hand visual does NOT work (iron golem geometry incompatible with Bedrock's item rendering). |
| **Rimewraith** | Ranged mob, fires `lotm:flesh_orb` (10 dmg). 160 HP. |
| **Rampager** | Boss-tier mob with script-controlled behavior. |
| **Voidwatcher** | Rampager variant. |
| **Clown** | Beyonder mob, retaliates when hit. |
| **Brown Bear** | Infects player on hit (nausea/weakness/slowness/hunger). |
| **Wisp** | Bondable companion (WIP). |

---

## Custom Items — Key Types

- **Characteristics** (`lotm:{pathway}_characteristic_seq{N}`) — dropped/crafted, used in potion recipes
- **Pathway potions** (`lotm:{pathway}_potion_seq{N}`) — drink to advance sequence
- **Ability items** — wands, tomes, orbs, seals that trigger abilities on right-click
- **Crafting materials** — `lotm:raw_silver`, `lotm:raw_tin`, `lotm:steel_ingot`, `lotm:bronze_ingot`, `lotm:voidsteel_ingot`
- **Plant drops** — see Plants table above
- **Spirit items** — `lotm:spirit_vial`, `lotm:spirit_expansion_potion`, `lotm:spirit_restoration_potion`
- **Weapons** — Cudgel (9 dmg), Steel sword/axe/hoe/shovel/pickaxe, Dawn sword, Short sword, Paper knife, Revolver, Spear of Longinus

---

## World Generation

| Feature | Biome | Notes |
|---|---|---|
| Silver ore | Overworld | y -25 to 35, replaces stone/deepslate/tuff |
| Tin ore | Overworld | Similar to silver |
| Small graveyard | Overworld | Structure |
| Small-medium graveyard | Overworld | Structure |
| Abandoned tower | Overworld | Structure |
| Ruined abandoned tower | Overworld | Structure |
| Secrets Suppliant hideout | Underground | Spawns at heightmap−7, 1/500 chance. **Needs void block rework** to prevent terrain corruption. |
| 12 plant types | Various biomes | See Plants table |

---

## Technical Gotchas

### Blocks
- `minecraft:climbable: {}` is **experimental** in 1.21.100 — using it silently prevents the entire block from registering (won't appear in creative). Do not use.
- `minecraft:selection_box` in permutations is **automatically rotated** by `minecraft:transformation`. Never manually provide per-permutation rotated coordinates — it double-rotates.
- Block display names use **lang keys** (`tile.lotm:block_id.name=Display Name`), NOT `minecraft:display_name`.
- Custom block components (`lotm:plant_growth` etc.) MUST be registered in `system.beforeEvents.startup` BEFORE the world loads — it's the only place this subscriber is valid.
- `format_version: "1.26.0"` required for custom block components and some newer block components (`minecraft:liquid_detection`, `minecraft:movable`).
- `terrain_texture.json` and `item_texture.json` must be **read before editing** (the Edit tool requires a prior Read).

### Mobs
- `minecraft:burns_in_daylight: false` does **NOT** work for mobs with `runtime_identifier: "minecraft:zombie"` — the burn is hardcoded. Use `minecraft:fire_immune: true` instead.
- Item-in-hand rendering requires: `enable_attachables: true` in client entity, `rightItem` locator on the arm bone, bone names matching the humanoid skeleton (`rightArm`/`leftArm`), and a compatible render controller. Iron golem geometry is fundamentally incompatible — would require a full geometry rebuild.

### Recipes
- Damage tooltip on items requires `format_version: "1.21.0"` AND `"minecraft:icon": "item_name"` as a **string** (not `{"texture": "item_name"}`).

### Scripts
- `system.run()` is required to wrap `dimension.setBlockPermutation()` calls inside event callbacks — world mutations must be deferred out of the event.
- `world.afterEvents.playerPlaceBlock` — `event.face` gives the clicked face as a Direction string.
- Rope ladder: `event.face` can be `'up'`/`'down'` if the player places on a flat surface — these are invalid for ladders and must be caught and cancelled.

### Structures
- Feature rules are **disabled** by adding `.disabled` extension to the file. Re-enable by removing it.
- Structures need **void blocks** around underground generation to prevent terrain corruption.

### Blockbench
- Always check every bone for a valid `binding` field in attachable exports. Missing/invalid bindings cause geometry to render at the entity root. Valid LOTM player bone names: `'head'`, `'body'`, `'leftarm'`, `'rightarm'` (lowercase, no underscore).

---

## TODO

| Item | Status |
|---|---|
| Red Priest pathway | Not started |
| Moon pathway (Vampire, Seq 7) | Not started |
| Voidsteel weapons | Not started |
| Steel armor — medium helm, heavy set | In progress |
| Grapple hook (ODM gear) | Not started |
| Seal items | Future direction |
| Secrets Suppliant hideout void blocks | Needed |
| Ogre cudgel visual (humanoid bone rebuild) | Parked |
| Rope ladder — free-hanging in open air | Limitation (vanilla ladders need wall support) |
| Justiciar seq 4–6 potion recipes — add characteristics | Not done |
