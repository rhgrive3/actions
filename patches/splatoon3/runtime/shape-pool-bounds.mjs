// Shape shaders place vertices directly in world space. Suppress only a draw
// whose current pass camera proves the entire batch outside; never its update.
export function updateShapePoolBounds(pool) {
  const sphere=pool._shapeBounds;
  pool._shapeBoundsValid=false;
  if (!sphere || !pool.recs.length) return;
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for (const record of pool.recs) {
    const v=record.v;
    for(let i=0;i<8;i++)if(!Number.isFinite(v[i]))return;
    let x=v[0],y=v[1],z=v[2],r;
    if(pool._shapeKind==='iA') {
      const dx=v[4]-x,dy=v[5]-y,dz=v[6]-z, length=Math.hypot(dx,dy,dz);
      if(!(length>1e-4))return; // degenerate GLSL normalize: retain original draw
      x+=dx*.5;y+=dy*.5;z+=dz*.5;r=length*.5+Math.max(Math.abs(v[3]),Math.abs(v[7]));
    } else if(pool._shapeKind==='iScl') r=Math.max(Math.abs(v[4]),Math.abs(v[5]),Math.abs(v[6]));
    else if(pool._shapeKind==='iDim') { y+=v[5]*.5;r=Math.hypot(Math.abs(v[4])*Math.max(1,Math.abs(v[6])),v[5]*.5); }
    else if(pool._shapeKind==='iNrm') {
      const length=Math.hypot(v[4],v[5],v[6]);if(!(length>1e-8))return;
      x+=v[4]/length*.02;y+=v[5]/length*.02;z+=v[6]/length*.02;r=Math.SQRT2*Math.abs(v[3]);
    } else return;
    r+=1e-5*(1+r+Math.abs(x)+Math.abs(y)+Math.abs(z));
    if(!Number.isFinite(x+y+z+r))return;
    minX=Math.min(minX,x-r);maxX=Math.max(maxX,x+r);
    minY=Math.min(minY,y-r);maxY=Math.max(maxY,y+r);
    minZ=Math.min(minZ,z-r);maxZ=Math.max(maxZ,z+r);
  }
  sphere.center.set((minX+maxX)*.5,(minY+maxY)*.5,(minZ+maxZ)*.5);
  sphere.radius=Math.hypot(maxX-minX,maxY-minY,maxZ-minZ)*.5;
  pool._shapeBoundsValid=Number.isFinite(sphere.radius);
}
export function installShapePoolBounds(THREE,pool,attrs) {
  if(!THREE.Sphere||!THREE.Frustum||!THREE.Matrix4)return;
  pool._shapeBounds=new THREE.Sphere();pool._shapeKind=attrs[0]==='iA'?'iA':attrs[1];
  const matrix=new THREE.Matrix4(),frustum=new THREE.Frustum(),mesh=pool.mesh;
  const before=mesh.onBeforeRender,after=mesh.onAfterRender;
  let savedCount=null;
  mesh.onBeforeRender=function(renderer,scene,camera,geometry,material,group) {
    before?.call(this,renderer,scene,camera,geometry,material,group);
    if(!pool._warmed||!pool._shapeBoundsValid||scene?.overrideMaterial||!camera?.projectionMatrix||!camera?.matrixWorldInverse||!Number.isFinite(geometry?.instanceCount))return;
    matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    for(const e of matrix.elements)if(!Number.isFinite(e))return;
    // Three's WebGL camera convention is used by these production shaders.
    // Unknown/WebGPU projection conventions remain visible.
    if(camera.coordinateSystem!==undefined&&camera.coordinateSystem!==THREE.WebGLCoordinateSystem)return;
    frustum.setFromProjectionMatrix(matrix,THREE.WebGLCoordinateSystem,camera.reversedDepth===true);
    if(!frustum.intersectsSphere(pool._shapeBounds)) {
      savedCount=geometry.instanceCount;geometry.instanceCount=0;
    }
  };
  mesh.onAfterRender=function(renderer,scene,camera,geometry,material,group) {
    if(savedCount!==null){geometry.instanceCount=savedCount;savedCount=null;}
    after?.call(this,renderer,scene,camera,geometry,material,group);
  };
}
