import assert from 'node:assert/strict';
export function verifyFrameComparisons(rows, screenshots) {
  assert(Array.isArray(rows) && rows.length === screenshots.length, 'one comparison receipt per saved frame');
  const names = new Set(screenshots.map(frame => frame.name)), pairs = new Map();
  let lighting;
  for (const row of rows) {
    assert(names.delete(row.name), 'each saved frame has exactly one comparison receipt');
    const match = /^(before|after)-(.+)$/.exec(row.name);
    assert(match, 'explicit before/after frame name');
    assert(row.lighting && row.camera, 'native lighting and camera receipts required');
    if (lighting === undefined) lighting = row.lighting;
    else assert.deepEqual(row.lighting, lighting, 'same native lighting and complete post stack');
    const pair = pairs.get(match[2]) || {};
    assert(!pair[match[1]], 'unique comparison side');
    pair[match[1]] = row; pairs.set(match[2], pair);
  }
  assert.equal(names.size, 0);
  for (const [name, pair] of pairs) {
    assert(pair.before && pair.after, 'both versions captured: ' + name);
    assert.deepEqual(pair.before.camera, pair.after.camera, 'same comparison camera: ' + name);
    if (name.startsWith('source-loaded-actor-') || pair.before.sourceOwner || pair.after.sourceOwner) {
      const ownerState = row => {
        assert(row.sourceOwner, 'both source-owner receipts required: ' + name);
        const { status, active, sourceUpper, seed, footBones, variant } = row.sourceOwner;
        assert.equal(status, 'ready', 'same-build Player00 bank must be ready: ' + name);
        assert.equal(typeof active, 'boolean', 'source-owner activity must be explicit: ' + name);
        assert(typeof sourceUpper === 'boolean' || sourceUpper === null, 'source-owner upper decision must be boolean or null: ' + name);
        assert(Number.isFinite(seed), 'source-owner seed must be finite: ' + name);
        for (const foot of ['footL', 'footR']) assert(Array.isArray(footBones?.[foot]) && footBones[foot].length === 3 && footBones[foot].every(Number.isFinite), 'three finite source-owner foot coordinates required: ' + name);
        if (name.startsWith('source-loaded-actor-')) {
          assert.equal(active, true, 'source-loaded actor must actually use its source owner: ' + name);
          assert.equal(variant, 'Player00', 'source-loaded actor must use the selected Player00 bank: ' + name);
        }
        return { status, active, sourceUpper, seed, footBones, variant };
      };
      assert.deepEqual(ownerState(pair.before), ownerState(pair.after), 'same source-owner state and feet: ' + name);
    }
  }
  return { pairs: pairs.size, sameLighting: true, sameCameras: true };
}

// Optional four-frame release aid. Keep original PNGs, exact simulation times
// and their hashes; this ordered contact sheet is not a motion video.
export function verifyContactSheetPlan(rows, screenshots, plans = []) {
  assert(Array.isArray(plans) && plans.length <= 2, 'at most one before and one after contact sheet');
  const seen = new Set(screenshots.map(frame => frame.name)), rowMap = new Map(rows.map(row => [row.name, row])), shotMap = new Map(screenshots.map(frame => [frame.name, frame]));
  return plans.map(plan => {
    assert(/^(before|after)-[a-z0-9-]+$/.test(plan.name) && !seen.has(plan.name), 'unique contact-sheet filename'); seen.add(plan.name);
    assert(Array.isArray(plan.frames) && plan.frames.length === 4, 'four ordered release frames');
    const variant = plan.name.split('-')[0], names = new Set();
    const frames = plan.frames.map((frame, i) => {
      assert(frame.name?.startsWith(variant + '-') && !names.has(frame.name), 'unique same-version contact-sheet frame'); names.add(frame.name);
      const row = rowMap.get(frame.name), shot = shotMap.get(frame.name);
      assert(row && shot, 'contact sheet references an existing frame and receipt');
      if (i === 0) assert.equal(row.t, 'pre-event', 'first contact frame precedes event');
      else assert(Number.isFinite(row.t) && Math.abs(row.t - (i - 1) / 60) < 1e-10, 'contact frame follows exact 60 Hz simulation time');
      const label = i === 0 ? 'before' : (row.t * 1000).toFixed(1) + ' ms';
      if (frame.label !== undefined) assert.equal(frame.label, label, 'contact-sheet label matches original time receipt');
      return { name: frame.name, file: shot.file, sourceSha256: shot.sha256, t: row.t, label };
    });
    return { name: plan.name, width: 1800, height: 492, frames };
  });
}
