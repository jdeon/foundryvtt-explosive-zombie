# Changelog

All notable changes to the **Explosive Zombie** system for Foundry VTT will be documented in this file.

## [0.3.0] - 2026-11-15

### Added
- **Player & GM Notes**: Added a dedicated `Notes` tab across all Actor sheets (Character, Zombie, Chest) and the Item sheet, with a shared Player Notes field and a GM-only Notes field.
- **Noise Dice Dialog (#13)**: Added a persistent HUD dialog per scene to track and roll Noise Dice, with GM controls to increase, decrease, and reset noise.
- **Zombie Auto-Spawning (#19)**:
  - Added a GM spawn button on Noise Dice roll chat cards to automatically spawn zombies in the closest reachable grid cells outside of player vision.
  - Added drag-and-drop support on the chat card to customize which Zombie Actor is spawned.
  - Added world settings for the default Zombie Actor UUID (`defaultZombieActorUuid`) and minimum spawn distance from player tokens (`minZombieSpawnDistance`).
- **Monster Token Action & Movement Indicator (#15)**:
  - Added a GM scene control toggle (*Select Monster Tokens Only*) to restrict selection to Zombie tokens and highlight them with remaining action indicators (segmented circle arcs).
  - Automatic tracking and reset of used actions across combat rounds.
- **Token Pathfinding (#16)**: Added a GM scene control toggle (*Enable Token Pathfinding*) to automatically route token movement around walls and obstacles based on speed and available actions.

### Fixed
- **Sheet Form Refresh (#18)**: Fixed form input refresh issues and tab state preservation when editing Actor and Item sheets.

### Changed
- **Foundry VTT v13 Modernization & Architecture Refactor (#17)**:
  - Migrated data schemas from `template.json` to `TypeDataModel` classes (`CharacterData`, `ZombieData`, `ChestData`, `SimpleItemData`).
  - Introduced specialized `Actor` (`CharacterActor`, `ZombieActor`, `ChestActor`) and `Token` (`MonsterToken`) subclasses and moved domain methods out of sheet classes.
  - Consolidated shared Actor sheet logic into `BaseActorSheet` and organized sheet classes under `module/sheet/`.
  - Removed legacy unused attribute/group tabs and updated deprecated Foundry V12 globals to V13 namespaces.

---

## [0.2.0] - 2026-09-16

### Added
- **Explosive Dice Roll Dialog (#5)**: Added a custom `RollDialog` class for rolling explosive d6 checks with threshold and dice adjustments.
- **Item Active Effect Rolls (#7)**: Clicking an active effect row on an Item sheet opens a pre-filled `RollDialog` supporting stat formulas (e.g. `AGI`, `CON`, `MEN`, `SPD`) and variable ammo costs (`X`).
- **Item Ammunition Management (#9)**:
  - Added magazine capacity, loaded ammo, and remaining ammo tracking on items.
  - Left-clicking ammunition on the Item sheet consumes 1 loaded ammo; right-clicking reloads from remaining ammo and posts a reload card to chat.
- **Dialog Localization (#10)**: Added full English (`en`) and French (`fr`) translations for all dialogs and chat cards.

### Fixed
- Fixed stat value alignment on the Character sheet.
- Fixed long item names overflowing the Item sheet header.

---

## [0.1.0] - 2026-09-11

### Added
- **Custom Actor & Item Sheets (AppV2)**:
  - Designed custom **Character**, **Zombie**, **Chest**, and **Item** sheets migrated to Foundry VTT `ApplicationV2`.
  - Restricted `Form` and `Items` edit tabs to GM users so players only see the main `Sheet` view.
- **Inventory & Loot System**:
  - Slot-based inventory management (`Equipped`, `Belt`, `Backpack`, and `Small Items` free space overlay) linked to embedded Actor items.
  - Drag-and-drop support between inventory sections and opening item sheets directly from slots.
  - Dropping/removing an item from a character's inventory automatically spawns a nearby Loot Chest token (or adds to an existing adjacent chest) and posts a notification in chat.
- **Health & Armor System**:
  - Configurable health boxes with selectable injury reasons (Wound, Hunger, Bite, Zombification, Bleeding, Burn, Poison, Exhaustion).
  - Interactive armor boxes cycling through Unequipped, Equipped, and Broken states.
- **Compendium & CI**:
  - Added system Macro compendium pack and automated GitHub Actions release workflow.
- **Localization**: Added English (`en`) and French (`fr`) language support.
