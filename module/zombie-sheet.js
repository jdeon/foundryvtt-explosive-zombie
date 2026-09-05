const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

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
      title: 'SIMPLE.ZombieSheetTitle'
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
    context.system = context.data.system || {};

    // Ensure system defaults exist
    context.system.hp = context.system.hp || { value: 10, max: 10 };
    if (context.system.hp.value === undefined) context.system.hp.value = 10;
    if (context.system.hp.max === undefined) context.system.hp.max = 10;

    context.system.speed = context.system.speed ?? 5;
    context.system.actionNumber = context.system.actionNumber ?? 1;
    context.system.thresholdDice = context.system.thresholdDice ?? 4;
    context.system.diceNumber = context.system.diceNumber ?? 1;
    context.system.notes = context.system.notes ?? "";

    context.portraitUrl = context.data.img || "icons/svg/mystery-man.svg";

    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    if (!this.isEditable) return;

    const html = $(this.element);

    // Roll action button for zombie attack/action
    html.find('.zombie-roll-btn').click(this._onZombieRoll.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Roll zombie action dice
   * @param {Event} event
   * @private
   */
  async _onZombieRoll(event) {
    event.preventDefault();

    const diceNumber = Math.max(1, Number(this.actor.system?.diceNumber || 1));
    const threshold = Math.max(1, Number(this.actor.system?.thresholdDice || 4));

    const roll = new Roll(`${diceNumber}d6`);
    await roll.evaluate();

    let successCount = 0;
    for (const term of roll.terms) {
      if (term.results) {
        for (const r of term.results) {
          if (r.result >= threshold) successCount++;
        }
      }
    }

    const flavor = `<h3>${this.actor.name} - Jet d'attaque / Action</h3>` +
      `<p><strong>Dés lancés :</strong> ${diceNumber}d6 | <strong>Seuil :</strong> ${threshold}+</p>` +
      `<p><strong>Succès :</strong> ${successCount}</p>`;

    return roll.toMessage({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: flavor
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
    await this.document.update(submitData);
  }
}
