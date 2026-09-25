import { useEffect, useRef, useState } from "react";
import { Game, HudState } from "../game/Game";
import { WEAPONS } from "../game/data/weapons";
import { TEAM_COLORS } from "../game/data/tuning";

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.ceil(t % 60) % 60).padStart(2, "0")}`;

export function HUD({ game, hud, onRestart }: { game: Game; hud: HudState; onRestart: () => void }) {
  const my = hud.myTeam, en = 1 - my;
  const myC = TEAM_COLORS[my].css, enC = TEAM_COLORS[en].css;
  const w = WEAPONS[hud.weapon];
  const [debug, setDebug] = useState(false);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.code === "F3" || e.code === "Backquote") { e.preventDefault(); setDebug((d) => !d); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);
  const battle = hud.phase === "BATTLE";
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ paddingTop: "var(--safe-t)", paddingLeft: "var(--safe-l)", paddingRight: "var(--safe-r)", paddingBottom: "var(--safe-b)" }}>
      {/* damage vignette + enemy ink */}
      <div className="absolute inset-0 transition-opacity" style={{ opacity: hud.damageFlash * 0.85, background: `radial-gradient(ellipse at center, transparent 45%, ${enC}cc 100%)` }} />
      {hud.enemyInkWarning && battle && <div className="absolute inset-0 anim-pulse" style={{ background: `radial-gradient(ellipse at center, transparent 60%, ${enC}66 100%)` }} />}
      {hud.flowAura && <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 60px ${myC}` }} />}

      {/* top: timer + team status */}
      <div className="absolute top-2 left-0 right-0 flex items-start justify-center gap-3 select-none">
        <TeamPips alive={hud.teamAlive[my]} respawn={hud.teamRespawn[my]} color={myC} side="left" />
        <div className={`font-display text-3xl md:text-4xl px-4 py-1 skew ${hud.finalMinute ? "anim-pulse" : ""}`} style={{ background: "#121216", color: hud.finalMinute ? "#ff5e3a" : "#fff", boxShadow: `4px 4px 0 ${myC}` }}>
          <span className="unskew inline-block tabular-nums">{fmt(hud.timeLeft)}</span>
        </div>
        <TeamPips alive={hud.teamAlive[en]} respawn={hud.teamRespawn[en]} color={enC} side="right" />
      </div>

      {/* reticle */}
      {battle && hud.alive && (
        <div className="absolute left-1/2 top-1/2" style={{ transform: "translate(-50%,-50%)" }}>
          <div className={`reticle relative ${hud.hitConfirm > 0 ? "scale-125" : ""}`} style={{ borderColor: hud.hitConfirm > 0 ? myC : undefined, transition: "transform 80ms" }} />
          {w.kind === "charger" && (hud.charging || hud.storedCharge > 0) && (
            <div className="absolute left-1/2 -translate-x-1/2 top-11 w-28 h-2.5 bg-black/70 rounded-sm overflow-hidden skew">
              <div className="h-full" style={{ width: `${(hud.charging ? hud.charge : hud.storedCharge) * 100}%`, background: hud.charge >= 1 ? "#fff" : myC }} />
            </div>
          )}
        </div>
      )}

      {/* ink tank (right-bottom, next to fire button) */}
      <div className="absolute" style={{ right: "calc(var(--safe-r) + 148px)", bottom: "calc(var(--safe-b) + 36px)" }}>
        <div className="w-7 h-28 rounded-full bg-black/70 border-2 border-black overflow-hidden relative">
          <div className="absolute bottom-0 left-0 right-0 transition-all" style={{ height: `${hud.ink}%`, background: hud.lowInk ? `repeating-linear-gradient(45deg, ${myC}, ${myC} 4px, #111 4px, #111 8px)` : myC }} />
        </div>
      </div>

      {/* weapon + state label (left-bottom above stick) */}
      <div className="absolute left-3 font-display text-white text-xs md:text-sm skew" style={{ bottom: "calc(var(--safe-b) + 172px)" }}>
        <div className="bg-black/70 px-2 py-0.5 inline-block" style={{ borderLeft: `6px solid ${myC}` }}>{w.name.toUpperCase()}</div>
        {w.kind === "roller" && hud.rollerPhase !== "idle" && <div className="mt-1 px-2 py-0.5 inline-block bg-white text-black">{hud.rollerPhase.replace("_", " ").toUpperCase()}</div>}
      </div>

      {/* health indication (Ver 11: small marker appears when damaged) */}
      {battle && hud.health < 99 && hud.alive && (
        <div className="absolute left-1/2 -translate-x-1/2 top-[60%] w-24 h-1.5 bg-black/60 skew">
          <div className="h-full" style={{ width: `${hud.health}%`, background: hud.health < 35 ? "#ff5e3a" : "#fff" }} />
        </div>
      )}

      {/* score meter (bottom center) */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2" style={{ bottom: "calc(var(--safe-b) + 8px)" }}>
        <span className="font-display text-sm" style={{ color: myC }}>{(hud.score[my] * 100).toFixed(0)}%</span>
        <div className="w-40 h-2.5 bg-black/70 skew overflow-hidden flex">
          <div style={{ width: `${hud.score[my] * 100}%`, background: myC }} />
          <div className="flex-1" />
          <div style={{ width: `${hud.score[en] * 100}%`, background: enC }} />
        </div>
        <span className="font-display text-sm" style={{ color: enC }}>{(hud.score[en] * 100).toFixed(0)}%</span>
      </div>

      {/* killfeed */}
      <div className="absolute right-3 top-14 flex flex-col items-end gap-1">
        {hud.killfeed.map((k, i) => (
          <div key={k.text + i} className="anim-slidein font-bold text-[11px] md:text-xs text-white bg-black/70 px-2 py-0.5 skew" style={{ borderRight: `5px solid ${TEAM_COLORS[k.team].css}` }}>{k.text}</div>
        ))}
      </div>

      {/* center messages */}
      {hud.phase === "INTRO" && (
        <Center>
          <div className="font-display text-white text-2xl mb-2 stroke">TURF WAR — SCORCH GORGE</div>
          <div key={hud.introCount} className="font-display text-8xl anim-pop stroke-w" style={{ color: myC }}>{hud.introCount > 0 ? hud.introCount : "GO!"}</div>
          <div className="text-white/80 text-sm mt-3">Ink the most turf in 3 minutes. Swim in your ink to move fast & refill.</div>
        </Center>
      )}
      {hud.message && battle && <Center><div className="font-display text-5xl md:text-6xl anim-pop stroke-w text-white">{hud.message}</div></Center>}
      {hud.phase === "TIMEUP" && <Center><div className="font-display text-7xl anim-pop stroke-w" style={{ color: "#fff" }}>GAME!</div></Center>}
      {hud.splatBanner > 0 && battle && <div className="absolute left-1/2 -translate-x-1/2 top-[32%] font-display text-2xl anim-pop stroke text-white">SPLAT!</div>}
      {battle && !hud.alive && (
        <Center>
          <div className="font-display text-4xl stroke-w" style={{ color: enC }}>SPLATTED!</div>
          <div className="font-display text-white text-xl mt-2">Respawning in {hud.respawnIn.toFixed(1)}</div>
        </Center>
      )}

      {/* result */}
      {hud.phase === "RESULT" && hud.result && (
        <div className="absolute inset-0 pointer-events-auto flex items-center justify-center bg-black/70">
          <div className="relative w-[92%] max-w-xl text-white anim-pop">
            <div className="font-display text-5xl md:text-6xl stroke-w mb-3 skew" style={{ color: hud.result.winner === my ? myC : hud.result.winner === -1 ? "#fff" : enC }}>
              {hud.result.winner === my ? "VICTORY" : hud.result.winner === -1 ? "DRAW" : "DEFEAT"}
            </div>
            <div className="flex items-center gap-3 mb-4">
              <span className="font-display text-3xl" style={{ color: myC }}>{(hud.result.score[my] * 100).toFixed(1)}%</span>
              <div className="flex-1 h-8 flex skew overflow-hidden border-2 border-black">
                <div style={{ width: `${hud.result.score[my] * 100}%`, background: myC }} />
                <div className="flex-1 bg-[#2a2a2e]" />
                <div style={{ width: `${hud.result.score[en] * 100}%`, background: enC }} />
              </div>
              <span className="font-display text-3xl" style={{ color: enC }}>{(hud.result.score[en] * 100).toFixed(1)}%</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center mb-5">
              <Stat label="TURF INKED" value={`${hud.result.painted}p`} />
              <Stat label="SPLATS" value={String(hud.result.kills)} />
              <Stat label="SPLATTED" value={String(hud.result.deaths)} />
            </div>
            <div className="flex gap-3">
              <button className="tbtn font-display text-xl px-6 py-3 skew bg-white text-black" onClick={() => game.startMatch(hud.weapon)}><span className="unskew inline-block">REMATCH</span></button>
              <button className="tbtn font-display text-xl px-6 py-3 skew border-2 border-white text-white" onClick={onRestart}><span className="unskew inline-block">CHANGE WEAPON</span></button>
            </div>
          </div>
        </div>
      )}

      {/* touch controls */}
      {(battle || hud.phase === "INTRO") && <TouchControls game={game} hud={hud} />}

      {/* debug */}
      <button className="absolute top-1 right-1 pointer-events-auto text-[10px] text-white/40 px-1" onClick={() => setDebug((d) => !d)}>dbg</button>
      {debug && <DebugPanel hud={hud} game={game} />}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">{children}</div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bg-black/60 py-2 skew"><div className="unskew"><div className="font-display text-2xl">{value}</div><div className="text-[10px] tracking-widest text-white/60">{label}</div></div></div>;
}
function TeamPips({ alive, respawn, color, side }: { alive: boolean[]; respawn: number[]; color: string; side: "left" | "right" }) {
  return (
    <div className={`flex gap-1 mt-2 ${side === "right" ? "flex-row-reverse" : ""}`}>
      {alive.map((a, i) => (
        <div key={i} className="w-7 h-7 blob border-2 border-black flex items-center justify-center text-[10px] font-bold" style={{ background: a ? color : "#333", color: "#000", opacity: a ? 1 : 0.7 }}>{!a && respawn[i] > 0 ? Math.ceil(respawn[i]) : ""}</div>
      ))}
    </div>
  );
}

