import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { settleTouchViewport } from '../../../scripts/lib/inkwave-touch-viewport.mjs';
import { createTouchRelayout } from '../../local-quality/touch-relayout.mjs';
function pageFixture({ failResize = false, sendResize = true } = {}) {
  const listeners = new Map();
  const window = {
    addEventListener(type, fn) { const list = listeners.get(type) || []; list.push(fn); listeners.set(type, list); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(f => f !== fn)); },
  };
  const frames = new Map(), timers = new Map(); let nextTimer = 0, nextFrame = 0;
  const context = vm.createContext({ window, screen: {}, innerWidth: 320, innerHeight: 568,
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
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
    frame() { const queued = [...frames.values()]; frames.clear(); for (const fn of queued) fn(); },
    timeout() { for (const fn of [...timers.values()]) fn(); },
    get pendingListeners() { return [...listeners.values()].flat().length; },
    get pendingTimers() { return timers.size; }, window, context,
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

const browserSource = fs.readFileSync(new URL('../../../scripts/check-inkwave-touch-layout.mjs', import.meta.url), 'utf8');
const setupResize = browserSource.match(/if \(name === 'small-phone-portrait'\) await [^\n]+/)[0];
const rotationResize = browserSource.match(/await (?:page\.setViewportSize|settleTouchViewport)\([^\n]*beforeRotation\.height[^\n]+/)[0];
const runResize = (source, page, name = 'small-phone-portrait') => vm.runInNewContext(
  `(async () => { ${source} })()`, { page, name, beforeRotation: page.viewportSize(), settleTouchViewport });

function installProductionEditor(page) {
  class MobileInput {
    constructor() {
      this._abort = new AbortController(); this._destroyed = false;
      this._stick = { active: false, id: -1 }; this._stickHome = { x: 0, y: 0 }; this._stickR = 20;
      this._edit = null; this.editing = false; this.layout = { fire: { s: 1.2 } };
      this.gyro = { resync() {} }; this.layouts = 0;
    }
    resetPointers() { this._stick.id = -1; }
    _layoutAll() { this.layouts++; }
    _hitButton() { return null; }
  }
  // Execute the real editor gesture and reset methods, rather than simulating
  // the cancellation that this barrier must observe without suppressing it.
  const install = vm.runInNewContext(fs.readFileSync(new URL('../../touch-layout/mobile.js', import.meta.url), 'utf8') + '\ninstallTouchLayout;');
  install(MobileInput, {});
  const mobile = new MobileInput();
  const relayout = createTouchRelayout(mobile, page.context);
  page.window.addEventListener('resize', relayout);
  page.viewportSize = () => ({ width: page.context.innerWidth, height: page.context.innerHeight });
  return mobile;
}
const editDown = (mobile, id) => mobile._editDown({ pointerId: id, clientX: 200, clientY: 150, target: {} });

test('browser setup and repeated rotation await native events while real editor cancellation remains intact', async () => {
  const page = pageFixture(), mobile = installProductionEditor(page), draft = mobile.layout;
  let ready = false;
  const setup = runResize(setupResize, page).then(() => { ready = true; });
  await flush(); assert.equal(ready, false, 'Setup must not continue on viewport acknowledgement');
  page.frame(); page.frame(); await flush(); assert.equal(ready, false, 'Frames without a native event are not settlement');
  page.dispatch(); page.frame(); page.frame(); await setup;
  assert.equal(mobile.layouts, 1);

  mobile.editing = true;
  for (const id of [81, 82, 83]) {
    editDown(mobile, id); assert.equal(mobile._edit.pts.size, 1);
    ready = false;
    const rotation = runResize(rotationResize, page).then(() => { ready = true; });
    await flush(); assert.equal(ready, false, 'Rotation must await its own native event');
    assert.equal(mobile._edit.pts.size, 1, 'Barrier must not clear the gesture itself');
    page.dispatch(); assert.equal(mobile._edit, null, 'Real production resize cancels the active gesture');
    assert.equal(mobile.editing, true); assert.equal(mobile.layout, draft);
    page.frame(); page.dispatch(); page.frame(); await flush();
    assert.equal(ready, false, 'Repeated native events restart settlement');
    page.frame(); await rotation;
    assert.equal(page.pendingListeners, 1, 'Only the production listener remains');
    assert.equal(page.pendingTimers, 0); assert.equal(page.window.__inkwaveTouchViewportWait, undefined);
    editDown(mobile, id + 100); assert.equal(mobile._edit.pts.size, 1, 'A fresh gesture works after rotation');
    mobile._editUp({ pointerId: id + 100, type: 'pointercancel' });
    assert.equal(mobile._edit.pts.size, 0); assert.equal(mobile._edit.pinch, null); assert.equal(mobile._edit.drag, null);
  }
});

test('unrelated landscape cases keep their viewport and the browser retains strict gesture and bounds assertions', async () => {
  const page = pageFixture(); page.viewportSize = () => ({ width: 844, height: 390 });
  page.setViewportSize = () => { throw Error('Unexpected landscape resize'); };
  await runResize(setupResize, page, 'phone-landscape');
  await runResize(setupResize, page, 'tablet-landscape');
  assert.equal(page.pendingListeners, 0);
  assert.match(browserSource, /import \{ settleTouchViewport \} from '\.\/lib\/inkwave-touch-viewport\.mjs'/);
  assert.doesNotMatch(browserSource, /page\.setViewportSize\(/);
  assert.match(browserSource, /assert.equal\(await page.evaluate\(\(\) => mobile\._edit\?\.pts.size\), 1\)/);
  assert.match(browserSource, /await page.waitForFunction\(\(\) => mobile\._edit === null && mobile\._H === Math.max/);
  assert.match(browserSource, /for \(const b of bounds\) assert\(b.x - b.d \/ 2 >= 0/);
});

test('interrupted settlement fails closed, rejects overlap, and permits a fresh independent rotation', async () => {
  const page = pageFixture();
  const interrupted = settleTouchViewport(page, { width: 568, height: 320 });
  await flush();
  await assert.rejects(settleTouchViewport(page, { width: 320, height: 568 }), /already pending/);
  page.dispatch(); page.frame(); page.timeout();
  await assert.rejects(interrupted, /did not settle/);
  assert.equal(page.pendingListeners, 0); assert.equal(page.pendingTimers, 0);
  assert.equal(page.window.__inkwaveTouchViewportWait, undefined);

  let ready = false;
  const retry = settleTouchViewport(page, { width: 320, height: 568 }).then(result => { ready = true; return result; });
  await flush(); page.frame(); await flush();
  assert.equal(ready, false, 'Stale frames from the interrupted wait cannot satisfy the next one');
  page.dispatch(); page.frame(); page.frame();
  const result = await retry; assert.equal(result.events, 1); assert.equal(result.width, 320); assert.equal(result.height, 568);
  assert.equal(page.pendingListeners, 0); assert.equal(page.pendingTimers, 0);
});
