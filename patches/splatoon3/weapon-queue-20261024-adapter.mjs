// Build-only optimization of canonical composed public source. Raw snapshots stay immutable.
const PATCHES=[
  {
    "rel": "src/fx/swimWake.js",
    "before": "r = Math.max(r, Math.hypot(s.head.x - cx, s.head.y - cy, s.head.z - cz));",
    "after": "if (!s.swimming) r = Math.max(r, Math.hypot(s.head.x - cx, s.head.y - cy, s.head.z - cz));",
    "label": "reuse the live wake head radius"
  },
  {
    "rel": "src/game/inkFlightRuntime.js",
    "before": "    const options = { seed: p.seed, kind: sourceFlightInkKind(kind), footprint: mainInkFootprint(p.s3Weapon || p.inkKey), face: hit.face, claimOwner: p.owner,\n      stretch: projected > EPS ? this.heading : undefined, stretchAmt: projected > EPS ? shape.stretch : 0 };\n    p.owner.addTurf(G.paint.splat(this.point, shape.radius, p.team, options));",
    "after": "    const depth=this._paintOptionsDepth||0, leases=this._paintOptionsLeases||=([]);\n    const options=leases[depth]||=( {} );this._paintOptionsDepth=depth+1;\n    try {\n      options.seed=p.seed;options.kind=sourceFlightInkKind(kind);options.footprint=mainInkFootprint(p.s3Weapon||p.inkKey);\n      options.face=hit.face;options.claimOwner=p.owner;options.stretch=projected>EPS?this.heading:undefined;options.stretchAmt=projected>EPS?shape.stretch:0;\n      p.owner.addTurf(G.paint.splat(this.point,shape.radius,p.team,options));\n    } finally { options.claimOwner=null;options.stretch=undefined;this._paintOptionsDepth=depth; }",
    "label": "lease synchronous ink-flight paint options"
  },
  {
    "rel": "src/game/weapons.js",
    "before": "    const up = clamp(a.aimPitch, -0.2, 0.5) + 0.32;",
    "after": "    const up = clamp(a.aimPitch, -0.2, 0.5) + 0.32;\n    const upSine = Math.sin(up);",
    "label": "reuse flick pitch sine"
  },
  {
    "rel": "src/game/weapons.js",
    "before": "p.vel.set(Math.sin(ang) * cu * sp, Math.sin(up) * sp, Math.cos(ang) * cu * sp);",
    "after": "p.vel.set(Math.sin(ang) * cu * sp, upSine * sp, Math.cos(ang) * cu * sp);",
    "label": "apply flick pitch sine"
  },
  {
    "rel": "src/game/weapons.js",
    "before": "      if (_v3.distanceTo(at) > w.splashRadius + 0.3) continue;",
    "after": "      const farRadius=w.splashRadius+0.3;\n      if(Number.isFinite(farRadius)&&farRadius>=0&&_v3.distanceToSquared(at)>(farRadius+1e-6)**2)continue;\n      if (_v3.distanceTo(at) > farRadius) continue;",
    "label": "conservative slosher far-only rejection"
  },
  {
    "rel": "src/game/weapons.js",
    "before": "      const d = _v.distanceTo(c);\n      const damageRadius = w.splashRadius * blasterPlayerRadiusRate(p, w);\n      if (d > Math.max(damageRadius, p.s3TerrainBurst || p.s3SpecialWeapon ? 0 : BLASTER_KNOCKBACK.distance)) continue;",
    "after": "      const damageRadius = w.splashRadius * blasterPlayerRadiusRate(p, w);\n      const farRadius=Math.max(damageRadius,p.s3TerrainBurst||p.s3SpecialWeapon?0:BLASTER_KNOCKBACK.distance);\n      if(Number.isFinite(farRadius)&&farRadius>=0&&_v.distanceToSquared(c)>(farRadius+1e-6)**2)continue;\n      const d = _v.distanceTo(c);\n      if (d > farRadius) continue;",
    "label": "conservative blaster far-only rejection"
  },
  {
    "rel": "src/game/weapons.js",
    "before": "    // first enemy along the beam\n    let victim = null;\n    for (const e of G.actors) {\n      if (e.team === a.team || !e.alive) continue;\n      _v2.copy(m).addScaledVector(dir, len);\n      Physics.segmentCapsuleDist",
    "after": "    // first enemy along the beam\n    let victim = null, boundsReady=false,minX,maxX,minZ,maxZ,endX,endY,endZ;\n    for (const e of G.actors) {\n      if (e.team === a.team || !e.alive) continue;\n      if(!boundsReady){\n        _v2.copy(m).addScaledVector(dir,len);endX=_v2.x;endY=_v2.y;endZ=_v2.z;\n        const reach=PLAYER.radius+0.14+1e-6;\n        minX=Math.min(m.x,endX)-reach;maxX=Math.max(m.x,endX)+reach;\n        minZ=Math.min(m.z,endZ)-reach;maxZ=Math.max(m.z,endZ)+reach;boundsReady=true;\n      }\n      if(Number.isFinite(e.pos.x)&&Number.isFinite(e.pos.z)&&\n        (e.pos.x<minX||e.pos.x>maxX||e.pos.z<minZ||e.pos.z>maxZ))continue;\n      _v2.set(endX,endY,endZ);\n      Physics.segmentCapsuleDist",
    "label": "charger negative-only horizontal capsule bound"
  },
  {
    "rel": "src/game/weapons.js",
    "before": "Object.assign(p, { type, wid: wid || null, owner: a, team: a.team, age: 0, life, straight, radius, damage: 0, size, trail: -1.5, trailEvery, trailRadius: 0.45,\n      grav, drag, seed: Math.random(), delay, head: !!head, vis, tail0, tailK, wob, wobF, nose, sats, ghost: true })",
    "after": "_assignWeaponQueueRound0(p,type,wid || null,a,a.team,0,life,straight,radius,0,size,-1.5,trailEvery,0.45,grav,drag,Math.random(),delay,!!head,vis,tail0,tailK,wob,wobF,nose,sats,true)",
    "label": "scalar native round birth 0"
  },
  {
    "rel": "src/game/weapons.js",
    "before": "Object.assign(p, { type: 'shot', owner: a, team: a.team, age: 0, life: 1.2, straight: w.straightTime, radius: w.impactRadius, damage: w.damage, size: 0.15, trail: -(2.5 - w.trailEvery), trailEvery: w.trailEvery, trailRadius: w.trailRadius, grav: 28, drag: 0.8, seed: Math.random(),\n      vis: 0.1 + Math.random() * 0.012, tail0: 0.8, tailK: 1.3, wob: 0.035, wobF: 26, nose: 0.3, sats: 3 })",
    "after": "_assignWeaponQueueRound1(p,'shot',a,a.team,0,1.2,w.straightTime,w.impactRadius,w.damage,0.15,-(2.5 - w.trailEvery),w.trailEvery,w.trailRadius,28,0.8,Math.random(),0.1 + Math.random() * 0.012,0.8,1.3,0.035,26,0.3,3)",
    "label": "scalar native round birth 1"
  },
  {
    "rel": "src/game/weapons.js",
    "before": "Object.assign(p, { type: 'shot', wid: w.id, owner: a, team: a.team, age: 0, life: 1.2, straight: w.straightTime, radius: w.impactRadius, damage: w.damage, size: 0.15, trail: -(2.5 - w.trailEvery), trailEvery: w.trailEvery, trailRadius: w.trailRadius, grav: 28, drag: 0.8, seed: Math.random() }, look)",
    "after": "Object.assign(_assignWeaponQueueRound2(p,'shot',w.id,a,a.team,0,1.2,w.straightTime,w.impactRadius,w.damage,0.15,-(2.5 - w.trailEvery),w.trailEvery,w.trailRadius,28,0.8,Math.random()),look)",
    "label": "scalar native round birth 2"
  },
  {
    "rel": "src/game/weapons.js",
    "before": "Object.assign(p, { type: 'slosh', wid: w.id, owner: a, team: a.team, age: 0, life: 2.4, straight: 0, delay: i * 0.012,\n        radius: w.impactRadius * (i === 0 ? 1 : 0.78 - 0.22 * k), damage: i === 0 ? w.damageHead : w.damageTail, head: i === 0,\n        size: i === 0 ? 0.2 : 0.14, trail: -0.8, trailEvery: i < 3 ? w.trailEvery : 0, trailRadius: w.trailRadius,\n        grav: g, drag: 0, seed: Math.random(),\n        vis: i === 0 ? 0.19 : 0.155 - 0.075 * k, tail0: 0.7, tailK: 1.5, wob: 0.12, wobF: 15, nose: 0.1, sats: i < 2 ? 2 : 1 })",
    "after": "_assignWeaponQueueRound3(p,'slosh',w.id,a,a.team,0,2.4,0,i * 0.012,w.impactRadius * (i === 0 ? 1 : 0.78 - 0.22 * k),i === 0 ? w.damageHead : w.damageTail,i === 0,i === 0 ? 0.2 : 0.14,-0.8,i < 3 ? w.trailEvery : 0,w.trailRadius,g,0,Math.random(),i === 0 ? 0.19 : 0.155 - 0.075 * k,0.7,1.5,0.12,15,0.1,i < 2 ? 2 : 1)",
    "label": "scalar native round birth 3"
  },
  {
    "rel": "src/game/weapons.js",
    "before": "Object.assign(p, { type: 'blast', wid:w.id, owner: a, team: a.team, age: 0, life: w.range / w.projSpeed, straight: 99, radius: w.impactRadius, damage: w.directDamage, size: 0.26, trail: -1.5, trailEvery: 2.2, trailRadius: 0.45, grav: 0, drag: 0, seed: Math.random(),\n      vis: 0.2, tail0: 0.5, tailK: 0.9, wob: 0.085, wobF: 17, nose: 0.15, sats: 4 })",
    "after": "_assignWeaponQueueRound4(p,'blast',w.id,a,a.team,0,w.range / w.projSpeed,99,w.impactRadius,w.directDamage,0.26,-1.5,2.2,0.45,0,0,Math.random(),0.2,0.5,0.9,0.085,17,0.15,4)",
    "label": "scalar native round birth 4"
  },
  {
    "rel": "src/game/weapons.js",
    "before": "Object.assign(p, { type: 'drop', owner: a, team: a.team, age: 0, life: 1.4, straight: 0, radius: 0.85 + Math.random() * 0.3, damage: w.flickDamageNear, dmgFar: w.flickDamageFar, size: 0.15, trail: 0, trailEvery: 1.8, trailRadius: 0.45, grav: 26, drag: 0.4, seed: Math.random(),\n        vis: 0.1 + 0.085 * mid + Math.random() * 0.03, tail0: 0.4, tailK: 1.0, wob: 0.1, wobF: 19, nose: 0, sats: mid > 0.45 ? 2 : 1 })",
    "after": "_assignWeaponQueueRound5(p,'drop',a,a.team,0,1.4,0,0.85 + Math.random() * 0.3,w.flickDamageNear,w.flickDamageFar,0.15,0,1.8,0.45,26,0.4,Math.random(),0.1 + 0.085 * mid + Math.random() * 0.03,0.4,1.0,0.1,19,0,mid > 0.45 ? 2 : 1)",
    "label": "scalar native round birth 5"
  },
  {
    "rel": "src/game/weapons.js",
    "before": "export class Projectiles {",
    "after": "function _assignWeaponQueueRound0(p,v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19,v20,v21,v22,v23,v24,v25){p[\"type\"]=v0;p[\"wid\"]=v1;p[\"owner\"]=v2;p[\"team\"]=v3;p[\"age\"]=v4;p[\"life\"]=v5;p[\"straight\"]=v6;p[\"radius\"]=v7;p[\"damage\"]=v8;p[\"size\"]=v9;p[\"trail\"]=v10;p[\"trailEvery\"]=v11;p[\"trailRadius\"]=v12;p[\"grav\"]=v13;p[\"drag\"]=v14;p[\"seed\"]=v15;p[\"delay\"]=v16;p[\"head\"]=v17;p[\"vis\"]=v18;p[\"tail0\"]=v19;p[\"tailK\"]=v20;p[\"wob\"]=v21;p[\"wobF\"]=v22;p[\"nose\"]=v23;p[\"sats\"]=v24;p[\"ghost\"]=v25;return p;}\nfunction _assignWeaponQueueRound1(p,v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19,v20,v21){p[\"type\"]=v0;p[\"owner\"]=v1;p[\"team\"]=v2;p[\"age\"]=v3;p[\"life\"]=v4;p[\"straight\"]=v5;p[\"radius\"]=v6;p[\"damage\"]=v7;p[\"size\"]=v8;p[\"trail\"]=v9;p[\"trailEvery\"]=v10;p[\"trailRadius\"]=v11;p[\"grav\"]=v12;p[\"drag\"]=v13;p[\"seed\"]=v14;p[\"vis\"]=v15;p[\"tail0\"]=v16;p[\"tailK\"]=v17;p[\"wob\"]=v18;p[\"wobF\"]=v19;p[\"nose\"]=v20;p[\"sats\"]=v21;return p;}\nfunction _assignWeaponQueueRound2(p,v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15){p[\"type\"]=v0;p[\"wid\"]=v1;p[\"owner\"]=v2;p[\"team\"]=v3;p[\"age\"]=v4;p[\"life\"]=v5;p[\"straight\"]=v6;p[\"radius\"]=v7;p[\"damage\"]=v8;p[\"size\"]=v9;p[\"trail\"]=v10;p[\"trailEvery\"]=v11;p[\"trailRadius\"]=v12;p[\"grav\"]=v13;p[\"drag\"]=v14;p[\"seed\"]=v15;return p;}\nfunction _assignWeaponQueueRound3(p,v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19,v20,v21,v22,v23,v24){p[\"type\"]=v0;p[\"wid\"]=v1;p[\"owner\"]=v2;p[\"team\"]=v3;p[\"age\"]=v4;p[\"life\"]=v5;p[\"straight\"]=v6;p[\"delay\"]=v7;p[\"radius\"]=v8;p[\"damage\"]=v9;p[\"head\"]=v10;p[\"size\"]=v11;p[\"trail\"]=v12;p[\"trailEvery\"]=v13;p[\"trailRadius\"]=v14;p[\"grav\"]=v15;p[\"drag\"]=v16;p[\"seed\"]=v17;p[\"vis\"]=v18;p[\"tail0\"]=v19;p[\"tailK\"]=v20;p[\"wob\"]=v21;p[\"wobF\"]=v22;p[\"nose\"]=v23;p[\"sats\"]=v24;return p;}\nfunction _assignWeaponQueueRound4(p,v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19,v20,v21,v22){p[\"type\"]=v0;p[\"wid\"]=v1;p[\"owner\"]=v2;p[\"team\"]=v3;p[\"age\"]=v4;p[\"life\"]=v5;p[\"straight\"]=v6;p[\"radius\"]=v7;p[\"damage\"]=v8;p[\"size\"]=v9;p[\"trail\"]=v10;p[\"trailEvery\"]=v11;p[\"trailRadius\"]=v12;p[\"grav\"]=v13;p[\"drag\"]=v14;p[\"seed\"]=v15;p[\"vis\"]=v16;p[\"tail0\"]=v17;p[\"tailK\"]=v18;p[\"wob\"]=v19;p[\"wobF\"]=v20;p[\"nose\"]=v21;p[\"sats\"]=v22;return p;}\nfunction _assignWeaponQueueRound5(p,v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19,v20,v21,v22){p[\"type\"]=v0;p[\"owner\"]=v1;p[\"team\"]=v2;p[\"age\"]=v3;p[\"life\"]=v4;p[\"straight\"]=v5;p[\"radius\"]=v6;p[\"damage\"]=v7;p[\"dmgFar\"]=v8;p[\"size\"]=v9;p[\"trail\"]=v10;p[\"trailEvery\"]=v11;p[\"trailRadius\"]=v12;p[\"grav\"]=v13;p[\"drag\"]=v14;p[\"seed\"]=v15;p[\"vis\"]=v16;p[\"tail0\"]=v17;p[\"tailK\"]=v18;p[\"wob\"]=v19;p[\"wobF\"]=v20;p[\"nose\"]=v21;p[\"sats\"]=v22;return p;}\n\nexport class Projectiles {",
    "label": "static scalar native birth helpers"
  }
];

export function adaptWeaponQueue20261024(rel,code,replaceOnce){
  for(const patch of PATCHES)if(patch.rel===rel){
    // Repeated canonical composition must not insert the reviewed successor
    // again when the old anchor is a substring of it (flick pitch sine).
    if(code.includes(patch.after))continue;
    code=replaceOnce(code,patch.before,patch.after,patch.label);
  }
  return code;
}
