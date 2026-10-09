import { parseExpressionAt } from '../loading-cache/vendor/acorn.mjs';

function frameKeys(node, required, optional = []) {
  const allowed = new Set([...required, ...optional]), seen = new Set();
  if (node.type !== 'ObjectExpression') throw new Error('INKWAVE quality patch conflict (persistent Game HUD frame): expected object');
  for (const prop of node.properties) {
    const key = prop.key?.name ?? prop.key?.value;
    if (prop.type !== 'Property' || prop.computed || prop.method || prop.kind !== 'init' || !allowed.has(key) || seen.has(key)) {
      throw new Error('INKWAVE quality patch conflict (persistent Game HUD frame): unexpected or repeated owner ' + key);
    }
    seen.add(key);
  }
  if (required.some(key => !seen.has(key))) throw new Error('INKWAVE quality patch conflict (persistent Game HUD frame): missing owner');
}

export function adaptHudSnapshots(rel, code, once) {
  if (rel === 'src/core/mobile.js') {
    code = once(code, '  setHud({ special = 0,', '  setHud({ inkLow = false, special = 0,', 'touch shortage feedback input');
    return once(code,
      "    if (ik !== L.ink) { L.ink = ik; E.fire.style.setProperty('--ink', ik.toFixed(2)); E.fire.classList.toggle('is-low', ik < 0.2); }",
      "    if (ik !== L.ink) { L.ink = ik; E.fire.style.setProperty('--ink', ik.toFixed(2)); }\n    const low = !!inkLow;\n    if (low !== L.low) { L.low = low; E.fire.classList.toggle('is-low', low); }",
      'touch shortage follows failed-use feedback');
  }
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
    const geared = code.includes('    const subCost = subInkSpec(a, SUB.bomb).inkCost;') || code.includes('    const subCost = selectedSubCost(a, SUB);');
    const healthMarked = code.includes('      healthMarkers: buildHealthMarkers(this, G, PLAYER, THREE),');
    const guide = 'projectShotGuide(m.controller?.enabled && m.controller?.a?.alive ? m.controller.shotGuide : null, cam, W, H)';
    const guided = code.includes('guide: ' + guide);
    const muzzleBlocked = code.includes('let muzzleBlock = null;') || code.includes('muzzleBlock,');
    const chargerReach = code.includes('chargerCurrent: m.controller?.chargerReachVisible ? m.controller.chargerCurrentReach : null')
      && code.includes('chargerFull: m.controller?.chargerReachVisible ? m.controller.chargerFullReach : null');

    const frameStart = code.indexOf('    const frame = {');
    const hudUpdate = code.indexOf('\n    this.hud.update(dt, frame);', frameStart);
    if (frameStart < 0 || hudUpdate < frameStart || code.indexOf('    const frame = {', frameStart + 1) >= 0) {
      throw new Error('INKWAVE quality patch conflict (persistent Game HUD frame): expected exactly one frame object before hud.update');
    }
    const frameEnd = code.lastIndexOf('    };', hudUpdate);
    if (frameEnd < frameStart) throw new Error('INKWAVE quality patch conflict (persistent Game HUD frame): frame boundary');
    // Pooling replaces the literal, so reject unknown owners rather than silently dropping them.
    const object = parseExpressionAt(code, code.indexOf('{', frameStart), { ecmaVersion: 'latest' });
    if (object.end !== frameEnd + '    }'.length) throw new Error('INKWAVE quality patch conflict (persistent Game HUD frame): object boundary');
    frameKeys(object, ['time', 'teams', 'ink', 'inkLow', 'subCost', 'special', 'specialReady', 'specialActive', 'hp', 'weapon', 'charge', 'crosshair', 'map', 'markers', 'prompt', 'fps'], ['subReady', 'healthMarkers']);
    frameKeys(object.properties.find(prop => (prop.key.name ?? prop.key.value) === 'crosshair').value,
      ['spread', 'onTarget', 'inRange'], ['guide', 'muzzleBlock', 'chargerCurrent', 'chargerFull']);
    const subValue = geared ? 'subCost' : 'SUB.bomb.inkCost';
    const guideValue = guided ? guide : 'undefined';
    const healthValue = healthMarked ? 'buildHealthMarkers(this, G, PLAYER, THREE)' : 'undefined';
    const muzzleValue = muzzleBlocked ? 'muzzleBlock' : 'undefined';
    const chargerCurrent = chargerReach ? 'm.controller?.chargerReachVisible ? m.controller.chargerCurrentReach : null' : 'undefined';
    const chargerFull = chargerReach ? 'm.controller?.chargerReachVisible ? m.controller.chargerFullReach : null' : 'undefined';
    const frameCall = '    const frame = hudFrameSnapshot(this, m, a, w, spread, players, markers, prompt, showMinimap, PLAYER, SUB, '
      + [subValue, guideValue, healthValue, muzzleValue, chargerCurrent, chargerFull].join(', ') + ');';
    code = code.slice(0, frameStart) + frameCall + code.slice(frameEnd + '    };'.length);

    const hudUpdateAfter = code.indexOf('\n    this.hud.update(dt, frame);', frameStart);
    if (hudUpdateAfter < frameStart) throw new Error('INKWAVE quality patch conflict (persistent Game HUD frame): hud.update moved unexpectedly');
    const mobileStart = code.indexOf('    this.input.mobile?.setHud(', hudUpdateAfter);
    if (mobileStart < 0) throw new Error('INKWAVE quality patch conflict (persistent touch HUD frame): setHud call missing');
    const mobileEnd = code.indexOf(');', mobileStart);
    if (mobileEnd < mobileStart || code.indexOf('    this.input.mobile?.setHud(', mobileStart + 1) >= 0) {
      throw new Error('INKWAVE quality patch conflict (persistent touch HUD frame): expected exactly one setHud call');
    }
    code = code.slice(0, mobileStart) + '    this.input.mobile?.setHud(this._hudTransport.mobile);' + code.slice(mobileEnd + 2);
    return "import { hudFrameSnapshot } from '../patches/local-quality/hud-snapshots.mjs';\n" + code;
  }
  return code;
}
