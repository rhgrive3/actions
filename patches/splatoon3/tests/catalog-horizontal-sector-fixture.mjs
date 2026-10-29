import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {catalogRollerDamageTable} from '../runtime/catalog-flick-damage.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';

const DT=1/60,HALF=Math.PI/2;
const names=['Carbon Roller','Dynamo Roller','Flingza Roller','Big Swig Roller'];
async function subject(oldBodySector=false){
  let changed=0;
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    adaptRuntime(rel,source){
      if(oldBodySector&&rel==='patches/splatoon3/runtime/main-weapon-catalog.mjs'){
        const anchor="descriptor.key==='horizontal'?options.sectorYaw:null";
        assert.equal(source.split(anchor).length,2,'unique actual sector owner');changed++;
        return source.replace(anchor,"descriptor.key==='horizontal'?a.yaw:null");
      }
      return source;
    }});
  assert.equal(changed,oldBodySector?1:0);f.setRandom(()=>.5);return f;
}
function fire(f,{name='Dynamo Roller',yaw=0,pitch=0,hz=60,outer=false,ink=100,wall=false,hit=true}={}){
  const {G,THREE}=f;G.projectiles.clear();G.actors.length=0;G.time=0;
  G.level=new f.Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},spawnPads:[[-40,0,-40],[40,0,40]],spawnBarrier:0,half:[],
    single:wall?[{kind:'box',min:[-20,0,.2],max:[20,25,.3]}]:[]});
  G.physics=new f.Physics(G.level);
  const r=MAIN_WEAPON_CATALOG.records.find(r=>r.names.en===name),owner=f.make(r.id);
  owner.nid=1;owner.pos.set(0,10,0);owner.character.root.position.copy(owner.pos);
  owner.ink=ink;owner.aimYaw=owner.yaw=0;owner.aimPitch=pitch;
  owner.aimPoint.set(0,11.05,80);owner.intent.fire=true;
  // The fixture normally stubs visual finishing. Retain the actual native
  // facing spring here: a camera turn on the release tick precedes body turn.
  // Movement integration and Character rendering remain fixture boundaries.
  owner._finishFrame=dt=>{owner._face(dt,false);owner.character.root.position.copy(owner.pos);owner.character.root.rotation.y=owner.yaw;};
  const clock=new f.FixedClock();let ticks=0;
  for(let frame=0;frame<hz*2&&!G.projectiles.list.some(p=>p.catalog);frame++)clock.advance(1/hz,dt=>{
    if(owner.weaponRunner.catalogState?.pending?.remaining<=DT+1e-9)owner.aimYaw=yaw;
    G.time+=dt;owner.update(dt);owner.intent.fire=false;ticks++;
  });
  const rounds=G.projectiles.list.filter(p=>p.catalog),unit=rounds.filter(p=>p.catalog.descriptor.unit===0);
  const p=unit[outer?0:Math.floor(unit.length/2)];assert.ok(p,'actual admitted horizontal volley');
  assert.equal(p.catalog.descriptor.key,'horizontal');
  const sectors=Array.from(rounds,p=>p.catalog.sectorYaw),packet=[];
  for(const p of rounds)f.NetMatch.prototype.recProj.call({_rec:row=>packet.push(structuredClone(row)),cfg:{id:'sector-regression'}},p);
  const row={name,ticks,ink:owner.ink,aimYaw:owner.aimYaw,bodyYaw:owner.yaw,sectorYaw:p.catalog.sectorYaw,sectors,
    start:Array.from(p.start.toArray()),velocity:Array.from(p.vel.toArray()),packet,contacts:[],secondary:Array.from(rounds.filter(p=>p.catalog.descriptor.unit===1),p=>p.catalog.descriptor.packet.UnitDamageRate??null)};
  G.projectiles.list=G.projectiles.list.filter(q=>q===p);
  const enemy=f.make('shooter');enemy.team=1;enemy.hp=1000;enemy.invuln=0;
  enemy.pos.copy(p.start).addScaledVector(p.vel.clone().normalize(),4);enemy.pos.y-=.7;
  if(!hit)enemy.pos.x+=30;
  const original=G.projectiles.applyHit;
  G.projectiles.applyHit=function(a,v,amount,...args){
    const damage=r.parameters.WideSwingUnitGroupParam.DamageParam;
    row.contacts.push({amount,position:Array.from(p.pos.toArray()),table:catalogRollerDamageTable(damage,'horizontal',p.pos,p.start,yaw)===damage.Inside?'inside':'outside'});
    return original.call(this,a,v,amount,...args);
  };
  try{for(let i=0;i<30&&G.projectiles.list.includes(p);i++){G.time+=DT;G.projectiles.update(DT);}}
  finally{G.projectiles.applyHit=original;owner.weaponRunner.reset();G.projectiles.clear();}
  row.hp=enemy.hp;return row;
}
const damage=row=>row.contacts.reduce((n,c)=>n+c.amount,0);


export {subject,fire,damage,names};
