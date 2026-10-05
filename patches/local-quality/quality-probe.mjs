// Lightweight browser acceptance probe for INKWAVE candidate #418: Runtime quality world resource budgets.
// Designed so parent can directly embed into existing active CI (or invoke via script)
// without requiring broad local suites or new workflow files.

export async function runQualityBrowserProbe(page) {
  // Wait for game and native G to initialize
  await page.waitForFunction(() => typeof window !== 'undefined' && window.__inkwave && window.__G && window.__G.paint, { timeout: 15000 });

  // 1. Initial State & Alias Validation
  const initial = await page.evaluate(() => {
    const game = window.__inkwave;
    const G = window.__G;

    // Verify debug anchor is window.__G and NO invented aliases exist
    const hasInventedAliases = (
      typeof window.G !== 'undefined' ||
      typeof globalThis.G !== 'undefined' ||
      typeof game.G !== 'undefined' ||
      typeof game.paint !== 'undefined' ||
      typeof game.env !== 'undefined' ||
      typeof game.fx !== 'undefined'
    );

    return {
      quality: game.settings?.quality || 'high',
      hasInventedAliases,
      hasNativePaint: !!G.paint,
      hasNativeEnv: !!G.env,
      hasNativeFx: !!G.fx,
      paintSize: G.paint.size,
      shadowSize: G.env?.shadowSize,
      fxQ: G.fx?.q,
      propQ: game.props?.quality,
    };
  });

  if (initial.hasInventedAliases) {
    throw new Error('Quality integration failed: invented G / game.paint/env/fx aliases detected');
  }

  // 2. Splat ink and switch to LOW preset
  const lowSwitch = await page.evaluate(() => {
    const game = window.__inkwave;
    const G = window.__G;

    // Splat test ink if none present
    if (G.paint.counts[0] === 0 && G.paint.counts[1] === 0) {
      game.debug?.paintRandom?.(20);
    }

    const levelBefore = G.level;
    const physicsBefore = G.physics;
    const paintBefore = G.paint;
    const initialCounts = [...G.paint.counts];
    const initialTurfTotal = G.paint.turfTotal;

    // Trigger adapted _setSettings
    game._setSettings({ quality: 'low' });

    const uniforms = game.levelMat?.userData?.uniforms || game.levelMat?.uniforms;

    return {
      levelIdentityPreserved: G.level === levelBefore,
      physicsIdentityPreserved: G.physics === physicsBefore,
      paintIdentityPreserved: G.paint === paintBefore,
      countsPreserved: G.paint.counts[0] === initialCounts[0] && G.paint.counts[1] === initialCounts[1],
      turfTotalPreserved: G.paint.turfTotal === initialTurfTotal,
      paintSize: G.paint.size,
      shadowSize: G.env?.shadowSize,
      fxQ: G.fx?.q,
      propQ: game.props?.quality,
      builtQuality: game._builtQuality,
      uTexel: uniforms?.uTexel?.value,
      uAtlasSize: uniforms?.uAtlasSize?.value,
    };
  });

  if (!lowSwitch.levelIdentityPreserved || !lowSwitch.physicsIdentityPreserved || !lowSwitch.paintIdentityPreserved) {
    throw new Error('Quality integration failed: CPU object identities reset during quality switch');
  }
  if (!lowSwitch.countsPreserved || !lowSwitch.turfTotalPreserved) {
    throw new Error('Quality integration failed: authoritative CPU paint data mutated or wiped');
  }
  if (lowSwitch.paintSize !== 2048 || lowSwitch.shadowSize !== 1024 || lowSwitch.propQ !== 'low') {
    throw new Error(`Quality integration failed: expected LOW budgets (2048/1024/low), got paint=${lowSwitch.paintSize}, shadow=${lowSwitch.shadowSize}, prop=${lowSwitch.propQ}`);
  }

  // 3. Switch back to HIGH preset
  const highSwitch = await page.evaluate(() => {
    const game = window.__inkwave;
    const G = window.__G;

    const levelBefore = G.level;
    const physicsBefore = G.physics;
    const paintBefore = G.paint;

    game._setSettings({ quality: 'high' });

    const uniforms = game.levelMat?.userData?.uniforms || game.levelMat?.uniforms;

    return {
      levelIdentityPreserved: G.level === levelBefore,
      physicsIdentityPreserved: G.physics === physicsBefore,
      paintIdentityPreserved: G.paint === paintBefore,
      paintSize: G.paint.size,
      shadowSize: G.env?.shadowSize,
      fxQ: G.fx?.q,
      propQ: game.props?.quality,
      builtQuality: game._builtQuality,
      uTexel: uniforms?.uTexel?.value,
      uAtlasSize: uniforms?.uAtlasSize?.value,
    };
  });

  if (!highSwitch.levelIdentityPreserved || !highSwitch.physicsIdentityPreserved || !highSwitch.paintIdentityPreserved) {
    throw new Error('Quality integration failed: CPU object identities reset when switching back to HIGH');
  }
  if (highSwitch.paintSize !== 4096 || highSwitch.shadowSize !== 4096 || highSwitch.propQ !== 'high') {
    throw new Error(`Quality integration failed: expected HIGH budgets (4096/4096/high), got paint=${highSwitch.paintSize}, shadow=${highSwitch.shadowSize}, prop=${highSwitch.propQ}`);
  }

  // 4. Test same-layout reconciliation in _buildWorld (no full CPU reset)
  const layoutReconciliation = await page.evaluate(async () => {
    const game = window.__inkwave;
    const G = window.__G;

    const levelBefore = G.level;
    const physicsBefore = G.physics;
    const paintBefore = G.paint;

    // Change setting directly without calling _setSettings
    game.settings.quality = 'low';

    // Call _buildWorld on same layout
    await game._buildWorld(game.mapDef);

    return {
      levelIdentityPreserved: G.level === levelBefore,
      physicsIdentityPreserved: G.physics === physicsBefore,
      paintIdentityPreserved: G.paint === paintBefore,
      paintSize: G.paint.size,
      propQ: game.props?.quality,
      builtQuality: game._builtQuality,
    };
  });

  if (!layoutReconciliation.levelIdentityPreserved || !layoutReconciliation.physicsIdentityPreserved) {
    throw new Error('Quality integration failed: same-layout _buildWorld triggered full CPU reset');
  }

  return {
    status: 'passed',
    initial,
    lowSwitch,
    highSwitch,
    layoutReconciliation,
  };
}
// Lightweight browser acceptance probe for INKWAVE candidate #418: Runtime quality world resource budgets.
// Designed so parent can directly embed into existing active CI (or invoke via script)
// without requiring broad local suites or new workflow files.

