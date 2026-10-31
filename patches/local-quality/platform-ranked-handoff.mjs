// A suspended Ranked host cannot integrate objective physics or overtime.
// Publish the last completed state, then use the ordinary relay leave/election
// and disconnect policy. Never advance just its clock while physics is stopped.
const RANKED_MODES = new Set(['zones', 'tower', 'rainmaker', 'clams']);

export function releaseHiddenRankedHost(game, G, env, runtime, defer = false) {
  const match = game.match, session = G.net, net = G.netm;
  if (!env.document?.hidden || game.platform !== runtime || runtime.disposed ||
      G.mode !== 'match' || !match?.ranked || !RANKED_MODES.has(match.mode) || match.attract ||
      !session?.isHost || session.state !== 'match' || !net?.isHost ||
      session.match !== net || net.match !== match) return false;
  const old = runtime.hiddenRankedHandoff;
  if (old?.match === match && old.session === session && old.net === net && old.hostId === session.hostId && old.epoch === net.cfg?.id && old.transport === session.tr) return true;
  const ticket = runtime.hiddenRankedHandoff = { match, session, net, hostId: session.hostId, epoch: net.cfg?.id, transport: session.tr };
  const owns = () => runtime.hiddenRankedHandoff === ticket && game.platform === runtime && !runtime.disposed &&
    env.document?.hidden && G.mode === 'match' && game.match === match && G.net === session && G.netm === net &&
    session.match === net && net.match === match && session.hostId === ticket.hostId && net.cfg?.id === ticket.epoch && session.tr === ticket.transport &&
    session.state === 'match' && session.isHost && net.isHost;
  const leave = () => {
    if (!owns()) { if (runtime.hiddenRankedHandoff === ticket) runtime.hiddenRankedHandoff = null; return; }
    let snapshotAccepted = false, tickAccepted = false, error = null;
    try {
      // The bounded native queue has at most 512 rows. Three successful sends
      // cover even a previously reduced one-row window, then 256 + 255 rows.
      // A refused send is a connection failure, not permission to retry forever
      // in the background or to invent a result. Normal leave handles it.
      for (let attempt = 0; attempt < 3 && owns(); attempt++) {
        tickAccepted = net._sendTick?.() === true;
        if (!tickAccepted || !net.out?.length) break;
      }
      if (owns()) snapshotAccepted = net._sendNow?.({ k: 'rkstate', rk: {
        match: ticket.epoch, host: ticket.hostId, state: match.ranked.snapshot(), gains: match.rankedGains || [0, 0],
      } }) === true;
    } catch (cause) { error = String(cause?.message || cause).slice(0, 256); }
    if (!owns()) { if (runtime.hiddenRankedHandoff === ticket) runtime.hiddenRankedHandoff = null; return; }
    runtime.lastHiddenRankedHandoff = { snapshotAccepted, tickAccepted, error };
    // NetSession.leave owns transport retirement and the relay owns election.
    // The normal disconnect policy owns first-minute no-contest and objective
    // drops. A completed result is never recalculated by this lifecycle hook.
    try { session.leave(true); }
    finally {
      if (runtime.hiddenRankedHandoff === ticket) runtime.hiddenRankedHandoff = null;
      if (game.platform === runtime && !runtime.disposed && G.net === session && game.match === match &&
          session.state === 'offline' && !session.match)
        game.netMatchAborted?.('Disconnected while backgrounded');
    }
  };
  // Host acquisition is inside NetMatch.onLeave. Finish the ownership stack
  // before closing this newly elected peer; no background timer is required.
  if (defer) (env.queueMicrotask || globalThis.queueMicrotask)(leave);
  else leave();
  return true;
}
