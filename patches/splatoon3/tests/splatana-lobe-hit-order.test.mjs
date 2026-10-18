import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';

const DT=1/60;
async function wave({coreZ,shieldZ,bossZ,targetZ,sideX=0,secondSideZ,ghost=false,random=()=>.37}={}) {
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const {paint,level,V}=makePaintWorld(f);f.G.settings={};
  const axes=level.blocks[0].axes;
  function wall(x0,x1,z0,z1,height=10){
    const face=level.faces.length;
    level.faces.push({origin:V(x0,0,z0),u:V(1,0,0),v:V(0,1,0),n:V(0,0,-1),su:x1-x0,sv:height,wall:true,turf:false,paintable:true});
    level.faces.push({origin:V(x0,height,z0),u:V(1,0,0),v:V(0,0,1),n:V(0,1,0),su:x1-x0,sv:z1-z0,wall:false,turf:true,paintable:true});
    level.blocks.push({id:level.blocks.length,solid:true,grate:false,center:V((x0+x1)/2,height/2,(z0+z1)/2),half:V((x1-x0)/2,height/2,(z1-z0)/2),
      axes,faces:[-1,-1,face+1,-1,-1,face],aabbMin:V(x0,0,z0),aabbMax:V(x1,height,z1)});
    return level.faces[face];
  }
  const side=wall(.6+sideX,1.4+sideX,2.1,3.1);
  const other=secondSideZ!=null?wall(-1.4,-.6,secondSideZ,secondSideZ+1):null;
  if(coreZ!=null)wall(-.3,.3,coreZ,coreZ+.2);
  // Add the collision faces before rebuilding the real CPU scoring grid.
  paint._layout(30);paint._initGrid();
  let defender,canopy;
  if(shieldZ!=null){
    defender=f.make('s3-shelter-compact');defender.team=1;defender.pos.set(0,0,shieldZ);
    defender.form='kid';defender.aimDir.set(0,0,-1);defender.aimPoint.set(0,1.05,-100);
    for(let i=0;i<30;i++)defender.weaponRunner.update(DT,{fire:true,firePressed:i===0});
    canopy=defender.weaponRunner.catalogState.canopy;assert.ok(canopy?.open);
    f.G.projectiles.list.length=0; // Retain the real held canopy, retire setup pellets.
  }
  const bossHits=[];
  if(bossZ!=null)f.G.boss={
    // Controlled Boss query boundary; terrain and the wave remain real Physics.
    segHit(from,to){return bossZ>=from.z&&bossZ<=to.z?{point:from.clone().lerp(to,(bossZ-from.z)/(to.z-from.z))}:null;},
    hit(...args){bossHits.push(args);}
  };
  const a=f.make('s3-saber-lite');a.form='kid';a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,100);
  a.character.getMuzzle=out=>out.copy(a.pos).add(V(0,1,.3));
  let target;if(targetZ!=null){target=f.make('shooter');target.team=1;target.hp=10000;target.pos.set(20,0,20);}
  const randomValues=[];let draws=0;f.setRandom(()=>{const value=random(++draws);randomValues.push(value);return value;});
  for(let i=0;i<40&&!f.G.projectiles.list.length;i++){
    a.weaponRunner.update(DT,{fire:i<2,firePressed:i===0});f.G.time+=DT;
  }
  const p=f.G.projectiles.list.find(p=>p.catalog);assert.ok(p,'actual weak swing emits one wave');p.ghost=ghost;
  const birth={pos:Array.from(p.pos.toArray()),velocity:Array.from(p.vel.toArray()),seed:p.seed,draws};
  if(target)target.pos.set(0,0,targetZ); // Enter after the separate near-slash admission.
  const stamps=[],otherStamps=[],splat=paint.splat;
  paint.splat=function(at,radius,team,options={}){
    const area=splat.call(this,at,radius,team,options);
    if(options.face===level.faces.indexOf(side))stamps.push({at:at.clone(),radius,owner:options.claimOwner,seed:options.seed});
    if(other&&options.face===level.faces.indexOf(other))otherStamps.push({at:at.clone(),radius,owner:options.claimOwner,seed:options.seed});
    return area;
  };
  const count=face=>{let n=0;if(face)for(let i=face.grid;i<face.grid+face.nu*face.nv;i++)if(paint.grid[i])n++;return n;};
  return {f,a,p,birth,stamps,otherStamps,cells:()=>count(side),otherCells:()=>count(other),defender,canopy,bossHits,target,randomValues,get draws(){return draws;}};
}
function step(x){x.f.G.time+=DT;x.f.G.projectiles.update(DT);}
function sidePaint(x,expected){
  assert.equal(x.stamps.length,expected?1:0,'outer lobe commits one reached contact only');
  assert.equal(x.cells(),expected?2:0,'real side-wall scoring cells follow contact order');
  if(expected){assert.equal(x.stamps[0].owner,x.a);assert.equal(x.stamps[0].seed,.37);}
  assert.equal(!!x.p.catalog.lobeGone?.[2],expected,'only reached terrain retires this lobe');
}

