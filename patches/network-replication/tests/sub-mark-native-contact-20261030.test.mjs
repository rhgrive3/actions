import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';

async function setup(t,id){
 const f=await fixture({productionComposition:true,transformSource:(rel,code)=>rel==='src/net/netmatch.js'?code+'\nexport {packActor as nativePackActor};\n':code});
 class Display{constructor(){this.root=new f.THREE.Group();}_owner(){return this.actor;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new f.THREE.Vector3(0,1.35,0));}}
 const make=(nid,owner,remote,team)=>{const a=new f.Actor({team,name:owner,weapon:'shooter',CharacterClass:Display});a.character.actor=a;Object.assign(a,{nid,owner,remote,netLife:0,grounded:true});a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1.35,30);a.aimYaw=0;a.aimPitch=0;a._resolve=()=>{};return a;};
 const owner=make(17,'peer',true,1),victim=make(7,'me',false,0);owner.weapon={...owner.weapon,sub:id};victim.pos.set(0,0,id==='inkMine'?2:3);
 const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']])),match=f.bind(nm,[victim,owner]);nm.match=null;nm.bind(match);Object.assign(f.G,{match,actors:[victim,owner]});t.after(()=>nm.dispose());
 let time=1000,sequence=1;
 function deliver(events){time+=.05;f.G.time+=.05;f.clock.set(time);const snapshot=f.nativePackActor(owner),tick=Math.round(f.G.time*60);
  const rows=structuredClone(events).map(e=>{e[0]=time-.001;e[e.length-2]=tick-1;e[e.length-1]=sequence++;return e;});
  nm.onMessage('peer',{k:'t',r:2,ts:time,u:tick,a:[snapshot],l:{17:0},e:rows});
  for(const e of nm.peers.get('peer').events.splice(0))nm._play('peer',e);
 }
 function step(n){for(let i=0;i<n;i++){f.G.time+=1/60;f.projectiles.update(1/60);}}
 // Record both launch and mark from the real installed sub producer.
 owner.remote=false;nm.myId='peer';nm.out.length=0;f.projectiles.throwBomb(owner);
 for(let i=0;i<90&&!nm.out.some(e=>e[1]==='ac'&&e[5]?.phase==='mark');i++)step(1);
 const rows=structuredClone(nm.out),birth=rows.find(e=>e[1]==='ac'&&e[5]?.phase==='spawn'),mark=rows.find(e=>e[1]==='ac'&&e[5]?.phase==='mark');
 assert.ok(birth,'native sub birth');assert.ok(mark,'native contact emits mark');
 f.projectiles.clear();nm.out.length=0;owner.remote=true;nm.myId='me';victim.s3.revealedUntil={};victim.pos.set(500,0,500);
 return {f,nm,owner,victim,deliver,step,birth,mark};
}
for(const id of ['angleShooter','inkMine'])test(`${id}: native contact marks, far target and replay cannot fabricate/extend`,async t=>{
 const x=await setup(t,id),{victim}=x;
 x.deliver([x.birth]);const object=x.f.projectiles._s3SubObjects[0];assert.ok(object?.ghost);
 x.deliver([x.mark]);assert.equal(victim.s3.revealedUntil[1]>x.f.G.time,false,'a valid source birth cannot select a distant victim');
 if(id==='inkMine'){
  const fake=structuredClone(x.birth);fake[5].phase='deploy';fake[5].x=500;fake[5].z=500;x.deliver([fake]);assert.ok(object.pos.length()<.1,'deploy coordinates cannot move the native marking volume');
  victim.pos.set(2,0,0);x.step(40);
 }else{victim.pos.set(0,0,3);x.step(10);}
 assert.ok(victim.s3.revealedUntil[1]>x.f.G.time,'receiver native trigger/contact settles the early valid mark');
 const until=victim.s3.revealedUntil[1];x.deliver([x.mark]);x.step(1);assert.equal(victim.s3.revealedUntil[1],until,'a fresh outer sequence cannot renew the same birth/target life');
});
