// Read-only GitHub job-log decoder. No Buffer/URL/atob/crypto required.
function sha256Bytes(input){const bytes=Array.from(input), bitlen=bytes.length*8;bytes.push(128);while(bytes.length%64!==56)bytes.push(0);for(let i=7;i>=0;i--)bytes.push(Math.floor(bitlen/2**(i*8))&255);const primes=[];for(let n=2;primes.length<64;n++){let prime=true;for(let j=2;j*j<=n;j++)if(n%j===0){prime=false;break;}if(prime)primes.push(n);}const frac=x=>(x-Math.floor(x))*2**32|0;let h=primes.slice(0,8).map(n=>frac(Math.sqrt(n))),k=primes.map(n=>frac(Math.cbrt(n)));const r=(x,n)=>(x>>>n)|(x<<(32-n));for(let offset=0;offset<bytes.length;offset+=64){let w=[];for(let i=0;i<16;i++)w[i]=(bytes[offset+i*4]<<24)|(bytes[offset+i*4+1]<<16)|(bytes[offset+i*4+2]<<8)|bytes[offset+i*4+3];for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(r(x,7)^r(x,18)^(x>>>3))+w[i-7]+(r(y,17)^r(y,19)^(y>>>10)))|0;}let [a,b,c,d,e,f,g,z]=h;for(let i=0;i<64;i++){const t1=(z+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0,t2=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))|0;z=g;g=f;f=e;e=d+t1|0;d=c;c=b;b=a;a=t1+t2|0;}h=h.map((v,i)=>(v+[a,b,c,d,e,f,g,z][i])|0);}return h.map(x=>(x>>>0).toString(16).padStart(8,"0")).join("");}

