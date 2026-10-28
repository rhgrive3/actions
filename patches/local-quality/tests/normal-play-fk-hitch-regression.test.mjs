import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adaptRetargetBranchUpdates} from '../retarget-branch-update-adapter.mjs';
import {adaptMotionSampleFkRange} from '../motion-fk-hotpath-adapter.mjs';
import {installHitchTracer} from '../range-hitch-tracer.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

const rel='src/game/motion/retarget.js';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/motion/retarget.js',import.meta.url),'utf8');
const replaceOnce=(code,from,to,name)=>{
 assert.equal(code.split(from).length,2,`Unexpected source anchor: ${name}`);
 return code.replace(from,to);
};
const assembled=adaptMotionSampleFkRange(rel,adaptRetargetBranchUpdates(rel,raw),replaceOnce);
const start=assembled.indexOf(' _rootWorld(){');
assert.ok(start>=0,'build adapter must install the contact helper');
const open=assembled.indexOf('{',start);let pos=open+1,depth=1;
while(depth>0&&pos<assembled.length){if(assembled[pos]==='{')depth++;else if(assembled[pos]==='}')depth--;pos++;}
assert.equal(depth,0);
const runRootWorld=new Function(`return function()${assembled.slice(open,pos)}`)();

test('production composition retains refreshed kid FK and the shared forward quaternion',()=>{
 const composed=adaptBuildSource(rel,raw);
 const combined='invRot=(c.kid.matrixWorld.decompose(this.ccdA,this.groundInvQ,this.ccdB),this.groundForwardQ.copy(this.groundInvQ),this.groundInvQ.invert());';
 assert.equal(composed.split(combined).length-1,1,'one exact owner performs decomposition before the retained forward copy');
 assert.equal(composed.split('q.copy(this.groundForwardQ).multiply(f.orientation);').length-1,1,'both feet read the retained forward quaternion');
 const original='invRot=c.kid.getWorldQuaternion(this.groundInvQ).invert();';
 assert.equal(raw.split(original).length-1,1);
 assert.throws(()=>adaptBuildSource(rel,raw.replace(original,'invRot=this.groundInvQ;')),/conflict|expected/,'upstream drift must fail closed');
});

function makeGraph(){
 const visited=[];
 class Node {
  constructor(name,parent=null){this.name=name;this.parent=parent;this.children=[];this.matrixAutoUpdate=true;this.matrixWorldNeedsUpdate=false;if(parent)parent.children.push(this);}
  updateWorldMatrix(parents,children){if(parents&&this.parent)this.parent.updateWorldMatrix(true,false);visited.push(this.name);if(children)for(const c of this.children)c.updateWorldMatrix(false,true);}
 }
 const root=new Node('root'),model=new Node('model',root),kid=new Node('kid',model),hips=new Node('hips',kid);
 new Node('head',hips);new Node('weapon',model);new Node('lod',root);
 const left=new Node('left',hips),right=new Node('right',hips);
 const leftFoot=new Node('leftFoot',left),rightFoot=new Node('rightFoot',right);
 return {visited,character:{root,model,kid,bones:{hips}},contacts:[{limb:{up:left},bone:leftFoot},{limb:{up:right},bone:rightFoot}],_kidWorldFresh:true};
}

test('contact FK refreshes both whole leg branches but skips unneeded hair/weapon/LOD',()=>{
 const scene=makeGraph();runRootWorld.call(scene);
 assert.deepEqual(scene.visited,['root','model','kid','hips','left','leftFoot','right','rightFoot']);
 assert.equal(scene._kidWorldFresh,false);
});
test('unexpected contact hierarchy safely falls back to full subtree refresh',()=>{
 const scene=makeGraph();scene.contacts[0].limb.up.parent=null;runRootWorld.call(scene);
 for(const name of ['head','weapon','lod','leftFoot','rightFoot'])assert(scene.visited.includes(name),name);
});

test('eight-actor profiler rebind is stable under reorder, stage exit, and disposal',()=>{
 let rays=0,splats=0,clock=0;
 const physics={raycast(){rays++;return 1;}};
 const paint={splat(){splats++;return 1;}};
 const originalRay=physics.raycast,originalSplat=paint.splat;
 const actors=Array.from({length:8},(_,id)=>({id,update(){physics.raycast();paint.splat();}}));
 const originals=new Map(actors.map(a=>[a,a.update]));
 const env={__G:{level:{native:true,triangleWorld:{}},physics,paint,match:{actors}}};
 const game={R:{},_frame(){for(const a of env.__G.match.actors)a.update();}};
 const originalFrame=game._frame;
 const tracer=installHitchTracer(game,{env,now:()=>++clock,maxFrames:30});
 assert.strictEqual(installHitchTracer(game,{env}),tracer,'second install must not add nested hooks');
 for(let t=0;t<5;t++){
  actors.reverse();game._frame(.016);tracer.record(100+t*16,2,{phase:'battle'});
  const counts=tracer.lastFrameMetrics().calls;
  for(const name of ['world-ray','physics-ray','paint-stamp','paint-splat'])assert.equal(counts[name],8,name);
  for(let i=0;i<8;i++)assert.equal(counts['actor-'+i],1);
 }
 assert.equal(rays,40);assert.equal(splats,40);
 env.__G.level.native=false;game._frame(.016);tracer.record(200,2);
 assert.equal(tracer.lastFrameMetrics().scopeAliases,null);
 for(const a of actors)assert.strictEqual(a.update,originals.get(a));
 tracer.dispose();assert.strictEqual(game._frame,originalFrame);
 assert.strictEqual(physics.raycast,originalRay);assert.strictEqual(paint.splat,originalSplat);
});
