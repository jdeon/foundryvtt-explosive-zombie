import { PathfinderHelper } from "./pathfinderHelper.js";

/**
 * Extend the base TokenDocument to support resource type attributes.
 * @extends {TokenDocument}
 */
export class SimpleTokenDocument extends TokenDocument {

  /** @override */
  _shouldRecordMovementHistory() {
    if (this.actor?.type === "zombie") return true;
    return super._shouldRecordMovementHistory?.() ?? true;
  }

  /** @override */
  async clearMovementHistory() {
    const result = await super.clearMovementHistory?.();
    if (this.getFlag("explosive-zombie", "usedActions")) {
      await this.unsetFlag("explosive-zombie", "usedActions");
    }
    this.object?.renderFlags?.set({ refreshBorder: true, refreshState: true });
    return result;
  }
}


/* -------------------------------------------- */


/**
 * Custom TokenRuler that hides the ruler during token drag when pathfinding is enabled,
 * while still allowing the movement history ruler to be displayed on hover.
 * @extends {foundry.canvas.placeables.tokens.TokenRuler}
 */
export class SimpleTokenRuler extends foundry.canvas.placeables.tokens.TokenRuler {
  /** @override */
  get isVisible() {
    if (this.token?.shouldHideDragRuler()) {
      return false;
    }
    return super.isVisible;
  }
}

/**
 * Extend the base Token class to implement additional system-specific logic.
 * @extends {foundry.canvas.placeables.Token}
 */
export class SimpleToken extends foundry.canvas.placeables.Token {
  constructor(document) {
    if (new.target === SimpleToken && document?.actor?.type === "zombie") {
      return new MonsterToken(document);
    }
    super(document);
  }

  /**
   * Movement highlight border colors.
   */
  static MOVEMENT_COLORS = {
    NOT_MOVED: 0x2ecc71,   // Green (distance === 0)
    BELOW_SPEED: 0xff9800, // Orange (0 < distance < speed * actionNumber)
    OVER_SPEED: 0xe74c3c   // Red (distance >= speed * actionNumber)
  };

  /**
   * Whether token selection is restricted to monster tokens.
   * @type {boolean}
   */
  static selectUnlinkedOnly = false;

  /**
   * Toggle whether only monster tokens can be selected, releasing any currently
   * controlled non-monster tokens when enabled and refreshing all token borders.
   * @param {boolean} active
   */
  static setSelectUnlinkedOnly(active) {
    if (!game.user?.isGM) return;
    this.selectUnlinkedOnly = Boolean(active);
    if (!canvas?.tokens) return;

    if (this.selectUnlinkedOnly) {
      for (const token of [...canvas.tokens.controlled]) {
        if (!(token instanceof MonsterToken)) {
          token.release();
        }
      }
    }

    for (const token of canvas.tokens.placeables) {
      token.renderFlags.set({ refreshBorder: true, refreshState: true });
    }
  }

  /**
   * Mark non-movement action(s) as used for all selected monster tokens (or a provided list of tokens).
   * Intended to be called from a Macro, e.g. `game.explosiveZombie.useAction()` or `SimpleToken.useActionForSelected()`.
   * @param {number} [count=1]
   * @param {SimpleToken[]} [tokens]
   * @returns {Promise<MonsterToken[]>}
   */
  static async useActionForSelected(count = 1, tokens = canvas?.tokens?.controlled ?? []) {
    const targets = Array.from(tokens).filter(t => t instanceof MonsterToken);
    await Promise.all(targets.map(t => t.useAction(count)));
    return targets;
  }

  /**
   * Reset non-movement action(s) for all selected monster tokens (or a provided list of tokens).
   * @param {SimpleToken[]} [tokens]
   * @returns {Promise<MonsterToken[]>}
   */
  static async resetActionsForSelected(tokens = canvas?.tokens?.controlled ?? []) {
    const targets = Array.from(tokens).filter(t => t instanceof MonsterToken);
    await Promise.all(targets.map(t => t.resetUsedActions()));
    return targets;
  }

