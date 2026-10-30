import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture} from './source-fixture.mjs';

// Pinned native data, not an expected-value copy of the current rule constants.
const nativeBytes=fs.readFileSync(new URL('../reference/rainmaker-1130-attack.json',import.meta.url));
const native=JSON.parse(nativeBytes).GameParameters;
const plain=v=>JSON.parse(JSON.stringify(v));
async function harness(charge,hz,{visualOnly=false}={}) {
 const f=await fixture({extraExports:`
  export {RainmakerRule} from './patches/splatoon3/runtime/ranked/rainmaker.mjs';
  export {createRankedEffects} from './patches/splatoon3/runtime/ranked/combat.mjs';`});
 const {THREE,G}=f,V=THREE.Vector3,records={events:[],damage:[],paint:[],rings:[]};
 G.scene=new THREE.Scene();G.netm=null;G.fx={ring:(pos,normal,color,options)=>records.rings.push({pos:pos.toArray(),...options})};
 G.paint={splat:(pos,radius,team,options)=>records.paint.push({pos:pos.toArray(),radius,team,...options})};
 const center=new V(0,-.5,0),half=new V(100,.5,100);
 const floor={id:0,solid:true,center,half,axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,0,-1,-1,-1]};
 G.level={blocks:[floor],faces:[{origin:new V(-100,0,-100),u:new V(1,0,0),v:new V(0,0,1)}],
  queryBlocks:(_x,_z,_xx,_zz,out)=>{out.length=0;out.push(0);return out;}};
 G.physics=new f.Physics(G.level);G.projectiles={};
 const engine={events:[],counts:[100,100],event(kind,data){this.events.push({kind,...plain(data)});},special(){},setCount(){}};
 const stage={rainmaker:{center:[0,0,0],checkpoints:[[],[]],goals:[[0,0,100],[0,0,-100]],retreatZ:[-90,90]}};
 const rule=new f.RainmakerRule(engine,stage);
 const row={id:'carrier',team:0,alive:true,grounded:true,pos:[0,0,0],life:0,owner:null,
  rainmakerShotRequired:true,rainmakerShotOrigin:{actorId:'carrier',team:0,life:0,owner:null,body:[0,.7,0],muzzle:[0,1,0]}};
 const frame={actors:[row],inputs:{carrier:{fire:true,aim:[0,0,1]}}};
 rule.update(0,{...frame,barrierHits:[{team:0,damage:1000,kind:'Shooter'}]});
 for(let i=0;i<Math.round((charge+1/60)*hz);i++)rule.update(1/hz,frame);
 frame.inputs.carrier.fire=false;
 for(let i=0;i<hz&&!engine.events.some(e=>e.kind==='rainmaker-shot');i++)rule.update(1/hz,frame);
 const shot=engine.events.find(e=>e.kind==='rainmaker-shot');assert(shot,'real rule must release a shot');
 const actor={nid:'carrier',team:0,alive:true,pos:new V(),vel:new V()};
 const victim=(id,x)=>({nid:id,team:1,alive:true,pos:new V(x,0,22),damage(amount){records.damage.push({id,amount});}});
 const match={state:'playing',actors:[actor,victim('near',4),victim('far',6)],ranked:{revision:1},rankedWorld:{floorAt:()=>0}};
 const effects=f.createRankedEffects(f,match);effects.event(shot,visualOnly);
 const mesh=G.scene.getObjectByName('rainmaker-shot'),birth=mesh.position.clone(),trace=[];
 let impact=null,blast=null;
 for(let tick=1;tick<=hz*2;tick++){
  effects.update(1/hz);trace.push({tick,pos:mesh.position.toArray(),phase:mesh.userData.phase,attached:!!mesh.parent});
  if(!impact&&mesh.userData.phase==='armed')impact={tick,pos:mesh.position.clone()};
  if(!blast&&records.rings.length)blast={tick,...records.rings.at(-1)};
 }
 effects.dispose();return{shot,birth,trace,impact,blast,records,actor};
}

test('Rainmaker attack fixture is the exact pinned 11.3.0 native table',()=>{
 assert.equal(createHash('sha256').update(nativeBytes).digest('hex'),'682c5955cc7dd486080092d6d1d020595fbc2e356d49a7566ebaa2904bd93678');
 assert.equal(native.MoveParam.SpawnSpeedZFullCharge,1.5);
 assert.deepEqual(native.BlastParamFullCharge.DistanceDamage.map(r=>[r.Distance,r.Damage/10]),[[4.6,180],[7,40]]);
});
for(const hz of [30,60,120])test(`real rule-to-native-Physics full shot reaches 4.4 test lines and detonates at ${hz}Hz`,async()=>{
 const r=await harness(1,hz),p=native.BlastParamFullCharge;
 assert.equal(r.shot.speed,native.MoveParam.SpawnSpeedZFullCharge*60);
 assert.equal(r.shot.launchY,native.MoveParam.SpawnSpeedYFullCharge*60);
 assert.equal(r.shot.radius,p.DistanceDamage[1].Distance);
 assert.equal(r.shot.nearRadius,p.DistanceDamage[0].Distance);
 assert.equal(r.shot.paintRadius,p.PaintRadius);
 assert.equal(r.shot.trailRadius,native.SplashPaintSpawnParam.PaintRadiusFullCharge);
 assert.equal(r.shot.directRange,4.4*5,'test-room line -> existing 10 DU/world bridge');
 assert(r.impact,'actual native floor segment must arm the shot');
 assert(Math.abs(r.impact.pos.z-r.birth.z-22)<1e-9);
 assert(Math.abs(r.impact.pos.y)<1e-8);
 assert(r.blast,'full shot must really detonate, not just disappear');
 assert(Math.abs((r.blast.tick-r.impact.tick)/hz-.2)<=1/hz+1e-9);
 assert.equal(r.records.rings.length,1);
 assert.deepEqual(r.records.damage,[{id:'near',amount:180},{id:'far',amount:40}]);
 assert(r.records.paint.some(p=>p.radius===5&&p.claimMode==='no-special'));
 assert(r.records.paint.every(p=>p.claimMode==='no-special'));
 console.log(JSON.stringify({hz,impact:r.impact.pos.toArray(),impactTick:r.impact.tick,blastTick:r.blast.tick,damage:r.records.damage}));
});
for(const hz of [30,60,120])test(`real minimum-charge shot travels ten world units and remains nonexplosive at ${hz}Hz`,async()=>{
 const r=await harness(1/60,hz);
 assert.equal(r.shot.charge,20/60);
 assert.equal(r.shot.speed,native.MoveParam.SpawnSpeedZMaxCharge*60);
 assert.equal(r.shot.blastDamage,0);
 assert.equal(Math.max(...r.trace.map(t=>t.pos[2]))-r.birth.z,10);
 assert.equal(r.blast,null);assert.deepEqual(r.records.damage,[]);
 assert(r.records.paint.some(p=>p.radius===native.SplashNearestParam.PaintRadiusMinCharge));
});
test('source-scaled follower replay has the same blast but no second paint/damage owner',async()=>{
 const r=await harness(1,60,{visualOnly:true});
 assert(r.blast);assert.equal(r.blast.radius,7);assert.deepEqual(r.records.paint,[]);assert.deepEqual(r.records.damage,[]);
 assert(Math.abs(r.actor.vel.z+native.WeaponParam.KnockBackParamFullCharge.ImpactValue*60)<1e-12);
});
