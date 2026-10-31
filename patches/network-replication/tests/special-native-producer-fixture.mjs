import {exportNativeActorPacker} from './native-packer-export-fixture.mjs';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';

// The production actor, special controller, projectiles, event producer,
// 20 Hz tick packer and consumer are retained. Only rendering, flat terrain,
// and movement integration are fixture boundaries.
export async function specialNativeProducer(t,id,{frames=180,targetZ=1,targetY=0,targetKind='sub',configure,step,afterStep,stopWhen,fullActor=false,randomSeed=null}={}){
 const f=await fixture({productionComposition:true,transformSource:exportNativeActorPacker,randomSeed});
 class Display{constructor(){this.root=new f.THREE.Group();}_owner(){return this.actor;}trigger(){}update(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new f.THREE.Vector3(0,1.05,.3));}}
 const make=(nid,owner,remote,team)=>{const a=new f.Actor({team,name:owner,weapon:'shooter',CharacterClass:Display});a.character.actor=a;Object.assign(a,{nid,owner,remote,netLife:0,isLocal:!remote,grounded:true});
  a.pos.set(0,0,0);a.aimYaw=0;a.aimPitch=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,0,25);a._integrate=()=>{};a._horizontal=()=>{};a._resolve=()=>{};return a;};
 const attacker=make(17,'peer',true,1),owner=make(7,'me',false,0);
 attacker.weapon={...attacker.weapon,special:id,specialCost:190};attacker.special=190;owner.invuln=1e6;
 const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']])),match=f.bind(nm,[owner,attacker]);nm.match=null;nm.bind(match);Object.assign(f.G,{match,actors:[owner,attacker]});t.after(()=>nm.dispose());
 const initial=f.nativePackActor(attacker);initial[13]=190;initial[22]=0;
 nm.onMessage('peer',{k:'t',r:2,ts:1000,u:0,a:[initial],l:{17:0},e:[]});
 owner.pos.set(0,targetY,targetZ);let target;
 if(targetKind==='sub'){
  owner.weapon={...owner.weapon,sub:'beakon'};target=f.projectiles.throwBomb(owner);
 }else if(targetKind==='special'){
  owner.weapon={...owner.weapon,special:'waveBreaker',specialCost:190};owner.special=190;owner._startSpecial();
  owner.intent.sub=true;owner._updateSpecial(1/60);owner.intent.sub=false;
  for(let i=0;i<20&&owner.specialActive;i++)owner._updateSpecial(1/60);
  target=f.projectiles._s3AllSpecialObjects?.find(o=>o.owner===owner&&o.kind==='wave');
 }else throw new Error('Unsupported fixture device kind');
 assert.ok(target);target.pos.copy(owner.pos);target.hp=1e9;target.maxHp=1e9;
 target.phase=targetKind==='sub'?'deployed':'active';target.activeAt=Infinity;target.expireAt=Infinity;target.dur=Infinity;
 const packets=[];nm.s.tr.broadcast=p=>{if(p.k==='t')packets.push(JSON.parse(JSON.stringify(p)));return true;};
 const x={f,nm,attacker,owner,target,packets};configure?.(x);
 attacker.remote=false;owner.remote=true;nm.myId='peer';nm.out.length=0;f.clock.set(1000.001);attacker._startSpecial();assert.ok(attacker.specialActive,`${id}: native use`);
 for(let i=0;i<frames;i++){
  f.clock.set(1000+(i+1)/60);f.G.time=(i+1)/60;step?.(x,i);
  if(fullActor)attacker.update(1/60);else if(attacker.specialActive)attacker._updateSpecial(1/60);
  f.projectiles.update(1/60);afterStep?.(x,i);
  if(i%3===2)nm._sendTick();
  if(stopWhen?.(x,i))break;
 }
 if(nm.out.length)nm._sendTick();
 const events=packets.flatMap(p=>p.e||[]),claims=events.filter(e=>e[1]==='ac'&&(targetKind==='sub'
  ?e[5]?.phase==='objectHit'&&e[5]?.targetSeq===target.seq
  :e[5]?.action==='objectHit'&&e[5]?.ownerNid===owner.nid&&e[5]?.object===target.serial&&e[5]?.activation===target.activation));
 assert.ok(events.some(e=>e[1]==='ev'&&e[2]==='special:use'),`${id}: native activation published`);
 attacker.remote=true;owner.remote=false;nm.myId='me';nm.out.length=0;target.hp=1e9;target.dead=false;target.ghost=false;
 if(f.projectiles._s3AllSpecialObjects){const objects=f.projectiles._s3AllSpecialObjects;objects.splice(0,objects.length,...objects.filter(o=>o===target));}
 let seq=1;
 const deliver=(packet,mutate,beforePlay,afterPlay)=>{const p=JSON.parse(JSON.stringify(packet));if(mutate)p.e=mutate(p.e||[]);for(const e of p.e||[])e[e.length-1]=seq++;
  f.clock.set(p.ts);f.G.time=p.u/60;nm.onMessage('peer',p);const out=[];
  for(const e of nm.peers.get('peer').events.splice(0)){beforePlay?.(e);const before=target.hp;nm._play('peer',e);out.push({event:e,damage:before-target.hp});afterPlay?.(e);}
  return out;};
 return {...x,events,claims,deliver};
}
