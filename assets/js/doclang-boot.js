/* Runs render-blocking in <head>: sets the document language on <html>
   before first paint so an English reader never sees the Polish copy flash.
   The interactive toggle itself lives in doclang.js. */
(function () {
  'use strict';
  var lang = null;
  try { lang = localStorage.getItem('sp_doclang'); } catch (e) { /* private mode */ }
  if (lang !== 'en' && lang !== 'pl') {
    var site = null;
    try { site = localStorage.getItem('sp_lang'); } catch (e) { /* private mode */ }
    lang = site && site !== 'pl' ? 'en' : 'pl';
  }
  document.documentElement.setAttribute('data-doclang', lang);
  document.documentElement.setAttribute('lang', lang);
})();
