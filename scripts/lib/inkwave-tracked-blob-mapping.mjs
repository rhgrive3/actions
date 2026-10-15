// PRIVATE measurement feasibility only. No renderer mutation or acceptance predicate.
import {THREE} from './inkwave-verified-renderer.mjs';
export { THREE };
const finite = a => a.every(Number.isFinite);
export function expectedHead(p) {
  if (!['blast','shot'].includes(p.type) || !(p.age > 0) || p.delay > 0 || !(p.life > 0)) throw Error('unsupported tracked head');
  const sp = p.vel.length(), dir = p.vel.clone().multiplyScalar(1 / Math.max(sp, 1e-3));
  if (sp < 1e-3) throw Error('degenerate direction');
  const g = Math.min(1,p.age*20), t = THREE.MathUtils.clamp((p.age/p.life-.8)/.2,0,1), k=p.type==='blast'?t*t*(3-2*t):0;
  const vis=(p.vis||p.size)*g*(1+.3*Math.sin(g*Math.PI))*(1+.34*k);
  const tail=((p.tail0??1)+Math.min(p.tailK??1.2,sp*.04)*g)*(1-.55*k);
  const shape = [tail,(p.wob??.04)*(1+2.4*k),p.seed*40+p.age*(p.wobF||20),p.nose||0].map(Math.fround);
  const matrix=new THREE.Matrix4().compose(p.pos,new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),dir),new THREE.Vector3(vis,vis,vis)).elements.map(Math.fround);
  if (!finite([...matrix,...shape]) || !(vis>0)) throw Error('invalid head');
  return {matrix,shape};
}
export function mapHead(p, matrices, shapes, count) {
  if (!Number.isSafeInteger(count)||count<0||matrices.length<count*16||shapes.length<count*4) throw Error('invalid buffers');
  const e=expectedHead(p), matches=[];
  for(let i=0;i<count;i++) if(e.matrix.every((v,j)=>v===matrices[i*16+j])&&e.shape.every((v,j)=>v===shapes[i*4+j])) matches.push(i);
  if(matches.length!==1) throw Error(`ambiguous or missing head: ${matches.length}`);
  return matches[0];
}
// Exact positional shader expression, evaluated at the actual geometry vertices.
export function deform(p,n,s) {
  if(!finite([...p,...n,...s])) throw Error('nonfinite vertex');
  const back=p[2]<=0?1:0,u=Math.min(1,Math.max(0,-p[2]));
  const tau=1-.42*Math.pow(u,1.3)*back,fz=back?Math.max(s[0],1):1-.22*s[3];
  const wob=s[1]*(.6*Math.sin(s[2]+2.3*p[0]+1.7*p[1]+.9*p[2])+.4*Math.sin(1.63*s[2]-2.9*p[1]+2.1*p[2]))*(1-.5*back*u);
  return [p[0]*tau+n[0]*wob,p[1]*tau+n[1]*wob,p[2]*fz+n[2]*wob];
}
export function screenBounds(geometry, matrix, shape, viewProjection, width, height, pad=2) {
  if(!finite([...matrix,...shape,...viewProjection.elements,width,height,pad])||width<=0||height<=0||pad<0) throw Error('invalid projection');
  const m=new THREE.Matrix4().multiplyMatrices(viewProjection,new THREE.Matrix4().fromArray(matrix));
  const pos=geometry.attributes.position,nor=geometry.attributes.normal;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(let i=0;i<pos.count;i++) {
    const p=deform([pos.getX(i),pos.getY(i),pos.getZ(i)],[nor.getX(i),nor.getY(i),nor.getZ(i)],shape);
    const q=new THREE.Vector4(...p,1).applyMatrix4(m);
    // Fail closed at near/far clipping rather than pretending unclipped vertex bounds suffice.
    if(!(q.w>0)||q.z<=-q.w||q.z>=q.w) throw Error('clip-plane intersection');
    const x=(q.x/q.w+1)*width/2,y=(1-q.y/q.w)*height/2;
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  if(!finite([minX,minY,maxX,maxY]))throw Error('empty geometry');
  return {minX:Math.floor(minX-pad),minY:Math.floor(minY-pad),maxX:Math.ceil(maxX+pad),maxY:Math.ceil(maxY+pad)};
}
export function isolatedHead(index,bounds) {
  const a=bounds[index]; if(!a)throw Error('missing head bounds');
  for(let i=0;i<bounds.length;i++)if(i!==index){const b=bounds[i];if(!b||!(a.maxX<b.minX||b.maxX<a.minX||a.maxY<b.minY||b.maxY<a.minY))throw Error('overlapping or unknown instance');}
  return a;
}
