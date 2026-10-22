import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {MAINA350_PAINT_SOURCE_PAIR as pair,MAINA350_PAINT_PATHS as paths,MAINE1F_PAINT_SOURCE_PAIR,MAIN_INK_BASELINE_PATHS,planMainInkBaseline,gitBlobSha1} from '../lib/inkwave-main-ink-baseline.mjs';
import {e1fPaintEpochSource} from './fixtures/inkwave-paint-e1f-sources.mjs';
const archive=fs.readFileSync(new URL('../fixtures/inkwave-paint-a350-sources.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(archive).digest('hex'),'1fe19496e3b749a404bf98ac66bece80b4d33f0cee7eedcbc2db1562652b25b0');
const fixture=JSON.parse(gunzipSync(archive));assert.equal(fixture.schema,1);assert.equal(fixture.commit,pair.sourceBase);
for(const row of Object.values(fixture.paths))assert.equal(gitBlobSha1(row.content),row.gitBlob);
const old=new Map(MAIN_INK_BASELINE_PATHS.map(p=>[p,e1fPaintEpochSource(p)]));
const current=new Map(paths.map(p=>[p,fixture.paths[p]?.content??old.get(p)]));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'a350-source-admission-'));
after(()=>fs.rmSync(root,{recursive:true,force:true}));
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function repo(name){const dir=path.join(root,name);fs.mkdirSync(dir);for(const[p,v]of [...current,['patches/splatoon3/profile.json',fs.readFileSync(new URL('../../patches/splatoon3/profile.json',import.meta.url),'utf8')]]){const f=path.join(dir,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,v);}git(dir,'init','-q');git(dir,'add','.');git(dir,'-c','user.name=QA','-c','user.email=qa@example.invalid','-c','commit.gpgsign=false','commit','-qm',name);return {dir,sha:git(dir,'rev-parse','HEAD')};}
// Real local Git snapshots, not official published commit identities.
const left=repo('left'),right=repo('right'),receipt=path.join(root,'receipt.json');
const flags=['--expected-mode',pair.mode,'--expected-source-base',pair.sourceBase,'--expected-source-head',pair.sourceHead];
function run(script='prepare-inkwave-projectile-baseline.mjs',extras=flags){return spawnSync(process.execPath,[fileURLToPath(new URL('../'+script,import.meta.url)),'--baseline',left.dir,'--candidate',right.dir,'--base-sha',left.sha,'--candidate-sha',right.sha,'--receipt',receipt,...extras],{encoding:'utf8'});}
test('a350 adds an immutable dependency without repinning historical epochs',()=>{assert.equal(paths.length,14);assert.equal(MAIN_INK_BASELINE_PATHS.length,13);assert.equal(planMainInkBaseline(old,old,MAINE1F_PAINT_SOURCE_PAIR).evidence.paths.length,13);const p=planMainInkBaseline(current,current,pair);assert.equal(p.evidence.paths.length,14);assert.deepEqual(p.changes,[]);assert.deepEqual([...p.sources],[...current]);assert.throws(()=>planMainInkBaseline(current,current),/explicitly requested comparison epoch/);assert.throws(()=>planMainInkBaseline(current,current,MAINE1F_PAINT_SOURCE_PAIR),/differs from declared maine1f/);assert.throws(()=>planMainInkBaseline(old,old,pair),/differs from declared maina350/);});
test('84 one-sided and equal-sided missing or changed leaves reject',()=>{let count=0;for(const p of paths)for(const sides of [[0],[1],[0,1]])for(const missing of [false,true]){const maps=[new Map(current),new Map(current)];for(const i of sides)missing?maps[i].delete(p):maps[i].set(p,maps[i].get(p)+' ');assert.throws(()=>planMainInkBaseline(...maps,pair),/differs from declared maina350/);count++;}assert.equal(count,84);});
test('real Git CLI positive preserves every byte and produces no replay',()=>{const r=run();assert.equal(r.status,0,r.stderr);const e=JSON.parse(fs.readFileSync(receipt));assert.equal(e.mode,pair.mode);assert.equal(e.declaredSources.paths.length,14);assert.deepEqual(e.writtenPaths,[]);assert.deepEqual(e.changes,[]);for(const side of [left,right])for(const[p,v]of current)assert.equal(fs.readFileSync(path.join(side.dir,p),'utf8'),v);});
test('dependency dirty bytes and false declarations preserve receipt',()=>{const dep=path.join(right.dir,paths.at(-1));for(const flags2 of [[],flags.slice(0,2),['--expected-mode',pair.mode,'--expected-source-base','f'.repeat(40),'--expected-source-head',pair.sourceHead]]){fs.writeFileSync(receipt,'sentinel');const r=run(undefined,flags2);assert.equal(r.status,1,r.stderr);assert.equal(fs.readFileSync(receipt,'utf8'),'sentinel');}fs.appendFileSync(dep,' ');try{fs.writeFileSync(receipt,'sentinel');const r=run();assert.equal(r.status,1);assert.match(r.stderr,/working source differs from declared immutable Git blob/);assert.equal(fs.readFileSync(receipt,'utf8'),'sentinel');}finally{fs.writeFileSync(dep,current.get(paths.at(-1)));}});
test('actual controls execute positives and 57 CLI plus 28 helper rejections',()=>{const r=run('check-inkwave-current-pair-controls.mjs');assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(fs.readFileSync(receipt)).counts,{positiveCli:2,cliRejected:57,helperRejected:28});});
