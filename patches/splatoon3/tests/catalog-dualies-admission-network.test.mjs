import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
let ready;
const setup=()=>ready??=(async()=>{const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:`export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';`});f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};return f;})();
function fresh(f,id){f.G.netm=null;f.G.projectiles.clear();f.G.actors=[];const a=f.make(id);a.ink=100;a.form='kid';return a;}
test('all catalog dualies reject interrupted or failed admission without advancing hand or emitting shoot',async()=>{
 const f=await setup(),ids=Object.keys(f.WEAPONS).filter(id=>f.WEAPONS[id].catalogRecord?.family==='dualies');
 for(const id of ids)for(const mode of ['empty','cooldown','sub','dead','remote','zero-dt','spawn-throws']){
 const a=fresh(f,id),r=a.weaponRunner,hand=r.hand,input={fire:true};let dt=1/60;
 if(mode==='empty')a.ink=0;if(mode==='cooldown')r.cooldown=1;if(mode==='sub')input.sub=true;if(mode==='dead')a.alive=false;if(mode==='remote')a.remote=true;if(mode==='zero-dt')dt=0;
 const push=f.G.projectiles._push;if(mode==='spawn-throws')f.G.projectiles._push=()=>{throw Error('rejected diagnostic spawn');};
 try{if(mode==='spawn-throws')assert.throws(()=>r.update(dt,input),/rejected diagnostic spawn/);else r.update(dt,input);}finally{f.G.projectiles._push=push;}
 assert.equal(r.hand,hand,id+' '+mode);assert.equal(a.character.events.filter(e=>e[0]==='shoot').length,0,id+' '+mode);assert.equal(f.G.projectiles.list.length,0,id+' '+mode);
 }console.log('REJECTION_COVERAGE',ids.length*7);
});
test('network projection preserves both hand payloads, selected muzzle and matching native shoot replay',async()=>{
 const f=await setup(),a=fresh(f,f.WEAPONS['s3-maneuver-short-02']?'s3-maneuver-short-02':'s3-maneuver-short');a.nid=91;a.owner='local';
 a.character.getMuzzle=(out)=>out.set(.2,1.05,.4);a.character.getMuzzleHand=(out,hand)=>out.set(hand?-.2:.2,1.05,.4);
 const nm=new f.NetMatch({myId:'local',isHost:true},{});f.G.netm=nm;nm.byNid.set(a.nid,a);nm._setupActor(a);
 const off=f.on('weapon:fire',e=>nm._onLocalEvent('weapon:fire',e));
 try{for(let i=0;i<7;i++){a.intent.fire=true;f.tick(a);}const packets=JSON.parse(JSON.stringify(nm.out)),shots=packets.filter(p=>p[1]==='p'),triggers=packets.filter(p=>p[1]==='tr'&&p[3]==='shoot'),events=packets.filter(p=>p[1]==='ev'&&p[2]==='weapon:fire');
 assert.equal(shots.length,2);assert.deepEqual(triggers.map(p=>p[4].hand),[1,0]);assert.deepEqual(events.map(p=>p[3].hand),[1,0]);assert.deepEqual(events.map(p=>p[3].muzzle[0]),[-.2,.2]);assert.deepEqual(shots.map(p=>p[5]),[-.2,.2]);
 const remote=f.make(a.weaponId);remote.nid=91;remote.owner='other';nm._setupActor(remote);nm.byNid.set(91,remote);const beforeOut=nm.out.length,beforeProjectiles=f.G.projectiles.list.length;
 for(const packet of packets)nm._play('other',packet);
 assert.deepEqual(remote.character.events.filter(e=>e[0]==='shoot').map(e=>e[1].hand),[1,0]);assert.equal(nm.out.length,beforeOut,'remote replay cannot re-emit owner packets');assert.equal(f.G.projectiles.list.length,beforeProjectiles+2);assert.ok(f.G.projectiles.list.slice(-2).every(p=>p.ghost));console.log('NETWORK_HAND_PROJECTION',JSON.stringify({hands:[1,0],projectiles:2,recirculated:false}));
 }finally{off();f.G.netm=null;f.G.projectiles.clear();}
});
