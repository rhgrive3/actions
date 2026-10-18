// S3 11.3.0 BulletSaberSlash ShapeParam, in the existing INKWAVE world scale.
// The exported box/cylinder dimensions and slash offsets are source facts.
// Compound union, feet-relative yaw placement and sparse cylinder-radius
// recovery below are explicit interpreter choices; Nintendo's collision code
// and Wiper's omitted CylinderRadius have not been recovered.
const EPS=1e-9;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const v=(p,k)=>Number.isFinite(p?.[k])?p[k]:0;

export function saberSlashShape(record,key,ordinal=0){
  const vertical=key==='saber-vertical',p=record.parameters;
  const bullet=vertical?p.BulletSaberSlashVerticalParam:p.BulletSaberSlashHorizontalParam;
  const swing=p.spl__WeaponSaberParam.SwingParam;
  const offset=swing[vertical?'ShotSlashOffset_Vertical':ordinal%2===0?'ShotSlashOffset_L':'ShotSlashOffset_R'];
  const shape=bullet.ShapeParam,half=shape.BoxHalfExtents,center=shape.BoxCenter;
  const a=shape.CylinderCenterA,b=shape.CylinderCenterB;
  let axis=-1,radius=0;
  if(shape.HasCylinderShape&&a&&b){
    const dx=Math.abs(v(b,'X')-v(a,'X')),dy=Math.abs(v(b,'Y')-v(a,'Y')),dz=Math.abs(v(b,'Z')-v(a,'Z'));
    axis=dx>=dy&&dx>=dz?0:dy>=dz?1:2;
    // Wiper omits this scalar. Its box's perpendicular extent supplies an
    // explicitly inferred radius, not an asserted Nintendo schema default.
    radius=Number.isFinite(shape.CylinderRadius)?shape.CylinderRadius:
      axis===0?Math.max(half.Y,half.Z):axis===1?Math.max(half.X,half.Z):Math.max(half.X,half.Y);
  }
  const extent=Math.hypot(half.X+Math.abs(center.X),half.Y+Math.abs(center.Y),half.Z+Math.abs(center.Z));
  return {bullet,offset,half,center,a,b,axis,radius,
    range:new Float64Array(2),radiusInferred:axis>=0&&!Number.isFinite(shape.CylinderRadius),
    bound:Math.max(extent,axis>=0?Math.max(Math.hypot(a.X,a.Y,a.Z),Math.hypot(b.X,b.Y,b.Z))+radius:0)};
}

// Exactly test an upright receiving capsule against a yaw-rotated source box
// and the source finite capped cylinder. Source cylinder axes are X (Stamper,
// Wiper) or Y (Decavitator); the Z case is also handled. A cylinder must not
// turn into a capsule: that would wrongly extend its flat ends by its radius.
// `out` receives a point on the slash shape for contact-specific terrain LOS.
export function saberSlashContact(shape,origin,yaw,feet,radius,height,out){
  const cy=Math.cos(yaw),sy=Math.sin(yaw),dx=feet.x-origin.x,dz=feet.z-origin.z;
  const x=dx*cy-dz*sy,z=dx*sy+dz*cy;
  const lo=feet.y-origin.y+radius,hi=feet.y-origin.y+Math.max(radius,height-radius);
  const h=shape.half,c=shape.center;
  let px=clamp(x,c.X-h.X,c.X+h.X),pz=clamp(z,c.Z-h.Z,c.Z+h.Z);
  let py=clamp(clamp(c.Y,lo,hi),c.Y-h.Y,c.Y+h.Y);
  let gapY=py<lo?lo-py:py>hi?py-hi:0;
  let d2=(x-px)**2+(z-pz)**2+gapY**2;
  if(shape.axis>=0){
    const a=shape.a,b=shape.b,axis=shape.axis;
    // Minimize the vertical capsule segment's distance to a finite cylinder.
    // Axis-aligned source cylinders admit this exact closest vertical point.
    const qy=clamp((a.Y+b.Y)/2,lo,hi);
    let tx=x,ty=qy,tz=z;
    const ax=axis===0?1:0,ay=axis===1?1:0,az=axis===2?1:0;
    const coord=axis===0?x:axis===1?qy:z;
    const ca=axis===0?a.X:axis===1?a.Y:a.Z,cb=axis===0?b.X:axis===1?b.Y:b.Z;
    const along=clamp(coord,Math.min(ca,cb),Math.max(ca,cb));
    const rx=(x-a.X)*(1-ax),ry=(qy-a.Y)*(1-ay),rz=(z-a.Z)*(1-az);
    const length=Math.hypot(rx,ry,rz),scale=length>shape.radius?shape.radius/length:1;
    tx=ax?along:a.X+rx*scale;ty=ay?along:a.Y+ry*scale;tz=az?along:a.Z+rz*scale;
    const cylinderD2=(x-tx)**2+(qy-ty)**2+(z-tz)**2;
    if(cylinderD2<d2){d2=cylinderD2;px=tx;py=ty;pz=tz;}
  }
  if(d2>radius*radius+EPS)return false;
  out.set(origin.x+px*cy+pz*sy,origin.y+py,origin.z-px*sy+pz*cy);
  return true;
}

