// scripts/inkwave-touch-transition-cases.mjs
// Adversarial real built-Input / MobileInput browser regression cases for:
// - #389: First touch swallowed after keyboard/gamepad use while controls reactivate
// - #288: Same-orientation viewport resize cancels active touch holds until retouch
//
// Invariants verified:
// 1. First touch transition from kbm and pad targeting real canvas under hidden overlay
//    (do not directly target overlay). Activates FIRE, JUMP, look, stick, followed by
//    subsequent move, up, and cancel.
// 2. No duplicate edge on already-visible overlay with instrumented _down/_press router calls.
// 3. Reject noncanvas menu/HUD targets and hidden gameplay controls.
// 4. Same-angle actual viewport resize and resize storm holding FIRE, stick, and look.
// 5. Fixed-stick same-coordinate movement after same-angle viewport relayout.
// 6. Portrait rejects gameplay; fixed-angle aspect recovery requires a fresh touch without gyro resync.
// 7. True rotation clears all old ownership.
// 8. Native lostpointercapture cleanup of holds, edges, and tracked pointers.
// 9. Repeated transitions and cleanup after destroy.
//
// Execution engines:
// - Chromium: native CDP touch events ('native-CDP-touch')
// - WebKit: DOM hit-tested PointerEvents ('DOM-PointerEvent')

import assert from 'node:assert/strict';

// Cleanup all acquired browser input even if an assertion or one cleanup fails.
export async function withBrowserCleanup(operation, cleanups) {
  let failed = false, primaryError;
  try { return await operation(); }
  catch (error) { failed = true; primaryError = error; throw error; }
  finally {
    const failures = [];
    for (const cleanup of cleanups) {
      try { await cleanup(); } catch (error) { failures.push(error); }
    }
    if (failures.length) {
      if (failed) throw new AggregateError([primaryError, ...failures],
        'Browser cleanup failed after the original case', { cause: primaryError });
      if (failures.length === 1) throw failures[0];
      throw new AggregateError(failures, 'Multiple browser cleanup operations failed');
    }
  }
}
export function withWindowFocusRestored(operation, restoreFocus) {
  return withBrowserCleanup(operation, [restoreFocus]);
}

// A completed native-CDP sequence must never receive a second touchEnd.
export function trackTouchSequence(gesture) {
  let active = false;
  const sequence = {
    get active() { return active; },
    async send(type, points) {
      if ((type === 'touchMove' || type === 'touchEnd' || type === 'touchCancel') && !active)
        throw new Error('Touch sequence requires touchStart before ' + type);
      await gesture(type, points);
      if (type === 'touchStart' || type === 'touchEnd' || type === 'touchCancel')
        active = type !== 'touchCancel' && points.length > 0;
    },
    async finish(primaryError = null) {
      if (!active) return;
      try { await sequence.send('touchEnd', []); }
      catch (cleanupError) {
        if (primaryError) throw new AggregateError([primaryError, cleanupError],
          'Touch cleanup failed after: ' + primaryError.message, { cause: primaryError });
        throw cleanupError;
      }
    },
  };
  return sequence;
}

export function assertHybridKeyboardMapReceipt(r) {
  assert.equal(r.before.ptrIds.length, 1, 'native FIRE owns one pointer before keyboard input');
  assert.equal(r.before.fire, true);
  assert.deepEqual(r.held.ptrIds, r.before.ptrIds, 'the same physical touch remains owned');
  assert.equal(r.held.owner, 'touch'); assert.equal(r.held.navigation, 'touch');
  assert.equal(r.held.fire, true); assert.equal(r.held.intentFire, true); assert.equal(r.held.moving, true);
  assert.equal(r.fresh.owner, 'kbm'); assert.equal(r.fresh.navigation, 'kbm');
  assert.equal(r.fresh.ptrIds.length, 0); assert.equal(r.fresh.fire, false); assert.equal(r.fresh.intentFire, false);
  assert.deepEqual(r.mapOpened, { mapOpen: true, button: true, classOn: true, held: true });
  assert.deepEqual(r.mapClosed, { mapOpen: false, button: false, classOn: false, held: false, owner: 'kbm', navigation: 'kbm' });
}

