import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptSource} from '../../splatoon3/adapter.mjs';
import {adaptReliability} from '../../reliability/adapter.mjs';
import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';
import {adaptRuntimeFrameScratch} from '../runtime-frame-scratch-adapter.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {replaceOnce} from '../adapter.mjs';
import {PlatformFrameDriver} from '../platform-lifecycle.mjs';
const utilsSource = fs.readFileSync(new URL('../../../inkwave-public/vendor/three/jsm/utils/BufferGeometryUtils.js', import.meta.url), 'utf8').replace("from 'three'", 'from ' + JSON.stringify(new URL('../../../inkwave-public/vendor/three/build/three.module.js', import.meta.url).href));
const {mergeGeometries} = await import('data:text/javascript;base64,' + Buffer.from(utilsSource).toString('base64'));

const read = path => fs.readFileSync(new URL('../../../inkwave-public/' + path, import.meta.url), 'utf8');
const patch = path => adaptRuntimeFrameScratch(path, read(path), replaceOnce);
function method(source, name, indent = '  ') {
  const start = source.indexOf(indent + name + '(');
  assert.ok(start >= 0, 'method ' + name);
  const end = source.indexOf('\n' + indent + '}', start);
  assert.ok(end > start, 'method end ' + name);
  return source.slice(start, end + indent.length + 2).trim();
}
function kernel(source) {
  return new Function('THREE', 'G', source.replace(/^import .*;$/gm, '').replaceAll('export ', '') +
    '\nreturn {TentacleSurface,tentacleTube,suctionCups};')(THREE, {});
}
function geometrySnapshot(geo) {
  return Object.fromEntries([...Object.entries(geo.attributes).map(([k,v]) => [k, Buffer.from(v.array.buffer, v.array.byteOffset, v.array.byteLength)]),
    ['index', Buffer.from(geo.index.array.buffer)]]);
}
test('actual tube and suction geometry remains byte exact across sections, caps and quality detail', () => {
  const kernels = [kernel(read('src/game/character-hair.js')), kernel(patch('src/game/character-hair.js'))];
  for (const section of [false,true]) for (const radial of [6,9,16]) for (const capStart of [false,true]) {
    const surfaces = kernels.map(k => new k.TentacleSurface([
      new THREE.Vector3(0,0,0), new THREE.Vector3(.05,.2,.03), new THREE.Vector3(.1,.5,-.02), new THREE.Vector3(-.03,.8,.07)],
      {radius:t=>.09*(1-t*.8),flat:t=>.6+t*.2,twist:t=>t*.7,section:section?(c,s,t)=>[c*(1+t*.1),s]:undefined}));
    const tubes = kernels.map((k,i) => k.tentacleTube(surfaces[i],{rings:12,radial,capStart,tipSteps:3}));
    assert.deepEqual(geometrySnapshot(tubes[1].geo),geometrySnapshot(tubes[0].geo));
    for (const key of ['t','cs','sn','thick','rings']) assert.deepEqual(tubes[1][key],tubes[0][key]);
    for (const prof of ['lo','hi']) {
      const cups = kernels.map((k,i) => k.suctionCups(surfaces[i],{prof,radial,rows:[{th:0,phase:0},{th:.6,phase:.5}],from:.2,to:.8,size:()=>.016}));
      assert.deepEqual(geometrySnapshot(cups[1].geo),geometrySnapshot(cups[0].geo));
      for (const key of ['t','ring','list']) assert.deepEqual(cups[1][key],cups[0][key]);
      cups.forEach(c=>c.geo.dispose());
    }
    tubes.forEach(t=>t.geo.dispose());
  }
});

