import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildInkMesh } from '../ink-volume/mesh.mjs';
import { decodeVTF } from '../ink-volume/vtf.mjs';
import { unpackVolumes } from '../ink-volume/pack.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
const authored = () => {
  const w = 16, h = 16, rgba = new Uint8Array(w * h * 4);
  for (let y = 1; y < 12; y++) for (let x = 1; x < 12; x++) if (!(x >= 4 && x <= 7 && y >= 4 && y <= 7)) rgba.set([255, 128, 32, 255], (y * w + x) * 4);
  rgba.set([64, 128, 255, 17], (14 * w + 14) * 4);
  return { w, h, rgba };
};
function edges(mesh) {
  const vertices=new Map(),canonical=Array.from({length:mesh.positions.length/3},(_,i)=>{const key=Array.from(mesh.positions.subarray(i*3,i*3+3)).join(':');if(!vertices.has(key))vertices.set(key,i);return vertices.get(key);});
  const e = new Map(); for (let i = 0; i < mesh.indices.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = canonical[mesh.indices[i + k]], b = canonical[mesh.indices[i + (k + 1) % 3]], key = Math.min(a, b) + ':' + Math.max(a, b);
    const x = e.get(key) || { count: 0, winding: 0 }; x.count++; x.winding += a < b ? 1 : -1; e.set(key, x);
  } return e;
}
function covers(mesh, u, v) {
  const N = mesh.frontVertexCount;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ids = Array.from(mesh.indices.subarray(i, i + 3)); if (ids.some(id => id >= N)) continue;
    const p = ids.map(id => [mesh.uvs[id * 2], mesh.uvs[id * 2 + 1]]);
    const signs = p.map((a, j) => { const b = p[(j + 1) % 3]; return (b[0] - a[0]) * (v - a[1]) - (b[1] - a[1]) * (u - a[0]); });
    if (signs.every(x => x >= -1e-12) || signs.every(x => x <= 1e-12)) return true;
  } return false;
}
test('hole and detached low-alpha island remain open, closed, consistently wound, with varying thickness and unchanged pixels', () => {
  const { w, h, rgba } = authored(), before = rgba.slice();
  for (const interiorStep of [1, 8, 16]) {
    const m = buildInkMesh(rgba, w, h, { interiorStep });
    assert.deepEqual(rgba, before); assert(m.boundaryEdges > 0);
    for (const { count, winding } of edges(m).values()) { assert.equal(count, 2, 'watertight edge'); assert.equal(winding, 0, 'opposite adjacent winding'); }
    for (let i = 0; i < m.normals.length; i += 3) assert(Math.abs(Math.hypot(...m.normals.subarray(i, i + 3)) - 1) < 1e-6);
    for (const n of m.positions) assert(Number.isFinite(n));
    for (const uv of m.uvs) assert(uv >= 0 && uv <= 1);
    for (const index of m.indices) assert(index < m.positions.length / 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) assert.equal(covers(m, (x + .5) / w, 1 - (y + .5) / h), rgba[(y * w + x) * 4 + 3] > 0, 'source pixel ' + x + ',' + y);
    const N = m.frontVertexCount, z = Array.from({ length: N }, (_, i) => m.positions[i * 3 + 2]);
    assert(Math.max(...z) > Math.min(...z) * 10);
    assert(m.positions[(N + z.indexOf(Math.max(...z))) * 3 + 2] < 0);
    for(let i=N*2;i<m.positions.length/3;i++){
      const x=Math.round(m.uvs[i*2]*w-.5),y=Math.round((1-m.uvs[i*2+1])*h-.5);
      assert(rgba[(y*w+x)*4+3]>0,'side samples original covered pixels, including low-alpha islands');
      assert.equal(m.normals[i*3+2],0,'side normal stays finite and outward across front/back seam');
    }
  }
});
test('all-transparent and edge-touching frames, invalid settings, and truncated pixels', () => {
  assert.equal(buildInkMesh(new Uint8Array(64), 4, 4).indices.length, 0);
  const data = new Uint8Array(4 * 4 * 4).fill(255), m = buildInkMesh(data, 4, 4);
  for (const e of edges(m).values()) { assert.equal(e.count, 2); assert.equal(e.winding, 0); }
  for (const uv of m.uvs) assert(uv >= 0 && uv <= 1, 'edge-touching art must not sample another atlas frame');
  for (let i=0;i<m.frontVertexCount;i++) { assert(Math.abs(m.positions[i*3]) <= .5); assert(Math.abs(m.positions[i*3+1]) <= .5); }
  assert.throws(() => buildInkMesh(data, 4, 4, { thickness: NaN }));
  assert.throws(() => buildInkMesh(data, 4, 4, { interiorStep: 0 }));
  assert.throws(() => buildInkMesh(data, 5, 4));
});
test('source beam UV window clips and closes both ends without changing original RGBA or leaving tail gaps',()=>{
  const w=128,h=8,rgba=new Uint8Array(w*h*4).fill(255),before=rgba.slice();
  const mesh=buildInkMesh(rgba,w,h,{uvWindow:[.3,0,.7,1],interiorStep:8});assert.deepEqual(rgba,before);
  for(let i=0;i<mesh.frontVertexCount;i++){assert(mesh.uvs[i*2]>=.3-1e-7&&mesh.uvs[i*2]<=.7+1e-7);assert(Math.abs(mesh.positions[i*3])<=3.2+1e-6);}
  const xs=Array.from({length:mesh.frontVertexCount},(_,i)=>mesh.positions[i*3]);assert(Math.abs(Math.max(...xs)-3.2)<1e-6);assert(Math.abs(Math.min(...xs)+3.2)<1e-6);
  for(const edge of edges(mesh).values()){assert.equal(edge.count,2);assert.equal(edge.winding,0);}
  assert.throws(()=>buildInkMesh(rgba,w,h,{uvWindow:[.7,0,.3,1]}));
});
test('VTF DXT3 decoder preserves every authored alpha nibble and all 16 original frames without mutating the source', () => {
  const b = new Uint8Array(80 + 16 * 16), v = new DataView(b.buffer);
  v.setUint32(0, 0x00465456, true); v.setUint32(4, 7, true); v.setUint32(8, 2, true); v.setUint32(12, 80, true);
  v.setUint16(16, 4, true); v.setUint16(18, 4, true); v.setUint16(24, 16, true); v.setUint32(52, 14, true); b[56] = 1; v.setUint16(63, 1, true);
  for (let f = 0; f < 16; f++) { const o = 80 + f * 16; for (let i = 0; i < 8; i++) b[o + i] = (i * 2) | ((i * 2 + 1) << 4); v.setUint16(o + 8, 0xf800, true); v.setUint16(o + 10, 0x001f, true); v.setUint32(o + 12, 0xaaaaaaaa ^ f, true); }
  const before = b.slice(), d = decodeVTF(b); assert.deepEqual(b, before); assert.equal(d.frames.length, 16);
  for (const f of d.frames) for (let i = 0; i < 16; i++) assert.equal(f[i * 4 + 3], i * 17);
  assert.notDeepEqual(d.frames[0], d.frames[1]); assert.throws(() => decodeVTF(b.subarray(0, b.length - 1)));
  v.setUint32(20, 0x4000, true); assert.throws(() => decodeVTF(b));
});
test('DXT5 alpha retains both interpolation tables and packed indices across byte boundaries',()=>{
  const b=new Uint8Array(80+32),v=new DataView(b.buffer);v.setUint32(0,0x00465456,true);v.setUint32(4,7,true);v.setUint32(8,2,true);v.setUint32(12,80,true);v.setUint16(16,4,true);v.setUint16(18,4,true);v.setUint16(24,2,true);v.setUint32(52,15,true);b[56]=1;v.setUint16(63,1,true);
  for(let f=0;f<2;f++){const o=80+16*f;b[o]=f?0:255;b[o+1]=f?255:0;v.setUint16(o+8,0xf800,true);let codes=0n;for(let i=0;i<16;i++)codes|=BigInt(i%8)<<BigInt(i*3);for(let i=0;i<6;i++)b[o+2+i]=Number((codes>>BigInt(i*8))&255n);}
  const before=b.slice(),d=decodeVTF(b),palettes=[[255,0,218,182,145,109,72,36],[0,255,51,102,153,204,0,255]];assert.deepEqual(b,before);
  for(let f=0;f<2;f++)for(let i=0;i<16;i++){assert.equal(d.frames[f][i*4+3],palettes[f][i%8]);assert.equal(d.frames[f][i*4],255);}
});
test('pack reader rejects corrupt/unaligned ranges and wrong lengths', () => {
  assert.throws(() => unpackVolumes({ schema: 'inkwave-volume-v1', byteLength: 4, patterns: [{ width: 1, height: 1, frames: [{ rgba: { offset: 0, length: 5 }, levels: [] }] }] }, new ArrayBuffer(4)));
  assert.throws(() => unpackVolumes({ schema: 'inkwave-volume-v1', byteLength: 5, patterns: [] }, new ArrayBuffer(4)));
});
async function api() {
  return fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true, extraExports: "export { InkVolumes, animationFrame } from './patches/local-quality/ink-volume/runtime.mjs'; export { captureRollerVolume, submitRollerVolume } from './patches/local-quality/ink-volume/roller.mjs'; export { FX } from './inkwave-public/src/fx/fx.js'; export function setInkVolumeTestURL(v){globalThis.INKWAVE_INK_VOLUME_URL=v;} export const inkBufferTypes={Uint8Array,Uint16Array,Uint32Array,Int16Array,Float32Array};" });
}
test('frame boundaries, instanced reuse, pose/position coupling, culling, capacity fallback and exact resource disposal', async () => {
  const f = await api(), { rgba, w, h } = authored();
  const root = new f.THREE.Group(), L = { sunDir: new f.THREE.Vector3(0, 1, 0), sunCol: new f.THREE.Color('white'), sky: new f.THREE.Color('white'), ground: new f.THREE.Color('gray') };
  const engine = new f.InkVolumes(root, L, { capacity: 2 }), pattern = { width: w, height: h, fps: 30, frames: Array.from({ length: 16 }, () => ({ rgba, levels: [buildInkMesh(rgba, w, h), buildInkMesh(rgba, w, h, { interiorStep: 16 })] })) };
  // Cross-realm typed arrays are supplied by the fixture realm.
  for (const frame of pattern.frames) {
    frame.rgba = new f.inkBufferTypes.Uint8Array(frame.rgba);
    for (const level of frame.levels) { level.positions = new f.inkBufferTypes.Float32Array(level.positions); level.normals = new f.inkBufferTypes.Float32Array(level.normals); level.uvs = new f.inkBufferTypes.Float32Array(level.uvs); level.indices = new f.inkBufferTypes.Uint16Array(level.indices); }
  }
  const broken = { ...pattern, frames: [{ ...pattern.frames[0], levels: pattern.frames[0].levels.map(l => ({ ...l, normals: l.normals.slice() })) }] };
  broken.frames[0].levels[1].normals[0] = NaN;
  assert.throws(() => engine.register('broken', { schema: 'inkwave-volume-v1', patterns: [broken] }), /normal/);
  assert.equal(root.children.length, 0, 'failed registration must not leave partial batches');
  assert.equal(engine.metrics.bytes, 0);
  assert.equal(engine.assets.size, 0);
  pattern.frames[0].levels[1].normals=f.inkBufferTypes.Int16Array.from(pattern.frames[0].levels[1].normals,x=>Math.round(x*32767));
  // A decoded view may occupy a tiny portion of a much larger serialized
  // pack. The live GPU attribute cache must not retain unrelated pack bytes.
  const backing=new f.inkBufferTypes.Float32Array(16*1024*1024/4),sourcePositions=pattern.frames[0].levels[0].positions;
  backing.set(sourcePositions);pattern.frames[0].levels[0].positions=backing.subarray(0,sourcePositions.length);
  engine.register('roller', { schema: 'inkwave-volume-v1', patterns: [pattern, pattern] });
  assert.equal(root.children.length, 128);
  const resources = [...engine.assets.get('roller').resources], disposals = new Map();
  for (const r of resources) r.addEventListener('dispose', () => disposals.set(r, (disposals.get(r) || 0) + 1));
  const actor = f.make('roller'), p = { type: 'drop', owner: actor, delay: 0, age: 0, seed: .2, size: .15, pos: new f.THREE.Vector3(0, 0, -3), vel: new f.THREE.Vector3(0, 0, -5), _qualityGeneration: 1 };
  f.captureRollerVolume(p); const camera = new f.THREE.PerspectiveCamera(60, 1, .1, 100);
  for (let i = 0; i < 16; i++) assert.equal(f.animationFrame(i / 30, 16, 30), i);
  assert.equal(f.animationFrame(100, 16, 30), 15);
  engine.begin(camera); assert(f.submitRollerVolume(engine, p)); assert(f.submitRollerVolume(engine, p)); assert.equal(f.submitRollerVolume(engine, p), false); engine.end();
  assert.equal(engine.metrics.active, 2); assert.equal(engine.metrics.batches, 2); assert.equal(engine.metrics.overflow, 1);
  const batch=engine.assets.get('roller').patterns[0].frames[0][0];
  assert.notEqual(batch.mesh.geometry.attributes.position.array.buffer,backing.buffer,'GPU cache does not pin the unrelated serialized pack');
  assert.equal(batch.mesh.geometry.attributes.position.array.buffer.byteLength,sourcePositions.byteLength,'retain only live vertex storage');
  assert.deepEqual(batch.mesh.geometry.attributes.position.array,sourcePositions,'copy preserves every vertex bit');
  for(const key of ['position','normal','uv'])assert.equal(batch.fringe.geometry.attributes[key],batch.mesh.geometry.attributes[key]);assert.equal(batch.fringe.geometry.index,batch.mesh.geometry.index);assert.equal(batch.fringe.instanceMatrix,batch.mesh.instanceMatrix);assert.equal(batch.fringe.instanceColor,batch.mesh.instanceColor);
  assert.equal(batch.mesh.material.depthWrite,true);assert.equal(batch.fringe.material.depthWrite,false);
  assert.equal(engine.assets.get('roller').patterns[0].frames[0][1].mesh.geometry.attributes.normal.normalized,true);
  const mesh = engine.assets.get('roller').patterns[0].frames[0][0].mesh, first = new f.THREE.Matrix4(); mesh.getMatrixAt(0, first);
  assert.deepEqual(Array.from(first.elements.slice(12, 15)), [0, 0, -3]);
  const orientation = first.elements.slice(0, 12); p.pos.x = 1; p.vel.set(5, -3, 0); camera.position.x = 1; camera.lookAt(0, 0, -3);
  engine.begin(camera); assert(f.submitRollerVolume(engine, p)); engine.end(); mesh.getMatrixAt(0, first);
  assert.deepEqual(first.elements.slice(0, 12), orientation, 'camera/velocity must not rotate a born shape'); assert.equal(first.elements[12], 1);
  p.pos.set(0, 0, 500); engine.begin(camera); assert(f.submitRollerVolume(engine, p)); engine.end(); assert.equal(engine.metrics.culled, 1); assert.equal(engine.metrics.active, 0);
  p.pos.set(0, 0, -30); camera.position.set(0, 0, 0); camera.lookAt(0, 0, -30); engine.begin(camera); assert(f.submitRollerVolume(engine, p)); engine.end(); assert.equal(engine.assets.get('roller').patterns[0].frames[0][1].mesh.count, 1);
  // only batches with instances are in the render list (an empty visible InstancedMesh still costs program/uniform setup)
  for (const x of root.children) assert.equal(x.visible, x.count > 0, x.name);
  assert(root.children.some(x => x.visible));
  p._qualityGeneration++; p.pos.set(0, 0, -3); p.vel.set(5, 0, 0); f.captureRollerVolume(p); engine.begin(camera); assert(f.submitRollerVolume(engine, p)); engine.end(); mesh.getMatrixAt(0, first);
  assert.notDeepEqual(first.elements.slice(0, 12), orientation, 'pooled generation captures its own shot direction');
  engine.clear(); assert(root.children.every(x => x.count === 0 && x.visible === false)); assert.deepEqual([...engine.assets.get('roller').resources], resources);
  engine.dispose(); engine.dispose(); assert.equal(root.children.length, 0); assert.equal(engine.metrics.bytes, 0); for (const r of resources) assert.equal(disposals.get(r), 1);
  assert.throws(() => engine.register('later', { schema: 'inkwave-volume-v1', patterns: [pattern] }));
  // A boot completion promise must not retain the returned asset/buffer graph
  // after GPU disposal. Also reject a configured load that finishes too late.
  f.setInkVolumeTestURL('/authorized-test-pack');
  const originalLoad=f.FX.prototype.loadInkVolume;
  f.FX.prototype.loadInkVolume=async()=>({resources});
  const fx=new f.FX(new f.THREE.Scene(),{quality:.25});
  assert.equal(await fx.inkVolumeReady,true,'boot completion retains status, not asset handles');fx.dispose();assert.equal(fx.inkVolumeReady,null);
  let finish;const pending=new Promise(resolve=>{finish=resolve;});
  f.FX.prototype.loadInkVolume=async function(){await pending;return this.registerInkVolume('late',{schema:'inkwave-volume-v1',patterns:[pattern]});};
  const late=new f.FX(new f.THREE.Scene(),{quality:.25}),ready=late.inkVolumeReady;late.dispose();finish();
  assert.equal(await ready,null);assert.match(late.inkVolumeError,/disposed/);assert.equal(late.inkVolumes,undefined);assert.equal(late.inkVolumeReady,null);
  f.FX.prototype.loadInkVolume=originalLoad;f.setInkVolumeTestURL(undefined);
});
test('actual composed Roller shots retain gameplay data and use the existing _draw pass', async () => {
  const f = await api(), actor = f.make('roller'); f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  actor.intent.fire = true; f.tick(actor, 40); actor.intent.fire = false;
  const system = f.G.projectiles; assert(system.list.length > 0);
  const before = system.list.map(p => [p.damage,p.radius,p.life,p.grav,p.drag,p.pos.toArray(),p.vel.toArray(),p.seed,p.sats]);
  const calls = []; f.G.fx = { inkVolumes: { isInkVolumes: true, assets:new Map(), begin: () => calls.push('begin'), submit: (name,p,size) => { calls.push([name,p,size]);return true; }, end: () => calls.push('end') } };
  system._draw(); assert.equal(calls[0], 'begin'); assert.equal(calls.at(-1), 'end'); assert(calls.some(c=>Array.isArray(c)&&c[0]==='roller'));
  assert.deepEqual(system.list.map(p => [p.damage,p.radius,p.life,p.grav,p.drag,p.pos.toArray(),p.vel.toArray(),p.seed,p.sats]), before);
  assert.equal(system.blobs.count, 0);
  for (const p of system.list) p._inkVolumeRecipe=null;
  system._draw(); assert(system.blobs.count > 0, 'other weapon/mode remains on existing renderer');
  // Replay actual JSON wire births: remote owner mode/weapon may already have
  // changed, and current vertical source-guided heads share nose/tail values
  // with horizontal ones. Classification must wait for immutable metadata.
  f.G.netm=new f.NetMatch({myId:7},{});actor.nid=7;
  const peer=f.make('shooter');peer.remote=true;peer.nid=9;peer.team=1;
  for(const vertical of [false,true]){
    system.clear();f.G.netm.out.length=0;actor.weaponRunner.s3FlickVertical=vertical;
    system.fireFlick(actor,actor.weapon);
    const packets=JSON.parse(JSON.stringify(f.G.netm.out.filter(e=>e[1]==='p')));
    assert(packets.length>0);const snapshot=JSON.stringify(packets);
    system.clear();peer.weaponRunner.s3FlickVertical=!vertical;
    for(const packet of packets)system.ghostProjectile(peer,packet);
    assert.equal(JSON.stringify(packets),snapshot,'renderer does not change network packets');assert.equal(system.list.length,packets.length);
    for(const p of system.list){assert.equal(p._inkVolumeHorizontal,!vertical);assert.equal(p._inkVolumeRecipe,vertical?'roller-vertical':'roller-horizontal');assert.equal(p.s3Vertical,vertical);assert.equal(p.wid,'roller');assert.equal(p.damage,0);assert.equal(p.ghost,true);assert.deepEqual(p._inkVolumeDirection.toArray(),p.vel.toArray());}
    calls.length=0;system._draw();assert.equal(calls.filter(c=>Array.isArray(c)&&c[0]==='roller').length,packets.length,'both flick modes now use their sourced radii and shared animation');
  }
});
