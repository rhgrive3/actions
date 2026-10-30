import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertLandscapeWeaponHeader} from '../../../scripts/lib/assert-landscape-weapon-header.mjs';

function fixture() {
  return {
    section:{left:700,top:26,right:824,bottom:50},
    count:{text:'1 / 161',rect:{left:770,top:26,right:824,bottom:50}},
    back:{rect:{left:20,top:15,right:64,bottom:59,width:44,height:44},hit:true},
    titleText:[{left:80,top:12,right:140,bottom:40}],
    subtitleText:[{left:80,top:44,right:420,bottom:58}],
    grid:{gap:[14,14],padding:[8,8,8,8]},
    focus:{transform:'none',shadow:'rgba(255, 255, 255, 0.2) 0px 0px 0px 2px inset, rgb(255, 255, 255) 0px 0px 0px 2px, rgb(21, 18, 28) 0px 0px 0px 4px, rgba(1, 2, 3, 0.5) 0px 0px 0px 6px'},
  };
}
const page = metrics => ({evaluate:async()=>metrics});
const viewport = {width:844,height:390};

test('weapon header metrics retain separated text/count/back and bounded focus frame', async () => {
  const metrics = fixture();
  assert.equal(await assertLandscapeWeaponHeader(page(metrics),viewport),metrics);
  await assertLandscapeWeaponHeader(page(metrics),{width:1133,height:744});
});
test('weapon header assertion rejects text/count overlap and obscured Back', async () => {
  const overlap = fixture(); overlap.subtitleText[0].right = 720;
  await assert.rejects(assertLandscapeWeaponHeader(page(overlap),viewport),/count overlaps header text/);
  const obscured = fixture(); obscured.back.hit = false;
  await assert.rejects(assertLandscapeWeaponHeader(page(obscured),viewport),/back target obscured/);
});
test('weapon focus assertion rejects old 9px frame and undersized grid gutter', async () => {
  const wide = fixture(); wide.focus.shadow = wide.focus.shadow.replace('0px 0px 0px 6px','0px 0px 0px 9px');
  await assert.rejects(assertLandscapeWeaponHeader(page(wide),viewport),/bounded 6px/);
  const narrow = fixture(); narrow.grid.gap = [12,12];
  await assert.rejects(assertLandscapeWeaponHeader(page(narrow),viewport),/card gutter/);
});
