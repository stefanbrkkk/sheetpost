/* Document language toggle for legal subpages (PL/EN). */
(function () {
  'use strict';
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem('sp_doclang'); } catch (e) { /* private mode */ }
  if (stored === 'en' || stored === 'pl') {
    root.setAttribute('data-doclang', stored);
    mark(stored);
  }
  function mark(lang) {
    document.querySelectorAll('[data-doclang]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-doclang') === lang ? 'true' : 'false');
    });
  }
  document.querySelectorAll('[data-doclang]').forEach(function (b) {
    b.addEventListener('click', function () {
      var l = b.getAttribute('data-doclang');
      root.setAttribute('data-doclang', l);
      try { localStorage.setItem('sp_doclang', l); } catch (e) { /* noop */ }
      mark(l);
    });
  });
})();
