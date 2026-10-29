import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root=process.env.INKWAVE_LATE_REPO || fileURLToPath(new URL('../../../',import.meta.url));
const url=rel=>pathToFileURL(path.join(root,rel));
const {parse}=await import(url('patches/loading-cache/vendor/acorn.mjs'));
const {adaptBuildSource}=await import(url('scripts/inkwave-source-composition.mjs'));
const T=await import(url('inkwave-public/vendor/three/build/three.module.js'));
const {transformSync}=await import(url('node_modules/esbuild/lib/main.js'));
const stage=process.env.INKWAVE_LATE_ADAPTER ? (await import(pathToFileURL(process.env.INKWAVE_LATE_ADAPTER))).adaptLateRoot20261029 : null;
const fixture=JSON.parse(fs.readFileSync(process.env.INKWAVE_LATE_FIXTURE || new URL('./fixtures/late-root-before-20261029.json',import.meta.url),'utf8'));
const raw=rel=>fs.readFileSync(path.join(root,'inkwave-public',rel),'utf8');
const cache=new Map();
function source(rel){if(!cache.has(rel)){let s=adaptBuildSource(rel,raw(rel));if(stage)s=stage(rel,s);cache.set(rel,s);}return cache.get(rel);}
const klasses={'src/main.js':'Game','src/world/environment.js':'Environment','src/net/transport.js':'Transport','src/ui/hud-boss.js':'BossHud','src/core/mobile.js':'MobileInput'};
function method(rel,key){const s=source(rel),ast=parse(s,{ecmaVersion:'latest',sourceType:'module'}),cls=ast.body.map(n=>n.declaration||n).find(n=>n.type==='ClassDeclaration'&&n.id.name===klasses[rel]);const m=cls.body.body.find(n=>n.key.name===key);assert.ok(m,rel+'#'+key);return s.slice(m.start,m.end);}
function compile(text,key,bindings={},minified=false){let s='var __lateMethod = ({'+text+'})['+JSON.stringify(key)+'];';if(minified)s=transformSync(s,{minify:true,loader:'js',target:'es2022'}).code;return new Function(...Object.keys(bindings),'"use strict";'+s+'return __lateMethod;')(...Object.values(bindings));}
function old(rel,key){return fixture.methods[rel+'#'+key].source;}
function fn(rel,key,bindings,mode='source',baseline=false){return compile(baseline?old(rel,key):method(rel,key),key,bindings,mode==='minified');}
function hash(s){return crypto.createHash('sha256').update(s).digest('hex');}
const damp=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt));
const noopExpression=raw('src/audio/audio.js').match(/const NOOP_HANDLE = ([^;]+);/)?.[1];
assert.ok(noopExpression);
const NOOP=new Function('return '+noopExpression)();
test('frozen phase1 method oracles keep their original source digests',()=>{for(const row of Object.values(fixture.methods))assert.equal(hash(row.source),row.sha256);assert.ok(Object.isFrozen(NOOP));assert.equal(NOOP.playing,false);});

