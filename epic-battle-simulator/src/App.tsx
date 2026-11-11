import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Engine, type ControlMode, type EndStats, type Formation, type HudState } from "./game/engine";
import { DEFS, FACTIONS, MAX_PER_TEAM, type UnitDef, type UnitKind } from "./game/units";
import { SCENES, STAGES, enemyRoster, loadCleared, saveCleared, unlockedThrough } from "./game/campaign";

/* ==================== icons ==================== */

function Icon({ k, className }: { k: string; className?: string }) {
  const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const f = { fill: "currentColor", stroke: "none" };
  const svg = (children: React.ReactNode) => <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...base}>{children}</svg>;
  switch (k) {
    case "spear": return svg(<><path d="M4 20 L14.5 9.5" /><path d="M14 5 h5 v5 l-2 -2 l-2.4 2.4 Z" {...f} /></>);
    case "shield": return svg(<><path d="M12 3 L19 6 V12 C19 16.5 16 19.5 12 21 C8 19.5 5 16.5 5 12 V6 Z" {...f} /><path d="M12 7 V17 M8 11 H16" stroke="#10141c" strokeWidth="1.6" /></>);
    case "bow": return svg(<><path d="M7 3 C 15 8 15 16 7 21" /><path d="M7 3 L7 21" /><path d="M8 12 L19 12" /><path d="M16.5 9.5 L20 12 L16.5 14.5 Z" {...f} /></>);
    case "crossbow": return svg(<><path d="M3.5 9 C 8 4.5 16 4.5 20.5 9" /><path d="M12 6.5 V20" strokeWidth="2.4" /><path d="M9.5 20 h5" /><path d="M12 3 l2 3 h-4 Z" {...f} /></>);
    case "sword": return svg(<><path d="M5 19 L16.5 7.5" strokeWidth="2.4" /><path d="M16.5 7.5 L20 4 L19.2 8.8 Z" {...f} /><path d="M6.5 13.5 l4 4" strokeWidth="2.2" /></>);
    case "halberd": return svg(<><path d="M6 21 L16 11" /><path d="M15.5 5.5 c 3.5 -2 7 0 7.5 3 c -2 -0.5 -3.5 0 -4.5 1 Z" {...f} /><path d="M14 9 l3 3" strokeWidth="2.2" /></>);
    case "horse": return svg(<><path d="M5 20 L18.5 6.5" /><path d="M17 3.5 h4 v4 l-1.7 -1.7 l-2.6 2.6 Z" {...f} /><path d="M7 8.5 l5.4 2.7 v4.4 c0 2.8 -2.7 4.4 -2.7 4.4 s -2.7 -1.6 -2.7 -4.4 Z" {...f} /></>);
    case "paladin": return svg(<><path d="M12 3 L12 21" strokeWidth="2.4" /><path d="M7 8 h10" strokeWidth="2.4" /><path d="M12 6.5 l1.6 1.6 M12 6.5 l-1.6 1.6" /><circle cx="12" cy="12" r="7.5" /></>);
    case "axe": return svg(<><path d="M5 20 L14.5 10" /><path d="M11.5 4.5 c 3.5 -2.5 8 -1.5 9.5 2.5 c -2 -0.8 -4 -0.6 -5.5 0.3 l -4.5 -1.2 Z" {...f} /></>);
    case "axes": return svg(<><path d="M4 20 L13 6 M20 20 L11 6" /><path d="M13 4 c 3 -1.5 6 0 6.5 3 c -2 -0.5 -3.5 0 -4.5 1 Z" {...f} /><path d="M11 4 c -3 -1.5 -6 0 -6.5 3 c 2 -0.5 3.5 0 4.5 1 Z" {...f} /></>);
    case "javelin": return svg(<><path d="M4 20 L18.5 5.5" /><path d="M18 2 h4 v4 l-2 -1.6 l-2.4 2.4 Z" {...f} /></>);
    case "bomb": return svg(<><circle cx="11" cy="14" r="6.2" {...f} /><path d="M14.5 8.8 L17.5 5.5" /><path d="M18 3 v3 M16 4.5 h4 M16.7 3.2 l2.6 2.6 M19.3 3.2 l-2.6 2.6" strokeWidth="1.2" /></>);
    case "shaman": return svg(<><path d="M12 21 V11" /><circle cx="12" cy="8" r="2.6" {...f} /><path d="M9 4 c 1.5 1.5 4.5 1.5 6 0 M8 6.5 c 2 2 6 2 8 0" strokeWidth="1.2" /></>);
    case "fist": return svg(<><path d="M7.5 20.5 L13 8.5" strokeWidth="3.2" /><circle cx="15.2" cy="6.3" r="3.8" {...f} /><path d="M13 4.5 l1 1 M16 3.5 l0.5 1.5 M17.5 6 l1.5 0.5" stroke="#10141c" strokeWidth="1.1" /></>);
    case "giant": return svg(<><circle cx="12" cy="12" r="5" /><path d="M12 2 v3 M12 19 v3 M2 12 h3 M19 12 h3 M5.5 5.5 l2 2 M16.5 16.5 l2 2 M18.5 5.5 l-2 2 M7.5 16.5 l-2 2" strokeWidth="1.6" /></>);
    case "leafbow": return svg(<><path d="M8 3 C 15 8 15 16 8 21" /><path d="M8 3 L8 21" /><path d="M19 12 c -2.2 -3.4 -6.4 -3.4 -8.6 0 c 2.2 3.4 6.4 3.4 8.6 0 Z" {...f} /></>);
    case "dagger": return svg(<><path d="M5 19 L16.5 7.5" strokeWidth="2.6" /><path d="M16.5 7.5 L20 4 L19.2 8.8 Z" {...f} /><path d="M6.5 13.5 l4 4" strokeWidth="2.2" /></>);
    case "orb": return svg(<><path d="M7.5 21 L13.5 6.5" /><circle cx="14.6" cy="5" r="2.7" {...f} /><path d="M19.5 8.5 l2 -1 M18.5 13.5 l2.2 0.8 M20 11 l1.5 -0.5" strokeWidth="1.4" /></>);
    case "frost": return svg(<><path d="M12 2 v20 M4 6 l16 12 M20 6 L4 18" strokeWidth="1.6" /><path d="M12 6 l2 2 -2 2 -2 -2 Z M12 14 l2 2 -2 2 -2 -2 Z" {...f} /></>);
    case "cross": return svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 6.5 V17.5 M6.5 12 H17.5" strokeWidth="2.6" /></>);
    case "crown": return svg(<><path d="M4 18 L5.5 8 L10 12 L12 5 L14 12 L18.5 8 L20 18 Z" {...f} /><path d="M4 20 h16" /></>);
    case "pirate": return svg(<><path d="M6 13 C 6 8 18 8 18 13 C 16 15 8 15 6 13 Z" {...f} /><path d="M4 13 h16" /><circle cx="12" cy="10" r="1.2" /></>);
    case "zeus": return svg(<><path d="M13 2 L6 12 h5 l-2 10 l8 -12 h-5 Z" {...f} /></>);
    case "robot": return svg(<><rect x="5" y="8" width="14" height="11" rx="2" {...f} /><path d="M9 12 h2 M13 12 h2" stroke="#10141c" strokeWidth="1.6" /><path d="M12 8 V5" /><circle cx="12" cy="4" r="1.2" {...f} /><path d="M8 19 v3 M16 19 v3" /></>);
    case "tank": return svg(<><rect x="3" y="13" width="18" height="6" rx="2" {...f} /><path d="M6 13 V9 h8 v4" /><path d="M14 11 h7" strokeWidth="2.4" /><circle cx="7" cy="16" r="1.2" fill="#10141c" /><circle cx="12" cy="16" r="1.2" fill="#10141c" /><circle cx="17" cy="16" r="1.2" fill="#10141c" /></>);
    case "railgun": return svg(<><path d="M3 13 h13" strokeWidth="2.6" /><path d="M16 10 h5 v3 h-5 z" {...f} /><path d="M8 9 v8 M5 9 v8" strokeWidth="1.6" /><circle cx="18" cy="11.5" r="0.9" fill="#10141c" /></>);
    case "skull": return svg(<><path d="M12 3 a7 7 0 0 0 -7 7 v4.2 l 3 1.8 v 3 h 8 v -3 l 3 -1.8 v -4.2 a7 7 0 0 0 -7 -7z" {...f} /><circle cx="9.4" cy="10.5" r="1.7" fill="#10141c" /><circle cx="14.6" cy="10.5" r="1.7" fill="#10141c" /><path d="M10.2 18.5 v2 M13.8 18.5 v2" /></>);
    case "bone": return svg(<><path d="M7 17 L17 7" strokeWidth="2.6" /><circle cx="5.8" cy="15.5" r="1.9" {...f} /><circle cx="8.5" cy="18.2" r="1.9" {...f} /><circle cx="18.2" cy="8.5" r="1.9" {...f} /><circle cx="15.5" cy="5.8" r="1.9" {...f} /></>);
    case "boneshot": return svg(<><path d="M6 4 L18 20" strokeWidth="2.2" /><path d="M18 6 C 13 9 13 15 18 18" /><path d="M18 6 L18 18" /></>);
    case "vampire": return svg(<><path d="M12 3 C 8 6 6 10 6 14 a6 6 0 0 0 12 0 C18 10 16 6 12 3 Z" {...f} /><path d="M10 13 l-1.5 2 M14 13 l1.5 2" stroke="#10141c" strokeWidth="1.4" /></>);
    default: return null;
  }
}

