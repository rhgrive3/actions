// Build-only adapter for INKWAVE candidate #418: Runtime quality world resource budgets.
// Connects runtime world quality sync to Game._setSettings, _buildWorld, and match starters
// so selecting LOW/HIGH converges paint, shadow, FX and props immediately.
// Upstream inkwave-public/ remains byte-for-byte intact.

export function replaceExact(source, before, after, label, expectedCount = 1) {
  let count = 0, pos = 0;
  while ((pos = source.indexOf(before, pos)) !== -1) {
    count++;
    pos += before.length;
  }
  if (count !== expectedCount) {
    throw new Error(`INKWAVE quality patch conflict (${label}): expected ${expectedCount} occurrence(s), found ${count}`);
  }
  return source.replaceAll(before, after);
}

export function replaceOnce(source, before, after, label) {
  return replaceExact(source, before, after, label, 1);
}

export function adaptQualityIssue418(rel, code) {
  if (rel === 'src/main.js') {
    code = "import { applyRuntimeWorldQuality } from '../patches/local-quality/world-quality.mjs';\n" + code;
    code = replaceOnce(code,
      "    if ('quality' in partial || 'shadows' in partial || 'bloom' in partial) this.R?.applySettings(this.settings);",
      "    if ('quality' in partial || 'shadows' in partial || 'bloom' in partial) this.R?.applySettings(this.settings);\n    if ('quality' in partial) applyRuntimeWorldQuality(this, this.settings, this.mobile, { G, effectiveQuality, dressingFor, THREE });",
      'runtime world quality refresh');
    code = replaceOnce(code,
      '    const layoutId = map.layout || map.id;\n    if (this.layoutId === layoutId) { this.mapDef = map; return; }',
      '    const layoutId = map.layout || map.id;\n    if (this.layoutId === layoutId) {\n      if (this._builtQuality !== this.settings?.quality) applyRuntimeWorldQuality(this, this.settings, this.mobile, { G, effectiveQuality, dressingFor, THREE });\n      this.mapDef = map; return;\n    }\n    this._builtQuality = this.settings?.quality;',
      'world rebuild layout and quality gate');
    const startup = code.includes('await this._buildWorld(map, flow);')
      ? '    if ((map.layout || map.id) !== this.layoutId) await this._buildWorld(map, flow);'
      : '    if ((map.layout || map.id) !== this.layoutId) await this._buildWorld(map);';
    code = replaceExact(code, startup,
      startup.replace('!== this.layoutId)', '!== this.layoutId || this._builtQuality !== this.settings?.quality)'),
      'startMatch and startNetMatch quality reconciliation', 2);
  }
  return code;
}