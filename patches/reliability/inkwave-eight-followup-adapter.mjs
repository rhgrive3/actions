import { replaceOnce } from './input-adapter.mjs';

export function adaptEightFollowup(rel, code) {
  if (rel === 'src/game/cameraRig.js') {
    const lines = code.split('\n');
    const chargingLines = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*const charging\s*=/.test(lines[i]) && lines[i].includes('weaponRunner') && lines[i].includes('charge'))
        chargingLines.push(i);
    }
    if (chargingLines.length !== 1)
      throw new Error(`Eight-followup camera anchor mismatch (#1106): expected one charging source, got ${chargingLines.length}`);
    const i = chargingLines[0];
    if (!lines[i].includes("kind === 'charger'")) {
      const indent = lines[i].match(/^\s*/)?.[0] || '';
      lines[i] = indent + "const charging = a.weapon?.kind === 'charger' && a.weaponRunner?.charging ? a.weaponRunner.charge : 0;";
    }
    return lines.join('\n');
  }

  if (rel === 'src/net/session.js') {
    code = replaceOnce(
      code,
      '    const p = this.lobby.players.find((x) => x.id === id);\n    if (!p) return;',
      '    const p = this.lobby.players.find((x) => x.id === id);\n    if (!p) return;\n    const beforeWeapon = p.weapon;\n    const beforeTeams = new Map(this.lobby.players.map((x) => [x.id, x.team]));',
      '#1103 capture player launch confirmation state',
    );

    const hostTeams = code.includes('\n  assignTeam(id, team) {');
    const end = hostTeams ? '  assignTeam(id, team) {' : '  setSettings(s = {}) {';
    // Scope to the native _applyMe method: host team assignment adds methods
    // before setSettings, so that distant boundary is no longer adjacent.
    const meStart = code.indexOf('  _applyMe(id, o) {');
    const meEnd = code.indexOf('\n  }', meStart);
    if (meStart < 0 || meEnd < meStart) throw new Error('Missing _applyMe boundary');
    const me = replaceOnce(code.slice(meStart, meEnd),
      '    this._fixTeams();\n    this._broadcastLobby();',
      '    this._fixTeams();\n    if (p.weapon !== beforeWeapon) p.ready = false;\n    if (this.lobby.players.some((x) => x.team !== beforeTeams.get(x.id)))\n      for (const x of this.lobby.players) if (x.id !== this.hostId) x.ready = false;\n    this._broadcastLobby();',
      '#1103 invalidate ready after weapon/team mutation');
    code = code.slice(0, meStart) + me + code.slice(meEnd);

    const settingsStart = code.indexOf('  setSettings(s = {}) {');
    const settingsEnd = code.indexOf('\n  }', settingsStart);
    if (settingsStart < 0 || settingsEnd < settingsStart) throw new Error('Missing setSettings boundary');
    let settings = code.slice(settingsStart, settingsEnd);
    const declaration = settings.includes('wasMap = l.map, oldMode = l.mode;')
      ? '    const l = this.lobby, wasMap = l.map, oldMode = l.mode;'
      : '    const l = this.lobby, wasMap = l.map;';
    settings = replaceOnce(settings, declaration,
      declaration + '\n    const beforeSettings = [l.map, l.time, l.duration, l.bots, l.difficulty, l.palette, l.mode, this._botsPref];',
      '#1103 capture room configuration revision');
    settings = replaceOnce(settings, '    this._broadcastLobby();',
      '    const afterSettings = [l.map, l.time, l.duration, l.bots, l.difficulty, l.palette, l.mode, this._botsPref];\n    if (afterSettings.some((v, i) => v !== beforeSettings[i]))\n      for (const p of l.players) if (p.id !== this.hostId) p.ready = false;\n    this._broadcastLobby();',
      '#1103 invalidate ready after launch-critical room change');
    code = code.slice(0, settingsStart) + settings + code.slice(settingsEnd);
  }

  return code;
}
