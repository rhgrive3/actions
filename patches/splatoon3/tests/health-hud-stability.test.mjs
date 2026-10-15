import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// INKWAVE_BUILT_SITE also exercises the actual emitted helper through the VM
// module loader. Only the DOM setters and projection failure are test doubles.
let f;
before(async () => {
  f = await fixture({ productionComposition: true, extraExports:
    "export * from './patches/splatoon3/runtime/combat-info.mjs';" });
});
function hudRig() {
  const writes = { hidden: 0, position: 0, color: 0, fill: 0 }, nodes = [];
  const style = isFill => new Proxy({ setProperty(key, value) { writes.color++; this[key] = value; } }, {
    set(target, key, value) {
      if (key === 'transform') writes[isFill ? 'fill' : 'position']++;
      target[key] = value; return true;
    },
  });
  f.context.document = { createElement(tag) {
    let hidden = false;
    const node = { style: style(tag === 'i'), children: [], setAttribute() {},
      appendChild(child) { this.children.push(child); this.firstChild ||= child; },
      get hidden() { return hidden; }, set hidden(value) { writes.hidden++; hidden = value; },
    };
    nodes.push(node); return node;
  } };
  const hud = { markerLayer: { appendChild() {} } };
  const draw = rows => f.updateHealthBars(hud, rows);
  return { hud, writes, nodes, draw };
}

test('stationary pooled health bars do no DOM writes at 30/60/120 Hz after first paint', () => {
  for (const hz of [30, 60, 120]) {
    const r = hudRig(), rows = [{ x: 80, y: 50, hp: .7, color: '#00f' }];
    r.draw(rows); const first = { ...r.writes };
    for (let frame = 0; frame < hz; frame++) r.draw(rows);
    assert.deepEqual(r.writes, first, `${hz} Hz stable frame`);
    assert.equal(r.nodes.length, 2, 'one bar and one fill, never recreated');
    assert.equal(r.hud._healthBars[0].hidden, false);
  }
});

test('mutable rows update only changed rendered fields and pooled actor replacements repaint', () => {
  const r = hudRig(), row = { x: 80, y: 50, hp: .7, color: '#00f' };
  r.draw([row]); const first = { ...r.writes };
  row.x += .01; r.draw([row]);
  assert.deepEqual(r.writes, first, 'movement below displayed precision does not write');
  row.x = 81; r.draw([row]); assert.equal(r.writes.position, first.position + 1);
  assert.equal(r.writes.fill, first.fill); assert.equal(r.writes.color, first.color);
  row.hp = .4; r.draw([row]); assert.equal(r.writes.fill, first.fill + 1);
  row.color = '#f80'; r.draw([row]); assert.equal(r.writes.color, first.color + 1);
  r.draw([{ x: 10, y: 20, hp: .9, color: '#0f0' }]);
  assert.equal(r.hud._healthBars[0].style.transform, 'translate3d(10.0px,20.0px,0)');
  assert.equal(r.hud._healthBars[0].firstChild.style.transform, 'scaleX(0.9)');
  assert.equal(r.hud._healthBars[0].style['--health-color'], '#0f0');
  assert.equal(r.nodes.length, 2);
});

test('hidden bars write visibility once, then restore their cached paint and latest health', () => {
  const r = hudRig(), row = { x: 80, y: 50, hp: .7 };
  r.draw([row]); r.draw([]); const hidden = { ...r.writes };
  for (let frame = 0; frame < 120; frame++) r.draw([]);
  assert.deepEqual(r.writes, hidden, 'repeated empty frames leave hidden DOM alone');
  assert.equal(r.hud._healthBars[0].hidden, true);
  row.hp = .2; r.draw([row]);
  assert.equal(r.writes.hidden, hidden.hidden + 1);
  assert.equal(r.writes.position, hidden.position);
  assert.equal(r.writes.color, hidden.color);
  assert.equal(r.writes.fill, hidden.fill + 1);
  assert.equal(r.hud._healthBars[0].hidden, false);
  assert.equal(r.hud._healthBars[0].firstChild.style.transform, 'scaleX(0.2)');
});

test('nonfinite marker coordinates or HP hide stale bars without emitting invalid CSS', () => {
  for (const field of ['x', 'y', 'hp']) for (const value of [NaN, Infinity, -Infinity]) {
    const r = hudRig(), row = { x: 80, y: 50, hp: .7 };
    r.draw([{ ...row, [field]: value }]);
    assert.equal(r.nodes.length, 0, 'invalid first row cannot allocate a visible bar');
    r.draw([row]); const painted = { ...r.writes };
    r.draw([{ ...row, [field]: value }]);
    assert.equal(r.hud._healthBars[0].hidden, true);
    assert.equal(r.writes.position, painted.position); assert.equal(r.writes.fill, painted.fill);
    r.draw([row]); assert.equal(r.hud._healthBars[0].hidden, false);
  }
});

test('nonfinite projected heads are rejected, and finite health markers recover next frame', () => {
  const { THREE } = f, viewer = { team: 0, alive: true, hp: 100 };
  const head = new THREE.Vector3(0, 0, -5);
  const ally = { team: 0, alive: true, hp: 70, form: 'kid',
    character: { getHeadPosition(out) { return out.copy(head); } } };
  const camera = new THREE.PerspectiveCamera(60, 1280 / 720, .1, 100);
  camera.updateMatrixWorld();
  const game = { match: { local: viewer, actors: [viewer, ally] } };
  const G = { camera, time: 0, teamHex: ['#f80', '#00f'] }, PLAYER = { hp: 100 };
  assert.equal(f.buildHealthMarkers(game, G, PLAYER, THREE).length, 1);
  for (const value of [NaN, Infinity, -Infinity]) {
    head.x = value;
    assert.equal(f.buildHealthMarkers(game, G, PLAYER, THREE).length, 0);
    head.x = 0;
    assert.equal(f.buildHealthMarkers(game, G, PLAYER, THREE).length, 1);
  }
});