export async function runHybridKeyboardMapCases({ page, gesture, entry }) {
  const sequence = trackTouchSequence(gesture), keys = new Set();
  const receipt = entry.hybridKeyboardMap = {};
  const down = async key => { keys.add(key); await page.keyboard.down(key); };
  const up = async key => { if (keys.has(key)) { await page.keyboard.up(key); keys.delete(key); } };
  const reset = () => page.evaluate(() => {
    input.keys.clear(); input.pressed.clear(); input.padPressed.clear();
    input.mouse.left = input.mouse.right = input.mouse.leftPressed = input.mouse.rightPressed = false;
    input.mouse.dx = input.mouse.dy = 0;
    input.lastDevice = 'touch'; mobile.reset(); mobile.setVisible(true);
    mobile.layout = {}; mobile._layoutAll();
    controller.enabled = true; controller.navigationEnabled = true;
    controller.menuBlocked = controller.orientationBlocked = false;
    controller.clearRespawnNavigation?.(); controller.clearMapGyro?.();
    controller.padMapOpen = controller.mapHeld = false; rig.mapK = 0;
  });
  const snapshot = () => page.evaluate(() => ({
    ptrIds: [...mobile._ptr.keys()], owner: input.lastDevice, navigation: input.navigationDevice,
    fire: mobile.down('fire'), intentFire: !!controller.a.intent.fire,
    moving: controller.a.intent.move.length() > 0,
  }));
  await withBrowserCleanup(async () => {
    await reset();
    const fire = await page.evaluate(() => mobile._box('fire'));
    await sequence.send('touchStart', [{ id: 917, x: fire.x, y: fire.y }]);
    const before = receipt.before = await snapshot();
    await down('w'); await page.evaluate(() => controller.update(1 / 60));
    const held = receipt.held = await snapshot();
    await page.evaluate(() => input.endFrame());
    await sequence.send('touchEnd', []); await up('w');
    await down('d'); await page.evaluate(() => controller.update(1 / 60));
    const fresh = receipt.fresh = await snapshot(); await page.evaluate(() => input.endFrame()); await up('d');
    await reset();
    await page.locator('[data-c="map"]').tap();
    const mapOpened = receipt.mapOpened = await page.evaluate(() => {
      controller.update(1 / 60);
      return { mapOpen: mobile.mapOpen, button: mobile.buttons.map,
        classOn: mobile.root.classList.contains('is-map'), held: controller.mapHeld };
    });
    await down('w');
    const mapClosed = receipt.mapClosed = await page.evaluate(() => {
      controller.update(1 / 60);
      return { mapOpen: mobile.mapOpen, button: mobile.buttons.map,
        classOn: mobile.root.classList.contains('is-map'), held: controller.mapHeld,
        owner: input.lastDevice, navigation: input.navigationDevice };
    });
    assertHybridKeyboardMapReceipt(receipt);
    entry.checks.push('native-touch-fire-with-keyboard-preserves-contact-and-fresh-takeover');
    entry.checks.push('native-touch-map-latch-closes-on-fresh-keyboard-input');
  }, [() => sequence.finish(), () => up('w'), () => up('d'), reset]);
}

export function assertPortraitAspectTransition({ portrait, landscape, fresh, released }) {
  for (const [phase, value] of [['portrait', portrait], ['landscape stale gesture', landscape], ['released', released]]) {
    assert.equal(value.fireDown, false, phase + ' must not hold FIRE');
    assert.equal(value.fireEdge, false, phase + ' must not retain a FIRE edge');
    assert.equal(value.ptrSize, 0, phase + ' must not retain pointer ownership');
    assert.equal(value.stickActive, false, phase + ' must not retain movement');
  }
  assert.equal(fresh.fireDown, true, 'Fresh landscape touch must restore FIRE');
  assert.equal(fresh.fireEdge, true, 'Fresh landscape touch must deliver its real press edge');
  assert.equal(fresh.ptrSize, 1, 'Fresh landscape touch must have exactly one pointer owner');
  for (const value of [landscape, fresh, released]) assert.equal(value.resyncCalls, 0, 'Fixed-angle aspect change must not resync gyro');
}

/**
 * Execute the complete suite of touch transition and resize regression checks
 * on the provided Playwright page and context.
 */
