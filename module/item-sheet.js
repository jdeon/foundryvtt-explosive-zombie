import { EntitySheetHelper } from "./helper.js";
import { ATTRIBUTE_TYPES } from "./constants.js";

/**
 * Extend the basic ItemSheet with custom tabbed sheet layout and effect management
 * @extends {ItemSheet}
 */
export class SimpleItemSheet extends ItemSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["worldbuilding", "sheet", "item"],
      template: "systems/explosive-zombie/templates/item-sheet.html",
      width: 580,
      height: 620,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "sheet" }],
      scrollY: [".card-container", ".classic-form", ".attributes"],
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async getData(options) {
    const context = await super.getData(options);
    EntitySheetHelper.getAttributeData(context.data);
    context.systemData = context.data.system;
    context.dtypes = ATTRIBUTE_TYPES;

    // Ensure array defaults exist safely
    if (!context.systemData.activeEffects) context.systemData.activeEffects = [];
    if (!context.systemData.passiveEffects) context.systemData.passiveEffects = [];

    context.imageUrl = context.systemData.imageUrl || context.data.img || "icons/svg/item-bag.svg";

    context.descriptionHTML = await TextEditor.enrichHTML(context.systemData.description || "", {
      secrets: this.document.isOwner,
      async: true
    });
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);

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

  /** @override */
  _getSubmitData(updateData) {
    let formData = super._getSubmitData(updateData);
    formData = EntitySheetHelper.updateAttributes(formData, this.object);
    formData = EntitySheetHelper.updateGroups(formData, this.object);
    formData = EntitySheetHelper.updateArrays(formData, [
      "system.activeEffects",
      "system.passiveEffects"
    ]);
    return formData;
  }
}
