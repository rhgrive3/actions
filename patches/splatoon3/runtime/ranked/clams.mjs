// Splatoon3mix's S3-specific pickup/throw tables; no retail timing claims.
const NO_CLAM_PICKUP = new Set(['zipcaster', 'crabTank', 'krakenRoyale', 'tripleSplashdown', 'slam']);
const NO_CLAM_THROW = new Set(['trizooka', 'zipcaster', 'booyahBomb', 'inkVac', 'inkjet', 'ultraStamp', 'crabTank', 'reefslider', 'tripleInkstrike', 'krakenRoyale', 'tripleSplashdown', 'slam']);
const DEPLOY_FIRST = new Set(['tentaMissiles', 'storm', 'waveBreaker', 'tacticooler', 'superChump', 'splattercolorScreen']);
const NO_HOCO_PICKUP = new Set(['reefslider', 'zipcaster', 'inkjet', 'booyahBomb']);
export function canCollectClam(actor) { return !NO_CLAM_PICKUP.has(actor?.special); }
export function canThrowClam(actor) {
  const id = actor?.special;
  return !NO_CLAM_THROW.has(id) && (!DEPLOY_FIRST.has(id) || actor.specialDeployed === true);
}
export function canCollectRainmaker(actor) { return !NO_HOCO_PICKUP.has(actor?.special); }
const EPS = 1e-8;
// Wiki says a little over one second; 1.2s is local timing pending hardware.
export const CLAM_BARRIER_BREAK_SECONDS = 1.2;
const MAX_SMALL_CLAMS = 7;
const CLAMS_PER_POWER = 8;
const FIELD_CAP = 40;
const QUICK_SPAWN_THRESHOLD = 18;
const NORMAL_SPAWN_SECONDS = 12;
const QUICK_SPAWN_SECONDS = 4;
const CLAM_LIFETIME = 10;
const BASKET_OPEN_SECONDS = 10;
const BASKET_COOLDOWN_SECONDS = 10;
const COMEBACK_SECONDS = 20;
const SCORELESS_OVERTIME_SECONDS = 180;
const SMALL_SCORE = 3;
const POWER_SCORE = 20;
const GRAVITY = 9.8;
const SMALL_THROW_SPEED = 10.4 * 60 * 0.02;
const POWER_THROW_SPEED = 8.2 * 60 * 0.02;

// Rule-value references: Nintendo's Clam Blitz introduction
// (https://www.nintendo.com/jp/ichikara/av5ja/03_en.html), the Splatoon 3
// Clam Blitz verification page (https://wikiwiki.jp/splatoon3mix/ガチアサリ),
// and Inkipedia's Clam Blitz/Overtime pages (https://splatoonwiki.org/wiki/Clam_Blitz,
// https://splatoonwiki.org/wiki/Overtime). Leanny's public parameter database
// (https://leanny.github.io/splat3/parameters.html) does not publish an
// INKWAVE-world conversion for clam trajectories; the physics conversion below
// is deliberately marked as approximate.

const clone = value => structuredClone(value);
const vec = value => Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(Number.isFinite)
  ? [value[0], value[1], value[2]] : [0, 0, 0];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, n) => [a[0] * n, a[1] * n, a[2] * n];
