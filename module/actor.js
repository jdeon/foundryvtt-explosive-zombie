/**
 * Base Actor document class that dispatches to specialized Actor subclasses by type.
 * @extends {Actor}
 */
export class SimpleActor extends Actor {
    constructor(data, context) {
        if (new.target === SimpleActor) {
            switch (data?.type) {
                case "character":
                    return new CharacterActor(data, context);
                case "zombie":
                    return new ZombieActor(data, context);
                case "chest":
                    return new ChestActor(data, context);
            }
        }
        super(data, context);
    }

    /**
   * Movement speed per action.
   * @type {number}
   */
    get speed() {
        return 0;
    }

    /**
     * Number of actions per round.
     * @type {number}
     */
    get actionNumber() {
        return 0;
    }
}

/* -------------------------------------------- */

/**
 * Specialized Actor document for player characters ("character"),
 * handling inventory slot management, armor/health/skill state, and loot dropping.
 * @extends {SimpleActor}
 */
export class CharacterActor extends SimpleActor {

    /**
       * Movement speed per action.
       * @type {number}
       */
    get speed() {
        const rawSpeed = this.system.stats.speed ?? 0;
        return Number(rawSpeed) || 0;
    }

    /**
     * Number of actions per round.
     * @type {number}
     */
    get actionNumber() {
        const rawActionNumber = this.system?.healthPoints.filter(hp => hp === "").length ?? 1;
        const parsed = Number(rawActionNumber);
        return Number.isFinite(parsed) ? parsed : 1;
    }

    /**
     * Cycle an armor slot's state:
     * unequipped ("") -> equipped ("equipped") -> broken ("broken") -> unequipped ("")
     * @param {number} index
     * @returns {Promise<this|undefined>}
     */
    async cycleArmorState(index) {
        if (isNaN(index)) return;
        const armors = Array.from(this.system.armors || []);
        const currentState = armors[index] || "";

        let nextState = "";
        if (!currentState || currentState === "unequipped") {
            nextState = "equipped";
        } else if (currentState === "equipped") {
            nextState = "broken";
        } else {
            nextState = "";
        }

        armors[index] = nextState;
        return this.update({ "system.armors": armors });
    }

    /**
     * Add a new skill to the character.
     * @returns {Promise<this>}
     */
    async addSkill() {
        const skills = Array.from(this.system.skills || []);
        skills.push({ label: `Compétence ${skills.length + 1}`, value: 2 });
        return this.update({ "system.skills": skills });
    }

    /**
     * Remove a skill by index.
     * @param {number} index
     * @returns {Promise<this|undefined>}
     */
    async deleteSkill(index) {
        if (isNaN(index)) return;
        const skills = Array.from(this.system.skills || []);
        skills.splice(index, 1);
        return this.update({ "system.skills": skills });
    }

    /**
     * Resize the character's health boxes array to the given length.
     * @param {number} count
     * @returns {Promise<this|undefined>}
     */
    async setHealthBoxCount(count) {
        if (isNaN(count) || count < 0) return;
        const health = Array.from(this.system.healthPoints || []);
        while (count > health.length) health.push("");
        while (count < health.length) health.pop();
        return this.update({ "system.healthPoints": health });
    }

    /**
     * Resize the character's armor boxes array to the given length.
     * @param {number} count
     * @returns {Promise<this|undefined>}
     */
    async setArmorBoxCount(count) {
        if (isNaN(count) || count < 0) return;
        const armors = Array.from(this.system.armors || []);
        while (count > armors.length) armors.push("");
        while (count < armors.length) armors.pop();
        return this.update({ "system.armors": armors });
    }

    /* -------------------------------------------- */
    /*  Inventory Management                        */
    /* -------------------------------------------- */

    /**
     * Synchronize the actor's inventory grid with `this.items`.
     * Removes any inventory slot entry that references an item ID not present in `this.items`,
     * and updates `system.slotType` on existing item documents.
     * @returns {Promise<void>}
     */
    async syncInventory() {
        const inventory = foundry.utils.deepClone(this.system.inventory || {});
        const existingItemIds = new Set(this.items.keys());

        // 1. Filter out slot entries referencing missing item IDs across all inventory sections
        for (const section of Object.values(inventory)) {
            if (!section || typeof section !== "object") continue;

            if (Array.isArray(section.contain)) {
                section.contain = section.contain.filter(slot => slot && slot.item && existingItemIds.has(slot.item));
            }

            if (Array.isArray(section.freeSpace)) {
                section.freeSpace = section.freeSpace.filter(slot => slot && slot.item && existingItemIds.has(slot.item));
            }
        }

        // 2. Update actor's inventory state
        await this.update({ "system.inventory": inventory });

        // 3. Ensure item system.slotType properties match the current inventory layout
        const itemUpdates = [];
        for (const item of this.items) {
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
            await this.updateEmbeddedDocuments("Item", itemUpdates);
        }

        ui.notifications.info(game.i18n.localize("notifications.inventorySynced"));
    }

