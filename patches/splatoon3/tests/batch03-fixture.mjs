import { fixture } from './source-fixture.mjs';
export async function batchFixture() {
  const f = await fixture({extraExports: "export * from './patches/splatoon3/runtime/weapons-fidelity.mjs';"});
  f.installWeaponsFidelity(f, f.profile);
  const { G, THREE } = f;
  G.scene = new THREE.Scene(); G.actors = []; G.boss = null; G.netm = null;
  G.level = {blocks: [], faces: [], groundHeight: () => 0, queryBlocks: (_a,_b,_c,_d,out) => {out.length=0;return out;}};
  G.physics = new f.Physics(G.level);
  G.physics.raycast = (from, direction, distance, hit) => {
    hit.hit = direction.y < 0 && from.y >= 0 && from.y / -direction.y <= distance;
    if(hit.hit){hit.point.copy(from).addScaledVector(direction,from.y / -direction.y);hit.normal.set(0,1,0);hit.face=0;hit.block=0;}
    return hit;
  };
  G.physics.los = () => true;
  G.projectiles = new f.Projectiles(G.scene);
  const paint = [];
  G.paint = {sample: () => 1, splat: (point,radius,team,opts={}) => {paint.push({point:point.clone(),radius,team,opts:{...opts,stretch:opts.stretch?.clone()}});return 1;}};
  return {...f, paint};
}
export function cpuFloor(f, size=30, cell=.05) {
  const { THREE, PaintSystem } = f;
  const face = {su:size,sv:size,turf:true,origin:new THREE.Vector3(-size/2,0,-size/2),u:new THREE.Vector3(1,0,0),v:new THREE.Vector3(0,0,1),n:new THREE.Vector3(0,1,0)};
  const p=Object.create(PaintSystem.prototype);
  Object.assign(p,{level:{pointInside:()=>false},paintFaces:[face],cell,version:0});p._initGrid();
  function splat(point,radius,team,opts={}) {
    const rr=Math.sqrt(Math.max(0,radius*radius-point.y*point.y));
    const dir=opts.stretch, len=dir?Math.hypot(dir.x,dir.z):0;
    return p._cpuSplat(face,point.x+size/2,point.z+size/2,rr,team,opts.seed??.5,len?dir.x/len:1,len?dir.z/len:0,opts.stretchAmt??0,(opts.kind==='roll'||opts.kind==='rollFloor')?6:opts.kind==='drop'?5:0);
  }
  function extent(axis='x') {
    let lo=Infinity,hi=-Infinity;
    for(let j=0;j<face.nv;j++)for(let i=0;i<face.nu;i++)if(p.grid[face.grid+j*face.nu+i]){
      const v=axis==='x'?(i+.5)*face.cu-size/2:(j+.5)*face.cv-size/2;lo=Math.min(lo,v);hi=Math.max(hi,v);
    }
    return {lo,hi,width:hi-lo+cell};
  }
  return {p,face,splat,extent};
}
