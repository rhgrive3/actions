// DO NOT MERGE. Source-bound CPU counterfactual for #1434/#1565 only.
// No browser timing, whole-bundle adoption, device or speedup claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {contactPoseSnapshot} from './source-contact-fixture.mjs';
import {adaptBuildSource as baseline} from '../../../scripts/inkwave-source-composition.mjs';

if(process.env.INKWAVE_BUILT_SITE)throw Error('Source counterfactual cannot be relabeled as an emitted test');
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const BASE='98ccd1c6ea143ea402319c6637cd1bca5d075a6e';
const ADAPTER='patches/local-quality/combat-gpu-cpu-perfect-adapter.mjs';
const SCOPE=['src/game/character.js','src/game/motion/retarget.js'];
const signature='export function adaptCombatWave345(rel, code, replaceOnce) {\n';
const guard="    // DO NOT MERGE: matched diagnostic baseline from current 98ccd1c6.\n    // Disable only the six applied CPU ancestor/quaternion transformations.\n    // RootHair MOT-04 is already unmatched here; all other Wave owners stay on.\n    if (rel === 'src/game/character.js' || rel === 'src/game/motion/retarget.js') return code;\n";
const oldAdapter=execFileSync('git',['show',BASE+':'+ADAPTER],{cwd:ROOT,encoding:'utf8',maxBuffer:1024*1024});
const newAdapter=fs.readFileSync(path.join(ROOT,ADAPTER),'utf8');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
assert.equal(oldAdapter.split(signature).length,2);
assert.equal(newAdapter,oldAdapter.replace(signature,signature+guard),'only the exact two-rel final-pass guard differs');
const nativeAdapter=await import('data:text/javascript;base64,'+Buffer.from(oldAdapter).toString('base64'));
const composerURL=new URL('../../../scripts/inkwave-source-composition.mjs',import.meta.url);
const context=vm.createContext({console}),imports=new Map();
const composer=new vm.SourceTextModule(fs.readFileSync(composerURL,'utf8'),{context,identifier:fileURLToPath(composerURL)});
await composer.link(async spec=>{
  if(imports.has(spec))return imports.get(spec);
  const resolved=new URL(spec,composerURL),actual=resolved.pathname===path.join(ROOT,ADAPTER)?nativeAdapter:await import(resolved);
  const names=Object.keys(actual),module=new vm.SyntheticModule(names,function(){for(const name of names)this.setExport(name,actual[name]);},{context});
  imports.set(spec,module);return module;
});await composer.evaluate();
const candidate=composer.namespace.adaptBuildSource;
const raw=rel=>fs.readFileSync(path.join(ROOT,'inkwave-public',rel),'utf8');
const compiled=new Map();
function pair(rel){if(!compiled.has(rel))compiled.set(rel,{C:baseline(rel,raw(rel)),B:candidate(rel,raw(rel))});return compiled.get(rel);}
function literal(node){return node?.type==='Literal'?node.value:node?.type==='TemplateLiteral'&&!node.expressions.length?node.quasis[0].value.cooked:null;}
const ast=parse(oldAdapter,{ecmaVersion:'latest',sourceType:'module'}),hunks=[];
function visit(node,rel=null){
  if(!node||typeof node!=='object')return;
  if(node.type==='IfStatement'&&node.test.type==='BinaryExpression'&&node.test.operator==='==='&&node.test.left.name==='rel'&&typeof literal(node.test.right)==='string')rel=literal(node.test.right);
  if(node.type==='CallExpression'&&node.callee.name==='applyWave345Compatible')hunks.push({rel,before:literal(node.arguments[1]),after:literal(node.arguments[2]),label:literal(node.arguments[4])});
  for(const value of Object.values(node))if(Array.isArray(value)){for(const item of value)visit(item,rel);}else if(value&&typeof value==='object')visit(value,rel);
}
visit(ast.body.find(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.id?.name==='adaptCombatWave345'));

