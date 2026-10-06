export function adaptHudSnapshots(rel, code, once) {
  if (rel === 'src/game/match.js') {
    const plain = "  teamSummary() {\n    return [0, 1].map((t) => ({\n      color: G.teamHex[t],\n      players: this.actors.filter((a) => a.team === t).map((a) => ({\n        name: a.name, weapon: a.weaponId, alive: a.alive, respawn: a.alive ? 0 : Math.max(0, a.respawnTimer), specialReady: a.specialReady(), isSelf: a.isLocal,\n      })),\n    }));\n  }";
    let source = plain;
    if (!code.includes(plain) && code.includes("  teamSummary() {\n    const coverage = this.mode === 'turf'")) {
      const start = code.indexOf("  teamSummary() {");
      const end = code.indexOf("\n  }\n}", start);
      if (start < 0 || end < start) throw new Error('HUD snapshot conflict: composed teamSummary method boundary');
      source = code.slice(start, end + 4);
    }
    code = once(code, source, "  teamSummary(viewerTeam = 0) { return teamHudSnapshot(this, G.teamHex, viewerTeam, G.paint); }", 'persistent team HUD snapshots');
    return "import { teamHudSnapshot } from '../../patches/local-quality/hud-snapshots.mjs';\n" + code;
  }
  if (rel === 'src/main.js') {
    const geared = code.includes('    const subCost = subInkSpec(a, SUB.bomb).inkCost;');
    const guide = 'projectShotGuide(m.controller?.enabled && m.controller?.a?.alive ? m.controller.shotGuide : null, cam, W, H)';
    const guided = code.includes(', guide: ' + guide + ' },');
    let frameSource = "    const frame = {\n      time: m.time,\n      teams: a.team === 1 ? m.teamSummary().reverse() : m.teamSummary(),   // HUD: [your team, theirs]\n      ink: a.ink / PLAYER.inkMax, inkLow: a.ink < 18 || (this._lowInkFlash > 0), subCost: SUB.bomb.inkCost / PLAYER.inkMax,\n      special: a.specialFrac(), specialReady: a.specialReady(), specialActive: !!a.specialActive,\n      hp: a.hp / PLAYER.hp,\n      weapon: a.weaponId, charge: a.weaponRunner.charge,\n      crosshair: { spread, onTarget: m.controller?.onTarget ? 'enemy' : null, inRange: m.controller ? m.controller.inRange !== false : true },\n      // corner minimap follows the setting; the TAB map (needed for super jumps) is always available\n      map: showMinimap ? { canvas: this.minimap.canvas, expanded: false, players } : null,\n      markers,\n      prompt,\n      fps: this.settings.showFps ? this.fps : undefined,\n    };";
    let mobileSource = "    this.input.mobile?.setHud({ special: frame.special, ready: frame.specialReady, activeSp: frame.specialActive, weapon: w.kind || a.weaponId, specialId: w.special, ink: frame.ink, subCost: frame.subCost });";
    if (geared) {
      frameSource = frameSource.replace('subCost: SUB.bomb.inkCost / PLAYER.inkMax,', 'subCost: subCost / PLAYER.inkMax, subReady: a.ink >= subCost,');
      mobileSource = mobileSource.replace('subCost: frame.subCost });', 'subCost: frame.subCost, subReady: frame.subReady });');
    }
    if (guided) frameSource = frameSource.replace('inRange: m.controller ? m.controller.inRange !== false : true },', 'inRange: m.controller ? m.controller.inRange !== false : true, guide: ' + guide + ' },');
    const values = (geared ? 'subCost' : 'SUB.bomb.inkCost') + (guided ? ', ' + guide : '');
    code = once(code, frameSource, '    const frame = hudFrameSnapshot(this, m, a, w, spread, players, markers, prompt, showMinimap, PLAYER, SUB, ' + values + ');', 'persistent Game HUD frame');
    code = once(code, mobileSource, '    this.input.mobile?.setHud(this._hudTransport.mobile);', 'persistent touch HUD frame');
    return "import { hudFrameSnapshot } from '../patches/local-quality/hud-snapshots.mjs';\n" + code;
  }
  return code;
}
