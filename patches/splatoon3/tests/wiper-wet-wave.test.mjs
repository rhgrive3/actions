import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {fixture} from './source-fixture.mjs';
import {ShaderLib} from '../../../inkwave-public/vendor/three/build/three.module.js';

async function setup() {
  const f = await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  return f;
}
function fire(f,id,charged=true) {
  const s=f.G.projectiles;s.clear();f.G.actors.length=0;
  const a=f.make(id);a.form='kid';a.ink=100;a.intent.fire=true;
  f.tick(a,charged?80:2);a.intent.fire=false;
  for(let i=0;i<90&&!s.list.some(p=>p.delay<=0);i++){s.update(1/60);f.tick(a);}
  const p=s.list.find(p=>p.delay<=0);assert.ok(p,id+' physical birth');
  assert.equal(p.catalog.descriptor.key,charged?'saber-vertical':'saber-horizontal');
  return {s,a,p};
}
const physical=(s,a)=>JSON.stringify({ink:a.ink,hp:a.hp,pos:a.pos.toArray(),vel:a.vel.toArray(),
  projectiles:s.list.map(p=>({wid:p.wid,type:p.type,age:p.age,delay:p.delay,damage:p.damage,life:p.life,size:p.size,
    radius:p.radius,grav:p.grav,drag:p.drag,seed:p.seed,pos:p.pos.toArray(),vel:p.vel.toArray(),
    travel:p.catalog?.travel,lobeGone:p.catalog?.lobeGone,descriptor:p.catalog?.descriptor}))});
function compile(f,mat) {
  // Optimized shipping Three exports intentionally omit ShaderLib. Inspect the
  // emitted material hook against the same pinned Three shader templates, not
  // a hand-written GLSL stand-in (this still is not a real GPU compile).
  const lib=f.THREE.ShaderLib||ShaderLib;
  const sh={uniforms:{},vertexShader:lib.physical.vertexShader,
    fragmentShader:lib.physical.fragmentShader};mat.onBeforeCompile(sh);return sh;
}

test('Normal/Lite charged waves and kits select wet mass; taps and Dental never inherit it',async()=>{
  const f=await setup(),m=new f.THREE.Matrix4(),scale=new f.THREE.Vector3(),q=new f.THREE.Quaternion(),at=new f.THREE.Vector3();
  for(const id of ['s3-saber-lite','s3-saber-lite-01','s3-saber-normal','s3-saber-normal-01','s3-saber-heavy','s3-saber-heavy-01']) {
    for(const charged of [true,false]) {
      const {s,a,p}=fire(f,id,charged),wet=charged&&p.catalog.r.sourceActor!=='WeaponSaberHeavy';
      const before=physical(s,a);s._draw();assert.equal(physical(s,a),before,'draw is read-only');
      const mesh=wet?s._s3Shapes.wetSlashV:charged?s._s3Shapes.slashV:s._s3Shapes.slashH;
      assert.equal(mesh.count,2,'two render lobes, still only one native physical projectile');
      assert.equal(s.list.filter(p=>p.delay<=0).length,1);
      assert.equal(s._s3Shapes.slashV.count,charged&&!wet?2:0,'Heavy retains original slashV; wet has separate actual geometry');
      if (!wet && s._s3Shapes.wetSlashV) assert.equal(s._s3Shapes.wetSlashV.count,0,'pooled transitions cannot inherit wet geometry');
      mesh.getMatrixAt(0,m);m.decompose(at,q,scale);const primary=scale.clone();
      mesh.getMatrixAt(1,m);m.decompose(at,q,scale);
      assert.ok(Math.abs(scale.x/primary.x-(wet?.58:.82))<1e-6,'wet peel is shorter, not a near-copy');
      assert.ok(Math.abs(scale.z/primary.z-(wet?.72:.82))<1e-6);
      const burst=s._s3Shapes.sheets.bursts.at(-1);assert.equal(burst.wetWave,wet);
      const A=s._s3Shapes.sheets.mesh.geometry.getAttribute('aSheetA');
      for(let i=0;i<s._s3Shapes.sheets.mesh.count;i++)assert.equal(A.array[i*4]%1,wet?.5:.25,'only wet launch gets rolled contour');
      assert.equal(s._s3Shapes.sheets.mesh.count,charged?3:2,'no added launch layers');
    }
  }
});

