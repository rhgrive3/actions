import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {RealS3SampleLoader} from '../runtime/audio/real-s3-loader.mjs';
import {AuthorizedSamplePack} from '../runtime/audio/authorized-samples.mjs';
import {claimPreloadedMusic,cancelPreloadedMusic} from '../runtime/audio/music-preload-owner.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

const cues=['combat:critical','combat:damage','combat:ink_focus_normal','combat:ink_focus_strong','combat:splat'];
function fixture(fail=null){
  let active=0,peak=0,imports=0;const requests=[];
  const ctx={state:'running',sampleRate:8000,async decodeAudioData(){return {duration:.01,length:80,numberOfChannels:1,sampleRate:8000,getChannelData:()=>new Float32Array(80)};}};
  const pack=new AuthorizedSamplePack(ctx),bank={ctx,authorized:pack};
  const source={schema:1,usageRights:'Generated unit fixture',clips:cues.map((id,i)=>({id,event:'fire',variant:0,file:'s3-real/fixture'+i+'.mp3'}))};
  const loader=new RealS3SampleLoader(bank,{fetcher:async()=>({ok:true,json:async()=>source}),assetFetcher:async url=>{
    requests.push(String(url));active++;peak=Math.max(peak,active);await Promise.resolve();active--;
    return String(url).includes(fail||'never-match')?{ok:false,status:404}:{ok:true,headers:{get:()=>null},arrayBuffer:async()=>new ArrayBuffer(32)};
  }});
  const load=pack.load.bind(pack);pack.load=async(...a)=>{imports++;return load(...a);};
  return{loader,pack,bank,requests,imports:()=>imports,peak:()=>peak};
}
test('cold combat cues share one bounded transaction and existing per-event ensure joins its owner',async()=>{
  const f=fixture(),batch=f.loader.ensureMany(cues.map(id=>({id,event:'fire'})));
  const joined=f.loader.ensure(cues[2],'fire',{priority:true});
  const[all,one]=await Promise.all([batch,joined]);
  assert.equal(all.loaded,5);assert.equal(one.loaded,1);assert.equal(f.imports(),1);assert.equal(f.peak(),2);assert.equal(f.requests.length,5);
  assert.equal(f.loader.inFlight.size,0);assert.equal(f.pack.byEvent.size,5);
  assert.equal((await f.loader.ensureMany(cues.map(id=>({id,event:'fire'})))).loaded,0);assert.equal(f.imports(),1);
});
test('partial batch failure retains successful cues, reports per-event errors and preserves retry backoff',async()=>{
  const f=fixture('fixture2.mp3');const all=await f.loader.ensureMany(cues.map(id=>({id,event:'fire'})));
  assert.equal(all.loaded,4);assert.equal(all.errors.length,1);assert.equal(all.errors[0].id,cues[2]);
  assert.equal(f.pack.byEvent.has(cues[0]+':fire'),true);assert.equal(f.pack.byEvent.has(cues[2]+':fire'),false);
  const failed=await f.loader.ensure(cues[2],'fire');assert.equal(failed.throttled,true);assert.equal(f.requests.length,5);
  const cached=await f.loader.ensure(cues[0],'fire');assert.equal(cached.cached,true);
});
test('queued batches and independent requests never overlap source-bank transactions',async()=>{
  const f=fixture();const a=f.loader.ensureMany(cues.slice(0,3).map(id=>({id}))),b=f.loader.ensureMany(cues.slice(2).map(id=>({id}))),c=f.loader.ensure(cues[4],'fire');
  await Promise.all([a,b,c]);assert.equal(f.imports(),2);assert.equal(f.requests.length,5);assert.equal(f.pack.generation,2);assert.equal(f.pack.byEvent.size,5);
});
test('preload ownership rejects stale cancellation even when two starts reuse the same media element',()=>{
  let disposed=0;const music={_preloadedFile:{id:'battle',player:{}},_dropPreload(){disposed++;this._preloadedFile=null;}};
  const first=claimPreloadedMusic(music,{}),second=claimPreloadedMusic(music,{});
  assert.equal(cancelPreloadedMusic(first),false);assert.equal(disposed,0);
  assert.equal(cancelPreloadedMusic(second),true);assert.equal(cancelPreloadedMusic(second),false);assert.equal(disposed,1);
  music._preloadedFile={id:'battle',player:{}};const admitted=claimPreloadedMusic(music,{});music.current=music._preloadedFile.player;music._preloadedFile=null;
  assert.equal(cancelPreloadedMusic(admitted),false);assert.equal(disposed,1,'selected/current music is not cancelled');
});
test('composed offline and online starts own their preload through the admission finally guard',()=>{
  const raw=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
  const built=adaptBuildSource('src/main.js',raw);
  for(const start of ['  async startMatch(o = {}, flow = null) {','  async startNetMatch(cfg, nm) {']){
    const lo=built.indexOf(start),hi=built.indexOf('    } finally { if(!battleAdmitted)cancelPreloadedMusic(battlePreload); }',lo);
    assert.ok(lo>=0&&hi>lo);const method=built.slice(lo,hi);
    assert.ok(method.includes('const battlePreload=claimPreloadedMusic(G.music,flow)'));
    assert.ok(method.includes('battleAdmitted=true;'));assert.ok(method.includes('if (!flow.current()) return;'));
  }
  const attract=built.slice(built.indexOf('  _startAttract() {'),built.indexOf('  _updateAttract('));
  assert.match(attract,/cancelPreloadedMusic\(this\._battlePreload\)/);
});

