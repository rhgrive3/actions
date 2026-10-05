// Practice Range HUD: a compact telemetry strip where the turf-war roster/timer would be, a target card that appears
// while you are hitting targets, floating damage numbers over the targets, the pad prompt and short toasts.
// Lives inside the game HUD element (so it hides / shows with it) and is removed with the session.
// Everything it shows is read from actor state or the game's own events — it computes nothing about weapons.
import * as THREE from 'three';
import { G } from '../../../src/core/ctx.js';
import { WEAPONS, PLAYER } from '../../../src/config.js';
import { h } from '../../../src/ui/ui-util.js';
import { weaponIcon } from '../../../src/ui/ui-icons.js';
import { ZONES } from '../stage/zones.mjs';
import { L, isJa } from './strings.mjs';

const _p = new THREE.Vector3();
const PAD_TEXT = { resetPaint: 'RESETTING PAINT', resetDummies: 'RESETTING TARGETS', inkCourse: 'INKING THE SWIM COURSE', resupply: 'RESUPPLY' };
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const zoneLabel = (id) => (id && ZONES[id] ? `${ZONES[id].letter ? ZONES[id].letter + ' · ' : ''}${isJa ? ZONES[id].ja : ZONES[id].name}` : '—');

export class RangeHud {
  constructor(session) {
    this.s = session;
    const host = G.hud?.el || document.getElementById('ui-root');
    this.wIcon = h('span', { class: 'iwr-tel__wicon' });
    this.wName = h('b', { class: 'iwr-tel__wname' });
    this.speed = h('b', { class: 'iwr-num' }, '0.0');
    this.zone = h('span', { class: 'iwr-tel__zone' });
    this.measure = h('b', { class: 'iwr-num' });
    this.measureLbl = h('small');
    this.measureBox = h('span', { class: 'iwr-tel__cell iwr-tel__measure' }, this.measureLbl, h('span', null, this.measure, h('i', null, 'm')));
    this.paintBox = h('span', { class: 'iwr-tel__cell iwr-tel__paint' });
    this.tel = h('div', { class: 'iwr-tel' },
      h('span', { class: 'iwr-tel__cell iwr-tel__weapon' }, this.wIcon, this.wName),
      h('span', { class: 'iwr-tel__cell' }, h('small', null, L('SPEED')), h('span', null, this.speed, h('i', null, 'm/s'))),
      h('span', { class: 'iwr-tel__cell iwr-tel__zonecell' }, h('small', null, L('ZONE')), this.zone),
      this.measureBox, this.paintBox);
    // target card
    this.cName = h('b', { class: 'iwr-card__name' });
    this.cLast = h('b', { class: 'iwr-num iwr-card__big' });
    this.cFrom = h('span', { class: 'iwr-card__from' });
    this.cCombo = h('b', { class: 'iwr-num' });
    this.cHits = h('b', { class: 'iwr-num' });
    this.cSplat = h('span', { class: 'iwr-card__splat' });
    this.cHp = h('i');
    this.card = h('div', { class: 'iwr-card' },
      h('div', { class: 'iwr-card__head' }, h('span', { class: 'iwr-card__tag' }, L('TARGET')), this.cName),
      h('div', { class: 'iwr-card__row' }, h('div', null, h('small', null, L('LAST HIT')), this.cLast), this.cFrom),
      h('div', { class: 'iwr-card__row iwr-card__row--3' },
        h('div', null, h('small', null, L('COMBO')), this.cCombo),
        h('div', null, h('small', null, L('HITS')), this.cHits),
        this.cSplat),
      h('div', { class: 'iwr-card__hp' }, this.cHp));
    this.nums = h('div', { class: 'iwr-nums' });
    this.prompt = h('div', { class: 'iwr-prompt' }, h('b'), h('span', { class: 'iwr-prompt__bar' }, h('i')));
    this.toastEl = h('div', { class: 'iwr-toast' });
    this.keys = h('div', { class: 'iwr-keys' },
      ...[['R', 'Reset paint'], ['T', 'Reset targets'], ['G', 'Back to start']].map(([k, t]) => h('span', null, h('kbd', null, k), L(t))));
    this.root = h('div', { class: 'iwr-hud' }, this.nums, this.tel, this.card, this.prompt, this.toastEl, this.keys);
    host.appendChild(this.root);
    this._L = {};
    this._cardT = 99; this._toastT = 99;
    this._float = [];
    this.root.classList.toggle('is-touch', document.documentElement.classList.contains('iw-touch-ui'));
  }

