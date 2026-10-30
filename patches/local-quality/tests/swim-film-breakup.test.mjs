import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

test('swim sheet regions reach the tear shader and the front stays joined to both shoulders',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,extraExports:"export {createSwimFilmGeometry,updateSwimFilmGeometry} from './patches/local-quality/swim-surface.mjs';"});
  const g=f.createSwimFilmGeometry(),p=g.attributes.position.array,data=g.attributes.filmData.array;
  try{
    for(const patch of g.userData.patches){
      for(let i=patch.start;i<patch.start+(patch.nu+1)*(patch.nv+1);i++)assert.equal(data[i*3+2],patch.kind,'region must not fall through to the unperforated drop shader');
    }
    const [right,left,bow]=g.userData.patches;
    for(const speed of [.01,.25,8/11.8,1])for(let frame=0;frame<120;frame++){
      f.updateSwimFilmGeometry(g,frame/60,speed);
      for(let row=0;row<=4;row++)for(const [shoulder,col] of [[left,0],[right,bow.nu]]){
        // Compare the bow seam at matching cross-section samples. Its two ends
        // and the shoulder's front are rooted at precisely the same point.
        const b=(bow.start+row*(bow.nu+1)+col)*3,s=shoulder.start*3;
        for(let axis=0;axis<3;axis++)assert(Math.abs(p[b+axis]-p[s+axis])<1e-6);
      }
      assert([...p,...g.attributes.normal.array].every(Number.isFinite));
      const holes=g.userData.filmHoles.map(h=>h.x).sort((a,b)=>a-b);
      const gaps=holes.map((x,i)=>(i===5?holes[0]+1:holes[i+1])-x);
      assert(Math.max(...gaps)<.23,'openings must not beat together into a cluster, leaving a long solid panel');
    }
    const before=g.userData.filmHoles.map(h=>h.toArray());
    f.updateSwimFilmGeometry(g,2.25,8/11.8);
    assert.notDeepEqual(g.userData.filmHoles.map(h=>h.toArray()),before,'openings advect over the shoulder, not a fixed cutout');
    assert(g.userData.filmHoles.every(h=>h.x>=0&&h.x<1&&h.z>0&&h.w>0));
  }finally{g.dispose();}
});

test('lifted swim liquid occupies the shoulders and rear, with a small detached fraction',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,extraExports:"export {createSwimFilmGeometry,updateSwimFilmGeometry} from './patches/local-quality/swim-surface.mjs';"});
  const g=f.createSwimFilmGeometry();
  try{
    let rearLift=0,shoulderLift=0;
    for(let frame=0;frame<120;frame++){
      f.updateSwimFilmGeometry(g,frame/60,8/11.8);
      const p=g.attributes.position.array;
      for(let i=0;i<p.length;i+=3){
        assert(p[i+1]>=0&&p[i+1]<.35,'low surface disturbance');
        if(p[i+2]<-.3)rearLift=Math.max(rearLift,p[i+1]);
        if(Math.abs(p[i])>.12)shoulderLift=Math.max(shoulderLift,p[i+1]);
      }
    }
    assert(shoulderLift>.12&&rearLift>.10,'actual side/rear silhouette, not two almost-flat rails');
    assert.equal(g.userData.patches.filter(p=>p.kind>=7).length,4,'detached drops remain secondary');
    assert(g.attributes.position.count<=700);
  }finally{g.dispose();}
});
