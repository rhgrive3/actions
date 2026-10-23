// ZEVANT account dialog: sign in, create an account, and manage it (player name, password, devices, deletion).
// Loaded on demand by entry.js. Keyboard, gamepad (through the menus' nav), mouse and touch all work; while it is
// open the game behind it receives no input.
import panelCss from './styles/panel.css?inline';
import {
  checkLoginId, checkDisplayName, checkPassword, cleanDisplayName, passwordScore,
  LOGIN_ID_MAX, DISPLAY_NAME_MAX, PASSWORD_MAX,
} from '../../shared/rules.js';
import { api, AccountError } from './api.js';
import { account } from './store.js';
import { game } from './game.js';
import { t, errorText, formatDate, relativeTime, LANG } from './i18n.js';
import { avatarSVG, splatPath } from './art.js';
import { ICONS } from './icons.js';
import './strings.js';

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let uid = 0;

// ------------------------------------------------------------------------------------- DOM helper
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
  return el;
}
const icon = (name, cls = 'zva-ico') => h('span', { class: cls, html: ICONS[name] });
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

// Dialog faces from Google Fonts (fetched only when the dialog opens; Japanese arrives as unicode-range subsets):
// Bungee for English headings, Dela Gothic One for Japanese headings, M PLUS Rounded 1c for text.
const DISPLAY_FONT_CSS = 'https://fonts.googleapis.com/css2?family=Bungee&family=Dela+Gothic+One&family=M+PLUS+Rounded+1c:wght@500;700;800&display=swap';

function ensureStyle() {
  if (document.getElementById('zva-panel-style')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: DISPLAY_FONT_CSS, id: 'zva-display-font' }));
  document.head.append(h('style', { id: 'zva-panel-style', text: panelCss }));
}

// ------------------------------------------------------------------------------------- form parts
/** A labelled text input with hint, error line and optional password reveal / character counter. */
function field({ name, label, type = 'text', value = '', autocomplete, hint, placeholder, maxLength, counter, inputmode, autocapitalize = 'off', enterkeyhint }) {
  const id = `zva-f${++uid}`;
  const isPw = type === 'password';
  const input = h('input', {
    id, name, type, value, autocomplete, placeholder, inputmode, enterkeyhint, maxlength: maxLength,
    class: 'zva-input__el', autocapitalize, autocorrect: 'off', spellcheck: 'false',
    'aria-describedby': `${id}-hint ${id}-err`,
  });
  input.value = value;
  const status = h('span', { class: 'zva-input__status', 'aria-hidden': 'true' });
  const reveal = isPw ? h('button', { type: 'button', class: 'zva-reveal', 'aria-label': t('f.show'), 'aria-pressed': 'false', 'aria-controls': id, html: ICONS.eye }) : null;
  if (reveal) {
    reveal.addEventListener('mousedown', (e) => e.preventDefault());
    reveal.addEventListener('click', () => {
      const show = input.type === 'password';
      const [s, e] = [input.selectionStart, input.selectionEnd];
      input.type = show ? 'text' : 'password';
      reveal.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
      reveal.setAttribute('aria-pressed', String(show));
      reveal.setAttribute('aria-label', t(show ? 'f.hide' : 'f.show'));
      if (document.activeElement === input) try { input.setSelectionRange(s, e); } catch { /* type switch */ }
      game.sfx('ui_toggle');
    });
  }
  const count = counter ? h('span', { class: 'zva-count', 'aria-hidden': 'true' }) : null;
  const caps = isPw ? h('p', { class: 'zva-caps', hidden: true }, icon('alert'), t('f.caps')) : null;
  const err = h('p', { class: 'zva-err', id: `${id}-err`, 'aria-live': 'polite' });
  const hintEl = h('p', { class: 'zva-hint', id: `${id}-hint` }, hint || '');
  const box = h('div', { class: 'zva-input' }, input, status, reveal);
  const el = h('div', { class: 'zva-field' + (isPw ? ' zva-field--pw' : '') },
    h('div', { class: 'zva-field__top' }, h('label', { class: 'zva-label', for: id }, label), count),
    box, caps, err, hint ? hintEl : null);
  const updateCount = () => {
    if (!count) return;
    const n = input.value.length;
    count.textContent = t('f.count', { n, max: counter });
    count.classList.toggle('is-over', n > counter);
  };
  updateCount();
  input.addEventListener('input', updateCount);
  const api = {
    el, input, name,
    get value() { return input.value; },
    set value(v) { input.value = v; updateCount(); },
    touched: false,
    error: null,
    setError(code, text) {
      api.error = code || null;
      el.classList.toggle('is-invalid', !!code);
      el.classList.remove('is-valid');
      input.setAttribute('aria-invalid', code ? 'true' : 'false');
      err.textContent = code ? (text || errorText(code)) : '';
      if (code) { err.prepend(icon('alert')); restart(el, 'is-shake'); }
    },
    setValid(on) { if (!api.error) el.classList.toggle('is-valid', !!on); status.innerHTML = on ? ICONS.check : ''; },
    setCaps(on) { if (caps) caps.hidden = !on; },
    focus() { input.focus({ preventScroll: true }); input.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); },
  };
  input.addEventListener('blur', () => { api.touched = true; el.dispatchEvent(new CustomEvent('zva-blur')); });
  return api;
}

