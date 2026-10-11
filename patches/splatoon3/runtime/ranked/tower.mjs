const EMPTY_NEUTRAL_SECONDS = 5;
const UNATTENDED_RETURN_SPEED = 0.8;
const RIDING_RETURN_SPEED = 1.2;
const CHECKPOINT_RECOVERY_SECONDS = 3;
const COUNT_PER_SECOND = 1 / 0.6;
const EPSILON = 1e-9;

const teamId = value => value === 0 || value === 1;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clone = value => structuredClone(value);

function distance(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  return Math.hypot(dx, dy, dz);
}

function pathMetrics(stage) {
  let points = Array.isArray(stage?.tower?.path)
    ? stage.tower.path.filter(point => Array.isArray(point) && point.length >= 3 && point.slice(0, 3).every(Number.isFinite))
    : [];
  if (points.length < 2) points = [[-1, 0, 0], [0, 0, 0], [1, 0, 0]];
  points = points.map(point => [point[0], point[1], point[2]]);
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  const total = lengths[lengths.length - 1] || 1;
  const centerIndex = Math.max(0, Math.min(points.length - 1,
    Math.trunc(finite(stage?.tower?.centerIndex, Math.floor(points.length / 2)))));
  const center = lengths[centerIndex];
  return { points, lengths, total, center, start: 0, end: total };
}

function writePathPosition(position, metrics, coordinate) {
  const s = Math.max(0, Math.min(metrics.total, finite(coordinate)));
  for (let i = 1; i < metrics.lengths.length; i++) {
    if (s <= metrics.lengths[i] + EPSILON) {
      const span = metrics.lengths[i] - metrics.lengths[i - 1];
      const t = span > EPSILON ? Math.max(0, Math.min(1, (s - metrics.lengths[i - 1]) / span)) : 0;
      for (let axis = 0; axis < 3; axis++)
        position[axis] = metrics.points[i - 1][axis] + (metrics.points[i][axis] - metrics.points[i - 1][axis]) * t;
      return position;
    }
  }
  const last = metrics.points[metrics.points.length - 1];
  position[0] = last[0]; position[1] = last[1]; position[2] = last[2];
  return position;
}

function routeProgress(team, coordinate, metrics) {
  const span = team === 0 ? metrics.end - metrics.center : metrics.center - metrics.start;
  if (span <= EPSILON) return 0;
  const covered = team === 0 ? coordinate - metrics.center : metrics.center - coordinate;
  return Math.max(0, Math.min(1, covered / span));
}

function routeCoordinate(team, progress, metrics) {
  const span = team === 0 ? metrics.end - metrics.center : metrics.center - metrics.start;
  const p = Math.max(0, Math.min(1, finite(progress)));
  return team === 0 ? metrics.center + p * span : metrics.center - p * span;
}

function checkpoints(stage, team) {
  const list = stage?.tower?.checkpoints?.[team];
  if (!Array.isArray(list)) return [];
  return list.filter(checkpoint => checkpoint && Number.isFinite(checkpoint.progress))
    .map(checkpoint => ({
      progress: Math.max(0, Math.min(1, checkpoint.progress)),
      count: Math.max(0, finite(checkpoint.count)),
    }))
    .sort((a, b) => a.progress - b.progress);
}

function leaderLoss(engine) {
  if (Array.isArray(engine.counts) && engine.counts[0] !== engine.counts[1])
    return engine.counts[0] > engine.counts[1] ? 0 : 1;
  return -1;
}

function actorRides(actor, position, halfSize) {
  if (!actor || !teamId(actor.team) || !actor.alive) return false;
  // The world adapter can retain a rider's identity while a jump is in
  // progress. An explicit ride signal takes precedence over the grounded
  // platform-volume fallback below.
  if (actor.onTower === true || actor.ridingTower === true) return true;
  if (actor.grounded === false || !Array.isArray(actor.pos)) return false;
  const dx = actor.pos[0] - position[0], dz = actor.pos[2] - position[2];
  // Position data is feet-based. The vertical band tolerates stage-specific
  // tower decks while excluding players on the floor directly underneath.
  const dy = actor.pos[1] - position[1];
  return Math.abs(dx) <= halfSize && Math.abs(dz) <= halfSize && dy >= -0.25 && dy <= 3.5;
}

export class TowerRule {
  constructor(engine, stage) {
    this.engine = engine;
    this.stage = stage || {};
    this.metrics = pathMetrics(this.stage);
    this.checkpointData = [checkpoints(this.stage, 0), checkpoints(this.stage, 1)];
    this.checkpointCountBudgets = this.checkpointData.map(list => Math.min(100,
      list.reduce((sum, checkpoint) => sum + checkpoint.count * COUNT_PER_SECOND, 0)));
    this.reset();
  }

