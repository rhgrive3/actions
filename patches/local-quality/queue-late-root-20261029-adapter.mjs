// Local additions discovered in the final queue inventory. Build-only.
const changes = [
  {
    "rel": "src/main.js",
    "old": "  _wantLocalLoop(L,dt,name,on,vol,pitch=1) {\n      if (on && L[name]?.playing === false && !L[name]._sfxDeferred && G.audio?.canRearmLoop?.()) { L[name].stop?.(0); L[name] = null; }\n      if (on && !L[name]) L[name] = G.audio?.loop?.(name, { volume: 0 });\n      const h = L[name];\n      if (!h) return;\n      h._v = damp(h._v || 0, on ? vol : 0, on ? 10 : 7, dt);\n      h.set({ volume: h._v, pitch });\n      if (!on && h._v < 0.01) { h.stop(0.05); L[name] = null; }\n  }",
    "new": "  _recoverMainLoop(name, handle, volume, dt, wanted = true) {\n    const audio = G.audio, context = audio?.ctx;\n    const records = this._mainLoopRecovery || (this._mainLoopRecovery = Object.create(null));\n    let record = records[name];\n    if (!record) record = records[name] = { audio, context, state: context?.state, wait: 0, failed: false };\n    if (record.audio !== audio || record.context !== context) {\n      if (handle?.playing || handle?._sfxDeferred) { try { handle.stop?.(0.05); } catch {} }\n      handle = null;\n      record.audio = audio; record.context = context; record.wait = 0; record.failed = false;\n    }\n    if (record.state !== context?.state) { record.state = context?.state; record.wait = 0; }\n    if (context?.state === 'closed') {\n      if (handle?.playing || handle?._sfxDeferred) { try { handle.stop?.(0.05); } catch {} }\n      return null;\n    }\n    if (handle?.playing || handle?._sfxDeferred) return handle;\n    if (handle) record.failed = true;\n    if (record.failed && typeof audio?.canRearmLoop === 'function' && !audio.canRearmLoop()) return null;\n    record.wait = Math.max(0, record.wait - (Number.isFinite(dt) ? Math.max(0, dt) : 0));\n    if (!wanted || !context || typeof audio?.loop !== 'function' || record.wait > 0) return null;\n    let next = null;\n    try { next = audio.loop(name, { volume }); } catch {}\n    if (!next?.playing && !next?._sfxDeferred) { record.wait = 0.5; record.failed = true; return null; }\n    record.wait = 0; record.failed = false;\n    return next;\n  }\n\n  _wantLocalLoop(L,dt,name,on,vol,pitch=1) {\n      if (on && L[name]?.playing === false && !L[name]._sfxDeferred && G.audio?.canRearmLoop?.()) { L[name].stop?.(0); L[name] = null; }\n      const h = L[name] = this._recoverMainLoop(name, L[name], 0, dt, on);\n      if (!h) return;\n      h._v = damp(h._v || 0, on ? vol : 0, on ? 10 : 7, dt);\n      h.set({ volume: h._v, pitch });\n      if (!on && h._v < 0.01) { h.stop(0.05); L[name] = null; }\n  }",
    "label": "reject failed main audio handles, retain deferred playback and bound retries"
  },
  {
    "rel": "src/main.js",
    "old": "    if (!this._audioOn || !G.audio?.loop) return;",
    "new": "    if (!this._audioOn || !G.audio?.loop) { this._amb = this._recoverMainLoop('harbor_ambience', this._amb, 0.55, dt, false); return; }",
    "label": "audio-disabled frames release replaced context handles without starting playback"
  },
  {
    "rel": "src/main.js",
    "old": "    if (!this._amb) this._amb = G.audio.loop('harbor_ambience', { volume: 0.55 });",
    "new": "    this._amb = this._recoverMainLoop('harbor_ambience', this._amb, 0.55, dt);",
    "label": "ambience retries invalid handle and retires prior AudioContext"
  },
  {
    "rel": "src/main.js",
    "old": "    this._amb.set?.({ volume: this._ambV });",
    "new": "    this._amb?.set?.({ volume: this._ambV });",
    "label": "absent ambience handle cannot throw; timer and volume progression stay unchanged"
  },
  {
    "rel": "src/world/environment.js",
    "old": "    dt = Math.min(dt || 0, 0.1);",
    "new": "    dt = Math.min(dt || 0, 0.25);",
    "label": "analytic environment clock follows admitted foreground delta"
  }
];

export function adaptLateRoot20261029(rel, code) {
  for (const edit of changes) {
    if (edit.rel !== rel) continue;
    const first = code.indexOf(edit.old);
    if (first < 0 || code.indexOf(edit.old, first + edit.old.length) >= 0)
      throw Error('Late root queue anchor: ' + edit.label);
    code = code.slice(0, first) + edit.new + code.slice(first + edit.old.length);
  }
  return code;
}
