import test from 'node:test';
import assert from 'node:assert/strict';
import {decodePairedShard,assemblePairedShards,sha256Bytes} from './decode-blast-paired-evidence.mjs';
const expected={qaHead:'a'.repeat(40),runId:'123',runAttempt:'1',exporterSHA256:'b'.repeat(64)};
const scope='same-scene same-frame candidate-only alpha sensitivity; original PNG bytes; no separate-build or visual acceptance';
const b64=bytes=>{const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let out='';for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1],c=bytes[i+2];out+=chars[a>>2]+chars[((a&3)<<4)|((b??0)>>4)]+(b===undefined?'=':chars[((b&15)<<2)|((c??0)>>6)])+(c===undefined?'=':chars[c&63]);}return out;};
function fixture(changeReceipt=()=>{}){
 const files=[],pairs=[];
 for(const frame of [0,3,9]){
  const pair={frame,dimensions:{width:16,height:9,format:'image/png'},originalAlpha:Math.fround(.92),restoration:{exactPixels:true,cpuSHA256:'c'.repeat(64),nonTargetGPU_SHA256:'d'.repeat(64),paintAtlasSHA256:'e'.repeat(64),paintAtlasBytes:64}};
  for(const [index,alpha]of ['alpha1','alpha092'].entries()){
   // Synthetic header-only PNG fixture validates transport/IHDR, not image decoding.
   const bytes=[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,16,0,0,0,9,frame+index];
   const name='blast-only-F'+String(frame).padStart(2,'0')+'-'+alpha+'.png',sha256=sha256Bytes(bytes);
   pair[alpha]={file:name,sha256,byteLength:bytes.length};files.push({name,bytes});
   if(alpha==='alpha092')pair.restoration.originalPngSHA256=pair.restoration.restoredPngSHA256=sha256;
  }pairs.push(pair);
 }
 const receipt={head:expected.qaHead,variant:'candidate',status:'captured-restoration-verified-not-reviewed',pairs};
 changeReceipt(receipt);
 const jsons=[['paired-receipt.json',receipt],['provenance.json',{...expected,sourceHead:expected.qaHead,variant:'candidate',sourceTrackedClean:true}],['artifact-verification.json',{sourceHead:expected.qaHead,variant:'candidate',hashesVerified:true,count:16,paired:{count:6,restorationVerified:true,visualReview:'pending'}}]].map(([name,json])=>({name,bytes:Array.from(JSON.stringify(json),c=>c.charCodeAt(0))}));
 const allEvidenceBytes=[...jsons,...files].reduce((n,f)=>n+f.bytes.length,0);
 return [0,1,2].map(shard=>{
  const selected=[...jsons,...files.slice(shard*2,shard*2+2)],totalBytes=selected.reduce((n,f)=>n+f.bytes.length,0);
  const rows=[{kind:'begin',...expected,shard,shards:3,fileCount:5,pngCount:2,totalBytes,allEvidenceBytes,encoding:'base64',chunkChars:16384,scope}];
  for(const f of selected){const data=b64(f.bytes),chunks=Math.ceil(data.length/16384),sha256=sha256Bytes(f.bytes),id={variant:'candidate',name:f.name};rows.push({kind:'file',...id,length:f.bytes.length,sha256,chunks});for(let index=0;index<chunks;index++)rows.push({kind:'chunk',...id,index,data:data.slice(index*16384,(index+1)*16384)});rows.push({kind:'file-end',...id,sha256,chunks});}
  rows.push({kind:'complete',shard,shards:3,fileCount:5,pngCount:2,totalBytes});return rows;
 });
}
const log=rows=>rows.map(r=>'BLAST_PAIRED_V1 '+JSON.stringify(r)).join('\n');
const decode=rows=>rows.map((r,shard)=>decodePairedShard(log(r),{...expected,shard}));
test('all 6 PNG and 3 byte-identical JSON reconstruct at exact head/run',()=>{
 const data=assemblePairedShards(decode(fixture()),expected);assert.equal(data.files.size,9);assert.equal(data.visualReview,'pending');assert.ok(data.dataURL('blast-only-F03-alpha092.png').startsWith('data:image/png;base64,'));
});
test('missing or duplicated shards rejected',()=>{
 const decoded=decode(fixture());assert.throws(()=>assemblePairedShards(decoded.slice(1),expected));assert.throws(()=>assemblePairedShards([decoded[0],decoded[0],decoded[2]],expected));
});
test('wrong head/run/code and wrong transport prefix rejected',()=>{
 for(const field of ['qaHead','runId','runAttempt','exporterSHA256']){const rows=fixture()[0];rows[0][field]+='0';assert.throws(()=>decodePairedShard(log(rows),{...expected,shard:0}));}
 assert.throws(()=>decodePairedShard(log(fixture()[0]).replaceAll('BLAST_PAIRED_V1','BLAST_AB_V1'),{...expected,shard:0}));
});
test('missing duplicate and altered chunks rejected',()=>{
 for(const mutate of [rows=>rows.splice(2,1),rows=>rows.splice(2,0,rows[2]),rows=>{rows[2].data='AAAA'+rows[2].data.slice(4);}]){const rows=fixture()[0];mutate(rows);assert.throws(()=>decodePairedShard(log(rows),{...expected,shard:0}));}
});
test('cross-shard JSON must be exact bytes, not merely matching head',()=>{
 const a=decode(fixture()),b=decode(fixture(r=>{r.extra='different';}));
 assert.throws(()=>assemblePairedShards([a[0],b[1],a[2]],expected));
});
test('restoration, alpha PNG binding and receipt dimensions fail closed',()=>{
 for(const mutate of [r=>r.pairs[0].restoration.exactPixels=false,r=>r.pairs[0].restoration.restoredPngSHA256='f'.repeat(64),r=>r.pairs[0].alpha092.sha256='f'.repeat(64),r=>r.pairs[0].dimensions.width=1280,r=>r.pairs[0].originalAlpha=.92])assert.throws(()=>assemblePairedShards(decode(fixture(mutate)),expected));
});
test('extra or duplicate trailing record and wrong file identity rejected',()=>{
 const a=fixture()[0];a.push(a.at(-1));assert.throws(()=>decodePairedShard(log(a),{...expected,shard:0}));
 const b=fixture()[0];b[1].variant='baseline';assert.throws(()=>decodePairedShard(log(b),{...expected,shard:0}));
});
