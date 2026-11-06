// Team signals (Splatoon 3 Ver. 11.3.0 behaviour, Inkipedia "Signal"):
//   D-pad up   = "This way!" (カモン); while splatted it becomes "Ouch..." (やられた)
//   D-pad down = "Booyah!"/"Nice!" (ナイス), usable at any time
// Teammates see the signal at the sender. Ouch marks where the sender was
// splatted, which is the only place an ally's death position is disclosed
// (#631 removed the automatic ally-down marker for that reason).
//
// INKWAVE input: keyboard H / N, standard pad D-pad up / down (only while the
// map is closed; the open map owns the D-pad), touch buttons in the touch
// layer. Nice keeps its existing owner (catalogue.mjs sets intent.booyah and
// cheers a Booyah Bomb); this module only adds the shared signal.
//
// Not public Splatoon 3 data, chosen here: marker lifetime 2.5 s, a 0.25 s
// per-sender display throttle, Bot reaction (Ouch 0.5 s after a Bot is
// splatted; allied Bots without a target walk toward a player's This way!
// within 45 m). Bots are an INKWAVE feature. Signals are local to this
// client (no network replication yet).
export const SIGNAL_LIFE = 2.5, SIGNAL_THROTTLE = 0.25, BOT_OUCH_DELAY = 0.5, BOT_COME_RANGE = 45;
const LABEL = { thisWay: 'カモン！', ouch: 'やられた…', nice: 'ナイス！' };

export function signalKindForUp(actor) { return actor?.alive === false ? 'ouch' : 'thisWay'; }

export function installTeamSignals({ G, PlayerController, HUD, on, emit }) {
  const state = G.teamSignals || (G.teamSignals = { list: [], last: new WeakMap(), pendingOuch: [], clock: 0 });
  const send = (actor, kind) => {
    if (!actor || !LABEL[kind]) return false;
    const last = state.last.get(actor);
    if (last && last.kind === kind && state.clock - last.t < SIGNAL_THROTTLE) return false;
    const p = actor.pos;
    const rec = { kind, actor, team: actor.team, x: p.x, y: p.y + (kind === 'ouch' ? 0.6 : 1.9), z: p.z, t: state.clock };
    state.last.set(actor, rec);
    state.list.push(rec); if (state.list.length > 16) state.list.shift();
    emit?.('team:signal', rec);
    if (kind === 'thisWay' && !actor.bot) callBots(G, actor);
    return true;
  };
  state.send = send;

  const update = PlayerController.prototype.update;
  PlayerController.prototype.update = function (dt, ...rest) {
    const result = update.call(this, dt, ...rest), a = this.a, input = this.input;
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    state.clock += step;
    for (let i = state.pendingOuch.length - 1; i >= 0; i--) {
      const p = state.pendingOuch[i];
      if (state.clock + 1e-9 < p.at) continue;
      state.pendingOuch.splice(i, 1);
      if (p.actor.alive === false) send(p.actor, 'ouch');
    }
    // Match.updateController disables the controller while its actor is
    // splatted, so admission reads the match state: Ouch is a splatted signal.
    const usable = !!(a && !this.mapHeld && G.match?.state === 'playing' && !G.match?.paused);
    // Poll only when a signal can be sent: a disabled controller (menus, intro,
    // results) keeps its exact input-poll order; a splatted actor may signal.
    if (!usable || (!this.enabled && a.alive !== false)) { this._signalUpHeld = this._signalDownHeld = false; if (a) a._signalUpPending = false; return result; }
    const pad = input?.lastDevice === 'pad';
    const upHeld = !!(input?.down?.('KeyH') || pad && input?.padButton?.(12));
    const upEdge = upHeld && !this._signalUpHeld; this._signalUpHeld = upHeld;
    const touchUp = !!a._signalUpPending; a._signalUpPending = false;
    if (upEdge || touchUp) send(a, signalKindForUp(a));
    // The Nice edge is owned by catalogue.mjs (intent.booyah); a splatted
    // player may still send Nice, which that owner does not admit.
    const downHeld = !!(input?.down?.('KeyN') || pad && input?.padButton?.(13));
    const downEdge = downHeld && !this._signalDownHeld; this._signalDownHeld = downHeld;
    if (a.intent?.booyah || (a.alive === false && downEdge)) send(a, 'nice');
    return result;
  };

  on?.('splatted', (e) => {
    const v = e?.victim;
    if (v?.bot && !v.remote) state.pendingOuch.push({ actor: v, at: state.clock + BOT_OUCH_DELAY });
  });

  const hudUpdate = HUD.prototype.update;
  HUD.prototype.update = function (...args) {
    const result = hudUpdate.apply(this, args);
    drawSignals(this, G, state);
    touchButtons(this, G);
    return result;
  };
  return send;
}

