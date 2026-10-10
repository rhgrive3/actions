// #950: delayed title/mode navigation belongs to one accepted screen generation
// and one Menus lifetime. This is a build-only transform; no runtime import.
export function adaptMenuNavigationTimer(rel, code, once) {
  if (rel !== 'src/ui/menus.js') return code;
  const cancel =
    '    if (this._qualityNavigationTimer != null) clearTimeout(this._qualityNavigationTimer);\n' +
    '    this._qualityNavigationTimer = null; this._leavingTitle = false;';
  code = once(code, '  show(name = null, opts = {}) {',
    '  show(name = null, opts = {}) {\n    if (this._qualityDisposed) return;', '#950 retired menu navigation');
  code = once(code, '    if (name === prev && !force) return;',
    '    if (name === prev && !force) return;\n' + cancel, '#950 accepted navigation retires delayed transition');
  code = once(code, '    this._qualityDisposed = true;',
    '    this._qualityDisposed = true;\n' + cancel + '\n    ++this._swapToken;', '#950 disposed menu retires delayed transition');
  code = once(code, "    if (this.current !== 'title' || this._leavingTitle) return;",
    "    if (this._qualityDisposed || this.current !== 'title' || this._leavingTitle) return;", '#950 retired title confirmation');
  code = once(code,
    "    setTimeout(() => { this._leavingTitle = false; this.show('main', { wipe: true }); }, 200);",
    "    const generation = this._swapToken, screen = this._scr;\n" +
    "    const timer = this._qualityNavigationTimer = setTimeout(() => {\n" +
    "      if (this._qualityDisposed || this._qualityNavigationTimer !== timer ||\n" +
    "          this._swapToken !== generation || this._scr !== screen || this.current !== 'title') return;\n" +
    "      this._qualityNavigationTimer = null; this._leavingTitle = false;\n" +
    "      this.show('main', { wipe: true });\n" +
    "    }, 200);", '#950 title timer screen and lifetime ownership');
  code = once(code, '  _scr_mode() {',
    '  _scr_mode() {\n    const navigationGeneration = this._swapToken;', '#950 mode screen generation');
  code = once(code, '    const pick = (id, c) => {\n      if (picking) return;',
    "    const pick = (id, c) => {\n" +
    "      if (this._qualityDisposed || this._swapToken !== navigationGeneration ||\n" +
    "          this.current !== 'mode' || this._scr?.el !== el || picking) return;", '#950 stale mode selection');
  code = once(code,
    "      setTimeout(() => { picking = false; if (this.current === 'mode') this._go('setup'); }, reduced ? 0 : 260);",
    "      const timer = this._qualityNavigationTimer = setTimeout(() => {\n" +
    "        if (this._qualityDisposed || this._qualityNavigationTimer !== timer ||\n" +
    "            this._swapToken !== navigationGeneration || this.current !== 'mode' || this._scr?.el !== el) return;\n" +
    "        this._qualityNavigationTimer = null; picking = false;\n" +
    "        this._go('setup');\n" +
    "      }, reduced ? 0 : 260);", '#950 mode timer screen and lifetime ownership');
  return code;
}
