import { PLATFORM_CONNECTION_RECOVERY_MS } from './platform-transport.mjs';

// A browser/OS can freeze the host's timers as well as RAF without closing
// its socket. A follower cannot invent the host's coverage/result. Bound its
// wait after the authoritative end, then use the ordinary connection-loss path.
export function watchGuestMatchEnd(game, G, env, runtime) {
  const match = game.match, session = G.net, net = G.netm;
  const now = env.performance?.now?.();
  const waiting = G.mode === 'match' && match?.mode === 'turf' && match.follower === true &&
    !match.attract && !match.paused && !match.result &&
    session?.state === 'match' && !session.isHost && !net?.isHost &&
    session.match === net && net?.match === match &&
    (match.s3NoContest ? !net.s3NoContestEnded && net.s3NoContestRemaining <= 0
      : match.state === 'finish' || match.state === 'playing' &&
        (Number.isFinite(match.time) && match.time <= 0 || match.s3HostDeadline?.left <= 0));
  if (!waiting || !Number.isFinite(now)) { runtime.guestEndWait = null; return false; }
  let saved = runtime.guestEndWait;
  if (!saved || saved.match !== match || saved.session !== session || saved.net !== net ||
      saved.hostId !== session.hostId || now < saved.at) {
    saved = runtime.guestEndWait = { match, session, net, hostId: session.hostId, at: now };
  }
  const finishDelay = match.s3NoContest ? 0 : match.finishDelay?.();
  if (!Number.isFinite(finishDelay) || finishDelay < 0 ||
      now - saved.at <= finishDelay * 1000 + PLATFORM_CONNECTION_RECOVERY_MS) return false;
  runtime.guestEndWait = null;
  // close() can synchronously notify _closed; never abort the same session twice
  // or let its listener close a replacement transport/match.
  const transport = session.tr;
  transport?.close?.();
  if (G.net === session && session.state === 'match' && session.match === net)
    session._closed('Host did not finish the battle');
  return true;
}
