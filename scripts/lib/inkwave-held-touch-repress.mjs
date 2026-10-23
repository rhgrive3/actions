import assert from 'node:assert/strict';

// The reliability lab already owns a real emitted Actor/Runner/Character and
// runSimulation clock. Keep its original 60 Hz trial first, then repeat at
// different render cadences without replacing input admission or action counts.
export async function checkHeldTouchRepress(page) {
  const rows = [];
  for (const hz of [60, 30, 120]) {
    const row = await page.evaluate(hz => {
      if (hz !== 60) {
        mobile.reset(); advance(1 / 60);
        actionActor.ink = 100; // independent fixture, never a gameplay refill
      }
      actionActor.weaponRunner.reset(); actionActor.grounded = true;
      actionActor.jumpBuffer = 0; actionActor._prevIntent.jump = false;
      mobile.reset(); mobile.moveX = .8; actionDodges = 0;
      const pointers = [];
      const pointer = (id, pointerId, type) => {
        const el = document.querySelector(`[data-c="${id}"]`), r = el.getBoundingClientRect();
        const x = r.x + r.width / 2, y = r.y + r.height / 2;
        el.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch', bubbles: true,
          cancelable: true, clientX: x, clientY: y }));
        pointers.push({ id, type, hit: mobile._hitButton(x, y),
          owned: mobile._ptr.get(pointerId)?.id ?? null });
      };
      window.actionPointer = pointer;
      pointer('fire', 501, 'pointerdown'); pointer('jump', 502, 'pointerdown');
      for (let i = 0; i < Math.ceil(hz * 31 / 60); i++) advance(1 / hz);
      const first = actionDodges;
      pointer('jump', 502, 'pointerup'); pointer('jump', 503, 'pointerdown');
      // The physical edge must survive a render-only half tick.
      advance(1 / 120); advance(1 / 120);
      for (let i = 0; i < hz; i++) advance(1 / hz);
      const after = actionDodges;
      pointer('jump', 503, 'pointerup'); pointer('fire', 501, 'pointerup'); advance(1 / 60);
      return { hz, first, after, jumpAfterRelease: actionActor.intent.jump,
        pointers, livePointers: mobile._ptr.size };
    }, hz);
    assert.equal(row.first, 1, `initial held touch reaches real Character once at ${hz} Hz`);
    assert.equal(row.after, 2, `held touch release/repress reaches real Character once at ${hz} Hz`);
    assert.equal(row.jumpAfterRelease, false);
    assert.equal(row.livePointers, 0);
    for (const p of row.pointers) {
      assert.equal(p.hit, p.id, `${hz} Hz ${p.id} visible centre owns its hitbox`);
      assert.equal(p.owned, p.type === 'pointerdown' ? p.id : null,
        `${hz} Hz ${p.id} pointer ownership follows ${p.type}`);
    }
    rows.push(row);
  }
  return rows;
}
