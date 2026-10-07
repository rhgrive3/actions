import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {installAudioLoopDedupe} from '../platform-audio.mjs';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/audio/audio.js',import.meta.url),'utf8');
const ast=parse(raw,{ecmaVersion:'latest',sourceType:'module'});
const cls=ast.body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='AudioEngine').declaration;
const method=cls.body.body.find(n=>n.key.name==='loop');
function rig(patched=true){
 const C=vm.runInNewContext(`(class {${raw.slice(method.start,method.end)}})`,{console,MAX_LOOPS:24,NOOP_HANDLE:{playing:false,set(){},stop(){}}});
 const calls=[],fades=[],voices=[];const e=new C();e.ctx={currentTime:0};e.loops=new Set();
 e._def=()=>({gain:.5,loop:()=>({pitch:(value,time)=>{calls.push(['pitch',value,time]);calls.push(['lfo',value,time]);}})});
 e._voice=(_d,_t,pos,value)=>{const v={dead:false,kill:t=>{fades.push(['kill',t]);},dispose(){this.dead=true;}};voices.push(v);return {v,out:{gain:{setTargetAtTime:(...args)=>calls.push(['volume',...args])}},fade:{gain:{setValueAtTime:(...args)=>fades.push(['value',...args]),linearRampToValueAtTime:(...args)=>fades.push(['ramp',...args]),cancelScheduledValues:(...args)=>fades.push(['cancel',...args])}}};};
 e._setPos=(_v,pos,time)=>calls.push(['pos',pos.x,pos.y,pos.z,time]);
 if(patched)installAudioLoopDedupe(C);
 return {e,calls,fades,voices};
}
test('#957 native loop negative control repeats targets; patched steady loop schedules none at 30/60/120/144Hz',()=>{
 for(const patched of [false,true])for(const hz of [30,60,120,144]){
  const f=rig(patched),h=f.e.loop('climb',{volume:.55,pitch:1,pos:{x:0,y:0,z:0}});
  for(let i=0;i<hz*2;i++){f.e.ctx.currentTime=i/hz;h.set({volume:.55,pitch:1,pos:{x:0,y:0,z:0}});}
  assert.equal(f.calls.length,patched?0:hz*2*4);
 }
});
test('#957 real target changes schedule once; gradual sub-epsilon moves accumulate from last sent target',()=>{
 const f=rig(),h=f.e.loop('swim',{volume:.55,pitch:1,pos:{x:0,y:0,z:0}});
 h.set({volume:.3,pitch:1.2,pos:{x:1,y:0,z:0}});assert.equal(f.calls.length,4);
 h.set({volume:.3,pitch:1.2,pos:{x:1,y:0,z:0}});assert.equal(f.calls.length,4);
 for(let i=1;i<=20;i++)h.set({volume:.3+i*1e-6});assert.ok(f.calls.length>4);
 const n=f.calls.length;h.set({volume:NaN,pitch:Infinity,pos:{x:NaN,y:0,z:0}});h.set(null);assert.equal(f.calls.length,n);
});
test('#957 position cache copies coordinates, independent handles and recreated voices remain independent',()=>{
 const f=rig(),pos={x:0,y:0,z:0},a=f.e.loop('a',{pos}),b=f.e.loop('b',{volume:0});
 pos.x=2;a.set({pos});assert.equal(f.calls.at(-1)[1],2);
 b.set({volume:.5});a.set({volume:.5});assert.equal(f.calls.filter(c=>c[0]==='volume').length,2);
 a.stop(.2);const n=f.calls.length;a.set({volume:.2,pitch:2});assert.equal(f.calls.length,n);assert.ok(f.fades.some(c=>c[0]==='kill'));
 const c=f.e.loop('a',{volume:0});c.set({volume:.5});assert.equal(f.calls.length,n+1);f.voices.at(-1).dead=true;c.set({volume:.8});assert.equal(f.calls.length,n+1);
});