  reset() {
    const metrics = this.metrics;
    const checkpointCounts = this.checkpointData.map(list => list.length);
    const centerProgress = metrics.center / metrics.total;
    this.state = {
      progress: centerProgress,
      pathDistance: metrics.center,
      position: [0, 0, 0],
      controllingTeam: -1,
      lastController: -1,
      emptySeconds: 0,
      riders: [0, 0],
      riderIds: [[], []],
      checkpointIndex: [0, 0],
      checkpointProgress: checkpointCounts.map(count => Array(count).fill(0)),
      checkpointCleared: checkpointCounts.map(count => Array(count).fill(false)),
      checkpointLossSeconds: checkpointCounts.map(count => Array(count).fill(0)),
      checkpointCountBudget: this.checkpointCountBudgets.slice(),
      countProgress: [0, 0],
      bestProgress: [0, 0],
      overtimeTeam: -1,
      overtimeElapsed: 0,
    };
    writePathPosition(this.state.position, metrics, metrics.center);
    return this.state;
  }

  update(dt, frame) {
    dt = Math.max(0, finite(dt));
    const metrics = this.metrics;
    const platform = this.state.position;
    const halfSize = Math.max(0.1, finite(this.stage?.tower?.halfSize, 1.4));
    const riderCounts = this.state.riders;
    riderCounts[0] = 0; riderCounts[1] = 0;
    const riderIds = this.state.riderIds;
    riderIds[0].length = 0; riderIds[1].length = 0;
    for (const actor of frame?.actors || []) {
      if (!actorRides(actor, platform, halfSize)) continue;
      riderCounts[actor.team]++;
      if (typeof actor.id === 'string' || typeof actor.id === 'number') riderIds[actor.team].push(String(actor.id));
    }

    let soleRiderTeam = -1;
    if (riderCounts[0] > 0 && riderCounts[1] === 0) soleRiderTeam = 0;
    else if (riderCounts[1] > 0 && riderCounts[0] === 0) soleRiderTeam = 1;

    let movedBy = -1;
    if (soleRiderTeam >= 0) {
      this.state.emptySeconds = 0;
      this._setController(soleRiderTeam);
      movedBy = soleRiderTeam;
      this._advanceWithRiders(soleRiderTeam, riderCounts[soleRiderTeam], dt, metrics);
    } else if (riderCounts[0] > 0 && riderCounts[1] > 0) {
      // A contest stops the tower but keeps the previous owner. That history
      // decides whether a losing team is still defending overtime.
      this.state.emptySeconds = 0;
    } else {
      const previousEmpty = this.state.emptySeconds;
      this.state.emptySeconds += dt;
      const towerSpeed = Math.max(0, finite(this.stage?.tower?.speed, 0));
      if (teamId(this.state.controllingTeam)) {
        const owner = this.state.controllingTeam;
        const ownSide = owner === 0 ? this.state.pathDistance < metrics.center - EPSILON
          : this.state.pathDistance > metrics.center + EPSILON;
        if (ownSide) {
          this._moveTowardCenter(dt * towerSpeed * UNATTENDED_RETURN_SPEED, metrics);
          movedBy = owner;
        }
        if (previousEmpty < EMPTY_NEUTRAL_SECONDS && this.state.emptySeconds >= EMPTY_NEUTRAL_SECONDS) {
          this._setController(-1);
          const returnSeconds = Math.max(0, this.state.emptySeconds - EMPTY_NEUTRAL_SECONDS);
          if (returnSeconds > 0) this._moveTowardCenter(returnSeconds * towerSpeed * UNATTENDED_RETURN_SPEED, metrics);
        }
      } else {
        const returnSeconds = Math.max(0, this.state.emptySeconds - EMPTY_NEUTRAL_SECONDS)
          - Math.max(0, previousEmpty - EMPTY_NEUTRAL_SECONDS);
        if (previousEmpty >= EMPTY_NEUTRAL_SECONDS)
          this._moveTowardCenter(returnSeconds * towerSpeed * UNATTENDED_RETURN_SPEED, metrics);
      }
    }

    this.state.pathDistance = Math.max(metrics.start, Math.min(metrics.end, this.state.pathDistance));
    this.state.progress = this.state.pathDistance / metrics.total;
    writePathPosition(this.state.position, metrics, this.state.pathDistance);
    this._recoverUnfinishedCheckpoints(dt, movedBy, metrics);
    this._updateCounts(metrics);
    this._awardPassiveSpecial(dt);
    return this.state;
  }

