import assert from 'node:assert/strict';
import path from 'node:path';

// Runs the existing menu actions against the caller's fixture API. It tests
// layout and UI state; it does not simulate gameplay or attest a real device.
export async function checkCoreMenus({ page, entry, config, engineName, evidence, show, settle, geometry, tap, audit, touchCameraReset = false }) {
  const capture = async (name, selector) => {
    entry.screens[name] = selector ? await geometry(page, selector, name) : 'display';
    if (!audit) assert(await page.locator('.iw-ss__frame, .iw-prev__stage, .iw-wd, .iw-howto__ctl, .iw-lpanel, .iw-lfoot, .iw-pmatch').evaluateAll((els) => els.every((el) => {
      const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1;
    })), `${name}: content panels must fit the viewport`);
    await page.screenshot({ path: path.join(evidence, `${engineName}-${entry.name}-${name}.png`) });
  };
  await show(page, 'loading');
  await page.evaluate(() => menus.setLoading(0.65, 'Loading the harbour'));
  await capture('loading');
  await show(page, 'title');
  await capture('title', '.iw-title__press');
  if (!audit) { await tap(page, '.iw-title__presstext'); await page.waitForFunction(() => menus.current === 'main'); }
  await show(page, 'main');
  await capture('main', '.iw-main__menu button');
  if (!audit) {
    assert(await page.locator('.iw-btn--online').evaluate((el) => {
      const text = el.querySelector('.iw-btn__text'), live = el.querySelector('.iw-btn__live');
      // The existing ink tickets are tilted; compare local layout coordinates.
      return text.offsetTop + text.offsetHeight <= live.offsetTop + 1 || text.offsetLeft + text.offsetWidth <= live.offsetLeft + 1;
    }), 'online description and live badge must have separate space');
    await tap(page, '.iw-main__menu [data-id="settings"]');
    await page.waitForFunction(() => menus.current === 'settings');
  }
  await show(page, 'settings');
  await capture('settings', '.iw-settings .iw-tab, .iw-settings .iw-row, .iw-settings .iw-seg__opt, .iw-settings .iw-toggle, .iw-settings__foot button, .iw-settings .iw-backbtn');
  if (!audit) {
    const scale = page.locator('[data-id="set-touchScale"] .iw-slider__track');
    await scale.scrollIntoViewIfNeeded();
    const box = await scale.boundingBox();
    const before = await page.evaluate(() => menuState().settings.touchScale);
    await page.touchscreen.tap(box.x + box.width * 0.9, box.y + box.height / 2);
    assert.notEqual(await page.evaluate(() => menuState().settings.touchScale), before, 'touch slider changes the existing setting');
    for (const tab of ['controls', 'video', 'audio', 'gameplay']) {
      const button = page.locator(`.iw-settings [data-id="tab-${tab}"]`);
      assert.equal(await button.count(), 1, `settings tab ${tab} must exist`);
      await tap(page, `.iw-settings [data-id="tab-${tab}"]`);
      entry.screens['settings-' + tab] = await geometry(page, '.iw-settings .iw-tab, .iw-settings .iw-row, .iw-settings .iw-seg__opt, .iw-settings .iw-toggle', 'settings-' + tab);
    }
    await tap(page, '.iw-settings [data-id="reset"]');
    assert(await page.locator('.iw-settings [data-id="reset"]').evaluate((el) => el.classList.contains('is-armed')));
    await tap(page, '.iw-settings [data-id="reset"]');
    assert.equal(await page.evaluate(() => menuState().settings.touchScale), 1, 'confirmed reset uses the existing defaults');
    await tap(page, '.iw-settings .iw-backbtn');
  }
  await show(page, 'setup');
  await capture('setup', '.iw-ticket, .iw-ticket__time, .iw-daytgl__opt, .iw-ss__match .iw-seg__opt, .iw-ss__foot button, .iw-setup .iw-backbtn');
  if (!audit) {
    for (let i = 0; i < await page.locator('.iw-ticket').count(); i++) {
      const candidate = page.locator('.iw-ticket').nth(i);
      const id = await candidate.evaluate((el) => el._mid);
      await candidate.scrollIntoViewIfNeeded(); await candidate.tap();
      assert.equal(await page.evaluate(() => menus._setup.mapId), id, 'every stage remains reachable');
      await settle(page);
      assert(await page.locator('.iw-ss__name').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'every stage caption must fit its ink ticket');
      assert(await page.locator('.iw-ss__caption').evaluate((el) => el.getBoundingClientRect().bottom <= el.parentElement.querySelector('.iw-ss__time').getBoundingClientRect().top + 1), 'time controls must not cover the stage name and description');
    }
    const ticket = page.locator('.iw-ticket').nth(1);
    const stage = await ticket.evaluate((el) => el._mid);
    await ticket.scrollIntoViewIfNeeded(); await ticket.tap();
    assert.equal(await page.evaluate(() => menus._setup.mapId), stage);
    await tap(page, '.iw-daytgl__opt.is-dusk');
    assert.equal(await page.evaluate(() => menus._setup.times[menus._setup.mapId]), 'dusk');
    await tap(page, '.iw-ss__foot [data-id="weapon"]');
    await page.waitForFunction(() => menus.current === 'loadout');
  }
  await show(page, 'loadout');
  await capture('loadout', '.iw-loadout .iw-wcard, .iw-loadout__look button, .iw-loadout .iw-backbtn');
  if (!audit) {
    const card = page.locator('.iw-loadout .iw-wcard').last();
    const weapon = await card.evaluate((el) => el._wid);
    await card.scrollIntoViewIfNeeded(); await card.tap();
    assert.equal(await page.evaluate(() => menuState().loadout.weapon), weapon);
    assert(await card.evaluate((el) => el.classList.contains('is-equipped')));
    await tap(page, '.iw-loadout__look button');
    await page.waitForFunction(() => menus.current === 'locker');
  }
  await show(page, 'locker');
  await capture('locker', '.iw-locker .iw-tab, .iw-locker .iw-ltile, .iw-lfoot button, .iw-locker .iw-name__input, .iw-locker .iw-backbtn');
  if (!audit) {
    assert(await page.locator('.iw-lsaved').evaluate((el) => el.getBoundingClientRect().width >= 120), 'locker save status must remain a readable line');
    for (let i = 0; i < await page.locator('.iw-locker .iw-tab').count(); i++) {
      const tab = page.locator('.iw-locker .iw-tab').nth(i);
      await tab.scrollIntoViewIfNeeded(); await tab.tap();
      entry.screens['locker-tab-' + i] = await geometry(page, '.iw-locker .iw-ltile', 'locker-tab-' + i);
      const tile = page.locator('.iw-locker .iw-ltile').last();
      await tile.scrollIntoViewIfNeeded(); await tile.tap();
      assert(await tile.evaluate((el) => el.classList.contains('is-on')));
    }
    await page.locator('.iw-locker .iw-name__input').fill('Mobile Squidkid');
    await page.locator('.iw-locker .iw-name__input').blur();
    assert.equal(await page.evaluate(() => menuState().profile.name), 'Mobile Squidkid');
  }
  await show(page, 'howto');
  await capture('howto', '.iw-howto .iw-seg__opt, .iw-howto .iw-backbtn');
  if (!audit) {
    assert.equal(await page.locator('.iw-ctl--touch .iw-ctl__row').count(), touchCameraReset ? 10 : 9);
    if (touchCameraReset) assert.match(await page.locator('.iw-ctl--touch .iw-ctl__act').last().textContent(), /Camera reset|カメラリセット/);
    await tap(page, '.iw-howto .iw-seg__opt:last-child');
    assert.equal(await page.locator('.iw-ctl--touch').count(), 0);
    await tap(page, '.iw-howto .iw-seg__opt');
    assert.equal(await page.locator('.iw-ctl--touch .iw-ctl__row').count(), touchCameraReset ? 10 : 9);
    if (touchCameraReset) assert.match(await page.locator('.iw-ctl--touch .iw-ctl__act').last().textContent(), /Camera reset|カメラリセット/);
  }
  await show(page, 'credits');
  await capture('credits', '.iw-credits .iw-backbtn');
  if (!audit) {
    const view = page.locator('.iw-cred__view');
    const scrollable = await view.evaluate((el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto');
    assert(scrollable, 'touch credits must support reading by scrolling');
    await view.evaluate((el) => { el.scrollTop = 120; });
    await page.waitForTimeout(180);
    assert(await view.evaluate((el) => el.scrollTop >= 100), 'credits must retain the reader’s scroll position');
    if (engineName === 'chromium' && config.viewport.width < 700) {
      await view.evaluate((el) => { el.scrollTop = 0; });
      const box = await view.boundingBox(), x = box.x + box.width / 2, from = box.y + box.height - 30;
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] });
      for (let i = 1; i <= 8; i++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from - i * Math.min(24, box.height / 12) }] });
        await page.waitForTimeout(20);
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
      assert(await view.evaluate((el) => el.scrollTop > 20), 'a browser touch swipe must scroll the credits');
      entry.nativeCreditsSwipe = 'passed';
    }
  }
  await show(page, 'pause');
  await capture('pause', '.iw-pause__menu button');
  if (!audit) {
    await tap(page, '.iw-pause__menu [data-id="quit"]');
    entry.screens.quit = await geometry(page, '.iw-modal__btns button', 'quit');
    await page.screenshot({ path: path.join(evidence, `${engineName}-${entry.name}-quit.png`) });
    await tap(page, '.iw-modal__btns button:first-child');
    await page.waitForFunction(() => !menus._modal);
    assert.equal(await page.evaluate(() => menus.current), 'pause');
  }
  for (const boss of [false, true]) {
    await page.evaluate((boss) => {
      menus._results = menus._demoResults();
      if (boss) {
        menus._results.mode = 'boss';
        menus._results.boss = { defeated: true, time: 142, hpLeft: 0, phase: 3 };
        menus._results.players = menus._results.players.map((p, i) => ({ ...p, team: 0, damage: 5000 - i * 340, specials: 3, bombs: 8 }));
      }
    }, boss);
    await show(page, 'results');
    const name = boss ? 'boss-results' : 'results';
    if (!audit) {
      await tap(page, '.iw-res__title');
      await page.waitForFunction(() => document.querySelector('.iw-results')?.classList.contains('is-done'));
      assert.equal(await page.evaluate(() => menus.current), 'results', 'skipping count-ups must stay on the result screen');
      await settle(page);
    }
    entry.resultLayout ??= {};
    entry.resultLayout[name] = await page.locator('.iw-res__head, .iw-res__body').evaluateAll((els) => els.map((el) => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect(); return { class: el.className, position: s.position, top: s.top, translate: s.translate, height: r.height, y: r.y };
    }));
    await capture(name, '.iw-res__foot button');
    if (!audit) {
      assert.equal(await page.locator('.iw-prow').count(), 8);
      assert(await page.locator('.iw-prow').evaluateAll((rows) => rows.every((el) => {
        const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1;
      })), 'result rows must fit the viewport without losing statistics');
      await tap(page, '.iw-res__foot button:last-child');
    }
  }
  await page.evaluate(() => { menus._results = null; });
  await settle(page);
  entry.coreMenus = audit ? 'audited' : 'passed';
}
