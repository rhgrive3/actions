import {openGame} from './probe-lib.mjs';
const g=await openGame(process.argv[2]);
const r=await g.page.evaluate(async()=>{
 const SB=await import(new URL('src/game/motion/source-bank.js',document.baseURI));
 const P=SB.SourcePose.prototype,B=SB.SourceBank.prototype;const c={};const wrap=(o,k,name)=>{const f=o[k];o[k]=function(...a){c[name]=(c[name]||0)+1;if(name==='sample'){const key=(typeof a[0]==='string'?a[0]:a[0].name);c['clip:'+key]=(c['clip:'+key]||0)+1;c.curves=(c.curves||0)+(typeof a[0]==='string'?this.clips.get(a[0]):a[0]).curveCount;if(a[4]===false)c.sampleNoFk=(c.sampleNoFk||0)+1;}if(name==='fromRaw'&&a[1]!==false)c.fromRawFk=(c.fromRawFk||0)+1;return f.apply(this,a);};};
 wrap(P,'fromRaw','fromRaw');wrap(P,'fk','fk');wrap(P,'mix','mix');wrap(P,'copy','copy');wrap(B,'sample','sample');
 const game=probeG.game;game._skipRender=true;const N=120;const t0=probeG.game.s3Clock?.ticks;for(let i=0;i<N;i++)game._frame(1/60);game._skipRender=false;
 const ticks=probeG.game.s3Clock.ticks-t0;const nAct=game.match.actors.length;
 const per=Object.fromEntries(Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,+(v/ticks/nAct).toFixed(2)]));
 return {ticks,nAct,per,bones:game.match.actors[0].character.motion?.bank?.bones.length,states:game.match.actors.map(a=>a.character.motion?.state+'/'+a.form+'/'+a.character.motion?.active)};
});
console.log(JSON.stringify(r,null,1));await g.close();
