import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath}from'node:url';import {syncBuiltinESMExports}from'node:module';
const raw=fs.readFileSync.bind(fs),write=fs.writeFileSync.bind(fs),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=raw(process.env.QUAL_READ_MAP);if(sha(bytes)!==process.env.QUAL_READ_MAP_SHA)throw Error('Read map drift');const cfg=JSON.parse(bytes),reads=new Map();
fs.readFileSync=function(p,...args){const key=path.resolve(p instanceof URL?fileURLToPath(p):String(p));const b=raw(p);const monitored=key.startsWith(cfg.sourceRoot+'/')||key.startsWith(cfg.siteRoot+'/')||key===cfg.signature;
 if(monitored){if(cfg.lane==='fullsite'&&(key.startsWith(cfg.sourceRoot+'/inkwave-public/')||key.startsWith(cfg.sourceRoot+'/patches/splatoon3/runtime/')))throw Error('Source fallback forbidden: '+key);if(!cfg.hashes[key]||sha(b)!==cfg.hashes[key])throw Error('Unbound actual read: '+key);reads.set(key,sha(b));}
 const encoding=typeof args[0]==='string'?args[0]:args[0]?.encoding;return encoding?b.toString(encoding):b;};syncBuiltinESMExports();
process.on('exit',code=>{write(process.env.QUAL_READ_RECEIPT,JSON.stringify({exitCode:code,lane:cfg.lane,readMapSHA256:sha(bytes),reads:[...reads].map(([path,sha256])=>({path,sha256}))},null,2));});
