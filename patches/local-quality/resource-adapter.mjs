// Source connections stay strict and compose after the existing gameplay layers.
export function adaptResourceSource(rel, code, replace) {
  const patch = (before, after, label) => { code = replace(code, before, after, 'resource: ' + label); };
  if (rel === 'src/game/match.js') {
    patch('    this.events.push({ t: this.duration - this.time, victim, attacker, cause });',
      '    if (!this.attract) this.events.push({ t: this.duration - this.time, victim, attacker, cause });', 'attract history');
    patch('    this.unsubs?.forEach((u) => u());', '    this.unsubs?.forEach((u) => u());\n    this.events.length = 0;', 'history lifetime');
  }
  if (rel === 'src/game/showcase.js') {
    code = "import { cachePortrait, releasePortrait, installPortraitBudget } from '../../patches/local-quality/resource-budget.mjs';\n" + code;
    patch('    const t0 = performance.now();\n    let read = null;', '    const t0 = performance.now();\n    const cacheEpoch = this._portraitCacheEpoch || 0;\n    let read = null;', 'portrait request epoch');
    patch('      if (cv) { this._pcache.set(job.key, cv); if (this._pcache.size > 96) this._pcache.delete(this._pcache.keys().next().value); }',
      '', 'portrait pixel cap');
    const cbs = "      for (const cb of job.cbs) { try { cb(cv ? copyCanvas(cv) : null); } catch (e) { console.error('[showcase] portrait cb', e); } }";
    patch(cbs, cbs + '\n      const retained = cv && cachePortrait(this, job.key, cv, !!G.game?.mobile?.touch, cacheEpoch);\n      if (cv && !retained) releasePortrait(cv);', 'release uncached source after independent UI copies');
    code += '\ninstallPortraitBudget(Showcase, G);\n';
  }
  if (rel === 'src/config.js') {
    for (const [name, scale] of [['low', 0], ['medium', .28], ['high', .4], ['ultra', .5]]) {
      const prefix = new RegExp('  ' + name + ': +\\{ pixelRatio:').exec(code)?.[0];
      if (!prefix) throw Error('INKWAVE quality patch conflict: preset missing ' + name);
      patch(prefix, prefix.replace('pixelRatio:', `reflectionScale: ${scale}, reflectionInterval: 1, reflectionActors: ${name === 'ultra'}, pixelRatio:`), name + ' reflection policy');
    }
    patch('      paintAtlas: Math.min(base.paintAtlas, 2048),',
      '      reflectionScale: Math.min(base.reflectionScale, 0.2),\n      reflectionInterval: 2,\n      reflectionActors: false,\n      paintAtlas: Math.min(base.paintAtlas, 2048),', 'touch reflection budget');
  }
  if (rel === 'src/world/environment.js') {
    patch("import { PLAYER } from '../config.js';", "import { PLAYER, effectiveQuality } from '../config.js';\nimport { reflectionDue } from '../../patches/local-quality/resource-budget.mjs';", 'effective reflection import');
    patch("    const q = G.settings?.quality || 'high';\n    const scale = !this.reflections || q === 'low' ? 0 : (q === 'medium' ? 0.28 : q === 'ultra' ? 0.5 : 0.4) * (this.reflScale ?? 1);",
      '    const q = effectiveQuality(G.settings, G.game?.mobile);\n    const scale = this.reflections ? q.reflectionScale * (this.reflScale ?? 1) : 0;', 'authoritative reflection quality');
    patch('    if (!this._marina || this._reflBusy || scene.overrideMaterial || this._reflFrame === this._frameId) return;',
      '    if (!this._marina) { U.uReflOn.value = 0; return; }\n    if (this._reflBusy || scene.overrideMaterial || this._reflFrame === this._frameId) return;', 'non-marina stop');
    const size = '    renderer.getDrawingBufferSize(_rv2);\n    const w = Math.max(64, Math.round(_rv2.x * scale)), h = Math.max(64, Math.round(_rv2.y * scale));';
    patch(size, '', 'move size decision before cadence');
    patch('    if (!this._reflRT) {', size + '\n    if (!reflectionDue(this, q, w, h, scale)) return;\n    if (!this._reflRT) {', 'reflection cadence');
    patch("    if (q !== 'ultra') {", '    if (!q.reflectionActors) {', 'effective actor reflection');
    patch('    U.uReflOn.value = 1;', '    this._reflPolicy = this._reflPendingPolicy; this._reflRenderedFrame = this._frameId;\n    U.uReflOn.value = 1;', 'commit successful reflection');
  }
  if (rel === 'src/core/shadowcache.js') {
    code = "import { installDepthOnlyShadowCache, attachDepthCacheLifecycle } from '../../patches/local-quality/depth-cache.mjs';\n" + code;
    patch('      return self._render(this, lights, scene, camera);\n    };',
      '      return self._render(this, lights, scene, camera);\n    };\n    attachDepthCacheLifecycle(this, G);', 'depth lifecycle');
    patch('        this._ensureCache(w, hh);', '        this._ensureCache(w, hh, sh.map.depthTexture?.type);', 'match native depth format');
    code += '\ninstallDepthOnlyShadowCache(ShadowCache);\n';
  }
  return code;
}
