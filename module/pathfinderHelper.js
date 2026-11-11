/**
 * Helper class for grid-based token pathfinding and swarm movement.
 */
export class PathfinderHelper {

  /**
   * Whether token pathfinding is currently enabled.
   * @type {boolean}
   */
  static enabled = false;

  /**
   * Toggle whether token pathfinding is enabled.
   * @param {boolean} active
   */
  static setEnabled(active) {
    if (!game.user?.isGM) return;
    this.enabled = Boolean(active);
  }

  /**
   * Orthogonal directions first, then diagonals.
   * @type {number[][]}
   */
  static DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
  ];

  /**
   * Maximum number of cells explored during reverse BFS from the target.
   * @type {number}
   */
  static MAX_TARGET_BFS_CELLS = 1200;

  /**
   * Convert canvas pixel coordinates to grid cell coordinates.
   * @param {number} x
   * @param {number} y
   * @param {number} gridSizeX
   * @param {number} gridSizeY
   * @returns {{ col: number, row: number }}
   */
  static toCell(x, y, gridSizeX, gridSizeY) {
    if (canvas.grid?.getOffset) {
      const { i, j } = canvas.grid.getOffset({ x: x + gridSizeX / 2, y: y + gridSizeY / 2 });
      return { col: j, row: i };
    }
    return { col: Math.round(x / gridSizeX), row: Math.round(y / gridSizeY) };
  }

  /**
   * Convert grid cell coordinates to top-left canvas pixel coordinates.
   * @param {number} col
   * @param {number} row
   * @param {number} gridSizeX
   * @param {number} gridSizeY
   * @returns {{ x: number, y: number }}
   */
  static toTopLeft(col, row, gridSizeX, gridSizeY) {
    if (canvas.grid?.getTopLeftPoint) {
      return canvas.grid.getTopLeftPoint({ i: row, j: col });
    }
    return { x: col * gridSizeX, y: row * gridSizeY };
  }

  /**
   * Convert grid cell coordinates to center canvas pixel coordinates for a token.
   * @param {number} col
   * @param {number} row
   * @param {Token} token
   * @param {number} gridSizeX
   * @param {number} gridSizeY
   * @returns {{ x: number, y: number }}
   */
  static toCenter(col, row, token, gridSizeX, gridSizeY) {
    const tl = this.toTopLeft(col, row, gridSizeX, gridSizeY);
    return {
      x: tl.x + (token?.w || gridSizeX) / 2,
      y: tl.y + (token?.h || gridSizeY) / 2
    };
  }

  /**
   * Create a string key for a grid cell.
   * @param {number} col
   * @param {number} row
   * @returns {string}
   */
  static cellKey(col, row) {
    return `${col},${row}`;
  }

  /**
   * Check whether a direct step between two cells is blocked by a wall, using a cache.
   * @param {number} c1
   * @param {number} r1
   * @param {number} c2
   * @param {number} r2
   * @param {Token} refToken
   * @param {Map<string, boolean>} wallCache
   * @param {number} gridSizeX
   * @param {number} gridSizeY
   * @returns {boolean}
   */
  static isStepBlockedByWall(c1, r1, c2, r2, refToken, wallCache, gridSizeX, gridSizeY) {
    const key = c1 < c2 || (c1 === c2 && r1 < r2)
      ? `${c1},${r1}->${c2},${r2}`
      : `${c2},${r2}->${c1},${r1}`;
    if (wallCache.has(key)) return wallCache.get(key);

    const origin = this.toCenter(c1, r1, refToken, gridSizeX, gridSizeY);
    const dest = this.toCenter(c2, r2, refToken, gridSizeX, gridSizeY);
    const blocked = Boolean(refToken.checkCollision(dest, {
      origin,
      type: "move",
      mode: "any"
    }));
    wallCache.set(key, blocked);
    return blocked;
  }

  /**
   * Check whether a token can step between two adjacent cells (including diagonal corner checks).
   * @param {number} c1
   * @param {number} r1
   * @param {number} c2
   * @param {number} r2
   * @param {Token} refToken
   * @param {Map<string, boolean>} wallCache
   * @param {number} gridSizeX
   * @param {number} gridSizeY
   * @returns {boolean}
   */
  static canStep(c1, r1, c2, r2, refToken, wallCache, gridSizeX, gridSizeY) {
    if (this.isStepBlockedByWall(c1, r1, c2, r2, refToken, wallCache, gridSizeX, gridSizeY)) return false;
    const dc = c2 - c1;
    const dr = r2 - r1;
    if (dc !== 0 && dr !== 0) {
      const ortho1 = !this.isStepBlockedByWall(c1, r1, c2, r1, refToken, wallCache, gridSizeX, gridSizeY)
        && !this.isStepBlockedByWall(c2, r1, c2, r2, refToken, wallCache, gridSizeX, gridSizeY);
      const ortho2 = !this.isStepBlockedByWall(c1, r1, c1, r2, refToken, wallCache, gridSizeX, gridSizeY)
        && !this.isStepBlockedByWall(c1, r2, c2, r2, refToken, wallCache, gridSizeX, gridSizeY);
      if (!ortho1 && !ortho2) return false;
    }
    return true;
  }

  /**
   * Identify cells occupied by visible non-swarm tokens (obstacles).
   * @param {Token[]} swarmTokens
   * @param {number} gridSizeX
   * @param {number} gridSizeY
   * @returns {Set<string>}
   */
  static getBlockedCells(swarmTokens, gridSizeX, gridSizeY) {
    const swarmSet = new Set(swarmTokens.map(t => t.id));
    const blockedCells = new Set();
    for (const token of canvas.tokens?.placeables ?? []) {
      if (swarmSet.has(token.id) || token.document?.hidden) continue;
      const baseCell = this.toCell(token.document.x, token.document.y, gridSizeX, gridSizeY);
      const wCells = Math.max(1, Math.round(token.w / gridSizeX));
      const hCells = Math.max(1, Math.round(token.h / gridSizeY));
      for (let dc = 0; dc < wCells; dc++) {
        for (let dr = 0; dr < hCells; dr++) {
          blockedCells.add(this.cellKey(baseCell.col + dc, baseCell.row + dr));
        }
      }
    }
    return blockedCells;
  }

  /**
   * Run reverse BFS from the target cell to compute wall-aware distances to the target.
   * @param {{ col: number, row: number }} targetCell
   * @param {Set<string>} blockedCells
   * @param {Token} refToken
   * @param {Map<string, boolean>} wallCache
   * @param {number} gridSizeX
   * @param {number} gridSizeY
   * @returns {Map<string, number>}
   */
  static computeDistToTarget(targetCell, blockedCells, refToken, wallCache, gridSizeX, gridSizeY) {
    const targetKey = this.cellKey(targetCell.col, targetCell.row);
    const distToTarget = new Map();
    const bfsQueue = [{ col: targetCell.col, row: targetCell.row, dist: 0 }];
    distToTarget.set(targetKey, 0);

    let head = 0;
    while (head < bfsQueue.length && distToTarget.size < this.MAX_TARGET_BFS_CELLS) {
      const curr = bfsQueue[head++];
      for (const [dc, dr] of this.DIRS) {
        const nc = curr.col + dc;
        const nr = curr.row + dr;
        const nKey = this.cellKey(nc, nr);
        if (distToTarget.has(nKey) || blockedCells.has(nKey)) continue;
        if (!this.canStep(curr.col, curr.row, nc, nr, refToken, wallCache, gridSizeX, gridSizeY)) continue;
        distToTarget.set(nKey, curr.dist + 1);
        bfsQueue.push({ col: nc, row: nr, dist: curr.dist + 1 });
      }
    }

    return distToTarget;
  }

  /**
   * Move a swarm of unlinked tokens toward (dropX, dropY), pathfinding around walls
   * and other tokens while clamping each token's movement to its remaining speed.
   * @param {Token} refToken
   * @param {Token[]} swarmTokens
   * @param {number} dropX
   * @param {number} dropY
   * @returns {Promise<void>}
   */
  static async executeSwarmMove(refToken, swarmTokens, dropX, dropY) {
    if (!game.user?.isGM) return;
    const gridSizeX = canvas.grid?.sizeX || canvas.grid?.size || 100;
    const gridSizeY = canvas.grid?.sizeY || canvas.grid?.size || 100;
    const gridDistance = Number(canvas.scene?.grid?.distance) || 1;

    const wallCache = new Map();
    const blockedCells = this.getBlockedCells(swarmTokens, gridSizeX, gridSizeY);
    const targetCell = this.toCell(dropX, dropY, gridSizeX, gridSizeY);
    const distToTarget = this.computeDistToTarget(
      targetCell,
      blockedCells,
      refToken,
      wallCache,
      gridSizeX,
      gridSizeY
    );

    // Prepare per-token movement metadata
    const tokenEntries = swarmTokens.map(token => {
      const startCell = this.toCell(token.document.x, token.document.y, gridSizeX, gridSizeY);
      const startKey = this.cellKey(startCell.col, startCell.row);
      const alreadyMoved = token.getMovedDistance();
      const speed = token.getActorSpeed();
      const actionNumber = token.getActorActionNumber();
      const usedActions = token.getUsedActions();
      const maxMoveDist = Math.max(0, (actionNumber - usedActions) * speed);
      const remainingDist = Math.max(0, maxMoveDist - alreadyMoved);
      const maxSteps = Math.floor((remainingDist + 1e-6) / gridDistance);
      const targetScore = distToTarget.get(startKey)
        ?? (Math.hypot(startCell.col - targetCell.col, startCell.row - targetCell.row) + 1000);
      return {
        token,
        startCell,
        startKey,
        maxMoveDist,
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
        if (a.token === refToken) return -1;
        if (b.token === refToken) return 1;
        return 0;
      });

    const movesToExecute = [];

    for (const entry of movableEntries) {
      const { token, startCell, startKey, maxMoveDist, remainingDist, maxSteps } = entry;
      const history = token.document?.movementHistory;

      // BFS from token's startCell up to maxSteps
      const visited = new Map(); // cellKey -> { col, row, steps, parentKey }
      visited.set(startKey, { col: startCell.col, row: startCell.row, steps: 0, parentKey: null });
      const queue = [{ col: startCell.col, row: startCell.row, steps: 0 }];
      let qHead = 0;

      while (qHead < queue.length) {
        const curr = queue[qHead++];
        if (curr.steps >= maxSteps) continue;

        for (const [dc, dr] of this.DIRS) {
          const nc = curr.col + dc;
          const nr = curr.row + dr;
          const nKey = this.cellKey(nc, nr);
          if (visited.has(nKey) || blockedCells.has(nKey)) continue;
          if (!this.canStep(curr.col, curr.row, nc, nr, token, wallCache, gridSizeX, gridSizeY)) continue;

          visited.set(nKey, {
            col: nc,
            row: nr,
            steps: curr.steps + 1,
            parentKey: this.cellKey(curr.col, curr.row)
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

        const waypoints = pathNodes.map(n => this.toTopLeft(n.col, n.row, gridSizeX, gridSizeY));
        if (typeof token.document.measureMovementPath === "function") {
          const fullPath = Array.isArray(history) && history.length > 0
            ? [...history, ...waypoints.slice(1)]
            : waypoints;
          const measured = token.document.measureMovementPath(fullPath);
          const totalDist = measured?.distance ?? measured?.cost;
          if (typeof totalDist === "number" && totalDist > maxMoveDist + 1e-4) continue;
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
}