test('wet contour is baked, asymmetric and rolled at the same vertex/triangle budget',async()=>{
  const f=await setup(),{s}=fire(f,'s3-saber-lite');s._draw();
  const v=s._s3Shapes.slashV.geometry,mesh=s._s3Shapes.wetSlashV;
  const base=v.getAttribute('position'),wet=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');
  assert.equal(wet.count,348);assert.equal(mesh.geometry.index.count,2016);assert.equal(base.count,wet.count);
  assert.equal(wet.array.byteLength+n.array.byteLength+mesh.geometry.index.array.byteLength+
    mesh.instanceMatrix.array.byteLength+mesh.instanceColor.array.byteLength,13600,'13,600 additional geometry/instance bytes');
  assert.equal(mesh.castShadow,true);assert.equal(mesh.customDepthMaterial,undefined);
  assert.equal(mesh.onBeforeRender.toString(),f.THREE.Object3D.prototype.onBeforeRender.toString(),
    'no pass gate: color/shadow/normal/depth all consume the actual same positions');
  assert.equal(mesh.geometry.getAttribute('s3WetPosition'),undefined,'no color-only geometry deformation');
  assert.equal(s._s3Shapes.slashV.material.customProgramCacheKey(),'s3-slash-2','legacy shader key unchanged');
  let asymmetry=0,roll=0,depth=0;
  for(let i=0;i<wet.count;i++) {
    for(const a of [wet,n])for(let j=0;j<3;j++)assert.ok(Number.isFinite(a.array[i*3+j]));
    const opposite=(28-Math.floor(i/12))*12+i%12;
    asymmetry=Math.max(asymmetry,Math.abs(wet.getZ(i)-wet.getZ(opposite)));
    roll=Math.max(roll,Math.abs(wet.getY(i)-base.getY(i)));
    depth=Math.max(depth,Math.abs(wet.getZ(i)-base.getZ(i)));
    assert.ok(Math.abs(wet.getX(i))<=1.950001,'unchanged calibrated span');
    assert.ok(wet.getZ(i)>=-1.2&&wet.getZ(i)<=.48,'bounded previous combined two-slab region');
  }
  assert.ok(asymmetry>.1,'not a mirror-perfect crescent');assert.ok(roll>.1,'rolled volume instead of flat plate');
  assert.ok(depth>.2,'broad trailing lobes instead of uniform pointed strip');

});

test('charged shader removes dense stripes and emissive blade rim only on selected waves; Machine stays isolated',async()=>{
  const f=await setup(),{s}=fire(f,'s3-saber-normal');s._draw();
  const slash=compile(f,s._s3Shapes.wetSlashV.material),sheet=compile(f,s._s3Shapes.sheets.mesh.material),drill=compile(f,s._s3Shapes.sheets.drillMesh.material);
  assert.doesNotMatch(slash.vertexShader,/aS3WetWave|s3WetPosition|s3WetNormal/,'actual geometry, not color-only deformation');
  assert.match(slash.fragmentShader,/0\.02 \+ 0\.08 \* iwRim/);
  assert.doesNotMatch(slash.fragmentShader,/vS3Local\.z \* 17\.0/,'wet shader has no periodic stripes');
  assert.match(compile(f,s._s3Shapes.slashV.material).fragmentShader,/vS3Local\.z \* 17\.0/,'legacy shader remains unchanged');
  assert.match(sheet.vertexShader,/fract\(aSheetA\.x\) > 0\.4/);
  assert.match(sheet.fragmentShader,/mix\(2\.5, 0\.45, wetBody\)/);
  assert.doesNotMatch(drill.vertexShader,/wetWave|aSheetA|vS3A/);
  assert.doesNotMatch(drill.fragmentShader,/wetBody|vS3A/,'no launch-only varying may leak into drill shader');
});

