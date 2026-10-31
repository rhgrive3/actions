import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptQueueUiAudio20261030,UI_AUDIO_CHANGES} from '../queue-ui-audio-20261030-adapter.mjs';
const read=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
const current=rel=>adaptBuildSource(rel,read(rel));
function baseline(rel){let code=current(rel).replace('// INKWAVE queue UI/audio 20261030 applied\n','');for(const row of [...UI_AUDIO_CHANGES].reverse())if(row.rel===rel){assert.equal(code.split(row.after).length-1,row.count);code=code.split(row.after).join(row.before);}return code;}
function nodes(code,pred){const found=[];function walk(node){if(!node||typeof node!=='object')return;if(pred(node))found.push(node);for(const v of Object.values(node))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parse(code,{ecmaVersion:'latest',sourceType:'module'}));return found;}
function named(code,name,kind='FunctionDeclaration'){const node=nodes(code,n=>n.type===kind&&(n.id?.name===name||n.key?.name===name))[0];assert(node,name);return code.slice(node.start,node.end);}
const method=(code,name)=>named(code,name,'MethodDefinition');
test('the final UI/audio adapter parses every changed source and rejects duplicate or missing anchors',()=>{
 for(const rel of new Set(UI_AUDIO_CHANGES.map(x=>x.rel))){const after=current(rel),before=baseline(rel);assert.doesNotThrow(()=>parse(after,{ecmaVersion:'latest',sourceType:'module'}));const reapplied=adaptQueueUiAudio20261030(rel,before);
  // The separately validated title-budget policy is the only later pass
  // that puts its header before the existing UI/audio marker.
  const marker='// INKWAVE queue UI/audio 20261030 applied\n';
  const title='// ZEVANT lightweight title demo: scoped presentation policy.\n';
  const expected=rel==='src/main.js'&&after.startsWith(title)
    ?reapplied.replace(marker+title,title+marker):reapplied;
  assert.equal(expected,after);
  assert.equal((after.match(/INKWAVE queue UI\/audio 20261030 applied/g)||[]).length,1);assert.throws(()=>adaptQueueUiAudio20261030(rel,after),/already applied/);assert.throws(()=>adaptQueueUiAudio20261030(rel,''),/anchor/);}assert.equal(adaptQueueUiAudio20261030('unrelated','keep'),'keep');
});
test('per-tween sweep scratch preserves every emitted path through overlapping left/right wipes',()=>{
 const rel='src/ui/menu-art.js',util=current('src/ui/ui-util.js'),code=current(rel),old=baseline(rel),rng=new Function('return ('+named(util,'rng')+')')();
 const bindings={rng,TAU:Math.PI*2,f1:n=>Math.round(n*10)/10};
 const make=(s,next)=>new Function(...Object.keys(bindings),named(s,'curveThrough')+'\n'+named(s,'sweepEdge')+'\n'+named(s,'sweepClip')+'\n'+(next?named(s,'createSweepClip'):'')+'\nreturn {sweepEdge,sweepClip'+(next?',createSweepClip':'')+'};')(...Object.values(bindings));
 const a=make(old,false),b=make(code,true);
 for(const [W,H]of [[1024,768],[375,812],[1920,1080]])for(const seed of [0,3,17,1991])for(const dir of [-1,1]){
  const edge=a.sweepEdge(seed),clip=b.createSweepClip(edge,W,H,dir),other=b.createSweepClip(edge,W,H,-dir);
  for(let i=0;i<=240;i++){const k=i/240;assert.equal(clip(k),a.sweepClip(edge,W,H,k,dir));assert.equal(other(1-k),a.sweepClip(edge,W,H,1-k,-dir));}
 }
});
test('consumeMapGyro supports private scratch while public snapshots and accumulated deltas stay independent',()=>{
 const c=current('src/game/player.js'),proto=new Function('return ({'+method(c,'consumeMapGyro')+'});')();const p=Object.create(proto);p._mapGyroYaw=.3;p._mapGyroPitch=-.4;
 const first=p.consumeMapGyro();assert.deepEqual(first,{yaw:.3,pitch:-.4});assert.deepEqual(p.consumeMapGyro(),{yaw:0,pitch:0});
 const owned={yaw:9,pitch:9};p._mapGyroYaw=1;p._mapGyroPitch=2;assert.equal(p.consumeMapGyro(owned),owned);assert.deepEqual(owned,{yaw:1,pitch:2});assert.deepEqual(first,{yaw:.3,pitch:-.4});
 p._mapGyroYaw=NaN;p._mapGyroPitch=-0;assert.deepEqual(p.consumeMapGyro(owned),{yaw:0,pitch:0});
});
test('special gauge changes only the delta range, but restores whole replacement collections and exceptional values',()=>{
 const row=UI_AUDIO_CHANGES.find(x=>x.label.startsWith('special gauge'));const run=new Function('filled','L',row.after);let toggles=0;
 const segment=()=>({on:false,classList:{toggle(_name,on){this.node.on=on;toggles++;}}});const segments=()=>Array.from({length:23},()=>{const n=segment();n.classList.node=n;return n;});
 const h={spSegments:segments(),sp:{setAttribute(_key,value){this.value=value;}}},L={};run.call(h,0,L);assert.equal(toggles,23);
 for(const value of [1,2,2,1,12,23,0,NaN,7,NaN,0]){const before=toggles,previous=L.spSegments;run.call(h,value,L);assert.deepEqual(h.spSegments.map(x=>x.on),h.spSegments.map((_,i)=>i<value));if(Number.isInteger(value)&&Number.isInteger(previous))assert.equal(toggles-before,Math.abs(value-previous));}
 h.spSegments=segments();const before=toggles;run.call(h,0,L);assert.equal(toggles-before,23);assert.equal(h.sp.value,'0');
});
test('synchronous ambience and local-loop setters lease owned arguments without cross-owner or reentrant corruption',()=>{
 const code=current('src/main.js'),G={audio:{loop(){},ctx:{state:'running'}}},damp=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt));
 const proto=new Function('G','damp','return ({'+[method(code,'_updateAmbience'),method(code,'_wantLocalLoop')].join(',')+'});')(G,damp);
 const game=Object.assign(Object.create(proto),{_audioOn:true,showcase:{fullFrame:true},_recoverMainLoop:(_n,h)=>h});
 const args=[];let nested=false;game._amb={playing:true,set(arg){const value=arg.volume;args.push(arg);if(!nested){nested=true;game._updateAmbience(.03);assert.equal(arg.volume,value);} }};
 game._updateAmbience(.016);assert.notEqual(args[0],args[1]);game._updateAmbience(.02);assert.equal(args[0],args[2]);assert.equal(game._ambientSetBusy,undefined);
 const seen=[],L={};let reentered=false;L.swim={playing:true,_v:.5,set(arg){const copy={...arg};seen.push(arg);if(!reentered){reentered=true;game._wantLocalLoop(L,.2,'swim',true,.1,.8);assert.deepEqual(arg,copy);}},stop(){}};
 game._wantLocalLoop(L,.016,'swim',true,.6,1.2);assert.notEqual(seen[0],seen[1]);game._wantLocalLoop(L,.02,'swim',true,.5,1);assert.equal(seen[0],seen[2]);assert.equal(game._loopSetArgs.swim.busy,false);
 L.climb={playing:true,set(arg){assert.notEqual(arg,seen[0]);},stop(){}};game._wantLocalLoop(L,.02,'climb',true,.2,1);
});
