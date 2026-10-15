import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {nativeStageCatalog,NATIVE_ROOT,nativeStageIdentity} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {parseSourceOBJ} from '../runtime/source-convert.mjs';
import {nativeRankedComponent} from '../runtime/native-ranked.mjs';

const scratch=path.resolve(process.env.INKWAVE_TEST_SCRATCH||'.ci-scratch');fs.mkdirSync(scratch,{recursive:true});
test('independent catalog rejects unpinned and duplicate stages, preserves unavailable identity',()=>{
 const dir=fs.mkdtempSync(path.join(scratch,'stage-def-'));
 const spec={id:'probe',internal:'Vss_Probe00',name:'Probe',sourceSha256:'a'.repeat(64),tree:'b'.repeat(40),bounds:{minX:-10,minZ:-10,maxX:10,maxZ:10},spawnPads:[[0,1,-8],[0,1,8]],spawnBarrier:2.5,version1130Verified:false,placementStatus:'inferred test supports'};
 const write=s=>fs.writeFileSync(path.join(dir,'probe.json'),JSON.stringify(s));
 try{
  write(spec);assert.equal(nativeStageCatalog(dir).stages.at(-1).id,'probe');
  write({...spec,sourceSha256:'not-pinned'});assert.throws(()=>nativeStageCatalog(dir),/pinned source/);
  write({...spec,spawnPads:[[0,1,-80],[0,1,8]]});assert.throws(()=>nativeStageCatalog(dir),/inferred supports/);
  write({...spec,version1130Verified:true});assert.throws(()=>nativeStageCatalog(dir),/Invalid native stage/);
  write({...spec,availability:'placement-unavailable',reason:'No transforms',source:{repository:'kirakira-dev/KiTrix',commit:'c'.repeat(40),searchStatus:'checked'}});const c=nativeStageCatalog(dir);assert.equal(c.stages.length,5);assert.equal(c.unavailableStages[0].id,'probe');
  fs.rmSync(path.join(dir,'probe.json'));fs.writeFileSync(path.join(dir,'scorch.json'),JSON.stringify({...spec,id:'scorch'}));assert.throws(()=>nativeStageCatalog(dir),/Invalid native stage/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('definition bytes participate in native runtime identity',()=>{
 for(const f of fs.existsSync(path.join(NATIVE_ROOT,'definitions'))?fs.readdirSync(path.join(NATIVE_ROOT,'definitions')).filter(f=>f.endsWith('.json')):[])assert(nativeStageIdentity()['definitions/'+f]);
});
test('PntSet selection excludes other rules and background collision without altering attributes',()=>{
 const object=(name,start)=>`o ${name}\nv ${start} 0 0\nv ${start+1} 0 0\nv ${start} 0 1\nvn 0 1 0\nvn 0 1 0\nvn 0 1 0\nf ${start+1}//${start+1} ${start+3}//${start+3} ${start+2}//${start+2}\n`;
 const text=object('FldObj_Probe_PntSet_Floor',0)+object('FldObj_Probe_VclSet_Floor',3)+object('Fld_BGProbe_Floor',6)+object('FldObj_Probe_DistantScenery',9),plain=parseSourceOBJ(text),selected=parseSourceOBJ(text,{nonCollidableObjectPatterns:['^FldObj_Probe_Distant']});
 assert.deepEqual(selected.vertices,plain.vertices);assert.deepEqual(selected.indices,plain.indices);assert.equal(selected.objects[0].active,true);assert.equal(selected.objects[1].active,false);assert.equal(selected.objects[2].background,true);assert.equal(selected.objects[2].collidable,false);assert.equal(selected.objects[3].active,true);assert.equal(selected.objects[3].collidable,false);
});
test('ranked calibration selects a substantial component reachable from both teams',()=>{
 const nodes=Array.from({length:15},(_,id)=>({id,nb:[]})),valid=new Uint8Array(15).fill(1),link=(a,b)=>nodes[a].nb.push({to:b});
 for(let i=0;i<12;i++){link(i,(i+1)%12);link((i+1)%12,i);}link(12,13);link(13,12);link(12,0);link(14,0);
 const N={nodes,valid,validIds:nodes.map(n=>n.id)},chosen=nativeRankedComponent(N,nodes.map(n=>n.id),[12,14]);assert.equal(chosen.common.length,12);assert(chosen.common.every(id=>id<12));
 assert.throws(()=>nativeRankedComponent(N,[12,13],[0,14]),/component is too small/);
});
