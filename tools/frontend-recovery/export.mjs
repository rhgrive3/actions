import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const pins=[{"id":12969586617,"name":"frontend-phone-landscape-41035688850-1","size":8905124,"digest":"sha256:6e3fccfda1c7e5cd18455c391224760d5e8efaa0a48d4c8b9ecbe51c708747dc","device":"phone-landscape"},{"id":12969351732,"name":"frontend-phone-portrait-41035688850-1","size":7659650,"digest":"sha256:147ed2a56bf52fa1700a18b83eb1e786f6ae170a9980c90c9d6df8c9235c3c8d","device":"phone-portrait"},{"id":12970247003,"name":"frontend-ipad-mini-landscape-41035688850-1","size":13262407,"digest":"sha256:208bd7ca1bf785245782ead418c070b3eecc54a0d18f75eba9c234e625dc6b31","device":"ipad-mini-landscape"},{"id":12969304583,"name":"frontend-ipad-mini-portrait-41035688850-1","size":10727377,"digest":"sha256:3b2e1783cee7cf0d254ece028bb339cf0e0186ff2b1d9dd8cbb0f4d72ca1dd70","device":"ipad-mini-portrait"}];
const pin=pins.find(x=>String(x.id)===process.argv[2]);assert.ok(pin,'unknown pinned artifact');
const root=path.resolve(process.argv[3]),zip=path.resolve(process.argv[4]);
const hash=b=>createHash('sha256').update(b).digest('hex');
const meta=JSON.parse(execFileSync('gh',['api','repos/rhgrive3/actions/actions/artifacts/'+pin.id],{maxBuffer:1024*1024}));
assert.equal(meta.id,pin.id);assert.equal(meta.name,pin.name);assert.equal(meta.size_in_bytes,pin.size);assert.equal(meta.digest,pin.digest);assert.equal(meta.expired,false);
assert.equal(meta.workflow_run.id,41035688850);assert.equal(meta.workflow_run.head_sha,'25d2111aedefa25a436636b632173e650cc3b71c');assert.equal(meta.workflow_run.repository_id,1371175410);
assert.ok(fs.statSync(zip).size<=32*1024*1024);assert.equal('sha256:'+hash(fs.readFileSync(zip)),pin.digest);
const entries=execFileSync('unzip',['-Z1',zip],{maxBuffer:1024*1024}).toString().trim().split('\n');
assert.equal(entries.filter(x=>x==='manifest.json').length,1,'one root manifest');
const raw=execFileSync('unzip',['-p',zip,'manifest.json'],{maxBuffer:1024*1024});
const f=path.join(root,'manifest.json');assert.ok(fs.lstatSync(f).isFile()&&!fs.lstatSync(f).isSymbolicLink());
assert.deepEqual(fs.readFileSync(f),raw,'download-artifact manifest equals digest-verified ZIP');
const m=JSON.parse(raw);assert.equal(m.schema,1);assert.equal(m.productHead,'379533f541d86346a068e397f879cb6c13590ffd');assert.equal(m.qaHead,'25d2111aedefa25a436636b632173e650cc3b71c');assert.equal(String(m.run),'41035688850');assert.equal(String(m.attempt),'1');assert.equal(m.device.id,pin.device);
assert.ok(Array.isArray(m.images)&&m.images.length<=1000);assert.ok(Array.isArray(m.failures));assert.equal(typeof m.complete,'boolean');
const indices=new Set(),files=new Set();
for(const im of m.images){assert.ok(Number.isInteger(im.index)&&!indices.has(im.index));indices.add(im.index);assert.ok(/^[A-Za-z0-9._-]+\.jpg$/.test(im.jpeg.file)&&!files.has(im.jpeg.file));files.add(im.jpeg.file);assert.ok(/^[a-f0-9]{64}$/.test(im.jpeg.sha256));assert.ok(Number.isInteger(im.jpeg.bytes)&&im.jpeg.bytes>0);assert.equal(im.jpeg.nativeScreenshot,true);assert.equal(im.jpeg.quality,80);}

