import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture(),G=f.G,L=G.level=new f.NativeLevel(readStage('.codex-stage-sources/generated','brinewater'));G.physics=new f.NativePhysics(L);
class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4});G.nav=new f.NavGraph(L,G.physics);G.match.mode='turf';G.match.opts={};
const stage=f.nativeRankedStage(G),mid=G.nav.nearest(new f.THREE.Vector3(...stage.rainmaker.center));
for(let t=0;t<2;t++)for(let slot=0;slot<4;slot++){
 const a=f.make();a._integrate=f.Actor.prototype._integrate;a.team=t;a.slot=slot;a.isBot=true;f.beginInitialSquidSpawn(a);for(let i=0;i<75;i++)a.update(1/60);const n=G.nav.nearest(a.pos),path=G.nav.path(n,mid,t,50000);
 console.log(JSON.stringify({team:t,slot,pos:a.pos.toArray(),phase:a.s3.squidSpawn?.phase,grounded:a.grounded,nearest:n,route:path?.length||0}));
}
