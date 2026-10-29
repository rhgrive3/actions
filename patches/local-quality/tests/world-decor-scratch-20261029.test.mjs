import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {geometryFixture} from './geometry-build-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptQueueExtraDecor} from '../queue-extra-decor-adapter.mjs';

const raw=fs.readFileSync(new URL('../../../inkwave-public/src/world/decor.js',import.meta.url),'utf8');
let final=adaptBuildSource('src/world/decor.js',raw);
if(!final.includes('const padShapes = this._queuePadShapes'))final=adaptQueueExtraDecor('src/world/decor.js',final);
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-world-decor-before-20261029.json',import.meta.url)))['src/world/decor.js'];
const api=await geometryFixture();
const THREE=api.THREE;
async function load(source,namespace=THREE,G={actors:[]}) {
  const context=vm.createContext({console,Math});
  const three=new vm.SyntheticModule(Object.keys(namespace),function(){for(const [k,v]of Object.entries(namespace))this.setExport(k,v);},{context});
  const bus=new vm.SyntheticModule(['G'],function(){this.setExport('G',G);},{context});
  const util=new vm.SourceTextModule(fs.readFileSync(new URL('../../../inkwave-public/vendor/three/jsm/utils/BufferGeometryUtils.js',import.meta.url),'utf8'),{context});
  await util.link(()=>three);await util.evaluate();
  const mod=new vm.SourceTextModule(source,{context});
  await mod.link(spec=>spec==='three'?three:spec.includes('BufferGeometryUtils')?util:bus);await mod.evaluate();
  return {Decor:mod.namespace.Decor,G};
}
const A=await load(baseline),B=await load(final);
const hash=a=>crypto.createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
function snapshot(decor) {
  decor.group.updateMatrixWorld(true);
  const rows=[];decor.group.traverse(o=>{if(!o.geometry)return;const g=o.geometry;g.computeBoundingSphere();rows.push({name:o.name,type:o.type,matrix:o.matrixWorld.toArray(),index:g.index&&hash(g.index.array),attributes:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,{itemSize:a.itemSize,normalized:a.normalized,hash:hash(a.array)}])),sphere:{radius:g.boundingSphere.radius,center:g.boundingSphere.center.toArray()},cast:o.castShadow,receive:o.receiveShadow});});
  return rows;
}
function create(C,level) {return new C(new THREE.Scene(),level,{emblem:new THREE.Texture(),flagTex:new THREE.Texture()});}

test('procedural scratch and leaflet directions preserve all five stage geometry bytes and transforms',()=>{
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
