import { useEffect, useRef, useState } from "react";
import { Game, HudState } from "./game/Game";
import { HUD } from "./ui/HUD";
import { WEAPON_LIST, WeaponId } from "./game/data/weapons";
import { TEAM_COLORS } from "./game/data/tuning";

type Screen = "BOOT" | "MENU" | "WEAPON" | "GAME";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [screen, setScreen] = useState<Screen>("BOOT");
  const [hud, setHud] = useState<HudState | null>(null);
  const [weapon, setWeapon] = useState<WeaponId>("splattershot");
  const [error, setError] = useState<string | null>(null);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !overlayRef.current || gameRef.current) return;
    try {
      const g = new Game(canvasRef.current, overlayRef.current);
      gameRef.current = g;
      (window as any).__game = g;
      setHud({ ...g.hud });
      setScreen("MENU");
    } catch (e) {
      console.error(e); setError(String(e));
    }
    const chk = () => setPortrait(window.innerHeight > window.innerWidth && window.innerWidth < 900);
    chk(); window.addEventListener("resize", chk);
    return () => window.removeEventListener("resize", chk);
  }, []);

  useEffect(() => {
    const id = setInterval(() => { const g = gameRef.current; if (g) setHud({ ...g.hud, teamAlive: g.hud.teamAlive.map((a) => [...a]), killfeed: [...g.hud.killfeed] }); }, 66);
    return () => clearInterval(id);
  }, []);

  const start = (w: WeaponId) => {
    const g = gameRef.current; if (!g) return;
    setWeapon(w); g.startMatch(w); setScreen("GAME");
    const el = document.documentElement as any;
    if (navigator.maxTouchPoints > 0) {
      try { el.requestFullscreen?.()?.catch?.(() => {}); } catch { /* not supported (iOS Safari) */ }
      try { (window.screen as any).orientation?.lock?.("landscape")?.catch?.(() => {}); } catch { /* not supported */ }
    }
  };

  return (
    <div className="relative w-full h-full bg-[#121216] overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div ref={overlayRef} className="absolute inset-0" style={{ touchAction: "none" }} />
      {error && <div className="absolute inset-0 flex items-center justify-center text-white p-6 text-center">WebGL2 is required. {error}</div>}
      {screen === "BOOT" && !error && <div className="absolute inset-0 flex items-center justify-center text-white font-display text-2xl anim-pulse">LOADING INK…</div>}
      {screen === "MENU" && <MainMenu onPlay={() => setScreen("WEAPON")} />}
      {screen === "WEAPON" && <WeaponSelect selected={weapon} onSelect={setWeapon} onStart={() => start(weapon)} onBack={() => setScreen("MENU")} />}
      {screen === "GAME" && hud && gameRef.current && <HUD game={gameRef.current} hud={hud} onRestart={() => setScreen("WEAPON")} />}
      {portrait && screen !== "BOOT" && (
        <div className="absolute inset-0 z-50 bg-[#121216] ink-bg flex flex-col items-center justify-center text-white text-center p-8">
          <div className="text-6xl anim-wobble">📱↻</div>
          <div className="font-display text-2xl mt-4">ROTATE TO LANDSCAPE</div>
          <div className="text-white/60 text-sm mt-2">横持ちでプレイしてください</div>
        </div>
      )}
    </div>
  );
}

