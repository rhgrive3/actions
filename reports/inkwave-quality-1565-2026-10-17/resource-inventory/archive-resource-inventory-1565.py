#!/usr/bin/env python3
"""Archive a completed, resource-only #1565 diagnostic without rewriting evidence."""
import argparse, gzip, hashlib, json, shutil
from pathlib import Path

ap=argparse.ArgumentParser()
ap.add_argument('--source',type=Path,required=True)
ap.add_argument('--destination',type=Path,required=True)
a=ap.parse_args()
src=a.source.resolve();dst=a.destination.resolve()
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads(p.read_bytes())
r=read(src/'resource-inventory.json');inv=read(src/'invocation.json')
assert r['status']=='resource-diagnostic-complete'
assert r['resourceDiagnosticOnly'] is True and r['timingEvidenceEligible'] is False
assert r['order']==['A','B','B','A'] and len(r['trials'])==4
assert r['workloadGuardStatus']=='passed'
assert r['harnessSha256']==sha((src/'measure-inkwave-resource-inventory.mjs').read_bytes())==inv['harnessSha256']
assert r['resourceInventoryLibSha256']==sha((src/'resource-inventory-1565-page.mjs').read_bytes())==inv['resourceInventoryLibSha256']
assert r['runtimeEvidenceLibSha256']==sha((src/'inkwave-runtime-evidence.mjs').read_bytes())==inv['runtimeEvidenceLibSha256']
assert r['resourceInventoryClassifiersSha256']==sha((src/'resource-inventory-classifiers.json').read_bytes())
assert r['frozenParentHarnessSha256']==sha((src/'measure-inkwave-quality-359ed88a.mjs').read_bytes())
phases=['after-boot','after-pwa','after-setup','before-window','after-window']
kinds=['roots','privateOwners','nodes','geometries','materials','textures','targets','listeners']
identity={'id','uuid','key','sourceId','sourceUuid'}
def normalized(kind,value):
    if kind in ['roots','privateOwners']:return value
    return [{k:v for k,v in row.items() if k not in identity} for row in value]
def stablehash(value):return sha(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode())
phase_rows=[];snapshots={}
for phase in phases:
    ds=[]
    for t in r['trials']:
        receipt=t['resourceInventories'][phase];b=(src/receipt['filename']).read_bytes();assert sha(b)==receipt['sha256']
        d=json.loads(b);ds.append(d);snapshots[(t['ordinal'],phase)]=d
    canonical={kind:[stablehash(normalized(kind,d[kind])) for d in ds] for kind in kinds}
    phase_rows.append({'phase':phase,'allRendererCountersEqual':all(d['renderer']==ds[0]['renderer'] for d in ds),'allCoverageEqual':all(d['coverage']==ds[0]['coverage'] for d in ds),'canonicalEquality':{kind:len(set(hs))==1 for kind,hs in canonical.items()},'canonicalSha256ByTrial':canonical,'trials':[{'ordinal':t['ordinal'],'variant':t['variant'],'renderer':d['renderer'],'coverage':d['coverage'],'inventoryFile':t['resourceInventories'][phase]['filename'],'inventorySha256':t['resourceInventories'][phase]['sha256']} for t,d in zip(r['trials'],ds)]})
assert all(x['allRendererCountersEqual'] and x['allCoverageEqual'] and all(x['canonicalEquality'].values()) for x in phase_rows)
# Within-realm identities are valid only for this chronology, not across trials.
def registrations(d):
    ls={x['key'] for x in d['listeners'] if x['exactGeometryDispose']}
    return {x['id']:x for x in d['geometries'] if ls.intersection(x['disposeListeners'])}
chronology=[]
for t in r['trials']:
    boot=snapshots[(t['ordinal'],'after-boot')];setup=snapshots[(t['ordinal'],'after-setup')];before=snapshots[(t['ordinal'],'before-window')]
    br,sr,wr=map(registrations,[boot,setup,before]);setup_ids={x['id'] for x in setup['geometries']}
    chronology.append({'ordinal':t['ordinal'],'variant':t['variant'],'bootToSetupPreviouslyMatchingGeometryIdentitiesNoLongerReachable':len(br.keys()-sr.keys()),'bootToSetupLostMatchingIdentitiesStillInventoried':sum(k in setup_ids for k in br.keys()-sr.keys()),'bootToSetupNewReachableMatchingIdentities':len(sr.keys()-br.keys()),'warmupNewReachableMatchingIdentities':len(wr.keys()-sr.keys()),'warmupLostReachableMatchingIdentities':len(sr.keys()-wr.keys()),'attribution':'Lost boot-root references include former actor weapon definitions/parts and rebuilt hair geometries. This is reachability chronology, not identification of all65 unaccounted registrations or a leak/driver-allocation proof.'})
