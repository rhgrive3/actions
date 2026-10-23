// Build-only exact source rewrites for the additional UI/motion queue batch.
// Values and display keys retain their original formulas; instance-owned caches
// never retain Actors or change native sensor/animation/controller timing.
const REWRITES = [
  [
    "src/game/cameraRig.js",
    "    const fwd = this.forward(_fwd);\n    _right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));   // camera right on the ground plane",
    "    let fwd;\n    if (this.forward === CAMERA_FORWARD_IMPL) {\n      const cp = Math.cos(this.pitch), sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);\n      fwd = _fwd.set(sy * cp, Math.sin(this.pitch), cy * cp);\n      _right.set(-cy, 0, sy);\n    } else {\n      fwd = this.forward(_fwd);\n      _right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));\n    }   // camera right on the ground plane"
  ],
  [
    "src/main.js",
    "    const spread = kind === 'roller' ? 28 : Math.min(90, (Math.tan((coneDeg * Math.PI) / 180) / Math.tan(vHalf)) * (innerHeight / 2));",
    "    let spread = 28;\n    if (kind !== 'roller') {\n      const fov = G.camera.fov, cache = this._hudTangents || (this._hudTangents = {});\n      if (!cache.fovReady || !Object.is(cache.fov, fov)) { cache.fovReady = true; cache.fov = fov; cache.halfFov = Math.tan(vHalf); }\n      if (!cache.coneReady || !Object.is(cache.cone, coneDeg)) { cache.coneReady = true; cache.cone = coneDeg; cache.coneTan = Math.tan((coneDeg * Math.PI) / 180); }\n      spread = Math.min(90, (cache.coneTan / cache.halfFov) * (innerHeight / 2));\n    }"
  ],
  [
    "src/ui/hud.js",
    "    const txt = fmtTime(time);",
    "    const seconds = Math.max(0, Math.ceil(time - 1e-6));\n    let txt = L.timer;\n    if (!Object.is(L.timerSeconds, seconds) || txt === undefined) { txt = fmtTime(time); L.timerSeconds = seconds; }"
  ],
  [
    "src/ui/hud.js",
    "    const txt = fmtInt(Math.floor(this._turfShown));",
    "    const whole = Math.floor(this._turfShown);\n    let txt = this._L.turfTxt;\n    if (!Object.is(this._L.turfWhole, whole) || txt === undefined) { txt = fmtInt(whole); this._L.turfWhole = whole; }"
  ],
  [
    "src/ui/hud.js",
    "        const key = `${p.alive ? 1 : 0}|0|${p.specialReady ? 1 : 0}|${p.isSelf ? 1 : 0}|${w}`;",
    "        const raw = el._squadKey || (el._squadKey = {}), alive = !!p.alive, ready = !!p.specialReady, self = !!p.isSelf;\n        if (raw.key === L[k] && raw.valid && raw.alive === alive && raw.ready === ready && raw.self === self && raw.weapon === w) continue;\n        const key = `${p.alive ? 1 : 0}|0|${p.specialReady ? 1 : 0}|${p.isSelf ? 1 : 0}|${w}`;\n        raw.key = key; raw.valid = true; raw.alive = alive; raw.ready = ready; raw.self = self; raw.weapon = w;"
  ],
  [
    "src/ui/hud.js",
    "    const box = `${x.toFixed(1)},${y.toFixed(1)},${bw.toFixed(1)},${bh.toFixed(1)}`;",
    "    const boxRaw = L.mapBoxRaw || (L.mapBoxRaw = {});\n    const boxSame = boxRaw.key === L.mapBox && boxRaw.valid && Object.is(boxRaw.x, x) && Object.is(boxRaw.y, y) && Object.is(boxRaw.w, bw) && Object.is(boxRaw.h, bh);\n    const box = boxSame ? boxRaw.key : `${x.toFixed(1)},${y.toFixed(1)},${bw.toFixed(1)},${bh.toFixed(1)}`;\n    if (!boxSame) { boxRaw.key = box; boxRaw.valid = true; boxRaw.x = x; boxRaw.y = y; boxRaw.w = bw; boxRaw.h = bh; }"
  ],
  [
    "src/ui/hud.js",
    "      const key = `${px.toFixed(1)}|${py.toFixed(1)}|${(+p.yaw || 0).toFixed(2)}|${p.alive === false ? 0 : 1}|${p.isSelf ? 1 : 0}|${p.team}`;",
    "      const raw = d._mapKey || (d._mapKey = {}), yaw = +p.yaw || 0, alive = p.alive !== false, self = !!p.isSelf;\n      if (raw.key === L[dk] && raw.valid && Object.is(raw.x, px) && Object.is(raw.y, py) && Object.is(raw.yaw, yaw) && raw.alive === alive && raw.self === self && raw.team === p.team) continue;\n      const key = `${px.toFixed(1)}|${py.toFixed(1)}|${(+p.yaw || 0).toFixed(2)}|${p.alive === false ? 0 : 1}|${p.isSelf ? 1 : 0}|${p.team}`;\n      raw.key = key; raw.valid = true; raw.x = px; raw.y = py; raw.yaw = yaw; raw.alive = alive; raw.self = self; raw.team = p.team;"
  ],
  [
    "src/ui/hud.js",
    "    let byName = this._byName;\n    const actors = this._actors();\n    if (!this.lab) this._actorRefsMatch = G.match;\n    if (!byName || this._byNameN !== actors.length || this._byNameA !== actors[0]) {\n      byName = this._byName = new Map(actors.map((a) => [a.name, a]));\n      this._byNameN = actors.length; this._byNameA = actors[0];\n    }",
    "    let byName = null;"
  ],
  [
    "src/ui/hud.js",
    "      const ac = byName.get(m.name);",
    "      let ac;\n      if (typeof m.specialReady !== 'boolean' || !m.weapon) {\n        if (!byName) {\n          const actors = this._actors();\n          if (!this.lab) this._actorRefsMatch = G.match;\n          byName = this._byName;\n          if (!byName || this._byNameN !== actors.length || this._byNameA !== actors[0]) {\n            byName = this._byName = new Map(actors.map((a) => [a.name, a]));\n            this._byNameN = actors.length; this._byNameA = actors[0];\n          }\n        }\n        ac = byName.get(m.name);\n      }"
  ],
  [
    "src/ui/menus.js",
    "badgeQueue = null, lobbyT = 0;",
    "badgeQueue = null, nextBadgeIndex = 0, lobbyT = 0;"
  ],
  [
    "src/ui/menus.js",
    "      badgesList().forEach((b) => showBadge(b, true));",
    "      badgesList().forEach((b) => showBadge(b, true));\n      nextBadgeIndex = badgeQueue.length;"
  ],
  [
    "src/ui/menus.js",
    "          for (let i = 0; i < Math.min(n, q.length); i++) showBadge(q[i], false);",
    "          for (const end = Math.min(n, q.length); nextBadgeIndex < end; nextBadgeIndex++) showBadge(q[nextBadgeIndex], false);"
  ],
  [
    "src/game/showcase.js",
    "      const plan = [[1.05, 0, -1], [1.3, 2, 1], [1.62, 1, -1], [2.0, 3, 1], [3.6, 0, 1], [5.2, 2, -1], [6.9, 1, 1]];",
    "      const plan = RESULT_BOMB_PLAN;"
  ],
  [
    "src/ui/menu-art.js",
    "  const seeds = bars.map(() => [R() * TAU, 2 + R() * 5, 0.4 + R() * 0.6]);",
    "  const seeds = bars.map(() => [R() * TAU, 2 + R() * 5, 0.4 + R() * 0.6]);\n  const spectra = bars.map((_, i) => { const x = i / (N - 1); return key === 'music' ? 1 - x * 0.55 : key === 'sfx' ? 0.35 + 0.65 * Math.sin(x * Math.PI) : 0.8 - x * 0.3; });\n  let floorDrawn = false;"
  ],
  [
    "src/ui/menu-art.js",
    "      const beat = key === 'sfx' ? Math.pow(Math.max(0, Math.sin(t * 5.1)), 6) : 0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2.4)), 3);",
    "      if (eff() <= 0.001 && Number.isFinite(t) && shown >= 0 && shown <= 0.012) {\n        if (!floorDrawn) { for (const bar of bars) bar.style.transform = 'scaleY(0.020)'; floorDrawn = true; }\n        return;\n      }\n      floorDrawn = false;\n      const beat = key === 'sfx' ? Math.pow(Math.max(0, Math.sin(t * 5.1)), 6) : 0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2.4)), 3);"
  ],
  [
    "src/ui/menu-art.js",
    "        const x = i / (N - 1);\n        const spectrum = key === 'music' ? 1 - x * 0.55 : key === 'sfx' ? 0.35 + 0.65 * Math.sin(x * Math.PI) : 0.8 - x * 0.3;",
    "        const spectrum = spectra[i];"
  ],
  [
    "src/game/motion/gait-targets.js",
    "this.wp=bank.bones.map(()=>new THREE.Vector3());this.wq=bank.bones.map(()=>new THREE.Quaternion());",
    "if(this.indices.every(i=>Number.isInteger(i)&&i>=0&&i<bank.bones.length)){this.wp=new Array(bank.bones.length);this.wq=new Array(bank.bones.length);for(const i of this.indices){this.wp[i]=new THREE.Vector3();this.wq[i]=new THREE.Quaternion();}}else{this.wp=bank.bones.map(()=>new THREE.Vector3());this.wq=bank.bones.map(()=>new THREE.Quaternion());}"
  ],
  [
    "src/game/motion/source-controller.js",
    "this.previousBalanceTargets={wp:bank.bones.map(()=>new THREE.Vector3())};",
    "const balanceIndices=['leg1_L','leg1_R'].map(name=>bank.index[name]);if(balanceIndices.every(i=>Number.isInteger(i)&&i>=0&&i<bank.bones.length)){this.previousBalanceTargets={wp:new Array(bank.bones.length)};for(const i of balanceIndices)this.previousBalanceTargets.wp[i]=new THREE.Vector3();}else{this.previousBalanceTargets={wp:bank.bones.map(()=>new THREE.Vector3())};}"
  ]
];
export function adaptAddedUiMotion(rel, code) {
  const owned = REWRITES.some(row => row[0] === rel);
  const marker = "// INKWAVE added UI/motion optimization batch";
  if (owned && code.includes(marker)) throw new Error("INKWAVE added UI/motion patch conflict: duplicate " + rel);
  for (const [owner,before,after] of REWRITES) {
    if (owner !== rel) continue;
    const start=code.indexOf(before);
    if(start<0 || code.indexOf(before,start+before.length)>=0) throw new Error('INKWAVE added UI/motion patch conflict: '+owner+' '+before.slice(0,60));
    code=code.slice(0,start)+after+code.slice(start+before.length);
  }
  if(rel==='src/game/cameraRig.js')code+='\nconst CAMERA_FORWARD_IMPL = CameraRig.prototype.forward;\n';
  if(rel==='src/game/showcase.js')code='const RESULT_BOMB_PLAN = Object.freeze([[1.05,0,-1],[1.3,2,1],[1.62,1,-1],[2.0,3,1],[3.6,0,1],[5.2,2,-1],[6.9,1,1]].map(row=>Object.freeze(row)));\n'+code;
  return owned ? marker + "\n" + code : code;
}
