import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSourceOBJ} from '../runtime/source-convert.mjs';

const source=fs.readFileSync(new URL('../runtime/source-convert.mjs',import.meta.url),'utf8');
const lineBody=source.slice(source.indexOf('function lines('),source.indexOf('const any='));
const lines=new Function(lineBody+'\nreturn lines;')();
// Frozen pre-chunk contract: each complete byte line was decoded independently.
function previousLines(bytes){
 const out=[],decoder=new TextDecoder('utf-8',{ignoreBOM:true});
 for(let start=0;start<bytes.length;){
  const at=bytes.indexOf(10,start),end=at<0?bytes.length:at;
  let line=decoder.decode(bytes.subarray(start,end));
  if(start===0&&line.charCodeAt(0)===0xfeff)line=line.slice(1);
  out.push(line.trimEnd());start=end+1;
 }
 return out;
}
function obj(name='Fld_Pnt_日本語'){
 return `o ${name}\r\nusemtl Ground\r\nv 0 0 0\r\nv 1 0 0\r\nv 0 0 1\r\nvn 0 1 0\r\nvn 0 1 0\r\nvn 0 1 0\r\nf 1//1 2//2 3//3`;
}
test('bounded UTF-8 decoding preserves line contract, malformed bytes, BOM and final-line behavior',()=>{
 const fixtures=['','\n','\r','\r\n','\ufeff','\ufeff\n','\ufefftext\r\nnext','a\n\n','text\u2003\n  ','x'.repeat(150000)+'日本語\r\nlast'];
 for(const text of fixtures){const bytes=new TextEncoder().encode(text),out=[];lines(bytes,line=>out.push(line));assert.deepEqual(out,previousLines(bytes));}
 let seed=75;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<100;i++){
  const bytes=Uint8Array.from({length:i<40?65530+i:Math.floor(random()*4000)},()=>Math.floor(random()*256)),out=[];
  lines(bytes,line=>out.push(line));assert.deepEqual(out,previousLines(bytes),'seeded byte fixture '+i);
 }
});
test('OBJ buffers, object names and compact classification survive UTF-8 and CRLF chunk boundaries',()=>{
 for(const prefix of ['', '\ufeff'])for(const shift of [0,1,2,3,65525,65526,65527,65528,65529]){
  const text=prefix+obj('Fld_Pnt_'+'x'.repeat(shift)+'日本語_床'),bytes=new TextEncoder().encode(text);
  const storage=new Uint8Array(bytes.length+19);storage.set(bytes,11);
  for(const input of [bytes,bytes.buffer,storage.subarray(11,11+bytes.length)])for(const compactInactiveDisplay of [false,true]){
   assert.deepEqual(parseSourceOBJ(input,undefined,{compactInactiveDisplay}),parseSourceOBJ(text.replace(/^\ufeff/,''),undefined,{compactInactiveDisplay}));
  }
 }
 const text='#'+'x'.repeat(65534)+'\r\n'+obj()+'\r\n';
 assert.deepEqual(parseSourceOBJ(new TextEncoder().encode(text)),parseSourceOBJ(text));
});
test('large source byte input uses bounded decoder work rather than one decode for every line',()=>{
 let calls=0,maxBytes=0;
 class MeasuredDecoder extends TextDecoder{decode(input,options){calls++;maxBytes=Math.max(maxBytes,input?.byteLength||0);return super.decode(input,options);}}
 const measured=new Function('TextDecoder',lineBody+'\nreturn lines;')(MeasuredDecoder);
 const bytes=new TextEncoder().encode('v 1.25 0 2.5\r\n'.repeat(100000));let count=0;
 measured(bytes,()=>count++);
 assert.equal(count,100000);assert.ok(calls<100,'decoder calls stay sublinear in the line count');
 assert.ok(maxBytes<=128*1024,'decoding must not restore the old full-source string allocation');
});
