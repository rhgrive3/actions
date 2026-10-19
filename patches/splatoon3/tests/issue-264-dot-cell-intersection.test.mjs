import assert from 'node:assert/strict';
import test from 'node:test';
import { paintDotCellWitness } from '../runtime/paint-ownership.mjs';

// Independent forward transforms sample visible dot cores, then ask whether
// the inverse cell/ellipse intersection finds a real point inside that cell.
test('#264 rotated/stretched sub-cell cores are owned without claiming invisible cells', () => {
  let checked = 0;
  for (const type of [1,2]) for (const cell of [.125,.25,.5]) for (const sa of [0,.4,1.2])
    for (const angle of [0,.7,2]) for (const centre of [[.01,.03],[.2,-.1],[-.2,.1]]) {
      const mask={sa,sdu:Math.cos(angle),sdv:Math.sin(angle),margin:.025};
      const face={cu:cell,cv:cell},piece={type,x:centre[0],y:centre[1],radius:.04,ux:.6,uy:.8,el:2.3};
      const core=piece.radius-Math.min(mask.margin,piece.radius*.5);
      const forward=(x,y)=>{
        if(type===2){const a=(x*piece.ux+y*piece.uy)*(piece.el-1);x+=piece.ux*a;y+=piece.uy*a;}
        x+=piece.x;y+=piece.y;
        const a=x*mask.sdu+y*mask.sdv,s=sa*(a>0?1:.25);
        return [x+mask.sdu*a*s,y+mask.sdv*a*s];
      };
      const distance=(x,y)=>{
        const a=x*mask.sdu+y*mask.sdv,s=1/(1+sa*(a>0?1:.25))-1;
        x+=mask.sdu*a*s;y+=mask.sdv*a*s;x-=piece.x;y-=piece.y;
        if(type===2){const b=(x*piece.ux+y*piece.uy)*(1/piece.el-1);x+=piece.ux*b;y+=piece.uy*b;}
        return Math.hypot(x,y);
      };
      for(let a=0;a<32;a++){
        const p=forward(Math.cos(a*Math.PI/16)*core*.9,Math.sin(a*Math.PI/16)*core*.9);
        const x=(Math.floor(p[0]/cell)+.5)*cell,y=(Math.floor(p[1]/cell)+.5)*cell;
        const w=paintDotCellWitness(mask,face,x,y,piece);
        assert.ok(w,'a cell containing a visible core point must be claimed');
        assert.ok(Math.abs(w[0]-x)<=cell*.5+1e-12&&Math.abs(w[1]-y)<=cell*.5+1e-12);
        assert.ok(distance(...w)<core+1e-12,'witness must lie inside the actual transformed dot core');
        checked++;
      }
      assert.equal(paintDotCellWitness(mask,face,10,10,piece),null,'a distant cell stays dry');
  }
  assert.equal(checked,5184);
});
