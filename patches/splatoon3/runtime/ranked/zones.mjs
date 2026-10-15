const CAPTURE_RATIO = 0.7;
const NEUTRALIZE_RATIO = 0.5;
const COUNT_SECONDS = 0.6;
const PENALTY_FRACTION = 0.75;
const OVERTIME_NEUTRAL_SECONDS = 10;
const OVERTIME_LIMIT_SECONDS = 5 * 60;

const teamId = value => value === 0 || value === 1;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clone = value => structuredClone(value);

function matchLoser(engine) {
  if (Array.isArray(engine.counts) && engine.counts[0] !== engine.counts[1])
    return engine.counts[0] > engine.counts[1] ? 0 : 1;
  return -1;
}

function addPenalty(engine, team, amount) {
  if (!(amount > 0)) return;
  if (typeof engine.addPenalty === 'function') engine.addPenalty(team, amount);
  else if (Array.isArray(engine.penalties)) engine.penalties[team] = finite(engine.penalties[team]) + amount;
}

function coverage(frame, zone, team) {
  const ratio = frame?.zoneCoverage?.[zone]?.[team];
  return Math.max(0, Math.min(1, finite(ratio)));
}

function zonePenaltyFromSeconds(seconds) {
  // A count falls every 0.6s; the 75% penalty is rounded up only when the
  // prior all-zone hold is actually taken over by the other team.
  const exact = Math.max(0, seconds / COUNT_SECONDS * PENALTY_FRACTION);
  return Math.ceil(exact - 1e-9);
}

export class ZonesRule {
  constructor(engine, stage) {
    this.engine = engine;
    this.stage = stage || {};
    this.reset();
  }

  reset() {
    const zones = Array.isArray(this.stage.zones) ? this.stage.zones : [];
    this.state = {
      zones: zones.map(() => ({ team: -1, previousTeam: -1 })),
      controllingTeam: -1,
      // Retain the last full controller through neutral/split-zone states.
      // A penalty is earned only if the other team later captures every zone.
      zoneRunTeam: -1,
      controlledSeconds: 0,
      // Fractional progress toward the next 36-frame count tick. It pauses
      // while control is interrupted and resets when the other team takes
      // full control.
      countClock: 0,
      controlLostPending: false,
      controlLostTeam: -1,
      controlLostSeconds: 0,
      neutralSeconds: 0,
      overtimeTeam: -1,
      overtimeElapsed: 0,
    };
    return this.state;
  }

  update(dt, frame) {
    dt = Math.max(0, finite(dt));
    const previousControl = this.state.controllingTeam;

    for (let index = 0; index < this.state.zones.length; index++) {
      const zone = this.state.zones[index];
      if (zone.team === 0 || zone.team === 1) {
        const enemy = 1 - zone.team;
        if (coverage(frame, index, enemy) >= NEUTRALIZE_RATIO) {
          zone.previousTeam = zone.team;
          zone.team = -1;
          this.engine.event?.('zone-neutral', { zone: index, team: enemy });
        }
      } else {
        const team = coverage(frame, index, 0) >= CAPTURE_RATIO ? 0
          : coverage(frame, index, 1) >= CAPTURE_RATIO ? 1 : -1;
        if (team >= 0) {
          zone.previousTeam = zone.team;
          zone.team = team;
          this.engine.event?.('zone-capture', { zone: index, team });
        }
      }
    }

    const allTeam = this.state.zones.length > 0
      && this.state.zones.every(zone => zone.team === this.state.zones[0].team)
      && teamId(this.state.zones[0].team)
      ? this.state.zones[0].team : -1;
    this.state.controllingTeam = allTeam;
    if (previousControl >= 0 && previousControl !== allTeam) this.engine.resolveTie?.(previousControl);

    if (allTeam >= 0) {
      if (this.state.zoneRunTeam < 0) {
        this.state.zoneRunTeam = allTeam;
        this.state.controlledSeconds = 0;
      } else if (allTeam !== this.state.zoneRunTeam) {
        const penalty = zonePenaltyFromSeconds(this.state.controlledSeconds);
        addPenalty(this.engine, this.state.zoneRunTeam, penalty);
        this.state.zoneRunTeam = allTeam;
        this.state.controlledSeconds = 0;
        this.state.countClock = 0;
      }
      this.state.controlLostPending = false;
      this.state.controlLostTeam = -1;
      this.state.controlLostSeconds = 0;
      this.state.controlledSeconds += dt;
    } else {
      if (previousControl >= 0 && !this.state.controlLostPending) {
        this.state.controlLostPending = true;
        this.state.controlLostTeam = previousControl;
        this.state.controlLostSeconds = 0;
      } else if (this.state.controlLostPending) {
        this.state.controlLostSeconds += dt;
      }
    }

    if (allTeam >= 0) {
      this.state.countClock += dt;
      while (this.state.countClock + 1e-9 >= COUNT_SECONDS) {
        this.state.countClock = Math.max(0, this.state.countClock - COUNT_SECONDS);
        this.engine.score?.(allTeam, 1, { simultaneousLastPenalty: true });
        if (this.engine.winner !== null) break;
      }
      this.engine.special?.(1 - allTeam, 4.5 * dt);
    } else {
      const loser = matchLoser(this.engine);
      if (loser >= 0) this.engine.special?.(loser, 1.5 * dt);
    }

    return this.state;
  }

