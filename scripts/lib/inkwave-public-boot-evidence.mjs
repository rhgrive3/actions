import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const namespaces = {'upstream/':'inkwave-public/','patch/':'patches/splatoon3/',
  'touch-layout/':'patches/touch-layout/','reliability/':'patches/reliability/',
  'local-quality/':'patches/local-quality/','network-replication/':'patches/network-replication/',
  'loading-cache/':'patches/loading-cache/','practice-range/':'patches/practice-range/',
  'native-stages/':'patches/native-stages/','build-script/':'scripts/'};
const safePath = value => typeof value === 'string' && !value.startsWith('/')
  && !value.split('/').some(part => !part || part === '.' || part === '..' || part.includes('\\'));
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function publicBuildIdentity(manifest) {
  if (!manifest?.files || !manifest.artifacts || !digest(manifest.build?.revision)
    || sha256(JSON.stringify(manifest.files)) !== manifest.inputHash
    || sha256(JSON.stringify(manifest.artifacts)) !== manifest.contentHash)
    throw new Error('Invalid published build identity');
  for (const table of [manifest.files, manifest.artifacts]) {
    if (!Object.keys(table).length) throw new Error('Empty published identity table');
    for (const [file, hash] of Object.entries(table))
      if (!safePath(file) || !digest(hash)) throw new Error('Invalid published identity path/hash: ' + file);
  }
  return {inputHash:manifest.inputHash,contentHash:manifest.contentHash,revision:manifest.build.revision};
}

export function verifyPublishedSource(manifest, root, sourceSha) {
  publicBuildIdentity(manifest);
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('Full published source SHA required');
  const tree = new Map(execFileSync('git',['ls-tree','-r','-z',sourceSha],{cwd:root,encoding:'utf8'})
    .split('\0').filter(Boolean).map(row => {
      const [meta,file]=row.split('\t');return [file,meta.split(' ')[2]];
    }));
  const entries=Object.entries(manifest.files).map(([key,expected]) => {
    const prefix=Object.keys(namespaces).find(prefix=>key.startsWith(prefix));
    if (!prefix) throw new Error('Unknown published source namespace: '+key);
    return {file:namespaces[prefix]+key.slice(prefix.length),expected};
  });
  entries.push({file:'scripts/build-inkwave.mjs',expected:manifest.build.script});
  const blobs=entries.map(({file})=>{const blob=tree.get(file);if(!blob)throw new Error('Published input missing from source: '+file);return blob;});
  const metadata=execFileSync('git',['cat-file','--batch-check'],{cwd:root,encoding:'utf8',input:blobs.join('\n')+'\n',maxBuffer:8*1024*1024}).trimEnd().split('\n');
  if(metadata.length!==blobs.length)throw new Error('Invalid published source metadata');
  const sizes=metadata.map((row,i)=>{
    const [blob,type,text]=row.split(' '),size=Number(text);
    if(blob!==blobs[i]||type!=='blob'||!Number.isSafeInteger(size)||size<0||size>64*1024*1024)
      throw new Error('Invalid published source size');
    return size;
  });
  for(let start=0;start<entries.length;){
    let end=start,total=0;
    do{total+=sizes[end]+100;end++;}while(end<entries.length&&total+sizes[end]+100<=8*1024*1024);
    const bytes=execFileSync('git',['cat-file','--batch'],{cwd:root,input:blobs.slice(start,end).join('\n')+'\n',maxBuffer:total});
    let offset=0;
    for(let i=start;i<end;i++){
      const newline=bytes.indexOf(10,offset);
      if(newline<offset)throw new Error('Truncated published source metadata');
      const [blob,type,text]=bytes.subarray(offset,newline).toString().split(' '),size=Number(text);
      offset=newline+1;
      if(blob!==blobs[i]||type!=='blob'||size!==sizes[i]||offset+size>=bytes.length||bytes[offset+size]!==10)
        throw new Error('Invalid published source body');
      if(sha256(bytes.subarray(offset,offset+size))!==entries[i].expected)
        throw new Error('Published build differs from source SHA: '+entries[i].file);
      offset+=size+1;
    }
    if(offset!==bytes.length)throw new Error('Unexpected published source bytes');
    start=end;
  }
  return {sourceSha,checkedInputs:entries.length};
}

export function verifyPublicResponse(rawUrl, body, manifest, documentUrl) {
  const url=new URL(rawUrl),base=new URL(documentUrl),scope=new URL('.',base).pathname;
  if(url.origin!==base.origin||!url.pathname.startsWith(scope))return null;
  const file=decodeURIComponent(url.pathname.slice(scope.length))||'index.html';
  if(!Object.hasOwn(manifest.artifacts,file))return null;
  const actual=sha256(body);
  if(actual!==manifest.artifacts[file])throw new Error('Published response byte mismatch: '+file);
  return {file,sha256:actual,bytes:body.length};
}