export async function runTouchTransitionCases({
  page,
  context,
  cdp,
  engineName,
  gesture,
  entry,
  report,
  negativeControl = false,
}) {
  const evidenceClass = engineName === 'chromium' ? 'native-CDP-touch' : 'DOM-PointerEvent';

  const resetMobileState = async () => {
    await page.evaluate(() => {
      if (!window.mobile || !window.input) return;
      input.lastDevice = 'touch';
      mobile.reset();
      mobile.layout = {};
      mobile.s.stickMode = 'float';
      mobile.s.fireAim = true;
      mobile.setVisible(true);
      mobile._layoutAll();
      if (window.sim?.s3Clock?.reset) sim.s3Clock.reset();
      if (window.intents) intents.length = 0;
    });
  };

  const setDevice = async (device) => {
    return await page.evaluate((dev) => {
      input.lastDevice = dev;
      const overlay = document.getElementById('iw-mobile-controls');
      return {
        lastDevice: input.lastDevice,
        overlayActive: !!overlay?.classList.contains('is-active'),
      };
    }, device);
  };

  const getBoxes = async () => {
    return await page.evaluate(() => {
      const f = mobile._box('fire');
      const j = mobile._box('jump');
      return {
        fire: { x: Math.round(f.x), y: Math.round(f.y) },
        jump: { x: Math.round(j.x), y: Math.round(j.y) },
      };
    });
  };

  const setViewport = async (w, h) => {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await new Promise(r => setTimeout(r, 60));
  };

  // =========================================================================
  // NEGATIVE CONTROL PATH: Explicit baseline failure verification
  // =========================================================================
  if (negativeControl) {
    const baselineResults = {};

    // 1. Verify #389 on baseline: first touch from KBM is swallowed
    await resetMobileState();
    await setDevice('kbm');
    const boxes = await getBoxes();
    const fireBox = boxes.fire;

    // Verify hit target is canvas
    const hitPre = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return { id: el?.id, isCanvas: el === document.getElementById('game') };
    }, fireBox);
    assert(hitPre.isCanvas, 'Baseline hit target under hidden overlay must be canvas');

    await gesture('touchStart', [{ id: 101, x: fireBox.x, y: fireBox.y }]);
    const firstTouchKbm = await page.evaluate(() => ({
      lastDevice: input.lastDevice,
      overlayActive: !!document.getElementById('iw-mobile-controls')?.classList.contains('is-active'),
      fireDown: !!mobile.buttons?.fire || mobile.down('fire'),
      ptrSize: mobile._ptr.size,
    }));
    await gesture('touchEnd', []);

    baselineResults.kbmFirstTouchSwallowed = (firstTouchKbm.lastDevice === 'touch') && (!firstTouchKbm.fireDown) && (firstTouchKbm.ptrSize === 0);
    assert(baselineResults.kbmFirstTouchSwallowed, 'Negative control: baseline must swallow first touch from kbm (#389)');
    entry.checks.push('negative-control-baseline-swallows-first-touch-from-kbm');

    // 2. Verify #389 on baseline from PAD
    await resetMobileState();
    await setDevice('pad');
    await gesture('touchStart', [{ id: 102, x: boxes.jump.x, y: boxes.jump.y }]);
    const firstTouchPad = await page.evaluate(() => ({
      lastDevice: input.lastDevice,
      jumpDown: !!mobile.buttons?.jump || mobile.down('jump'),
      ptrSize: mobile._ptr.size,
    }));
    await gesture('touchEnd', []);

    baselineResults.padFirstTouchSwallowed = (firstTouchPad.lastDevice === 'touch') && (!firstTouchPad.jumpDown) && (firstTouchPad.ptrSize === 0);
    assert(baselineResults.padFirstTouchSwallowed, 'Negative control: baseline must swallow first touch from pad (#389)');
    entry.checks.push('negative-control-baseline-swallows-first-touch-from-pad');

    // 3. Verify #288 on baseline: same-orientation resize cancels active holds
    await resetMobileState();
    await setDevice('touch');
    await setViewport(1024, 768);

    // Hold FIRE and Stick
    await gesture('touchStart', [
      { id: 201, x: fireBox.x, y: fireBox.y },
      { id: 202, x: 180, y: 460 },
    ]);
    const preResize = await page.evaluate(() => ({
      fireDown: mobile.down('fire'),
      stickActive: mobile._stick.active,
      ptrSize: mobile._ptr.size,
    }));
    assert(preResize.fireDown && preResize.stickActive, 'Holds established before resize');

    // Trigger same-orientation viewport resize
    await setViewport(1024, 720);
    const postResize = await page.evaluate(() => ({
      fireDown: mobile.down('fire'),
      stickActive: mobile._stick.active,
      ptrSize: mobile._ptr.size,
    }));
    await gesture('touchEnd', []);
    await setViewport(1024, 768);

    baselineResults.resizeCancelsHolds = (!postResize.fireDown) && (!postResize.stickActive) && (postResize.ptrSize === 0);
    assert(baselineResults.resizeCancelsHolds, 'Negative control: baseline must cancel active holds on resize (#288)');
    entry.checks.push('negative-control-baseline-cancels-active-holds-on-resize');

    if (report) {
      report.negativeControl = {
        engine: engineName,
        evidenceClass,
        baselineResults,
        verified: true,
      };
    }
    return { status: 'negative-control-verified', engineName, evidenceClass, baselineResults };
  }

  // =========================================================================
  // 1. FIRST TOUCH FROM KBM -> FIRE (Canvas hit target under hidden overlay)
  // =========================================================================
  await resetMobileState();
  let devState = await setDevice('kbm');
  assert.equal(devState.lastDevice, 'kbm');
  assert.equal(devState.overlayActive, false, 'Overlay must be inactive in KBM mode');

  const boxes = await getBoxes();
  const fireBox = boxes.fire;

  // Verify hit target at fireBox coordinates is canvas (not the hidden overlay)
  const hitPreFire = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return { id: el?.id, tag: el?.tagName?.toLowerCase() };
  }, fireBox);
  assert.equal(hitPreFire.id, 'game', 'Hit target at fire button coords while overlay is hidden must be the canvas');

  // Dispatch touchStart targeting fire button coordinates
  await gesture('touchStart', [{ id: 10, x: fireBox.x, y: fireBox.y }]);

  const afterFirstTouchFire = await page.evaluate(() => ({
    lastDevice: input.lastDevice,
    overlayActive: !!document.getElementById('iw-mobile-controls')?.classList.contains('is-active'),
    fireDown: !!mobile.buttons?.fire || mobile.down('fire'),
    firePressed: mobile.pressed.has('fire'),
    ptrSize: mobile._ptr.size,
  }));

  assert.equal(afterFirstTouchFire.lastDevice, 'touch', 'Device must switch to touch on pointerdown');
  assert.equal(afterFirstTouchFire.overlayActive, true, 'Overlay must reactivate on touch');
  assert(afterFirstTouchFire.fireDown, 'First touch from KBM must activate FIRE button on first contact');

  // Subsequent move: drag FIRE button with fireAim enabled -> verify aiming
  await gesture('touchMove', [{ id: 10, x: fireBox.x - 70, y: fireBox.y - 30 }]);
  const fireAimState = await page.evaluate(() => ({
    lookDX: mobile.lookDX,
    fireDown: mobile.down('fire'),
  }));
  assert(fireAimState.fireDown, 'FIRE hold preserved during drag');
  assert(fireAimState.lookDX < 0, 'Dragging held FIRE button produces look aiming');

  // Subsequent up: release FIRE button
  await gesture('touchEnd', []);
  const afterFireRelease = await page.evaluate(() => ({
    fireDown: mobile.down('fire'),
    ptrSize: mobile._ptr.size,
  }));
  assert.equal(afterFireRelease.fireDown, false, 'FIRE released on pointerup');
  assert.equal(afterFireRelease.ptrSize, 0, 'All pointers released after FIRE pointerup');
  entry.checks.push('first-touch-canvas-from-kbm-activates-fire-with-subsequent-aim-and-release');

  // =========================================================================
  // 2. FIRST TOUCH FROM PAD -> JUMP (Canvas hit target under hidden overlay)
  // =========================================================================
  await resetMobileState();
  devState = await setDevice('pad');
  assert.equal(devState.lastDevice, 'pad');
  assert.equal(devState.overlayActive, false, 'Overlay must be inactive in gamepad mode');

  const jumpBox = boxes.jump;
  const hitPreJump = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return { id: el?.id, tag: el?.tagName?.toLowerCase() };
  }, jumpBox);
  assert.equal(hitPreJump.id, 'game', 'Hit target at jump button coords while overlay is hidden must be the canvas');

  await gesture('touchStart', [{ id: 11, x: jumpBox.x, y: jumpBox.y }]);
  const afterFirstTouchJump = await page.evaluate(() => ({
    lastDevice: input.lastDevice,
    overlayActive: !!document.getElementById('iw-mobile-controls')?.classList.contains('is-active'),
    jumpDown: !!mobile.buttons?.jump || mobile.down('jump'),
    jumpPressed: mobile.pressed.has('jump'),
    ptrSize: mobile._ptr.size,
  }));
  assert.equal(afterFirstTouchJump.lastDevice, 'touch', 'Device must switch to touch from pad');
  assert(afterFirstTouchJump.jumpDown, 'First touch from PAD must activate JUMP button immediately');

  await gesture('touchEnd', []);
  const afterJumpRelease = await page.evaluate(() => ({
    jumpDown: mobile.down('jump'),
    ptrSize: mobile._ptr.size,
  }));
  assert.equal(afterJumpRelease.jumpDown, false, 'JUMP released on pointerup');
  assert.equal(afterJumpRelease.ptrSize, 0);
  entry.checks.push('first-touch-canvas-from-pad-activates-jump-and-release');

  // =========================================================================
  // 3. FIRST TOUCH FROM KBM -> STICK (Movement zone under hidden overlay)
  // =========================================================================
  await resetMobileState();
  await setDevice('kbm');

  // Left stick floating zone (x < W * 0.42)
  const stickStart = { x: 180, y: 460 };
  await gesture('touchStart', [{ id: 12, x: stickStart.x, y: stickStart.y }]);

  const afterFirstTouchStick = await page.evaluate(() => ({
    lastDevice: input.lastDevice,
    stickId: mobile._stick.id,
    stickActive: mobile._stick.active,
  }));
  assert.equal(afterFirstTouchStick.lastDevice, 'touch');
  assert(afterFirstTouchStick.stickActive, 'First touch from KBM in move zone must activate movement stick');
  assert(afterFirstTouchStick.stickId >= 0, 'Stick assigned valid pointerId');

  // Subsequent move: drag stick to produce deflection
  await gesture('touchMove', [{ id: 12, x: stickStart.x + 50, y: stickStart.y - 40 }]);
  const stickMoveState = await page.evaluate(() => ({
    moveX: mobile.moveX,
    moveY: mobile.moveY,
    stickActive: mobile._stick.active,
  }));
  assert(stickMoveState.stickActive);
  assert(Math.hypot(stickMoveState.moveX, stickMoveState.moveY) > 0, 'Stick move produces non-zero velocity');

  await gesture('touchEnd', []);
  const stickEndState = await page.evaluate(() => ({
    stickActive: mobile._stick.active,
    moveX: mobile.moveX,
    moveY: mobile.moveY,
  }));
  assert.equal(stickEndState.stickActive, false, 'Stick inactive after release');
  assert.equal(stickEndState.moveX, 0);
  assert.equal(stickEndState.moveY, 0);
  entry.checks.push('first-touch-canvas-from-kbm-activates-stick-with-subsequent-move-and-release');

  // =========================================================================
  // 4. FIRST TOUCH FROM PAD -> LOOK (Right half zone under hidden overlay)
  // =========================================================================
  await resetMobileState();
  await setDevice('pad');

  const lookStart = { x: 760, y: 320 };
  await gesture('touchStart', [{ id: 13, x: lookStart.x, y: lookStart.y }]);

  const afterFirstTouchLook = await page.evaluate(() => {
    const looks = [...mobile._ptr.values()].filter(p => p.kind === 'look');
    return {
      lastDevice: input.lastDevice,
      hasLook: looks.length > 0,
      lookCount: looks.length,
    };
  });
  assert.equal(afterFirstTouchLook.lastDevice, 'touch');
  assert(afterFirstTouchLook.hasLook, 'Right-half first touch assigned look kind');

  // Subsequent move: drag look
  await gesture('touchMove', [{ id: 13, x: lookStart.x - 60, y: lookStart.y + 20 }]);
  const lookMoveState = await page.evaluate(() => [mobile.lookDX, mobile.lookDY]);
  assert(lookMoveState[0] < 0, 'Look drag updates lookDX deltas');

  // Subsequent cancel: cancel touch
  await gesture('touchCancel', []);
  await page.waitForFunction(() => mobile._ptr.size === 0);
  const lookCancelState = await page.evaluate(() => ({
    ptrSize: mobile._ptr.size,
    lookDX: mobile.lookDX,
  }));
  assert.equal(lookCancelState.ptrSize, 0, 'Look pointer removed on cancel');
  entry.checks.push('first-touch-canvas-from-pad-activates-look-with-subsequent-drag-and-cancel');

  // =========================================================================
  // 5. NO DUPLICATE EDGE ON ALREADY-VISIBLE OVERLAY
  // =========================================================================
  await resetMobileState();
  await setDevice('touch');
  const activeOverlayState = await page.evaluate(() => ({
    overlayActive: !!document.getElementById('iw-mobile-controls')?.classList.contains('is-active'),
  }));
  assert(activeOverlayState.overlayActive, 'Overlay must be active before test');

  // Instrument actual mobile._down and mobile._press call counts before visible-overlay test
  await page.evaluate(() => {
    window._testSpies = {
      origDown: mobile._down,
      origPress: mobile._press,
      downCalls: 0,
      pressCalls: 0,
    };
    mobile._down = function(...args) {
      window._testSpies.downCalls++;
      return window._testSpies.origDown.apply(this, args);
    };
    mobile._press = function(...args) {
      window._testSpies.pressCalls++;
      return window._testSpies.origPress.apply(this, args);
    };
  });

  try {
    // Touch visible FIRE button
    await gesture('touchStart', [{ id: 14, x: fireBox.x, y: fireBox.y }]);
    const visibleEdgeState = await page.evaluate(() => {
      const spies = window._testSpies || {};
      return {
        downCalls: spies.downCalls ?? 0,
        pressCalls: spies.pressCalls ?? 0,
        fireDown: mobile.down('fire'),
        pressedEdges: [...mobile.pressed].filter(e => e === 'fire').length,
        pendingEdgesSize: mobile._pendingEdges?.size ?? 0,
        ptrSize: mobile._ptr.size,
      };
    });

    // Assert exactly one original router execution, plus _pendingEdges.size == 1
    assert.equal(visibleEdgeState.downCalls, 1, 'Exactly one mobile._down router call');
    assert.equal(visibleEdgeState.pressCalls, 1, 'Exactly one mobile._press call');
    assert.equal(visibleEdgeState.pendingEdgesSize, 1, '_pendingEdges.size must equal 1');
    assert(visibleEdgeState.fireDown, 'FIRE button is held down');
    assert.equal(visibleEdgeState.pressedEdges, 1, 'Exactly one fire edge registered on visible overlay');
    assert.equal(visibleEdgeState.ptrSize, 1, 'Exactly one active pointer in _ptr');
  } finally {
    // Restore spies after checks
    await page.evaluate(() => {
      if (window._testSpies) {
        mobile._down = window._testSpies.origDown;
        mobile._press = window._testSpies.origPress;
        delete window._testSpies;
      }
    });
    await gesture('touchEnd', []);
  }
  entry.checks.push('visible-overlay-touch-does-not-duplicate-edges');

  // =========================================================================
  // 6. REJECT NONCANVAS TARGETS (Menu/HUD) & HIDDEN GAMEPLAY CONTROLS
  // =========================================================================
  await resetMobileState();
  await setDevice('kbm');

  // Hit test noncanvas UI menu item (positioned at top left: 10, 10 to 130, 50)
  const menuHit = await page.evaluate(() => {
    const el = document.elementFromPoint(50, 25);
    return { id: el?.id, className: el?.className, isCanvas: el === document.getElementById('game') };
  });
  assert.equal(menuHit.isCanvas, false, 'Menu item must be a noncanvas element');
  assert.equal(menuHit.id, 'test-menu-target');

  // Touch on the menu element
  await gesture('touchStart', [{ id: 15, x: 50, y: 25 }]);
  const noncanvasTouchState = await page.evaluate(() => ({
    fireDown: mobile.down('fire'),
    stickActive: mobile._stick.active,
    ptrSize: mobile._ptr.size,
  }));
  assert.equal(noncanvasTouchState.fireDown, false, 'Noncanvas menu touch must not activate fire');
  assert.equal(noncanvasTouchState.stickActive, false, 'Noncanvas menu touch must not activate stick');
  assert.equal(noncanvasTouchState.ptrSize, 0, 'Noncanvas menu touch must not capture mobile pointers');
  await gesture('touchEnd', []);

  // Hidden gameplay controls: mobile.setVisible(false)
  await page.evaluate(() => mobile.setVisible(false));
  await gesture('touchStart', [{ id: 16, x: fireBox.x, y: fireBox.y }]);
  const hiddenControlsState = await page.evaluate(() => ({
    fireDown: mobile.down('fire'),
    ptrSize: mobile._ptr.size,
  }));
  assert.equal(hiddenControlsState.fireDown, false, 'Hidden gameplay controls must reject canvas touches');
  assert.equal(hiddenControlsState.ptrSize, 0);
  await gesture('touchEnd', []);
  await page.evaluate(() => mobile.setVisible(true));
  entry.checks.push('reject-noncanvas-menu-hud-targets-and-hidden-gameplay-controls');

  // =========================================================================
  // 7. SAME-ANGLE VIEWPORT RESIZE & RESIZE STORM HOLDING FIRE, STICK, LOOK (#288)
  // =========================================================================
  await resetMobileState();
  await setViewport(1024, 768);

  // Hold FIRE (id 21), Stick (id 22), Look (id 23) simultaneously
  await gesture('touchStart', [
    { id: 21, x: fireBox.x, y: fireBox.y },
    { id: 22, x: 180, y: 460 },
    { id: 23, x: 760, y: 320 },
  ]);
  // Deflect stick
  await gesture('touchMove', [
    { id: 21, x: fireBox.x, y: fireBox.y },
    { id: 22, x: 230, y: 440 },
    { id: 23, x: 760, y: 320 },
  ]);

  const preResizeHolds = await page.evaluate(() => ({
    fireDown: mobile.down('fire'),
    stickActive: mobile._stick.active,
    moveMag: Math.hypot(mobile.moveX, mobile.moveY),
    hasLook: [...mobile._ptr.values()].some(p => p.kind === 'look'),
    ptrCount: mobile._ptr.size,
  }));
  assert(preResizeHolds.fireDown, 'FIRE held before resize');
  assert(preResizeHolds.stickActive, 'Stick active before resize');
  assert(preResizeHolds.moveMag > 0, 'Stick deflected before resize');
  assert(preResizeHolds.hasLook, 'Look pointer tracked before resize');

  // Perform same-angle viewport resize (height changes, orientation angle remains 0)
  await setViewport(1024, 720);

  // Perform resize storm: 5 rapid consecutive resize updates
  const stormHeights = [710, 735, 705, 725, 720];
  for (const h of stormHeights) {
    await page.setViewportSize({ width: 1024, height: h });
    await page.evaluate(() => { window.dispatchEvent(new Event('resize')); });
  }
  await new Promise(r => setTimeout(r, 60));

  // Check holds immediately after resize storm
  const postStormHolds = await page.evaluate(() => ({
    fireDown: mobile.down('fire'),
    stickActive: mobile._stick.active,
    moveMag: Math.hypot(mobile.moveX, mobile.moveY),
    hasLook: [...mobile._ptr.values()].some(p => p.kind === 'look'),
    ptrCount: mobile._ptr.size,
  }));

  assert(postStormHolds.fireDown, 'FIRE hold MUST survive same-angle viewport resize and storm (#288)');
  assert(postStormHolds.stickActive, 'Stick hold MUST survive same-angle viewport resize and storm (#288)');
  assert(postStormHolds.hasLook, 'Look pointer MUST survive same-angle viewport resize and storm (#288)');

  // Subsequent move after resize: continue moving stick and look
  await gesture('touchMove', [
    { id: 21, x: fireBox.x, y: fireBox.y },
    { id: 22, x: 240, y: 430 },
    { id: 23, x: 700, y: 330 },
  ]);

  const moveAfterResize = await page.evaluate(() => ({
    stickActive: mobile._stick.active,
    moveMag: Math.hypot(mobile.moveX, mobile.moveY),
    lookDX: mobile.lookDX,
  }));
  assert(moveAfterResize.stickActive, 'Stick remains active after resize drag');
  assert(moveAfterResize.moveMag > 0, 'Stick continues reporting motion after resize');
  assert(moveAfterResize.lookDX < 0, 'Look continues reporting motion after resize');

  // Clean release
  await gesture('touchEnd', []);
  await setViewport(1024, 768);
  entry.checks.push('same-angle-viewport-resize-and-storm-preserve-held-fire-stick-look-ownership');

  // =========================================================================
  // 7b. FIXED-STICK SAME-COORDINATE MOVEMENT AFTER SAME-ANGLE VIEWPORT RELAYOUT
  // =========================================================================
  await resetMobileState();
  await page.evaluate(() => {
    mobile.s.stickMode = 'fixed';
    mobile._layoutAll();
  });
  const fixedStickBox = await page.evaluate(() => {
    const b = mobile._box('stick');
    return { x: Math.round(b.x), y: Math.round(b.y) };
  });

  const fixedMoveTarget = { x: fixedStickBox.x + 35, y: fixedStickBox.y - 25 };
  await gesture('touchStart', [{ id: 25, x: fixedStickBox.x, y: fixedStickBox.y }]);
  await gesture('touchMove', [{ id: 25, x: fixedMoveTarget.x, y: fixedMoveTarget.y }]);

  const preRelayoutFixed = await page.evaluate(() => ({
    stickActive: mobile._stick.active,
    stickId: mobile._stick.id,
    moveMag: Math.hypot(mobile.moveX, mobile.moveY),
  }));
  assert(preRelayoutFixed.stickActive, 'Fixed stick active before relayout');
  assert(preRelayoutFixed.moveMag > 0, 'Fixed stick deflected before relayout');

  // Trigger same-angle viewport relayout (height changes from 768 to 400, orientation angle remains 0)
  await setViewport(1024, 400);

  // Send touchMove at the exact same coordinate after relayout
  await gesture('touchMove', [{ id: 25, x: fixedMoveTarget.x, y: fixedMoveTarget.y }]);
  const postRelayoutFixed = await page.evaluate(() => ({
    stickActive: mobile._stick.active,
    stickId: mobile._stick.id,
    moveMag: Math.hypot(mobile.moveX, mobile.moveY),
  }));
  assert(postRelayoutFixed.stickActive, 'Fixed stick must preserve active hold after same-angle relayout');
  assert.equal(postRelayoutFixed.stickId, preRelayoutFixed.stickId, 'Fixed stick must preserve the browser-assigned pointerId');
  assert(Math.abs(postRelayoutFixed.moveMag - preRelayoutFixed.moveMag) < 1e-6, 'Same-coordinate move must preserve normalized stick deflection');
  assert(postRelayoutFixed.moveMag > 0, 'Fixed stick must preserve movement deflection on same-coordinate movement');

  await gesture('touchEnd', []);
  await page.evaluate(() => {
    mobile.s.stickMode = 'float';
    mobile._layoutAll();
  });
  await setViewport(1024, 768);
  entry.checks.push('fixed-stick-same-coordinate-movement-after-same-angle-relayout');

  // =========================================================================
  // 7c. PORTRAIT GUARD -> FIXED-ANGLE LANDSCAPE RECOVERY
  //     REJECT HIDDEN CONTROLS, NO STALE REPLAY, FRESH TOUCH WORKS
  // =========================================================================
  await resetMobileState();
  await page.evaluate(() => {
    if (screen.orientation) {
      try { Object.defineProperty(screen.orientation, 'angle', { value: 0, configurable: true, writable: true }); } catch {}
    }
    if ('orientation' in window) {
      try { Object.defineProperty(window, 'orientation', { value: 0, configurable: true, writable: true }); } catch {}
    }
  });
  await setViewport(768, 1024);
  const portraitFire = await page.evaluate(() => {
    const f = mobile._box('fire');
    return { x: Math.round(f.x), y: Math.round(f.y) };
  });
  const state = () => page.evaluate(() => ({
    fireDown: mobile.down('fire'), fireEdge: mobile.wasPressed('fire'),
    ptrSize: mobile._ptr.size, stickActive: mobile._stick.active,
    resyncCalls: window._gyroSpy?.resyncCalls ?? 0,
  }));
  const portraitSequence = trackTouchSequence(gesture);
  await portraitSequence.send('touchStart', [{ id: 26, x: portraitFire.x, y: portraitFire.y }]);
  const portrait = await state();
  await page.evaluate(() => {
    window._gyroSpy = { origResync: mobile.gyro.resync, resyncCalls: 0 };
    mobile.gyro.resync = function(...args) {
      window._gyroSpy.resyncCalls++;
      return window._gyroSpy.origResync.apply(this, args);
    };
  });
  let transitionFailure = null;
  try {
    // A keyboard/aspect change does not change the physical screen angle.
    // The gesture rejected in portrait must not acquire ownership on move.
    await setViewport(768, 400);
    const landscapeFire = await page.evaluate(() => {
      const f = mobile._box('fire'); return { x: Math.round(f.x), y: Math.round(f.y) };
    });
    await portraitSequence.send('touchMove', [{ id: 26, x: landscapeFire.x, y: landscapeFire.y }]);
    const landscape = await state();
    await portraitSequence.send('touchEnd', []);
    await portraitSequence.send('touchStart', [{ id: 27, x: landscapeFire.x, y: landscapeFire.y }]);
    const fresh = await state();
    await portraitSequence.send('touchEnd', []);
    // A valid fresh edge is consumed by the normal fixed-step owner.
    await page.evaluate(() => input.endFrame());
    const released = await state();
    assertPortraitAspectTransition({ portrait, landscape, fresh, released });
  } catch (error) {
    transitionFailure = error;
    throw error;
  } finally {
    await page.evaluate(() => {
      if (window._gyroSpy) {
        mobile.gyro.resync = window._gyroSpy.origResync;
        delete window._gyroSpy;
      }
    });
    await portraitSequence.finish(transitionFailure);
    await setViewport(1024, 768);
  }
  entry.checks.push('portrait-rejects-controls-fixed-angle-recovery-needs-fresh-touch-no-gyro-resync');

  // =========================================================================
  // 8. TRUE ROTATION CLEARS ALL OLD OWNERSHIP
  // =========================================================================
  await resetMobileState();
  await gesture('touchStart', [
    { id: 31, x: fireBox.x, y: fireBox.y },
    { id: 32, x: 180, y: 460 },
  ]);
  const heldBeforeRotate = await page.evaluate(() => ({
    fireDown: mobile.down('fire'),
    stickActive: mobile._stick.active,
  }));
  assert(heldBeforeRotate.fireDown);
  assert(heldBeforeRotate.stickActive);

  // Trigger true orientation rotation (landscape 1024x768 -> portrait 768x1024, angle 90)
  await page.evaluate(() => {
    if ('orientation' in window) {
      try { Object.defineProperty(window, 'orientation', { value: 90, configurable: true, writable: true }); } catch {}
    }
    if (screen.orientation) {
      try { Object.defineProperty(screen.orientation, 'angle', { value: 90, configurable: true, writable: true }); } catch {}
      screen.orientation.dispatchEvent(new Event('change'));
    }
    window.dispatchEvent(new Event('orientationchange'));
  });
  await setViewport(768, 1024);

  const postRotationState = await page.evaluate(() => ({
    fireDown: mobile.down('fire'),
    stickActive: mobile._stick.active,
    ptrSize: mobile._ptr.size,
  }));
  assert.equal(postRotationState.fireDown, false, 'True rotation MUST reset held buttons');
  assert.equal(postRotationState.stickActive, false, 'True rotation MUST reset movement stick');
  assert.equal(postRotationState.ptrSize, 0, 'True rotation MUST clear all pointers');

  // Restore orientation (portrait 768x1024 -> landscape 1024x768, angle 0)
  await page.evaluate(() => {
    if ('orientation' in window) {
      try { Object.defineProperty(window, 'orientation', { value: 0, configurable: true, writable: true }); } catch {}
    }
    if (screen.orientation) {
      try { Object.defineProperty(screen.orientation, 'angle', { value: 0, configurable: true, writable: true }); } catch {}
      screen.orientation.dispatchEvent(new Event('change'));
    }
    window.dispatchEvent(new Event('orientationchange'));
  });
  await setViewport(1024, 768);
  await gesture('touchEnd', []);
  entry.checks.push('true-rotation-clears-all-old-ownership');

  // A forced capture-transfer failure must leave implicit canvas ownership usable.
  // This is DOM PointerEvent evidence in both engines; normal Chromium gestures
  // above remain native CDP evidence with browser-assigned pointer IDs.
  await resetMobileState();
  await setDevice('kbm');
  const failedCapture = await page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('game');
    const capture = mobile.root.setPointerCapture;
    const down = mobile._down, press = mobile._press;
    let downCalls = 0, pressCalls = 0;
    mobile.root.setPointerCapture = () => { throw new DOMException('Forced capture failure'); };
    mobile._down = function(e) { downCalls++; return down.call(this, e); };
    mobile._press = function(...args) { pressCalls++; return press.apply(this, args); };
    const dispatch = type => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 901,
      clientX: type === 'pointermove' ? x - 70 : x, clientY: y,
    }));
    try {
      dispatch('pointerdown');
      const held = mobile.down('fire') && mobile._ptr.has(901);
      dispatch('pointermove');
      const aiming = mobile.lookDX < 0;
      dispatch('pointercancel');
      const cancelled = !mobile.down('fire') && !mobile._ptr.has(901) && mobile._pendingEdges.size === 0;
      dispatch('pointerup');
      return { held, aiming, cancelled, downCalls, pressCalls };
    } finally {
      mobile.root.setPointerCapture = capture;
      mobile._down = down; mobile._press = press;
    }
  }, fireBox);
  assert.deepEqual(failedCapture, { held: true, aiming: true, cancelled: true, downCalls: 1, pressCalls: 1 });
  entry.checks.push('DOM-forced-capture-failure-canvas-move-cancel-and-up-with-one-router-edge');

  // =========================================================================
  // 9. NATIVE LOSTPOINTERCAPTURE CLEANUP
  // =========================================================================
  await resetMobileState();
  await gesture('touchStart', [{ id: 35, x: fireBox.x, y: fireBox.y }]);
  const preLostState = await page.evaluate(() => ({
    fireDown: mobile.down('fire'),
    pointerId: [...mobile._ptr.keys()][0],
  }));
  assert(preLostState.fireDown, 'FIRE hold active before lostpointercapture');
  assert(preLostState.pointerId !== undefined, 'Pointer tracked in _ptr before lostpointercapture');

  // Dispatch native lostpointercapture event on mobile.root
  await page.evaluate((pointerId) => {
    const root = mobile.root || document.getElementById('iw-mobile-controls');
    root.dispatchEvent(new PointerEvent('lostpointercapture', {
      bubbles: true,
      cancelable: true,
      pointerType: 'touch',
      pointerId,
      clientX: 0,
      clientY: 0,
    }));
  }, preLostState.pointerId);

  const postLostState = await page.evaluate((pointerId) => ({
    fireDown: mobile.down('fire'),
    pressedEdges: mobile.pressed.has('fire'),
    pendingEdgesSize: mobile._pendingEdges?.size ?? 0,
    ptrSize: mobile._ptr.size,
    hasPointer: mobile._ptr.has(pointerId),
  }), preLostState.pointerId);
  assert.equal(postLostState.fireDown, false, 'lostpointercapture must release button hold');
  assert.equal(postLostState.pressedEdges, false, 'lostpointercapture must clear pressed edge');
  assert.equal(postLostState.pendingEdgesSize, 0, 'lostpointercapture must clear _pendingEdges');
  assert.equal(postLostState.hasPointer, false, 'lostpointercapture must remove pointer from _ptr');
  await gesture('touchEnd', []);
  entry.checks.push('native-lostpointercapture-cleans-up-holds-edges-and-pointers');

  // =========================================================================
  // 10. REPEATED TRANSITIONS & CLEANUP AFTER DESTROY
  // =========================================================================
  await resetMobileState();

  // Repeated transitions back and forth
  for (let cycle = 0; cycle < 3; cycle++) {
    await setDevice('kbm');
    await gesture('touchStart', [{ id: 40 + cycle * 2, x: fireBox.x, y: fireBox.y }]);
    const touchKbm = await page.evaluate(() => ({ dev: input.lastDevice, fire: mobile.down('fire') }));
    assert.equal(touchKbm.dev, 'touch');
    assert(touchKbm.fire);
    await gesture('touchEnd', []);

    await setDevice('pad');
    await gesture('touchStart', [{ id: 41 + cycle * 2, x: fireBox.x, y: fireBox.y }]);
    const touchPad = await page.evaluate(() => ({ dev: input.lastDevice, fire: mobile.down('fire') }));
    assert.equal(touchPad.dev, 'touch');
    assert(touchPad.fire);
    await gesture('touchEnd', []);
  }

  // Cleanup after destroy
  const destroyResult = await page.evaluate(() => {
    mobile.destroy();
    const rootGone = document.getElementById('iw-mobile-controls') === null;
    const classGone = !document.documentElement.classList.contains('iw-mobile');
    const aborted = mobile._abort.signal.aborted;

    // Dispatched resize after destroy must not resurrect controls or throw
    window.dispatchEvent(new Event('resize'));
    const rootStillGone = document.getElementById('iw-mobile-controls') === null;

    return { rootGone, classGone, aborted, rootStillGone };
  });

  assert(destroyResult.rootGone, 'Mobile controls root element removed from DOM');
  assert(destroyResult.classGone, 'iw-mobile class removed from documentElement');
  assert(destroyResult.aborted, 'AbortSignal aborted on destroy');
  assert(destroyResult.rootStillGone, 'Post-destroy resize does not recreate elements');
  entry.checks.push('repeated-device-transitions-and-post-destroy-cleanup');

  return { status: 'passed', engineName, evidenceClass };
}
