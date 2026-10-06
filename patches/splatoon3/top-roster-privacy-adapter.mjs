// Issue #886: keep exact respawn timing in the match model, but present only
// qualitative splatted state in the always-visible squad roster.
export const ROSTER_PRIVACY_MARKER = '/* INKWAVE issue #886 top-roster privacy wrapper */';

const WRAPPER = `
${ROSTER_PRIVACY_MARKER}
{
  const nativeSquadUpdate = HUD.prototype._updSquads;
  if (typeof nativeSquadUpdate !== 'function') throw new Error('INKWAVE #886: native HUD squad update is missing');
  HUD.prototype._updSquads = function (teams) {
    const statusOnly = Array.isArray(teams) ? teams.map(team => {
      if (!team || !Array.isArray(team.players)) return team;
      let changed = false;
      const players = team.players.map(player => {
        if (!player || player.alive !== false) return player;
        changed = true;
        return player.respawn === 0 ? player : { ...player, respawn: 0 };
      });
      return changed ? { ...team, players } : team;
    }) : teams;

    const result = nativeSquadUpdate.call(this, statusOnly);
    for (let t = 0; t < 2; t++) {
      const players = statusOnly?.[t]?.players || [];
      const slots = this.squads?.[t]?.children || [];
      for (let i = 0; i < 4; i++) {
        const slot = slots[i];
        if (!slot) continue;
        const number = slot.querySelector?.('.iw-sq__n');
        if (number) number.textContent = '';
        const progress = slot.querySelector?.('.iw-sq__ring circle');
        if (progress?.style) progress.style.display = players[i]?.alive === false ? 'none' : '';
      }
    }
    return result;
  };
}
`;

export function adaptTopRosterPrivacy(rel, code) {
  if (rel !== 'src/ui/hud.js') return code;
  if (!code.includes('export class HUD') || !code.includes('  _updSquads(teams) {')) {
    throw new Error('INKWAVE #886 patch conflict: native HUD squad roster connection is missing');
  }
  if (code.includes(ROSTER_PRIVACY_MARKER)) {
    throw new Error('INKWAVE #886 patch conflict: top-roster privacy wrapper already applied');
  }
  return code + WRAPPER;
}
