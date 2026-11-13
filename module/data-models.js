const { TypeDataModel } = foundry.abstract;
const fields = foundry.data.fields;

/**
 * Helper to create a schema for an inventory slot entry.
 * @returns {foundry.data.fields.SchemaField}
 */
function createInventorySlotField() {
  return new fields.SchemaField({
    title: new fields.StringField({ required: true, initial: "" }),
    item: new fields.StringField({ required: true, initial: "" })
  });
}

/**
 * Data model for "character" Actors.
 */
export class CharacterData extends TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.StringField({ required: true, initial: "" }),
      quotes: new fields.StringField({ required: true, initial: "" }),
      portraitUrl: new fields.StringField({ required: true, initial: "" }),
      notes: new fields.StringField({ required: true, initial: "" }),
      stats: new fields.SchemaField({
        agility: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 2 }),
        constitution: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 2 }),
        mental: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 2 }),
        speed: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 5 })
      }),
      healthPoints: new fields.ArrayField(
        new fields.StringField({ required: true, initial: "" }),
        { initial: ["", "", "", ""] }
      ),
      armors: new fields.ArrayField(
        new fields.StringField({ required: true, initial: "" }),
        { initial: [] }
      ),
      skills: new fields.ArrayField(
        new fields.SchemaField({
          label: new fields.StringField({ required: true, initial: "" }),
          value: new fields.NumberField({ required: true, nullable: false, initial: 0 })
        }),
        { initial: [] }
      ),
      inventory: new fields.SchemaField({
        belt: new fields.SchemaField({
          size: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 3 }),
          contain: new fields.ArrayField(createInventorySlotField(), { initial: [] })
        }),
        backpack: new fields.SchemaField({
          size: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 6 }),
          contain: new fields.ArrayField(createInventorySlotField(), { initial: [] }),
          freeSpace: new fields.ArrayField(createInventorySlotField(), { initial: [] })
        }),
        equipped: new fields.SchemaField({
          size: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 2 }),
          contain: new fields.ArrayField(createInventorySlotField(), { initial: [] })
        })
      })
    };
  }

  /** @override */
  static migrateData(source) {
    if (Array.isArray(source.skills)) {
      for (const skill of source.skills) {
        if (skill && typeof skill === "object" && skill.value === undefined && skill.val !== undefined) {
          skill.value = Number(skill.val) || 0;
          delete skill.val;
        }
      }
    }
    if (Array.isArray(source.armors)) {
      source.armors = source.armors.map(a => (a === true ? "broken" : (a ? String(a) : "")));
    }
    return super.migrateData(source);
  }
}

/**
 * Data model for "zombie" Actors.
 */
export class ZombieData extends TypeDataModel {
  static defineSchema() {
    return {
      hp: new fields.SchemaField({
        value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 10 }),
        max: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 10 })
      }),
      speed: new fields.NumberField({ required: true, nullable: false, initial: 5 }),
      actionNumber: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 2 }),
      thresholdDice: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 6 }),
      diceNumber: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 1 }),
      notes: new fields.StringField({ required: true, initial: "" })
    };
  }
}

/**
 * Data model for "chest" Actors.
 */
export class ChestData extends TypeDataModel {
  static defineSchema() {
    return {
      foodRations: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      fuel: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      notes: new fields.StringField({ required: true, initial: "" })
    };
  }
}

/**
 * Data model for "item" Items.
 */
export class SimpleItemData extends TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ required: true, initial: "" }),
      imageUrl: new fields.StringField({ required: true, initial: "" }),
      requiredSlots: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 }),
      activeEffects: new fields.ArrayField(
        new fields.SchemaField({
          actionNumber: new fields.StringField({ required: true, initial: "" }),
          dice: new fields.StringField({ required: true, initial: "" }),
          threshold: new fields.StringField({ required: true, initial: "" }),
          ammo: new fields.StringField({ required: true, initial: "" }),
          description: new fields.StringField({ required: true, initial: "" })
        }),
        { initial: [] }
      ),
      passiveEffects: new fields.ArrayField(
        new fields.SchemaField({
          description: new fields.StringField({ required: true, initial: "" })
        }),
        { initial: [] }
      ),
      munitions: new fields.SchemaField({
        capacity: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        loadAmmo: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        remainingAmmo: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
      }),
      slotType: new fields.StringField({ required: true, initial: "" })
    };
  }

  /** @override */
  static migrateData(source) {
    if (Array.isArray(source.activeEffects)) {
      for (const effect of source.activeEffects) {
        if (!effect || typeof effect !== "object") continue;
        for (const key of ["actionNumber", "dice", "threshold", "ammo", "description"]) {
          if (effect[key] !== undefined && effect[key] !== null && typeof effect[key] !== "string") {
            effect[key] = String(effect[key]);
          }
        }
      }
    }
    return super.migrateData(source);
  }
}

