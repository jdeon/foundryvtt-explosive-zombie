import { EntitySheetHelper } from "./helper.js";
import { ATTRIBUTE_TYPES } from "./constants.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Extend the basic ActorSheetV2 with custom tabbed sheet layout and inventory management
 * @extends {ActorSheetV2}
 */
export class SimpleActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["explosive-zombie", "sheet", "actor"],
    position: {
      width: 780,
      height: 'auto'
    },
    window: {
      resizable: true,
      title: 'SIMPLE.ActorSheetTitle'
    },
    tabGroups: {
      primary: "sheet"
    },
    tag: "form",
    form: {
      handler: SimpleActorSheet.#onSubmitForm,
      submitOnChange: true,
      closeOnSubmit: false
    }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: 'sheet', group: 'primary', label: 'SIMPLE.TabSheet' },
        { id: 'edit', group: 'primary', label: 'SIMPLE.TabEdit' },
        { id: 'items', group: 'primary', label: 'SIMPLE.TabItems' },
        { id: 'attributes', group: 'primary', label: 'SIMPLE.TabAttributes' }
      ],
      initial: 'sheet'
    }
  };

  /** @override */
  static PARTS = {
    tabs: {
      template: "templates/generic/tab-navigation.hbs"
    },
    sheet: {
      template: "systems/explosive-zombie/templates/parts/actor-tab-sheet.html",
      scrollable: [""]
    },
    edit: {
      template: "systems/explosive-zombie/templates/parts/actor-tab-edit.html",
      scrollable: [""]
    },
    items: {
      template: "systems/explosive-zombie/templates/parts/actor-tab-items.html",
      scrollable: [""]
    },
    attributes: {
      template: "systems/explosive-zombie/templates/parts/actor-tab-attributes.html",
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
    context.shorthand = !!game.settings.get("explosive-zombie", "macroShorthand");
    context.system = context.data.system;
    context.systemData = context.data.system;
    context.dtypes = ATTRIBUTE_TYPES;

    EntitySheetHelper.getAttributeData(context);

    // Ensure system object defaults exist safely
    context.system.stats = context.system.stats || { agility: 2, constitution: 2, mental: 2, speed: 5 };
    context.system.inventory = context.system.inventory || {
      belt: { size: 3, contain: [] },
      backpack: { size: 6, contain: [] },
      equipped: { size: 2, contain: [] }
    };
    if (!context.system.inventory.belt) context.system.inventory.belt = { size: 3, contain: [] };
    if (!context.system.inventory.backpack) context.system.inventory.backpack = { size: 6, contain: [] };
    if (!context.system.inventory.equipped) context.system.inventory.equipped = { size: 2, contain: [] };
    if (!context.system.skills) context.system.skills = [];
    if (!context.system.healthPoints) context.system.healthPoints = ["", "", "", ""];
    if (!context.system.armors) context.system.armors = [];

    // Helper context values for template compatibility
    context.portraitUrl = context.system.portraitUrl || context.data.img || "icons/svg/mystery-man.svg";
    context.description = context.system.description || "";
    context.quotes = context.system.quotes || "";
    context.notes = context.system.notes || "";
    context.stats = context.system.stats;
    context.healthPoints = context.system.healthPoints;
    context.armors = context.system.armors;
    context.skills = context.system.skills;
    context.inventory = context.system.inventory;

    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Activate current tab content
    const activeTab = this.tabGroups.primary || "sheet";
    this.changeTab(activeTab, "primary", { force: true });

    const html = $(this.element);

    // Tab navigation click handling
    html.find('.sheet-tabs .item, [data-action="tab"]').on('click', ev => {
      ev.preventDefault();
      const tab = ev.currentTarget.dataset.tab;
      if (tab) this.changeTab(tab, "primary");
    });

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

    // Make inventory slot boxes draggable and handle contextmenu (clear)
    html.find('.slot-box').each((i, el) => {
      const section = el.dataset.inventorySection;
      const index = el.dataset.slotIndex;
      const itemId = el.dataset.itemId;
      const text = el.textContent?.trim();

      if (text) {
        el.setAttribute("draggable", true);
        el.addEventListener("dragstart", ev => {
          const dragData = {
            type: "InventorySlot",
            fromSection: section,
            fromIndex: Number(index),
            itemName: text,
            itemId: itemId
          };
          ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        }, false);
      }
    });

    html.find('.slot-box').on('contextmenu', this._onClearSlot.bind(this));
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
    submitData = EntitySheetHelper.updateAttributes(submitData, this.document);
    submitData = EntitySheetHelper.updateGroups(submitData, this.document);
    submitData = EntitySheetHelper.updateArrays(submitData, [
      "system.skills",
      "system.healthPoints",
      "system.armors"
    ]);
    await this.document.update(submitData);
  }

  /* -------------------------------------------- */

  /**
   * Handle skill creation and deletion controls
   * @param {Event} event
   * @private
   */
  async _onSkillControl(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const action = button.dataset.action;
    const skills = Array.from(this.actor.system.skills || []);

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
   * @param {Event} event
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

  /** @override */
  async _onDrop(event) {
    let data;
    try {
      data = TextEditor.getDragEventData(event);
    } catch (e) {
      return super._onDrop(event);
    }
    if (!data) return super._onDrop(event);

    const slotTarget = event.target.closest("[data-inventory-section]");
    if (slotTarget) {
      const section = slotTarget.dataset.inventorySection;
      const slotIndexAttr = slotTarget.dataset.slotIndex;
      const targetIndex = slotIndexAttr !== undefined && slotIndexAttr !== null && slotIndexAttr !== "" ? Number(slotIndexAttr) : null;

      if (data.type === "InventorySlot") {
        return this._onDropInventorySlot(event, data, section, targetIndex);
      }

      if (data.type === "Item") {
        await this._onDropItemToInventory(event, data, section, targetIndex);
        return super._onDrop(event);
      }
    }

    return super._onDrop(event);
  }

  /**
   * Handle dropping an Item document onto an inventory section or slot box
   * @param {Event} event
   * @param {Object} data
   * @param {string} section  "belt", "backpack", or "equipped"
   * @param {number|null} targetIndex
   * @returns {Promise<boolean>} If the drop was successful
   * @private
   */
  async _onDropItemToInventory(event, data, section, targetIndex) {
    let item;
    try {
      item = await Item.fromDropData(data);
    } catch (err) {
      console.error(err);
      return false;
    }
    if (!item) return false;

    const itemName = item.name;
    const inventory = foundry.utils.duplicate(this.actor.system.inventory || {});
    const targetContainer = inventory[section];
    if (!targetContainer || !Array.isArray(targetContainer.contain)) return;

    if (targetContainer.size < targetContainer.contain.length + item.system.requiredSlots && targetContainer.contain.length > 0) {
      ui.notifications.error(game.i18n.localize("SIMPLE.ErrorInventoryFull"));
      return false;
    }

    if (item.system.requiredSlots > 1) {
      for (let i = 1; i <= item.system.requiredSlots; i++) {
        targetContainer.contain.push({ title: `${itemName} (${i}/${item.system.requiredSlots})`, item: item.id });
      }
    } else if (item.system.requiredSlots === 0 && Array.isArray(targetContainer.freeSpace)) {
      targetContainer.freeSpace.push({ title: itemName, item: item.id });
    } else {
      targetContainer.contain.push({ title: itemName, item: item.id });
    }

    await this.actor.update({ "system.inventory": inventory });
    return true;
  }

  /**
   * Handle moving an inventory slot item from one slot to another
   * @param {Event} event
   * @param {Object} data
   * @param {string} targetSection
   * @param {number|null} targetIndex
   * @returns {Promise<boolean>} if the move was successful
   * @private
   */
  async _onDropInventorySlot(event, data, targetSection, targetIndex) {
    const { fromSection, fromIndex, itemName } = data;
    const itemId = data.itemId || data.item || this.actor.system.inventory[fromSection]?.contain?.[fromIndex]?.item;
    if (!fromSection || fromIndex === undefined || !itemName || !itemId) return false;
    if (fromSection === targetSection) return false;

    const item = this.actor.items.get(itemId);
    const itemData = item ? { type: "Item", uuid: item.uuid } : { type: "Item", uuid: `Item.${itemId}` };

    const successful = await this._onDropItemToInventory(event, itemData, targetSection, targetIndex);
    if (!successful) return false;

    await this._removeItemFromInventory(itemId, fromSection);
    return true;
  }

  /**
   * Clear an inventory slot on right click
   * @param {Event} event
   * @private
   */
  async _onClearSlot(event) {
    event.preventDefault();
    const el = event.currentTarget;
    const section = el.dataset.inventorySection;
    const index = Number(el.dataset.slotIndex);
    if (!section || isNaN(index)) return;

    const inventory = foundry.utils.duplicate(this.actor.system.inventory || {});
    const container = inventory[section];
    if (!container || !Array.isArray(container.contain)) return;

    if (container.contain[index]?.item) {
      this._removeItemFromInventory(container.contain[index].item, section);
    }
  }

  /**
   * Remove an item from the inventory
   * @param {string} itemId
   * @param {string} section
   * @returns {Promise<boolean>} if the item was removed
   * @private
   */
  async _removeItemFromInventory(itemId, section) {
    const inventory = foundry.utils.duplicate(this.actor.system.inventory || {});
    const container = inventory[section];
    if (!itemId || !container || !Array.isArray(container.contain)) return false;

    if (container.contain.some(slot => slot.item === itemId)) {
      inventory[section].contain = container.contain.filter(el => el.item !== itemId);
    } else if (Array.isArray(container.freeSpace) && container.freeSpace.some(slot => slot.item === itemId)) {
      inventory[section].freeSpace = container.freeSpace.filter(slot => slot.item !== itemId);
    } else {
      return false;
    }

    await this.actor.update({ "system.inventory": inventory });
    return true;
  }
}
