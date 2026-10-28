// Local queue changes applied after the existing source adapters.
// Upstream input stays immutable; every exact anchor fails closed.
function once(code, from, to, label) {
  if (!code.includes(from)) throw new Error('queue audio 20261027 anchor: '+label);
  return code.replace(from,to);
}
export function adaptQueueAudioBuild20261027(rel,code) {
  if(rel==='src/audio/bossAudio.js') {
    code="import { getPlatformLifecycle } from '../../patches/local-quality/platform-lifecycle.mjs';\n"+code;
    code=once(code,'st.timers.add(id); };','st.timers.add(id); return id; };','timer identity');
    code=once(code,'if (h) { st.loops.delete(key); try { h.stop(fade); }',
      'if (h) { st.loops.delete(key); if (h._bossExpiry != null) { clearTimeout(h._bossExpiry); st.timers.delete(h._bossExpiry); h._bossExpiry = null; } if (!st.loops.size && followId) { clearInterval(followId); followId = 0; } try { h.stop(fade); }','loop expiry disposal');
    code=once(code,'    later(maxDur, () => { if (st.loops.get(key) === h) stopLoop(key, 0.4); });',
      '    h._bossExpiry = later(maxDur, () => { h._bossExpiry = null; if (st.loops.get(key) === h) stopLoop(key, 0.4); });','per-loop timer');
    code=once(code,'  let followId = 0;', '  let followId = 0;\n  const lifecycle = getPlatformLifecycle();','page lifecycle');
    code=once(code,'    if (followId) return;', '    if (followId || !lifecycle.active || !st.active || !st.loops.size) return;','hidden follow gate');
    code=once(code,'  const stopAll = (fade = 0.3) => {',
      "  lifecycle.subscribe({ suspend() { if (followId) { clearInterval(followId); followId = 0; } }, resume() { follow(); } });\n  const stopAll = (fade = 0.3) => {",'follow suspension and resume');
  }
  if(rel==='src/main.js') {
    code=once(code,'    let level, lightmap, physics, nav;','    let level, lightmap, physics, nav, pendingLightmap;','lightmap task owner');
    code=once(code,'      level = new Level(MAP_LAYOUTS[layoutId], colliders);',`      level = new Level(MAP_LAYOUTS[layoutId], colliders);
      pendingLightmap = this._loadLightmap(level, layoutId, lightmapMetadata).then(value=>({value}),error=>({error}));`,'overlap verified lightmap decode with navigation');
    code=once(code,'      lightmap = await this._loadLightmap(level, layoutId, lightmapMetadata);',`      const loadedLightmap=await pendingLightmap;
      if(loadedLightmap.error)throw loadedLightmap.error;
      lightmap=loadedLightmap.value;`,'join lightmap before publication');
    code=once(code,'    } catch (e) { props?.dispose?.(); if (!worldCurrent()) return; throw e; }',`    } catch (e) {
      const failedLightmap=pendingLightmap?await pendingLightmap:null;
      failedLightmap?.value?.dispose?.();props?.dispose?.();
      if (!worldCurrent()) return;throw e;
    }`,'release completed lightmap on failed independent construction');
    code=once(code,'if (G.audio?.setListener) {','if (G.audio?.ctx && G.audio?.setListener) {','preunlock listener');
    const begin='    const want = (name, on, vol, pitch = 1) => {', end='    const alive = !!(a && a.alive);';
    const a=code.indexOf(begin),b=code.indexOf(end,a);
    if(a<0||b<0)throw new Error('queue audio local loop owner');
    let body=code.slice(a,b).replace(begin,'  _wantLocalLoop(L,dt,name,on,vol,pitch=1) {');
    body=body.replace('    };\n','  }\n\n');
    code=code.slice(0,a)+code.slice(b);
    code=once(code,'  _updateLocalLoops(dt) {',body+'  _updateLocalLoops(dt) {','stable local loop helper');
    code=code.replace("    want('swim',","    this._wantLocalLoop(L,dt,'swim',").replace("    want('climb',","    this._wantLocalLoop(L,dt,'climb',").replace("    want('enemy_ink_sizzle',","    this._wantLocalLoop(L,dt,'enemy_ink_sizzle',");
  }
  return code;
}
