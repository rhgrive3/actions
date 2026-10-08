const EPS = 1e-10;
const NO_CONTEST_WINDOW = 60;
const NO_CONTEST_DELAY = 6;
const INSTALLED = Symbol.for('inkwave.s3.disconnect-fidelity.v1');

export function matchElapsed(match) {
  return Math.max(0, (match?.duration || 0) - (match?.time || 0));
}
export function disconnectStartsNoContest(match) {
  return match?.state === 'playing' && matchElapsed(match) < NO_CONTEST_WINDOW - EPS;
}

export function deactivateDisconnectedActor(netmatch, actor) {
  if (!actor || actor.s3?.disconnected) return actor;
  actor.s3 ||= {};
  actor.s3.disconnected = true;
  actor.s3.disconnectedAt = netmatch.match ? matchElapsed(netmatch.match) : 0;
  netmatch._stopLoops?.(actor);
  actor.owner = null;
  actor.remote = true;
  actor.isBot = false;
  actor.bot = null;
  actor.alive = false;
  actor.hp = 0;
  actor.respawnTimer = Infinity;
  actor.superJumpState = null;
  actor.specialActive = null;
  actor.fireBuffer = 0;
  actor.intent?.move?.set?.(0, 0, 0);
  if (actor.intent) actor.intent.fire = actor.intent.squid = actor.intent.sub = actor.intent.jump = actor.intent.special = false;
  actor.weaponRunner?.cancelPendingInput?.();
  actor.weaponRunner?.reset?.();
  if (actor.net) {
    actor.net.buf?.splice?.(0);
    actor.net.spawnPending = false;
    actor.net.handoff = false;
  }
  actor.character?.setVisible?.(false);
  if (actor.character?.root) actor.character.root.visible = false;
  return actor;
}

function startNoContest(nm, seconds = NO_CONTEST_DELAY, announce = false) {
  if (!nm?.match || nm.s3NoContestEnded) return;
  nm.match.s3NoContest = true;
  nm.s3NoContestRemaining = Math.max(0, Number.isFinite(seconds) ? seconds : NO_CONTEST_DELAY);
  if (announce && nm.isHost) nm._sendNow?.({ k: 'nc', r: nm.s3NoContestRemaining });
}

function finishNoContest(nm, announce = false) {
  if (!nm?.match || nm.s3NoContestEnded) return;
  nm.s3NoContestEnded = true;
  nm.s3NoContestRemaining = 0;
  nm.match.s3NoContest = true;
  nm.match.s3NoContestFinished = true;
  nm.match.paused = true; // never fall through to the normal turf judge / XP path
  if (announce && nm.isHost) nm._sendNow?.({ k: 'ncend' });
  const game = nm.__s3G?.game || null;
  game?.hud?.banner?.('NO CONTEST');
  game?.netMatchEnd?.();
}

export function installDisconnectFidelity(api) {
  const { NetMatch, G } = api || {};
  if (!NetMatch?.prototype) return;
  const nm = NetMatch.prototype;
  // Refresh the runtime context even when the same prototype is installed again
  // by an isolated fixture; wrapped methods must not retain a stale G instance.
  Object.defineProperty(nm, '__s3G', { get() { return G; }, configurable: true });
  if (nm[INSTALLED]) return;
  Object.defineProperty(nm, INSTALLED, { value: true });

  const bind = nm.bind;
  nm.bind = function (match, ...args) {
    const result = bind.call(this, match, ...args);
    this.s3NoContestRemaining = 0;
    this.s3NoContestEnded = false;

    // Preserve roster identity/stats in HUD data while making the disconnect
    // explicit instead of silently showing a dead/respawning player.
    if (match?.teamSummary && !match._s3DisconnectedSummaryInstalled) {
      const summary = match.teamSummary.bind(match);
      match.teamSummary = () => {
        const rows = summary();
        for (let team = 0; team < rows.length; team++) {
          const actors = match.actors.filter(a => a.team === team);
          for (let i = 0; i < rows[team].players.length; i++) {
            const a = actors[i];
            if (a?.s3?.disconnected) {
              rows[team].players[i].disconnected = true;
              rows[team].players[i].name = `${a.name} · DISCONNECTED`;
              rows[team].players[i].respawn = 0;
            }
          }
        }
        return rows;
      };
      match._s3DisconnectedSummaryInstalled = true;
    }

    // #1025: a member can disappear after the roster freezes but before bind.
    // Reconcile every stage, not only no-bot stages, through the same leave
    // policy used once NetMatch is live.
    const missing = new Set();
    for (const a of [...this.byNid.values()])
      if (a.owner && a.owner !== this.myId && !this.s?._members?.has?.(a.owner)) missing.add(a.owner);
    for (const owner of missing) this.onLeave(owner, false);
    return result;
  };

  nm.onLeave = function (id, hostChanged) {
    if (!this.match) return;
    const affected = [...this.byNid.values()].filter(a => a.owner === id);
    const live = this.match.state === 'playing';

    // A loading/intro owner that vanished never becomes a dead remote slot.
    // It was not yet a live battle participant, so remove it from this match.
    if (!live) {
      for (const a of affected) this._remove(a);
    } else {
      for (const a of affected) {
        deactivateDisconnectedActor(this, a);
        this.__s3G?.game?.hud?.banner?.(`${a.name} DISCONNECTED`);
      }
      // #201: first-minute communication errors become a six-second no-contest
      // countdown. Only the host emits the authoritative countdown/end packet.
      if (affected.length && disconnectStartsNoContest(this.match)) {
        if (this.isHost) startNoContest(this, NO_CONTEST_DELAY, true);
      }
    }

    // Host migration keeps clock/boss authority, but never revives the departed
    // human as an AI-controlled combatant.
    if (hostChanged && this.isHost) { this.match.follower = false; this.clockT = 0; }
    if (hostChanged && this.match.boss) {
      if (this.isHost) this.match.boss.adopt();
      else this.match.boss.handoff();
    }
  };

  const applyRemote = nm.applyRemote;
  nm.applyRemote = function (actor, ...args) {
    if (actor?.s3?.disconnected) return;
    return applyRemote.call(this, actor, ...args);
  };

  const shouldApplyHit = nm.shouldApplyHit;
  nm.shouldApplyHit = function (attacker, victim, ...args) {
    if (attacker?.s3?.disconnected || victim?.s3?.disconnected) return 'drop';
    return shouldApplyHit.call(this, attacker, victim, ...args);
  };

  const onMessage = nm.onMessage;
  nm.onMessage = function (from, d) {
    if (d?.k === 'nc' && from === this.s?.hostId) {
      startNoContest(this, d.r, false);
      return;
    }
    if (d?.k === 'ncend' && from === this.s?.hostId) {
      finishNoContest(this, false);
      return;
    }
    return onMessage.call(this, from, d);
  };

  const update = nm.update;
  nm.update = function (dt, ...args) {
    const result = update.call(this, dt, ...args);
    if (this.s3NoContestRemaining > EPS && !this.s3NoContestEnded) {
      this.s3NoContestRemaining = Math.max(0, this.s3NoContestRemaining - Math.max(0, dt));
      if (this.s3NoContestRemaining <= EPS && this.isHost) finishNoContest(this, true);
    }
    return result;
  };
}

export { NO_CONTEST_WINDOW, NO_CONTEST_DELAY };
