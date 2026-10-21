// Drawn source-owned mantle vertices, after skeleton and complete parent transforms.
// Select landmarks from unchanged rest geometry, never from the expected heading.
const landmarks=new WeakMap();
export function measureSkinnedHeading(THREE,character){
 const mesh=character.squid.body,g=mesh.geometry,p=g.attributes.position;
 let ids=landmarks.get(g);
 if(!ids){
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;ids={left:-1,right:-1,base:-1,tip:-1};
  for(let i=0;i<p.count;i++)if(g.attributes.aEx.getX(i)===0){
   const x=p.getX(i),y=p.getY(i);
   if(x<minX){minX=x;ids.left=i;}if(x>maxX){maxX=x;ids.right=i;}
   if(Math.abs(x)<.005){if(y<minY){minY=y;ids.base=i;}if(y>maxY){maxY=y;ids.tip=i;}}
  }
  if(Object.values(ids).some(x=>x<0)||minX===maxX||minY===maxY)throw Error('Missing native mantle landmarks');
  landmarks.set(g,ids);
 }
 character.root.updateMatrixWorld(true);character.sourceMotion.squidRig.skeleton.update();
 const v=i=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
 const mantle=v(ids.tip).sub(v(ids.base)).normalize(),width=v(ids.right).sub(v(ids.left)).normalize();
 return {indices:{...ids},mantle:mantle.toArray(),width:width.toArray(),heading:Math.atan2(mantle.x,mantle.z),pitch:Math.asin(mantle.y),roll:Math.asin(width.y)};
}