test('material pulse outputs preserve zero, tiny, active and nonfinite diagnostic inputs', () => {
  const make = source => new Function('TAU','return function '+method(source,'_updateMaterials'))(Math.PI*2);
  const before=make(read('src/game/character.js')),after=make(patch('src/game/character.js'));
  const state=(t,wGlow,wLow)=>({t,wGlow,wLow,color:new THREE.Color(.12,.4,.8),_updateRim(){},
    u:{uFlash:{value:new THREE.Color()},uGlow:{value:new THREE.Color()}},kid:{visible:true},
    mats:{fill:{emissive:new THREE.Color()},glow:{}},weaponKind:'charger',charge:1,chargeFlash:.2});
  for(const t of [0,-0,.1,100,1e12,Number.MAX_VALUE,Infinity,NaN])for(const glow of [0,-0,1e-15,.5,1,NaN])for(const low of [0,-0,1e-15,1,NaN]){
    const a=state(t,glow,low),b=state(t,glow,low);before.call(a,1/60,{invuln:true});after.call(b,1/60,{invuln:true});
    assert.deepEqual(b.u,a.u);assert.deepEqual(b.mats,a.mats);
  }
});

test('cloud bake restores target, scissor, clear and XR after every strip failure', () => {
  const source=patch('src/world/environment.js');
  const bake=new Function('THREE','lin','CLOUD_W','CLOUD_H','return function '+method(source,'_bakeClouds'))(THREE,()=>new THREE.Color(),128,64);
  for(const failedStrip of [-1,0,3,9]){
    const original={id:'original'},color=new THREE.Color(.2,.3,.4),rt={scissorTest:true,scissor:new THREE.Vector4(1,2,3,4)};
    let current=original,alpha=.37,strips=0,cc=color.clone();
    const renderer={autoClear:true,xr:{enabled:true},getRenderTarget:()=>current,setRenderTarget:t=>{current=t;},
      getClearColor:out=>out.copy(cc),getClearAlpha:()=>alpha,setClearColor:(c,a)=>{cc.set(c);alpha=a;},clear(){},
      render(){if(strips++===failedStrip)throw Error('strip');}};
    const env={renderer,_cloudRT:rt,_cloudMat:{uniforms:{uSunCol:{value:new THREE.Color()},uCov:{},uSeed:{}}}};
    if(failedStrip<0)bake.call(env,{});else assert.throws(()=>bake.call(env,{}),/strip/);
    assert.equal(current,original);assert.equal(renderer.autoClear,true);assert.equal(renderer.xr.enabled,true);
    assert.deepEqual(cc,color);assert.equal(alpha,.37);assert.equal(rt.scissorTest,true);assert.deepEqual(rt.scissor,new THREE.Vector4(1,2,3,4));
  }
});

test('source bank reuses the base view while copying live data and preserving independent pose outputs', () => {
  const source=read('src/game/motion/source-bank.js');
  const {SourceBank,SourcePose}=new Function('THREE',source.replace(/^import .*;$/gm,'').replaceAll('export ','').replaceAll('import.meta.url',JSON.stringify(import.meta.url))+'\nreturn {SourceBank,SourcePose};')(THREE);
  const floats=Float32Array.from([1,1,1,0,0,0,0,0,0,1]);
  const meta={byteLength:floats.byteLength,bones:[{name:'root',parent:-1,flags:0,scale:[1,1,1],translation:[0,0,0],rotation:[0,0,0,1]}],clips:[{name:'idle',base:0,curves:10,curveCount:0,frames:60,loop:true,rotationMode:'eulerXYZ',boneFlags:[0]}]};
  const bank=new SourceBank(meta,floats.buffer),a=new SourcePose(bank),b=new SourcePose(bank);
  bank.sample('idle',0,a);const layout=bank.layouts.get(bank.clips.get('idle')),baseView=layout.baseView;
  assert.equal(baseView.buffer,bank.data.buffer);
  let subarrays=0;const original=bank.data.subarray;bank.data.subarray=function(...args){subarrays++;return original.apply(this,args);};
  for(let i=0;i<120;i++){bank.data[3]=i*.25;bank.sample('idle',i,b);assert.equal(b.raw[3],Math.fround(i*.25));assert.equal(a.raw[3],0);assert.equal(layout.baseView,baseView);}
  assert.equal(subarrays,0);
});

