import fs from 'node:fs';import assert from 'node:assert/strict';
import test from 'node:test';
// Bounded actor-selection regression: production source block, mocked geometry.
// Does not claim installed fixture, emitted build or browser acceptance.
const fixed=fs.readFileSync(new URL('../runtime/main-weapon-catalog.mjs',import.meta.url),'utf8');
const original=fixed.replace('q.playerRadius0=undefined;', '')
 .replace("const pr0=q.playerRadius0??=(collisionRadius(q.param,'Player',(p.age-DT)*HZ,s.index,bounceScale)),radius=q.playerRadius1;", "const pr0=collisionRadius(q.param,'Player',(p.age-DT)*HZ,s.index,bounceScale),radius=q.playerRadius1;");
assert.notEqual(original,fixed,'reference must bypass previous-radius cache');
const extract=s=>{const a=s.indexOf('      let pr1=-Infinity;'),b=s.indexOf('      if(unitCanDamage&&G.boss)',a);assert.ok(a>0&&b>a);return s.slice(a,b)};
const steps=[{age:.1,bounce:0,eligible:true,blocked:false},{age:.2,bounce:1,eligible:true,blocked:false},{age:.4,bounce:2,eligible:false,blocked:false},{age:.7,bounce:3,eligible:true,blocked:true},{age:1,bounce:0,eligible:true,blocked:false},{age:.05,bounce:2,eligible:true,blocked:false},{age:.8,bounce:1,eligible:true,blocked:false,empty:true}];
function run(source){const shapes=[0,1].map(i=>({param:{i},from:{},to:{},stop:1}));const p={age:0,owner:{},team:1},s={index:0,seen:new Set()};let calls=0;const runStep=new Function('shapes','p','s','bounceScale','G','collisionRadius',`const HZ=60,DT=1/60,EPS=1e-9,unitCanDamage=true,d={c:{}},PLAYER={};let stop=Infinity,target=null,defense=null;const hurtboxRadius=()=>.2,hurtboxHeight=()=>1,spiralContactClear=()=>true,capsuleEntry=(from,to,pos,hr,hh,r0,r1)=>(r0+r1+pos.x)/100;${extract(source)}return {pr1,stop,targetIndex:G.actors.indexOf(target)};`);return steps.map(step=>{p.age=step.age;for(const q of shapes)q.stop=step.blocked?-1:1;const actors=(step.empty?[]:[0,.1,.2]).map(x=>({pos:{x},alive:step.eligible,team:2}));const before=calls;const value=runStep(shapes,p,s,step.bounce,{actors},(q,w,t,i,bounce)=>{calls++;return q.i+.1+t/60+bounce*.3});return{value,calls:calls-before};});}
test('previous radius cache resets across same-shape age, bounce and eligibility transitions',()=>{
const before=run(original),after=run(fixed);for(let i=0;i<steps.length;i++){assert.deepEqual(after[i].value,before[i].value);assert.ok(after[i].calls<=before[i].calls);if(!steps[i].eligible||steps[i].blocked)assert.equal(after[i].calls,before[i].calls);}
const mutant=fixed.replace('q.playerRadius0=undefined;','/* intentionally omit reset */');assert.notEqual(mutant,fixed);const wrong=run(mutant);assert.deepEqual(wrong[0].value,before[0].value);assert.notDeepEqual(wrong[1].value,before[1].value);assert.notDeepEqual(wrong[4].value,before[4].value);
});

test('no previous-radius evaluations without eligible unblocked actors',()=>{
 const before=run(original),after=run(fixed);
 assert.equal(after[2].calls,2);assert.equal(after[3].calls,2);assert.equal(after[6].calls,2);
 assert.equal(after[2].calls,before[2].calls);assert.equal(after[3].calls,before[3].calls);
 const eager=fixed.replace('q.playerRadius0=undefined;',"q.playerRadius0=collisionRadius(q.param,'Player',(p.age-DT)*HZ,s.index,bounceScale);");
 const bad=run(eager);assert.equal(bad[2].calls,4);assert.equal(bad[3].calls,4);assert.equal(bad[6].calls,4);
});
