import { EntitySheetHelper } from "../helper.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { FilePicker } = foundry.applications.apps;

/**
 * Shared base ActorSheetV2 class for all Actor types ("character", "zombie", "chest").
 * @extends {ActorSheetV2}
 */
export class BaseActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /**
   * Array field paths within `system` that should be normalized from indexed form objects to arrays on submit.
   * @type {string[]}
   */
  static ARRAY_PATHS = [];

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["explosive-zombie", "sheet", "actor"],
    position: {
      height: "auto"
    },
    window: {
      resizable: true
    },
    tag: "form",
    form: {
      handler: BaseActorSheet.onSubmitForm,
      submitOnChange: true,
      closeOnSubmit: false
    }
  };

  /**
   * Convenience getter for the Actor document.
   * @type {Actor}
   */
  get actor() {
    return this.document;
  }

  /**
   * Default portrait fallback when the actor has no image.
   * @type {string}
   */
  get defaultPortrait() {
    return "icons/svg/mystery-man.svg";
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isGM = game.user?.isGM;
    context.actor = this.document;
    context.data = this.document.toObject(false);
    context.system = context.data.system;
    context.systemData = context.data.system;
    context.portraitUrl = context.system?.portraitUrl || context.data.img || this.defaultPortrait;
    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    const html = $(this.element);

    if (game.user?.isGM && this.constructor.TABS) {
      html.find('.sheet-tabs .item, [data-action="tab"]').on("click", ev => {
        ev.preventDefault();
        const tab = ev.currentTarget.dataset.tab;
        if (tab) this.changeTab(tab, "primary");
      });
    }

    if (!this.isEditable) return;

    // Bind portrait image picker if present in sheet
    html.find('[data-edit="img"], .profile-img').on("click", this._onEditImage.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle editing the actor portrait image.
   * @param {Event} event
   * @protected
   */
  _onEditImage(event) {
    const attr = event.currentTarget.dataset.edit || "img";
    const current = foundry.utils.getProperty(this.document, attr);
    const fp = new FilePicker.implementation({
      type: "image",
      current,
      callback: path => {
        this.document.update({ [attr]: path });
      },
      top: this.position.top + 40,
      left: this.position.left + 10
    });
    return fp.browse();
  }

  /* -------------------------------------------- */

  /**
   * Shared form submission handler for all actor sheets.
   * @param {Event} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   */
  static async onSubmitForm(event, form, formData) {
    let submitData = formData.object;
    const arrayPaths = this.constructor.ARRAY_PATHS;
    if (Array.isArray(arrayPaths) && arrayPaths.length > 0) {
      submitData = EntitySheetHelper.updateArrays(submitData, arrayPaths);
    }
    await this.document.update(submitData);
  }
}

