import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { AuthorizedSamplePack } from '../runtime/audio/authorized-samples.mjs';
import { RealS3SampleLoader } from '../runtime/audio/real-s3-loader.mjs';
import { nonWailVfxTicks } from '../runtime/nonwail-vfx-clock.mjs';
const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
function method(source, cls, key, bindings = {}) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const body = ast.body.flatMap(n => n.declaration ? [n.declaration] : [n]);
  const node = body.find(n => n.type === 'ClassDeclaration' && n.id.name === cls).body.body.find(n => n.key.name === key);
  return new Function(...Object.keys(bindings), 'return ({' + source.slice(node.start, node.end) + '})[' + JSON.stringify(key) + ']')(...Object.values(bindings));
}
test('recorded LRU repeated MRU playback keeps order and skips all redundant map mutations', () => {
  const p = new AuthorizedSamplePack({});
  const rows = [0, 1, 2].map(variant => ({ id: 'shooter', event: 'fire', variant }));
  for (const row of rows) p.loaded.set(p.key(row.id, row.event, row.variant), row);
  p._reindex(); let deletes = 0;
  const remove = p.loaded.delete.bind(p.loaded); p.loaded.delete = key => { deletes++; return remove(key); };
  const expected = new Map(p.loaded);
  for (const serial of [1, 1, 1, 0, 0, 2, 2, 1]) {
    const row = rows[serial]; expected.delete(p.key(row.id,row.event,row.variant)); expected.set(p.key(row.id,row.event,row.variant),row);
    assert.equal(p.pick('shooter','fire',serial),row); assert.deepEqual([...p.loaded.keys()],[...expected.keys()]);
  }
  assert.equal(deletes,4); p.clear(); assert.equal(p._mruKey,null);
});
test('loader backoff never schedules jobs, while resident entries bypass backoff', async () => {
  const bank = { ctx:{state:'running'}, authorized:{loaded:new Map(), maxBytes:1024, key:(id,event,variant)=>`${id}:${event}:${variant}`} };
  const loader = new RealS3SampleLoader(bank,{fetcher:async()=>null});
  loader.status='ready'; loader.clipsById=new Map([['shooter',[{id:'shooter',event:'fire',variant:0}]]]);
  loader.clipsByEvent=new Map([['shooter:fire',loader.clipsById.get('shooter')]]);
  loader.retryAfter.set('shooter:fire',Date.now()+4000); let scheduled=0;
  loader._schedule=()=>{scheduled++;throw Error('backoff must not queue');};
  for(let i=0;i<100;i++)assert.equal((await loader.ensure('shooter','fire')).throttled,true);
  assert.equal(scheduled,0);bank.authorized.loaded.set('shooter:fire:0',{});
  assert.equal((await loader.ensure('shooter','fire')).cached,true);
});
test('non-Wail cosmetic clocks retain exactly sixty reference trials per second at 30/60/120 Hz and cap stalls', () => {
  for(const hz of [30,60,120]) {const r={};let trials=0;for(let i=0;i<hz*10;i++)trials+=nonWailVfxTicks(r,1/hz);assert.equal(trials,600);}
  const r={}; assert.equal(nonWailVfxTicks(r,100),2);assert.equal(nonWailVfxTicks(r,NaN),0);assert.equal(nonWailVfxTicks(r,1/60,false),0);
});
test('actual composed loop admission protects local loops and allocates no rejected graph', () => {
  const source=adaptBuildSource('src/audio/audio.js',read('src/audio/audio.js'));
  const loop=method(source,'AudioEngine','_loopLive',{NOOP_HANDLE:{rejected:true},MAX_LOOPS:24});
  const voices=[],loops=new Set(),gain={setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}};
  const e={ctx:{currentTime:0},loops,counts:{dropped:0},_def:()=>({loop:()=>({})}),_voice(){voices.push(1);return {v:{dead:false,kill(){}},out:{gain},fade:{gain}};}};
  for(let i=0;i<24;i++)loops.add({priority:88,playing:true,stop(){loops.delete(this);}});
  assert.equal(loop.call(e,'remote',{loop:()=>({})},{priority:64}).rejected,true);assert.equal(voices.length,0);assert.equal(loops.size,24);
  const remote={priority:64,playing:true,stop(){loops.delete(this);}};loops.delete(loops.values().next().value);loops.add(remote);
  const h=loop.call(e,'local',{loop:()=>({})},{priority:88});assert.equal(h.priority,88);assert.equal(voices.length,1);assert.equal(loops.has(remote),false);assert.equal(loops.size,24);
});
test('fallback smear allocates its viewport only when first needed and stays current across FX resize',()=>{
  const source=adaptBuildSource('src/ui/hud.js',read('src/ui/hud.js'));
  const resize=method(source,'HUD','_resizeCanvas',{innerWidth:834,innerHeight:1194});
  const h={canvas:{width:300,height:150},_smears:[],fx:null};resize.call(h);assert.deepEqual(h.canvas,{width:300,height:150});
  resize.call(h,true);assert.deepEqual(h.canvas,{width:500,height:716});h.fx={};h.canvas.width=300;resize.call(h);assert.equal(h.canvas.width,300);assert.equal(h._smearSizeDirty,true);
});
test('actual missile frame preserves seeded 60 Hz random order and equal event trials across render rates',async()=>{
  const {Vector3}=await import('../../../inkwave-public/vendor/three/build/three.module.js');
  const source=fs.readFileSync(new URL('../runtime/special-vfx.mjs',import.meta.url),'utf8');
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const round=ast.body.find(n=>n.type==='VariableDeclaration'&&n.declarations[0].id.name==='ROUND_FX').declarations[0].init;
  const missile=round.properties.find(n=>n.key.name==='tentaMissiles').value;
  const frame=missile.properties.find(n=>n.key.name==='frame');
  for(const hz of [30,60,120]){
    let word=23,trials=0;const draws=[],random=()=>{trials++;return (word=(Math.imul(word,1664525)+1013904223)>>>0)/4294967296;};
    const fn=new Function('nonWailVfxTicks','vfxRandom','SPARK','return ({'+source.slice(frame.start,frame.end)+'}).frame')(nonWailVfxTicks,random,{STREAK:0});
    const self={v:[new Vector3()],pushRibbon(){},spark(...args){draws.push(args[0]);},hdr:()=>[1,1,1]};
    const r={d:{},vel:new Vector3(1,2,3),color:[1,1,1]},p={pos:new Vector3()};
    for(let i=0;i<hz;i++)fn.call(self,r,p,1/hz);
    let baselineWord=23,events=0;for(let i=0;i<60;i++)if(((baselineWord=(Math.imul(baselineWord,1664525)+1013904223)>>>0)/4294967296)<.8)events++;
    assert.equal(trials,60);assert.equal(draws.length,events);
  }
});
test('mixer schedules changed targets only, initializes replacement nodes, and preserves mute transitions',()=>{
  const source=adaptBuildSource('src/audio/audio.js',read('src/audio/audio.js'));
  const taper=v=>Math.pow(Math.min(1,Math.max(0,+v||0)),1.5);
  const set=method(source,'AudioEngine','setVolumes',{taper});
  const calls=[],param=id=>({setTargetAtTime(...args){calls.push([id,...args]);}});
  const e={opts:{},ctx:{currentTime:0},vol:{master:.8,music:.6,sfx:.7},master:{gain:param('master')},musicBus:{gain:param('music')},sfxBus:{gain:param('sfx')},stops:0,resumes:0,_sfxSilent(){return this.vol.master===0||this.vol.sfx===0;},_suspendSfxReqs(){this.stops++;},_resumeSfxReqs(){this.resumes++;}};
  set.call(e);assert.equal(calls.length,3);set.call(e);assert.equal(calls.length,3);
  for(const v of [.3,.2,.2,0,.5]){e.ctx.currentTime++;set.call(e,{sfx:v});}
  assert.equal(calls.length,7);assert.equal(e.stops,1);assert.equal(e.resumes,1);
  e.sfxBus.gain=param('replacement');set.call(e,{sfx:.5});assert.equal(calls.at(-1)[0],'replacement');assert.equal(calls.at(-1)[1],taper(.5));
});
test('shader-deformed Vac and scaled Bubbler contain every emitted geometry vertex inside the culling bounds',async()=>{
  const T=await import('../../../inkwave-public/vendor/three/build/three.module.js');
  const {createVacVortex,createBubblerHardware,disposeSpecialModel}=await import('../runtime/special-motion.mjs');
  const vac=createVacVortex(0xff00ff,15,.7,4.3,T),hardware=createBubblerHardware(0xff00ff,T),shell=hardware.userData.shell;
  try{
    const p=new T.Vector3(),a=vac.geometry.attributes.position,bound=vac.geometry.boundingSphere;
    assert.equal(vac.frustumCulled,true);
    for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i);const r=.7+(4.3-.7)*p.y;p.x*=r;p.z*=r;p.y*=15;assert.ok(bound.containsPoint(p));}
    shell.geometry.computeBoundingSphere();for(let i=0;i<shell.geometry.attributes.position.count;i++){p.fromBufferAttribute(shell.geometry.attributes.position,i);assert.ok(shell.geometry.boundingSphere.distanceToPoint(p)<1e-6);}
    const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().makePerspective(-1,1,1,-1,1,100));
    shell.position.set(0,0,-10);shell.scale.setScalar(7.5);shell.updateMatrixWorld(true);assert.equal(frustum.intersectsObject(shell),true);
    shell.position.x=1000;shell.updateMatrixWorld(true);assert.equal(frustum.intersectsObject(shell),false);
  }finally{disposeSpecialModel(vac);disposeSpecialModel(hardware);}
});
test('production roller flick keeps every particle argument and RNG draw while halving repeated angle trig',async()=>{
  const T=await import('../../../inkwave-public/vendor/three/build/three.module.js');
  const baseline=fs.readFileSync(new URL('./fixtures/roller-flick-before-oct23.txt',import.meta.url),'utf8');
  const source=adaptBuildSource('src/fx/fx.js',read('src/fx/fx.js'));
  for(const q of [.4,.7,1])for(const sources of [null,[{id:1},{id:2}]]) {
    function run(old){let word=23,randoms=0,trig=0;const rows=[],spy=Object.create(Math);
      for(const key of ['sin','cos'])spy[key]=v=>{trig++;return Math[key](v);};
      const bindings={rand:()=>{randoms++;return (word=(Math.imul(word,1664525)+1013904223)>>>0)/4294967296;},Math:spy,F_PAINT:4,_white:new T.Color(0xffffff),bindRollerDrop:(_self,drop,owner)=>rows.push(['bind',drop,owner.id])};
      const fn=old?new Function(...Object.keys(bindings),'return ({'+baseline+'}).flickCurtain')(...Object.values(bindings)):method(source,'FX','flickCurtain',bindings);
      const capture=(...args)=>{const index=rows.length;rows.push(args.map(v=>v?.isColor?v.toArray():v===self.puffs?'puffs':v));return index;};
      const self={q,paintEffects:true,_col:new T.Color(),_colB:new T.Color(),_color:(color,out)=>out.copy(color),puffs:{cap:96},_spawnDrop:capture,_sprite:capture};
      fn.call(self,new T.Vector3(1,2,3),new T.Vector3(.3,0,.7),new T.Color(.2,.4,.8),50,sources);
      return {rows,randoms,trig};
    }
    const a=run(true),b=run(false);assert.deepEqual(b.rows,a.rows);assert.equal(b.randoms,a.randoms);assert.equal(a.trig-b.trig,2*(Math.max(6,Math.round(30*q))+3));
  }
});
test('world presentation liveness reuses cleared membership and preserves disposal-list mutations',()=>{
  const source=fs.readFileSync(new URL('../runtime/special-presentation.mjs',import.meta.url),'utf8');
  const at=source.indexOf('    const live = system._s3AllSpecialObjects || [];',source.indexOf('  function syncWorld('));
  const block=source.slice(at,source.indexOf('    // Projectiles (pooled records:',at));
  const OBJECTS=Symbol(),worldLiveness=new WeakMap(),disposed=[];
  const sync=new Function('OBJECTS','worldLiveness','objectModel','poseObject','disposeModel','return function(system,dt){'+block+'}')(OBJECTS,worldLiveness,o=>({group:o}),()=>{},o=>{disposed.push(o.id);o.onDispose?.();});
  const a={id:'a'},b={id:'b'},c={id:'c'},system={_s3AllSpecialObjects:[a,b,c]};
  sync(system,1/60);const set=worldLiveness.get(system).set;
  for(let i=0;i<100;i++)sync(system,1/60);
  assert.equal(worldLiveness.get(system).set,set);assert.equal(set.size,0);assert.equal(disposed.length,0);
  // Removing a dispatches a callback which removes b too; a membership snapshot
  // alone would keep b for a frame, while the native live.includes semantics retire it now.
  a.onDispose=()=>{system._s3AllSpecialObjects.splice(0,1);};
  system._s3AllSpecialObjects.splice(0,1);sync(system,1/60);
  // The native array is mutated in-place by production callbacks.
  assert.deepEqual(disposed,['a','b']);
  sync(system,1/60);assert.deepEqual(disposed,['a','b']);
});
