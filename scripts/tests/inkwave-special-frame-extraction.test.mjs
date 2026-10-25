// Focused transformed-source harness test, not a full emitted-site or browser pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../inkwave-source-composition.mjs';
const checker=fs.readFileSync(new URL('./inkwave-special-frame-emitted.test.mjs',import.meta.url),'utf8');
const parsed=parse(checker,{ecmaVersion:'latest',sourceType:'module'});
const helpers=['nodes','nativeProjectiles'].map(name=>{
 const n=parsed.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.ok(n,name);return checker.slice(n.start,n.end);
}).join('\n');
const source=adaptBuildSource('src/game/weapons.js',fs.readFileSync(new URL('../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8'));
const weapons=transformSync(source,{minify:true,format:'esm',target:'es2022'}).code;
class Vector3 {constructor(x=0,y=0,z=0){this.set(x,y,z);}set(x,y,z){Object.assign(this,{x,y,z});return this;}copy(p){return this.set(p.x,p.y,p.z);}}
function fixture(negative=false){
 const context=vm.createContext({console});
 const harness=vm.createContext({weapons,vm,THREE:{Vector3},ast:s=>parse(s,{ecmaVersion:'latest',sourceType:'module'}),key:n=>n?.name??n?.value,one:(xs,label)=>{assert.equal(xs.length,1,label);return xs[0];}});
 vm.runInContext(helpers+(negative?'\n// Negative control restores the missing-dependency extraction.\n':''),harness);
 if(negative)vm.runInContext('nativeProjectiles='+harness.nativeProjectiles.toString().replace('methods.forEach(visit);',''),harness);
 const G={},P=harness.nativeProjectiles(context,G),p=new P();
 Object.assign(p,{list:[],pool:[],inkFlight:{restore(){},reset(){}},projectileVisuals:{reset(){}}});
 return p;
}
test('actual production-transformed native ghost retains its module-local assignment helper',()=>{
 const p=fixture(),actor={team:1,remote:true},packet=[0,'p',7,'blast','inkVac',2,3,4,0,0,30,0,4,0,6,.2,0,0,0,0,.2,1,1,0,0,0,0];
 const ghost=p.ghostProjectile(actor,packet);
 assert.equal(ghost.ghost,true);assert.equal(ghost.owner,actor);assert.equal(ghost.wid,'inkVac');assert.equal(ghost.team,1);assert.equal(ghost.life,4);
 assert.deepEqual([ghost.pos.x,ghost.pos.y,ghost.pos.z],[2,3,4]);assert.equal(p.list[0],ghost);
});
test('negative control rejects the former methods-only extraction',()=>{
 const p=fixture(true);assert.throws(()=>p.ghostProjectile({team:0},[0,'p',7,'blast','inkVac',2,3,4,0,0,30,0,4,0,6,.2,0,0,0,0,.2,1,1,0,0,0,0]),/is not defined/);
});
