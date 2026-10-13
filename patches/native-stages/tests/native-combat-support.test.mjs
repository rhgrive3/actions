import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {nativeFixture} from './fixture.mjs';
import {convertSource} from '../runtime/source-convert.mjs';

const f=await nativeFixture();
function setup({ramp=false,noPaint=false,grate=false}={}){
 let obj='',offset=0;
 const quad=(name,x0,x1,y0,y1,z0,z1,mat)=>{
  const verts=[[x0,y0,z0],[x0,y0,z1],[x1,y1,z1],[x1,y1,z0]];
  obj+='o '+name+'\nusemtl '+mat+'\n'+verts.map(v=>'v '+v.join(' ')+'\n').join('')+verts.map(()=>'vn 0 1 0\n').join('');
  obj+='f '+[1,2,3].map(i=>`${offset+i}//${offset+i}`).join(' ')+'\nf '+[1,3,4].map(i=>`${offset+i}//${offset+i}`).join(' ')+'\n';offset+=4;
 };
 quad(grate?'Fld_Grate':'Fld_Roof',0,ramp?6:2,6,ramp?3.6:6,-4,4,grate?'Grate00':noPaint?'Concrete00_np':'Concrete00');
 const hull=Math.min(1,f.PLAYER.fallDeathY+2);quad('Fld_LowerHull',-8,8,hull,hull,-8,8,'Concrete00');
 const data=convertSource({id:'combat-cliff',bounds:{minX:-8,maxX:8,minZ:-8,maxZ:8},spawnPads:[[1,6,0],[1,6,1]],spawnBarrier:0},obj,'newmtl Concrete00\nKd 1 1 1\nnewmtl Concrete00_np\nKd 1 1 1\nnewmtl Grate00\nKd 1 1 1\n',{});
 const G=f.G,L=G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(L);
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 G.paint=new CpuPaint(null,L,{atlasSize:256,maxDensity:4,cell:.25});
 const a=f.make('shooter');a.pos.set(1,ramp?5.6:6,0);a.grounded=a.alive=true;a.form='humanoid';a.s3.squidSpawn=null;a.superJumpState=null;a.specialActive=false;
 const brain=new f.BotBrain(a,'normal');brain.mode='fight';return {G,L,a,brain,data};
}
const digest=data=>crypto.createHash('sha256').update(Buffer.from(data.triangles.buffer)).update(Buffer.from(data.flags.buffer)).update(Buffer.from(data.mask.buffer)).digest('hex');

test('retained lower source hull cannot authorize a combat cliff, and real edge steering avoids it',()=>{
 const {G,L,a,brain,data}=setup(),before=digest(data);
 assert(L.groundHeight(3,0,6.6)>f.PLAYER.fallDeathY,'old death-only test treats lower hull as safe');
 assert.equal(brain._wet(3,0,6),true);
 assert.equal(brain._wet(1.2,0,6),false);
 const move=new f.THREE.Vector3(1,0,0);a.vel.set(8,0,0);brain._edgeGuard(a,move);
 assert.equal(brain._wet(a.pos.x+move.x*1.96,a.pos.z+move.z*1.96,a.pos.y),false,'ordinary guard chooses supported steering or stops');
 assert.equal(digest(data),before,'source geometry/roles/ownership stay intact');
});

test('continuous descending source ramp and NoPaint support remain ordinary combat walks',()=>{
 let {brain}=setup({ramp:true});assert.equal(brain._wet(5,0,5.6),false,'successive legal ground steps cross more than one total stepDown');
 const {G,L,a,brain:b}=setup({noPaint:true});assert.equal(L.manifest.objects[0].paintable,false);assert.equal(b._wet(1.3,0,6),false);
 assert.equal(b._wet(3,0,6),true);assert.equal(G.paint.sample(-1,0,0),0,'walkable NoPaint support gains no ink');
 const oldPos=a.pos.toArray(),oldVel=a.vel.toArray();b._wet(1.3,0,6);assert.deepEqual(a.pos.toArray(),oldPos);assert.deepEqual(a.vel.toArray(),oldVel);
});

test('installed ground probe preserves humanoid grates, squid gaps and genuine dynamic decks',()=>{
 let {brain,a}=setup({grate:true});assert.equal(brain._wet(1.3,0,6),false);a.form='squid';assert.equal(brain._wet(1.3,0,6),true);
 const {G,L,brain:b,a:actor}=setup();L._addBlock({kind:'box',min:[2,5.8,-2],max:[5,6,2],paint:true});L._buildFaces(L.blocks.at(-1));
 assert.equal(b._wet(4,0,6),false,'current live dynamic deck is physical support');
 actor.pos.set(3,6,0);assert.equal(b._wet(4,0,6),false);
 G.physics.level={};assert.equal(f.nativeCombatWet(b,G,4,0,6),null,'mismatched physics/level never supplies a new support verdict');
});

test('legacy, normal navigation, airborne, spawn and special owners retain existing policy',()=>{
 const {G,L,a,brain}=setup();
 for(const mode of ['paint','refill','ranked','boss']){brain.mode=mode;assert.equal(f.nativeCombatWet(brain,G,3,0,6),null);}
 brain.mode='fight';for(const key of ['grounded','alive']){a[key]=false;assert.equal(f.nativeCombatWet(brain,G,3,0,6),null);a[key]=true;}
 for(const key of ['climbing','specialActive','superJumpState']){a[key]=true;assert.equal(f.nativeCombatWet(brain,G,3,0,6),null);a[key]=false;}
 a.s3.squidSpawn={};assert.equal(f.nativeCombatWet(brain,G,3,0,6),null);a.s3.squidSpawn=null;
 L.native=false;assert.equal(f.nativeCombatWet(brain,G,3,0,6),null);assert.equal(brain._wet(3,0,6),false,'original legacy lower-floor policy remains');
});
