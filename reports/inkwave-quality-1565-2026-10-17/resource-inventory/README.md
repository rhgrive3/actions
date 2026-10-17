# #1565 リソース所有者の診断

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
