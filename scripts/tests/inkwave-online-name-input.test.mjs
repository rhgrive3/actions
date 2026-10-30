import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
const root = path.resolve(process.env.INKWAVE_SOURCE_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const { adaptBuildSource } = await import(pathToFileURL(path.join(root, 'scripts/inkwave-source-composition.mjs')));
const { fixture, deferred, flush } = await import(pathToFileURL(path.join(root, 'scripts/lib/inkwave-online-controlled-fixture.mjs')));
const raw = fs.readFileSync(path.join(root, 'inkwave-public/src/ui/menus.js'), 'utf8');
const composed = adaptBuildSource('src/ui/menus.js', raw);
const method = composed.slice(composed.indexOf('  _scr_online() {'), composed.indexOf('  // ================================================================ SCREEN: lobby'));
const paste = f => f.find('iw-join__btns').children[0].dispatch('click');
const join = f => f.find('iw-join__btns').children[1].dispatch('click');
const editName = (f, value) => { const name = f.find('iw-name__input'); name.value = value; name.dispatch('input'); };
const open = options => {
  const f = fixture(method, options), code = f.find('iw-code-input'), name = f.find('iw-name__input');
  code.value = 'NETXX'; code.dispatch('input');
  name.focus(); name.value = 'Before';
  return { f, code, name };
};

for (const outcome of ['resolve', 'reject']) test(`already-focused name input retires old clipboard ${outcome}`, async () => {
  const clip = deferred(), { f, code, name } = open({ readClipboard: () => clip.promise });
  try {
    let laterFocus = 0; name.addEventListener('focus', () => laterFocus++);
    paste(f); // The actual button prevents mousedown blur; focus stays on name.
    assert.equal(f.document.activeElement === name, true);
    editName(f, 'Newer name'); // No artificial second focus event.
    clip[outcome](outcome === 'resolve' ? 'BCEFG' : Error('denied')); await flush();
    assert.equal(laterFocus, 0);
    assert.equal(code.value, 'NETXX');
    assert.equal(name.value, 'Newer name');
    assert.equal(f.document.activeElement === name, true);
    assert.equal(f.requests.length, 0);
  } finally { f.screen.destroy(); }
});

test('a newer Paste after name editing still applies and allows intentional touch JOIN', async () => {
  const old = deferred(), latest = deferred(), reads = [old, latest];
  const { f, code, name } = open({ readClipboard: () => reads.shift().promise });
  try {
    paste(f); editName(f, 'Newer name'); paste(f);
    latest.resolve('BCEFG'); await flush(); old.reject(Error('denied')); await flush();
    assert.equal(code.value, 'BCEFG');
    assert.equal(f.document.activeElement === name, true);
    f.runTimers(); await flush();
    assert.equal(f.requests.length, 0, 'touch still requires explicit submit');
    join(f);
    assert.deepEqual(f.requests, [['join', 'BCEFG', 'Player']]);
    assert.equal(code.disabled, true);
    f.pending[0].reject(Error('Could not connect')); await flush();
    assert.equal(f.find('iw-hubcard--join').dataset.mode, 'error');
  } finally { f.screen.destroy(); }
});

test('already-focused name input also retires queued keyboard clipboard auto-join', async () => {
  const clip = deferred(), { f, code, name } = open({ touch: false, readClipboard: () => clip.promise });
  try {
    paste(f); clip.resolve('BCEFG'); await flush();
    assert.equal(code.value, 'BCEFG');
    assert.equal(f.document.activeElement === name, true);
    editName(f, 'Newer name');
    f.runTimers(); await flush();
    assert.equal(f.requests.length, 0, 'new input event retires the older timer without requiring refocus');
    assert.equal(f.document.activeElement === name, true);
  } finally { f.screen.destroy(); }
});