ref=snapshots[(0,'before-window')]
summary={'schema':1,'purpose':'Resource ownership classification only','status':r['status'],'workloadGuardStatus':r['workloadGuardStatus'],'historical406Geometry132TextureReproduced':False,'historical406132Cause':'UNKNOWN','unreconciledGeometryResidual':65,'completeRendererLedger':False,'resourceNondegradationEstablished':False,'performanceNondegradationEstablished':False,'timingEvidenceEligible':False,'hardwareClaim':False,'resourceDiagnosticOnly':True,'sourceEvidencePath':str(src),'rawResultSha256':sha((src/'resource-inventory.json').read_bytes()),'provenance':{v:{k:r['provenance'][v][k] for k in ['sourceSha','contentHash','revision']} for v in ['A','B']},'hashes':{k:r[k] for k in ['harnessSha256','resourceInventoryLibSha256','runtimeEvidenceLibSha256','resourceInventoryClassifiersSha256','frozenParentHarnessSha256']},'invocation':inv,'settings':r['settings'],'scope':{k:r[k] for k in ['stage','scenario','input','samples','warmup','viewport','deviceScaleFactor','order','gpuTiming','timeouts']},'environment':r['environment'],'observedStage':ref['privateOwners']['stage'],'observedPrivateOwners':ref['privateOwners'],'preservedGuards':{'gameplayComparable':r['gameplayComparable'],'drawCallsComparable':r['drawCallsComparable'],'visualValidation':r['visualValidation'],'backgroundComparable':r['backgroundComparable'],'resourceValidation':r['resourceValidation']},'framesPreservedInFullResult':sum(len(t['frames']) for t in r['trials']),'gpuRowsPreservedInFullResult':sum(len(t['gpu']['rows']) for t in r['trials']),'gpuValidRows':sum(t['gpu']['valid'] for t in r['trials']),'phaseComparisonMethod':'Only top-level local identity fields id/uuid/key/sourceId/sourceUuid are omitted from node/geometry/material/texture/target/listener descriptors. Roots and private-owner state are compared verbatim. Node references, owner paths, attribute/index descriptors, material state and listener source are retained. Geometry attribute contents are not hashed.','phaseComparisons':phase_rows,'withinTrialChronology':chronology,'limitations':ref['limitations'],'interpretation':['All four new windows show410 geometries/131 textures/147 programs. The historical406/132 state was not captured; no causal explanation is established.','Before and after each window,435 reachable CPU geometries include345 with the exact renderer-registration disposer, in one listener closure;312 are on main-scene paths.410-345=65 is unreconciled.','The exact disposer source establishes registration by some renderer using the served implementation, not unique ownership by G.renderer. Unreachable objects/module caches/renderer WeakMaps remain outside the ledger.','All125 inventoried texture identities and18 target identities remain present during warmup while renderer texture count129→131; no new captured texture/target identity or listener explains those2 allocations.','Diagnostic allocation and serialization occur outside frame loops but may alter GC/scheduling history. Every recorded timing remains ineligible for isolated performance/calibration acceptance.']}
dst.mkdir(parents=True,exist_ok=False)
files=[]
for f in sorted(src.iterdir()):
    if not f.is_file():raise RuntimeError('Unexpected directory in evidence: '+str(f))
    b=f.read_bytes();compress=(f.suffix=='.json' and len(b)>256*1024) or f.suffix=='.rgba'
    target=dst/(f.name+('.gz' if compress else ''))
    stored=gzip.compress(b,compresslevel=6,mtime=0) if compress else b
    target.write_bytes(stored)
    assert (gzip.decompress(stored) if compress else stored)==b
    files.append({'sourceFile':f.name,'sourceBytes':len(b),'sourceSha256':sha(b),'archiveFile':target.name,'archiveBytes':len(stored),'archiveSha256':sha(stored),'encoding':'gzip-lossless' if compress else 'identity'})
