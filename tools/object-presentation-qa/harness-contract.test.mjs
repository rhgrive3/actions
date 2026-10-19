import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { BASE, SUITES, suiteBase } from './config.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
for (const suite of Object.keys(SUITES)) test(suite + ' browser harness statically links against the shared production helper', async () => {
  const context = vm.createContext({}), cache = new Map();
  const load = async relative => {
    if (cache.has(relative)) return cache.get(relative);
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const module = new vm.SourceTextModule(source, { context, identifier: relative });
    cache.set(relative, module);
    await module.link(async (specifier, parent) => {
      if (specifier === 'three') return new vm.SyntheticModule([], () => {}, { context, identifier: 'three' });
      assert(specifier.startsWith('./') || specifier.startsWith('../'), 'No unrecorded harness package dependency');
      const target = specifier.startsWith('./shared/')
        ? 'tools/object-presentation-qa/' + specifier.slice('./shared/'.length)
        : path.normalize(path.join(path.dirname(parent.identifier), specifier));
      assert(target.startsWith('tools/object-presentation-qa/'), 'Harness must use the common production helper');
      return load(target);
    });
    return module;
  };
  const browserPath = 'tools/' + suite + '-production-qa/browser.mjs';
  const module = await load(browserPath);
  assert.equal(module.status, 'linked', 'Imports resolve without evaluating a browser');
  if(suite==='spawner'){
    await module.evaluate();
    const THREE=await import('../../inkwave-public/vendor/three/build/three.module.js');
    const {buildSpawnerGeometry}=await import('../../patches/splatoon3/runtime/squid-spawn-presentation.mjs');
    const pod=new THREE.Group(),parts=buildSpawnerGeometry(THREE);
    for(const geometry of Object.values(parts))pod.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()));
    const camera=new THREE.PerspectiveCamera(25,1,.01,5000),target=new THREE.Vector3(0,.55,0);
    for(const dir of [[0,.05,1],[1,.05,0],[0,.05,-1],[.7,.45,1]]){
      camera.position.copy(target).add(new THREE.Vector3(...dir).normalize().multiplyScalar(module.namespace.SPAWNER_ACTOR_CAPTURE_DISTANCE));camera.lookAt(target);
      module.namespace.spawnerFrameBounds(THREE,camera,pod);
    }
    camera.position.copy(target).add(new THREE.Vector3(1,.05,0).normalize().multiplyScalar(6.3));camera.lookAt(target);
    assert.throws(()=>module.namespace.spawnerFrameBounds(THREE,camera,pod),/clips/,'old actor side camera crops the new lower skid');
    for(const [view,dir]of Object.entries({front:[0,.05,1],side:[1,.05,0],back:[0,.05,-1],oblique:[.7,.45,1]})){
      target.set(0,-.29,.09);camera.position.copy(target).add(new THREE.Vector3(...dir).normalize().multiplyScalar(3.5));camera.lookAt(target);
      module.namespace.spawnerFrameBounds(THREE,camera,pod);
    }
    pod.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  }
  if(suite==='rainmaker-air'){
    await module.evaluate();
    const {AIR_CAPTURE_FRAMES,verifyAirScenario}=module.namespace;
    const plan=JSON.parse(JSON.stringify(AIR_CAPTURE_FRAMES));
    assert.deepEqual(Object.keys(plan['carry-jump']),['109','112','113']);
    assert.deepEqual(Object.keys(plan['charge-jump']),['304','305']);
    assert.equal(Object.values(plan).reduce((n,frames)=>n+Object.keys(frames).length,0)*2*2,20,'five timeline points, two views, two revisions');
    const row={grip:.0001,translationWorld:.02,angle:.2,poses:1,solves:1,clamArmActive:false};
    const valid={landingFrames:48,landingFramesPerJump:[16,16,16],landingBadFrames:0,worstLanding:{grip:.0001},airFrames:84,airFramesPerJump:[28,28,28],sourceOwner:{status:'ready',active:true,variant:'Player00',bankSha256:'a'.repeat(64)},events:[{kind:'rainmaker-pickup'}],traces:[row],badFrames:0,worst:{grip:.0001}};
    assert.equal(verifyAirScenario(valid),true);
    assert.throws(()=>verifyAirScenario({...valid,landingFrames:47}),/16 landing/);
    for(const frames of [[],[16],[16,16],[16,16,16,16]])assert.throws(()=>verifyAirScenario({...valid,landingFramesPerJump:frames}),/16 landing/);
    assert.throws(()=>verifyAirScenario({...valid,landingFramesPerJump:[15,16,17]}),/16 landing/);
    assert.throws(()=>verifyAirScenario({...valid,landingBadFrames:1,worstLanding:{grip:.01}}),/landing frames keep world grip/,'real .01-world landing shortfall cannot pass');
    assert.throws(()=>verifyAirScenario({...valid,traces:[{...row,clamArmActive:true}]}),/Historical Clam helper/);
    const missingClamReceipt={...row};delete missingClamReceipt.clamArmActive;
    assert.throws(()=>verifyAirScenario({...valid,traces:[missingClamReceipt]}),/Historical Clam helper/);
    assert.throws(()=>verifyAirScenario({...valid,traces:[{...row,clamArmActive:true}]},{corrected:false}),/Historical Clam helper/,'old namespace must also keep Clam inactive');
    assert.throws(()=>verifyAirScenario({...valid,airFrames:83}),/28 airborne/);
    for(const frames of [[],[28],[28,28],[28,28,28,28]])assert.throws(()=>verifyAirScenario({...valid,airFramesPerJump:frames}),/28 airborne/);
    assert.throws(()=>verifyAirScenario({...valid,airFramesPerJump:[27,28,29]}),/28 airborne/);
    assert.throws(()=>verifyAirScenario({...valid,badFrames:1,worst:{grip:.01}}),/world grip/,'real .01-world shortfall cannot pass');
    assert.throws(()=>verifyAirScenario({...valid,traces:[{...row,translationWorld:.031}]}),/translation cap/);
    assert.throws(()=>verifyAirScenario({...valid,traces:[{...row,angle:.21}]}),/rotation cap/);
    assert.throws(()=>verifyAirScenario({...valid,traces:[{...row,solves:2}]}),/one pose/);
    assert.equal(verifyAirScenario({...valid,landingBadFrames:6,worstLanding:{grip:.01068}},{corrected:false}),true,'pre-fix landing negative can render without weakening after gate');
    assert.throws(()=>verifyAirScenario({...valid,badFrames:1,worst:{grip:.0133}},{corrected:false}),/world grip/,'accepted air contact remains mandatory even in the before lane');
  }
  if(suite==='rainmaker-form'){
    await module.evaluate();
    const {FORM_CAPTURE_PLAN,verifyFormScenario}=module.namespace;
    const plan=JSON.parse(JSON.stringify(FORM_CAPTURE_PLAN));
    assert.equal(plan.reduce((n,p)=>n+Object.values(p.frames).reduce((m,v)=>m+v.length,0),0)*2,20,'ten same-input camera pairs');
    assert.deepEqual(plan.find(p=>p.name==='shooter-lower').frames[3],['rear','side']);
    assert.deepEqual(plan.find(p=>p.name==='dualies-upper').frames[6],['rear','side']);
    const history=plan.find(p=>p.name==='dualies-upper-history-event');assert.equal(history.priorFullForm,true);assert.equal(history.deliveryAt,3);assert.deepEqual(history.frames[3],['rear','side']);
    const valid={deliveryAt:null,rows:Array.from({length:10},(_,i)=>({returnFrame:i,source:{status:'ready',active:true},poses:1,leftSolves:i<9?2:1,clamArmActive:false,pending:i<9,grip:.0001}))};
    assert.equal(verifyFormScenario(valid),true);
    for(const mutate of [r=>r.rows.pop(),r=>r.rows[0].returnFrame=1,r=>r.rows[0].poses=2,r=>r.rows[0].leftSolves=3,r=>r.rows[0].grip=.01,r=>r.rows[9].pending=true,r=>r.rows[0].source.active=false,r=>r.rows[0].source.active='yes',r=>delete r.rows[0].source.active,r=>r.rows[0].clamArmActive=true,r=>delete r.rows[0].clamArmActive]){const bad=JSON.parse(JSON.stringify(valid));mutate(bad);assert.throws(()=>verifyFormScenario(bad));}
    const old=JSON.parse(JSON.stringify(valid));for(const row of old.rows){row.pending=false;row.leftSolves=1;row.grip=.07;}assert.equal(verifyFormScenario(old,{corrected:false}),true,'old gap is measured without weakening after threshold');
  }
  assert(cache.has('tools/object-presentation-qa/production-scene.mjs'), 'Uses actual common Environment/Renderer setup');
  const source = fs.readFileSync(path.join(root, browserPath), 'utf8');
  assert.match(source, /export\s+async\s+function\s+run\s*\(/, 'Shared runner entry point');
  assert.match(source, /expectedFrames\s*:\s*[1-9]\d*/, 'Explicit expected PNG denominator');
  for (const file of SUITES[suite].before.concat(SUITES[suite].added)) assert(fs.statSync(path.join(root, file)).isFile());
});


