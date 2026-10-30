import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
import * as kit from '../runtime/special-vfx-kit.mjs';
import { WAIL_SPEAKER_POSITIONS } from '../runtime/wail-speakers.mjs';
import { nonWailVfxTicks, consumeVfxPeriod } from '../runtime/nonwail-vfx-clock.mjs';
import { inkjetVfxTicks } from '../runtime/inkjet-vfx-clock.mjs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';

const current=fs.readFileSync(new URL('../runtime/special-vfx.mjs',import.meta.url),'utf8');
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-special-restored-before-1878.json',import.meta.url),'utf8'));
const ast=parse(current,{ecmaVersion:'latest',sourceType:'module'}),director=ast.body.find(n=>n.type==='ClassDeclaration'&&n.id.name==='Director');
const frames=ast.body.find(n=>n.type==='VariableDeclaration'&&n.declarations[0].id.name==='DIRECTORS').declarations[0].init;
let baseline=current;
for(const [key,value] of Object.entries(frozen.methods)){const n=director.body.body.find(n=>n.key.name===key);baseline=baseline.replace(current.slice(n.start,n.end),value);}
for(const [key,value] of Object.entries(frozen.frames)){const n=frames.properties.find(n=>n.key.name===key).value.properties.find(n=>n.key.name==='frame');baseline=baseline.replace(current.slice(n.start,n.end),value);}
for(const [key,value] of Object.entries(frozen.functions)){const n=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===key);baseline=baseline.replace(current.slice(n.start,n.end),value);}
const copy=v=>v?.isVector3||v?.isColor?v.toArray():typeof v==='function'?'<callback>':ArrayBuffer.isView(v)?Array.from(v,copy):Array.isArray(v)?v.map(copy):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,w])=>[k,copy(w)])):v;
function fixture(old=false){
  let word=27,serial=0;
  const work={rng:0,inkCol:0,exp:0,sin:0,ground:0},rows=[],state={preview:null,local:[],remote:[]};
  const math=Object.create(Math);for(const key of ['exp','sin'])math[key]=v=>{work[key]++;return Math[key](v);};
  const random=()=>{work.rng++;return(word=(Math.imul(word,1664525)+1013904223)>>>0)/4294967296;};
  const bindings={...kit,Math:math,__work:work,vfxRandom:random,WAIL_SPEAKER_POSITIONS,nonWailVfxTicks,consumeVfxPeriod,inkjetVfxTicks,
    inkjetVfxAdmission:()=>({}),inkjetVfxRoom:()=>true,inkVacState:a=>a.vac,tentaMissilesLockPreview:()=>state.preview,
    tentaMissilesLockRowsForVfx:()=>state.preview&&({limit:state.preview.limit,rows:state.preview.targets.map((actor,i)=>({actor,x:state.preview.screen?.[i]?.[0],y:state.preview.screen?.[i]?.[1]}))}),
    bigBubblerDomes:()=>state.local,bigBubblerRemoteDomes:()=>state.remote};
  const source=(old?baseline:current).replace(/^import .*;\n/gm,'').replace(/^export default .*;\n?/gm,'').replace(/^export /gm,'').replace('inkCol(c) {','inkCol(c) { __work.inkCol++;');
  let program=source+';return {Director,DIRECTORS,OBJECT_FX,stepFilaments,speakerAnchors};';
  if(process.env.SPECIAL_VFX_ESBUILD)program=createRequire(import.meta.url)(process.env.SPECIAL_VFX_ESBUILD).transformSync('function lane(){'+program+'}',{minify:true,keepNames:true}).code+';return lane();';
  const api=new Function(...Object.keys(bindings),program)(...Object.values(bindings));
  const self=Object.create(api.Director.prototype);
  const emit=name=>(...args)=>{rows.push([name,...args.map(copy)]);return{id:serial++,v:new Float32Array(16),dead:false,t:0,life:0};};
  Object.assign(self,{THREE:T,time:0,v:Array.from({length:8},()=>new T.Vector3()),up:new T.Vector3(0,1,0),camPos:new T.Vector3(0,3,12),
    lasers:new Map(),domes:new Map(),coolers:new Map(),fists:new Map(),storms:new Map(),tracks:new Map(),errors:0,
    G:{time:0,actors:[],camera:new T.PerspectiveCamera(50,4/3,.1,100),teamColors:[new T.Color(.3,.5,.8)],projectiles:{list:[]},physics:{raycast(_p,_d,_len,h){work.ground++;h.hit=true;h.point.set(0,-.2,0);return h;}}},
    kit:{q:1,time:0,puffs:{spawn:emit('puff'),spawnRaw:emit('puffRaw')},sparks:{spawn:emit('spark')},ribbons:{push:emit('ribbonPoint'),end:r=>rows.push(['endRibbon',r?.id])},glowRibbons:{push:emit('glowPoint'),end:r=>rows.push(['endGlow',r?.id])}}});
  self.api={THREE:T,G:self.G};self.G.camera.updateMatrixWorld();
  for(const name of ['disc','shell','beam','band','petals','flash','chunks','activation','smoke','nativeBurst'])self[name]=emit(name);
  self.pushRibbon=emit('pushRibbon');self.near=()=>true;self.tentaHud=()=>false;
  const actor={pos:new T.Vector3(1,3,2),vel:new T.Vector3(1,2,3),alive:true,isLocal:true,color:new T.Color(.3,.5,.8),team:0,form:'kid',aimYaw:.3,aimDir:new T.Vector3(.2,.1,1).normalize(),_s3AllSpecialState:{phase:'dash'}};
  const track={d:{wakeL:{id:'left'},wakeR:{id:'right'},speed:{id:'speed'},jets:[{v:new Float32Array(16)},{v:new Float32Array(16)}],cones:[{v:new Float32Array(16)},{v:new Float32Array(16)}]},color:[.3,.5,.8],phase:'dash',phaseAt:0};
  return{api,self,actor,track,state,work,rows,get word(){return word;}};
}
test('restored drop normalization and streak petal reuse preserve raw pool writes, seeded order, HDR and custom normalizers',()=>{
  for(const color of [[.2,.4,.8],[2,3,4],[-1,-2,-3],[Infinity,1,2],[NaN,0,1],[1e308,1e308,1e308]])for(const custom of [false,true])for(const glow of [false,true]){
    const results=[true,false].map(old=>{
      const h=fixture(old);if(custom)h.self.inkCol=function(c){h.work.inkCol++;return[c[0]*.5,c[1]*.5,c[2]*.5];};
      h.self.streaks(new T.Vector3(1,2,3),46,12,color,{glow});h.self.drop(new T.Vector3(1,2,3),1,2,3,.4,.1,color);
      return{rows:h.rows,rng:h.work.rng,word:h.word,colors:h.work.inkCol};
    });
    assert.deepEqual(results[1].rows,results[0].rows);assert.equal(results[1].rng,results[0].rng);assert.equal(results[1].word,results[0].word);
    if(custom)assert.equal(results[1].colors,results[0].colors);
    else if(!glow&&color.every(Number.isFinite)&&color[0]>=0&&color[0]<100)assert.ok(results[1].colors<results[0].colors);
  }
});
test('restored Wail render alpha shares one exponential without changing beams or cosmetic RNG',()=>{
  for(const hz of [30,60,120]){
    const states=[fixture(true),fixture(false)];
    for(const h of states)for(let i=0;i<6;i++)h.self.lasers.set(i,{actor:h.actor,seen:0,from:new T.Vector3(i,2,3),to:new T.Vector3(i+10,5,9),drawTo:new T.Vector3(i+8,3,6),outer:{v:new Float32Array(16)},core:{v:new Float32Array(16)},halo:{v:new Float32Array(16)}});
    for(let frame=0;frame<hz;frame++)for(const h of states){h.self.time=(frame+1)/hz;for(const L of h.self.lasers.values())L.seen=h.self.time;h.self.updateWailLasers(1/hz);}
    assert.deepEqual(states[1].rows,states[0].rows);assert.equal(states[1].word,states[0].word);
    assert.deepEqual([...states[1].self.lasers.values()].map(L=>[...L.drawTo.toArray(),...L.outer.v]),[...states[0].self.lasers.values()].map(L=>[...L.drawTo.toArray(),...L.outer.v]));
    assert.equal(states[0].work.exp,hz*6);assert.equal(states[1].work.exp,hz);
  }
});
test('round identity retirement ends retained shape cores and both ribbon pools exactly before impact',()=>{
  const h=fixture(),core={v:new Float32Array(16),dead:false},glow={v:new Float32Array(16),dead:false},rib={id:1,pts:[]};
  h.self.finishRound({d:{core,glow,rib,carry:{nonWailCarry:.5}},spec:{impact(){h.rows.push(['impact',core.dead,glow.dead]);}}},true);
  assert.equal(core.dead,true);assert.equal(glow.dead,true);assert.deepEqual(h.rows,[['endRibbon',1],['endGlow',1],['impact',true,true]]);
});
test('restored Bubbler iteration keeps eager local/remote source order, live-array mutations and retirement',()=>{
  const results=[true,false].map(old=>{
    const h=fixture(old),color=new T.Color(.3,.5,.8),a={id:'a',color},b={id:'b',color},c={id:'c',color};h.state.local=[a,b];h.state.remote=[c];
    h.self.call=function(fn,r,d){h.rows.push([fn.name,d.id,r.age]);if(fn.name==='start'&&d===a)h.state.remote.push({id:'d',color});};
    h.self.updateKits(1/60);h.state.local.splice(0,1);h.state.remote[0].dead=true;h.self.updateKits(1/30);
    return{rows:h.rows,ids:[...h.self.domes.keys()].map(d=>d.id)};
  });assert.deepEqual(results[1],results[0]);
});
test('Reefslider wakes, Vac suction basis and Inkjet ground guard retain every emitted argument at 30/60/120 Hz',()=>{
  for(const id of ['reefslider','inkVac','inkjet'])for(const hz of [30,60,120])for(const phase of id==='reefslider'?['dash','brake','startup']:['active']){
    const results=[true,false].map(old=>{
      const h=fixture(old);h.actor._s3AllSpecialState.phase=phase;h.actor.vac={phase:'inhale',charge:.8,farR:3,length:6};
      for(let frame=0;frame<hz;frame++){
        h.self.time=frame/hz;h.actor.form=id==='inkjet'&&frame<hz/2?'squid':'kid';h.actor.pos.x+=.01;
        h.api.DIRECTORS[id].frame.call(h.self,h.actor,h.track,1/hz);
      }
      return{rows:h.rows,rng:h.work.rng,word:h.word,ground:h.work.ground};
    });
    assert.deepEqual(results[1].rows,results[0].rows,`${id} ${hz} ${phase}`);assert.equal(results[1].rng,results[0].rng);assert.equal(results[1].word,results[0].word);
    if(id==='inkjet'){assert.equal(results[0].ground,hz);assert.equal(results[1].ground,hz/2);}else assert.equal(results[1].ground,results[0].ground);
  }
});
test('Kraken filament sine reuse preserves every ribbon point and timestamp',()=>{
  for(const hz of [30,60,120]){
    const results=[true,false].map(old=>{
      const h=fixture(old),fil=Array.from({length:8},(_,i)=>({r:{id:i},white:i%3===0,off:i*.04,tip:i*.02,ph:i*.37,sp:.9+i*.03,rr:.8+i*.02}));
      for(let frame=0;frame<hz;frame++){h.actor.pos.set(frame*.1,2,Math.sin(frame*.04));h.self.kit.time=frame/hz;h.api.stepFilaments(h.self,h.actor,fil,1.1,.5,8,new T.Vector3(.3,0,1),1/hz);}
      return{rows:h.rows,fil:copy(fil),sin:h.work.sin};
    });assert.deepEqual(results[1].rows,results[0].rows);assert.deepEqual(results[1].fil,results[0].fil);assert.equal(results[1].sin*2,results[0].sin);
  }
});
test('speaker anchor reuse preserves filter-before-map reads, real matrices, sparse rows and releases holder references',()=>{
  for(const count of [0,3,6]){
    const results=[true,false].map(old=>{
      const h=fixture(old),reads=[],scene=new T.Scene(),list=[];scene.position.set(4,2,-1);scene.rotation.y=.2;
      for(let i=0;i<count;i++){const holder=new T.Group();holder.position.set(i,2,i*.2);scene.add(holder);const d={};Object.defineProperty(d,'spec',{get(){reads.push(['spec',i]);return{speakers:true};}});Object.defineProperty(d,'holder',{get(){reads.push(['holder',i]);return holder;}});list.push(d);}
      list.length+=2;h.actor.character={s3SpecialDevices:()=>list};
      const out=h.api.speakerAnchors(h.self,h.actor).map(v=>v.toArray());
      if(!old)assert.equal(h.self._speakerCache.get(h.actor).holders.length,0);
      return{out,reads};
    });assert.deepEqual(results[1],results[0]);
  }
});
test('Tenta rows preserve HUD order/projection and reuse bounded rows without retaining actors, including nested/error paths',()=>{
  const results=[true,false].map(old=>{
    const h=fixture(old),captured=[],arrays=[],rows=[],enemies=Array.from({length:5},(_,id)=>({id,pos:new T.Vector3(id*.2,.1,-8)}));
    h.self.tentaHud=(_t,show,limit,inside)=>{captured.push([show,limit,inside.map(([a,x,y])=>[a.id,x,y])]);arrays.push(inside);rows.push(...inside);return true;};
    for(const n of [0,1,5,5,3,0,4]){h.state.preview={limit:.4,targets:enemies.slice(0,n),screen:enemies.slice(0,n).map((_,i)=>i%2?[null,null]:[i*.01,i*.02])};h.api.DIRECTORS.tentaMissiles.frame.call(h.self,h.actor,h.track);}
    if(!old){assert.equal(new Set(arrays).size,1);assert.equal(new Set(rows).size,5);assert.equal(h.track.d.tentaRows.inside.length,0);assert.ok(h.track.d.tentaRows.rows.every(row=>row[0]===null));}
    return{captured};
  });assert.deepEqual(results[1],results[0]);
  const h=fixture(),a={id:'a',pos:new T.Vector3()},b={id:'b',pos:new T.Vector3()};h.state.preview={limit:.3,targets:[a],screen:[[.1,.2]]};
  let nested=false;h.self.tentaHud=(_t,_s,_l,inside)=>{if(!nested){nested=true;const outer=inside[0];h.state.preview={limit:.2,targets:[b],screen:[[.3,.4]]};h.api.DIRECTORS.tentaMissiles.frame.call(h.self,h.actor,h.track);assert.equal(inside[0],outer);assert.equal(outer[0],a);}return true;};
  h.api.DIRECTORS.tentaMissiles.frame.call(h.self,h.actor,h.track);assert.equal(h.track.d.tentaRows.busy,false);
  h.self.tentaHud=()=>{throw Error('HUD interrupted');};assert.throws(()=>h.api.DIRECTORS.tentaMissiles.frame.call(h.self,h.actor,h.track),/HUD interrupted/);
  assert.equal(h.track.d.tentaRows.busy,false);assert.equal(h.track.d.tentaRows.inside.length,0);assert.ok(h.track.d.tentaRows.rows.every(row=>row[0]===null));
});
test('Tenta headless reticles keep the same target lifecycle with row reuse',()=>{
  const snapshots=[true,false].map(old=>{
    const h=fixture(old),enemies=Array.from({length:5},(_,id)=>({id,pos:new T.Vector3(id,1,-8)}));
    const out=[];
    for(const ids of [[0,1,2,3,4],[4,2],[2],[],[0,3]]){
      h.state.preview={limit:.4,targets:ids.map(i=>enemies[i]),screen:ids.map(i=>[i*.01,i*.02])};
      h.api.DIRECTORS.tentaMissiles.frame.call(h.self,h.actor,h.track);
      out.push([...h.track.d.locks].map(([actor,rec])=>[actor.id,rec.id,rec.dead]));
    }
    return{out,rows:h.rows};
  });assert.deepEqual(snapshots[1],snapshots[0]);
});
test('Wave viewer cache remains rejected: a same-array role change inside a synchronous beam callback selects a new viewer',()=>{
  const h=fixture(),first={isLocal:true,alive:true,team:0,pos:new T.Vector3(1,0,0)},second={isLocal:false,alive:true,team:0,pos:new T.Vector3(2,0,0)},enemy={alive:true,team:1,pos:new T.Vector3(5,0,0),s3:{revealedUntil:[10]}};
  h.self.G.actors=[first,second,enemy];const from=[];
  h.self.beam=function(_a,_b,_c,origin){from.push(origin.x);first.isLocal=false;second.isLocal=true;return{v:new Float32Array(16)};};
  for(let i=0;i<2;i++)h.self.markingLines({d:{},color:[.3,.5,.8]},{team:0});
  assert.deepEqual(from,[1,2]);assert.equal(h.self.G.actors.length,3);
});
