import { BaseActorSheet } from "./base-actor-sheet.js";

/**
 * Item container sheet for Chest actors
 * @extends {BaseActorSheet}
 */
export class ChestActorSheet extends BaseActorSheet {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["chest-sheet"],
    position: {
      width: 540
    },
    window: {
      title: "chestSheet.title"
    }
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "systems/explosive-zombie/templates/parts/chest-tab-sheet.html",
      scrollable: [""]
    }
  };

  /** @override */
  get defaultPortrait() {
    return "icons/svg/chest.svg";
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.items = this.actor.items.map(i => i.toObject(false));
    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;

    const html = $(this.element);
    html.find(".item-control").on("click", this._onItemControl.bind(this));
    html.find(".item-name-click").on("click", this._onItemEdit.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle item action buttons (create, edit, delete)
   * @param {Event} event
   * @private
   */
  async _onItemControl(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const action = button.dataset.action;
    const li = button.closest(".chest-item-row");
    const itemId = li?.dataset.itemId;
    const item = itemId ? this.actor.items.get(itemId) : null;

    switch (action) {
      case "create":
        const cls = getDocumentClass("Item");
        return cls.create({ name: game.i18n.localize("itemSheet.new"), type: "item" }, { parent: this.actor });
      case "edit":
        if (item) return item.sheet.render(true);
        break;
      case "delete":
        if (item) return item.delete();
        break;
    }
  }

  /**
   * Open item sheet on clicking item name
   * @param {Event} event
   * @private
   */
  _onItemEdit(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".chest-item-row");
    const itemId = li?.dataset.itemId;
    const item = itemId ? this.actor.items.get(itemId) : null;
    if (item) item.sheet.render(true);
  }
}

