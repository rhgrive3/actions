import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {requireAbsoluteExplosherGeometries,absoluteGeometryArguments} from '../check-inkwave-explosher-absolute-geometries.mjs';
const frame=(geometries=295,tick=0,view='behind')=>({tick,view,measurement:{memory:{geometries}}});
const pre=(n=295)=>[frame(n)];
const stills=(n=295)=>[0,3,8,14,22,30].flatMap(t=>['behind','tele-side','tele-oblique'].map(v=>frame(n,t,v)));
const clone=x=>structuredClone(x);
const source=fs.readFileSync(new URL('../check-inkwave-explosher-absolute-geometries.mjs',import.meta.url),'utf8');

test('exact original absolute counts accept equality and decrease without mutating inputs',()=>{
 const before=pre(),after=pre(294),snapshot=clone([before,after]);
 assert.deepEqual(requireAbsoluteExplosherGeometries('preflight',before,after),[{tick:0,view:'behind',before:295,after:294}]);
 assert.deepEqual([before,after],snapshot);
 assert.equal(requireAbsoluteExplosherGeometries('preflight',pre(0),pre(0))[0].after,0);
});
for(const [before,after] of [[281,295],[295,296],[254,1000027],[295,295.000001]])test('rejects absolute '+before+' -> '+after+' without tolerance or baseline offset',()=>{
 assert.throws(()=>requireAbsoluteExplosherGeometries('preflight',pre(before),pre(after)),/Absolute geometry regression/);
});
for(const value of [undefined,null,NaN,Infinity,-1,'295'])test('missing or invalid count fails closed: '+String(value),()=>{
 for(const lane of ['before','after']){
  const b=pre(),a=pre();(lane==='before'?b:a)[0].measurement.memory.geometries=value;
  assert.throws(()=>requireAbsoluteExplosherGeometries('preflight',b,a),/invalid absolute geometry count/);
 }
});
test('absent memory and measurement objects fail closed',()=>{
 for(const bad of [{tick:0,view:'behind'},{tick:0,view:'behind',measurement:{}},{tick:0,view:'behind',measurement:{memory:{}}}]){
  assert.throws(()=>requireAbsoluteExplosherGeometries('preflight',pre(),[bad]));
 }
});
test('missing duplicate misordered and wrong frame identities fail closed',()=>{
 for(const bad of [undefined,[],[...pre(),...pre()],[frame(295,3)],[frame(295,0,'tele-side')]]){
  assert.throws(()=>requireAbsoluteExplosherGeometries('preflight',pre(),bad));
  assert.throws(()=>requireAbsoluteExplosherGeometries('preflight',bad,pre()));
 }
 const reordered=stills();[reordered[0],reordered[1]]=[reordered[1],reordered[0]];
 assert.throws(()=>requireAbsoluteExplosherGeometries('stills',stills(),reordered));
});
test('all18stills frames retain absolute condition, including final frame',()=>{
 assert.equal(requireAbsoluteExplosherGeometries('stills',stills(),stills()).length,18);
 const a=stills();a.at(-1).measurement.memory.geometries++;
 assert.throws(()=>requireAbsoluteExplosherGeometries('stills',stills(),a),/30:tele-oblique/);
 assert.throws(()=>requireAbsoluteExplosherGeometries('stills',stills(),a.slice(1)));
});
test('CLI accepts only exact stage and five positional arguments; no bypass flags',()=>{
 assert.deepEqual(absoluteGeometryArguments(['preflight','b','a','admission','output']),['preflight','b','a','admission','output']);
 for(const args of [[],['preflight','b','a','admission'],['video','b','a','admission','output'],['preflight','b','a','admission','output','--ignore'],['preflight','b','a','--offset=14','output']])assert.throws(()=>absoluteGeometryArguments(args));
});

