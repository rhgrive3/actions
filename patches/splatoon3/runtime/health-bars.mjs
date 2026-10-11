// #716 — Splatoon 3 (11.0+) approximate remaining-HP bars.
// Presentation only: authoritative damage, HP replication and visibility stay
// owned by Actor / NetMatch. Bars never affect hitboxes, combat or scoring.
const INSTALLED = Symbol.for('inkwave.s3.remaining-health-bars.v1');
export const ENEMY_HP_BAR_SECONDS = 3;
const valid = Number.isFinite;
const clamp01 = x => Math.max(0, Math.min(1, x));

export function advanceHealthBar(record, actor, now, maximum = 100) {
  if (!record || !valid(now) || !valid(maximum) || maximum <= 0) return record;
  const hp = actor?.hp, alive = actor?.alive !== false;
  const life = actor?.netLife ?? 0;
  const reset = !alive || !valid(hp) || hp >= maximum || hp <= 0 ||
    record.life !== undefined && record.life !== life || record.alive === false;
  if (reset) record.until = -Infinity;
  if (alive && valid(hp) && hp > 0 && hp < maximum && !reset) {
    if (valid(record.hp) && hp < record.hp - 0.001)
      record.until = now + ENEMY_HP_BAR_SECONDS;
    else if (!valid(record.hp) && valid(actor?.lastDamage) && actor.lastDamage < ENEMY_HP_BAR_SECONDS)
      record.until = now + ENEMY_HP_BAR_SECONDS - Math.max(0, actor.lastDamage);
  }
  record.hp = hp; record.life = life; record.alive = alive;
  return record;
}

export function healthRevealForTeam(actor, viewer, now) {
  if (actor?.s3?.revealed === true) return true;
  const expiry = actor?.s3?.mapMarkedUntil?.[viewer?.team];
  return valid(now) && valid(expiry) && now < expiry;
}

export function shouldShowHealthBar(actor, viewer, record, now, maximum, lineOfSight = true) {
  if (!record || !actor || !viewer || actor === viewer || actor.alive === false ||
      !valid(actor.hp) || !(actor.hp > 0 && actor.hp < maximum)) return false;
  if (actor.team === viewer.team) return true;
  const marked = healthRevealForTeam(actor, viewer, now);
  if (!valid(record.until) || now > record.until + 1e-10) return false;
  if (!marked && (actor.submerged || actor.anim?.form === 'swim' || !lineOfSight)) return false;
  return true;
}

function hideAll(bars) {
  for (const record of bars.values()) if (record.node) record.node.style.display = 'none';
}
function retire(hud) {
  if (hud._s3HealthBars) {
    for (const record of hud._s3HealthBars.values()) record.node?.remove();
    hud._s3HealthBars.clear();
  }
  hud._s3HealthLayer?.remove();
  hud._s3HealthLayer = null; hud._s3HealthMatch = null;
}
function makeRow(layer, doc) {
  const node = doc.createElement('div');
  node.className = 'iw-world-health-bar';
  node.style.cssText = 'position:absolute;width:62px;height:9px;box-sizing:border-box;border:1px solid rgba(255,255,255,.85);border-radius:3px;background:rgba(9,10,15,.85);transform:translate(-50%,-50%);pointer-events:none;display:none;overflow:hidden';
  const fill = doc.createElement('div');
  fill.style.cssText = 'height:100%;width:100%;transition:none;pointer-events:none';
  node.appendChild(fill);layer.appendChild(node);
  return {node,fill,hp:NaN,until:-Infinity,life:undefined,alive:true};
}
export function installHealthBarHud({ HUD, G, THREE, PLAYER }, env = globalThis) {
  if (!HUD?.prototype || !THREE?.Vector3 || !G || !PLAYER || Object.hasOwn(HUD.prototype, INSTALLED)) return;
  const proto = HUD.prototype;
  Object.defineProperty(proto, INSTALLED, {value:true});
  const update = proto.update, dispose = proto.dispose;
  proto.update = function (dt, frame) {
    const result = update.call(this, dt, frame);
    // installUi already renders the canonical Game healthMarkers, including
    // private tracking, concealment and authoritative damage-age/life rules.
    // Empty rows also own visibility: a parallel overlay would disclose actors
    // that the canonical producer deliberately omitted. Keep this fallback only
    // for frames without that producer and retire any previous fallback state.
    if (Array.isArray(frame?.healthMarkers)) { retire(this); return result; }
    const doc = env.document, match = G.match;
    if (!frame || !doc || !this.el?.appendChild || !match?.actors) return result;
    if (this._s3HealthMatch !== match) {
      retire(this);
      this._s3HealthMatch = match; this._s3HealthBars = new Map();
    }
    const bars = this._s3HealthBars;
    if (!this._visible || match.state !== 'playing' || match.attract || match.paused ||
        G.mode !== 'match' || !match.local || !G.camera?.isCamera) {
      hideAll(bars); return result;
    }
    if (!this._s3HealthLayer) {
      const layer = doc.createElement('div');
      layer.className = 'iw-world-health-bars';
      layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:10';
      this.el.appendChild(layer);this._s3HealthLayer = layer;
      this._s3HealthWorld = new THREE.Vector3();
      this._s3HealthProjected = new THREE.Vector3();
    }
    const now = valid(G.time) ? G.time : this._t;
    const seen = new Set(), viewer = match.local, maxHp = PLAYER.hp;
    const camera = G.camera, world = this._s3HealthWorld, projected = this._s3HealthProjected;
    const width = this.el.clientWidth || env.innerWidth || 1;
    const height = this.el.clientHeight || env.innerHeight || 1;
    for (const actor of match.actors) {
      if (!actor || actor === viewer) continue;
      seen.add(actor);
      let record = bars.get(actor);
      if (!record) { record = makeRow(this._s3HealthLayer, doc); bars.set(actor, record); }
      advanceHealthBar(record, actor, now, maxHp);
      const character = actor.character;
      if (!character?.getHeadPosition || !character.root?.visible || actor.alive === false) {
        record.node.style.display = 'none';continue;
      }
      character.getHeadPosition(world);world.y += 0.32;
      // Do not reveal enemy HP through map walls or while submerged unless a
      // real recon/reveal status explicitly authorizes it.
      let sight = true;
      if (actor.team !== viewer.team && !healthRevealForTeam(actor, viewer, now) &&
          typeof G.physics?.los === 'function') {
        try { sight = !!G.physics.los(camera.position, world); }
        catch { sight = false; }
      }
      if (!shouldShowHealthBar(actor,viewer,record,now,maxHp,sight)) {
        record.node.style.display = 'none';continue;
      }
      projected.copy(world).project(camera);
      if (![projected.x,projected.y,projected.z].every(valid) ||
          projected.z < -1 || projected.z > 1 ||
          Math.abs(projected.x) > 1.02 || Math.abs(projected.y) > 1.02) {
        record.node.style.display = 'none';continue;
      }
      record.node.style.display = '';
      record.node.style.left = ((projected.x*.5+.5)*width).toFixed(1)+'px';
      record.node.style.top = ((1-projected.y)*.5*height).toFixed(1)+'px';
      record.fill.style.width = (100*clamp01(actor.hp/maxHp)).toFixed(1)+'%';
      record.fill.style.background = G.teamHex?.[actor.team] || '#ffffff';
    }
    for (const [actor,record] of bars) if (!seen.has(actor)) {record.node.remove();bars.delete(actor);}
    return result;
  };
  proto.dispose = function (...args) {
    retire(this);
    return dispose.apply(this,args);
  };
}