function audioRig(mode,baseline=false){
 const trace=[],handles=[],G={audio:null,level:{bounds:{maxX:30,maxZ:40},layout:{id:'test'}}};
 const audio={ctx:{state:'running'},silent:false,attempts:0,mode:'valid',loops:new Set(),canRearmLoop(){return !!this.ctx&&this.ctx.state!=='closed'&&!this.silent&&this.loops.size<24;},loop(name,opts){
  this.attempts++;trace.push(['loop',name,opts.volume]);
  if(this.mode==='throw')throw Error('injected allocation failure');
  if(this.mode==='noop')return NOOP;
  const h={name,playing:this.mode!=='deferred',_sfxDeferred:this.mode==='deferred',stops:0,set(p){trace.push(['set',name,{...p}]);},stop(t){this.stops++;this.playing=false;this._sfxDeferred=false;audio.loops.delete(this);trace.push(['stop',name,t]);}};
  handles.push(h);this.loops.add(h);return h;
 },play(name,opts){trace.push(['play',name,{...opts,pos:opts.pos?.toArray()}]);}};
 G.audio=audio;
 const game={_audioOn:true,showcase:{fullFrame:true},match:{attract:false,paused:false,local:{alive:true,anim:{form:'swim'},vel:{x:2,y:0,z:0},grounded:false,groundTeam:1}}};
 const bindings={G,damp,THREE:T};
 for(const key of ['_wantLocalLoop','_updateLocalLoops','_updateAmbience'])game[key]=fn('src/main.js',key,bindings,mode,baseline);
 if(!baseline)game._recoverMainLoop=fn('src/main.js','_recoverMainLoop',bindings,mode);
 return {G,audio,game,trace,handles};
}
for(const mode of ['source','minified']){
 for(const hz of [30,60,120])test(mode+' normal swim/climb/enemy/ambience curves and stop timing remain exact at '+hz+'Hz',()=>{
  const a=audioRig(mode,true),b=audioRig(mode);
  for(let i=0;i<hz*30;i++){
   for(const r of [a,b]){const phase=i%(hz*7),p=r.game.match.local;p.anim.form=phase<hz*2?'swim':phase<hz*4?'climb':'walk';p.vel.x=i%7;p.vel.y=(i%5)-2;p.grounded=phase>=hz*4;p.groundTeam=phase<hz*6?2:1;p.alive=phase<hz*6;r.game._updateLocalLoops(1/hz);r.game._updateAmbience(1/hz);}
   assert.deepEqual(b.trace,a.trace);a.trace.length=b.trace.length=0;
  }
 });
 test(mode+' missing context and real frozen NOOP cannot crash or become retained movement/ambience handles',()=>{
  const prior=audioRig(mode,true);prior.audio.ctx=null;prior.audio.mode='noop';assert.throws(()=>prior.game._updateLocalLoops(1/60),TypeError);
  const next=audioRig(mode);next.audio.ctx=null;next.audio.mode='noop';
  for(let i=0;i<600;i++){next.game._updateLocalLoops(1/60);next.game._updateAmbience(1/60);}
  assert.equal(next.audio.attempts,0);assert.equal(next.game._loops.swim,null);assert.equal(next.game._amb,null);assert.equal(Object.hasOwn(NOOP,'_v'),false);
  next.audio.ctx={state:'running'};for(let i=0;i<600;i++){next.game._updateLocalLoops(1/60);next.game._updateAmbience(1/60);}
  assert.ok(next.audio.attempts>=2&&next.audio.attempts<=42,'at most one attempt per0.5s per requested loop');
  assert.equal(next.game._loops.swim,null);assert.equal(next.game._amb,null);
  next.audio.mode='valid';for(let i=0;i<32;i++){next.game._updateLocalLoops(1/60);next.game._updateAmbience(1/60);}
  assert.equal(next.game._loops.swim.playing,true);assert.equal(next.game._amb.playing,true);
 });
 test(mode+' exceptions, deferred mute, full-budget recovery and no duplicate active loops',()=>{
  const r=audioRig(mode);r.audio.mode='throw';for(let i=0;i<120;i++)r.game._updateLocalLoops(1/60);assert.ok(r.audio.attempts<=4);
  r.audio.ctx={state:'suspended'};r.audio.mode='deferred';r.audio.silent=true;r.game._updateLocalLoops(1/60);const deferred=r.game._loops.swim;assert.equal(deferred._sfxDeferred,true);
  const count=r.audio.attempts;for(let i=0;i<120;i++)r.game._updateLocalLoops(1/60);assert.equal(r.audio.attempts,count);assert.equal(r.game._loops.swim,deferred);
  r.audio.silent=false;deferred.playing=true;deferred._sfxDeferred=false;r.audio.ctx.state='running';r.audio.mode='valid';r.game._updateLocalLoops(1/60);assert.equal(r.game._loops.swim,deferred);
  deferred.stop();for(let i=0;i<24;i++)r.audio.loops.add({playing:true});for(let i=0;i<120;i++)r.game._updateLocalLoops(1/60);assert.equal(r.audio.attempts,count);
  r.audio.loops.delete(r.audio.loops.values().next().value);r.game._updateLocalLoops(1/60);assert.equal(r.audio.attempts,count+1);const live=r.game._loops.swim;
  for(let i=0;i<120;i++)r.game._updateLocalLoops(1/60);assert.equal(r.game._loops.swim,live);assert.equal(r.audio.attempts,count+1);
 });
 test(mode+' context identity replacement and closure stop old owned handles exactly once',()=>{
  const r=audioRig(mode);r.game._updateLocalLoops(1/60);r.game._updateAmbience(1/60);const oldSwim=r.game._loops.swim,oldAmb=r.game._amb;
  r.audio.ctx={state:'running'};r.game._updateLocalLoops(1/60);r.game._updateAmbience(1/60);
  assert.equal(oldSwim.stops,1);assert.equal(oldAmb.stops,1);assert.notEqual(r.game._loops.swim,oldSwim);assert.notEqual(r.game._amb,oldAmb);
  const liveSwim=r.game._loops.swim,liveAmb=r.game._amb;r.audio.ctx.state='closed';for(let i=0;i<5;i++){r.game._updateLocalLoops(1/60);r.game._updateAmbience(1/60);}
  assert.equal(liveSwim.stops,1);assert.equal(liveAmb.stops,1);assert.equal(r.game._loops.swim,null);assert.equal(r.game._amb,null);
  r.audio.ctx={state:'running'};r.game._updateAmbience(1/60);const last=r.game._amb,attempts=r.audio.attempts;r.game._audioOn=false;r.audio.ctx={state:'running'};r.game._updateAmbience(1/60);
  assert.equal(last.stops,1);assert.equal(r.game._amb,null);assert.equal(r.audio.attempts,attempts);
 });
 test(mode+' failed ambience still advances existing volume and gull clocks',()=>{
  const r=audioRig(mode);r.audio.mode='noop';r.game.showcase.fullFrame=false;r.game._gullT=4;
  for(let i=0;i<60;i++)r.game._updateAmbience(1/60);
  assert.ok(Math.abs(r.game._gullT-3)<1e-12);assert.equal(r.game._ambV,.55);assert.equal(r.game._amb,null);
 });
}

