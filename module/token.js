/**
 * Extend the base TokenDocument to support resource type attributes.
 * @extends {TokenDocument}
 */
export class SimpleTokenDocument extends TokenDocument {

  /** @inheritdoc */
  getBarAttribute(barName, { alternative } = {}) {
    const data = super.getBarAttribute(barName, { alternative });
    const attr = alternative || this[barName]?.attribute;
    if (!data || !attr || !this.actor) return data;
    const current = foundry.utils.getProperty(this.actor.system, attr);
    if (current?.dtype === "Resource") data.min = parseInt(current.min || 0);
    data.editable = true;
    return data;
  }

  /* -------------------------------------------- */

  static getTrackedAttributes(data, _path = []) {
    if (data || _path.length) return super.getTrackedAttributes(data, _path);
    data = {};
    for (const model of Object.values(game.system.model.Actor)) {
      foundry.utils.mergeObject(data, model);
    }
    for (const actor of game.actors) {
      if (actor.isTemplate) foundry.utils.mergeObject(data, actor.toObject());
    }
    return super.getTrackedAttributes(data);
  }

  /** @override */
  _shouldRecordMovementHistory() {
    if (!this.actorLink) return true;
    return super._shouldRecordMovementHistory?.() ?? true;
  }

  /** @override */
  async clearMovementHistory() {
    const result = await super.clearMovementHistory?.();
    this.object?.renderFlags?.set({ refreshBorder: true, refreshState: true });
    return result;
  }
}


/* -------------------------------------------- */


/**
 * Extend the base Token class to implement additional system-specific logic.
 * @extends {foundry.canvas.placeables.Token}
 */
export class SimpleToken extends foundry.canvas.placeables.Token {
  /**
   * Movement highlight border colors.
   */
  static MOVEMENT_COLORS = {
    NOT_MOVED: 0x2ecc71,   // Green (distance === 0)
    BELOW_SPEED: 0xff9800, // Orange (0 < distance <= speed)
    OVER_SPEED: 0xe74c3c   // Red (distance > speed)
  };

  /**
   * Whether token selection is restricted to unlinked tokens (NPCs).
   * @type {boolean}
   */
  static selectUnlinkedOnly = false;

  /**
   * Toggle whether only unlinked tokens can be selected, releasing any currently
   * controlled linked tokens when enabled and refreshing all token borders.
   * @param {boolean} active
   */
  static setSelectUnlinkedOnly(active) {
    this.selectUnlinkedOnly = Boolean(active);
    if (!canvas?.tokens) return;

    if (this.selectUnlinkedOnly) {
      for (const token of [...canvas.tokens.controlled]) {
        if (token.document?.actorLink) {
          token.release();
        }
      }
    }

    for (const token of canvas.tokens.placeables) {
      token.renderFlags.set({ refreshBorder: true, refreshState: true });
    }
  }

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
   * Get the movement status color for an unlinked NPC token.
   * @returns {number}
   */
  getMovementHighlightColor() {
    const distance = this.getMovedDistance();
    if (distance <= 0) return SimpleToken.MOVEMENT_COLORS.NOT_MOVED;
    const speed = this.getActorSpeed();
    if (distance <= speed) return SimpleToken.MOVEMENT_COLORS.BELOW_SPEED;
    return SimpleToken.MOVEMENT_COLORS.OVER_SPEED;
  }

  /** @override */
  _canControl(user, event) {
    if (SimpleToken.selectUnlinkedOnly && this.document?.actorLink) {
      return false;
    }
    return super._canControl(user, event);
  }

  /** @override */
  _getBorderColor(options) {
    if (SimpleToken.selectUnlinkedOnly && !this.document?.actorLink) {
      return this.getMovementHighlightColor();
    }
    return super._getBorderColor(options);
  }

