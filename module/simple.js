/**
 * A simple and flexible system for world-building using an arbitrary collection of character and item attributes
 * Author: Atropos
 */

//TODO add player note and gm note on actor sheet and item sheet

// Import Modules
import { SimpleActor, CharacterActor, ZombieActor, ChestActor } from "./actor.js";
import { CharacterData, ZombieData, ChestData, SimpleItemData } from "./data-models.js";
import { SimpleItem } from "./item.js";
import { SimpleItemSheet } from "./sheet/item-sheet.js";
import { CharacterActorSheet } from "./sheet/actor-sheet.js";
import { ZombieActorSheet } from "./sheet/zombie-sheet.js";
import { ChestActorSheet } from "./sheet/chest-sheet.js";
import { RollDialog } from "./roll-dialog.js";
import { preloadHandlebarsTemplates } from "./templates.js";
import { SimpleToken, MonsterToken, SimpleTokenDocument, SimpleTokenRuler } from "./token.js";
import { PathfinderHelper } from "./pathfinderHelper.js";
import { INJURY_REASONS } from "./constants.js";
import { NoiseDiceDialog } from "./noise-dice-dialog.js";

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

/**
 * Init hook.
 */
Hooks.once("init", async function () {
  console.log(`Initializing Explosive Zombie System`);

  /**
   * Set an initiative formula for the system. This will be updated later.
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: "1d20",
    decimals: 2
  };

  game.explosiveZombie = {
    SimpleActor,
    CharacterActor,
    ZombieActor,
    ChestActor,
    ZombieActorSheet,
    ChestActorSheet,
    RollDialog,
    NoiseDiceDialog,
    SimpleToken,
    MonsterToken,
    PathfinderHelper,
    useAction: (count = 1, tokens) => SimpleToken.useActionForSelected(count, tokens),
    resetActions: (tokens) => SimpleToken.resetActionsForSelected(tokens),
    spawnZombies: (count = 1, scene, sourceActor) => ZombieActor.spawnZombies(count, scene, sourceActor)
  };

  // Define custom Document classes and DataModels
  CONFIG.Actor.documentClass = SimpleActor;
  CONFIG.Actor.dataModels = {
    character: CharacterData,
    zombie: ZombieData,
    chest: ChestData
  };
  CONFIG.Item.documentClass = SimpleItem;
  CONFIG.Item.dataModels = {
    item: SimpleItemData
  };
  CONFIG.Token.documentClass = SimpleTokenDocument;
  CONFIG.Token.objectClass = SimpleToken;
  CONFIG.Token.rulerClass = SimpleTokenRuler;

  // Register sheet application classes
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("explosive-zombie", CharacterActorSheet, { types: ["character"], makeDefault: true, label: "characterSheet.sheetTitle" });
  foundry.documents.collections.Actors.registerSheet("explosive-zombie", ZombieActorSheet, { types: ["zombie"], makeDefault: true, label: "zombieSheet.sheetTitle" });
  foundry.documents.collections.Actors.registerSheet("explosive-zombie", ChestActorSheet, { types: ["chest"], makeDefault: true, label: "chestSheet.sheetTitle" });
  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  foundry.documents.collections.Items.registerSheet("explosive-zombie", SimpleItemSheet, { makeDefault: true });

  // Register default Zombie Actor setting (name, ID, or UUID).
  game.settings.register("explosive-zombie", "defaultZombieActorUuid", {
    name: "SETTINGS.DefaultZombieActor.name",
    hint: "SETTINGS.DefaultZombieActor.hint",
    scope: "world",
    type: String,
    config: true,
    requiresReload: false
  });

  // Register minimum zombie spawn distance setting (in grid units / cells).
  game.settings.register("explosive-zombie", "minZombieSpawnDistance", {
    name: "SETTINGS.MinZombieSpawnDistance.name",
    hint: "SETTINGS.MinZombieSpawnDistance.hint",
    scope: "world",
    type: Number,
    default: 6,
    config: true,
    requiresReload: false
  });

  Handlebars.registerHelper('firstLetter', function (value) {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const labelKey = INJURY_REASONS[trimmed];
    const localized = labelKey ? game.i18n.localize(labelKey) : trimmed;
    return (localized || trimmed).trim().charAt(0).toUpperCase();
  });

  Handlebars.registerHelper('repeat', function (count, options) {
    let result = '';
    for (let i = 0; i < count; i++) {
      result += options.fn({
        index: i,
        total: count
      });
    }
    return result;
  });

  // Preload template partials
  await preloadHandlebarsTemplates();
});

/**
 * Automatically open / update the noise dice dialog on each scene load
 */
Hooks.on("canvasReady", (canvas) => {
  if (canvas.scene) {
    NoiseDiceDialog.onCanvasReady(canvas.scene);
  }
});

/**
 * Use this to propagate change without socket
 */
Hooks.on("updateScene", (scene, change, options, userId) => {
  NoiseDiceDialog.onUpdateScene(scene, change);
});

/**
 * Inject GM-only zombie spawn button onto Noise Dice roll chat messages.
 */
Hooks.on("renderChatMessageHTML", async (message, html) => {
  await NoiseDiceDialog.onRenderChatMessage(message, html);
});
/**
 * Ensure dialog is rendered once the world is ready if canvas is already loaded
 */
Hooks.once("ready", () => {
  if (canvas?.ready && canvas?.scene) {
    NoiseDiceDialog.onCanvasReady(canvas.scene);
  }
});

/**
 * Add a toggle in the Token scene controls to restrict selection to monster tokens (Zombies).
 */
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM) return;

  const orderIndex = Object.keys(controls.tokens.tools).length;

  controls.tokens.tools.selectMonstersOnly = {
    name: "selectMonstersOnly",
    title: game.i18n.localize("tokenControls.selectMonstersOnly"),
    icon: "fas fa-skull",
    toggle: true,
    active: SimpleToken.selectMonstersOnly,
    visible: Boolean(game.user?.isGM),
    order: orderIndex,
    onChange: (event, active) => {
      const isActive = typeof active === "boolean" ? active : Boolean(event);
      SimpleToken.setSelectMonstersOnly(isActive);
    }
  };

  controls.tokens.tools.enablePathfinding = {
    name: "enablePathfinding",
    title: game.i18n.localize("tokenControls.enablePathfinding"),
    icon: "fas fa-route",
    toggle: true,
    active: PathfinderHelper.enabled,
    visible: Boolean(game.user?.isGM),
    order: orderIndex + 1,
    onChange: (event, active) => {
      const isActive = typeof active === "boolean" ? active : Boolean(event);
      PathfinderHelper.setEnabled(isActive);
    }
  };
});

/**
 * Refresh monster movement highlight border when a token moves or an actor's speed changes.
*/
Hooks.on("moveToken", (tokenDoc) => {
  if (game.user?.isGM && SimpleToken.selectMonstersOnly && tokenDoc?.object instanceof MonsterToken) {
    tokenDoc.object.renderFlags?.set({ refreshBorder: true, refreshState: true });
  }
});

Hooks.on("updateActor", (actor) => {
  if (!game.user?.isGM || !SimpleToken.selectMonstersOnly || !canvas?.tokens) return;
  for (const token of actor.getActiveTokens()) {
    if (token instanceof MonsterToken) {
      token.renderFlags.set({ refreshBorder: true });
    }
  }
});

/**
 * Reset used non-movement actions on each combat round and when combat ends.
 */
Hooks.on("updateCombat", (combat, changed) => {
  if (changed.round !== undefined) {
    SimpleToken.resetAllUsedActions(combat?.scene ?? canvas?.scene);
  }
});

Hooks.on("deleteCombat", (combat) => {
  SimpleToken.resetAllUsedActions(combat?.scene ?? canvas?.scene);
});