function toggle({ label, hint, checked, onChange }) {
  const id = `zva-t${++uid}`;
  const sw = h('button', { type: 'button', role: 'switch', class: 'zva-switch', id, 'aria-checked': String(!!checked), 'aria-describedby': hint ? `${id}-hint` : null },
    h('span', { class: 'zva-switch__knob' }));
  const row = h('div', { class: 'zva-toggle' },
    h('div', { class: 'zva-toggle__txt' }, h('label', { class: 'zva-toggle__label', for: id }, label), hint ? h('p', { class: 'zva-hint', id: `${id}-hint` }, hint) : null),
    sw);
  const set = (v) => { sw.setAttribute('aria-checked', String(v)); };
  sw.addEventListener('click', () => { const v = sw.getAttribute('aria-checked') !== 'true'; set(v); game.sfx('ui_toggle'); onChange?.(v); });
  row.querySelector('label').addEventListener('click', (e) => { e.preventDefault(); sw.click(); });
  return { el: row, get checked() { return sw.getAttribute('aria-checked') === 'true'; }, set };
}

function button(label, { kind = 'primary', type = 'button', iconName, onClick, cls = '' } = {}) {
  const b = h('button', { type, class: `zva-btn zva-btn--${kind} ${cls}` },
    h('span', { class: 'zva-btn__spin', 'aria-hidden': 'true' }),
    iconName ? icon(iconName) : null,
    h('span', { class: 'zva-btn__label' }, label));
  if (onClick) b.addEventListener('click', onClick);
  b.setBusy = (busy, busyLabel) => {
    b.classList.toggle('is-busy', busy);
    b.disabled = busy;
    b.setAttribute('aria-busy', String(busy));
    b.querySelector('.zva-btn__label').textContent = busy && busyLabel ? busyLabel : label;
  };
  return b;
}

function banner() {
  const el = h('div', { class: 'zva-banner', role: 'alert', hidden: true });
  let timer = 0;
  const api = {
    el,
    show(text, kind = 'error') {
      clearInterval(timer);
      el.hidden = false;
      el.className = `zva-banner is-${kind}`;
      el.replaceChildren(icon(kind === 'error' ? 'alert' : 'info'), h('span', null, text));
      restart(el, 'is-in');
    },
    /** Rate-limit message that counts down and calls `done` when the wait is over. */
    countdown(seconds, done) {
      let left = Math.max(1, Math.ceil(seconds));
      const tick = () => {
        if (left <= 0) { clearInterval(timer); api.hide(); done?.(); return; }
        el.querySelector('span:last-child').textContent = errorText('rate_limited', { retryAfter: left });
        left--;
      };
      api.show(errorText('rate_limited', { retryAfter: left }));
      timer = setInterval(tick, 1000);
      tick();
    },
    hide() { clearInterval(timer); el.hidden = true; },
    dispose() { clearInterval(timer); },
  };
  return api;
}

function strengthMeter() {
  const bars = [0, 1, 2, 3].map(() => h('i'));
  const label = h('span', { class: 'zva-meter__label' });
  const rules = {
    length: h('li', null, icon('check'), t('pw.rule.length')),
    id: h('li', null, icon('check'), t('pw.rule.id')),
    mix: h('li', null, icon('check'), t('pw.rule.mix')),
  };
  const el = h('div', { class: 'zva-meter', 'aria-live': 'polite' },
    h('div', { class: 'zva-meter__row' }, h('div', { class: 'zva-meter__bars', 'aria-hidden': 'true' }, bars), label),
    h('ul', { class: 'zva-rules' }, Object.values(rules)));
  return {
    el,
    update(pw, loginId = '') {
      const score = passwordScore(pw, loginId);
      el.dataset.score = pw ? String(score) : '';
      label.textContent = pw ? t('pw.strength', { label: t('pw.s' + Math.max(1, score)) }) : '';
      const lowerId = loginId.trim().toLowerCase();
      rules.length.classList.toggle('is-ok', pw.length >= 8);
      rules.id.classList.toggle('is-ok', !!pw && !(lowerId.length >= 3 && pw.toLowerCase().includes(lowerId)));
      rules.mix.classList.toggle('is-ok', [/[a-zA-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length >= 2);
    },
  };
}

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    const s = h('script', { src: TURNSTILE_SRC, async: true, defer: true });
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    s.onerror = reject;
    document.head.append(s);
  });
}

