import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const source=fs.readFileSync(new URL('../runtime/all-specials.mjs',import.meta.url),'utf8');
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/special-world-circles-before-6dacd470.json',import.meta.url)));
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const declaration=name=>{
  const node=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);
  assert.ok(node,'production function '+name);return source.slice(node.start,node.end);
};
const constants=source.slice(source.indexOf('const q2 ='),source.indexOf('const SPECIALS ='));
const helpers=['normalizedSeed','seedUnit','aimDirection','aimPoint','groundAt','paintStamp'].map(declaration).join('\n');
const emittedPath=process.env.SPECIAL_WORLD_EMITTED;
const baselineEmittedPath=process.env.SPECIAL_WORLD_BASELINE_EMITTED;
assert.ok(!baselineEmittedPath||emittedPath,'an emitted baseline requires the emitted candidate');
function emittedArtifact(selected,role){
  const file=fs.realpathSync(selected),site=path.resolve(path.dirname(file),'../../..');
  const rel='patches/splatoon3/runtime/all-specials.mjs',manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
  const hash=value=>createHash('sha256').update(value).digest('hex');
  assert.equal(file,path.join(site,rel),'select the actual emitted all-specials module');
  assert.equal(manifest.build.optimization,'esbuild-minify','production build required');
  assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash,'artifact seal');
  assert.equal(hash(JSON.stringify(manifest.files)),manifest.inputHash,'input seal');
  const bytes=fs.readFileSync(file);assert.equal(hash(bytes),manifest.artifacts[rel],'selected actual emitted artifact');
  assert.deepEqual(fs.readFileSync(path.join(site,'_versions',manifest.build.revision,rel)),bytes,'revision copy');
  if(role==='before')assert.equal(manifest.files['patch/runtime/all-specials.mjs'],'f71a9eb647b956e4d054f0267f5f0d0987a498aa16c7484158348fb63c961070','baseline is the frozen 6dac all-specials input');
  const identity={role,file,contentHash:manifest.contentHash,artifactSHA256:hash(bytes)};
  console.log('Actual emitted world circle oracle',JSON.stringify(identity));
  const body=bytes.toString();return {body,tree:parse(body,{ecmaVersion:'latest',sourceType:'module'}),identity};
}
const afterArtifact=emittedPath?emittedArtifact(emittedPath,'after'):null;
const beforeArtifact=baselineEmittedPath?emittedArtifact(baselineEmittedPath,'before'):null;
const emittedSource=afterArtifact?.body??null,emittedAst=afterArtifact?.tree??null;
if(emittedSource&&process.env.SPECIAL_WORLD_BENCH==='1')assert.ok(beforeArtifact,'emitted timing requires SPECIAL_WORLD_BASELINE_EMITTED; never compare host-realm frozen code against a VM candidate');
function readsProperty(node,key){
  if(!node||typeof node!=='object')return false;
  if(node.type==='MemberExpression'&&(node.property.name??node.property.value)===key)return true;
  return Object.values(node).some(value=>Array.isArray(value)?value.some(n=>readsProperty(n,key)):readsProperty(value,key));
}
async function emittedKernel(math,body=emittedSource,tree=emittedAst,before=false){
  assert.equal(typeof vm.SourceTextModule,'function','actual emitted mode requires --experimental-vm-modules');
  const aliases={};
  for(const [name,marker]of Object.entries({inkstrikePaint:'_inkstrikeProbe',chumpLandingPlan:'chumpEllipse'})){
    const matches=tree.body.filter(n=>n.type==='FunctionDeclaration'&&(before&&name==='chumpLandingPlan'
      ?readsProperty(n.body,'groundHeight')&&readsProperty(n.body,'aimYaw')&&readsProperty(n.body,'positions')
      :readsProperty(n.body,marker)));
    assert.equal(matches.length,1,'unique actual emitted function '+name);aliases[name]=matches[0].id.name;
  }
  // Evaluate the complete production artifact. Only unrelated imported owners
  // are sinks; an unexpected imported call on this numerical path fails closed.
  const imports=new Map(tree.body.filter(n=>n.type==='ImportDeclaration').map(n=>[n.source.value,n.specifiers.map(s=>s.imported?.name??s.imported?.value??'default')]));
  const context=vm.createContext({Math:math,console});
  const module=new vm.SourceTextModule(body+'\nexport {'+Object.entries(aliases).map(([name,local])=>local+' as '+name).join(',')+'};',{context});
  await module.link(spec=>new vm.SyntheticModule(imports.get(spec),function(){for(const name of imports.get(spec)){
    // Required only by the unrelated Inkjet module initializer; these circle
    // functions never use its cannon socket or any other imported owner.
    this.setExport(name,name==='SPECIAL_DEVICES'?{inkjet:[{aim:true,pos:[0,0,0]}]}:()=>{throw Error('unexpected emitted numerical dependency '+spec+':'+name);});
  }},{context}));
  await module.evaluate();return module.namespace;
}
async function kernel(before=false,instrument=true){
  let cos=0,sin=0;const math=instrument?Object.create(Math):Math;
  if(instrument){math.cos=value=>{cos++;return Math.cos(value);};math.sin=value=>{sin++;return Math.sin(value);};}
  const artifact=before?beforeArtifact:afterArtifact;
  if(artifact)return {...await emittedKernel(math,artifact.body,artifact.tree,before),calls:()=>({cos,sin})};
  const code=constants+'\nconst FPS=60,MAX_STAMP_RADIUS=3.74;\n'+helpers+'\n'+
    (before?'':declaration('specialCirclePoints')+'\n'+declaration('chumpPositionsFromTarget')+'\nlet inkstrikePaintCircle=null;\n')+
    (before?frozen.inkstrikePaint:declaration('inkstrikePaint'))+'\n'+
    (before?frozen.chumpLandingPlan:declaration('chumpLandingPlan'))+'\nreturn {inkstrikePaint,chumpLandingPlan};';
  return {...new Function('Math',code)(math),calls:()=>({cos,sin})};
}
function world(){
  const calls=[],stamps=[],credits=[];
  const actor={team:0,remote:false,pos:new THREE.Vector3(0,1,0),aimPoint:new THREE.Vector3(3,0,24),aimDir:new THREE.Vector3(0,0,1),aimYaw:.2,
    addTurfNoSpecial:value=>credits.push(value)};
  const control={epoch:0,reenter:null};
  const floor=(x,z)=>.1*Math.sin(x*.13)+.08*Math.cos(z*.17)+control.epoch*.01;
  const level={groundHeight(x,z,y){calls.push(['floor',x,z,y]);return Math.abs(x)>35&&control.epoch%2?-Infinity:floor(x,z);}};
  const physics={raycast(from,dir,distance,hit){
    calls.push(['ray',...from.toArray(),...dir.toArray(),distance]);
    const reenter=control.reenter;control.reenter=null;reenter?.();
    const y=floor(from.x,from.z),d=(from.y-y)/-dir.y;
    hit.hit=dir.y<-.9&&d>=0&&d<=distance;
    if(hit.hit){hit.point.set(from.x,y,from.z);hit.normal.set(-.013*Math.cos(from.x*.13),1,.0136*Math.sin(from.z*.17)).normalize();}
    return hit;
  }};
  const paint={splat(point,radius,team,opts){stamps.push({pos:point.toArray(),radius,team,seed:opts.seed,claimMode:opts.claimMode,owner:opts.claimOwner===actor});return .25;}};
  const rt={api:{THREE,G:{physics,level,paint}},up:new THREE.Vector3(0,1,0),down:new THREE.Vector3(0,-1,0),hit:{hit:false,point:new THREE.Vector3(),normal:new THREE.Vector3()}};
  for(let i=0;i<16;i++)rt['v'+i]=new THREE.Vector3();
  return {rt,actor,control,calls,stamps,credits};
}
const previewOut=()=>({target:new THREE.Vector3(),positions:Array.from({length:12},()=>new THREE.Vector3()),direction:new THREE.Vector3(),side:new THREE.Vector3()});
const snapshot=plan=>({target:plan.target.toArray(),positions:Array.from(plan.positions,v=>v.toArray()),
  ...(plan.direction?{direction:plan.direction.toArray(),side:plan.side.toArray()}:{})});

