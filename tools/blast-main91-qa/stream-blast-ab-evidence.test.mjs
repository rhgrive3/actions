import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const source=fs.readFileSync(new URL('./stream-blast-ab-evidence.mjs',import.meta.url),'utf8');
const declaration=source.split('\n').find(line=>line.startsWith('const emit='));
assert.ok(declaration?.includes('process.stdout.write'));
const ending=source.slice(source.indexOf('let result;'));
assert.ok(ending.includes('process.exitCode=1'));assert.ok(!ending.includes('throw error'));
test('real Node pipe preserves eight MiB and complete comparison failure before exit 1',()=>{
 const script=`(async()=>{${declaration}
 const lanes={baseline:{},candidate:{}},expectedQA='a'.repeat(40);
 const compareBlastAB=()=>{throw Error('sentinel mismatch');};
 for(let index=0;index<512;index++)await emit({kind:'chunk',index,data:'a'.repeat(16384)});
 await emit({kind:'complete',chunks:512});
 ${ending}
 })().catch(error=>{console.error(error);process.exitCode=2;});`;
 const child=spawnSync(process.execPath,['-e',script],{encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024});
 assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,1);
 const lines=child.stdout.trimEnd().split('\n');assert.equal(lines.length,514);
 const records=lines.map(line=>{assert.ok(line.startsWith('BLAST_AB_V1 '));return JSON.parse(line.slice(12));});
 for(let index=0;index<512;index++){assert.equal(records[index].index,index);assert.equal(records[index].data,'a'.repeat(16384));}
 assert.deepEqual(records[512],{kind:'complete',chunks:512});
 assert.equal(records[513].kind,'comparison');assert.equal(records[513].conditionsMatch,false);assert.equal(records[513].error,'sentinel mismatch');
 assert.equal(child.stderr,'');assert.ok(child.stdout.length>8*1024*1024);
});
test('transport write failure rejects rather than claiming emitted evidence',async()=>{
 const error=new Error('pipe failed');
 const emit=new Function('process',declaration+';return emit;')({stdout:{write:(_line,callback)=>callback(error)}});
 await assert.rejects(emit({kind:'complete'}),e=>e===error);
});
