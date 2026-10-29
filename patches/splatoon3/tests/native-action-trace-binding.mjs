// Fail closed when the selected built site lacks the exact emitted contract.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function selectCanonicalTraceModule(site,override){
 if(!site){if(override)throw Error('emitted canonical module requires a built site');return null;}
 const rel='patches/network-replication/canonical-weapon-actions.mjs',file=path.resolve(site,rel);
 if(override&&path.resolve(override)!==file)throw Error('canonical module is not the selected site artifact');
 const m=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
 if(hash(JSON.stringify(m.artifacts))!==m.contentHash||!m.artifacts[rel]||hash(fs.readFileSync(file))!==m.artifacts[rel])throw Error('canonical emitted artifact identity mismatch');
 return file;
}
export function requireFrozenTrace(serialized,corpus){
 if(serialized!==gunzipSync(fs.readFileSync(corpus)).toString())throw Error('native trace differs from immutable corpus');
}
