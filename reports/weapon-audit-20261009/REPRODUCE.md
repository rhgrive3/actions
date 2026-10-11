# 再現・適用手順

対象は `rhgrive3/actions` の指定 SHA `5d0be6b7fdebfd07e696e75497aaa97aa5ff5648` から取得した core / tools1 / tools2 / tools3 の同一ディレクトリ展開物です。別 SHA の main に無条件で上書きしないでください。GitHub の clone / push / 書込みは不要です。

## ソースの復元

変更ファイル ZIP を使う場合は、元の4分割ZIPを展開したプロジェクト直下へ重ねて展開します。削除対象はありません。元のアセットがそのまま残るので、この方法が最も単純です。

ソース全体 ZIP には全コード・テスト・補助ツールを含めていますが、変更のないフォント2点は再同梱していません。元 core ZIP を指定して復元できます。対象パスと SHA-256 は `package-omissions.json` に記録しています。

```sh
cd INKWAVE-source
python3 scripts/restore-original-font-assets.py /path/to/INKWAVE-main-5d0be6b7-core.zip
```

差分ファイルを使う場合は、元の展開物のルートで以下を実行します。ローカル Git のパッチ機能のみを使い、通信はしません。差分の適用と変更ファイル ZIP の上書きを二重に行う必要はありません。

```sh
git apply --check /path/to/INKWAVE-5d0be6b7-weapon-fidelity.patch
git apply /path/to/INKWAVE-5d0be6b7-weapon-fidelity.patch
```

## ローカル検証

実行環境は Node.js 22.16.0、Python 3 です。テスト用の `vm.SourceTextModule` に `--experimental-vm-modules` を指定します。今回の7ファイルの原典はソースに固定同梱しているため、資料の再ダウンロードは不要です。

```sh
bash scripts/verify-weapon-audit-local.sh
```

個別のコマンドは以下のとおりです。

```sh
node scripts/check-weapons-reference.mjs patches/splatoon3/reference/weapon-audit-1130
node scripts/verify-completion-sources.mjs patches/splatoon3/reference/weapon-audit-1130
node --experimental-vm-modules --test --test-concurrency=4 patches/splatoon3/tests/*.test.mjs
node --test patches/loading-cache/tests/offline-diagnostic.test.mjs
node --test scripts/tests/weapon-measurement-provenance.test.mjs
INKWAVE_BUILD_UNMINIFIED=1 node scripts/build-inkwave.mjs
bash scripts/check-weapon-audit-emitted.sh _site
node --experimental-vm-modules scripts/check-inkwave-weapons-fidelity.mjs --site _site
node --experimental-vm-modules scripts/measure-weapons-fidelity.mjs --site _site --after --out measurements.json
```

`INKWAVE_BUILD_UNMINIFIED=1` は明示的な**非圧縮診断ビルド**です。6段の本番ソースアダプター、実行用モジュール、プロファイル、リビジョン、キャッシュ生成を維持し、esbuild による圧縮と tree shaking のみを省略します。通常ビルドの代わりに圧縮成功を主張するモードではありません。通常の圧縮ビルドは従来どおり esbuild を必要とします。

```sh
# esbuild を用意できる別環境での通常ビルド
ESBUILD_MODULE=/path/to/esbuild/lib/main.js node scripts/build-inkwave.mjs
```

通常のキャッシュ上限は 5 MiB precache / 12 MiB revision / 64 KiB worker のままです。明示診断モードだけ 12 / 24 MiB / 128 KiB とし、どちらも上限を検査します。2世代キャッシュなどの既存ポリシーは変更していません。

## 実ブラウザ・GPU の再検証

この環境では localhost のページ遷移が `ERR_BLOCKED_BY_ADMINISTRATOR` となり、ネットワークを使わずメモリ中へ同じモジュールを読み込む方法でも `getContext('webgl2')` が null でした。ブラウザポリシーは変更していません。両方の失敗証跡を付けています。

WebGL2 を利用できる環境では、既存テストと今回追加した診断テストを再実行できます。

```sh
node scripts/check-inkwave-paint-mask.mjs --site _site \
  --playwright /path/to/playwright/index.mjs --executable /path/to/chromium \
  --evidence-dir ./gpu-evidence --profile-dir ./gpu-profile

node scripts/check-weapon-audit-browser.mjs --site _site \
  --playwright /path/to/playwright/index.mjs --executable /path/to/chromium \
  --out ./gpu-memory.json
```

後者は import の文字列だけを Blob/import-map 向けに変え、ゲーム処理とシェーダー本体は変えません。ソース版と生成版の双方で、108条件のCPU所有/GPU塗り検査と旧シェーダーへ戻した陰性対照を実行する設計です。**この成果物では GPU 検査の合格結果は得られていません。**

## 手動再現

生成後、ルートを配信します。`inkwave-public/index.html` を直接開くと修正を組み込む前のコードなので、必ず `_site` を使います。

```sh
python3 -m http.server 8000 --directory _site
# ブラウザで http://localhost:8000/ を開く
```

1. マニューバーを選び、地上で ZR＋方向＋B。前隙4Fでは水平移動0、12Fの本体終了で5 m、消費7%、20Fより前にスライド後射撃を出さないことを確認します。高台から落下して同じ入力を行うと空中スライドが受理され、壁の向こうへ抜けないことも確認します。ただし急降下の専用軌道はまだ本家と等価ではありません。
2. チャージャーで方向入力を維持しながら ZR を押します。1Fの開始待ち、部分チャージ中の段階的な減速、フルチャージ時の1.2 m/s目標を確認します。途中の直線補間は校正モデルです。射撃後の移動制限、インク精算、潜伏キープ、サブキャンセルも既存回帰テストと併せて確認します。
3. シューター・マニューバーで単発と連射を比べ、スピナーでは地上・ジャンプの散らばりを比べます。今回の角度分布はS2由来のガンマ仮説を使ったモデルであり、S3実機の分布確認は別途必要です。発射ベクトルを送り直している通信テストは維持していますが、実ブラウザ2台・遅延環境での操作感を合格扱いにはしていません。

比較時はギアなし、同じ床・距離・エイム・入力系列、固定60Hzシミュレーションを前提にしてください。30/60/120Hzは描画間隔を変えた同一固定ステップの比較です。描画フレームレートが変わるたびにゲーム自体のシミュレーション周波数を変えたという意味ではありません。
