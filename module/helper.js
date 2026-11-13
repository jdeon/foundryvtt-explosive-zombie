export class EntitySheetHelper {

  /**
   * Ensure array fields submitted via form inputs with numeric index keys
   * (e.g. system.skills.0.value) are converted into true JS arrays in formData.
   * @param {object} formData   The form data object to modify keys and values for.
   * @param {string[]} arrayPaths Array of field paths within system data expected to be arrays.
   * @returns {object} The updated formData object.
   */
  static updateArrays(formData, arrayPaths = []) {
    const expanded = foundry.utils.expandObject(formData);
    for (const path of arrayPaths) {
      const val = foundry.utils.getProperty(expanded, path);
      if (val !== undefined && typeof val === "object" && val !== null && !Array.isArray(val)) {
        const arr = Object.keys(val)
          .sort((a, b) => Number(a) - Number(b))
          .map(k => val[k]);

        // Remove flat keys starting with `${path}.` from formData
        const prefix = `${path}.`;
        for (const k of Object.keys(formData)) {
          if (k.startsWith(prefix)) delete formData[k];
        }
        formData[path] = arr;
      }
    }
    return formData;
  }
}
