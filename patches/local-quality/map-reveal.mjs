import { hauntTrackingRecord } from '../splatoon3/runtime/haunt.mjs';
import { thermalTrackingRecord } from '../splatoon3/runtime/private-tracking.mjs';

// #710: an animation form is not a map reveal. Every enemy icon must be
// justified by a currently owned, team-scoped detection state.
export function mapOpponentVisible(opponent, viewer, now) {
  if (!opponent?.alive || !viewer?.alive || opponent.team === viewer.team) return false;
  if (hauntTrackingRecord(opponent, viewer) || thermalTrackingRecord(opponent, viewer, now)) return true;
  // Explicit team-wide mark producers may publish their deadline here. Do not
  // infer one from normal damage animation or from being in humanoid form.
  const until = opponent.s3?.mapMarkedUntil?.[viewer.team];
  return Number.isFinite(now) && Number.isFinite(until) && now < until;
}

export function adaptMapReveal(rel, source) {
  if (rel !== 'src/main.js') return source;
  const before = `        if (o.team !== a.team && !o.isLocal) {
          // enemies only show on the map when visible to your team (not submerged far away)
          if (o.anim.form === 'swim') continue;
        }`;
  if (source.split(before).length !== 2) throw Error('map reveal: owner row anchor mismatch');
  return "import { mapOpponentVisible } from '../../patches/local-quality/map-reveal.mjs';\n"
    + source.replace(before,`        if (o.team !== a.team && !mapOpponentVisible(o, a, G.time)) continue;`);
}
