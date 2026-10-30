import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {test} from 'node:test';
import {adaptLandscapePracticeWeapons} from '../landscape-practice-weapons-adapter.mjs';
import {practiceFixture} from './helpers/practice-gear-dom-fixture.mjs';
const root=process.env.INKWAVE_TEST_ROOT||fileURLToPath(new URL('../../../',import.meta.url));
test('actual practice owner has two-line loss policy while the candidate only removes it in touch landscape',()=>{
  const range=fs.readFileSync(path.join(root,'patches/practice-range/styles/range.css'),'utf8');
  assert.match(range,/\.iwr-wchip b \{[\s\S]*?-webkit-line-clamp: 2; line-clamp: 2; overflow: hidden/);
  const css=adaptLandscapePracticeWeapons('styles/ui.css','BASE');assert(css.startsWith('BASE'));
  assert.match(css,/@media \(orientation: landscape\) and \(max-width: 1200px\)/);
  assert.match(css,/\.iwr-pausescr \.iwr-wchip b \{/);
  assert.match(css,/display: block; overflow: visible/);assert.match(css,/-webkit-line-clamp: unset; line-clamp: unset/);
  // One extra owner class wins over range.css, which is installed after ui.css.
  assert(range.includes(':is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iwr-wchip b { font-size: 12px; }'));
  assert(!/font(?:-size|-family)?:|background:|color:|grid-template|height:|\.iw-loadout|\.iw-ldr/.test(css));
  assert.throws(()=>adaptLandscapePracticeWeapons('styles/ui.css',css),/repeated CSS/);
});
test('all native menu, gear, actor, card and portrait source bytes are left alone',()=>{
  for(const rel of ['src/ui/menus.js','styles/mobile.css','src/config.js','patches/practice-range/runtime/menu.mjs','patches/splatoon3/runtime/gear.mjs'])assert.equal(adaptLandscapePracticeWeapons(rel,'SOURCE'),'SOURCE');
});

// Portable actual practice factory/state audit (no browser/layout claim).
test('real practice DOM contains all catalogue names and category entries without changing equipment on filter/tab actions',async()=>{
  const f=await practiceFixture(root);const s=f.open();f.accept('r-tab-weapon');
  assert.equal(s.el.querySelectorAll('.iwr-wchip').length,f.entries.length);
  const id='s3-spinner-hypershort-01',card=f.menus.bindings.get('w-'+id).el;
  assert.equal(card.querySelector('b').textContent,'Heavy Edit Splatling Nouveau');assert.equal(card.title,card.querySelector('b').textContent);
  f.accept('wf-splatling');assert(!card.hidden);assert(s.el.querySelectorAll('.iwr-wchip').filter(c=>!c.hidden).every(c=>c.dataset.cat==='splatling'));
  f.accept('r-tab-tools');f.accept('r-tab-weapon');assert(!card.hidden);assert(f.menus.bindings.get('wf-splatling').el.classList.contains('is-on'));
  assert.equal(f.session.local.weaponId,'shooter');assert.equal(f.calls.filter(c=>c.kind==='equip'||c.kind==='resume').length,0);
});
test('native long-name equip resumes once; reopening marks and names that exact equipped weapon',async()=>{
  const f=await practiceFixture(root);f.open();f.accept('r-tab-weapon');f.accept('wf-splatling');const id='s3-spinner-hypershort-01';f.accept('w-'+id);
  assert.equal(f.session.local.weaponId,id);assert.deepEqual(f.calls.map(c=>c.kind),['equip','resume']);
  const reopened=f.open();assert.equal(reopened.el.querySelector('.iwr-pause').dataset.tab,'weapon');
  assert.equal(reopened.el.querySelector('.iwr-cur__txt').querySelector('b').textContent,'Heavy Edit Splatling Nouveau');
  const selected=reopened.el.querySelectorAll('.iwr-wchip').filter(c=>c.classList.contains('is-on'));assert.equal(selected.length,1);assert.equal(selected[0].dataset.id,'w-'+id);assert(!selected[0].hidden);
});
test('keyboard tab cycles repair focus and Back resumes without changing equipped state',async()=>{
  const f=await practiceFixture(root);const s=f.open();f.accept('r-tab-weapon');f.accept('wf-splatling');f.menus._setFocus(f.menus.bindings.get('w-s3-spinner-hypershort-01').el);
  assert.equal(s.onNav('tab_next'),true);assert.equal(f.menus._focus.dataset.id,'r-tab-tools');assert.equal(s.el.querySelector('.iwr-pause').dataset.tab,'tools');
  assert.equal(s.onNav('tab_prev'),true);assert.equal(f.menus._focus.dataset.id,'r-tab-tools');assert.equal(s.el.querySelector('.iwr-pause').dataset.tab,'weapon');assert(!f.menus._focus.hidden);s.onBack();assert.equal(f.session.local.weaponId,'shooter');assert.deepEqual(f.calls.map(c=>c.kind),['resume']);
});
