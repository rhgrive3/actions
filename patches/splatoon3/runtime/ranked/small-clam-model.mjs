// Broad shell silhouette and gold/seam divisions from Nintendo 038_en.jpg.
// Visual resources only: no pickup, collision, team, or scoring state.
export const SMALL_CLAM_HALF_HEIGHT = .066;
export function createSmallClamResources(THREE) {
  const position = [], color = [], index = [];
  const gold = new THREE.Color(0xe9b94e), edge = new THREE.Color(0x765126);
  const n = 16, rings = 2;
  const vertex = (x,y,z,c) => { const id=position.length/3; position.push(x,y,z); color.push(c.r,c.g,c.b); return id; };
  const rims=[];
  for (const sign of [1,-1]) {
    const center=vertex(0,sign*SMALL_CLAM_HALF_HEIGHT,0,gold), rows=[];
    for(let r=1;r<=rings;r++) {
      const row=[], t=r/rings;
      for(let j=0;j<n;j++) {
        const a=j*2*Math.PI/n;
        // Low, broad lobes, a narrow hinge end and a continuous dark lip.
        const taper=1-.18*Math.max(0,-Math.sin(a));
        row.push(vertex(.2*t*Math.cos(a)*taper,sign*(.006+.06*Math.sqrt(1-t*t)),.145*t*Math.sin(a),r===rings?edge:gold));
      }
      rows.push(row);
    }
    const face=(a,b,c)=> index.push(...(sign===1?[a,c,b]:[a,b,c]));
    for(let j=0;j<n;j++) {
      const k=(j+1)%n;
      face(center,rows[0][j],rows[0][k]);
      for(let r=1;r<rings;r++) { face(rows[r-1][j],rows[r][j],rows[r][k]); face(rows[r-1][j],rows[r][k],rows[r-1][k]); }
    }
    rims.push(rows[rings-1]);
  }
  for(let j=0;j<n;j++) { const k=(j+1)%n; index.push(rims[0][j],rims[0][k],rims[1][k],rims[0][j],rims[1][k],rims[1][j]); }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(color,3));
  geometry.setIndex(index); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.4,metalness:.12});
  return {geometry,material};
}

// One draw for the carried row, with shared field resources. The caller owns
// and disposes resources once; disposing an instance must not dispose them.
export function createSmallClamInventory(THREE,resources) {
  const mesh=new THREE.InstancedMesh(resources.geometry,resources.material,7);
  mesh.count=0; mesh.visible=false; mesh.userData.smallClamCount=0;
  return mesh;
}
export function updateSmallClamInventory(THREE,mesh,value) {
  const count=Math.max(0,Math.min(7,Number.isFinite(value)?Math.floor(value):0));
  if(mesh.userData.smallClamCount!==count) {
    const transform=new THREE.Object3D();
    for(let i=0;i<count;i++) {
      transform.position.set((i-(count-1)/2)*.27,0,0);
      transform.rotation.set(.32,0,0); transform.scale.setScalar(.8); transform.updateMatrix();
      mesh.setMatrixAt(i,transform.matrix);
    }
    mesh.count=count; mesh.userData.smallClamCount=count;
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
  }
  mesh.visible=count>0;
  return count;
}