test('GTAO resize is delegated to the composer at its effective pixel ratio', () => {
  const resize=new Function('window','resizeBattleCamera','G','return function '+method(adaptBuildSource('src/core/renderer.js',read('src/core/renderer.js')),'resize'))({innerWidth:800,innerHeight:600},()=>{},{});
  for(const dpr of [.75,1,1.5,2]){
    const sizes=[],gtao={setSize:(w,h)=>sizes.push([w,h])};
    const owner={renderer:{setSize(){}},composer:{setSize:(w,h)=>gtao.setSize(w*dpr,h*dpr)},gtao,_fxaaTexel(){},grade:{uniforms:{uAspect:{}}}};
    resize.call(owner);assert.deepEqual(sizes,[[800*dpr,600*dpr]]);
  }
});

test('generation callbacks are reused and cancelled old callbacks cannot execute frames', () => {
  const ra=[],timers=[];let frames=0,now=0;
  const env={requestAnimationFrame:cb=>(ra.push(cb),ra.length),cancelAnimationFrame(){},setTimeout:cb=>(timers.push(cb),timers.length),clearTimeout(){},performance:{now:()=>now},Date:{now:()=>now}};
  const owner={env,active:true,focused:true,subscribe(){return ()=>{};}};
  const d=new PlatformFrameDriver(owner,()=>frames++,()=>{},()=>60);d.start();
  for(let i=0;i<20;i++){now=i*17;ra.at(-1)(now);timers.at(-1)();}
  assert.equal(new Set(ra).size,1);assert.equal(new Set(timers).size,1);
  const oldRa=ra.at(-1),oldTimer=timers.at(-1);d.reset('fixture');d.schedule();const count=frames;
  oldRa(now+17);oldTimer();assert.equal(frames,count);assert.notEqual(ra.at(-1),oldRa);
  d.dispose();
});

test('indexed decor keeps exactly the expanded attribute stream without duplicating vertices', () => {
  const make=source=>new Function('THREE','mergeGeometries',source.slice(source.indexOf('function merge(list) {'),source.indexOf('\n// Original squid emblem'))+'\nreturn merge;')(THREE,mergeGeometries);
  const functions=[make(read('src/world/decor.js')),make(patch('src/world/decor.js'))];
  const parts=[new THREE.BoxGeometry(1,2,3),new THREE.SphereGeometry(.7,12,8),new THREE.PlaneGeometry(1,1).toNonIndexed()];
  for(const g of parts)g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3).fill(.5),3));
  const results=functions.map(f=>f(parts.map(g=>g.clone()))),expanded=results.map(g=>g.index?g.toNonIndexed():g);
  assert.deepEqual(geometrySnapshot({...expanded[1],index:{array:new Uint16Array()}}),geometrySnapshot({...expanded[0],index:{array:new Uint16Array()}}));
  assert.ok(results[1].attributes.position.count<results[0].attributes.position.count);
  [...parts,...results,...expanded].forEach(g=>g.dispose());
});

test('actual capsule contacts and body-fit results retain translated-axis rounding', () => {
  const make=source=>new Function('THREE',source.replace(/^import .*;$/gm,'').replaceAll('export ','')+'\nreturn Physics;')(THREE);
  const Classes=[make(read('src/game/physics.js')),make(patch('src/game/physics.js'))];
  let seed=443;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const blocks=Array.from({length:8},(_,id)=>{const center=new THREE.Vector3(rnd()*4-2,rnd()*2,rnd()*4-2),half=new THREE.Vector3(.2+rnd(),.2+rnd(),.2+rnd()),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd()*.5,rnd()*3,rnd()*.2)),axes=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)].map(v=>v.applyQuaternion(q)),box=new THREE.Box3();
    for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])box.expandByPoint(center.clone().addScaledVector(axes[0],half.x*x).addScaledVector(axes[1],half.y*y).addScaledVector(axes[2],half.z*z));
    return{id,center,half,axes,solid:true,grate:id%4===0,aabbMin:box.min,aabbMax:box.max};});
  const level={blocks,queryBlocks(_a,_b,_c,_d,out){out.length=0;for(const b of blocks)out.push(b.id);return out;}};
  const engines=Classes.map(C=>new C(level));
  for(let i=0;i<600;i++){
    const p=new THREE.Vector3(rnd()*5-2.5,rnd()*3-1,rnd()*5-2.5),radius=.1+rnd()*.5,lift=rnd()*.2,height=rnd()*2;
    const rows=engines.map(e=>{const pos=p.clone(),c={groundNormal:new THREE.Vector3(),wallNormal:new THREE.Vector3()};e.collideBody(pos,radius,lift,height,c,i%2===0,i%3===0);return{pos,c,fits:e.bodyFits(p,radius,lift,height,i%3===0)}});
    assert.deepEqual(rows[1],rows[0]);
  }
});

