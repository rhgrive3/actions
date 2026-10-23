import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
import {readySpecialEvidence} from './special-control-evidence.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function setup({omitBirthReset=false}={}) {
  let seed=.37,calls=0;
  const control=(rel,source)=>{
    if(!omitBirthReset||rel!=='patches/splatoon3/runtime/s3-projectile-shapes.mjs')return source;
    // Match the one false birth assignment in source or real minified output.
    // Replacing only the assignment expression keeps both comma and statement
    // forms valid; it cannot remove the true observation in fireInk().
    const reset=/\b[A-Za-z_$][\w$]*\._s3FireInkSeen\s*=\s*(?:false\b|!\s*1\b)/g;
    assert.equal([...source.matchAll(reset)].length,1,'one actual visual birth reset');
    return source.replace(reset,'false'); // private negative control, never shipped
  };
  const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true,vmMathRandom:()=>{calls++;return seed;},
    adaptRuntime:control,adaptEmittedRuntime:control,
    extraExports:"export {FX} from './inkwave-public/src/fx/fx.js'; export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
  f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
  const {paint}=makePaintWorld(f,{cell:1}),ps=f.G.projectiles,writes=[];
  const splat=paint.splat;paint.splat=function(at,r,team,opts={}){writes.push([at.x,at.y,at.z,r,team,opts.kind??null,opts.seed??null,opts.stretchAmt??null,opts.face??null]);return splat.call(this,at,r,team,opts);};
  // Exercise the real FX droplet allocator (including its captured shared
  // rand()) with fixed CPU storage; no WebGL renderer/material is substituted
  // for an RNG check. Native muzzle/burst decoration is outside this probe.
  const fx={dN:0,dCap:96,_recycle:0,dP:new Float32Array(288),dK:new Float32Array(288),dV:new Float32Array(288),dC:new Float32Array(288),dA:new Float32Array(768),muzzle(){},burst(){},ring(){},chargeGlow(){}};
  let specks=0;fx._spawnDrop=function(...args){assert.equal(args[11],0,'sheet specks never acquire paint flags');specks++;return f.FX.prototype._spawnDrop.apply(this,args);};
  f.G.fx=fx;f.G.settings={};ps._draw();
  const actor=f.make('shooter');actor.nid=7;actor.owner='local';actor.alive=true;actor.pos.set(0,0,5);actor.aimPoint.set(0,.4,30);
  const wire=()=>{const out=[],sender={_projectileSeq:0,_rec(e){out.push(e);return e;}};for(const p of ps.list)f.NetMatch.prototype.recProj.call(sender,p);return JSON.stringify(out);};
  const snapshot=()=>JSON.stringify(ps.list.map(p=>[p.wid,p.type,p.age,p.delay,p.seed,p.damage,p.radius,p.size,p.life,p.straight,p.grav,p.drag,p.pos.toArray(),p.vel.toArray(),p.start.toArray(),p.inkFrame??null,p.inkPhase??null,p.fidelitySloshIndex??null,p.s3SpecialWeapon?.id??null,p.catalog?.r?.id??null]));
  const paintState=()=>({writes:[...writes],counts:Array.from(paint.counts),grid:Buffer.from(paint.grid.buffer,paint.grid.byteOffset,paint.grid.byteLength).toString('base64')});
  const observe=label=>{
    const native=snapshot(),packets=wire(),grid=hash(paint.grid),before=calls,drop0=specks;
    const recovery=ps.list.some(p=>p.s3Shape==='shot'&&p.s3FireSeed===p.seed);
    const last=ps._s3Shapes.lastFire,legacy=[last.owner,last.kind,last.t,last.x,last.y,last.z];
    ps._draw();
    assert.equal(snapshot(),native,'drawing preserves native fields');assert.equal(wire(),packets,'drawing preserves native packets');assert.equal(hash(paint.grid),grid,'drawing preserves CPU paint');
    if(recovery)for(const [i,value]of [last.owner,last.kind,last.t,last.x,last.y,last.z].entries())assert.equal(value,legacy[i],'sheet recovery preserves legacy FX dedup state');
    const result={label,native:JSON.parse(native),packets,rngCalls:calls,drawRngCalls:calls-before,speckCalls:specks-drop0,sheets:ps._s3Shapes.sheets.bursts.length,muzzle:ps.shooterMuzzleDroplets.drawn};
    const again=calls;for(let i=0;i<3;i++)ps._draw();assert.equal(calls,again,'same-frame redraw cannot spend RNG');
    return result;
  };
  const tick=()=>{f.G.time+=1/60;ps.update(1/60);paint.advanceSimulation(1/60);};
  const retire=()=>{let ticks=0;while(ps.list.length&&ticks++<300)tick();assert.equal(ps.list.length,0,'native collision/lifetime retires every round');for(let i=0;i<16;i++)tick();};
  const resources=[ps.blobs,ps.blobs.geometry,ps.blobs.material,ps.blobs.instanceMatrix.array,ps._s3Shapes.sheets.mesh.geometry,ps._s3Shapes.sheets.mesh.material,ps.shooterMuzzleDroplets.pool];
  const checkResources=()=>{for(const [i,value]of [ps.blobs,ps.blobs.geometry,ps.blobs.material,ps.blobs.instanceMatrix.array,ps._s3Shapes.sheets.mesh.geometry,ps._s3Shapes.sheets.mesh.material,ps.shooterMuzzleDroplets.pool].entries())assert.equal(value,resources[i]);assert.equal(ps.blobs.instanceMatrix.array.length,700*16);assert.equal(ps.shooterMuzzleDroplets.pool.length,32);assert.ok(fx.dN<=fx.dCap);};
  return {f,ps,actor,observe,retire,paintState,snapshot,wire,calls:()=>calls,seed:v=>{seed=v;},checkResources};
}

