import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {CURRENT_MENU_LAYOUT_SHA256,HISTORICAL_MENU_LAYOUT_SHA256,restoreReviewedMenuLayout,verifyMenuLayoutSourceIdentity} from '../lib/inkwave-menu-focus-source-identity.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const before=fs.readFileSync(new URL('../../patches/splatoon3/tests/fixtures/menu-layout-cache-1915-before.mjs.txt',import.meta.url),'utf8');
const current=fs.readFileSync(new URL('../../patches/splatoon3/runtime/menu-layout.mjs',import.meta.url),'utf8');

test('reviewed menu owner restores the complete independently frozen source and binds both exact epochs',()=>{
 assert.equal(hash(before),HISTORICAL_MENU_LAYOUT_SHA256);
 assert.equal(hash(current),CURRENT_MENU_LAYOUT_SHA256);
 assert.equal(restoreReviewedMenuLayout(current),before);
 assert.equal(verifyMenuLayoutSourceIdentity(before,hash(before),hash(before)).epoch,'historical-stage-picker');
 assert.equal(verifyMenuLayoutSourceIdentity(current,hash(current),hash(before)).epoch,'a1381283-screen-owned-caches');
 const pins=JSON.parse(fs.readFileSync(new URL('../inkwave-menu-focus-pins.json',import.meta.url)));
 assert.equal(pins.inputs['patch/runtime/menu-layout.mjs'],hash(before),'original focus fixture pin is unchanged');
});

test('changed source, mismatched build input and relabelled historical identity remain rejected',()=>{
 assert.throws(()=>verifyMenuLayoutSourceIdentity(current,hash(before),hash(before)),/actual repository source bytes/);
 assert.throws(()=>verifyMenuLayoutSourceIdentity(current+'\n',hash(current+'\n'),hash(before)),/Reviewed current/);
 assert.throws(()=>verifyMenuLayoutSourceIdentity(current,hash(current),hash(current)),/Frozen menu focus/);
});

test('each reviewed menu owner site is exact once; drop, duplicate and semantic tamper cannot restore',()=>{
 const anchors=[
  "  const modeRow = scr.el.querySelector('.iw-modesel__row');",
  '      if (i < 0 || row?.isConnected === false || cards.some(card => card.parentNode !== row)) return onNav?.(dir);',
  "    for (const c of cards) { const hidden = key !== 'all' && c.dataset.cat !== key; if (c.hidden !== hidden) c.hidden = hidden; }",
 ];
 for(const anchor of anchors){
  assert.equal(current.split(anchor).length,2,'independently identified owner site');
  assert.throws(()=>restoreReviewedMenuLayout(current.replace(anchor,'')),/exactly one reviewed owner site/);
  assert.throws(()=>restoreReviewedMenuLayout(current.replace(anchor,anchor+'\n'+anchor)),/exactly one reviewed owner site|complete frozen source epoch/);
 }
 assert.throws(()=>restoreReviewedMenuLayout(current.replace('card.parentNode !== row','card.parentNode === row')),/exactly one reviewed owner site/);
});
