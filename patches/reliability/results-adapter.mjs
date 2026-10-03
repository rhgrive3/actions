// INKWAVE reliability overlay: result-presentation lifetime only.
// Apply to the build copy, leaving inkwave-public/ unchanged. Exact unique
// connections fail closed when upstream changes or this overlay is applied twice.

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`INKWAVE reliability results conflict (${label}): expected exactly one connection. Review upstream changes; site was not built.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

// NetSession survives room changes; its transport identifies the connection even
// when the user rejoins the same room code. NetMatch identifies the online round.
// A resolved/cancelled judge animation alone does not invalidate the same match.
const OWNERS = [
  '    const netm = G.netm, net = G.net, room = net?.tr;',
  '    const resultsCurrent = () => this.match === m && G.netm === netm && G.net === net && net?.tr === room;',
].join('\n');

const END_BEFORE = 'this._netEndT = setTimeout(() => { G.netm?.sendEnd(); this.netMatchEnd(); }, 12000);';
const END_AFTER = [
  'this._netEndT = setTimeout(() => {',
  "      if (!resultsCurrent() || m.state !== 'results' || !net.isHost) return;",
  '      netm.sendEnd(); this.netMatchEnd();',
  '    }, 12000);',
].join('\n');

export function adaptResults(rel, code) {
  if (rel !== 'src/main.js') return code;
  code = replaceOnce(code,
    '  async netMatchEnd() {\n    if (this._netEnding) return;\n    this._netEnding = true;',
    '  async netMatchEnd() {\n    if (this._netEnding) return;\n    const m = this.match;\n' + OWNERS + '\n    this._netEnding = true;',
    'room return owners');
  code = replaceOnce(code,
    "      await this._fade(1, 350);\n      this.hud?.setVisible(false);\n      this.hud?.hideSplatted?.();\n      this.showcase.hide();\n      G.mode = 'menu';\n      G.net?.endMatch();",
    "      await this._fade(1, 350);\n      if (!resultsCurrent()) return;\n      this.hud?.setVisible(false);\n      this.hud?.hideSplatted?.();\n      this.showcase.hide();\n      G.mode = 'menu';\n      net?.endMatch();",
    'room return continuation');
  code = replaceOnce(code,
    '  async _bossResults() {\n    const m = this.match, R = m.result, bo = R.boss || {};',
    '  async _bossResults() {\n    const m = this.match, R = m.result, bo = R.boss || {};\n' + OWNERS,
    'boss result owners');
  code = replaceOnce(code,
    '    await new Promise((r) => setTimeout(r, 400));\n    if (this.match !== m) return;',
    '    await new Promise((r) => setTimeout(r, 400));\n    if (!resultsCurrent()) return;',
    'boss continuation');
  code = replaceOnce(code,
    '  async _judge() {\n    const m = this.match;\n    if (m.result?.mode',
    '  async _judge() {\n    const m = this.match;\n' + OWNERS + '\n    if (m.result?.mode',
    'turf result owners');
  code = replaceOnce(code,
    '    await (judgeP || new Promise((r) => setTimeout(r, 4000)));\n    const myTeam',
    '    await (judgeP || new Promise((r) => setTimeout(r, 4000)));\n    if (!resultsCurrent()) return;\n    const myTeam',
    'turf continuation');
  code = replaceOnce(code,
    "    setTimeout(() => this._playMusic(won ? 'results_win' : 'results_lose'), 2600);",
    [
      '    setTimeout(() => {',
      "      if (resultsCurrent() && m.state === 'results' && this.menus?.current === 'results') this._playMusic(won ? 'results_win' : 'results_lose');",
      '    }, 2600);',
    ].join('\n'),
    'result music');
  code = replaceOnce(code,
    '    if (G.netm && G.net.isHost) ' + END_BEFORE,
    '    if (netm && net.isHost) ' + END_AFTER,
    'boss room-end timer');
  code = replaceOnce(code,
    '    if (G.netm) {\n      if (G.net.isHost) ' + END_BEFORE + '\n    }',
    '    if (netm) {\n      if (net.isHost) ' + END_AFTER.replaceAll('\n', '\n  ') + '\n    }',
    'turf room-end timer');
  return code;
}
