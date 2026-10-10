const EPS = 1e-10;
const NO_CONTEST_WINDOW = 60;
const NO_CONTEST_DELAY = 6;
const INSTALLED = Symbol.for('inkwave.s3.disconnect-fidelity.v1');
let world = null;

export function matchElapsed(match) {
  return Math.max(0, (match?.duration || 0) - (match?.time || 0));
}
export function disconnectStartsNoContest(match) {
  return match?.state === 'playing' && matchElapsed(match) < NO_CONTEST_WINDOW - EPS;
}

// #905: the current disconnect policy retires a human instead of adopting
// a bot. Never leave ownerless live Ink Storm rain damaging nearby players
// without any peer that can author its remaining turf. Every peer receives
// the same owner-leave transition and retires only that owner's storm.
// Splat Bombs/other specials have their own separate lifecycle policies.
export function retireDisconnectedStorms(netmatch, actor) {
  const projectiles = (netmatch?.__s3G || world)?.projectiles;
  if (!projectiles || !actor) return { clouds: 0, bombs: 0 };
  let clouds = 0, bombs = 0;
  const activeClouds = projectiles.clouds;
  if (Array.isArray(activeClouds)) for (let i = activeClouds.length - 1; i >= 0; i--) {
    const c = activeClouds[i];
    if (c?.owner !== actor) continue;
    projectiles._releaseCloud?.(c, 0.1);
    activeClouds.splice(i, 1);
    clouds++;
  }
  const activeBombs = projectiles.bombs;
  if (Array.isArray(activeBombs)) for (let i = activeBombs.length - 1; i >= 0; i--) {
    const b = activeBombs[i];
    if (b?.owner !== actor || b.kind !== 'storm') continue;
    projectiles._releaseBomb?.(b);
    activeBombs.splice(i, 1);
    bombs++;
  }
  return { clouds, bombs };
}

