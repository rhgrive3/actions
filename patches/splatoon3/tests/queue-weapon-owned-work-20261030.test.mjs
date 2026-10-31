import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {actualModule} from '../../network-replication/tests/added-actual-module.mjs';
import {fixture} from './source-fixture.mjs';
import {chargerPostShotBlocksSub} from '../runtime/weapon-gates.mjs';
import {acquireCatalogPiercingRows,catalogPiercingRow,releaseCatalogPiercingRows} from '../runtime/catalog-piercing-rows.mjs';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
function extract(source,predicate){let found;function walk(n){if(!n||typeof n!=='object')return;if(predicate(n)){found=source.slice(n.start,n.end);return;}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parse(source,{sourceType:'module',ecmaVersion:'latest'}));assert.ok(found);return found;}
function fn(source,bindings={}){return new Function(...Object.keys(bindings),'return ('+source+');')(...Object.values(bindings));}
const decl=(source,name)=>extract(source,n=>n.type==='FunctionDeclaration'&&n.id?.name===name);
const json=x=>JSON.parse(JSON.stringify(x));

test('Charger accessor reuse keeps independent snapshots, live gates, key/descriptor order, reentry and source exceptions',async()=>{
  const text=read('../runtime/weapon-edgecases.mjs'),assignment=extract(text,n=>n.type==='AssignmentExpression'&&text.slice(n.left.start,n.left.end)==='WeaponRunner.prototype.update'),current=assignment.slice(assignment.indexOf('=')+1);
  const newBody=`      const view={...source};
      Object.defineProperties(view,chargerSubDescriptors(runner,source));
      return weaponUpdate.call(this, dt, view);`;
  const oldBody=`      return weaponUpdate.call(this, dt, { ...source,
        get sub() { return chargerPostShotBlocksSub(runner) ? false : source.sub; },
        get subReleased() { return chargerPostShotBlocksSub(runner) ? false : source.subReleased; },
      });`;
  assert.equal(current.split(newBody).length,2);
  const helpers=await actualModule('patches/splatoon3/runtime/weapon-edgecases.mjs',{extra:'export {chargerSubDescriptors};'});
  function run(code,kind){
    const log=[],retained=[],runner={a:{weapon:{kind:'charger'}},s3ChargerPostShot:0};let source={fire:true,firePressed:false,sub:true,subReleased:false},depth=0,invoke;
    const symbol=Symbol.for('extra');
    if(kind==='extra'){source.extra=7;source[symbol]=9;}
    if(kind==='getter'||kind==='throw')Object.defineProperty(source,'subReleased',{enumerable:true,get(){log.push('source-release');if(kind==='throw')throw Error('source');return false;}});
    if(kind==='proxy')source=new Proxy(source,{get(t,k){log.push('get:'+String(k));return Reflect.get(t,k);},ownKeys(t){log.push('keys');return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,k){log.push('descriptor:'+String(k));return Reflect.getOwnPropertyDescriptor(t,k);}});
    const weaponUpdate=function(_dt,input){
      retained.push(input);log.push(['before',input.fire,input.firePressed,input.sub,input.subReleased,Reflect.ownKeys(input).map(String)]);
      runner.s3ChargerPostShot=.2;log.push(['locked',input.sub,input.subReleased]);runner.s3ChargerPostShot=0;
      if(kind==='nested'&&!depth){depth++;invoke.call(runner,1/120,{fire:false,firePressed:true,sub:true,subReleased:true});depth--;}
      log.push(['after',input.fire,input.sub]);return 7;
    };
    invoke=fn(code,{weaponUpdate,chargerPostShotBlocksSub,chargerSubDescriptors:helpers.api.chargerSubDescriptors});
    let error;try{invoke.call(runner,1/60,source);source.fire=false;source.subReleased=true;invoke.call(runner,1/30,source);}catch(e){error=e.message;}
    return {log,error,retained:retained.map(v=>({fire:v.fire,sub:v.sub,released:v.subReleased,
      descriptors:Reflect.ownKeys(v).map(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return [String(k),d.enumerable,d.configurable,d.writable??null,typeof d.get];})})),distinct:retained.length<2||retained[0]!==retained.at(-1)};
  }
  for(const kind of ['plain','extra','getter','proxy','nested','throw'])assert.deepEqual(run(current,kind),run(current.replace(newBody,oldBody),kind),kind);
});

