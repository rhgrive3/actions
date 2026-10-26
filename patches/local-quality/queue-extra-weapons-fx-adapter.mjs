// Build-only exact FX rewrites. Immutable upstream bytes remain pinned.
const CHANGES=[
  [
    "src/fx/fx.js",
    "camera.getWorldDirection(this._camDir);",
    "camera.updateWorldMatrix(true, false);",
    "camera-matrices"
  ],
  [
    "src/fx/screenfx.js",
    "    const hs = alive ? Math.hypot(a.vel.x, a.vel.z) : 0;\n    const form = alive ? a.anim.form : 'kid';\n    const swimming = form === 'swim' || form === 'climb';",
    "    const form = alive ? a.anim.form : 'kid';\n    const swimming = form === 'swim' || form === 'climb';\n    const inEnemy = alive && (a.onEnemy !== undefined ? !!a.onEnemy : a.grounded && a.groundTeam === 2 && !a.submerged);\n    const leavingSwim = alive && s.lastForm === 'swim' && form !== 'swim' && form !== 'climb';\n    const hs = alive && (swimming || leavingSwim || inEnemy) ? Math.hypot(a.vel.x, a.vel.z) : 0;",
    "lazy-screen-speed"
  ],
  [
    "src/fx/screenfx.js",
    "    // --- enemy ink underfoot: edge goo + splashes on the lower lens when walking through it\n    const inEnemy = alive && (a.onEnemy !== undefined ? !!a.onEnemy : a.grounded && a.groundTeam === 2 && !a.submerged);",
    "    // --- enemy ink underfoot: edge goo + splashes on the lower lens when walking through it",
    "shared-enemy-state"
  ],
  [
    "src/fx/fx.js",
    "    const _dropPhase = this._iwCosmeticPhase = ((this._iwCosmeticPhase || 0) + 1) % 3;",
    "    const _dropPhase = this._iwCosmeticPhase = ((this._iwCosmeticPhase || 0) + 1) % 3;\n    if(this.dN===0){this.dGeo.instanceCount=0;return;}",
    "empty-drops"
  ],
  [
    "src/fx/fxHooks.js",
    "        const dx = e.x - cam.position.x, dz = e.z - cam.position.z, d = Math.hypot(dx, dz);",
    "        const dx = e.x - cam.position.x, dz = e.z - cam.position.z;\n        if((Math.abs(dx)>48||Math.abs(dz)>48)&&!Number.isNaN(dx)&&!Number.isNaN(dz))continue;\n        const d = Math.hypot(dx, dz);",
    "ambient-outside-square"
  ]
];
const MARKER='// Additional weapon FX queue 20261025\n';
export function adaptQueueExtraWeaponsFx(file,source){
 if(source.includes(MARKER))return source;
 let changed=false;
 for(const [rel,before,after,label] of CHANGES){
  if(rel!==file)continue;
  const count=source.split(before).length-1;
  if(count!==1)throw new Error(`Additional weapon FX anchor ${label}: ${file}: expected 1, got ${count}`);
  source=source.replace(before,after);changed=true;
 }
 return changed?MARKER+source:source;
}