test('matched source closure changes exactly six active CPU hunks; every other public module remains identical',()=>{
  const files=[];
  function walk(dir){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name);if(fs.statSync(file).isDirectory())walk(file);else if(/\.m?js$/.test(name))files.push(path.relative(path.join(ROOT,'inkwave-public'),file));}}
  walk(path.join(ROOT,'inkwave-public/src'));
  const changed=[],map=[];
  for(const rel of files.sort()){
    const p=pair(rel);if(p.C!==p.B)changed.push(rel);
    if(SCOPE.includes(rel)){
      let cursor=p.C;const sites=[];
      for(const h of hunks.filter(h=>h.rel===rel)){
        assert.equal(typeof h.before,'string');assert.equal(typeof h.after,'string');
        assert.equal(cursor.split(h.before).length,2,'one real native input: '+h.label);
        assert.equal(cursor.includes(h.after),false);cursor=cursor.replace(h.before,h.after);sites.push(h.label);
      }
      assert.equal(cursor,p.B,'exact applied hunks close the compiled owner');map.push({rel,hunks:sites,C:hash(p.C),B:hash(p.B)});
    }
  }
  assert.deepEqual(changed,SCOPE);
  assert.deepEqual(map.map(row=>row.hunks.length),[1,5]);
  const hair=pair('src/game/motion/root-hair.js');assert.equal(hair.C,hair.B);
  for(const h of hunks.filter(h=>h.rel==='src/game/motion/root-hair.js')){
    assert.equal(hair.C.includes(h.before),false,'unmatched RootHair is excluded: '+h.label);
    assert.equal(hair.C.includes(h.after),false);
  }
  console.log(JSON.stringify({scope:'source closure only; no GPU inference',publicModules:files.length,changed,applied:map,unmatchedRootHairHunks:2,adapterBefore:hash(oldAdapter),adapterAfter:hash(newAdapter)}));
});

const plain=value=>structuredClone(value);
function rng(){let state=20261029,calls=0;return {next(){state=(Math.imul(state,1664525)+1013904223)>>>0;calls++;return state/4294967296;},read:()=>({state,calls})};}
function gameplay(f,events,r){return {
  time:f.G.time,random:r.read(),events:plain(events),
  actors:f.G.actors.map(a=>({nid:a.nid,alive:a.alive,hp:a.hp,ink:a.ink,sp:a.special,form:a.form,grounded:a.grounded,
    position:a.pos.toArray(),velocity:a.vel.toArray(),weapon:a.weaponId,runner:{charge:a.weaponRunner.charge,cooldown:a.weaponRunner.cooldown},
    pose:plain(contactPoseSnapshot(a.character)),
    boneEuler:a.character.boneList.map(b=>[b.name,b.rotation.x,b.rotation.y,b.rotation.z,b.rotation.order])})),
  projectiles:f.G.projectiles.list.map(p=>({type:p.type,damage:p.damage,life:p.life,position:p.pos.toArray(),velocity:p.vel.toArray(),ghost:!!p.ghost,seed:p.seed})),
};}
function countWork(f){
  const counts={boneQuaternionCallbacks:0,worldMatrixCalls:0},restores=[];
  for(const a of f.G.actors)for(const bone of a.character.boneList){const q=bone.quaternion,old=q._onChangeCallback;q._onChangeCallback=function(...args){counts.boneQuaternionCallbacks++;return old.apply(this,args);};restores.push(()=>q._onChangeCallback=old);}
  const p=f.THREE.Object3D.prototype,old=p.updateWorldMatrix;
  p.updateWorldMatrix=function(...args){counts.worldMatrixCalls++;return old.apply(this,args);};restores.push(()=>p.updateWorldMatrix=old);
  return {counts,restore:()=>restores.reverse().forEach(fn=>fn())};
}