const manifestSHA256=hash(raw), mode=process.argv[5]||'plan';
const expected=({'phone-portrait':{width:390,height:844},'phone-landscape':{width:844,height:390},'ipad-mini-portrait':{width:744,height:1133},'ipad-mini-landscape':{width:1133,height:744}})[pin.device];
assert.deepEqual(m.device.viewport,expected);assert.equal(m.device.deviceScaleFactor,1);
const LIMIT=2500*1024, RESERVE=16*1024;
const selections={"ipad-mini-portrait":[1,2,9,27,30,32,34,36,38,40,42,44,46,48,50,53,54,55,56,57,58,60,61,62,64,65,66,69,70,73,74,77,78,81,82,85,86,89,90,91,92,93,94,95],"ipad-mini-landscape":[2,14,16,21,30,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,56,57,58,59,60,61,62,63,64,65,68,69,70,71,72,75,76,77,78,81,82,83,86,87,88,91,92,93,96,97,98,101,102,103,106,107,108,109,110,111,112,113]};
const selected=selections[pin.device].map(index=>{const im=m.images.find(x=>x.index===index);assert.ok(im);return im;});
assert.equal(new Set(selected.map(x=>x.index)).size,selected.length);
function jpegSize(b){assert.equal(b.readUInt16BE(0),0xffd8);for(let p=2;p+4<b.length;){assert.equal(b[p++],255);let marker=b[p++];while(marker===255)marker=b[p++];if(marker===217||marker===218)break;const length=b.readUInt16BE(p);assert.ok(length>=2&&p+length<=b.length);if([192,193,194].includes(marker))return {height:b.readUInt16BE(p+3),width:b.readUInt16BE(p+5)};p+=length;}throw Error('JPEG SOF absent');}
function imageEvents(im){
 const f=path.join(root,im.jpeg.file),st=fs.lstatSync(f);assert.ok(st.isFile()&&!st.isSymbolicLink());assert.equal(fs.realpathSync(f),path.join(fs.realpathSync(root),im.jpeg.file));assert.equal(st.size,im.jpeg.bytes);
 const b=fs.readFileSync(f);assert.equal(hash(b),im.jpeg.sha256);assert.deepEqual(jpegSize(b),expected);assert.equal(im.width,expected.width);assert.equal(im.height,expected.height);
 assert.equal(im.readback.width,expected.width);assert.equal(im.readback.height,expected.height);assert.equal(im.readback.dpr,1);
 const transport={run:process.env.GITHUB_RUN_ID,qaHead:process.env.QA_SHA,sourceArtifact:pin.id,artifactDigest:pin.digest,manifestSHA256};
 const events=[{type:'image-meta',device:pin.device,productHead:m.productHead,qaHead:m.qaHead,run:m.run,attempt:m.attempt,transport,...im}];
 const base64=b.toString('base64'),parts=Math.ceil(base64.length/12000);
 for(let part=0;part<parts;part++)events.push({type:'chunk',device:pin.device,index:im.index,part,parts,base64:base64.slice(part*12000,(part+1)*12000)});
 events.push({type:'image-complete',device:pin.device,index:im.index,sha256:im.jpeg.sha256,parts});
 return events.map(e=>'FRONTEND_SCREEN_V1 '+JSON.stringify(e)+'\n');
}
const bins=[];let bin=[],cost=0;
for(const im of selected){const lines=imageEvents(im),bytes=lines.reduce((n,l)=>n+Buffer.byteLength(l)+64,0);assert.ok(bytes<=LIMIT-RESERVE,'one image exceeds log budget');
 if(cost+bytes>LIMIT-RESERVE&&bin.length){bins.push(bin);bin=[];cost=0;}bin.push({index:im.index,bytes});cost+=bytes;
}if(bin.length)bins.push(bin);assert.ok(bins.length>0&&bins.length<=20);
const flat=bins.flat().map(x=>x.index);assert.deepEqual(flat,selected.map(x=>x.index));assert.equal(new Set(flat).size,flat.length);
const plan={selectedIndices:flat,deferredIndices:m.images.filter(x=>!flat.includes(x.index)).map(x=>x.index),sourceArtifact:pin,manifestSHA256,captureComplete:m.complete,failures:m.failures,inventory:m.images.map(x=>({index:x.index,name:x.name,file:x.jpeg.file,sha256:x.jpeg.sha256,bytes:x.jpeg.bytes,scope:x.scope})),bins};
if(mode==='plan'){fs.writeFileSync('plan-'+pin.id+'.json',JSON.stringify(plan));console.log('FRONTEND_RECOVERY_PLAN_V1 '+JSON.stringify(plan));}
else {assert.ok(/^\d+$/.test(mode));const n=Number(mode);assert.ok(n<bins.length);let emitted=0;
 for(const item of bins[n]){const im=m.images.find(x=>x.index===item.index);for(const line of imageEvents(im)){emitted+=Buffer.byteLength(line)+64;assert.ok(emitted<=LIMIT);if(!process.stdout.write(line))await new Promise(r=>process.stdout.once('drain',r));}}
 const control='FRONTEND_RECOVERY_BIN_V1 '+JSON.stringify({sourceArtifact:pin,manifestSHA256,bin:n,bins:bins.length,indices:bins[n].map(x=>x.index),boundedBytes:emitted,captureComplete:m.complete,recoveryComplete:true})+'\n';assert.ok(emitted+Buffer.byteLength(control)+64<=LIMIT);if(!process.stdout.write(control))await new Promise(r=>process.stdout.once('drain',r));
}
