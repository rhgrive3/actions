import { privateTrackingOpacity } from './private-tracking.mjs';
import { enemyRevealedOnMap, MAP_REVEAL_DAMAGE } from './map-reveal.mjs';
export { MAP_REVEAL_DAMAGE };
// Separate public information rules: the map damage threshold is NOT the
// temporary, line-of-sight-gated world health indicator (Nintendo Ver.11).
export const ENEMY_HEALTH_SECONDS = 3;
export function revealedTo(actor, viewer, now = 0) {
  const team = viewer?.team;
  if (!actor?.alive || !Number.isInteger(team) || team < 0 || team > 1 ||
      actor.team === team || !Number.isFinite(now)) return false;
  const until = actor.s3?.revealedUntil?.[team];
  return Number.isFinite(until) && until > now;
}
export function mapActorVisible(actor, viewer, hpMax = 100, now = 0) {
  if (!actor?.alive || !viewer || !Number.isInteger(viewer.team)) return false;
  if (actor === viewer || actor.team === viewer.team) return true;
  return enemyRevealedOnMap(actor, hpMax, viewer, now);
}
// Presentation-only hit clock for the enemy health window (#716). It advances
// only when the authoritative HP is observed to fall, so enemy-ink recovery
// clamps and regen timers (actor.lastDamage) cannot keep a bar alive. Death
// clears the record, and the respawn HP is the new baseline. Unverified: whether
// S3 counts enemy-ink HP ticks as qualifying damage (ink ticks refresh here).
const hpObserved = new WeakMap();
export function healthHitAge(actor, now = 0) {
  if (!actor?.alive) { hpObserved.delete(actor); return Infinity; }
  const seen = hpObserved.get(actor);
  if (!seen) { hpObserved.set(actor, { hp: actor.hp, at: -Infinity }); return Infinity; }
  if (actor.hp < seen.hp - 1e-6) seen.at = now;
  seen.hp = actor.hp;
  return now - seen.at;
}
function healthActorDecision(actor, viewer, hpMax, now, visible) {
  const age = healthHitAge(actor, now);
  if (!actor?.alive || actor === viewer || !(actor.hp > 0 && actor.hp < hpMax)) return false;
  if (actor.team === viewer.team) return true;
  if (!(age >= 0 && age < ENEMY_HEALTH_SECONDS)) return false;
  const hidden = actor.submerged || actor.climbing || actor.anim?.form === 'swim' || actor.anim?.form === 'climb';
  if (revealedTo(actor, viewer, now) || privateTrackingOpacity(actor, viewer, now) > 0) return true;
  if (hidden) return false;
  return visible == null ? null : !!visible;
}
export function healthActorVisible(actor, viewer, { hpMax = 100, now = 0, visible = false } = {}) {
  return healthActorDecision(actor, viewer, hpMax, now, visible) === true;
}
export function buildHealthMarkers(game, G, PLAYER, THREE) {
  const out = game._hudHealth || (game._hudHealth = []), viewer = game.match.local;
  const head = game._healthHead || (game._healthHead = new THREE.Vector3());
  const body = game._healthBody || (game._healthBody = new THREE.Vector3());
  let n = 0;
  for (const actor of game.match.actors) {
    let visible = healthActorDecision(actor, viewer, PLAYER.hp, G.time, null);
    if (visible === false) continue;
    if (visible === null) {
      body.copy(actor.pos); body.y += actor.form === 'squid' ? .3 : .9;
      visible = healthActorDecision(actor, viewer, PLAYER.hp, G.time, !!G.physics?.los?.(G.camera.position, body));
    }
    if (!visible) continue;
    if (actor.character.getHeadPosition && actor.form !== 'squid') { actor.character.getHeadPosition(head); head.y += .25; }
    else { if (actor.visualPos) actor.visualPos(head); else head.copy(actor.pos); head.y += actor.form === 'squid' ? .8 : 1.7; }
    head.project(G.camera);
    if (head.z < -1 || head.z > 1 || Math.abs(head.x) >= 1 || Math.abs(head.y) >= 1) continue;
    const row = out[n] || (out[n] = {});
    row.x = (head.x * .5 + .5) * innerWidth; row.y = (-head.y * .5 + .5) * innerHeight;
    row.hp = Math.max(0, Math.min(1, actor.hp / PLAYER.hp)); row.color = G.teamHex[actor.team]; n++;
  }
  out.length = n; return out;
}
export function updateHealthBars(hud, rows = []) {
  const bars = hud._healthBars || (hud._healthBars = []);
  for (let i = 0; i < Math.max(rows.length, bars.length); i++) {
    const row = rows[i]; let bar = bars[i];
    if (!row) { if (bar) bar.hidden = true; continue; }
    if (!bar) {
      bar = document.createElement('span'); bar.className = 'iw-health';
      bar.setAttribute('aria-hidden', 'true');
      bar.appendChild(document.createElement('i')); hud.markerLayer.appendChild(bar); bars[i] = bar;
    }
    bar.hidden = false; bar.style.transform = `translate3d(${row.x.toFixed(1)}px,${row.y.toFixed(1)}px,0)`;
    bar.style.setProperty('--health-color', row.color || '#fff');
    bar.firstChild.style.transform = `scaleX(${Math.max(0, Math.min(1, row.hp))})`;
  }
}
