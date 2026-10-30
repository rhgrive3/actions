import {test} from 'node:test';
import {specialNativeProducer} from './special-native-producer-fixture.mjs';
test('diagnose native Chump overlap',async t=>{
 const x=await specialNativeProducer(t,'superChump',{frames:400,targetZ:25,randomSeed:Number(process.env.CHUMP_SEED||1),step:x=>{x.attacker.intent.fire=true;},afterStep:x=>{const o=x.f.projectiles._s3AllSpecialObjects?.find(o=>o.kind==='decoy');if(o)x.target.pos.copy(o.target);}});
 const at=x.target.pos.clone(),out=[];
 const malicious=rows=>rows.flatMap(e=>{if(e[5]?.phase!=='objectHit')return[e];const replayed=structuredClone(e);replayed[5].eventSeq+=3000000;return[e,replayed];});
 for(const p of x.packets)out.push(...x.deliver(p,malicious,null,()=>x.target.pos.copy(at)));
 console.log(JSON.stringify({fixtureSeed:Number(process.env.CHUMP_SEED||1),plan:x.events.find(e=>e[5]?.id==='superChump'&&e[5]?.action==='target')?.[5],claims:x.claims.map(e=>e[5]),applied:out.filter(o=>o.damage>0).map(o=>({damage:o.damage,payload:o.event[5]}))}));
});
