import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptRuntimeFrameScratch } from '../runtime-frame-scratch-adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = new URL('../../../',import.meta.url);
const raw = fs.readFileSync(new URL('inkwave-public/src/ui/hud.js',ROOT),'utf8');
const once=(source,before,after,label)=>{
  assert.equal(source.split(before).length-1,1,'unique '+label);
  return source.replace(before,after);
};
const opt = adaptRuntimeFrameScratch('src/ui/hud.js',raw,once);

test('production HUD six-layer composition parses and eliminates map-sizing allocations',()=>{
  const composed=adaptBuildSource('src/ui/hud.js',raw);
  assert.match(composed,/const small = 14\.5 \* u, large = Math\.min/);
  assert.match(composed,/if \(!Number\.isInteger\(i\) \|\| i < 0\)/);
  assert.ok(!composed.includes('const fit = (sz) =>'));
  assert.doesNotThrow(()=>new vm.SourceTextModule(composed));
  assert.throws(()=>adaptRuntimeFrameScratch('src/ui/hud.js',opt,once));
});
function mapBox(source,W,H,canvasW,canvasH) {
  const b=source.indexOf('    const t = this._mapT;');
  const a=source.lastIndexOf('    const W = innerWidth, H = innerHeight;',b);
  assert.ok(a>=0&&b>a,'real native minimap math');
  const fn=new Function('innerWidth','innerHeight','m',
    source.slice(a,b)+'\nreturn [w0,h0,w1,h1,asp,u];');
  return fn(W,H,{canvas:{width:canvasW,height:canvasH}});
}
test('HUD minimap CSS-sizing floats are identical at widescreen, portrait, tiny and zero dimensions',()=>{
  for(const [W,H] of [[1920,1080],[360,800],[390,844],[768,1024],[1024,768],[1,1],[0,0],[2,999],[999,2]]) {
    for(const [cw,ch] of [[1024,512],[512,1024],[800,800],[0,0],[1,300],[300,1],[1600,900]]) {
      assert.deepEqual(mapBox(opt,W,H,cw,ch),mapBox(raw,W,H,cw,ch),
        'viewport '+W+'x'+H+' minimap '+cw+'x'+ch);
    }
  }
});
function nativeActorFor(source) {
  const a=source.indexOf('  _actorFor(side, i) {');
  const b=source.indexOf('\n  }',a);
  assert.ok(a>=0&&b>a);
  return new Function('return function '+source.slice(a,b+4))();
}
test('squad fallback returns identical actor references for numeric and unusual property indices',()=>{
  const oldFn=nativeActorFor(raw),nextFn=nativeActorFor(opt);
  const actors=Array.from({length:8},(_,i)=>({id:'actor'+i,team:i%2}));
  const values=[0,1,2,3,4,8,-1,1.5,Infinity,NaN,'0','1','-1','01','map',null,{},Symbol('k')];
  for(const a of [[],actors,actors.filter(x=>x.team===0),[actors[0],,actors[4],actors[2]]]){
    for(const side of [0,1]){
      for(const myTeam of [0,1]){
        const ctx={_myTeam:()=>myTeam,_actors:()=>a};
        for(const i of values){
          let expected,actual,error0=null,error1=null;
          try{expected=oldFn.call(ctx,side,i)}catch(e){error0=e.name;}
          try{actual=nextFn.call(ctx,side,i)}catch(e){error1=e.name;}
          assert.equal(error1,error0);
          assert.strictEqual(actual,expected,
            'actors='+a.length+' team='+myTeam+' side='+side+' index='+String(i));
        }
      }
    }
  }
});
