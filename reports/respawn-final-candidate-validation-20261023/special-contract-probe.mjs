import fs from 'node:fs';
import {fixture} from '../../patches/reliability/tests/controls-fixture.mjs';
import {fixture as sourceFixture} from '../../patches/splatoon3/tests/source-fixture.mjs';
const {MAP_LAYOUTS,Level}=await sourceFixture({productionComposition:true,extraExports:"export {MAP_LAYOUTS} from './inkwave-public/src/world/maps.js';"});
const f=await fixture({production:true}),{G,THREE,Actor,Physics,SPECIALS}=f,rows=[];
for(const [name,layout] of Object.entries(MAP_LAYOUTS)){
 const pad=new THREE.Vector3(...layout.spawnPads[1]),R=layout.spawnBarrier;
 G.level=new Level({bounds:{minX:pad.x-100,maxX:pad.x+100,minZ:pad.z-100,maxZ:pad.z+100},spawnPads:layout.spawnPads,spawnBarrier:R,half:[],single:[{kind:'box',min:[pad.x-100,pad.y-.5,pad.z-100],max:[pad.x+100,pad.y,pad.z+100]}]});G.physics=new Physics(G.level);G.time=0;
 const a=f.make('shooter'),victim=f.make('shooter');a.weapon={...a.weapon,special:'slam'};
 a.pos.copy(pad);a.pos.x+=R+.05;a.vel.set(0,0,0);a.intent.move.set(-1,0,0);a.groundN.set(0,1,0);a.grounded=true;
 a._surface=()=>{};a._horizontal=()=>{};a._updateClimb=()=>{};a._resolve=Actor.prototype._resolve;a._spawnBarrier=Actor.prototype._spawnBarrier;
 victim.team=1;victim.pos.copy(pad);victim.pos.x+=.2;victim.invuln=0;G.actors=[a,victim];G.paint.splat=()=>0;
 const hits=[];Object.assign(G.projectiles,{applyHit:(owner,v,damage)=>hits.push({damage,distance:owner.pos.distanceTo(v.pos),origin:owner.pos.toArray()})});
 a._startSpecial();let ticks=0;while(a.specialActive&&ticks++<180){G.time+=1/60;a.update(1/60);}
 rows.push({name,R,ticks,...hits[0],damageMax:SPECIALS.slam.damageMax,near:SPECIALS.slam.damageNearRadius??SPECIALS.slam.killRadius,oldLessThanMax:hits[0].damage<SPECIALS.slam.damageMax});
}
fs.writeFileSync(process.argv[2],JSON.stringify({site:process.env.INKWAVE_BUILT_SITE,rows},null,2)+'\n');console.log(JSON.stringify({maps:rows.length,oldClaimFails:rows.filter(r=>!r.oldLessThanMax).length,representative:rows.filter(r=>['tidewater','scorch','wahoo'].includes(r.name))}));
