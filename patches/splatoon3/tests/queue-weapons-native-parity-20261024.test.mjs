import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptWeaponQueue20261024} from '../weapon-queue-20261024-adapter.mjs';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const adapter=read('../weapon-queue-20261024-adapter.mjs'),node=parse(adapter,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='VariableDeclaration').declarations[0].init;
const patches=JSON.parse(adapter.slice(node.start,node.end));
const replaceOnce=(s,a,b,label)=>{assert.equal(s.indexOf(a),s.lastIndexOf(a),label+' unique');assert.ok(s.includes(a),label+' present');return s.replace(a,b);};
// The test runs before or after the central composer registers this adapter.
// Undo only these exact transformations to construct the same composed control.
function baseline(rel,raw){let s=adaptBuildSource(rel,raw);for(const p of patches.filter(p=>p.rel===rel).reverse())if(s.includes(p.after))s=replaceOnce(s,p.after,p.before,p.label);return s;}
const candidate=(rel,raw)=>adaptWeaponQueue20261024(rel,baseline(rel,raw),replaceOnce);
function method(source,cls,key,bindings={}){const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),c=ast.body.map(n=>n.declaration||n).find(n=>n.type==='ClassDeclaration'&&n.id.name===cls),m=c.body.body.find(n=>n.key.name===key);return new Function(...Object.keys(bindings),'return ({'+source.slice(m.start,m.end)+'})['+JSON.stringify(key)+'];')(...Object.values(bindings));}
function declaration(source,name){let found;function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id.name===name)found=source.slice(n.start,n.end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}));return found;}

test('all four final source adapters apply once to canonical composition and remain valid modules',()=>{
 for(const rel of new Set(patches.map(p=>p.rel))){const raw=read('../../../inkwave-public/'+rel),old=baseline(rel,raw),next=candidate(rel,raw);assert.notEqual(old,next);parse(next,{ecmaVersion:'latest',sourceType:'module'});}
});

const scalarFields=['type','wid','age','delay','life','straight','radius','size','damage','dmgFar','trail','trailEvery','trailRadius','grav','drag','seed','head','vis','tail0','tailK','wob','wobF','nose','sats','ghost'];
function round(p){const o={};for(const k of scalarFields)o[k]=p[k];for(const k of ['pos','prev','start','vel'])o[k]=Array.from(p[k].toArray());return o;}
async function shoot(adapter){let word=37,calls=0;const random=()=>{calls++;return((word=(Math.imul(word,1664525)+1013904223)>>>0)/4294967296);};
 const f=await fixture({adaptNative:adapter,fullRuntime:true,realProjectiles:true,vmMathRandom:random});f.G.scene=new f.THREE.Scene();
 f.G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;return out;};f.G.physics=new f.Physics(f.G.level);f.G.boss=null;f.G.netm=null;f.G.fx=null;
 const ps=f.G.projectiles=new f.Projectiles(f.G.scene),output=[];
 for(const [id,name,args]of [['shooter','fireShooter',[2]],['dualies','fireDualies',[2,1]],['splatling','fireSplatling',[2]],['slosher','fireSlosh',[]],['blaster','fireBlaster',[2]],['roller','fireFlick',[]]]){
  const a=f.make(id);a.pos.set(0,3,0);a.aimPitch=.2;a.aimYaw=.3;a.aimDir.set(.3,.2,1).normalize();a.aimPoint.copy(a.pos).addScaledVector(a.aimDir,30);f.G.actors=[a];
  for(let reuse=0;reuse<2;reuse++){
   ps[name](a,a.weapon,...args);output.push([id,reuse,'birth',Array.from(ps.list,round)]);
   for(let i=0;i<6;i++){f.G.time+=1/60;ps.update(1/60);}output.push([id,reuse,'flight',Array.from(ps.list,round)]);ps.clear();
  }
 }
 const a=f.make('shooter');a.remote=true;ps.ghostProjectile(a,[0,0,0,'shot','shooter',1,2,3,4,5,6,.1,1.2,.2,.3,.15,28,.8,1.1,false,.1,.8,1.3,.03,26,.3,3]);output.push(['ghost',Array.from(ps.list,round)]);
 ps.clear();ps.disposeVisuals?.();return{output,calls};
}
test('composed scalar native births preserve pooled flight records and RNG through shooter/dualies/splatling/slosher/blaster/roller/ghost lanes',async()=>{
 assert.deepEqual(await shoot(candidate),await shoot(baseline));
});

