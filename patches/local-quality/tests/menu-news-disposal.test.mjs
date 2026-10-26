import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptQualitySource } from '../adapter.mjs';

const raw = fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js', import.meta.url), 'utf8');
const newsRaw = fs.readFileSync(new URL('../../../inkwave-public/src/ui/news.js', import.meta.url), 'utf8');
function methods(source, name, names, bindings) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const cls = ast.body.map(n => n.declaration || n).find(n => n.type === 'ClassDeclaration' && n.id.name === name);
  assert.ok(cls, name);
  const selected = names.map(key => {
    const method = cls.body.body.find(n => n.key.name === key); assert.ok(method, key);
    return source.slice(method.start, method.end);
  });
  return new Function(...Object.keys(bindings), `return class {${selected.join('\n')}}`)(...Object.values(bindings));
}
function fixture(source) {
  const timers = new Set([10]), frames = new Set([20, 30, 40]), removed = [];
  const env = { clearTimeout: id => timers.delete(id), cancelAnimationFrame: id => frames.delete(id),
    performance: { now: () => 100 }, clamp: (n, lo, hi) => Math.min(hi, Math.max(lo, n)),
    safeCall: fn => fn(), clearContinuation() {}, window: { removeEventListener() {} }, document: { fonts: { removeEventListener() {} } } };
  const News = methods(adaptBuildSource('src/ui/news.js', newsRaw), 'WhatsNew', ['constructor', 'dispose'], env);
  const Menu = methods(source, 'Menus', ['update', 'dispose'], env);
  const menu = new Menu();
  // Keep constructor-owned tween state and the real menu owner: dispose now
  // retires both pending tweens and the news overlay's modal ownership.
  const news = new News(menu); Object.assign(news, { _t: 10, _raf: 20, _pre: [{}], el: { remove: () => removed.push('news') } });
  news._tweens.push({});
  Object.assign(menu, { _news: news, _modal: news.el, _raf: 30, _fitQ: 40, _swapToken: 0,
    _cur: {}, _tick() {}, _cancelHeroWait() {}, wipe: { cancel() {} }, el: { remove: () => removed.push('menu') } });
  return { menu, news, timers, frames, removed };
}

test('first engine-driven update preserves the pending news timer and active animation', () => {
  const f = fixture(adaptBuildSource('src/ui/menus.js', raw));
  for (let i = 0; i < 120; i++) f.menu.update(1 / 60);
  assert.deepEqual([...f.timers], [10]); assert.ok(f.frames.has(20));
  assert.equal(f.frames.has(30), false, 'engine still takes over the menu RAF');
  assert.deepEqual(f.removed, []); assert.ok(f.news.el);
  assert.equal(f.news._tweens.length, 1); assert.equal(f.menu._modal, f.news.el);
});
for (const updated of [false, true]) test(`full-composition disposal releases news ${updated ? 'after' : 'before'} update`, () => {
  const f = fixture(adaptBuildSource('src/ui/menus.js', raw));
  if (updated) {
    f.menu.update(1 / 60);
    // News may be opened later when the title gives way to the main screen.
    f.news._t = 10; f.news._raf = 20; f.news._pre = [{}];
    f.news.el = { remove: () => f.removed.push('news') };
    f.menu._modal = f.news.el;
    f.timers.add(10); f.frames.add(20); f.removed.length = 0;
  }
  f.menu.dispose();
  assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0);
  assert.equal(f.news.el, null); assert.equal(f.news._pre, null);
  assert.equal(f.news._tweens.length, 0); assert.equal(f.menu._modal, null);
  assert.deepEqual(f.removed, ['news', 'menu']);
});
test('direct quality composition also disposes news without depending on RAF formatting', () => {
  const f = fixture(adaptQualitySource('src/ui/menus.js', raw));
  f.menu.dispose(); assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0);
  assert.equal(f.news._tweens.length, 0); assert.equal(f.menu._modal, null);
  assert.deepEqual(f.removed, ['news', 'menu']);
});