  /**
   * Reset non-movement action(s) for all monster tokens in the given scene (e.g. on a new combat round).
   * @param {Scene} [scene]
   * @returns {Promise<void>}
   */
  static async resetAllUsedActions(scene = canvas?.scene) {
    if (!game.user?.isGM || !scene?.tokens) return;

    const updates = [];
    for (const tokenDoc of scene.tokens) {
      if (tokenDoc.actor?.type !== "zombie") continue;
      if (tokenDoc.getFlag("explosive-zombie", "usedActions") !== undefined) {
        updates.push(tokenDoc.unsetFlag("explosive-zombie", "usedActions"));
      }
      if (Array.isArray(tokenDoc.movementHistory) && tokenDoc.movementHistory.length > 0) {
        updates.push(tokenDoc.clearMovementHistory?.());
      }
    }
    if (updates.length) await Promise.all(updates);

    if (canvas?.tokens?.placeables) {
      for (const token of canvas.tokens.placeables) {
        if (token instanceof MonsterToken) {
          token.renderFlags.set({ refreshBorder: true, refreshState: true });
        }
      }
    }
  }

  /**
   * Whether the movement ruler should be hidden because this token is currently
   * being dragged while pathfinding is enabled.
   * @returns {boolean}
   */
  shouldHideDragRuler() {
    return false;
  }

  /** @override */
  _canControl(user, event) {
    if (game.user?.isGM && SimpleToken.selectUnlinkedOnly) {
      return false;
    }
    return super._canControl(user, event);
  }
}

/* -------------------------------------------- */

/**
 * Specialized Token class for Monster ("zombie") actors, handling action tracking,
 * segmented movement borders, and swarm pathfinding.
 * @extends {SimpleToken}
 */
export class MonsterToken extends SimpleToken {

  /**
   * Compute total distance moved by this token from Foundry v13's movementHistory.
   * @returns {number}
   */
  getMovedDistance() {
    const history = this.document?.movementHistory;
    if (!Array.isArray(history) || history.length === 0) return 0;

    if (typeof this.document.measureMovementPath === "function") {
      const measured = this.document.measureMovementPath(history);
      if (typeof measured?.distance === "number") return measured.distance;
      if (typeof measured?.cost === "number") return measured.cost;
    }

    if (canvas?.grid?.measurePath && history.length >= 2) {
      const measured = canvas.grid.measurePath(history);
      if (typeof measured?.distance === "number") return measured.distance;
    }

    let totalCost = 0;
    for (const wp of history) {
      if (typeof wp?.cost === "number") totalCost += wp.cost;
    }
    return totalCost;
  }

  /**
   * Get the speed attribute of the token's actor.
   * @returns {number}
   */
  getActorSpeed() {
    const rawSpeed = this.actor?.system?.speed ?? this.actor?.system?.stats?.speed ?? 0;
    return Number(rawSpeed) || 0;
  }

  /**
   * Get the action number attribute of the token's actor.
   * @returns {number}
   */
  getActorActionNumber() {
    const rawActionNumber = this.actor?.system?.actionNumber ?? this.actor?.system?.stats?.actionNumber ?? 1;
    const parsed = Number(rawActionNumber);
    return Number.isFinite(parsed) ? parsed : 1;
  }

