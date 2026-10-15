import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export const SOURCE='8413aae6785ae2a8cbbecf075bde9c13e0aed55e4e2a048b93c894c91c3771d9';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const positive=x=>finite(x)&&x>0;
const integer=x=>Number.isSafeInteger(x)&&x>=0;
function base(r){assert.equal(r.id,'shipshape');assert.equal(r.sourceSha256,SOURCE);assert.deepEqual(r.errors,[]);assert.equal(r.cases.length,3);assert.deepEqual(r.cases.map(c=>c.renderHz).sort((a,b)=>a-b),[30,60,120]);for(const c of r.cases){assert.deepEqual(c.physicsIntervals,[1/60]);assert.deepEqual(c.gearAP,[]);}}
export function verifyGameReceipts(ranked,wet){
 assert(Array.isArray(ranked)&&ranked.length===1);const r=ranked[0];base(r);base(wet);assert.equal(r.actors,8);assert.equal(r.bots,7);
 for(const c of r.cases){assert.equal(c.mode,'zones');assert.equal(c.team,1);assert.equal(c.alive,true);assert.equal(c.grounded,true);assert.equal(c.aliveActors,8);assert(positive(c.seconds)&&c.seconds<=90);assert(integer(c.actorTicks)&&c.actorTicks>0);assert(Math.abs(c.actorTicks/60-c.seconds)<1e-9);assert.equal(c.fire,true);assert(positive(c.traversal));assert(integer(c.arrival?.triangle));assert(integer(c.arrival?.face));assert(integer(c.sourceTriangle));assert(Array.isArray(c.end)&&c.end.length===3&&c.end.every(finite));assert(c.goal&&['x','y','z'].every(k=>finite(c.goal[k])));assert(Math.hypot(c.end[0]-c.goal.x,c.end[2]-c.goal.z)<1);assert(Math.abs(c.end[1]-c.goal.y)<.2);
  const m=c.refillMetrics;assert(m&&Object.keys(m).length===5);for(const k of ['drySquidTicks','dryKidTicks','recoveryTicks','maxDrySquidStagnantTicks'])assert(integer(m[k]));assert(m.dryKidTicks>0&&m.recoveryTicks>0&&positive(m.inkGained));assert(m.dryKidTicks+m.drySquidTicks<=c.actorTicks);assert(m.recoveryTicks<=m.dryKidTicks+m.drySquidTicks);assert(m.maxDrySquidStagnantTicks<=m.drySquidTicks);
 }
 for(const c of wet.cases){assert.equal(c.actors,8);assert.equal(c.bots,7);assert(integer(c.preparationSteps)&&c.preparationSteps>0);assert(Array.isArray(c.observations)&&c.observations.length>0);assert(c.observations.every(q=>q.wantsSquid===true&&q.owner===2&&positive(q.ink)&&q.ink<15&&q.phase==='refill'));const supportedKid=q=>q.form==='kid'&&!q.submerged&&q.grounded&&integer(q.block)&&q.block<q.staticBlockCount&&!q.grate&&Array.isArray(q.normal)&&q.normal.length===3&&q.normal.every(finite)&&q.normal[1]>.68&&q.inside&&q.mask&&q.humanFits&&finite(q.stanceDistance)&&q.stanceDistance>=0&&q.stanceDistance<=.2;assert(c.observations.some(supportedKid));const kid=c.observations.findIndex(supportedKid);assert(kid>=0&&c.observations.slice(kid+1).some(q=>q.form==='squid'&&q.submerged));assert(Array.isArray(c.wetRecoveryDeltas)&&c.wetRecoveryDeltas.length>0&&c.wetRecoveryDeltas.every(positive));}
 return {status:'passed',dryCases:3,wetCases:3,scope:'Controlled Game fixed-step behavior only; traversal uses _skipRender. No source-pose, pixel, whole-stage, hardware, relay, Ready or merge qualification.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [r,w]=process.argv.slice(2);console.log(JSON.stringify(verifyGameReceipts(JSON.parse(fs.readFileSync(r)),JSON.parse(fs.readFileSync(w))),null,2));}