// ------------------------------------------------------------------------------------- dialog
export function mountPanel({ view: startView, onClose } = {}) {
  ensureStyle();
  const prevFocus = document.activeElement;
  const touch = matchMedia('(pointer: coarse)').matches || document.querySelector('.iw-ui.is-touch') != null;
  let closed = false, current = null, viewName = '', authTab = 'login';
  const disposers = [];

  const titleId = `zva-title${++uid}`;
  const backBtn = h('button', { type: 'button', class: 'zva-iconbtn zva-back', 'aria-label': t('dlg.back'), html: ICONS.back, hidden: true });
  const closeBtn = h('button', { type: 'button', class: 'zva-iconbtn zva-close', 'aria-label': t('dlg.close') },
    h('span', { html: ICONS.close }), h('kbd', { class: 'zva-kbd' }, 'Esc'));
  const tabs = {
    login: h('button', { type: 'button', role: 'tab', class: 'zva-tab', 'data-tab': 'login', id: `zva-tab-login${uid}` }, t('tab.login')),
    register: h('button', { type: 'button', role: 'tab', class: 'zva-tab', 'data-tab': 'register', id: `zva-tab-register${uid}` }, t('tab.register')),
  };
  const tablist = h('div', { class: 'zva-tabs', role: 'tablist', 'aria-label': t('dlg.label') }, h('i', { class: 'zva-tabs__ink', 'aria-hidden': 'true' }), tabs.login, tabs.register);
  const barTitle = h('h2', { class: 'zva-bar__title', id: titleId });
  const bar = h('header', { class: 'zva-bar' }, backBtn, tablist, barTitle, closeBtn);
  const viewHost = h('div', { class: 'zva-view' });
  const scroll = h('div', { class: 'zva-scroll' }, viewHost);
  const toastEl = h('div', { class: 'zva-toast', role: 'status', 'aria-live': 'polite' });
  const hero = h('aside', { class: 'zva-hero' });
  const main = h('div', { class: 'zva-main' }, bar, scroll, toastEl);
  const dialog = h('section', { class: 'zva-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' }, hero, main);
  const backdrop = h('div', { class: 'zva-backdrop' });
  const root = h('div', { class: 'zva-root' + (reducedMotion() ? ' is-still' : ''), lang: LANG }, backdrop, dialog);
  for (const [k, v] of Object.entries(game.accentVars())) root.style.setProperty(k, v);
  document.body.append(root);
  game.setMenusCovered(true);
  game.sfx('ui_confirm');

  // ---------------------------------------------------------------- hero (left column / top band)
  function renderHero() {
    const u = account.user;
    const splats = h('div', { class: 'zva-hero__ink', 'aria-hidden': 'true',
      html: `<svg viewBox="0 0 100 100" class="zva-hero__s1"><path d="${splatPath(11, { arms: 9 })}"/></svg><svg viewBox="0 0 100 100" class="zva-hero__s2"><path d="${splatPath(23, { arms: 7 })}"/></svg>` });
    const tape = [h('i', { class: 'zva-tape', 'aria-hidden': 'true' })];
    if (u && viewName !== 'login' && viewName !== 'register') {
      hero.className = 'zva-hero is-user';
      hero.replaceChildren(splats, ...tape,
        h('div', { class: 'zva-hero__body' },
          h('span', { class: 'zva-kicker' }, icon('shield'), t('acc.signedIn')),
          h('div', { class: 'zva-hero__avatar', html: avatarSVG(u) }),
          h('div', { class: 'zva-hero__who' },
            h('strong', { class: 'zva-hero__name zva-display' }, u.displayName),
            h('span', { class: 'zva-hero__id' }, '@' + u.loginId),
            h('span', { class: 'zva-hero__since' }, t('acc.joined', { date: formatDate(u.createdAt) })))));
      return;
    }
    hero.className = 'zva-hero';
    const lines = t('hero.title').split('\n');
    hero.replaceChildren(splats, ...tape,
      h('div', { class: 'zva-hero__body' },
        h('span', { class: 'zva-kicker' }, icon('sparkle'), t('hero.kicker')),
        h('h3', { class: 'zva-hero__title zva-display' }, lines.map((l, i) => [i ? h('br') : null, l])),
        h('ul', { class: 'zva-benefits' },
          h('li', null, icon('sync', 'zva-benefits__ico'), t('hero.b1')),
          h('li', null, icon('key', 'zva-benefits__ico'), t('hero.b2')),
          h('li', null, icon('devices', 'zva-benefits__ico'), t('hero.b3'))),
        h('p', { class: 'zva-hero__note' }, t('hero.note'))));
  }

  // ---------------------------------------------------------------- view switching
  function setBar({ title = '', back = false, auth = false }) {
    tablist.hidden = !auth;
    barTitle.textContent = auth ? t('dlg.label') : title;
    barTitle.classList.toggle('zva-sr', auth);
    backBtn.hidden = !back;
    if (auth) {
      for (const [k, b] of Object.entries(tabs)) {
        const on = k === authTab;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        b.classList.toggle('is-on', on);
      }
      tablist.dataset.on = authTab;
    }
  }

  function show(name, { dir = 0, focus = true, notice = null } = {}) {
    if (closed) return;
    const prev = current;
    prev?.destroy?.();
    viewName = name;
    if (name === 'login' || name === 'register') authTab = name;
    const builder = VIEWS[name] || VIEWS.login;
    current = builder();
    root.dataset.view = name;
    setBar(current.bar || {});
    renderHero();
    const el = current.el;
    el.classList.add('zva-view__page');
    if (dir && !reducedMotion()) el.classList.add(dir > 0 ? 'is-from-right' : 'is-from-left');
    viewHost.replaceChildren(el);
    if (current.bar?.auth) { viewHost.setAttribute('role', 'tabpanel'); viewHost.setAttribute('aria-labelledby', tabs[authTab].id); }
    else { viewHost.removeAttribute('role'); viewHost.removeAttribute('aria-labelledby'); }
    scroll.scrollTop = 0;
    if (notice) current.banner?.show(notice.text, notice.kind || 'error');
    if (focus) focusFirst();
  }

  function focusFirst() {
    // on touch screens, don't pop the on-screen keyboard until the player taps a field
    const target = !touch && current?.initial ? current.initial() : null;
    requestAnimationFrame(() => { if (!closed) (target || dialog).focus({ preventScroll: true }); });
  }

  // ---------------------------------------------------------------- helpers shared by views
  function toast(text, kind = 'good') {
    toastEl.replaceChildren(h('div', { class: `zva-toast__item is-${kind}` }, icon(kind === 'good' ? 'check' : 'info'), h('span', null, text)));
    restart(toastEl.firstChild, 'is-in');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.firstChild?.classList.add('is-out'), 2600);
  }

  /** Runs an API call for a form: busy state, field errors, banners, rate-limit countdown, expired sessions. */
  async function submit({ btn, busyLabel, fields = {}, banner: bn, run }) {
    if (btn.disabled) return null;
    bn?.hide();
    btn.setBusy(true, busyLabel);
    dialog.setAttribute('aria-busy', 'true');
    let locked = false;
    try {
      return await run();
    } catch (e) {
      const err = e instanceof AccountError ? e : new AccountError('unknown');
      game.sfx('ui_error');
      if (err.code === 'not_signed_in') {
        account.signedOut();
        show('login', { dir: -1, notice: { text: t('session.expired') } });
        return null;
      }
      const f = err.field && fields[err.field];
      if (err.code === 'rate_limited') {
        // keep the button locked until the server's wait is over
        locked = true;
        const unlock = () => { if (!closed) btn.disabled = false; };
        const secs = err.retryAfter || 60;
        if (bn) bn.countdown(secs, unlock); else setTimeout(unlock, secs * 1000);
      } else if (f) { f.setError(err.code); f.focus(); }
      else bn?.show(errorText(err.code, err));
      restart(dialog, 'is-shake');
      return null;
    } finally {
      btn.setBusy(false);
      if (locked) btn.disabled = true;
      dialog.removeAttribute('aria-busy');
    }
  }

  /** Field validation: on blur once touched, then live while an error is showing. */
  function validate(f, check) {
    const run = () => { const code = check(f.value); f.setError(code); if (!code && f.value) f.setValid(true); else f.setValid(false); return !code; };
    f.el.addEventListener('zva-blur', () => { if (f.value) run(); });
    f.input.addEventListener('input', () => { if (f.error || f.el.classList.contains('is-valid')) run(); });
    return run;
  }

  /** Finish signing in: short celebration, then back to the game. */
  function welcome(user, key) {
    account.signedIn(user);
    game.sfx('ui_confirm');
    game.sfx('splat_big');
    const text = t(key, { name: user.displayName });
    const card = h('div', { class: 'zva-welcome', role: 'status' },
      h('div', { class: 'zva-welcome__av', html: avatarSVG(user) }),
      h('strong', { class: 'zva-welcome__txt zva-display' }, text.split('\n').map((l, i) => [i ? h('br') : null, l])));
    main.append(card);
    // nothing behind the celebration can be used again (Enter would sign in a second time)
    bar.inert = true;
    scroll.inert = true;
    renderHero();
    setTimeout(() => {
      close({ silent: true });
      try { game.menus()?.toast?.(text.replace(/\n/g, ' '), { kind: 'good' }); } catch { /* optional */ }
    }, reducedMotion() ? 700 : 1300);
  }

  // ---------------------------------------------------------------- views
  const VIEWS = {
    login() {
      const bn = banner();
      const id = field({ name: 'username', label: t('f.loginId'), autocomplete: 'username', placeholder: t('f.loginId.ph'), maxLength: 64, enterkeyhint: 'next' });
      const pw = field({ name: 'password', label: t('f.password'), type: 'password', autocomplete: 'current-password', maxLength: PASSWORD_MAX, enterkeyhint: 'go' });
      const remember = toggle({ label: t('f.remember'), hint: t('f.remember.hint'), checked: true });
      const go = button(t('btn.login'), { type: 'submit', cls: 'zva-btn--wide' });
      const form = h('form', { class: 'zva-form', novalidate: true, method: 'post', action: '#', autocomplete: 'on' },
        h('div', { class: 'zva-head' }, h('h3', { class: 'zva-h zva-display' }, t('login.title')), h('p', { class: 'zva-lead' }, t('login.lead'))),
        bn.el, id.el, pw.el, remember.el, go,
        h('p', { class: 'zva-switchline' }, t('switch.toRegister'), ' ',
          h('button', { type: 'button', class: 'zva-link', onclick: () => { game.sfx('ui_click'); show('register', { dir: 1 }); } }, t('switch.toRegister.link'))),
        h('div', { class: 'zva-or', 'aria-hidden': 'true' }),
        button(t('btn.guest'), { kind: 'ghost', cls: 'zva-btn--wide', onClick: () => close() }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const loginId = id.value.trim();
        id.setError(loginId ? null : 'login_id_required');
        pw.setError(pw.value ? null : 'password_required');
        if (!loginId) return id.focus(); if (!pw.value) return pw.focus();
        const res = await submit({ btn: go, busyLabel: t('btn.login.busy'), banner: bn, run: () => api.login({ loginId, password: pw.value, remember: remember.checked }) });
        if (res?.user) welcome(res.user, 'login.done');
        else if (res === null && !closed) { pw.value = ''; if (!touch) pw.focus(); }
      });
      return { el: form, banner: bn, bar: { auth: true }, initial: () => (id.value ? pw.input : id.input), destroy: () => bn.dispose(), fields: [pw] };
    },

    register() {
      const bn = banner();
      const closedReg = account.config && account.config.registrationOpen === false;
      const suggested = game.profileName();
      const defaultName = !suggested || ['Player', 'プレイヤー'].includes(suggested) ? '' : suggested.slice(0, DISPLAY_NAME_MAX);
      const id = field({ name: 'username', label: t('f.loginId'), autocomplete: 'username', placeholder: t('f.loginId.ph'), maxLength: LOGIN_ID_MAX, hint: t('f.loginId.hint'), enterkeyhint: 'next' });
      const name = field({ name: 'nickname', label: t('f.displayName'), value: defaultName, autocomplete: 'nickname', maxLength: 64, counter: DISPLAY_NAME_MAX, hint: t('f.displayName.hint'), autocapitalize: 'words', enterkeyhint: 'next' });
      const pw = field({ name: 'new-password', label: t('f.password'), type: 'password', autocomplete: 'new-password', maxLength: PASSWORD_MAX, enterkeyhint: 'next' });
      const meter = strengthMeter();
      const pw2 = field({ name: 'confirm-password', label: t('f.confirm'), type: 'password', autocomplete: 'new-password', maxLength: PASSWORD_MAX, enterkeyhint: 'go' });
      const remember = toggle({ label: t('f.remember'), hint: t('f.remember.hint'), checked: true });
      const captchaBox = h('div', { class: 'zva-captcha', hidden: true });
      const go = button(t('btn.register'), { type: 'submit', cls: 'zva-btn--wide' });
      let captchaToken = '', widget = null;

      const vId = validate(id, (v) => checkLoginId(v));
      const vName = validate(name, (v) => checkDisplayName(v));
      const vPw = validate(pw, (v) => checkPassword(v, id.value));
      const vPw2 = validate(pw2, (v) => (!v ? 'password_required' : v !== pw.value ? 'password_mismatch' : null));
      pw.input.addEventListener('input', () => { meter.update(pw.value, id.value); if (pw2.value) vPw2(); });
      id.input.addEventListener('input', () => meter.update(pw.value, id.value));
      meter.update('', '');

      const form = h('form', { class: 'zva-form', novalidate: true, method: 'post', action: '#', autocomplete: 'on' },
        h('div', { class: 'zva-head' }, h('h3', { class: 'zva-h zva-display' }, t('register.title')), h('p', { class: 'zva-lead' }, t('register.lead'))),
        bn.el, id.el, name.el, pw.el, meter.el, pw2.el, remember.el, captchaBox, go,
        h('p', { class: 'zva-secure' }, icon('lock'), t('secure.note')),
        h('p', { class: 'zva-switchline' }, t('switch.toLogin'), ' ',
          h('button', { type: 'button', class: 'zva-link', onclick: () => { game.sfx('ui_click'); show('login', { dir: -1 }); } }, t('switch.toLogin.link'))));
      if (closedReg) { bn.show(t('register.closed'), 'info'); go.disabled = true; }

      // Cloudflare Turnstile, when the Worker has it configured
      account.loadConfig().then((cfg) => {
        if (closed || viewName !== 'register') return;
        if (cfg.registrationOpen === false) { bn.show(t('register.closed'), 'info'); go.disabled = true; return; }
        if (!cfg.turnstileSiteKey) return;
        captchaBox.hidden = false;
        captchaBox.replaceChildren(h('p', { class: 'zva-hint' }, t('f.captcha')));
        loadTurnstile().then((ts) => {
          if (closed || !captchaBox.isConnected) return;
          captchaBox.replaceChildren();
          widget = ts.render(captchaBox, {
            sitekey: cfg.turnstileSiteKey, theme: 'dark', size: 'flexible', language: LANG,
            callback: (tok) => { captchaToken = tok; },
            'expired-callback': () => { captchaToken = ''; },
            'error-callback': () => { captchaToken = ''; },
          });
        }, () => { if (!closed) bn.show(errorText('captcha_unavailable')); });
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const checks = [[id, vId], [name, vName], [pw, vPw], [pw2, vPw2]];
        const bad = checks.filter(([, v]) => !v()).map(([f]) => f);
        if (bad.length) { game.sfx('ui_error'); bad[0].focus(); return; }
        const body = { loginId: id.value.trim(), displayName: cleanDisplayName(name.value), password: pw.value, remember: remember.checked };
        if (!captchaBox.hidden) body.turnstileToken = captchaToken;
        const res = await submit({ btn: go, busyLabel: t('btn.register.busy'), banner: bn, fields: { loginId: id, displayName: name, password: pw }, run: () => api.register(body) });
        if (res?.user) welcome(res.user, 'register.done');
        else if (widget != null) { try { window.turnstile?.reset(widget); } catch { /* widget gone */ } captchaToken = ''; }
      });
      return {
        el: form, banner: bn, bar: { auth: true }, initial: () => id.input, fields: [pw, pw2],
        destroy: () => { bn.dispose(); if (widget != null) try { window.turnstile?.remove(widget); } catch { /* gone */ } },
      };
    },

    account() {
      const u = account.user;
      if (!u) return VIEWS.login();
      const row = (iconName, label, sub, onClick, cls = '') => h('button', { type: 'button', class: 'zva-row ' + cls, onclick: () => { game.sfx('ui_click'); onClick(); } },
        h('span', { class: 'zva-row__ico', html: ICONS[iconName] }),
        h('span', { class: 'zva-row__txt' }, h('b', null, label), sub ? h('small', null, sub) : null),
        h('span', { class: 'zva-row__go', html: ICONS.chevron }));
      const sync = toggle({ label: t('acc.sync'), hint: t('acc.sync.hint'), checked: account.prefs.syncName, onChange: (v) => account.setPref('syncName', v) });
      const logoutRow = row('logout', t('acc.logout'), t('acc.logout.sub'), async () => {
        logoutRow.classList.add('is-busy');
        logoutRow.disabled = true;
        try { await api.logout(); } catch { /* signed out locally either way */ }
        account.signedOut();
        game.sfx('ui_back');
        close({ silent: true });
        try { game.menus()?.toast?.(t('logout.done'), { kind: 'leave' }); } catch { /* optional */ }
      });
      const el = h('div', { class: 'zva-acc' },
        h('div', { class: 'zva-card' }, sync.el),
        h('div', { class: 'zva-list' },
          row('pen', t('acc.rename'), u.displayName, () => show('rename', { dir: 1 })),
          row('lock', t('acc.password'), t('acc.password.sub', { date: formatDate(u.passwordChangedAt || u.createdAt) }), () => show('password', { dir: 1 })),
          row('devices', t('acc.devices'), t('acc.devices.sub'), () => show('devices', { dir: 1 })),
          logoutRow),
        h('p', { class: 'zva-section' }, t('acc.danger')),
        h('div', { class: 'zva-list' }, row('trash', t('acc.delete'), null, () => show('delete', { dir: 1 }), 'is-danger')));
      return { el, bar: { title: t('dlg.label') }, initial: () => el.querySelector('.zva-switch') };
    },

    rename() {
      const bn = banner();
      const name = field({ name: 'nickname', label: t('f.displayName'), value: account.user.displayName, autocomplete: 'nickname', maxLength: 64, counter: DISPLAY_NAME_MAX, autocapitalize: 'words', enterkeyhint: 'done' });
      const v = validate(name, (x) => checkDisplayName(x));
      const go = button(t('btn.save'), { type: 'submit', cls: 'zva-btn--wide' });
      const form = h('form', { class: 'zva-form', novalidate: true },
        h('p', { class: 'zva-lead' }, t('rename.lead')), bn.el, name.el, go);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!v()) return name.focus();
        const res = await submit({ btn: go, busyLabel: t('btn.saving'), banner: bn, fields: { displayName: name }, run: () => api.rename(cleanDisplayName(name.value)) });
        if (res?.user) { account.signedIn(res.user); game.sfx('ui_confirm'); show('account', { dir: -1, focus: false }); toast(t('rename.done')); focusFirst(); }
      });
      return { el: form, banner: bn, bar: { title: t('acc.rename'), back: true }, initial: () => name.input, destroy: () => bn.dispose() };
    },

    password() {
      const bn = banner();
      const cur = field({ name: 'current-password', label: t('f.currentPassword'), type: 'password', autocomplete: 'current-password', maxLength: PASSWORD_MAX, enterkeyhint: 'next' });
      const pw = field({ name: 'new-password', label: t('f.newPassword'), type: 'password', autocomplete: 'new-password', maxLength: PASSWORD_MAX, enterkeyhint: 'next' });
      const meter = strengthMeter();
      const pw2 = field({ name: 'confirm-password', label: t('f.confirm'), type: 'password', autocomplete: 'new-password', maxLength: PASSWORD_MAX, enterkeyhint: 'done' });
      const vPw = validate(pw, (x) => checkPassword(x, account.user.loginId) || (x === cur.value ? 'password_same' : null));
      const vPw2 = validate(pw2, (x) => (!x ? 'password_required' : x !== pw.value ? 'password_mismatch' : null));
      pw.input.addEventListener('input', () => { meter.update(pw.value, account.user.loginId); if (pw2.value) vPw2(); });
      meter.update('', '');
      const go = button(t('btn.save'), { type: 'submit', cls: 'zva-btn--wide' });
      // hidden username so password managers file the new password under the right account
      const userHint = h('input', { type: 'text', name: 'username', autocomplete: 'username', value: account.user.loginId, class: 'zva-sr', tabindex: '-1', 'aria-hidden': 'true', readonly: true });
      const form = h('form', { class: 'zva-form', novalidate: true },
        h('p', { class: 'zva-lead' }, t('password.lead')), userHint, bn.el, cur.el, pw.el, meter.el, pw2.el, go);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        cur.setError(cur.value ? null : 'password_required');
        const ok = [!!cur.value, vPw(), vPw2()];
        if (ok.includes(false)) { game.sfx('ui_error'); return [cur, pw, pw2][ok.indexOf(false)].focus(); }
        const res = await submit({ btn: go, busyLabel: t('btn.saving'), banner: bn, fields: { currentPassword: cur, newPassword: pw },
          run: () => api.password({ currentPassword: cur.value, newPassword: pw.value }) });
        if (res?.user) { account.signedIn(res.user); game.sfx('ui_confirm'); show('account', { dir: -1, focus: false }); toast(t('password.done')); focusFirst(); }
      });
      return { el: form, banner: bn, bar: { title: t('acc.password'), back: true }, initial: () => cur.input, destroy: () => bn.dispose(), fields: [cur, pw, pw2] };
    },

    devices() {
      const bn = banner();
      const list = h('ul', { class: 'zva-devices', 'aria-busy': 'true' },
        [0, 1].map(() => h('li', { class: 'zva-device is-skeleton', 'aria-hidden': 'true' }, h('i'), h('span'))));
      const status = h('p', { class: 'zva-sr', role: 'status' }, t('devices.loading'));
      const all = button(t('devices.revokeAll'), { kind: 'ghost', iconName: 'logout', cls: 'zva-btn--wide' });
      const el = h('div', { class: 'zva-form' }, h('p', { class: 'zva-lead' }, t('devices.lead')), bn.el, status, list, all);
      let alive = true;
      const flag = (cc) => (/^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');
      const render = (sessions) => {
        list.removeAttribute('aria-busy');
        status.textContent = '';
        const others = sessions.filter((s) => !s.current);
        all.disabled = !others.length;
        list.replaceChildren(...sessions.map((s) => {
          const mobile = /iPhone|Android|iPad/.test(s.device);
          const revoke = s.current ? null : button(t('devices.revoke'), { kind: 'ghost', cls: 'zva-btn--small' });
          if (revoke) revoke.addEventListener('click', async () => {
            const res = await submit({ btn: revoke, banner: bn, run: () => api.revoke({ id: s.id }) });
            if (res?.sessions) { game.sfx('ui_back'); render(res.sessions); toast(t('devices.done')); }
          });
          return h('li', { class: 'zva-device' + (s.current ? ' is-current' : '') },
            h('span', { class: 'zva-device__ico', html: mobile ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M11 18.3h2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' : ICONS.devices }),
            h('span', { class: 'zva-device__txt' },
              h('b', null, [s.device || t('devices.unknown'), flag(s.country) ? ' ' + flag(s.country) : '']),
              h('small', null, [s.current ? h('span', { class: 'zva-tag is-on' }, t('devices.this')) : t('devices.seen', { when: relativeTime(s.lastSeenAt) }),
                s.persistent ? h('span', { class: 'zva-tag' }, t('devices.kept')) : null])),
            revoke);
        }));
        if (!others.length) list.append(h('li', { class: 'zva-device is-empty' }, icon('shield'), t('devices.none')));
      };
      const load = async () => {
        try { const res = await api.sessions(); if (alive) render(res.sessions); }
        catch (e) {
          if (!alive) return;
          if (e?.code === 'not_signed_in') { account.signedOut(); show('login', { dir: -1, notice: { text: t('session.expired') } }); return; }
          list.replaceChildren();
          bn.show(errorText(e?.code || 'unknown'));
          list.append(h('li', { class: 'zva-device is-empty' }, button(t('btn.retry'), { kind: 'ghost', onClick: () => { bn.hide(); load(); } })));
        }
      };
      all.addEventListener('click', async () => {
        const res = await submit({ btn: all, banner: bn, run: () => api.revoke({ scope: 'others' }) });
        if (res?.sessions) { game.sfx('ui_back'); render(res.sessions); toast(t('devices.done')); }
      });
      load();
      return { el, banner: bn, bar: { title: t('acc.devices'), back: true }, initial: () => null, destroy: () => { alive = false; bn.dispose(); } };
    },

    delete() {
      const bn = banner();
      const u = account.user;
      const confirm = field({ name: 'confirm-id', label: t('delete.confirm', { id: u.loginId }), autocomplete: 'off', placeholder: u.loginId, maxLength: 64, enterkeyhint: 'next' });
      const pw = field({ name: 'current-password', label: t('f.password'), type: 'password', autocomplete: 'current-password', maxLength: PASSWORD_MAX, enterkeyhint: 'done' });
      const go = button(t('delete.btn'), { type: 'submit', kind: 'danger', iconName: 'trash', cls: 'zva-btn--wide' });
      const matches = () => confirm.value.trim().toLowerCase() === u.loginId.toLowerCase();
      const sync = () => { go.disabled = !matches() || !pw.value; confirm.setValid(matches()); };
      confirm.input.addEventListener('input', sync);
      pw.input.addEventListener('input', sync);
      sync();
      const form = h('form', { class: 'zva-form', novalidate: true },
        h('div', { class: 'zva-warn' }, icon('alert'), h('p', null, t('delete.lead'))), bn.el, confirm.el, pw.el, go);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!matches()) { confirm.setError('confirm_mismatch'); return confirm.focus(); }
        const res = await submit({ btn: go, busyLabel: t('delete.busy'), banner: bn, fields: { confirm, currentPassword: pw }, run: () => api.remove({ confirm: confirm.value.trim(), password: pw.value }).then(() => ({ ok: true })) });
        if (res?.ok) {
          account.signedOut();
          game.sfx('ui_back');
          close({ silent: true });
          try { game.menus()?.toast?.(t('delete.done'), { kind: 'leave' }); } catch { /* optional */ }
        } else sync();
      });
      return { el: form, banner: bn, bar: { title: t('acc.delete'), back: true }, initial: () => confirm.input, destroy: () => bn.dispose(), fields: [pw] };
    },
  };

  // ---------------------------------------------------------------- navigation: back / close
  function back() {
    if (['rename', 'password', 'devices', 'delete'].includes(viewName)) { game.sfx('ui_back'); show('account', { dir: -1 }); return; }
    close();
  }

  function dirty() {
    return [...viewHost.querySelectorAll('input:not([type=hidden]):not([readonly])')].some((i) => i.value && i.value !== i.defaultValue);
  }

  function close({ silent = false } = {}) {
    if (closed) return;
    closed = true;
    current?.destroy?.();
    for (const d of disposers) d();
    if (!silent) game.sfx('ui_back');
    root.classList.add('is-leaving');
    game.setMenusCovered(false);
    const done = () => { root.remove(); onClose?.(); };
    if (reducedMotion()) done(); else setTimeout(done, 200);
    if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') prevFocus.focus({ preventScroll: true });
  }

  backBtn.addEventListener('click', back);
  closeBtn.addEventListener('click', () => close());
  backdrop.addEventListener('click', () => { if (dirty()) { game.sfx('ui_error'); restart(dialog, 'is-shake'); } else close(); });
  for (const b of Object.values(tabs)) b.addEventListener('click', () => { if (b.dataset.tab !== authTab) { game.sfx('ui_click'); show(b.dataset.tab, { dir: b.dataset.tab === 'register' ? 1 : -1 }); } });

  // ---------------------------------------------------------------- input ownership
  const focusables = () => [...dialog.querySelectorAll('button, input, a[href], select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && !el.hidden && el.tabIndex >= 0 && el.offsetParent !== null && !el.closest('[hidden]'));

  function moveFocus(step) {
    const list = focusables();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const next = list[i < 0 ? (step > 0 ? 0 : list.length - 1) : (i + step + list.length) % list.length];
    next.focus({ preventScroll: true });
    next.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    game.sfx('ui_hover');
  }

  function switchTab(dir) {
    if (viewName !== 'login' && viewName !== 'register') return false;
    const to = dir > 0 ? 'register' : 'login';
    if (to === authTab) return false;
    game.sfx('ui_click');
    show(to, { dir });
    tabs[to].focus({ preventScroll: true });
    return true;
  }

  function onKey(e) {
    if (closed) return;
    // the game must not see keys typed into the dialog (WASD, Enter, Esc...)
    e.stopPropagation();
    root.classList.remove('is-pad');
    const pwField = current?.fields?.find((f) => f.input === e.target);
    if (pwField && typeof e.getModifierState === 'function') pwField.setCaps(e.getModifierState('CapsLock'));
    if (e.key === 'Escape') { e.preventDefault(); back(); return; }
    if (e.key === 'Tab') {
      const list = focusables();
      if (!list.length) return;
      const i = list.indexOf(document.activeElement);
      if (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === list.length - 1)) {
        e.preventDefault();
        (e.shiftKey ? list[list.length - 1] : list[0]).focus();
      }
      return;
    }
    if (e.target?.getAttribute?.('role') === 'tab' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); switchTab(e.key === 'ArrowRight' ? 1 : -1); }
  }
  const onKeyUp = (e) => {
    if (closed) return;
    const pwField = current?.fields?.find((f) => f.input === e.target);
    if (pwField && typeof e.getModifierState === 'function') pwField.setCaps(e.getModifierState('CapsLock'));
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  disposers.push(() => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKeyUp, true); });

  // gamepad: the menus forward d-pad / A / B / LB / RB here while we are open
  disposers.push(game.captureNav((dir) => {
    if (closed) return;
    root.classList.add('is-pad');
    const el = document.activeElement;
    if (dir === 'back') { back(); return; }
    if (dir === 'tab_prev' || dir === 'tab_next') { switchTab(dir === 'tab_next' ? 1 : -1); return; }
    if (dir === 'accept') {
      if (!dialog.contains(el) || el === dialog) { moveFocus(1); return; }
      if (el.tagName === 'INPUT') { const form = el.form; if (form && el.value) form.requestSubmit(); return; }
      el.click?.();
      return;
    }
    if ((dir === 'left' || dir === 'right') && el?.getAttribute?.('role') === 'tab') { switchTab(dir === 'right' ? 1 : -1); return; }
    if (dir === 'up' || dir === 'left') moveFocus(-1);
    else if (dir === 'down' || dir === 'right') moveFocus(1);
  }));
  const offPad = () => root.classList.remove('is-pad');
  root.addEventListener('pointerdown', offPad, true);

  // the dialog follows sign-in changes made elsewhere (another tab, an expired session)
  disposers.push(account.subscribe(() => {
    if (closed || !current) return;
    if (!account.user && !['login', 'register'].includes(viewName)) show('login', { dir: -1 });
  }));

  // on-screen keyboards: keep the focused field visible
  const onResize = () => { const a = document.activeElement; if (a?.tagName === 'INPUT' && dialog.contains(a)) a.scrollIntoView({ block: 'nearest' }); };
  window.visualViewport?.addEventListener('resize', onResize);
  disposers.push(() => window.visualViewport?.removeEventListener('resize', onResize));

  show(startView || (account.user ? 'account' : 'login'));
  account.loadConfig();
  return { close, show: (v) => show(v), get view() { return viewName; } };
}
