import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { installWeaponAudioEngine } from '../runtime/audio/engine.mjs';
import { connectOutputSafety, installFiniteAudioInputs } from '../runtime/audio/output-safety.mjs';
import { installAudioLoopDedupe } from '../../local-quality/platform-audio.mjs';
import { audioEmitterKey, selectVictim } from '../runtime/audio/bank.mjs';
import { chargerRiseBuffer, disposeChargerRise, playChargerRise } from '../runtime/audio/charger-charge-rise.mjs';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/audio/audio.js',import.meta.url),'utf8');
const source=adaptBuildSource('src/audio/audio.js',raw);
const music=fs.readFileSync(new URL('../../../inkwave-public/src/audio/music.js',import.meta.url),'utf8');
const declaration=(text,name)=>parse(text,{ecmaVersion:'latest',sourceType:'module'}).body.find(row=>row.type==='ExportNamedDeclaration'&&row.declaration?.id?.name===name).declaration;
// Preserve real private module constants lost by the method-only test loader.
// import.meta.url is bound to the original module URL, never the test's URL.
function nativeConstant(text,name,moduleURL){
  const ast=parse(text,{ecmaVersion:'latest',sourceType:'module'});
  const matches=ast.body.flatMap(row=>{
    const decl=row.type==='ExportNamedDeclaration'?row.declaration:row;
    return decl?.type==='VariableDeclaration'?decl.declarations.filter(d=>d.id.type==='Identifier'&&d.id.name===name):[];
  });
  assert.equal(matches.length,1,'one actual private declaration '+name);
  const init=matches[0].init;assert(init,'actual initializer '+name);
  let code=text.slice(init.start,init.end);const edits=[];
  function visit(node){
    if(!node||typeof node!=='object')return;
    if(node.type==='MemberExpression'&&!node.computed&&node.object?.type==='MetaProperty'&&
       node.object.meta.name==='import'&&node.object.property.name==='meta'&&node.property.name==='url'){
      edits.push([node.start-init.start,node.end-init.start]);return;
    }
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
  }
  visit(init);
  for(const [start,end] of edits.sort((a,b)=>b[0]-a[0]))code=code.slice(0,start)+'sourceURL'+code.slice(end);
  return new Function('sourceURL','return ('+code+');')(moduleURL);
}
const resolver=nativeConstant(source,'RESOLVE_WEAPON_OCCLUSION',new URL('../../../inkwave-public/src/audio/audio.js',import.meta.url).href);
const VDecl=declaration(music,'V'),V=new Function('return ('+music.slice(VDecl.start,VDecl.end)+');')();
const Engine=declaration(source,'AudioEngine');
const names=['_voice','_panner','_dist','_sendScale','play','_steal','loop','_requestSfxLoop','_activateSfxReq','_loopLive','_duckAt','duck','stopAll','_sfxSilent'];
const methods=Engine.body.body.filter(row=>names.includes(row.key.name));
const definitions=new Function('V','validPos','distCut','audioEmitterKey','selectVictim','MAX_VOICES','MAX_LOOPS','NOOP_HANDLE','taper','RESOLVE_WEAPON_OCCLUSION',
  'return ({'+methods.map(row=>source.slice(row.start,row.end)).join(',\n')+'});')(
  V,p=>p&&[p.x,p.y,p.z].every(Number.isFinite),d=>d<10?22000:Math.max(900,22000*Math.pow(.5,(d-10)/13)),
  audioEmitterKey,selectVictim,48,24,Object.freeze({playing:false,set(){},stop(){}}),v=>Math.pow(Math.min(1,Math.max(0,+v||0)),1.5),resolver);