test('ink-flight options leases preserve synchronous nested splat values and clear owner references after exceptions',()=>{
 const rel='src/game/inkFlightRuntime.js',raw=read('../../../inkwave-public/'+rel);
 function run(source,throwing){const rows=[],owner={addTurf:n=>rows.push(['area',n])},p={seed:.2,inkKey:'roller',owner,team:0},hit={face:0,point:new T.Vector3(1,2,3),normal:new T.Vector3(0,1,0)},shape={radius:.5,stretch:.3,centreBack:.2};let nested=false,fn;
  const self={point:new T.Vector3(),heading:new T.Vector3()},bindings={EPS:1e-9,sourceFlightInkKind:k=>k,mainInkFootprint:k=>k,G:{paint:{splat(at,r,team,opts){rows.push(['splat',...at.toArray(),r,team,opts.seed,opts.kind,opts.footprint,opts.face,opts.claimOwner===owner,opts.stretch?opts.stretch.toArray():null,opts.stretchAmt]);if(!nested){nested=true;fn.call(self,{...p,seed:.7},hit,shape,new T.Vector3(1,0,0),'child');}if(throwing)throw Error('stop');return 1;}}}};
  fn=method(source,'InkFlightRuntime','paint',bindings);if(throwing)assert.throws(()=>fn.call(self,p,hit,shape,new T.Vector3(0,0,1),'parent'),/stop/);else fn.call(self,p,hit,shape,new T.Vector3(0,0,1),'parent');
  if(self._paintOptionsLeases){assert.equal(self._paintOptionsDepth,0);for(const row of self._paintOptionsLeases){assert.equal(row.claimOwner,null);assert.equal(row.stretch,undefined);}}
  return rows;}
 for(const throwing of [false,true])assert.deepEqual(run(candidate(rel,raw),throwing),run(baseline(rel,raw),throwing));
});

test('climb/bubble/sizzle gate fragments preserve reviewed frame-by-frame clocks, not normalized FPS counts',()=>{
 const bytes=fs.readFileSync(new URL('../../local-quality/tests/fixtures/reviewed-native-scheduling-e3a8c3b.json',import.meta.url));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'a177a9c1435cddbba40e32ab303736151040f5b3db629adcfe07e786ddd3b177');
 const reviewed=JSON.parse(bytes),rel='src/fx/fxHooks.js',raw=read('../../../inkwave-public/'+rel),old=baseline(rel,raw),next=candidate(rel,raw);
 const fragment=(source,key)=>{const start=source.indexOf('s.'+key+' += dt;'),gate=source.indexOf('if (s.'+key,start),end=source.indexOf(';',source.indexOf('{',gate))+1;assert.ok(start>=0&&gate>start&&end>gate,key+' native clock anchor');return source.slice(start,end);};
 // These are gate-level equivalence checks; the reviewed bubble lane is dormant
 // upstream (if(false)), so this test does not claim it emits live bubbles.
 for(const [key,threshold]of [['climbT',.07],['bubbleT',.35],['sizzleT',.11]]){
  const frozen=reviewed.gates[key];assert.equal(fragment(old,key),frozen,'pre-adapter '+key);assert.equal(fragment(next,key),frozen,'composed '+key);
  const gate=text=>new Function('s','dt',text+' return true;}return false;'),expected=gate(frozen),actual=gate(fragment(next,key));
  for(const initial of [0,threshold,threshold-Number.EPSILON,threshold+Number.EPSILON])for(const dt of [0,1/120,1/60,1/30,.25,1]){
   const a={[key]:initial},b={[key]:initial};assert.equal(actual(b,dt),expected(a,dt),key+' boundary');assert.deepEqual(b,a);
  }
  const exact={[key]:threshold};assert.equal(actual(exact,0),false,key+' strict native threshold');assert.equal(actual(exact,Number.EPSILON),true);assert.equal(exact[key],0,key+' native zero-reset, not remainder');
  const schedules=[...[30,60,120].map(hz=>Array(hz*60).fill(1/hz)),Array.from({length:3600},(_,i)=>[1/120,1/30,1/60,.001,.25,0][i%6])];
  for(const deltas of schedules){const a={[key]:0},b={[key]:0},original=[],changed=[];for(const [frame,dt]of deltas.entries()){if(expected(a,dt))original.push(frame);if(actual(b,dt))changed.push(frame);assert.deepEqual(b,a,key+' frame '+frame);}assert.deepEqual(changed,original,key+' emission frame indices');assert.ok(changed.length>0);}
 }
});

test('paint.version alone cannot cache Ink Mine results: a moving candidate face changes the native region with unchanged ink',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true}),{paint,face,V}=makePaintWorld(f);
 paint.grid.fill(2);const version=paint.version,grid=paint.grid;
 const source=read('../runtime/all-subs.mjs'),sample=new Function(declaration(source,'enemyInkNearMine')+';return enemyInkNearMine;')(),mine={pos:V(0,.1,8),team:0,spec:{inkTriggerRadius:2}};
 assert.equal(sample(f,mine),true);face.origin.y=10;
 assert.equal(paint.version,version);assert.equal(paint.grid,grid);assert.equal(sample(f,mine),false);
});

test('a fixed Booyah ring origin still needs fresh collider results when the same callable sees a moving/disappearing surface',()=>{
 const source=read('../../../inkwave-public/src/fx/fx.js'),rows=[],V=T.Vector3;let y=0,present=true,calls=0;
 const fn=method(source,'FX','ring',{EMPTY:{},UP:new V(0,1,0),_from:new V(),_to:new V(),_cbP:new V(),R_WAVE:0});
 const self={_col:{},_color:x=>x,collider:()=>{calls++;return present?{point:new V(1,y,3)}:null;},_ringRaw:p=>rows.push(p.toArray())},origin=new V(1,.2,3),normal=new V(0,1,0),options={radius:2,life:.1};
 fn.call(self,origin,normal,0,options);y=.25;fn.call(self,origin,normal,0,options);present=false;fn.call(self,origin,normal,0,options);
 assert.deepEqual(rows,[[1,.02,3],[1,.27,3]]);assert.equal(calls,3);
});
