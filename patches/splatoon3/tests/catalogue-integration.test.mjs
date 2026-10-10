import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {SUB_NAMES,SPECIAL_NAMES,applyCatalogueChoice,validateCatalogueChoice} from '../runtime/catalogue.mjs';
import {cataloguePayload} from '../runtime/catalogue.mjs';
import {installCatalogueBeakonJumps,installCatalogueControls} from '../runtime/catalogue.mjs';
const extraExports="export {replaySplashdown} from './patches/splatoon3/runtime/catalogue.mjs'; export {catalogueVisionFilter} from './patches/splatoon3/runtime/catalogue.mjs';";
async function setup(){const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports});f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};return f;}
const equip=(f,a,sub,special)=>{assert.ok(applyCatalogueChoice(a,{sub,special},f));a.special=a.specialCost();a.invuln=0;};
test('canonical shipped installer exposes all 14 subs and 19 distinct retail specials',async()=>{
 const f=await setup();assert.equal(Object.keys(SUB_NAMES).length,14);assert.equal(Object.keys(SPECIAL_NAMES).length,19);
 for(const [id,name]of Object.entries(SUB_NAMES))assert.equal(f.SUB[id]?.name,name,id);
 for(const [id,name]of Object.entries(SPECIAL_NAMES))assert.equal(f.SPECIALS[id]?.name,name,id);
 assert.notEqual(f.SPECIALS.slam,f.SPECIALS.tripleSplashdown);
 for(const [main,sub,sp,cost]of [['dualies','suction','crabTank',200],['blaster','autobomb','bubbler',190],['splatling','sprinkler','waveBreaker',210],['slosher','bomb','tripleInkstrike',220]]){
  const a=f.make(main);assert.equal(a.weapon.sub,sub);assert.equal(a.weapon.special,sp);assert.equal(a.specialCost(),cost);
 }
});
test('actor-local pair survives gear refresh and respawn without mutating other players or templates',async()=>{
 const f=await setup(),a=f.make(),b=f.make(),base={...f.WEAPONS.shooter};
 equip(f,a,'torpedo','zipcaster');assert.equal(b.weapon.sub,'suction');assert.equal(f.WEAPONS.shooter.sub,base.sub);
 a.s3RefreshGear();assert.equal(a.weapon.sub,'torpedo');assert.equal(a.weapon.special,'zipcaster');
 a.reset();assert.equal(a.weapon.sub,'torpedo');assert.equal(a.weapon.special,'zipcaster');assert.ok(a.specialCost()>0);
 assert.equal(validateCatalogueChoice({sub:'__proto__',special:'zipcaster'},f.SUB,f.SPECIALS),false);
 assert.equal(applyCatalogueChoice(a,{sub:'bomb',special:'missing'},f),false);
});
test('Triple Splashdown consumes native gauge/stats and protects only at 50F; cancelled owner retains two independently attackable fists',async()=>{
 const f=await setup(),a=f.make(),enemy=f.make();enemy.team=1;equip(f,a,'bomb','tripleSplashdown');
 a._startSpecial();assert.equal(a.stats.specials,1);assert.equal(a.specialActive.id,'tripleSplashdown');assert.equal(f.G.projectiles._catalogueFists.length,2);
 a.specialActive.age=49/60;a.damage(1,enemy,'shooter');assert.equal(a.hp,99);
 a.specialActive.age=50/60;a.damage(1,enemy,'shooter');assert.equal(a.hp,99);
 a.specialActive.age=0;a.splat(enemy,'shooter');assert.equal(a.alive,false);assert.equal(f.G.projectiles._catalogueFists.length,2);
 const fist=f.G.projectiles._catalogueFists[0];
 const p={owner:enemy,team:1,damage:100,prev:fist.pos.clone().add(new f.THREE.Vector3(0,0,-2)),pos:fist.pos.clone().add(new f.THREE.Vector3(0,0,2)),size:.1};
 const hit=f.G.projectiles.kitDefenseCandidate(p);assert.ok(hit);hit.onHit();assert.equal(fist.dead,true);
 f.G.projectiles.update(1/60);assert.equal(f.G.projectiles._catalogueFists.length,1);
 for(let i=0;i<100;i++)f.G.projectiles.update(1/60);assert.equal(f.G.projectiles._catalogueFists.length,0);
});
test('Super Jump Splashdown creates player descent without extra fists',async()=>{
 const f=await setup(),a=f.make();equip(f,a,'bomb','tripleSplashdown');a.superJumpState={phase:'flight'};a.intent.special=true;a.pos.y=20;
 a._updateSuperJump(1/60);assert.equal(a.specialActive.superJump,true);assert.equal(a.superJumpState,null);assert.equal(f.G.projectiles._catalogueFists?.length||0,0);assert.equal(a.vel.y,-39);
});
test('replayed Splashdown owns only ghost presentation; owner-bound fist damage is life checked',async()=>{
 const f=await setup(),a=f.make();a.remote=true;a.owner='A';a.nid=1;let paint=0,hits=0,fx=0;
 f.G.paint.splat=()=>{paint++;return 1;};f.G.projectiles.applyHit=()=>hits++;f.G.fx={explosion:()=>fx++};
 const e={actor:a,id:'tripleSplashdown',activation:1,action:'activate',pos:[0,0,0],yaw:0};assert.ok(f.replaySplashdown(f.installedRuntime,e));
 assert.equal(f.replaySplashdown(f.installedRuntime,e),false);
 for(let i=0;i<100;i++)f.G.projectiles.update(1/60);assert.equal(paint,0);assert.equal(hits,0);assert.equal(fx,0);
 assert.ok(f.replaySplashdown(f.installedRuntime,{...e,action:'impact'}));assert.equal(fx,1);
});
test('catalogue JSON is bounded and excludes actor identity; colour status is local view only and expires',async()=>{
 assert.deepEqual(cataloguePayload({actor:{secret:1},id:'inkjet',pos:[1,2,3],seed:4}),{id:'inkjet',pos:[1,2,3],seed:4});
 assert.equal(cataloguePayload({pos:[1,NaN,3]}),null);assert.equal(cataloguePayload({seed:Infinity}),null);assert.equal(cataloguePayload({pos:Array(65).fill(0)}),null);
 const f=await setup(),a=f.make();a.s3.splattercolorUntil=6;assert.match(f.catalogueVisionFilter(a,5.99),/grayscale/);assert.equal(f.catalogueVisionFilter(a,6),'');
 a.alive=false;assert.equal(f.catalogueVisionFilter(a,1),'');a.reset();assert.equal(a.s3.splattercolorUntil,0);
});