test('Inkstrike circle preserves every source point, ground query, paint seed and credit while evaluating trig once',async()=>{
  const a=await kernel(true),b=await kernel(),wa=world(),wb=world();
  for(let object=0;object<3;object++){
    const objects=[wa,wb].map(w=>({owner:w.actor,pos:new THREE.Vector3(object*2,.2,-object),seed:17+object}));
    for(let frame=0;frame<=50;frame+=2){
      wa.control.epoch=wb.control.epoch=frame;
      a.inkstrikePaint(wa.rt,objects[0],frame/60);b.inkstrikePaint(wb.rt,objects[1],frame/60);
      assert.deepEqual(wb.stamps,wa.stamps);assert.deepEqual(wb.calls,wa.calls);assert.deepEqual(wb.credits,wa.credits);
      assert.equal(objects[1].paintPulse,objects[0].paintPulse);
    }
  }
  assert.deepEqual(a.calls(),{cos:1446,sin:1446});assert.deepEqual(b.calls(),{cos:20,sin:20});
});

test('Chump ellipse keeps all 30/60/120 Hz preview and launch points fresh on moving terrain, aim and seed',async()=>{
  for(const hz of [30,60,120]){
    const a=await kernel(true),b=await kernel(),wa=world(),wb=world(),sa={seed:89},sb={seed:89},oa=previewOut(),ob=previewOut();
    const targets=oa.positions.slice(),candidateTargets=ob.positions.slice();
    for(let frame=0;frame<hz*2;frame++){
      wa.control.epoch=wb.control.epoch=frame;
      if(frame===hz)sa.seed=sb.seed=229;
      for(const w of [wa,wb]){w.actor.pos.set(frame/100,1,-frame/200);w.actor.aimPoint.set(frame/7-10,0,frame%3===0?5:frame%3===1?28:60);}
      assert.deepEqual(snapshot(b.chumpLandingPlan(wb.rt,wb.actor,sb,ob)),snapshot(a.chumpLandingPlan(wa.rt,wa.actor,sa,oa)));
      assert.deepEqual(wb.calls,wa.calls,'all raycasts/height queries remain fresh at '+hz+'Hz frame '+frame);
      assert.equal(sa.seed,sb.seed,'preview never advances the launch seed');
      assert.ok(ob.positions.every((v,i)=>v===candidateTargets[i]));assert.ok(oa.positions.every((v,i)=>v===targets[i]));
    }
    assert.deepEqual(snapshot(b.chumpLandingPlan(wb.rt,wb.actor,sb)),snapshot(a.chumpLandingPlan(wa.rt,wa.actor,sa)),'launch path agrees after preview reuse');
    assert.deepEqual(wb.calls,wa.calls);
    assert.deepEqual(a.calls(),{cos:(hz*2+1)*12,sin:(hz*2+1)*12});assert.deepEqual(b.calls(),{cos:24,sin:24});
    assert.ok(Object.isFrozen(sb.chumpEllipse.points),'cached numerical samples cannot be changed by a reader');
  }
});

