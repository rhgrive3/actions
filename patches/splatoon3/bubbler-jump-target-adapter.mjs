// #1153: deployed Big Bubbler as an independent Super Jump receiver.
//
// The gameplay runtime already replicates the structure (kit-big-bubbler.mjs)
// and exposes bigBubblerDomes()/bigBubblerRemoteDomes(). What was missing was a
// TARGET: the map and diorama Super Jump lists only carried allies + home, so a
// live friendly dome was unreachable. This adapter adds the receiver model from
// runtime/bubbler-jump-target.mjs to both presentation surfaces, WITHOUT moving
// any existing ally/home slot, and adds one lifecycle guard to the native
// Super Jump charge so a collapsed/expired/stale receiver voids the jump.
//
// Production source stays untouched: every connection is an exact, unique
// replace in the composed build tree.
const HELPER = "import { bubblerJumpTargets, bubblerTargetLive, bubblerTargetGround } from '../../patches/splatoon3/runtime/bubbler-jump-target.mjs';\n";

export function adaptBubblerJumpTarget(rel, code, once) {
  const patch = (before, after, label) => { code = once(code, before, after, 'bubbler jump receiver: ' + label); };

  if (rel === 'src/ui/hud.js') {
    // 1. Append friendly deployed domes AFTER the fixed ally(0-2)/home(3) slots.
    patch(
      "    if (pad && mm) { mm.toCanvas(pad.x, pad.z, tc); out[3] = { x: tc.x / mm.w, y: tc.y / mm.h, name: tr('Base'), ok: true, home: true, pad }; }\n    return out;",
      "    if (pad && mm) { mm.toCanvas(pad.x, pad.z, tc); out[3] = { x: tc.x / mm.w, y: tc.y / mm.h, name: tr('Base'), ok: true, home: true, pad }; }\n" +
      "    // #1153: a friendly deployed Big Bubbler is its own Super Jump receiver.\n" +
      "    // Appended after the four fixed slots, so every ally and the home position\n" +
      "    // keep their existing index, label and controller key.\n" +
      "    if (mm) for (const t of bubblerJumpTargets(me)) {\n" +
      "      mm.toCanvas(t.pos.x, t.pos.z, tc);\n" +
      "      out.push({ x: tc.x / mm.w, y: tc.y / mm.h, name: t.name, ok: bubblerTargetLive(t, me),\n" +
      "        home: false, dome: true, bubblerTarget: true, domeId: t.domeId, serial: t.serial,\n" +
      "        team: t.team, target: t, actor: null });\n" +
      "    }\n    return out;",
      'beacon target list');

    // 2. The virtual cursor magnet reaches the appended receivers too.
    patch(
      "      let best = -1, bd = 0.09;\n      for (let i = 0; i < 4; i++) {\n        const b = tg[i]; if (!b) continue;",
      "      let best = -1, bd = 0.09;\n      for (let i = 0; i < tg.length; i++) {\n        const b = tg[i]; if (!b) continue;",
      'cursor magnet reach');

    // 3. Render the appended receivers, reusing _jumpTo for controller/touch.
    patch(
      '    // dashed jump arc from you to the hovered beacon',
      "    // #1153: deployed friendly Big Bubbler receivers render as independent icons.\n" +
      '    this._updBubblerBeacons(bw, bh, tg, canJump);\n' +
      '    // dashed jump arc from you to the hovered beacon',
      'bubbler beacon render call');
    patch(
      '  _updLegendRow(i, b, canJump) {',
      "  // #1153: the deployed Big Bubbler receivers occupy the appended slots (index\n" +
      "  // 4+). They are created lazily, positioned without the ally spread (a dome\n" +
      "  // does not crowd the spawn), and select through the same _jumpTo() entry\n" +
      "  // point as an ally, so controller/touch confirm is unchanged.\n" +
      "  _updBubblerBeacons(bw, bh, tg, canJump) {\n" +
      "    const M = this._map;\n" +
      "    for (let i = 4; i < tg.length; i++) {\n" +
      "      const b = tg[i];\n" +
      "      const el = this._bcnExtra?.[i] || ((this._bcnExtra || (this._bcnExtra = []))[i] = this._mkBubblerBeacon(i));\n" +
      "      if (!b) { if (el._bkey !== 'x') { el._bkey = 'x'; el.style.display = 'none'; } continue; }\n" +
      "      const x = clamp(+b.x || 0) * bw, y = clamp(+b.y || 0) * bh;\n" +
      "      const key = `${x.toFixed(0)}|${y.toFixed(0)}|${b.ok ? 1 : 0}|${M.hover === i ? 1 : 0}|${canJump ? 1 : 0}|${b.domeId}`;\n" +
      "      if (el._bkey === key) continue;\n" +
      "      el._bkey = key;\n" +
      "      el.style.display = '';\n" +
      "      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;\n" +
      "      el.classList.toggle('is-off', !b.ok || !canJump);\n" +
      "      el.classList.toggle('is-hover', M.hover === i && b.ok && canJump);\n" +
      "      const label = el.querySelector('.iw-bcn__label b');\n" +
      "      if (label) label.textContent = b.ok ? b.name : `${b.name} · ×`;\n" +
      "    }\n" +
      "  }\n" +
      "  _mkBubblerBeacon(i) {\n" +
      "    const el = h('div', { class: 'iw-bcn iw-bcn--dome' },\n" +
      "      h('span', { class: 'iw-bcn__stem' }, h('i')),\n" +
      "      h('span', { class: 'iw-bcn__pulse' }),\n" +
      "      h('span', { class: 'iw-bcn__disc' }, h('span', { class: 'iw-bcn__icon', html: '' })),\n" +
      "      h('span', { class: 'iw-bcn__key' }, String(i + 1)),\n" +
      "      h('span', { class: 'iw-bcn__label' }, h('small', null, 'SUPER JUMP'), h('b', null, '')));\n" +
      "    el.addEventListener('pointerenter', () => { if (this._map.open) this._map.hover = i; });\n" +
      "    el.addEventListener('pointerleave', () => { if (this._map.hover === i) this._map.hover = -1; });\n" +
      "    el.addEventListener('click', (e) => { e.stopPropagation(); this._jumpTo(i); });\n" +
      "    (this.map.querySelector('.iw-map__bcns') || this.map).appendChild(el);\n" +
      "    return el;\n" +
      "  }\n" +
      '  _updLegendRow(i, b, canJump) {',
      'bubbler beacon element builder');

    // 4. The receiver selects through the native Super Jump, passing the target
    //    descriptor (not a fake actor and not the owner's position).
    // Routes through the same native map-jump controller as an ally (the
    // reliability layer owns requestMapJump); a receiver target is passed
    // through unchanged, never as a fake actor or the owner's position.
    patch(
      '    const target = tg.home ? tg.pad.clone() : tg.actor;',
      '    const target = tg.home ? tg.pad.clone() : tg.bubblerTarget ? tg.target : tg.actor;',
      'receiver selection');

    return HELPER + code;
  }

  if (rel === 'src/ui/diorama.js') {
    patch(
      '    // ---- map cursor (pointer stays locked in play: steer with mouse deltas / right stick; snaps to pins)',
      "    // #1153: deployed friendly Big Bubbler receivers get their own selectable pins.\n" +
      '    this._updBubblerPins(me, cam, W, H, canJump);\n' +
      '    // ---- map cursor (pointer stays locked in play: steer with mouse deltas / right stick; snaps to pins)',
      'diorama receiver pins call');

    patch(
      '    let best = -1, bd = 72;\n    for (let i = 0; i < 4; i++) {\n      const p = this.pins[i];\n      if (!p.vis) continue;',
      '    let best = -1, bd = 72;\n    for (let i = 0; i < this.pins.length; i++) {\n      if (i === 4) continue;\n      const p = this.pins[i];\n      if (!p.vis) continue;',
      'diorama cursor snap reach');

    patch(
      '  _jump(i, me) {',
      "  // #1153: grow one independent pin per live friendly deployed dome. Dome pins\n" +
      "  // are appended after every fixed pin, so ally (0-2), base (3) and self (4)\n" +
      "  // keep their indices, keys and behaviour.\n" +
      "  _updBubblerPins(me, cam, W, H, canJump) {\n" +
      "    const tg = bubblerJumpTargets(me);\n" +
      "    const pins = this._domePins || (this._domePins = []);\n" +
      "    while (pins.length < tg.length) {\n" +
      "      const pin = this._bubblerPin(this.pins.length);\n" +
      "      pins.push(pin); this.pins.push(pin);\n" +
      "    }\n" +
      "    for (let i = 0; i < pins.length; i++) {\n" +
      "      const p = pins[i], t = tg[i];\n" +
      "      if (!t) { p.bubblerTarget = null; if (p.vis) { p.vis = false; p.el.style.display = 'none'; } continue; }\n" +
      "      const live = bubblerTargetLive(t, me);\n" +
      "      p.bubblerTarget = t;\n" +
      "      p.ok = canJump && live;\n" +
      "      _v.set(t.pos.x, t.pos.y + 0.1, t.pos.z).project(cam);\n" +
      "      if (_v.z > 1) { if (p.vis) { p.vis = false; p.el.style.display = 'none'; } continue; }\n" +
      "      const x = (_v.x * 0.5 + 0.5) * W, y = (0.5 - _v.y * 0.5) * H;\n" +
      "      p.x = x; p.y = y;\n" +
      "      if (!p.vis) { p.vis = true; p.el.style.display = ''; }\n" +
      "      p.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;\n" +
      "      const key = `${t.domeId}|${p.ok ? 1 : 0}|${live ? 0 : 1}|${this.hover === p.index ? 1 : 0}`;\n" +
      "      if (key !== p.key) {\n" +
      "        p.key = key;\n" +
      "        p.name.textContent = t.name;\n" +
      "        p.state.textContent = live ? '' : '×';\n" +
      "        p.el.classList.toggle('is-ok', p.ok);\n" +
      "        p.el.classList.toggle('is-dead', !live);\n" +
      "        p.el.classList.toggle('is-hover', this.hover === p.index);\n" +
      "      }\n" +
      "    }\n" +
      "  }\n" +
      "  _bubblerPin(index) {\n" +
      "    const icon = h('span', { class: 'iw-pin__icon', html: '' });\n" +
      "    const name = h('span', { class: 'iw-pin__name' }, 'BARRIER');\n" +
      "    const state = h('span', { class: 'iw-pin__state' });\n" +
      "    const el = h('div', { class: 'iw-pin iw-pin--dome' },\n" +
      "      h('span', { class: 'iw-pin__ground' }), h('span', { class: 'iw-pin__stem' }),\n" +
      "      h('span', { class: 'iw-pin__badge' }, icon, h('span', { class: 'iw-pin__pulse' })),\n" +
      "      h('span', { class: 'iw-pin__key', html: keycap(String(index + 1)) }),\n" +
      "      name, state);\n" +
      "    el.addEventListener('pointerdown', (e) => {\n" +
      "      if (e.pointerType === 'mouse' || !this.on || this.k < 0.7) return;\n" +
      "      e.preventDefault(); e.stopPropagation();\n" +
      "      this.hover = index;\n" +
      "      this._jump(index, G.match?.local);\n" +
      "    });\n" +
      "    (this.el.querySelector('.iw-dio__pins') || this.el).appendChild(el);\n" +
      "    return { el, icon, name, state, x: 0, y: 0, vis: false, key: '', weapon: null, target: null, ok: false, index, bubblerTarget: null };\n" +
      "  }\n" +
      '  _jump(i, me) {',
      'diorama receiver pins');

    // The reliability layer already routes the diorama through requestMapJump;
    // a receiver target joins that same call, placed before the actor branch.
    patch(
      '    else if (p.target && p.target.alive && !p.target.superJumpState) ok = request(p.target);',
      '    else if (p.bubblerTarget && bubblerTargetLive(p.bubblerTarget, me)) ok = request(p.bubblerTarget);\n' +
      '    else if (p.target && p.target.alive && !p.target.superJumpState) ok = request(p.target);',
      'diorama receiver selection');

    patch(
      "      for (let i = 0; i < 4; i++) if (inp.wasPressed?.('Digit' + (i + 1))) this._flash(i);",
      "      for (let i = 0; i < this.pins.length; i++) if (inp.wasPressed?.('Digit' + (i + 1))) this._flash(i);",
      'diorama receiver number keys');

    return HELPER + code;
  }

  if (rel === 'src/game/actor.js') {
    // The composed Actor.superJump() commits the landing destination at
    // ADMISSION (superJumpTarget). Carry the receiver identity on the state so
    // the charge-completion frame can re-verify it.
    patch(
      '    const destination = new THREE.Vector3();\n    if (!superJumpTarget(target, destination)) return false;\n    target = destination.clone();',
      "    const destination = new THREE.Vector3();\n" +
      "    // #1153: remember a deployed-Bubbler receiver so its live status can be\n" +
      "    // re-checked on the charge-completion frame, not only at admission.\n" +
      "    const receiver = target && target.bubblerTarget === true ? target : null;\n" +
      '    if (!superJumpTarget(target, destination)) return false;\n    target = destination.clone();',
      'Super Jump receiver capture');
    patch(
      "this.superJumpState = { wallSupport: this.climbing ? this.wallN.clone() : null, phase: 'charge', startForm: this.form,",
      "this.superJumpState = { wallSupport: this.climbing ? this.wallN.clone() : null, phase: 'charge', startForm: this.form, receiver,",
      'Super Jump receiver state');
    patch(
      '        // Destination was committed at admission; target motion/death cannot retarget it.\n        s.from.copy(this.pos);',
      '        // Destination was committed at admission; target motion/death cannot retarget it.\n        s.from.copy(this.pos);\n' +
      "        // #1153: a deployed-Bubbler receiver must still be a live friendly dome\n" +
      "        // on the charge-completion frame. A collapse, expiry, disposal or team\n" +
      "        // change since admission voids the jump; reading the live list spends no\n" +
      "        // HP, duration or use, so a repeated selection stays free.\n" +
      '        if (s.receiver && !bubblerTargetLive(s.receiver, this)) { this.superJumpState = null; return; }',
      'Super Jump receiver charge re-verify');

    return "import { bubblerTargetLive } from '../../patches/splatoon3/runtime/bubbler-jump-target.mjs';\n" + code;
  }

  return code;
}