  welcome() { this.toast(L('WELCOME TO THE RANGE'), 2.6, true); }
  toast(text, life = 1.8, big = false) {
    this.toastEl.textContent = text;
    this.toastEl.classList.toggle('is-big', !!big);
    this.toastEl.classList.remove('is-on'); void this.toastEl.offsetWidth; this.toastEl.classList.add('is-on');
    this._toastT = 0; this._toastLife = life;
  }
  padPrompt(pad, k) {
    const key = pad ? pad.id : '';
    if (key !== this._L.pad) {
      this._L.pad = key;
      this.prompt.classList.toggle('is-on', !!pad);
      if (pad) this.prompt.firstChild.textContent = pad.kind === 'weapon'
        ? `${L('SWITCHING WEAPON')} · ${WEAPONS[pad.weapon].name}` : L(PAD_TEXT[pad.kind] || pad.kind);
    }
    if (pad) this.prompt.querySelector('i').style.transform = `scaleX(${Math.max(0, Math.min(1, k)).toFixed(3)})`;
  }
  damageNumber(target, amount, splat) {
    const el = h('span', { class: 'iwr-dmg' + (splat ? ' is-splat' : '') + (target.rangeTarget.kind === 'endurance' ? ' is-endure' : '') }, splat ? 'SPLAT!' : fmt(amount, 1));
    this.nums.appendChild(el);
    this._float.push({ el, target, t: 0, life: splat ? 1.1 : 0.9, dx: (Math.random() - 0.5) * 30 });
    if (this._float.length > 24) { const o = this._float.shift(); o.el.remove(); }
    this._cardT = 0;
  }

  update(dt) {
    const tel = this.s.telemetry();
    if (!tel) return;
    const L0 = this._L;
    if (tel.weapon !== L0.weapon) {
      L0.weapon = tel.weapon;
      const W = WEAPONS[tel.weapon];
      this.wIcon.innerHTML = weaponIcon((W && W.kind) || tel.weapon);
      this.wName.textContent = W ? W.name : tel.weapon;
    }
    const sp = fmt(tel.speed, 1);
    if (sp !== L0.sp) { L0.sp = sp; this.speed.textContent = sp; }
    if (tel.zone !== L0.zone) {
      L0.zone = tel.zone;
      this.zone.textContent = zoneLabel(tel.zone);
      this.tel.style.setProperty('--zc', tel.zone ? ZONES[tel.zone].accent : '#35405a');
    }
    const m = tel.measure;
    this.measureBox.classList.toggle('is-off', !m);
    if (m) {
      const lbl = m.kind === 'wall' ? L('FROM WALL') : L('DOWNRANGE');
      if (lbl !== L0.mlbl) { L0.mlbl = lbl; this.measureLbl.textContent = lbl; }
      const v = fmt(m.value, 1);
      if (v !== L0.mv) { L0.mv = v; this.measure.textContent = v; }
    }
    const inPaint = tel.zone === 'paint';
    this.paintBox.classList.toggle('is-off', !inPaint);
    if (inPaint) {
      const ps = this.s.paintStats();
      if (ps) {
        const txt = `${fmt(ps.own, 1)} m² · ${fmt((ps.own / ps.total) * 100, 1)} %`;
        if (txt !== L0.paint) { L0.paint = txt; this.paintBox.innerHTML = ''; this.paintBox.append(h('small', null, L('PAINTED')), h('span', null, txt)); this.paintBox.title = L('of the 400 m² test floor'); }
      }
    }
    // target card: the target you hit last, until 4 s after the last hit
    this._cardT += dt;
    const last = this.s.last;
    const show = !!last && this._cardT < 4;
    this.card.classList.toggle('is-on', show);
    if (show) {
      const a = last.target, t = a.rangeTarget, c = t.combo;
      if (L0.cname !== a.name) { L0.cname = a.name; this.cName.textContent = a.name; this.card.classList.toggle('is-endure', t.kind === 'endurance'); }
      this.cLast.textContent = fmt(last.amount, 1);
      this.cFrom.textContent = last.dist != null ? `${L('FROM')} ${fmt(last.dist, 1)} m` : '';
      this.cCombo.textContent = c ? fmt(c.total, 1) : '—';
      this.cHits.textContent = c ? String(c.hits) : '—';
      this.cSplat.textContent = t.kind === 'endurance' ? `${L('ENDURANCE')} · ${L('never pops')}`
        : c && c.done ? `${L('SPLAT IN')} ${c.hits} · ${fmt(c.splatT, 2)} s` : '';
      const hp = t.kind === 'endurance' ? 1 : Math.max(0, Math.min(1, a.hp / PLAYER.hp));
      this.cHp.style.transform = `scaleX(${hp.toFixed(3)})`;
    }
    // floating numbers over the targets
    const cam = G.camera, W = innerWidth, H = innerHeight;
    for (let i = this._float.length - 1; i >= 0; i--) {
      const f = this._float[i];
      f.t += dt;
      if (f.t > f.life) { f.el.remove(); this._float.splice(i, 1); continue; }
      _p.copy(f.target.pos); _p.y += PLAYER.height + 0.35 + f.t * 0.6;
      _p.project(cam);
      if (_p.z > 1) { f.el.style.opacity = '0'; continue; }
      const x = (_p.x * 0.5 + 0.5) * W + f.dx * f.t, y = (-_p.y * 0.5 + 0.5) * H;
      const k = f.t / f.life;
      f.el.style.opacity = String(Math.min(1, (1 - k) * 2.4));
      f.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(1 + 0.35 * Math.max(0, 0.15 - f.t) / 0.15).toFixed(3)})`;
    }
    this._toastT += dt;
    if (this._toastT > (this._toastLife || 1.8) && this.toastEl.classList.contains('is-on')) this.toastEl.classList.remove('is-on');
  }

  dispose() { this.root.remove(); this._float.length = 0; }
}
