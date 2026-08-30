/* ============================================================
   SHEETPOST V2 — app: language engine, nav, tickers, forms,
   reveal system, modal, misc. Zero console noise by design.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  window.SP_I18N_HOOKS = window.SP_I18N_HOOKS || [];
  var store = {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v === null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  document.documentElement.classList.remove('no-js');

  /* ---------------- language engine ---------------- */
  var LANGS = ['pl', 'en', 'de', 'hr', 'ro'];
  var DICT = window.SP_I18N || {};
  /* language -> default currency (user can override via the toggle) */
  var LANG_CUR = { pl: 'pln', en: 'eur', de: 'eur', hr: 'eur', ro: 'ron' };
  var CUR_SYM = { pln: '\u00A0zł', eur: '\u00A0€', ron: '\u00A0lei' };

  function t(key, vars) {
    var lang = document.documentElement.getAttribute('data-lang') || 'pl';
    var d = DICT[lang] || DICT.pl || {};
    var s = d[key];
    if (s === undefined) s = (DICT.pl || {})[key];
    if (s === undefined) s = key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.replace('{' + k + '}', vars[k]);
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

    if (prev !== lang && !silent) root.classList.add('lang-swap');

    var map = [
      ['[data-i18n]', 'text'],
      ['[data-i18n-html]', 'html'],
      ['[data-i18n-aria]', 'aria']
    ];
    map.forEach(function (m) {
      $$(m[0]).forEach(function (el) {
        var sel = m[0];
        var key = sel === '[data-i18n]' ? el.getAttribute('data-i18n')
          : sel === '[data-i18n-html]' ? el.getAttribute('data-i18n-html')
          : el.getAttribute('data-i18n-aria');
        var val = t(key);
        if (m[1] === 'html') el.innerHTML = val;
        else if (m[1] === 'aria') el.setAttribute('aria-label', val);
        else el.textContent = val;
        el.classList.add('swapped');
      });
    });

    /* page meta */
    var d = DICT[lang] || DICT.pl;
    if (d) {
      document.title = d.title || document.title;
      var md = $('meta[name="description"]');
      if (md && d.desc) md.setAttribute('content', d.desc);
    }

    /* auto-currency: the language's country gets its currency */
    if (LANG_CUR[lang]) applyCurrency(LANG_CUR[lang]);

    /* pressed states */
    $$('button[data-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false');
    });

    /* re-run dynamic renders that depend on language */
    if (prev !== lang) {
      if (window.SP_I18N_HOOKS) window.SP_I18N_HOOKS.forEach(function (fn) { try { fn(lang); } catch (e) { /* noop */ } });
      /* numbers with locales */
      if (window.SP_ON_LANG) window.SP_ON_LANG();
      requestAnimationFrame(function () {
        root.classList.remove('lang-swap');
        if (window.gsap && window.ScrollTrigger) ScrollTrigger.refresh();
      });
    }
    store.set('sp_lang', lang);
  }

  function initLang() {
    var url = new URLSearchParams(location.search).get('lang');
    var lang = url || store.get('sp_lang', 'pl');
    applyLang(lang, true);
    $$('button[data-lang]').forEach(function (b) {
      b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
    });
  }
  initLang();

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

  /* ---------------- nav ---------------- */
  var nav = $('#nav');
  var lastY = 0;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    nav.classList.toggle('scrolled', y > 24);
    nav.classList.toggle('hide', y > lastY && y > 200 && !menuOpen);
    lastY = y;
  }, { passive: true });

  /* mobile menu */
  var menu = $('#menu');
  var burger = $('#burger');
  var menuOpen = false;
  function setMenu(open) {
    menuOpen = open;
    menu.hidden = !open;
    menu.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  if (burger) burger.addEventListener('click', function () { setMenu(!menuOpen); });
  $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menuOpen) setMenu(false);
  });

  /* ---------------- tickers (countdown, locale aware) ---------------- */
  function localeOf() {
    var lang = document.documentElement.getAttribute('data-lang') || 'pl';
    return { pl: 'pl-PL', en: 'en-GB', de: 'de-DE', hr: 'hr-HR', ro: 'ro-RO' }[lang] || 'pl-PL';
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function tickAll() {
    $$('.ticker-clock').forEach(function (el) {
      var dl = el.getAttribute('data-deadline');
      if (!dl) return;
      var ms = new Date(dl).getTime() - Date.now();
      if (isNaN(ms)) return;
      if (ms <= 0) { el.textContent = '00:00:00'; return; }
      var s = Math.floor(ms / 1000);
      var days = Math.floor(s / 86400);
      var h = Math.floor((s % 86400) / 3600);
      var m = Math.floor((s % 3600) / 60);
      var sec = s % 60;
      var loc2 = localeOf();
      var dTxt = days > 0 ? days.toLocaleString(loc2) + 'd ' : '';
      el.textContent = dTxt + pad(h) + ':' + pad(m) + ':' + pad(sec);
    });
  }
  tickAll();
  setInterval(tickAll, 1000);

  /* ---------------- currency toggle (prices + card) ---------------- */
  function currencyOf() { return store.get('sp_cur', LANG_CUR[document.documentElement.getAttribute('data-lang') || 'pl'] || 'pln'); }
  function applyCurrency(cur) {
    store.set('sp_cur', cur);
    $$('[data-price]').forEach(function (el) {
      el.textContent = cur === 'eur' ? el.getAttribute('data-eur') : cur === 'ron' ? el.getAttribute('data-ron') : el.getAttribute('data-pln');
    });
    $$('.plans-toggle button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-cur') === cur ? 'true' : 'false');
    });
    /* currency symbol = text node right after the [data-price] span */
    var sym = CUR_SYM[cur] || CUR_SYM.pln;
    $$('[data-price]').forEach(function (el) {
      var n = el.nextSibling;
      if (n && n.nodeType === 3) n.textContent = sym;
    });
  }
  $$('.plans-toggle button').forEach(function (b) {
    b.addEventListener('click', function () { applyCurrency(b.getAttribute('data-cur')); });
  });
  applyCurrency(currencyOf());

  /* ---------------- waitlist form ---------------- */
  /* Put your real endpoint here (Formspree/Netlify/Polar), leave empty for local-only */
  var FORM_ENDPOINT = '';
  var waitform = $('#waitform');
  if (waitform) {
    waitform.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('#w-email');
      var consent = $('#w-consent');
      if (!email.value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) {
        email.setAttribute('aria-invalid', 'true');
        email.focus();
        return;
      }
      email.removeAttribute('aria-invalid');
      if (!consent.checked) { consent.focus(); return; }
      /* honeypot: bots fill company */
      if (waitform.company && waitform.company.value) return;
      var list = [];
      try { list = JSON.parse(store.get('sp_waitlist', '[]')); } catch (err) { list = []; }
      list.push({ email: email.value, country: $('#w-country').value, lang: document.documentElement.getAttribute('data-lang'), at: Date.now() });
      store.set('sp_waitlist', JSON.stringify(list));
      if (FORM_ENDPOINT) {
        var body = new URLSearchParams({ email: email.value, country: $('#w-country').value });
        fetch(FORM_ENDPOINT, { method: 'POST', body: body, mode: 'no-cors' }).catch(function () { /* offline-safe */ });
      }
      var btn = waitform.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      $('#wait-ok').classList.add('show');
      waitform.reset();
    });
  }

  /* ---------------- modal (email unlock) ---------------- */
  var modal = $('#modal');
  function openModal() {
    modal.classList.add('open');
    var inp = $('#modal-email');
    if (inp) setTimeout(function () { inp.focus(); }, 60);
  }
  function closeModal() { modal.classList.remove('open'); }
  if (modal) {
    $('#modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
      /* focus trap while modal is open */
      if (e.key === 'Tab' && modal.classList.contains('open')) {
        var f = $$('button, input, select, a[href]', modal).filter(function (el) { return !el.disabled && el.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    $('#modal-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var em = $('#modal-email');
      if (!em.value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em.value)) { em.setAttribute('aria-invalid', 'true'); return; }
      store.set('sp_lead_email', em.value);
      store.set('sp_runs', String(-3));           /* +3 bonus runs */
      window.SPDemo && window.SPDemo.onBonus && window.SPDemo.onBonus();
      closeModal();
    });
  }
  window.SPOpenModal = openModal;

  /* ---------------- footer year + misc ---------------- */
  $$('.footer-bottom .mono').forEach(function (el) {
    el.textContent = el.textContent.replace('2026', String(new Date().getFullYear()));
  });

  /* expose tiny helpers for other modules */
  window.SPStore = store;
  window.SPLocale = localeOf;
})();
