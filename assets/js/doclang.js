/* Document language toggle for the legal subpages (PL/EN).
   doclang-boot.js has already set the language on <html> before first
   paint; this only wires the buttons. */
(function () {
  'use strict';
  var root = document.documentElement;
  /* scope to the buttons: a bare [data-doclang] selector also matches <html>,
     which would end up carrying an aria-pressed attribute */
  var buttons = Array.prototype.slice.call(document.querySelectorAll('button[data-doclang]'));

  function meta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? el.getAttribute('content') : null;
  }
  function apply(lang) {
    root.setAttribute('data-doclang', lang);
    root.setAttribute('lang', lang);
    /* the tab title is part of the document: it switches too */
    var title = meta('sp-title-' + lang);
    if (title) document.title = title;
    buttons.forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-doclang') === lang ? 'true' : 'false');
    });
  }

  apply(root.getAttribute('data-doclang') === 'en' ? 'en' : 'pl');

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var l = b.getAttribute('data-doclang');
      apply(l);
      try { localStorage.setItem('sp_doclang', l); } catch (e) { /* private mode */ }
    });
  });
})();