for(const hz of [30,60,120])test(`wet draw/repeat/clear at ${hz} Hz consumes no RNG and cannot alter gameplay`,async()=>{
  const f=await setup(),{s,a}=fire(f,'s3-saber-lite');let calls=0;f.setRandom(()=>{calls++;return .37;});
  const calls0=calls;
  for(let i=0;i<Math.ceil(hz/12);i++) {
    s.update(1/hz);f.G.time+=1/hz;const before=physical(s,a);s._draw();s._draw();
    assert.equal(physical(s,a),before,'repeat draw cannot move/paint/damage/retime a projectile');
  }
  assert.equal(calls,calls0,'presentation consumes zero gameplay random calls');
  s.clear();assert.equal(s._s3Shapes.slashV.count,0);assert.equal(s._s3Shapes.wetSlashV.count,0);assert.equal(s._s3Shapes.sheets.mesh.count,0);
  fire(f,'s3-saber-heavy');s._draw();assert.equal(s._s3Shapes.wetSlashV.count,0);assert.equal(s._s3Shapes.slashV.count,2);
});


test('wet mesh is lazy, reused, capacity-bounded, and disposed once with its renderer',async()=>{
  const f=await setup();let x=fire(f,'s3-saber-heavy');x.s._draw();const R=x.s._s3Shapes;
  assert.equal(R.wetSlashV,null,'non-target never allocates wet geometry/material');
  x=fire(f,'s3-saber-lite');x.s._draw();const mesh=R.wetSlashV;
  x=fire(f,'s3-saber-normal');x.s._draw();assert.equal(R.wetSlashV,mesh,'shared by the two selected source actors');
  assert.equal(mesh.instanceMatrix.count,16);assert.equal(mesh.count,2);
  // Exercise the actual pinned Three disposal listener without a GPU or browser.
  // The backend records identities, so geometry/material disposal alone cannot
  // masquerade as releasing this InstancedMesh's matrix/color buffers.
  const threeSource=readFileSync(new URL('../../../inkwave-public/vendor/three/build/three.module.js',import.meta.url),'utf8');
  const start=threeSource.indexOf('function WebGLObjects( ');
  const end=threeSource.indexOf('\nconst toneMappingMap =',start);
  assert.ok(start>=0&&end>start,'pinned Three WebGLObjects closure is available');
  const WebGLObjects=runInNewContext(threeSource.slice(start,end)+'\nWebGLObjects');
  const uploaded=[],removed=[],released=[],order=[];
  const backend=WebGLObjects({ARRAY_BUFFER:34962},
    {get:(_object,geometry)=>geometry,update(){}},
    {update:attribute=>uploaded.push(attribute),remove:attribute=>removed.push(attribute)},
    {releaseStatesOfObject:object=>released.push(object)}, {render:{frame:0}});
  backend.update(mesh);
  assert.deepEqual(uploaded,[mesh.instanceMatrix,mesh.instanceColor]);
  let ge=0,ma=0,me=0;
  mesh.addEventListener('dispose',()=>{me++;order.push('mesh');});
  mesh.geometry.addEventListener('dispose',()=>{ge++;order.push('geometry');});
  mesh.material.addEventListener('dispose',()=>{ma++;order.push('material');});
  R.dispose();
  assert.equal(me,1,'wet InstancedMesh dispatches its own dispose event');
  assert.deepEqual(released,[mesh],'release the exact wet mesh binding state');
  assert.deepEqual(removed,[mesh.instanceMatrix,mesh.instanceColor],'release both exact instance buffers');
  assert.deepEqual(order,['mesh','geometry','material'],'instance resources are released before geometry/material');
  assert.equal(ge,1);assert.equal(ma,1);assert.equal(R.wetSlashV,null);
  R.dispose();
  assert.equal(me,1);assert.equal(ge,1);assert.equal(ma,1,'repeat renderer disposal cannot redispose wet resources');
  assert.equal(released.length,1);assert.equal(removed.length,2);
});


