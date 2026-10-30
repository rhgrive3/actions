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
const pngNames=['blast-only','blast-roll'].flatMap(p=>[0,1,3,5,9,13,21,29].map(f=>p+'-F'+String(f).padStart(2,'0')+'.png')).sort();
const jsonNames=['capture-receipt.json','driver-receipt.json','provenance.json','artifact-verification.json','regression-receipt.json','standard-launcher.json'];
const key=f=>f.variant+'/'+f.name;
function must(v,m){if(!v)throw Error(m)}
function expectedFiles(shard){return [...(shard===0?['baseline','candidate'].flatMap(variant=>jsonNames.map(name=>({variant,name}))):[]),...['baseline','candidate'].flatMap(variant=>pngNames.map(name=>({variant,name}))).slice(shard*4,shard*4+4)].map(key)}
function decodeBlastShard(log,expected){
 const {qaHead,runId,runAttempt,shard,exporterSHA256,comparatorSHA256}=expected;
 must(/^[a-f0-9]{64}$/.test(exporterSHA256||'')&&/^[a-f0-9]{64}$/.test(comparatorSHA256||''),'expected code SHA');
 must(/^[a-f0-9]{40}$/.test(qaHead),'expected head');must(typeof runId==='string'&&/^\d+$/.test(runId),'expected run');must(typeof runAttempt==='string'&&/^\d+$/.test(runAttempt),'expected attempt');must(Number.isInteger(shard)&&shard>=0&&shard<8,'expected shard');
 must(typeof log==='string'&&log.length<=24*1024*1024,'bounded log');
 const lines=log.split(/\r?\n/),rows=[];
 for(const line of lines){const at=line.indexOf('BLAST_AB_V1 {');if(at<0)continue;const before=line.slice(0,at);must(before===''||/^\d{4}-\d\d-\d\dT[0-9:.]+Z\s+$/.test(before),'unexpected log prefix');rows.push(JSON.parse(line.slice(at+'BLAST_AB_V1 '.length)));}
 const begin=rows.shift();must(begin?.kind==='begin','missing begin');for(const [k,v]of Object.entries({qaHead,runId,runAttempt,exporterSHA256,comparatorSHA256,shard,shards:8,encoding:'base64',chunkChars:16384,pngCount:4}))must(begin[k]===v,'begin '+k);
 const expectedKeys=expectedFiles(shard);must(begin.fileCount===expectedKeys.length,'file count');
 must(Number.isSafeInteger(begin.totalBytes)&&begin.totalBytes>=0&&begin.totalBytes<=12*1024*1024,'job bytes');must(Number.isSafeInteger(begin.allEvidenceBytes)&&begin.allEvidenceBytes<=64*1024*1024&&begin.allEvidenceBytes>=begin.totalBytes,'all bytes');
 const files=[];let total=0,i=0;
 for(const wanted of expectedKeys){
 const f=rows[i++];must(f?.kind==='file'&&key(f)===wanted,'file order/name');must(Number.isSafeInteger(f.length)&&f.length>=0&&f.length<=8*1024*1024,'file length');must(/^[a-f0-9]{64}$/.test(f.sha256),'file sha');must(f.chunks===Math.ceil(Math.ceil(f.length/3)*4/16384),'chunk count');
 let base64='';for(let j=0;j<f.chunks;j++){const c=rows[i++];must(c?.kind==='chunk'&&key(c)===wanted&&c.index===j,'chunk order/identity');must(typeof c.data==='string'&&c.data.length>0&&c.data.length<=16384&&(j===f.chunks-1||c.data.length===16384),'chunk size');base64+=c.data}
 const end=rows[i++];must(end?.kind==='file-end'&&key(end)===wanted&&end.sha256===f.sha256&&end.chunks===f.chunks,'file end');
 const bytes=decodeBase64(base64);must(bytes.length===f.length,'decoded length');must(sha256Bytes(bytes)===f.sha256,'decoded sha');
 let json,dimensions;if(f.name.endsWith('.png')){must(bytes.length>24&&[137,80,78,71,13,10,26,10].every((v,j)=>bytes[j]===v),'PNG signature');const u32=o=>bytes[o]*16777216+bytes[o+1]*65536+bytes[o+2]*256+bytes[o+3];must(u32(8)===13&&String.fromCharCode(...bytes.slice(12,16))==='IHDR','PNG IHDR');dimensions=[u32(16),u32(20)];must(dimensions[0]===1280&&dimensions[1]===720,'PNG dimensions')}else json=JSON.parse(decodeUTF8(bytes));
 files.push({...f,base64,json,dimensions});total+=bytes.length;
 }
 const complete=rows[i++];must(complete?.kind==='complete','missing complete');for(const [k,v]of Object.entries({shard,shards:8,fileCount:files.length,pngCount:4,totalBytes:total}))must(complete[k]===v,'complete '+k);must(begin.totalBytes===total,'begin total');
 const comparison=rows[i++];must(comparison?.kind==='comparison'&&typeof comparison.conditionsMatch==='boolean','missing comparison');must(i===rows.length,'unexpected/duplicate trailing record');
 return {begin,files,comparison};
}
function assembleBlastShards(shards,expected){
 must(Array.isArray(shards)&&shards.length===8,'all 8 shards required');const seen=new Set(),files=new Map();let total=0;const comparison=shards[0].comparison;
 for(const s of shards){for(const k of ['qaHead','runId','runAttempt','exporterSHA256','comparatorSHA256'])must(s.begin[k]===expected[k],'mixed '+k);must(!seen.has(s.begin.shard),'duplicate shard');seen.add(s.begin.shard);must(s.begin.allEvidenceBytes===shards[0].begin.allEvidenceBytes,'mixed total');must(JSON.stringify(s.comparison)===JSON.stringify(comparison),'mixed comparison');for(const f of s.files){must(!files.has(key(f)),'duplicate file');files.set(key(f),f);total+=f.length}}
 must(seen.size===8&&total===shards[0].begin.allEvidenceBytes&&files.size===44,'complete manifest totals');
 const lanes={};
 for(const variant of ['baseline','candidate']){
 const get=n=>{const f=files.get(variant+'/'+n);must(f,'missing '+n);return f.json};
 const capture=get('capture-receipt.json'),driver=get('driver-receipt.json'),provenance=get('provenance.json'),verification=get('artifact-verification.json'),regression=get('regression-receipt.json');
 const head=variant==='baseline'?'0cc5ce3712f93c275095d36c1f35ffdbd8565e2e':expected.qaHead;
 for(const r of [capture,driver])must(r.head===head&&r.variant===variant,'receipt head');
 for(const r of [provenance,verification,regression])must(r.sourceHead===head&&r.variant===variant,'source head');
 for(const k of ['qaHead','runId','runAttempt'])must(provenance[k]===expected[k],'provenance '+k);
 const captures=capture.cases.flatMap(c=>c.captures);must(captures.length===16,'16 captures');const pngDimensions={};
 for(const name of pngNames){const f=files.get(variant+'/'+name),entries=captures.filter(x=>x.file===name);must(f&&entries.length===1&&entries[0].sha256===f.sha256,'capture PNG manifest');pngDimensions[name]=f.dimensions}
 lanes[variant]={capture,driver,provenance,verification,regression,pngDimensions};
 }
 return {lanes,files,comparison,dataURL:(variant,name)=>{must(pngNames.includes(name)&&['baseline','candidate'].includes(variant),'PNG selection');return 'data:image/png;base64,'+files.get(variant+'/'+name).base64}};
}

export {decodeBlastShard,assembleBlastShards,sha256Bytes};