test('warmAll synchronous compile failure removes warm meshes and restores every visibility flag', async () => {
  const source=patch('src/game/character.js');
  const C=new Function('THREE','G','IDENT','farGeometry','return class{'+method(source,'async warmAll')+'}')(THREE,{settings:{quality:'high'},post:{composer:{readBuffer:{}}}},new THREE.Matrix4(),()=>{});
  const c=new C();c.root=new THREE.Group();c.kid=new THREE.Group();c.kid.visible=false;c.root.add(c.kid);c.weapons={};c.skeleton=new THREE.Skeleton([]);c._tierSet=()=>({list:[]});
  let target={id:'old'};const r={compileAsync(){throw Error('sync compile');},getRenderTarget:()=>target,setRenderTarget:t=>{target=t;}};const old=target;
  await assert.rejects(c.warmAll(r,{},{}),/sync compile/);
  assert.equal(c.kid.children.length,0);assert.equal(c.kid.visible,false);assert.equal(target,old);
});

test('far weapon material/color hoist preserves every decimated buffer and corner split', () => {
  const source=read('src/game/character-lod.js');
  assert.equal(patch('src/game/character-lod.js'),source,'migrated LOD module has zero build-time rewrite');
  const legacy=replaceOnce(source,`      let same = true;
      for (let k = 0; k < sourceMat.itemSize; k++) if (sourceMat.getComponent(original, k) !== clusterMat.getComponent(cluster, k)) { same = false; break; }
      if (same) for (let k = 0; k < sourceColor.itemSize; k++) if (sourceColor.getComponent(original, k) !== clusterColor.getComponent(cluster, k)) { same = false; break; }`,
    `      const same = ['aMat', 'color'].every(name => {
        const a = A[name], b = attributes[name];
        for (let k = 0; k < a.itemSize; k++) if (a.getComponent(original, k) !== b.getComponent(cluster, k)) return false;
        return true;
      });`,'pre-hoist comparison control');
  const before=new Function('THREE',legacy.replace(/^import .*;$/gm,'').replaceAll('export ','')+'\nreturn {clusterDecimate,farGeometry};')(THREE);
  const after=new Function('THREE',patch('src/game/character-lod.js').replace(/^import .*;$/gm,'').replaceAll('export ','')+'\nreturn {clusterDecimate,farGeometry};')(THREE);
  for(const indexed of [false,true])for(const normalized of [false,true])for(const constant of [false,true]){
    const g=new THREE.SphereGeometry(1,20,12),n=g.attributes.position.count;
    if(!indexed){const expanded=g.toNonIndexed();g.dispose();g.copy(expanded);expanded.dispose();}
    const count=g.attributes.position.count,material=new Float32Array(count),color=new Float32Array(count*4);
    for(let i=0;i<count;i++){material[i]=constant?0:i%4;for(let k=0;k<4;k++)color[i*4+k]=constant?.5:((i*7+k*3)%11)/10;}
    if(!constant){material[3]=NaN;color[13]=-0;}
    g.setAttribute('aMat',new THREE.BufferAttribute(material,1,normalized));g.setAttribute('color',new THREE.BufferAttribute(color,4,normalized));
    for(const cell of [.08,.3,.7]){const a=before.clusterDecimate(g,cell),b=after.clusterDecimate(g,cell);assert.deepEqual(geometrySnapshot(b),geometrySnapshot(a));assert.deepEqual(b.boundingSphere,a.boundingSphere);a.dispose();b.dispose();}
    g.dispose();
  }
});

