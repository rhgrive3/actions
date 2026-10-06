import assert from 'node:assert/strict';

// Restore the fixture's real lifecycle boundary even when cancellation fails.
// A cleanup error must not replace the original assertion failure.
export async function runFocusLossCase(page, entry) {
  let failure;
  try {
    await page.evaluate(() => { mobile.jumpTarget = 2; window.dispatchEvent(new Event('blur')); });
    assert.deepEqual(await page.evaluate(() => ({ edges: [...mobile.pressed], target: mobile.jumpTarget, look: [mobile.lookDX, mobile.lookDY] })),
      { edges: [], target: -1, look: [0, 0] });
    await page.evaluate(() => advance(1 / 60));
    assert.equal(await page.evaluate(() => intents.at(-1).fire), false);
    entry.checks.push('focus-loss-cancels-pending-touch-action-and-jump-target');
  } catch (error) {
    failure = error; throw error;
  } finally {
    try { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); }
    catch (error) {
      if (failure) throw new AggregateError([failure, error], 'Blur verification and focus cleanup both failed', { cause: failure });
      throw error;
    }
  }
}