  /** @override */
  _refreshBorder() {
    if (!this.border) return;
    const shape = this.getShape?.();
    const thickness = CONFIG.Canvas.objectBorderThickness || 4;

    if (shape instanceof PIXI.Polygon) {
      this.border.clear();
      const borderColor = this._getBorderColor();
      if (!borderColor) {
        this.border.visible = false;
        return;
      }
      const color = Number(borderColor);
      if (this.border.parent === this) {
        this.border.position.set(0, 0);
      } else {
        this.border.position.set(this.x, this.y);
      }
      this.border.visible = this.isVisible;
      this.border.lineStyle(thickness, 0x000000, 0.8).drawPolygon(shape.points);
      this.border.lineStyle(thickness / 2, color, 1.0).drawPolygon(shape.points);
    } else {
      try {
        super._refreshBorder();
      } catch (_err) {
        this.border.clear();
        const borderColor = this._getBorderColor();
        if (!borderColor) {
          this.border.visible = false;
          return;
        }
        const color = Number(borderColor);
        if (this.border.parent === this) {
          this.border.position.set(0, 0);
        } else {
          this.border.position.set(this.x, this.y);
        }
        this.border.visible = this.isVisible;
        this.border.lineStyle(thickness, 0x000000, 0.8).drawRect(0, 0, this.w, this.h);
        this.border.lineStyle(thickness / 2, color, 1.0).drawRect(0, 0, this.w, this.h);
      }
    }

    if (SimpleToken.selectUnlinkedOnly && !this.document?.actorLink) {
      this.border.visible = this.isVisible;
      if (this.controlled) {
        this.border.lineStyle(Math.max(2, thickness / 2), 0xffffff, 0.95)
          .drawRect(-3, -3, this.w + 6, this.h + 6);
      }
    }
  }

  /** @override */
  _refreshState() {
    super._refreshState();
    if (SimpleToken.selectUnlinkedOnly && !this.document?.actorLink) {
      this._refreshBorder();
    }
  }

