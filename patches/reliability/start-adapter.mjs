// Build-only INKWAVE startup/world lifetime protection. Applied after results.
// Exact unique anchors fail closed; public source and gameplay values stay intact.
function replaceOnce(source, before, after, label) {
  const at = source.indexOf(before);
  if (at < 0 || source.indexOf(before, at + before.length) >= 0) {
    throw new Error(`INKWAVE reliability start conflict (${label}): expected exactly one connection. Review upstream changes; site was not built.`);
  }
  return source.slice(0, at) + after + source.slice(at + before.length);
}

function method(code, start, end, change) {
  const at = code.indexOf(start), until = code.indexOf(end, at);
  if (at < 0 || until < at || code.indexOf(start, at + start.length) >= 0 || code.indexOf(end, until + end.length) >= 0) {
    throw new Error(`INKWAVE reliability start conflict (${start.trim()} boundary): expected exactly one connection.`);
  }
  return code.slice(0, at) + change(code.slice(at, until)) + code.slice(until);
}

const HELPERS = `  // Each menu/start operation owns its continuations and intentionally-created match.
  _beginMatchFlow() {
    const flow = { match: this.match };
    flow.captureRoom = () => {
      flow.net = G.net; flow.room = G.net?.tr;
      flow.netm = G.netm; flow.sessionMatch = G.net?.match;
    };
    flow.captureRoom();
    flow.current = () => this._matchFlow === flow && this.match === flow.match &&
      G.net === flow.net && G.net?.tr === flow.room && G.netm === flow.netm && G.net?.match === flow.sessionMatch;
    this._matchFlow = flow;
    return flow;
  }

  async _startMenuMatch(o = {}) {
    const flow = this._beginMatchFlow();
    try { return await this.startMatch(o, flow); }
    catch (error) {
      // The core API still rejects. The visible menu owns recovery only for
      // its own current attempt; an abandoned rejection cannot cancel a retry.
      if (!flow.current()) return;
      console.error('[inkwave] match start failed', error);
      const menuMatch = await this.quitToMenu();
      if (menuMatch && this.match === menuMatch && !this._matchFlow && G.mode === 'menu' && this.menus?.current === 'main')
        this.menus.toast?.('Could not start the match. Please try again.', { kind: 'error' });
    }
  }

`;

function startup(source, online) {
  const entry = online ? '  async startNetMatch(cfg, nm) {' : '  async startMatch(o = {}) {';
  source = replaceOnce(source, entry, entry + (online ? '\n    if (G.net?.match !== nm) return;' : '') + '\n    const flow = this._beginMatchFlow();', 'reserve startup');
  for (const line of ['    G.audio?.init?.();', ...(online ? [] : ['    this.input.requestLock();']), '    this.menus?.show(null);']) {
    source = replaceOnce(source, line, line + '\n    if (!flow.current()) return;', 'startup synchronous entry');
  }
  source = replaceOnce(source, '    await this._fade(1, 350);', '    await this._fade(1, 350);\n    if (!flow.current()) return;', 'startup fade');
  source = replaceOnce(source, '    this.showcase.hide();', '    this.showcase.hide();\n    if (!flow.current()) return;', 'startup showcase reentry');
  source = replaceOnce(source, '    if (this.match) this.match.dispose();', '    if (this.match) this.match.dispose();\n    if (!flow.current()) return;', 'startup match disposal');
  const boss = online ? "    const bossModule = cfg.mode === 'boss' ? await this._loadBoss() : null;" : "    const bossModule = opts.mode === 'boss' ? await this._loadBoss() : null;";
  source = replaceOnce(source, boss, boss + '\n    if (!flow.current()) return;', 'startup boss module');
  source = replaceOnce(source,
    '    if ((map.layout || map.id) !== this.layoutId) await this._buildWorld(map);',
    '    if ((map.layout || map.id) !== this.layoutId) await this._buildWorld(map, flow);\n    if (!flow.current()) return;',
    'startup world');
  const palette = online ? '    this._setPalette(this.settings.colorblind ? COLORBLIND_PALETTE : TEAM_PALETTES[cfg.palette] || TEAM_PALETTES[0]);' : '    this._setPalette(this._pickPalette());';
  source = replaceOnce(source, palette, palette + '\n    if (!flow.current()) return;', 'startup palette reentry');
  source = replaceOnce(source, '    m.setup();', '    flow.match = m;\n    m.setup();\n    if (!flow.current()) return;', 'intentional match ownership');
  source = replaceOnce(source, '    await this._warmCharacters(m);', '    await this._warmCharacters(m, flow);\n    if (!flow.current()) return;', 'startup character warm');
  if (online) {
    source = replaceOnce(source, '    nm.bind(m);',
      '    nm.bind(m);\n    if (this._matchFlow !== flow || this.match !== m || G.net !== flow.net || G.net?.tr !== flow.room || G.net?.match !== flow.sessionMatch || G.netm !== nm) return;\n    flow.netm = nm;\n    if (!flow.current()) return;',
      'intentional network bind');
  } else source = replaceOnce(source, '    m.start();', '    m.start();\n    if (!flow.current()) return;', 'start event ownership');
  return source;
}

