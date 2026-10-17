import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const base='d5265f73d9dad69f1afd9690e374caee45195f11';
const allowed=new Set([
 'patches/local-quality/adapter.mjs','patches/local-quality/headgear-adapter.mjs','scripts/lib/inkwave-build-only-modules.mjs',
 'patches/local-quality/headgear/armor-helmet.js','patches/local-quality/headgear/two-line-mesh.js','patches/local-quality/headgear/camo-headphones.js','patches/local-quality/headgear/character-headgear-ink-black-flap-cap.js','patches/local-quality/headgear/catalog.mjs','patches/local-quality/headgear/lifecycle.mjs',
 'patches/local-quality/tests/material-handoff.test.mjs',
 'patches/local-quality/tests/headgear-production-loader.mjs','patches/local-quality/tests/headgear-lifecycle.fixture.mjs',
]);
const git=(...args)=>execFileSync('git',args);
const changed=git('diff','--name-only',base,'HEAD','--','inkwave-public','patches','scripts').toString().trim().split('\n').filter(Boolean);
for(const path of changed)assert(allowed.has(path),'unapproved native source change: '+path);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=changed.map(path=>{let original=null;try{original=hash(git('show',base+':'+path));}catch{}return{path,originalSha256:original,stagedSha256:hash(fs.readFileSync(path))};});
fs.mkdirSync('.qa-evidence',{recursive:true});fs.writeFileSync('.qa-evidence/headgear-scope.json',JSON.stringify({base,head:git('rev-parse','HEAD').toString().trim(),upstreamUnchanged:true,mode:'production candidate; adoption pending visual and lifecycle acceptance',files},null,2));
console.log('Approved headgear-only native scope:',files.length,'files; upstream unchanged');