  /** @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (SimpleToken.selectUnlinkedOnly && !this.document?.actorLink) {
      this.renderFlags.set({ refreshBorder: true });
    }
  }

  /** @override */
  _onDragLeftDrop(event) {
    if (!SimpleToken.selectUnlinkedOnly || this.document?.actorLink || !canvas?.tokens) {
      return super._onDragLeftDrop(event);
    }

    const swarmTokens = canvas.tokens.controlled.filter(t => !t.document?.actorLink);
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
   * Move a swarm of unlinked tokens toward (dropX, dropY), pathfinding around walls
   * and other tokens while clamping each token's movement to its remaining speed.
   * @param {SimpleToken[]} swarmTokens
   * @param {number} dropX
   * @param {number} dropY
   */
  async _executeSwarmMove(swarmTokens, dropX, dropY) {
    const gridSizeX = canvas.grid?.sizeX || canvas.grid?.size || 100;
    const gridSizeY = canvas.grid?.sizeY || canvas.grid?.size || 100;
    const gridDistance = Number(canvas.scene?.grid?.distance) || 1;

    const toCell = (x, y) => {
      if (canvas.grid?.getOffset) {
        const { i, j } = canvas.grid.getOffset({ x: x + gridSizeX / 2, y: y + gridSizeY / 2 });
        return { col: j, row: i };
      }
      return { col: Math.round(x / gridSizeX), row: Math.round(y / gridSizeY) };
    };

    const toTopLeft = (col, row) => {
      if (canvas.grid?.getTopLeftPoint) {
        return canvas.grid.getTopLeftPoint({ i: row, j: col });
      }
      return { x: col * gridSizeX, y: row * gridSizeY };
    };

    const toCenter = (col, row, token) => {
      const tl = toTopLeft(col, row);
      return {
        x: tl.x + (token?.w || gridSizeX) / 2,
        y: tl.y + (token?.h || gridSizeY) / 2
      };
    };

    const cellKey = (col, row) => `${col},${row}`;

    // Cache wall collision checks between adjacent grid cells
    const wallCache = new Map();
    const isStepBlockedByWall = (c1, r1, c2, r2, refToken) => {
      const key = c1 < c2 || (c1 === c2 && r1 < r2)
        ? `${c1},${r1}->${c2},${r2}`
        : `${c2},${r2}->${c1},${r1}`;
      if (wallCache.has(key)) return wallCache.get(key);

      const origin = toCenter(c1, r1, refToken);
      const dest = toCenter(c2, r2, refToken);
      const blocked = Boolean(refToken.checkCollision(dest, {
        origin,
        type: "move",
        mode: "any"
      }));
      wallCache.set(key, blocked);
      return blocked;
    };

    const canStep = (c1, r1, c2, r2, refToken) => {
      if (isStepBlockedByWall(c1, r1, c2, r2, refToken)) return false;
      const dc = c2 - c1;
      const dr = r2 - r1;
      if (dc !== 0 && dr !== 0) {
        const ortho1 = !isStepBlockedByWall(c1, r1, c2, r1, refToken) && !isStepBlockedByWall(c2, r1, c2, r2, refToken);
        const ortho2 = !isStepBlockedByWall(c1, r1, c1, r2, refToken) && !isStepBlockedByWall(c1, r2, c2, r2, refToken);
        if (!ortho1 && !ortho2) return false;
      }
      return true;
    };

    // Orthogonal directions first, then diagonals
    const DIRS = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];

    // Identify cells occupied by non-swarm tokens (obstacles)
    const swarmSet = new Set(swarmTokens.map(t => t.id));
    const blockedCells = new Set();
    for (const token of canvas.tokens.placeables) {
      if (swarmSet.has(token.id) || token.document?.hidden) continue;
      const baseCell = toCell(token.document.x, token.document.y);
      const wCells = Math.max(1, Math.round(token.w / gridSizeX));
      const hCells = Math.max(1, Math.round(token.h / gridSizeY));
      for (let dc = 0; dc < wCells; dc++) {
        for (let dr = 0; dr < hCells; dr++) {
          blockedCells.add(cellKey(baseCell.col + dc, baseCell.row + dr));
        }
      }
    }

    const targetCell = toCell(dropX, dropY);
    const targetKey = cellKey(targetCell.col, targetCell.row);

    // Reverse BFS from targetCell to compute wall-aware distance to target
    const distToTarget = new Map();
    const bfsQueue = [{ col: targetCell.col, row: targetCell.row, dist: 0 }];
    distToTarget.set(targetKey, 0);
    const MAX_TARGET_BFS_CELLS = 1200;

    let head = 0;
    while (head < bfsQueue.length && distToTarget.size < MAX_TARGET_BFS_CELLS) {
      const curr = bfsQueue[head++];
      for (const [dc, dr] of DIRS) {
        const nc = curr.col + dc;
        const nr = curr.row + dr;
        const nKey = cellKey(nc, nr);
        if (distToTarget.has(nKey) || blockedCells.has(nKey)) continue;
        if (!canStep(curr.col, curr.row, nc, nr, this)) continue;
        distToTarget.set(nKey, curr.dist + 1);
        bfsQueue.push({ col: nc, row: nr, dist: curr.dist + 1 });
      }
    }

    // Prepare per-token movement metadata
    const tokenEntries = swarmTokens.map(token => {
      const startCell = toCell(token.document.x, token.document.y);
      const startKey = cellKey(startCell.col, startCell.row);
      const alreadyMoved = token.getMovedDistance();
      const speed = token.getActorSpeed();
      const remainingDist = Math.max(0, speed - alreadyMoved);
      const maxSteps = Math.floor((remainingDist + 1e-6) / gridDistance);
      const targetScore = distToTarget.get(startKey)
        ?? (Math.hypot(startCell.col - targetCell.col, startCell.row - targetCell.row) + 1000);
      return {
        token,
        startCell,
        startKey,
        remainingDist,
        maxSteps,
        targetScore
      };
    });

    const claimedCells = new Set();

    // Tokens that cannot move at all immediately claim their starting cell
    for (const entry of tokenEntries) {
      if (entry.maxSteps <= 0) {
        claimedCells.add(entry.startKey);
      }
    }

    // Sort movable tokens so those closest to the destination move first
    const movableEntries = tokenEntries
      .filter(e => e.maxSteps > 0)
      .sort((a, b) => {
        if (a.targetScore !== b.targetScore) return a.targetScore - b.targetScore;
        if (a.token === this) return -1;
        if (b.token === this) return 1;
        return 0;
      });

    const movesToExecute = [];

    for (const entry of movableEntries) {
      const { token, startCell, startKey, remainingDist, maxSteps } = entry;
      const speed = token.getActorSpeed();
      const history = token.document?.movementHistory;

      // BFS from token's startCell up to maxSteps
      const visited = new Map(); // cellKey -> { col, row, steps, parentKey }
      visited.set(startKey, { col: startCell.col, row: startCell.row, steps: 0, parentKey: null });
      const queue = [{ col: startCell.col, row: startCell.row, steps: 0 }];
      let qHead = 0;

      while (qHead < queue.length) {
        const curr = queue[qHead++];
        if (curr.steps >= maxSteps) continue;

        for (const [dc, dr] of DIRS) {
          const nc = curr.col + dc;
          const nr = curr.row + dr;
          const nKey = cellKey(nc, nr);
          if (visited.has(nKey) || blockedCells.has(nKey)) continue;
          if (!canStep(curr.col, curr.row, nc, nr, token)) continue;

          visited.set(nKey, {
            col: nc,
            row: nr,
            steps: curr.steps + 1,
            parentKey: cellKey(curr.col, curr.row)
          });
          queue.push({ col: nc, row: nr, steps: curr.steps + 1 });
        }
      }

      // Collect candidate unclaimed destination cells and rank them
      const candidates = [];
      for (const [key, node] of visited.entries()) {
        if (claimedCells.has(key) || blockedCells.has(key)) continue;
        const wallDist = distToTarget.get(key)
          ?? (Math.hypot(node.col - targetCell.col, node.row - targetCell.row) + 1000);
        const euclidDist = Math.hypot(node.col - targetCell.col, node.row - targetCell.row);
        candidates.push({ key, node, wallDist, euclidDist });
      }

      candidates.sort((a, b) => {
        if (a.wallDist !== b.wallDist) return a.wallDist - b.wallDist;
        if (Math.abs(a.euclidDist - b.euclidDist) > 1e-4) return a.euclidDist - b.euclidDist;
        return a.node.steps - b.node.steps;
      });

      let chosenWaypoints = null;
      let chosenKey = startKey;

      for (const cand of candidates) {
        if (cand.key === startKey) {
          chosenKey = startKey;
          chosenWaypoints = [];
          break;
        }

        // Reconstruct path from startCell to candidate cell
        const pathNodes = [];
        let curKey = cand.key;
        while (curKey) {
          const n = visited.get(curKey);
          pathNodes.push(n);
          curKey = n.parentKey;
        }
        pathNodes.reverse();

        const waypoints = pathNodes.map(n => toTopLeft(n.col, n.row));
        if (typeof token.document.measureMovementPath === "function") {
          const fullPath = Array.isArray(history) && history.length > 0
            ? [...history, ...waypoints.slice(1)]
            : waypoints;
          const measured = token.document.measureMovementPath(fullPath);
          const totalDist = measured?.distance ?? measured?.cost;
          if (typeof totalDist === "number" && totalDist > speed + 1e-4) continue;
        } else if (cand.node.steps * gridDistance > remainingDist + 1e-4) {
          continue;
        }

        chosenKey = cand.key;
        chosenWaypoints = waypoints.slice(1);
        break;
      }

      claimedCells.add(chosenKey);
      if (chosenWaypoints && chosenWaypoints.length > 0) {
        movesToExecute.push({ token, waypoints: chosenWaypoints });
      }
    }

    // Execute all movements concurrently
    await Promise.all(movesToExecute.map(({ token, waypoints }) => {
      if (typeof token.document.move === "function") {
        return token.document.move(waypoints);
      }
      const last = waypoints[waypoints.length - 1];
      return token.document.update({ x: last.x, y: last.y });
    }));
  }

  _drawBar(number, bar, data) {
    if ("min" in data) {
      // Copy the data to avoid mutating what the caller gave us.
      data = { ...data };
      // Shift the value and max by the min to draw the bar percentage accurately for a non-zero min
      data.value -= data.min;
      data.max -= data.min;
    }
    return super._drawBar(number, bar, data);
  }
}
