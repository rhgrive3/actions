import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=new URL('../../',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,root),'utf8');
const manifests=JSON.parse(read('reports/queue-extra-ci-paths-20261025.json'));

test('dedicated CI path filters include every audited direct input, excluding unrelated readmes',()=>{
 const matches=(file,pattern)=>{const escaped=pattern.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*\*/g,'\u0000').replace(/\*/g,'[^/]*').replace(/\u0000/g,'.*');return new RegExp('^'+escaped+'$').test(file);};
 for(const row of manifests){
  const source=read(row.workflow).split('permissions:')[0];
  const events=[...source.matchAll(/^  (?:push|pull_request):\n([\s\S]*?)(?=^  [a-z_]+:|$(?![\s\S]))/gm)];
  assert.ok(events.length,row.workflow);
  for(const event of events){
   const paths=event[1].match(/    paths: (\[[^\n]*\])|    paths:\n((?:      - [^\n]+\n)+)/);
   if(!paths)continue; // An unrestricted push already covers every input.
   const patterns=[...(paths[1]||paths[2]).matchAll(/['"]([^'"]+)['"]/g)].map(x=>x[1]);
   for(const file of row.paths)assert.ok(patterns.some(p=>matches(file,p)),row.workflow+': '+file);
   assert.ok(!patterns.some(p=>matches('docs/unrelated.md',p)),row.workflow);
  }
 }
 assert.equal(manifests.length,13);
});

test('npm tarball key depends on manifests and explicit installed tool versions, not workflow text',()=>{
 const source=read('.github/workflows/validate-inkwave-update.yml');
 const keys=[...source.matchAll(/key: (.*node22-npm[^\n]*)/g)].map(x=>x[1]);assert.equal(keys.length,6);
 for(const key of keys){assert.match(key,/esbuild0282-playwright1621-ws8/);assert.match(key,/hashFiles\('package.json', 'package-lock.json'\)/);assert.doesNotMatch(key,/workflows/);}
 const specs=[...source.matchAll(/npm install[^\n]*/g)].flatMap(x=>x[0].match(/(?:esbuild|playwright|ws)@[\w.]+/g)||[]);
 assert.deepEqual([...new Set(specs)].sort(),['esbuild@0.28.2','playwright@1.62.1','ws@8']);
});

test('roller inner selection includes the audited adapter inputs, preserving conservative missing-diff fallback',()=>{
 const source=read('.github/workflows/inkwave-main-weapons.yml');const inner=source.slice(source.indexOf('Select Roller and shared pose changes'));
 const row=manifests.find(x=>x.workflow.endsWith('/inkwave-main-weapons.yml'));
 for(const input of row.rollerPaths)assert.ok(inner.includes(input),input);
 for(const input of row.paths.filter(x=>!row.rollerPaths.includes(x)))assert.ok(!inner.includes(input),input);
 assert.match(inner,/run=true/);assert.match(inner,/if git fetch/);
});