function TouchControls({ game, hud }: { game: Game; hud: HudState }) {
  const isTouch = game.input.isTouch || navigator.maxTouchPoints > 0;
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((x) => x + 1), 50); return () => clearInterval(id); }, []);
  if (!isTouch) return <div className="absolute left-3 bottom-8 text-white/50 text-[11px] leading-tight">WASD move · Mouse aim (click to lock) · LMB fire · Shift swim · Space jump · Q/RMB vertical flick · ` debug</div>;
  const w = WEAPONS[hud.weapon];
  const inp = game.input;
  const stick = inp.stickActive;
  return (
    <>
      {/* floating stick visual */}
      <div className="absolute rounded-full border-2 border-white/40" style={{ width: 112, height: 112, left: (stick ? inp.stickOrigin.x : 90) - 56, top: (stick ? inp.stickOrigin.y : window.innerHeight - 110) - 56, opacity: stick ? 0.9 : 0.35 }}>
        <div className="absolute rounded-full bg-white/80" style={{ width: 48, height: 48, left: 32 + (stick ? (inp.stickPos.x - inp.stickOrigin.x) : 0) * 0.9, top: 32 + (stick ? (inp.stickPos.y - inp.stickOrigin.y) : 0) * 0.9, maxWidth: 48 }} />
      </div>
      <Btn label="INK" sub={w.kind === "roller" ? "TAP flick / HOLD roll" : w.kind === "charger" ? "HOLD charge" : "HOLD"} size={124} style={{ right: 14, bottom: 26 }} color={TEAM_COLORS[hud.myTeam].css} down={inp.fire} onDown={() => inp.setButton("fire", true)} onUp={() => inp.setButton("fire", false)} />
      <Btn label="SQUID" sub="HOLD swim" size={84} style={{ right: 150, bottom: 150 }} color="#ffffff" down={inp.swim} onDown={() => inp.setButton("swim", true)} onUp={() => inp.setButton("swim", false)} />
      <Btn label="JUMP" size={72} style={{ right: 32, bottom: 168 }} color="#ffffff" down={inp.jump} onDown={() => inp.setButton("jump", true)} onUp={() => inp.setButton("jump", false)} />
      {w.kind === "roller" && <Btn label="V-FLICK" size={64} style={{ right: 118, bottom: 250 }} color="#ffb84a" down={inp.alt} onDown={() => inp.setButton("alt", true)} onUp={() => inp.setButton("alt", false)} />}
      <div className="absolute pointer-events-auto flex gap-2" style={{ left: 12, top: 44 }}>
        <button className="tbtn text-[11px] font-bold px-2 py-1 bg-black/60 text-white skew" onClick={async () => { if (inp.gyroEnabled) inp.disableGyro(); else { const ok = await inp.enableGyro(); if (!ok) game.showMessage("GYRO DENIED", 1.5); } }}>GYRO {inp.gyroEnabled ? "ON" : "OFF"}</button>
        <button className="tbtn text-[11px] font-bold px-2 py-1 bg-black/60 text-white skew" onClick={() => { game.rig.pitch = 0; }}>RECENTER</button>
      </div>
    </>
  );
}

function Btn({ label, sub, size, style, color, down, onDown, onUp }: { label: string; sub?: string; size: number; style: React.CSSProperties; color: string; down: boolean; onDown: () => void; onUp: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={`absolute pointer-events-auto tbtn blob2 flex flex-col items-center justify-center font-display border-[3px] border-black ${down ? "down" : ""}`}
      style={{ width: size, height: size, background: down ? "#fff" : color, color: "#121216", opacity: 0.92, ...style, marginRight: "var(--safe-r)", marginBottom: "var(--safe-b)" }}
      onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); onDown(); try { navigator.vibrate?.(8); } catch { /* */ } }}
      onPointerUp={(e) => { e.preventDefault(); onUp(); }} onPointerCancel={onUp} onPointerLeave={(e) => { if (e.buttons === 0) onUp(); }} onContextMenu={(e) => e.preventDefault()}>
      <span className="text-sm leading-none">{label}</span>
      {sub && <span className="text-[8px] font-sans font-bold opacity-70 mt-1 text-center px-1 leading-tight">{sub}</span>}
    </div>
  );
}

function DebugPanel({ hud, game }: { hud: HudState; game: Game }) {
  const s = hud.stats;
  const bots = game.bots.map((b) => `${b.p.name}:${b.objective}/${b.p.state}${b.p.alive ? "" : "(dead)"}`).join("  ");
  return (
    <div className="absolute left-2 top-16 pointer-events-auto bg-black/80 text-[10px] text-lime-300 font-mono p-2 leading-tight max-w-[60vw]">
      <div>FPS {s.fps.toFixed(0)} (1% low {s.low1.toFixed(0)}) frame {s.frameMs.toFixed(1)}ms sim {s.simMs.toFixed(1)} ai {s.aiMs.toFixed(2)} ink {s.inkMs.toFixed(2)} render {s.renderMs.toFixed(1)}</div>
      <div>draw {s.drawCalls} tris {s.triangles} particles {s.particles} proj {s.projectiles} stamps {s.stamps} heap {s.heapMB.toFixed(0)}MB</div>
      <div>backend {hud.backend} quality {hud.quality} scale {hud.renderScale.toFixed(2)} gyro {String(hud.gyro)}</div>
      <div>state {hud.state} squid {String(hud.squid)} ownInk {String(hud.onOwnInk)} vel {game.human.moveSpeedNow.toFixed(2)} yaw {(game.rig.yaw * 57.3).toFixed(0)} pitch {(game.rig.pitch * 57.3).toFixed(0)}</div>
      <div>hp {hud.health.toFixed(0)} ink {hud.ink.toFixed(0)} charge {hud.charge.toFixed(2)} roller {hud.rollerPhase} score {(hud.score[0] * 100).toFixed(1)}/{(hud.score[1] * 100).toFixed(1)}</div>
      <div className="whitespace-pre-wrap">{bots}</div>
      <div className="mt-1 flex gap-1">{(["LOW", "MEDIUM", "HIGH"] as const).map((q) => <button key={q} className={`px-1 border ${hud.quality === q ? "bg-lime-300 text-black" : ""}`} onClick={() => game.setQuality(q)}>{q}</button>)}
        <button className="px-1 border" onClick={() => console.table(game.benchmarkSummary())}>bench→console</button></div>
    </div>
  );
}