test('landing comparison isolates8a903662 handoff while the original three baselines stay3839',()=>{
  for(const suite of ['spawner','rainmaker','clam'])assert.equal(suiteBase(suite),BASE);
  assert.equal(suiteBase('rainmaker-air'),'8a9036623038f051fbdeef1f5057a5b3950ccee6');
  assert.deepEqual(SUITES['rainmaker-air'].before,['patches/splatoon3/runtime/weapon-handoff-motion.mjs']);
  const candidateHandoff=fs.readFileSync(path.join(root,'patches/splatoon3/runtime/weapon-handoff-motion.mjs'),'utf8');
  assert.doesNotMatch(candidateHandoff,/import\s*\{\s*applyClamThrowGrip/,'staged handoff has no historical Clam helper dependency');
  assert.deepEqual(SUITES['rainmaker-air'].added,[]);
  const runner=fs.readFileSync(path.join(root,'tools/object-presentation-qa/run.mjs'),'utf8');
  assert.match(runner,/sourceSha:beforeBase/);
  assert.match(runner,/beforeBase,beforeDescription:/);
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/inkwave-object-presentation-qa.yml'),'utf8');
  assert.equal((workflow.match(/node scripts\/build-inkwave.mjs inkwave-public _site/g)||[]).length,1,'single production build');
  assert.match(workflow,/--suite rainmaker-air --out \.qa-evidence\/rainmaker\/air/);
  assert.equal((workflow.match(/patches\/splatoon3\/tests\/ranked-rainmaker-air-full-jump.test.mjs/g)||[]).length,2,'same full-jump driver runs in source and exact emitted lanes');
  assert(workflow.includes("'tools/rainmaker-air-production-qa/**'"),'dedicated harness changes trigger native QA');
});

test('form comparison adds only009 handoff baseline and one bounded same-build capture',()=>{
 assert.equal(suiteBase('rainmaker-form'),'00968835349cb8afac3803c412a48475e40bcae8');
 assert.deepEqual(SUITES['rainmaker-form'].before,['patches/splatoon3/runtime/weapon-handoff-motion.mjs']);assert.deepEqual(SUITES['rainmaker-form'].added,[]);
 const adapter=fs.readFileSync(path.join(root,'patches/local-quality/squid-form-ease-adapter.mjs'),'utf8');assert.match(adapter,/if\(this.character.s3RainmakerFormCapture\)this.character._captureRainmakerForm\?\.\(this\);/);
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/inkwave-object-presentation-qa.yml'),'utf8');assert.equal((workflow.match(/node scripts\/build-inkwave.mjs inkwave-public _site/g)||[]).length,1);assert.match(workflow,/--suite rainmaker-form --out \.qa-evidence\/rainmaker\/form/);assert.equal((workflow.match(/patches\/splatoon3\/tests\/ranked-rainmaker-form-owner.test.mjs/g)||[]).length,3,'trigger and source/emitted tests');
});