function Coin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="#eec25f" stroke="#8a5f14" strokeWidth="2" />
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="#8a5f14" strokeWidth="1.4" />
    </svg>
  );
}

/* ==================== helpers ==================== */

function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const FORMATION_LABELS: Record<Formation, string> = {
  box: "方陣",
  line: "横陣",
  wedge: "楔陣",
  scatter: "散開",
};

function GoldText({ value, testId }: { value: number; testId: string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const state = useRef({ v: value, prev: value });
  useEffect(() => {
    const s = state.current;
    const diff = value - s.prev;
    s.prev = value;
    if (Math.abs(diff) >= 5) {
      setFlash(diff > 0 ? "up" : "down");
      const timer = window.setTimeout(() => setFlash(null), 400);
      const from = s.v, t0 = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / 260);
        s.v = Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3)));
        setShown(s.v);
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
    }
    s.v = value;
    setShown(value);
  }, [value]);
  return <span data-testid={testId} className={flash === "down" ? "gold-down" : flash === "up" ? "gold-up" : ""}>{shown.toLocaleString()}</span>;
}

/** What the unit physically does, as short tags. Every tag maps to one rule in simulation.ts. */
function traitsOf(d: UnitDef): string[] {
  const t: string[] = [];
  if (d.brace) t.push("槍衾: 走ってくる敵に大打撃・突撃を止める");
  if (d.charge) t.push("突撃: 助走した初撃が強化");
  if (d.hunter) t.push("追撃: 射手・術師・僧侶を優先");
  if (d.aoe) t.push("爆発: 盾を無視・中心ほど強い");
  if (d.cleave) t.push("薙ぎ払い: 周囲の敵も巻き込む");
  if (d.pierce && !d.aoe) t.push(`貫通: ${d.pierce + 1}体まで射抜く`);
  if (d.chain) t.push(`連鎖: ${d.chain}体へ雷が走る`);
  if (d.slow) t.push("鈍足: 移動と攻撃を遅くする");
  if (d.heal) t.push("回復: 味方を癒やす");
  if (d.regen) t.push("再生: 傷が戻り続ける");
  if (d.lifesteal) t.push("吸血: 与えた傷で回復");
  if (d.rage) t.push("狂乱: 傷つくほど速く殴る");
  return t;
}