  beginOvertime() {
    const losingTeam = teamId(this.engine.overtimeTeam) ? this.engine.overtimeTeam : matchLoser(this.engine);
    if (losingTeam < 0) return false;
    const ownsAllZones = this.state.controllingTeam === losingTeam;
    const recentlyLost = this.state.controlLostPending
      && this.state.controlLostTeam === losingTeam
      && this.state.controlLostSeconds < OVERTIME_NEUTRAL_SECONDS;
    if (!ownsAllZones && !recentlyLost) return false;
    this.state.overtimeTeam = losingTeam;
    this.state.overtimeElapsed = 0;
    // The existing recent-loss qualifier carries the same uninterrupted
    // neutral period across regulation end; time-up does not grant 10s again.
    this.state.neutralSeconds = ownsAllZones ? 0 : this.state.controlLostSeconds;
    return true;
  }

  updateOvertime(dt, frame) {
    dt = Math.max(0, finite(dt));
    this.state.overtimeElapsed += dt;
    const losingTeam = teamId(this.state.overtimeTeam) ? this.state.overtimeTeam
      : teamId(this.engine.overtimeTeam) ? this.engine.overtimeTeam : matchLoser(this.engine);
    if (losingTeam < 0 || this.engine.winner !== null) return this.state;
    const winningTeam = 1 - losingTeam;

    if (this.state.controllingTeam === winningTeam) {
      this.engine.finish?.(winningTeam, 'zones-retaken');
      return this.state;
    }
    if (this.state.controllingTeam === losingTeam) {
      this.state.neutralSeconds = 0;
    } else {
      this.state.neutralSeconds += dt;
      if (this.state.neutralSeconds >= OVERTIME_NEUTRAL_SECONDS) {
        this.engine.finish?.(winningTeam, 'zones-neutral-timeout');
        return this.state;
      }
    }
    if (this.state.overtimeElapsed >= OVERTIME_LIMIT_SECONDS)
      this.engine.finish?.(winningTeam, 'zones-overtime-limit');
    return this.state;
  }

  snapshot() { return clone(this.state); }

  restore(state) {
    this.state = clone(state);
    return this.state;
  }

  removeActor(_id) {}

  botGoal(actor, frame) {
    if (!actor || !teamId(actor.team) || !Array.isArray(this.stage.zones) || !this.stage.zones.length) return null;
    const origin = Array.isArray(actor.pos) ? actor.pos : [0, 0, 0];
    let best = null;
    for (let index = 0; index < this.stage.zones.length; index++) {
      const center = this.stage.zones[index]?.center;
      if (!Array.isArray(center) || center.length < 3) continue;
      const owner = this.state.zones[index]?.team ?? -1;
      const coverageRatio = coverage(frame, index, actor.team);
      const priority = owner === actor.team ? 2 : owner === -1 ? 1 : 0;
      const distance = (center[0] - origin[0]) ** 2 + (center[1] - origin[1]) ** 2 + (center[2] - origin[2]) ** 2;
      const score = priority * 1e6 - coverageRatio * 1e3 + distance;
      if (!best || score < best.score) best = { center, owner, score, size: this.stage.zones[index].size };
    }
    if (!best) return null;
    const position = best.center.slice();
    // The larger local zones need paint across their whole footprint. Assign
    // staggered, clock-driven sweep points instead of stacking every bot at
    // the center. Keep the original small blockout goals unchanged.
    if (Array.isArray(best.size) && Math.max(...best.size) > 9 && typeof frame?.floorAt === 'function') {
      const phase = Math.floor(finite(this.engine.elapsed) / 2) + Math.trunc(finite(actor.slot)) * 7 + actor.team * 13;
      for (let attempt = 0; attempt < 25; attempt++) {
        const cell = (phase + attempt) % 25, row = Math.floor(cell / 5);
        const column = row % 2 ? 4 - cell % 5 : cell % 5;
        const x = best.center[0] + (column - 2) * best.size[0] * 0.2;
        const z = best.center[2] + (row - 2) * best.size[1] * 0.2;
        const y = frame.floorAt(x, z);
        if (!Number.isFinite(y) || Math.abs(y - best.center[1]) > 0.75) continue;
        position[0] = x; position[1] = y; position[2] = z;
        break;
      }
    }
    return {
      pos: position,
      action: best.owner === actor.team && this.state.controllingTeam === actor.team ? 'defend' : 'paint',
    };
  }
}
