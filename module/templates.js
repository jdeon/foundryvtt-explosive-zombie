/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {

  // Define template paths to load
  const templatePaths = [
    "systems/explosive-zombie/templates/parts/sheet-attributes.html",
    "systems/explosive-zombie/templates/parts/sheet-groups.html",
    "systems/explosive-zombie/templates/parts/item-tab-sheet.html",
    "systems/explosive-zombie/templates/parts/item-tab-edit.html",
    "systems/explosive-zombie/templates/parts/item-tab-attributes.html",
    "systems/explosive-zombie/templates/parts/actor-tab-sheet.html",
    "systems/explosive-zombie/templates/parts/actor-tab-edit.html",
    "systems/explosive-zombie/templates/parts/actor-tab-items.html",
    "systems/explosive-zombie/templates/parts/actor-tab-attributes.html"
  ];

  // Load the template parts
  return loadTemplates(templatePaths);
};