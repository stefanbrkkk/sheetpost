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
  /* Currency changes are broadcast the same way language changes are, so a
     module that cares (checkout.js needs to know when the reader picks a
     currency the gateway cannot bill in) can listen without reaching in. */
  window.SP_CUR_HOOKS = window.SP_CUR_HOOKS || [];
  var store = {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v === null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: preferences just don't persist */ } }
  };

  /* Anything already on screen is marked revealed BEFORE .no-js comes off,
     in this same task, so the browser never gets a frame in between.

     Without this the largest element on the page went transparent right after
     it had already been painted: the markup ships with html.no-js, which
     forces [data-reveal] visible, and dropping that class handed those
     elements back to `[data-reveal] { opacity: 0 }` until an
     IntersectionObserver callback could add .in a frame or two later. The
     hero headline measured opacity 0 at 377ms, under 0.5 until 612ms and only
     settled at about 1059ms: painted, erased, then faded back in. That is the
     LCP element, and the erasing was free of charge.

     Off-screen elements are untouched and still animate in on scroll, and the
     hero's own intro still plays: it animates the headline's line masks by
     transform, and its supporting copy has its own tweens. */
  (function () {
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var onscreen = document.querySelectorAll('[data-reveal]');
    for (var i = 0; i < onscreen.length; i++) {
      var r = onscreen[i].getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) onscreen[i].classList.add('in');
    }
  })();
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

  /* Plural rules. Polish and Croatian need three forms, Romanian needs three,
     English and German two. A dictionary value carrying "|" declares its forms
     in the order one | few | many. */
  var PLURAL = {
    pl: function (n) {
      if (n === 1) return 0;
      var m10 = n % 10, m100 = n % 100;
      return (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) ? 1 : 2;
    },
    ro: function (n) {
      if (n === 1) return 0;
      var m100 = n % 100;
      return (n === 0 || (m100 >= 1 && m100 <= 19)) ? 1 : 2;
    },
    en: function (n) { return n === 1 ? 0 : 2; }
  };
  /* Croatian is not Polish here. Polish takes the "one" form only at exactly
     1; Croatian takes it whenever n % 10 is 1 and n % 100 is not 11, so 21,
     31 and 101 are "one" forms. Borrowing the Polish selector put 21 into the
     many form. */
  PLURAL.hr = function (n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 0;
    if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return 1;
    return 2;
  };
  PLURAL.de = PLURAL.en;

  function t(key, vars) {
    var lang = document.documentElement.getAttribute('data-lang') || 'pl';
    var d = DICT[lang] || DICT.pl || {};
    var s = d[key];
    if (s === undefined) s = (DICT.pl || {})[key];
    if (s === undefined) s = key;
    if (vars) {
      if (s.indexOf('|') >= 0) {
        var count = vars.n !== undefined ? vars.n : vars.r;
        if (count !== undefined) {
          var forms = s.split('|');
          var idx = (PLURAL[lang] || PLURAL.en)(Number(count));
          s = forms[Math.min(idx, forms.length - 1)];
        } else {
          s = s.split('|')[0];
        }
      }
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
    window.SP_CUR_HOOKS.forEach(function (fn) {
      try { fn(cur); } catch (e) { /* one bad hook must not stop the swap */ }
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
    /* Siblings arrive as a group, not as one flat cut: --rv is the element's
       position among the reveals that share its parent, and base.css turns
       that into a delay. Set through CSSOM, so the strict CSP is unaffected. */
    var groups = new Map();
    revealEls.forEach(function (el) {
      var parent = el.parentElement;
      var n = groups.get(parent) || 0;
      groups.set(parent, n + 1);
      if (n) el.style.setProperty('--rv', String(Math.min(n, 6)));
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { if (!el.classList.contains('in')) io.observe(el); });
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
    /* the root is the scroll container here, because it sets overflow-x: clip
       to contain the wide sections, and overflow only propagates from body to
       the viewport while the root's own overflow is visible. Setting it on
       body alone left the page scrolling behind the open menu. */
    /* The overlay is z-index 90 and the header is 60, so the burger that
       opened the menu was painted underneath it and could not be tapped
       again. Escape closed the menu and so did tapping a link, but a phone
       has no Escape key: a reader who opened the menu and changed their mind
       had no way out. The header rides above the overlay while it is open,
       which is also what the burger's own aria-expanded has always claimed. */
    if (nav) nav.classList.toggle('menu-open', open);
    document.documentElement.classList.toggle('is-locked', open);
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
      /* the paper palette only exists together with the paper surface, and
         the surface only exists once the header is scrolled */
      nav.classList.toggle('nav--paper', y > 24 && overPaper(nav.getBoundingClientRect().height || 68));
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

  /* ---------------- smooth in-page navigation ----------------
     Done here rather than with CSS `scroll-behavior: smooth`, which corrupts
     ScrollTrigger's measurements: it restores the scroll position while it
     measures, and a smooth restore animates instead of landing. */
  function anchorTop(el) {
    var navH = nav ? nav.getBoundingClientRect().height : 0;
    return Math.max(0, el.getBoundingClientRect().top + window.scrollY - navH - 20);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a || a.getAttribute('href') === '#') return;
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    var id = a.getAttribute('href').slice(1);
    var target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    window.scrollTo({ top: anchorTop(target), behavior: reduced ? 'auto' : 'smooth' });
    if (history.replaceState) history.replaceState(null, '', '#' + id);
    else location.hash = id;
    /* keyboard and screen-reader users have to land there too */
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
  /* deep links land clear of the header as well */
  window.addEventListener('load', function () {
    if (!location.hash) return;
    var target = document.getElementById(location.hash.slice(1));
    if (target) setTimeout(function () { window.scrollTo({ top: anchorTop(target), behavior: 'auto' }); }, 60);
  });

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
          /* Say what actually happened. With no endpoint configured the
             address never leaves the browser, so promising "you are on the
             list" is a promise nothing can keep. The launch copy comes back
             on its own the moment formEndpoint is set. */
          var okText = ok.querySelector('[data-i18n]');
          if (okText) {
            var key = FORM_ENDPOINT ? 'cta_ok' : 'cta_ok_local';
            okText.setAttribute('data-i18n', key);
            okText.textContent = t(key);
          }
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
  window.SPCurrency = currencyOf;
})();
