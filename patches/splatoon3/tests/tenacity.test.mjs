import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {advanceTenacity} from '../runtime/tenacity.mjs';
import {emptyLoadout,abilityAllowed} from '../runtime/gear.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('Tenacity is a head-only main and not stackable secondary AP',()=>{for(let p=0;p<3;p++)for(let s=0;s<4;s++)assert.equal(abilityAllowed('tenacity',p,s),p===0&&s===0);});
test('actual Actor Tenacity reflects current living deficit, SCU independence, no turf and 30/60/120 Hz',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true});
 for(const hz of [30,60,120])for(const scu of [false,true]){
  const a=f.make(),e1=f.make(),e2=f.make();e1.team=e2.team=1;f.G.actors=[a,e1,e2];f.G.match={state:'playing',playing:()=>true,actors:f.G.actors};
  a.s3.loadout=emptyLoadout();a.s3.loadout[0].main='tenacity';if(scu)a.s3.loadout[1].main='specialCharge';a.s3RefreshGear();a.special=0;
  const turf=a.stats.turf;for(let i=0;i<hz;i++)a.update(1/hz);
  near(a.specialFrac(),3.24/f.WEAPONS.shooter.specialCost);assert.equal(a.stats.turf,turf);
  const before=a.special;e1.s3Disconnected=true;for(let i=0;i<hz;i++)a.update(1/hz);near(a.special,before);e1.s3Disconnected=false;e1.alive=false;for(let i=0;i<hz;i++)a.update(1/hz);near(a.special,before);
 }
});
test('Tenacity cannot refill active special, dead/remote actor, pause or completed match',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true});
 const a=f.make(),e1=f.make(),e2=f.make();e1.team=e2.team=1;f.G.actors=[a,e1,e2];const m=f.G.match={state:'playing',canRespawn:()=>false,playing(){return this.state==='playing';},actors:f.G.actors};
 a.s3.loadout=emptyLoadout();a.s3.loadout[0].main='tenacity';a.s3RefreshGear();a.special=0;
 a.specialActive={id:'test'};near(advanceTenacity(a,1,f),0);a.specialActive=null;
 for(const [target,key,value]of [[a,'remote',true],[a,'alive',false],[m,'paused',true],[m,'attract',true],[m,'state','finish']]){const old=target[key];target[key]=value;a.update(1/60);near(a.special,0);target[key]=old;}
});
