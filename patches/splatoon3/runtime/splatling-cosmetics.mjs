// Splatling-only presentation. These bounded world-space dimensions are
// provisional INKWAVE calibration, not recovered Nintendo mesh parameters.
// Never use the Shooter's muzzle sheet/volume, collider or paint footprint.
export const SPLATLING_COSMETICS=Object.freeze({radius:.052,tailLength:.72});
export function isSplatlingCosmeticProjectile(p){
 return !!p&&!p.s3SpecialWeapon&&p.type==='shot'&&(p.catalog?.r?.family==='splatling'||p.s3Weapon?.kind==='splatling'||p.wid==='splatling');
}
export function appendSplatlingCosmetic(p,mesh,shape,look,petals,n,cap,m,q,s,dir,axis,camera){
 if(n>=cap||p.delay>0||!p.owner?.color||camera&&camera.distanceToSquared(p.pos)>65*65)return n;
 const speed=p.vel.length();dir.copy(p.vel);if(speed>1e-8)dir.multiplyScalar(1/speed);else dir.copy(axis);
 q.setFromUnitVectors(axis,dir);
 const grow=Math.min(1,Math.max(0,p.age)*30),r=SPLATLING_COSMETICS.radius*grow;
 if(!(r>0))return n;
 // A short tapered drop following this Splatling round, in world space.
 // Jumping/zooming cannot enlarge the radius or length through a camera scale.
 const travel=p.start?p.start.distanceTo(p.pos):0;
 const tail=Math.min(SPLATLING_COSMETICS.tailLength,travel,speed*3/60);
 s.setScalar(r);m.compose(p.pos,q,s);mesh.setMatrixAt(n,m);mesh.setColorAt(n,p.owner.color);
 const o=n*4;shape[o]=1+tail/r;shape[o+1]=.018;shape[o+2]=(p.seed||0)*40+p.age*25;shape[o+3]=.12;
 // Positive petal count selects a rounded bead, not the negative-count
 // Shooter rod branch. All entries are overwritten on pooled instance reuse.
 look[o]=.02;look[o+1]=4;look[o+2]=1;look[o+3]=(p.seed||0)*6.2832;
 petals[n*2]=petals[n*2+1]=0;return n+1;
}
