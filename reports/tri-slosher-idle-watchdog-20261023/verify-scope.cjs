// Readback of a pre-existing production build. This does not run a fresh build.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const base='4d6166936eaa8058a8b936053992960b510eec88',donor='2d164d063050c15266febcb6af88109938f26701';
const site=process.argv[2]||'/tmp/tri-slosher-main7e-after';
const git=(...args)=>execFileSync('git',args),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const paths=['scripts/check-inkwave-idle-resources.mjs','scripts/tests/inkwave-idle-evaluate-deadline.test.mjs','scripts/tests/inkwave-idle-resources-gates.test.mjs'];
const donorFiles=paths.map(p=>{const b=fs.readFileSync(p),d=git('show',donor+':'+p);assert(b.equals(d),p);return{path:p,donorBlob:git('rev-parse',donor+':'+p).toString().trim(),sha256:sha(b),byteIdentical:true};});
const preserved=['.github/workflows/validate-inkwave-update.yml','scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs','patches/splatoon3/runtime/projectile-presentation.mjs','scripts/check-inkwave-local-references.mjs','scripts/tests/inkwave-local-references.test.mjs'];
const preservedFiles=preserved.map(p=>{const b=fs.readFileSync(p);assert(b.equals(git('show',base+':'+p)),p);return{path:p,blob:git('rev-parse',base+':'+p).toString().trim(),sha256:sha(b),byteUnchanged:true};});
const changed=git('diff',base,'--name-only').toString().trim().split('\n').filter(Boolean).filter(p=>!p.startsWith('reports/'));
for(const p of changed)assert(paths.includes(p),'unrelated change: '+p);
const m=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
assert.equal(m.contentHash,'2042ffbbb14645c4f4a4db2188826b7988c4112dcebab1a14915fd2f72e77a07');
assert.equal(m.inputHash,'578137eac3693d92b6432d17ac9bc4d5e93c6c3a0c943a7a3ed8578625ea09e8');
assert.equal(sha(JSON.stringify(m.files)),m.inputHash);
const inputPaths=new Set();
for(const [k,h]of Object.entries(m.files)){
 const [prefix,...tail]=k.split('/');const root=prefix==='upstream'?'inkwave-public':prefix==='patch'?'patches/splatoon3':prefix==='build-script'?'scripts':'patches/'+prefix;
 const p=path.join(root,...tail);assert.equal(sha(fs.readFileSync(p)),h,p);inputPaths.add(p);
}
for(const [p,h]of Object.entries(m.artifacts))assert.equal(sha(fs.readFileSync(path.join(site,p))),h,p);
assert.equal(sha(fs.readFileSync('scripts/build-inkwave.mjs')),m.build.script);
for(const p of paths)assert(!inputPaths.has(p),'QA path became production input');
assert.equal(Object.keys(m.files).length,1420);assert.equal(Object.keys(m.artifacts).length,2110);
console.log(JSON.stringify({status:'passed',base,donor,donorFiles,preservedFiles,nonReportDelta:paths,build:{freshBuild:false,site,contentHash:m.contentHash,inputHash:m.inputHash,builderSha256:m.build.script,canonicalInputsRead:inputPaths.size,emittedArtifactsRead:Object.keys(m.artifacts).length,allHashesMatch:true,qaChangesOutsideCanonicalInputs:true}},null,2));
