# INKWAVE 関連Issueの閉鎖に必要な資料パック

> 2026-10-10 JST スナップショット。GitHub Issue本文、Open PR本文・HEAD、変更ファイル/テスト、11.3.0固定抽出パラメータ・公式更新・公開Wiki・Drive原本を集めて整理した。**コード修正やマージを勝手に実行するPRではない。** 各対象Issueの元の受入条件が全て充足して初めて完了扱いにする。CI成功と原典数値があるだけでは完全修正としない。

## 目次

- [PR #1181 / #1182 — Issue別受入チェックと実装・テスト候補](./PR1181-1182.md)
- [PR #1183 / #1188 — ネット/ステージ/武器性能の受入チェック](./PR1183-1188.md)
- [PR #1189 / #1190 — 入力/物理/チャージャー等の受入チェック](./PR1189-1190.md)
- [PR #1191 / #1192 — Turf Map / Trizooka水死 / 開幕Squid Spawn](./PR1191-1192.md)
- [**固定原典・抽出値・Git blob SHA・公式/検証Wiki・Drive資料**](./SOURCES.md)
- [**閉鎖を進める最小追加テストと未証明ゲート**](./CLOSURE_GATES.md)

## 全Open Issueとの照合結果

- **Open Issue 合計：127件**（作成日別の重複なし検索。1回100件の検索上限を避けて3分割）。
- **今回のOpen修正PR 8件に関連：80件**（PR本文の明示的Refs/Fixes/Closes/Resolvesを区別、同一Issueの複数PR記載は1件に統合）。
- **うちPR本文に自動クローズを予定：20件**。これはマージされるまでIssueを閉じない。Issue受入の再レビューは必要。
- **関連はあるが自動クローズしていない：60件**。受入条件不足／独立検証待ち／モデル・資料不足をそのままopen維持。
- **今回の8修正PR本文に該当リンクなし：47件**。ユーザーの「関連付いたもの」からは外し、この監査だけで修正済みと判定しない（HUD見た目PR #1180 とアバターPR #401は誤って関連付けない）。
- PR本文の重複記載：13件。参照が複数ある場合は重複実装と同一視せず、実際のコードownerを見極める。

## PR別の証拠HEADとCI

| PR | 現行HEAD | base | 状態 | 関連Open Issue | Closes | Refのみ | exact-head CI |
|---|---|---|---|---:|---:|---:|---|
| [#1181](https://github.com/rhgrive3/actions/pull/1181) | f160082b60b1 | main | Draft | 12 | 0 | 12 | [実行 #37968598521](https://github.com/rhgrive3/actions/actions/runs/37968598521) |
| [#1182](https://github.com/rhgrive3/actions/pull/1182) | a8bead03d222 | main | Draft | 39 | 12 | 27 | [実行 #37968551841](https://github.com/rhgrive3/actions/actions/runs/37968551841) |
| [#1183](https://github.com/rhgrive3/actions/pull/1183) | f023c3c707ad | main | Ready | 13 | 4 | 9 | [実行 #37973436753](https://github.com/rhgrive3/actions/actions/runs/37973436753) |
| [#1188](https://github.com/rhgrive3/actions/pull/1188) | 925713ddfd1d | main | Draft | 12 | 2 | 10 | [実行 #37962493867](https://github.com/rhgrive3/actions/actions/runs/37962493867) |
| [#1189](https://github.com/rhgrive3/actions/pull/1189) | b54cac08995e | main | Ready | 5 | 2 | 3 | [実行 #37966696594](https://github.com/rhgrive3/actions/actions/runs/37966696594) |
| [#1190](https://github.com/rhgrive3/actions/pull/1190) | b7d898eefddd | main | Ready | 8 | 0 | 8 | [実行 #37951187401](https://github.com/rhgrive3/actions/actions/runs/37951187401) |
| [#1191](https://github.com/rhgrive3/actions/pull/1191) | c079b31cf9c0 | main | Ready | 2 | 0 | 2 | [実行 #37959867187](https://github.com/rhgrive3/actions/actions/runs/37959867187) |
| [#1192](https://github.com/rhgrive3/actions/pull/1192) | f3acb13561c2 | inkwave/c-next-integration-20261009 | Ready | 1 | 0 | 1 | [実行 #37956949251](https://github.com/rhgrive3/actions/actions/runs/37956949251) |

上記CI実行は2026-10-10の確認時点で**8件すべてGitHub Actions workflow結論success**。HEADがこの表から進んだ場合、古い実行の成功を新HEADの証拠に転用しない。PR #1192は **mainではなくPR #1183のブランチをbaseにしたスタック**。

## Openの自動クローズ候補 20件

[#434](https://github.com/rhgrive3/actions/issues/434)、[#412](https://github.com/rhgrive3/actions/issues/412)、[#387](https://github.com/rhgrive3/actions/issues/387)、[#382](https://github.com/rhgrive3/actions/issues/382)、[#372](https://github.com/rhgrive3/actions/issues/372)、[#305](https://github.com/rhgrive3/actions/issues/305)、[#203](https://github.com/rhgrive3/actions/issues/203)、[#1033](https://github.com/rhgrive3/actions/issues/1033)、[#999](https://github.com/rhgrive3/actions/issues/999)、[#967](https://github.com/rhgrive3/actions/issues/967)、[#951](https://github.com/rhgrive3/actions/issues/951)、[#950](https://github.com/rhgrive3/actions/issues/950)、[#949](https://github.com/rhgrive3/actions/issues/949)、[#919](https://github.com/rhgrive3/actions/issues/919)、[#904](https://github.com/rhgrive3/actions/issues/904)、[#1187](https://github.com/rhgrive3/actions/issues/1187)、[#1186](https://github.com/rhgrive3/actions/issues/1186)、[#1107](https://github.com/rhgrive3/actions/issues/1107)、[#1102](https://github.com/rhgrive3/actions/issues/1102)、[#1089](https://github.com/rhgrive3/actions/issues/1089)

これは **既存PR側が付けているCloses/Fixesを監査した一覧** であって、この資料パック自身が完成判定を追加するものではない。現在のIssue受入・本家比較が不足していたら、merge前に参照のみへ戻してから検証する。

## 複数PRで同一Issueが記載された箇所

- [#532](https://github.com/rhgrive3/actions/issues/532)：Closes主担当 なし、Refs #1181,#1188
- [#466](https://github.com/rhgrive3/actions/issues/466)：Closes主担当 なし、Refs #1181,#1182
- [#387](https://github.com/rhgrive3/actions/issues/387)：Closes主担当 #1188、Refs #1188,#1189
- [#264](https://github.com/rhgrive3/actions/issues/264)：Closes主担当 なし、Refs #1182,#1188
- [#951](https://github.com/rhgrive3/actions/issues/951)：Closes主担当 #1182、Refs #1181
- [#949](https://github.com/rhgrive3/actions/issues/949)：Closes主担当 #1182、Refs #1181
- [#940](https://github.com/rhgrive3/actions/issues/940)：Closes主担当 なし、Refs #1182,#1188
- [#719](https://github.com/rhgrive3/actions/issues/719)：Closes主担当 なし、Refs #1181,#1188
- [#574](https://github.com/rhgrive3/actions/issues/574)：Closes主担当 なし、Refs #1182,#1188
- [#539](https://github.com/rhgrive3/actions/issues/539)：Closes主担当 なし、Refs #1181,#1188
- [#1179](https://github.com/rhgrive3/actions/issues/1179)：Closes主担当 なし、Refs #1181,#1182
- [#1178](https://github.com/rhgrive3/actions/issues/1178)：Closes主担当 なし、Refs #1181,#1182
- [#1089](https://github.com/rhgrive3/actions/issues/1089)：Closes主担当 #1182、Refs #1182

#387はPR1188が実装ownerでPR1189の重複コードを削除済み。#1178/#1179/#951/#949など他PRとの重複参照も自動クローズのownerを一つに固定する。

## 検証の際の注意

1. [原典/型デフォルト/公開実測/ローカルモデル](./SOURCES.md)を区別。11.3.0の生JSONにない型側の値や分布を「本家確定」と誤記しない。
2. [Issue別の受入チェック](./PR1181-1182.md)は抜粋。**GitHub Issue本文の全受入項目が正本**。元Issueにhardware・WebGL・2ブラウザ条件がある場合、単体VMテストを全受入に格上げしない。
3. mainで既に修正済みのIssueは新PRの修正件数として再計上せず、必要な証拠コメントを付けてcompleted判定する。
4. この監査PRは**文書のみ、Draft、mainの変更・マージ・既存Issueの先行closeを含まない**。公開された実装PRにだけ完全に根拠のあるClosesを付ける。

## 最優先の作業

[CLOSURE_GATES.md](./CLOSURE_GATES.md)の順：#675、#875、#774、#538の数値/Physics/実操作、#927/#1011の実本番境界、#907/#1164/#512/#1178/#1179のブラウザ/2端末、#292/#952/#940/#1100の資料未確定項目。

情報を調べるだけではなく、**何を撮影・計測・テストすればcloseできるか**を各行に残している。