test('near Actor blocks later outer-lobe paint; a farther Actor preserves the earlier splash and identical shot RNG',async()=>{
  const rows=[];
  for(const [z,paint]of [[2.3,false],[3.8,true]]){
    const x=await wave({targetZ:z});step(x);sidePaint(x,paint);
    assert.equal(x.target.hp,9970,'actual Actor receives the unchanged 30HP wave hit');
    assert.equal(x.f.G.projectiles.list.includes(x.p),false);
    rows.push({birth:x.birth,draws:x.draws});
  }
  assert.deepEqual(rows[0],rows[1],'rejected paint retains its existing seed reservation without shifting later shots');
});

test('CoreIndex terrain terminates before later outer paint while later core terrain preserves an earlier splash',async()=>{
  for(const [coreZ,paint]of [[1.8,false],[3.5,true]]){
    const x=await wave({coreZ});step(x);sidePaint(x,paint);
    assert.equal(x.f.G.projectiles.list.includes(x.p),false,'the actual core wall still ends the wave');
    assert.ok(x.p.pos.z<=coreZ,'core does not pass its wall');
  }
});

test('actual held Brella shield wins before later outer terrain, with unchanged shield damage and no body damage',async()=>{
  for(const [shieldZ,paint]of [[2.5,false],[4.5,true]]){
    const x=await wave({shieldZ}),hp=x.canopy.hp,body=x.defender.hp;step(x);sidePaint(x,paint);
    assert.equal(x.canopy.hp,hp-30,'the existing native guard spends the same wave damage');
    assert.equal(x.defender.hp,body,'the shield still protects its owner');
    assert.equal(x.f.G.projectiles.list.includes(x.p),false);
  }
});

test('earlier Boss query admission suppresses later outer terrain; a later Boss keeps it',async()=>{
  for(const [bossZ,paint]of [[1.8,false],[3.5,true]]){
    const x=await wave({bossZ});step(x);sidePaint(x,paint);
    assert.equal(x.bossHits.length,1);assert.equal(x.bossHits[0][1],30);
    assert.ok(Math.abs(x.p.pos.z-bossZ)<1e-9);
  }
});

test('reached lobe retires once; ghosts follow geometry without paint, damage or paint RNG',async()=>{
  const local=await wave();step(local);sidePaint(local,true);const used=local.draws;
  step(local);assert.equal(local.stamps.length,1,'the retired lobe cannot repaint on the next tick');assert.equal(local.draws,used);
  const remote=await wave({ghost:true,targetZ:3.8});step(remote);
  assert.equal(remote.cells(),0);assert.equal(remote.stamps.length,0);assert.equal(remote.target.hp,10000);
  const clear=await wave({ghost:true,targetZ:3.8,sideX:10});step(clear);
  assert.deepEqual(remote.randomValues,clear.randomValues,'outer ghost terrain adds no paint RNG to existing cosmetic contact work');
  assert.equal(remote.p.catalog.lobeGone[2],true,'ghost motion still retires the reached lobe');
});

test('sequenced paint seed reservation preserves the next real shot seed and velocity across an earlier hit',async()=>{
  const traces=[];
  for(const targetZ of [3.1,4.5]){
    const x=await wave({targetZ,secondSideZ:3.4,random:i=>(i*.173)%1});step(x);
    assert.equal(x.stamps[0].seed,x.randomValues[x.birth.draws+1],'right lobe retains the second candidate seed even when the first is rejected');
    assert.equal(x.p.catalog.lobeGone[2],true);assert.equal(x.otherStamps.length,targetZ===3.1?0:1);
    assert.equal(x.otherCells(),targetZ===3.1?0:2,'each outer contact is compared separately to the global stop');
    assert.equal(!!x.p.catalog.lobeGone[0],targetZ===4.5);
    if(targetZ===4.5)assert.equal(x.otherStamps[0].seed,x.randomValues[x.birth.draws],'left lobe retains the first candidate seed');
    const firstDraws=x.draws;x.a.weaponRunner.reset();x.target.pos.x=20;
    for(let i=0;i<40&&!x.f.G.projectiles.list.length;i++)x.a.weaponRunner.update(DT,{fire:i<2,firePressed:i===0});
    const next=x.f.G.projectiles.list.find(p=>p.catalog);assert.ok(next,'second shot uses actual weak-swing admission');
    traces.push({first:x.birth,firstDraws,nextSeed:next.seed,nextVelocity:Array.from(next.vel.toArray()),draws:x.draws});
  }
  assert.deepEqual(traces[0],traces[1]);
});

test('a reserved zero seed is not rerolled when the reached outer lobe paints',async()=>{
  const x=await wave({random:i=>i===4?0:.37});step(x);
  const control=await wave();step(control);
  assert.equal(x.stamps.length,1);assert.equal(x.stamps[0].seed,0);
  assert.equal(x.draws,control.draws,'zero seed must not add a reroll to the existing cosmetic work');
});

test('multi-contact ghost retires only the lobe reached before the Actor and never acquires either wall',async()=>{
  const x=await wave({ghost:true,targetZ:3.1,secondSideZ:3.4});step(x);
  assert.equal(x.cells(),0);assert.equal(x.otherCells(),0);assert.equal(x.stamps.length+x.otherStamps.length,0);
  assert.equal(x.target.hp,10000);assert.equal(x.p.catalog.lobeGone[2],true);assert.notEqual(x.p.catalog.lobeGone[0],true);
});
