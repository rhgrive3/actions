import { replaceOnce } from './input-adapter.mjs';

export function adaptMenuRaf(rel, code) {
  if (rel !== 'src/ui/menus.js') return code;
  code = replaceOnce(code,
    '  update(dt) {\n    this._extTick = performance.now();\n    this._tick(clamp(+dt || 0, 0, 0.1));\n  }',
    '  update(dt) {\n' +
      '    this._extTick = performance.now();\n' +
      '    if (!this._engineDriven) {\n' +
      '      this._engineDriven = true;\n' +
      '      cancelAnimationFrame(this._raf);\n' +
      '      this._raf = 0;\n' +
      '    }\n' +
      '    this._tick(clamp(+dt || 0, 0, 0.1));\n' +
      '  }',
    'menu RAF yields ownership to engine update');
  return replaceOnce(code,
    '  _loop(t) {\n    this._raf = requestAnimationFrame(this._loop);',
    '  _loop(t) {\n' +
      '    if (this._engineDriven) { this._raf = 0; return; }\n' +
      '    this._raf = requestAnimationFrame(this._loop);',
    'menu RAF stale callback after engine takeover');
}