function environmentRig(mode,baseline=false){
 const binding={_m4:new T.Matrix4(),_q:new T.Quaternion(),_e:new T.Euler(),_v:new T.Vector3(),_s:new T.Vector3(),WATER_Y:-1.6,smooth:(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);}};
 function inst(){const matrix={array:new Float32Array(16),ranges:[],needsUpdate:false,clearUpdateRanges(){this.ranges=[];},addUpdateRange(a,b){this.ranges.push([a,b]);}};return{instanceMatrix:matrix,setMatrixAt(i,m){matrix.array.set(m.elements,i*16);}};}
 const self={time:0,_frameId:0,U:{uTime:{value:0}},sky:{position:new T.Vector3()},footprint:[{aligned:true,minX:-10,maxX:10,minZ:-20,maxZ:20}],moored:[{spec:{x:15,z:25},mesh:{position:new T.Vector3(),rotation:new T.Euler()},phase:.3,roll:.04}],sailboats:[{a:.2,w:.03,d:50,phase:.7,s:.8}],buoys:[{x:22,z:31,phase:.4,s:.9}],gulls:[{a0:.1,w:.2,cx:12,cz:5,r:30,h:15,s:.8}],sailInst:inst(),buoyInst:inst(),gullInst:inst(),ferris:{rotation:new T.Euler()},lhBeam:{rotation:new T.Euler()}};
 for(const key of ['update','_animate','waterHeightAt'])self[key]=fn('src/world/environment.js',key,binding,mode,baseline);
 const snapshot=()=>({time:self.time,frame:self._frameId,uTime:self.U.uTime.value,sky:self.sky.position.toArray(),moored:self.moored.map(m=>[...m.mesh.position.toArray(),...m.mesh.rotation.toArray()]),sail:[...self.sailInst.instanceMatrix.array],buoy:[...self.buoyInst.instanceMatrix.array],gull:[...self.gullInst.instanceMatrix.array],ferris:self.ferris.rotation.z,beam:self.lhBeam.rotation.y});
 return {self,snapshot};
}
for(const mode of ['source','minified']){
 for(const hz of [30,60,120])test(mode+' actual environment animation matrices and uniform clocks are unchanged at '+hz+'Hz',()=>{
  const a=environmentRig(mode,true),b=environmentRig(mode),camera={position:new T.Vector3(4,5,6)};
  for(let i=0;i<hz*5;i++){a.self.update(1/hz,camera);b.self.update(1/hz,camera);assert.deepEqual(b.snapshot(),a.snapshot());}
 });
 test(mode+'4/5/8/10Hz admitted foreground frames reach10s with analytical geometry, preserving250ms ceiling',()=>{
  for(const hz of [4,5,8,10]){const a=environmentRig(mode,true),b=environmentRig(mode),reference=environmentRig(mode,true);
   for(let i=0;i<hz*10;i++){a.self.update(1/hz);b.self.update(1/hz);}assert.ok(Math.abs(b.self.time-10)<1e-10);
   if(hz<10)assert.ok(a.self.time<9,'old100ms cap negative control');
   reference.self.time=b.self.time;reference.self._frameId=b.self._frameId;reference.self.U.uTime.value=b.self.time;reference.self._animate();assert.deepEqual(b.snapshot(),reference.snapshot());
  }
  for(const dt of [0,.125,.2,.25,.5,Infinity,NaN]){const r=environmentRig(mode);r.self.update(dt);assert.equal(r.self.time,Math.min(dt||0,.25));}
  const main=source('src/main.js');assert.match(main,/Math\.min\([^\n]*(?:0\.25|\.25)/,'foreground driver keeps an admitted delta ceiling');
 });
}

test('already composed boss scratch preserves public fresh ownership and each roster shrink/grow transition',()=>{
 const squad=fn('src/ui/hud-boss.js','squadTeams'),views=[{color:null,players:[]},{color:null,players:[]}],a=views[0].players,b=views[1].players;
 for(let n=0;n<500;n++){const teams=Array.from({length:n%4},(_,i)=>({color:i===0?'blue':'pink',players:Array.from({length:(n+i)%9},(_,j)=>({id:n+':'+i+':'+j}))}));const expected=squad(teams);const result=squad(teams,views);assert.equal(result,views);assert.equal(views[0].players,a);assert.equal(views[1].players,b);assert.deepEqual(result,expected);assert.notEqual(squad(teams),expected);assert.notEqual(squad(teams)[0].players,expected[0].players);}
 const hud=source('src/ui/hud.js');assert.match(hud,/squadTeams\(f\.teams,\s*this\._bossSquadViews\s*\|\|=/);
});
test('installed mobile editor already updates the selected control, while live safe-area changes still trigger full layout',()=>{
 const rel='src/core/mobile.js',code=source(rel);let safe={l:0,r:0,t:0,b:0},reads=0,unit=6,all=0;const selected=[];
 const bindings={innerWidth:800,innerHeight:600,layoutUnit:()=>unit};
 const self={root:{},_safe:()=>{reads++;return{...safe};},_safeBox:{...safe},_layoutWidth:800,_layoutHeight:600,_H:6,_stick:{active:false},editing:true,_sel:'fire',_layoutControl:id=>selected.push(id),_layoutCoordinates(){},_drawStick(){},_layoutAll(){all++;this._safeBox={...safe};this._H=unit;}};
 const update=fn(rel,'_layoutOne',bindings);for(let i=0;i<100;i++)update.call(self,'fire');assert.equal(all,0);assert.equal(selected.length,100);assert.equal(reads,100,'live inset probe is intentionally retained, not claimed eliminated');
 safe.r=20;update.call(self,'fire');assert.equal(all,1);unit=7;update.call(self,'fire');assert.equal(all,2);
 const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});let drag,position;function visit(n){if(!n||typeof n!=='object')return;if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.object.name==='proto'){if(n.left.property.name==='_editMove')drag=code.slice(n.right.start,n.right.end);if(n.left.property.name==='_layoutPosition')position=code.slice(n.right.start,n.right.end);}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}visit(ast);
 assert.ok(drag&&position);const moved=[];const move=new Function('stopEdit','return ('+drag+')')(()=>{});move.call({_edit:{pts:new Map([[5,{}]]),drag:{id:'fire',pointer:5,ox:2,oy:3}},_layoutPosition:(...args)=>moved.push(args)},{pointerId:5,clientX:32,clientY:43});assert.deepEqual(moved,[['fire',30,40]]);assert.match(position,/this\._layoutOne\(id\)/);
});