test('wet and legacy vertical meshes share the original 16-instance list-order budget',async()=>{
  const f=await setup(),wet=fire(f,'s3-saber-lite').p;
  const wetCopy={...wet,pos:wet.pos.clone(),vel:wet.vel.clone(),start:wet.start.clone()};
  const {s,p:heavy}=fire(f,'s3-saber-heavy');
  s.list.splice(0,s.list.length,...Array(8).fill(heavy),wetCopy);s._draw();
  assert.equal(s._s3Shapes.wetSlashV,null,'fully clipped target does not allocate lazy resources');
  const mixed=[...Array(7).fill(wetCopy),...Array(3).fill(heavy)];
  s.list.splice(0,s.list.length,...mixed);s._draw();
  assert.equal(s._s3Shapes.wetSlashV.count,14,'first seven wet rounds retain two lobes each');
  assert.equal(s._s3Shapes.slashV.count,2,'only next Heavy fits, later physical shots are unchanged but presentation truncated');
  assert.equal(s.s3ShapeCounts.slashV,16,'never 16+16 after splitting mesh resources');
  assert.equal(s.list.length,10,'presentation cap never deletes physical projectiles');
});

test('actual wet Wiper material hook avoids GLSL ES reserved patch identifier without changing its math',async()=>{
  const f=await setup(),{s}=fire(f,'s3-saber-normal');s._draw();
  const mat=s._s3Shapes.wetSlashV.material,shader=compile(f,mat);
  assert.equal(mat.customProgramCacheKey(),'s3-wet-slash-1');
  assert.match(shader.fragmentShader,/float iwWetPatch\s*=\s*sin\(vS3Local\.x \* 3\.7 \+ vS3Local\.z \* 4\.1\)/);
  assert.match(shader.fragmentShader,/0\.45 \* sin\(vS3Local\.x \* 7\.3 - vS3Local\.z \* 5\.2 \+ 1\.1\)/);
  assert.match(shader.fragmentShader,/diffuseColor\.rgb \*= 0\.94 \+ 0\.09 \* smoothstep\(-0\.3, 1\.0, iwWetPatch\)/);
  assert.doesNotMatch(shader.fragmentShader,/\bfloat\s+patch\b/,'GLSL ES 3 reserves patch');
});

test('all six native Wiper actions naturally retire identically at 30/60/120 Hz with a 21-tick quiet tail',async()=>{
  let reference;
  for(const hz of [30,60,120]){
  const f=await setup(),rows=[];
  // Legacy Heavy and tap controls precede the two lazy wet-mesh owners.
  for(const [id,charged] of [['s3-saber-heavy',false],['s3-saber-heavy',true],
    ['s3-saber-normal',false],['s3-saber-lite',false],['s3-saber-normal',true],['s3-saber-lite',true]]){
    const {s,a,p}=fire(f,id,charged);s._draw();
    const R=s._s3Shapes,wet=R.wetSlashV,mesh=charged?(id==='s3-saber-heavy'?R.slashV:wet):R.slashH;
    assert.equal(mesh.count,2,'observe the actual active native shot before its natural expiry');
    let accumulator=0,tick=0,tail=0;
    while(tick<240&&tail<21){
      accumulator+=1/hz;
      while(accumulator+1e-10>=1/60&&tick<240&&tail<21){
        accumulator-=1/60;f.tick(a);s.update(1/60);tick++;
        const retired=!s.list.length&&!R.sheets.bursts.length&&
          ![R.slashH,R.slashV,R.wetSlashV,R.sheets.mesh,R.sheets.drillMesh].some(m=>m?.count>0);
        tail=retired?tail+1:0;
      }
      s._draw();
    }
    assert.equal(s.list.length,0,'native projectile expires without clear, retagging or lifetime changes');
    assert.equal(R.sheets.bursts.length,0,'native launch sheets expire on the advancing game clock');
    assert.equal(tail,21,`${hz} Hz ${id} ${charged?'charged':'tap'} retained a mesh after natural projectile/sheet expiry`);
    assert.equal(R.wetSlashV,wet,'retirement preserves lazy reusable geometry');
    assert.equal(mesh.count,0);assert.equal(mesh.visible,false);
    assert.equal(s.s3ShapeCounts.slashV,0);
    rows.push({id,charged,life:p.life,quietTailTicks:tail,finalTick:tick});
  }
  assert.equal(rows.length,6);
  if(reference)assert.deepEqual(rows,reference,'fixed-step retirement tick and quiet tail agree across render schedules');
  else reference=rows;
  }
});
