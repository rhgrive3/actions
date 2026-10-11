import test from 'node:test';import assert from 'node:assert/strict';
import {installRankedGearReceipt,trustedRankedState,lastDitchCountAP} from '../runtime/ranked-gear.mjs';
const make=()=>{
 const m={mode:'zones',follower:true,ranked:{mode:'zones',counts:[100,100],revision:0,winner:null,overtime:false,update(){},snapshot(){}}};
 class NM{onMessage(from,d){if(from!==this.s.hostId||d.rk?.host!==from||d.rk.match!==this.cfg.id||d.rk.state.invalid)return;const s=d.rk.state;if(s.revision<=this.match.ranked.revision)return;Object.assign(this.match.ranked,s);}}
 const nm=new NM();Object.assign(nm,{match:m,isHost:false,s:{hostId:'host'},cfg:{id:'current'}});const api={G:{match:m,netm:nm},NetMatch:NM};installRankedGearReceipt(api);
 const packet=(revision=1)=>({rk:{host:'host',match:'current',state:{mode:'zones',counts:[100,30],revision,winner:null,overtime:false}}});return {m,nm,api,packet};
};
test('Last Ditch count AP matches the maintained 0..18 integer table',()=>{assert.deepEqual(Array.from({length:22},(_,i)=>lastDitchCountAP(51-i)),[0,0,1,2,3,4,5,6,6,7,8,9,10,11,12,12,13,14,15,16,17,18]);assert.equal(lastDitchCountAP(NaN),0);});
test('ranked gear admits live host or accepted current-host follower counts only',()=>{
 const {m,nm,api,packet}=make();assert.equal(trustedRankedState(m,api),null);nm.onMessage('host',packet());assert.equal(trustedRankedState(m,api),m.ranked);
 m.ranked.counts[1]=1;assert.equal(trustedRankedState(m,api),null);m.ranked.counts[1]=30;
 nm.s.hostId='other';assert.equal(trustedRankedState(m,api),null);nm.s.hostId='host';nm.cfg.id='new';assert.equal(trustedRankedState(m,api),null);
 nm.isHost=true;m.follower=false;assert.equal(trustedRankedState(m,api),m.ranked);m.ranked.winner=0;assert.equal(trustedRankedState(m,api),null);
});
test('rejected, stale, previous-match and non-host packets cannot create gear receipts',()=>{
 for(const type of ['wrongHost','oldMatch','invalid','stale']){const {m,nm,api,packet}=make();const p=packet(type==='stale'?0:1);if(type==='oldMatch')p.rk.match='old';if(type==='invalid')p.rk.state.invalid=true;nm.onMessage(type==='wrongHost'?'impostor':'host',p);assert.equal(trustedRankedState(m,api),null,type);}
 const {m,nm,api,packet}=make();nm.onMessage('host',packet());api.G.match={...m};assert.equal(trustedRankedState(m,api),null);
});

test('optional pinned PR1223 real restore and composed Actor validate the compatibility seam',{skip:!process.env.INKWAVE_RANKED_REFERENCE},async()=>{
 const {pathToFileURL}=await import('node:url'),path=await import('node:path');
 const root=path.resolve(process.env.INKWAVE_RANKED_REFERENCE);
 const {RankedEngine}=await import(pathToFileURL(path.join(root,'engine.mjs')));
 const {installRankedNetwork}=await import(pathToFileURL(path.join(root,'network.mjs')));
 const {fixture}=await import('./source-fixture.mjs');
 const f=await fixture({fullRuntime:true,productionComposition:true,extraExports:"export {installRankedGearReceipt, trustedRankedState} from './patches/splatoon3/runtime/ranked-gear.mjs';"});
 const a=f.make();a.s3.loadout[0].main='lastDitchEffort';a.s3RefreshGear();
 const stage={id:'gear-fixture',zones:[{center:[0,0,0],size:[4,4]}]};
 const engine=new RankedEngine('zones',stage),m={mode:'zones',follower:true,ranked:engine,time:200,state:'playing',playing:()=>true,actors:[a],rankedGains:[0,0]};f.G.match=m;f.G.actors=[a];
 const nm=Object.create(f.NetMatch.prototype);Object.assign(nm,{match:m,cfg:{id:'current'},s:{hostId:'host',isHost:false},myId:'local',byNid:new Map()});f.G.netm=nm;
 installRankedNetwork(f);f.installRankedGearReceipt(f);
 const host=new RankedEngine('zones',stage);host.counts[1]=30;host.revision=2;host.time=200;
 const packet={k:'rkstate',rk:{match:'current',host:'host',state:host.snapshot(),gains:[0,0]}};
 nm.onMessage('intruder',packet);assert.equal(f.trustedRankedState(m,f),null);m.time=20;a.s3RefreshGear();assert.equal(a.s3.abilityPoints.inkSaverMain||0,0,'unverified ranked clock cannot activate');m.time=200;
 nm.onMessage('host',packet);assert.equal(f.trustedRankedState(m,f),engine);a.s3RefreshGear();assert.equal(a.s3.abilityPoints.inkSaverMain,18);
 const malformed=structuredClone(packet);malformed.rk.state.revision=3;malformed.rk.state.rule=null;nm.onMessage('host',malformed);assert.equal(engine.revision,2);
 nm.cfg.id='next';a.s3RefreshGear();assert.equal(a.s3.abilityPoints.inkSaverMain||0,0);
});
