// Confirmation lifetime only: keep the existing layout, labels, actions and fade.
function once(source, before, after, label) {
  const at = source.indexOf(before);
  if (at < 0 || source.indexOf(before, at + before.length) >= 0) throw Error('confirmation lifetime: expected one ' + label);
  return source.slice(0, at) + after + source.slice(at + before.length);
}
export function adaptPauseModalLifetime(rel, code) {
  if (rel !== 'src/ui/menus.js') return code;
  if (code.includes('const confirmationOwner = this._scr')) throw Error('confirmation lifetime: repeated transform');
  code = once(code,
    "  _openModal({ title, text, buttons, danger = false }) {\n    const btnEls = buttons.map((b, i) => this._btn({ id: 'modal-' + i, label: b.label, cls: 'iw-btn--modal ' + (b.cls || ''), accept: b.accept, sound: b.sound || 'ui_click' }));",
    "  _openModal({ title, text, buttons, danger = false }) {\n    const confirmationOwner = this._scr, confirmationGeneration = this._swapToken;\n    if (!confirmationOwner?.el || this._modal) return;\n    const btnEls = buttons.map((b, i) => this._btn({ id: 'modal-' + i, label: b.label, cls: 'iw-btn--modal ' + (b.cls || ''), accept: (...args) => {\n      if (this._modal !== m || this._scr !== confirmationOwner || this._swapToken !== confirmationGeneration || this.current !== confirmationOwner.name || m.inert || m.classList.contains('is-leaving')) return;\n      b.accept?.(...args);\n    }, sound: b.sound || 'ui_click' }));",
    'native confirmation buttons');
  code = once(code,
    "    this._modal = null;\n    m.classList.add('is-leaving');\n    setTimeout(() => m.remove(), 240);",
    "    this._modal = null;\n    if (m.classList.contains('iw-modal')) {\n      m.inert = true;\n      for (const el of m.querySelectorAll('[data-nav]')) this._binds.delete(el);\n    }\n    m.classList.add('is-leaving');\n    setTimeout(() => m.remove(), 240);",
    'native modal retirement');
  return code;
}
