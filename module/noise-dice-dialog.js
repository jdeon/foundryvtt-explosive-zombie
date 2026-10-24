const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Noise Dice Counter Dialog for Scenes
 * Displays the current scene's noise dice count.
 * Players have read-only view; GM can increase or decrease noise dice.
 * @extends {foundry.applications.api.ApplicationV2}
 */
export class NoiseDiceDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * Singleton instance
   * @type {NoiseDiceDialog|null}
   * @private
   */
  static #instance = null;

  /**
   * Get singleton instance
   * @type {NoiseDiceDialog}
   */
  static get instance() {
    if (!this.#instance) {
      this.#instance = new NoiseDiceDialog();
    }
    return this.#instance;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "noise-dice-dialog",
    classes: ["noise-dice-window"],
    tag: "div",
    window: {
      title: "noiseDice.title",
      icon: "fas fa-dice-d6",
      resizable: false
    },
    position: {
      width: 175,
      height: "auto",
      top: 100,
      left: 120
    }
  };

  /** @override */
  static PARTS = {
    content: {
      template: "systems/explosive-zombie/templates/parts/noise-dice-dialog.html"
    }
  };

  /**
   * Window title
   * @type {string}
   */
  get title() {
    return game.i18n.localize("noiseDice.title");
  }

  /**
   * Current active scene
   * @type {Scene|null}
   */
  get currentScene() {
    return canvas?.scene || game.scenes?.current || null;
  }

  /**
   * Current noise count for the active scene
   * @type {number}
   */
  get noiseCount() {
    const scene = this.currentScene;
    if (!scene) return 0;
    return Math.max(0, Number(scene.getFlag("explosive-zombie", "noiseDice")) || 0);
  }

  /** @override */
  async _prepareContext(options) {
    const count = this.noiseCount;
    const isGM = Boolean(game.user?.isGM);

    return {
      count,
      isGM,
      canDecrease: isGM && count > 0
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Enforce tight auto-sizing on window and content
    this.element.style.height = "auto";
    this.element.style.minHeight = "0";
    const contentElem = this.element.querySelector(".window-content");
    if (contentElem) {
      contentElem.style.height = "auto";
      contentElem.style.minHeight = "0";
    }

    const html = $(this.element);

    if (context.isGM) {
      html.find('[data-action="increase"]').off("click").on("click", (e) => {
        e.preventDefault();
        this._modifyCount(1);
      });

      html.find('[data-action="decrease"]').off("click").on("click", (e) => {
        e.preventDefault();
        this._modifyCount(-1);
      });

      html.find('[data-action="reset"]').off("click").on("click", (e) => {
        e.preventDefault();
        this._resetCount();
      });
    }
  }

  /**
   * Modify count by delta (+1 or -1)
   * @param {number} delta
   * @private
   */
  async _modifyCount(delta) {
    if (!game.user.isGM) return;
    const scene = this.currentScene;
    if (!scene) return;
    const current = this.noiseCount;
    const next = Math.max(0, current + delta);
    await scene.setFlag("explosive-zombie", "noiseDice", next);
  }

  /**
   * Reset count to 0
   * @private
   */
  async _resetCount() {
    if (!game.user.isGM) return;
    const scene = this.currentScene;
    if (!scene) return;
    await scene.setFlag("explosive-zombie", "noiseDice", 0);
  }

  /**
   * Toggle open/closed state
   */
  static async toggle() {
    const app = this.instance;
    if (app.rendered) {
      return app.close();
    } else {
      return app.render(true);
    }
  }

  /**
   * Handle canvasReady hook
   * @param {Scene} scene
   */
  static async onCanvasReady(scene) {
    if (!scene) return;
    const app = this.instance;
    if (app.rendered) {
      app.render();
    } else {
      app.render(true);
    }
  }

  /**
   * Handle updateScene hook
   * @param {Scene} scene
   * @param {object} change
   */
  static onUpdateScene(scene, change) {
    const current = canvas?.scene || game.scenes?.current;
    if (current && scene.id === current.id) {
      const app = this.instance;
      if (app.rendered) {
        app.render();
      }
    }
  }
}
