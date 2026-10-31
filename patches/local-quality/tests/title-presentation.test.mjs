import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptTitlePresentation } from '../title-presentation-adapter.mjs';

const ROOT = new URL('../../../', import.meta.url);
const native = fs.readFileSync(new URL('inkwave-public/src/ui/menus.js', ROOT), 'utf8');
const start = '  _scr_title() {';
const end = '\n  // ================================================================ SCREEN: main';
function once(code, before, after) {
  assert.equal(code.split(before).length - 1, 1);
  return code.replace(before, () => after);
}
const composed = adaptTitlePresentation('src/ui/menus.js', native, once);

function fixture({ lang = 'ja', input = 'kbm' } = {}) {
  let accepts = 0, focused = null, outerClicks = 0;
  const labels = lang === 'ja' ? {
    'PRESS ANY BUTTON': 'ボタンを押してスタート',
    'PRESS ANY KEY': 'キーを押してスタート',
    'TAP TO START': 'タップしてスタート',
  } : {};
  const h = (tag, props = {}, ...children) => {
    props ||= {};
    const el = { tag, props, children: children.flat(Infinity).filter(x => x != null),
      innerHTML: props.html || '', textContent: children.filter(x => typeof x === 'string').join(''),
      focus(options) { focused = { el, options }; } };
    for (const child of el.children) if (typeof child === 'object') child.parentElement = el;
    return el;
  };
  const method = composed.slice(composed.indexOf(start), composed.indexOf(end, composed.indexOf(start)));
  const Menu = vm.runInNewContext('class Menu {' + method + '\n}; Menu', {
    h, LANG: lang, GAME_TITLE: 'ZEVANT', t: key => labels[key] || key,
  });
  const menu = new Menu();
  Object.assign(menu, { _input: input, _version: () => '1.2.3', _titleGo: () => accepts++ });
  const screen = menu._scr_title();
  // Model the descendant -> section -> outer listener path. Calling the
  // button callback directly hid stopPropagation regressions. This is a DOM
  // propagation unit; the production browser probe verifies trusted gestures
  // and real AudioContext state rather than the keyboard-only _audioOn flag.
  screen.el.parentElement = { props: { onclick: () => outerClicks++ } };
  const click = target => {
    const event = { target, cancelBubble: false, defaultPrevented: false,
      stopPropagation() { this.cancelBubble = true; },
      preventDefault() { this.defaultPrevented = true; } };
    for (let node = target; node; node = node.parentElement) {
      event.currentTarget = node;
      node.props.onclick?.(event);
      if (event.cancelBubble) break;
    }
    return event;
  };
  const nodes = [];
  const walk = node => { if (typeof node !== 'object') return; nodes.push(node); node.children.forEach(walk); };
  walk(screen.el);
  const find = name => nodes.find(node => (node.props.class || '').split(' ').includes(name));
  return { menu, screen, nodes, find, click, accepts: () => accepts, focused: () => focused, outerClicks: () => outerClicks };
}

test('title replacement preserves all non-title native ownership and fails closed on an ambiguous owner', () => {
  const from = native.indexOf(start), to = native.indexOf(end, from);
  assert.equal(composed.slice(0, from), native.slice(0, from));
  assert.equal(composed.slice(composed.indexOf(end, from)), native.slice(to));
  assert.throws(() => adaptTitlePresentation('src/ui/menus.js', composed, once), /applied twice/);
  assert.throws(() => adaptTitlePresentation('src/ui/menus.js', native + '\n' + start, once), /ambiguous/);
  assert.equal(adaptTitlePresentation('src/game/match.js', native, once), native);
});

test('native start and its descendants bubble to one title owner and preserve outer gesture listeners', () => {
  const f = fixture();
  const button = f.find('iw-launch__start');
  assert.equal(button.tag, 'button');
  assert.equal(button.props.type, 'button');
  assert.equal(button.props['data-title-start'], '1');
  assert.equal(button.props['aria-label'], 'はじめる');
  assert.equal(button.props.onclick, undefined, 'the section is the only click owner');
  const buttonEvent = f.click(button);
  assert.equal(buttonEvent.cancelBubble, false);
  assert.equal(buttonEvent.defaultPrevented, false);
  assert.equal(f.accepts(), 1);
  assert.equal(f.outerClicks(), 1);
  for (const target of [f.find('iw-launch__start-label'), f.find('iw-launch__start-arrow'), f.screen.el]) {
    const before = f.accepts(), outside = f.outerClicks(), event = f.click(target);
    assert.equal(f.accepts(), before + 1, 'one native title callback per bubbling event');
    assert.equal(f.outerClicks(), outside + 1, 'outer gesture listener still receives the event');
    assert.equal(event.cancelBubble, false);
  }
  assert.equal(f.screen.noCursor, true);
  assert.equal(f.screen.tick, undefined, 'the new title must not create background per-frame work');
  assert.equal(f.screen.destroy, undefined, 'presentation has no new owned timer/listener to retain');
});

test('input hint follows actual keyboard, gamepad and touch ownership without changing button semantics', () => {
  const f = fixture();
  assert.equal(f.find('iw-launch__input-text').textContent, 'キーを押してスタート');
  const before = f.find('iw-launch__input-icon').innerHTML;
  f.screen.onInputMode('pad');
  assert.equal(f.find('iw-launch__input-text').textContent, 'ボタンを押してスタート');
  assert.notEqual(f.find('iw-launch__input-icon').innerHTML, before);
  f.screen.onInputMode('touch');
  assert.equal(f.find('iw-launch__input-text').textContent, 'タップしてスタート');
  assert.equal(f.find('iw-launch__start').props['aria-label'], 'はじめる');
  assert.equal(f.accepts(), 0);
});

test('Japanese and English titles retain readable branding and native keyboard focus without focusing on touch', () => {
  for (const lang of ['ja', 'en']) {
    const f = fixture({ lang });
    assert.equal(f.find('iw-launch__wordmark').tag, 'h1');
    assert.equal(f.find('iw-launch__wordmark').textContent, 'ZEVANT');
    assert.equal(f.find('iw-launch__version').textContent, 'v1.2.3');
    assert.equal(f.find('iw-launch__start').props['aria-label'], lang === 'ja' ? 'はじめる' : 'Start');
    f.screen.afterMount();
    assert.equal(f.focused().el, f.find('iw-launch__start'));
    assert.equal(f.focused().options.preventScroll, true);
  }
  const touch = fixture({ input: 'touch' });
  touch.screen.afterMount();
  assert.equal(touch.focused(), null);
});

test('presentation CSS keeps native font/assets, scopes reduced motion and fits compact landscape buttons', () => {
  const css = adaptTitlePresentation('styles/ui.css', '/* existing styles */', once);
  assert.ok(css.startsWith('/* existing styles */'));
  assert.doesNotMatch(css, /url\(|@font-face|backdrop-filter|\binfinite\b/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.iw-launch__start:focus-visible/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.throws(() => adaptTitlePresentation('styles/ui.css', css, once), /applied twice/);
});