  /**
   * Get the number of non-movement actions manually marked as used on this token.
   * @returns {number}
   */
  getUsedActions() {
    const raw = this.document?.getFlag("explosive-zombie", "usedActions") ?? 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  /**
   * Mark one or more non-movement actions as used on this token (pass a negative count to refund).
   * @param {number} [count=1]
   * @returns {Promise<number>} The updated number of used non-movement actions
   */
  async useAction(count = 1) {
    const delta = Number(count) || 0;
    const next = Math.max(0, this.getUsedActions() + delta);
    if (next === 0) {
      await this.document?.unsetFlag("explosive-zombie", "usedActions");
    } else {
      await this.document?.setFlag("explosive-zombie", "usedActions", next);
    }
    this.renderFlags.set({ refreshBorder: true, refreshState: true });
    return next;
  }

  /**
   * Reset non-movement actions used on this token back to 0.
   * @returns {Promise<void>}
   */
  async resetUsedActions() {
    if (this.document?.getFlag("explosive-zombie", "usedActions") !== undefined) {
      await this.document.unsetFlag("explosive-zombie", "usedActions");
    }
    this.renderFlags.set({ refreshBorder: true, refreshState: true });
  }

  /**
   * Get the movement status color for each action segment of a monster token.
   * Each action covers `speed` distance, and each manually used action consumes one full segment:
   * - Green (NOT_MOVED): action untouched
   * - Orange (BELOW_SPEED): action partially used
   * - Red (OVER_SPEED): action fully spent
   * @returns {number[]}
   */
  getActionSegmentColors() {
    const distance = this.getMovedDistance();
    const speed = this.getActorSpeed();
    const usedActions = this.getUsedActions();
    const actionCount = Math.max(1, Math.round(this.getActorActionNumber()));
    const effectiveDistance = distance + usedActions * speed;

    const colors = [];
    for (let i = 0; i < actionCount; i++) {
      if (speed <= 0) {
        colors.push(
          i < usedActions || distance > 0
            ? SimpleToken.MOVEMENT_COLORS.OVER_SPEED
            : SimpleToken.MOVEMENT_COLORS.NOT_MOVED
        );
        continue;
      }
      if (effectiveDistance <= 0) {
        colors.push(SimpleToken.MOVEMENT_COLORS.NOT_MOVED);
        continue;
      }
      const actionDist = effectiveDistance - i * speed;
      if (actionDist <= 0) {
        colors.push(SimpleToken.MOVEMENT_COLORS.NOT_MOVED);
      } else if (actionDist < speed) {
        colors.push(SimpleToken.MOVEMENT_COLORS.BELOW_SPEED);
      } else {
        colors.push(SimpleToken.MOVEMENT_COLORS.OVER_SPEED);
      }
    }
    return colors;
  }

  /**
   * Get the overall movement status color for a monster token.
   * @returns {number}
   */
  getMovementHighlightColor() {
    const speed = this.getActorSpeed();
    const effectiveDistance = this.getMovedDistance() + this.getUsedActions() * speed;
    if (effectiveDistance <= 0 && this.getUsedActions() <= 0) {
      return SimpleToken.MOVEMENT_COLORS.NOT_MOVED;
    }
    const maxDistance = speed * this.getActorActionNumber();
    if (effectiveDistance >= maxDistance) return SimpleToken.MOVEMENT_COLORS.OVER_SPEED;
    return SimpleToken.MOVEMENT_COLORS.BELOW_SPEED;
  }

  /**
   * Draw the segmented circular arc border for a monster token.
   * @param {number} thickness
   */
  _drawSegmentedActionBorder(thickness) {
    this.border.clear();
    if (this.border.parent === this) {
      this.border.position.set(0, 0);
    } else {
      this.border.position.set(this.x, this.y);
    }
    this.border.visible = this.isVisible;

    const cx = this.w / 2;
    const cy = this.h / 2;
    const radius = Math.min(this.w, this.h) / 2;
    if (radius <= 0) return;

    // Draw dark backing ring
    this.border.lineStyle(thickness, 0x000000, 0.85).drawCircle(cx, cy, radius);

    const segmentColors = this.getActionSegmentColors();
    const count = segmentColors.length;
    const fullCircle = Math.PI * 2;
    const segAngle = fullCircle / count;
    const halfGap = count > 1 ? Math.min(0.08, segAngle * 0.08) : 0;
    const baseAngle = -Math.PI / 2; // Start at 12 o'clock (top)

    for (let i = 0; i < count; i++) {
      const startAngle = baseAngle + i * segAngle + halfGap;
      const endAngle = baseAngle + (i + 1) * segAngle - halfGap;
      if (endAngle <= startAngle) continue;

      this.border.lineStyle(thickness / 2, Number(segmentColors[i]), 1.0);
      this.border.moveTo(
        cx + radius * Math.cos(startAngle),
        cy + radius * Math.sin(startAngle)
      );
      this.border.arc(cx, cy, radius, startAngle, endAngle);
    }

    if (this.controlled) {
      this.border.lineStyle(Math.max(2, thickness / 2), 0xffffff, 0.95)
        .drawCircle(cx, cy, radius + 3);
    }
  }

  /** @override */
  shouldHideDragRuler() {
    return Boolean(game.user?.isGM && PathfinderHelper.enabled && (this.isDragged || this._original));
  }

  /** @override */
  get showRuler() {
    if (this.shouldHideDragRuler()) {
      return false;
    }
    return super.showRuler;
  }

  /** @override */
  _canControl(user, event) {
    if (game.user?.isGM && SimpleToken.selectUnlinkedOnly) {
      return true;
    }
    return super._canControl(user, event);
  }

  /** @override */
  _getBorderColor(options) {
    if (game.user?.isGM && SimpleToken.selectUnlinkedOnly) {
      return this.getMovementHighlightColor();
    }
    return super._getBorderColor(options);
  }

  /** @override */
  _refreshBorder() {
    if (!this.border) return;
    if (game.user?.isGM && SimpleToken.selectUnlinkedOnly) {
      const thickness = CONFIG.Canvas.objectBorderThickness || 4;
      this._drawSegmentedActionBorder(thickness);
      return;
    }
    super._refreshBorder();
  }

  /** @override */
  _refreshState() {
    super._refreshState();
    if (this.shouldHideDragRuler() && this.ruler) {
      this.ruler.visible = false;
    }
    if (game.user?.isGM && SimpleToken.selectUnlinkedOnly) {
      this._refreshBorder();
    }
  }

  /** @override */
  _refreshRuler() {
    if (this.shouldHideDragRuler()) {
      if (this.ruler) {
        this.ruler.clear?.();
        this.ruler.visible = false;
      }
      return;
    }
    return super._refreshRuler?.();
  }

  /** @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (game.user?.isGM && SimpleToken.selectUnlinkedOnly) {
      this.renderFlags.set({ refreshBorder: true });
    }
  }

  /** @override */
  _onDragLeftDrop(event) {
    if (!game.user?.isGM || !PathfinderHelper.enabled || !canvas?.tokens) {
      return super._onDragLeftDrop(event);
    }

    const swarmTokens = canvas.tokens.controlled.filter(t => t instanceof MonsterToken);
    if (swarmTokens.length === 0) {
      return super._onDragLeftDrop(event);
    }

    const clones = event.interactionData?.clones || [];
    const myClone = clones.find(c => c._original === this) || clones[0];

    let dropX = myClone?.document?.x ?? myClone?.x;
    let dropY = myClone?.document?.y ?? myClone?.y;

    if ((dropX === undefined || (dropX === this.document.x && dropY === this.document.y)) && event.interactionData?.destination) {
      const originX = event.interactionData.origin?.x ?? this.center.x;
      const originY = event.interactionData.origin?.y ?? this.center.y;
      dropX = this.document.x + (event.interactionData.destination.x - originX);
      dropY = this.document.y + (event.interactionData.destination.y - originY);
    }

    if (dropX === undefined || dropY === undefined) {
      return super._onDragLeftDrop(event);
    }

    this._executeSwarmMove(swarmTokens, dropX, dropY);
    return false;
  }

  /**
   * Move a swarm of monster tokens toward (dropX, dropY), pathfinding around walls
   * and other tokens while clamping each token's movement to its remaining speed.
   * @param {MonsterToken[]} swarmTokens
   * @param {number} dropX
   * @param {number} dropY
   */
  async _executeSwarmMove(swarmTokens, dropX, dropY) {
    return PathfinderHelper.executeSwarmMove(this, swarmTokens, dropX, dropY);
  }
}
