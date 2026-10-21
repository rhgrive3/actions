// Offline/CI audit. Open boundaries in a display export are not proof of a bug:
// validate coverage against its actual source triangles, never fill their AABBs.
export function validateNativeGeometry(data) {
 const {manifest:m,vertices:V,indices:I,triangles:T,normals:N,flags,objectIds,nodes,order,triangleFace}=data;
 const fail=message=>{throw Error(`${m.id}: ${message}`);};
 const check=(value,message)=>{if(!value)fail(message);};
 const count=T.length/9;
 check(V.length%8===0&&I.length%3===0&&Number.isInteger(count),'incomplete vertex or triangle stream');
 check(V.every(Number.isFinite)&&T.every(Number.isFinite),'nonfinite vertex');
 check(N.length===count*3&&flags.length===count&&objectIds.length===count&&triangleFace.length===count,'collision attribute lengths');
 let vertexEnd=0,indexEnd=0,collision=0,degenerate=0,activeTriangles=0,groundObjects=0;
 const cross=(a,b,c)=>{
  const F=Math.fround,ab=a.map((x,k)=>F(b[k]-x)),ac=a.map((x,k)=>F(c[k]-x));
  return [F(F(ab[1]*ac[2])-F(ab[2]*ac[1])),F(F(ab[2]*ac[0])-F(ab[0]*ac[2])),F(F(ab[0]*ac[1])-F(ab[1]*ac[0]))];
 };
 for(const [oi,o] of m.objects.entries()){
  check([o.vo,o.vc,o.io,o.ic].every(Number.isSafeInteger)&&o.vo===vertexEnd&&o.io===indexEnd&&o.vc>=0&&o.ic>=0&&o.ic%3===0,`object spans: ${o.name}`);
  vertexEnd+=o.vc;indexEnd+=o.ic;
  check(vertexEnd<=V.length/8&&indexEnd<=I.length,`object overflow: ${o.name}`);
  check(o.bounds?.length===2&&o.bounds.every(b=>b.length===3&&b.every(Number.isFinite)),`invalid object bounds: ${o.name}`);
  for(let id=o.vo;id<vertexEnd;id++)for(let k=0;k<3;k++)check(V[id*8+k]>=o.bounds[0][k]&&V[id*8+k]<=o.bounds[1][k],`vertex outside object bounds: ${o.name}`);
  check(!o.collidable||o.active&&!o.background,`inactive/background collider: ${o.name}`);
  // Independent semantic guard for the failure that removed structural moss
  // floors. Explicit per-stage exclusions still own intentional decorations.
  const excluded=(m.sourceSemantics?.nonCollidableObjectPatterns||[]).some(p=>new RegExp(p).test(o.name));
  if(o.active&&!o.background&&/^Fld(?:Obj)?_/.test(o.name)&&/GroundGrass/i.test(o.material)&&!excluded){
   check(o.collidable,`structural ground excluded from collision: ${o.name}`);groundObjects++;
  }
  if(o.active)activeTriangles+=o.ic/3;
  for(let i=o.io;i<indexEnd;i+=3){
   const ids=[I[i],I[i+1],I[i+2]];
   check(ids.every(id=>id<o.vc),`out-of-object index: ${o.name}`);
   if(!o.collidable)continue;
   const points=ids.map(id=>Array.from(V.subarray((o.vo+id)*8,(o.vo+id)*8+3))),c=cross(...points),F=Math.fround;
   const length=F(Math.sqrt(F(F(F(c[0]*c[0])+F(c[1]*c[1]))+F(c[2]*c[2]))));
   if(length<=1e-9){degenerate++;continue;}
   check(collision<count&&objectIds[collision]===oi,`missing/reordered collision triangle at source index ${i}`);
   for(let j=0;j<3;j++)for(let k=0;k<3;k++)check(T[collision*9+j*3+k]===points[j][k],`render/collision position mismatch at ${collision}`);
   const normal=Array.from(N.subarray(collision*3,collision*3+3));
   check(normal.every(Number.isFinite)&&Math.abs(Math.hypot(...normal)-1)<1e-5,`invalid normal at ${collision}`);
   check(Math.abs(c.reduce((a,x,k)=>a+x/length*normal[k],0))>.9999,`nonparallel collision normal at ${collision}`);
   check(flags[collision]===(1|(o.paintable?2:0)|(o.grate?4:0)|(o.glass?8:0)),`collision flags at ${collision}`);
   collision++;
  }
 }
 check(vertexEnd===V.length/8&&indexEnd===I.length&&collision===count,'unowned or extra geometry');
 check(m.geometry.vertices===vertexEnd&&m.geometry.triangles===indexEnd/3&&m.geometry.collisionTriangles===count,'manifest geometry counts');
 check(nodes.length%8===0&&nodes.length>0&&nodes.every(Number.isFinite)&&order.length===count,'invalid BVH streams');
 const seen=new Uint8Array(count),visited=new Uint8Array(nodes.length/8),stack=[0];let leaves=0;
 const inside=(x,min,max)=>x>=min&&x<=max;
 while(stack.length){
  const node=stack.pop(),at=node*8;
  check(Number.isInteger(node)&&node>=0&&node<visited.length&&!visited[node],'invalid/cyclic BVH child');visited[node]=1;
  for(let k=0;k<3;k++)check(nodes[at+k]<=nodes[at+3+k],'inverted BVH bounds');
  const left=nodes[at+6],right=nodes[at+7];check(Number.isInteger(left)&&Number.isInteger(right),'fractional BVH child');
  if(left>=0){
   for(const child of [left,right])for(let k=0;k<3;k++)check(inside(nodes[child*8+k],nodes[at+k],nodes[at+3+k])&&inside(nodes[child*8+3+k],nodes[at+k],nodes[at+3+k]),'child outside parent BVH bounds');
   stack.push(left,right);
  }else{
   const start=-left-1;check(right>0&&start+right<=order.length,'invalid BVH leaf');leaves++;
   for(let i=start;i<start+right;i++){
    const id=order[i];check(id<count&&!seen[id],'missing/duplicate BVH triangle');seen[id]=1;
    for(let j=0;j<3;j++)for(let k=0;k<3;k++)check(inside(T[id*9+j*3+k],nodes[at+k],nodes[at+3+k]),'triangle outside BVH bounds');
   }
  }
 }
 check(seen.every(Boolean)&&visited.every(Boolean),'unreachable BVH geometry');
 const painted=new Uint8Array(count);let cells=0;
 for(const [fi,f] of m.faces.entries()){
  check(f.grid===cells&&f.nu>0&&f.nv>0&&f.su>0&&f.sv>0,'invalid paint chart span');cells+=f.nu*f.nv;
  for(const id of f.triangles){
   check(id<count&&!painted[id]&&(flags[id]&2)&&objectIds[id]===f.object&&triangleFace[id]===fi,'paint/source mismatch');painted[id]=1;
   for(let j=0;j<3;j++)for(let k=0;k<3;k++)check(inside(T[id*9+j*3+k],f.bounds[0][k],f.bounds[1][k]),'triangle outside paint bounds');
  }
 }
 check(cells===data.mask.length&&cells===m.gridCells,'paint mask length');
 for(let id=0;id<count;id++)check(painted[id]||triangleFace[id]===-1,'unowned paint triangle');
 return {vertices:vertexEnd,displayTriangles:indexEnd/3,activeTriangles,collisionTriangles:count,sourceDegenerateTriangles:degenerate,structuralGroundObjects:groundObjects,bvhNodes:visited.length,bvhLeaves:leaves,paintFaces:m.faces.length,gridCells:cells};
}
