import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// One immutable verification run stores digests and metadata, never large
// asset bodies. Every authority still compares its own expected hash/length.
export function createArtifactDigests(root) {
  const cache=new Map(), base=path.resolve(root);
  return relative=>{
    const file=path.resolve(base,relative);
    if(file!==base && !file.startsWith(base+path.sep)) throw Error('Artifact path escapes site: '+relative);
    const stat=fs.statSync(file,{bigint:true});
    const signature=[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
    const old=cache.get(file);
    if(old) {
      if(old.signature!==signature) throw Error('Artifact changed during verification: '+relative);
      return old;
    }
    const bytes=fs.readFileSync(file);
    const after=fs.statSync(file,{bigint:true});
    if([after.dev,after.ino,after.size,after.mtimeNs,after.ctimeNs].join(':')!==signature)
      throw Error('Artifact changed while hashing: '+relative);
    const entry={signature,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
    cache.set(file,entry);return entry;
  };
}