    /**
     * Add an Item document to a specific inventory section ("belt", "backpack", or "equipped").
     * @param {Item} droppedItem
     * @param {string} section
     * @returns {Promise<boolean>} True if the item was added
     */
    async addItemToInventory(droppedItem, section) {
        if (!droppedItem) return false;

        let item;
        let isNewItem = false;
        if (droppedItem.parent === this || this.items.has(droppedItem.id)) {
            item = droppedItem;
            await item.update({ "system.slotType": section });
        } else {
            const itemData = droppedItem.toObject();
            foundry.utils.setProperty(itemData, "system.slotType", section);
            const createdItems = await this.createEmbeddedDocuments("Item", [itemData]);
            item = createdItems[0];
            isNewItem = true;
        }
        if (!item) return false;

        const itemName = item.name;
        const inventory = foundry.utils.deepClone(this.system.inventory || {});
        const targetContainer = inventory[section];
        if (!targetContainer || !Array.isArray(targetContainer.contain)) {
            if (isNewItem) await item.delete();
            return false;
        }

        const requiredSlots = Number(item.system?.requiredSlots ?? 1);

        if (targetContainer.size < targetContainer.contain.length + requiredSlots && targetContainer.contain.length > 0) {
            ui.notifications.error(game.i18n.localize("notifications.errorInventoryFull"));
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

        await this.update({ "system.inventory": inventory });
        return true;
    }

    /**
     * Move an inventory item from one section to another.
     * @param {string} fromSection
     * @param {string} targetSection
     * @param {string} itemId
     * @returns {Promise<boolean>} True if the move succeeded
     */
    async moveInventoryItem(fromSection, targetSection, itemId) {
        if (!fromSection || !targetSection || !itemId || fromSection === targetSection) return false;
        const item = this.items.get(itemId);
        if (!item) return false;

        const added = await this.addItemToInventory(item, targetSection);
        if (!added) return false;

        await this.removeItemFromInventory(itemId, fromSection);
        return true;
    }

    /**
     * Remove an item from an inventory section and delete the embedded Item if it is no longer in any section.
     * @param {string} itemId
     * @param {string} section
     * @returns {Promise<boolean>} True if the item was removed
     */
    async removeItemFromInventory(itemId, section) {
        const inventory = foundry.utils.deepClone(this.system.inventory || {});
        const container = inventory[section];
        if (!itemId || !container || !Array.isArray(container.contain)) return false;

        if (container.contain.some(slot => slot.item === itemId)) {
            inventory[section].contain = container.contain.filter(el => el.item !== itemId);
        } else if (Array.isArray(container.freeSpace) && container.freeSpace.some(slot => slot.item === itemId)) {
            inventory[section].freeSpace = container.freeSpace.filter(slot => slot.item !== itemId);
        } else {
            return false;
        }

        await this.update({ "system.inventory": inventory });

        const item = this.items.get(itemId);
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

    /**
     * Remove an item from an inventory section, post a chat notification, and spawn/add it to a loot chest.
     * @param {string} itemId
     * @param {string} section
     * @returns {Promise<boolean>}
     */
    async dropItemAsLoot(itemId, section) {
        const item = this.items.get(itemId);
        const itemData = item ? item.toObject() : null;

        const removed = await this.removeItemFromInventory(itemId, section);
        if (!removed) return false;

        if (itemData) {
            await this.postRemovedItemChatMessage(itemData);
            await ChestActor.spawnOrAddLoot(this, itemData);
        }
        return true;
    }

    /**
     * Post a chat card notifying that an item was removed from this character's inventory.
     * @param {object} itemData
     * @returns {Promise<ChatMessage>}
     */
    async postRemovedItemChatMessage(itemData) {
        const img = itemData.img || itemData.system?.imageUrl || "icons/svg/item-bag.svg";
        const name = itemData.name || game.i18n.localize("itemSheet.new");
        const description = itemData.system?.description || "";
        const noticeText = game.i18n.format("notifications.itemRemovedNotice", { name }) || `Objet "${name}" retiré de l'inventaire.`;

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

        return ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this }),
            content: chatContent
        });
    }
}

/* -------------------------------------------- */

/**
 * Specialized Actor document for monsters ("zombie"),
 * providing speed/action getters and action dice rolling.
 * @extends {SimpleActor}
 */
export class ZombieActor extends SimpleActor {

    /**
     * Movement speed per action.
     * @type {number}
     */
    get speed() {
        const rawSpeed = this.system?.speed ?? this.system?.stats?.speed ?? 0;
        return Number(rawSpeed) || 0;
    }

