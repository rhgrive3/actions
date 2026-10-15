import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {validateBuildBinding,validateDelivered,REQUIRED,REGISTRY} from './build-binding.mjs';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function fixture(){const revision='a'.repeat(64),sources={'scripts/build-inkwave.mjs':'builder','inkwave-public/src/game.js':'game','patches/splatoon3/runtime/weapon-models/variants-dapple-noct-followup.mjs':'noct','patches/splatoon3/runtime/weapon-models/stringers.mjs':'milk'},site={};const files={'upstream/src/game.js':hash('game'),'patch/runtime/weapon-models/variants-dapple-noct-followup.mjs':hash('noct'),'patch/runtime/weapon-models/stringers.mjs':hash('milk')};for(const p of REQUIRED){site[p]='built '+p;site['_versions/'+revision+'/'+p]=site[p];}const artifacts=Object.fromEntries(Object.entries(site).map(([k,v])=>[k,hash(v)]));const manifest={build:{revision,script:hash('builder')},files,artifacts,inputHash:hash(JSON.stringify(files)),contentHash:hash(JSON.stringify(artifacts))};const plan={payload:Object.entries(sources).filter(([k])=>k.startsWith('patches/')).map(([path,body])=>({path,sha256:hash(body)})),registrySHA256:artifacts[REGISTRY]};return {manifest,plan,sources,site,run(){return validateBuildBinding(manifest,plan,p=>sources[p],p=>site[p],hash);}};}
test('exact source graph and versioned registry accepted; all deliveries required',()=>{const f=fixture();f.run();validateDelivered(f.manifest.artifacts,f.manifest);});
for(const [name,mutate] of [
 ['foreign source runtime',f=>{f.sources['inkwave-public/src/game.js']='foreign';}],
 ['missing Noct input',f=>{delete f.manifest.files['patch/runtime/weapon-models/variants-dapple-noct-followup.mjs'];f.manifest.inputHash=hash(JSON.stringify(f.manifest.files));}],
 ['missing MILK input',f=>{delete f.manifest.files['patch/runtime/weapon-models/stringers.mjs'];f.manifest.inputHash=hash(JSON.stringify(f.manifest.files));}],
 ['foreign self-consistent registry',f=>{for(const k of Object.keys(f.site).filter(k=>k.endsWith(REGISTRY))){f.site[k]='foreign';f.manifest.artifacts[k]=hash('foreign');}f.manifest.contentHash=hash(JSON.stringify(f.manifest.artifacts));}],
 ['invalid content revision',f=>{f.manifest.build.revision='b'.repeat(64);}],
 ['changed builder',f=>{f.sources['scripts/build-inkwave.mjs']='changed';}],
 ['unknown input namespace',f=>{f.manifest.files['foreign/x']=hash('x');f.manifest.inputHash=hash(JSON.stringify(f.manifest.files));}],
 ['changed delivered bytes',f=>{f.site[REGISTRY]='changed';}]
])test('rejects '+name,()=>{const f=fixture();mutate(f);assert.throws(()=>f.run());});
test('missing or incorrect required actual runtime delivery fails',()=>{const f=fixture();assert.throws(()=>validateDelivered({},f.manifest));assert.throws(()=>validateDelivered({...f.manifest.artifacts,[REGISTRY]:hash('foreign')},f.manifest));});
