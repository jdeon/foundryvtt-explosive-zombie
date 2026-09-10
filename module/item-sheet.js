import { EntitySheetHelper } from "./helper.js";
import { ATTRIBUTE_TYPES } from "./constants.js";

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
}
