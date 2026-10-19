import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { SUITES } from './config.mjs';
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
  assert(cache.has('tools/object-presentation-qa/production-scene.mjs'), 'Uses actual common Environment/Renderer setup');
  const source = fs.readFileSync(path.join(root, browserPath), 'utf8');
  assert.match(source, /export\s+async\s+function\s+run\s*\(/, 'Shared runner entry point');
  assert.match(source, /expectedFrames\s*:\s*[1-9]\d*/, 'Explicit expected PNG denominator');
  for (const file of SUITES[suite].before.concat(SUITES[suite].added)) assert(fs.statSync(path.join(root, file)).isFile());
});
