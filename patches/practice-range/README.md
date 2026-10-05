# INKWAVE 練習場（試し撃ちラボ / Practice Range）

PLAY 画面の3枚目のカード「練習場」、または `?range` で開くソロの練習ステージ。9つのテストゾーンで、射程・ダメージ・塗り・移動・ボム・スペシャルを、ワールド座標そのままの目盛りで確認する。既存の武器性能、移動物理、ダメージ、通信、アニメーションは変更しない。練習場はそれらを観測する側である。

全体の設計・測定方式・検証結果・未解決事項は [練習場レポート](../../reports/practice-range-report.md) を参照。

## 構成

| パス | 役割 |
|---|---|
| `adapter.mjs` | ビルド時の接続（1接続1アンカー、二重適用・アンカー不一致でビルド停止） |
| `range-map.mjs` | `range` マップ定義。`MAPS` / `OFFLINE_MAPS` には入れない |
| `install.mjs` | `Match` / `Game` へのフック。`opts.range` の試合だけで動く |
| `stage/zones.mjs` | 全座標の唯一の定義（ゾーン、看板、ダミー、パッド、ワープ地点） |
| `stage/layout.mjs` `props.mjs` `surfaces.mjs` `murals.mjs` | 既存ステージ方式（mapkit、PropKit、texlib slot 31–33、壁画アトラス）による地形 |
| `runtime/` | セッション（ダミー、パッド、リセット、補給、ワープ）、HUD、看板、メニュー、文言 |
| `styles/range.css` | 練習場 HUD・モードカード・ポーズ画面 |
| `assets/` | AO ライトマップ（`layoutHash` 一致時のみ使用）、カード画像 |
| `tools/bake-ao.mjs` | AO 再ベイク（地形を変えたら必須。古いベイクはゲームが拒否し、テストも失敗する） |
| `tests/` | ロジック単独のテスト（vm realm で本番インストーラーと実 `Actor` を使用） |

## 確認コマンド

```sh
node --experimental-vm-modules --test patches/practice-range/tests/*.test.mjs
node scripts/build-inkwave.mjs inkwave-public _site
node scripts/check-inkwave-range.mjs --site _site --evidence-dir <証拠の保存先> --profile-dir <プロファイル>
# Chromium（デスクトップ・スマホ）＋ WebKit タブレット。/tmp 配下は拒否される
node --experimental-vm-modules patches/practice-range/tools/bake-ao.mjs --rays 64   # 地形変更後
```

テストはロジック単独の測定、`check-inkwave-range.mjs` はブラウザでの実動作確認であり、どちらもスプラトゥーン3実機との比較ではない。
