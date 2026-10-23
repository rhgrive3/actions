// The Vite account bundle inside the game build (scripts/lib/inkwave-account-bundle.mjs) and the shared rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { stageAccountBundle, injectAccountEntry } from '../../scripts/lib/inkwave-account-bundle.mjs';
import { checkLoginId, checkDisplayName, checkPassword, passwordScore, cleanDisplayName } from '../shared/rules.js';

function viteOut(manifest, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zva-vite-'));
  fs.mkdirSync(path.join(dir, '.vite'));
  fs.writeFileSync(path.join(dir, '.vite/manifest.json'), JSON.stringify(manifest));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

test('stages every chunk from the Vite manifest and reports its hashes', () => {
  const src = viteOut({
    'src/entry.js': { file: 'account-abc.js', isEntry: true, dynamicImports: ['src/panel.js'] },
    'src/panel.js': { file: 'account-panel-def.js', isDynamicEntry: true, imports: ['src/entry.js'] },
  }, { 'account-abc.js': 'export{}', 'account-panel-def.js': 'export const p=1' });
  const build = fs.mkdtempSync(path.join(os.tmpdir(), 'zva-build-'));
  const bundle = stageAccountBundle(build, src);
  assert.equal(bundle.entry, 'account/account-abc.js');
  assert.deepEqual(Object.keys(bundle.files).sort(), ['account/account-abc.js', 'account/account-panel-def.js']);
  assert.equal(bundle.files['account/account-panel-def.js'], crypto.createHash('sha256').update('export const p=1').digest('hex'));
  assert.equal(fs.readFileSync(path.join(build, 'account/account-panel-def.js'), 'utf8'), 'export const p=1');
  assert.throws(() => stageAccountBundle(build, src), /existing account/);
});

test('refuses a manifest without the entry or with unsafe paths', () => {
  const build = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zva-build-'));
  assert.throws(() => stageAccountBundle(build(), viteOut({}, {})), /no entry/);
  const evil = viteOut({ 'src/entry.js': { file: 'account-a.js', isEntry: true }, x: { file: '../escape.js' } }, { 'account-a.js': '' });
  assert.throws(() => stageAccountBundle(build(), evil), /unsafe path/);
});

test('injects one low-priority module script before </body>', () => {
  const html = '<html><body><script type="module" src="./patches/loading-cache/runtime/startup.mjs"></script>\n</body></html>';
  const out = injectAccountEntry(html, { entry: 'account/account-abc.js' });
  assert.match(out, /startup\.mjs"><\/script>\n<script type="module" fetchpriority="low" src="\.\/account\/account-abc\.js"><\/script>\n<\/body>/);
  assert.equal(injectAccountEntry(html, null), html);
});

test('shared rules accept good input and name each problem', () => {
  assert.equal(checkLoginId('Inkling_01'), null);
  assert.equal(checkLoginId('a'.repeat(21)), 'login_id_long');
  assert.equal(checkLoginId('イカのすけ'), 'login_id_chars');
  assert.equal(checkDisplayName('イカ🦑'), null);
  assert.equal(checkDisplayName('👨‍👩‍👧 family'), null, 'ZWJ emoji sequences are fine');
  assert.equal(checkDisplayName('a​b'), 'display_name_chars');
  assert.equal(cleanDisplayName(' a \n b '), 'a b');
  assert.equal(checkPassword('aaaaaaaaaa'), 'password_common');
  assert.equal(checkPassword('x'.repeat(129)), 'password_long');
  assert.equal(passwordScore('short'), 0);
  assert.ok(passwordScore('Tidal-Wave-2026!') >= 3);
  assert.ok(passwordScore('Tidal-Wave-2026!') > passwordScore('tidalwave1'));
});
