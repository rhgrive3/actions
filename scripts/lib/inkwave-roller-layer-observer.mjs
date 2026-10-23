// Diagnostic-only wrappers over immutable emitted modules. Never write the
// original site or substitute animation / gameplay logic. Native output must
// be checked against the uninstrumented matched receipt by the caller.
import { parse } from '../../patches/loading-cache/vendor/acorn.mjs';
import assert from 'node:assert/strict';

const bootstrap = `
function __rlTap(stage,ch,data){globalThis.__rollerLayerTap?.(stage,ch,data);}
function __rlArm(P,stage){const original=P._solveLimb;P._solveLimb=function(...a){
 const side=a[0]===this.limbs.armR?'R':a[0]===this.limbs.armL?'L':null;
 if(side)__rlTap(stage+'In',this,{side,target:a[1],pole:a[2],q:a[3],weight:a[4],slot:a[5]});
 const result=original.apply(this,a);
 if(side)__rlTap(stage+'Out',this,{side,target:a[1],pole:a[2],q:a[3],weight:a[4],slot:a[5],result});
 return result;};}
function __rlFlick(P,stage){const original=P._poseFlick;P._poseFlick=function(...a){
 const previous=globalThis.__rollerLayerOwner;globalThis.__rollerLayerOwner=this;
 __rlTap(stage+'In',this,{P:a[0]});
 try{const result=original.apply(this,a);__rlTap(stage+'Out',this,{P:a[0]});return result;}
 finally{globalThis.__rollerLayerOwner=previous;}};}
function __rlAnim(P,stage){const original=P._animWeapon;P._animWeapon=function(...a){
 __rlTap(stage+'In',this,{});const result=original.apply(this,a);__rlTap(stage+'Out',this,{});return result;};}
`;

