// Shared evidence-only primitive. Directions describe tangent strokes, not
// family timing, visibility, center rings or spread calibration.
export const DIAGONAL_QUADRANTS=Object.freeze([
 Object.freeze({name:'tl',x:-1,y:-1,angle:45}),
 Object.freeze({name:'tr',x:1,y:-1,angle:-45}),
 Object.freeze({name:'bl',x:-1,y:1,angle:-45}),
 Object.freeze({name:'br',x:1,y:1,angle:45}),
]);
export function diagonalSlashPath({x,y,length=11,angle}){
 if(![x,y,length,angle].every(Number.isFinite)||length<=0)throw TypeError('finite slash geometry required');
 const a=angle*Math.PI/180,dx=Math.sin(a)*length/2,dy=-Math.cos(a)*length/2;
 return `M${(x-dx).toFixed(4)} ${(y-dy).toFixed(4)}L${(x+dx).toFixed(4)} ${(y+dy).toFixed(4)}`;
}
