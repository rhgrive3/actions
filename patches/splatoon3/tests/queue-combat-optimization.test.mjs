import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { blasterFlightPaintSpec, configureBlasterFlightPaint } from '../runtime/blaster-flight-paint.mjs';
import { catalogSplashFirst, catalogSplashNearestSlot } from '../runtime/catalog-splash-paint.mjs';
import { catalogVisualSpec, catalogVisualRadius, SOURCE_DRAW_1130 } from '../runtime/projectile-presentation.mjs';
import { coolerSegmentContact, installCoolerCollision } from '../runtime/support-cooler-collision.mjs';
import { rainmakerWallBlast } from '../runtime/ranked/rainmaker-defense.mjs';
import { RankedWorld } from '../runtime/ranked/world.mjs';
import { notePaintMutation } from '../runtime/scoring.mjs';
import { installKitNetwork, BUBBLER_EVENTS } from '../runtime/kit-network.mjs';

const source = () => ({
  MoveParam:{FreeGravity:.02},
  SplashSpawnParam:{SpawnBetweenLength:1.5,SpawnNearestLength:.5,SpawnNum:4,SplitNum:1,ForceSpawnNearestAddNumArray:[]},
  SplashPaintParam:{WidthHalf:.2,WidthHalfNearest:.3},
});
const birth=(raw,scale=1)=>configureBlasterFlightPaint({pos:new THREE.Vector3(1,2,3)},raw,scale);

test('pinned Roller source unit groups contain independent references for propagated ordinals',()=>{
  const profile=JSON.parse(fs.readFileSync(new URL('../profile.json',import.meta.url),'utf8'));
  let checked=0;
  for(const record of Object.values(profile.weaponsFidelityCompletion.weapons))
    for(const key of ['WideSwingUnitGroupParam','VerticalSwingUnitGroupParam']){
      const units=record[key]?.Unit;if(!units)continue;
      assert.equal(new Set(units).size,units.length);checked++;
    }
  assert.ok(checked>0);
});

test('Blaster births share only immutable specs and observe live source/scale edits and invalidation',()=>{
  const raw=source(),a=birth(raw),b=birth(raw);
  assert.equal(a.spec,b.spec);assert.ok(Object.isFrozen(a.spec)&&Object.isFrozen(a.spec.randomVelocity));
  assert.notEqual(a.last,b.last);a.last.x=900;assert.equal(b.last.x,1);
  assert.notEqual(blasterFlightPaintSpec(raw),blasterFlightPaintSpec(raw),'public factory keeps independent values');
  for(const [group,key,value] of [
    ['MoveParam','FreeGravity',.04],['SplashPaintParam','WidthHalf',.4],
    ['SplashPaintParam','DepthScaleMax',1.7],['SplashSpawnParam','RandomSpawnVelXMax',.1],
    ['SplashSpawnParam','SpawnBetweenLength',2],['SplashSpawnParam','SpawnNum',6],
  ]){
    const old=birth(raw).spec;raw[group][key]=value;
    const changed=birth(raw).spec;assert.notEqual(changed,old);assert.deepEqual(changed,blasterFlightPaintSpec(raw));
  }
  assert.deepEqual(birth(raw,2).spec,blasterFlightPaintSpec(raw,2));
  raw.SplashSpawnParam.ForceSpawnNearestAddNumArray.push(1);
  assert.throws(()=>birth(raw),RangeError,'warm cache cannot hide a now-unsupported source');
  raw.SplashSpawnParam.ForceSpawnNearestAddNumArray.length=0;
  assert.deepEqual(birth(raw).spec,blasterFlightPaintSpec(raw));
  assert.throws(()=>birth(raw,NaN),RangeError);
});

test('a preselected splash slot is reused without changing distance, boundaries or invalid-ordinal behavior',()=>{
  for(const split of [1,2,8])for(const force of [[],[1],[4,8]]){
    const spawn={SplitNum:split,SpawnNearestLength:1,SpawnBetweenLength:3,ForceSpawnNearestAddNumArray:force};
    for(let i=0;i<64;i++)assert.equal(catalogSplashFirst(spawn,i,catalogSplashNearestSlot(spawn,i)),catalogSplashFirst(spawn,i));
  }
  const spawn={SplitNum:8,SpawnNearestLength:1,SpawnBetweenLength:3,ForceSpawnNearestAddNumArray:[4,8]};
  let queries=0;spawn.ForceSpawnNearestAddNumArray.includes=function(v){queries++;return Array.prototype.includes.call(this,v);};
  const slot=catalogSplashNearestSlot(spawn,0);catalogSplashFirst(spawn,0,slot);assert.equal(queries,1);
  assert.equal(catalogSplashFirst(spawn,-1),1);
  assert.throws(()=>catalogSplashNearestSlot(spawn,-1),RangeError);
});

