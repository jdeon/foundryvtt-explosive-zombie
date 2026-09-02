import { EntitySheetHelper } from "./helper.js";
import { ATTRIBUTE_TYPES } from "./constants.js";

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class SimpleActorSheet extends ActorSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["worldbuilding", "sheet", "actor"],
      template: "systems/explosive-zombie/templates/actor-sheet.html",
      width: 780,
      height: 720,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "sheet" }],
      scrollY: [".sheet-outer", ".classic-form", ".biography", ".items", ".attributes"],
      dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }]
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async getData(options) {
    const context = await super.getData(options);
    EntitySheetHelper.getAttributeData(context.data);
    context.shorthand = !!game.settings.get("explosive-zombie", "macroShorthand");
    context.systemData = context.data.system;
    context.dtypes = ATTRIBUTE_TYPES;

    // Ensure system object defaults exist safely
    context.systemData.stats = context.systemData.stats || { agility: 2, constitution: 2, mental: 2, speed: 5 };
    context.systemData.inventory = context.systemData.inventory || {
      belt: { size: 3, contain: [] },
      backpack: { size: 6, contain: [] },
      equipped: { size: 2, contain: [] }
    };
    if (!context.systemData.inventory.belt) context.systemData.inventory.belt = { size: 3, contain: [] };
    if (!context.systemData.inventory.backpack) context.systemData.inventory.backpack = { size: 6, contain: [] };
    if (!context.systemData.inventory.equipped) context.systemData.inventory.equipped = { size: 2, contain: [] };
    if (!context.systemData.skills) context.systemData.skills = [];
    if (!context.systemData.healthPoints) context.systemData.healthPoints = ["", "", "", ""];
    if (!context.systemData.armors) context.systemData.armors = [];

    // Helper context values for template compatibility
    context.portraitUrl = context.systemData.portraitUrl || context.data.img || "icons/svg/mystery-man.svg";
    context.description = context.systemData.description || "";
    context.quotes = context.systemData.quotes || "";
    context.notes = context.systemData.notes || "";
    context.stats = context.systemData.stats;
    context.healthPoints = context.systemData.healthPoints;
    context.armors = context.systemData.armors;
    context.skills = context.systemData.skills;
    context.inventory = context.systemData.inventory;

    return context;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Skill management in Classic Form
    html.find('.skill-control').click(this._onSkillControl.bind(this));

    // Health / Armor box management in Classic Form
    html.find('.health-control').change(this._onHealthControl.bind(this));
    html.find('.armor-control').change(this._onArmorControl.bind(this));

    // Attribute Management
    html.find(".attributes").on("click", ".attribute-control", EntitySheetHelper.onClickAttributeControl.bind(this));
    html.find(".groups").on("click", ".group-control", EntitySheetHelper.onClickAttributeGroupControl.bind(this));
    html.find(".attributes").on("click", "a.attribute-roll", EntitySheetHelper.onAttributeRoll.bind(this));

    // Item Controls
    html.find(".item-control").click(this._onItemControl.bind(this));
    html.find(".items .rollable").on("click", this._onItemRoll.bind(this));

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
   * Handle skill creation and deletion controls
   * @param {Event} event
   * @private
   */
  async _onSkillControl(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const action = button.dataset.action;
    const skills = this.actor.system.skills;

    if (action === "add") {
      skills.push({ label: `Compétence ${skills.length + 1}`, val: 2 });
    } else if (action === "delete") {
      const index = Number(button.dataset.index);
      if (!isNaN(index)) skills.splice(index, 1);
    }
    return this.actor.update({ "system.skills": skills });
  }

  /**
   * Handle adding or removing health boxes
   * @param {Event} event
   * @private
   */
  async _onHealthControl(event) {
    event.preventDefault();
    const healthPointsLenght = event.currentTarget.valueAsNumber;
    const health = Array.from(this.actor.system.healthPoints || []);

    while (healthPointsLenght > health.length) {
      health.push("");
    }

    while (healthPointsLenght < health.length) {
      health.pop();
    }

    return this.actor.update({ "system.healthPoints": health });
  }

  /**
   * Handle adding or removing armor boxes
   * @param {Event} event
   * @private
   */
  async _onArmorControl(event) {
    event.preventDefault();
    const armorsLenght = event.currentTarget.valueAsNumber;
    const armors = Array.from(this.actor.system.armors || []);

    while (armorsLenght > armors.length) {
      armors.push("");
    }

    while (armorsLenght < armors.length) {
      armors.pop();
    }
    return this.actor.update({ "system.armors": armors });
  }

  /* -------------------------------------------- */

  /**
   * Handle click events for Item control buttons within the Actor Sheet
   * @param event
   * @private
   */
  _onItemControl(event) {
    event.preventDefault();

    // Obtain event data
    const button = event.currentTarget;
    const li = button.closest(".item");
    const item = this.actor.items.get(li?.dataset.itemId);

    // Handle different actions
    switch (button.dataset.action) {
      case "create":
        const cls = getDocumentClass("Item");
        return cls.create({ name: game.i18n.localize("SIMPLE.ItemNew"), type: "item" }, { parent: this.actor });
      case "edit":
        return item.sheet.render(true);
      case "delete":
        return item.delete();
    }
  }

  /* -------------------------------------------- */

  /**
   * Listen for roll buttons on items.
   * @param {MouseEvent} event    The originating left click event
   */
  _onItemRoll(event) {
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.items.get(li.data("itemId"));
    let r = new Roll(button.data('roll'), this.actor.getRollData());
    return r.toMessage({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `<h2>${item.name}</h2><h3>${button.text()}</h3>`
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getSubmitData(updateData) {
    let formData = super._getSubmitData(updateData);
    formData = EntitySheetHelper.updateAttributes(formData, this.object);
    formData = EntitySheetHelper.updateGroups(formData, this.object);
    formData = EntitySheetHelper.updateArrays(formData, [
      "system.skills",
      "system.healthPoints",
      "system.armors"
    ]);
    return formData;
  }
}