  _setController(team) {
    if (this.state.controllingTeam === team) return;
    this.state.controllingTeam = team;
    if (teamId(team)) this.state.lastController = team;
    this.engine.event?.('tower-capture', { team });
  }

  _advanceWithRiders(team, riderCount, dt, metrics) {
    let remaining = dt;
    const speed = Math.max(0, finite(this.stage?.tower?.speed, 0));
    const direction = team === 0 ? 1 : -1;
    if (speed <= 0 || remaining <= 0) return;

    // Riding on the team's own half returns the tower toward the center at
    // 1.2x. Once it crosses center, normal attack speed applies.
    const ownSide = team === 0 ? this.state.pathDistance < metrics.center - EPSILON
      : this.state.pathDistance > metrics.center + EPSILON;
    if (ownSide) {
      const distanceToCenter = Math.abs(metrics.center - this.state.pathDistance);
      const travel = Math.min(distanceToCenter, remaining * speed * RIDING_RETURN_SPEED);
      this.state.pathDistance += Math.sign(metrics.center - this.state.pathDistance) * travel;
      remaining -= travel / (speed * RIDING_RETURN_SPEED);
      if (remaining <= EPSILON) return;
    }

    const teamCheckpoints = this.checkpointData[team];
    let guard = 0;
    while (remaining > EPSILON && guard++ < 12) {
      if (this.state.pathDistance <= metrics.start + EPSILON && direction < 0
        || this.state.pathDistance >= metrics.end - EPSILON && direction > 0) {
        this.engine.setCount?.(team, 0);
        return;
      }

      let index = this.state.checkpointIndex[team] || 0;
      while (index < teamCheckpoints.length && this.state.checkpointCleared[team][index]) index++;
      this.state.checkpointIndex[team] = index;
      const checkpoint = teamCheckpoints[index];
      if (!checkpoint) {
        this.state.pathDistance = Math.max(metrics.start, Math.min(metrics.end,
          this.state.pathDistance + direction * speed * remaining));
        remaining = 0;
        break;
      }

      const checkpointDistance = routeCoordinate(team, checkpoint.progress, metrics);
      const distanceAhead = direction * (checkpointDistance - this.state.pathDistance);
      if (distanceAhead < -EPSILON) {
        // A restored or stage-edited path may already lie beyond this marker.
        // Skip it to avoid trapping the objective behind its current position.
        this.state.checkpointCleared[team][index] = true;
        this.state.checkpointProgress[team][index] = checkpoint.count;
        this.state.checkpointIndex[team] = index + 1;
        continue;
      }
      if (distanceAhead > EPSILON) {
        const travelSeconds = distanceAhead / speed;
        if (travelSeconds > remaining) {
          this.state.pathDistance += direction * speed * remaining;
          remaining = 0;
          break;
        }
        this.state.pathDistance = checkpointDistance;
        remaining -= travelSeconds;
      } else this.state.pathDistance = checkpointDistance;

      const progress = this.state.checkpointProgress[team][index] || 0;
      const required = checkpoint.count;
      if (required <= progress + EPSILON) {
        this._clearCheckpoint(team, index, required);
        continue;
      }
      if (remaining <= EPSILON) break;

      // Splatoon 3 accelerates checkpoint progress with extra riders, while
      // normal rail speed is unchanged. Public sources confirm the direction
      // but do not publish the exact curve, so linear rider scaling remains a
      // clearly local approximation rather than a claimed extracted value.
      const multiplier = Math.max(1, riderCount);
      const neededSeconds = (required - progress) / multiplier;
      const activeSeconds = Math.min(remaining, neededSeconds);
      this.state.checkpointProgress[team][index] = Math.min(required, progress + activeSeconds * multiplier);
      this.state.checkpointLossSeconds[team][index] = 0;
      remaining -= activeSeconds;
      if (this.state.checkpointProgress[team][index] >= required - EPSILON) {
        this.state.checkpointProgress[team][index] = required;
        this._clearCheckpoint(team, index, required);
      }
    }
  }

  _clearCheckpoint(team, index, _required) {
    if (this.state.checkpointCleared[team][index]) return;
    this.state.checkpointCleared[team][index] = true;
    this.state.checkpointProgress[team][index] = Math.max(0, finite(this.state.checkpointProgress[team][index]));
    this.state.checkpointLossSeconds[team][index] = 0;
    this.state.checkpointIndex[team] = Math.max(this.state.checkpointIndex[team], index + 1);
    this.engine.event?.('checkpoint', { team, index });
  }

