// Isolated emitted-source diagnostic. Mock WebAudio nodes; no browser acceptance.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const site=path.resolve(process.argv[2]),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const audioPath=Object.keys(manifest.artifacts).find(p=>p.endsWith('/src/audio/audio.js'));
const startState=Number(process.argv[3]??1080072278)>>>0;
let state=startState,draws=0;const calls=[];
const random=()=>{const before=state;state=(Math.imul(state,1664525)+1013904223)>>>0;draws++;calls.push({draw:draws,before,after:state,stack:new Error().stack});return state/4294967296;};
const math=Object.create(Math);math.random=random;const context=vm.createContext({Math:math,console,Float32Array,Uint8Array,Map,Set,WeakMap,Object,Array,Number,String,Infinity,URL,setTimeout,clearTimeout});
const modules=new Map();
function load(relative){
 if(modules.has(relative))return modules.get(relative);
 const source=fs.readFileSync(path.join(site,relative),'utf8');assert.equal(sha(source),manifest.artifacts[relative],relative);
 const module=new vm.SourceTextModule(source,{context,identifier:relative,initializeImportMeta(meta){meta.url=pathToFileURL(path.join(site,relative)).href;}});modules.set(relative,module);
 return module;
}
const audio=load(audioPath);await audio.link((specifier,owner)=>load(path.posix.normalize(path.posix.join(path.posix.dirname(owner.identifier),specifier))));await audio.evaluate();const {AudioEngine,SFX}=audio.namespace;
const music=[...modules.values()].find(m=>m.identifier.endsWith('/src/audio/music.js')).namespace;
const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}});
const node=()=>({gain:param(),frequency:param(),Q:param(),playbackRate:param(),detune:param(),connect(){},disconnect(){},start(){},stop(){}});
const ctx={currentTime:100,sampleRate:48000,createGain:node,createBiquadFilter:node,createOscillator:node,createBufferSource:node,
 createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return {length,sampleRate,duration:length/sampleRate,getChannelData:i=>data[i]};}};
const rows=[];
for(const gap of [.01,.04]){
 const engine=new AudioEngine({music:false});engine.ctx=ctx;engine.last.set('splat_small:local',ctx.currentTime-gap);
 // Isolate play(): emitted engine construction has its own initialization RNG.
 state=startState;draws=0;calls.length=0;
 engine._voice=function(_d,t,_pos,vol){const out=node(),v=new music.V(ctx,out,t,this.rng);return {v,out,vol};};
 const value=engine.play('splat_small',{volume:.6});
 rows.push({gap,minGap:SFX.splat_small.minGap,returnedVoice:!!value,draws,state,counts:{...engine.counts},calls:[...calls]});
}
assert.equal(rows[0].draws,0);assert.equal(rows[0].state,startState);assert.equal(rows[0].counts.dropped,1);
let target=startState;for(let i=0;i<12;i++)target=(Math.imul(target,1664525)+1013904223)>>>0;
assert.equal(rows[1].draws,12);assert.equal(rows[1].state,target);assert.equal(rows[1].counts.played,1);
process.stdout.write(JSON.stringify({site,contentHash:manifest.contentHash,audioSha256:manifest.artifacts[audioPath],playMethodSha256:sha(AudioEngine.prototype.play.toString()),splatBuilderSha256:sha(SFX.splat_small.build.toString()),startState,rows,limit:'Isolated real emitted AudioEngine.play/SFX/V source with mocked WebAudio nodes and diagnostic clock gaps. It reproduces the exact 12-call source transition, not a completed original-browser replay or a proposed fix.'},null,2)+'\n');