function UnitStats({ d }: { d: UnitDef }) {
  return (
    <span className="stat-row">
      <span className="stat-chip">HP<b className="text-emerald-400">{d.hp}</b></span>
      <span className="stat-chip">攻撃<b className="text-red-400">{d.dmg}</b></span>
      <span className="stat-chip">射程<b className="text-sky-400">{d.range}</b></span>
      <span className="stat-chip">速さ<b className="text-lime-300">{d.speed}</b></span>
      {d.armor > 0 && <span className="stat-chip" title="受けるダメージを毎回この値だけ減らす（最低でも3割は通る）">装甲<b className="text-violet-300">{d.armor}</b></span>}
      {d.shield && <span className="stat-chip" title="正面からの矢と斬撃をこの割合だけ止める。爆発と背後は防げない">正面盾<b className="text-cyan-300">{Math.round(d.shield * 100)}%</b></span>}
      {d.impact / d.mass > 1.6 && <span className="stat-chip">衝撃<b className="text-amber-300">大</b></span>}
      {d.buff && <span className="stat-chip">鼓舞<b className="text-gold-300">+{Math.round(d.buff * 100)}%</b></span>}
      {traitsOf(d).map(t => (
        <span key={t} className="stat-chip trait-chip" title={t}>{t.split(":")[0]}</span>
      ))}
    </span>
  );
}

/* ==================== unit dock ==================== */

const UnitDock = memo(function UnitDock(props: {
  eng: Engine | null; faction: HudState["faction"]; deploy: UnitKind | null; deployTeam: 0 | 1; budget: number; count: number; batch: boolean;
  unlocked: Set<UnitKind>;
}) {
  const { eng, faction, deploy, deployTeam, budget, count, batch, unlocked } = props;
  const info = FACTIONS.find(f => f.id === faction)!;
  const picked = deploy ? DEFS[deploy] : null;
  return (
    <div className="unit-dock">
      <div className="faction-tabs" role="tablist" aria-label="勢力">
        {FACTIONS.map(f => (
          <button
            key={f.id}
            role="tab"
            aria-selected={f.id === faction}
            data-testid={`tab-${f.id}`}
            className={`faction-tab ${f.id === faction ? "on" : ""}`}
            style={{ ["--tab" as string]: f.color }}
            onClick={() => eng?.setFaction(f.id)}
          >
            <i />{f.name}
          </button>
        ))}
        <button
          className={`batch-toggle ${batch ? "on" : ""}`}
          aria-pressed={batch}
          data-testid="batch-toggle"
          title="5体まとめて配置 (B)"
          onClick={() => eng?.toggleBatch()}
        >
          ×5
        </button>
      </div>
      <div className="unit-row">
        {info.units.map((kind, i) => {
          const def = DEFS[kind];
          const open = deployTeam === 1 || unlocked.has(kind);
          const can = open && budget >= def.cost && count < MAX_PER_TEAM;
          const sel = deploy === kind;
          return (
            <button
              key={kind}
              className={`unit-card ${sel ? "sel" : ""} ${can ? "" : "off"}`}
              onClick={() => open && eng?.setDeploy(kind)}
              aria-label={`${def.name}を配置`}
              aria-pressed={sel}
              disabled={!open}
              data-testid={`unit-${kind}`}
              title={open ? `${def.desc} HP ${def.hp} / 攻撃 ${def.dmg} / 射程 ${def.range}` : "ストーリー進行で解放"}
            >
              <span className="key-badge">{i + 1}</span>
              <Icon k={def.icon} className="card-icon" />
              <span className="card-name">{def.name}</span>
              <span className="card-cost">{open ? <><Coin className="h-3 w-3" />{def.cost}</> : <span className="lock">🔒</span>}</span>
            </button>
          );
        })}
      </div>
      {picked && (
        <div className="unit-info" data-testid="unit-info">
          <b className="text-gold-300">{picked.name}</b>
          <span className="role-tag">{picked.role}</span>
          <UnitStats d={picked} />
          <span className="unit-desc unit-description text-steel-300">{picked.desc}</span>
        </div>
      )}
    </div>
  );
});

/* ==================== stage select ==================== */

