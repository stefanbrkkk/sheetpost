/* ============================================================
   SHEETPOST V2 — motion: GSAP choreography.
   One easing family, one load sequence, purposeful scroll.
   matchMedia gates: reduced-motion + desktop + pointer:fine.
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var t = window.SP_T || function (k) { return k; };

  if (hasGsap) gsap.registerPlugin(ScrollTrigger);
  if (window.SplitText && hasGsap) gsap.registerPlugin(SplitText);
  ScrollTrigger.config({ ignoreMobileResize: true });

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
      var size = 54;
      var cols = Math.ceil(W / size) + 1;
      var rows = Math.ceil(H / size) + 1;
      cells = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          cells.push({ x: c * size, y: r * size, s: size, a: 0, ph: Math.random() * Math.PI * 2 });
        }
      }
      /* budget cap */
      while (cells.length > 320) cells.splice(Math.floor(cells.length / 2), 1);
    }

    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      var t2 = now / 1000;
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        var dx = c.x - pointer.x, dy = c.y - pointer.y;
        var dist2 = dx * dx + dy * dy;
        var prox = Math.max(0, 1 - dist2 / (240 * 240));
        var breathe = 0.5 + 0.5 * Math.sin(t2 * 0.6 + c.ph);
        var a = 0.028 + breathe * 0.02 + prox * 0.30;
        c.a += (a - c.a) * 0.14;
        if (c.a > 0.045) {
          ctx.fillStyle = 'rgba(62,207,142,' + c.a.toFixed(3) + ')';
        } else {
          ctx.fillStyle = 'rgba(206,244,220,' + (c.a).toFixed(3) + ')';
        }
        ctx.fillRect(c.x + 6, c.y + 6, c.s - 12, c.s - 12);
      }
      raf = running ? requestAnimationFrame(draw) : 0;
    }

    function start() { if (!running) { running = true; raf = requestAnimationFrame(draw); } }
    function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    build();
    window.addEventListener('resize', function () { build(); }, { passive: true });
    if (!reduced) {
      window.addEventListener('pointermove', function (e) {
        var r = canvas.getBoundingClientRect();
        pointer.x = e.clientX - r.left;
        pointer.y = e.clientY - r.top;
      }, { passive: true });
      window.addEventListener('pointerleave', function () { pointer.x = -9999; pointer.y = -9999; });
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.isIntersecting ? start() : stop(); });
      }, { threshold: 0 });
      io.observe(canvas);
      document.addEventListener('visibilitychange', function () {
        document.hidden ? stop() : start();
      });
      start();
    } else {
      /* static single frame */
      draw(0);
      stop();
    }
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

    function staticEnd() {
      $$('.cell[data-t]', sheet).forEach(function (c) { c.textContent = c.getAttribute('data-t'); });
      stage.setAttribute('data-phase', 'receipt');
      stamp.classList.add('hit');
      check.classList.add('show');
      if (status) status.innerHTML = '<span class="ok">' + (t('mini_row1').replace(': OK', 's: OK')) + '</span>';
      if (caption) caption.style.display = 'none';
      return;
    }
    if (reduced) { staticEnd(); return; }

    var token = 0;
    var hidden = document.hidden;

    function sleep(ms, tok) {
      return new Promise(function (res) { setTimeout(function () { res(tok === token); }, ms); });
    }
    function type(el, text) {
      return new Promise(function (res) {
        var i = 0;
        var iv = setInterval(function () {
          i++;
          el.textContent = text.slice(0, i);
          if (i >= text.length) { clearInterval(iv); res(); }
        }, Math.max(10, 22 - text.length / 4));
      });
    }
    function scramble(el, finalText) {
      var chars = '0123456789ABCDEF';
      var frames = 26;
      var f = 0;
      var iv = setInterval(function () {
        f++;
        var out = '';
        for (var i = 0; i < finalText.length; i++) {
          out += (finalText[i] === '-' || i < finalText.length - f) ? finalText[i] : chars[(Math.random() * 16) | 0];
        }
        el.textContent = out;
        if (f >= frames) { clearInterval(iv); el.textContent = finalText; }
      }, 42);
    }
    function moveCursor(cell) {
      if (!cursor || !cell) return;
      cursor.style.transform = 'translate(' + cell.offsetLeft + 'px,' + cell.offsetTop + 'px)';
      cursor.style.width = cell.offsetWidth + 'px';
      cursor.style.height = cell.offsetHeight + 'px';
      $$('.cell', sheet).forEach(function (c) { c.classList.remove('hot'); });
      cell.classList.add('hot');
    }

    async function play() {
      var my = ++token;
      var rows = $$('[data-row]', sheet);
      var fileName = (t('mini_file') || 'arkusz.xlsx').replace('.xlsx', '');

      while (my === token) {
        /* reset */
        stage.setAttribute('data-phase', 'grid');
        stamp.classList.remove('hit');
        check.classList.remove('show');
        $$('.cell[data-t]', sheet).forEach(function (c) { c.textContent = ''; });
        $$('.cell', sheet).forEach(function (c) { c.classList.remove('hot'); });
        if (status) status.textContent = fileName + '.xlsx';
        if (!(await sleep(900, my))) return;

        /* type rows */
        for (var r = 0; r < rows.length; r++) {
          var cells = $$('.cell[data-t]', rows[r]);
          for (var cIdx = 0; cIdx < cells.length; cIdx++) {
            moveCursor(cells[cIdx]);
            await type(cells[cIdx], cells[cIdx].getAttribute('data-t'));
            if (!(await sleep(90, my))) return;
          }
        }
        if (status) status.innerHTML = '<span class="ok">✓ 2 ' + (document.documentElement.getAttribute('data-lang') === 'pl' ? 'wiersze zmapowane · walidacja OK' : 'rows mapped · validation OK') + '</span>';
        if (!(await sleep(1000, my))) return;

        /* fold: sheet out, paper in */
        stage.setAttribute('data-phase', 'fold');
        if (!(await sleep(1150, my))) return;

        /* stamp */
        stage.setAttribute('data-phase', 'stamp');
        stamp.classList.add('hit');
        stage.classList.add('shake');
        setTimeout(function () { stage.classList.remove('shake'); }, 340);
        if (!(await sleep(1000, my))) return;

        /* file to portal */
        stage.setAttribute('data-phase', 'file');
        if (!(await sleep(750, my))) return;

        /* receipt */
        stage.setAttribute('data-phase', 'receipt');
        check.classList.add('show');
        scramble(ksefEl, '9876543210-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + 'A1B2C3D4E5-0123456789');
        if (!(await sleep(3400, my))) return;
      }
    }

    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && !hidden) play();
        else token++; /* stops the loop */
      });
    }, { threshold: 0.25 });
    io.observe(stage);
    document.addEventListener('visibilitychange', function () {
      hidden = document.hidden;
      if (hidden) token++;
      else if (!reduced) play();
    });
  })();

  /* ================================================================
     3. SCROLL CHOREOGRAPHY (desktop, motion allowed)
     ================================================================ */
  if (hasGsap && !reduced) {
    var mm = gsap.matchMedia();
    mm.add({ desktop: '(min-width: 861px)', fine: '(pointer: fine)' }, function (ctx) {
      var desktop = ctx.conditions.desktop;
      var fine = ctx.conditions.fine;

      /* --- wall rows: waves drifting as they enter --- */
      var rows = $$('#wall .wall-row');
      if (rows.length) {
        gsap.set(rows, { opacity: 0, y: 44 });
        ScrollTrigger.batch(rows, {
          start: 'top 88%',
          once: true,
          onEnter: function (batch) {
            gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out', overwrite: true });
          }
        });
        if (desktop) {
          rows.forEach(function (row, i) {
            gsap.to(row, {
              xPercent: (i % 2 === 0 ? -2.2 : 2.2),
              ease: 'none',
              scrollTrigger: { trigger: '#mandates', start: 'top bottom', end: 'bottom top', scrub: 1.2 }
            });
          });
        }
      }

      /* --- marquee: duplicate ONCE (idempotent — matchMedia may re-run) --- */
      var mq = $('#marquee');
      if (mq && !mq.dataset.duplicated) {
        mq.innerHTML += mq.innerHTML; /* duplicate for seamless loop */
        mq.dataset.duplicated = '1';
      }
      if (mq) {
        var mqTween = gsap.to(mq, { xPercent: -50, ease: 'none', duration: 42, repeat: -1 });
        mq.parentElement.addEventListener('pointerenter', function () { mqTween.timeScale(0.25); });
        mq.parentElement.addEventListener('pointerleave', function () { mqTween.timeScale(1); });
      }

      /* --- morph intro sweep + drag --- */
      var morph = $('#morph');
      if (morph) {
        var target = 52;
        var setSplit = function (v) { morph.style.setProperty('--split', v + '%'); };
        ScrollTrigger.create({
          trigger: morph, start: 'top 78%', once: true,
          onEnter: function () { setSplit(target); }  /* instant set: animated grid reflow caused CLS */
        });
        var range = $('#morph-range');
        var dragging = false;
        var onDrag = function (clientX) {
          var r = morph.getBoundingClientRect();
          var v = Math.min(80, Math.max(20, ((clientX - r.left) / r.width) * 100));
          setSplit(v);
          if (range) range.value = String(Math.round(v));
        };
        morph.addEventListener('pointerdown', function (e) {
          if (e.target.classList.contains('morph-range') || e.target.closest('.morph-handle')) {
            dragging = true;
            onDrag(e.clientX);
          }
        });
        window.addEventListener('pointermove', function (e) { if (dragging) onDrag(e.clientX); });
        window.addEventListener('pointerup', function () { dragging = false; });
        if (range) range.addEventListener('input', function () { setSplit(Number(range.value)); });
      }

      /* --- the bridge: document feed slide-up (all viewports, motion allowed) --- */
      var bridge = $('#fold');
      var sheetEl = $('#fold-sheet');
      if (bridge && sheetEl) {
        /* GSAP owns the hidden state: if this script fails, the sheet stays
           visible (no empty-void failure mode) */
        gsap.set(sheetEl, { yPercent: 100 });
        gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: bridge, start: 'top bottom', end: 'bottom bottom',
            scrub: 0.6, invalidateOnRefresh: true
          }
        })
        .fromTo(sheetEl, { yPercent: 100 }, { yPercent: 0 }, 0)
        .to('.bridge-backdrop', { autoAlpha: 0, scale: 0.96, transformOrigin: '50% 100%' }, 0)
        .fromTo('.fold-content > div',
          { y: 18 },
          { y: 0, stagger: 0.08, duration: 0.3, ease: 'power1.out' }, 0.45);
      }

      /* --- lockcard tilt + sheen --- */
      var scene = $('#lockcard-scene');
      var card = $('#lockcard');
      if (scene && card && fine) {
        scene.addEventListener('pointermove', function (e) {
          var r = card.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width - 0.5;
          var py = (e.clientY - r.top) / r.height - 0.5;
          gsap.to(card, { rotateY: px * 10, rotateX: -py * 8, duration: 0.5, ease: 'power2.out' });
          card.style.setProperty('--mx', ((px + 0.5) * 100).toFixed(1) + '%');
          card.style.setProperty('--my', ((py + 0.5) * 100).toFixed(1) + '%');
        });
        scene.addEventListener('pointerleave', function () {
          gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.8, ease: 'power3.out' });
        });
      }

      /* --- magnetic CTAs --- */
      if (fine) {
        $$('.magnetic').forEach(function (btn) {
          var xTo = gsap.quickTo(btn, 'x', { duration: 0.4, ease: 'power3.out' });
          var yTo = gsap.quickTo(btn, 'y', { duration: 0.4, ease: 'power3.out' });
          btn.addEventListener('pointermove', function (e) {
            var r = btn.getBoundingClientRect();
            xTo((e.clientX - r.left - r.width / 2) * 0.22);
            yTo((e.clientY - r.top - r.height / 2) * 0.22);
          });
          btn.addEventListener('pointerleave', function () { xTo(0); yTo(0); });
        });
      }

      /* --- steps minis: little live loops --- */
      var minis = $$('[data-mini]');
      if (minis.length) {
        var minisIO = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            var el = e.target;
            if (!e.isIntersecting) { el.dataset.off = '1'; return; }
            el.dataset.off = '';
            var spans = $$('span:not(.m-arrow)', el);
            var idx = 0;
            var run = function () {
              if (el.dataset.off === '1') return;
              spans.forEach(function (s, i2) { s.classList.toggle('lit', i2 <= idx); });
              idx = (idx + 1) % (spans.length + 2);
              setTimeout(run, 620);
            };
            run();
          });
        }, { threshold: 0.4 });
        minis.forEach(function (m2) { minisIO.observe(m2); });
      }
    });
  } else {
    /* reduced or no gsap: static-but-complete fallbacks */
    var mq2 = $('#marquee');
    if (mq2 && !mq2.dataset.duplicated) {
      mq2.innerHTML += mq2.innerHTML;
      mq2.dataset.duplicated = '1';
    }
  }

  /* ================================================================
     4. LOAD CHOREOGRAPHY (once fonts are ready)
     ================================================================ */
  function intro() {
    if (reduced || !hasGsap) return;
    var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('.nav', { yPercent: -100, duration: 0.55 }, 0)
      .from('#nav .brand, #nav .nav-links a, #nav .nav-right > *', { opacity: 0, y: -8, stagger: 0.04, duration: 0.4 }, 0.1);

    var h1 = $('#hero-h1');
    if (h1 && window.SplitText) {
      var split = SplitText.create(h1, { type: 'lines', mask: 'lines', aria: 'auto' });
      tl.from(split.lines, { yPercent: 112, duration: 0.9, stagger: 0.09 }, 0.15);
    }
    tl.from('.hero-copy .chip', { opacity: 0, y: 10, duration: 0.5 }, 0.35)
      .from('.hero-sub', { opacity: 0, y: 14, duration: 0.6 }, 0.45)
      .from('.hero-cta .btn', { opacity: 0, y: 12, stagger: 0.07, duration: 0.5 }, 0.55)
      .from('.hero-meta', { opacity: 0, duration: 0.5 }, 0.65)
      .from('#machine', { opacity: 0, y: 26, scale: 0.97, duration: 0.9, clearProps: 'all' }, 0.4)
      .from('.hero-bg canvas', { opacity: 0, duration: 1.1, clearProps: 'opacity' }, 0.3);

    /* ensure the reveal system doesn't double-hide hero elements */
    $$('.hero [data-reveal]').forEach(function (el) { el.classList.add('in'); });
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { requestAnimationFrame(intro); });
  } else {
    window.addEventListener('load', intro);
  }
})();