// Exact checker bytes, synthetic imported lane/admission boundary. This tests
// CLI failure propagation/receipt binding, not native pixels or source admission.
function cliFixture(t,{before=295,after=295,gateFail=false,readFail=false,stale=false}={}){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'explosher-absolute-test-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 fs.mkdirSync(path.join(d,'lib'));fs.writeFileSync(path.join(d,'checker.mjs'),source);
 const eventFile=path.join(d,'events.jsonl');
 fs.writeFileSync(path.join(d,'lib/inkwave-explosher-stage-admission.mjs'),`
 import fs from 'node:fs';import assert from 'node:assert/strict';
 const log=x=>fs.appendFileSync(${JSON.stringify(eventFile)},JSON.stringify(x)+'\\n');
 export function readExplosherCaptureLane(file){log('read:'+file);const r=JSON.parse(fs.readFileSync(file));if(r.readFail)throw Error('synthetic lane/PNG/source rejection');return r;}
 export function requireExplosherStagePair(stage,b,a,br,ar){log('upstream-admission');assert.equal(stage,'preflight');if(br.gateFail)throw Error('synthetic upstream source/census/growth rejection');return {stage,passed:true,syntheticOnly:true};}
 `);
 const lane=n=>({frames:pre(n),r:{gateFail},manifestSha256:'a'.repeat(64),sourceReceiptSha256:'b'.repeat(64),readFail});
 const b=lane(before),a=lane(after);const bf=path.join(d,'before.json'),af=path.join(d,'after.json');
 fs.writeFileSync(bf,JSON.stringify(b));fs.writeFileSync(af,JSON.stringify(a));
 const admission={stage:'preflight',passed:true,syntheticOnly:true,before:{manifestSha256:b.manifestSha256,sourceReceiptSha256:b.sourceReceiptSha256},after:{manifestSha256:a.manifestSha256,sourceReceiptSha256:a.sourceReceiptSha256}};
 if(stale)admission.after.manifestSha256='c'.repeat(64);
 const input=JSON.stringify(admission),receipt=path.join(d,'admission.json'),out=path.join(d,'out.json');fs.writeFileSync(receipt,input);
 return {d,out,input,receipt,run:(extra=[])=>spawnSync(process.execPath,[path.join(d,'checker.mjs'),'preflight',bf,af,receipt,out,...extra],{encoding:'utf8',timeout:5000}),events:()=>fs.existsSync(eventFile)?fs.readFileSync(eventFile,'utf8').trim().split('\n').map(x=>JSON.parse(x)):[]};
}
test('CLI validates both lanes and upstream admission before exact additional guard and bound receipt',t=>{
 const f=cliFixture(t),r=f.run();assert.equal(r.status,0,r.stderr);
 const receipt=JSON.parse(fs.readFileSync(f.out));assert.equal(receipt.passed,true);
 assert.equal(receipt.stageAdmissionSha256,createHash('sha256').update(f.input).digest('hex'));
 assert.deepEqual(receipt.frames,[{tick:0,view:'behind',before:295,after:295}]);
 assert.equal(f.events().length,3);assert.equal(f.events()[2],'upstream-admission');
 assert.equal(fs.readFileSync(f.receipt,'utf8'),f.input);
});
for(const [name,options,error] of [
 ['absolute+14',{before:281,after:295},/Absolute geometry regression/],
 ['native admission failure',{gateFail:true},/synthetic upstream/],
 ['lane/source/PNG rejection',{readFail:true},/synthetic lane/],
 ['stale manifest binding',{stale:true},/Existing admission does not bind/]
])test('CLI cannot write passed receipt after '+name,t=>{
 const f=cliFixture(t,options),r=f.run();assert.notEqual(r.status,0);assert.match(r.stderr,error);assert.equal(fs.existsSync(f.out),false);
});
test('missing malformed or failed prior admission cannot produce acceptance',t=>{
 for(const replacement of [null,'{',JSON.stringify({stage:'preflight',passed:false})]){
  const f=cliFixture(t);if(replacement===null)fs.unlinkSync(f.receipt);else fs.writeFileSync(f.receipt,replacement);
  assert.notEqual(f.run().status,0);assert.equal(fs.existsSync(f.out),false);
 }
});
test('CLI refuses to overwrite existing success receipt or accept extra override arguments',t=>{
 const f=cliFixture(t);fs.writeFileSync(f.out,'existing');const r=f.run();assert.notEqual(r.status,0);assert.equal(fs.readFileSync(f.out,'utf8'),'existing');
 const extra=cliFixture(t);assert.notEqual(extra.run(['--offset=14']).status,0);assert.equal(fs.existsSync(extra.out),false);assert.deepEqual(extra.events(),[]);
});

const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-explosher-flight-glitter.yml',import.meta.url),'utf8');
const command='        run: node scripts/check-inkwave-explosher-absolute-geometries.mjs preflight .ci-scratch/explosher/preflight-before .ci-scratch/explosher/preflight-after .ci-scratch/explosher/preflight-diagnostic.json .ci-scratch/explosher/absolute-geometry-admission.json\n';
const mandatory='      - name: Enforce original absolute Explosher geometry guard\n'+command;
function workflowContract(y){
 assert.equal(y.split(mandatory).length,2,'exact mandatory unskippable absolute step');
 const prior=y.indexOf('readExplosherStagePair(\'preflight\''),guard=y.indexOf(mandatory),next=y.indexOf('      - name: Capture untouched base');
 assert(prior>=0&&prior<guard&&guard<next,'original upstream admission precedes additive guard');
 assert.match(y,/^    timeout-minutes: 45$/m);
 for(const file of ['scripts/check-inkwave-explosher-absolute-geometries.mjs','scripts/tests/inkwave-explosher-absolute-geometries.test.mjs','scripts/ci/inkwave-test-suites.json'])assert(y.includes("      - '"+file+"'\n"),'focused trigger '+file);
 assert.match(y,/run: node --test [^\n]*scripts\/tests\/inkwave-explosher-absolute-geometries\.test\.mjs/);
 const active=y.slice(y.indexOf('  native-pair:'),next);assert.doesNotMatch(active,/^\s+(?:if|continue-on-error):/m,'native admissions remain mandatory');
 assert.match(y,/uses: actions\/upload-artifact@v4\n        if: always\(\)/);
 assert.match(y,/path: \.ci-scratch\/explosher\//);
}
test('workflow conjoins mandatory absolute artifact guard after unchanged native admission',()=>{
 workflowContract(workflow);
 const suites=JSON.parse(fs.readFileSync(new URL('../ci/inkwave-test-suites.json',import.meta.url)));
 assert(suites.verifier.steps.some(s=>s.args.includes('scripts/tests/inkwave-explosher-absolute-geometries.test.mjs')));
});
test('workflow negative controls reject omission skip bypass paths missing trigger test or budget widening',()=>{
 for(const [a,b] of [[mandatory,''],[command,'        if: false\n'+command],[command,'        continue-on-error: true\n'+command],[command,command.replace('preflight-after','preflight-before')],[command,command.trimEnd()+' || true\n'],["      - 'scripts/check-inkwave-explosher-absolute-geometries.mjs'\n",''],[' scripts/tests/inkwave-explosher-absolute-geometries.test.mjs\n','\n'],['timeout-minutes: 45','timeout-minutes: 60']]){
  assert(workflow.includes(a),a);assert.throws(()=>workflowContract(workflow.replace(a,b)));
 }
});
