// The responsive audit deliberately uses the offline MockNet, not a relay.
// Its legacy simulation has no host team-confirmation action. Model that one
// host-authored lobby update explicitly; never bypass the production Ready gate.
export function confirmResponsiveMockHostTeams(net = globalThis.G?.net) {
  if (net?.isMock !== true || net.state !== 'lobby' || net.isHost || !net.lobby
      || net.lobby.mode === 'boss' || !net.lobby.players.length
      || net.lobby.players.some(p => p.team !== 0 && p.team !== 1)) {
    throw new Error('Expected a guest MockNet Turf lobby with assigned teams');
  }
  net.lobby.teamsConfirmed = true;
  for (const player of net.lobby.players) player.ready = false;
  net._emit('lobby', { lobby: net.lobby });
}
