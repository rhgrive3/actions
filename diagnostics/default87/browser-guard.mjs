import path from 'node:path';import fs from 'node:fs';import crypto from 'node:crypto';import {registerHooks} from 'node:module';import {fileURLToPath} from 'node:url';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),raw=fs.readFileSync.bind(fs),p=process.env.BROWSER_FREEZE;
if(!p||sha(raw(p))!==process.env.BROWSER_FREEZE_SHA256)throw Error('Pinned browser freeze required');
const frozen=raw(p),b=JSON.parse(frozen),files=new Map(b.files.map(r=>[r.path,r.sha256])),reads=[];
function verify(){if(!raw(p).equals(frozen))throw Error('Browser freeze drift');for(const [f,h]of files)if(sha(raw(f))!==h)throw Error('Browser input drift '+f);}
if(!b.driver||!files.has(b.driver)||path.resolve(process.argv[1])!==b.driver)throw Error('Unfrozen browser entrypoint');
verify();registerHooks({load(url,context,next){if(url.startsWith('file:')){const f=fileURLToPath(url);if(f.startsWith(b.sourceRoot+'/')||files.has(f)){const bytes=raw(f);if(!files.has(f)||sha(bytes)!==files.get(f))throw Error('Unbound browser helper '+f);reads.push({path:f,sha256:sha(bytes),bytes:bytes.length});return{format:'module',source:bytes,shortCircuit:true};}}return next(url,context);}});
process.on('exit',()=>{try{verify();fs.writeFileSync(process.env.BROWSER_READ_RECEIPT,JSON.stringify({status:'passed',reads,freezeSHA256:sha(frozen)}));}catch(e){process.exitCode=1;fs.writeFileSync(process.env.BROWSER_READ_RECEIPT,JSON.stringify({status:'failed',error:String(e),reads}));}});
