#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {REVIEWED_PAIR,planPrDiffBaseline} from './lib/inkwave-projectile-pr-diff-baseline.mjs';
const arg=n=>{const i=process.argv.indexOf(n);assert(i>=0&&process.argv[i+1],'required '+n);return path.resolve(process.argv[i+1]);};
const baseline=arg('--baseline'),candidate=arg('--candidate'),receipt=arg('--receipt');
assert.notEqual(fs.realpathSync(baseline),fs.realpathSync(candidate),'separate checkouts required');
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
assert.equal(git(baseline,'rev-parse','HEAD'),REVIEWED_PAIR.base,'exact official before checkout');
const candidateHead=git(candidate,'rev-parse','HEAD');
const parents=git(candidate,'cat-file','-p','HEAD').split('\n').filter(x=>x.startsWith('parent ')).map(x=>x.slice(7));
assert(candidateHead===REVIEWED_PAIR.candidate||parents.includes(REVIEWED_PAIR.candidate),'candidate must be reviewed source epoch or its immediate QA successor');
// Manifest paths are validated during the helper import, before any source reads.
for(const row of REVIEWED_PAIR.paths)assert.equal(git(candidate,'rev-parse','HEAD:'+row.path),row.after,row.path+': candidate HEAD tree mismatch');
git(candidate,'diff','--exit-code','HEAD','--',...REVIEWED_PAIR.paths.map(r=>r.path));
const read=root=>new Map(REVIEWED_PAIR.paths.map(r=>[r.path,fs.readFileSync(path.join(root,r.path),'utf8')]));
const planned=planPrDiffBaseline(read(baseline),read(candidate));
assert.equal(git(baseline,'status','--porcelain','--untracked-files=all'),'','before checkout must stay clean, including untracked files');
const evidence={...planned.evidence,actualCandidateHead:candidateHead,baselineTrackedTree:git(baseline,'rev-parse','HEAD^{tree}')};
fs.mkdirSync(path.dirname(receipt),{recursive:true});fs.writeFileSync(receipt,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
