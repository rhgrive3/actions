import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MAIN_WEAPON_CATALOG } from '../patches/splatoon3/runtime/main-weapon-catalog-data.mjs';
const root=process.argv[2];
if(!root)throw Error('Usage: node scripts/generate-inkwave-weight-reference.mjs <original weapon directory>');
const records=MAIN_WEAPON_CATALOG.records.map(r=>{
 const bytes=fs.readFileSync(path.join(root,path.basename(r.sourcePath)));
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==r.sourceSha256)throw Error('Source hash mismatch '+r.id);
 const setting=JSON.parse(bytes).GameParameters.MainWeaponSetting||{};
 const speed=setting.WeaponSpeedType??'Mid',acceleration=setting.WeaponAccType??'Mid';
 if(!['Fast','Mid','Slow'].includes(speed)||!['Fast','Mid','Slow'].includes(acceleration))throw Error('Unknown weight '+r.id);
 return {id:r.id,sourcePath:r.sourcePath,sourceSha256:r.sourceSha256,speed,acceleration,speedExplicit:Object.hasOwn(setting,'WeaponSpeedType'),accelerationExplicit:Object.hasOwn(setting,'WeaponAccType')};
});
fs.writeFileSync('patches/splatoon3/reference/weapon-weight-1130.json',JSON.stringify({sourceCommit:MAIN_WEAPON_CATALOG.sourceCommit,records},null,2)+'\n');
fs.writeFileSync('patches/splatoon3/runtime/weapon-weight-data.mjs',`// Generated from hash-verified 11.3.0 MainWeaponSetting. See reference/weapon-weight-1130.json.\nexport const WEAPON_WEIGHTS = Object.freeze(Object.fromEntries(${JSON.stringify(records.map(r=>[r.id,r.speed,r.acceleration]))}.map(([id,speed,acceleration])=>[id,Object.freeze({speed,acceleration})])));\n`);