test('actual banked Actor/Character retains complete poses, contacts, native fire/HP and RNG at 30/60/120Hz',async()=>{
  const totals={C:{boneQuaternionCallbacks:0,worldMatrixCalls:0},B:{boneQuaternionCallbacks:0,worldMatrixCalls:0}};let frames=0,damageContacts=0;
  for(const hz of [30,60,120]){
    const random=[rng(),rng()],apis=await Promise.all([sourceLoadedActorFixture({sourceOnly:true,transform:baseline,random:random[0].next}),sourceLoadedActorFixture({sourceOnly:true,transform:candidate,random:random[1].next})]);
    const events=[[],[]],work=[],offs=[];
    try{
      for(let k=0;k<2;k++){
        const f=apis[k],a=await f.make(0),v=await f.make(1);v.pos.set(0,0,5);v.character.root.position.copy(v.pos);
        a.character.onEvent=v.character.onEvent=null;
        const native=v.damage;v.damage=function(...args){const before=this.hp,out=native.apply(this,args);if(this.hp!==before)events[k].push({kind:'native-hp',before,after:this.hp,requested:args[0],attacker:args[1]?.nid,source:args[2]});return out;};
        offs.push(f.on('weapon:fire',e=>events[k].push({kind:'native-fire',weapon:e.weapon,charge:e.charge??null,muzzle:e.muzzle?.toArray(),dir:e.dir?.toArray()})));
        work[k]=countWork(f);
      }
      for(let frame=0;frame<180+144;frame++){
        for(let k=0;k<2;k++){
          const f=apis[k],[a,v]=f.G.actors,phase=frame<180?-1:Math.floor((frame-180)/16),dt=frame<180?1/60:1/hz;
          a.intent.move.set(phase===1?.1:phase===3?.5:0,0,phase===1?.1:phase===2?1:phase===3?-.5:0);
          a.intent.fire=phase>=4&&phase<=5;a.intent.jump=frame===180+96;a.intent.squid=phase===7;a.intent.sub=a.intent.special=false;
          v.intent.move.set(0,0,0);v.intent.fire=v.intent.jump=v.intent.squid=v.intent.sub=v.intent.special=false;
          const dir=v.pos.clone().sub(a.pos);a.aimYaw=Math.atan2(dir.x,dir.z);a.aimPitch=0;a.aimDir.set(dir.x,0,dir.z).normalize();a.aimPoint.copy(v.pos).add(new f.THREE.Vector3(0,1,0));
          f.G.time+=dt;for(const actor of f.G.actors)actor.update(dt);f.G.projectiles.update(dt);
          for(const actor of f.G.actors){actor.character.root.updateMatrixWorld(true);actor.character.skeleton.update();}
        }
        assert.deepEqual(plain(gameplay(apis[1],events[1],random[1])),plain(gameplay(apis[0],events[0],random[0])),hz+'Hz frame '+frame);
        frames++;
      }
      assert.ok(events[0].some(e=>e.kind==='native-fire'),'real Actor/Runner fire path is exercised');
      const hits=events[0].filter(e=>e.kind==='native-hp'&&e.after<e.before);assert.ok(hits.length,'real projectile/capsule contact changes native HP');damageContacts+=hits.length;
      for(let k=0;k<2;k++)for(const name of Object.keys(totals.C))totals[k?'B':'C'][name]+=work[k].counts[name];
    }finally{offs.forEach(off=>off());work.forEach(w=>w.restore());apis.forEach(f=>f.reset());}
  }
  assert.ok(totals.B.boneQuaternionCallbacks<totals.C.boneQuaternionCallbacks,'the six-hunk subset actually eliminates native Euler sync work');
  assert.ok(totals.B.worldMatrixCalls<totals.C.worldMatrixCalls,'the native parent-chain specialization executes');
  console.log(JSON.stringify({frames,hz:[30,60,120],nativeDamageContacts:damageContacts,work:totals,scope:'real source-bank Actor/Runner/Physics/Character; flat floor, own-ink stub, no renderer/GPU/full-Game performance claim'}));
});

test('independent native ancestor outputs reject a deliberately wrong candidate translation',async()=>{
  const f=await sourceLoadedActorFixture({sourceOnly:true,transform:baseline,random:()=>.25});
  try{
    const a=await f.make(),ch=a.character,p=pair('src/game/character.js');
    const tree=parse(p.B,{ecmaVersion:'latest',sourceType:'module'}),methods=[];
    function find(n){if(!n||typeof n!=='object')return;if(n.type==='MethodDefinition'&&n.key.name==='_kidXform')methods.push(n);for(const v of Object.values(n))if(Array.isArray(v)){for(const x of v)find(x);}else if(v&&typeof v==='object')find(v);}
    find(tree);assert.equal(methods.length,1);let method=p.B.slice(methods[0].start,methods[0].end);
    const right='px += p.x; py += p.y; pz += p.z;';assert.equal(method.split(right).length,2);
    method=method.replace(right,'px += p.x + 0.01; py += p.y; pz += p.z;');
    const Wrong=new Function('return class{'+method+'}')(),wrong=Object.assign(new Wrong(),{kid:ch.kid});
    const goodPosition=new f.THREE.Vector3(),goodQ=new f.THREE.Quaternion(),badPosition=new f.THREE.Vector3(),badQ=new f.THREE.Quaternion();
    ch._kidXform(ch.bones.head,goodPosition,goodQ);wrong._kidXform(ch.bones.head,badPosition,badQ);
    assert.notDeepEqual(badPosition.toArray(),goodPosition.toArray(),'native control detects a nonzero wrong ancestor transform');
    assert.deepEqual(badQ.toArray(),goodQ.toArray(),'negative isolates translation, not unrelated pose/rotation changes');
  }finally{f.reset();}
});
