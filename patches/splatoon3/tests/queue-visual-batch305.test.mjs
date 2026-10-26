import {createRequire} from 'node:module';
import {compactModuleStrings} from '../../../scripts/lib/inkwave-source-compaction.mjs';
function compileFunction(...parameters){
 let body=parameters.pop();
 if(process.env.QUEUE_FIXTURE_ESBUILD)body=compactModuleStrings(createRequire(import.meta.url)(process.env.QUEUE_FIXTURE_ESBUILD).transformSync('function fixtureBody(){'+body+'}',{loader:'js',minify:true,charset:'utf8',keepNames:true}).code).code+';return fixtureBody.apply(this,arguments);';
 return new Function(...parameters,body);
}
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {SpecialVfxKit} from '../runtime/special-vfx-kit.mjs';
import {nonWailVfxTicks,consumeVfxPeriod} from '../runtime/nonwail-vfx-clock.mjs';
import {installWeaponAudioEngine} from '../runtime/audio/engine.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
function functions(source,names){const found=[];function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&names.includes(n.id.name))found.push(source.slice(n.start,n.end));for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}));return found.join('\n');}
function method(source,cls,key,bindings={}){const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});const c=ast.body.map(n=>n.declaration||n).find(n=>n.type==='ClassDeclaration'&&n.id.name===cls),m=c.body.body.find(n=>n.key.name===key);return compileFunction(...Object.keys(bindings),'return ({'+source.slice(m.start,m.end)+'})['+JSON.stringify(key)+']')(...Object.values(bindings));}
test('warm materials hide only after an ordinary draw, wake for work, and rewarm after context restoration',()=>{
 const parent=new T.Group(),kit=new SpecialVfxKit(T,parent),listeners=new Map(),canvas={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:(n,f)=>{assert.equal(listeners.get(n),f);listeners.delete(n);}},renderer={domElement:canvas};
 kit.update(0,{position:new T.Vector3()});assert.equal(kit.stats().draws,12);
 for(const p of kit.allPools){const m=p.mesh,g=m.geometry,material={};m.onBeforeRender(renderer,{overrideMaterial:material},null,g,material);m.onAfterRender(renderer,{overrideMaterial:material},null,g,material);assert.equal(m.visible,true);m.onAfterRender(renderer,{},null,g,m.material);assert.equal(m.visible,false);}
 assert.equal(kit.stats().draws,0);kit.shells.add(1,new Array(16).fill(0));kit.update(.01);assert.equal(kit.shells.mesh.visible,true);kit.clear();assert.equal(kit.shells.mesh.visible,false);
 listeners.get('webglcontextrestored')();assert.ok(kit.allPools.every(p=>p.mesh.visible));kit.dispose();assert.equal(listeners.size,0);assert.equal(parent.children.length,0);
});
test('shape finalizers run exactly once on expiration, follow removal, death, eviction and clear',()=>{
 for(const reason of ['expire','follow','dead','evict','clear']){const kit=new SpecialVfxKit(T,new T.Group()),pool=kit.shells;let ended=0;const r=pool.add(reason==='expire'?.01:0,new Array(16).fill(0),reason==='follow'?()=>false:null);r.onEnd=()=>ended++;
  if(reason==='dead')r.dead=true;
  if(reason==='evict')for(let i=0;i<pool.cap;i++)pool.add(0,new Array(16).fill(0));
  if(reason==='clear')pool.clear();else pool.update(.02);pool.clear();pool.clear();assert.equal(ended,1,reason);kit.dispose();}
});
test('cosmetic trials and periodic phases agree over equal elapsed time at 30, 60 and 120 Hz',()=>{
 for(const hz of [30,60,120]){const state={},counts=new Map([.04,.1,.12,.16,.18].map(p=>[p,0]));let trials=0;for(let i=0;i<hz*3;i++){trials+=nonWailVfxTicks(state,1/hz);for(const p of counts.keys()){const key='p'+p;state[key]=(state[key]||0)+1/hz;if(consumeVfxPeriod(state,key,p))counts.set(p,counts.get(p)+1);}}assert.equal(trials,180);for(const [period,n]of counts)assert.equal(n,Math.floor(3/period+1e-8));}
 const s={age:2.157};assert.equal(consumeVfxPeriod(s,'age',.1),true);assert.ok(Math.abs(s.age-.057)<1e-10);assert.equal(nonWailVfxTicks({},10),2);
});
test('one-shot resolution avoids LOS on cold and failed samples but retains native, base and routed recording occlusion',()=>{
 const symbol=Symbol.for('inkwave.weapon-audio.resolve-occlusion');let los=0;const G={time:0,camera:{position:{x:0,y:1,z:0}},physics:{los:()=>{los++;return false;}}},obstruction=new WeakMap(),deferredOcclusion=symbol,finite3=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
 const options=compileFunction('G','obstruction','deferredOcclusion','deferredPosition','finite3',functions(read('../runtime/audio/runtime.mjs'),['options','occlusion','resolveOcclusion'])+'\nreturn options;')(G,obstruction,deferredOcclusion,Symbol.for('inkwave.weapon-audio.occlusion-position'),finite3);
 class Engine{_def(){return 'generic';}play(name,o){this.played.push({name,o});return o;}}
 installWeaponAudioEngine(Engine);const e=new Engine(),events=new Map(),ensures=[],declares=new Map();e.played=[];e.weaponBank=()=>({name:(id,event)=>id+':'+event,authorized:{byEvent:events},has:()=>true,audibleShotFallback:true});e._realS3Loader={ensure:(...args)=>ensures.push(args),declares:(id,event)=>declares.get(id+':'+event)};
 const actor={pos:{x:3,y:0,z:4},isLocal:false};
 const fire=(id,event='fire')=>e.playWeapon(id,event,options(actor,actor.pos,.7,true));
 fire('shooter');assert.equal(los,0);assert.equal(ensures.length,1);assert.equal(e.played.length,0);
 events.set('shooter:fire',{});assert.equal(fire('shooter').occlusion,.78);assert.equal(los,1);
 G.time=.2;assert.equal(fire('shooter','fire_full').occlusion,.78);assert.equal(los,2);assert.equal(e.played.at(-1).name,'shooter:fire');
 events.set('source:Sp_MultiMissile_Attach_00:fire',{});declares.set('special:tentaMissiles:open',false);G.time=.4;assert.equal(fire('special:tentaMissiles','open').occlusion,.78);assert.equal(los,3);
 G.time=.6;events.clear();fire('special:tentaMissiles','open');assert.equal(los,3);options(actor,actor.pos,.7);assert.equal(los,4,'loop options remain eager');
 G.time=.8;events.set('shooter:fire',{});fire('shooter');assert.equal(los,5,'next admitted shot resumes LOS');G.time=1;const impact=options(actor,undefined,.5,true);impact.pos=undefined;e.playWeapon('shooter','fire',impact);assert.equal(impact.occlusion,.78,'default input position retained when caller overrides final panner position');
});
test('generic sound lookup never instantiates weapon banks and main sound lookup still resolves',()=>{class E{_def(){return 'generic';}}installWeaponAudioEngine(E);const e=new E();let n=0;e.weaponBank=()=>{n++;return{resolve:name=>name};};for(const name of ['ui_click','boss_step',null,{},''])assert.equal(e.resolveWeaponSound(name),null);assert.equal(n,0);assert.equal(e.resolveWeaponSound('main:shooter:fire'),'main:shooter:fire');assert.equal(n,1);});
test('storm bob matches the old 60 Hz sampled sine sum and equal-time 30/120 Hz endpoints',()=>{
 const source=adaptBuildSource('src/game/weapons.js',read('../../../inkwave-public/src/game/weapons.js'));const a=source.indexOf('      for (const m of c.group.children) {\n        // Closed form'),b=source.indexOf('\n      }',a)+8;assert.ok(a>0);const step=compileFunction('G','c','stepDt',source.slice(a,b));
 let baseline=2;for(let i=1;i<=120;i++)baseline+=Math.sin(i/60*1.6+.7)*.0025;
 for(const hz of [30,60,120]){const m={position:{y:2},userData:{bob:.7}},c={bobPhase:0,group:{children:[m]}},G={time:0};for(let i=1;i<=hz*2;i++){G.time=i/hz;step(G,c,1/hz);}assert.ok(Math.abs(m.position.y-baseline)<1e-12,hz);}
});
test('default shape spins agree across render rates including random initial angles',()=>{
 const source=read('../runtime/special-vfx.mjs');for(const name of ['shell','disc','band']){const f=method(source,'Director',name,{vfxRandom:()=>.2,rnd:()=>.7,TAU:Math.PI*2,easeOut:t=>1-(1-t)**3,smooth:t=>Math.max(0,Math.min(1,t)),clamp01:t=>Math.max(0,Math.min(1,t))});const outputs=[];for(const hz of [30,60,120]){const kit=new SpecialVfxKit(T,new T.Group()),pool=kit.shells,self={kit:{shells:pool,discs:pool,bands:pool}};const args=name==='shell'?[true,0,0,{x:0,y:0,z:0},1,2,[1,1,1],1,{spin:2}]:name==='disc'?[true,0,0,{x:0,y:0,z:0},{x:0,y:1,z:0},1,2,[1,1,1],1,{spin:2}]:[true,0,0,{x:0,y:0,z:0},1,2,1,2,[1,1,1],1,{spin:2}];const record=f.apply(self,args);for(let i=1;i<=hz;i++){record.t=i/hz;record.follow(record,1/hz);}outputs.push(record.v[name==='band'?3:7]);kit.dispose();}assert.deepEqual(outputs,[outputs[0],outputs[0],outputs[0]],name);}
});
test('pause guards preserve formatted DOM state while eliminating unchanged replacements',()=>{
 const raw=read('../../../inkwave-public/src/ui/menus.js'),next=adaptBuildSource('src/ui/menus.js',raw);const extract=s=>{const start=s.indexOf('    const refresh = (s) => {',s.indexOf("const teams = h('div', { class: 'iw-pteams'")),end=s.indexOf('      for (const r of rosterRows)',start);return s.slice(start,end)+'};return refresh;';};
 function make(source){let writes=0;const dom=new Map();const node=name=>new Proxy({style:{getPropertyValue:k=>dom.get(name+k)||'',setProperty:(k,v)=>{writes++;dom.set(name+k,v);}},classList:{toggle:(k,v)=>{writes++;dom.set(name+k,v);}}},{set:(o,k,v)=>{writes++;dom.set(name+k,v);o[k]=v;return true;}});const clockNum=node('num'),clock=node('clock'),sTurf={b:node('turf')},sSplat={b:node('splat')},sDeath={b:node('death')},sSp={b:node('special'),el:node('sp')};const bindings={clockNum,clock,sTurf,sSplat,sDeath,sSp,clamp:n=>Math.max(0,Math.min(1,n)),fmtTime:n=>String(Math.ceil(n)),fmtInt:n=>String(n),tr:s=>s,selfP:{}};const run=compileFunction(...Object.keys(bindings),extract(source))(...Object.values(bindings));return{run,dom,writes:()=>writes};}
 const a=make(raw),b=make(next);for(let i=0;i<240;i++){const s={time:100-i*.25,duration:180,players:[{isSelf:true,turf:i<120?20:30,splats:2,deaths:0,special:i>200,specialFrac:i>120?.1001:.1}]};a.run(s);b.run(s);assert.deepEqual(b.dom,a.dom);}assert.ok(b.writes()<a.writes()/2);
});
test('Tenta targets share one ground probe per unchanged target within an update and refresh every next update',()=>{
 const source=read('../runtime/all-specials.mjs'),start=source.indexOf('  P.update=function(dt){')+'  P.update='.length,end=source.indexOf('\n  };',start)+4;let probes=0;
 const rt={v2:new T.Vector3(),v11:new T.Vector3(),up:new T.Vector3(0,1,0)},update=compileFunction('rt','THREE','api','FPS','finite3','actorLife','groundAt','updateWorld','update','stepWailTails','updateCrabSplashVisuals','clamp','return '+source.slice(start,end))(rt,T,{G:{}},60,p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z),a=>a.life,(_r,p,out)=>{probes++;return out.copy(p).setY(p.y-2);},()=>{},()=>{},()=>{},()=>{},(n,a,b)=>Math.max(a,Math.min(b,n)));
 const a={alive:true,pos:new T.Vector3(1,4,3),life:2},b={alive:true,pos:new T.Vector3(7,4,5),life:3},missile=target=>({s3AllSpecial:'tentaMissiles',s3TentaTarget:new T.Vector3(),s3TentaTargetActor:target,s3TentaTargetLife:target.life,vel:new T.Vector3(),pos:new T.Vector3()});const system={list:[...Array.from({length:10},()=>missile(a)),...Array.from({length:5},()=>missile(b))]};update.call(system,.01);assert.equal(probes,2);for(const p of system.list)assert.equal(p.s3TentaTarget.y,2);a.pos.y=6;update.call(system,.01);assert.equal(probes,4);assert.equal(system.list[0].s3TentaTarget.y,4);for(const p of system.list)p.s3TentaDescending=true;update.call(system,.01);assert.equal(probes,4);
});
test('Super Chump preview reuses only presentation vectors while ground changes remain visible and launch outputs are independent',()=>{
 const source=read('../runtime/all-specials.mjs'),runtimes=new Map(),actorStates=new Map();let probes=0,height=0;const V=T.Vector3,rt={api:{THREE:T,G:{level:{groundHeight:()=>0}}},v0:new V(),v1:new V(),v3:new V()},actor={alive:true,pos:new V(0,0,0),aimYaw:.2},state={id:'superChump',seed:7},api={Projectiles:{}};runtimes.set(api.Projectiles,rt);actorStates.set(actor,state);
 const fns=compileFunction('runtimes','actorStates','groundAt','aimPoint','seedUnit',functions(source,['specialCirclePoints','superChumpLandingPreview','chumpLandingPlan'])+'\nreturn {preview:superChumpLandingPreview,launch:chumpLandingPlan};')(runtimes,actorStates,(_rt,p,out)=>{probes++;return out.copy(p).setY(height);},(_rt,_a,_range,out)=>out.set(3,0,23),()=>.2);
 const first=fns.preview(api,actor),refs=[first.target,...first.positions];assert.equal(probes,14);height=5;const next=fns.preview(api,actor);assert.equal(probes,28);assert.equal(first,next);assert.equal(next.target.y,5);assert.deepEqual([next.target,...next.positions],refs);const launch=fns.launch(rt,actor,state);assert.notEqual(launch.target,next.target);for(let i=0;i<12;i++){assert.notEqual(launch.positions[i],next.positions[i]);assert.deepEqual(launch.positions[i],next.positions[i]);}
});
test('boss follow socket scratch persists across movement and falls back with no stale position',()=>{
 const source=adaptBuildSource('src/audio/bossAudio.js',read('../../../inkwave-public/src/audio/bossAudio.js'));const start=source.indexOf('  const pos = '),end=source.indexOf('  const play = ',start);let created=0;class V extends T.Vector3{constructor(){super();created++;}}const b={pos:new V(),model:{getSocket(_name,v){return v.set(1,2,3);}}},pos=compileFunction('bossOf',source.slice(start,end)+'return pos;')(()=>b),out={};for(let i=0;i<100;i++){assert.equal(pos('mouth',null,out),out);assert.deepEqual([out.x,out.y,out.z],[1,2,3]);}assert.equal(created,2);b.pos.set(8,9,10);b.model.getSocket=()=>{throw Error('model absent');};assert.equal(pos('mouth',null,out),out);assert.deepEqual([out.x,out.y,out.z],[8,12,10]);const one=pos('mouth');assert.notEqual(one,out);
});
test('native trail calls stay at sixty source trials per second and phase switches discard partial carry',()=>{
 const source=adaptBuildSource('src/fx/fxHooks.js',read('../../../inkwave-public/src/fx/fxHooks.js')),start=source.indexOf('    const sa = a.specialActive;'),end=source.indexOf('\n    s.grounded = ',start),block=source.slice(start,end);const v=new T.Vector3(),pos=new T.Vector3();
 for(const mode of ['fall','rise','jump'])for(const hz of [30,60,120]){let calls=0;const fx={slamFall:()=>calls++,superJumpTrail:()=>calls++},s={lastSJTo:new T.Vector3()},a={pos,vel:new T.Vector3(),specialActive:mode==='jump'?null:{id:'slam',phase:mode},superJumpState:mode==='jump'?{phase:'flight'}:null},self={fx,seen:{'special:slam':true,superjump:true}};const step=compileFunction('a','s','dt','pos','fx','_v','SPECIALS',block);for(let i=0;i<hz;i++)step.call(self,a,s,1/hz,pos,fx,v,{slam:{}});assert.equal(calls,60,mode+hz);s._trailVfxCarry=.5;a.specialActive=null;a.superJumpState=null;step.call(self,a,s,1/120,pos,fx,v,{slam:{}});assert.equal(s._trailVfxCarry,0);}
});
test('spawn flash retains every seeded particle argument after common-angle reuse',()=>{
 const raw=read('../../../inkwave-public/src/fx/fx.js'),next=adaptBuildSource('src/fx/fx.js',raw);
 function run(source){let seed=7;const commands=[],rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),f=method(source,'FX','spawnFlash',{rand,TAU:Math.PI*2,UP:new T.Vector3(0,1,0),G_SOFT:0,G_STAR:1,R_WAVE:2,R_THIN:3,OP_RING:4,_white:new T.Color(1,1,1)}),self={q:.7,_col:new T.Color(),_colB:new T.Color(),_color:(c,out)=>out.set(c),glows:'glows',puffs:'puffs'};for(const name of ['_beam','_sprite','_ringRaw','_after','_ripple','_spawnDrop'])self[name]=(...args)=>commands.push([name,...args.map(a=>a?.isColor?a.toArray():a?.isVector3?a.toArray():a)]);f.call(self,new T.Vector3(1,2,3),0x123456);return{commands,seed};}assert.deepEqual(run(next),run(raw));
});
test('network boss payload limits admit all producer counts and reject oversized visual allocation requests',async()=>{
 const {validBossMove}=await import('../../network-replication/snapshot-guard.mjs'),base={t0:1,s:1,d:[1,1,1]};for(let n=0;n<=3;n++)assert.equal(validBossMove({...base,id:'slam',p:{x:0,y:0,z:0,rings:new Array(n).fill(2)}}),n<=2);for(let n=0;n<=8;n++)assert.equal(validBossMove({...base,id:'barrage',p:{sx:0,sy:0,sz:0,b:Array.from({length:n},()=>[1,2,3,4])}}),n>0&&n<=7);
});
test('Booyah cheer ends its ribbon when the carrier retires before its final follow callback',()=>{
 const source=read('../runtime/special-vfx.mjs'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),defs=ast.body.find(n=>n.type==='VariableDeclaration'&&n.declarations[0].id.name==='DIRECTORS').declarations[0].init,booyah=defs.properties.find(n=>n.key.name==='booyahBomb').value,event=booyah.properties.find(n=>n.key.name==='event'),run=compileFunction('RIBBON','SHELL','smooth','return ({'+source.slice(event.start,event.end)+'}).event')({GLOW:0},{FLASH:0},t=>t*t*(3-2*t));
 const kit=new SpecialVfxKit(T,new T.Group()),owner={pos:new T.Vector3(),team:1,specialActive:{id:'booyahBomb'}},a={pos:new T.Vector3(2,0,0),team:1},track={d:{}},self={THREE:T,kit,G:{actors:[owner]},tracks:new Map([[owner,track]]),v:Array.from({length:8},()=>new T.Vector3()),rgb:()=>[1,1,1],hdr:c=>c,stars(){},ribbon:(_add,o)=>kit.glowRibbons.start(o),shell:(_add,life,_style,_pos,_s0,_s1,_col,_a,o)=>kit.shells.add(life,new Array(16).fill(0),o.follow),pushRibbon:(r,p)=>kit.glowRibbons.push(r,p.x,p.y,p.z,0)};
 run.call(self,a,{action:'cheer'});const rib=kit.glowRibbons.list[0];assert.equal(rib.ended,false);assert.equal(track.d.recs.length,1);kit.shells.update(.5);assert.equal(rib.ended,true);assert.equal(track.d.recs.length,0);assert.equal(track.d.ribbons.length,0);kit.dispose();
});
