import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),bindings={};
for(const name of ['baseline','candidate']){
 const root=path.resolve(process.env[name.toUpperCase()+'_ROOT']),site=path.resolve(process.env[name.toUpperCase()+'_SITE']),head=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),tree=execFileSync('git',['-C',root,'rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),dirty=!!execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim();
 assert.equal(head,process.env[name.toUpperCase()+'_SHA']);assert.equal(dirty,false);if(name==='candidate')assert.equal(tree,process.env.CANDIDATE_TREE);
 const bytes=fs.readFileSync(path.join(site,'inkwave-build.json')),manifest=JSON.parse(bytes);
 for(const [rel,expected]of Object.entries(manifest.artifacts)){assert.ok(!path.isAbsolute(rel)&&!rel.split('/').includes('..'));assert.equal(sha(fs.readFileSync(path.join(site,rel))),expected,rel);}
 bindings[name]={head,tree,dirty,manifestSHA256:sha(bytes),contentHash:manifest.contentHash,inputHash:manifest.inputHash,revision:manifest.build.revision};
}
fs.writeFileSync(process.env.STAGE_PAIR_BINDINGS,JSON.stringify(bindings,null,2)+'\n');
