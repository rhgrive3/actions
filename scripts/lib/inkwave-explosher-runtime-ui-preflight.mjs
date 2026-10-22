// Separate current-production diagnostic protocol. Historical inverse admission is unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyRuntimeUIProductionPair,RUNTIME_UI_MODE} from './inkwave-runtime-ui-production-epoch.mjs';
import {MAIN26A4_SHA} from './inkwave-main26a4-production-epoch.mjs';
export const PREFLIGHT_MODE='main26a4-runtime-ui-native-preflight-only';
const builder='62d929b83091c6775a865be02c06960a4cc4b2216eb26d5921aa4811787c6d7a';
// Reproducible output identities, not claims that reference builds used a different source HEAD.
// Before identity independently agrees across actual a62 and c364 production-equal builds.
// After identity is from the independently verified published bbc59 build.
const identities=Object.freeze({
 before:{manifest:'8212ef17727097bb0b779a260e896f2c006b937ec5e05da8eb4df63e281ebaf9',input:'eaeedda634324a8e72320e67546a4d3beeb8ae0544b5d32af8cadaa7ac7f10a6',content:'c37e66cd3c6de7b3a1dc2aa73ca6b00d4e0d72d1b16719f62c6cb96d096dd759'},
 after:{manifest:'dfce04a80e98445918fe93c85fe4076ffa49c9a95e78837179d5c72622dd11d8',input:'c846ba6b398a6a9ba740bd1bb95229617bd72d1491ff095439e945b89c3f4087',content:'bddd6573750acf960a7e94b67fc8eedab493833928a743a9f45ee5b336f107e2'}
});
const hash=b=>createHash('sha256').update(b).digest('hex');
const safe=p=>{assert(typeof p==='string'&&p&&!path.isAbsolute(p)&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='.'||x==='..'),'Unsafe path');return p;};
function read(root,p){let f=root;for(const part of safe(p).split('/')){f=path.join(f,part);assert(!fs.lstatSync(f).isSymbolicLink(),'No symlink input/output');}return fs.readFileSync(f);}
function walk(root,at=''){return fs.readdirSync(path.join(root,at),{withFileTypes:true}).flatMap(e=>{assert(!e.isSymbolicLink(),'No output symlinks');const p=path.posix.join(at,e.name);assert(e.isDirectory()||e.isFile(),'Regular output required');return e.isDirectory()?walk(root,p):[p];});}
function inputPath(p){const[k,...a]=safe(p).split('/');assert(a.length);const s=a.join('/');if(k==='upstream')return'inkwave-public/'+s;if(k==='patch')return'patches/splatoon3/'+s;if(k==='build-script')return'scripts/'+s;assert(['touch-layout','reliability','local-quality','network-replication','practice-range','loading-cache','native-stages'].includes(k),'Unknown input namespace');return'patches/'+k+'/'+s;}
export function assertRuntimePreflightEvent(event,env){
 assert.equal(env.EXPLOSHER_RUNTIME_UI_PREFLIGHT,PREFLIGHT_MODE,'Explicit preflight mode required');
 assert.equal(env.GITHUB_EVENT_NAME,'pull_request','Only owned pull_request route');
 assert.equal(env.GITHUB_REPOSITORY,'rhgrive3/actions');
 assert(['opened','synchronize','reopened','ready_for_review'].includes(event.action),'Unsupported event action');
 const pr=event.pull_request;assert(pr&&event.number===1844&&pr.number===1844,'Only reviewed PR1844');
 assert.equal(event.repository?.full_name,'rhgrive3/actions');
 assert.equal(pr.head?.repo?.full_name,'rhgrive3/actions');assert.equal(pr.base?.repo?.full_name,'rhgrive3/actions');
 assert.equal(pr.base.ref,'main');assert.equal(pr.base.sha,MAIN26A4_SHA);
 assert.equal(pr.head.ref,'inkwave/runtime-ui-acceptance-20261022');assert.match(pr.head.sha,/^[0-9a-f]{40}$/);assert.notEqual(pr.head.sha,MAIN26A4_SHA);
 assert.equal(env.EXPLOSHER_PREFLIGHT,'1');
 for(const k of ['EXPLOSHER_VIDEO','EXPLOSHER_EXPECT_PREFLIGHT','EXPLOSHER_ADMIT_BEFORE','EXPLOSHER_ADMIT_AFTER','EXPLOSHER_CONTROLLED_MAIN','EXPLOSHER_SHAPE_OVERLAY'])assert(!env[k],k+': forbidden for untouched current-production diagnostic');
 return {baseSha:MAIN26A4_SHA,candidateSha:pr.head.sha};
}
export function inspectRuntimePreflightBuild({root,site,lane}){
 assert(['before','after'].includes(lane),'Explicit lane required');root=fs.realpathSync(root);site=fs.realpathSync(site);
 const identity=identities[lane],bytes=read(site,'inkwave-build.json');assert.equal(hash(bytes),identity.manifest,'Pinned complete build manifest');const build=JSON.parse(bytes);
 assert.equal(build.schema,1);assert.equal(build.build.esbuild,'0.28.2');assert.equal(build.build.optimization,'esbuild-minify');
 assert.equal(build.build.script,builder);assert.equal(hash(read(root,'scripts/build-inkwave.mjs')),builder,'Pinned actual builder');
 assert.equal(build.inputHash,identity.input);assert.equal(hash(JSON.stringify(build.files)),identity.input);assert.equal(Object.keys(build.files).length,1362);
 assert.equal(build.contentHash,identity.content);assert.equal(hash(JSON.stringify(build.artifacts)),identity.content);assert.equal(Object.keys(build.artifacts).length,2016);
 for(const[p,h]of Object.entries(build.files))assert.equal(hash(read(root,inputPath(p))),h,'Actual build input: '+p);
 const expected=['inkwave-build.json',...Object.keys(build.artifacts)];assert.equal(new Set(expected).size,2017);assert.deepEqual(walk(site).sort(),expected.sort(),'Complete sealed output inventory');
 for(const[p,h]of Object.entries(build.artifacts))assert.equal(hash(read(site,p)),h,'Sealed output: '+p);
 return {buildIdentitySha256:hash(bytes),inputHash:identity.input,contentHash:identity.content,verifiedInputs:1362,verifiedOutputs:2017};
}
export function requireRuntimeUIPreflight({root,site,sourceSha,baseline,candidate,env=process.env}){
 assert(env.GITHUB_EVENT_PATH,'Official event path required');const event=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
 const {baseSha,candidateSha}=assertRuntimePreflightEvent(event,env);
 const options={baseline,candidate,baseSha,candidateSha,mode:RUNTIME_UI_MODE,sourceBase:baseSha,sourceHead:candidateSha};
 const sourceAdmission=verifyRuntimeUIProductionPair(options);
 root=fs.realpathSync(root);const lane=root===fs.realpathSync(baseline)?'before':root===fs.realpathSync(candidate)?'after':null;assert(lane,'Actual source root must be one admitted worktree');
 const head=lane==='before'?baseSha:candidateSha;assert.equal(sourceSha,head,'Caller SHA must match admitted actual lane HEAD');
 const build=inspectRuntimePreflightBuild({root,site,lane});
 assert.deepEqual(verifyRuntimeUIProductionPair(options),sourceAdmission,'Actual pair unchanged during emitted verification');
 return {schema:1,admissionHelperSha256:hash(fs.readFileSync(new URL(import.meta.url))),mode:PREFLIGHT_MODE,diagnosticOnly:true,fullPairAccepted:false,lane,head,tree:sourceAdmission.checkouts[lane==='before'?0:1].tree,sourceAdmission,...build,root,site:fs.realpathSync(site),limitation:'Short initial native-frame diagnostic only. No full flight, visual, resource or gameplay acceptance.'};
}
