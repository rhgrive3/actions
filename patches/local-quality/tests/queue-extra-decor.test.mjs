import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {geometryFixture} from './geometry-build-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptQueueExtraDecor} from '../queue-extra-decor-adapter.mjs';

const raw=fs.readFileSync(new URL('../../../inkwave-public/src/world/decor.js',import.meta.url),'utf8');
const oracle=JSON.parse(fs.readFileSync(new URL('./fixtures/extra-decor-before.json',import.meta.url)));
let final=adaptBuildSource('src/world/decor.js',raw);
if(!final.includes('const padShapes = this._queuePadShapes'))final=adaptQueueExtraDecor('src/world/decor.js',final);
const oldPads=final.slice(final.indexOf('  _buildPads() {'),final.indexOf('  // Flare',final.indexOf('  _buildPads() {')));
const oldPalms=final.slice(final.indexOf('  _buildPalms() {'),final.indexOf('\n  _buildFlags()',final.indexOf('  _buildPalms() {')));
const baseline=final.replace(oldPads,oracle.pads).replace(oldPalms,oracle.palms);
const api=await geometryFixture();
const THREE=api.THREE;
async function load(source,namespace=THREE,G={actors:[]}) {
  const context=vm.createContext({console,Math});
  const three=new vm.SyntheticModule(Object.keys(namespace),function(){for(const [k,v]of Object.entries(namespace))this.setExport(k,v);},{context});
  const bus=new vm.SyntheticModule(['G'],function(){this.setExport('G',G);},{context});
  const util=new vm.SourceTextModule(fs.readFileSync(new URL('../../../inkwave-public/vendor/three/jsm/utils/BufferGeometryUtils.js',import.meta.url),'utf8'),{context});
  await util.link(()=>three);await util.evaluate();
  const stageArt=new vm.SyntheticModule(['createMap3Art'],function(){this.setExport('createMap3Art',()=>{throw Error('Generic Decor fixture must not request MAP3 stage art');});},{context});
  const mod=new vm.SourceTextModule(source,{context});
  await mod.link(spec=>spec==='three'?three:spec.includes('BufferGeometryUtils')?util:spec.endsWith('/map3-art.js')?stageArt:bus);await mod.evaluate();
  return {Decor:mod.namespace.Decor,G};
}
const A=await load(baseline),B=await load(final);
const hash=a=>crypto.createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
function snapshot(decor) {
  decor.group.updateMatrixWorld(true);
  const rows=[];decor.group.traverse(o=>{if(!o.geometry)return;const g=o.geometry;g.computeBoundingSphere();rows.push({name:o.name,type:o.type,matrix:o.matrixWorld.toArray(),index:g.index&&hash(g.index.array),attributes:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,{itemSize:a.itemSize,normalized:a.normalized,hash:hash(a.array)}])),sphere:{radius:g.boundingSphere.radius,center:g.boundingSphere.center.toArray()},cast:o.castShadow,receive:o.receiveShadow});});
  return rows;
}
// This before/after oracle owns generic pads, lamps, palms and flags. MAP3's new
// art owner has its own real-geometry tests; do not call it only on the after side.
function create(C,level) {const generic=Object.create(level);generic.layout={...level.layout,map3:undefined};return new C(new THREE.Scene(),generic,{emblem:new THREE.Texture(),flagTex:new THREE.Texture()});}

test('actual Decor on all five legacy layouts preserves every geometry byte, transform and separate team uniforms',()=>{
  for(const id of ['tidewater','kelpline','halyard','cargo','range']) {
    const level=new api.Level(api.MAP_LAYOUTS[id]);
    const a=create(A.Decor,level),b=create(B.Decor,level);
    assert.deepEqual(snapshot(b),snapshot(a),id);
    const faces=b.pads.map(p=>p.g.getObjectByName('spawnPad:face')),bars=b.pads.map(p=>p.g.getObjectByName('spawnPad:barrier'));
    assert.equal(faces[0].geometry,faces[1].geometry);assert.equal(bars[0].geometry,bars[1].geometry);
    assert.notEqual(faces[0].material,faces[1].material);assert.notEqual(bars[0].material,bars[1].material);
    assert.notEqual(b.pads[0].padMat.uniforms.uPulse,b.pads[1].padMat.uniforms.uPulse);
    assert.notEqual(b.pads[0].barMat.uniforms.uAlpha,b.pads[1].barMat.uniforms.uAlpha);
    a.dispose();b.dispose();
  }
});

test('pad animation and enemy proximity remain exact at 30/60/120Hz and each shared geometry disposes once',()=>{
  for(const hz of [30,60,120]) {
    const level=new api.Level(api.MAP_LAYOUTS.tidewater),a=create(A.Decor,level),b=create(B.Decor,level);
    for(const d of [a,b])d.setTeamColors([new THREE.Color('#f80'),new THREE.Color('#08f')]);
    for(let i=0;i<hz*3;i++) {
      const actors=[{team:0,alive:true,pos:level.spawnPads[0].clone().add(new THREE.Vector3(0,0,4.2+i*.01))},{team:1,alive:i%9!==0,pos:level.spawnPads[0].clone().add(new THREE.Vector3(0,0,2.2))}];
      A.G.actors=B.G.actors=actors;
      for(const d of [a,b]){if(i%hz===0)d.pulse((i/hz)%2,1.4);d.update(1/hz);}
      const state=d=>d.pads.map(p=>({pulse:p.pulse,t:p.pulseT,pad:Object.fromEntries(Object.entries(p.padMat.uniforms).filter(([k])=>k!=='uEmblem').map(([k,u])=>[k,u.value?.isColor?u.value.toArray():u.value])),bar:Object.fromEntries(Object.entries(p.barMat.uniforms).map(([k,u])=>[k,u.value?.isColor?u.value.toArray():u.value]))}));
      assert.deepEqual(structuredClone(state(b)),structuredClone(state(a)));
    }
    assert(b.pads[0].barMat.uniforms.uAlpha.value>.12,'the enemy actually approached the current spawn');
    const disposed=new Map();b.group.traverse(o=>{for(const resource of [o.geometry,o.material])if(resource&&!disposed.has(resource)){disposed.set(resource,0);resource.addEventListener('dispose',()=>disposed.set(resource,disposed.get(resource)+1));}});
    b.dispose();b.dispose();assert([...disposed.values()].every(n=>n===1));assert.equal(b._queuePadShapes,null);assert.equal(b._queuePadMaterials,null);assert.equal(b._padBase,null);a.dispose();
  }
});

