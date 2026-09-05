const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Item container sheet for Chest actors
 * @extends {ActorSheetV2}
 */
export class ChestActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["explosive-zombie", "sheet", "actor", "chest-sheet"],
    position: {
      width: 540,
      height: 'auto'
    },
    window: {
      resizable: true,
      title: 'SIMPLE.ChestSheetTitle'
    },
    tag: "form",
    form: {
      handler: ChestActorSheet.#onSubmitForm,
      submitOnChange: true,
      closeOnSubmit: false
    }
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "systems/explosive-zombie/templates/parts/chest-tab-sheet.html",
      scrollable: [""]
    }
  };

  /**
   * Convenience getter for the Actor document
   * @type {Actor}
   */
  get actor() {
    return this.document;
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.document;
    context.data = this.document.toObject(false);
    context.system = context.data.system || {};

    context.items = this.actor.items.map(i => i.toObject(false));
    context.portraitUrl = context.data.img || "icons/svg/chest.svg";
    context.system.foodRations = context.system.foodRations ?? 0;
    context.system.fuel = context.system.fuel ?? 0;
    context.system.notes = context.system.notes ?? "";

    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    if (!this.isEditable) return;

    const html = $(this.element);

    // Item Controls
    html.find('.item-control').click(this._onItemControl.bind(this));
    html.find('.item-name-click').click(this._onItemEdit.bind(this));
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
    const li = button.closest('.chest-item-row');
    const itemId = li?.dataset.itemId;
    const item = itemId ? this.actor.items.get(itemId) : null;

    switch (action) {
      case "create":
        const cls = getDocumentClass("Item");
        return cls.create({ name: game.i18n.localize("SIMPLE.ItemNew"), type: "item" }, { parent: this.actor });
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
    const li = event.currentTarget.closest('.chest-item-row');
    const itemId = li?.dataset.itemId;
    const item = itemId ? this.actor.items.get(itemId) : null;
    if (item) item.sheet.render(true);
  }

  /* -------------------------------------------- */

  /** @override */
  async _onDrop(event) {
    let data;
    try {
      data = TextEditor.getDragEventData(event);
    } catch (e) {
      return super._onDrop(event);
    }
    if (!data || data.type !== "Item") return super._onDrop(event);

    return super._onDrop(event);
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
    await this.document.update(submitData);
  }
}