function rig(guarded=true){
  const writes=[],nodes=[];
  function parameter(name){
    let value=1;
    const check=(method,args)=>{for(const x of args)assert.ok(Number.isFinite(x),`${name}.${method} received ${x}`);writes.push([name,method,...args]);};
    return {get value(){return value;},set value(x){check('value',[x]);value=x;},
      setValueAtTime(x,t){check('set',[x,t]);value=x;},setTargetAtTime(x,t,k){check('target',[x,t,k]);value=x;},
      linearRampToValueAtTime(x,t){check('ramp',[x,t]);value=x;},cancelScheduledValues(t){check('cancel',[t]);}};
  }
  function node(type){
    const id=nodes.length,n={type,links:[],connect(target){this.links.push(target);},disconnect(){this.links.length=0;},
      gain:parameter(`${id}.gain`),frequency:parameter(`${id}.frequency`),Q:parameter(`${id}.Q`),playbackRate:parameter(`${id}.rate`),
      positionX:parameter(`${id}.x`),positionY:parameter(`${id}.y`),positionZ:parameter(`${id}.z`),
      start(...args){for(const x of args)assert.ok(Number.isFinite(x));},stop(at){if(at!==undefined)assert.ok(Number.isFinite(at));}};
    nodes.push(n);return n;
  }
  const ctx={sampleRate:8000,currentTime:10,state:'running',destination:{},createGain:()=>node('gain'),
    createPanner:()=>node('panner'),createBiquadFilter:()=>node('filter'),createBufferSource:()=>node('source'),createWaveShaper:()=>node('shaper'),
    createBuffer(channels,length,sr){const data=Array.from({length:channels},()=>new Float32Array(length));return{length,sampleRate:sr,numberOfChannels:channels,duration:length/sr,getChannelData:i=>data[i]};}};
  class Mixer{}
  Object.assign(Mixer.prototype,definitions);
  installWeaponAudioEngine(Mixer);
  installAudioLoopDedupe(Mixer);
  if(guarded)installFiniteAudioInputs(Mixer);
  const engine=Object.assign(new Mixer(),{ctx,L:{x:0,y:0,z:0},hrtf:true,rng:()=>.5,vol:{master:1,sfx:1,music:1},
    sfxIn:node('sfxIn'),revSend:node('revSend'),duckG:node('duck'),voices:[],loops:new Set(),_sfxReq:new Set(),last:new Map(),byName:new Map(),counts:{played:0,dropped:0,stolen:0}});
  function build(v,pitch,loop=false){
    const s=ctx.createBufferSource();s.playbackRate.setValueAtTime(pitch,v.t);s._end=loop?Infinity:v.t+.1;
    s.connect(v.out);v.srcs.push(s);v.nodes.push(s);if(loop)v.endless=true;
    return {pitch(value,time){s.playbackRate.setTargetAtTime(value,time,.04);}};
  }
  const probe={gain:.5,jitter:0,minGap:0,reverb:.08,build(v,pitch){build(v,pitch);}},sustain={gain:.5,jitter:0,minGap:0,reverb:.08,loop(v,pitch){return build(v,pitch,true);}};
  engine._def=name=>name==='sustain'?sustain:probe;
  return {engine,ctx,writes,nodes};
}
test('the real composition installs finite validation outside platform loop updates',()=>{
  const calls=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body
    .filter(row=>row.type==='ExpressionStatement'&&row.expression.type==='CallExpression')
    .map(row=>row.expression.callee.name);
  assert.equal(calls.filter(name=>name==='installFiniteAudioInputs').length,1);
  assert.ok(calls.indexOf('installFiniteAudioInputs')>calls.indexOf('installAudioPlatform'));
});
test('actual composed starts reject non-finite volume/pitch before allocating a voice or committing admission',()=>{
  for(const key of ['volume','pitch'])for(const value of [NaN,Infinity,-Infinity,'Infinity','not a number',1e300,Symbol('invalid')]){
    const {engine,nodes}=rig(),count=nodes.length;
    assert.equal(engine.play('probe',{[key]:value}),null);
    const loop=engine.loop('sustain',{[key]:value});assert.equal(loop.playing,false);
    assert.equal(nodes.length,count);assert.equal(engine.counts.played,0);assert.equal(engine.last.size,0);assert.equal(engine._sfxReq.size,0);
  }
  // The same production methods without their installed boundary guard expose
  // the demonstrated bug, rather than merely testing a mirrored sanitizer.
  assert.throws(()=>rig(false).engine.play('probe',{volume:NaN}),/received NaN/);
  assert.throws(()=>rig(false).engine.loop('sustain',{volume:Infinity}),/received Infinity/);
});
test('loop updates ignore each invalid control while valid controls and default cleanup remain live',()=>{
  const {engine,writes}=rig(),handle=engine.loop('sustain',{volume:.4,pitch:.8});
  const initial=writes.length;
  handle.set({volume:NaN,pitch:Infinity});assert.equal(writes.length,initial);
  handle.set({volume:Symbol('invalid'),pitch:'invalid'});assert.equal(writes.length,initial,'reject before platform numeric coercion');
  handle.set({volume:Infinity,pitch:1.2});assert.ok(writes.some(row=>row[1]==='target'&&row[2]===1.2));
  const before=writes.length;handle.set({volume:1e300,pitch:NaN});assert.equal(writes.length,before);
  handle.stop(Infinity);assert.equal(handle.playing,false);assert.equal(engine._sfxReq.size,0);assert.equal(engine.loops.size,0);
  assert.ok(writes.every(row=>row.slice(2).every(Number.isFinite)));
});
test('duck input rejection preserves its previous envelope and stopAll invalid fade still retires requests',()=>{
  const {engine,writes}=rig();engine.duck(.3,.7);const envelope=engine._duckPts,before=writes.length;
  for(const value of [NaN,Infinity,-Infinity]){engine.duck(value,.7);engine.duck(.3,value);}
  assert.equal(engine._duckPts,envelope);assert.equal(writes.length,before);
  engine.loop('sustain',{pitch:1});engine.stopAll(Infinity);assert.equal(engine.loops.size,0);assert.equal(engine._sfxReq.size,0);
  assert.throws(()=>rig(false).engine.duck(.3,Infinity),/received Infinity/);
});
test('finite scheduling controls retain the exact composed automation and prevent overflow of combined times',()=>{
  function sequence(f){
    f.engine.play('probe',{volume:.7,pitch:1.1,at:11,delay:.2,pos:{x:2,y:1,z:-3}});
    const h=f.engine.loop('sustain',{volume:.4,pitch:.9});h.set({volume:.3,pitch:1.2});f.engine.duck(.4,.6);h.stop(.025);return f.writes;
  }
  assert.deepEqual(sequence(rig()),sequence(rig(false)),'all ordinary parameter values/times/ordering stay byte-for-byte equal in the trace');
  const {engine,nodes}=rig(),before=nodes.length;
  assert.equal(engine.play('probe',{at:Number.MAX_VALUE,delay:Number.MAX_VALUE}),null);assert.equal(nodes.length,before);
  assert.ok(engine.play('probe',{at:Infinity,delay:NaN}),'retain the existing fallback for individually invalid scheduler options');
});
test('the installed finite-input guard leaves the final output limiter curve and graph unchanged',()=>{
  const {ctx,nodes}=rig(),from=ctx.createGain(),guard=connectOutputSafety(ctx,from);
  assert.equal(from.links[0],guard);assert.equal(guard.links[0],ctx.destination);assert.equal(guard.oversample,'none');
  assert.equal(guard.curve.length,8193);
  for(let i=0;i<guard.curve.length;i++){
    const x=2*i/(guard.curve.length-1)-1,a=Math.abs(x),expected=Math.sign(x)*(a<=.8?a:.8+.16*Math.tanh((a-.8)/.16));
    assert.equal(guard.curve[i],Math.fround(expected));assert.ok(Number.isFinite(guard.curve[i]));
  }
  assert.equal(nodes.at(-1),guard);
});
test('recorded Charger rejects non-finite volume without starting sources and retains its normal phrase',async()=>{
  const {ctx,engine,nodes}=rig();ctx.decodeAudioData=async()=>ctx.createBuffer(1,16000,8000);
  try{
    assert.ok(await chargerRiseBuffer(ctx,{fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(20000)})}));
    const before=nodes.length;
    for(const volume of [NaN,Infinity,-Infinity])assert.equal(playChargerRise(engine,{volume}),null);
    assert.equal(nodes.length,before);
    assert.ok(playChargerRise(engine,{volume:.55,chargeTime:1}));
  }finally{disposeChargerRise(ctx);}
});