test('constructor failure retires shared/partial pad shapes and unattached materials once',async()=>{
  const level=new api.Level(api.MAP_LAYOUTS.range);
  for(const mode of ['barrier','face-rotate','second-face-mesh','fourth-shader']) {
    const resources=new Map();const track=o=>{resources.set(o,0);o.addEventListener('dispose',()=>resources.set(o,resources.get(o)+1));return o;};
    let faces=0,shaders=0;
    const namespace={...THREE,
      CircleGeometry:class extends THREE.CircleGeometry {constructor(...a){super(...a);track(this);}rotateX(v){super.rotateX(v);if(mode==='face-rotate')throw Error(mode);return this;}},
      CylinderGeometry:class extends THREE.CylinderGeometry {constructor(...a){if(mode==='barrier'&&a[2]===2.6&&a[3]===96)throw Error(mode);super(...a);if(a[2]===2.6&&a[3]===96)track(this);}},
      ShaderMaterial:class extends THREE.ShaderMaterial {constructor(...a){if(++shaders===4&&mode==='fourth-shader')throw Error(mode);super(...a);track(this);}},
      Mesh:class extends THREE.Mesh {constructor(g,m){if(g?.type==='CircleGeometry'&&++faces===2&&mode==='second-face-mesh')throw Error(mode);super(g,m);}}
    };
    const {Decor}=await load(final,namespace),scene=new THREE.Scene();
    assert.throws(()=>new Decor(scene,level,{emblem:new THREE.Texture(),flagTex:new THREE.Texture()}),new RegExp(mode));
    assert(resources.size>0);assert([...resources.values()].every(n=>n===1),mode+' exactly-once retirement');assert.equal(scene.children.length,0);
  }
});

test('per-ring palm optimization is already active and avoids 540 duplicate Bezier points per palm with exact arrays',async()=>{
  assert(final.includes('if (seg !== ringSeg) { ringSeg = seg; cp = curve.getPoint(t); }'));
  let oldCalls=0,newCalls=0;
  const counted=inc=>({...THREE,CubicBezierCurve3:class extends THREE.CubicBezierCurve3 {getPoint(t,out){inc();return super.getPoint(t,out);}}});
  const old=await load(baseline,counted(()=>oldCalls++)),next=await load(final,counted(()=>newCalls++));
  for(const id of ['tidewater','kelpline','halyard']){
    oldCalls=newCalls=0;const level=new api.Level(api.MAP_LAYOUTS[id]),a=create(old.Decor,level),b=create(next.Decor,level);
    assert.deepEqual(snapshot(b),snapshot(a));
    assert.equal(oldCalls-newCalls,level.layout.decor.palms.length*2*540,id);
    a.dispose();b.dispose();
  }
});

test('decor composition rejects duplicate or moved construction anchors',()=>{
  assert.throws(()=>adaptQueueExtraDecor('src/world/decor.js',final),/composition conflict/);
  assert.equal(adaptQueueExtraDecor('src/world/other.js','unchanged'),'unchanged');
});

test('sharing preserves the vendored geometry UUID random draws and following construction stream',()=>{
  const level=new api.Level(api.MAP_LAYOUTS.kelpline);
  const original=vm.runInContext('Math.random',api.context);
  const run=C=>{
    let seed=17,calls=0;api.context.__decorRandom=()=>{calls++;return((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);};
    vm.runInContext('Math.random = __decorRandom',api.context);
    const d=create(C,level),ids=[];d.group.traverse(o=>ids.push(o.uuid));d.dispose();return {seed,calls,ids};
  };
  try{assert.deepEqual(run(B.Decor),run(A.Decor));}finally{api.context.__decorRandom=original;vm.runInContext('Math.random = __decorRandom; delete __decorRandom',api.context);}
});

test('spawn-barrier broadphase preserves mixed NaN/far-axis and infinity fallback from the original update',async()=>{
  const start=final.indexOf('  update(dt) {'),end=final.indexOf('  // Called only after',start);
  const originalStart=raw.indexOf('  update(dt) {'),originalEnd=raw.indexOf('  // Called only after',originalStart);
  const source=final.slice(0,start)+raw.slice(originalStart,originalEnd)+final.slice(end);
  const old=await load(source),next=await load(final);
  const level=new api.Level(api.MAP_LAYOUTS.range),a=create(old.Decor,level),b=create(next.Decor,level);
  const values=[NaN,Infinity,-Infinity,undefined,-1000,0,8.2,1000];
  for(const x of values)for(const z of values){
    const actors=[{team:1,alive:true,pos:{x,z}}];old.G.actors=next.G.actors=actors;
    a.update(1/60);b.update(1/60);
    for(let i=0;i<2;i++)assert(Object.is(b.pads[i].barMat.uniforms.uAlpha.value,a.pads[i].barMat.uniforms.uAlpha.value),String(x)+','+String(z));
  }
  a.dispose();b.dispose();
});
