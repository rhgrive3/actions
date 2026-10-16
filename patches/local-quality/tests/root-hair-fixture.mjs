import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
export const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
export const REL='src/game/motion/root-hair.js';
export const baseline=fs.readFileSync(new URL('./fixtures/root-hair-07f44b97.mjs.txt',import.meta.url),'utf8');
export async function rootHairFixture(old=false){
 const site=process.env.INKWAVE_BUILT_SITE||path.join(ROOT,'inkwave-public');
 const context=vm.createContext({console}),modules=new Map();
 const code=old?baseline:process.env.INKWAVE_BUILT_SITE?fs.readFileSync(path.join(site,REL),'utf8'):adaptBuildSource(REL,baseline);
 const THREEFILE=path.join(site,'vendor/three/build/three.module.js');
 function load(file){if(modules.has(file))return modules.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});modules.set(file,m);return m;}
 const clamp=new vm.SyntheticModule(['clamp'],function(){this.setExport('clamp',(x,a,b)=>Math.max(a,Math.min(b,x)));},{context});
 const entry=new vm.SourceTextModule('const IW_MATH=Object.create(Math);\n'+code.replaceAll('Math.','IW_MATH.')+'\nexport const VM_MATH=IW_MATH;',{context});
 await entry.link((spec,from)=>spec==='three'?load(THREEFILE):spec==='./source-bank.js'?clamp:load(path.resolve(path.dirname(from.identifier),spec)));
 await entry.evaluate();return {...entry.namespace,THREE:modules.get(THREEFILE).namespace};
}
export function makeHair(api,strands=6){
 const {THREE}=api,root=new THREE.Bone(),head=new THREE.Bone();root.add(head);
 const character={bones:{head},hairMeta:[],_kidXform(b,p,q){b.updateWorldMatrix(true,false);b.getWorldPosition(p);b.getWorldQuaternion(q);}};
 for(let si=0;si<strands;si++){
  character.hairMeta.push({K:.4+si*.17,len:.09+si*.052});let parent=head;
  for(let k=0;k<4;k++){const b=new THREE.Bone();b.position.set(.03*(si-2),-.06,.02*k);parent.add(b);parent=b;character.bones[k<3?`hair${si}_${k}`:`hairTip${si}`]=b;}
 }
 return {hair:new api.RootHairInertia(character),character,root};
}
export function hairSnapshot(f){return {state:Array.from(f.hair.state),result:Array.from(f.hair.result),bones:Object.values(f.character.bones).map(b=>[...b.quaternion.toArray(),...b.matrixWorld.elements])};}
