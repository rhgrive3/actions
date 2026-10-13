/** Fairer LOCAL start calibration on an already source-clear route. Pick an
 * existing waypoint nearest half the complete 3D arc; never move a point,
 * change the source-supported endpoints, or qualify a same-bank route. */
export function nativeTowerStartIndex(path){
 if(!Array.isArray(path)||path.length<3)throw Error('Native tower calibration requires a complete source route');
 const arc=[0];
 for(let i=0;i<path.length;i++){
  const p=path[i];if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw Error('Native tower route contains an invalid waypoint');
  if(i)arc.push(arc.at(-1)+Math.hypot(...p.map((v,k)=>v-path[i-1][k])));
 }
 const total=arc.at(-1);if(!(total>0))throw Error('Native tower source route has no travel arc');
 let best=1;
 for(let i=2;i<path.length-1;i++)if(Math.abs(arc[i]-total*.5)<Math.abs(arc[best]-total*.5))best=i;
 return best;
}
