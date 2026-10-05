# Dependency graph / critical path

正確なedge一覧は [before JSON](before/dependency-graph.json) / [after JSON](after/dependency-graph.json)。Acorn 8.15.0でimport/exportとliteral dynamic importを解析し、文字列引数のloader-call候補はstatic importとは別種のedgeとして記録した。`loadLazyModule(path)` などの非literal式は未解決として残し、全edgeが判明したふりはしていない。Acornはbuild/test専用で、サイトへ配信しない。

## Baseline

```text
root index.html + import map + 131 modulepreload hints
  ├─ ui.css → @import hud.css
  ├─ mobile.css / patch CSS
  └─ patches/splatoon3/bootstrap.mjs
      ├─ static installer / runtime graph / Three.js
      ├─ fetch profile.json
      └─ import src/main.js
          ├─ 全mapサムネイルの手続き生成、設定・プロフィール読み取り
          ├─ UI / HUD / Diorama → loading screen
          ├─ renderer / scene / input
          ├─ character / environment / props / audio module
          ├─ mural canvas + font wait
          ├─ procedural texture library (GPU compile/render/readback)
          ├─ world / paint / navigation / selected lightmap
          ├─ environment / FX / projectiles / game systems
          ├─ showcase / network module / attract match
          ├─ shader warmup + compileAsync + existing frame yields
          ├─ unconditional readiness dwell: 250 ms
          └─ title/main + ordinary loop
```

サムネイルの冒頭ループは外部stage画像を16枚downloadするという意味ではなく、layoutからの手続き生成。asset inventoryの画像総量をcold critical転送量とは扱わない。profileやlightmap JSON、font待ちと手続き生成、shader compileを混同しない。

## Candidate

```text
HTML inline system-font shell (CSS is still render-blocking)
  ├─ same 131 preload hints (policy unchanged)
  └─ tiny startup entry
      ├─ shell paint opportunity: two rAF, capped by 100 ms fallback
      ├─ same bootstrap / patch / engine graph
      ├─ await/constructor profiling hooks (opt-in detailed profile)
      ├─ readiness dwell 250 → 0 ms task yield
      └─ actual title/main observed
          └─ idle SW registration → bounded, coherent core snapshot
```

full battle sceneをtitle前に構築する結合は残る。`T_shell` とmenu/battle markerは分離したが、2D menuだけを先に本当に利用可能にするarchitectureへは移行していない。native比較なしに131 hintsを削除して改善扱いにはしていない。

## Menu-only境界の候補

`src/ui/menus.js` のstatic closureは14 modules / 329,683 bytesで、Threeを直接含まない。ただしこれは依存解析の候補境界であって、既存title機能がこの14本だけで完全に動くという実証ではない。メニューAPIのgame依存、preview、設定反映、patch installer、first-battleの準備完了ゲートを分離する必要がある。

境界を採用する場合は、shell → menu model/API → background engine preparation → first battle準備完了ゲート、というstate machineを設け、ユーザーがPlayを押した瞬間の新しいstutterも計測する。今回はその大きな置換は実装していない。

## 計測対応

[boot-sequence.json](boot-sequence.json) はbase `Game.boot` 内22個のawait境界と未測定欄を列挙する。direct constructorは `construct/<name>`。詳細profileは `?startupProfile`、取り出しは `window.__inkwaveStartup.snapshot()`。相対phaseの開始・終了はwall timeでありCPU timeではない。preloadが先行するため、await中の経過時間を当該moduleのdownload時間とみなさない。

ネイティブrunnerはDOMContentLoaded、resource/cache flag、server receipt、Performance metrics、long task、storage、optional V8 traceを採取する。parse/compileの正確な分離はtraceを必要とし、標準Resource Timingのdecoded bytesを「実際にparseしたbytes」とは呼ばない。ネイティブ受入れ未実施につき現在のphase timingはnull。
