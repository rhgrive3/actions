import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptCombatWave345} from '../combat-gpu-cpu-perfect-adapter.mjs';
import {replaceOnce} from '../adapter.mjs';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const PUB=path.join(ROOT,'inkwave-public');
const rel='src/fx/screenfx.js';
const source=adaptBuildSource(rel,fs.readFileSync(path.join(PUB,rel),'utf8'));
const fixtureBytes=fs.readFileSync(new URL('./fixtures/combat-lossless-transfer-0dd-tuples.json',import.meta.url));
assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'),'d05ab6506ab4e81ff9e2434e300df9d0cdede650d8c8cc50139ec161b594e665');
const incoming=JSON.parse(fixtureBytes);
assert.equal(incoming.sourceCommit,'0ddfda32230f54e69a5d791e4d0d6178b1c2074d');
const palette=incoming.tuples['GPU-07d skip unchanged team RGB while retaining live alpha'];
const aspect=incoming.tuples['GPU-07c cache aspect only while drawing-buffer size is stable'];
const currentGate=s=>s.replace('if (local)','if (local && any)');
const paletteBefore=currentGate(palette.before),paletteAfter=currentGate(palette.after);
const apply=s=>adaptCombatWave345(rel,s,replaceOnce);
const once=(s,a,b)=>{assert.equal(s.split(a).length-1,1,'one exact counterfactual site');return s.replace(a,b);};
const aspectStart=source.indexOf('    if (W !== this._w || H !== this._h) {');
const aspectEnd=source.indexOf('    const quality = G.settings?.quality',aspectStart);
assert.ok(aspectStart>=0&&aspectEnd>aspectStart);
const currentAspect=source.slice(aspectStart,aspectEnd);

test('current final composition retains submitted-pass ownership and both complete exact RGB epochs',()=>{
 assert.ok(source.includes(paletteAfter));
 assert.equal(apply(source),source,'complete final pass is idempotent');
 assert.equal(apply(once(source,paletteAfter,paletteBefore)),source,'current owner before epoch');
 const old=once(source,paletteAfter,palette.before);
 assert.equal(apply(old),once(source,paletteAfter,palette.after),'incoming historical local gate is retained');
});

test('RGB admission rejects missing, duplicate, mixed and changed complete epoch sites',()=>{
 for(const broken of [
  once(source,paletteAfter,''),
  source+'\n'+paletteAfter,
  source+'\n'+palette.before,
  once(source,paletteAfter,paletteAfter.replace('if (local && any)','if (local && any && false)')),
 ])assert.throws(()=>apply(broken),/GPU-07d team RGB source epoch: expected exactly one complete site/);
});

// Execute the complete native ScreenFX class, native ShaderPass/LensInk and
// native Three/config/context dependencies. Only the external renderer size
// service is supplied: these are CPU/API controls, not rendered-pixel claims.
async function nativeFixture(code,dimensions=[800,600]){
 const context=vm.createContext({console,performance,Math,Float64Array,Float32Array});
 const modules=new Map();
 function load(file){
  if(modules.has(file))return modules.get(file);
  let text=file===path.join(PUB,rel)?code:fs.readFileSync(file,'utf8');
  if(file!==path.join(PUB,rel)&&file.startsWith(path.join(PUB,'src')+path.sep))text=adaptBuildSource(path.relative(PUB,file).split(path.sep).join('/'),text);
  const mod=new vm.SourceTextModule(text,{context,identifier:file});modules.set(file,mod);return mod;
 }
 const entry=new vm.SourceTextModule("export {ScreenFX} from './src/fx/screenfx.js';export {G} from './src/core/ctx.js';export * as THREE from 'three';",{context,identifier:path.join(PUB,'screenfx-fixture.mjs')});
 await entry.link((spec,from)=>{
  let file=spec==='three'?path.join(PUB,'vendor/three/build/three.module.js'):spec.startsWith('three/addons/')?path.join(PUB,'vendor/three/jsm',spec.slice(13)):path.resolve(path.dirname(from.identifier),spec);
  file=file.replace(path.join(PUB,'patches')+path.sep,path.join(ROOT,'patches')+path.sep);
  return load(file);
 });
 await entry.evaluate();
 const {ScreenFX,G,THREE}=entry.namespace;
 G.mode='match';G.settings={quality:'high',cameraShake:1};G.teamColors=[new THREE.Color(.2,.3,.4),new THREE.Color(.5,.6,.7)];
 const local={team:0,enemyTeam:1,alive:true};
 const match={attract:false,paused:true,local};G.match=match;
 const R={renderer:{getDrawingBufferSize(out){return out.set(...dimensions);}},setExtraPass(pass){this.pass=pass;}};
 const fx=new ScreenFX(R,G),game={match,_skipRender:true};
 return {fx,G,THREE,local,match,dimensions,update:dt=>fx.update(dt,game)};
}
const colors=['uLensColA','uLensColB','uEdgeInk','uHeart','uAura','uSwim','uSpeedTint','uKill','uShimmer','uCharge'];
const snapshot=f=>Object.fromEntries(colors.map(k=>[k,Array.from(f.fx.U[k].value.toArray())]));