export function adaptStart(rel, code) {
  if (rel !== 'src/main.js') return code;
  code = method(code, '  async startMatch(o = {}) {', '\n  // ---- online (src/net/session.js', source => startup(source, false));
  code = method(code, '  async startNetMatch(cfg, nm) {', '\n  // Compile every shader variant', source => startup(source, true));
  code = replaceOnce(code, '  async startMatch(o = {}) {', HELPERS + '  async startMatch(o = {}) {', 'operation helper');
  code = replaceOnce(code, '  async startMatch(o = {}) {\n    const flow = this._beginMatchFlow();',
    '  async startMatch(o = {}, flow = this._beginMatchFlow()) {',
    'startup accepts its UI-owned operation without bypassing build instrumentation');
  code = replaceOnce(code, '      startMatch: (o) => self.startMatch(o),',
    '      startMatch: (o) => self._startMenuMatch(o),', 'menu consumes active startup rejection');
  code = replaceOnce(code, "    if (!this._bossMod) this._bossMod = loadLazyModule('./boss/bossMode.js');",
    "    if (!this._bossMod) {\n      const pending = this._bossMod = loadLazyModule('./boss/bossMode.js');\n      pending.catch(() => { if (this._bossMod === pending) this._bossMod = null; });\n    }",
    'failed Boss module can be retried');
  code = replaceOnce(code, '  _startAttract() {', '  _startAttract() {\n    this._matchFlow = null; this._worldBuild = null;', 'attract invalidation');
  code = method(code, '  async quitToMenu() {', '\n  // Boss Battle intro:', source => {
    source = replaceOnce(source, '  async quitToMenu() {', '  async quitToMenu() {\n    const flow = this._beginMatchFlow();', 'quit reservation');
    const leave = "    if (G.net && G.net.state !== 'offline' && G.net.state !== 'error') G.net.leave();";
    source = replaceOnce(source, leave, [
      "    const leavingRoom = G.net && G.net.state !== 'offline' && G.net.state !== 'error';",
      '    if (leavingRoom) flow.net.leave();',
      '    if (this._matchFlow !== flow || this.match !== flow.match) return;',
      '    if (leavingRoom && (G.net !== flow.net || G.net?.tr != null || G.net?.match != null || G.netm != null)) return;',
      '    flow.captureRoom();',
    ].join('\n'), 'intentional room departure');
    for (const line of ['    this.input.exitLock();', '    this.menus?.show(null);', '    await this._fade(1, 350);']) {
      source = replaceOnce(source, line, line + '\n    if (!flow.current()) return;', 'quit ownership');
    }
    source = replaceOnce(source, '    this._fade(0, 500);',
      '    this._fade(0, 500);\n    return this.match;', 'identify completed menu recovery');
    return source;
  });
  // The results overlay already guards room/match identity. The operation handle
  // also protects a new start that is awaiting fade but has not created its match.
  code = method(code, '  async netMatchEnd() {', '\n  // the room went away mid-match', source => {
    source = replaceOnce(source, '    if (this._netEnding) return;', '    if (this._netEnding) return;\n    const flow = this._beginMatchFlow();', 'room return reservation');
    for (const line of ['      this.input.exitLock();', '      this.menus?.show(null);']) {
      source = replaceOnce(source, line, line + '\n      if (!flow.current()) return;', 'room return synchronous ownership');
    }
    source = replaceOnce(source, '      if (!resultsCurrent()) return;', '      if (!resultsCurrent() || !flow.current()) return;', 'room return operation');
    return source;
  });
  // Match identity survives the departure/start fade. A presentation also owns
  // the operation generation it entered under, including its delayed callbacks.
  // netMatchEnd retains its newly-reserved flow rather than a presentation flow.
  for (const [start, end] of [
    ['  async _bossResults() {', '\n  async _judge() {'],
    ['  async _judge() {', '\n  _fade(to, ms)'],
  ]) {
    code = method(code, start, end, source => replaceOnce(source,
      '    const resultsCurrent = () => this.match === m && G.netm === netm && G.net === net && net?.tr === room;',
      '    const presentationFlow = this._matchFlow;\n    const resultsCurrent = () => this._matchFlow === presentationFlow && this.match === m && G.netm === netm && G.net === net && net?.tr === room;',
      'result presentation operation'));
  }
  code = replaceOnce(code, '  async _warmCharacters(m) {', '  async _warmCharacters(m, flow = null) {', 'warm ownership argument');
  code = replaceOnce(code,
    "    if (m.boss) jobs.push(Promise.resolve(m.boss.model.ready).then(() => Promise.all(m.boss.warm().map((o) => G.renderer.compileAsync(o, G.camera, G.scene)))).catch((e) => console.warn('[inkwave] boss warm', e)));",
    "    if (m.boss) jobs.push(Promise.resolve(m.boss.model.ready).then(() => {\n      if (this.match !== m || (flow && !flow.current())) return;\n      return Promise.all(m.boss.warm().map((o) => G.renderer.compileAsync(o, G.camera, G.scene)));\n    }).catch((e) => console.warn('[inkwave] boss warm', e)));",
    'late boss warm');
  code = method(code, '  async _buildWorld(map) {', '\n  _shadowRoots()', source => {
    source = replaceOnce(source, '  async _buildWorld(map) {', '  async _buildWorld(map, flow = null) {\n    if (flow && !flow.current()) return;', 'world flow argument');
    source = replaceOnce(source, '    const scene = G.scene;', [
      '    const scene = G.scene, ownerFlow = this._matchFlow;',
      '    const world = (this._worldBuild = {});',
      '    const worldCurrent = () => this._worldBuild === world && G.scene === scene &&',
      '      (flow ? flow.current() : this._matchFlow === ownerFlow);',
      '    if (!worldCurrent()) return;',
    ].join('\n'), 'world transaction ownership');
    const teardown = [
      '    if (this.levelMesh) { scene.remove(this.levelMesh, this.grateMesh); this.levelMesh.geometry.dispose(); this.grateMesh?.geometry.dispose(); this.levelMat.dispose(); this.grateMat?.dispose(); }',
      '    this.decor?.dispose?.();',
      '    if (this.stageLightmap) { this.stageLightmap.dispose(); this.stageLightmap = null; }',
      '    if (this.props) { this.props.dispose?.(); this.props = null; }',
      '    G.paint?.dispose();',
      '    this.layoutId = layoutId;',
      '    this.mapDef = map;',
    ].join('\n');
    source = replaceOnce(source, teardown, '    // Prepare the replacement detached; retain the current stage during loading.', 'defer world teardown');
    source = replaceOnce(source, '    const colliders = [];', '    const colliders = [];\n    let props = null;', 'detached props owner');
    source = replaceOnce(source, '        this.props = new this.PropKit(scene, { castShadow: true, quality: this.settings.quality });', '        props = new this.PropKit(null, { castShadow: true, quality: this.settings.quality });', 'detached props construction');
    source = replaceOnce(source, '          const r = this.props.add(it.type, it);', '          const r = props.add(it.type, it);', 'detached props colliders');
    source = replaceOnce(source, '        this.props.build();', '        props.build();', 'detached props build');
    source = replaceOnce(source, "      } catch (e) { console.error('[inkwave] props failed', e); this.props = null; }", "      } catch (e) { console.error('[inkwave] props failed', e); props?.dispose?.(); props = null; }", 'failed detached props cleanup');
    source = replaceOnce(source,
      '    const level = (G.level = new Level(MAP_LAYOUTS[layoutId], colliders));\n    G.physics = new Physics(level);\n    const lightmap = await this._loadLightmap(level, layoutId);',
      [
        '    let level, lightmap;',
        '    try {',
        '      level = new Level(MAP_LAYOUTS[layoutId], colliders);',
        '      lightmap = await this._loadLightmap(level, layoutId);',
        '    } catch (e) { props?.dispose?.(); throw e; }',
        '    if (!worldCurrent()) { lightmap?.dispose?.(); props?.dispose?.(); return; }',
        teardown,
        '    this.props = props;',
        '    if (props) { props.scene = scene; scene.add(props.group); }',
        '    G.level = level;',
        '    G.physics = new Physics(level);',
      ].join('\n'), 'world commit after lightmap');
    return source;
  });
  return code;
}