test('frame deadlines retain the absolute phase with bounded work after long visible stalls', () => {
  for(const fps of [30,60,120])for(const gap of [0,150,250,251,10000,60000,600000])for(const jitter of [-1,0,1]){
    const interval=1000/fps,initial=interval,now=gap+jitter+interval*2,limit=now+1;
    let expected=initial,oldAdds=0;while(expected<=limit){expected+=interval;oldAdds++;}
    let actual=initial,reads=0,delay;
    const owner={active:true,env:{performance:{now:()=>now},setTimeout(fn,d){delay=d;return 1;}},subscribe(){return()=>{};}};
    const d=new PlatformFrameDriver(owner,()=>{},()=>{},()=>fps);d.running=true;d.frameInterval=interval;
    Object.defineProperty(d,'nextDeadline',{get(){reads++;return actual;},set(v){actual=v;}});
    d._scheduleNext(0);
    assert.ok(actual>limit,'next deadline is strictly after the lead boundary');
    assert.ok(Object.is(actual,expected),'same deadline including legacy repeated-addition roundoff');
    if(oldAdds<=8)assert.equal(actual,expected,'ordinary cadence remains bit exact');
    assert.equal(delay,actual-now-1);assert.ok(reads<160,'deadline work follows exponent boundaries rather than expired slots');d.dispose();
  }
});

test('texlib acquires programs incrementally and releases every completed allocation on factory failure', async () => {
  const source=adaptBuildSource('src/world/texlib.js',read('src/world/texlib.js'));
  for(const failure of ['arrayTexture','attribute','secondProgram','compileState']){
    const resources=[];let arrays=0,programs=0;
    const own=(o,type)=>{const r={o,type,disposed:0};o.addEventListener('dispose',()=>r.disposed++);resources.push(r);};
    const namespace={...THREE,
      WebGLArrayRenderTarget:class extends THREE.WebGLArrayRenderTarget{constructor(...a){super(...a);own(this,'target');}},
      DataArrayTexture:class extends THREE.DataArrayTexture{constructor(...a){if(++arrays===2&&failure==='arrayTexture')throw Error(failure);super(...a);}},
      BufferGeometry:class extends THREE.BufferGeometry{constructor(...a){super(...a);own(this,'geometry');}setAttribute(...a){if(failure==='attribute')throw Error(failure);return super.setAttribute(...a);}},
      RawShaderMaterial:class extends THREE.RawShaderMaterial{constructor(...a){if(++programs===2&&failure==='secondProgram')throw Error(failure);super(...a);own(this,'program');}},
    };
    const factory=new Function('THREE','STAGE_SURFACES','performance',source.replace(/^import .*;$/gm,'').replace(/^export \{[^\n]*\};?$/gm,'').replaceAll('export ','')+'\nreturn createTextureLibrary;')(namespace,[],performance);
    const previous={},renderer={capabilities:{getMaxAnisotropy:()=>8},target:previous,autoClear:true,xr:{enabled:true},getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},async compileAsync(){this.target={};this.autoClear=false;this.xr.enabled=false;throw Error(failure);}};
    await assert.rejects(factory(renderer),new RegExp(failure));
    assert.ok(resources.some(r=>r.type==='target'));
    for(const r of resources)assert.equal(r.disposed,1,failure+'/'+r.type+' retired once');
    assert.equal(renderer.target,previous);assert.equal(renderer.autoClear,true);assert.equal(renderer.xr.enabled,true);
    if(failure==='secondProgram')assert.equal(resources.filter(r=>r.type==='program').length,1,'first program remains owned when second factory throws');
  }
});

