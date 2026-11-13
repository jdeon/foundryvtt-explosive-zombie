const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

export class RollDialog extends DialogV2 {

  /**
   * @param {number|object} [diceNumber=1] Number of dice or options object
   * @param {number} [threshold=4] Success threshold
   * @param {object} [options={}] Additional DialogV2 options (e.g. item, ammoCost)
   */
  constructor(diceNumber, threshold, options = {}) {
    const item = options.item || null;
    const ammoCost = Number(options.ammoCost) || 0;
    const availableAmmo = item ? Number(item.system?.munitions?.loadAmmo || 0) : 0;

    const templatePath = "systems/explosive-zombie/templates/parts/roll-dialog.html";
    const templateContext = {
      diceNumber,
      threshold,
      ammoCost,
      showAmmo: ammoCost > 0,
      isEnoughAmmo: availableAmmo >= ammoCost,
      loadedText: item ? `(${game.i18n.format("rollDialog.loadedAmmo", { count: availableAmmo })})` : ""
    };

    const compiled = Handlebars.partials[templatePath];
    const content = typeof compiled === "function" ? compiled(templateContext) : "";

    const dialogOptions = foundry.utils.mergeObject({
      window: {
        title: game.i18n.localize("rollDialog.title")
      },
      content,
      buttons: [
        {
          action: "roll",
          icon: "fas fa-dice-d6",
          label: game.i18n.localize("rollDialog.action"),
          default: true,
          callback: (event, button, dialog) => this._executeDialog(event, button, dialog)
        },
        {
          action: "cancel",
          icon: "fas fa-times",
          label: game.i18n.localize("common.cancel")
        }
      ]
    }, options);

    super(dialogOptions);

    this.item = item;
    this.ammoCost = ammoCost;
    this._templateContext = templateContext;
    this.input = {
      diceNumber,
      threshold
    };
  }

  /** @override */
  async _renderHTML(context, options) {
    if (!this.options.content) {
      this.options.content = await renderTemplate(
        "systems/explosive-zombie/templates/parts/roll-dialog.html",
        this._templateContext
      );
    }
    return super._renderHTML(context, options);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;
    if (!html) return;

    html.querySelectorAll('.spin-btn').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const targetId = btn.dataset.target;
        const action = btn.dataset.action;
        const input = html.querySelector(targetId);
        if (!input) return;
        let val = parseInt(input.value);
        if (isNaN(val)) val = action === 'increase' ? 1 : 0;
        else if (action === 'increase') val += 1;
        else if (action === 'decrease') val -= 1;

        const min = input.getAttribute('min');
        const max = input.getAttribute('max');
        if (min !== null && val < parseInt(min)) val = parseInt(min);
        if (max !== null && val > parseInt(max)) val = parseInt(max);

        input.value = val;
      });
    });
  }

  _executeDialog = async (event, _button, dialog) => {
    const element = dialog?.element ?? (event?.target ? event.target.closest(".window-content, form, dialog") : null) ?? this.element;
    const inputDice = parseInt(element?.querySelector('#dice-count')?.value);
    const inputThreshold = parseInt(element?.querySelector('#threshold')?.value);

    if (isNaN(inputDice) || isNaN(inputThreshold)) {
      ui.notifications.error(game.i18n.localize("notifications.rollInvalid"));
      return;
    }

    if (this.item && this.ammoCost > 0) {
      const currentLoad = Number(this.item.system?.munitions?.loadAmmo || 0);
      if (currentLoad < this.ammoCost) {
        ui.notifications.warn(game.i18n.format("notifications.insufficientAmmo", { load: currentLoad, cost: this.ammoCost }));
        return;
      }
      await this.item.update({
        "system.munitions.loadAmmo": currentLoad - this.ammoCost
      });
    }

    const { diceToRoll, finalThreshold, finalDice, successPenalty } = this._computedRollData(inputThreshold, inputDice);

    // Roll dice
    const formula = `${diceToRoll}d6x>=${finalThreshold}cs>=${finalThreshold}`;
    const roll = new Roll(formula);
    await roll.evaluate();
    const diceSuccesses = roll.total;

    const finalSuccesses = diceSuccesses - successPenalty;

    const flavor = await this._generateChatMessage(
      successPenalty,
      inputThreshold,
      finalThreshold,
      inputDice,
      finalDice,
      diceToRoll,
      finalSuccesses
    );

    const speaker = ChatMessage.getSpeaker({ actor: canvas.tokens?.controlled[0]?.actor || game.user?.character });

    await roll.toMessage({
      speaker,
      flavor
    });
  };

  _computedRollData(inputThreshold, inputDice) {
    let finalThreshold = inputThreshold;
    let finalDice = inputDice;
    let successPenalty = 0;

    // Threshold must be between 2 and 6. If out of range, adjust it and add/remove dice accordingly
    if (inputThreshold < 2) {
      const diff = 2 - inputThreshold;
      finalThreshold = 2;
      finalDice = inputDice + diff;
    } else if (inputThreshold > 6) {
      const diff = inputThreshold - 6;
      finalThreshold = 6;
      finalDice = inputDice - diff;
    }

    // If dice number is less than 1 add penalty on success and set dice number to 1
    let diceToRoll = finalDice;
    if (finalDice < 1) {
      successPenalty = 1 - finalDice;
      diceToRoll = 1;
    }

    return { diceToRoll, finalThreshold, finalDice, successPenalty };
  }

  async _generateChatMessage(successPenalty, inputThreshold, finalThreshold, inputDice, finalDice, diceToRoll, finalSuccesses) {
    return renderTemplate("systems/explosive-zombie/templates/parts/roll-chat-card.html", {
      showAmmo: this.ammoCost > 0,
      ammoCost: this.ammoCost,
      hasAdjustment: inputThreshold !== finalThreshold || inputDice !== finalDice,
      inputThreshold,
      finalThreshold,
      inputDice,
      finalDice,
      actualDiceStr: game.i18n.format("rollDialog.actualDice", { count: diceToRoll }),
      hasPenalty: successPenalty > 0,
      penaltyText: successPenalty > 0
        ? game.i18n.format("rollDialog.penaltyNotice", { finalDice, penalty: successPenalty })
        : "",
      finalSuccesses,
      isSuccess: finalSuccesses > 0
    });
  }
}
