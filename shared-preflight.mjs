import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import{fileURLToPath,pathToFileURL}from'node:url';
export function validateSharedPlans(plans){
 assert.equal(plans.length,3,'three independently reviewed lanes');
 for(const plan of plans){assert.equal(plan.head,'fbdcacb690ec5c9abd10e14d6b623a6f4206aab0');assert.equal(plan.tree,'fd4f25b5277550c81b8108caa7460a2f217946c5');assert.equal(plan.registrySHA256,'d9b7ed3cb89a7ac28839631bf2fe85b5924bd3769438854abf57d6edc499b4fa');}
 return true;
}
export const TARGETS={forge:['Shooter_Expert_01','Shooter_QuickLong_01'],jet:['Shooter_Long_01'],ranged:['Maneuver_Gallon_01','Maneuver_Normal_02','Shelter_Compact_01','Spinner_Downpour_01','Spinner_HyperShort_01','Spinner_Standard_01']};
export function validateLaneScope(id,frames){assert.ok(Object.hasOwn(TARGETS,id));assert.equal(frames.length,{forge:16,jet:8,ranged:48}[id]);assert.deepEqual([...new Set(frames.map(f=>f.rowId))].sort(),[...TARGETS[id]].sort());return true;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const root=path.dirname(fileURLToPath(import.meta.url)),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 for(const f of pkg.files){assert.ok(!f.path.startsWith('/')&&!f.path.split('/').includes('..'));assert.equal(hash(fs.readFileSync(path.join(root,f.path))),f.sha256,f.path);}
 validateSharedPlans(['forge','jet','ranged'].map(id=>JSON.parse(fs.readFileSync(path.join(root,id,'acceptance-plan.json')))));
 for(const id of Object.keys(TARGETS))validateLaneScope(id,JSON.parse(fs.readFileSync(path.join(root,id,'source-frames.json'))));
 console.log('All three frozen lanes share the exact checkout and reviewed emitted registry.');
}
