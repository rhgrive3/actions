import assert from 'node:assert/strict';
import {semanticSnapshot,compareSemanticSnapshots} from './semantic-identity.mjs';
// Preserve the old whole-condition result; only explicitly inventoried snapshot UUIDs
// receive semantic identities. All loaded resources, gameplay and other state stay strict.
export function compareReplaySemanticCondition(actual,expected){
 let rawEqual=true;try{assert.deepEqual(actual,expected);}catch{rawEqual=false;}
 const observations=[];try{
 const a=structuredClone(actual),b=structuredClone(expected);
 assert.equal(a.renderStates.length,4);assert.equal(b.renderStates.length,4);
 for(let i=0;i<4;i++)for(const phase of ['before','afterRender','after']){
  const q=compareSemanticSnapshots(a.renderStates[i][phase],b.renderStates[i][phase]);
  observations.push({ordinal:i,phase,rawEqual:q.rawEqual,rawIdsEqual:q.rawIdsEqual,semanticEqual:q.semanticEqual,error:q.error?.slice(0,2048)??null});
  assert.equal(q.semanticEqual,true,JSON.stringify(observations.at(-1)));
  a.renderStates[i][phase]=q.before.normalized;b.renderStates[i][phase]=q.after.normalized;
 }
 assert.deepEqual(a,b,'strict non-identity replay history/provenance changed');
 return{rawEqual,rawIdsEqual:observations.every(x=>x.rawIdsEqual),semanticEqual:true,observations};
 }catch(e){return{rawEqual,rawIdsEqual:observations.length===12&&observations.every(x=>x.rawIdsEqual),semanticEqual:false,error:e.message.slice(0,2048),observations};}
}
export function requireReplayIdentityCoverage(e){
 assert.equal(e.renderStates.length,4);const rows=[];
 for(const c of e.renderStates)for(const phase of ['before','afterRender','after']){
  const s=c[phase];assert.equal(s.entryObservation.nativeResources?.schema,1,'native resource provenance missing');
  assert.ok(Array.isArray(s.entryObservation.nodeGraph),'native node graph missing');
  const m=semanticSnapshot(s);rows.push({ordinal:c.captureOrdinal,phase,complete:m.complete,definitions:m.definitions.length,unknown:m.unknown});
 }
 return{complete:rows.every(x=>x.complete),rows};
}
