# ネイティブステージの追加軽量化

前段の [iPad・スマートフォン対策](../native-mobile-20261030/README.md) に追加する描画選別のCPU削減。利用可能な全23ステージが対象。基準は前段対策と最新mainを統合した `60e29562f8fa44c1bd12d1858cf6a995a84d6cd8`、採用版は `7fe40c36995f2e5c76cfa6cda1d1f264cd1d1cbe`。

## 採用した変更

`patches/native-stages/runtime/native-render.mjs` の連続区間コピーを改良した。タイルが違っても原典インデックス上で隣接する可視区間は、一つの区間としてコピーする。頂点・UV・三角形の順序・描画数・保留中のGPU転送範囲を保ち、細かく交互に並ぶメッシュの既存フォールバックも維持する。追加のGPUバッファや画質低下はない。

全23ステージ、実データ1,206メッシュ、各48視点で、全インデックスのバイト列、描画数、更新範囲、バージョンが修正前後で一致した。[一覧](render/all-parity.json) と [各ステージ](render/all-parity/) に原典・候補のハッシュを保存した。

同じ実データ・240視点×4周を8組、前後の順序を交互にしたNode CPU部品計測。共有ロックで他の重い検証から分離した。

| ステージ | メッシュ | 修正前CPU中央値 | 修正後CPU中央値 | 短縮 |
| --- | ---: | ---: | ---: | ---: |
| Robo | 63 | 411.343ms | 155.819ms | 62.12% |
| Brinewater | 96 | 6589.405ms | 5951.943ms | 9.67% |

[Roboの全サンプル](render/robo.json)、[Brinewaterの全サンプル](render/brinewater.json)。この比率は描画選別の処理だけの値であり、対戦全体や実端末のFPS改善率ではない。

## 統合確認

描画と比較器の重点テスト27件が成功し、失敗・skipは0。通常ビルド、入力互換性、起動サイズ予算、移行監査も成功した。基準と採用版は各1575ソース入力・2299生成物を照合済み。[基準](baseline-source-binding.json)、[採用版](accepted-source-binding.json)、`accepted-*.log.gz`。

実ブラウザの最終結果は完了後に追記する。前段の46ケースは前段候補の証跡であり、今回の採用版の検査へ読み替えない。

## 不採用の候補

- 塗りの確定した飛沫を絞るキャッシュは、実Roboから採取した597呼び出しの結果が一致したが、中央値174.37→186.20ms（6.79%遅い）。製品コードを元へ戻し、追加メモリを導入しなかった。[全サンプル・比較条件](paint-piece-selection-rejected.json)。
- 接地の軸展開、足元全体の事前判定、共通Y座標の再利用は、一部ステージや密な対照で遅くなったため不採用。物理コードは基準と同じ。[判断と生データ](physics/rejected/summary.json)。
- 既存の塗りGPU経路をネイティブへ適用する案も、iPad設定Roboの900フレームで条件を満たしたのが25／314676クアッド（0.0079%）だけだった。単に適用範囲を広げても有効な削減は見込めず、変更しない。[実際の受付条件の診断](paint-profile-admission-robo.json)。

## 再現

Node24.19.0、Playwright1.62.1、変換済みデータをLFSから取得した環境を使用する。

```sh
node --experimental-vm-modules --test patches/native-stages/tests/native-display-coalesce.test.mjs patches/native-stages/tests/native-display-runs.test.mjs patches/native-stages/tests/native-render-static.test.mjs scripts/tests/inkwave-composed-cpu-comparison.test.mjs
node --experimental-vm-modules scripts/benchmark-native-display-coalesce.mjs --stage robo --out .ci-scratch/robo-coalesce.json
node --experimental-vm-modules scripts/benchmark-native-display-coalesce.mjs --stage brinewater --out .ci-scratch/brinewater-coalesce.json
node --experimental-vm-modules scripts/benchmark-native-display-coalesce.mjs --stage shipshape --views 48 --parity-only
```

測定時の固定fixtureは `f110ffa1` に保存している。後続 `7fe40c36` では末尾の空行だけを除去し、関数本体は同一。[ハッシュ照合](render/source-binding.json)。

本家の参照条件は既存のSplatoon3 Ver.11.3.0記録を継承する。移動・射撃・塗り・接地の仕様値と既存の未確認項目は変えていない。Nintendoの内部描画方式との一致、物理iPad／スマートフォンでのFPS、現行Switchとの同条件比較を新たに確認したものではない。
