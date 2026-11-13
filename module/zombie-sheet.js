const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { FilePicker } = foundry.applications.apps;

/**
 * Single-tab sheet layout for Zombie actors
 * @extends {ActorSheetV2}
 */
export class ZombieActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["explosive-zombie", "sheet", "actor", "zombie-sheet"],
    position: {
      width: 580,
      height: 'auto'
    },
    window: {
      resizable: true,
      title: 'zombieSheet.title'
    },
    tag: "form",
    form: {
      handler: ZombieActorSheet.#onSubmitForm,
      submitOnChange: true,
      closeOnSubmit: false
    }
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "systems/explosive-zombie/templates/parts/zombie-tab-sheet.html",
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
    context.system = context.data.system;
    context.portraitUrl = context.data.img || "icons/svg/mystery-man.svg";
    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    if (!this.isEditable) return;

    const html = $(this.element);

    // Edit portrait image
    html.find('[data-edit="img"], .profile-img').click(this._onEditImage.bind(this));

    // Roll action button for zombie attack/action
    html.find('.zombie-roll-btn').click(this._onZombieRoll.bind(this));
  }

  /**
   * Handle editing the actor portrait image
   * @param {Event} event
   * @private
   */
  _onEditImage(event) {
    const attr = event.currentTarget.dataset.edit || "img";
    const current = foundry.utils.getProperty(this.document, attr);
    const fp = new FilePicker.implementation({
      type: "image",
      current: current,
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
   * Roll zombie action dice
   * @param {Event} event
   * @private
   */
  async _onZombieRoll(event) {
    event.preventDefault();
    return this.actor.rollAction();
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
