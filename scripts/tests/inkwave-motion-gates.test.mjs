import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateWalkingResult,validateWalkingReceipts,pixelDifference} from '../check-inkwave-motion.mjs';
import {validateDetailResult,validateDetailReceipts,pixelDifference as detailPixels} from '../check-inkwave-motion-detail.mjs';
import {walkingFixture,detailFixture} from './inkwave-motion-gate-fixtures.mjs';
// These fabricated records test the gates. Actual WebGL remains a separate gate.
test('walking accepts complete finite contacts and rejects missing or non-finite evidence',()=>{
 assert.equal(validateWalkingResult(walkingFixture()).length,10);
 const mutations=[
  r=>r.data[0].samples.forEach(s=>s.feet.forEach(f=>f.planted=false)),
  r=>r.data[0].samples[60].feet[0].ankleError=NaN,
  r=>r.data[0].samples[60].feet[0].nativeReachError=Infinity,
  r=>r.data[0].samples[60].feet[0].actual[0]=NaN,
  r=>r.data[0].samples.forEach(s=>s.moving=false),
  r=>r.data[0].samples.pop(),
  r=>r.data[0].renderMetrics[0].changedPixels=0,
  r=>r.data[0].renderMetrics[0].changedPixels=NaN,
  r=>r.data[0].renderMetrics.pop(),
  r=>r.data[0].renderMetrics[1].frame=r.data[0].renderMetrics[0].frame,
 ];
 for(const change of mutations){const record=walkingFixture();change(record);assert.throws(()=>validateWalkingResult(record));}
});
test('detail accepts valid semantic records and rejects original false-pass counterexamples',()=>{
 assert.equal(validateDetailResult(detailFixture()).length,14);
 const row=(r,n)=>r.data.find(c=>c.name===n);
 const mutations=[
  r=>r.pixelControls.dither=true,
  r=>delete r.pixelControls.target,
  r=>row(r,'flow-kid').renderMetrics[0].flowIsolation.nativeDepthOcclusion=false,
  r=>row(r,'flow-kid').renderMetrics[0].flowIsolation.maskedMaterials=0,
  r=>Object.assign(row(r,'flow-reset').samples[110].flow,{active:true,visible:true,opacity:1,aliveParticles:4,phase:'active'}),
  r=>row(r,'flow-reset').renderMetrics.find(m=>m.frame===110).flow.changedPixels=1,
  r=>row(r,'flow-kid').samples[45].flow.opacity=NaN,
  r=>row(r,'flow-kid').renderMetrics.find(m=>m.frame===45).flow.changedPixels=0,
  r=>delete row(r,'flow-kid').renderMetrics.find(m=>m.frame===45).flow.changedPixels,
  r=>row(r,'flow-kid').samples[170].flow.resources=99,
  r=>row(r,'shooter-recoil').samples.forEach(s=>s.rcP=0),
  r=>row(r,'shooter-recoil').events.pop(),
  r=>row(r,'shooter-recoil').events[1].frame++,
  r=>row(r,'shooter-recoil').samples[239].rcP=.01,
  r=>row(r,'shooter-recoil').samples[99].rcP=.04,
  r=>row(r,'charger-return').samples[110].aim=.7,
  r=>row(r,'charger-return').events[0].frame=79,
  r=>delete row(r,'charger-return').events[0].charge,
  r=>row(r,'bomb-standing').renderMetrics.find(m=>m.frame===30).releasedBomb.nearestLeft=.3,
  r=>delete row(r,'bomb-standing').releaseFrames[0].meshOriginError,
  r=>delete row(r,'flow-kid').renderMetrics[0].renderClocksStable,
  r=>row(r,'flow-kid').renderMetrics[0].renderClocksStable=false,
  r=>row(r,'bucket-repeat').renderMetrics[0].weapon.indexedVertices=0,
  r=>row(r,'bucket-repeat').renderMetrics[0].weapon.nearestRight=.3,
  r=>row(r,'flow-kid').renderMetrics[0].weapon.nearestLeft=.3,
  r=>delete row(r,'flow-kid').samples[21].gripWeights,
  r=>row(r,'flow-kid').samples[21].gripWeights.left=NaN,
  r=>row(r,'bucket-repeat').samples[50].ik[0]=NaN,
  r=>row(r,'blaster-repeat').samples[60].weapon.pump=1,
  r=>row(r,'splatling-coast').samples[419].weapon.barrelSpeed=1,
  r=>row(r,'flow-kid').disposed.resources=1,
  r=>row(r,'shooter-recoil').scenario.type='flow',
  r=>row(r,'flow-squid').renderMetrics.pop(),
 ];
 for(const change of mutations){const record=detailFixture();change(record);assert.throws(()=>validateDetailResult(record));}
 const free=detailFixture(),idle=row(free,'flow-kid');
 for(const metric of idle.renderMetrics){idle.samples[metric.frame].gripWeights.left=0;metric.weapon.nearestLeft=.44;}
 assert.equal(validateDetailResult(free).length,14,'a legitimately detached native support hand is not a missed weapon grip');
});
test('same-frame pixel comparison requires real RGB differences and a finite denominator',()=>{
 const a=new Uint8Array([10,20,30,255,10,20,30,255]),b=new Uint8Array([10,20,30,255,14,20,30,255]);
 assert.deepEqual(pixelDifference(a,b),{pixels:2,changedPixels:1,totalRgbDifference:4,maxChannelDifference:4});
 assert.deepEqual(pixelDifference(a,b),detailPixels(a,b));assert.equal(pixelDifference(a,a).changedPixels,0);
 assert.throws(()=>pixelDifference([],[]));assert.throws(()=>pixelDifference(a,b.slice(0,4)));assert.throws(()=>pixelDifference([NaN,0,0,255],[0,0,0,255]));
});
test('actual module receipt denominator is mandatory before passing publication',()=>{
 assert.throws(()=>validateWalkingReceipts([]));assert.throws(()=>validateDetailReceipts([]));
 validateWalkingReceipts(['/_versions/x/patches/splatoon3/runtime/walk.mjs','/_versions/x/src/game/character.js']);
 validateDetailReceipts(['bomb-motion','flow-motion','weapon-detail-motion'].map(n=>'/_versions/x/patches/splatoon3/runtime/'+n+'.mjs'));
});
test('CLI failure paths replace stale passed status with bounded failed diagnostics',()=>{
 const requested=process.env.INKWAVE_GATE_TEST_EVIDENCE||path.join(fileURLToPath(new URL('../../',import.meta.url)),'.ci-scratch/gate-unit');
 assert.ok(requested,'Set INKWAVE_GATE_TEST_EVIDENCE to persistent workspace storage');
 const physical=p=>fs.existsSync(p)?fs.realpathSync(p):path.join(physical(path.dirname(p)),path.basename(p));
 const base=physical(path.resolve(requested));assert.ok(!['/tmp','/var/tmp','/dev/shm'].some(p=>base===p||base.startsWith(p+'/')));fs.mkdirSync(base,{recursive:true});assert.equal(fs.realpathSync(base),base);
 const mock=fileURLToPath(new URL('./inkwave-motion-gate-mock.mjs',import.meta.url)),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 for(const kind of ['motion','motion-detail'])for(const fault of ['missing-receipts','cleanup','bad-manifest','missing-site']){
  const run=path.join(base,kind+'-'+fault),site=path.join(run,'site'),evidence=path.join(run,'evidence'),profile=path.join(run,'profile');fs.mkdirSync(site,{recursive:true});fs.mkdirSync(evidence,{recursive:true});
  const files=kind==='motion'?['patches/splatoon3/runtime/walk.mjs','src/game/character.js']:['bomb-motion','flow-motion','weapon-detail-motion'].map(n=>'patches/splatoon3/runtime/'+n+'.mjs');
  const artifacts={};for(const f of files){const key='_versions/fixture/'+f,file=path.join(site,key);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fabricated gate input\n');artifacts[key]=hash(fs.readFileSync(file));}
  fs.writeFileSync(path.join(site,'inkwave-build.json'),JSON.stringify({build:{revision:'fixture'},contentHash:fault==='bad-manifest'?'wrong':hash(JSON.stringify(artifacts)),artifacts}));
  fs.writeFileSync(path.join(evidence,kind+'-result.json'),JSON.stringify({status:'passed',stale:true}));
  const command=fileURLToPath(new URL('../check-inkwave-'+kind+'.mjs',import.meta.url));
  const child=spawnSync(process.execPath,[command,'--site',fault==='missing-site'?path.join(site,'missing'):site,'--evidence-dir',evidence,'--profile-dir',profile],{encoding:'utf8',timeout:10000,env:{...process.env,PLAYWRIGHT_MODULE:mock,INKWAVE_GATE_FAULT:fault}});
  assert.equal(child.status,1,kind+'/'+fault+': '+(child.stderr||child.error));
  const file=path.join(evidence,kind+'-result.json'),receipt=JSON.parse(fs.readFileSync(file));assert.equal(receipt.status,'failed');assert.equal(receipt.stale,undefined);assert.ok(receipt.message.length<=2500);assert.ok(receipt.errors.length<=20);assert.ok(fs.statSync(file).size<40000);
 }
});
