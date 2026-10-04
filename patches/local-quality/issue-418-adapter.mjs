// Build-only adapter for INKWAVE candidate #418: Runtime quality world resource budgets.
// Connects runtime world quality sync to Game._setSettings, _buildWorld, and match starters
// so selecting LOW/HIGH converges paint, shadow, FX and props immediately.
// Upstream inkwave-public/ remains byte-for-byte intact.

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0) {
    throw new Error(`INKWAVE quality patch conflict (${label}): expected connection not found`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptQualityIssue418(rel, code) {
  if (rel === 'src/main.js') {
    code = "import { applyRuntimeWorldQuality } from '../patches/local-quality/world-quality.mjs';\n" + code;
    code = replaceOnce(code,
      "    if ('quality' in partial || 'shadows' in partial || 'bloom' in partial) this.R?.applySettings(this.settings);",
      "    if ('quality' in partial || 'shadows' in partial || 'bloom' in partial) this.R?.applySettings(this.settings);\n    if ('quality' in partial) applyRuntimeWorldQuality(this, this.settings, this.mobile);",
      'runtime world quality refresh');
    code = replaceOnce(code,
      '    const layoutId = map.layout || map.id;\n    if (this.layoutId === layoutId) { this.mapDef = map; return; }',
      '    const layoutId = map.layout || map.id;\n    if (this.layoutId === layoutId && this._builtQuality === this.settings?.quality) { this.mapDef = map; return; }\n    this._builtQuality = this.settings?.quality;',
      'world rebuild layout and quality gate');
    code = replaceOnce(code,
      '    if ((map.layout || map.id) !== this.layoutId) await this._buildWorld(map);',
      '    if ((map.layout || map.id) !== this.layoutId || this._builtQuality !== this.settings?.quality) await this._buildWorld(map);',
      'startMatch quality check');
    code = replaceOnce(code,
      '    if ((map.layout || map.id) !== this.layoutId) await this._buildWorld(map);',
      '    if ((map.layout || map.id) !== this.layoutId || this._builtQuality !== this.settings?.quality) await this._buildWorld(map);',
      'startNetMatch quality check');
  }
  return code;
}