async function repeated(options) {
  const s=await setup(options),rows=[],objects=[];
  for(const [label,seed]of [['first',.37],['same-seed reuse',.37],['different-seed control',.38]]){
    s.seed(seed);s.ps.fireShooter(s.actor,s.actor.weapon,0);assert.equal(s.ps.list.length,1);
    objects.push(s.ps.list[0]);rows.push(s.observe(label));s.retire();s.checkResources();
  }
  assert.equal(objects[1],objects[0],'same object must return through real native _new/_recycle');assert.equal(objects[2],objects[0]);assert.equal(s.ps.pool.length,1,'no new native allocation on reuse');
  const native={rows:rows.map(({label,native,packets,rngCalls,drawRngCalls,speckCalls})=>({label,native,packets,rngCalls,drawRngCalls,speckCalls})),paint:s.paintState(),rngCalls:s.calls()};
  return {rows,native};
}

test('real native same-object/same-seed reuse emits a sheet once per birth and retains three Shooter beads',async()=>{
  const result=await repeated();console.log('fire-birth-native '+JSON.stringify(result.native));console.log('fire-birth-visual '+JSON.stringify(result.rows.map(({label,sheets,muzzle,drawRngCalls,speckCalls})=>({label,sheets,muzzle,drawRngCalls,speckCalls}))));
  assert.deepEqual(result.rows.map(r=>r.sheets),[1,1,1]);assert.deepEqual(result.rows.map(r=>r.muzzle),[3,3,3]);
  assert.deepEqual(result.rows.map(r=>r.drawRngCalls),[5,0,5],'restored sheets cannot add shared FX RNG consumption');
  assert.ok(result.native.paint.counts[0]>0,'natural native flight exercises real paint');
});

test('removing only the visual birth reset reproduces 1→0 while native/RNG/paint/wire records remain identical',async()=>{
  const fixed=await repeated(),old=await repeated({omitBirthReset:true});
  assert.deepEqual(old.rows.map(r=>r.sheets),[1,0,1]);assert.deepEqual(fixed.native,old.native);assert.deepEqual(old.rows.map(r=>r.muzzle),[3,3,3]);
});

async function mixed(options) {
  const s=await setup(options),a=s.actor,rows=[];a.weapon={...a.weapon,special:'crabTank',specialCost:100};a.special=100;
  readySpecialEvidence(a,{placeAtFixtureOrigin:true});a.intent.fire=true;for(let i=0;i<23;i++)a._updateSpecial(1/60);a.intent.fire=false;
  assert(s.ps.list.some(p=>p.s3AllSpecialMode==='shooter'&&p.s3SpecialWeapon),'real direct-shot special birth');
  rows.push(s.observe('special'));assert.equal(rows[0].muzzle,0);s.retire();
  const main=s.f.make('shooter');main.nid=8;main.owner='local';main.alive=true;main.pos.copy(a.pos);main.aimPoint.copy(a.aimPoint);
  for(const [kind,fire]of [['shooter','fireShooter'],['splatling','fireSplatling'],['slosher','fireSlosh'],['shooter','fireShooter']]){
    main.setWeapon(kind);const poolBefore=new Set(s.ps.pool);s.ps[fire](main,main.weapon,0);assert(s.ps.list.some(p=>poolBefore.has(p)),kind+' reuses a real pooled round');
    assert(s.ps.list.every(p=>!p.s3SpecialWeapon&&!p.s3AllSpecial),'special identity cannot leak into main birth');rows.push(s.observe(kind));
    if(kind==='shooter')assert.equal(rows.at(-1).muzzle,3);else assert.equal(rows.at(-1).muzzle,0);
    s.retire();s.checkResources();
  }
  return {sequence:rows.map(r=>({label:r.label,muzzle:r.muzzle,sheets:r.sheets})),native:{rows:rows.map(({label,native,packets,rngCalls,drawRngCalls,speckCalls})=>({label,native,packets,rngCalls,drawRngCalls,speckCalls})),paint:s.paintState(),rngCalls:s.calls()}};
}

test('special→Shooter→Splatling→Slosher→Shooter uses live native pool reuse without clearing it',async()=>{
  const fixed=await mixed(),old=await mixed({omitBirthReset:true});
  assert.deepEqual(fixed.sequence.map(r=>r.sheets),[0,1,0,0,1]);
  assert.deepEqual(fixed.native,old.native,'mixed native/RNG/paint/wire records remain unchanged');
  assert.deepEqual(fixed.sequence.map(r=>r.muzzle),old.sequence.map(r=>r.muzzle));
  console.log('fire-birth-mixed '+JSON.stringify({...fixed,controlSequence:old.sequence}));
});