const length = a => Math.hypot(a[0], a[1], a[2]);
const normalize = (a, fallback = [0, 0, 1]) => {
  const n = length(a);
  return n > EPS ? scale(a, 1 / n) : [...fallback];
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const pointFrom = value => Array.isArray(value) ? vec(value) : vec(value?.pos ?? value?.position);
const validTeam = team => team === 0 || team === 1;
const validDt = dt => Number.isFinite(dt) ? Math.max(0, dt) : 0;

function freshInventory(team = -1) {
  return { team, small: 0, power: false };
}

function makeState(stage) {
  const goals = Array.isArray(stage?.clams?.goals) ? stage.clams.goals : [];
  const baskets = [0, 1].map(team => ({
    team,
    goal: goals[team] ? pointFrom(goals[team]) : null,
    barrierOpen: false,
    openTimer: 0,
    cooldown: 0,
    tucked: false,
    chancePoints: 0,
    openedWhileLeading: false,
    pendingBreak: null,
  }));
  return {
    clams: [],
    inventories: {},
    baskets,
    spawnTimer: NORMAL_SPAWN_SECONDS,
    nextClamId: 1,
    nextSpawnIndex: 0,
    nextBreakSequence: 0,
    specialDrops: {},
    actorPositions: {},
    actorTeams: {},
    generatedPower: [0, 0],
    scoredPoints: [0, 0],
    overtime: {
      active: false,
      mode: 'none',
      elapsed: 0,
      opportunityTimer: null,
      losingTeam: -1,
      winningTeam: -1,
      waitingForOpen: false,
      requiresPowerOpportunity: false,
    },
  };
}

/**
 * Pure Clam Blitz rules. Game objects are JSON state; presentation and ink
 * effects are emitted as bounded engine events for the runtime to consume.
 */
export class ClamsRule {
  constructor(engine, stage = {}) {
    this.engine = engine;
    this.stage = stage;
    this.state = makeState(stage);
    this._seedInitialClams();
  }

  _event(kind, data = {}) {
    if (typeof this.engine?.event === 'function') this.engine.event(kind, data);
  }

  _goal(team) {
    return this.state.baskets[team]?.goal ?? null;
  }

  _spawnPoints() {
    const points = this.stage?.clams?.spawns;
    return Array.isArray(points) ? points.map(pointFrom) : [];
  }

  _seedInitialClams() {
    const points = this._spawnPoints();
    if (!points.length) return;
    // Splatoon 3 starts with thirty field clams. Stage data supplies their
    // authored spawn positions; repeat/offset those positions only when a
    // compact stage fixture provides fewer than thirty anchors.
    for (let i = 0; i < 30; i++) {
      const base = points[i % points.length];
      const ring = Math.floor(i / points.length);
      const angle = ((i * 137.508) % 360) * Math.PI / 180;
      const radius = ring ? 0.13 + (ring % 3) * 0.035 : 0;
      this._newClam('small', null, [base[0] + Math.cos(angle) * radius, base[1], base[2] + Math.sin(angle) * radius], {
        grounded: true,
        expiresIn: null,
        persistent: true,
      });
    }
  }

  _newClam(kind, team, pos, extra = {}) {
    const clam = {
      id: `clam-${this.state.nextClamId++}`,
      kind,
      team: kind === 'power' ? team : null,
      pos: vec(pos),
      velocity: [0, 0, 0],
      grounded: true,
      age: 0,
      expiresIn: CLAM_LIFETIME,
      persistent: false,
      counterPower: false,
      thrower: null,
      pass: false,
      bounces: 0,
      ...extra,
    };
    this.state.clams.push(clam);
    return clam;
  }

  _inventory(id, team) {
    let inv = this.state.inventories[id];
    if (!inv) inv = this.state.inventories[id] = freshInventory(team);
    if (validTeam(team)) inv.team = team;
    return inv;
  }

  totalClams() {
    let total = this.state.clams.length;
    for (const inv of Object.values(this.state.inventories)) {
      total += Math.max(0, Math.min(MAX_SMALL_CLAMS, Number(inv?.small) || 0));
      if (inv?.power) total += 1;
    }
    return total;
  }

  _spawnInterval() {
    if (this.state.overtime.active && this.state.overtime.mode === 'scoreless') return QUICK_SPAWN_SECONDS;
    return this.totalClams() <= QUICK_SPAWN_THRESHOLD ? QUICK_SPAWN_SECONDS : NORMAL_SPAWN_SECONDS;
  }

  _hasPower(team) {
    if (Object.values(this.state.inventories).some(inv => inv?.team === team && inv.power)) return true;
    return this.state.clams.some(clam => clam.kind === 'power' && clam.team === team && clam.expiresIn !== 0);
  }

  _teamHasHeldPower(team) {
    return Object.values(this.state.inventories).some(inv => inv?.team === team && inv.power);
  }

  _spawnGroup(frame) {
    const points = this._spawnPoints();
    if (!points.length) return 0;
    const count = Math.max(0, Math.min(3, FIELD_CAP - this.totalClams()));
    if (!count) return 0;
    let pointIndex = -1;
    for (let n = 0; n < points.length; n++) {
      const candidate = this.state.nextSpawnIndex++ % points.length, p = points[candidate];
      if (!this.state.clams.some(c => c.grounded && Math.hypot(c.pos[0] - p[0], c.pos[2] - p[2]) <= .5 && Math.abs(c.pos[1] - p[1]) <= .4)) {
        pointIndex = candidate; break;
      }
    }
    if (pointIndex < 0) return 0;
    const base = points[pointIndex];
    const offsets = [[-0.22, 0], [0.22, 0], [0, 0.22]];
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      const [dx, dz] = offsets[i];
      const floor = typeof frame?.floorAt === 'function' ? this._floorAt(frame, base[0] + dx, base[2] + dz) : base[1];
      if (floor === null) continue;
      this._newClam('small', null, [base[0] + dx, floor ?? base[1], base[2] + dz], {
        grounded: true,
        expiresIn: null,
        persistent: true,
        spawnIndex: pointIndex,
      });
      spawned++;
    }
    if (spawned) this._event('clam-spawn', { kind: 'small', count: spawned, pos: [...base], spawnIndex: pointIndex });
    return spawned;
  }

  _advanceSpawns(dt, frame) {
    let remaining = dt;
    let guard = 0;
    while (remaining > EPS && guard++ < 512) {
      const interval = this._spawnInterval();
      if (this.state.spawnTimer > interval) this.state.spawnTimer = interval;
      if (remaining + EPS < this.state.spawnTimer) {
        this.state.spawnTimer -= remaining;
        break;
      }
      remaining -= this.state.spawnTimer;
      this.state.spawnTimer = this._spawnInterval();
      const spawned = this._spawnGroup(frame);
      if (!spawned && this.totalClams() >= FIELD_CAP) {
        // The cap is full; keep the next scheduled spawn a full interval away.
        this.state.spawnTimer = this._spawnInterval();
        break;
      }
    }
  }

  _floorAt(frame, x, z) {
    if (typeof frame?.floorAt !== 'function') return 0;
    const y = frame.floorAt(x, z);
    return Number.isFinite(y) ? y : null;
  }

  _actorList(frame) {
    return Array.isArray(frame?.actors) ? frame.actors.filter(actor => actor && actor.id != null && validTeam(actor.team) && Array.isArray(actor.pos)) : [];
  }

  _registerActors(frame) {
    for (const actor of this._actorList(frame)) {
      this.state.actorPositions[actor.id] = vec(actor.pos);
      this.state.actorTeams[actor.id] = actor.team;
      const inv = this._inventory(actor.id, actor.team);
      if (actor.alive === false && (inv.small || inv.power)) this._dropInventory(actor.id, actor.pos, actor.team, frame);
      if (Number.isSafeInteger(actor.clamDrop) && actor.clamDrop > (this.state.specialDrops[actor.id] || 0)) {
        this.state.specialDrops[actor.id] = actor.clamDrop;
        const start = this.state.clams.length;
        this._dropSmallInventory(actor.id, actor.pos, actor.team, frame);
        this._dropInventory(actor.id, actor.pos, actor.team, frame);
        // Eject rather than immediately collecting the inventory again in the
        // same host tick. Airborne thrower exclusion lasts until landing.
        this.state.clams.slice(start).forEach((c, i) => {
          c.pos[1] += .1; c.grounded = false; c.thrower = actor.id; c.ownerTeam = actor.team;
          const angle = i * 2.399963; c.velocity = [Math.cos(angle) * 1.5, 2, Math.sin(angle) * 1.5];
        });
      }
    }
  }

  _smallDeathDropCount(small) {
    if (small <= 0) return 0;
    if (small === 1) return 1;
    if (small <= 4) return 2;
    return 3;
  }

  _dropInventory(id, position, team = this.state.actorTeams[id], frame = null) {
    const inv = this.state.inventories[id];
    if (!inv || (!inv.small && !inv.power)) return;
    const pos = vec(position ?? this.state.actorPositions[id]);
    if (typeof frame?.floorAt === 'function') {
      const floor = this._floorAt(frame, pos[0], pos[2]);
      if (floor !== null) pos[1] = floor;
    }
    const smallDrop = this._smallDeathDropCount(inv.small);
    for (let i = 0; i < smallDrop; i++) {
      this._newClam('small', null, [pos[0] + (i - (smallDrop - 1) / 2) * 0.18, pos[1], pos[2]], {
        grounded: true,
        expiresIn: CLAM_LIFETIME,
      });
    }
    if (smallDrop) this._event('clam-drop', { actor: id, team, kind: 'small', count: smallDrop, pos: [...pos] });
    if (inv.power) {
      const power = this._newClam('power', validTeam(team) ? team : inv.team, [pos[0], pos[1], pos[2]], {
        grounded: true,
        expiresIn: CLAM_LIFETIME,
      });
      this._event('clam-drop', { actor: id, team, kind: 'power', count: 1, id: power.id, pos: [...power.pos] });
    }
    inv.small = 0;
    inv.power = false;
  }

  removeActor(id) {
    const team = this.state.actorTeams[id] ?? this.state.inventories[id]?.team;
    this._dropInventory(id, this.state.actorPositions[id], team);
    delete this.state.inventories[id];
    delete this.state.actorPositions[id];
    delete this.state.actorTeams[id];
    delete this.state.specialDrops[id];
  }

  _distanceSq(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  }

  _pickup(clam, actor, frame) {
    if (!actor.alive || !canCollectClam(actor) || !clam.grounded || this._distanceSq(vec(actor.pos), clam.pos) > 0.82 ** 2) return false;
    const inv = this._inventory(actor.id, actor.team);
    if (clam.kind === 'power') {
      if (clam.team !== actor.team || inv.power) return false;
      if (inv.small) this._dropSmallInventory(actor.id, actor.pos, actor.team, frame);
      const index = this.state.clams.indexOf(clam);
      if (index >= 0) this.state.clams.splice(index, 1);
      inv.power = true;
      clam.expiresIn = null;
      this._event('clam-pickup', { actor: actor.id, team: actor.team, kind: 'power', id: clam.id });
      return true;
    }
    if (inv.power || inv.small >= CLAMS_PER_POWER) return false;
    const index = this.state.clams.indexOf(clam);
    if (index >= 0) this.state.clams.splice(index, 1);
    inv.small++;
    if (inv.small === CLAMS_PER_POWER) {
      inv.small = 0;
      inv.power = true;
      this.state.generatedPower[actor.team]++;
      this._event('clam-power-create', { actor: actor.id, team: actor.team, total: this.state.generatedPower[actor.team] });
    }
    this._event('clam-pickup', { actor: actor.id, team: actor.team, kind: 'small', id: clam.id, small: inv.small, power: inv.power });
    return true;
  }

  _dropSmallInventory(id, position, team, frame = null) {
    const inv = this.state.inventories[id];
    if (!inv || !inv.small) return;
    const pos = vec(position);
    if (typeof frame?.floorAt === 'function') {
      const floor = this._floorAt(frame, pos[0], pos[2]);
      if (floor !== null) pos[1] = floor;
    }
    const count = inv.small;
    for (let i = 0; i < count; i++) {
      this._newClam('small', null, [pos[0] + (i - (count - 1) / 2) * 0.16, pos[1], pos[2]], { grounded: true, expiresIn: CLAM_LIFETIME });
    }
    inv.small = 0;
    this._event('clam-drop', { actor: id, team, kind: 'small', count, pos: [...pos] });
  }

  _processPickups(frame) {
    const actors = this._actorList(frame).filter(actor => actor.alive !== false && canCollectClam(actor));
    for (const clam of [...this.state.clams]) {
      if (!clam.grounded) continue;
      for (const actor of actors) {
        if (this._pickup(clam, actor, frame)) break;
      }
    }
  }

  _throw(actor, input, frame) {
    const inv = this.state.inventories[actor.id];
    if (!inv || actor.alive === false || !canThrowClam(actor) || (!inv.power && !inv.small)) return false;
    const kind = inv.power ? 'power' : 'small';
    const team = actor.team;
    if (kind === 'power') inv.power = false;
    else inv.small--;
    const passActor = input.passTo == null ? null : this._actorList(frame).find(candidate => candidate.id === input.passTo && candidate.alive !== false);
    const desired = passActor
      ? sub(add(vec(passActor.pos), [0, 0.9, 0]), add(vec(actor.pos), [0, 1.15, 0]))
      : vec(input.aim);
    const direction = normalize(desired, normalize(sub(this._goal(team) ?? [actor.pos[0], 0, actor.pos[2] + 1], actor.pos)));
    const speed = kind === 'power' ? POWER_THROW_SPEED : SMALL_THROW_SPEED;
    const pos = add(vec(actor.pos), [0, 1.15, 0]);
    // Inkipedia/Japanese testing notes report 10.4 DU/frame (small) and
    // 8.2 DU/frame (Power Clam). DU-to-world conversion and launch arc are
    // not published for INKWAVE's stage scale; 0.02 world units/DU and this
    // loft are explicit simulation approximations, not source-confirmed data.
    const velocity = [direction[0] * speed, direction[1] * speed + speed * 0.42, direction[2] * speed];
    const passTo = input.passTo ?? null;
    const clam = this._newClam(kind, kind === 'power' ? team : null, pos, {
      velocity,
      grounded: false,
      expiresIn: CLAM_LIFETIME,
      thrower: actor.id,
      ownerTeam: team,
      pass: !!input.pass || passTo != null,
      passTo,
    });
    this._event('clam-throw', { id: clam.id, actor: actor.id, team, kind, pos: [...pos], velocity: [...velocity], pass: clam.pass, passTo });
    return true;
  }

  _processThrows(frame) {
    for (const actor of this._actorList(frame)) {
      const input = frame?.inputs?.[actor.id];
      if (input?.throw === true) this._throw(actor, input, frame);
    }
  }

  _segmentDistanceSq(point, a, b) {
    const ab = sub(b, a);
    const denom = this._distanceSq(ab, [0, 0, 0]);
    const t = denom > EPS ? clamp(((point[0] - a[0]) * ab[0] + (point[1] - a[1]) * ab[1] + (point[2] - a[2]) * ab[2]) / denom, 0, 1) : 0;
    return this._distanceSq(point, add(a, scale(ab, t)));
  }

  _reflect(clam, position, frame) {
    clam.pos = [...position];
    clam.velocity = [clam.velocity[0] * -0.24, Math.max(0.3, Math.abs(clam.velocity[1]) * 0.22), clam.velocity[2] * -0.24];
    clam.grounded = false;
    clam.bounces++;
    if (clam.bounces > 2) {
      clam.velocity = [0, 0, 0];
      clam.grounded = true;
      const floor = this._floorAt(frame, position[0], position[2]);
      if (floor !== null) clam.pos[1] = floor;
    }
  }

  _tryGoal(clam, previous, next, frame) {
    if (clam.kind !== 'power' && clam.kind !== 'small') return false;
    const team = clam.kind === 'power' ? clam.team : (clam.ownerTeam ?? this.state.actorTeams[clam.thrower]);
    if (!validTeam(team)) return false;
    const basket = this.state.baskets[team];
    if (!basket.goal) return false;
    const radius = Number.isFinite(this.stage?.clams?.goalRadius) ? this.stage.clams.goalRadius : 0.95;
    const center = [basket.goal[0], basket.goal[1] + 0.55, basket.goal[2]];
    const closestT = (() => {
      const d = sub(next, previous);
      const n = this._distanceSq(d, [0, 0, 0]);
      return n > EPS ? clamp(((center[0] - previous[0]) * d[0] + (center[1] - previous[1]) * d[1] + (center[2] - previous[2]) * d[2]) / n, 0, 1) : 0;
    })();
    const closest = add(previous, scale(sub(next, previous), closestT));
    if (Math.hypot(closest[0] - center[0], closest[2] - center[2]) > radius || Math.abs(closest[1] - center[1]) > 1.55) return false;
    if (basket.tucked || basket.cooldown > 0) {
      this._event('clam-goal-blocked', { id: clam.id, team, kind: clam.kind, pos: [...closest], reason: 'tucked' });
      this._reflect(clam, closest, frame);
      return true;
    }
    if (clam.kind === 'small' && !basket.barrierOpen) {
      this._event('clam-goal-blocked', { id: clam.id, team, kind: 'small', pos: [...closest], reason: 'barrier' });
      this._reflect(clam, closest, frame);
      return true;
    }
    if (clam.kind === 'power' && !basket.barrierOpen) {
      if (basket.pendingBreak) { this._reflect(clam, closest, frame); return true; }
      basket.pendingBreak = { remaining: CLAM_BARRIER_BREAK_SECONDS, pos: [...closest], sequence: this.state.nextBreakSequence++ };
      this._event('clam-barrier-drill', { team, pos: [...closest], seconds: CLAM_BARRIER_BREAK_SECONDS });
    }
    else this._score(team, clam.kind, closest);
    this.state.clams = this.state.clams.filter(item => item.id !== clam.id);
    return true;
  }

  _openBasket(team, pos) {
    const basket = this.state.baskets[team];
    const before = this._isAhead(team);
    basket.barrierOpen = true;
    basket.openTimer = BASKET_OPEN_SECONDS;
    basket.tucked = false;
    basket.cooldown = 0;
    basket.chancePoints = 0;
    basket.openedWhileLeading = before;
    const opposite = this.state.baskets[1 - team];
    opposite.tucked = true;
    this._event('clam-barrier-open', { team, defendingTeam: 1 - team, pos: [...pos], seconds: BASKET_OPEN_SECONDS });
    this._score(team, 'power', pos, true);
  }

  _score(team, kind, pos, barrierBreak = false) {
    const points = kind === 'power' ? POWER_SCORE : SMALL_SCORE;
    const basket = this.state.baskets[team];
    this.state.scoredPoints[team] += points;
    if (basket.barrierOpen) {
      basket.chancePoints += points;
      basket.openTimer = Math.min(BASKET_OPEN_SECONDS, basket.openTimer + (kind === 'power' ? 10 : 3));
    }
    if (typeof this.engine?.score === 'function') this.engine.score(team, points);
    this._event('clam-score', { team, kind, points, barrierBreak, pos: [...pos], basketTimer: basket.openTimer });
    const overtime = this.state.overtime;
    if (overtime.active) {
      if (overtime.mode === 'scoreless') {
        this._finish(team, 'clam-overtime-score');
        return;
      }
      if (team === overtime.winningTeam) {
        this._finish(overtime.winningTeam, 'clam-overtime-leading-score');
        return;
      }
      if (team === overtime.losingTeam && this._isAhead(team)) {
        this._finish(team, 'clam-overtime-comeback');
        return;
      }
    }
    if (Array.isArray(this.engine?.counts) && this.engine.counts[team] <= 0 && this.engine.winner == null) {
      this._finish(team, 'clam-knockout');
    }
  }

  _counterPower(team, position, frame = null) {
    if (this.totalClams() >= FIELD_CAP) return null;
    const duplicate = this.state.clams.some(clam => clam.counterPower && clam.team === team && clam.persistent);
    if (duplicate) return null;
    const pos = vec(position);
    if (typeof frame?.floorAt === 'function') {
      const floor = this._floorAt(frame, pos[0], pos[2]);
      if (floor !== null) pos[1] = floor;
    }
    const clam = this._newClam('power', team, pos, {
      grounded: true,
      expiresIn: null,
      persistent: true,
      counterPower: true,
    });
    this._event('clam-counter-power', { id: clam.id, team, pos: [...clam.pos] });
    this._paintPower(clam, clam.pos);
    return clam;
  }

  _closeBasket(team, frame = null) {
    const basket = this.state.baskets[team];
    if (!basket.barrierOpen) return;
    const defender = 1 - team;
    this.engine.resolveTie?.(team);
    basket.barrierOpen = false;
    basket.openTimer = 0;
    basket.tucked = true;
    basket.cooldown = BASKET_COOLDOWN_SECONDS;
    const points = basket.chancePoints;
    if (points > 0 && typeof this.engine?.addPenalty === 'function') this.engine.addPenalty(team, points / 2);
    else if (points > 0 && Array.isArray(this.engine?.penalties)) {
      this.engine.penalties[team] = Math.max(0, Number(this.engine.penalties[team]) || 0) + points / 2;
    }
    basket.chancePoints = 0;
    basket.openedWhileLeading = false;
    const opposite = this.state.baskets[defender];
    opposite.tucked = false;
    opposite.cooldown = 0;
    this._counterPower(defender, basket.goal ?? [0, 0, 0], frame);
    this._event('clam-barrier-close', { team, defendingTeam: defender, seconds: BASKET_COOLDOWN_SECONDS, penalty: points / 2, goal: basket.goal });
    if (this.state.overtime.active && this.state.overtime.mode === 'comeback') {
      if (team === this.state.overtime.losingTeam)
        this._finish(this.state.overtime.winningTeam, 'clam-overtime-chance-ended');
    }
  }

  _advanceBasketTimers(dt, frame) {
    const ready = [];
    const newlyOpened = new Map();
    for (const basket of this.state.baskets) if (basket.pendingBreak) {
      basket.pendingBreak.remaining -= dt;
      if (basket.pendingBreak.remaining <= EPS) ready.push(basket);
    }
    ready.sort((a, b) => a.pendingBreak.remaining - b.pendingBreak.remaining || a.pendingBreak.sequence - b.pendingBreak.sequence);
    for (const basket of ready) {
      const drill = basket.pendingBreak; basket.pendingBreak = null;
      if (basket.tucked || basket.cooldown > 0) {
        const floor = this._floorAt(frame, drill.pos[0], drill.pos[2]);
        this._newClam('power', basket.team, [drill.pos[0], floor ?? drill.pos[1], drill.pos[2]]);
      } else {
        this._openBasket(basket.team, drill.pos);
        newlyOpened.set(basket.team, Math.max(0, -drill.remaining));
      }
      if (this.engine?.winner != null) return;
    }
    for (const basket of this.state.baskets) {
      if (basket.barrierOpen) {
        basket.openTimer = Math.max(0, basket.openTimer - (newlyOpened.get(basket.team) ?? dt));
        if (basket.openTimer <= EPS) this._closeBasket(basket.team, frame);
      } else if (basket.cooldown > 0) {
        basket.cooldown = Math.max(0, basket.cooldown - dt);
        if (basket.cooldown <= EPS) {
          basket.cooldown = 0;
          basket.tucked = false;
          this._event('clam-goal-raised', { team: basket.team, goal: basket.goal });
        }
      }
    }
  }

  _collectFromProjectile(clam, actor, frame) {
    const bodyCenter = add(vec(actor.pos), [0, 0.9, 0]);
    if (!actor.alive || !canCollectClam(actor) || this._distanceSq(bodyCenter, clam.pos) > 0.72 ** 2) return false;
    if (clam.kind === 'power' && clam.team !== actor.team) return false;
    const inv = this._inventory(actor.id, actor.team);
    if (clam.kind === 'power') {
      if (inv.power) return false;
      if (inv.small) this._dropSmallInventory(actor.id, actor.pos, actor.team, frame);
      inv.power = true;
    } else {
      if (inv.power || inv.small >= CLAMS_PER_POWER) return false;
      inv.small++;
      if (inv.small === CLAMS_PER_POWER) {
        inv.small = 0;
        inv.power = true;
        this.state.generatedPower[actor.team]++;
        this._event('clam-power-create', { actor: actor.id, team: actor.team, total: this.state.generatedPower[actor.team] });
      }
    }
    const passed = actor.team === (clam.ownerTeam ?? this.state.actorTeams[clam.thrower]) && actor.id !== clam.thrower;
    this._event(passed ? 'clam-pass' : 'clam-pickup', {
      id: clam.id, actor: actor.id, from: clam.thrower, team: actor.team, kind: clam.kind,
    });
    return true;
  }

  _advanceProjectiles(dt, frame) {
    if (!dt || !this.state.clams.length) return;
    let remaining = dt;
    let steps = 0;
    while (remaining > EPS && steps++ < 300) {
      const step = Math.min(remaining, 1 / 30);
      remaining -= step;
      for (const clam of [...this.state.clams]) {
        clam.age += step;
        if (clam.grounded) continue;
        const previous = [...clam.pos];
        clam.velocity[1] -= GRAVITY * step;
        const next = add(previous, scale(clam.velocity, step));
        const blocked = typeof frame?.blocked === 'function' && frame.blocked(previous, next) === true;
        if (blocked) {
          this._paintPower(clam, previous);
          this._event('clam-collision', { id: clam.id, pos: [...previous], kind: clam.kind });
          this._reflect(clam, previous, frame);
          continue;
        }
        if (this._tryGoal(clam, previous, next, frame)) {
          if (this.engine?.winner != null) return;
          continue;
        }
        let actorHit = false;
        for (const actor of this._actorList(frame)) {
          if (actor.alive === false || actor.id === clam.thrower) continue;
          if (this._segmentDistanceSq(add(vec(actor.pos), [0, 0.9, 0]), previous, next) > 0.72 ** 2) continue;
          if (this._collectFromProjectile(clam, actor, frame)) {
            this.state.clams = this.state.clams.filter(item => item.id !== clam.id);
            actorHit = true;
            break;
          }
        }
        if (actorHit) continue;
        const floor = this._floorAt(frame, next[0], next[2]);
        if (floor === null || next[1] < floor - 12) {
          this.state.clams = this.state.clams.filter(item => item.id !== clam.id);
          this._event('clam-lost', { id: clam.id, kind: clam.kind, pos: [...next] });
          continue;
        }
        if (next[1] <= floor) {
          clam.pos = [next[0], floor, next[2]];
          this._paintPower(clam, clam.pos);
          if (clam.velocity[1] < -1 && clam.bounces < 1) {
            clam.velocity[1] = Math.abs(clam.velocity[1]) * 0.28;
            clam.velocity[0] *= 0.5;
            clam.velocity[2] *= 0.5;
            clam.bounces++;
          } else {
            clam.velocity = [0, 0, 0];
            clam.grounded = true;
          }
        } else clam.pos = next;
      }
    }
  }

  _expireAndAge(dt) {
    if (!dt) return;
    for (const clam of [...this.state.clams]) {
      if (clam.persistent || !Number.isFinite(clam.expiresIn)) continue;
      clam.expiresIn -= dt;
      if (clam.expiresIn <= EPS) {
        this.state.clams = this.state.clams.filter(item => item.id !== clam.id);
        this._event('clam-expire', { id: clam.id, team: clam.team, kind: clam.kind });
      }
    }
  }
  _paintPower(clam, pos) {
    if (clam.kind !== 'power' || clam.painted || !validTeam(clam.team)) return;
    clam.painted = true;
    this._event('clam-paint', { team: clam.team, pos: [...pos], radius: .7 });
  }

  _isAhead(team) {
    const counts = this.engine?.counts;
    return Array.isArray(counts) && Number.isFinite(counts[team]) && Number.isFinite(counts[1 - team]) && counts[team] < counts[1 - team] - EPS;
  }

  _leadingTeam() {
    const counts = this.engine?.counts;
    if (!Array.isArray(counts) || !Number.isFinite(counts[0]) || !Number.isFinite(counts[1])) return -1;
    if (counts[0] < counts[1] - EPS) return 0;
    if (counts[1] < counts[0] - EPS) return 1;
    return validTeam(this.engine?.leader) ? this.engine.leader : -1;
  }

  beginOvertime() {
    if (this.state.overtime.active) return true;
    const scored = this.state.scoredPoints[0] + this.state.scoredPoints[1] > 0;
    if (!scored) {
      this.state.overtime = {
        active: true, mode: 'scoreless', elapsed: 0, opportunityTimer: null,
        losingTeam: -1, winningTeam: -1, waitingForOpen: false, requiresPowerOpportunity: false,
      };
      this._event('overtime', { mode: 'scoreless', seconds: SCORELESS_OVERTIME_SECONDS });
      return true;
    }
    const winningTeam = this._leadingTeam();
    if (!validTeam(winningTeam)) return false;
    const losingTeam = 1 - winningTeam;
    const losingBasket = this.state.baskets[losingTeam];
    const winningBasket = this.state.baskets[winningTeam];
    const hasPowerOpportunity = this._hasPower(losingTeam);
    // baskets[team] is that team's ATTACK target, not its own defended goal.
    const winnerWindowOpen = losingBasket.barrierOpen;
    const loserWasLeadingWhenOpened = winningBasket.barrierOpen && !winningBasket.openedWhileLeading;
    if (!hasPowerOpportunity && !winnerWindowOpen && !loserWasLeadingWhenOpened) return false;
    const waitingForOpen = !losingBasket.barrierOpen;
    this.state.overtime = {
      active: true,
      mode: 'comeback',
      elapsed: 0,
      opportunityTimer: waitingForOpen ? COMEBACK_SECONDS : null,
      losingTeam,
      winningTeam,
      waitingForOpen,
      requiresPowerOpportunity: hasPowerOpportunity,
    };
    this._event('overtime', { mode: 'comeback', losingTeam, winningTeam, seconds: this.state.overtime.opportunityTimer });
    return true;
  }

  _finish(team, reason) {
    if (!validTeam(team)) return;
    if (typeof this.engine?.finish === 'function') this.engine.finish(team, reason);
    this.state.overtime.active = false;
    this.state.overtime.mode = 'finished';
  }

  _finishScorelessOvertime() {
    const [team0, team1] = this.state.generatedPower;
    const alpha = validTeam(this.engine?.alphaTeam) ? this.engine.alphaTeam : 0;
    const winner = team0 > team1 ? 0 : team1 > team0 ? 1 : alpha;
    if (typeof this.engine?.score === 'function') this.engine.score(winner, 1);
    this._finish(winner, 'clam-overtime-power-clam-tiebreak');
  }

  _updateOvertimeState(dt) {
    const overtime = this.state.overtime;
    if (!overtime.active) return;
    overtime.elapsed += dt;
    if (overtime.mode === 'scoreless') {
      if (overtime.elapsed + EPS >= SCORELESS_OVERTIME_SECONDS) this._finishScorelessOvertime();
      return;
    }
    if (overtime.mode !== 'comeback') return;
    const losingBasket = this.state.baskets[overtime.losingTeam];
    if (losingBasket.barrierOpen) {
      overtime.waitingForOpen = false;
      overtime.opportunityTimer = null;
    } else if (overtime.opportunityTimer != null) {
      overtime.opportunityTimer = Math.max(0, overtime.opportunityTimer - dt);
      if (overtime.opportunityTimer <= EPS) {
        this._finish(overtime.winningTeam, 'clam-overtime-open-window-expired');
        return;
      }
    }
    if (this._hasPower(overtime.losingTeam)) overtime.requiresPowerOpportunity = true;
    if (overtime.waitingForOpen && overtime.requiresPowerOpportunity && !this._hasPower(overtime.losingTeam) && !losingBasket.pendingBreak) {
      this._finish(overtime.winningTeam, 'clam-overtime-power-clams-lost');
    }
  }

  _passiveSpecial(dt) {
    if (typeof this.engine?.special !== 'function' || this.state.baskets.some(basket => basket.barrierOpen)) return;
    const held = [this._teamHasHeldPower(0), this._teamHasHeldPower(1)];
    const losing = this._leadingTeam();
    if (held[0] !== held[1]) {
      this.engine.special(held[0] ? 0 : 1, 3 * dt);
    } else if (validTeam(losing)) this.engine.special(1 - losing, 3 * dt);
  }

  _update(dt, frame = {}) {
    dt = validDt(dt);
    if (this.engine?.winner != null) return;
    this._expireAndAge(dt);
    this._registerActors(frame);
    this._advanceBasketTimers(dt, frame);
    if (this.engine?.winner != null) return;
    this._advanceSpawns(dt, frame);
    this._advanceProjectiles(dt, frame);
    if (this.engine?.winner != null) return;
    this._processPickups(frame);
    this._processThrows(frame);
    this._updateOvertimeState(dt);
    this._passiveSpecial(dt);
  }

  update(dt, frame) {
    // The shared RankedEngine calls the normal update method and then the
    // rule-specific overtime method on overtime ticks; only the latter steps
    // timers and projectiles after the engine has entered overtime.
    if (this.engine?.overtime) return;
    this._update(dt, frame);
  }

  updateOvertime(dt, frame) {
    this._update(dt, frame);
  }

  snapshot() {
    return clone(this.state);
  }

  restore(state) {
    this.state = clone(state);
    if (!Array.isArray(this.state.clams)) this.state.clams = [];
    if (!this.state.inventories || typeof this.state.inventories !== 'object') this.state.inventories = {};
    if (!Array.isArray(this.state.baskets) || this.state.baskets.length !== 2) this.state.baskets = makeState(this.stage).baskets;
    if (!Array.isArray(this.state.generatedPower)) this.state.generatedPower = [0, 0];
    if (!this.state.specialDrops) this.state.specialDrops = {};
    if (!Number.isSafeInteger(this.state.nextBreakSequence)) this.state.nextBreakSequence = 0;
    if (!Array.isArray(this.state.scoredPoints)) this.state.scoredPoints = [0, 0];
    if (!this.state.overtime || typeof this.state.overtime !== 'object') this.state.overtime = makeState(this.stage).overtime;
    if (!Number.isFinite(this.state.spawnTimer)) this.state.spawnTimer = NORMAL_SPAWN_SECONDS;
    if (!Number.isSafeInteger(this.state.nextClamId)) this.state.nextClamId = this.state.clams.length + 1;
    return this.snapshot();
  }

  botGoal(actor, frame = {}) {
    if (!actor || actor.alive === false || !validTeam(actor.team) || !Array.isArray(actor.pos)) return null;
    const position = vec(actor.pos);
    const inv = this.state.inventories[actor.id] ?? freshInventory(actor.team);
    const target = this._goal(actor.team);
    const aimAt = point => vec(point);
    const reachable = (point, from = position) => typeof frame?.blocked !== 'function' || frame.blocked(from, point) !== true;
    const ownDefense = this._goal(1 - actor.team);
    const enemyOpen = this.state.baskets[actor.team].barrierOpen && !this.state.baskets[actor.team].tucked;
    const ownGoalThreatened = this.state.baskets[1 - actor.team].barrierOpen;

    if (ownGoalThreatened && ownDefense && reachable(ownDefense)) {
      return { pos: [...ownDefense], action: 'defend', aim: aimAt(ownDefense) };
    }
    const attackBasket = this.state.baskets[actor.team];
    if (inv.power && target && reachable(target)) {
      return {
        pos: [...target],
        action: attackBasket.tucked || attackBasket.cooldown > 0 ? 'carry' : 'throw',
        aim: aimAt(target),
      };
    }
    if (inv.small > 0 && enemyOpen && !attackBasket.tucked && attackBasket.cooldown <= 0 && target && reachable(target)) {
      return { pos: [...target], action: 'throw', aim: aimAt(target) };
    }

    const canCollect = !inv.power && inv.small < MAX_SMALL_CLAMS;
    if (canCollect) {
      const candidates = this.state.clams.filter(clam => clam.grounded && (clam.kind === 'small' || clam.team === actor.team));
      candidates.sort((a, b) => this._distanceSq(position, a.pos) - this._distanceSq(position, b.pos));
      const clam = candidates.find(item => reachable(item.pos));
      if (clam) return { pos: [...clam.pos], action: 'collect', aim: aimAt(clam.pos) };
    }

    if (inv.small > 0 && target && reachable(target)) {
      // Carry toward a reachable power-clam carrier for a physical pass when
      // one is available; the controller expresses the eventual throw intent.
      const ally = this._actorList(frame).find(other => other.id !== actor.id && other.alive !== false && other.team === actor.team && this.state.inventories[other.id]?.power);
      if (ally && reachable(ally.pos)) return { pos: vec(ally.pos), action: 'throw', aim: aimAt(ally.pos), pass: true };
      return { pos: [...target], action: 'carry', aim: aimAt(target) };
    }
    if (target && reachable(target)) return { pos: [...target], action: 'collect', aim: aimAt(target) };
    return null;
  }
}

export const CLAMS_RULE_PARAMETERS = Object.freeze({
  maxSmall: MAX_SMALL_CLAMS,
  clamsPerPower: CLAMS_PER_POWER,
  fieldCap: FIELD_CAP,
  quickSpawnThreshold: QUICK_SPAWN_THRESHOLD,
  normalSpawnSeconds: NORMAL_SPAWN_SECONDS,
  quickSpawnSeconds: QUICK_SPAWN_SECONDS,
  basketOpenSeconds: BASKET_OPEN_SECONDS,
  basketCooldownSeconds: BASKET_COOLDOWN_SECONDS,
  comebackSeconds: COMEBACK_SECONDS,
  scorelessOvertimeSeconds: SCORELESS_OVERTIME_SECONDS,
  smallScore: SMALL_SCORE,
  powerScore: POWER_SCORE,
  throwGameDistanceUnitsPerFrame: { small: 10.4, power: 8.2 },
  throwWorldScaleUnverified: true,
});
