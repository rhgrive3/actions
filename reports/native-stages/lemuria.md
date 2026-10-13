# リュウグウターミナル / Lemuria Hub

2026-10-13。担当ブランチ `codex/native-lemuria`。共通基盤 `a84009dee41bdb8350401412e21a4e991a426adb`。

## 実装状態

`Vss_AutoWalk00` の公開モデルを確認できないため、ステージ全体の再現は **source-unavailable** のまま。11.3.0 の名簿に存在することと、地形・衝突・スポーン・ルール配置を復元できることを区別する。別ステージのメッシュや仮の床、推定したスポーンで埋めない。

この PR は、名前と理由を表示する選択不可の項目、直接 API・古い選択状態・自動開始 URL・ワールド構築・オンラインホスト開始・受信した開始通知の拒否を実装する。モデル取得、ワールド交換、既存 match の破棄より前に停止する。共通の `UNAVAILABLE_NATIVE_STAGES` を使い、Mahi の `placement-unavailable` にも同じガードを適用する。

## 原典の調査

参照は KiTrix `0611f51b35c9736ee986fb2218461e2585b7875e` と Leanny/splat3 の 11.3.0 公開メタデータ。Leanny の資料はコミュニティによる公開抽出情報で、実機での挙動測定や任天堂による配置保証ではない。

| 確認範囲 | 結果 |
| --- | --- |
| KiTrix 現在 HEAD / 全 branch | 指定 commit と同一、`main` のみ |
| 指定 tree のファイル 13,633 件 | `AutoWalk` を含む path 0 件 |
| 全 8 commit の recursive Git tree | 全て非 truncated、`AutoWalk` path 0 件 |
| `stages/`、`models/`、app を含む全 tree | AutoWalk OBJ・MTL・PNG なし |
| KiTrix fork / release | いずれも 0 件 |
| GitHub code search `Vss_AutoWalk00 extension:obj` / `extension:mtl` | いずれも 0 件 |
| `FldBG_AutoWalk00` code search | Leanny の `SceneInfo.json` メタデータのみ |
| `"Lemuria Hub" splatoon` repository search | 0 件 |
| 11.3.0 `SceneInfo` / `VersusSceneInfo` | 名前、内部 ID、表示順 24、名簿掲載を確認 |

GitHub search の検索対象や公開範囲には限界があるため、世界中のあらゆる配布物が存在しないとは判定しない。指定リポジトリの現行 tree と全公開履歴に原典がないことは、非 truncated tree で確認済み。

数値と元ファイルの SHA-256 は [lemuria-source-verification.json](lemuria-source-verification.json)。再調査コマンド:

```sh
python scripts/verify-inkwave-lemuria-source.py \
  --source /workspace/actions/.codex-stage-sources/KiTrix \
  --scene /workspace/actions/.codex-stage-sources/leanny-1130/SceneInfo.json \
  --versus /workspace/actions/.codex-stage-sources/VersusSceneInfo-1130.json \
  --online --report .browser-evidence/lemuria/source-verification.json
```

公開 HEAD が更新された、別 branch / fork / release が現れた、または AutoWalk の path を発見した場合は失敗し、新しい原典をレビューする。資格情報の表示、TLS 検証の無効化、proxy の迂回は行っていない。

## 検証

原典不在のため、メッシュ同一性、移動・塗り・泳ぎ、8 人対戦、ナビ・ミニマップ、5 ルールの本家配置、ステージの描画性能は **未検証・未実装**。本家の実機操作比較も未実施。これらの完成判定にメニューや拒否動作の合格を使わない。

この PR が変更する拒否動作は、実行時には別 map にフォールバックして対戦を開始せず、現在の地形・paint・physics・nav・match を保持する。

- 専用 Node 検証: 10 / 10 合格。全 5 ルールの core / menu API、直接ワールド構築、オンライン host / incoming start、古いメニュー選択を確認。
- 既存 startup 回帰: 139 / 139 合格。通常の対戦開始、操作の再入、破棄、フェード失敗の既存検証を保持。
- 共通 catalog / 入力 identity 検証: 7 / 7 合格。
- 本番 minified build: 合格。`inkwave-public/` 差分 0。
- 実ブラウザ・実 WebSocket: 合格。[lemuria-browser-verification.json](lemuria-browser-verification.json)。Chromium の実表示で名前・理由・disabled を確認。core / menu API は全 5 ルールで拒否、直接 world / online startup は `RangeError`、既存の level / paint / physics / nav / match の参照を保持した。
- production `RoomDurableObject` と実 WebSocket を通し、全 5 ルールで host の開始を拒否。正規 host から送信した不正な開始 packet も、guest が world 準備前に拒否した。原典への取得要求 0、page error 0。

最初の合格実行では 2 peer のメニューを起動してからシミュレーションを freeze したため、software renderer で表示確認まで約 4 分かかった。タイムアウトや失敗はなかった。再実行用 probe は既存 online checker と同様、各 peer の boot 後にすぐ freeze / `_skipRender` を設定し、次の peer の起動と競合しないようにする。freeze はゲームの拒否判定や WebSocket の受信を差し替えない。

ブラウザ検証は共有 lock を使い、画像は ignored `.browser-evidence/lemuria/` にのみ保存する。

```sh
node --test patches/native-stages/tests/lemuria-unavailable.test.mjs
node --experimental-vm-modules --test patches/reliability/tests/start.test.mjs
node --test patches/native-stages/tests/catalog-extension.test.mjs scripts/tests/inkwave-native-stage-inputs.test.mjs
node scripts/build-inkwave.mjs inkwave-public _site-native-lemuria
flock /workspace/actions/.ci-scratch/native-stage-browser.lock \
  node scripts/check-inkwave-lemuria-unavailable.mjs _site-native-lemuria .browser-evidence/lemuria
```

## 完成に必要な入力

利用できる権限を確認した `Vss_AutoWalk00` の真正なモデル・マテリアル・画像、および 11.3.0 の衝突・塗り・スポーン・5 ルール配置の根拠が必要。可動歩道など固有のギミックも原典の状態情報と照合する必要がある。入力が揃うまで `version1130Verified:false` と source-unavailable を維持する。