for(const online of [false,true])test(`${online?'online':'offline'} composed START releases failed/abandoned prime and retains successful admission`,async()=>{
  const built=adaptBuildSource('src/main.js',fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8'));
  const name=online?'startNetMatch':'startMatch';
  const lo=built.indexOf(online?'  async startNetMatch(cfg, nm) {':'  async startMatch(o = {}, flow = null) {');
  const hi=built.indexOf(online?'\n  // Compile every shader variant':'\n  // ---- online (src/net/session.js',lo);
  for(const outcome of ['audio-failure','cancelled','admitted']){
    let dropped=0,current=true;const noop=()=>{};
    const music={_preloadedFile:null,preloadFile(){this._preloadedFile||={id:'battle',player:{}};},_dropPreload(){dropped++;this._preloadedFile=null;},stop:noop};
    const nm={bind(){G.netm=nm;}},map={id:'test'};
    const G={music,audio:{init:noop,requireRecordedMainShot:async()=>{if(outcome==='audio-failure')throw Error('recording unavailable');}},net:{myId:'self',match:nm,tr:{},isHost:true},projectiles:{clear:noop},fx:{clear:noop},paint:{clear:noop},env:{theme:'day'},scene:{},mode:'menu'};
    const flow={current:()=>current,match:null,net:G.net,room:G.net.tr,sessionMatch:nm};
    class Match{constructor(){this.actors=[];this.local=null;}setup(){}start(){}}
    const context={G,clearTimeout,claimPreloadedMusic,cancelPreloadedMusic,nativeStageEnabled:false,UNAVAILABLE_NATIVE_STAGES:[],validStartRoster:()=>true,isRankedMode:()=>false,WEAPONS:{},MAPS:[map],mapOfflineOk:()=>true,mapBossOk:()=>true,mapNoBots:()=>false,isRangeMap:()=>false,NATIVE_IDS:[],mapTheme:()=> 'day',MATCH:{defaultDuration:180},Match,safeWeaponId:x=>x,params:{has:()=>false},TEAM_PALETTES:[{}],COLORBLIND_PALETTE:{}};
    const method=vm.runInNewContext('({'+built.slice(lo,hi)+'}).'+name,context);
    const game={_matchFlow:flow,mapDef:map,layoutId:map.id,_builtQuality:'medium',settings:{quality:'medium'},profile:{weapon:'shooter'},time:'day',theme:'day',match:null,
      _beginMatchFlow:()=>flow,input:{requestLock:noop,mobile:{setVisible:noop}},menus:{show:noop},showcase:{hide:noop},minimap:{setViewerTeam:noop},rig:{},
      _fade:async()=>{if(outcome==='cancelled')current=false;},_applyNight:noop,_pickPalette:()=>({}),_setPalette:noop,_warmCharacters:async()=>{},_startGyro:noop};
    const promise=online?method.call(game,{map:'test',mode:'turf',roster:[{owner:'self',weapon:'shooter'}],palette:0},nm):method.call(game,{mapId:'test'},flow);
    if(outcome==='audio-failure')await assert.rejects(promise,/recording unavailable/);else await promise;
    assert.equal(dropped,outcome==='admitted'?0:1,outcome);
    assert.equal(!!music._preloadedFile,outcome==='admitted',outcome);
    if(outcome==='admitted')assert.equal(G.mode,'match');
  }
});
