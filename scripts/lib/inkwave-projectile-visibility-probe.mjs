// Diagnostic only: native input/flight first, then frozen GPU comparisons.
// Never imported by the game. Restores temporary render visibility and camera.
import fs from 'node:fs';
import path from 'node:path';
export async function probeProjectileVisibility(page, out) {
  fs.mkdirSync(out, {recursive:true});
  const report={cases:[],physicalDevice:false};
  for (const weapon of ['shooter','dualies','splatling']) {
    const birth=await page.evaluate(async weapon=>{
      const G=globalThis.NG||window.__G,g=G.game||window.__inkwave,a=G.local;
      g.debug.freeze();g.debug.freezeBots();g._skipRender=true;
      G.projectiles.clear();G.fx.clear();a.setWeapon(weapon);a.weaponRunner.reset();a.ink=100;
      g.debug.fire(false);for(let i=0;i<4;i++)g._frame(1/60);
      g.debug.fire(true);if(weapon==='splatling'){for(let i=0;i<40;i++)g._frame(1/60);g.debug.fire(false);}
      const ticks=[];
      for(let i=0;i<90;i++){
        g._frame(1/60);
        const rounds=G.projectiles.list.filter(p=>p.owner===a);
        ticks.push({tick:i,rounds:rounds.length,age:rounds.map(p=>p.age),positions:rounds.map(p=>p.pos.toArray()),volumes:G.fx.inkVolumes?{...G.fx.inkVolumes.metrics}:null,blobs:G.projectiles.blobs.count});
        if(rounds.some(p=>p.age>=1/60&&p.delay<=0))break;
      }
      g.debug.fire(false);g._skipRender=true;
      globalThis.__projectileProbe={camera:G.camera.clone(),rounds:G.projectiles.list.filter(p=>p.owner===a)};
      return {weapon,ticks,local:{position:a.pos.toArray(),alive:a.alive,form:a.form},rounds:__projectileProbe.rounds.map(p=>({type:p.type,wid:p.wid,recipe:p._inkVolumeRecipe,age:p.age,size:p.size,vis:p.vis,delay:p.delay,position:p.pos.toArray(),velocity:p.vel.toArray()})),volumeError:G.fx.inkVolumeError||null,assets:[...(G.fx.inkVolumes?.assets.keys()||[])]};
    },weapon);
    birth.views=[];report.cases.push(birth);fs.writeFileSync(path.join(out,'projectile-visibility.json'),JSON.stringify(report,null,2));
    try {
    for(const view of ['native','side','behind','above']){
      const proof=await page.evaluate(view=>{
        const G=globalThis.NG||window.__G,g=G.game||window.__inkwave,c=G.camera,p=__projectileProbe.rounds[0];
        c.copy(__projectileProbe.camera);
        if(view!=='native'&&p){const dir=p.vel.clone().normalize(),offset=dir.clone();if(view==='side')offset.set(dir.z,.25,-dir.x);else if(view==='above')offset.set(0,1,.01);else offset.negate();c.position.copy(p.pos).addScaledVector(offset.normalize(),4);c.lookAt(p.pos);}
        c.updateMatrixWorld();
        const meshes=[G.projectiles.blobs];for(const asset of G.fx.inkVolumes?.assets.values()||[])for(const pattern of asset.patterns)for(const levels of pattern.frames)for(const batch of levels)meshes.push(batch.mesh,batch.fringe);
        const before=JSON.stringify(__projectileProbe.rounds.map(p=>[p.pos.toArray(),p.vel.toArray(),p.age,p.damage,p.seed]));
        const visible=meshes.map(m=>m.visible),gl=G.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
        const read=()=>{g.R.render();const bytes=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
        const beforeRedrawMetrics=G.fx.inkVolumes?{...G.fx.inkVolumes.metrics}:null,beforeRedraw=read();
        const beforeRedrawPNG=view==='native'?G.renderer.domElement.toDataURL('image/png'):null;
        G.projectiles._draw();
        const on=read(),control=read();let off,offControl;
        try {meshes.forEach(m=>m.visible=false);off=read();offControl=read();}
        finally {meshes.forEach((m,i)=>m.visible=visible[i]);read();}
        let redrawChanged=0;for(let i=0;i<on.length;i+=4)if(on[i]!==beforeRedraw[i]||on[i+1]!==beforeRedraw[i+1]||on[i+2]!==beforeRedraw[i+2])redrawChanged++;
        let controlChanged=0;for(let i=0;i<on.length;i+=4)if(on[i]!==control[i]||on[i+1]!==control[i+1]||on[i+2]!==control[i+2])controlChanged++;
        let offControlChanged=0;for(let i=0;i<off.length;i+=4)if(off[i]!==offControl[i]||off[i+1]!==offControl[i+1]||off[i+2]!==offControl[i+2])offControlChanged++;
        let changed=0,total=0,max=0;for(let i=0;i<on.length;i+=4){let d=0;for(let k=0;k<3;k++)d+=Math.abs(on[i+k]-off[i+k]);if(d>0)changed++;total+=d;max=Math.max(max,d);}
        return {view,width:w,height:h,beforeRedrawPNG,beforeRedrawMetrics,currentCameraRedrawChangedPixels:redrawChanged,onRepeatChangedPixels:controlChanged,offRepeatChangedPixels:offControlChanged,changedPixels:changed,totalDifference:total,maxDifference:max,glError:gl.getError(),blobs:G.projectiles.blobs.count,volumes:G.fx.inkVolumes?{...G.fx.inkVolumes.metrics}:null,camera:c.position.toArray(),sampledProjectileFields:['position','velocity','age','damage','seed'],sampledProjectileFieldsUnchanged:before===JSON.stringify(__projectileProbe.rounds.map(p=>[p.pos.toArray(),p.vel.toArray(),p.age,p.damage,p.seed]))};
      },view);
      if(proof.beforeRedrawPNG){const filename=weapon+'-'+view+'-before-redraw.png';if(!proof.beforeRedrawPNG.startsWith('data:image/png;base64,'))throw Error('Unexpected canvas image encoding');fs.writeFileSync(path.join(out,filename),Buffer.from(proof.beforeRedrawPNG.slice('data:image/png;base64,'.length),'base64'));proof.beforeRedrawImage=filename;}delete proof.beforeRedrawPNG;
      birth.views.push(proof);fs.writeFileSync(path.join(out,'projectile-visibility.json'),JSON.stringify(report,null,2));
      await page.screenshot({path:path.join(out,weapon+'-'+view+'.png'),timeout:60000});
    }
    } finally {
      await page.evaluate(()=>{const G=globalThis.NG||window.__G;if(!globalThis.__projectileProbe)return;G.camera.copy(__projectileProbe.camera);G.camera.updateMatrixWorld();G.projectiles._draw();(G.game||window.__inkwave).R.render();delete globalThis.__projectileProbe;});
    }
    fs.writeFileSync(path.join(out,'projectile-visibility.json'),JSON.stringify(report,null,2));
  }
  return report;
}
