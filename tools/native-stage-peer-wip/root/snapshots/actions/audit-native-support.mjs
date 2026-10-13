import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture(),G=f.G,L=G.level=new f.NativeLevel(readStage('.codex-stage-sources/generated','scorch'));G.physics=new f.NativePhysics(L);
const a=f.make();a.spawnAt(L.spawnPads[0],0);
for(const [x,z]of [[7.5,-70.95],[8.138118671327813,-69.92051832049543],[7.5,-63.45],[7.5,-58.95],[0,-65],[4,-65],[8,-65],[12,-65]]){
 const y=L.groundHeight(x,z);a.pos.set(x,y,z);a.vel.set(0,-1,0);a.grounded=true;a._resolve(false,y,false);
 console.log(JSON.stringify({at:[x,y,z],resolved:a.pos.toArray(),grounded:a.grounded,hit:a.ground.hit,bodyFits:G.physics.bodyFits(new f.THREE.Vector3(x,y,z),f.PLAYER.radius,.32,f.PLAYER.height),contacts:a.contacts}));
}
