import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));

test('static range trial preserves pixels but raises draw calls; dynamic bounds cull before uploads',
  { skip: !process.env.INKWAVE_CHROMIUM_PATH }, async t => {
    const { chromium } = await import(process.env.INKWAVE_PLAYWRIGHT_MODULE || 'playwright');
    const trialModule = await fs.readFile(path.join(root, 'patches/local-quality/tests/fixtures/static-source-batches.mjs'), 'utf8');
    const adaptStaticDrawCounterfactual = new Function(trialModule.slice(trialModule.indexOf('export function adaptStaticDrawCounterfactual')).replace('export ', '') + '\nreturn adaptStaticDrawCounterfactual;')();
    const environment = "import {createStaticDrawBatches} from '/patches/local-quality/tests/fixtures/static-source-batches.mjs';\n" + adaptStaticDrawCounterfactual(adaptBuildSource('src/world/environment.js', await fs.readFile(path.join(root, 'inkwave-public/src/world/environment.js'), 'utf8')));
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        res.setHeader('content-type', 'text/javascript');
        if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<script type="importmap">{"imports":{"three":"/inkwave-public/vendor/three/build/three.module.js","three/addons/":"/inkwave-public/vendor/three/jsm/"}}</script>'); return; }
        if (url.pathname === '/inkwave-public/src/world/environment-candidate.js') { res.end(environment); return; }
        const pathname = decodeURIComponent(url.pathname).replace(/^\/inkwave-public\/patches\//, '/patches/');
        const file = path.resolve(root, '.' + pathname);
        if (!file.startsWith(root)) throw Error('outside root');
        res.end(await fs.readFile(file));
      } catch { res.statusCode = 404; res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch({ executablePath: process.env.INKWAVE_CHROMIUM_PATH, headless: true,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port);
    const receipt = await page.evaluate(async () => {
      const THREE = await import('three');
      const { Environment } = await import('/inkwave-public/src/world/environment-candidate.js');
      const { setPropInstanceEnvelope } = await import('/inkwave-public/src/world/render-bounds.js');
      const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setSize(128, 96);
      const target = new THREE.WebGLRenderTarget(128, 96), camera = new THREE.PerspectiveCamera(65, 128 / 96, .1, 30000);
      const after = new THREE.Scene();
      class Scenery extends Environment {
        _stageMarina() { return false; } _buildSky() {} _buildSea() {}
        _buildDock() { this.moored = []; this._foamShapes = []; }
        _buildFoamField() {} setTheme() {}
      }
      const env = new Scenery(renderer, after, { shadowSize: 128 });
      for (const u of Object.values(env.U)) if (u.value?.isColor) u.value.setRGB(.45, .6, .8);
      env.U.uSunDir.value.set(.3, 1, .4).normalize(); env.U.uNight.value = .3;
      const before = new THREE.Scene(); before.fog = after.fog.clone();
      for (const object of after.children) if (object !== env.root) before.add(object.clone());
      const baselineRoot = new THREE.Group(); before.add(baselineRoot);
      for (const object of env.root.children) {
        let copy;
        if (object.isGroup && object.geometry) { copy = new THREE.Mesh(object.geometry, object.material); copy.name = object.name; }
        else copy = object.clone();
        copy.frustumCulled = false; baselineRoot.add(copy);
      }
      const pixels = [new Uint8Array(128 * 96 * 4), new Uint8Array(128 * 96 * 4)], frames = [];
      renderer.setRenderTarget(target); renderer.setClearColor(0x152030, 1);
      camera.position.set(0, 8, 0);
      for (let view = 0; view < 10; view++) {
        const angle = view * Math.PI / 4;
        camera.lookAt(view === 8 ? new THREE.Vector3(0, 300, 0) : view === 9 ? new THREE.Vector3(0, -300, 0) : new THREE.Vector3(Math.cos(angle) * 500, 10, Math.sin(angle) * 500));
        const draws = [];
        for (const [index, scene] of [before, after].entries()) {
          renderer.render(scene, camera); draws.push({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
          renderer.readRenderTargetPixels(target, 0, 0, 128, 96, pixels[index]);
        }
        for (let byte = 0; byte < pixels[0].length; byte++) if (pixels[0][byte] !== pixels[1][byte]) throw Error('scenery pixel mismatch view=' + view + ' byte=' + byte + ' values=' + pixels[0][byte] + '/' + pixels[1][byte]);
        frames.push(draws);
      }
      // Independent actual PropKit material buckets, not scenery evidence.
      const {PropKit} = await import('/inkwave-public/src/world/props.js');
      const {dressingFor} = await import('/inkwave-public/src/world/dressing.js');
      const {createStaticDrawBatches} = await import('/patches/local-quality/tests/fixtures/static-source-batches.mjs');
      const propTrials=[];
      for(const stage of ['tidewater','cargo']) {
        const owner=new THREE.Scene(), kit=new PropKit(owner,{quality:'high',castShadow:false});
        for(const placement of dressingFor(stage))kit.add(placement.type,placement);kit.build();
        const controls=[new THREE.Scene(),new THREE.Scene()];
        for(const scene of controls){scene.add(new THREE.HemisphereLight(0xffffff,0x778899,2));}
        let split=0;
        for(const source of kit._meshes){
          controls[0].add(source.clone());
          const trial=createStaticDrawBatches(source.geometry,source.material);
          trial.name=source.name;trial.receiveShadow=source.receiveShadow;trial.castShadow=source.castShadow;trial.renderOrder=source.renderOrder;
          split+=trial.isGroup?1:0;controls[1].add(trial);
        }
        const views=[];camera.position.set(0,5,0);
        for(let view=0;view<8;view++){
          const angle=view*Math.PI/4;camera.lookAt(Math.cos(angle)*50,3,Math.sin(angle)*50);
          const counts=[];
          for(let i=0;i<2;i++){renderer.render(controls[i],camera);counts.push({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles});renderer.readRenderTargetPixels(target,0,0,128,96,pixels[i]);}
          let differences=0;for(let byte=0;byte<pixels[0].length;byte++)if(pixels[0][byte]!==pixels[1][byte])differences++;
          views.push({counts,differences});
        }
        propTrials.push({stage,placements:dressingFor(stage).length,materialBuckets:kit._meshes.length,split,views});kit.dispose();
      }
      // Exercise actual renderer upload ordering, using real PropKit bounds.
      const scenes = [new THREE.Scene(), new THREE.Scene()], meshes = [];
      for (let i = 0; i < 2; i++) {
        const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x3399ff }), 1);
        const m = new THREE.Matrix4().makeTranslation(20, 0, 0); mesh.setMatrixAt(0, m);
        mesh.userData = { recs: [{ m }] }; mesh.frustumCulled = false;
        if (i === 1) setPropInstanceEnvelope(mesh);
        scenes[i].add(mesh); meshes.push(mesh);
      }
      camera.position.set(0, 0, 0); camera.lookAt(20, 0, 0);
      scenes.forEach(scene => renderer.render(scene, camera)); // allocate both independent attributes
      const gl = renderer.getContext(), subData = gl.bufferSubData, uploads = [0, 0]; let owner = 0;
      gl.bufferSubData = function (...args) { if (args[0] === gl.ARRAY_BUFFER) uploads[owner]++; return subData.apply(this, args); };
      camera.lookAt(-20, 0, 0);
      for (let frame = 0; frame < 12; frame++) for (let i = 0; i < 2; i++) {
        meshes[i].setMatrixAt(0, new THREE.Matrix4().makeTranslation(20, frame * .001, 0)); meshes[i].instanceMatrix.needsUpdate = true;
        owner = i; renderer.render(scenes[i], camera);
      }
      gl.bufferSubData = subData;
      camera.lookAt(20, 0, 0);
      scenes.forEach((scene, i) => { renderer.render(scene, camera); renderer.readRenderTargetPixels(target, 0, 0, 128, 96, pixels[i]); });
      for (let byte = 0; byte < pixels[0].length; byte++) if (pixels[0][byte] !== pixels[1][byte]) throw Error('stale first visible instance frame ' + byte);
      const result = { browser: navigator.userAgent, frames, uploads, propTrials,
        staticBatches: ['terrain', 'staticScenery', 'city'].map(key => [key, env[key].isGroup ? env[key].children.length : 1]) };
      renderer.dispose(); target.dispose(); return result;
    });
    assert.ok(receipt.uploads[0] >= 12); assert.equal(receipt.uploads[1], 0);
    assert.ok(receipt.frames.some(([before, after]) => after.triangles < before.triangles));
    assert.ok(receipt.frames.every(([before, after]) => after.calls > before.calls), 'reject this default split: every tested view increases submissions');
    assert.equal(receipt.propTrials.length,2);
    for(const trial of receipt.propTrials){assert.ok(trial.placements>0&&trial.split>0);assert.ok(trial.views.every(v=>v.differences===0&&v.counts[1].calls>v.counts[0].calls),'reject this actual PropKit source-range split: submissions rise at every view');}
    t.diagnostic(JSON.stringify(receipt));
  });