(dst/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
shutil.copyfile(Path(__file__),dst/'archive-resource-inventory-1565.py')
readme='''# #1565 リソース所有者の診断

4つのABBAコンテキストすべてで、フレーム窓の前後は **410 geometry / 131 texture / 147 program** だった。過去の **406 / 132** は再現せず、その原因は **UNKNOWN** のまま。**完全なリソース台帳、VRAM同等性、CPU/GPU非劣化、タイミング校正の合格を示す証拠ではない。**

Aは `d5265f73d9dad69f1afd9690e374caee45195f11`、Bは `57e5cf61121514c8d04ac8efe059b5386fa99f27`。正確なビルドcontentHash、実行引数、実行環境、ネイティブstageの出典は [summary.json](summary.json) と [invocation.json](invocation.json) に保存した。シナリオはnative scorch、8体（実コントローラー1、BotBrain7）に固定したoutward-fire、480×300、medium、PWA有効、音声稼働、SwiftShader。各コンテキスト12ウォームアップ＋6フレーム、合計24フレーム。元のgameplay・endpoint pixel・draw・PWA/audioガードは通過した。

| 観測時点（4試行すべて同じ） | renderer geometry/texture/program | 到達可能geometry | 厳密disposeリスナー一致 | 未照合の差 |
| --- | --- | --- | --- | --- |
| 起動直後・PWA直後 | 352 / 129 / 153 | 424 | 350 | 2 |
| セットアップ直後 | 396 / 129 / 144 | 433 | 331 | 65 |
| フレーム窓の前後 | 410 / 131 / 147 | 435 | 345 | **65** |

全5観測時点で、4試行のowner状態、ノード、geometry、material、texture、target、リスナーの記述はローカルid/uuid等を除いて一致した。比較方法と各正規化SHA256はsummaryにある。属性内容そのもののハッシュは取っていない。

フレーム窓では1つの同一関数参照グループで345個のgeometry登録リスナーを確認し、そのうち312個はmain-scene経路にある。`410−345=65` は未照合のまま。Threeの実際のminifiedソースからカウンター減算・登録・加算の関係を検査して完全一致で分類したが、そのリスナーだけでG.renderer固有の所有権とは断定できない。到達不能なCPUオブジェクト、モジュール内キャッシュ、rendererのWeakMapは列挙できない。

起動→セットアップでは、以前に一致していた48個のgeometry参照が列挙対象から消え、新たに29個が現れた。元のactorのweapon定義/部品や再生成されたhair geometryが含まれる。これは参照到達性の経緯であり、未照合65個や過去の差の原因を特定したものではない。ウォームアップでは一致登録とrendererカウンターがともに14増え、差65は変わらなかった。

ウォームアップ中、列挙した125個のtexture・18個のtargetの個体とリスナー/パラメーターは変わらない一方、renderer textureカウンターは129→131となった。追加の2割当の所有者も未特定。textureのCPU個体数、disposeリスナー数、source/cache-key共有、render-targetの割当数は同じ尺度ではなく、VRAM量には換算できない。

一覧作成は起動・PWA・セットアップ・フレーム窓の前後だけに行い、フレームループ内には追加していない。追加warm/compile/render/dispose、productionへのリスナー追加、renderer.properties.get、GL状態取得も行わない。ただし一覧の確保・シリアライズがGCや非同期順序を変える可能性があるため、`resourceDiagnosticOnly:true`、`timingEvidenceEligible:false`、`performanceNondegradationEstablished:false` を維持する。今回の結果で過去の測定上の不一致を取り消さない。

全35個の実行時証拠を欠落なく保存した。大きなJSON（全結果と20個のphase inventory）と4個のエンドポイントRGBA（`.rgba.gz`）は決定的なgzipで可逆圧縮し、エンドポイントPNG、実際に実行したentry/helper、凍結元359ed、証拠ライブラリ、分類器、invocationを保持した。全24生フレームと24GPU query行も [resource-inventory.json.gz](resource-inventory.json.gz) に残っているが、タイミング採用には使えない。元の非圧縮SHA256とアーカイブSHA256・サイズは [archive-manifest.json](archive-manifest.json)、格納ファイル全体の検証は [SHA256SUMS](SHA256SUMS) を参照する。

再確認例:

```bash
sha256sum -c SHA256SUMS
python -c "import gzip,json; r=json.load(gzip.open('resource-inventory.json.gz')); print(r['status'],r['timingEvidenceEligible'])"
```

同じ診断を新しい出力先で再実行する正確な引数はinvocation.jsonにある。再実行は新たな診断結果となり、元の359ed測定ハーネスの校正には流用できない。
'''
(dst/'README.md').write_text(readme)
manifest={'schema':1,'scope':'Complete lossless archive of every source-directory file; raw and compressed hashes are separate. No source evidence was edited.','sourceDirectory':str(src),'sourceFiles':files,'sourceFileCount':len(files),'sourceTotalBytes':sum(x['sourceBytes'] for x in files),'archivedEvidenceBytes':sum(x['archiveBytes'] for x in files),'generatedFiles':[{'path':name,'sha256':sha((dst/name).read_bytes()),'bytes':(dst/name).stat().st_size} for name in ['summary.json','README.md','archive-resource-inventory-1565.py']]}
(dst/'archive-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
checks=''.join(f'{sha(f.read_bytes())}  {f.name}\n' for f in sorted(dst.iterdir()) if f.is_file())
(dst/'SHA256SUMS').write_text(checks)
# Verify both storage integrity and every byte of the uncompressed source.
for row in files:
    b=(dst/row['archiveFile']).read_bytes();assert sha(b)==row['archiveSha256']
    raw=gzip.decompress(b) if row['encoding']=='gzip-lossless' else b
    assert len(raw)==row['sourceBytes'] and sha(raw)==row['sourceSha256']
print(json.dumps({'destination':str(dst),'sourceFiles':len(files),'sourceBytes':manifest['sourceTotalBytes'],'archivedEvidenceBytes':manifest['archivedEvidenceBytes'],'phases':len(phase_rows),'frames':summary['framesPreservedInFullResult'],'residual':65,'historicalCause':'UNKNOWN','verified':True},ensure_ascii=False))