const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decodeBase64(s){
 if(typeof s!=='string'||s.length%4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw Error('invalid base64');
 const a=[];for(let i=0;i<s.length;i+=4){const x=B64.indexOf(s[i]),y=B64.indexOf(s[i+1]),z=s[i+2]==='='?0:B64.indexOf(s[i+2]),w=s[i+3]==='='?0:B64.indexOf(s[i+3]);if(s[i+2]==='='&&(y&15)||s[i+3]==='='&&s[i+2]!=='='&&(z&3))throw Error('noncanonical base64');a.push((x<<2)|(y>>4));if(s[i+2]!=='=')a.push(((y&15)<<4)|(z>>2));if(s[i+3]!=='=')a.push(((z&3)<<6)|w);}return a;
}
function decodeUTF8(a){
 let s='';for(let i=0;i<a.length;){const x=a[i++];if(x<128){s+=String.fromCharCode(x);continue}let n,min,c;if(x>=194&&x<=223){n=1;min=128;c=x&31}else if(x>=224&&x<=239){n=2;min=2048;c=x&15}else if(x>=240&&x<=244){n=3;min=65536;c=x&7}else throw Error('invalid UTF8');while(n--){const b=a[i++];if(!(b>=128&&b<=191))throw Error('invalid UTF8 continuation');c=(c<<6)|(b&63)}if(c<min||c>1114111||c>=55296&&c<=57343)throw Error('invalid UTF8 point');s+=String.fromCodePoint(c)}return s;
}
const pngNames=[0,3,9].flatMap(frame=>['alpha1','alpha092'].map(alpha=>'blast-only-F'+String(frame).padStart(2,'0')+'-'+alpha+'.png'));
const jsonNames=['paired-receipt.json','provenance.json','artifact-verification.json'];
const key=f=>f.variant+'/'+f.name;
function must(v,m){if(!v)throw Error(m)}
function expectedFiles(shard){return [...jsonNames,...pngNames.slice(shard*2,shard*2+2)].map(name=>key({variant:'candidate',name}));}
function decodePairedShard(log,expected){
 const {qaHead,runId,runAttempt,shard,exporterSHA256}=expected;
 must(/^[a-f0-9]{64}$/.test(exporterSHA256||''),'expected code SHA');
 must(/^[a-f0-9]{40}$/.test(qaHead),'expected head');must(typeof runId==='string'&&/^\d+$/.test(runId),'expected run');must(typeof runAttempt==='string'&&/^\d+$/.test(runAttempt),'expected attempt');must(Number.isInteger(shard)&&shard>=0&&shard<3,'expected shard');
 must(typeof log==='string'&&log.length<=24*1024*1024,'bounded log');
 const lines=log.split(/\r?\n/),rows=[];
 for(const line of lines){const at=line.indexOf('BLAST_PAIRED_V1 {');if(at<0)continue;const before=line.slice(0,at);must(before===''||/^\d{4}-\d\d-\d\dT[0-9:.]+Z\s+$/.test(before),'unexpected log prefix');rows.push(JSON.parse(line.slice(at+'BLAST_PAIRED_V1 '.length)));}
 const begin=rows.shift();must(begin?.kind==='begin','missing begin');for(const [k,v]of Object.entries({qaHead,runId,runAttempt,exporterSHA256,shard,shards:3,encoding:'base64',chunkChars:16384,pngCount:2}))must(begin[k]===v,'begin '+k);
 const expectedKeys=expectedFiles(shard);must(begin.fileCount===expectedKeys.length,'file count');
 must(Number.isSafeInteger(begin.totalBytes)&&begin.totalBytes>=0&&begin.totalBytes<=8*1024*1024,'job bytes');must(Number.isSafeInteger(begin.allEvidenceBytes)&&begin.allEvidenceBytes<=32*1024*1024&&begin.allEvidenceBytes>=begin.totalBytes,'all bytes');
 const files=[];let total=0,i=0;
 for(const wanted of expectedKeys){
 const f=rows[i++];must(f?.kind==='file'&&key(f)===wanted,'file order/name');must(Number.isSafeInteger(f.length)&&f.length>=0&&f.length<=8*1024*1024,'file length');must(/^[a-f0-9]{64}$/.test(f.sha256),'file sha');must(f.chunks===Math.ceil(Math.ceil(f.length/3)*4/16384),'chunk count');
 let base64='';for(let j=0;j<f.chunks;j++){const c=rows[i++];must(c?.kind==='chunk'&&key(c)===wanted&&c.index===j,'chunk order/identity');must(typeof c.data==='string'&&c.data.length>0&&c.data.length<=16384&&(j===f.chunks-1||c.data.length===16384),'chunk size');base64+=c.data}
 const end=rows[i++];must(end?.kind==='file-end'&&key(end)===wanted&&end.sha256===f.sha256&&end.chunks===f.chunks,'file end');
 const bytes=decodeBase64(base64);must(bytes.length===f.length,'decoded length');must(sha256Bytes(bytes)===f.sha256,'decoded sha');
 let json,dimensions;if(f.name.endsWith('.png')){must(bytes.length>24&&[137,80,78,71,13,10,26,10].every((v,j)=>bytes[j]===v),'PNG signature');const u32=o=>bytes[o]*16777216+bytes[o+1]*65536+bytes[o+2]*256+bytes[o+3];must(u32(8)===13&&String.fromCharCode(...bytes.slice(12,16))==='IHDR','PNG IHDR');dimensions=[u32(16),u32(20)];must(dimensions.every(v=>Number.isSafeInteger(v)&&v>0&&v<=16384),'bounded PNG dimensions')}else json=JSON.parse(decodeUTF8(bytes));
 files.push({...f,base64,json,dimensions});total+=bytes.length;
 }
 const complete=rows[i++];must(complete?.kind==='complete','missing complete');for(const [k,v]of Object.entries({shard,shards:3,fileCount:files.length,pngCount:2,totalBytes:total}))must(complete[k]===v,'complete '+k);must(begin.totalBytes===total,'begin total');
 must(i===rows.length,'unexpected/duplicate trailing record');
 must(begin.scope==='same-scene same-frame candidate-only alpha sensitivity; original PNG bytes; no separate-build or visual acceptance','paired scope');
 return {begin,files};
}
function assemblePairedShards(shards,expected){
 must(Array.isArray(shards)&&shards.length===3,'all 3 shards required');
 const seen=new Set(),files=new Map();let total=0;
 for(const s of shards){
  for(const k of ['qaHead','runId','runAttempt','exporterSHA256'])must(s.begin[k]===expected[k],'mixed '+k);
  must(Number.isInteger(s.begin.shard)&&s.begin.shard>=0&&s.begin.shard<3&&!seen.has(s.begin.shard),'duplicate or invalid shard');seen.add(s.begin.shard);
  must(s.begin.allEvidenceBytes===shards[0].begin.allEvidenceBytes,'mixed total');
  must(s.files.length===5,'shard files');const names=expectedFiles(s.begin.shard);
  for(let i=0;i<s.files.length;i++){
   const f=s.files[i];must(key(f)===names[i],'shard file identity');
   if(files.has(key(f))){const old=files.get(key(f));must(jsonNames.includes(f.name)&&old.sha256===f.sha256&&old.length===f.length&&old.base64===f.base64,'duplicate or conflicting file');}
   else {files.set(key(f),f);total+=f.length;}
  }
 }
 must(seen.size===3&&files.size===9&&total===shards[0].begin.allEvidenceBytes,'complete unique manifest totals');
 const get=n=>files.get('candidate/'+n).json;
 const receipt=get('paired-receipt.json'),provenance=get('provenance.json'),verification=get('artifact-verification.json');
 must(receipt.head===expected.qaHead&&receipt.variant==='candidate'&&receipt.status==='captured-restoration-verified-not-reviewed','paired receipt head/status');
 for(const r of [provenance,verification])must(r.sourceHead===expected.qaHead&&r.variant==='candidate','source head');
 for(const k of ['qaHead','runId','runAttempt'])must(provenance[k]===expected[k],'provenance '+k);
 must(provenance.sourceTrackedClean===true,'clean source');
 must(verification.hashesVerified===true&&verification.count===16,'original verification');
 const paired=verification.paired;must(paired?.count===6&&paired.restorationVerified===true&&paired.visualReview==='pending','paired verification');
 must(Array.isArray(receipt.pairs)&&JSON.stringify(receipt.pairs.map(p=>p.frame))==='[0,3,9]','paired frame set');
 for(const pair of receipt.pairs){
  const restoration=pair.restoration;
  must(restoration?.exactPixels===true&&restoration.originalPngSHA256===restoration.restoredPngSHA256,'exact restoration');
  for(const k of ['originalPngSHA256','restoredPngSHA256','cpuSHA256','nonTargetGPU_SHA256','paintAtlasSHA256'])must(/^[a-f0-9]{64}$/.test(restoration[k]||''),'restoration hash '+k);
  must(pair.originalAlpha===Math.fround(.92)&&pair.dimensions?.format==='image/png','paired alpha/format');
  for(const alpha of ['alpha1','alpha092']){
   const name='blast-only-F'+String(pair.frame).padStart(2,'0')+'-'+alpha+'.png',f=files.get('candidate/'+name),row=pair[alpha];
   must(row?.file===name&&row.sha256===f.sha256&&row.byteLength===f.length,'paired PNG manifest');
   must(f.dimensions[0]===pair.dimensions.width&&f.dimensions[1]===pair.dimensions.height,'receipt PNG dimensions');
   if(alpha==='alpha092')must(row.sha256===restoration.originalPngSHA256,'restored alpha PNG hash');
  }
 }
 return {receipt,provenance,verification,files,visualReview:'pending',dataURL:name=>{must(pngNames.includes(name),'PNG selection');return 'data:image/png;base64,'+files.get('candidate/'+name).base64;}};
}
export {decodePairedShard,assemblePairedShards,sha256Bytes};
