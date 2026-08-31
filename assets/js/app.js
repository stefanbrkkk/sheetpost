/* ============================================================
   SHEETPOST — app: language engine, nav + reading progress,
   countdowns, waitlist. Zero console noise by design.
   The email gate lives in demo.js, next to the flow it gates.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  window.SP_I18N_HOOKS = window.SP_I18N_HOOKS || [];
  var store = {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v === null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: preferences just don't persist */ } }
  };

  document.documentElement.classList.remove('no-js');

  /* ---------------- language engine ---------------- */
  var LANGS = ['pl', 'en', 'de', 'hr', 'ro'];
  var DICT = window.SP_I18N || {};
  /* language -> the currency that language's market actually pays in */
  var LANG_CUR = { pl: 'pln', en: 'eur', de: 'eur', hr: 'eur', ro: 'ron' };
  var CUR_SYM = { pln: ' zł', eur: ' €', ron: ' lei' };
  var OG_LOCALE = { pl: 'pl_PL', en: 'en_GB', de: 'de_DE', hr: 'hr_HR', ro: 'ro_RO' };
  var SITE = 'https://sheetpost.app/';
  function setMeta(sel, value) {
    if (!value) return;
    var el = $(sel);
    if (el) el.setAttribute('content', value);
  }

  function t(key, vars) {
    var lang = document.documentElement.getAttribute('data-lang') || 'pl';
    var d = DICT[lang] || DICT.pl || {};
    var s = d[key];
    if (s === undefined) s = (DICT.pl || {})[key];
    if (s === undefined) s = key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split('{' + k + '}').join(vars[k]);
      });
    }
    return s;
  }
  window.SP_T = t;

  function applyLang(lang, silent) {
    if (LANGS.indexOf(lang) < 0) lang = 'pl';
    var root = document.documentElement;
    var prev = root.getAttribute('data-lang') || 'pl';
    root.setAttribute('data-lang', lang);
    root.setAttribute('lang', lang);

    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-html]').forEach(function (el) { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    $$('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    $$('[data-i18n-ph]').forEach(function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    /* sample-sheet cells: the typing animation reads data-t, so translate that too */
    $$('[data-i18n-t]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n-t'));
      el.setAttribute('data-t', v);
      if (el.textContent) el.textContent = v;
    });

    /* page meta: title, description, social cards, canonical and og:locale
       all follow the language, because a share card in the wrong language is
       worse than no share card */
    var d = DICT[lang] || DICT.pl;
    if (d) {
      if (d.title) document.title = d.title;
      setMeta('meta[name="description"]', d.desc);
      setMeta('meta[property="og:title"]', d.og_title);
      setMeta('meta[property="og:description"]', d.og_desc);
      setMeta('meta[name="twitter:title"]', d.og_title);
      setMeta('meta[name="twitter:description"]', d.og_desc);
      setMeta('meta[property="og:locale"]', OG_LOCALE[lang] || 'pl_PL');
      var can = $('link[rel="canonical"]');
      var ogu = $('meta[property="og:url"]');
      var href = SITE + (lang === 'pl' ? '' : '?lang=' + lang);
      if (can) can.setAttribute('href', href);
      if (ogu) ogu.setAttribute('content', href);
    }

    /* Auto-currency follows the language, but never overrides a currency the
       visitor picked on purpose. */
    if (LANG_CUR[lang] && store.get('sp_cur_manual', '') !== '1') applyCurrency(LANG_CUR[lang], false);
    else applyCurrency(currencyOf(), false);

    $$('button[data-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false');
    });

    if (prev !== lang && !silent) {
      window.SP_I18N_HOOKS.forEach(function (fn) { try { fn(lang); } catch (e) { /* one bad hook must not stop the swap */ } });
      requestAnimationFrame(function () {
        if (window.gsap && window.ScrollTrigger) ScrollTrigger.refresh();
      });
    }
    store.set('sp_lang', lang);
  }

  function initLang() {
    var url = new URLSearchParams(location.search).get('lang');
    /* an unknown ?lang= is ignored rather than allowed to reset the choice
       the visitor already made */
    var lang = (url && LANGS.indexOf(url) >= 0) ? url : store.get('sp_lang', 'pl');
    applyLang(lang, true);
    $$('button[data-lang]').forEach(function (b) {
      b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
    });
  }

  /* ---------------- currency ---------------- */
  function currencyOf() {
    var stored = store.get('sp_cur', '');
    if (CUR_SYM[stored]) return stored;
    return LANG_CUR[document.documentElement.getAttribute('data-lang') || 'pl'] || 'pln';
  }
  function applyCurrency(cur, manual) {
    if (!CUR_SYM[cur]) cur = 'pln';
    store.set('sp_cur', cur);
    if (manual) store.set('sp_cur_manual', '1');
    var attr = cur === 'eur' ? 'data-eur' : cur === 'ron' ? 'data-ron' : 'data-pln';
    $$('[data-price]').forEach(function (el) {
      var v = el.getAttribute(attr);
      if (v !== null) el.textContent = v;
    });
    $$('[data-cur-symbol]').forEach(function (el) { el.textContent = CUR_SYM[cur]; });
    $$('.plans-toggle button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-cur') === cur ? 'true' : 'false');
    });
  }

  initLang();
  $$('.plans-toggle button').forEach(function (b) {
    b.addEventListener('click', function () { applyCurrency(b.getAttribute('data-cur'), true); });
  });
  applyCurrency(currencyOf(), false);

  /* ---------------- reveal on scroll ---------------- */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------------- nav: hide on scroll, theme with the world ---------------- */
  var nav = $('#nav');
  var menu = $('#menu');
  var burger = $('#burger');
  var progress = $('#scroll-progress');
  var menuOpen = false;

  /* while the full-screen menu is up, the page behind it is neither
     focusable nor readable by assistive technology */
  function setBackgroundInert(on) {
    ['#main', '.footer'].forEach(function (sel) {
      var el = $(sel);
      if (!el) return;
      if (on) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
      else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
    });
  }
  function setMenu(open, restoreFocus) {
    menuOpen = open;
    menu.hidden = !open;
    menu.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
    setBackgroundInert(open);
    if (open) {
      var first = menu.querySelector('a, button');
      if (first) first.focus();
    } else if (restoreFocus) {
      burger.focus();
    }
  }
  if (burger) burger.addEventListener('click', function () { setMenu(!menuOpen, true); });
  if (menu) {
    /* a link click closes the menu but must leave focus on the destination */
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false, false); }); });
    menu.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = $$('a[href], button', menu).filter(function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menuOpen) setMenu(false, true);
  });
  /* the burger disappears above 960px: an open menu must go with it, or the
     page is left scroll-locked behind an invisible overlay */
  var mobileMQ = window.matchMedia('(max-width: 960px)');
  var onBreakpoint = function (e) { if (!e.matches && menuOpen) setMenu(false, false); };
  if (mobileMQ.addEventListener) mobileMQ.addEventListener('change', onBreakpoint);
  else if (mobileMQ.addListener) mobileMQ.addListener(onBreakpoint);

  /* Which world is under the header right now? Measured from live rects,
     because the bridge sheet is transformed by the scroll timeline: its
     scripted position is the only truthful one. */
  var foldSheet = $('#fold-sheet');
  var paperWorld = $('.paper-world');
  function overPaper(navBottom) {
    var el, r;
    for (var i = 0; i < 2; i++) {
      el = i ? paperWorld : foldSheet;
      if (!el) continue;
      r = el.getBoundingClientRect();
      if (r.top <= navBottom && r.bottom >= navBottom) return true;
    }
    return false;
  }

  var lastY = 0, ticking = false;
  function onScroll() {
    var y = window.scrollY;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (nav) {
      nav.classList.toggle('scrolled', y > 24);
      nav.classList.toggle('hide', y > lastY && y > 240 && !menuOpen);
      nav.classList.toggle('nav--paper', overPaper(nav.getBoundingClientRect().height || 68));
    }
    if (progress) progress.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
    lastY = y;
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  window.addEventListener('load', onScroll);
  onScroll();

  /* ---------------- tickers (countdown, locale aware) ---------------- */
  function localeOf() {
    var lang = document.documentElement.getAttribute('data-lang') || 'pl';
    return { pl: 'pl-PL', en: 'en-GB', de: 'de-DE', hr: 'hr-HR', ro: 'ro-RO' }[lang] || 'pl-PL';
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  var tickTimer = 0;
  function tickAll() {
    var anyLive = false;
    $$('.ticker-clock').forEach(function (el) {
      var dl = el.getAttribute('data-deadline');
      if (!dl) return;
      var target = new Date(dl).getTime();
      if (isNaN(target)) { el.textContent = ''; return; }
      var ms = target - Date.now();
      if (ms <= 0) {
        el.classList.add('past');
        el.textContent = t('tick_now');
        return;
      }
      anyLive = true;
      el.classList.remove('past');
      var s = Math.floor(ms / 1000);
      var days = Math.floor(s / 86400);
      var h = Math.floor((s % 86400) / 3600);
      var m = Math.floor((s % 3600) / 60);
      var sec = s % 60;
      el.textContent = '';
      if (days > 0) {
        el.appendChild(document.createTextNode(days.toLocaleString(localeOf())));
        var u = document.createElement('span');
        u.className = 'tk-u';
        u.textContent = t('tick_days');
        el.appendChild(u);
      }
      el.appendChild(document.createTextNode(pad(h) + ':' + pad(m) + ':' + pad(sec)));
    });
    if (!anyLive && tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
  }
  function startTicking() {
    tickAll();
    if (!tickTimer) tickTimer = setInterval(tickAll, 1000);
  }
  function stopTicking() { if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; } }
  startTicking();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopTicking(); else startTicking();
  });
  window.SP_I18N_HOOKS.push(function () { tickAll(); });

  /* ---------------- waitlist form ---------------- */
  /* configured in assets/js/config.js; empty = stored locally only */
  var FORM_ENDPOINT = (window.SP_CONFIG && window.SP_CONFIG.formEndpoint) || '';
  var waitform = $('#waitform');
  if (waitform) {
    var wEmail = $('#w-email');
    if (wEmail) {
      wEmail.addEventListener('input', function () {
        var btn = waitform.querySelector('button[type="submit"]');
        if (btn) btn.disabled = false;
        wEmail.removeAttribute('aria-invalid');
      });
    }
    waitform.addEventListener('submit', function (e) {
      e.preventDefault();
      /* honeypot first: a bot must never see a validation message */
      if (waitform.company && waitform.company.value) return;

      var email = $('#w-email');
      var consent = $('#w-consent');
      var err = $('#w-error');
      function fail(el, key) {
        el.setAttribute('aria-invalid', 'true');
        if (err) {
          /* reveal the live region first, then write into it: text written
             into a display:none node is announced unreliably */
          err.classList.add('show');
          err.textContent = '';
          requestAnimationFrame(function () { err.textContent = t(key); });
        }
        el.focus();
      }
      if (!email.value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) {
        fail(email, 'cta_err_email');
        return;
      }
      email.removeAttribute('aria-invalid');
      if (!consent.checked) { fail(consent, 'cta_err_consent'); return; }
      consent.removeAttribute('aria-invalid');
      if (err) { err.textContent = ''; err.classList.remove('show'); }

      var payload = { email: email.value, country: $('#w-country').value, lang: document.documentElement.getAttribute('data-lang'), at: Date.now() };
      var btn = waitform.querySelector('button[type="submit"]');
      var ok = $('#wait-ok');

      function succeed() {
        var list = [];
        try { list = JSON.parse(store.get('sp_waitlist', '[]')); } catch (parseErr) { list = []; }
        list.push(payload);
        store.set('sp_waitlist', JSON.stringify(list));
        if (ok) {
          ok.hidden = false;
          ok.classList.add('show');
          /* the focused button is about to be disabled: hand focus to the
             confirmation rather than letting it fall back to <body> */
          ok.setAttribute('tabindex', '-1');
          ok.focus({ preventScroll: true });
        }
        waitform.reset();
      }
      function failNetwork() {
        if (btn) btn.disabled = false;
        if (err) { err.textContent = t('cta_err_network'); err.classList.add('show'); }
      }

      if (btn) btn.disabled = true;
      if (!FORM_ENDPOINT) { succeed(); return; }
      /* mode:'no-cors' hides the status code, but a rejected promise still
         means the request never left the machine: say so instead of
         claiming a signup that did not happen */
      fetch(FORM_ENDPOINT, { method: 'POST', body: new URLSearchParams({ email: payload.email, country: payload.country }), mode: 'no-cors' })
        .then(succeed, failNetwork);
    });
  }

  /* ---------------- footer year ---------------- */
  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* expose tiny helpers for other modules */
  window.SPStore = store;
  window.SPLocale = localeOf;
})();
