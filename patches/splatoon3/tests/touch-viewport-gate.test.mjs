import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { settleTouchViewport } from '../../../scripts/lib/inkwave-touch-viewport.mjs';
function pageFixture({ failResize = false, sendResize = true } = {}) {
  const listeners = new Map();
  const window = {
    addEventListener(type, fn) { const list = listeners.get(type) || []; list.push(fn); listeners.set(type, list); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(f => f !== fn)); },
  };
  const frames = [], timers = new Map(); let nextTimer = 0;
  const context = vm.createContext({ window, screen: {}, innerWidth: 320, innerHeight: 568,
    requestAnimationFrame(fn) { frames.push(fn); },
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
  });
  const page = {
    evaluate(fn) { return vm.runInContext('(' + fn.toString() + ')()', context); },
    async setViewportSize(size) {
      if (failResize) throw Error('Resize rejected');
      context.innerWidth = size.width; context.innerHeight = size.height;
      if (sendResize) page.dispatch = () => { for (const fn of listeners.get('resize') || []) fn(); };
    },
    frame() { for (const fn of frames.splice(0)) fn(); },
    timeout() { for (const fn of [...timers.values()]) fn(); },
    get pendingListeners() { return [...listeners.values()].flat().length; },
    get pendingTimers() { return timers.size; }, window,
  };
  return page;
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('viewport gate waits for a real resize plus two animation frames, not just viewport acknowledgement', async () => {
  const page = pageFixture(); let complete = false;
  const pending = settleTouchViewport(page, { width: 568, height: 320 }).then(r => { complete = true; return r; });
  await flush(); assert.equal(complete, false);
  page.dispatch(); await flush(); assert.equal(complete, false);
  page.frame(); await flush(); assert.equal(complete, false);
  page.frame(); const receipt = await pending;
  assert.deepEqual(JSON.parse(JSON.stringify(receipt)), { events: 1, frames: 2, width: 568, height: 320 });
  assert.equal(page.pendingListeners, 0); assert.equal(page.pendingTimers, 0);
  assert.equal(page.window.__inkwaveTouchViewportWait, undefined);
});
test('another native resize restarts the settlement window', async () => {
  const page = pageFixture(); let complete = false;
  const pending = settleTouchViewport(page, { width: 568, height: 320 }).then(r => { complete = true; return r; });
  await flush(); page.dispatch(); page.frame(); page.dispatch(); page.frame(); await flush();
  assert.equal(complete, false); page.frame(); assert.equal((await pending).events, 2);
});
test('missing native event and rejected viewport fail closed and clean listeners', async () => {
  const missing = pageFixture({ sendResize: false });
  const pending = settleTouchViewport(missing, { width: 568, height: 320 });
  await flush(); missing.timeout(); await assert.rejects(pending, /did not settle/);
  assert.equal(missing.pendingListeners, 0);
  const rejected = pageFixture({ failResize: true });
  await assert.rejects(settleTouchViewport(rejected, { width: 568, height: 320 }), /Resize rejected/);
  assert.equal(rejected.pendingListeners, 0); assert.equal(rejected.pendingTimers, 0);
});
