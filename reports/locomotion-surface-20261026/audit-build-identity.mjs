import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const ROOT=process.cwd(),site=path.resolve(process.argv[2]||'_site');process.argv.push('--exact-source');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
if(hash(JSON.stringify(manifest.artifacts))!==manifest.contentHash) throw new Error('Build identity mismatch');
for(const [file,expected] of Object.entries(manifest.artifacts)) if(hash(fs.readFileSync(path.join(site,file)))!==expected) throw new Error('Artifact mismatch: '+file);
const sourceSha=process.argv.includes('--exact-source') ? execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim() : null;
// Bind every build input to the actual checkout commit when --exact-source is used.
if(process.argv.includes('--exact-source')) {
  const tree=new Map(execFileSync('git',['ls-tree','-r','-z',sourceSha],{cwd:ROOT,encoding:'utf8'}).split('\0').filter(Boolean).map(row=>{ const [meta,file]=row.split('\t'); return [file,meta.split(' ')[2]]; }));
  const files=Object.keys(manifest.files).map(key=>{
    if(key.startsWith('upstream/')) return 'inkwave-public/'+key.slice(9);
    if(key.startsWith('patch/')) return 'patches/splatoon3/'+key.slice(6);
    if(key.startsWith('touch-layout/')) return 'patches/touch-layout/'+key.slice(13);
    if(key.startsWith('reliability/')) return 'patches/reliability/'+key.slice(12);
    if(key.startsWith('local-quality/')) return 'patches/local-quality/'+key.slice(14);
    if(key.startsWith('network-replication/')) return 'patches/network-replication/'+key.slice(20);
    if(key.startsWith('loading-cache/')) return 'patches/loading-cache/'+key.slice(14);
    if(key.startsWith('practice-range/')) return 'patches/practice-range/'+key.slice(15);
    if(key.startsWith('native-stages/')) return 'patches/native-stages/'+key.slice(14);
    if(key.startsWith('build-script/')) return 'scripts/'+key.slice(13);
    throw new Error('Unknown build input namespace: '+key);
  });
  Object.entries(manifest.files).forEach(([key,expected],i)=>{if(hash(fs.readFileSync(path.join(ROOT,files[i])))!==expected)throw new Error('Build input differs from manifest: '+key);});
  if(hash(fs.readFileSync(path.join(ROOT,'scripts/build-inkwave.mjs')))!==manifest.build.script)throw new Error('Build pipeline mismatch');
  files.push('scripts/build-inkwave.mjs');
  const blobs=execFileSync('git',['hash-object','--',...files],{cwd:ROOT,encoding:'utf8'}).trim().split('\n');
  files.forEach((file,i)=>{if(blobs[i]!==tree.get(file))throw new Error('Build input differs from commit: '+file);});
}

const result={sourceSha,contentHash:manifest.contentHash,inputHash:manifest.inputHash,sourceInputs:Object.keys(manifest.files).length+1,artifacts:Object.keys(manifest.artifacts).length,mismatches:0};console.log(JSON.stringify(result));