test('map target selection allocates no idle snapshot and preserves every requested target and input read order', () => {
  const rawPlayer=read('src/game/player.js'),composed=adaptReliability('src/game/player.js',adaptTouchLayout('src/game/player.js',adaptSource('src/game/player.js',rawPlayer)));
  for (const sources of [[rawPlayer,patch('src/game/player.js')],[composed,adaptRuntimeFrameScratch('src/game/player.js',composed,replaceOnce)]]) {
  const make=(source,G)=>{const start=source.indexOf('    if (this.mapHeld && a.canSuperJump()) {'),end=source.indexOf('\n\n    // ---- aim point',start),helper=source.includes('function iwPickMapAlly')?source.slice(source.indexOf('function iwPickMapAlly'),source.indexOf('export class PlayerController')):'';return new Function('G','hasCommittedSuperJumpDestination',helper+'\nreturn function(a,inp,touch){const standardPad=false;'+source.slice(start,end)+'}')(G,o=>!!o.committed);};
  for(const mode of ['keyboard','pad','touch'])for(let bits=0;bits<16;bits++){
    const outcomes=[];
    for(let side=0;side<2;side++){
      const calls=[],a={team:0,canSuperJump:()=>true,selectSuperJumpTarget(o){calls.push('select:'+o.id);return o.id;},superJump(o,ticket){calls.push('jump:'+o.id+':'+ticket);}},allies=[a,{team:1,id:'enemy'},{team:0,id:'first',alive:false},,{team:0,id:'second',alive:true},{team:0,id:'third',alive:true,superJumpState:{}}];
      let scans=0;const actors=new Proxy(allies,{get(t,p,r){if(/^\d+$/.test(String(p)))scans++;return Reflect.get(t,p,r);}}),G={actors,level:{spawnPads:[{clone:()=>({id:'spawn'})}]}};
      const inp={wasPressed(k){calls.push(k);return mode==='keyboard'&&!!(bits&(1<<(+k.at(-1)-1)));},padPressed:{has(k){calls.push('pad:'+k);return mode==='pad'&&!!(bits&(1<<({14:0,12:1,15:2,13:3}[k])));}}};
      const touch={consumeJumpTarget(){calls.push('touch');return mode==='touch'?bits%5-1:-1;}},controller={a,mapHeld:true};
      make(sources[side],G).call(controller,a,inp,touch);
      if(side){assert.equal(controller._iwMapAllies?.length??0,0);if(mode!=='touch'&&bits===0)assert.equal(scans,0,'idle open map never reads actor slots');}
      outcomes.push(calls);
    }
    assert.deepEqual(outcomes[1],outcomes[0],mode+'/'+bits);
  }
  const G={actors:[],level:{spawnPads:[]}},a={team:0,canSuperJump:()=>true,superJump(){throw Error('jump');}},ally={team:0,alive:true};G.actors=[a,ally];
  const controller={a,mapHeld:true};assert.throws(()=>make(sources[1],G).call(controller,a,{wasPressed:()=>true,padPressed:new Set()},null),/jump/);assert.equal(controller._iwMapAllies.length,0);
  }
});