export async function runQualityBrowserProbe(page) {
  // Wait for game and native G to initialize
  await page.waitForFunction(() => typeof window !== 'undefined' && window.__inkwave && window.__G && window.__G.paint, { timeout: 15000 });

  // 1. Initial State & Alias Validation
  const initial = await page.evaluate(() => {
    const game = window.__inkwave;
    const G = window.__G;

    // Verify debug anchor is window.__G and NO invented aliases exist
    const hasInventedAliases = (
      typeof window.G !== 'undefined' ||
      typeof globalThis.G !== 'undefined' ||
      typeof game.G !== 'undefined' ||
      typeof game.paint !== 'undefined' ||
      typeof game.env !== 'undefined' ||
      typeof game.fx !== 'undefined'
    );

    return {
      quality: game.settings?.quality || 'high',
      hasInventedAliases,
      hasNativePaint: !!G.paint,
      hasNativeEnv: !!G.env,
      hasNativeFx: !!G.fx,
      paintSize: G.paint.size,
      shadowSize: G.env?.shadowSize,
      fxQ: G.fx?.q,
      propQ: game.props?.quality,
    };
  });

  if (initial.hasInventedAliases) {
    throw new Error('Quality integration failed: invented G / game.paint/env/fx aliases detected');
  }

  // 2. Splat ink and switch to LOW preset
  const lowSwitch = await page.evaluate(() => {
    const game = window.__inkwave;
    const G = window.__G;

    // Splat test ink if none present
    if (G.paint.counts[0] === 0 && G.paint.counts[1] === 0) {
      game.debug?.paintRandom?.(20);
    }

    const levelBefore = G.level;
    const physicsBefore = G.physics;
    const paintBefore = G.paint;
    const initialCounts = [...G.paint.counts];
    const initialTurfTotal = G.paint.turfTotal;

    // Trigger adapted _setSettings
    game._setSettings({ quality: 'low' });

    const uniforms = game.levelMat?.userData?.uniforms || game.levelMat?.uniforms;

    return {
      levelIdentityPreserved: G.level === levelBefore,
      physicsIdentityPreserved: G.physics === physicsBefore,
      paintIdentityPreserved: G.paint === paintBefore,
      countsPreserved: G.paint.counts[0] === initialCounts[0] && G.paint.counts[1] === initialCounts[1],
      turfTotalPreserved: G.paint.turfTotal === initialTurfTotal,
      paintSize: G.paint.size,
      shadowSize: G.env?.shadowSize,
      fxQ: G.fx?.q,
      propQ: game.props?.quality,
      builtQuality: game._builtQuality,
      uTexel: uniforms?.uTexel?.value,
      uAtlasSize: uniforms?.uAtlasSize?.value,
    };
  });

  if (!lowSwitch.levelIdentityPreserved || !lowSwitch.physicsIdentityPreserved || !lowSwitch.paintIdentityPreserved) {
    throw new Error('Quality integration failed: CPU object identities reset during quality switch');
  }
  if (!lowSwitch.countsPreserved || !lowSwitch.turfTotalPreserved) {
    throw new Error('Quality integration failed: authoritative CPU paint data mutated or wiped');
  }
  if (lowSwitch.paintSize !== 2048 || lowSwitch.shadowSize !== 1024 || lowSwitch.propQ !== 'low') {
    throw new Error(`Quality integration failed: expected LOW budgets (2048/1024/low), got paint=${lowSwitch.paintSize}, shadow=${lowSwitch.shadowSize}, prop=${lowSwitch.propQ}`);
  }

  // 3. Switch back to HIGH preset
  const highSwitch = await page.evaluate(() => {
    const game = window.__inkwave;
    const G = window.__G;

    const levelBefore = G.level;
    const physicsBefore = G.physics;
    const paintBefore = G.paint;

    game._setSettings({ quality: 'high' });

    const uniforms = game.levelMat?.userData?.uniforms || game.levelMat?.uniforms;

    return {
      levelIdentityPreserved: G.level === levelBefore,
      physicsIdentityPreserved: G.physics === physicsBefore,
      paintIdentityPreserved: G.paint === paintBefore,
      paintSize: G.paint.size,
      shadowSize: G.env?.shadowSize,
      fxQ: G.fx?.q,
      propQ: game.props?.quality,
      builtQuality: game._builtQuality,
      uTexel: uniforms?.uTexel?.value,
      uAtlasSize: uniforms?.uAtlasSize?.value,
    };
  });

  if (!highSwitch.levelIdentityPreserved || !highSwitch.physicsIdentityPreserved || !highSwitch.paintIdentityPreserved) {
    throw new Error('Quality integration failed: CPU object identities reset when switching back to HIGH');
  }
  if (highSwitch.paintSize !== 4096 || highSwitch.shadowSize !== 4096 || highSwitch.propQ !== 'high') {
    throw new Error(`Quality integration failed: expected HIGH budgets (4096/4096/high), got paint=${highSwitch.paintSize}, shadow=${highSwitch.shadowSize}, prop=${highSwitch.propQ}`);
  }

  // 4. Test same-layout reconciliation in _buildWorld (no full CPU reset)
  const layoutReconciliation = await page.evaluate(async () => {
    const game = window.__inkwave;
    const G = window.__G;

    const levelBefore = G.level;
    const physicsBefore = G.physics;
    const paintBefore = G.paint;

    // Change setting directly without calling _setSettings
    game.settings.quality = 'low';

    // Call _buildWorld on same layout
    await game._buildWorld(game.mapDef);

    return {
      levelIdentityPreserved: G.level === levelBefore,
      physicsIdentityPreserved: G.physics === physicsBefore,
      paintIdentityPreserved: G.paint === paintBefore,
      paintSize: G.paint.size,
      propQ: game.props?.quality,
      builtQuality: game._builtQuality,
    };
  });

  if (!layoutReconciliation.levelIdentityPreserved || !layoutReconciliation.physicsIdentityPreserved) {
    throw new Error('Quality integration failed: same-layout _buildWorld triggered full CPU reset');
  }

  return {
    status: 'passed',
    initial,
    lowSwitch,
    highSwitch,
    layoutReconciliation,
  };
}
// Lightweight browser acceptance probe for INKWAVE candidate #418: Runtime quality world resource budgets.
// Designed so parent can directly embed into existing active CI (or invoke via script)
// without requiring broad local suites or new workflow files.