function musicRig(text){
  const decl=declaration(text,'MusicEngine'),methods=decl.body.body.filter(row=>['play','stop'].includes(row.key.name));
  const tracks=nativeConstant(text,'FILE_TRACK_URLS',new URL('../../../inkwave-public/src/audio/music.js',import.meta.url).href);
  const proto=new Function('SONGS','FILE_TRACK_URLS','return ({'+methods.map(row=>text.slice(row.start,row.end)).join(',\n')+'});')({battle:{}},tracks);
  const events=[],current={id:'battle',fadeOut(...args){for(const value of args)assert.ok(Number.isFinite(value));events.push(['fadeOut',...args]);}};
  const player=Object.assign(Object.create(proto),{ctx:{},current,_desiredTrack:'battle',_fileRetryCount:3,_fileErrorReported:true,_fileFailures:new Set(),
    now:()=>10,_cancelFileRetry(){events.push(['cancelRetry']);},remap(){events.push(['remap']);}});
  return {player,events,current};
}
const composedMusic=adaptBuildSource('src/audio/music.js',music);
test('music play/stop reject invalid fades before remapping or mutating a playing track',()=>{
  const {player,events,current}=musicRig(composedMusic);
  for(const fade of [NaN,Infinity,-Infinity,'Infinity','invalid']){
    assert.equal(player.play('battle',{fade}),undefined);assert.equal(player.stop(fade),undefined);
    assert.equal(player.current,current);assert.equal(player._desiredTrack,'battle');assert.equal(player._fileRetryCount,3);assert.equal(player._fileErrorReported,true);
  }
  assert.deepEqual(events,[],'even the user remapper is not invoked for an invalid fade');
  assert.throws(()=>musicRig(music).player.stop(Infinity));
});
test('valid and default music fades retain this, return value, and original transition times',()=>{
  for(const fade of [undefined,0,-1,.025,.3,1,'0.7']){
    const a=musicRig(composedMusic),b=musicRig(music);
    assert.equal(a.player.stop(fade),b.player.stop(fade));assert.deepEqual(a.events,b.events);assert.equal(a.player.current,null);
  }
});

test('method loader retains actual private constant identity and source-relative track URLs',()=>{
  assert.equal(resolver,Symbol.for('inkwave.weapon-audio.resolve-occlusion'));
  const url=new URL('../../../inkwave-public/src/audio/music.js',import.meta.url).href;
  const tracks=nativeConstant(music,'FILE_TRACK_URLS',url);
  assert(Object.isFrozen(tracks));
  assert.equal(tracks.menu,new URL('../../assets/audio/menu_the_ika_swing_aoi_kenban.mp3',url).href);
  assert.equal(tracks.battle,new URL('../../assets/audio/Jet_Arrow.mp3',url).href);
  assert.deepEqual(nativeConstant(composedMusic,'FILE_TRACK_URLS',url),tracks);
});
test('private constant extraction rejects missing bindings and evaluates the real initializer',()=>{
  assert.throws(()=>nativeConstant('const other=1;','wanted','file:///unused.js'),/one actual private declaration/);
  assert.equal(nativeConstant('const wanted=Symbol.for("actual-initializer");','wanted','file:///unused.js'),Symbol.for('actual-initializer'));
  assert.equal(nativeConstant('const wanted=new URL("./asset",import.meta.url).href;','wanted','file:///exact/source.js'),'file:///exact/asset');
});
