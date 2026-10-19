import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../check-inkwave-browser.mjs',import.meta.url),'utf8');
const closeSource=source.match(/async function closeObservedBrowser\(\) \{[\s\S]*?\n\}\nlet result;/)?.[0].replace(/\nlet result;$/,'');

test('active native owner is observed before navigation, with one playing snapshot per lane',()=>{
 assert.match(source,/ownerGlobal:'s3ProbeG',receipt:streamedMusicReceipt/);
 assert.ok(source.indexOf('await observeStreamedMusic(')<source.indexOf('await page.goto('));
 assert.ok(source.includes("new URL('_versions/'+manifest.build.revision+'/assets/audio/Jet_Arrow.mp3',address).href"));
 assert.equal((source.match(/await streamedMusic\.snapshot\('native-playing-capture-ready'\)/g)||[]).length,2);
 const full=source.indexOf("  await streamedMusic.snapshot('native-playing-capture-ready');",source.indexOf('  result.gameplay ='));
 assert.ok(full>source.indexOf("throw new Error('Actual browser gameplay regression')"));
 assert.ok(full<source.indexOf('  result.turfLead ='));
});

test('original failed-request gate is strict and is evaluated before closure diagnostics',()=>{
 const listener="page.on('requestfailed', request => failures.push({ url: request.url(), error: request.failure()?.errorText }));";
 assert.ok(source.includes(listener));
 const gate="if(errors.length || consoleErrors.length || failures.length) result.status = 'failed';";
 assert.ok(source.includes(gate));
 assert.ok(source.indexOf(gate)<source.indexOf('await closeObservedBrowser();'));
 for(const kind of ['errors','consoleErrors','failures']) {
  const c={errors:[],consoleErrors:[],failures:[],result:{status:'passed'}};c[kind].push('negative');
  vm.runInNewContext(gate,c);assert.equal(c.result.status,'failed',kind);
 }
 const c={errors:[],consoleErrors:[],failures:[],result:{status:'passed'}};
 vm.runInNewContext(gate,c);assert.equal(c.result.status,'passed');
 assert.doesNotMatch(source,/failures\.(?:filter|splice)|ERR_ABORTED[^\n]*(?:return|continue)/);
});

for(const reject of [false,true]) test('close diagnostics are saved after '+(reject?'failed':'successful')+' context close without changing its outcome',async()=>{
 assert.ok(closeSource);
 const calls=[],receipt={sourceSha:'fixed',network:[]},error=new Error('close failed');
 const c={streamedMusicReceipt:receipt,evidence:'/evidence',path:{join:(...a)=>a.join('/')},
  streamedMusic:{close:async()=>{calls.push('close');receipt.closeStartedAt='start';receipt.network.push({errorText:'net::ERR_ABORTED',autoAccepted:false});receipt.closeFinishedAt='end';if(reject)throw error;return 'closed';}},
  fs:{writeFileSync:(p,b)=>calls.push({op:'write',p,body:JSON.parse(b)}),renameSync:(a,b)=>calls.push({op:'rename',a,b})}};
 const fn=vm.runInNewContext('('+closeSource+')',c);
 if(reject)await assert.rejects(fn(),e=>e===error);else assert.equal(await fn(),'closed');
 assert.equal(calls[0],'close');assert.equal(calls[1].op,'write');assert.equal(calls[2].op,'rename');
 assert.equal(calls[1].body.network[0].errorText,'net::ERR_ABORTED');assert.equal(calls[1].body.closeFinishedAt,'end');
 assert.equal(calls[2].b,'/evidence/streamed-music-diagnostics.json');
});
