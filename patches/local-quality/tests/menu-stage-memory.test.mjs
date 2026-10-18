import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptQualitySource } from '../adapter.mjs';

const source = fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js', import.meta.url), 'utf8');
const built = adaptQualitySource('src/ui/menus.js', source);

function methodOf(code) {
  const begin = code.indexOf('  _preloadStages() {');
  const end = code.indexOf('\n  _scr_setup() {', begin);
  assert.ok(begin >= 0 && end > begin, 'exact stage preloader method exists');
  return code.slice(begin, end);
}

function probe(code, count, touchPrimary) {
  const seen = { created: 0, decoded: 0, sources: [] };
  function FakeImage() {
    seen.created++;
    this.decode = () => { seen.decoded++; return Promise.resolve(); };
  }
  Object.defineProperty(FakeImage.prototype, 'src', {
    set(url) { seen.sources.push(url); },
  });
  const body = methodOf(code);
  const Harness = new Function('Image', 'stageArt', 'touchPrimary',
    'return class MenuStageProbe {\n' + body + '\n}')(
      FakeImage, (id, time, small) => id + ':' + time + ':' + small, touchPrimary);
  const menu = new Harness();
  menu._maps = () => Array.from({ length: count }, (_, i) => ({ id: 'stage-' + i }));
  menu._preloadStages();
  menu._preloadStages(); // returning to main cannot start a second burst
  return { ...seen, retained: menu._stageImgs?.length || 0 };
}

for (const touch of [true, false]) {
  test('title -> main: no eager stage image allocation (' + (touch ? 'touch' : 'desktop') + ')', () => {
    const maps = 29; // 4 base maps + up to 25 native source-stage entries
    const baseline = probe(source, maps, touch);
    const emitted = probe(built, maps, touch);
    const expected = maps * 2 * (touch ? 1 : 2);
    assert.equal(baseline.created, expected, 'native baseline allocates every variant');
    assert.equal(baseline.decoded, expected, 'native baseline decodes every variant immediately');
    assert.equal(baseline.retained, expected, 'native baseline pins all image owners');
    assert.deepEqual(emitted, { created: 0, decoded: 0, sources: [], retained: 0 });
  });
}
test('picker: only offscreen ticket artwork is lazy; selected hero stays immediate', () => {
  const begin = built.indexOf('    const tickets = maps.map(');
  const end = built.indexOf('    const refreshTicket = ', begin);
  assert.ok(begin >= 0 && end > begin, 'stage ticket factory survives');
  const tickets = built.slice(begin, end);
  assert.equal((tickets.match(/loading: 'lazy'/g) || []).length, 2);
  assert.equal((tickets.match(/decoding: 'async'/g) || []).length, 2);
  assert.match(tickets, /im\.src = stageArt\(m\.id, t, true\);/);
  assert.match(built, /img\.src = stageArt\(id, time\);/);
  assert.match(built, /whenReady\(L\._img, \(\) =>/);
  assert.match(built, /this\._portraitInto\(avatar, \{ kind: 'head', size: 160 \}\);/);
  assert.match(built, /this\._preloadStages\(\);/); // harmless retained API
  assert.doesNotMatch(methodOf(built), /new Image|\.decode\(|_stageImgs|stageArt\(/);
});
test('transform is scoped to menus and rejects upstream drift instead of silently regressing', () => {
  const control = 'const stageWarmup = true;';
  assert.equal(adaptQualitySource('not-a-runtime-menu.js', control), control);
  const drift = source.replace('    if (this._stageImgs) return;', '    if (this._stageImgs?.length) return;');
  assert.notEqual(drift, source);
  assert.throws(() => adaptQualitySource('src/ui/menus.js', drift),
    /expected exactly one connection/);
  assert.throws(() => adaptQualitySource('src/ui/menus.js', built),
    /expected exactly one connection/);
});
