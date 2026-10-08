import { replaceOnce } from './input-adapter.mjs';

export function adaptEightFollowup(rel, code) {
  if (rel === 'src/game/cameraRig.js') {
    return replaceOnce(
      code,
      '    const charging = a.weaponRunner?.charging ? a.weaponRunner.charge : 0;',
      "    const charging = a.weapon?.kind === 'charger' && a.weaponRunner?.charging ? a.weaponRunner.charge : 0;",
      '#1106 Heavy Splatling must not enter Charger camera zoom',
    );
  }

  if (rel === 'src/net/session.js') {
    code = replaceOnce(
      code,
      '    const p = this.lobby.players.find((x) => x.id === id);\n    if (!p) return;',
      '    const p = this.lobby.players.find((x) => x.id === id);\n    if (!p) return;\n    const beforeWeapon = p.weapon;\n    const beforeTeams = new Map(this.lobby.players.map((x) => [x.id, x.team]));',
      '#1103 capture player launch confirmation state',
    );

    code = replaceOnce(
      code,
      '    this._fixTeams();\n    this._broadcastLobby();\n  }\n\n  setSettings(s = {}) {',
      '    this._fixTeams();\n    if (p.weapon !== beforeWeapon) p.ready = false;\n    if (this.lobby.players.some((x) => x.team !== beforeTeams.get(x.id)))\n      for (const x of this.lobby.players) if (x.id !== this.hostId) x.ready = false;\n    this._broadcastLobby();\n  }\n\n  setSettings(s = {}) {',
      '#1103 invalidate ready after weapon/team mutation',
    );

    code = replaceOnce(
      code,
      '    const l = this.lobby, wasMap = l.map;',
      '    const l = this.lobby, wasMap = l.map;\n    const beforeSettings = [l.map, l.time, l.duration, l.bots, l.difficulty, l.palette, l.mode, this._botsPref];',
      '#1103 capture room configuration revision',
    );

    code = replaceOnce(
      code,
      '    l.bots = mapNoBots(l.map) ? false : (this._botsPref ?? l.bots);\n    this._broadcastLobby();',
      '    l.bots = mapNoBots(l.map) ? false : (this._botsPref ?? l.bots);\n    const afterSettings = [l.map, l.time, l.duration, l.bots, l.difficulty, l.palette, l.mode, this._botsPref];\n    if (afterSettings.some((v, i) => v !== beforeSettings[i]))\n      for (const p of l.players) if (p.id !== this.hostId) p.ready = false;\n    this._broadcastLobby();',
      '#1103 invalidate ready after launch-critical room change',
    );
  }

  return code;
}