test('initial zero drawing buffer preserves native resolution and initializes only aspect; incoming negative differs',async()=>{
 const baseline=once(source,currentAspect,aspect.before+'\n');
 const old=once(source,currentAspect,aspect.after+'\n');
 const fixtures=await Promise.all([nativeFixture(baseline,[0,0]),nativeFixture(old,[0,0]),nativeFixture(source,[0,0])]);
 try{
  for(const f of fixtures)f.update(1/60);
  const [native,negative,current]=fixtures;
  for(const f of [native,current]){
   assert.equal(f.fx._aspect,0);assert.equal(f.fx.U.uAspect.value,0);
   assert.deepEqual(Array.from(f.fx.U.uRes.value.toArray()),[1600,900]);
   assert.deepEqual([f.fx.lens.rt.width,f.fx.lens.rt.height],[64,36]);
  }
  assert.equal(negative.fx._aspect,16/9,'exact incoming cache misses first zero-size initialization');
  let writes=0;const uniform=current.fx.U.uAspect;let value=uniform.value;
  Object.defineProperty(uniform,'value',{get:()=>value,set:v=>{writes++;value=v;},configurable:true});
  for(let i=0;i<10;i++)current.update(1/120);
  assert.equal(writes,0,'stable zero size remains cached');
  for(const dims of [[800,600],[800,600],[0,0],[0,0],[900,0],[900,600]]){
   for(const f of [native,current]){f.dimensions.splice(0,2,...dims);f.update(1/30);}
   assert.equal(current.fx._aspect,native.fx._aspect);
   assert.equal(current.fx.U.uAspect.value,native.fx.U.uAspect.value);
   assert.deepEqual(Array.from(current.fx.U.uRes.value.toArray()),Array.from(native.fx.U.uRes.value.toArray()));
  }
 }finally{for(const f of fixtures)f.fx.dispose();}
});

test('native 30/60/120 Hz palette mutation, replacement, live alpha, dormancy and reset match uncached writes',async()=>{
 const baseline=once(source,paletteAfter,paletteBefore);
 for(const hz of [30,60,120]){
  const a=await nativeFixture(baseline),b=await nativeFixture(source);
  try{
   for(let frame=0;frame<120;frame++){
    for(const f of [a,b]){
     if(frame%19===0)f.fx.reset();
     f.match.local=frame%17===0?null:f.local;
     f.local.team=frame%23<11?0:1;f.local.enemyTeam=1-f.local.team;
     if(frame%13===0)f.G.teamColors[0]=new f.THREE.Color(.2+frame/1000,.3,.4);
     if(frame%7===0)f.G.teamColors[1].setRGB(.5,.6-frame/1000,.7);
     const active=frame%11!==0;
     for(const key of ['edgeInk','heart','aura','swim','kill','shimmer','chargePulse'])f.fx.s[key]=active?(frame%9+1)/10:0;
     f.G.settings.cameraShake=(frame%5)/4;
     f.update(1/hz);
    }
    assert.deepEqual(snapshot(b),snapshot(a),hz+'Hz frame '+frame);
   }
   for(const f of [a,b]){f.match.local=null;f.fx._local=null;f.fx.test('edge');f.match.local=f.local;f.update(1/hz);}
   assert.deepEqual(snapshot(b),snapshot(a),'standalone visual test cannot leave cached team RGB valid');
  }finally{a.fx.dispose();b.fx.dispose();}
 }
});

test('stable active native palette reuses RGB writes while alpha follows each frame',async()=>{
 const f=await nativeFixture(source);
 try{
  f.fx.s.edgeInk=.5;f.update(1/60);
  let writes=0;const color=f.fx.U.uLensColA.value,copy=color.copy;
  color.copy=function(other){writes++;return copy.call(this,other);};
  for(let i=0;i<8;i++){f.fx.s.edgeInk=.2+i/10;f.update(1/60);assert.equal(f.fx.U.uEdgeInk.value.w,.2+i/10);}
  assert.equal(writes,0,'unchanged active RGB remains cached');
  f.G.teamColors[1].r=.75;f.update(1/60);assert.equal(writes,1);
  assert.equal(f.fx.U.uLensColA.value.r,.75);
  f.fx.reset();f.fx.s.edgeInk=.5;f.update(1/60);assert.equal(writes,2,'reset forces the next active refresh');
 }finally{f.fx.dispose();}
});
