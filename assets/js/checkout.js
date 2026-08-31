/* ============================================================
   CHECKOUT — turns the pricing buttons into real checkout links.

   The whole integration is one idea: a hosted checkout URL is just a link.
   The gateway (Paddle, Polar, or anything else that issues hosted checkout
   URLs) hosts the payment page, so this site needs no SDK, no inline script,
   no iframe, and no change to the Content-Security-Policy. A third-party
   checkout SDK would have cost all four: its bootstrap injects inline styles,
   which means style-src 'unsafe-inline', which this project does not allow.

   Because the destination is a real href in the markup, checkout also works
   with JavaScript switched off. The markup holds the pre-launch destination
   and this file only ever overrides it, so the no-JS path is the working
   path rather than a fallback.

   Nothing here is gateway-specific. Switching provider is editing config.js.
   ============================================================ */
(function () {
  'use strict';

  var cfg = (window.SP_CONFIG && window.SP_CONFIG.checkout) || {};
  var links = cfg.links || {};
  var billable = (cfg.currencies || []).map(function (c) {
    return String(c).toLowerCase();
  });

  /* Only ever accept an absolute https URL. A relative or http value here is
     a configuration mistake, and sending a buyer somewhere unexpected with
     their card out is the worst possible way to find out about it. */
  function usable(url) {
    if (typeof url !== 'string' || !url) return false;
    try {
      return new URL(url, window.location.href).protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  var wired = 0;
  var buttons = [].slice.call(document.querySelectorAll('a[data-checkout]'));
  buttons.forEach(function (a) {
    var url = links[a.getAttribute('data-checkout')];
    if (!usable(url)) return;              /* keep the markup's own href */
    a.setAttribute('href', url);
    a.setAttribute('rel', 'noopener');
    a.setAttribute('data-checkout-live', '1');
    wired += 1;
  });

  /* Say which currency the card will actually be charged in.

     The price toggle offers three currencies because a reader comparing
     prices wants to see their own. A gateway may not be able to bill in all
     three: Paddle, for one, has no RON. Showing a RON figure and then
     charging euros without a word is the kind of small dishonesty that gets
     a chargeback, so when the selected currency is not one the gateway can
     bill, the pricing section says so. */
  var note = document.getElementById('checkout-cur-note');

  function refreshNote(cur) {
    if (!note) return;
    var show = wired > 0 && billable.length > 0 &&
      billable.indexOf(String(cur || '').toLowerCase()) < 0;
    if (show) {
      var t = window.SP_T;
      note.textContent = t
        ? t('checkout_cur_note', { cur: billable[0].toUpperCase() })
        : '';
    }
    note.hidden = !show;
  }

  if (note) {
    (window.SP_CUR_HOOKS = window.SP_CUR_HOOKS || []).push(refreshNote);
    /* the language switcher rewrites copy, so the note has to follow it */
    (window.SP_I18N_HOOKS = window.SP_I18N_HOOKS || []).push(function () {
      refreshNote(window.SPCurrency ? window.SPCurrency() : '');
    });
    refreshNote(window.SPCurrency ? window.SPCurrency() : '');
  }

  /* readable from the console during a launch, and asserted by the tests */
  window.SPCheckout = { wired: wired, buttons: buttons.length, billable: billable };
})();
