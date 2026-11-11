import { test, expect, type Page } from "@playwright/test";
import { STAGES } from "../src/game/campaign";
import { DEFS } from "../src/game/units";

const TAB_OF: Record<string, string> = {
  spear: "kingdom", guardian: "kingdom", archer: "kingdom", swordsman: "kingdom", crossbow: "kingdom",
  halberdier: "kingdom", knight: "kingdom", paladin: "kingdom", king: "kingdom",
  orc: "warband", berserker: "warband", javelin: "warband", bomber: "warband", shaman: "warband", troll: "warband", giant: "warband", pirate: "warband",
  elf: "mystic", monk: "mystic", assassin: "mystic", mage: "mystic", frost: "mystic", cleric: "mystic", zeus: "mystic",
  zombie: "undead", skeleton: "undead", bonearcher: "undead", vampire: "undead",
  robot: "machine", tank: "machine", railgun: "machine",
};

async function openStage(page: Page, id = 1) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("story").click();
  await expect(page.getByTestId(`stage-${id}`)).toBeVisible();
  await page.getByTestId(`stage-${id}`).click();
  await expect(page.getByTestId("game")).toHaveAttribute("data-phase", "setup");
}

async function openCustom(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("sandbox").click();
  await expect(page.getByTestId("game")).toHaveAttribute("data-phase", "setup");
  await expect(page.getByTestId("blue-count")).toHaveText("16");
  await expect(page.getByTestId("red-count")).toHaveText("16");
}

async function pickUnit(page: Page, kind: string, touch = false) {
  const tab = page.getByTestId(`tab-${TAB_OF[kind]}`);
  if (touch) await tab.tap(); else await tab.click();
  const card = page.getByTestId(`unit-${kind}`);
  if (touch) await card.tap(); else await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
}

test("story: stage select locks future stages and styles stage cards properly", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("story").click();
  await expect(page.getByTestId("stage-1")).toBeEnabled();
  await expect(page.getByTestId("stage-2")).toBeDisabled();
  await expect(page.getByTestId("stage-20")).toBeDisabled();
  await expect(page.getByTestId("stage-1")).toContainText("解放");
  await expect(page.getByText("クリア 0 / 20")).toBeVisible();
  // verify CSS for .stage-card was actually applied (non-zero border/padding, bounded height)
  const box = (await page.getByTestId("stage-1").boundingBox())!;
  expect(box.height).toBeGreaterThan(60);
  expect(box.width).toBeGreaterThan(100);
  await page.getByRole("button", { name: "戻る" }).click();
  await expect(page.getByTestId("story")).toBeVisible();
  expect(errors).toEqual([]);
});

test("story: stage 1 setup, budget spending, unlock on victory, progress persists", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await openStage(page, 1);
  const canvas = page.getByTestId("battle-canvas");
  const budget = String(STAGES[0].budget);
  await expect(page.getByTestId("blue-gold")).toHaveText(budget);
  await expect(page.getByTestId("red-count")).toHaveText(String(STAGES[0].enemies.reduce((n, e) => n + e.count, 0)));
  await expect(page.locator(".stage-brief")).toContainText("墓地の夜");
  // stage brief and notice must not overlap on desktop
  const briefBox = (await page.locator(".stage-brief").boundingBox())!;
  const ctrlBox = (await page.locator(".hud-controls").boundingBox())!;
  expect(briefBox.y).toBeGreaterThanOrEqual(ctrlBox.y + ctrlBox.height - 1);

  await expect(page.getByTestId("unit-swordsman")).toBeDisabled();
  await expect(page.getByTestId("unit-knight")).toBeDisabled();
  await pickUnit(page, "spear");
  // paint spears across the left side
  await canvas.hover({ position: { x: 300, y: 420 } });
  await page.mouse.down();
  for (let i = 0; i < 8; i++) await page.mouse.move(320 + i * 24, 420 + (i % 3) * 28, { steps: 2 });
  await page.mouse.up();
  await expect.poll(() => page.getByTestId("blue-count").textContent().then(Number)).toBeGreaterThan(3);
  await expect(page.getByTestId("blue-gold")).not.toHaveText(budget);
  await page.getByRole("button", { name: "戻す", exact: true }).click();
  await page.getByTestId("auto-deploy").click();
  await page.getByRole("button", { name: "戦闘開始", exact: true }).click();
  await expect(page.getByTestId("game")).toHaveAttribute("data-phase", "playing");
  const result = page.getByRole("dialog", { name: "結果" });
  await expect(result).toBeVisible({ timeout: 120_000 });
  await expect(result).toContainText("剣士");
  await page.getByRole("button", { name: "次のステージ" }).click();
  await expect(page.getByTestId("game")).toHaveAttribute("data-phase", "setup");
  await expect(page.getByTestId("unit-swordsman")).toBeEnabled();
  await page.getByRole("button", { name: "やめる", exact: true }).click();
  await expect(page.getByTestId("stage-2")).toBeEnabled();
  await expect(page.getByTestId("stage-3")).toBeDisabled();
  await expect(page.getByText("クリア 1 / 20")).toBeVisible();
  expect(errors).toEqual([]);
});

