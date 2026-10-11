import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceHealthBar, healthRevealForTeam, shouldShowHealthBar,
  installHealthBarHud, ENEMY_HP_BAR_SECONDS } from '../runtime/health-bars.mjs';

const viewer={team:0,alive:true};
const enemy=()=>({team:1,alive:true,hp:100,netLife:1,submerged:false,form:'kid',anim:{form:'kid'},s3:{},lastDamage:99});
const teammate=()=>({...enemy(),team:0});
const track=()=>({hp:NaN,until:-Infinity,alive:true,life:undefined});

test('#716 opponent health appears only after actual authoritative HP decrease, expires after 3s, refreshes on new hit',()=>{
 const a=enemy(),r=track();
 advanceHealthBar(r,a,0);assert.equal(shouldShowHealthBar(a,viewer,r,0,100),false);
 a.hp=60;advanceHealthBar(r,a,1);
 assert.equal(r.until,1+ENEMY_HP_BAR_SECONDS);
 assert.equal(shouldShowHealthBar(a,viewer,r,2.9,100),true);
 assert.equal(shouldShowHealthBar(a,viewer,r,4.01,100),false);
 a.hp=35;advanceHealthBar(r,a,4.1);
 assert.equal(r.until,7.1);assert.equal(shouldShowHealthBar(a,viewer,r,5,100),true);
 a.hp=100;advanceHealthBar(r,a,5);
 assert.equal(shouldShowHealthBar(a,viewer,r,5,100),false);
});
test('#716 full HP, splat, new life and malformed snapshots never leave stale signals',()=>{
 const a=enemy(),r=track();
 advanceHealthBar(r,a,0);a.hp=50;advanceHealthBar(r,a,1);
 assert.equal(shouldShowHealthBar(a,viewer,r,1,100),true);
 a.alive=false; a.hp=0;advanceHealthBar(r,a,1.5);
 assert.equal(shouldShowHealthBar(a,viewer,r,1.5,100),false);
 a.alive=true;a.hp=100;a.netLife=2;advanceHealthBar(r,a,2);
 assert.equal(shouldShowHealthBar(a,viewer,r,2,100),false);
 a.hp=20;advanceHealthBar(r,a,2.5);
 assert.equal(shouldShowHealthBar(a,viewer,r,2.5,100),true);
 a.hp=NaN;advanceHealthBar(r,a,2.6);
 assert.equal(shouldShowHealthBar(a,viewer,r,2.6,100),false);
});
test('#716 allies visible while injured, enemy body concealment and explicit mark overrides enforced',()=>{
 const a=enemy(),r=track();advanceHealthBar(r,a,0);a.hp=40;advanceHealthBar(r,a,0.1);
 assert.equal(shouldShowHealthBar(a,viewer,r,1,100,false),false);
 a.submerged=true;assert.equal(shouldShowHealthBar(a,viewer,r,1,100,true),false);
 a.s3.revealed=true;assert.equal(shouldShowHealthBar(a,viewer,r,1,100,false),true);
 a.s3.revealed=false;a.s3.mapMarkedUntil={0:2};
 assert.equal(healthRevealForTeam(a,viewer,1),true);
 assert.equal(shouldShowHealthBar(a,viewer,r,1,100,false),true);
 assert.equal(healthRevealForTeam(a,viewer,2),false);
 const ally=teammate(),ar=track();ally.hp=29;advanceHealthBar(ar,ally,0);
 assert.equal(shouldShowHealthBar(ally,viewer,ar,30,100,false),true);
 assert.equal(shouldShowHealthBar(viewer,viewer,ar,1,100),false);
});

class Node {
 constructor(){this.style={};this.children=[];this.parent=null;this.clientWidth=800;this.clientHeight=600;}
 appendChild(c){c.parent=this;this.children.push(c);return c;}
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}}
}
class Vec {
 constructor(){this.x=0;this.y=0;this.z=0;}
 copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
 project(_camera){this.x=0;this.y=0;this.z=0.5;return this;}
}
test('#716 real HUD update wrapper creates bounded bars, hides behind cover, retires on match change and dispose',()=>{
 const doc={createElement:()=>new Node()}, env={document:doc,innerWidth:800,innerHeight:600};
 class HUD { constructor(){this.el=new Node();this._visible=true;this._t=0;}
   update(dt){this._t+=dt;}
   dispose(){this.el.remove();}
 }
 const me={...viewer,hp:100}, opponent=enemy(), ally=teammate(), cam={isCamera:true,position:{x:0,y:1,z:0}};
 for (const a of [opponent,ally])a.character={root:{visible:true},getHeadPosition(out){out.x=0;out.y=1;out.z=0;return out;}};
 let sight=true;
 const G={time:0,mode:'match',camera:cam,physics:{los:()=>sight},teamHex:['orange','blue'],
   match:{state:'playing',local:me,actors:[me,opponent,ally],paused:false,attract:false}};
 installHealthBarHud({HUD,G,THREE:{Vector3:Vec},PLAYER:{hp:100}},env);
 const before=HUD.prototype.update;installHealthBarHud({HUD,G,THREE:{Vector3:Vec},PLAYER:{hp:100}},env);
 assert.equal(HUD.prototype.update,before,'installation is idempotent');
 const hud=new HUD(), run=()=>hud.update(1/60,{time:100});
 run();assert.equal(hud._s3HealthBars.size,2);
 G.time=1;opponent.hp=60;ally.hp=40;run();
 const er=hud._s3HealthBars.get(opponent), ar=hud._s3HealthBars.get(ally);
 assert.equal(er.node.style.display,'');assert.equal(ar.node.style.display,'');
 assert.equal(er.fill.style.width,'60.0%');
 sight=false;run();assert.equal(er.node.style.display,'none');assert.equal(ar.node.style.display,'');
 G.time=2;sight=true;run();assert.equal(er.node.style.display,'');
 opponent.submerged=true;run();assert.equal(er.node.style.display,'none');
 opponent.s3.revealed=true;run();assert.equal(er.node.style.display,'');
 opponent.s3.revealed=false;opponent.submerged=false;
 G.time=4.2;run();assert.equal(er.node.style.display,'none');
 G.match.state='finish';run();assert.equal(ar.node.style.display,'none');
 G.match={state:'playing',local:me,actors:[me,ally],paused:false,attract:false};
 run();assert.equal(hud._s3HealthBars.size,1);
 hud.dispose();assert.equal(hud._s3HealthLayer,null);assert.equal(hud._s3HealthBars.size,0);
});
