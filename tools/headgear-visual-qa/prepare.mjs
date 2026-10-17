import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {transform} from 'esbuild';
const dir=path.dirname(fileURLToPath(import.meta.url));
const [site,readable]=process.argv.slice(2);if(!site||!readable)throw Error('Usage: prepare.mjs production-site adapted-unminified-site');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const initialManifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
if(initialManifest.qa)throw Error('Refuse restaging diagnostic site: rebuild clean baseline first');
for(const [file,digest] of Object.entries(initialManifest.artifacts))if(hash(fs.readFileSync(path.join(site,file)))!==digest)throw Error('Baseline artifact changed: '+file);
const geo='src/game/character-geo.js',before=fs.readFileSync(path.join(readable,geo),'utf8');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Diagnostic anchor count: '+a);return s.replace(a,b);}
let staged=once(before,'if (hatCtx) buildHat(B, hat, hatCtx, D);','if (hatCtx && !hat.qaSeparateAttachment) buildHat(B, hat, hatCtx, D);');
staged=once(staged,"return { geo: B.build('aTint', 'aHair'), rest, meta, name: style.name, hat: hat.name, lod: D.lod, dropped:","return { hatContext: hatCtx, geo: B.build('aTint', 'aHair'), rest, meta, name: style.name, hat: hat.name, lod: D.lod, dropped:");
const productionBefore=fs.readFileSync(path.join(site,geo));
const code=(await transform(staged,{format:'esm',minify:true,target:'es2022'})).code;
fs.writeFileSync(path.join(site,geo),code);
const copied=[];for(const name of fs.readdirSync(path.join(dir,'assets'))){let c=fs.readFileSync(path.join(dir,'assets',name),'utf8');c=c.replaceAll("'../character-face.js'","'./character-face.js'");fs.writeFileSync(path.join(site,'src/game',name),c);copied.push({file:name,sha256:hash(c)});}
fs.copyFileSync(path.join(dir,'registry.mjs'),path.join(site,'src/game/headgear-qa-registry.mjs'));
const receipt={baseSha:'d5265f73d9dad69f1afd9690e374caee45195f11',mode:'diagnostic staging only; no source or production adoption',characterGeo:{adaptedOriginalSha256:hash(before),productionOriginalSha256:hash(productionBefore),stagedSha256:hash(code)},rendererUnchanged:true,baselineRendererSha256:initialManifest.artifacts['vendor/three/build/three.module.js'],rendererSha256:hash(fs.readFileSync(path.join(site,'vendor/three/build/three.module.js'))),copied};
fs.writeFileSync(path.join(site,'headgear-qa-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
// A separate manifest identifies diagnostic staged bytes; original build receipt is retained.
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
fs.writeFileSync(path.join(site,'headgear-qa-baseline-build.json'),JSON.stringify(manifest,null,2));
const oldPrefix='_versions/'+manifest.build.revision+'/',newRevision='headgear-qa-'+hash(JSON.stringify(receipt)).slice(0,24),newPrefix='_versions/'+newRevision+'/';
fs.cpSync(path.join(site,oldPrefix),path.join(site,newPrefix),{recursive:true});
const changed=[geo,...copied.map(x=>'src/game/'+x.file),'src/game/headgear-qa-registry.mjs'];
for(const f of changed)fs.copyFileSync(path.join(site,f),path.join(site,newPrefix,f));
const artifacts={};for(const [f,d] of Object.entries(manifest.artifacts)){const key=f.startsWith(oldPrefix)?newPrefix+f.slice(oldPrefix.length):f;artifacts[key]=hash(fs.readFileSync(path.join(site,key)));}
for(const f of changed){artifacts[f]=hash(fs.readFileSync(path.join(site,f)));artifacts[newPrefix+f]=hash(fs.readFileSync(path.join(site,newPrefix,f)));}
const sorted=Object.fromEntries(Object.entries(artifacts).sort(([a],[b])=>a.localeCompare(b)));
manifest.qa={mode:'diagnostic attachment only',baselineRevision:manifest.build.revision,baseSha:receipt.baseSha,receipt:'headgear-qa-receipt.json'};
manifest.build.revision=newRevision;manifest.artifacts=sorted;manifest.contentHash=hash(JSON.stringify(sorted));
fs.writeFileSync(path.join(site,'inkwave-build.json'),JSON.stringify(manifest,null,2));
