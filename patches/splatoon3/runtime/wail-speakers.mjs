// 11.3.0 WeaponSpMicroLaser.LaunchParam gives centre (0,1.7,-.6)
// and LaserBitRadius=1.3. The six-point hexagon is visible in Nintendo's
// demonstration; its angular orientation and pair order remain calibration.
// https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpMicroLaser.game__GameParameterTable.json
const top=1.3*Math.sqrt(3)/2;
export const WAIL_SPEAKER_POSITIONS=Object.freeze([
  [-.65,1.7+top,-.6],[.65,1.7+top,-.6],[-1.3,1.7,-.6],[1.3,1.7,-.6],[-.65,1.7-top,-.6],[.65,1.7-top,-.6],
].map(Object.freeze));
export function wailSpeakerOrigin(THREE,actor,index){
  const [x,y,z]=WAIL_SPEAKER_POSITIONS[index],yaw=actor.aimYaw??actor.yaw??0,c=Math.cos(yaw),s=Math.sin(yaw);
  return new THREE.Vector3(actor.pos.x+x*c+z*s,actor.pos.y+y,actor.pos.z+z*c-x*s);
}
