import { EntitySheetHelper } from "./helper.js";
import { ATTRIBUTE_TYPES, STAT_MAPPING } from "./constants.js";
import { RollDialog } from "./roll-dialog.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Extend the basic ItemSheetV2 with custom tabbed sheet layout and effect management
 * @extends {ItemSheetV2}
 */
export class SimpleItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["explosive-zombie", "sheet", "item"],
    position: {
      width: 580,
      height: 620
    },
    tabGroups: {
      primary: "sheet"
    },
    form: {
      handler: SimpleItemSheet.#onSubmitForm,
      submitOnChange: true,
      closeOnSubmit: false
    }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: 'sheet', group: 'primary', label: 'SIMPLE.TabSheet' },
        { id: 'edit', group: 'primary', label: 'SIMPLE.TabEdit' },
        { id: 'attributes', group: 'primary', label: 'SIMPLE.TabAttributes' }
      ],
      initial: 'sheet'
    }
  };

  /** @override */
  static PARTS = {
    tabs: {
      template: "templates/generic/tab-navigation.hbs"
    },
    sheet: {
      template: "systems/explosive-zombie/templates/parts/item-tab-sheet.html",
      scrollable: [""]
    },
    edit: {
      template: "systems/explosive-zombie/templates/parts/item-tab-edit.html",
      scrollable: [""]
    },
    attributes: {
      template: "systems/explosive-zombie/templates/parts/item-tab-attributes.html",
      scrollable: [""]
    }
  };

  /**
   * Convenience getter for the Item document
   * @type {Item}
   */
  get item() {
    return this.document;
  }

  /* -------------------------------------------- */

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (!game.user?.isGM) {
      options.parts = ["sheet"];
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isGM = game.user?.isGM;
    context.item = this.document;
    context.data = this.document.toObject(false);
    context.system = context.data.system;
    context.systemData = context.data.system;
    context.dtypes = ATTRIBUTE_TYPES;

    EntitySheetHelper.getAttributeData(context);

    // Ensure array defaults exist safely
    if (!context.system.activeEffects) context.system.activeEffects = [];
    if (!context.system.passiveEffects) context.system.passiveEffects = [];

    context.imageUrl = context.system.imageUrl || context.data.img || "icons/svg/item-bag.svg";

    context.descriptionHTML = await TextEditor.enrichHTML(context.system.description || "", {
      secrets: this.document.isOwner,
      async: true
    });
    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    const html = $(this.element);

    // Active effect click to open prefilled RollDialog
    html.find(".active-effect-rollable").on("click", this._onActiveEffectRoll.bind(this));

    if (game.user?.isGM) {
      // Tab navigation click handling
      html.find('.sheet-tabs .item, [data-action="tab"]').on('click', ev => {
        ev.preventDefault();
        const tab = ev.currentTarget.dataset.tab;
        if (tab) this.changeTab(tab, "primary");
      });
    }

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Reduce loaded ammo on left click, reload on right click
    html.find('.item-munitions')
      .on('click', this._onClickMunitions.bind(this))
      .on('contextmenu', this._onRightClickMunitions.bind(this));

    // Effect management in Classic Form
    html.find('.effect-control').click(this._onEffectControl.bind(this));

    // Attribute Management
    html.find(".attributes").on("click", ".attribute-control", EntitySheetHelper.onClickAttributeControl.bind(this));
    html.find(".groups").on("click", ".group-control", EntitySheetHelper.onClickAttributeGroupControl.bind(this));
    html.find(".attributes").on("click", "a.attribute-roll", EntitySheetHelper.onAttributeRoll.bind(this));

    // Add draggable for Macro creation
    html.find(".attributes a.attribute-roll").each((i, a) => {
      a.setAttribute("draggable", true);
      a.addEventListener("dragstart", ev => {
        let dragData = ev.currentTarget.dataset;
        ev.dataTransfer.setData('text/plain', JSON.stringify(dragData));
      }, false);
    });
  }

  /**
   * Handle click on active effect row to open prefilled RollDialog
   * @param {Event} event
   * @private
   */
  _onActiveEffectRoll(event) {
    event.preventDefault();
    const row = event.currentTarget.closest(".active-effect-rollable");
    if (!row) return;

    const actor = this.item.actor || canvas.tokens?.controlled[0]?.actor || game.user?.character;

    const rawDice = row.dataset.dice;
    const rawThreshold = row.dataset.threshold;
    const rawAmmoCost = row.dataset.ammo;

    const diceNumber = this._resolveStatValue(rawDice, actor, 1);
    const threshold = this._resolveStatValue(rawThreshold, actor, 4);
    const ammoCost = Number(row.dataset.ammo)

    new RollDialog(diceNumber, threshold, {
      item: this.item,
      ammoCost,
      window: {
        title: this.item.name
      }
    }).render(true);
  }

  /**
   * Resolve a raw stat formula or string (e.g. "AGI", "AGI + 1", "AGI + CON", "3") to a numeric value.
   * Handles flat numbers, stat references, and basic arithmetic (+, -, *, /).
   * @param {string|number} rawValue
   * @param {Actor} [actor]
   * @param {number} [defaultValue=1]
   * @returns {number}
   * @private
   */
  _resolveStatValue(rawValue, actor, defaultValue = 1) {
    if (rawValue === undefined || rawValue === null) return defaultValue;
    const str = String(rawValue).trim();
    if (!str) return defaultValue;

    // Direct single number check
    const numericDirect = Number(str);
    if (!isNaN(numericDirect)) return numericDirect;

    const stats = actor?.system?.stats || {};
    let formula = str;

    // Replace stat tokens (AGI, MEN, CON, SPD, etc.) with values from actor.system.stats
    const statKeys = Object.keys(STAT_MAPPING).sort((a, b) => b.length - a.length);
    for (const key of statKeys) {
      const prop = STAT_MAPPING[key];
      const val = (stats[prop] !== undefined && !isNaN(Number(stats[prop]))) ? Number(stats[prop]) : 0;
      const regex = new RegExp(`\\b${key}\\b`, "gi");
      formula = formula.replace(regex, String(val));
    }

    // Try evaluating with Foundry's Roll engine if deterministic
    try {
      const roll = new Roll(formula);
      if (roll.isDeterministic) {
        roll.evaluateSync();
        const total = Number(roll.total);
        if (!isNaN(total)) return Math.round(total);
      }
    } catch (e) {
      // Fall through to safe Function eval if roll parsing fails
    }

    // Safe arithmetic fallback for expressions containing only numbers, operators, and parentheses
    if (/^[0-9+\-*/().\s]+$/.test(formula)) {
      try {
        const result = Function(`"use strict"; return (${formula})`)();
        if (typeof result === "number" && !isNaN(result)) {
          return Math.round(result);
        }
      } catch (e) {
        console.warn(`SimpleItemSheet | Error evaluating stat expression "${formula}":`, e);
      }
    }

    const parsed = parseInt(formula);
    if (!isNaN(parsed)) return parsed;

    return defaultValue;
  }

  /* -------------------------------------------- */

  /**
   * Handle form submission processing
   * @param {Event} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   */
  static async #onSubmitForm(event, form, formData) {
    let submitData = formData.object;
    submitData = EntitySheetHelper.updateAttributes(submitData, this.document);
    submitData = EntitySheetHelper.updateGroups(submitData, this.document);
    submitData = EntitySheetHelper.updateArrays(submitData, [
      "system.activeEffects",
      "system.passiveEffects"
    ]);
    await this.document.update(submitData);
  }

  /* -------------------------------------------- */

  /**
   * Handle active and passive effect creation and deletion
   * @param {Event} event
   * @private
   */
  async _onEffectControl(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const action = button.dataset.action;
    const type = button.dataset.type || "activeEffects";
    const effects = Array.from(this.item.system[type] || []);

    if (action === "add") {
      if (type === "activeEffects") {
        effects.push({ actionNumber: "", threshold: "", dice: "", ammo: "", description: "" });
      } else {
        effects.push({ description: "" });
      }
    } else if (action === "delete") {
      const index = Number(button.dataset.index);
      if (!isNaN(index)) effects.splice(index, 1);
    }
    return this.item.update({ [`system.${type}`]: effects });
  }

  /* -------------------------------------------- */

  /**
   * Handle left click on item munitions to reduce loadAmmo by 1
   * @param {Event} event
   * @private
   */
  async _onClickMunitions(event) {
    event.preventDefault();
    const currentAmmo = Number(this.item.system.munitions?.loadAmmo || 0);
    if (currentAmmo <= 0) return;
    return this.item.update({ "system.munitions.loadAmmo": currentAmmo - 1 });
  }

  /* -------------------------------------------- */

  /**
   * Handle right click on item munitions to reload loadAmmo using remainingAmmo up to capacity
   * @param {Event} event
   * @private
   */
  async _onRightClickMunitions(event) {
    event.preventDefault();
    const capacity = Number(this.item.system.munitions?.capacity || 0);
    const currentLoad = Number(this.item.system.munitions?.loadAmmo || 0);
    const remaining = Number(this.item.system.munitions?.remainingAmmo || 0);

    const needed = capacity - currentLoad;
    if (needed <= 0 || remaining <= 0) return;

    const toReload = Math.min(needed, remaining);
    return this.item.update({
      "system.munitions.loadAmmo": currentLoad + toReload,
      "system.munitions.remainingAmmo": remaining - toReload
    });
  }
}
