import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from '../../patches/loading-cache/vendor/acorn.mjs';

assert.ok(process.argv[2], 'Supply the immutable emitted site');
const root=fileURLToPath(new URL('../../',import.meta.url)),site=path.resolve(process.argv[2]);
const file='patches/splatoon3/tests/roller-brush-held-motion.test.mjs';
const before=execFileSync('git',['show','65ad3508a30b26d9264acafc76f6ab9f77a48c1b:'+file],{cwd:root,encoding:'utf8'});
const after=fs.readFileSync(path.join(root,file),'utf8');
const tree=s=>parse(s,{ecmaVersion:'latest',sourceType:'module'});
const bodies=s=>tree(s).body.filter(n=>n.type==='ExpressionStatement'&&n.expression.callee?.name==='test').map(n=>s.slice(n.start,n.end));
assert.equal(bodies(before).length,4);assert.deepEqual(bodies(after),bodies(before));
const helper=tree(after).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='exposeEmittedInspection');
const run=vm.runInNewContext('('+after.slice(helper.start,helper.end)+')',{parse,assert});
const rel='patches/splatoon3/runtime/weapon-models/registry.mjs',raw=fs.readFileSync(path.join(site,rel),'utf8'),exposed=run(rel,raw);
assert.equal(exposed.slice(0,raw.length),raw);
assert.match(exposed.slice(raw.length),/^\nexport \{ [\w$]+ as catalogRollerSwing \};\n$/);
assert.throws(()=>run(rel,raw.replace('catalogRollerSwing:','absentRollerInspection:')),/one actual bundled Roller inspection binding/);
assert.equal(run('unrelated.mjs','export {};'),'export {};');
assert.equal(fs.existsSync(path.join(site,'patches/splatoon3/runtime/weapon-models/rollers.mjs')),false);
console.log(JSON.stringify({originalTestBodies:4,byteIdentical:true,emittedPrefixUnchanged:true,
  onlyAddedSource:exposed.slice(raw.length).trim(),registrySha256:crypto.createHash('sha256').update(raw).digest('hex'),
  missingInspectionFailsClosed:true,standaloneFamilyAbsent:true,sourceFallback:false},null,2));