function callBots(G, caller) {
  for (const o of G.actors || []) {
    const b = o?.bot;
    if (!b || o === caller || o.team !== caller.team || o.alive === false || o.remote || b.target) continue;
    const dx = o.pos.x - caller.pos.x, dz = o.pos.z - caller.pos.z;
    if (dx * dx + dz * dz > BOT_COME_RANGE * BOT_COME_RANGE || typeof b._pathTo !== 'function') continue;
    try { b._pathTo(caller.pos.clone ? caller.pos.clone() : { ...caller.pos }, 0.8); b._signalComeAt = G.teamSignals.clock; } catch { /* nav unavailable */ }
  }
}

function drawSignals(hud, G, state) {
  const me = G.match?.local, layer = hud.downLayer, cam = G.camera;
  const pool = hud._signalEls || (hud._signalEls = new Map());
  for (const [rec, el] of pool) if (!state.list.includes(rec) || state.clock - rec.t > SIGNAL_LIFE) { el.remove(); pool.delete(rec); }
  if (!me || !layer || typeof hud._project !== 'function' || !globalThis.document) return;
  for (const rec of state.list) {
    if (rec.team !== me.team || rec.actor === me || state.clock - rec.t > SIGNAL_LIFE) continue;
    let el = pool.get(rec);
    if (!el) {
      el = document.createElement('div');
      el.className = 'iw-down iw-signal iw-signal--' + rec.kind;
      el.innerHTML = '<span></span>';
      el.firstChild.textContent = (rec.actor.name ? rec.actor.name + ' ' : '') + LABEL[rec.kind];
      el.firstChild.style.cssText = 'position:absolute;transform:translate(-50%,-100%);white-space:nowrap;padding:3px 8px;border-radius:10px;background:#161224d9;color:#fff;font-weight:800;border:2px solid currentColor';
      layer.appendChild(el); pool.set(rec, el);
    }
    const p = cam ? hud._project(cam, rec.x, rec.y, rec.z) : null;
    const vis = p && p.z < 1 && p.x > -1.1 && p.x < 1.1 && p.y > -1.1 && p.y < 1.1;
    const age = state.clock - rec.t, fade = age < SIGNAL_LIFE - 0.5 ? 1 : (SIGNAL_LIFE - age) / 0.5;
    el.style.opacity = vis ? fade.toFixed(2) : '0';
    if (vis) el.style.transform = `translate3d(${((p.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px,${((-p.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px,0)`;
  }
}

// Touch play: the look zone (#iw-mobile-controls, z-index 9000) covers the
// HUD, so the signal buttons live in that layer. pointerdown stops
// propagation so the look/move router never receives the tap.
function touchButtons(hud, G) {
  const mobile = G.input?.mobile, touch = !!(mobile?.active && mobile.root), me = G.match?.local;
  if (!touch && !hud._signalTouch) return;
  if (!hud._signalTouch && globalThis.document) {
    const box = document.createElement('div');
    box.className = 'iw-signal-touch';
    box.style.cssText = 'position:absolute;right:max(8px,env(safe-area-inset-right,0px));top:34%;display:flex;flex-direction:column;gap:8px;pointer-events:auto;z-index:8';
    const make = (label, aria, fn) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria);
      b.style.cssText = 'min-width:64px;min-height:44px;padding:6px 10px;border-radius:18px;border:2px solid #fff;background:#161224cc;color:#fff;font:inherit;font-weight:800';
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); const a = G.match?.local; if (a) fn(a); });
      box.append(b); return b;
    };
    hud._signalTouchUp = make('カモン', 'カモン（やられ中はやられた）', (a) => { a._signalUpPending = true; });
    // Same owner as N / D-pad down: also cheers a teammate's Booyah Bomb.
    hud._signalTouchNice = make('ナイス', 'ナイス', (a) => { if (a.alive === false) G.teamSignals?.send?.(a, 'nice'); else a._catalogueCheerPending = true; });
    hud._signalTouch = box;
  }
  const box = hud._signalTouch;
  if (!box) return;
  if (touch && box.parentNode !== mobile.root) mobile.root.append(box);
  box.hidden = !touch || !hud._visible || !me || !!G.match?.paused;
  const up = me?.alive === false ? 'やられた' : 'カモン';
  if (hud._signalTouchUp && hud._signalTouchUp.textContent !== up) hud._signalTouchUp.textContent = up;
}