export function instrumentRollerLayerModule(relative, source) {
  const name = relative.replace(/^_versions\/[^/]+\//, '');
  if (!['patches/splatoon3/runtime/install.mjs', 'patches/splatoon3/runtime/roller.mjs'].includes(name)) return source;
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const edits = [], wrappers = [];
  const rename = (importName, make) => {
    const matches = ast.body.filter(n => n.type === 'ImportDeclaration')
      .flatMap(n => n.specifiers).filter(s => s.imported?.name === importName);
    assert.equal(matches.length, 1, 'one observer import '+importName);
    const spec = matches[0], local = spec.local.name, saved = '__rlOriginal_'+importName;
    edits.push({ start:spec.local.start, end:spec.local.end,
      text:spec.local.start === spec.imported.start ? importName+' as '+saved : saved });
    wrappers.push(make(local, saved));
  };
  if (name.endsWith('/install.mjs')) {
    rename('installRollerMotion', (local, saved) => `const ${local}=(...a)=>{
      globalThis.__rollerLayerApi=a[0];const P=a[0].Character.prototype;
      __rlArm(P,'nativeIK');const result=${saved}(...a);
      __rlArm(P,'rollerIK');__rlFlick(P,'blend');return result;};`);
    rename('installRollerDetailMotion', (local, saved) => `const ${local}=(...a)=>{
      const result=${saved}(...a);__rlFlick(a[0].Character.prototype,'detail');return result;};`);
    rename('installRollerFold', (local, saved) => `const ${local}=(...a)=>{
      __rlAnim(a[0].Character.prototype,'beforeFold');const result=${saved}(...a);
      __rlAnim(a[0].Character.prototype,'afterFold');return result;};`);
  } else {
    // Observe the two existing nested solvers independently, including rejected
    // floor candidates. AST selection works on the immutable minified output;
    // no symbol name from the source build is assumed.
    const nodes=[];
    const walk=(n,parents=[])=>{if(!n||typeof n!=='object')return;
      if(n.type)nodes.push({n,parents});
      for(const [key,value]of Object.entries(n))if(key!=='start'&&key!=='end'){
        if(Array.isArray(value))for(const child of value)walk(child,[...parents,n]);
        else if(value&&typeof value==='object')walk(value,[...parents,n]);
      }};
    walk(ast);
    const align=nodes.filter(({n})=>n.type==='VariableDeclarator'&&n.init?.type==='ArrowFunctionExpression'&&
      source.slice(n.init.start,n.init.end).includes('setFromUnitVectors')&&source.slice(n.init.start,n.init.end).includes('Math.acos'));
    assert.equal(align.length,1,'one left-reach alignment closure');
    const owner=align[0].parents.filter(n=>n.type==='FunctionExpression').at(-1);
    const target=owner.params[1].name,orientation=owner.params[3].name;
    const within=nodes.filter(({n})=>n.start>=owner.start&&n.end<=owner.end);
    const copies=within.filter(({n})=>n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&
      n.callee.object.name===orientation&&n.callee.property.name==='copy');
    const best=copies.at(-1).n.arguments[0].name;
    const evaluate=within.filter(({n})=>n.type==='VariableDeclarator'&&n.init?.type==='ArrowFunctionExpression'&&
      source.slice(n.init.start,n.init.end).includes(align[0].n.id.name+'('));
    assert.equal(evaluate.length,1,'one floor evaluator');
    for(const [entry,stage]of [[align[0],'align'],[evaluate[0],'floor']]){
      const n=entry.n.init,original=source.slice(n.start,n.end);
      edits.push({start:n.start,end:n.end,text:`(__original=>(...__args)=>{
        const __q=__args[0],__kind=__q===${best}?'best':'candidate';
        __rlTap('${stage}In',this,{q:__q,target:${target},kind:__kind});
        const __result=__original(...__args);
        __rlTap('${stage}Out',this,{q:__q,target:${target},kind:__kind,floorError:__result});
        return __result;})(${original})`});
    }
    const memories=within.filter(({n})=>n.type==='VariableDeclarator'&&source.slice(n.start,n.end).includes('._s3RollerFloorSearch'));
    assert.equal(memories.length,1,'one floor search memory');
    const chosen=within.filter(({n})=>n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&
      n.left.object.name===memories[0].n.id.name&&n.left.property.name==='valid');
    assert.equal(chosen.length,1,'one selected floor candidate handoff');
    const handoff=chosen[0].n;
    edits.push({start:handoff.start,end:handoff.end,text:`(__rlTap('searchSelected',this,{q:${best},target:${target},inputQ:${orientation}}),${source.slice(handoff.start,handoff.end)})`});
    const raw = ast.body.filter(n => n.type === 'ExportNamedDeclaration')
      .flatMap(n => n.specifiers || []).filter(s => s.exported.name === 'verticalRollerPose');
    assert.equal(raw.length, 1, 'one raw vertical export');
    const local = raw[0].local.name;
    wrappers.push(`const __rlRaw=${local};${local}=function(...a){const p=__rlRaw(...a);
      __rlTap('raw',globalThis.__rollerLayerOwner,{args:a,pose:p});return p;};`);
    if (ast.body.some(n => n.type === 'ImportDeclaration' && n.specifiers.some(s => s.imported?.name === 'createVerticalRecoverySampler')))
      rename('createVerticalRecoverySampler', (alias, saved) => `const ${alias}=(...a)=>{
        const original=${saved}(...a);const read=(ch,state)=>{const p=original(ch,state);
          __rlTap('helper',ch,{pose:p});return p;};read.clear=original.clear;return read;};`);
    if (ast.body.some(n => n.type === 'ImportDeclaration' && n.specifiers.some(s => s.imported?.name === 'createVerticalShaftReturn')))
      rename('createVerticalShaftReturn',(alias,saved)=>`const ${alias}=(...a)=>{
        const original=${saved}(...a);const read=(ch,...args)=>{const q=original(ch,...args);
          __rlTap('shaftSample',ch,{shaft:original.snapshot(ch),candidate:q?.toArray()});return q;};
        read.capture=(ch,...args)=>{const r=original.capture(ch,...args);__rlTap('shaftCapture',ch,{shaft:original.snapshot(ch)});return r;};
        read.reject=(ch)=>{original.reject(ch);__rlTap('shaftFallback',ch,{shaft:original.snapshot(ch)});};
        read.clear=original.clear;read.snapshot=original.snapshot;return read;};`);
  }
  for (const edit of edits.sort((a,b) => b.start-a.start)) source = source.slice(0,edit.start)+edit.text+source.slice(edit.end);
  return source+'\n'+bootstrap+'\n'+wrappers.join('\n')+'\n';
}

// This function is serialized into the actual game page, after the same avatar
// and native scene setup as the uninstrumented matched fixture.
export function installRollerBrowserLayerObserver() {
  const g = globalThis, api = g.__rollerLayerApi;
  if (!api?.Character) throw Error('Missing emitted installer observer');
  const { THREE:T, CHARACTER_CHANNELS:C, G } = api;
  const world = object => {
    const chain=[];for(let n=object;n;n=n.parent)chain.push(n);
    const matrix=new T.Matrix4();
    for(const n of chain.reverse()) matrix.multiply(new T.Matrix4().compose(n.position,n.quaternion,n.scale));
    return matrix;
  };
  const xform = object => {
    if(!object)return null;
    const matrix=world(object),p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();matrix.decompose(p,q,s);
    return {position:p.toArray(),quaternion:q.toArray(),scale:s.toArray(),matrix:matrix.toArray(),
      localPosition:object.position.toArray(),localQuaternion:object.quaternion.toArray(),localScale:object.scale.toArray()};
  };
  const centre = ch => {
    const box=new T.Box3(),point=new T.Vector3();
    ch.weapon.drum.traverse(mesh=>{
      const a=mesh.geometry?.attributes?.position;if(!a)return;
      const local=new T.Box3(),m=world(mesh);
      for(let i=0;i<a.count;i++)local.expandByPoint(point.fromBufferAttribute(a,i));
      for(const x of [local.min.x,local.max.x])for(const y of [local.min.y,local.max.y])for(const z of [local.min.z,local.max.z])
        box.expandByPoint(point.set(x,y,z).applyMatrix4(m));
    });
    return box.getCenter(point).toArray();
  };
  const channels = P => {
    const three=k=>Array.from(P.slice(C[k],C[k]+3));
    return {anchor:three('ANC'),euler:three('ANCR'),spine:three('SPINE'),chest:three('CHEST'),hipsPosition:three('HIPS_P'),
      followTranslation:P[C.AFOLT],followRotation:P[C.AFOLR],ikR:P[C.IKR],ikL:P[C.IKL],leftTargetWeight:P[C.LTW]};
  };
  const definitionBounds=new WeakMap();
  const constraints=ch=>{
    const d=ch.weapon.def,kid=ch.kid;
    const kidXform=bone=>{const p=new T.Vector3(),q=new T.Quaternion();
      for(let o=bone;o&&o!==kid;o=o.parent){p.applyQuaternion(o.quaternion).add(o.position);q.premultiply(o.quaternion);}
      return {p,q};};
    const origin=limb=>{const {p,q}=kidXform(limb.up.parent);return p.add(limb.up.position.clone().applyQuaternion(q)).toArray();};
    let bound=definitionBounds.get(d);
    if(!bound){let minX=Infinity,maxX=-Infinity,radius=0;
      for(const geo of[d.drum,d.drumCaps]){const p=geo?.attributes.position;
        for(let i=0;p&&i<p.count;i++){minX=Math.min(minX,p.getX(i));maxX=Math.max(maxX,p.getX(i));radius=Math.max(radius,Math.hypot(p.getY(i),p.getZ(i)));}}
      bound={centerX:(minX+maxX)*.5,halfWidth:(maxX-minX)*.5,radius};definitionBounds.set(d,bound);}
    const shift=new T.Vector3(0,-(ch.s3ShoulderDrop||0),0).applyQuaternion(kidXform(ch.bones.chest).q).multiply(kid.scale).applyQuaternion(kid.quaternion);
    const arm=limb=>({origin:origin(limb),reach:(limb.a+limb.b)*.9995-.001,min:Math.abs(limb.a-limb.b)+.001});
    return {right:arm(ch.limbs.armR),left:arm(ch.limbs.armL),bound,
      handR:{pos:d.handR.pos.toArray(),q:d.handR.quat.toArray()},handL:{pos:d.handL.pos.toArray(),q:d.handL.quat.toArray()},
      drumAt:d.drumAt.toArray(),fold:ch.weapon.fold&&ch.weapon.drum.parent===ch.weapon.fold?{pos:ch.weapon.fold.position.toArray(),q:ch.weapon.fold.quaternion.toArray()}:null,
      kid:{position:kid.position.toArray(),q:kid.quaternion.toArray(),scale:kid.scale.toArray()},shoulderShift:shift.toArray(),
      armLeftHeld:ch.P[C.IKL]>.99&&ch.P[C.LTW]<.001,neededGround:!!ch.grounded,contacting:!!ch._s3RollerContactPose};
  };
  const snapshot = ch => ({pose:channels(ch.P),kid:xform(ch.kid),chest:xform(ch.bones.chest),handR:xform(ch.bones.handR),handL:xform(ch.bones.handL),
    pivot:xform(ch.weapon.pivot),off:xform(ch.weapon.off),fold:xform(ch.weapon.fold),drum:xform(ch.weapon.drum),
    centre:centre(ch),floorSearch:{...ch._s3RollerFloorSearch},gripBlend:ch._s3RollerGripBlend,contact:ch._s3RollerContactPose,
    drumA:ch.weapon.drumA,foldT:ch.weapon.foldT});
  g.__rollerLayerEvents=[];
  g.__rollerLayerTap=(stage,ch,data)=>{
    if(!ch?.__rollerLayerObserve || !Number.isInteger(ch.__rollerLayerTick) || ch.__rollerLayerTick<35 || ch.__rollerLayerTick>58)return;
    const attack=ch.s3RollerFlick,entry={tick:ch.__rollerLayerTick,stage,
      attack:attack?{elapsed:attack.elapsed,windup:attack.windup,interval:attack.interval,held:attack.holdRoll,released:attack.released,rolling:attack.rolling}:null,
      rollWeight:ch.wRoll};
    if(data.P)entry.pose=channels(data.P);
    if(data.pose)entry.rawPose={anchor:[...data.pose.anchor],rotation:[...data.pose.rotation],weight:data.pose.weight,coil:data.pose.coil,whip:data.pose.whip};
    if(data.args)entry.args=[...data.args];
    if(data.shaft)entry.shaft=data.shaft;
    if(data.candidate)entry.candidateQuaternion=data.candidate;
    if(data.kind||stage==='searchSelected'){
      entry.quaternion=data.q.toArray();entry.target=data.target.toArray();entry.kind=data.kind;
      if(data.inputQ)entry.inputQuaternion=data.inputQ.toArray();
      if(Number.isFinite(data.floorError))entry.floorError=data.floorError;
    }
    if(data.side){entry.side=data.side;entry.target=data.target.toArray();entry.targetWorld=data.target.clone().applyMatrix4(world(ch.kid)).toArray();
      entry.pole=data.pole.toArray();entry.quaternion=data.q?.toArray()??null;entry.weight=data.weight;entry.slot=data.slot;entry.result=data.result;}
    if(stage==='rollerIKIn'&&data.side==='R')entry.constraints=constraints(ch);
    if(!['raw','helper','blendIn','blendOut','detailIn','detailOut','alignIn','alignOut','floorIn','floorOut','searchSelected','shaftSample','shaftCapture','shaftFallback'].includes(stage))entry.transforms=snapshot(ch);
    g.__rollerLayerEvents.push(entry);
  };
  const attach=ch=>{
    ch.__rollerLayerObserve=true;
    const apply=ch._applyPose,solve=ch._solveLimb,anim=ch._animWeapon;
    ch._applyPose=function(...a){g.__rollerLayerTap('applyIn',this,{});const r=apply.apply(this,a);g.__rollerLayerTap('applyOut',this,{});return r;};
    ch._solveLimb=function(...a){const side=a[0]===this.limbs.armR?'R':a[0]===this.limbs.armL?'L':null;
      if(side)g.__rollerLayerTap('fullIKIn',this,{side,target:a[1],pole:a[2],q:a[3],weight:a[4],slot:a[5]});
      const r=solve.apply(this,a);if(side)g.__rollerLayerTap('fullIKOut',this,{side,target:a[1],pole:a[2],q:a[3],weight:a[4],slot:a[5],result:r});return r;};
    ch._animWeapon=function(...a){g.__rollerLayerTap('fullAnimIn',this,{});const r=anim.apply(this,a);g.__rollerLayerTap('fullAnimOut',this,{});return r;};
    const align=ch.sourceMotion.alignWeapon;
    ch.sourceMotion.alignWeapon=function(...a){const r=align.apply(this,a);g.__rollerLayerTap('pivotAfter',ch,{});return r;};
  };
  attach(G.local.character);
}