export function placeSaberSlash(actor,shape,out){
  const yaw=Math.atan2(actor.aimDir.x,actor.aimDir.z),cy=Math.cos(yaw),sy=Math.sin(yaw),o=shape.offset;
  out.set(actor.pos.x+v(o,'X')*cy+v(o,'Z')*sy,actor.pos.y+v(o,'Y'),actor.pos.z-v(o,'X')*sy+v(o,'Z')*cy);
  return yaw;
}

// Exact source compound shape against the existing Splash Wall's finite,
// zero-thickness upright rectangle. This avoids a bounding sphere turning a
// near-edge miss or a wall beyond the slash into melee damage.
function clipWallAxis(p,d,min,max,range){
  if(Math.abs(d)<EPS)return p>=min-EPS&&p<=max+EPS;
  let a=(min-p)/d,b=(max-p)/d;if(a>b){const t=a;a=b;b=t;}
  range[0]=Math.max(range[0],a);range[1]=Math.min(range[1],b);return range[0]<=range[1]+EPS;
}
export function saberSlashWallContact(shape,origin,yaw,pos,wallYaw,width,height,out){
  const cy=Math.cos(yaw),sy=Math.sin(yaw),wx=Math.cos(wallYaw)*width,wz=-Math.sin(wallYaw)*width;
  const dx=pos.x-wx/2-origin.x,dz=pos.z-wz/2-origin.z;
  const x=dx*cy-dz*sy,z=dx*sy+dz*cy,vx=wx*cy-wz*sy,vz=wx*sy+wz*cy;
  const y0=pos.y-origin.y,y1=y0+height,c=shape.center,h=shape.half;
  const range=shape.range;range[0]=0;range[1]=1;
  let t,py,hit=false;
  if(y1>=c.Y-h.Y-EPS&&y0<=c.Y+h.Y+EPS&&clipWallAxis(x,vx,c.X-h.X,c.X+h.X,range)&&clipWallAxis(z,vz,c.Z-h.Z,c.Z+h.Z,range)){
    t=clamp(-(x*vx+z*vz)/(vx*vx+vz*vz||1),range[0],range[1]);py=clamp(c.Y,Math.max(y0,c.Y-h.Y),Math.min(y1,c.Y+h.Y));hit=true;
  }
  if(!hit&&shape.axis>=0){
    range[0]=0;range[1]=1;const a=shape.a,b=shape.b,r=shape.radius;
    if(shape.axis===1){
      if(y1<Math.min(a.Y,b.Y)-EPS||y0>Math.max(a.Y,b.Y)+EPS)return false;
      t=clamp(((a.X-x)*vx+(a.Z-z)*vz)/(vx*vx+vz*vz||1),0,1);
      if((x+vx*t-a.X)**2+(z+vz*t-a.Z)**2>r*r+EPS)return false;
      py=clamp(a.Y,Math.max(y0,Math.min(a.Y,b.Y)),Math.min(y1,Math.max(a.Y,b.Y)));hit=true;
    }else if(shape.axis===0&&clipWallAxis(x,vx,Math.min(a.X,b.X),Math.max(a.X,b.X),range)){
      t=Math.abs(vz)>EPS?clamp((a.Z-z)/vz,range[0],range[1]):range[0];py=clamp(a.Y,y0,y1);
      hit=(py-a.Y)**2+(z+vz*t-a.Z)**2<=r*r+EPS;
    }else if(shape.axis===2&&clipWallAxis(z,vz,Math.min(a.Z,b.Z),Math.max(a.Z,b.Z),range)){
      t=Math.abs(vx)>EPS?clamp((a.X-x)/vx,range[0],range[1]):range[0];py=clamp(a.Y,y0,y1);
      hit=(py-a.Y)**2+(x+vx*t-a.X)**2<=r*r+EPS;
    }
  }
  if(!hit)return false;
  const px=x+vx*t,pz=z+vz*t;
  out.set(origin.x+px*cy+pz*sy,origin.y+py,origin.z-px*sy+pz*cy);return true;
}
