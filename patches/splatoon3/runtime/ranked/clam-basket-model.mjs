// Clam Blitz goal presentation. S3's goal is a raised basket — a wide, netted
// bowl on a pedestal under the barrier dome — not a ring lying on the floor.
// Proportions are INKWAVE calibration inside the existing scoring volume
// (goal + 0.55 centre, 0.95 horizontal radius, +-1.55 vertical) and the 1.3
// barrier shell; scoring, collision and barrier rules are unchanged.
// Silhouette reference: Nintendo's Clam Blitz introduction/product pages.
export const CLAM_BASKET = Object.freeze({
  rimY: 1.55, rimRadius: .9, bowlBottomY: .95, bowlBottomRadius: .55, postHeight: .95, tuckDrop: .55,
});
export function createClamBasketModel(THREE, color) {
  const B = CLAM_BASKET, group = new THREE.Group();
  group.name = 'clam-basket';
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a4b4d, metalness: .25, roughness: .65 });
  const shell = new THREE.MeshStandardMaterial({ color: 0xe9ecef, metalness: .05, roughness: .55, side: THREE.DoubleSide });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.6, .7, .12, 20), steel);
  base.position.y = .06;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.13, .18, B.postHeight, 12), steel);
  post.position.y = B.postHeight / 2;
  const basket = new THREE.Group();
  basket.name = 'clam-basket-body';
  const bowlH = B.rimY - B.bowlBottomY;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(B.rimRadius - .03, B.bowlBottomRadius, bowlH, 24, 1, true), shell);
  bowl.position.y = B.bowlBottomY + bowlH / 2;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(B.bowlBottomRadius, 24), shell);
  floor.rotation.x = -Math.PI / 2; floor.position.y = B.bowlBottomY + .005;
  // Team-coloured net over the bowl: one wireframe draw.
  const netMaterial = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: .75 });
  const net = new THREE.Mesh(new THREE.CylinderGeometry(B.rimRadius + .005, B.bowlBottomRadius + .005, bowlH, 12, 3, true), netMaterial);
  net.position.y = bowl.position.y;
  // `hoop` keeps its role: the rim whose colour shows the open/closed state.
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(B.rimRadius, .075, 10, 32),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: .92, emissive: color, emissiveIntensity: .14 }));
  hoop.rotation.x = Math.PI / 2; hoop.position.y = B.rimY;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(B.bowlBottomRadius, .05, 8, 24), steel);
  collar.rotation.x = Math.PI / 2; collar.position.y = B.bowlBottomY;
  basket.add(bowl, floor, net, hoop, collar);
  group.add(base, post, basket);
  let drop = 0;
  // Tucked (after a barrier closes) lowers the basket into its pedestal; the
  // rule state alone decides it, and the motion is a bounded display ease.
  const update = (state = {}, dt = 0) => {
    const target = state.tucked || (state.cooldown > 0) ? B.tuckDrop : 0;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    drop += (target - drop) * (1 - Math.exp(-10 * step));
    if (Math.abs(target - drop) < 1e-4) drop = target;
    basket.position.y = -drop;
    group.userData.basketDrop = drop;
  };
  return { group, hoop, net, basket, update };
}