const originalRadius=(spec,age=0)=>{
  const finite=(v,f)=>Number.isFinite(v)?v:f, d=spec.draw,i=spec.index,frame=Math.max(0,age)*60;
  if(!d)return spec.baseRadius??0;
  const init=finite(d.InitRadius,spec.baseRadius)+i*finite(d.AfterOffsetInitRadius,0);
  const end=finite(d.EndRadius,init)+i*finite(d.AfterOffsetEndRadius,0);
  const f=Math.max(0,finite(d.ChangeFrame,0)),t=f>0?Math.max(0,Math.min(1,frame/f)):1;
  return Math.max(0,init+(end-init)*t);
};
test('frozen draw caching preserves exact rounding, age animation, mutable rows and per-spec invalidation',()=>{
  for(const rows of Object.values(SOURCE_DRAW_1130))for(const draw of rows){
    const spec={draw,index:0,baseRadius:.18};
    for(const index of [0,1,3,NaN,-0])for(const base of [.18,NaN,0]){
      spec.index=index;spec.baseRadius=base;
      for(const age of [-1,0,1/120,1/60,5/60,1,NaN,Infinity])
        assert.ok(Object.is(catalogVisualRadius(spec,age),originalRadius(spec,age)));
    }
    spec.draw={...draw};spec.index=0;spec.baseRadius=.18;
    for(let i=0;i<5;i++){spec.draw.EndRadius+=.11;assert.ok(Object.is(catalogVisualRadius(spec,1),originalRadius(spec,1)));}
  }
});

test('catalogue Bucket sharing still handles dynamic source accessors conservatively',()=>{
  let reads=0;
  const record={family:'slosher',get sourceActor(){reads++;return 'WeaponSlosherDouble';}};
  const spec=catalogVisualSpec(record,{b:{},unit:1},5);
  assert.ok(reads>0);assert.equal(spec.style,'sheet');assert.equal(spec.index,5,'source fifth fragment ordinal is not silently clamped to four');
  assert.equal(catalogVisualSpec({family:'shooter',sourceActor:'WeaponShooterNormal'},{c:{}}).style,'rod');
});

test('zone coverage ignores observed wall paint but rescans on unknown mutation, floors and changed indices',()=>{
  let visits=0;const data=[1,2];
  const grid=new Proxy(data,{get(t,k){if(k==='0'||k==='1')visits++;return Reflect.get(t,k);}});
  const paint={grid,version:0};notePaintMutation(paint,false);
  const world=Object.assign(Object.create(RankedWorld.prototype),{stage:{zones:[{}]},paint,_zoneCells:[[{cell:0,area:1},{cell:1,area:1}]]});
  const initial=world.zoneCoverage(),n=visits;notePaintMutation(paint,false);
  assert.equal(world.zoneCoverage(),initial);assert.equal(visits,n);
  data[0]=2;notePaintMutation(paint,true);assert.deepEqual(world.zoneCoverage(),[[0,1]]);
  data[1]=1;paint.version++;assert.deepEqual(world.zoneCoverage(),[[.5,.5]]);
  notePaintMutation(paint,false);const observed=world.zoneCoverage();
  world._zoneCells=[[{cell:0,area:1}]];assert.notEqual(world.zoneCoverage(),observed);assert.deepEqual(world.zoneCoverage(),[[0,1]]);
});

test('projectile Cooler Hit scratch keeps escaping candidates independent and refreshes Tower/expiry facts',()=>{
  let constructions=0;
  class Hit{constructor(){constructions++;this.point=new THREE.Vector3();this.normal=new THREE.Vector3();}}
  class Projectiles{}
  class Actor{_resolve(){}}
  const system=new Projectiles(),stand={pos:new THREE.Vector3(),expires:20},G={time:1,match:{},projectiles:system};
  system._s3SupportCoolers=[stand];
  installCoolerCollision({THREE,Hit,Projectiles,Actor,G,PLAYER:{}});
  const start=new THREE.Vector3(-5,.6,0),end=new THREE.Vector3(5,.6,0);
  const first=coolerSegmentContact(system,start,end,.1);assert.ok(first);
  const point=first.point.clone(),normal=first.normal.clone(),count=constructions;
  for(let i=0;i<20;i++)assert.ok(coolerSegmentContact(system,start,end,.1));
  assert.equal(constructions,count);assert.deepEqual(first.point,point);assert.deepEqual(first.normal,normal);
  assert.equal(coolerSegmentContact(system,new THREE.Vector3(-5,20,0),new THREE.Vector3(5,20,0)),null);
  assert.equal(coolerSegmentContact(system,start,end,.1).stand,stand);
  stand.towerLocal=[0,0,0];G.match.rankedWorld={towerBlock:{center:new THREE.Vector3(0,0,50),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)]}};
  assert.equal(coolerSegmentContact(system,start,end,.1),null);assert.equal(stand.pos.z,50);
  G.time=21;assert.equal(coolerSegmentContact(system,start,end,.1),null);assert.deepEqual(first.point,point);
});