test('legacy hair metadata coefficients preserve complete spring state and bone transforms through metadata edits', () => {
  const make=source=>{
    const scope={TAU:Math.PI*2,HAIR_SEGS:3,HEAD_CTR:new THREE.Vector3(0,.15,.02),IW_HAIR_COEFFS:new WeakMap(),
      clamp:(x,a,b)=>Math.max(a,Math.min(b,x))};
    for(let i=1;i<=6;i++)scope['_v'+i]=new THREE.Vector3();for(let i=1;i<=5;i++)scope['_q'+i]=new THREE.Quaternion();
    return new Function(...Object.keys(scope),'return function '+method(source,'_updateHair'))(...Object.values(scope));
  };
  const before=make(read('src/game/character.js')),after=make(patch('src/game/character.js'));
  function state(){const n=3,meta=Array.from({length:n},(_,i)=>({K:.6+i*.5,len:.14+i*.08,G:.8+i*.1,dir:new THREE.Vector3(.2,.8,.3).normalize()}));return {
    bones:{head:{}},model:new THREE.Object3D(),kid:new THREE.Object3D(),
    _kidXform(_bone,v,q){v.set(Math.sin(this.t)*.1,1+Math.cos(this.t*1.7)*.02,.1);q.setFromEuler(new THREE.Euler(Math.sin(this.t)*.2,this.t*.3,Math.cos(this.t*2)*.1));},
    headPrevPos:new THREE.Vector3(),headPrevVel:new THREE.Vector3(),headVel:new THREE.Vector3(),headPrevQuat:new THREE.Quaternion(),headAcc:new THREE.Vector3(),
    hairMeta:meta,hairAx:Float64Array.from({length:n*12},(_,i)=>i%3===1?1:0),hairA1:Float64Array.from({length:n*12},(_,i)=>i%3===0?1:0),hairA2:Float64Array.from({length:n*12},(_,i)=>i%3===2?1:0),
    hairIn:Float64Array.from({length:n*3},(_,i)=>i%3===2?1:0),hairPh:Float64Array.from([.2,.8,1.3]),hx:new Float64Array(n*9),hv:new Float64Array(n*9),tipX:new Float64Array(n*3),tipV:new Float64Array(n*3),hairBones:Array.from({length:n*3},()=>new THREE.Object3D()),hairTips:Array.from({length:n},()=>new THREE.Object3D()),t:0,gaitW:.2,wAir:0,kidForm:true};}
  const snapshot=s=>({arrays:['hx','hv','tipX','tipV'].map(k=>Buffer.from(s[k].buffer)),bones:[...s.hairBones,...s.hairTips].map(o=>o.quaternion.toArray()),head:[s.headRY,s.headRZ]});
  for(const hz of [30,60,120]){
    const a=state(),b=state();
    for(let i=0;i<240;i++){
      for(const s of [a,b]){s.t=i/hz;s.gaitW=(i%90)/90;s.wAir=i%61===0?.3:0;s.kidForm=i%80<60;if(i===70){s.hairMeta[0].K*=1.13;s.hairMeta[1].len*=.95;s.hairMeta[2].G*=.8;}if(i===140){s.hairMeta[1]={...s.hairMeta[1],K:.7};}}
      const dt=i%61===0?0:i%47===0?.07:1/hz;before.call(a,dt);after.call(b,dt);assert.deepEqual(snapshot(b),snapshot(a),hz+'/'+i);
    }
  }
});

test('private renderer installation checks WeakMap membership only when the renderer identity changes', () => {
  const source=fs.readFileSync(new URL('../../splatoon3/runtime/private-tracking-render.mjs',import.meta.url),'utf8');let lookups=0;
  class CountedMap extends WeakMap{has(k){lookups++;return super.has(k);}}
  const install=new Function('WeakMap',source.replaceAll('export ','')+'\nreturn installPrivateTrackingRenderer;')(CountedMap);
  const first={render(){}},second={render(){}},G={renderer:first},attach=install({G,THREE,on(){}},()=>0),wrapped=first.render;
  for(let i=0;i<1000;i++)attach();assert.equal(lookups,1);assert.equal(first.render,wrapped);
  G.renderer=second;attach();assert.equal(lookups,2);const secondWrapped=second.render;
  G.renderer=null;attach();G.renderer=second;attach();assert.equal(lookups,2);assert.equal(second.render,secondWrapped);
  G.renderer=first;attach();assert.equal(lookups,3);assert.equal(first.render,wrapped);
});