test('a changed seed invalidates the Chump ellipse, and nested ground callbacks retain each call\'s samples',async()=>{
  const outputs=[];
  for(const before of [true,false]){
    const k=await kernel(before),outer=world(),inner=world(),state={seed:31},out=previewOut(),nested=[];
    k.chumpLandingPlan(outer.rt,outer.actor,state,out);
    // Re-enter during a per-point terrain query, after the outer rotation has
    // been sampled. Both calls deliberately share only the activation state.
    let rays=0;const ray=outer.rt.api.G.physics.raycast;
    outer.rt.api.G.physics.raycast=function(...args){if(++rays===5){state.seed=797;nested.push(snapshot(k.chumpLandingPlan(inner.rt,inner.actor,state,previewOut())));}return ray.apply(this,args);};
    const first=snapshot(k.chumpLandingPlan(outer.rt,outer.actor,state,out));
    const next=snapshot(k.chumpLandingPlan(outer.rt,outer.actor,state,out));
    outputs.push({first,next,nested,calls:outer.calls,innerCalls:inner.calls,seed:state.seed});
  }
  assert.deepEqual(outputs[1],outputs[0]);assert.notDeepEqual(outputs[1].first.positions,outputs[1].next.positions);
});

test('remote Inkstrike exits before sampling a circle, querying terrain or painting',async()=>{
  const a=await kernel(true),b=await kernel(),wa=world(),wb=world();wa.actor.remote=wb.actor.remote=true;
  a.inkstrikePaint(wa.rt,{owner:wa.actor,pos:new THREE.Vector3(),seed:1},.5);b.inkstrikePaint(wb.rt,{owner:wb.actor,pos:new THREE.Vector3(),seed:1},.5);
  assert.deepEqual(wb.calls,[]);assert.deepEqual(wb.stamps,[]);assert.deepEqual(b.calls(),a.calls());
});