test('Slosher motion reuses trig results without changing live accessor reads, signed zero, guides, reentry or errors',async()=>{
  const profile=JSON.parse(read('../profile.json')),text=read('../runtime/weapons-fidelity.mjs');
  const start=text.indexOf('    // Read each live angle at its original point'),end=text.indexOf('\n    const amount=',start);assert.ok(start>0&&end>start);
  async function load(control){
    const math=Object.create(Math),calls={sin:0,cos:0};math.sin=x=>{calls.sin++;return Math.sin(x);};math.cos=x=>{calls.cos++;return Math.cos(x);};
    const f=await actualModule('patches/splatoon3/runtime/weapons-fidelity.mjs',{globals:{Math:math},
      transform:s=>control?s.slice(0,start)+'    const x=Math.sin(a.yaw),z=Math.cos(a.yaw);'+s.slice(end):s,
      extra:'export function installTestCompletion(value){completion=value;}'});
    return {f,calls};
  }
  const before=await load(true),after=await load(false);
  function run(world,kind){
    const data=structuredClone(profile.weaponsFidelityCompletion);world.f.api.installTestCompletion(data);
    const actor={weapon:{id:'slosher',kind:'slosher'},vel:{x:2,y:-3,z:1},yaw:.4},volley={},rows=[],reads=[];
    let yaw=.4,n=0;
    if(kind==='getter'||kind==='throw')Object.defineProperty(actor,'yaw',{get(){reads.push(n);if(kind==='throw'&&n++===13)throw Error('yaw');return yaw+=(n++%2?.1:0);}});
    if(kind==='rate')Object.defineProperty(data.weapons.slosher.spl__SpawnBulletAdditionMovePlayerParam,'ZRate',{get(){reads.push('rate');yaw+=.1;actor.yaw=yaw;return 2;}});
    world.calls.sin=world.calls.cos=0;let error;
    for(let i=0;i<9;i++){
      if(kind==='change')actor.yaw=i<3?-0:i<6?0:.8;
      const p={type:'slosh',owner:actor,vel:{x:3,y:1,z:4}};
      try{world.f.api.applySlosherSpawnVelocity(p,{guide:kind==='guide'},volley);}catch(e){error=e.message;break;}
      rows.push({...p.vel,applied:p.s3SlosherMotionApplied});
    }
    return {rows,reads,error,calls:{...world.calls}};
  }
  for(const kind of ['plain','getter','throw','rate','change','guide']){
    const b=run(before,kind),a=run(after,kind);assert.deepEqual({...a,calls:null},{...b,calls:null},kind);
    if(kind==='plain'){assert.deepEqual(a.calls,{sin:1,cos:1});assert.deepEqual(b.calls,{sin:9,cos:9});}
    if(kind==='guide')assert.deepEqual(a.calls,b.calls,'HUD guide remains outside volley reuse');
  }
});

