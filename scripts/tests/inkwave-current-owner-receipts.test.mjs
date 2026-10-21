// Historical 0dec529d source replay; latest PR sources use the separate reviewed-pair gate.
import {historicalSource} from '../lib/inkwave-historical-baseline-sources.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync}from 'node:child_process';import {fileURLToPath}from 'node:url';
import {MAIN_INK_BASELINE_PATHS}from '../lib/inkwave-main-ink-baseline.mjs';import {CHARACTER_POSE_PATHS}from '../lib/inkwave-character-pose-baseline.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
for(const [runner,paths,mode]of [['prepare-inkwave-projectile-baseline.mjs',MAIN_INK_BASELINE_PATHS,'unchanged-current-owner-identity'],['prepare-inkwave-character-pose-baseline.mjs',CHARACTER_POSE_PATHS,'unchanged-current-pose-identity']])test(runner+' records current identities and zero runtime writes',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'current-owner-receipt-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const before=path.join(temp,'before'),after=path.join(temp,'after'),receipt=path.join(temp,'receipt.json');const originals=new Map();
 for(const rel of paths){const s=historicalSource(runner.includes('character-pose')?'pose':'paint',rel);originals.set(rel,s);for(const dir of [before,after]){const p=path.join(dir,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);}}
 const profile={weaponsFidelityCompletion:{weapons:{roller:{WideSwingUnitGroupParam:[{}],VerticalSwingUnitGroupParam:[{}]}}}};
 for(const dir of [before,after]){const p=path.join(dir,'patches/splatoon3/profile.json');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(profile));}
 const run=spawnSync(process.execPath,[path.join(root,'scripts',runner),'--baseline',before,'--candidate',after,'--receipt',receipt],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 const r=JSON.parse(fs.readFileSync(receipt,'utf8'));assert.equal(r.mode,mode);assert.deepEqual(r.writtenPaths,[]);assert.match(r.scope,/identical reviewed current/);assert.match(r.scope,/no .*replay/);
 if(r.paint){assert.equal(r.paint.sourceBase,undefined);assert.ok(r.paint.historicalReplaySourceBase);assert.ok(r.currentOwnerPaths.length===4);assert.match(r.limitation,/Physical, claimed-area and paint-coverage comparisons remain enabled/);}else{assert.equal(r.sourceBase,undefined);assert.ok(r.historicalReplaySourceBase);}
 for(const[rel,s]of originals)for(const dir of[before,after])assert.equal(fs.readFileSync(path.join(dir,rel),'utf8'),s,rel+' unchanged');
});
