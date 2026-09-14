
export class RollDialog extends foundry.applications.api.DialogV2 {

  /**
   * @param {number|object} [diceNumber=1] Number of dice or options object
   * @param {number} [threshold=4] Success threshold
   * @param {object} [options={}] Additional DialogV2 options (e.g. item, ammoCost)
   */
  constructor(diceNumber, threshold, options = {}) {
    const item = options.item || null;
    const ammoCost = Number(options.ammoCost) || 0;
    const availableAmmo = item ? Number(item.system?.munitions?.loadAmmo || 0) : 0;

    let ammoFieldHtml = "";
    if (ammoCost > 0) {
      const isEnough = availableAmmo >= ammoCost;
      ammoFieldHtml = `
        <div class="form-group" style="display: flex; margin-bottom: 8px; align-items: center; gap: 6px; background: rgba(0, 0, 0, 0.05); padding: 6px 8px; border-radius: 4px; font-size: 0.9em;">
          <i class="fa-solid fa-boxes-stacked" style="color: #555;"></i>
          <label style="flex: 1; font-weight: bold;">Coût en munitions :</label>
          <span style="font-weight: bold; color: ${isEnough ? '#27ae60' : '#c0392b'};">
            ${ammoCost} ${item ? `(Chargées : ${availableAmmo})` : ''}
          </span>
        </div>
      `;
    }

    const content = `
      <form style="margin-bottom: 10px;">
        ${ammoFieldHtml}
        <div class="form-group" style="display: flex; margin-bottom: 8px; align-items: center; gap: 4px;">
          <label style="flex: 1; font-weight: bold;">Nombre de dés :</label>
          <button type="button" class="spin-btn" data-action="decrease" data-target="#dice-count" style="width: 28px; height: 26px; display: flex; align-items: center; justify-content: center; padding: 0;"><i class="fas fa-minus"></i></button>
          <input type="number" id="dice-count" name="diceCount" value="${diceNumber}" style="width: 50px; text-align: center;" />
          <button type="button" class="spin-btn" data-action="increase" data-target="#dice-count" style="width: 28px; height: 26px; display: flex; align-items: center; justify-content: center; padding: 0;"><i class="fas fa-plus"></i></button>
        </div>
        <div class="form-group" style="display: flex; margin-bottom: 8px; align-items: center; gap: 4px;">
          <label style="flex: 1; font-weight: bold;">Seuil de réussite :</label>
          <button type="button" class="spin-btn" data-action="decrease" data-target="#threshold" style="width: 28px; height: 26px; display: flex; align-items: center; justify-content: center; padding: 0;"><i class="fas fa-minus"></i></button>
          <input type="number" id="threshold" name="threshold" value="${threshold}" style="width: 50px; text-align: center;" />
          <button type="button" class="spin-btn" data-action="increase" data-target="#threshold" style="width: 28px; height: 26px; display: flex; align-items: center; justify-content: center; padding: 0;"><i class="fas fa-plus"></i></button>
        </div>
      </form>
    `;

    const dialogOptions = foundry.utils.mergeObject({
      window: {
        title: "Lancer de dés explosifs"
      },
      content,
      buttons: [
        {
          action: "roll",
          icon: "fas fa-dice-d6",
          label: "Lancer les dés",
          default: true,
          callback: (event, button, dialog) => this._executeDialog(event, button, dialog)
        },
        {
          action: "cancel",
          icon: "fas fa-times",
          label: "Annuler"
        }
      ]
    }, options);

    super(dialogOptions);

    this.item = item;
    this.ammoCost = ammoCost;
    this.input = {
      diceNumber,
      threshold
    };
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
      ui.notifications.error("Veuillez entrer un nombre de dés et un seuil de réussite");
      return;
    }

    if (this.item && this.ammoCost > 0) {
      const currentLoad = Number(this.item.system?.munitions?.loadAmmo || 0);
      if (currentLoad < this.ammoCost) {
        ui.notifications.warn(`Munitions chargées insuffisantes ! (Chargées : ${currentLoad}, Requis : ${this.ammoCost})`);
        return;
      }
      await this.item.update({
        "system.munitions.loadAmmo": currentLoad - this.ammoCost
      });
    }

    const { diceToRoll, finalThreshold, finalDice, successPenalty } = this._computedRollData(inputThreshold, inputDice);

    let roll;
    let diceSuccesses = 0;

    // Roll dice
    const formula = `${diceToRoll}d6x>=${finalThreshold}cs>=${finalThreshold}`;
    roll = new Roll(formula);
    await roll.evaluate();
    diceSuccesses = roll.total;

    const finalSuccesses = diceSuccesses - successPenalty;

    const flavor = this._generateChatMessage(successPenalty, inputThreshold, finalThreshold, inputDice, finalDice, diceToRoll, finalSuccesses);

    const speaker = ChatMessage.getSpeaker({ actor: canvas.tokens?.controlled[0]?.actor || game.user?.character });

    await roll.toMessage({
      speaker,
      flavor
    });
  }

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

  _generateChatMessage(successPenalty, inputThreshold, finalThreshold, inputDice, finalDice, diceToRoll, finalSuccesses) {
    let penaltyNotice = "";
    if (successPenalty > 0) {
      penaltyNotice = `<p style="color: #c0392b; font-weight: bold; margin: 4px 0;">
              <i class="fas fa-exclamation-triangle"></i> Nombre de dés inférieur à 1 (${finalDice}) : Pénalité de -${successPenalty} succès.
            </p>`;
    }

    let ammoNotice = "";
    if (this.ammoCost > 0) {
      ammoNotice = `
        <div style="background: rgba(0, 0, 0, 0.05); padding: 4px 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.9em; color: #555;">
          <i class="fa-solid fa-boxes-stacked"></i> <strong>Munitions utilisées :</strong> ${this.ammoCost}
        </div>
      `;
    }

    let adjustmentNotice = "";
    if (inputThreshold !== finalThreshold || inputDice !== finalDice) {
      adjustmentNotice = `
              <div style="background: rgba(0, 0, 0, 0.05); padding: 6px 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.9em;">
                <strong>Ajustements appliqués :</strong><br/>
                • Seuil : <code>${inputThreshold}</code> → <code>${finalThreshold}</code><br/>
                • Dés : <code>${inputDice}</code> → <code>${finalDice}</code> (Effectifs lancés : <code>${diceToRoll}</code>)
              </div>
            `;
    }

    const flavor = `
            <div class="explosive-roll-card">
              <h3 style="border-bottom: 2px solid #7a0000; padding-bottom: 4px; margin-bottom: 8px;">
                <i class="fas fa-bomb"></i> Jet de Dés Explosifs
              </h3>
              ${ammoNotice}
              ${adjustmentNotice}
              ${penaltyNotice}
              <p style="font-size: 1.1em; margin: 4px 0;">
                <strong>Succès totaux :</strong> 
                <span style="color: ${finalSuccesses > 0 ? '#27ae60' : '#c0392b'}; font-weight: bold; font-size: 1.2em;">
                  ${finalSuccesses}
                </span>
              </p>
            </div>
          `;
    return flavor;
  }
}