test('Roller private overlays match source getter/proxy order and all final own descriptors, with no shared-config writes',()=>{
  const text=read('../runtime/roller.mjs'),start=text.indexOf('    const vertical = state ? state.vertical : this.s3FlickVertical;'),end=text.indexOf('\n    // Float accumulation',start);assert.ok(start>0&&end>start);
  const current=text.slice(start,end),before=current
    .replace(`    if (state) {
      if(mode===w)mode={...mode,flickWindup:state.windup,flickInterval:state.interval};
      else {setModeField(mode,'flickWindup',state.windup);setModeField(mode,'flickInterval',state.interval);}
    }`,`    if (state) mode = { ...mode, flickWindup: state.windup, flickInterval: state.interval };`)
    .replace(`      if (drops !== null) {
        setModeField(mode,'s3Depletion',true);setModeField(mode,'s3DepletionDrops',drops);setModeField(mode,'flickDrops',drops);
      }`,`      if (drops !== null) mode = { ...mode, s3Depletion: true, s3DepletionDrops: drops, flickDrops: drops };`);
  assert.notEqual(current,before);
  const mode=fn(decl(text,'rollerMode')),field=fn(decl(text,'setModeField'),{MODE_FIELD:{value:null,writable:true,enumerable:true,configurable:true}});
  function run(code,vertical,depleted,kind){
    const log=[],symbol=Symbol.for('mode-extra');let w={flickWindup:.5,flickInterval:.7,flickInk:10,verticalWindup:.8,verticalInterval:1,verticalInk:20,[symbol]:13};
    if(kind==='getter')Object.defineProperty(w,'extra',{enumerable:true,get(){log.push('extra');return 23;}});
    if(kind==='proxy')w=new Proxy(w,{ownKeys(t){log.push('keys');return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,k){log.push('descriptor:'+String(k));return Reflect.getOwnPropertyDescriptor(t,k);},get(t,k){log.push('get:'+String(k));return Reflect.get(t,k);}});
    const state={vertical,depleted,get windup(){log.push('windup');return .3;},get interval(){log.push('interval');return .9;}};
    const invoke=new Function('w','state','rollerMode','setModeField','depletionDrops',code+'\nreturn mode;');
    const result=invoke.call({s3FlickVertical:vertical},w,state,mode,field,()=>{log.push('drops');return 3;});
    return {log,sourceWindup:w.flickWindup,fields:Reflect.ownKeys(result).map(k=>[String(k),Object.getOwnPropertyDescriptor(result,k)])};
  }
  for(const vertical of [false,true])for(const depleted of [false,true])for(const kind of ['plain','getter','proxy'])assert.deepEqual(run(current,vertical,depleted,kind),run(before,vertical,depleted,kind));
});

test('piercing lease rows are separate from insertion order and release actor references across nested/oversize calls',()=>{
  const owner={},outer=acquireCatalogPiercingRows(owner),a={},b={},near=catalogPiercingRow(outer,a,.8),far=catalogPiercingRow(outer,b,.2);
  const sorted=[far,near],inner=acquireCatalogPiercingRows(owner),nested=catalogPiercingRow(inner,{},.1);
  assert.notEqual(nested,near);assert.deepEqual(sorted.map(r=>r.t),[.2,.8]);releaseCatalogPiercingRows(inner);assert.equal(nested.actor,null);
  releaseCatalogPiercingRows(outer);assert.equal(near.actor,null);assert.equal(far.actor,null);
  const reuse=acquireCatalogPiercingRows(owner);assert.equal(catalogPiercingRow(reuse,a,.3),near);
  for(let i=0;i<1000;i++)catalogPiercingRow(reuse,{},i);assert.equal(reuse.rows.length,32);releaseCatalogPiercingRows(reuse);assert.ok(reuse.rows.every(r=>r.actor===null));
});

test('native Charger contact exceptions release rows and the next shot reuses cleared records',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});f.setRandom(()=>.5);
  f.G.level=new f.Level({bounds:{minX:-40,maxX:40,minZ:-40,maxZ:40},spawnPads:[[-30,0,-30],[30,0,30]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-40,-1,-40],max:[40,0,40]}]});f.G.physics=new f.Physics(f.G.level);
  const a=f.make('s3-charger-long'),victims=[f.make(),f.make()];a.aimDir.set(0,0,1);a.aimPoint.set(0,1,50);const retained=[];
  for(let shot=0;shot<2;shot++){
    f.G.projectiles.clear();a.weaponRunner.reset();a.ink=100;a.intent.fire=true;f.tick(a,150);a.intent.fire=false;f.tick(a);
    const p=f.G.projectiles.list.find(p=>p.catalog);assert.ok(p);const end=p.pos.clone().addScaledVector(p.vel,1/60);
    for(const [i,v] of victims.entries()){v.team=1;v.hp=1000;v.invuln=0;v.pos.copy(p.pos).lerp(end,(i+1)/4);v.pos.y-=.7;}
    f.G.actors=[a,...victims];f.G.projectiles.applyHit=()=>{retained.push(...p.catalog.piercingHits);throw Error('contact');};
    assert.throws(()=>f.G.projectiles._step(p,1/60),/contact/);assert.equal(p.catalog.piercingHits.length,0);
    assert.ok(retained.every(r=>r.actor===null));
  }
  assert.equal(retained[0],retained[2],'same Projectiles owner reuses the row after a later real shot');
});
