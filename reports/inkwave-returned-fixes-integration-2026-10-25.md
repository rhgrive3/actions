# Returned INKWAVE fixes — 2026-10-25

This integration preserves the journal already committed in ebe716900acca44e26dd61839ea4bfe7a7805161, including the Transport entry. The following menu entry is retained here rather than replacing that concurrent journal. Both original reports and failure evidence remain.

Exact fetched bytes were rechecked, and the combined overlay was tested: 18 focused cases and 231 combined cases passed on Node 24.19.0. These runs overlap and are not summed as unique coverage. This is not a full build, real browser, device or final-head CI acceptance. The final release still requires all mandatory checks. The discovered wrapper imports the original four menu-disposal cases without weakening them.


## 2026-10-25: ニュースUIの解放位置

[ニュース解放の追加修正](menu-news-disposal-20261025/README.md)は、検証候補354f1c5で初回Menus.updateへ誤接続していた解放をMenus.disposeへ戻す。表示中ニュースの維持と破棄時timer/RAF取消を実Chromiumの診断合成で確認した。通常ビルドは別担当のMobileInput lock不一致で停止し、生成物受入は未確認。参照版Splatoon 3 Ver.11.3.0の内部UI寿命仕様は不明であり、本家一致・ゲームロジック・実機性能の確認とは扱わない。
