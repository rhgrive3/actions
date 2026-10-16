import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {validateGalFrames} from './gal-capture-contract.mjs';
const original=JSON.parse(fs.readFileSync(new URL('./source-frames.json',import.meta.url))).frames,clone=()=>structuredClone(original),find=(a,row)=>a.find(x=>x.role==='variant'&&x.rowId===row);
test('actual16source frames pass exact repaired costs and mounted tracking',()=>assert.equal(validateGalFrames(clone()).length,16));
for(const row of ['Shooter_Gravity_01','Shooter_Heavy_01']){
 test(row+' wrong draw rejected',()=>{const a=clone();find(a,row).drawCalls++;assert.throws(()=>validateGalFrames(a),/draw delta/);});
 test(row+' missing mounted follower rejected',()=>{const a=clone();delete find(a,row)[row==='Shooter_Gravity_01'?'charmMatrices':'labelMatrices'];assert.throws(()=>validateGalFrames(a),/mounted follower/);});
 test(row+' frozen mounted follower rejected',()=>{const a=clone(),x=find(a,row),r=(row==='Shooter_Gravity_01'?x.charmMatrices:x.labelMatrices)[0];r[row==='Shooter_Gravity_01'?'charm':'label'][12]+=.01;assert.throws(()=>validateGalFrames(a),/mounted follower matrix/);});
 test(row+' forged both matrices rejected by actual part',()=>{const a=clone(),x=find(a,row),r=(row==='Shooter_Gravity_01'?x.charmMatrices:x.labelMatrices)[0];r.can[12]+=.01;r[row==='Shooter_Gravity_01'?'charm':'label'][12]+=.01;assert.throws(()=>validateGalFrames(a),/actual mounted can/);});
}
test('duplicate tuple rejected',()=>{const a=clone();a[1]=a[0];assert.throws(()=>validateGalFrames(a),/duplicate/);});
test('missing tuple rejected',()=>assert.throws(()=>validateGalFrames(clone().slice(1))));
test('nonfinite follower rejected',()=>{const a=clone();find(a,'Shooter_Gravity_01').charmMatrices[0].charm[0]=NaN;assert.throws(()=>validateGalFrames(a));});
