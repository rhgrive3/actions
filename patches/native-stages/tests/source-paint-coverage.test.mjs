import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {convertSource,sourceTriangleCellOverlap} from '../runtime/source-convert.mjs';
import {SOURCE_RECIPE} from '../runtime/source-catalog.mjs';
import {nativeFixture} from './fixture.mjs';

test('source cell coverage preserves thin triangle interiors and rejects empty or edge-only cells',()=>{
 assert.equal(sourceTriangleCellOverlap(0,0,1,0,0,1,0,0,.25,.25),true);
 assert.equal(sourceTriangleCellOverlap(0,0,1,0,0,1,.7,.1,1,.4),true,'a partial triangle cell remains live');
 assert.equal(sourceTriangleCellOverlap(0,0,1,0,0,1,.75,.75,1,1),false,'a real polygon hole remains dead');
 assert.equal(sourceTriangleCellOverlap(0,0,1,0,0,1,1,0,1.25,.25),false,'an edge touch has no paintable area');
 assert.equal(sourceTriangleCellOverlap(0,.01,1,.02,0,.03,0,0,.25,.25),true,'a strip missing the cell centre still has real area');
 assert.equal(sourceTriangleCellOverlap(0,0,.5,.5,1,1,0,0,.25,.25),false,'a degenerate triangle has no paintable area');
 assert.equal(sourceTriangleCellOverlap(0,0,1,0,0,1,1-1e-13,0,1.25,.25),false,'chart projection roundoff cannot claim an edge-only neighbouring cell');
 assert.equal(sourceTriangleCellOverlap(0,0,1,0,0,1,1-1e-6,0,1.25,.25),true,'a real thin intersection remains covered');
 assert.equal(SOURCE_RECIPE,'inkwave-browser-source-v4','old derived masks cannot share the worker cache identity');
});

const obj='o Fld_Test\nusemtl Concrete00\nv 0 0 0\nv 1.6 0 0\nv 0 1 0\nvn 0 0 1\nvn 0 0 1\nvn 0 0 1\nf 1//1 2//2 3//3\n';
const definition={id:'coverage-probe',bounds:{minX:-2,maxX:2,minZ:-2,maxZ:2},spawnPads:[[0,0,-1],[0,0,1]],spawnBarrier:.1};
test('owned partial cells accept only exact source polygon points and retain NoPaint and dead-hole negatives',async()=>{
 const f=await nativeFixture(),data=convertSource(definition,obj,'newmtl Concrete00\nKd 1 1 1\n',{}),L=f.G.level=new f.NativeLevel(data);
 f.G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 const paint=f.G.paint=new Cpu(null,L,{atlasSize:256,maxDensity:4}),face=L.faces[0],inside=new f.THREE.Vector3(1.5,.03,0);
 const rel=inside.clone().sub(face.origin),u=rel.dot(face.u),v=rel.dot(face.v),i=Math.floor(u/face.cu),j=Math.floor(v/face.cv),k=face.grid+j*face.nu+i;
 assert.equal(L.containsFaceUV(face,u,v),true);assert.equal(data.mask[k],1,'the actual triangle interior has a live cell');
 const centreU=(i+.5)*face.cu,centreV=(j+.5)*face.cv;
 assert.equal(L.containsFaceUV(face,centreU,centreV),false,'the same-cell centre lies outside the original triangle');
 paint.splat(inside,.45,0,{seed:.2,instant:true,face:0});
 assert.equal(paint.grid[k],1,'ordinary paint splat can claim the partial cell');
 assert.equal(paint.sample(0,u,v),1);assert.equal(paint.sample(0,centreU,centreV),0,'the covered cell cannot extend swimming ownership outside the polygon');
 assert.equal(paint.sample(0,face.su+.01,v),0);assert.equal(paint.sample(-1,u,v),0);
 const hole=data.mask.findIndex(value=>value===0);assert(hole>=0);assert.equal(paint.grid[hole],0);assert.equal(paint.dead[hole],1);
 const extra=obj.replace('Fld_Test','Fld_NoPaint').replaceAll('Concrete00','Concrete00_np').replace('f 1//1 2//2 3//3','f 4//4 5//5 6//6');
 const noPaint=convertSource(definition,obj+extra,'newmtl Concrete00\nKd 1 1 1\nnewmtl Concrete00_np\nKd 1 1 1\n',{});
 assert.equal(noPaint.manifest.objects[1].paintable,false);assert.equal(noPaint.triangleFace[1],-1);
});

test('Python and worker masks agree for partial polygons and thin strips',()=>{
 const tool=fileURLToPath(new URL('../tools/build-native.py',import.meta.url));
 const source=`import sys,json,importlib,pathlib,tempfile,os,numpy as np
sys.path.insert(0,str(pathlib.Path(sys.argv[1]).parent))
with tempfile.TemporaryDirectory(prefix='inkwave-paint-parity-') as cache:
 os.environ['NUMBA_CACHE_DIR']=cache
 module=importlib.import_module(pathlib.Path(sys.argv[1]).stem)
 p=json.load(sys.stdin);print(json.dumps(module.raster_mask(np.array(p['triangles'],dtype=np.float64),p['nu'],p['nv'],p['cu'],p['cv']).tolist()))
`;
 const cases=[[[[0,0],[1,0],[0,1]]],[[[0,.01],[1,.02],[0,.03]]],[[[.5,.9],[.7,.2],[.1,.1]],[[.7,.2],[1,.8],[.5,.9]]]];
 for(const triangles of cases){
  const nu=4,nv=4,cu=.25,cv=.25,mask=Array(nu*nv).fill(0);
  for(const [[ax,ay],[bx,by],[cx,cy]]of triangles)for(let j=0;j<nv;j++)for(let i=0;i<nu;i++)if(sourceTriangleCellOverlap(ax,ay,bx,by,cx,cy,i*cu,j*cv,(i+1)*cu,(j+1)*cv))mask[j*nu+i]=1;
  const python=JSON.parse(execFileSync('python3',['-c',source,tool],{input:JSON.stringify({triangles,nu,nv,cu,cv}),encoding:'utf8'}));
  assert.deepEqual(python,mask);
 }
});