export async function runQualityBrowserProbe(page) {
  // Wait for game and native G to initialize
  await page.waitForFunction(() => typeof window !== 'undefined' && window.__inkwave && window.__G && window.__G.paint, { timeout: 15000 });

  // 1. Initial State & Alias Validation
  const initial = await page.evaluate(() => {
    const game = window.__inkwave;
    const G = window.__G;

    // Verify debug anchor is window.__G and NO invented aliases exist
    const hasInventedAliases = (
      typeof window.G !== 'undefined' ||
      typeof globalThis.G !== 'undefined' ||
      typeof game.G !== 'undefined' ||
      typeof game.paint !== 'undefined' ||
      typeof game.env !== 'undefined' ||
      typeof game.fx !== 'undefined'
    );

    return {
      quality: game.settings?.quality || 'high',
      hasInventedAliases,
      hasNativePaint: !!G.paint,
      hasNativeEnv: !!G.env,
      hasNativeFx: !!G.fx,
      paintSize: G.paint.size,
      shadowSize: G.env?.shadowSize,
      fxQ: G.fx?.q,
      propQ: game.props?.quality,
    };
  });

  if (initial.hasInventedAliases) {
    throw new Error('Quality integration failed: invented G / game.paint/env/fx aliases detected');
  }

  // 2. Splat ink and switch to LOW preset
  const lowSwitch = await page.evaluate(() => {
    const game = window.__inkwave;
    const G = window.__G;

    // Splat test ink if none present
    if (G.paint.counts[0] === 0 && G.paint.counts[1] === 0) {
      game.debug?.paintRandom?.(20);
    }

    const levelBefore = G.level;
    const physicsBefore = G.physics;
    const paintBefore = G.paint;
    const initialCounts = [...G.paint.counts];
    const initialTurfTotal = G.paint.turfTotal;

    // Trigger adapted _setSettings
    game._setSettings({ quality: 'low' });

    const uniforms = game.levelMat?.userData?.uniforms || game.levelMat?.uniforms;

    return {
      levelIdentityPreserved: G.level === levelBefore,
      physicsIdentityPreserved: G.physics === physicsBefore,
      paintIdentityPreserved: G.paint === paintBefore,
      countsPreserved: G.paint.counts[0] === initialCounts[0] && G.paint.counts[1] === initialCounts[1],
      turfTotalPreserved: G.paint.turfTotal === initialTurfTotal,
      paintSize: G.paint.size,
      shadowSize: G.env?.shadowSize,
      fxQ: G.fx?.q,
      propQ: game.props?.quality,
      builtQuality: game._builtQuality,
      uTexel: uniforms?.uTexel?.value,
      uAtlasSize: uniforms?.uAtlasSize?.value,
    };
  });

  if (!lowSwitch.levelIdentityPreserved || !lowSwitch.physicsIdentityPreserved || !lowSwitch.paintIdentityPreserved) {
    throw new Error('Quality integration failed: CPU object identities reset during quality switch');
  }
  if (!lowSwitch.countsPreserved || !lowSwitch.turfTotalPreserved) {
    throw new Error('Quality integration failed: authoritative CPU paint data mutated or wiped');
  }
  if (lowSwitch.paintSize !== 2048 || lowSwitch.shadowSize !== 1024 || lowSwitch.propQ !== 'low') {
    throw new Error(`Quality integration failed: expected LOW budgets (2048/1024/low), got paint=${lowSwitch.paintSize}, shadow=${lowSwitch.shadowSize}, prop=${lowSwitch.propQ}`);
  }

  // 3. Switch back to HIGH preset
  const highSwitch = await page.evaluate(() => {
    const game = window.__inkwave;
    const G = window.__G;

    const levelBefore = G.level;
    const physicsBefore = G.physics;
    const paintBefore = G.paint;

    game._setSettings({ quality: 'high' });

    const uniforms = game.levelMat?.userData?.uniforms || game.levelMat?.uniforms;

    return {
      levelIdentityPreserved: G.level === levelBefore,
      physicsIdentityPreserved: G.physics === physicsBefore,
      paintIdentityPreserved: G.paint === paintBefore,
      paintSize: G.paint.size,
      shadowSize: G.env?.shadowSize,
      fxQ: G.fx?.q,
      propQ: game.props?.quality,
      builtQuality: game._builtQuality,
      uTexel: uniforms?.uTexel?.value,
      uAtlasSize: uniforms?.uAtlasSize?.value,
    };
  });

  if (!highSwitch.levelIdentityPreserved || !highSwitch.physicsIdentityPreserved || !highSwitch.paintIdentityPreserved) {
    throw new Error('Quality integration failed: CPU object identities reset when switching back to HIGH');
  }
  if (highSwitch.paintSize !== 4096 || highSwitch.shadowSize !== 4096 || highSwitch.propQ !== 'high') {
    throw new Error(`Quality integration failed: expected HIGH budgets (4096/4096/high), got paint=${highSwitch.paintSize}, shadow=${highSwitch.shadowSize}, prop=${highSwitch.propQ}`);
  }

  // 4. Test same-layout reconciliation in _buildWorld (no full CPU reset)
  const layoutReconciliation = await page.evaluate(async () => {
    const game = window.__inkwave;
    const G = window.__G;

    const levelBefore = G.level;
    const physicsBefore = G.physics;
    const paintBefore = G.paint;

    // Change setting directly without calling _setSettings
    game.settings.quality = 'low';

    // Call _buildWorld on same layout
    await game._buildWorld(game.mapDef);

    return {
      levelIdentityPreserved: G.level === levelBefore,
      physicsIdentityPreserved: G.physics === physicsBefore,
      paintIdentityPreserved: G.paint === paintBefore,
      paintSize: G.paint.size,
      propQ: game.props?.quality,
      builtQuality: game._builtQuality,
    };
  });

  if (!layoutReconciliation.levelIdentityPreserved || !layoutReconciliation.physicsIdentityPreserved) {
    throw new Error('Quality integration failed: same-layout _buildWorld triggered full CPU reset');
  }

  return {
    status: 'passed',
    initial,
    lowSwitch,
    highSwitch,
    layoutReconciliation,
  };
}