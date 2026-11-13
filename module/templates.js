/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {

  // Define template paths to load
  const templatePaths = [
    "systems/explosive-zombie/templates/parts/item-tab-sheet.html",
    "systems/explosive-zombie/templates/parts/item-tab-edit.html",
    "systems/explosive-zombie/templates/parts/actor-tab-sheet.html",
    "systems/explosive-zombie/templates/parts/actor-tab-edit.html",
    "systems/explosive-zombie/templates/parts/actor-tab-items.html",
    "systems/explosive-zombie/templates/parts/zombie-tab-sheet.html",
    "systems/explosive-zombie/templates/parts/chest-tab-sheet.html",
    "systems/explosive-zombie/templates/parts/noise-dice-dialog.html",
    "systems/explosive-zombie/templates/parts/roll-dialog.html",
    "systems/explosive-zombie/templates/parts/roll-chat-card.html",
    "systems/explosive-zombie/templates/parts/item-chat-card.html",
    "systems/explosive-zombie/templates/parts/variable-ammo-dialog.html"
  ];

  // Load the template parts
  return foundry.applications.handlebars.loadTemplates(templatePaths);
};
