// #534: keep the original strip pixels/placements, but omit unused stage rows.
// Resize the same public Texture handle only after disposing its old GPU image.
export function adaptMuralAtlas(rel, code, once) {
  const patch = (a,b,label) => { code = once(code,a,b,'mural atlas: '+label); };
  if (rel === 'src/main.js') {
    patch('this.murals = await createMuralTexture();',
      `const waveController = new AbortController();
    const waveReady = envMod.prewarmWaveTexture({ signal: waveController.signal });
    const muralReady = createMuralTexture(map.layout || map.id).then(value => ({ ok: true, value }), error => ({ ok: false, error }));`, 'selected mural fonts overlap texlib preparation');
    patch("    } catch (e) { console.error('[inkwave] texture library failed — procedural fallback', e); this.texlib = null; }\n    await this._buildWorld(map);",
      `    } catch (e) { console.error('[inkwave] texture library failed — procedural fallback', e); this.texlib = null; }
    const muralResult = await muralReady;
    if (!muralResult.ok) { waveController.abort(); try { this.texlib?.dispose(); } catch { /* retain the mural failure */ } this.texlib = null; throw muralResult.error; }
    const waveData = await waveReady;
    this.murals = muralResult.value;
    await this._buildWorld(map);`, 'join both resources before world creation and release texlib on fatal mural failure');
  }
  if (rel === 'src/main.js') {
    patch('G.env = new envMod.Environment(G.renderer, scene, { bounds: B, theme: this.theme, shadowSize: q.shadowSize, footprint: this._footprint(G.level) });',
      'G.env = new envMod.Environment(G.renderer, scene, { waveData, bounds: B, theme: this.theme, shadowSize: q.shadowSize, footprint: this._footprint(G.level) });', 'consume owned wave bytes before the synchronous environment constructor');
  }
  // Mural canvas ownership has moved to inkwave-public/src/world/murals.js.
  return code;
}