test('Rainmaker wall Set leases preserve duplicate order, detached impact walls, nesting and exception cleanup',()=>{
  const wall=id=>({id,subId:'splashWall',team:1,phase:'deployed',pos:new THREE.Vector3(0,0,id*.1),yaw:0});
  const a=wall(1),b=wall(2),impact=wall(3),owner={remote:false},G={projectiles:{_s3SubObjects:[a,a,b]},physics:{los:()=>true}};
  const api={G,THREE},at=new THREE.Vector3(0,.7,0);let nested=false;
  G.projectiles.s3DamageSubObjects=()=>{if(!nested){nested=true;const result=rainmakerWallBlast(api,at,owner,0,5,1,180,40,impact);assert.equal(result.length,3);}};
  assert.equal(rainmakerWallBlast(api,at,owner,0,5,1,180,40,impact).length,3);
  G.projectiles.s3DamageSubObjects=()=>{throw Error('damage callback');};
  assert.throws(()=>rainmakerWallBlast(api,at,owner,0,5,1,180,40),/damage callback/);
  G.projectiles._s3SubObjects=[];G.projectiles.s3DamageSubObjects=()=>{};
  assert.deepEqual(rainmakerWallBlast(api,at,owner,0,5,1,180,40),[]);
});

test('Bubbler receiver keeps sender authorization, first owner match and Ink Vac fallback',()=>{
  class NetMatch{}
  const calls=[],G={projectiles:{kitBubbleReplay:(...a)=>calls.push(['replay',...a]),kitBubbleAdjudicate:()=>calls.push(['proposal'])}};
  installKitNetwork({NetMatch,G,installInkVacSenderValidator(){},replayInkVac:(...a)=>calls.push(['vac',...a])});
  const actor={nid:1,remote:true,owner:'peer',team:1},owner={nid:2,remote:false,owner:'local'},nm=new NetMatch();
  Object.assign(nm,{byNid:new Map([[1,actor],[2,owner]]),myId:'local'});
  const event={actor,team:1,domeId:'1:n1:7',pos:new THREE.Vector3(1,2,3)};
  assert.equal(nm.replayKitEvent(BUBBLER_EVENTS.deploy,event,'peer'),true);assert.equal(calls[0][1],'deploy');assert.deepEqual(calls[0][3].pos,[1,2,3]);
  const proposal={actor,shooter:'n1',shooterTeam:1,domeOwner:'n2'};
  nm.replayKitEvent(BUBBLER_EVENTS.proposal,proposal,'peer');assert.equal(calls.at(-1)[0],'proposal');
  const count=calls.length;nm.replayKitEvent(BUBBLER_EVENTS.proposal,proposal,'impostor');assert.equal(calls.length,count);
  nm.byNid=new Map([[1,actor],['first',{nid:2,remote:true,owner:'foreign'}],['later',owner]]);
  nm.replayKitEvent(BUBBLER_EVENTS.proposal,proposal,'peer');assert.equal(calls.length,count,'first matching owner remains authoritative');
});

test('ranked landing iterator keeps sparse roster order and resolves later remote poses only when consumed',()=>{
  const source=fs.readFileSync(new URL('../runtime/ranked/network.mjs',import.meta.url),'utf8');
  const start=source.indexOf('function rankedPoseContext('),end=source.indexOf('\nexport function installRankedNetwork',start);
  const context=vm.runInNewContext(source.slice(start,end)+';rankedPoseContext',{actorId:a=>String(a.nid)});
  const player={team:0},first={team:0,alive:true,pos:{x:1},superJumpGround:null},second={team:0,alive:true,nid:2,remote:true,pos:{x:2},superJumpState:{to:{x:3}}};
  const actors=[player,,first,second],canonical={x:4};let gets=0;
  const iterator=context({rankedPose:{get(){gets++;return {actor:second,last:{pos:canonical}};}}},{actors},{G:{}}).allies(player);
  assert.equal(iterator.next().value,first.pos);assert.equal(gets,0);
  assert.equal(iterator.next().value,null);assert.equal(iterator.next().value,undefined);
  assert.equal(iterator.next().value,canonical);assert.equal(gets,1);
  assert.equal(iterator.next().value,undefined);assert.equal(iterator.next().value,second.superJumpState.to);assert.equal(iterator.next().done,true);
});