function StageSelect({ cleared, onPick, onBack }: { cleared: number; onPick: (i: number) => void; onBack: () => void }) {
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-steel-950/90">
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-widest text-gold-300">ストーリー</h2>
            <p className="mt-1 text-[11px] text-steel-300">クリア {cleared} / {STAGES.length}</p>
          </div>
          <button className="btn btn-steel px-4 py-2 text-xs" onClick={onBack}>戻る</button>
        </div>
        <div className="mt-4 space-y-5">
          {SCENES.map(scene => (
            <section key={scene.id}>
              <div className="mb-2 flex items-baseline gap-2">
                <b className="font-display text-sm tracking-widest" style={{ color: scene.color }}>第{scene.id}章 {scene.name}</b>
                <span className="text-[10px] text-steel-400">{scene.sub}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {STAGES.map((stage, i) => stage.scene !== scene.id ? null : (
                  <button
                    key={stage.id}
                    data-testid={`stage-${stage.id}`}
                    className={`stage-card ${i < cleared ? "cleared" : ""} ${i > cleared ? "locked" : ""}`}
                    disabled={i > cleared}
                    onClick={() => onPick(i)}
                  >
                    <span className="stage-no">{scene.id}-{stage.id - (scene.id - 1) * 5}</span>
                    <span className="stage-name">{stage.name}</span>
                    <span className="stage-meta">
                      <span className="flex items-center gap-1"><Coin className="h-3 w-3" />{stage.budget}</span>
                      <span>{i < cleared ? "CLEAR" : i === cleared ? "挑戦" : "🔒"}</span>
                    </span>
                    {stage.unlock.length > 0 && i === cleared && (
                      <span className="stage-unlock">解放: {stage.unlock.map(k => DEFS[k].name).join("・")}</span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ==================== help ==================== */

function HelpSheet({ onClose }: { onClose: () => void }) {
  const mouse: [string, string][] = [
    ["左クリック / ドラッグ", "選択 / 範囲選択"],
    ["右クリック", "移動（陣形適用）・集中攻撃 / 配置解除"],
    ["右ドラッグ", "カメラ回転"],
    ["配置モードでドラッグ", "なぞって連続配置"],
    ["カメラモード: 左半分 / 右半分", "移動 / 回転"],
    ["ホイール", "拡大縮小"],
    ["C / B / T / V", "配置・カメラ切替 / ×5配置 / 陣形切替 / 追従カメラ"],
    ["1-9 / Q・E", "兵種選択 / 勢力タブ"],
    ["G / H / F", "総攻撃 / 待機 / 選択部隊へ"],
    ["Space / Esc / M", "開始・停止 / 解除 / 消音"],
  ];
  const touch: [string, string][] = [
    ["タップ", "選択・配置・移動命令"],
    ["配置モードでドラッグ", "なぞって連続配置"],
    ["カメラモードでドラッグ", "左半分=移動 / 右半分=回転"],
    ["2本指", "ピンチ拡大縮小・移動"],
    ["長押し→ドラッグ", "範囲選択"],
    ["「範囲選択」ボタン", "1タップで範囲選択に切替"],
    ["ダブルタップ", "全選択"],
  ];
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-3 anim-fadeIn" role="dialog" aria-modal="true" aria-label="操作" onClick={onClose}>
      <div className="panel panel-gold max-h-full w-[640px] max-w-full overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold tracking-widest text-gold-300">操作方法</h2>
          <button className="btn btn-steel px-3 py-1 text-xs" onClick={onClose} data-testid="help-close">閉じる</button>
        </div>
        <div className="mt-3 grid gap-4 text-[12px] sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[11px] font-bold tracking-widest text-gold-500">マウス・キーボード</div>
            {mouse.map(([k, v]) => <div key={k} className="help-row"><b>{k}</b><span>{v}</span></div>)}
          </div>
          <div>
            <div className="mb-1 text-[11px] font-bold tracking-widest text-gold-500">タッチ操作</div>
            {touch.map(([k, v]) => <div key={k} className="help-row"><b>{k}</b><span>{v}</span></div>)}
            <p className="mt-3 text-[11px] leading-relaxed text-steel-300">開戦前に資金内で編成します。「自動編成」で1クリック戦術配置も可能。側面・背後からの攻撃は威力1.3倍です。</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==================== app ==================== */

const INIT_HUD: HudState = {
  phase: "menu", time: 0, speed: 1, budget: [0, 0], counts: [0, 0], kills: [0, 0], losses: [0, 0],
  sel: 0, deploy: null, deployTeam: 0, faction: "kingdom", batch: false, boxMode: false, mode: "place",
  story: false, stageIndex: 0, sceneId: 1, stageName: "", stageHint: "", showcase: false, muted: false,
  canUndo: false, resolving: null, notice: null, quality: "standard", fps: 60, deployFail: 0,
  teamHp: [[0, 0], [0, 0]], formation: "box", following: false, selectedUnit: null,
};

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const engRef = useRef<Engine | null>(null);
  const navLockRef = useRef(0);
  const [hud, setHud] = useState<HudState>(INIT_HUD);
  const [end, setEnd] = useState<EndStats | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [screen, setScreen] = useState<"menu" | "stages">("menu");
  const [cleared, setCleared] = useState(0);

  useEffect(() => { setCleared(loadCleared()); }, []);
  useEffect(() => {
    if (!boxRef.current || !overlayRef.current || !miniRef.current) return;
    let eng: Engine;
    try {
      eng = new Engine(boxRef.current, overlayRef.current, miniRef.current, { onHud: setHud, onEnd: setEnd, onError: setError });
      engRef.current = eng;
      setReady(true);
      setError(null);
    } catch {
      setError("WebGL 2の起動に失敗しました。ブラウザー設定でハードウェアアクセラレーションを有効にしてください。");
      return;
    }
    return () => { eng.dispose(); engRef.current = null; };
  }, []);

  const guardAction = useCallback((fn: () => void) => {
    const now = performance.now();
    if (now - navLockRef.current < 80) return;
    navLockRef.current = now;
    fn();
  }, []);

  const eng = engRef.current;
  const inBattle = hud.phase === "setup" || hud.phase === "playing" || hud.phase === "paused";
  const unlocked = useMemoUnits(hud.story ? cleared : STAGES.length, hud.story);
  const openStage = useCallback((index: number) => {
    guardAction(() => {
      setEnd(null);
      setScreen("menu");
      eng?.startStage(index);
    });
  }, [eng, guardAction]);

  const finishStage = useCallback((won: boolean) => {
    if (!won || !hud.story) return;
    const next = Math.max(cleared, hud.stageIndex + 1);
    if (next !== cleared) {
      setCleared(next);
      saveCleared(next);
    }
  }, [cleared, hud.stageIndex, hud.story]);

  useEffect(() => { if (end) finishStage(end.winner === 0); }, [end, finishStage]);

  const activeBudget = hud.budget[hud.deployTeam];
  const activeCount = hud.counts[hud.deployTeam];
  const customSetup = !hud.story && !hud.showcase && hud.phase === "setup";
  const blueHpPct = hud.teamHp && hud.teamHp[0][1] > 0 ? Math.round((hud.teamHp[0][0] / hud.teamHp[0][1]) * 100) : 100;
  const redHpPct = hud.teamHp && hud.teamHp[1][1] > 0 ? Math.round((hud.teamHp[1][0] / hud.teamHp[1][1]) * 100) : 100;
  const formLabel = FORMATION_LABELS[hud.formation ?? "box"];

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-steel-950 text-steel-300" data-testid="game" data-phase={hud.phase}>
      <div ref={boxRef} className="absolute inset-0" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 60%, rgba(8,10,16,0.3) 100%)" }} />

      {inBattle && (
        <>
          <div className="hud-player anim-fadeIn">
            <div className="panel panel-gold px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="font-display text-sm font-bold tracking-widest text-team0">味方</span>
                <span className="hide-sm text-[10px] text-steel-400">{hud.showcase ? "見本" : `${hud.counts[0]}体 (${blueHpPct}%)`}</span>
              </div>
              <div key={hud.deployFail} className={`gold-line ${hud.deployFail ? "anim-shake" : ""}`}>
                <Coin className="h-5 w-5" />
                <GoldText value={hud.budget[0]} testId="blue-gold" />
              </div>
              <div className="stat-line">
                <span>部隊 <b className="text-white" data-testid="blue-count">{hud.counts[0]}</b></span>
                <span>撃破 <b className="text-team0" data-testid="blue-kills">{hud.kills[0]}</b></span>
                <span>損失 <b className="text-team1" data-testid="blue-losses">{hud.losses[0]}</b></span>
              </div>
              <div className="hp-meter hide-sm" aria-hidden="true">
                <i style={{ width: `${blueHpPct}%`, background: "linear-gradient(90deg, #3b82f6, #7dd3fc)" }} />
              </div>
            </div>
          </div>

          <div className="hud-controls anim-fadeIn">
            <div className="panel controls-panel">
              <span className="battle-time" data-testid="battle-time">{fmtTime(hud.time)}</span>
              <button
                className={`btn control-button ${hud.phase === "setup" ? "btn-gold" : "btn-steel"}`}
                onClick={() => guardAction(() => (hud.phase === "setup" ? eng?.beginBattle() : eng?.togglePause()))}
              >
                {hud.phase === "setup" ? "戦闘開始" : hud.phase === "paused" ? "再開" : "一時停止"}
              </button>
              <button
                className={`btn btn-steel control-button hide-sm ${hud.speed === 0.5 ? "active" : ""}`}
                aria-label="0.5倍速"
                aria-pressed={hud.speed === 0.5}
                onClick={() => eng?.setSpeed(0.5)}
                title="スローモーション"
              >
                0.5×
              </button>
              {[1, 2, 4].map(s => (
                <button key={s} className={`btn btn-steel control-button ${hud.speed === s ? "active" : ""}`} aria-label={`${s}倍速`} aria-pressed={hud.speed === s} onClick={() => eng?.setSpeed(s)}>
                  {s}×
                </button>
              ))}
              <span className="control-sep" />
              {(["place", "camera"] as ControlMode[]).map(m => (
                <button
                  key={m}
                  className={`btn control-button mode-button ${hud.mode === m ? "on" : ""}`}
                  data-testid={`mode-${m}`}
                  aria-pressed={hud.mode === m}
                  onClick={() => eng?.setMode(m)}
                  title="C"
                >
                  {m === "place" ? "配置" : "カメラ"}
                </button>
              ))}
              <span className="control-sep" />
              <button className="btn btn-steel control-button" onClick={() => eng?.toggleQuality()} aria-label="画質">{hud.quality === "low" ? "軽量" : "標準"}</button>
              <button className="btn btn-steel control-button" onClick={() => eng?.toggleMute()} aria-label="音" aria-pressed={!hud.muted}>{hud.muted ? "🔇" : "🔊"}</button>
              <button className="btn btn-steel control-button" onClick={() => setHelp(true)} aria-label="操作" data-testid="help-open">?</button>
            </div>
          </div>

          <div className="hud-enemy anim-fadeIn">
            <div className="panel px-3 py-2 text-right">
              <div className="flex items-center justify-between">
                <span className="hide-sm text-[10px] text-steel-400">{hud.story ? `敵軍 (${redHpPct}%)` : `自由 (${redHpPct}%)`}</span>
                <span className="font-display text-sm font-bold tracking-widest text-team1">敵</span>
              </div>
              <div className="gold-line justify-end">
                <GoldText value={hud.budget[1]} testId="red-gold" />
                <Coin className="h-5 w-5" />
              </div>
              <div className="stat-line">
                <span>部隊 <b className="text-white" data-testid="red-count">{hud.counts[1]}</b></span>
                <span>撃破 <b className="text-team1" data-testid="red-kills">{hud.kills[1]}</b></span>
                <span>損失 <b className="text-steel-300" data-testid="red-losses">{hud.losses[1]}</b></span>
              </div>
              <div className="hp-meter hide-sm" aria-hidden="true">
                <i style={{ width: `${redHpPct}%`, background: "linear-gradient(90deg, #f87171, #dc2626)", marginLeft: "auto" }} />
              </div>
            </div>
          </div>

          {hud.story && hud.phase === "setup" && (
            <div className="stage-brief">
              <b>{hud.stageName}</b>
              <span>{hud.stageHint}</span>
              <span className="stage-foes" data-testid="stage-foes">
                敵: {enemyRoster(STAGES[hud.stageIndex]).map(([k, n]) => `${DEFS[k].name}×${n}`).join(" / ")}
              </span>
            </div>
          )}

          <div className={`hud-notice pointer-events-none ${hud.story && hud.phase === "setup" ? "with-brief" : ""}`} role="status" aria-live="polite" data-testid="notice">
            {hud.resolving !== null ? (
              <p className="text-gold-300">決着まで {hud.resolving}</p>
            ) : hud.notice ? (
              <p key={hud.notice.id} className={`anim-notice ${hud.notice.error ? "text-red-300" : "text-gold-300"}`}>{hud.notice.text}</p>
            ) : hud.phase === "setup" ? (
              <p className="text-gold-300">{hud.showcase ? "兵種見本 — 右ドラッグで回転" : hud.mode === "place" ? "配置モード: ドラッグで連続配置" : "カメラモード: 左=移動 / 右=回転"}</p>
            ) : null}
          </div>

          <div className="bottom-stack">
            <div className="command-dock">
              <div className="selection-info" data-testid="selection-info">
                {hud.deploy
                  ? `${hud.deployTeam === 0 ? "味方" : "敵"}: ${DEFS[hud.deploy].name}を配置中`
                  : hud.boxMode ? "ドラッグで範囲選択"
                  : hud.sel > 0 ? `${hud.sel}体選択` : "部隊を選択"}
                <span className="hide-sm ml-2 text-steel-300/90">
                  {hud.selectedUnit
                    ? `｜ ${hud.selectedUnit.name} HP ${hud.selectedUnit.hp}/${hud.selectedUnit.maxHp} 撃破${hud.selectedUnit.kills} ${hud.selectedUnit.buffs.join(" ")}`
                    : hud.mode === "place" ? "なぞって連続配置 / 右クリックで命令" : "左半分で移動・右半分で回転"}
                </span>
              </div>
              <div className="command-buttons">
                <button className="btn btn-steel command-button" onClick={() => eng?.selectAll()}>全選択</button>
                <button
                  className={`btn btn-steel command-button ${hud.boxMode ? "active" : ""}`}
                  data-testid="box-mode"
                  aria-pressed={hud.boxMode}
                  onClick={() => eng?.toggleBoxMode()}
                >
                  範囲選択
                </button>
                {hud.deploy && (
                  <button className="btn btn-steel command-button" data-testid="cancel-deploy" onClick={() => eng?.setDeploy(null)}>
                    配置解除
                  </button>
                )}
                <button className="btn btn-steel command-button" onClick={() => eng?.issueOrder("auto")}>総攻撃<kbd>G</kbd></button>
                <button className="btn btn-steel command-button" onClick={() => eng?.issueOrder("hold")}>待機<kbd>H</kbd></button>
                <button className="btn btn-steel command-button" onClick={() => eng?.focusSelected()}>寄る<kbd>F</kbd></button>
                <button
                  className="btn btn-steel command-button hide-sm"
                  data-testid="formation-cycle"
                  title="移動命令時の陣形を切替 (T)"
                  onClick={() => eng?.cycleFormation()}
                >
                  陣形:{formLabel}<kbd>T</kbd>
                </button>
                <button
                  className={`btn btn-steel command-button hide-sm ${hud.following ? "active" : ""}`}
                  data-testid="follow-cam"
                  aria-pressed={!!hud.following}
                  title="選択部隊を追従カメラで追跡 (V)"
                  onClick={() => eng?.toggleFollow()}
                >
                  追従<kbd>V</kbd>
                </button>
                {hud.phase === "setup" && !hud.showcase && (
                  <button
                    className="btn btn-steel command-button hide-sm"
                    data-testid="auto-deploy"
                    title="予算内でバランスの良い戦術部隊を自動配置"
                    onClick={() => eng?.autoDeploy()}
                  >
                    自動編成
                  </button>
                )}
                {customSetup && (
                  <>
                    <button
                      className={`btn command-button team-pill blue ${hud.deployTeam === 0 ? "on" : ""}`}
                      data-testid="team-0"
                      onClick={() => eng?.setDeployTeam(0)}
                    >
                      味方配置
                    </button>
                    <button
                      className={`btn command-button team-pill red ${hud.deployTeam === 1 ? "on" : ""}`}
                      data-testid="team-1"
                      onClick={() => eng?.setDeployTeam(1)}
                    >
                      敵配置
                    </button>
                    <button className="btn btn-steel command-button" data-testid="clear-all" onClick={() => eng?.clearCustomUnits()}>
                      全消去
                    </button>
                    <button
                      className="btn btn-steel command-button"
                      data-testid="scene-cycle"
                      onClick={() => eng?.setCustomScene((hud.sceneId % 4) + 1)}
                    >
                      戦場: {SCENES[hud.sceneId - 1]?.name ?? "辺境"}
                    </button>
                  </>
                )}
                {hud.phase === "setup" && <button className="btn btn-steel command-button" disabled={!hud.canUndo} onClick={() => eng?.undoDeploy()}>戻す</button>}
                {hud.phase === "setup" && <button className="btn btn-steel command-button" onClick={() => guardAction(() => { setEnd(null); eng?.backToMenu(); setScreen(hud.story ? "stages" : "menu"); })}>やめる</button>}
              </div>
            </div>
            <UnitDock
              eng={eng}
              faction={hud.faction}
              deploy={hud.deploy}
              deployTeam={hud.deployTeam}
              budget={activeBudget}
              count={activeCount}
              batch={hud.batch}
              unlocked={unlocked}
            />
          </div>
        </>
      )}

      <div className={`minimap-dock ${inBattle ? "" : "is-hidden"}`}>
        <div className="camera-controls">
          <button className="btn btn-steel cam-button" aria-label="ズームイン" onClick={() => eng?.zoom(0.8)}>＋</button>
          <button className="btn btn-steel cam-button" aria-label="ズームアウト" onClick={() => eng?.zoom(1.25)}>－</button>
          <button className="btn btn-steel cam-button wide" onClick={() => eng?.resetCamera()}>全体</button>
        </div>
        <div className="panel p-1.5">
          <canvas ref={miniRef} width={176} height={110} className="block cursor-crosshair" data-testid="minimap" aria-label="戦場マップ" />
          <div className="minimap-caption"><span>クリックで移動</span><span>{hud.fps} FPS</span></div>
        </div>
      </div>

      {hud.phase === "paused" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 anim-fadeIn" role="dialog" aria-modal="true" aria-label="一時停止">
          <div className="panel panel-gold w-[400px] max-w-[92vw] px-8 py-8 text-center">
            <div className="font-display text-4xl font-extrabold tracking-[0.3em] text-gold-300 anim-pulseGold">一時停止</div>
            <div className="mt-6 flex flex-col gap-2">
              <button className="btn btn-gold px-6 py-3 font-display text-lg font-bold tracking-widest" onClick={() => guardAction(() => eng?.togglePause())}>再開</button>
              <button className="btn btn-steel px-6 py-2 text-sm" onClick={() => guardAction(() => { setEnd(null); hud.story ? eng?.startStage(hud.stageIndex) : eng?.startSandbox(); })}>最初から</button>
              <button className="btn btn-steel px-6 py-2 text-sm" onClick={() => guardAction(() => { setEnd(null); eng?.backToMenu(); setScreen(hud.story ? "stages" : "menu"); })}>やめる</button>
            </div>
          </div>
        </div>
      )}

      {hud.phase === "menu" && screen === "menu" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(11,14,20,0.42) 0%, rgba(11,14,20,0.9) 100%)" }} />
          <div className="relative flex max-h-full w-full max-w-4xl flex-col items-center overflow-y-auto px-5 py-8">
            <div className="anim-fadeUp text-center">
              <div className="font-display text-[13px] font-bold tracking-[0.6em] text-gold-500">EPIC SANDBOX</div>
              <h1 className="title-eng anim-pulseGold mt-1 text-3xl font-extrabold text-gold-300 sm:text-5xl md:text-6xl">BATTLE SIMULATOR</h1>
              <div className="title-jp mt-2 text-sm text-steel-300 sm:text-lg">3D戦争シミュレーター</div>
              <div className="mt-2 text-[11px] tracking-wider text-steel-300">5勢力・31兵種 / 4つの戦場 / 全20ステージ</div>
            </div>

            <div className="mt-6 flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row">
              <button className="btn btn-gold px-10 py-4 font-display text-xl font-extrabold tracking-[0.3em]" disabled={!ready || !!error} data-testid="story" onClick={() => guardAction(() => setScreen("stages"))}>
                ストーリー
              </button>
              <button className="btn btn-steel px-8 py-4 text-base font-bold" disabled={!ready || !!error} data-testid="sandbox" onClick={() => guardAction(() => { setEnd(null); eng?.startSandbox(); })}>
                カスタム戦
              </button>
            </div>
            <button className="btn btn-steel mt-2 px-5 py-2 text-xs" disabled={!ready || !!error} data-testid="showcase" onClick={() => guardAction(() => { setEnd(null); eng?.startShowcase(); })}>
              兵種図鑑
            </button>

            <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
              <div className="panel px-4 py-3">
                <div className="mb-1 font-display text-sm font-bold tracking-widest text-gold-300">ストーリー</div>
                <p className="text-[11px] leading-relaxed text-steel-300">4つの戦場・全20ステージを攻略。クリアするたびに新たな兵種が解放されます。</p>
              </div>
              <div className="panel px-4 py-3">
                <div className="mb-1 font-display text-sm font-bold tracking-widest text-gold-300">カスタム戦</div>
                <p className="text-[11px] leading-relaxed text-steel-300">全31兵種を使い、敵味方を自由に並べて対戦させるモードです。</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {hud.phase === "menu" && screen === "stages" && (
        <StageSelect cleared={cleared} onPick={openStage} onBack={() => guardAction(() => setScreen("menu"))} />
      )}

      {hud.phase === "over" && end && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 anim-fadeIn" role="dialog" aria-modal="true" aria-label="結果">
          <div className="w-[440px] max-w-[92vw]">
            <div className={`anim-stamp text-center font-display text-4xl font-extrabold tracking-[0.2em] sm:text-5xl ${end.winner === 0 ? "text-gold-300" : end.winner === null ? "text-steel-300" : "text-team1"}`}>
              {end.winner === 0 ? "勝 利" : end.winner === null ? "引き分け" : "敗 北"}
            </div>
            <div className="mt-2 flex items-center justify-center gap-3 text-xs tracking-[0.4em] text-steel-400">
              <span>{end.winner === 0 ? "VICTORY" : end.winner === null ? "DRAW" : "DEFEAT"}</span>
              {end.winner === 0 && (
                <span className="tracking-widest text-gold-400">
                  {end.losses[0] <= end.spawned[0] * 0.35 ? "★★★" : end.losses[0] <= end.spawned[0] * 0.7 ? "★★☆" : "★☆☆"}
                </span>
              )}
            </div>
            <div className="panel panel-gold anim-fadeUp mt-5 px-6 py-5" style={{ animationDelay: "0.2s" }}>
              {hud.story && end.winner === 0 && STAGES[hud.stageIndex]?.unlock.length > 0 && (
                <div className="mb-3 border-b border-steel-700 pb-2">
                  <div className="text-[10px] tracking-widest text-gold-500">解放された兵種</div>
                  <div className="mt-1 text-sm font-bold text-gold-300">
                    {STAGES[hud.stageIndex].unlock.map(k => DEFS[k].name).join("・")}
                  </div>
                </div>
              )}
              {end.mvp && (
                <div className="mb-3 flex items-center justify-between border-b border-steel-700/80 pb-2.5 text-xs">
                  <span className="text-[10px] font-bold tracking-widest text-gold-500">殊勲部隊 (MVP)</span>
                  <span className="flex items-center gap-1.5 font-bold text-gold-300">
                    <Icon k={DEFS[end.mvp.kind].icon} className="h-4 w-4 text-gold-400" />
                    {DEFS[end.mvp.kind].name}
                    <span className="text-[11px] font-normal text-steel-300">（{end.mvp.kills}撃破 / {end.mvp.damage.toLocaleString()}ダメージ）</span>
                  </span>
                </div>
              )}
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ["時間", fmtTime(end.time)],
                    ["撃破 / 損失", `${end.kills[0]} / ${end.losses[0]}`],
                    ["敵 撃破 / 損失", `${end.kills[1]} / ${end.losses[1]}`],
                    ["総与ダメージ", end.damageDealt ? `${end.damageDealt[0].toLocaleString()} / ${end.damageDealt[1].toLocaleString()}` : "-"],
                    ["編成", `${end.spawned[0]} 体`],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-b border-steel-700/60 last:border-0">
                      <td className="py-1.5 text-steel-400">{k}</td>
                      <td className="py-1.5 text-right font-bold text-steel-300">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 flex gap-2">
                {hud.story && end.winner === 0 && hud.stageIndex + 1 < STAGES.length && (
                  <button className="btn btn-gold flex-1 px-4 py-2.5 font-display text-base font-bold tracking-widest" onClick={() => openStage(hud.stageIndex + 1)}>
                    次のステージ
                  </button>
                )}
                <button className="btn btn-steel flex-1 px-4 py-2.5 text-sm" onClick={() => guardAction(() => { setEnd(null); hud.story ? eng?.startStage(hud.stageIndex) : eng?.startSandbox(); })}>
                  もう一度
                </button>
                <button className="btn btn-steel flex-1 px-4 py-2.5 text-sm" onClick={() => guardAction(() => { setEnd(null); eng?.backToMenu(); setScreen(hud.story ? "stages" : "menu"); })}>
                  {hud.story ? "ステージ" : "メニュー"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {help && <HelpSheet onClose={() => setHelp(false)} />}

      {error && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-steel-950/95 p-5" role="alert">
          <div className="max-w-lg text-center">
            <h2 className="font-display text-2xl text-gold-300">3D描画を開始できません</h2>
            <p className="mt-4 text-sm leading-7 text-steel-300">{error}</p>
            <button className="btn btn-gold mt-6 px-6 py-3" onClick={() => window.location.reload()}>再読み込み</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Custom mode unlocks everything; story follows cleared count. */
function useMemoUnits(cleared: number, story: boolean): Set<UnitKind> {
  const ref = useRef<Set<UnitKind> | null>(null);
  const next = story ? new Set(unlockedThrough(cleared)) : new Set(Object.keys(DEFS) as UnitKind[]);
  if (!ref.current || ref.current.size !== next.size || ![...next].every(k => ref.current!.has(k))) ref.current = next;
  return ref.current;
}
