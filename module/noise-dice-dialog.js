import { ZombieActor } from "./actor.js";

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
      width: "auto",
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
    return Number(scene.getFlag("explosive-zombie", "noiseDice")) || 0;
  }

  /** @override */
  async _prepareContext(_options) {
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

    // Apply specific classes and width for GM vs Client (Player)
    this.element.classList.toggle("is-gm", context.isGM);
    this.element.classList.toggle("player-view", !context.isGM);

    // Enforce tight auto-sizing on window and content
    this.element.style.minWidth = "100px";

    const contentElem = this.element.querySelector(".window-content");
    if (contentElem) {
      contentElem.style.height = "auto";
      contentElem.style.minHeight = "0";
    }

    const html = $(this.element);

    // Hide close action:
    if (this.window.close) {
      this.window.close.hidden = true;
    }

    if (context.isGM) {
      html.find('[data-action="roll"], .noise-value-box').off("click").on("click", (e) => {
        e.preventDefault();
        this._rollDice();
      });


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
   * Roll the current number of d6 dice into chat
   * @private
   */
  async _rollDice() {
    const count = this.noiseCount;
    if (count <= 0) return;

    const scene = this.currentScene;
    const roll = new Roll(`${count}d6`);
    await roll.evaluate();

    await this._resetCount();

    const flavor = game.i18n.localize("noiseDice.title");
    const speaker = ChatMessage.getSpeaker({ scene });
    const zombieCount = Math.max(0, Number(roll.total) || 0);

    return roll.toMessage({
      speaker,
      flavor,
      flags: {
        "explosive-zombie": {
          noiseRoll: true,
          zombieCount,
          spawned: false
        }
      }
    });
  }

  /**
   * Inject a GM-only Zombie Actor dropzone and "Spawn X Zombies" button onto Noise Dice roll chat cards.
   * @param {ChatMessage} message
   * @param {HTMLElement|jQuery} html
   */
  static onRenderChatMessage(message, html) {
    if (!game.user?.isGM) return;
    if (!message.getFlag("explosive-zombie", "noiseRoll")) return;

    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    if (root.querySelector(".noise-spawn-zombies-container")) return;

    const zombieCount = Math.max(
      0,
      Number(message.getFlag("explosive-zombie", "zombieCount")) || Number(message.rolls?.[0]?.total) || 0
    );
    if (zombieCount <= 0) return;

    const isSpawned = Boolean(message.getFlag("explosive-zombie", "spawned"));
    const selectedUuid = message.getFlag("explosive-zombie", "zombieActorUuid") || "";
    const selectedName = message.getFlag("explosive-zombie", "zombieActorName") || "";
    const selectedImg = message.getFlag("explosive-zombie", "zombieActorImg") || "";

    // Look up default zombie name/img if none was explicitly dropped yet
    const defaultActor = !selectedUuid
      ? (game.actors?.find(a => a.type === "zombie" && (a.name.toLowerCase() === "zombie basique" || a.name.toLowerCase() === "zombie"))
        || game.actors?.find(a => a.type === "zombie"))
      : null;

    const displayName = selectedName || defaultActor?.name || game.i18n.localize("TYPES.Actor.zombie");
    const displayImg = selectedImg || defaultActor?.img || "icons/svg/skull.svg";

    const container = document.createElement("div");
    container.className = "noise-spawn-zombies-container";

    // Droppable source zombie slot
    const dropzone = document.createElement("div");
    dropzone.className = `noise-zombie-dropzone${selectedUuid ? " has-custom-actor" : ""}${isSpawned ? " is-disabled" : ""}`;
    dropzone.title = game.i18n.localize("noiseDice.dropZombieHint");

    const avatar = document.createElement("img");
    avatar.className = "noise-zombie-avatar";
    avatar.src = displayImg;
    avatar.alt = displayName;
    dropzone.appendChild(avatar);

    const info = document.createElement("div");
    info.className = "noise-zombie-info";

    const nameEl = document.createElement("span");
    nameEl.className = "noise-zombie-name";
    nameEl.textContent = displayName;
    info.appendChild(nameEl);

    if (!isSpawned) {
      const hintEl = document.createElement("span");
      hintEl.className = "noise-zombie-hint";
      hintEl.textContent = game.i18n.localize("noiseDice.dropZombieHint");
      info.appendChild(hintEl);
    }

    dropzone.appendChild(info);
    container.appendChild(dropzone);

    // Spawn button
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `noise-spawn-zombies-btn${isSpawned ? " is-spawned" : ""}`;
    btn.disabled = isSpawned;

    const icon = document.createElement("i");
    icon.className = isSpawned ? "fas fa-check" : "fas fa-skull";
    btn.appendChild(icon);

    const span = document.createElement("span");
    span.textContent = isSpawned
      ? game.i18n.format("noiseDice.spawnedButton", { count: zombieCount, name: displayName })
      : game.i18n.format("noiseDice.spawnButton", { count: zombieCount, name: displayName });
    btn.appendChild(span);

    if (!isSpawned) {
      // Handle dropping a Zombie Actor onto the chat message or dropzone
      const handleDragOver = (ev) => {
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
        dropzone.classList.add("drag-over");
      };

      const handleDragLeave = (ev) => {
        if (!root.contains(ev.relatedTarget)) {
          dropzone.classList.remove("drag-over");
        }
      };

      const handleDrop = async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        dropzone.classList.remove("drag-over");

        let data = null;
        try {
          const getDragData = foundry.applications?.ux?.TextEditor?.implementation?.getDragEventData
            || globalThis.TextEditor?.getDragEventData;
          data = getDragData ? getDragData(ev) : JSON.parse(ev.dataTransfer.getData("text/plain"));
        } catch (_err) {
          return;
        }

        if (!data || data.type !== "Actor") {
          ui.notifications.warn(game.i18n.localize("noiseDice.invalidZombieDrop"));
          return;
        }

        const droppedActor = await Actor.implementation.fromDropData(data).catch(() => null);
        if (!droppedActor || droppedActor.type !== "zombie") {
          ui.notifications.warn(game.i18n.localize("noiseDice.invalidZombieDrop"));
          return;
        }

        await message.update({
          "flags.explosive-zombie.zombieActorUuid": droppedActor.uuid,
          "flags.explosive-zombie.zombieActorName": droppedActor.name,
          "flags.explosive-zombie.zombieActorImg": droppedActor.img || "icons/svg/skull.svg"
        });
      };

      root.addEventListener("dragover", handleDragOver);
      root.addEventListener("dragleave", handleDragLeave);
      root.addEventListener("drop", handleDrop);

      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        btn.disabled = true;
        const sourceUuid = message.getFlag("explosive-zombie", "zombieActorUuid") || null;
        const created = await ZombieActor.spawnZombies(zombieCount, canvas?.scene, sourceUuid);
        if (created.length > 0) {
          await message.setFlag("explosive-zombie", "spawned", true);
        } else {
          btn.disabled = false;
        }
      });
    }

    container.appendChild(btn);

    const messageContent = root.querySelector(".message-content") || root;
    messageContent.appendChild(container);
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
    const next = current + delta;
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
  static onUpdateScene(scene, _change) {
    const current = canvas?.scene || game.scenes?.current;
    if (current && scene.id === current.id) {
      const app = this.instance;
      if (app.rendered) {
        app.render();
      }
    }
  }
}
