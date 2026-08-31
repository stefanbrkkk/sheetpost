/* ============================================================
   SHEETPOST — motion: GSAP choreography.
   One easing family, one load sequence, purposeful scroll.
   Everything here is optional: if GSAP fails to load, or the
   visitor asks for reduced motion, the page must still read as
   a finished document. That is why every effect is additive and
   every "hidden" start state is set from JS, never from CSS.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = reducedMQ.matches;
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var t = window.SP_T || function (k) { return k; };

  if (hasGsap) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
  }

  /* ================================================================
     1. HERO CANVAS — the cell field (pointer-reactive grid)
     ================================================================ */
  (function cellsCanvas() {
    var canvas = $('#cells');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var cells = [];
    var W = 0, H = 0, DPR = 1;
    var running = false, raf = 0;
    var pointer = { x: -9999, y: -9999 };

    function build() {
      var rect = canvas.parentElement.getBoundingClientRect();
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      /* Size the cells to the budget instead of sampling a denser grid:
         sampling drops whole columns whenever cols is a multiple of the
         step, which reads as a rendering fault. */
      var budget = W < 640 ? 200 : 340;
      var size = Math.max(38, Math.round(Math.sqrt((W * H) / budget)));
      var cols = Math.ceil(W / size) + 1;
      var rows = Math.ceil(H / size) + 1;
      cells = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var i = r * cols + c;
          cells.push({ x: c * size, y: r * size, s: size, a: 0, ph: (i * 0.7331) % (Math.PI * 2) });
        }
      }
    }

    function draw(now, settle) {
      ctx.clearRect(0, 0, W, H);
      var t2 = now / 1000;
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        var dx = c.x - pointer.x, dy = c.y - pointer.y;
        var dist2 = dx * dx + dy * dy;
        var prox = Math.max(0, 1 - dist2 / (240 * 240));
        var breathe = 0.5 + 0.5 * Math.sin(t2 * 0.6 + c.ph);
        var a = 0.028 + breathe * 0.02 + prox * 0.30;
        /* a still frame has no time to ease in, so land on the target */
        c.a = settle ? a : c.a + (a - c.a) * 0.14;
        ctx.fillStyle = c.a > 0.045
          ? 'rgba(62,207,142,' + c.a.toFixed(3) + ')'
          : 'rgba(206,244,220,' + c.a.toFixed(3) + ')';
        ctx.fillRect(c.x + 6, c.y + 6, c.s - 12, c.s - 12);
      }
      raf = running ? requestAnimationFrame(draw) : 0;
    }
    function still() { draw(0, true); }

    function start() { if (!running) { running = true; raf = requestAnimationFrame(draw); } }
    function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    build();
    var rebuild;
    window.addEventListener('resize', function () {
      clearTimeout(rebuild);
      rebuild = setTimeout(function () {
        build();
        cacheRect();
        if (!running) still();          /* a still field must survive a resize */
      }, 160);
    }, { passive: true });

    /* the canvas is hidden in CSS so it can never flash unpainted */
    requestAnimationFrame(function () { canvas.classList.add('ready'); });

    if (reduced) { still(); return; }

    /* cache the rect: reading it per pointermove forces a layout on every
       mouse move, including while the field is stopped */
    var rect = { left: 0, top: 0 };
    function cacheRect() { rect = canvas.getBoundingClientRect(); }
    cacheRect();
    window.addEventListener('scroll', cacheRect, { passive: true });
    window.addEventListener('pointermove', function (e) {
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    }, { passive: true });
    window.addEventListener('pointerleave', function () { pointer.x = -9999; pointer.y = -9999; });

    var visible = true;
    function syncField() {
      if (visible && !document.hidden) start(); else stop();
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { visible = e.isIntersecting; });
      syncField();
    }, { threshold: 0 });
    io.observe(canvas);
    document.addEventListener('visibilitychange', syncField);
    start();
  })();

  /* ================================================================
     2. THE MACHINE — spreadsheet folds into an official document
     ================================================================ */
  (function machine() {
    var stage = $('#machine');
    if (!stage) return;
    var sheet = $('#m-sheet');
    var status = $('#sheet-status');
    var cursor = $('#sheet-cursor');
    var stamp = $('#m-stamp');
    var check = $('#portal-check');
    var ksefEl = $('#portal-ksef');
    var caption = $('#m-caption');

    /* every visible string in here comes from the dictionary */
    function fileName() { return t('mini_file') || 'arkusz.xlsx'; }
    function mappedLine() { return t('m_status_ok'); }

    function staticEnd() {
      $$('.cell[data-t]', sheet).forEach(function (c) { c.textContent = c.getAttribute('data-t'); });
      stage.setAttribute('data-phase', 'receipt');
      stamp.classList.add('hit');
      check.classList.add('show');
      if (status) { status.textContent = ''; status.appendChild(okSpan(mappedLine())); }
      if (caption) caption.style.display = 'none';
    }
    function okSpan(text) {
      var s = document.createElement('span');
      s.className = 'ok';
      s.textContent = text;
      return s;
    }

    if (reduced) {
      staticEnd();
      if (window.SP_I18N_HOOKS) window.SP_I18N_HOOKS.push(staticEnd);
      return;
    }

    var token = 0;
    var inView = false;
    var live = [];                 /* every interval this run owns */

    function stopLive() { live.forEach(clearInterval); live = []; }
    function track(iv) { live.push(iv); return iv; }

    function sleep(ms, tok) {
      return new Promise(function (res) { setTimeout(function () { res(tok === token); }, ms); });
    }
    /* type() and scramble() outlive a token change unless they are tracked;
       an untracked typer keeps writing the OLD language over the new run */
    function type(el, text, tok) {
      return new Promise(function (res) {
        var i = 0;
        var iv = track(setInterval(function () {
          if (tok !== token) { clearInterval(iv); res(); return; }
          i++;
          el.textContent = text.slice(0, i);
          if (i >= text.length) { clearInterval(iv); res(); }
        }, Math.max(10, 22 - text.length / 4)));
      });
    }
    function scramble(el, finalText, tok) {
      var chars = '0123456789ABCDEF';
      var frames = 26;
      var f = 0;
      var iv = track(setInterval(function () {
        if (tok !== token) { clearInterval(iv); return; }
        f++;
        var out = '';
        for (var i = 0; i < finalText.length; i++) {
          out += (finalText[i] === '-' || i < finalText.length - f) ? finalText[i] : chars[(Math.random() * 16) | 0];
        }
        el.textContent = out;
        if (f >= frames) { clearInterval(iv); el.textContent = finalText; }
      }, 42));
    }
    function moveCursor(cell) {
      if (!cursor || !cell) return;
      cursor.style.transform = 'translate(' + cell.offsetLeft + 'px,' + cell.offsetTop + 'px)';
      cursor.style.width = cell.offsetWidth + 'px';
      cursor.style.height = cell.offsetHeight + 'px';
      $$('.cell', sheet).forEach(function (c) { c.classList.remove('hot'); });
      cell.classList.add('hot');
    }

    /* token is advanced from IntersectionObserver / visibilitychange
       callbacks, so the loop condition has to be read through a call */
    function stillMine(my) { return my === token; }

    async function play() {
      stopLive();
      var my = ++token;
      var rows = $$('[data-row]', sheet);

      while (stillMine(my)) {
        stage.setAttribute('data-phase', 'grid');
        stamp.classList.remove('hit');
        check.classList.remove('show');
        $$('.cell[data-t]', sheet).forEach(function (c) { c.textContent = ''; });
        $$('.cell', sheet).forEach(function (c) { c.classList.remove('hot'); });
        if (status) status.textContent = fileName();
        if (!(await sleep(900, my))) return;

        for (var r = 0; r < rows.length; r++) {
          var cells = $$('.cell[data-t]', rows[r]);
          for (var cIdx = 0; cIdx < cells.length; cIdx++) {
            moveCursor(cells[cIdx]);
            await type(cells[cIdx], cells[cIdx].getAttribute('data-t'), my);
            if (!(await sleep(90, my))) return;
          }
        }
        if (status) { status.textContent = ''; status.appendChild(okSpan(mappedLine())); }
        if (!(await sleep(1000, my))) return;

        stage.setAttribute('data-phase', 'fold');
        if (!(await sleep(1150, my))) return;

        stage.setAttribute('data-phase', 'stamp');
        stamp.classList.add('hit');
        stage.classList.add('shake');
        setTimeout(function () { stage.classList.remove('shake'); }, 340);
        if (!(await sleep(1000, my))) return;

        stage.setAttribute('data-phase', 'file');
        if (!(await sleep(750, my))) return;

        stage.setAttribute('data-phase', 'receipt');
        check.classList.add('show');
        scramble(ksefEl, '9876543210-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-A1B2C3D4E5-0123456789', my);
        if (!(await sleep(3400, my))) return;
      }
    }

    function sync() {
      if (inView && !document.hidden) play();
      else { token++; stopLive(); }       /* invalidates the running loop */
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { inView = e.isIntersecting; });
      sync();
    }, { threshold: 0.25 });
    io.observe(stage);
    document.addEventListener('visibilitychange', sync);

    /* the sheet's sample cells are translated: restart so they retype */
    if (window.SP_I18N_HOOKS) {
      window.SP_I18N_HOOKS.push(function () {
        if (inView && !document.hidden) play(); else token++;
      });
    }
  })();

  /* ================================================================
     3. SCROLL CHOREOGRAPHY
     ================================================================ */
  /* The marquee is content, not decoration: build it in every mode.
     The tween travels -50%, so the track must be at least twice the
     viewport or a wide screen sees the empty tail. */
  (function marquee() {
    var mq = $('#marquee');
    if (!mq || mq.dataset.duplicated) return;
    var original = Array.prototype.slice.call(mq.children);
    function clone() {
      original.forEach(function (n) {
        var c = n.cloneNode(true);
        /* the copies exist for the loop, not for a second reading */
        c.setAttribute('aria-hidden', 'true');
        mq.appendChild(c);
      });
    }
    var copies = 1;
    while (mq.scrollWidth < window.innerWidth * 2 && copies < 8) { clone(); copies++; }
    clone();                            /* the seamless second half */
    mq.dataset.duplicated = '1';
  })();

  if (hasGsap && !reduced) {
    var mm = gsap.matchMedia();
    var teardown = [];

    /* --- marquee drift (all viewports) --- */
    (function () {
      var mq = $('#marquee');
      if (!mq) return;
      var tween = gsap.to(mq, { xPercent: -50, ease: 'none', duration: 42, repeat: -1 });
      var wrap = mq.parentElement;
      var slow = function () { tween.timeScale(0.2); };
      var fast = function () { tween.timeScale(1); };
      wrap.addEventListener('pointerenter', slow);
      wrap.addEventListener('pointerleave', fast);
      wrap.addEventListener('focusin', slow);
      wrap.addEventListener('focusout', fast);
      teardown.push(function () {
        tween.kill();
        wrap.removeEventListener('pointerenter', slow);
        wrap.removeEventListener('pointerleave', fast);
        wrap.removeEventListener('focusin', slow);
        wrap.removeEventListener('focusout', fast);
      });
    })();

    /* --- mandate wall: rows arrive as a stack, no drift --- */
    (function () {
      var rows = $$('#wall .wall-row');
      if (!rows.length) return;
      gsap.set(rows, { opacity: 0, y: 34 });
      ScrollTrigger.batch(rows, {
        start: 'top 90%',
        once: true,
        onEnter: function (batch) {
          gsap.to(batch, {
            opacity: 1, y: 0, duration: 0.7, stagger: 0.07,
            ease: 'power3.out', overwrite: true,
            clearProps: 'transform'
          });
        }
      });
    })();

    /* --- the rig: laptop opens, maps, validates, files --- */
    (function () { var kill = buildRig(); if (kill) teardown.push(kill); })();

    /* --- morph intro + drag --- */
    mm.add('(min-width: 761px)', function () {
      var morph = $('#morph');
      if (!morph) return;
      var setSplit = function (v) { morph.style.setProperty('--split', v + '%'); };
      ScrollTrigger.create({
        trigger: morph, start: 'top 78%', once: true,
        onEnter: function () { setSplit(52); }   /* instant set: an animated grid reflow caused CLS */
      });
      var range = $('#morph-range');
      var dragging = false;
      var onDrag = function (clientX) {
        var r = morph.getBoundingClientRect();
        var v = Math.min(80, Math.max(20, ((clientX - r.left) / r.width) * 100));
        setSplit(v);
        if (range) range.value = String(Math.round(v));
      };
      var down = function (e) {
        if (e.target.classList.contains('morph-range') || e.target.closest('.morph-handle')) {
          dragging = true;
          onDrag(e.clientX);
        }
      };
      var move = function (e) { if (dragging) onDrag(e.clientX); };
      var up = function () { dragging = false; };
      morph.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      var input = function () { setSplit(Number(range.value)); };
      if (range) range.addEventListener('input', input);
      return function () {
        morph.removeEventListener('pointerdown', down);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (range) range.removeEventListener('input', input);
      };
    });

    /* --- the bridge: the document feeds up over the ink world --- */
    (function () {
      var bridge = $('#fold');
      var sheetEl = $('#fold-sheet');
      if (!bridge || !sheetEl) return;
      /* GSAP owns the hidden state: if this script fails, the sheet stays
         visible (no empty-void failure mode) */
      gsap.set(sheetEl, { yPercent: 100 });
      gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: bridge, start: 'top bottom', end: 'bottom bottom',
          scrub: 0.5, invalidateOnRefresh: true
        }
      })
        .fromTo(sheetEl, { yPercent: 100 }, { yPercent: 0 }, 0)
        .to('.bridge-backdrop', { autoAlpha: 0, scale: 0.96, transformOrigin: '50% 100%' }, 0)
        .fromTo('.fold-content > div', { y: 18 }, { y: 0, stagger: 0.08, duration: 0.3, ease: 'power1.out' }, 0.45);
    })();

    /* --- lockcard tilt + sheen (fine pointers only) --- */
    mm.add('(pointer: fine)', function () {
      var scene = $('#lockcard-scene');
      var card = $('#lockcard');
      if (!scene || !card) return;
      var move = function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        gsap.to(card, { rotateY: px * 10, rotateX: -py * 8, duration: 0.5, ease: 'power2.out' });
        card.style.setProperty('--mx', ((px + 0.5) * 100).toFixed(1) + '%');
        card.style.setProperty('--my', ((py + 0.5) * 100).toFixed(1) + '%');
      };
      var leave = function () { gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.8, ease: 'power3.out' }); };
      scene.addEventListener('pointermove', move);
      scene.addEventListener('pointerleave', leave);
      return function () {
        scene.removeEventListener('pointermove', move);
        scene.removeEventListener('pointerleave', leave);
      };
    });

    /* --- magnetic CTAs (fine pointers only) --- */
    mm.add('(pointer: fine)', function () {
      var cleanups = [];
      $$('.magnetic').forEach(function (btn) {
        var xTo = gsap.quickTo(btn, 'x', { duration: 0.4, ease: 'power3.out' });
        var yTo = gsap.quickTo(btn, 'y', { duration: 0.4, ease: 'power3.out' });
        var move = function (e) {
          var r = btn.getBoundingClientRect();
          xTo((e.clientX - r.left - r.width / 2) * 0.22);
          yTo((e.clientY - r.top - r.height / 2) * 0.22);
        };
        var leave = function () { xTo(0); yTo(0); };
        btn.addEventListener('pointermove', move);
        btn.addEventListener('pointerleave', leave);
        cleanups.push(function () {
          btn.removeEventListener('pointermove', move);
          btn.removeEventListener('pointerleave', leave);
          gsap.set(btn, { x: 0, y: 0 });
        });
      });
      return function () { cleanups.forEach(function (fn) { fn(); }); };
    });

    /* --- steps minis: little live loops --- */
    (function () {
      var minis = $$('[data-mini]');
      if (!minis.length) return;
      var timer = 0;
      var minisIO = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var el = e.target;
          if (!e.isIntersecting) { el.dataset.off = '1'; return; }
          if (el.dataset.running === '1') { el.dataset.off = ''; return; }
          el.dataset.off = '';
          el.dataset.running = '1';
          var spans = $$('span:not(.m-arrow)', el);
          var idx = 0;
          var run = function () {
            if (el.dataset.off === '1') { el.dataset.running = ''; return; }
            spans.forEach(function (s, i2) { s.classList.toggle('lit', i2 <= idx); });
            idx = (idx + 1) % (spans.length + 2);
            /* one live timer per mini, replaced each tick — an array of ids
               would grow for as long as the section stays on screen */
            timer = setTimeout(run, 620);
            el._spTimer = timer;
          };
          run();
        });
      }, { threshold: 0.4 });
      minis.forEach(function (m2) { minisIO.observe(m2); });
      teardown.push(function () {
        minisIO.disconnect();
        minis.forEach(function (m2) { clearTimeout(m2._spTimer); m2.dataset.off = '1'; m2.dataset.running = ''; });
      });
    })();

    /* honour a visitor who turns Reduce Motion on mid-session */
    var onReduceChange = function (e) {
      if (!e.matches) return;
      teardown.forEach(function (fn) { try { fn(); } catch (err) { /* noop */ } });
      teardown = [];
      mm.revert();
      gsap.globalTimeline.pause();
      staticRig();
    };
    if (reducedMQ.addEventListener) reducedMQ.addEventListener('change', onReduceChange);
    else if (reducedMQ.addListener) reducedMQ.addListener(onReduceChange);
  }

  /* ================================================================
     4. THE RIG — one sticky stage, four beats
     Built as its own function so matchMedia can tear it down cleanly.
     ================================================================ */
  function buildRig() {
    var sec = $('#rig-sec');
    if (!sec) return;
    var inner = $('#rig-inner');
    var lid = $('#lap-lid');
    var spill = $('#lap-spill');
    var phone = $('#rig-phone');
    var stamp = $('#doc-stamp');
    var scan = $('#sv-scan');
    var beats = $$('.rig-beat', sec);
    var rail = $$('#rig-rail i');
    var maplines = $$('.mapline', sec);
    var checks = $$('.docchk', sec);
    var timers = [];
    var live = [inner, lid, phone, stamp, spill, scan].filter(Boolean);

    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function clearAll() { timers.forEach(clearTimeout); timers = []; }

    function setBeat(n) {
      if (sec.getAttribute('data-beat') === String(n)) return;
      sec.setAttribute('data-beat', String(n));
      beats.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-beat') === String(n)); });
      rail.forEach(function (r, i) { r.classList.toggle('on', i < n); });
      clearAll();
      if (n >= 2) maplines.forEach(function (m, i) { later(function () { m.classList.add('lit'); }, i * 130); });
      else maplines.forEach(function (m) { m.classList.remove('lit'); });
      if (n >= 3) checks.forEach(function (c, i) { later(function () { c.classList.add('on'); }, i * 100); });
      else checks.forEach(function (c) { c.classList.remove('on'); });
    }

    if (!inner || !lid) return;
    gsap.set(lid, { rotateX: -104, transformOrigin: '50% 100%' });
    gsap.set(inner, { rotateX: 16, scale: 0.86, y: 26 });
    if (phone) gsap.set(phone, { opacity: 0, y: 66, rotate: 8, scale: 0.9 });
    if (stamp) gsap.set(stamp, { opacity: 0, scale: 1.7, rotate: -8 });
    if (spill) gsap.set(spill, { opacity: 0 });
    setBeat(1);

    /* Beats are class-driven, so they are derived from progress rather than
       from timeline callbacks: scrubbing backwards has to rewind them too. */
    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: sec, start: 'top top', end: 'bottom bottom',
        scrub: 0.6, invalidateOnRefresh: true,
        onUpdate: function (self) {
          var p = self.progress;
          setBeat(p < 0.34 ? 1 : p < 0.55 ? 2 : p < 0.72 ? 3 : 4);
        }
      }
    });
    tl.to(lid, { rotateX: 0, duration: 1.4, ease: 'power2.out' }, 0)
      .to(inner, { rotateX: 6, scale: 1, y: 0, duration: 1.6, ease: 'power2.out' }, 0);
    if (spill) tl.to(spill, { opacity: 1, duration: 1.0 }, 0.5);
    if (scan) tl.fromTo(scan, { opacity: 0, top: '18%' }, { opacity: 0.9, top: '84%', duration: 1.1 }, 1.6)
      .to(scan, { opacity: 0, duration: 0.2 }, 2.7);
    tl.to(inner, { rotateX: 4, duration: 1.2 }, 3.0)
      .to(inner, { rotateX: 2, scale: 1.02, duration: 1.2 }, 4.7);
    if (stamp) tl.to(stamp, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' }, 6.1);
    if (phone) tl.to(phone, { opacity: 1, y: 0, rotate: -3, scale: 1, duration: 0.9, ease: 'power3.out' }, 6.2);
    tl.to(inner, { scale: 0.97, duration: 1.0 }, 7.3);

    return function () {
      clearAll();
      if (tl.scrollTrigger) tl.scrollTrigger.kill();
      tl.kill();
      if (live.length) gsap.set(live, { clearProps: 'all' });
    };
  }

  /* if GSAP is missing or motion is reduced, the rig shows its payoff */
  function staticRig() {
    var sec = $('#rig-sec');
    if (!sec) return;
    sec.setAttribute('data-beat', '4');
    $$('.rig-beat', sec).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-beat') === '4'); });
    $$('#rig-rail i').forEach(function (r) { r.classList.add('on'); });
    $$('.mapline', sec).forEach(function (m) { m.classList.add('lit'); });
    $$('.docchk', sec).forEach(function (c) { c.classList.add('on'); });
  }
  if (!hasGsap || reduced) staticRig();

  /* ================================================================
     5. LOAD CHOREOGRAPHY (once fonts are ready)
     The hero's start states live HERE, not in CSS, so a GSAP failure
     can never leave the value proposition invisible.
     ================================================================ */
  function intro() {
    var heroReveals = $$('.hero [data-reveal]');
    /* the intro owns these: take them out of the scroll-reveal system first,
       otherwise GSAP records their CSS opacity:0 as the "natural" end value
       and animates 0 -> 0. */
    heroReveals.forEach(function (el) { el.classList.add('in'); });

    if (reduced || !hasGsap) return;

    var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('.nav', { yPercent: -100, duration: 0.55 }, 0)
      .from('#nav .brand, #nav .nav-links a, #nav .nav-right > *', { opacity: 0, y: -8, stagger: 0.04, duration: 0.4 }, 0.1);

    var lines = $$('#hero-h1 .hl-i');
    if (lines.length) {
      tl.from(lines, { yPercent: 112, duration: 0.9, stagger: 0.09, clearProps: 'transform' }, 0.15);
    }
    tl.from('.hero-copy .chip', { opacity: 0, y: 10, duration: 0.5, clearProps: 'opacity,transform' }, 0.35)
      .from('.hero-sub', { opacity: 0, y: 14, duration: 0.6, clearProps: 'opacity,transform' }, 0.45)
      .from('.hero-cta .btn', { opacity: 0, y: 12, stagger: 0.07, duration: 0.5, clearProps: 'opacity,transform' }, 0.55)
      .from('.hero-meta', { opacity: 0, duration: 0.5, clearProps: 'opacity' }, 0.65)
      .from('#machine', { opacity: 0, y: 26, scale: 0.97, duration: 0.9, clearProps: 'all' }, 0.4)
      .from('.hero-scroll', { opacity: 0, duration: 0.6, clearProps: 'opacity' }, 0.9);
  }

  if (document.fonts && document.fonts.ready) {
    /* never let a font that refuses to resolve hold the hero hostage */
    var fired = false;
    var go = function () { if (fired) return; fired = true; requestAnimationFrame(intro); };
    document.fonts.ready.then(go);
    setTimeout(go, 1600);
  } else {
    window.addEventListener('load', intro);
  }
})();
