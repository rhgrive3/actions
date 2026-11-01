// Screenshot work must not charge GPU/compositor stalls to an online player's
// simulation-debt budget. Use the existing audit clock boundary, never relax
// production recovery or replace the current match during cleanup.
export async function withFrozenRankedCapture(pages, capture) {
  const states = [];
  let failed = false, failure, result;
  try {
    for (const page of pages) {
      const handle = await page.evaluateHandle(() => {
        const G = globalThis.RG;
        if (!G?.game || !G.match?.ranked || G.match.attract)
          throw new Error('Ranked capture requires the current ranked match');
        return { game: G.game, match: G.match, net: G.netm, frozen: G.game.frozen };
      });
      states.push(handle);
      await handle.evaluate(s => {
        if (globalThis.RG.game !== s.game || globalThis.RG.match !== s.match || globalThis.RG.netm !== s.net)
          throw new Error('Ranked capture ownership changed before freeze');
        s.game.debug.freeze();
      });
    }
    result = await capture();
  } catch (error) { failed = true; failure = error; }
  finally {
    for (const handle of states.reverse()) {
      try {
        await handle.evaluate(s => {
          if (globalThis.RG.game !== s.game || globalThis.RG.match !== s.match || globalThis.RG.netm !== s.net)
            throw new Error('Ranked capture ownership changed during screenshot');
          if (s.frozen) s.game.debug.freeze(); else s.game.debug.unfreeze();
        });
      } catch (error) { if (!failed) { failed = true; failure = error; } }
      finally {
        try { await handle.dispose(); }
        catch (error) { if (!failed) { failed = true; failure = error; } }
      }
    }
  }
  if (failed) throw failure;
  return result;
}
