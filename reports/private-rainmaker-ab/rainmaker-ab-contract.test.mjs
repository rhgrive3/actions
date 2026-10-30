import test from 'node:test';
import assert from 'node:assert/strict';
import {plan,parseTap,compare} from './rainmaker-ab-contract.mjs';
function tap(extreme=false){
 const weapons=extreme?['shooter','roller']:['shooter','roller','dualies'],rows=[];
 for(const weapon of weapons)for(const team of [0,1]){
  rows.push({weapon,team,extremeAim:extreme,sourceReceipt:{requested:true,status:'ready',activeAfterFrame:true},counts:{head:1,chest:1},maxInside:{head:0,chest:0},faceChecks:Array.from({length:extreme?6:4},(_,tick)=>({tick,fishFaces:608,skinFaces:1,intersections:0}))});
  rows.push({weapon,team,ticks:extreme?6:90,handAttachment:true,restored:true,geometryDispose:1,materialDispose:1});
 }
 return rows.map(r=>'# '+JSON.stringify(r)).join('\n')+'\n'+Object.entries({tests:weapons.length,pass:weapons.length,fail:0,cancelled:0,skipped:0,todo:0}).map(([k,v])=>'# '+k+' '+v).join('\n')+'\n';
}
test('both modes retain complete alternating suites',()=>{
 for(const mode of ['source','emitted'])assert.deepEqual(plan(mode),[
 {variant:'old',extreme:false},{variant:'new',extreme:false},{variant:'new',extreme:true},{variant:'old',extreme:true}]);
 assert.throws(()=>plan('stub'));
});
test('normal and extremes require all ordered team and lifecycle receipts',()=>{
 for(const extreme of [false,true]){const x=parseTap(tap(extreme),extreme);compare(x,structuredClone(x));}
});
test('missing duplicate skipped cancelled failed and unready evidence rejects',()=>{
 const original=tap();
 for(const broken of [
 original.replace(/^# \{.*\}\n/m,''),
 original.replace('# tests 3','# tests 4'),
 original.replace('# skipped 0','# skipped 1'),
 original.replace('# cancelled 0','# cancelled 1'),
 original.replace('# fail 0','# fail 1'),
 original.replace('"status":"ready"','"status":"pending"'),
 original.replace('"activeAfterFrame":true','"activeAfterFrame":false'),
 original.replace('"fishFaces":608','"fishFaces":456'),
 original.replace('"ticks":90','"ticks":89'),
 original.replace('"intersections":0','"intersections":1'),
 original.replace('"team":1','"team":0'),
 original+'# pass 3\n',
 ])assert.throws(()=>parseTap(broken,false));
});
test('any detailed receipt or ordering difference rejects',()=>{
 const a=parseTap(tap(),false),b=structuredClone(a);b[0].minConvexPlaneValue={head:1,chest:1};
 assert.throws(()=>compare(a,b));
 assert.throws(()=>compare(a,[...a].reverse()));
});
