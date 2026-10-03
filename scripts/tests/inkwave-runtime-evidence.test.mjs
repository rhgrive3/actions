import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {hash,verifyRuntimeBuild,persistentDirectory,invalidWindows} from '../lib/inkwave-runtime-evidence.mjs';
const root=persistentDirectory('/mnt/workspace/.dev-state/agent-work/scratch/inkwave-runtime-performance-ui-evidence-tests/'+process.pid);
test('benchmark rejects empty/undersampled live windows and incomplete fixed transactions',()=>{
 const scenarios=[{scenario:'battle',runs:[{repeat:0,frames:{n:0},counts:{frame:0}},{repeat:1,frames:{n:1},counts:{frame:29}},{repeat:2,frames:{n:30},counts:{frame:30}}]}];
 assert.equal(invalidWindows(scenarios,false).length,2);assert.equal(invalidWindows(scenarios,true).length,2);
});
test('physical persistent destination is verified before creation',()=>{assert.throws(()=>persistentDirectory('/tmp/inkwave-forbidden'),/Persistent workspace required/);});
test('valid artifacts cannot forge their source SHA by changing a build input',()=>{
 const repo=path.join(root,'repo'),site=path.join(root,'site');fs.mkdirSync(repo,{recursive:true});fs.mkdirSync(site,{recursive:true});
 fs.mkdirSync(path.join(repo,'inkwave-public'),{recursive:true});fs.mkdirSync(path.join(repo,'scripts'),{recursive:true});
 fs.writeFileSync(path.join(repo,'inkwave-public/source.js'),'export const source=1;');fs.writeFileSync(path.join(repo,'scripts/build-inkwave.mjs'),'// builder');
 const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();git('init','--quiet');git('add','.');git('-c','user.name=Runtime test','-c','user.email=runtime-test@example.invalid','commit','--quiet','-m','fixture');const sha=git('rev-parse','HEAD');
 fs.writeFileSync(path.join(site,'source.js'),'export const source=1;');
 const artifacts={'source.js':hash(fs.readFileSync(path.join(site,'source.js')))};
 const m={artifacts,contentHash:hash(JSON.stringify(artifacts)),files:{'upstream/source.js':artifacts['source.js']},build:{script:hash('// builder')}};
 const save=()=>fs.writeFileSync(path.join(site,'inkwave-build.json'),JSON.stringify(m));save();assert.equal(verifyRuntimeBuild(site,repo,sha).contentHash,m.contentHash);
 m.files['upstream/source.js']=hash('forged source');save();assert.throws(()=>verifyRuntimeBuild(site,repo,sha),/Build differs from source SHA/);
});
