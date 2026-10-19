import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {brandMuralReference,MURAL_BRANDING_DRAWS}from '../lib/inkwave-mural-branding-reference.mjs';
const raw=fs.readFileSync(new URL('../../inkwave-public/src/world/murals.js',import.meta.url),'utf8');
test('only three independently reviewed text draws change; every other byte remains',()=>{
 const expected=raw.replace("strokeText('INKWAVE', ox + 300, 186)","strokeText('ZEVANT', ox + 300, 186)").replace("fillText('INKWAVE', ox + 300, 186)","fillText('ZEVANT', ox + 300, 186)").replace("fillText('INKWAVE', ox + 294, 180)","fillText('ZEVANT', ox + 294, 180)");
 const actual=brandMuralReference(raw);assert.equal(actual,expected);let reversed=actual;for(const old of MURAL_BRANDING_DRAWS)reversed=reversed.replace(old.replace("'INKWAVE'","'ZEVANT'"),old);assert.equal(reversed,raw);
 assert.ok(actual.includes('H = 2048'));assert.ok(!actual.includes('FULL_H'));assert.ok(!actual.includes('tex.dispose(); // WebGL allocation'));
});
test('unknown, missing, duplicate, partial and prebranded sources reject',()=>{
 for(const input of [raw+'\n// unknown',raw.replace(MURAL_BRANDING_DRAWS[0],''),raw+'\n'+MURAL_BRANDING_DRAWS[0],raw.replace('ox + 300, 186','ox + 300, 187'),brandMuralReference(raw)])assert.throws(()=>brandMuralReference(input),/unreviewed raw/);
});
test('browser test retains zero-pixel gate and independent unbranded negative control',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-seven-claims.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("check(sharedPixelDifference===0,'original shared pixels '+sharedPixelDifference)"));
 assert.ok(source.includes('unbrandedSharedPixelDifference>0'));assert.ok(source.includes("pixelDiff(atlas.image,baseline.image,2048)===0"));
 assert.ok(!source.includes('adaptMuralAtlas('));assert.ok(!source.includes('composeSource('));
});
