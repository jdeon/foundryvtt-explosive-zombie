import { BaseActorSheet } from "./base-actor-sheet.js";

/**
 * Single-tab sheet layout for Zombie actors
 * @extends {BaseActorSheet}
 */
export class ZombieActorSheet extends BaseActorSheet {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["zombie-sheet"],
    position: {
      width: 580
    },
    window: {
      title: "zombieSheet.title"
    }
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "systems/explosive-zombie/templates/parts/zombie-tab-sheet.html",
      scrollable: [""]
    }
  };

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;

    const html = $(this.element);
    html.find(".zombie-roll-btn").on("click", this._onZombieRoll.bind(this));
  }

  /**
   * Roll zombie action dice
   * @param {Event} event
   * @private
   */
  async _onZombieRoll(event) {
    event.preventDefault();
    return this.actor.rollAction();
  }
}

