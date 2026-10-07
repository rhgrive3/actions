// #418 uses the same native context as the canonical active browser verifier.
export async function runQualityBrowserProbe(page) {
  await page.waitForFunction(() => !!globalThis.s3ProbeG?.game && !!globalThis.s3ProbeG?.paint, null, { timeout: 15000 });
  return page.evaluate(async () => {
    const G = globalThis.s3ProbeG, game = G.game;
    const { effectiveQuality } = await import(new URL('src/config.js', document.baseURI).href);
    const saved = { ...game.settings };
    const initial = { quality: saved.quality, paintSize: G.paint.size, shadowSize: G.env?.shadowSize, propQ: game.props?.quality };
    const capture = () => ({ level: G.level, physics: G.physics, paint: G.paint, counts: [...G.paint.counts], turfTotal: G.paint.turfTotal });
    const inspect = (before, quality) => {
      const expected = effectiveQuality({ ...game.settings, quality }, game.mobile);
      const uniforms = game.levelMat?.userData?.uniforms || game.levelMat?.uniforms;
      const row = { quality, levelIdentityPreserved: G.level === before.level, physicsIdentityPreserved: G.physics === before.physics,
        paintIdentityPreserved: G.paint === before.paint, countsPreserved: G.paint.counts.every((n, i) => n === before.counts[i]),
        turfTotalPreserved: G.paint.turfTotal === before.turfTotal, paintSize: G.paint.size, shadowSize: G.env?.shadowSize,
        fxQ: G.fx?.q, propQ: game.props?.quality, builtQuality: game._builtQuality,
        expectedPaint: expected.paintAtlas, expectedShadow: expected.shadowSize, uTexel: uniforms?.uTexel?.value, uAtlasSize: uniforms?.uAtlasSize?.value };
      if (!row.levelIdentityPreserved || !row.physicsIdentityPreserved || !row.paintIdentityPreserved || !row.countsPreserved || !row.turfTotalPreserved)
        throw new Error('Quality integration changed authoritative CPU world or paint state');
      if (row.paintSize !== expected.paintAtlas || row.shadowSize !== expected.shadowSize || row.propQ !== quality || row.builtQuality !== quality)
        throw new Error(`Quality integration failed ${quality} budgets: ${JSON.stringify(row)}`);
      return row;
    };
    let result, failure;
    try {
      if (G.paint.counts.every(n => n === 0)) game.debug?.paintRandom?.(20);
      let before = capture(); game._setSettings({ quality: 'low' }); const lowSwitch = inspect(before, 'low');
      before = capture(); game._setSettings({ quality: 'high' }); const highSwitch = inspect(before, 'high');
      before = capture(); game.settings.quality = 'low'; await game._buildWorld(game.mapDef);
      const layoutReconciliation = inspect(before, 'low');
      result = { status: 'passed', initial, lowSwitch, highSwitch, layoutReconciliation };
    } catch (error) { failure = error; }
    try { game._setSettings(saved); }
    catch (error) { if (failure) throw new AggregateError([failure, error], 'Quality probe and settings restoration failed'); throw error; }
    if (failure) throw failure;
    return result;
  });
}
