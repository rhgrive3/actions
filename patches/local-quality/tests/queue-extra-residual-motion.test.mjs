import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const root=new URL('../../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
function method(source,name){const start=source.indexOf('  '+name+'(');assert.ok(start>=0);const end=source.indexOf('\n  }',start);assert.ok(end>start);return source.slice(start,end+4).trim();}
test('actual positive-spread direction and RNG are exact with one tangent; zero spread consumes nothing',()=>{
 const next=method(adaptBuildSource('src/game/weapons.js',read('inkwave-public/src/game/weapons.js')),'_spread');
 assert.ok(next.includes('const tanR=Math.tan(r)'));
 const old=next.replace('    const tanR=Math.tan(r);\n','').replaceAll('* tanR','* Math.tan(r)');
 const run=(source,vector,deg,seed)=>{let draws=0,tan=0;const math=Object.create(Math);math.random=()=>{draws++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};math.tan=x=>{tan++;return Math.tan(x);};
  const fn=new Function('Math','DEG','_v2','_v3','return ({'+source+'})._spread;')(math,Math.PI/180,new THREE.Vector3(),new THREE.Vector3());const dir=vector.clone(),returned=fn(dir,deg);assert.equal(returned,dir);return{value:dir.toArray(),draws,tan};};
 let cases=0;for(let i=0;i<18000;i++){
  const dir=new THREE.Vector3(Math.sin(i*.137),Math.cos(i*.19)*.4,Math.cos(i*.137)).normalize(),deg=[0,-0,-1,1e-15,.1,2,14,89,NaN,Infinity][i%10],seed=i+1;
  const a=run(old,dir,deg,seed),b=run(next,dir,deg,seed);assert.deepEqual(b.value,a.value);assert.equal(b.draws,a.draws);assert.equal(b.tan,deg<=0?0:1);assert.equal(a.tan,deg<=0?0:2);cases++;
 }
 console.log(JSON.stringify({scope:'actual composed spread method and real Three vectors',cases}));
});
test('actual fist presentation preserves both transforms while trig evaluations fall 8 to 2 per active update',()=>{
 const all=read('patches/splatoon3/runtime/special-motion.mjs'),start=all.indexOf('  function fists(ch,m){'),end=all.indexOf('\n  cp.update=',start),next=all.slice(start,end);assert.ok(next.includes('const fistCos=Math.cos(m.fistYaw),fistSin=Math.sin(m.fistYaw)'));
 const old=next.replace('    const fistCos=Math.cos(m.fistYaw),fistSin=Math.sin(m.fistYaw);\n','').replaceAll('*.85*fistCos','*.85*Math.cos(m.fistYaw)').replaceAll('*.12*fistSin','*.12*Math.sin(m.fistYaw)').replaceAll('+.12*fistSin','+.12*Math.sin(m.fistYaw)').replaceAll('*.85*fistSin','*.85*Math.sin(m.fistYaw)').replaceAll('+.12*fistCos','+.12*Math.cos(m.fistYaw)');
 const group=()=>({position:new THREE.Vector3(),rotation:new THREE.Euler(),scale:new THREE.Vector3(),userData:{energy:{material:{uniforms:{age:{value:0}}}}}});
 function run(code,yaw,phase,remaining,remote,alive){const G={time:3},clamp=x=>Math.max(0,Math.min(1,x));let sin=0,cos=0;const math=Object.create(Math);math.sin=x=>{sin++;return Math.sin(x);};math.cos=x=>{cos++;return Math.cos(x);};
  const fn=new Function('G','clamp','FIST_TRAVEL','presentationShown','Math',code+'\nreturn fists;')(G,clamp,.25,()=>true,math),token={remaining},state={id:'slam',phase,t:.13};
  const a={pos:new THREE.Vector3(.7,.8,.9),yaw,alive,remote,specialActive:state,_s3TripleSlamFists:token},m={fistToken:token,fistYaw:yaw,centers:[{x:-1,y:0,z:1},{x:1,y:0,z:1}],ground:[.1,.2],remoteSource:state,remoteFist:token,fists:{visible:false,children:[group(),group()]}};
  fn({actor:a,s3SpecialPresentationEnabled:true},m);return{visible:m.fists.visible,sin,cos,transforms:m.fists.children.map(g=>[g.position.toArray(),g.rotation.toArray(),g.scale.toArray(),g.userData.energy.material.uniforms.age.value])};}
 for(const yaw of [0,-0,Math.PI,-Math.PI,1e-20,1e10,NaN,Infinity])for(const phase of ['rise','hang','fall'])for(const remaining of [undefined,0,.1,.25])for(const remote of [false,true])for(const alive of [false,true]){
  const a=run(old,yaw,phase,remaining,remote,alive),b=run(next,yaw,phase,remaining,remote,alive);assert.deepEqual(b.transforms,a.transforms);assert.equal(b.visible,a.visible);assert.equal(b.sin,a.visible?1:0);assert.equal(b.cos,a.visible?1:0);assert.equal(a.sin,a.visible?4:0);assert.equal(a.cos,a.visible?4:0);
 }
});
test('ghost catalogue validation retains exact allowed modes, SameValueZero and receiver rejection ordering',()=>{
 const code=read('patches/splatoon3/runtime/main-weapon-catalog.mjs'),match=code.match(/const GHOST_CATALOG_SHOT_MODES=Object.freeze\((\[[^;]+\])\);/);assert.ok(match);
 const expected=['normal','blaster-jump','variable','turret','horizontal','vertical','brush','slosh','pellet','arrow','saber-horizontal','saber-vertical'],shared=new Function(match[0]+'return GHOST_CATALOG_SHOT_MODES;')();assert.deepEqual(shared,expected);assert.ok(Object.isFrozen(shared));
 const start=code.indexOf('  P.ghostProjectile=function(a,e){'),end=code.indexOf('      try {',start),prefix=code.slice(start,end);assert.ok(prefix.includes('GHOST_CATALOG_SHOT_MODES.includes(meta[1])'));assert.ok(!prefix.includes('const allowed='));assert.equal(code.split('GHOST_CATALOG_SHOT_MODES').length-1,2,'private definition and one nonescaping use');
 const next=prefix.slice(prefix.indexOf('    if(p&&r'),prefix.lastIndexOf('{')).trim().replace(/^if\(/,'').replace(/\)$/,'');
 const old=next.replace('GHOST_CATALOG_SHOT_MODES.includes(meta[1])','allowed.includes(meta[1])');const compile=expr=>new Function('p','r','layout','meta','GHOST_CATALOG_SHOT_MODES','allowed','return '+expr+';');
 const kernels=[compile(old),compile(next)],modes=[...expected,'Normal','unknown',undefined,null,0,NaN,{},Symbol('mode')];
 for(const mode of modes)for(const present of [false,true])for(const legacy of [false,true])for(const layout of [false,true])for(const unit of [-1,0,29,30,NaN])for(const charge of [-1,0,1,2,NaN]){
  const args=[present?{}:null,{legacy},layout,[1,mode,unit,charge],shared,expected];assert.equal(kernels[1](...args),kernels[0](...args));
 }
});