export function deactivateDisconnectedActor(netmatch, actor) {
  if (!actor || actor.s3?.disconnected) return actor;
  retireDisconnectedStorms(netmatch, actor);
  retireDisconnectedMainProjectiles((netmatch?.__s3G || world)?.projectiles, actor);
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

// A pending No Contest must outrank the ordinary Turf timeout/judge even if
// the match timer reaches zero during its six-second notification interval.
function fenceNoContestJudging(match) {
  if (!match || match._s3NoContestJudgingFenced) return;
  match._s3NoContestJudgingFenced = true;
  if (typeof match.setState === 'function') {
    const setState = match.setState;
    match.setState = function (state, ...args) {
      if (this.s3NoContest && (state === 'finish' || state === 'judge' || state === 'results')) return;
      return setState.call(this, state, ...args);
    };
  }
  if (typeof match._judge === 'function') {
    const judge = match._judge;
    match._judge = function (...args) {
      if (this.s3NoContest) return;
      return judge.apply(this, args);
    };
  }
}

// Once an ordinary result is committed, delayed cancellation traffic cannot
// replace it. An already accepted No Contest retains its existing precedence.
function startNoContest(nm, seconds = NO_CONTEST_DELAY, announce = false) {
  if (!nm?.match || nm.s3NoContestEnded || nm.match.result && !nm.match.s3NoContest) return;
  const remaining = Math.max(0, Number.isFinite(seconds) ? seconds : NO_CONTEST_DELAY);
  // Retry/host migration notices may shorten the existing decision, never
  // restart its elapsed six-second window (including a guest already at zero).
  nm.s3NoContestRemaining = nm.match.s3NoContest && Number.isFinite(nm.s3NoContestRemaining)
    ? Math.min(nm.s3NoContestRemaining, remaining) : remaining;
  nm.match.s3NoContest = true;
  if (announce && nm.isHost) nm._sendNow?.({ k: 'nc', r: nm.s3NoContestRemaining });
}

function finishNoContest(nm, announce = false) {
  if (!nm?.match || nm.s3NoContestEnded || nm.match.result && !nm.match.s3NoContest) return;
  nm.s3NoContestEnded = true;
  nm.s3NoContestRemaining = 0;
  nm.match.s3NoContest = true;
  nm.match.s3NoContestFinished = true;
  nm.match.paused = true; // never fall through to the normal turf judge / XP path
  if (announce && nm.isHost) nm._sendNow?.({ k: 'ncend' });
  const game = nm.__s3G?.game || world?.game || null;
  game?.hud?.banner?.('NO CONTEST');
  game?.netMatchEnd?.();
}

export function installDisconnectFidelity(api) {
  const { NetMatch, G } = api || {};
  world = G || world;
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
    fenceNoContestJudging(match);
    this.s3DisconnectedOwners = new Set();
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
    const participated = live || ['finish', 'judge', 'results'].includes(this.match.state) || !!this.match.result;
    if (affected.length) {
      this.s3DisconnectedOwners ||= new Set();
      this.s3DisconnectedOwners.add(id);
      // Events are queued by transport sender, not by Actor. In particular,
      // 's' paint events carry no actor id: clearing only Actor.net.buf is not
      // sufficient after a disconnect.
      const peer = this.peers?.get?.(id);
      if (peer?.events) peer.events.length = 0;
    }

    // Only loading/intro owners never participated. Keep terminal battle rows
    // available for the final authoritative statistics and results presentation.
    if (!participated) {
      for (const a of affected) {
        // An owner may leave during finish/judge while an old Storm is still
        // animated. The roster removal must not strand its projectile objects.
        retireDisconnectedStorms(this, a);
        retireDisconnectedMainProjectiles(this.__s3G?.projectiles, a);
        this._remove(a);
      }
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

  // Reject delayed packets and playback from a departed owner, including
  // paint events without an actor nid. Rejoining a match requires a new bind.
  if (typeof nm._tick === 'function') {
    const tick = nm._tick;
    nm._tick = function (from, ...args) {
      if (this.s3DisconnectedOwners?.has(from)) return;
      return tick.call(this, from, ...args);
    };
  }
  if (typeof nm._play === 'function') {
    const play = nm._play;
    nm._play = function (from, ...args) {
      if (this.s3DisconnectedOwners?.has(from)) return;
      return play.call(this, from, ...args);
    };
  }

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
    // An old host result cannot override a previously announced No Contest.
    if (this.match?.s3NoContest && from === this.s?.hostId &&
        (d?.k === 'res' || d?.k === 'end' ||
         (d?.k === 'st' && (d.s === 'finish' || d.s === 'judge' || d.s === 'results')))) return;
    return onMessage.call(this, from, d);
  };

  const update = nm.update;
  nm.update = function (dt, ...args) {
    const result = update.call(this, dt, ...args);
    // A guest may already have reached zero before becoming the new host.
    // The pending decision, rather than a positive clock, owns completion.
    if (this.match?.s3NoContest && !this.s3NoContestEnded && Number.isFinite(this.s3NoContestRemaining)) {
      this.s3NoContestRemaining = Math.max(0, this.s3NoContestRemaining - (Number.isFinite(dt) ? Math.max(0, dt) : 0));
      if (this.s3NoContestRemaining <= EPS && this.isHost) finishNoContest(this, true);
    }
    return result;
  };
}

export { NO_CONTEST_WINDOW, NO_CONTEST_DELAY };

// #955 chooses the issue's explicit cancellation policy. No ghost is promoted
// into damage authority; every peer retires the departed sender's main rounds.
const mainKinds=new Set(['shooter','dualies','splatling','roller','slosher','blaster','charger']);
export function retireDisconnectedMainProjectiles(system,owner,{ghostOnly=false}={}){
 if(!system)return 0;
 let count=0;
 const owns=p=>(!owner||p.owner===owner)&&(!ghostOnly||p.ghost);
 const remove=(list,predicate,release)=>{if(!Array.isArray(list))return;for(let i=list.length-1;i>=0;i--)if(predicate(list[i])){const p=list[i];list.splice(i,1);release?.(p);count++;}};
 remove(system.list,p=>owns(p)&&!p.s3SpecialWeapon&&!p.s3Kit&&mainKinds.has(p.s3Weapon?.kind||p.owner?.weapon?.kind),p=>{
  p._netEnded=true;p._qualityDead=true;p._netEndStep=p._netSteps;
  if(system._recycle)system._recycle(p);else system.pool?.push(p);
 });
 remove(system.inkFlight?.drops,owns,p=>system.inkFlight.pool?.push(p));
 const retiredBeams=new Set();
 remove(system._fidelityChargerFlights,owns,p=>{if(p.beam)retiredBeams.add(p.beam);});
 remove(system.beams,b=>retiredBeams.has(b)||(!owner||b._netOwner===owner)&&!!b._netPeer,b=>{
  if(b.mesh){b.mesh.visible=false;system.beamPool?.push(b.mesh);}
 });
 for(const key of ['_s3DetachedWallDrops','_s3TimedBlasterDrops','_s3ChargerWallDrops'])remove(system[key],owns);
 remove(system.s3BlastQueue,entry=>owns(entry.p));
 return count;
}

// #505: owner life histories, not interpolated proxy alive flags, determine
// online WIPEOUT. Finalize only frames all four owners have reported past.
const MAX_EVENTS = 2048, MAX_FRAME = 60 * 60 * 60;
const integer = n => Number.isSafeInteger(n) && n >= 0;
function valid(nm) {
  const m = nm.match;
  return nm._matchStateAPI?.G.netm === nm && nm._matchStateAPI?.G.match === m && typeof nm.cfg?.id === 'string' && nm.cfg.id &&
    m?.mode === 'turf' && !m.attract && !m.range && !m.opts?.range && !m.paused &&
    m.actors?.length === 8 && [0, 1].every(t => m.actors.filter(a => a.team === t).length === 4) &&
    m.actors.every(a => !a.s3?.disconnected && nm.byNid.get(a.nid) === a);
}
function state(nm) {
  return nm._wipeoutLedger ||= { rows: new Map(), own: new Map(), confirmed: new Map(), applied: new Set() };
}
function frame(nm) {
  return Math.max(0, Math.min(MAX_FRAME, Math.round((nm.match.duration - nm.match.time) * 60)));
}
function ownRow(nm, a) {
  const s = state(nm); let row = s.own.get(a.nid);
  if (!row) {
    row = { n: a.nid, q: 0, w: 0, h: [[0, a.netLife ?? 0, 1]] };
    s.own.set(a.nid, row);
  }
  return row;
}
function observe(nm, a, alive = a.alive) {
  const row = ownRow(nm, a), last = row.h.at(-1), life = a.netLife ?? 0;
  if (last[1] === life && last[2] === +!!alive) return;
  // A host clock correction cannot move an owner transition behind an already
  // published watermark. Equal-frame transitions keep their owner event order.
  const t = Math.max(frame(nm), row.w, last[0]);
  row.h.push([t, life, +!!alive]);
}
export function recordWipeoutLife(nm, name, event) {
  if (!valid(nm) || nm.match.state !== 'playing' || !['splatted', 'respawn'].includes(name)) return;
  const a = event.actor || event.victim;
  if (!a || a.remote || a.owner !== nm.myId || nm.byNid.get(a.nid) !== a) return;
  observe(nm, a, name === 'respawn');
}
export function packWipeoutTimeline(nm) {
  if (!valid(nm) || nm.match.state !== 'playing' || !(nm.match.time > 0)) return null;
  const rows = [];
  for (const a of nm.match.actors) if (!a.remote && a.owner === nm.myId) {
    const row = ownRow(nm, a); observe(nm, a);
    row.w = Math.max(row.w, frame(nm)); row.q++;
    if (row.h.length <= MAX_EVENTS) rows.push({ n: row.n, q: row.q, w: row.w, h: row.h.map(x => [...x]) });
  }
  const packet = { m: nm.cfg.id, rows };
  acceptWipeoutTimeline(nm, nm.myId, packet);
  return packet;
}
function validHistory(h, watermark) {
  if (!Array.isArray(h) || !h.length || h.length > MAX_EVENTS || h[0]?.[0] !== 0) return false;
  return h.every((e, i) => Array.isArray(e) && e.length === 3 && integer(e[0]) && e[0] <= watermark &&
    integer(e[1]) && (e[2] === 0 || e[2] === 1) && (!i || e[0] >= h[i-1][0] && e[1] >= h[i-1][1] &&
      (e[2] !== h[i-1][2] || e[1] > h[i-1][1]) && (e[2] !== 1 || e[1] > h[i-1][1])));
}
export function acceptWipeoutTimeline(nm, from, packet) {
  if (!valid(nm) || packet?.m !== nm.cfg.id || from !== nm.myId && !nm.s._members?.has(from) ||
      !Array.isArray(packet.rows) || packet.rows.length > 8) return false;
  const s = state(nm);
  for (const row of packet.rows) {
    const actor = nm.byNid.get(row?.n), prev = s.rows.get(row?.n);
    if (!actor || actor.owner !== from || !integer(row.q) || !row.q || !integer(row.w) || row.w > MAX_FRAME ||
        !validHistory(row.h, row.w) || prev && (row.q <= prev.q || row.w < prev.w || row.h.length < prev.h.length ||
          prev.h.some((e, i) => e.some((v, j) => row.h[i][j] !== v)) || row.h.slice(prev.h.length).some(e => e[0] < prev.w))) continue;
    s.rows.set(row.n, { ...row, h: row.h.map(e => [...e]) });
  }
  if (nm.isHost) confirmAvailable(nm);
  return true;
}
function confirmAvailable(nm) {
  if (nm.match.state !== 'playing' || !(nm.match.time > 0)) return;
  const s = state(nm);
  for (const team of [0, 1]) {
    const actors = nm.match.actors.filter(a => a.team === team).sort((a,b) => a.nid-b.nid);
    const rows = actors.map(a => s.rows.get(a.nid));
    if (rows.some(r => !r)) continue;
    const cutoff = Math.min(...rows.map(r => r.w));
    const times = [...new Set(rows.flatMap(r => r.h.map(e => e[0])))].filter(t => t < cutoff).sort((a,b) => a-b);
    let wiped = false;
    for (const t of times) {
      const lives = rows.map(r => r.h.findLast(e => e[0] <= t));
      const dead = lives.every(e => !e[2]);
      if (dead && !wiped && t > 0) {
        const key = `${team}:${actors.map((a,i) => `${a.nid}/${lives[i][1]}/${lives[i][0]}`).join(',')}`;
        if (!s.confirmed.has(key)) {
          const decision = { k:'wc', m:nm.cfg.id, team, key };
          s.confirmed.set(key, decision); apply(nm, decision); nm._sendNow(decision);
        }
      }
      wiped = dead;
    }
  }
}
function apply(nm, d) {
  const s = state(nm);
  if (s.applied.has(d.key)) return;
  s.applied.add(d.key);
  nm._matchStateAPI.emit('flow:wipeout-confirmed', { netmatch:nm, match:nm.match, team:d.team, key:d.key });
}
export function acceptWipeoutConfirmation(nm, from, d) {
  if (!valid(nm) || from !== nm.s.hostId || d?.m !== nm.cfg.id || (d.team !== 0 && d.team !== 1) ||
      typeof d.key !== 'string' || d.key.length > 200 || !d.key.startsWith(`${d.team}:`) ||
      !/^[01]:(?:\d+\/\d+\/\d+,){3}\d+\/\d+\/\d+$/.test(d.key)) return false;
  const s = state(nm); s.confirmed.set(d.key, {k:'wc',m:d.m,team:d.team,key:d.key}); apply(nm,d); return true;
}
export function replayWipeoutConfirmations(nm) {
  // Repeated host confirmations recover a missed packet; applied keys survive
  // host migration on this match object and cannot award twice.
  if (nm.isHost && valid(nm)) for (const d of state(nm).confirmed.values()) nm._sendNow(d);
}

// #478: each connected human chooses keep/change/leave. The existing room
// remains the next-battle queue; only the host can start its next match.
const choices = new Set(['keep', 'change']);
function current(nm) {
  return nm && nm._matchStateAPI?.G.netm === nm && nm._matchStateAPI?.G.match === nm.match && nm.match?.mode === 'turf' &&
    nm.match.state === 'results' && typeof nm.cfg?.id === 'string' && !!nm.cfg.id;
}
function participants(nm) {
  return [...new Set(nm.match.actors.filter(a => !a.isBot && !a.s3?.disconnected &&
    (a.owner === nm.myId || nm.s._members?.has(a.owner))).map(a => a.owner))];
}
function choiceState(nm) { return nm._resultChoices ||= { rows:new Map(), sequence:0, ended:false }; }
export function chooseOnlineContinuation(nm, choice) {
  if (!current(nm) || !choices.has(choice) || !participants(nm).includes(nm.myId)) return false;
  const s = choiceState(nm);
  if (s.ended) return false;
  const d = {k:'rc', m:nm.cfg.id, q:++s.sequence, choice};
  // Broadcast before the host can emit end; reliable sender order preserves the
  // intent on a successor host, including a peer still changing its equipment.
  s.local = d; nm._sendNow(d); acceptOnlineContinuation(nm,nm.myId,d);
  return true;
}
export function acceptOnlineContinuation(nm, from, d) {
  if (!nm || nm._matchStateAPI?.G.netm !== nm || d?.m !== nm.cfg?.id || nm.match?.mode !== 'turf' ||
      !participants(nm).includes(from) || !choices.has(d.choice) ||
      !Number.isSafeInteger(d.q) || d.q < 1) return false;
  const s = choiceState(nm), prev = s.rows.get(from);
  if (s.ended || prev && d.q <= prev.q) return false;
  s.rows.set(from, {q:d.q, choice:d.choice}); finishIfReady(nm); return true;
}
function finishIfReady(nm) {
  if (!current(nm) || !nm.isHost) return;
  const s = choiceState(nm), ids = participants(nm);
  if (s.ended || !ids.length || !ids.every(id => s.rows.get(id)?.choice === 'keep')) return;
  s.ended = true;
  // endMatch consumes this once after disposing the old NetMatch. Gear changes
  // already passed through the existing setMe/loadout persistence paths.
  nm.s._resultReady = {matchId:nm.cfg.id, ids};
  nm.sendEnd(); nm._matchStateAPI?.G.game?.netMatchEnd?.();
}
export function tickOnlineContinuation(nm) {
  if (!current(nm)) return;
  const s = choiceState(nm);
  if (s.local && !s.ended) nm._sendNow(s.local);
  finishIfReady(nm);
}
export function continuationReadyPlayers(session) {
  const ready = session._resultReady; session._resultReady = null;
  return ready?.matchId === session.match?.cfg?.id ? new Set(ready.ids) : new Set();
}
