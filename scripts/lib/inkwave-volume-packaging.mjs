import fs from 'node:fs';
import path from 'node:path';

function identical(a,b) {
  const left=fs.openSync(a,'r'),right=fs.openSync(b,'r');
  try {
    const size=fs.fstatSync(left).size;
    if(size!==fs.fstatSync(right).size)return false;
    const x=Buffer.allocUnsafe(64*1024),y=Buffer.allocUnsafe(64*1024);
    for(let offset=0;offset<size;offset+=x.length) {
      const count=Math.min(x.length,size-offset);
      if(fs.readSync(left,x,0,count,offset)!==count||fs.readSync(right,y,0,count,offset)!==count||!x.subarray(0,count).equals(y.subarray(0,count)))return false;
    }
    return true;
  } finally {fs.closeSync(left);fs.closeSync(right);}
}
// The public manifest remains a stable entry point. Its binary URL redirects
// resolution to the existing immutable copy; revisioned manifests stay intact.
// No JS, PWA shell, service worker, native asset or arbitrary URL is removed.
export function dedupeVersionedVolumeAssets(build,revision) {
  if(!/^[a-f0-9]{64}$/.test(revision))throw Error('Invalid packaging revision');
  const entries=[];
  for(const slot of ['roller','shooter']) {
    const dir=`patches/local-quality/ink-volume/assets/${slot}`;
    const manifest=path.join(build,dir,'manifest.json');
    const data=JSON.parse(fs.readFileSync(manifest,'utf8'));
    if(data.binary!=='volumes.bin.gz'||data.compression!=='gzip'||data.cacheSlot!==slot)throw Error('Unreviewed volume packaging contract: '+slot);
    const root=path.join(build,dir,data.binary),versioned=path.join(build,'_versions',revision,dir,data.binary);
    if(!identical(root,versioned))throw Error('Versioned volume bytes differ: '+slot);
    entries.push({manifest,root,versioned,data,bytes:fs.statSync(root).size});
  }
  for(const entry of entries) {
    entry.data.binary=path.relative(path.dirname(entry.manifest),entry.versioned).split(path.sep).join('/');
    fs.writeFileSync(entry.manifest,JSON.stringify(entry.data));
    fs.unlinkSync(entry.root);
  }
  return {binaryCopiesRemoved:entries.length,duplicateBytesRemoved:entries.reduce((n,e)=>n+e.bytes,0)};
}
