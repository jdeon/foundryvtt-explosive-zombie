/**
 * A simple and flexible system for world-building using an arbitrary collection of character and item attributes
 * Author: Atropos
 */

// Import Modules
import { CharacterActor } from "./actor.js";
import { SimpleItem } from "./item.js";
import { SimpleItemSheet } from "./item-sheet.js";
import { CharacterActorSheet } from "./actor-sheet.js";
import { ZombieActorSheet } from "./zombie-sheet.js";
import { ChestActorSheet } from "./chest-sheet.js";
import { RollDialog } from "./roll-dialog.js";
import { preloadHandlebarsTemplates } from "./templates.js";
import { createWorldbuildingMacro } from "./macro.js";
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
  console.log(`Initializing Simple Worldbuilding System`);

  /**
   * Set an initiative formula for the system. This will be updated later.
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: "1d20",
    decimals: 2
  };

  game.explosiveZombie = {
    CharacterActor,
    ZombieActorSheet,
    ChestActorSheet,
    RollDialog,
    NoiseDiceDialog,
    SimpleToken,
    MonsterToken,
    PathfinderHelper,
    createWorldbuildingMacro,
    useAction: (count = 1, tokens) => SimpleToken.useActionForSelected(count, tokens),
    resetActions: (tokens) => SimpleToken.resetActionsForSelected(tokens)
  };

  // Define custom Document classes
  CONFIG.Actor.documentClass = CharacterActor;
  CONFIG.Item.documentClass = SimpleItem;
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

  // Register system settings
  game.settings.register("explosive-zombie", "macroShorthand", {
    name: "SETTINGS.SimpleMacroShorthandN",
    hint: "SETTINGS.SimpleMacroShorthandL",
    scope: "world",
    type: Boolean,
    default: true,
    config: true
  });

  // Register initiative setting.
  game.settings.register("explosive-zombie", "initFormula", {
    name: "SETTINGS.SimpleInitFormulaN",
    hint: "SETTINGS.SimpleInitFormulaL",
    scope: "world",
    type: String,
    default: "1d20",
    config: true,
    onChange: formula => _simpleUpdateInit(formula, true)
  });

  // Retrieve and assign the initiative formula setting.
  const initFormula = game.settings.get("explosive-zombie", "initFormula");
  _simpleUpdateInit(initFormula);

  /**
   * Update the initiative formula.
   * @param {string} formula - Dice formula to evaluate.
   * @param {boolean} notify - Whether or not to post nofications.
   */
  function _simpleUpdateInit(formula, notify = false) {
    const isValid = Roll.validate(formula);
    if (!isValid) {
      if (notify) ui.notifications.error(`${game.i18n.localize("notifications.initFormulaInvalid")}: ${formula}`);
      return;
    }
    CONFIG.Combat.initiative.formula = formula;
  }

  /**
   * Slugify a string.
   */
  Handlebars.registerHelper('slugify', function (value) {
    return value.slugify({ strict: true });
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
 * Macrobar hook.
 */
Hooks.on("hotbarDrop", (bar, data, slot) => createWorldbuildingMacro(data, slot));

/**
 * Adds the actor template context menu.
 */
Hooks.on("getActorDirectoryEntryContext", (html, options) => {

  // Define an actor as a template.
  options.push({
    name: game.i18n.localize("attributes.defineTemplate"),
    icon: '<i class="fas fa-stamp"></i>',
    condition: li => {
      const actor = game.actors.get(li.data("documentId"));
      return !actor.isTemplate;
    },
    callback: li => {
      const actor = game.actors.get(li.data("documentId"));
      actor.setFlag("explosive-zombie", "isTemplate", true);
    }
  });

  // Undefine an actor as a template.
  options.push({
    name: game.i18n.localize("attributes.unsetTemplate"),
    icon: '<i class="fas fa-times"></i>',
    condition: li => {
      const actor = game.actors.get(li.data("documentId"));
      return actor.isTemplate;
    },
    callback: li => {
      const actor = game.actors.get(li.data("documentId"));
      actor.setFlag("explosive-zombie", "isTemplate", false);
    }
  });
});

/**
 * Adds the item template context menu.
 */
Hooks.on("getItemDirectoryEntryContext", (html, options) => {

  // Define an item as a template.
  options.push({
    name: game.i18n.localize("attributes.defineTemplate"),
    icon: '<i class="fas fa-stamp"></i>',
    condition: li => {
      const item = game.items.get(li.data("documentId"));
      return !item.isTemplate;
    },
    callback: li => {
      const item = game.items.get(li.data("documentId"));
      item.setFlag("explosive-zombie", "isTemplate", true);
    }
  });

  // Undefine an item as a template.
  options.push({
    name: game.i18n.localize("attributes.unsetTemplate"),
    icon: '<i class="fas fa-times"></i>',
    condition: li => {
      const item = game.items.get(li.data("documentId"));
      return item.isTemplate;
    },
    callback: li => {
      const item = game.items.get(li.data("documentId"));
      item.setFlag("explosive-zombie", "isTemplate", false);
    }
  });
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
 * Ensure dialog is rendered once the world is ready if canvas is already loaded
 */
Hooks.once("ready", () => {
  if (canvas?.ready && canvas?.scene) {
    NoiseDiceDialog.onCanvasReady(canvas.scene);
  }
});

/**
 * Add a toggle in the Token scene controls to restrict selection to unlinked tokens (NPCs).
 */
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM) return;

  const orderIndex = Object.keys(controls.tokens.tools).length;

  controls.tokens.tools.selectUnlinkedOnly = {
    name: "selectUnlinkedOnly",
    title: game.i18n.localize("tokenControls.selectUnlinkedOnly"),
    icon: "fas fa-skull",
    toggle: true,
    active: SimpleToken.selectUnlinkedOnly,
    visible: Boolean(game.user?.isGM),
    order: orderIndex,
    onChange: (event, active) => {
      const isActive = typeof active === "boolean" ? active : Boolean(event);
      SimpleToken.setSelectUnlinkedOnly(isActive);
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
 * Refresh NPC movement highlight border when a token moves or an actor's speed changes.
*/
Hooks.on("moveToken", (tokenDoc) => {
  if (game.user?.isGM && SimpleToken.selectUnlinkedOnly && tokenDoc?.object instanceof MonsterToken) {
    tokenDoc.object.renderFlags?.set({ refreshBorder: true, refreshState: true });
  }
});

Hooks.on("updateActor", (actor) => {
  if (!game.user?.isGM || !SimpleToken.selectUnlinkedOnly || !canvas?.tokens) return;
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