if(typeof vm.SourceTextModule==='function'&&!emittedSource)test('complete-module AST loader executes the source functions before an emitted build is selected',async()=>{
  const baseline=await kernel(true),module=await emittedKernel(Math,source,ast),a=world(),b=world();
  assert.deepEqual(snapshot(module.chumpLandingPlan(b.rt,b.actor,{seed:71})),snapshot(baseline.chumpLandingPlan(a.rt,a.actor,{seed:71})));
  baseline.inkstrikePaint(a.rt,{owner:a.actor,pos:new THREE.Vector3(),seed:71},.5);
  module.inkstrikePaint(b.rt,{owner:b.actor,pos:new THREE.Vector3(),seed:71},.5);
  assert.deepEqual(b.calls,a.calls);assert.deepEqual(b.stamps,a.stamps);
});

if(process.env.SPECIAL_WORLD_BENCH==='1')test('optional isolated numerical-plan benchmark (not game FPS)',async t=>{
  const runs={before:[],after:[]},kernels={before:await kernel(true,false),after:await kernel(false,false)};
  const checksums={before:0,after:0};
  for(let repeat=-2;repeat<9;repeat++)for(const name of repeat%2?['after','before']:['before','after']){
    const w=world(),state={seed:123},out=previewOut(),k=kernels[name];
    // Remove observer log allocation from both measured paths. These sinks
    // retain the same deterministic contacts and numerical output work.
    w.rt.api.G.physics={raycast(_from,_dir,_distance,hit){hit.hit=false;return hit;}};
    w.rt.api.G.level={groundHeight:()=>0};
    const start=performance.now();
    for(let i=0;i<10000;i++){w.actor.aimPoint.x=(i%100)/10;k.chumpLandingPlan(w.rt,w.actor,state,out);checksums[name]+=out.positions[i%12].x;}
    const elapsed=performance.now()-start;if(repeat>=0)runs[name].push(elapsed);
  }
  assert.equal(checksums.after,checksums.before,'both timed paths retain identical numerical output');
  t.diagnostic(JSON.stringify({kind:'10000 Super Chump numerical preview plans, fresh contact sinks; 9 alternating repeats',
    comparison:emittedSource?'paired complete actual minified modules in equivalent VM realms':'paired source kernels in the host realm',
    mathInstrumentation:false,artifacts:emittedSource?[beforeArtifact.identity,afterArtifact.identity]:null,runs,checksums}));
});
