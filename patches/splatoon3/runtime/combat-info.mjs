// Separate public information rules: the map damage threshold is NOT the
// temporary, line-of-sight-gated world health indicator (Nintendo Ver.11).
export const MAP_REVEAL_DAMAGE = 18;
export const ENEMY_HEALTH_SECONDS = 3;
export function revealedTo(actor, viewer, now = 0) {
  return Number.isFinite(actor?.s3?.revealedUntil?.[viewer?.team]) && actor.s3.revealedUntil[viewer.team] > now;
}
export function mapActorVisible(actor, viewer, hpMax = 100, now = 0) {
  if (!actor?.alive) return false;
  if (actor === viewer || actor.team === viewer.team) return true;
  return hpMax - actor.hp + 1e-9 >= MAP_REVEAL_DAMAGE || revealedTo(actor, viewer, now);
}
export function healthActorVisible(actor, viewer, { hpMax = 100, now = 0, visible = false } = {}) {
  if (!actor?.alive || actor === viewer || !(actor.hp > 0 && actor.hp < hpMax)) return false;
  if (actor.team === viewer.team) return true;
  if (!(actor.lastDamage >= 0 && actor.lastDamage < ENEMY_HEALTH_SECONDS)) return false;
  const hidden = actor.submerged || actor.climbing || actor.anim?.form === 'swim' || actor.anim?.form === 'climb';
  return revealedTo(actor, viewer, now) || (!hidden && visible);
}
export function buildHealthMarkers(game, G, PLAYER, THREE) {
  const out = game._hudHealth || (game._hudHealth = []), viewer = game.match.local;
  const head = game._healthHead || (game._healthHead = new THREE.Vector3());
  const body = game._healthBody || (game._healthBody = new THREE.Vector3());
  let n = 0;
  for (const actor of game.match.actors) {
    body.copy(actor.pos); body.y += actor.form === 'squid' ? .3 : .9;
    const visible = !!G.physics?.los?.(G.camera.position, body);
    if (!healthActorVisible(actor, viewer, { hpMax: PLAYER.hp, now: G.time, visible })) continue;
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