    /**
     * Number of actions per round.
     * @type {number}
     */
    get actionNumber() {
        const rawActionNumber = this.system?.actionNumber ?? this.system?.stats?.actionNumber ?? 1;
        const parsed = Number(rawActionNumber);
        return Number.isFinite(parsed) ? parsed : 1;
    }

    /**
     * Success threshold for zombie action rolls.
     * @type {number}
     */
    get thresholdDice() {
        return Math.max(1, Number(this.system?.thresholdDice || 4));
    }

    /**
     * Number of d6 rolled for a zombie action.
     * @type {number}
     */
    get diceNumber() {
        return Math.max(1, Number(this.system?.diceNumber || 1));
    }

    /**
     * Roll the zombie's action dice and send the result to chat.
     * @returns {Promise<ChatMessage>}
     */
    async rollAction() {
        const diceNumber = this.diceNumber;
        const threshold = this.thresholdDice;

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

        const flavorTitle = game.i18n.localize("zombieSheet.rollFlavorTitle");
        const diceRolledLabel = game.i18n.localize("zombieSheet.diceRolledLabel");
        const thresholdLabel = game.i18n.localize("zombieSheet.thresholdLabel");
        const successesLabel = game.i18n.localize("zombieSheet.successesLabel");

        const flavor = `<h3>${this.name} - ${flavorTitle}</h3>` +
            `<p><strong>${diceRolledLabel}</strong> ${diceNumber}d6 | <strong>${thresholdLabel}</strong> ${threshold}+</p>` +
            `<p><strong>${successesLabel}</strong> ${successCount}</p>`;

        return roll.toMessage({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this }),
            flavor
        });
    }
}

/* -------------------------------------------- */

/**
 * Specialized Actor document for containers / loot chests ("chest").
 * @extends {SimpleActor}
 */
export class ChestActor extends SimpleActor {

    /**
     * Find or create the world prototype "Loot" / "Butin" ChestActor.
     * @returns {Promise<ChestActor|null>}
     */
    static async getOrCreateLootPrototype() {
        const defaultLootName = game.i18n.localize("chestSheet.lootName");

        let lootEntryActor = game.actors.find(a =>
            a.type === "chest" &&
            (a.name.toLowerCase() === defaultLootName.toLowerCase() || a.name.toLowerCase() === "butin")
        );

        if (!lootEntryActor) {
            let lootEntryActorData = null;
            try {
                for (const pack of game.packs) {
                    if (pack.metadata.type !== "Actor") continue;
                    const index = await pack.getIndex({ fields: ["type", "name"] });
                    const lootEntry = index.find(e =>
                        e.type === "chest" &&
                        (e.name.toLowerCase() === defaultLootName.toLowerCase() || e.name.toLowerCase() === "butin")
                    );
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

            if (!lootEntryActorData) {
                lootEntryActorData = {
                    name: defaultLootName,
                    type: "chest",
                    img: "icons/svg/chest.svg",
                    system: {
                        foodRations: 0,
                        fuel: 0,
                        notes: ""
                    }
                };
            } else {
                delete lootEntryActorData._id;
                lootEntryActorData.name = defaultLootName;
            }

            lootEntryActor = await Actor.create(lootEntryActorData);
        }

        return lootEntryActor;
    }

    /**
     * Place `itemData` into an existing chest token near `sourceActor` (within 1.5 grid cells),
     * or spawn a new chest token at `sourceActor`'s token position and add the item to it.
     * @param {Actor} sourceActor
     * @param {object} itemData
     * @returns {Promise<Item|undefined>}
     */
    static async spawnOrAddLoot(sourceActor, itemData) {
        if (!itemData) return;
        const lootEntryActor = await this.getOrCreateLootPrototype();
        if (!lootEntryActor) return;

        let targetActor = null;

        if (canvas?.scene && sourceActor) {
            const activeTokens = sourceActor.getActiveTokens();
            const sourceToken = activeTokens[0] || canvas.tokens?.placeables?.find(t => t.actor?.id === sourceActor.id);
            if (sourceToken) {
                const gridSize = canvas.grid.size || 100;
                const nearbyChestToken = canvas.tokens.placeables.find(t => {
                    if (t.actor?.type !== "chest") return false;
                    const dx = Math.abs(sourceToken.x - t.x);
                    const dy = Math.abs(sourceToken.y - t.y);
                    return dx <= (gridSize * 1.5) && dy <= (gridSize * 1.5);
                });

                if (nearbyChestToken?.actor) {
                    targetActor = nearbyChestToken.actor;
                } else {
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

        const newItemData = foundry.utils.deepClone(itemData);
        delete newItemData._id;
        return Item.create(newItemData, { parent: targetActor });
    }
}