test('actual showcase camera and panel easing follow bounded elapsed time across display rates', () => {
  const code=patch('src/game/showcase.js'),raw=read('src/game/showcase.js'),G={env:null},OVERLAY=new Set(),PEDESTAL=new Set();
  const update=new Function('G','OVERLAY','PEDESTAL','return function '+method(code.slice(code.indexOf('export class Showcase')),'update'))(G,OVERLAY,PEDESTAL);
  const lobby=source=>new Function('THREE','GLIDE','eInOut','lerp','return function '+method(source,'_lobCamera'))(THREE,.3,x=>x,(a,b,k)=>a+(b-a)*k);
  const panel=source=>new Function('document','PEDESTAL','return function '+method(source,'_measureUI'))({},PEDESTAL);
  const make=()=>({mode:null,chars:[],_updateSet(){},t:1,ui:{W:100,H:100,next:Infinity,panelR:100,titleR:100,titleB:100,bandB:100,s:{panelR:0,titleR:0,titleB:0,bandB:0}},
    lob:{t:0,reduced:true,cs:{fov:0,sx:0,sy:0}},_lobFrame(){return {fov:100,sx:100,sy:100,pos:new THREE.Vector3(),tgt:new THREE.Vector3()};},_placeLook(){}});
  for(const hz of [30,60,120]){
    const state=make(),control=make();control._fdt=1/60;
    for(let i=0;i<hz*.2;i++){update.call(state,1/hz);lobby(code).call(state,100,100);panel(code).call(state,100,100);if(hz===60){lobby(raw).call(control,100,100);panel(raw).call(control,100,100);assert.deepEqual(state.lob.cs,control.lob.cs);assert.deepEqual(state.ui.s,control.ui.s);}}
    assert.ok(Math.abs(state.lob.cs.fov-100*(1-Math.exp(-7*.2)))<1e-12);assert.ok(Math.abs(state.ui.s.panelR-100*(1-Math.exp(-8*.2)))<1e-12);
    const before=JSON.stringify([state.lob.cs,state.ui.s]);update.call(state,0);lobby(code).call(state,100,100);panel(code).call(state,100,100);assert.equal(JSON.stringify([state.lob.cs,state.ui.s]),before,'zero elapsed time freezes both easing paths');
  }
  const state=make();update.call(state,.5);assert.equal(state._fdt,.1,'retain the existing update clamp');
  const initial=make();lobby(code).call(initial,100,100);panel(code).call(initial,100,100);assert.equal(initial.lob.cs.fov,100*(1-Math.exp(-7/60)));assert.equal(initial.ui.s.panelR,100*(1-Math.exp(-8/60)));
});

test('shared rim derivation exactly observes live sky and camera mutations while retaining per-character uniforms', () => {
  const G={camera:new THREE.PerspectiveCamera()},CHAR_RIM={k:1,fill:1},sky={horizon:new THREE.Color(.4,.6,.8),sun:new THREE.Color(.8,.7,.3),sunDir:new THREE.Vector3(.2,.8,.1).normalize(),sunIntensity:2.3,night:.2};
  let derivations=0;const math=Object.create(Math);math.min=(...args)=>{derivations++;return Math.min(...args);};
  const make=(source,tracked=false)=>new Function('THREE','G','CHAR_RIM','skyColors','sstep','lerp','IW_RIM_WORLD','IW_RIM_NEUTRAL','Math','return function '+method(source,'_updateRim'))(THREE,G,CHAR_RIM,()=>sky,(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);},(a,b,k)=>a+(b-a)*k,new WeakMap(),{},tracked?math:Math);
  const before=make(read('src/game/character.js')),after=make(patch('src/game/character.js'),true),state=()=>({inWorld:true,u:{uIwRim:{value:new THREE.Vector4()},uIwRimL:{value:new THREE.Vector3(.8,.2,-.1)},uIwFill:{value:new THREE.Color()}}});
  const pairs=Array.from({length:8},()=>[state(),state()]);
  for(let frame=0;frame<90;frame++){
    if(frame%9===0){sky.horizon.g+=.01;sky.sun.r-=.003;sky.sunDir.x+=.02;sky.sunDir.normalize();sky.night=(frame%30)/30;sky.sunIntensity=frame%18===0?0:2.3;CHAR_RIM.k=frame%27===0?0:.8;CHAR_RIM.fill=frame%18===0?0:.7;}
    if(frame===40)G.camera=new THREE.PerspectiveCamera();
    for(let i=0;i<8;i++){
      // Live same-tick view mutation must invalidate an already-used snapshot.
      if(i===4&&frame%7===0)G.camera.matrixWorldInverse.makeRotationY(frame*.03);
      const [a,b]=pairs[i];a.inWorld=b.inWorld=i%3!==0;
      before.call(a);after.call(b);assert.deepEqual(b.u,a.u,frame+'/'+i);
      assert.notEqual(b.u.uIwRim.value,pairs[(i+1)%8][1].u.uIwRim.value,'uniform ownership is independent');
    }
  }
  assert.ok(derivations<100,'stable shared world inputs derive once rather than per character: '+derivations);
  CHAR_RIM.k=0;const a=state(),b=state();a.u.uIwRimL.value.set(.3,.1,.8);b.u.uIwRimL.value.copy(a.u.uIwRimL.value);before.call(a);after.call(b);assert.deepEqual(b.u,a.u,'rim0 retains each caller existing direction');
});
