import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {audioEmitterKey,selectVictim} from '../runtime/audio/bank.mjs';
const music=fs.readFileSync(new URL('../../../inkwave-public/src/audio/music.js',import.meta.url),'utf8'),audio=adaptBuildSource('src/audio/audio.js',fs.readFileSync(new URL('../../../inkwave-public/src/audio/audio.js',import.meta.url),'utf8'));
function cls(source,name){return parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name===name).declaration;}
const v=cls(music,'V'),V=new Function('return ('+music.slice(v.start,v.end)+');')();
const c=cls(audio,'AudioEngine'),methods=c.body.body.filter(n=>['_voice','_panner','_dist','_sendScale','play','_steal'].includes(n.key.name));
const proto=new Function('V','validPos','distCut','audioEmitterKey','selectVictim','MAX_VOICES','return ({'+methods.map(n=>audio.slice(n.start,n.end)).join(',\n')+'});')(V,p=>p&&[p.x,p.y,p.z].every(Number.isFinite),d=>d<10?22000:Math.max(900,22000*Math.pow(.5,(d-10)/13)),audioEmitterKey,selectVictim,48);
function rig(reuse){
 const nodes=[],param=()=>({value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}}),node=type=>{const n={type,links:[],gain:param(),Q:param(),frequency:param(),positionX:param(),positionY:param(),positionZ:param(),connect(to){this.links.push(to);},disconnect(){this.links.length=0;},stop(){}};nodes.push(n);return n;};
 let replay=null,index=0;const context={sampleRate:48000,currentTime:0,createGain:()=>replay?replay[index++]:node('gain'),createBiquadFilter:()=>replay?replay[index++]:node('filter'),createPanner:()=>replay?replay[index++]:node('panner')};
 const engine=Object.assign(Object.create(proto),{ctx:context,hrtf:true,L:{x:0,y:0,z:0},rng:()=>.5,sfxIn:node('sfxIn'),revSend:node('revSend'),byName:new Map(),last:new Map(),voices:[],counts:{played:0,dropped:0,stolen:0},_warned:new Set(),_sfxSilent:()=>false});
 engine._def=()=>({gain:1,minGap:0,jitter:0,reverb:.08,build(v){const s=node('source');s._end=v.t+.1;s.connect(v.out);v.srcs.push(s);v.nodes.push(s);}});
 const first=engine.play('impact',{pos:{x:1,y:2,z:3}}),escapedGain=first.out.gain,escapedPanner=first.panner;
 first.v.srcs[0].onended();assert.equal(first.v.dead,true);assert.equal(first.v.nodes.length,0);
 if(reuse)replay=[first.out,first.lp,first.panner,first.send];
 const next=engine.play('impact',{pos:{x:5,y:6,z:7}});
 return{first,next,escapedGain,escapedPanner,context};
}
test('actual composed public play returns escaped writable nodes that remain isolated after source onended',()=>{
 const f=rig(false);f.escapedGain.value=0;f.escapedPanner.positionX.value=-999;assert.equal(f.next.out.gain.value,1);assert.equal(f.next.panner.positionX.value,5);assert.equal(f.first.v.dead,true);assert.equal(f.next.v.dead,false);
});
test('generation/callback-safe raw graph reuse still lets escaped old AudioParams alter a new playing sound',()=>{
 const f=rig(true);assert.equal(f.first.out,f.next.out);assert.equal(f.first.panner,f.next.panner);
 f.escapedGain.value=0;f.escapedPanner.positionX.value=-999;
 assert.equal(f.next.out.gain.value,0,'stale old AudioParam mutes the new sound');assert.equal(f.next.panner.positionX.value,-999,'stale old Panner changes its localization');
 f.first.v.dispose();assert.equal(f.next.v.dead,false,'old dead guard already prevents disposal; direct escaped writes remain');assert.equal(f.next.panner.links.length,1,'new graph is live while stale writes reach it');
});