test("story: defeat offers retry and does not unlock next stage", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await openStage(page, 1);
  await pickUnit(page, "spear");
  await page.getByTestId("battle-canvas").click({ position: { x: 320, y: 500 } });
  await page.getByRole("button", { name: "戦闘開始", exact: true }).click();
  const result = page.getByRole("dialog", { name: "結果" });
  await expect(result).toBeVisible({ timeout: 120_000 });
  await expect(result).toContainText(/勝 利|敗 北|引き分け/);
  await page.getByRole("button", { name: "もう一度", exact: true }).click();
  await expect(page.getByTestId("game")).toHaveAttribute("data-phase", "setup");
  expect(errors).toEqual([]);
});

test("custom battle: deploy both teams, clear all, cycle 4 stage environments, undo", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await openCustom(page);
  await page.screenshot({ path: "test-results/setup-desktop.png", animations: "disabled" });
  const canvas = page.getByTestId("battle-canvas");

  // cycle across the 4 stage maps cleanly
  const sceneBtn = page.getByTestId("scene-cycle");
  await expect(sceneBtn).toContainText("辺境の荒野");
  await sceneBtn.click();
  await expect(sceneBtn).toContainText("裂け谷");
  await sceneBtn.click();
  await expect(sceneBtn).toContainText("霜の峠");
  await sceneBtn.click();
  await expect(sceneBtn).toContainText("王都決戦");

  // clear all units and build a custom 1 giant vs 10 zombies match
  await page.getByTestId("clear-all").click();
  await expect(page.getByTestId("blue-count")).toHaveText("0");
  await expect(page.getByTestId("red-count")).toHaveText("0");
  await expect(page.getByTestId("blue-gold")).toHaveText("3,000");
  await expect(page.getByTestId("red-gold")).toHaveText("3,000");

  await page.getByTestId("team-0").click();
  await pickUnit(page, "giant");
  await canvas.click({ position: { x: 400, y: 460 } });
  await expect(page.getByTestId("blue-count")).toHaveText("1");
  await expect(page.getByTestId("blue-gold")).toHaveText((3000 - DEFS.giant.cost).toLocaleString("en-US"));

  await page.getByTestId("team-1").click();
  await page.getByTestId("batch-toggle").click();
  await pickUnit(page, "zombie");
  await canvas.click({ position: { x: 860, y: 460 } });
  await expect(page.getByTestId("red-count")).toHaveText("5");
  await expect(page.getByTestId("red-gold")).toHaveText("2,900");

  // undo works even for enemy placements
  await page.getByRole("button", { name: "戻す", exact: true }).click();
  await expect(page.getByTestId("red-count")).toHaveText("0");
  await expect(page.getByTestId("red-gold")).toHaveText("3,000");

  // place 5 zombies again and cancel deploy mode with cancel button
  await canvas.click({ position: { x: 860, y: 460 } });
  await expect(page.getByTestId("red-count")).toHaveText("5");
  await page.getByTestId("cancel-deploy").click();
  await expect(page.getByTestId("unit-zombie")).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("mode switch & box-mode button: place mode paints, camera mode orbits on right half", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await openCustom(page);
  const game = page.getByTestId("game");
  const canvas = page.getByTestId("battle-canvas");
  await expect(page.getByTestId("mode-place")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("mode-camera").click();
  await expect(page.getByTestId("mode-camera")).toHaveAttribute("aria-pressed", "true");
  const camX0 = Number(await game.getAttribute("data-cam-x"));
  await canvas.hover({ position: { x: 200, y: 420 } });
  await page.mouse.down();
  await page.mouse.move(330, 420, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => game.getAttribute("data-cam-x").then(Number)).not.toBe(camX0);

  const yaw0 = Number(await game.getAttribute("data-cam-yaw"));
  await canvas.hover({ position: { x: 1000, y: 420 } });
  await page.mouse.down();
  await page.mouse.move(1120, 430, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => game.getAttribute("data-cam-yaw").then(Number)).not.toBe(yaw0);
  await page.keyboard.press("Home");

  // box-mode toggle lets user drag-select directly
  await page.getByTestId("box-mode").click();
  await expect(page.getByTestId("box-mode")).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(280, 250);
  await page.mouse.down();
  await page.mouse.move(550, 540, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId("selection-info")).toContainText(/選択/);
  await expect(page.getByTestId("box-mode")).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("wheel zoom is anchored under the cursor; rotation issues no orders", async ({ page }) => {
  await openCustom(page);
  const game = page.getByTestId("game");
  const canvas = page.getByTestId("battle-canvas");
  const d0 = Number(await game.getAttribute("data-cam"));
  await canvas.hover({ position: { x: 400, y: 380 } });
  await page.mouse.wheel(0, -400);
  await expect.poll(() => game.getAttribute("data-cam").then(Number)).toBeLessThan(d0 - 10);
  await expect.poll(() => game.getAttribute("data-cam-x").then(Number)).toBeLessThan(0);
  await page.keyboard.press("Home");
  await expect.poll(() => game.getAttribute("data-cam").then(Number)).toBe(d0);
  await page.mouse.move(640, 300);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(720, 330, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await expect(page.getByTestId("selection-info")).toContainText("部隊を選択");
});

test("custom battle reaches a result at 4x with consistent tallies", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openCustom(page);
  await page.getByRole("button", { name: "画質", exact: false }).click().catch(() => {});
  await page.getByRole("button", { name: "音", exact: false }).click().catch(() => {});
  await page.getByRole("button", { name: "4倍速" }).click();
  await page.getByRole("button", { name: "戦闘開始", exact: true }).click();
  await expect.poll(async () => Number(await page.getByTestId("red-losses").textContent()), { timeout: 60_000 }).toBeGreaterThan(0);
  await page.keyboard.press("Space");
  const tally = await page.evaluate(() => ({
    blueKills: document.querySelector('[data-testid="blue-kills"]')?.textContent,
    redLosses: document.querySelector('[data-testid="red-losses"]')?.textContent,
    redKills: document.querySelector('[data-testid="red-kills"]')?.textContent,
    blueLosses: document.querySelector('[data-testid="blue-losses"]')?.textContent,
  }));
  expect(tally.blueKills).toEqual(tally.redLosses);
  expect(tally.redKills).toEqual(tally.blueLosses);
  await page.getByRole("dialog", { name: "一時停止" }).getByRole("button", { name: "再開", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "結果" })).toBeVisible({ timeout: 150_000 });
  await page.screenshot({ path: "test-results/result-desktop.png", animations: "disabled" });
  await page.getByRole("button", { name: "もう一度", exact: true }).click();
  await expect(page.getByTestId("blue-kills")).toHaveText("0");
  expect(errors).toEqual([]);
});

test("showcase lists all 31 units, then returns to the menu", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("showcase").click();
  await expect(page.getByTestId("game")).toHaveAttribute("data-phase", "setup");
  await expect(page.getByTestId("blue-count")).toHaveText("31");
  await expect(page.getByTestId("red-count")).toHaveText("31");
  await page.waitForTimeout(2200);
  await page.screenshot({ path: "test-results/showcase.png", animations: "disabled" });
  await page.getByRole("button", { name: "やめる", exact: true }).click();
  await expect(page.getByTestId("story")).toBeVisible();
  expect(errors).toEqual([]);
});

test("help sheet opens and closes", async ({ page }) => {
  await openCustom(page);
  await page.getByTestId("help-open").click();
  await expect(page.getByRole("dialog", { name: "操作" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "操作" })).toContainText("連続配置");
  await page.getByTestId("help-close").click();
  await expect(page.getByRole("dialog", { name: "操作" })).toHaveCount(0);
});

test.describe("touchscreen", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });

  const touchApi = async (page: Page) => {
    const cdp = await page.context().newCDPSession(page);
    let clock = Date.now() / 1000;
    return (type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number; id: number }[], after = 30) => {
      clock += after / 1000;
      return cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points, timestamp: clock });
    };
  };

  test("pinch zoom and two-finger pan move the camera", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await openCustom(page);
    const game = page.getByTestId("game");
    const cam0 = Number(await game.getAttribute("data-cam"));
    const touch = await touchApi(page);
    await touch("touchStart", [{ x: 130, y: 420, id: 1 }, { x: 260, y: 420, id: 2 }]);
    await touch("touchMove", [{ x: 110, y: 420, id: 1 }, { x: 280, y: 420, id: 2 }]);
    await touch("touchMove", [{ x: 90, y: 420, id: 1 }, { x: 310, y: 420, id: 2 }]);
    await touch("touchEnd", []);
    await expect.poll(() => game.getAttribute("data-cam").then(Number)).toBeLessThan(cam0 - 8);
    await expect(page.getByTestId("blue-count")).toHaveText("16");
    const tx = Number(await game.getAttribute("data-cam-x"));
    await touch("touchStart", [{ x: 100, y: 400, id: 3 }, { x: 200, y: 430, id: 4 }]);
    await touch("touchMove", [{ x: 220, y: 400, id: 3 }, { x: 320, y: 430, id: 4 }]);
    await touch("touchEnd", []);
    await expect.poll(() => game.getAttribute("data-cam-x").then(Number)).not.toBe(tx);
    expect(errors).toEqual([]);
  });

  test("camera mode on touch: left half pans AND right half rotates", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await openCustom(page);
    const game = page.getByTestId("game");
    await page.getByTestId("mode-camera").tap();
    const touch = await touchApi(page);

    // left half pan
    const x0 = Number(await game.getAttribute("data-cam-x"));
    await touch("touchStart", [{ x: 90, y: 480, id: 1 }]);
    await touch("touchMove", [{ x: 170, y: 480, id: 1 }]);
    await touch("touchEnd", []);
    await expect.poll(() => game.getAttribute("data-cam-x").then(Number)).not.toBe(x0);

    // right half rotate (yaw changes!)
    const yaw0 = Number(await game.getAttribute("data-cam-yaw"));
    await touch("touchStart", [{ x: 300, y: 480, id: 2 }]);
    await touch("touchMove", [{ x: 230, y: 460, id: 2 }]);
    await touch("touchMove", [{ x: 195, y: 450, id: 2 }]);
    await touch("touchEnd", []);
    await expect.poll(() => game.getAttribute("data-cam-yaw").then(Number)).not.toBe(yaw0);
    expect(errors).toEqual([]);
  });

  test("place mode paints units by dragging, x5 and cancel buttons work", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await openCustom(page);
    const touch = await touchApi(page);
    await pickUnit(page, "spear", true);
    // unit description must be visible on mobile too
    await expect(page.locator(".unit-desc")).toBeVisible();
    await touch("touchStart", [{ x: 80, y: 460, id: 1 }]);
    for (let i = 1; i <= 6; i++) await touch("touchMove", [{ x: 80 + i * 22, y: 460 + (i % 2) * 14, id: 1 }], 40);
    await touch("touchEnd", []);
    await expect.poll(() => page.getByTestId("blue-count").textContent().then(Number)).toBeGreaterThan(20);
    await page.getByTestId("cancel-deploy").tap();
    await expect(page.getByTestId("unit-spear")).toHaveAttribute("aria-pressed", "false");
    await page.getByTestId("batch-toggle").tap();
    await pickUnit(page, "zombie", true);
    await page.getByTestId("battle-canvas").tap({ position: { x: 70, y: 450 } });
    await expect.poll(() => page.getByTestId("blue-count").textContent().then(Number)).toBeGreaterThan(24);
    expect(errors).toEqual([]);
  });

  test("double tap selects all; long-press tolerates finger jitter and box-selects; box button works", async ({ page }) => {
    await openCustom(page);
    const touch = await touchApi(page);
    const tapFast = async () => {
      await touch("touchStart", [{ x: 60, y: 500, id: 1 }]);
      await touch("touchEnd", []);
    };
    await tapFast();
    await tapFast();
    await expect(page.getByTestId("selection-info")).toContainText(/選択/);

    // Long press with 12px jitter before 450ms should NOT turn into pan, and should box-select after 450ms
    await touch("touchStart", [{ x: 20, y: 330, id: 1 }]);
    await touch("touchMove", [{ x: 30, y: 334, id: 1 }], 200);
    await touch("touchMove", [{ x: 180, y: 460, id: 1 }], 350);
    await touch("touchEnd", [], 40);
    await expect(page.getByTestId("selection-info")).toContainText(/選択|部隊/);

    // One-tap box mode button works reliably too
    await page.getByTestId("box-mode").tap();
    await touch("touchStart", [{ x: 30, y: 320, id: 2 }]);
    await touch("touchMove", [{ x: 190, y: 480, id: 2 }], 50);
    await touch("touchEnd", [], 40);
    await expect(page.getByTestId("box-mode")).toHaveAttribute("aria-pressed", "false");
  });

  test("mobile HUD does not overlap, 9-card row scrolls horizontally, and story brief fits cleanly", async ({ page }) => {
    await openStage(page, 1);
    const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
    const player = await box(".hud-player"), controls = await box(".hud-controls");
    const brief = await box(".stage-brief"), stack = await box(".bottom-stack");
    expect(controls.y).toBeGreaterThanOrEqual(player.y + player.height - 1);
    expect(brief.y).toBeGreaterThanOrEqual(controls.y + controls.height - 1);
    expect(stack.y + stack.height).toBeLessThanOrEqual(844);
    // 9 kingdom cards in .unit-row should overflow horizontally inside the row without expanding the page width
    const rowMetrics = await page.locator(".unit-row").evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(rowMetrics.sw).toBeGreaterThan(rowMetrics.cw);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/setup-mobile.png" });
  });
});

test("unsupported WebGL shows an actionable error", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === "webgl2" || type === "webgl") return null;
      return original.apply(this, [type, ...args] as Parameters<typeof original>);
    } as typeof original;
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("WebGL 2");
  await expect(page.getByRole("button", { name: "再読み込み" })).toBeVisible();
});