function MainMenu({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="absolute inset-0 ink-bg flex items-center pointer-events-auto" style={{ paddingLeft: "max(6vw, var(--safe-l))" }}>
      <div className="absolute -right-24 -top-24 w-[46vw] h-[46vw] blob" style={{ background: TEAM_COLORS[0].css, opacity: 0.9, transform: "rotate(12deg)" }} />
      <div className="absolute -right-10 bottom-[-30%] w-[36vw] h-[36vw] blob2" style={{ background: TEAM_COLORS[1].css, opacity: 0.9 }} />
      <div className="relative">
        <div className="font-display text-white text-sm tracking-[0.3em] mb-1">TURF WAR · 4 vs 4 · 3:00</div>
        <h1 className="font-display text-white text-6xl md:text-8xl leading-[0.9] stroke-w" style={{ textShadow: `8px 8px 0 ${TEAM_COLORS[1].css}` }}>INK<br />GORGE</h1>
        <div className="text-white/70 text-xs md:text-sm mt-3 max-w-sm">Splatoon 3 study build · Scorch Gorge · Splattershot / Splat Roller / Splat Charger · 7 bots · runs on your phone.</div>
        <button onClick={onPlay} className="tbtn mt-6 font-display text-2xl px-10 py-4 skew bg-white text-black border-4 border-black" style={{ boxShadow: `8px 8px 0 ${TEAM_COLORS[0].css}` }}>
          <span className="unskew inline-block">BATTLE!</span>
        </button>
        <div className="text-white/40 text-[10px] mt-6">Fan-made technical study. Not affiliated with Nintendo. All models, textures and code are original.</div>
      </div>
    </div>
  );
}

function WeaponSelect({ selected, onSelect, onStart, onBack }: { selected: WeaponId; onSelect: (w: WeaponId) => void; onStart: () => void; onBack: () => void }) {
  const desc: Record<WeaponId, string> = {
    splattershot: "Balanced shooter. 6f fire rate · 36 dmg · 3-shot splat. Paints while you fight.",
    splat_roller: "Tap for a horizontal flick (150 dmg up close), hold to roll and paint a wide strip. Vertical flick in the air.",
    splat_charger: "Hold to charge (60f full). Full charge 160 dmg pierces. Stores charge when you dive into ink.",
  };
  return (
    <div className="absolute inset-0 bg-[#121216] ink-bg flex flex-col pointer-events-auto" style={{ padding: "max(12px, var(--safe-t)) max(16px, var(--safe-r)) max(12px, var(--safe-b)) max(16px, var(--safe-l))" }}>
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="tbtn font-display text-white text-sm">← BACK</button>
        <div className="font-display text-white text-xl skew bg-black px-3 py-1" style={{ boxShadow: `4px 4px 0 ${TEAM_COLORS[0].css}` }}>CHOOSE YOUR WEAPON</div>
        <div className="w-16" />
      </div>
      <div className="flex-1 grid grid-cols-3 gap-3 mt-3 min-h-0">
        {WEAPON_LIST.map((w, i) => {
          const sel = w.id === selected;
          return (
            <button key={w.id} onClick={() => onSelect(w.id)} className={`tbtn relative text-left p-3 border-4 overflow-hidden ${sel ? "border-white bg-white text-black" : "border-black/60 bg-black/50 text-white"}`} style={{ transform: `rotate(${(i - 1) * 1.2}deg)` }}>
              <div className="absolute -right-6 -bottom-6 w-28 h-28 blob" style={{ background: sel ? TEAM_COLORS[0].css : "#2a2a2e" }} />
              <div className="relative">
                <div className="font-display text-lg md:text-2xl leading-tight">{w.name.toUpperCase()}</div>
                <div className="text-[11px] opacity-70">{w.nameJa}</div>
                <div className="text-[11px] md:text-xs mt-2 leading-snug">{desc[w.id]}</div>
                <div className="mt-2 flex gap-1 text-[9px] font-bold">
                  <Bar label="RANGE" v={w.range / 15} /><Bar label="DMG" v={w.damage.base / 160} /><Bar label="SPEED" v={w.kind === "shooter" ? 0.75 : w.kind === "roller" ? 0.55 : 0.35} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end mt-3">
        <button onClick={onStart} className="tbtn font-display text-2xl px-10 py-3 skew text-black border-4 border-black" style={{ background: TEAM_COLORS[0].css, boxShadow: "6px 6px 0 #fff" }}><span className="unskew inline-block">READY!</span></button>
      </div>
    </div>
  );
}
function Bar({ label, v }: { label: string; v: number }) {
  return <div className="flex-1"><div>{label}</div><div className="h-1.5 bg-black/30"><div className="h-full bg-current" style={{ width: `${Math.min(100, v * 100)}%` }} /></div></div>;
}
