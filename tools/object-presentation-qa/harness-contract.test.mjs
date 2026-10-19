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
    const valid={airFrames:84,airFramesPerJump:[28,28,28],sourceOwner:{status:'ready',active:true,variant:'Player00',bankSha256:'a'.repeat(64)},events:[{kind:'rainmaker-pickup'}],traces:[row],badFrames:0,worst:{grip:.0001}};
    assert.equal(verifyAirScenario(valid),true);
    assert.throws(()=>verifyAirScenario({...valid,traces:[{...row,clamArmActive:true}]}),/Historical Clam helper/);
    const missingClamReceipt={...row};delete missingClamReceipt.clamArmActive;
    assert.throws(()=>verifyAirScenario({...valid,traces:[missingClamReceipt]}),/Historical Clam helper/);
    assert.throws(()=>verifyAirScenario({...valid,traces:[{...row,clamArmActive:true}]},{corrected:false}),/Historical Clam helper/,'old namespace must also keep Clam inactive');
    assert.throws(()=>verifyAirScenario({...valid,airFrames:83}),/28 airborne/);
    assert.throws(()=>verifyAirScenario({...valid,airFramesPerJump:[27,28,29]}),/28 airborne/);
    assert.throws(()=>verifyAirScenario({...valid,badFrames:1,worst:{grip:.01}}),/world grip/,'real .01-world shortfall cannot pass');
    assert.throws(()=>verifyAirScenario({...valid,traces:[{...row,translationWorld:.031}]}),/translation cap/);
    assert.throws(()=>verifyAirScenario({...valid,traces:[{...row,angle:.21}]}),/rotation cap/);
    assert.throws(()=>verifyAirScenario({...valid,traces:[{...row,solves:2}]}),/one pose/);
    assert.equal(verifyAirScenario({...valid,badFrames:35,worst:{grip:.0133}},{corrected:false}),true,'historical negative can render without weakening after gate');
  }
  assert(cache.has('tools/object-presentation-qa/production-scene.mjs'), 'Uses actual common Environment/Renderer setup');
  const source = fs.readFileSync(path.join(root, browserPath), 'utf8');
  assert.match(source, /export\s+async\s+function\s+run\s*\(/, 'Shared runner entry point');
  assert.match(source, /expectedFrames\s*:\s*[1-9]\d*/, 'Explicit expected PNG denominator');
  for (const file of SUITES[suite].before.concat(SUITES[suite].added)) assert(fs.statSync(path.join(root, file)).isFile());
});


test('air comparison isolates381319 handoff and its historical helper dependency while the original three baselines stay3839',()=>{
  for(const suite of ['spawner','rainmaker','clam'])assert.equal(suiteBase(suite),BASE);
  assert.equal(suiteBase('rainmaker-air'),'381319e16361497c6bb5f4649ce119acd7883f7f');
  assert.deepEqual(SUITES['rainmaker-air'].before,['patches/splatoon3/runtime/weapon-handoff-motion.mjs','patches/splatoon3/runtime/bomb-motion.mjs']);
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
