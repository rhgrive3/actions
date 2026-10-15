import test from'node:test';import assert from'node:assert/strict';import{validatePlan,MODEL,CATALOG,TESTS}from'./noct-plan.mjs';
import fs from 'node:fs';
function valid(){return JSON.parse(fs.readFileSync(new URL('./acceptance-plan.json',import.meta.url)));}
test('fixed current/light plan accepts complete identities',()=>assert.doesNotThrow(()=>validatePlan(valid())));
for(const[name,fn]of Object.entries({emptyHead:p=>p.current.head='',badHead:p=>p.light.head='x'.repeat(40),sameHead:p=>p.light.head=p.current.head,wrongCatalog:p=>p.light.payload.find(r=>r.path===CATALOG).blob='0'.repeat(40),wrongLight:p=>p.light.payload.find(r=>r.path===MODEL).sha256=p.current.payload.find(r=>r.path===MODEL).sha256,foreignRegistry:p=>p.light.registrySHA256='0'.repeat(64),lostTest:p=>p.light.testFiles=[],weakenedCount:p=>p.light.pass=10,duplicateInput:p=>p.light.payload.push(p.light.payload[0])})){test('reject '+name,()=>{const p=valid();fn(p);assert.throws(()=>validatePlan(p));});}
