import * as THREE from 'three';
import {GLTFLoader} from '/qa/three/loaders/GLTFLoader.js';
const check = (v, m) => { if (!v) throw Error(m); };
const memory = renderer => ({geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures});
function resources(root) { const geometry = new Set(), material = new Set(), texture = new Set(); root.traverse(o => { if (o.geometry) geometry.add(o.geometry); for (const m of (Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])) { material.add(m); for (const value of Object.values(m)) if (value?.isTexture) texture.add(value); } }); return {geometry, material, texture}; }
function dispose(root) { const r = resources(root); for (const g of r.geometry) g.dispose(); for (const m of r.material) m.dispose(); const images = new Set(); for (const t of r.texture) { t.dispose(); if (t.image?.close) images.add(t.image); } for (const im of images) im.close(); return Object.fromEntries(Object.entries(r).map(([k, s]) => [k, s.size])); }
function changed(a, b) { let count = 0; for (let i = 0; i < a.length; i += 4) if (Math.max(...[0,1,2].map(k => Math.abs(a[i+k] - b[i+k]))) >= 3) count++; return count; }
export async function run(config) {
  check(THREE.REVISION === '186', 'runtime must be r186');
  const {G} = await import(config.prefix + 'src/core/ctx.js');
  const profile = await fetch(config.prefix + 'patches/splatoon3/profile.json').then(r => { check(r.ok, 'profile load'); return r.json(); });
  const {install} = await import(config.prefix + 'patches/splatoon3/runtime/install.mjs'); install(profile);
  const {Character} = await import(config.prefix + 'src/game/character.js');
  const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true}); renderer.setSize(640,480); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = .94; renderer.info.autoReset = false; renderer.shadowMap.type = THREE.PCFSoftShadowMap; document.body.appendChild(renderer.domElement);
  const gl = renderer.getContext(); check(!gl.isContextLost(), 'WebGL context');
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#38404c');
  const camera = new THREE.OrthographicCamera(-2.35,2.35,1.7625,-1.7625,.01,30);
  Object.assign(G, {scene, camera, renderer, settings: {quality: 'high', shadows: false}, mode: 'match', actors: [], time: 0});
  const hemi = new THREE.HemisphereLight('#f4f6ff','#485266',2.2); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2dd',2.5); sun.position.set(3,5,4); sun.castShadow = true; sun.shadow.mapSize.set(512,512); Object.assign(sun.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.1,far:20}); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.MeshStandardMaterial({color:'#6b7484',roughness:1})); floor.rotation.x=-Math.PI/2; floor.position.y=-.01; floor.receiveShadow=true; scene.add(floor);
  const witnesses=[];
  const state={form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},firing:false,charge:0,ink:1,hp:1,vy:0};
  for(let i=0;i<8;i++){const c=new Character({name:'asset-qa-runtime-witness-'+i,weapon:'shooter',sourceMotion:false,style:{hair:0,skin:2,outfit:0,eyes:0}});c.onEvent=null;c.setLod('game');scene.add(c.root);for(let f=0;f<60;f++)c.update(1/60,state);check(c.skeleton.bones.length===87,'actual canonical Character rig');witnesses.push(c);}
  function setWitnessCount(count){for(let i=0;i<witnesses.length;i++){const c=witnesses[i];c.root.visible=i<count;c.root.position.set(count===1?-1.65:(i%4)*.85-1.3,0,count===1?0:-.65-Math.floor(i/4)*.65);}}
  setWitnessCount(1);
  function view(name) { const a={front:0,side65:65,back:180}[name]*Math.PI/180; camera.position.set(6*Math.sin(a),2.0,6*Math.cos(a)); camera.lookAt(0,1.02,0); camera.updateMatrixWorld(true); }
  function lighting(name, shadows) { hemi.intensity=name==='day'?2.2:.5; sun.intensity=name==='day'?2.5:.7; sun.color.set(name==='day'?'#fff2dd':'#b3ccff'); renderer.shadowMap.enabled=shadows; G.settings.shadows=shadows; }
  function render() { renderer.info.reset(); renderer.render(scene,camera); gl.finish(); check(!gl.isContextLost(),'WebGL context retained'); return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}; }
  function pixels() { const a=new Uint8Array(640*480*4); gl.readPixels(0,0,640,480,gl.RGBA,gl.UNSIGNED_BYTE,a); check(gl.getError()===gl.NO_ERROR,'WebGL readback'); return a; }
  const loader = new GLTFLoader();
  let active = null;
  async function load(count) {
    setWitnessCount(count);const start=performance.now(); const response=await fetch('/qa/candidate.glb'); check(response.ok,'candidate fetch'); const data=await response.arrayBuffer();
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join(''); check(digest===config.asset.sha256,'browser candidate hash');
    const gltf=await loader.parseAsync(data,location.origin+'/qa/'); const root=gltf.scene; let meshes=0,triangles=0,uv2=0; root.updateMatrixWorld(true);
    root.traverse(o=>{if(!o.isMesh)return;meshes++;const g=o.geometry;triangles+=(g.index?g.index.count:g.attributes.position.count)/3;check(g.attributes.uv,'decoded UV0');if(g.attributes.uv1)uv2++;o.castShadow=true;o.receiveShadow=true;for(const m of(Array.isArray(o.material)?o.material:[o.material])){check(m.isMeshPhysicalMaterial,'r186 physical material');check([m.map,m.emissiveMap,m.clearcoatMap].every(t=>t?.image?.width>0&&t.image.height>0&&t.channel===1),'three actual images decoded on UV1');check(m.map.colorSpace===THREE.SRGBColorSpace&&m.emissiveMap.colorSpace===THREE.SRGBColorSpace,'color maps sRGB');check(m.clearcoatMap.colorSpace===THREE.NoColorSpace,'clearcoat linear');}});
    check(meshes===1&&triangles===config.asset.triangles&&uv2===1,'decoded mesh/triangle/UV1 denominator');
    const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());const scale=.66/Math.max(size.x,size.y,size.z);check(Number.isFinite(scale)&&scale>0,'bounded asset');
    const batch=new THREE.Group();batch.name='qa-candidate-batch';
    for(let i=0;i<count;i++){const pivot=new THREE.Group(),clone=root.clone(true);clone.position.sub(center);pivot.add(clone);pivot.scale.setScalar(scale);pivot.position.set(count===1?.5:(i%4)*.6-.7, count===1?1.0:Math.floor(i/4)*.8+.58,0);batch.add(pivot);}
    scene.add(batch); active={batch,root,loadMs:performance.now()-start}; return active;
  }
  function unload() { if(!active)return null;scene.remove(active.batch);active.batch.clear();const result=dispose(active.root);active=null;renderer.renderLists.dispose();render();return result; }
  const rows=[], lifecycle=[], images=[];
  try {
    view('front');lighting('day',false);render();const withWitness=pixels();setWitnessCount(0);render();const withoutWitness=pixels();setWitnessCount(1);check(changed(withWitness,withoutWitness)>100,'built Character generated visible pixels');
    for(const count of [1,8]) {
      const loaded=await load(count);const t=performance.now();await renderer.compileAsync(scene,camera);const compileMs=performance.now()-t;
      for(const light of ['day','shade'])for(const angle of ['front','side65','back'])for(const shadows of [false,true]) {
        lighting(light,shadows);view(angle);render();render();const timing=[];let info;
        for(let frame=0;frame<12;frame++){const start=performance.now();info=render();timing.push(performance.now()-start);}timing.sort((a,b)=>a-b);
        const full=pixels(),png=renderer.domElement.toDataURL('image/png');loaded.batch.visible=false;render();const hidden=pixels();loaded.batch.visible=true;render();
        const row={count,nativeCharacters:witnesses.filter(c=>c.root.visible).length,light,view:angle,shadows,...info,loadMs:loaded.loadMs,compileMs,p50Ms:timing[6],p95Ms:timing[11],renderSamples:12,changedPixels:changed(full,hidden),memory:memory(renderer)};check(row.changedPixels>=16,'visible asset '+JSON.stringify(row));rows.push(row);images.push({name:`${count}-${light}-${angle}-${shadows?'shadow':'no-shadow'}`,png});
      }
      unload();
    }
    // Warm all pass allocations before comparing retained counts across repeated fresh parses.
    view('front');lighting('day',true);await load(8);await renderer.compileAsync(scene,camera);render();unload();
    for(let cycle=0;cycle<10;cycle++){const count=cycle%2?8:1;await load(count);render();const memoryLoaded=memory(renderer);const disposed=unload();lifecycle.push({cycle,count,memoryLoaded,disposed,memoryAfter:memory(renderer),remainingCandidates:scene.children.filter(o=>o.name==='qa-candidate-batch').length});}
    const debug=gl.getExtension('WEBGL_debug_renderer_info');return {status:'passed',threeRevision:THREE.REVISION,assetMode:config.assetMode,asset:config.asset,contentHash:config.contentHash,buildRevision:config.buildRevision,witnessBones:witnesses.map(c=>c.skeleton.bones.length),witnessVisiblePixels:changed(withWitness,withoutWitness),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),rows,lifecycle,images,measurementKind:'Real WebGL using 1/8 built game Characters plus 1/8 static-asset probes and r186, isolated fixture; not full-game or adopted-character visual acceptance.'};
  } finally {unload();for(const c of witnesses)c.dispose();floor.geometry.dispose();floor.material.dispose();sun.shadow.map?.dispose();renderer.dispose();}
}
