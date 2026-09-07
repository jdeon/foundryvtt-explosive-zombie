import { EntitySheetHelper } from "./helper.js";
import { ATTRIBUTE_TYPES, INJURY_REASONS } from "./constants.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Extend the basic ActorSheetV2 with custom tabbed sheet layout and inventory management
 * @extends {ActorSheetV2}
 */
export class CharacterActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

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
      handler: CharacterActorSheet.#onSubmitForm,
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

    // Prepare localized health loss reasons list for select options
    const defaultReasonKeys = new Set(Object.keys(INJURY_REASONS));
    const customReasons = new Set();
    for (const hp of (context.healthPoints || [])) {
      if (hp && !defaultReasonKeys.has(hp)) {
        customReasons.add(hp);
      }
    }

    const healthReasonsList = Object.entries(INJURY_REASONS).map(([val, labelKey]) => ({
      value: val,
      label: labelKey ? game.i18n.localize(labelKey) : ""
    }));

    for (const custom of customReasons) {
      healthReasonsList.push({ value: custom, label: custom });
    }

    context.healthReasons = healthReasonsList;

    // Categorize items by slotType for divided tab view
    const itemsBySlot = [
      { id: "equipped", labelKey: "SIMPLE.SlotEquipped", icon: "fas fa-shield-alt", items: [] },
      { id: "belt", labelKey: "SIMPLE.SlotBelt", icon: "fas fa-ring", items: [] },
      { id: "backpack", labelKey: "SIMPLE.SlotBackpack", icon: "fas fa-briefcase", items: [] },
      { id: "other", labelKey: "SIMPLE.SlotOther", icon: "fas fa-box-open", items: [] }
    ];
    const slotMap = {
      equipped: itemsBySlot[0],
      belt: itemsBySlot[1],
      backpack: itemsBySlot[2],
      other: itemsBySlot[3]
    };

    for (const itemData of (context.data.items || [])) {
      const slotType = itemData.system?.slotType;
      const targetGroup = slotMap[slotType] || slotMap.other;
      targetGroup.items.push(itemData);
    }

    context.itemsBySlot = itemsBySlot;

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

    html.find('.slot-box.filled').on('click', this._onSlotBoxClick.bind(this));
    html.find('.slot-box').on('contextmenu', this._onClearSlot.bind(this));
    html.find('.box.free-space').on('click', this._onOpenFreeSpaceOverlay.bind(this));
    this._updateFreeSpaceOverlay();
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
      case "sync":
        return this._onSyncInventory();
    }
  }

  /**
   * Synchronize the actor's inventory grid with actor.items.
   * Removes any inventory slot entry that references an item ID not present in actor.items,
   * and updates system.slotType on existing item documents.
   * @private
   */
  async _onSyncInventory() {
    const inventory = foundry.utils.duplicate(this.actor.system.inventory || {});
    const existingItemIds = new Set(this.actor.items.keys());

    // 1. Filter out slot entries referencing missing item IDs across all inventory sections
    for (const [sectionName, section] of Object.entries(inventory)) {
      if (!section || typeof section !== "object") continue;

      if (Array.isArray(section.contain)) {
        section.contain = section.contain.filter(slot => slot && slot.item && existingItemIds.has(slot.item));
      }

      if (Array.isArray(section.freeSpace)) {
        section.freeSpace = section.freeSpace.filter(slot => slot && slot.item && existingItemIds.has(slot.item));
      }
    }

    // 2. Update actor's inventory state
    await this.actor.update({ "system.inventory": inventory });

    // 3. Ensure item system.slotType properties match the current inventory layout
    const itemUpdates = [];
    for (const item of this.actor.items) {
      let currentSlot = "";
      if (inventory.equipped?.contain?.some(s => s.item === item.id)) {
        currentSlot = "equipped";
      } else if (inventory.belt?.contain?.some(s => s.item === item.id)) {
        currentSlot = "belt";
      } else if (
        inventory.backpack?.contain?.some(s => s.item === item.id) ||
        inventory.backpack?.freeSpace?.some(s => s.item === item.id)
      ) {
        currentSlot = "backpack";
      }

      if (item.system.slotType !== currentSlot) {
        itemUpdates.push({ _id: item.id, "system.slotType": currentSlot });
      }
    }

    if (itemUpdates.length > 0) {
      await this.actor.updateEmbeddedDocuments("Item", itemUpdates);
    }

    ui.notifications.info(game.i18n.localize("SIMPLE.NotifyInventorySynced"));
  }

  /**
   * Open an overlay dialog displaying all small items contained in the backpack freeSpace.
   * @param {Event} event
   * @private
   */
  async _onOpenFreeSpaceOverlay(event) {
    if (event) event.preventDefault();

    if (this._freeSpaceDialog && $(this._freeSpaceDialog.element).length > 0) {
      await this._updateFreeSpaceOverlay();
      this._freeSpaceDialog.bringToTop?.();
      return;
    }

    const freeSpaceItems = this.actor.system.inventory?.backpack?.freeSpace || [];
    const htmlContent = await renderTemplate(
      "systems/explosive-zombie/templates/parts/actor-free-space-dialog.html",
      { freeSpaceItems }
    );

    const dialogOptions = {
      window: { title: game.i18n.localize("SIMPLE.FreeSpaceTitle") },
      content: htmlContent,
      buttons: [
        { action: "close", label: game.i18n.localize("Close"), default: true }
      ]
    };


    this._freeSpaceDialog = new foundry.applications.api.DialogV2(dialogOptions);
    await this._freeSpaceDialog.render(true);


    setTimeout(() => {
      if (this._freeSpaceDialog?.element) {
        this._bindFreeSpaceOverlayEvents($(this._freeSpaceDialog.element));
      }
    }, 50);
  }

  /**
   * Refresh the active freeSpace overlay dialog content if it is currently open
   * @private
   */
  async _updateFreeSpaceOverlay() {
    if (!this._freeSpaceDialog) return;
    const dialogElem = $(this._freeSpaceDialog.element);
    if (!dialogElem.length) {
      this._freeSpaceDialog = null;
      return;
    }

    const freeSpaceItems = this.actor.system.inventory?.backpack?.freeSpace || [];
    const htmlContent = await renderTemplate(
      "systems/explosive-zombie/templates/parts/actor-free-space-dialog.html",
      { freeSpaceItems }
    );

    const container = dialogElem.find('.free-space-overlay');
    if (container.length) {
      container.replaceWith(htmlContent);
    } else {
      dialogElem.find('.window-content, .dialog-content').html(htmlContent);
    }

    this._bindFreeSpaceOverlayEvents(dialogElem);
  }

  /**
   * Bind event listeners for slot boxes inside the freeSpace overlay
   * @param {jQuery} dialogElem
   * @private
   */
  _bindFreeSpaceOverlayEvents(dialogElem) {
    dialogElem.find('.slot-box').each((i, el) => {
      const itemId = el.dataset.itemId;
      const index = el.dataset.slotIndex;
      const text = el.querySelector('.item-title')?.textContent?.trim() || el.title;

      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", ev => {
        const dragData = {
          type: "InventorySlot",
          fromSection: "backpack",
          fromIndex: Number(index),
          itemName: text,
          itemId: itemId
        };
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      }, false);
    });

    dialogElem.find('.slot-box').off('click').on('click', ev => {
      if ($(ev.target).closest('.remove-free-item').length) return;
      ev.preventDefault();
      const itemId = ev.currentTarget.dataset.itemId;
      if (itemId) {
        const item = this.actor.items.get(itemId);
        if (item) item.sheet.render(true);
      }
    });

    dialogElem.find('.remove-free-item').off('click').on('click', async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const itemId = ev.currentTarget.dataset.itemId;
      if (itemId) {
        await this._removeItemFromInventory(itemId, "backpack");
      }
    });
  }

  /**
   * Handle left click on an inventory slot box to open the item sheet
   * @param {Event} event
   * @private
   */
  _onSlotBoxClick(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    if (!itemId) return;
    const item = this.actor.items.get(itemId);
    if (item) {
      item.sheet.render(true);
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
        return this._onDropItemToInventory(event, data, section, targetIndex);
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
    let droppedItem;
    try {
      droppedItem = await Item.fromDropData(data);
    } catch (err) {
      console.error(err);
      return false;
    }
    if (!droppedItem) return false;

    // Check if the item is already owned by this actor
    let item;
    let isNewItem = false;
    if (droppedItem.parent === this.actor || this.actor.items.has(droppedItem.id)) {
      item = droppedItem;
      await item.update({ "system.slotType": section });
    } else {
      // Add item to generic actor.items with slotType property set
      const itemData = droppedItem.toObject();
      foundry.utils.setProperty(itemData, "system.slotType", section);
      const createdItems = await this.actor.createEmbeddedDocuments("Item", [itemData]);
      item = createdItems[0];
      isNewItem = true;
    }
    if (!item) return false;

    const itemName = item.name;
    const inventory = foundry.utils.duplicate(this.actor.system.inventory || {});
    const targetContainer = inventory[section];
    if (!targetContainer || !Array.isArray(targetContainer.contain)) {
      if (isNewItem) await item.delete();
      return false;
    }

    const requiredSlots = Number(item.system?.requiredSlots ?? 1);

    if (targetContainer.size < targetContainer.contain.length + requiredSlots && targetContainer.contain.length > 0) {
      ui.notifications.error(game.i18n.localize("SIMPLE.ErrorInventoryFull"));
      if (isNewItem) await item.delete();
      return false;
    }

    if (requiredSlots > 1) {
      for (let i = 1; i <= requiredSlots; i++) {
        targetContainer.contain.push({ title: `${itemName} (${i}/${requiredSlots})`, item: item.id });
      }
    } else if (requiredSlots === 0 && Array.isArray(targetContainer.freeSpace)) {
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

    const itemId = container.contain[index]?.item;
    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    const itemData = item ? item.toObject() : null;
    const itemName = itemData ? itemData.name : (item ? item.name : "");

    const title = game.i18n.localize("SIMPLE.ItemDelete");
    const content = itemName
      ? game.i18n.format("SIMPLE.ConfirmClearSlotContent", { name: itemName })
      : game.i18n.localize("SIMPLE.ConfirmClearSlot");

    const confirmed = await Dialog.confirm({
      title: title,
      content: `<p>${content}</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: true
    });

    if (!confirmed) return;

    await this._removeItemFromInventory(itemId, section);

    if (itemData) {
      await this.chatMessageDeletedItem(itemData);
      await this._generateLootActor(itemData);
    }
  }

  async chatMessageDeletedItem(itemData) {
    const img = itemData.img || itemData.system?.imageUrl || "icons/svg/item-bag.svg";
    const name = itemData.name || game.i18n.localize("SIMPLE.ItemNew");
    const description = itemData.system?.description || "";
    const noticeText = game.i18n.format("SIMPLE.ItemRemovedNotice", { name }) || `Objet "${name}" retiré de l'inventaire.`;

    const chatContent = `
        <div class="explosive-zombie chat-card item-card">
          <header class="card-header flexrow" style="display: flex; align-items: center; gap: 8px;">
            <img src="${img}" title="${name}" width="36" height="36" style="border: 0; object-fit: contain;"/>
            <h3 class="item-name" style="margin: 0;">${name}</h3>
          </header>
          <div class="card-content" style="margin-top: 8px;">
            <p style="margin: 0; font-style: italic;">${noticeText}</p>
            ${description ? `<div style="margin-top: 6px;">${description}</div>` : ""}
          </div>
        </div>
      `;

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: chatContent
    });
  }

  async _generateLootActor(itemData) {
    // Check if a "Butin" chest actor already exists in the world
    let lootEntryActor = game.actors.find(a => a.type === "chest" && a.name.toLowerCase() === "butin");

    // If it does not exist, load template from compendium or create fallback
    if (!lootEntryActor) {
      let lootEntryActorData = null;
      try {
        for (const pack of game.packs) {
          if (pack.metadata.type !== "Actor") continue;
          const index = await pack.getIndex({ fields: ["type", "name"] });
          const lootEntry = index.find(e => e.type === "chest" && e.name.toLowerCase() === "butin");
          if (lootEntry) {
            const doc = await pack.getDocument(lootEntry._id);
            if (doc) {
              lootEntryActorData = doc.toObject();
              break;
            }
          }
        }
      } catch (e) {
        console.warn("Failed to check compendium packs for chest prototype:", e);
      }

      //If lootEntryActorData does not exist in compendium pack, create a new chest actor
      if (!lootEntryActorData) {
        lootEntryActorData = {
          name: "Butin",
          type: "chest",
          img: "icons/svg/chest.svg",
          system: {
            foodRations: 0,
            fuel: 0,
            notes: ''
          }
        };
      } else {
        delete lootEntryActorData._id;
        lootEntryActorData.name = "Butin";
      }

      lootEntryActor = await Actor.create(lootEntryActorData);
    }

    if (!lootEntryActor) return;

    let targetActor = null;

    // Check canvas scene for existing chest token on same cell or neighbor cell
    if (canvas?.scene) {
      const activeTokens = this.actor.getActiveTokens();
      const sourceToken = activeTokens[0] || (canvas.tokens?.placeables ? canvas.tokens.placeables.find(t => t.actor?.id === this.actor.id) : null);
      if (sourceToken) {
        const gridSize = canvas.grid.size || 100;
        // Find existing chest token on same cell or direct neighbor cell (<= 1.5 grid spaces away)
        const nearbyChestToken = canvas.tokens.placeables.find(t => {
          if (t.actor?.type !== "chest") return false;
          const dx = Math.abs(sourceToken.x - t.x);
          const dy = Math.abs(sourceToken.y - t.y);
          return dx <= (gridSize * 1.5) && dy <= (gridSize * 1.5);
        });

        if (nearbyChestToken?.actor) {
          targetActor = nearbyChestToken.actor;
        } else {
          // Create a new chest token at sourceToken coordinates
          const tokenData = await lootEntryActor.getTokenDocument({
            x: sourceToken.document?.x ?? sourceToken.x,
            y: sourceToken.document?.y ?? sourceToken.y,
            elevation: sourceToken.document?.elevation ?? 0
          });
          const createdTokenDocs = await canvas.scene.createEmbeddedDocuments("Token", [tokenData.toObject()]);
          const createdTokenDoc = createdTokenDocs[0];
          if (createdTokenDoc?.actor) {
            targetActor = createdTokenDoc.actor;
          }
        }
      }
    }

    if (!targetActor) {
      targetActor = lootEntryActor;
    }

    // Stock the item in the target token's synthetic actor
    if (targetActor && itemData) {
      const newItemData = foundry.utils.duplicate(itemData);
      delete newItemData._id;
      await Item.create(newItemData, { parent: targetActor });
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

    // Clear item's system.slotType if it is no longer in any inventory container
    const item = this.actor.items.get(itemId);
    if (item) {
      const stillInInventory = Object.values(inventory).some(cont =>
        cont?.contain?.some(slot => slot.item === itemId) ||
        cont?.freeSpace?.some(slot => slot.item === itemId)
      );
      if (!stillInInventory) {
        await item.delete();
      }
    }

    return true;
  }
}