test('real JSON event packing validates sender, life and ordered deduplication before ghost creation',async()=>{
 const f=await setup(),owner=f.make(),proxy=f.make();Object.assign(owner,{nid:1,owner:'A'});Object.assign(proxy,{nid:1,owner:'A',remote:true});equip(f,owner,'bomb','tripleSplashdown');
 const session=id=>({myId:id,isHost:true,_members:new Map([['A',{}],['B',{}]])});
 const sender=new f.NetMatch(session('A'),{}),receiver=new f.NetMatch(session('B'),{}),match={actors:[owner],playing:()=>true};
 sender.bind(match);f.G.match=match;owner._startSpecial();const event=JSON.parse(JSON.stringify(sender.out.find(e=>e[1]==='ac')));assert.ok(event);
 receiver.byNid.set(1,proxy);f.G.netm=receiver;f.G.projectiles._catalogueFists=[];
 receiver._play('foreign',event);assert.equal(f.G.projectiles._catalogueFists.length,0);
 const stale=JSON.parse(JSON.stringify(event));stale[4]++;receiver._play('A',stale);assert.equal(f.G.projectiles._catalogueFists.length,0);
 receiver._play('A',event);assert.equal(f.G.projectiles._catalogueFists.length,2);assert.ok(f.G.projectiles._catalogueFists.every(x=>x.ghost));
 receiver._play('A',JSON.parse(JSON.stringify(event)));assert.equal(f.G.projectiles._catalogueFists.length,2);
 sender.dispose();
});
test('native tick sidecar carries an actor-local pair and rejects stale or foreign replacements',async()=>{
 const f=await setup(),owner=f.make(),proxy=f.make();Object.assign(owner,{nid:1,owner:'A'});Object.assign(proxy,{nid:1,owner:'A',remote:true});equip(f,owner,'torpedo','zipcaster');
 let message;const makeSession=id=>({myId:id,isHost:false,_members:new Map([['A',{}],['B',{}]]),tr:{broadcast:m=>{message=JSON.parse(JSON.stringify(m));}}});
 const sender=new f.NetMatch(makeSession('A'),{}),receiver=new f.NetMatch(makeSession('B'),{});sender.bind({actors:[owner]});sender._sendTick();assert.equal(message.ck[1][1],'torpedo');
 receiver._setupActor(proxy);receiver.byNid.set(1,proxy);f.G.netm=receiver;receiver._tick('A',message);assert.equal(proxy.weapon.sub,'torpedo');assert.equal(proxy.weapon.special,'zipcaster');
 const stale=JSON.parse(JSON.stringify(message));stale.ck[1][1]='bomb';receiver._tick('A',stale);assert.equal(proxy.weapon.sub,'torpedo');
 const foreign=JSON.parse(JSON.stringify(message));foreign.ts++;foreign.ck[1][1]='bomb';receiver._tick('foreign',foreign);assert.equal(proxy.weapon.sub,'torpedo');sender.dispose();
});

