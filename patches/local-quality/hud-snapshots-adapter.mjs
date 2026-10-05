export function adaptHudSnapshots(rel, code, once) {
  if (rel === 'src/game/match.js') {
    code = once(code, "  teamSummary() {\n    return [0, 1].map((t) => ({\n      color: G.teamHex[t],\n      players: this.actors.filter((a) => a.team === t).map((a) => ({\n        name: a.name, weapon: a.weaponId, alive: a.alive, respawn: a.alive ? 0 : Math.max(0, a.respawnTimer), specialReady: a.specialReady(), isSelf: a.isLocal,\n      })),\n    }));\n  }", "  teamSummary(viewerTeam = 0) { return teamHudSnapshot(this, G.teamHex, viewerTeam); }", 'persistent team HUD snapshots');
    return "import { teamHudSnapshot } from '../../patches/local-quality/hud-snapshots.mjs';\n" + code;
  }
  if (rel === 'src/main.js') {
    code = once(code, "    const frame = {\n      time: m.time,\n      teams: a.team === 1 ? m.teamSummary().reverse() : m.teamSummary(),   // HUD: [your team, theirs]\n      ink: a.ink / PLAYER.inkMax, inkLow: a.ink < 18 || (this._lowInkFlash > 0), subCost: SUB.bomb.inkCost / PLAYER.inkMax,\n      special: a.specialFrac(), specialReady: a.specialReady(), specialActive: !!a.specialActive,\n      hp: a.hp / PLAYER.hp,\n      weapon: a.weaponId, charge: a.weaponRunner.charge,\n      crosshair: { spread, onTarget: m.controller?.onTarget ? 'enemy' : null, inRange: m.controller ? m.controller.inRange !== false : true },\n      // corner minimap follows the setting; the TAB map (needed for super jumps) is always available\n      map: showMinimap ? { canvas: this.minimap.canvas, expanded: false, players } : null,\n      markers,\n      prompt,\n      fps: this.settings.showFps ? this.fps : undefined,\n    };", '    const frame = hudFrameSnapshot(this, m, a, w, spread, players, markers, prompt, showMinimap, PLAYER, SUB);', 'persistent Game HUD frame');
    code = once(code, "    this.input.mobile?.setHud({ special: frame.special, ready: frame.specialReady, activeSp: frame.specialActive, weapon: w.kind || a.weaponId, specialId: w.special, ink: frame.ink, subCost: frame.subCost });", '    this.input.mobile?.setHud(this._hudTransport.mobile);', 'persistent touch HUD frame');
    return "import { hudFrameSnapshot } from '../patches/local-quality/hud-snapshots.mjs';\n" + code;
  }
  return code;
}
