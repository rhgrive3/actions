import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {checkWinnerPodium} from '../../../scripts/check-inkwave-hud-authority.mjs';
const base=path.resolve('.ci-scratch');fs.mkdirSync(base,{recursive:true});
test('podium diagnostics retain source, selected roster, states and PNG when cleanup also fails',async()=>{
 const evidence=fs.mkdtempSync(path.join(base,'podium-failure-'));let calls=0;
 const page={waitForFunction:async()=>{},evaluate:async()=>{
  switch(++calls){case 1:return;case 2:throw Error('primary roster failure');case 3:return{trace:{states:[{winner:1}],selected:{team:0},choreography:[{dance:'defeat'}]},captureKind:'private fixture before cleanup',png:'data:image/png;base64,AQID'};case 4:throw Error('secondary disposal failure');default:throw Error('unexpected');}
 }};
 try{await assert.rejects(checkWinnerPodium({page,evidence,sourceSha:'source',contentHash:'content'}),/primary roster failure/);const receipt=JSON.parse(fs.readFileSync(path.join(evidence,'winner-podium-probe.json')));assert.equal(receipt.status,'failed');assert.match(receipt.error,/primary roster/);assert.match(receipt.cleanupError,/secondary disposal/);assert.equal(receipt.sourceSha,'source');assert.equal(receipt.contentHash,'content');assert.equal(receipt.diagnostic.trace.selected.team,0);assert.equal(receipt.diagnostic.trace.states[0].winner,1);assert.deepEqual([...fs.readFileSync(path.join(evidence,'winner-podium-failure.png'))],[1,2,3]);}
 finally{fs.rmSync(evidence,{recursive:true,force:true});}
});
test('cleanup failure converts a previously passed podium receipt to failure',async()=>{
 const evidence=fs.mkdtempSync(path.join(base,'podium-cleanup-'));let calls=0;
 const page={waitForFunction:async()=>{},evaluate:async()=>{if(++calls===1)return;if(calls===2)return{states:[],images:[],profileRestored:true};throw Error('disposal failed');}};
 try{await assert.rejects(checkWinnerPodium({page,evidence,sourceSha:'source',contentHash:'content'}),/disposal failed/);const receipt=JSON.parse(fs.readFileSync(path.join(evidence,'winner-podium-probe.json')));assert.equal(receipt.status,'failed');assert.match(receipt.cleanupError,/disposal failed/);}
 finally{fs.rmSync(evidence,{recursive:true,force:true});}
});
