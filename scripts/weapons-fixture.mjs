// The shipped modules run in an isolated VM. Only the render backend, audio and
// character mesh are absent; collision and scoring paint are production code.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../patches/splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../patches/touch-layout/adapter.mjs';
import { adaptReliability } from '../patches/reliability/adapter.mjs';
import { adaptQualitySource } from '../patches/local-quality/adapter.mjs';
import { adaptNetworkSource } from '../patches/network-replication/adapter.mjs';
import { adaptRange } from '../patches/practice-range/adapter.mjs';
export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = path.join(ROOT, 'inkwave-public');
const adaptBuildSource = (rel, code) => adaptRange(rel,
  adaptNetworkSource(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));
export const BASELINE = process.env.INKWAVE_BASELINE_SITE || path.join(ROOT, '.baseline');
export async function fixture({site = BASELINE, seed = 0x1a2b3c4d, floor = true, cell = .25, fidelity = false, network = false} = {}) {
  site = path.resolve(site);
  // Pre-build patch tests run before _site exists. In that phase execute the
  // same composed source graph directly from immutable upstream + repo patches.
  // When a real built site exists (measurement/browser stages), keep reading it.
  const sourceMode = !fs.existsSync(path.join(site, 'vendor/three/build/three.module.js'));
  let state = seed >>> 0, draws = 0;
  const math = Object.create(Math);
  math.random = () => { draws++; state |= 0; state = state + 0x6d2b79f5 | 0; let t = Math.imul(state ^ state >>> 15, 1 | state); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const context = vm.createContext({console, performance, Math: math, structuredClone});
  const modules = new Map();
  const entry = new vm.SourceTextModule(`
    export * as THREE from 'three';
    export * from './src/core/ctx.js';
    export * from './src/config.js';
    export * from './patches/splatoon3/runtime/clock.mjs';
    export * from './src/game/actor.js';
    ${network ? "export * from './src/net/netmatch.js';" : ''}
    export * from './src/game/physics.js';
    export * from './src/game/weapons.js';
    export * from './src/world/paint.js';
    export * from './patches/splatoon3/runtime/weapons.mjs';
    export * from './patches/splatoon3/runtime/movement.mjs';
    export * from './patches/splatoon3/runtime/gear.mjs';
    export * from './patches/splatoon3/runtime/resources.mjs';
    export * from './patches/local-quality/roller-visual.mjs';
    ${fidelity ? "export * from './patches/splatoon3/runtime/weapons-fidelity.mjs';" : ''}
  `, {context, identifier: path.join(site, 'fixture.mjs')});
  function load(spec, from) {
    let p = spec === 'three' ? path.join(sourceMode ? SOURCE : site, 'vendor/three/build/three.module.js')
      : path.resolve(path.dirname(from.identifier), spec);
    if (sourceMode) {
      // Entry paths are expressed like a built site. Redirect src/vendor to
      // upstream and patches to their repository roots, including patch imports
      // emitted by adapted upstream modules.
      if (p.startsWith(site + path.sep)) {
        const rel = path.relative(site, p);
        p = rel.startsWith('patches' + path.sep) ? path.join(ROOT, rel) : path.join(SOURCE, rel);
      }
      if (p.startsWith(path.join(SOURCE, 'patches') + path.sep))
        p = path.join(ROOT, path.relative(SOURCE, p));
      // Patch modules import ../../../src/... as they do in the emitted site.
      // In source mode that resolves under the repository root, so route those
      // upstream namespaces back to immutable inkwave-public as well.
      for (const dir of ['src', 'assets', 'vendor']) {
        const rootDir = path.join(ROOT, dir) + path.sep;
        if (p.startsWith(rootDir)) {
          p = path.join(SOURCE, path.relative(ROOT, p));
          break;
        }
      }
    }
    if (!modules.has(p)) {
      let code = fs.readFileSync(p, 'utf8');
      if (sourceMode && p !== path.join(SOURCE, 'vendor/three/build/three.module.js')) {
        const rel = p.startsWith(SOURCE + path.sep) ? path.relative(SOURCE, p) : path.relative(ROOT, p);
        code = adaptBuildSource(rel.split(path.sep).join('/'), code);
      }
      modules.set(p, new vm.SourceTextModule(code, {context, identifier: p}));
    }
    return modules.get(p);
  }
  await entry.link(load); await entry.evaluate();
  const api = {...entry.namespace};
  const {G, THREE, WEAPONS, PLAYER, SUB} = api;
  const profile = JSON.parse(fs.readFileSync(sourceMode
    ? path.join(ROOT, 'patches/splatoon3/profile.json')
    : path.join(site, 'patches/splatoon3/profile.json'), 'utf8'));
  Object.assign(PLAYER, profile.player); Object.assign(SUB.bomb, profile.bomb);
  for (const [id, values] of Object.entries(profile.weapons)) Object.assign(WEAPONS[id], values);
  api.installWeapons(api, profile); api.installMovement(api, profile); api.installGear(api, profile); api.installResources(api, profile);
  api.installRollerVisualQuality(api);
  if (fidelity) api.installWeaponsFidelity(api, profile);
  const V = (x=0, y=0, z=0) => new THREE.Vector3(x,y,z);
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(); G.camera.position.set(0,3,-4);
  G.teamColors = [new THREE.Color(0xff8a14),new THREE.Color(0x2f5bff)];
  G.settings = {}; G.mode = 'match'; G.time = 0; G.actors = []; G.match = {playing: () => true};
  const top = {id:0, block:0, origin:V(-40,0,-5), u:V(1,0,0), v:V(0,0,1), n:V(0,1,0), su:80, sv:105, wall:false, turf:true, paintable:true};
  const box = {id:0, solid:true, grate:false, center:V(0,-1,47.5), half:V(40,1,52.5), axes:[V(1,0,0),V(0,1,0),V(0,0,1)], faces:[-1,-1,0,-1,-1,-1], aabbMin:V(-40,-2,-5),aabbMax:V(40,0,100)};
  G.level = {faces:floor?[top]:[],blocks:floor?[box]:[],groundHeight:()=>0,pointInside:()=>false,
    queryBlocks(_x0,_z0,_x1,_z1,out=[]) {out.length=0; for(let i=0;i<this.blocks.length;i++)out.push(i);return out;}};
  G.physics = new api.Physics(G.level);
  // The atlas renderer is omitted, not the scoring rasterizer or splat shape.
  class CpuPaint extends api.PaintSystem {
    _initGPU() { this.quads = 0; }
    // Immediate body presentation (#570) also reaches this GPU-only sink.
    // Keep native splat/_emitGrowth/grid work, but enqueue no absent atlas draw.
    _pushQuad() {}
  }
  G.paint = new CpuPaint(null,G.level,{atlasSize:4096,maxDensity:8,cell});
  const paints=[]; const splat=G.paint.splat;
  G.paint.splat=function(center,radius,team,opts={}) {const area=splat.call(this,center,radius,team,opts);paints.push({time:G.time,center:center.toArray(),radius,team,seed:opts.seed,kind:opts.kind??null,stretch:opts.stretch?.toArray()??null,stretchAmt:opts.stretchAmt??null,cosmetic:!!opts.cosmetic,area});return area;};
  const projectiles = G.projectiles = new api.Projectiles(G.scene), hits=[], fires=[], impacts=[];
  api.on('hit',e=>hits.push({time:G.time,victim:e.victim.name,damage:e.damage,weapon:e.weaponId}));
  api.on('weapon:fire',e=>fires.push({time:G.time,weapon:e.weapon,muzzle:e.muzzle?.toArray(),dir:e.dir?.toArray(),charge:e.charge??null,len:e.len??null,hand:e.hand??null}));
  api.on('weapon:impact',e=>impacts.push({time:G.time,pos:e.pos?.toArray(),kind:e.kind,victim:e.victim?.name??null}));
  class Character {
    constructor(){this.root={position:V(),rotation:{}};this.events=[];}
    trigger(...args){this.events.push(args);}
    getMuzzle(out){return out.copy(this.root.position).add(V(0,1.05,.3));}
    setVisible(){} setHurt(){} setWeapon(){}
  }
  function make(id='shooter',{team=0, x=0,y=0,z=0,name=id, hp=100000}={}){
    const a=new api.Actor({team,name,weapon:id,CharacterClass:Character});
    a.pos.set(x,y,z);a.character.root.position.copy(a.pos);a.aimPoint.set(x,y+1.05,z+80);
    a.grounded=true;a.ground.hit=true;a.ground.y=y;a.ground.face=0;a.alive=true;a.hp=hp;a.ink=100;a.form='kid';a.smoothY=0;
    a._nearCamera=()=>false;a._spawnBarrier=()=>{};a._finishFrame=()=>{};
    a.damage=(d)=>{a.hp-=d;return false;};
    a.addTurf=area=>{a.turf=(a.turf||0)+area;};
    return a;
  }
  function wall(z,{width=10,height=5,thickness=.1}={}){const id=G.level.blocks.length;G.level.blocks.push({id,solid:true,grate:false,center:V(0,height/2,z),half:V(width/2,height/2,thickness/2),axes:box.axes,faces:[-1,-1,-1,-1,-1,-1],aabbMin:V(-width/2,0,z-thickness/2),aabbMax:V(width/2,height,z+thickness/2)});}
  function tick(a, input={fire:false}, dt=1/60){G.time+=dt;a.lastFire+=dt;a.intent.fire=!!input.fire;a.weaponRunner.update(dt,input);projectiles.update(dt);}
  return {...api,context,profile,make,wall,tick,paints,hits,fires,impacts,projectiles,draws:()=>draws,reseed(n){state=n>>>0;draws=0;},sourceFiles:[...modules.keys()]};
}
