// Keep native match-clock transitions reusable without replaying actor physics.
// This lets the render adapter account for an online hidden interval once when
// visibility returns, while the ordinary update path keeps the same semantics.
export function adaptMatchClock(rel, code, replaceOnce) {
  if (rel !== 'src/game/match.js') return code;
  const start = code.indexOf("      case 'playing': {");
  const end = code.indexOf("      case 'finish':", start);
  if (start < 0 || end < start || code.includes('_s3AdvanceClock(dt)')) {
    throw new Error('INKWAVE match clock adapter conflict');
  }
  const region = code.slice(start, end);
  const bodyStart = region.indexOf('\n') + 1;
  const breakAt = region.lastIndexOf('        break;');
  if (bodyStart <= 0 || breakAt < bodyStart || region.indexOf('        break;', breakAt + 1) >= 0 ||
      !/^\s*break;\s*\n\s*\}\s*$/.test(region.slice(breakAt))) {
    throw new Error('INKWAVE match clock adapter lost the native playing-case boundary');
  }
  const nativeClockBody = region.slice(bodyStart, breakAt);
  for (const anchor of ['this.time -= dt;', 'emit(\'match:oneminute\'', 'emit(\'match:count\'', "this.setState('finish')"]) {
    if (!nativeClockBody.includes(anchor)) throw new Error(`INKWAVE match clock adapter missing ${anchor}`);
  }
  const replacement = region.slice(0, bodyStart) + '        this._s3AdvanceClock(dt);\n' + region.slice(breakAt);
  code = code.slice(0, start) + replacement + code.slice(end);
  const method = `  _s3AdvanceClock(dt) {\n    if (this.paused || this.state !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;\n${nativeClockBody}  }\n\n`;
  return replaceOnce(code, '  update(dt) {', method + '  update(dt) {', 'isolated native Match clock');
}
