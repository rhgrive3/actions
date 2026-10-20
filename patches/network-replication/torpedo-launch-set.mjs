// Native velocity feasibility only, never authority by itself. Any aim is permitted.
// ownerHorizontalLimit MUST be independently justified; no snapshot comparison.
export function anyAimEnvelope(spec,speed,ownerHorizontalLimit){
 if(!Number.isFinite(speed)||speed<=0||!Number.isFinite(ownerHorizontalLimit)||ownerHorizontalLimit<0||spec.inheritX!==spec.inheritZ)return null;
 const a=-1.05,b=1.15,u=spec.spawnSpeedY;
 const h=p=>speed*Math.cos(p)-u*Math.sin(p), y=p=>speed*Math.sin(p)+u*Math.cos(p);
 const pitches=[a,b],peak=-Math.atan2(u,speed);if(peak>=a&&peak<=b)pitches.push(peak);
 return {horizontalMax:Math.max(...pitches.map(h))+spec.inheritX*ownerHorizontalLimit,
 yMin:Math.max(spec.spawnSpeedYWorldMin,y(a)),yMax:Math.max(spec.spawnSpeedYWorldMin,y(b)+spec.inheritYMax)};
}
export function classifyAnyAim(v,spec,speed,ownerHorizontalLimit){
 const e=anyAimEnvelope(spec,speed,ownerHorizontalLimit);if(!e||![v.x,v.y,v.z].every(Number.isFinite))return 'indeterminate';
 // r2 event cells. Couple vertical feasibility to pitch before radial check.
 const ymin=v.y-.005,ymax=v.y+.005,lo=-1.05,hi=1.15,u=spec.spawnSpeedY;
 if(ymax<e.yMin||ymin>e.yMax)return 'outside-bounded-native-set';
 const y=p=>speed*Math.sin(p)+u*Math.cos(p),h=p=>speed*Math.cos(p)-u*Math.sin(p);
 const inverse=target=>{let a=lo,b=hi;for(let i=0;i<64;i++){const m=(a+b)/2;if(y(m)<target)a=m;else b=m;}return [a,b];};
 // Upward inherited velocity spans [0,inheritYMax]; floor clamp retains all
 // lower raw vertical speeds when its output cell includes the floor.
 const rawMin=ymin<=spec.spawnSpeedYWorldMin?-Infinity:ymin-spec.inheritYMax,rawMax=ymax;
 if(rawMin>y(hi)||rawMax<y(lo))return 'outside-bounded-native-set';
 const pmin=rawMin<=y(lo)?lo:inverse(rawMin)[0],pmax=rawMax>=y(hi)?hi:inverse(rawMax)[1];
 if(pmin>pmax)return 'outside-bounded-native-set';
 const values=[h(pmin),h(pmax)],peak=-Math.atan2(u,speed);if(peak>=pmin&&peak<=pmax)values.push(h(peak));
 const radius=spec.inheritX*ownerHorizontalLimit;
 const rLower=Math.hypot(Math.max(0,Math.abs(v.x)-.005),Math.max(0,Math.abs(v.z)-.005));
 const rUpper=Math.hypot(Math.abs(v.x)+.005,Math.abs(v.z)+.005);
 return rLower<=Math.max(...values)+radius && rUpper>=Math.max(0,Math.min(...values)-radius)?'compatible-not-authorized':'outside-bounded-native-set';
}
export function minimumActorSpeed(v,spec,speed){
 const e=anyAimEnvelope(spec,speed,0);return Math.max(0,(Math.hypot(v.x,v.z)-e.horizontalMax)/spec.inheritX);
}
