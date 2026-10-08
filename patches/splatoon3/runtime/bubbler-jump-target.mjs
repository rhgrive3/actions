// Deployed Big Bubbler as a Super Jump receiver (#1153).
//
// Splatoon 3's Great Barrier carries a built-in Beakon: a teammate can Super
// Jump onto a barrier that is already standing, even after its owner has walked
// away. INKWAVE already replicates the structure itself (kit-big-bubbler.mjs),
// but the map / diorama Super Jump target list only ever carried allies + home,
// so a live friendly dome was never a selectable receiver and a teammate had to
// chase the owner's current position instead of the dome they actually wanted.
//
// This module owns ONLY the TARGET MODEL:
//   * a stable identity (dome id + activation serial + team), and
//   * the live ground location at the emitter.
//
// It never simulates the dome, never spends or restores HP / duration / uses and
// never rewrites the replication protocol: it reads the same authoritative and
// replicated lists the dome module already maintains, and answers liveness by
// re-reading those lists. A repeated selection therefore can never consume a
// dome budget, because nothing here mutates.
//
// The two lists are deliberately kept separate:
//   bigBubblerDomes()        authoritative local domes (this client's own)
//   bigBubblerRemoteDomes()  presentation-only replicated domes (a teammate's)
// A friendly dome in EITHER list is a legal receiver; an enemy dome never is.
import { bigBubblerDomes, bigBubblerRemoteDomes } from './kit-big-bubbler.mjs';

// One stable, bounded name for a dome receiver. The owner's own name is used
// when present so the map reads "Tako · Barrier"; the fallback never invents an
// actor identity, because the receiver is the STRUCTURE, not its owner.
export function bubblerTargetName(dome) {
  const owner = dome?.owner;
  const nm = owner?.name || owner?.character?.name;
  const text = typeof nm === 'string' && nm.trim() ? nm.trim() : '';
  return text ? `${text} · Barrier` : 'Barrier';
}

// The stable, serializable identity of a deployed dome receiver. Nothing here is
// derived from the owner's CURRENT position, so displacing the owner cannot move
// or invalidate the target.
export function bubblerTargetDescriptor(dome) {
  if (!dome) return null;
  return {
    bubblerTarget: true,      // marker checked by the Super Jump lifecycle
    dome,                     // live authoritative/replicated structure
    domeId: dome.id,          // stable per activation
    serial: dome.serial,      // stable per activation
    team: dome.team,
    home: false,
    name: bubblerTargetName(dome),
    // The receiver's legal ground location: the dome's own base, never a
    // re-projected owner position.
    pos: dome.pos,
    owner: dome.owner ?? null,
  };
}

// Exact activation identity. A dome id can be reused by a LATER activation, so a
// receiver is matched on (id, serial, team) rather than the id alone.
export function bubblerActivationKey(dome) {
  return `${dome?.id}|${dome?.serial}|${dome?.team}`;
}

function isLiveDome(dome) {
  return !!dome && dome.dead !== true && !!dome.pos
    && Number.isFinite(dome.pos.x) && Number.isFinite(dome.pos.y) && Number.isFinite(dome.pos.z);
}

// Every friendly, live deployed dome as an independent Super Jump receiver.
// Enemy domes, dead/collapsed domes, domes with a non-finite location and a
// duplicated activation are omitted.
//
// local is the AUTHORITATIVE list and is walked first, so when the same
// activation is also replicated back into remoteDomes() the local structure is
// the one receiver that survives the dedupe (never two icons for one dome).
export function bubblerJumpTargets(me, pools = null) {
  if (!me || !Number.isInteger(me.team)) return [];
  const [local, remote] = pools
    ? [pools.local || [], pools.remote || []]
    : [bigBubblerDomes(), bigBubblerRemoteDomes()];
  const out = [];
  const seen = new Set();
  for (const pool of [local, remote]) {
    for (const dome of pool) {
      if (!isLiveDome(dome)) continue;
      if (dome.team !== me.team) continue;
      const key = bubblerActivationKey(dome);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(bubblerTargetDescriptor(dome));
    }
  }
  return out;
}

// Liveness re-checked against the SAME lists the dome lifecycle mutates. A
// collapse / expiry removes the dome there first, so this is what invalidates a
// stale receiver on selection, admission and every charge frame.
//
// Four independent things must hold: the structure is live with finite
// coordinates, the descriptor still names THIS exact activation, the team still
// matches the ACTUAL jumper (when supplied, so an enemy receiver is refused at
// admission and not only filtered in presentation), and the structure is still
// present in one of the live pools (a disposed activation is gone from both).
export function bubblerTargetLive(target, actor = null) {
  if (!target || target.bubblerTarget !== true) return false;
  const dome = target.dome;
  if (!isLiveDome(dome)) return false;
  if (target.domeId !== dome.id || target.serial !== dome.serial || target.team !== dome.team) return false;
  if (actor && Number.isInteger(actor.team) && dome.team !== actor.team) return false;
  return bigBubblerDomes().includes(dome) || bigBubblerRemoteDomes().includes(dome);
}

// The legal native ground point of a receiver. This is the dome's own base (the
// same point the structure was deployed onto), never the owner's live position.
export function bubblerTargetGround(target) {
  const dome = target?.dome;
  return dome && dome.pos ? dome.pos : null;
}

// Install-time registration. The gameplay runtime keeps ownership of nothing
// extra here: this only exposes the pure model on G so presentation layers (and
// future hosts) read one shared target list instead of re-deriving identity.
const INSTALL_KEY = Symbol.for('inkwave.splatoon3.issue1153.bubbler-jump-target.v1');
export function installBubblerJumpTargets({ G }) {
  if (!G || G[INSTALL_KEY]) return;
  G.bubblerJumpTargets = (me) => bubblerJumpTargets(me);
  Object.defineProperty(G, INSTALL_KEY, { configurable: true, value: true });
}
