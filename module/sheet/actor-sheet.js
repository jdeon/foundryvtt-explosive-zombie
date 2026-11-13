import { BaseActorSheet } from "./base-actor-sheet.js";
import { INJURY_REASONS } from "../constants.js";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;
const { TextEditor } = foundry.applications.ux;

/**
 * Extend BaseActorSheet with custom tabbed sheet layout and inventory management
 * @extends {BaseActorSheet}
 */
export class CharacterActorSheet extends BaseActorSheet {

  /** @override */
  static ARRAY_PATHS = [
    "system.skills",
    "system.healthPoints",
    "system.armors"
  ];

  /** @override */
  static DEFAULT_OPTIONS = {
    position: {
      width: 780
    },
    window: {
      title: 'characterSheet.actorSheetTitle'
    },
    tabGroups: {
      primary: "sheet"
    }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: 'sheet', group: 'primary', label: 'common.tabSheet' },
        { id: 'edit', group: 'primary', label: 'common.tabEdit' },
        { id: 'items', group: 'primary', label: 'common.tabItems' }
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
    }
  };

  /* -------------------------------------------- */

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (!game.user?.isGM) {
      options.parts = ["sheet"];
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Helper context values for template compatibility
    context.description = context.system.description;
    context.quotes = context.system.quotes;
    context.notes = context.system.notes;
    context.stats = context.system.stats;
    context.healthPoints = context.system.healthPoints;
    context.armors = (context.system.armors || []).map((val, index) => {
      const isEquipped = val === "equipped";
      const isBroken = val === "broken" || val === "break" || val === "true" || val === true;
      const state = isEquipped ? "equipped" : (isBroken ? "broken" : "unequipped");
      return {
        index,
        state,
        isUnequipped: state === "unequipped",
        isEquipped,
        isBroken
      };
    });
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
      { id: "equipped", labelKey: "characterSheet.slotEquipped", icon: "fas fa-shield-alt", items: [] },
      { id: "belt", labelKey: "characterSheet.slotBelt", icon: "fas fa-ring", items: [] },
      { id: "backpack", labelKey: "characterSheet.slotBackpack", icon: "fas fa-briefcase", items: [] },
      { id: "other", labelKey: "characterSheet.slotOther", icon: "fas fa-box-open", items: [] }
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

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    const html = $(this.element);

    // Skill management in Classic Form
    html.find('.skill-control').click(this._onSkillControl.bind(this));

    // Health / Armor box management in Classic Form
    html.find('.health-control').change(this._onHealthControl.bind(this));
    html.find('.armor-control').change(this._onArmorControl.bind(this));

    // Item Controls
    html.find(".item-control").click(this._onItemControl.bind(this));

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
    html.find('.armor-box').on('click', this._onArmorBoxClick.bind(this));
    html.find('.box.free-space').on('click', this._onOpenFreeSpaceOverlay.bind(this));
    this._updateFreeSpaceOverlay();
  }

  /* -------------------------------------------- */

  /**
   * Handle clicking on an armor box to cycle its state:
   * unequipped ("") -> equipped ("equipped") -> broken ("broken") -> unequipped ("")
   * @param {Event} event
   * @private
   */
  async _onArmorBoxClick(event) {
    event.preventDefault();
    const index = Number(event.currentTarget.dataset.armorIndex);
    return this.actor.cycleArmorState(index);
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

    if (action === "add") {
      return this.actor.addSkill();
    } else if (action === "delete") {
      return this.actor.deleteSkill(Number(button.dataset.index));
    }
  }

  /**
   * Handle adding or removing health boxes
   * @param {Event} event
   * @private
   */
  async _onHealthControl(event) {
    event.preventDefault();
    return this.actor.setHealthBoxCount(event.currentTarget.valueAsNumber);
  }

  /**
   * Handle adding or removing armor boxes
   * @param {Event} event
   * @private
   */
  async _onArmorControl(event) {
    event.preventDefault();
    return this.actor.setArmorBoxCount(event.currentTarget.valueAsNumber);
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
        return cls.create({ name: game.i18n.localize("itemSheet.new"), type: "item" }, { parent: this.actor });
      case "edit":
        return item.sheet.render(true);
      case "delete":
        return item.delete();
      case "sync":
        return this.actor.syncInventory();
    }
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
      window: { title: game.i18n.localize("characterSheet.freeSpaceTitle") },
      content: htmlContent,
      buttons: [
        { action: "close", label: game.i18n.localize("Close"), default: true }
      ]
    };


    this._freeSpaceDialog = new DialogV2(dialogOptions);
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
        await this.actor.removeItemFromInventory(itemId, "backpack");
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

  /** @override */
  async _onDrop(event) {
    let data;
    try {
      data = TextEditor.implementation.getDragEventData(event);
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
   * @param {number|null} _targetIndex
   * @returns {Promise<boolean>} If the drop was successful
   * @private
   */
  async _onDropItemToInventory(event, data, section, _targetIndex) {
    let droppedItem;
    try {
      droppedItem = await Item.fromDropData(data);
    } catch (err) {
      console.error(err);
      return false;
    }
    return this.actor.addItemToInventory(droppedItem, section);
  }

  /**
   * Handle moving an inventory slot item from one slot to another
   * @param {Event} event
   * @param {Object} data
   * @param {string} targetSection
   * @param {number|null} _targetIndex
   * @returns {Promise<boolean>} if the move was successful
   * @private
   */
  async _onDropInventorySlot(event, data, targetSection, _targetIndex) {
    const { fromSection, fromIndex } = data;
    const itemId = data.itemId || data.item || this.actor.system.inventory[fromSection]?.contain?.[fromIndex]?.item;
    return this.actor.moveInventoryItem(fromSection, targetSection, itemId);
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

    const container = this.actor.system.inventory?.[section];
    const itemId = container?.contain?.[index]?.item;
    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    const itemName = item?.name || "";

    const title = game.i18n.localize("itemSheet.delete");
    const content = itemName
      ? game.i18n.format("characterSheet.confirmClearSlotContent", { name: itemName })
      : game.i18n.localize("characterSheet.confirmClearSlot");

    const confirmed = await DialogV2.confirm({
      window: { title },
      content: `<p>${content}</p>`,
      rejectClose: false,
      modal: true
    });

    if (!confirmed) return;

    await this.actor.dropItemAsLoot(itemId, section);
  }
}