test('Splat Bomb released through a custom kit retains the generic native paint branch',async()=>{
 const f=await setup(),a=f.make();equip(f,a,'pointSensor','trizooka');equip(f,a,'bomb','trizooka');
 f.G.projectiles.throwBomb(a);const b=f.G.projectiles.bombs.at(-1);assert.ok(b);assert.equal(b.s3Resolved.spec.id,'bomb');
 let stamps=0;f.G.paint.splat=()=>{stamps++;return 1;};
 assert.doesNotThrow(()=>f.G.projectiles._explodeBomb(b));assert.equal(stamps,16,'one sourced core and fifteen controlled peripheral paint stamps');
});

test('map Beakon lane reserves once, consumes on landing and releases on interrupted jumps',()=>{
 const calls=[],o={owner:{nid:7},sourceLife:2,seq:3,team:0,pos:{clone:()=>({x:1,y:0,z:2})}};
 class A{constructor(){this.team=0;this.isLocal=true;this.alive=true;this.grounded=true;}canSuperJump(){return true;}superJump(){this.superJumpState={phase:'charge'};return true;}superJumpToBubbler(){return false;}_updateSuperJump(){this.superJumpState=null;}reset(){this.superJumpState=null;}splat(){this.alive=false;this.superJumpState=null;}}
 const G={bigBubblerJumpTargets:()=>[]},api={G,Actor:A,getSubBeakons:()=>[o],useSubBeakon:(_a,b,stage)=>{assert.equal(b,o);calls.push(stage);return true;}};
 installCatalogueBeakonJumps(api);const a=new A(),target=G.bigBubblerJumpTargets(0)[0];assert.ok(a.superJumpToBubbler(target));a._updateSuperJump();assert.deepEqual(calls,['reserve','land']);
 assert.ok(a.superJumpToBubbler(target));a.splat();assert.deepEqual(calls,['reserve','land','reserve','cancel']);
});
test('keyboard, standard-pad and touch Booyah controls produce edges and respect map/pause',()=>{
 class Controller{constructor(){this.a={alive:true,team:0,intent:{}};this.enabled=true;this.input={down:()=>false};}update(){}}
 class HUD{update(){}}
 const G={match:{paused:false},actors:[]};installCatalogueControls({G,PlayerController:Controller,HUD,emit:()=>{}});const c=new Controller();
 c.input.down=()=>true;c.update();assert.equal(c.a.intent.booyah,true);c.update();assert.equal(c.a.intent.booyah,false);
 c.input.down=()=>false;c.update();c.input.lastDevice='pad';c.input.padButton=()=>true;c.update();assert.equal(c.a.intent.booyah,true);
 c.input.padButton=()=>false;c.a._catalogueCheerPending=true;c.mapHeld=true;c.update();assert.equal(c.a.intent.booyah,false);assert.equal(c.a._catalogueCheerPending,false);
 c.mapHeld=false;c.a._catalogueCheerPending=true;c.update();assert.equal(c.a.intent.booyah,true);G.match.paused=true;c.a._catalogueCheerPending=true;c.update();assert.equal(c.a.intent.booyah,false);
});
