// Family-specific connections applied after the established visual adapter.
// Gameplay methods, generic particles and Slosher/roller paths are untouched.
function once(code,before,after,label){const at=code.indexOf(before);if(at<0||code.indexOf(before,at+before.length)>=0)throw Error('firing cosmetics anchor: '+label);return code.slice(0,at)+after+code.slice(at+before.length);}
export function adaptFiringCosmetics(rel,code){
 if(rel!=='src/game/weapons.js')return code;
 code="import {isSplatlingCosmeticProjectile,appendSplatlingCosmetic} from '../../patches/splatoon3/runtime/splatling-cosmetics.mjs';\nimport {ShooterMuzzleDroplets} from '../../patches/splatoon3/runtime/shooter-muzzle-droplets.mjs';\n"+code;
 code=once(code,'    this.projectileVisuals = new ProjectileVisualRuntime(this, THREE, {','    this.shooterMuzzleDroplets = new ShooterMuzzleDroplets(THREE);\n    this.projectileVisuals = new ProjectileVisualRuntime(this, THREE, {','fixed records');
 code=once(code,'nativeShapeOwns: p => Object.hasOwn(', 'nativeShapeOwns: p => isSplatlingCosmeticProjectile(p) || Object.hasOwn(','Splatling owns its body');
 code=once(code,'    this.projectileVisuals.reset(p);','    this.projectileVisuals.reset(p);\n    p._iwShooterMuzzleSeen = false;','pooled birth');
 code=once(code,'    this.projectileVisuals.clear();','    this.shooterMuzzleDroplets.clear();\n    this.projectileVisuals.clear();','retirement');
 code=once(code,'      this.projectileVisuals.ensureBirth(p);',`      this.shooterMuzzleDroplets.observe(p, G.time, this, G.camera?.position);
      if (isSplatlingCosmeticProjectile(p)) continue;
      this.projectileVisuals.ensureBirth(p);`,'separate family draws');
 code=once(code,'    B.count = n;',`    // Existing native bodies, flight drops and sourced/S3 effects own their
    // previous slots. New family cosmetics may use only the remaining capacity.
    for (const p of this.list) {
      if (n >= MAX_BLOBS) break;
      if (isSplatlingCosmeticProjectile(p)) n = appendSplatlingCosmetic(p, B, shp, inkLook, fourPetals, n, MAX_BLOBS, _m, _q, _s, _dir, ZAX, G.camera?.position);
    }
    n = this.shooterMuzzleDroplets.append(G.time, B, shp, inkLook, fourPetals, n, MAX_BLOBS, _m, _q, _s, _v, _dir, ZAX);
    B.count = n;`,'shared mesh upload after existing effects');
 code=once(code,'disposeVisuals() { this.projectileVisuals.dispose(); }','disposeVisuals() { this.shooterMuzzleDroplets.clear(); this.projectileVisuals.dispose(); }','visual disposal');
 return code;
}
