import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';

// A Roller/Slosher glob or a Splatana wave is not removed whole when only an
// edge of it touches terrain: a grazing grown sphere splashes and flies on, a
// wave's outer lobe leaves the wave. Only the glob core / CoreIndex lobe ends it.
async function setup(id,{muzzleY=1.05,blocks=[]}={}){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const {paint,level,V}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
  const axes=level.blocks[0].axes;
  for(const [x0,y1,z0,x1,z1] of blocks){
    const fi=level.faces.length;
    level.faces.push({origin:V(x0,0,z0),u:V(1,0,0),v:V(0,1,0),n:V(0,0,-1),su:x1-x0,sv:y1,wall:true,turf:false,paintable:true});
    level.faces.push({origin:V(x0,y1,z0),u:V(1,0,0),v:V(0,0,1),n:V(0,1,0),su:x1-x0,sv:z1-z0,wall:false,turf:true,paintable:true});
    level.blocks.push({id:level.blocks.length,solid:true,grate:false,center:V((x0+x1)/2,y1/2,(z0+z1)/2),half:V((x1-x0)/2,y1/2,(z1-z0)/2),
      axes,faces:[-1,-1,fi+1,-1,-1,fi],aabbMin:V(x0,0,z0),aabbMax:V(x1,y1,z1)});
  }
  const a=f.make(id);a.form='kid';a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,100);a.aimPitch=0;
  a.character.getMuzzle=out=>out.copy(a.pos).add(new f.THREE.Vector3(0,muzzleY,.3));
  return {f,a,paint};
}
// Fire one tap and follow every round of it at 60 Hz; returns per-round lifetimes/endpoints.
function swing(x){
  const P=x.f.G.projectiles,rounds=new Map();
  for(let i=0;i<180;i++){
    x.a.ink=100;x.a.weaponRunner.update(1/60,{fire:i<2,firePressed:i===0});x.f.G.time+=1/60;
    for(const p of P.list)if(!rounds.has(p))rounds.set(p,{start:p.pos.clone(),steps:0,end:p.pos.clone(),wallDrop:false});
    P.update(1/60);
    for(const [p,r] of rounds){if(r.done)continue;if(!P.list.includes(p)){r.done=true;continue;}r.steps++;r.end.copy(p.pos);r.wallDrop||=!!p.fidelityWallDrop;}
    if(rounds.size&&!P.list.length)break;
  }
  assert.ok(rounds.size>0,'the swing emitted rounds');
  return [...rounds.values()];
}

test('a level Big Swig swing born near the floor is not ended by its first-step floor graze',async()=>{
  // The drawn drum releases the horizontal swing ~0.31 m above the floor.
  const x=await setup('s3-roller-wide',{muzzleY:.31});
  const rounds=swing(x);
  assert.equal(rounds.length,16);
  for(const r of rounds){
    assert.ok(r.steps>=6,'glob flies on after its edge touches the floor: '+r.steps);
    assert.ok(r.end.z>3,'glob travels forward: '+r.end.z);
  }
  assert.ok(x.paint.counts[0]>0,'grazes and landings paint the floor');
});

test('a Roller glob whose centre clears a low wall passes over it; one below the top lands on the face',async()=>{
  // Place the wall top just below every glob (each centre clears it by less
  // than the grown radius, so the old upward-only graze still ended the glob on
  // the top edge) and then just above every glob.
  const probe=swing(await setup('roller')),ys=probe.map(r=>r.start.y);
  const low=Math.min(...ys),high=Math.max(...ys);
  assert.ok(high-low<.2,'the deterministic draw keeps the sheet level');
  const over=swing(await setup('roller',{blocks:[[-40,low-.15,4,40,5]]}));
  const top=low-.15;let beyond=0;
  for(const r of over){
    // Every glob carries over the edge: it either flies past the wall or its
    // core lands on the top, never stopping on the face/edge as a wall drop.
    assert.equal(r.wallDrop,false,'no wall drop on the top edge: '+r.end.toArray());
    assert.ok(r.end.z>5||r.end.y>=top-1e-6,'centre above the top must not stop on the face: '+r.end.toArray());
    if(r.end.z>5)beyond++;
  }
  assert.ok(beyond>=probe.length-2,'the main sheet flies past the wall: '+beyond+'/'+probe.length);
  const face=swing(await setup('roller',{blocks:[[-40,high+.15,4,40,5]]}));
  for(const r of face){
    assert.ok(r.end.z<=4.01,'core below the top meets the face: '+r.end.toArray());
    assert.ok(r.end.y<=r.start.y+1e-6,'retained on the face, not above the glob: '+r.end.y);
  }
});

test('a Splatana Wiper wave whose outer lobe meets a pillar keeps flying; its core lobe ends it',async()=>{
  // Outer lobes sit 0.7 m to each side; the pillar overlaps only the right one.
  const side=await setup('s3-saber-lite',{muzzleY:1,blocks:[[.6,10,2.5,1.4,3.5]]});
  const [wave]=swing(side);
  assert.ok(wave.steps>=2&&wave.end.z>3.5,'wave carries past the pillar: '+wave.steps+' '+wave.end.toArray());
  const centre=await setup('s3-saber-lite',{muzzleY:1,blocks:[[-.4,10,2.5,.4,3.5]]});
  const [blocked]=swing(centre);
  assert.ok(blocked.end.z<=2.5,'the CoreIndex lobe still stops at the pillar: '+blocked.end.toArray());
});