  _moveTowardCenter(distanceToTravel, metrics) {
    if (!(distanceToTravel > 0)) return;
    const remaining = metrics.center - this.state.pathDistance;
    if (Math.abs(remaining) <= EPSILON) return;
    this.state.pathDistance += Math.sign(remaining) * Math.min(Math.abs(remaining), distanceToTravel);
  }

  _recoverUnfinishedCheckpoints(dt, activeTeam, metrics) {
    for (let team = 0; team < 2; team++) {
      const list = this.checkpointData[team];
      for (let index = 0; index < list.length; index++) {
        if (this.state.checkpointCleared[team][index] || this.state.checkpointProgress[team][index] <= EPSILON) continue;
        const marker = routeCoordinate(team, list[index].progress, metrics);
        const atMarker = Math.abs(this.state.pathDistance - marker) <= 1e-5;
        if (activeTeam === team && atMarker) {
          this.state.checkpointLossSeconds[team][index] = 0;
          continue;
        }
        this.state.checkpointLossSeconds[team][index] += dt;
        if (this.state.checkpointLossSeconds[team][index] >= CHECKPOINT_RECOVERY_SECONDS) {
          this.state.checkpointProgress[team][index] = 0;
          this.state.checkpointLossSeconds[team][index] = 0;
        }
      }
    }
  }

  _updateCounts(metrics) {
    for (let team = 0; team < 2; team++) {
      const progress = routeProgress(team, this.state.pathDistance, metrics);
      let checkpointSeconds = 0;
      for (const value of this.state.checkpointProgress[team])
        checkpointSeconds += Math.max(0, finite(value));
      const distanceBudget = 100 - this.checkpointCountBudgets[team];
      const atGoal = team === 0
        ? this.state.pathDistance >= metrics.end - EPSILON
        : this.state.pathDistance <= metrics.start + EPSILON;
      const countProgress = atGoal ? 100 : Math.max(0, Math.min(100,
        progress * distanceBudget + checkpointSeconds * COUNT_PER_SECOND));
      this.state.countProgress[team] = countProgress;
      this.state.bestProgress[team] = Math.max(this.state.bestProgress[team], countProgress / 100);
      const count = atGoal ? 0 : Math.max(1, Math.ceil(100 - countProgress - EPSILON));
      this.engine.setCount?.(team, count);
    }
  }

  _awardPassiveSpecial(dt) {
    const owner = this.state.controllingTeam;
    if (teamId(owner)) {
      this.engine.special?.(owner, 4.5 * dt);
      return;
    }
    const loser = leaderLoss(this.engine);
    if (loser >= 0) this.engine.special?.(loser, 2.25 * dt);
  }

  beginOvertime() {
    const losingTeam = teamId(this.engine.overtimeTeam) ? this.engine.overtimeTeam : leaderLoss(this.engine);
    if (losingTeam < 0 || this.state.controllingTeam !== losingTeam || this.state.emptySeconds >= EMPTY_NEUTRAL_SECONDS) return false;
    this.state.overtimeTeam = losingTeam;
    this.state.overtimeElapsed = 0;
    return true;
  }

  updateOvertime(dt, frame) {
    dt = Math.max(0, finite(dt));
    this.state.overtimeElapsed += dt;
    const losingTeam = teamId(this.state.overtimeTeam) ? this.state.overtimeTeam
      : teamId(this.engine.overtimeTeam) ? this.engine.overtimeTeam : leaderLoss(this.engine);
    if (losingTeam < 0 || this.engine.winner !== null) return this.state;
    const winningTeam = 1 - losingTeam;
    if (this.state.controllingTeam === winningTeam) this.engine.finish?.(winningTeam, 'tower-retaken');
    else if (this.state.controllingTeam < 0 || this.state.emptySeconds >= EMPTY_NEUTRAL_SECONDS)
      this.engine.finish?.(winningTeam, 'tower-neutralized');
    return this.state;
  }

  snapshot() { return clone(this.state); }

  restore(state) {
    this.state = clone(state);
    return this.state;
  }

  removeActor(id) {
    for (let team = 0; team < 2; team++) {
      const ids = this.state.riderIds[team];
      for (let index = ids.length - 1; index >= 0; index--) {
        if (ids[index] !== String(id)) continue;
        ids.splice(index, 1);
        this.state.riders[team] = Math.max(0, this.state.riders[team] - 1);
      }
    }
  }

  botGoal(actor) {
    if (!actor || !teamId(actor.team)) return null;
    return {
      pos: this.state.position.slice(),
      action: this.state.controllingTeam === actor.team && this.state.riders[actor.team] > 0 ? 'defend' : 'ride',
    };
  }
}
