import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeStageCatalog,prepareNativeStageBuild,NATIVE_ROOT} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {parseSourceOBJ} from '../runtime/source-convert.mjs';

const definition=JSON.parse(fs.readFileSync(path.join(NATIVE_ROOT,'definitions/mahi.json')));

test('revised Mahi is source-identified but excluded from playable catalogs until placements exist',()=>{
 const catalog=nativeStageCatalog(),blocked=catalog.unavailableStages.find(s=>s.id==='mahi');
 assert.deepEqual(blocked,definition);assert(!catalog.stages.some(s=>s.id==='mahi'));
 assert.equal(blocked.internal,'Vss_Hiagari04');assert.equal(blocked.availability,'placement-unavailable');
 assert.equal(blocked.sourceSha256,'fc8f7233063cdbe7b2bd821b30cbe60e94e7a20e6a5d60ce00ce9b272232d561');
 assert.equal(blocked.tree,'0aa56643280cbb4271142de95ecc1d95839f5839');
 assert.equal(blocked.source.commit,'0611f51b35c9736ee986fb2218461e2585b7875e');
 assert.equal(blocked.sourceEvidence.sceneInfoRow,'Vss_Hiagari04');
 assert.deepEqual(blocked.sourceEvidence.sceneInfoPreloadResources,['Model/FldObj_Hiagari04.bfres','Model/Fld_Hiagari04.bfres']);
 assert.equal(blocked.version1130Verified,false);assert.equal(blocked.sourceEvidence.waterStateAvailable,false);
 assert.equal(blocked.bounds,undefined);assert.equal(blocked.spawnPads,undefined);
 const build=prepareNativeStageBuild(null);assert(!build.config.stages.some(s=>s.id==='mahi'));
 assert.equal(build.config.unavailableStages.find(s=>s.id==='mahi').reason,definition.reason);
});

test('prepared assets cannot enable Mahi by supplying invented bounds or pads',()=>{
 const scratch=path.resolve('.ci-scratch');fs.mkdirSync(scratch,{recursive:true});
 const dir=fs.mkdtempSync(path.join(scratch,'mahi-gate-'));
 try{
  fs.writeFileSync(path.join(dir,'catalog.json'),JSON.stringify({schema:1,sourceCommit:definition.source.commit,stages:[{...definition,bounds:{minX:-80,minZ:-40,maxX:80,maxZ:40},spawnPads:[[-68,19.58,-26],[68,19.58,26]]}]}));
  assert.throws(()=>prepareNativeStageBuild(dir),/differs from reviewed stage definition: mahi/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Mahi prototype/scenery exclusions preserve complete original render streams and active core support',()=>{
 const names=['FldObj_Hiagari04FloatBallL_FldObj_Hiagari04FloatBallL__DVPoolFloat','FldObj_Hiagari04_AirPlane_AirPlane__JetPlaza00','Fld_Hiagari04_SmartCombine_24_1__StealthSurface'];
 const text=names.map((name,k)=>{const i=k*3;return `o ${name}\nv ${i} 0 0\nv ${i+1} 0 0\nv ${i} 0 1\nvn 0 1 0\nvn 0 1 0\nvn 0 1 0\nf ${i+1}//${i+1} ${i+3}//${i+3} ${i+2}//${i+2}\n`;}).join('');
 const raw=parseSourceOBJ(text),inferred=parseSourceOBJ(text,definition.sourceSemantics);
 assert.deepEqual(inferred.vertices,raw.vertices);assert.deepEqual(inferred.indices,raw.indices);
 assert(inferred.objects.every(o=>o.active));
 assert.equal(inferred.objects[0].collidable,false);assert.equal(inferred.objects[1].collidable,false);
 assert.equal(inferred.objects[2].collidable,true);assert.equal(inferred.objects[2].paintable,true);
});
