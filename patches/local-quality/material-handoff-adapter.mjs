function once(code, before, after) {
  if (code.split(before).length !== 2) throw new Error('Material handoff adapter conflict: '+before);
  return code.replace(before, after);
}
export function adaptMaterialHandoff(rel, code) {
  if (rel === 'src/game/character.js') {
    code = once(code, '  async warmAll(renderer = G.renderer, camera = G.camera, target = G.scene) {', '  async warmAll(renderer = G.renderer, camera = G.camera, target = G.scene) {\n    if (this._sourceMotionDisposed) return false;');
    return once(code, '      if (this._sourceMotionLoader) await this._sourceMotionLoader;', '      if (this._sourceMotionLoader) await this._sourceMotionLoader;\n      if (this._sourceMotionDisposed) return false;');
  }
  if (rel !== 'src/main.js') return code;
  const a = code.indexOf('  _startAttract() {'), b = code.indexOf('  _attractShot() {', a);
  if (a < 0 || b < 0) throw new Error('Material handoff attract boundary missing');
  let body = code.slice(a, b);
  body = once(body, '    if (this.match) this.match.dispose();',
    "    const materialHandoff = beginMaterialHandoff(this, this.match, G.renderer);\n    try {\n    materialHandoff.dispose(() => { if (this.match) this.match.dispose(); });");
  body = once(body, '    m.setup(); m.start();', '    materialHandoff.setup(() => m.setup(), () => m); materialHandoff.setup(() => m.start(), () => m);');
  body = once(body, '    this._warmCharacters?.(m);', '    materialHandoff.warm(() => this._warmCharacters?.(m));');
  body = once(body, '    this.hud?.setVisible(false);\n  }', "    this.hud?.setVisible(false);\n    } catch (error) { materialHandoff.release('attract-failed'); throw error; }\n  }");
  code = code.slice(0,a)+body+code.slice(b);
  code = once(code, 'const game = new Game();', 'installMaterialHandoffCancellation(Game);\nconst game = new Game();');
  return "import { beginMaterialHandoff, installMaterialHandoffCancellation } from '../patches/local-quality/material-handoff.mjs';\n"+code;
}
